import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { MAX_ITERATIONS_PER_CALL, PASSWORD_ALGO, PASSWORD_ITERATIONS, createPasswordRecord, sha256Hex } from '../server/password.js';
import { SESSION_COOKIE, sameOriginRequest } from '../server/session.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0004_accounts.sql', import.meta.url), 'utf8');
// 실제 비밀번호가 아니라 이 테스트 안에서만 쓰는 값이다.
const PASSWORD = 'test-only-passphrase-9241';
const ORIGIN = 'https://pro.ms12.org';
// 미들웨어가 막아야 하는 기존 경로들. 이 중 하나라도 새면 OpenAI 비용이 열린다.
const PROTECTED = ['/api/proposal', '/api/proposal-review', '/api/proposal-coaching', '/api/archive', '/api/notices'];

// 이번 쿼리들만 이해하는 최소 D1 대역. 실제 함수 코드를 그대로 실행하기 위한 것이다.
function fakeDb() {
  const tables = { users: [], sessions: [], login_attempts: [] };
  const run = (sql, args) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (/^INSERT INTO sessions/.test(text)) {
      tables.sessions.push({ token_hash: args[0], user_id: args[1], created_at: args[2], expires_at: args[3], last_seen_at: args[4] });
      return { results: [] };
    }
    if (/^SELECT s\.token_hash/.test(text)) {
      const session = tables.sessions.find(item => item.token_hash === args[0]);
      const user = session && tables.users.find(item => item.id === session.user_id);
      return { results: session && user ? [{ ...session, user_id: user.id, email: user.email, role: user.role, org_id: user.org_id, name: user.name, status: user.status }] : [] };
    }
    if (/^UPDATE sessions SET/.test(text)) {
      const session = tables.sessions.find(item => item.token_hash === args[2]);
      if (session) { session.last_seen_at = args[0]; session.expires_at = args[1]; }
      return { results: [] };
    }
    if (/^DELETE FROM sessions WHERE token_hash/.test(text)) {
      tables.sessions = tables.sessions.filter(item => item.token_hash !== args[0]);
      return { results: [] };
    }
    if (/^DELETE FROM sessions WHERE expires_at/.test(text)) {
      tables.sessions = tables.sessions.filter(item => item.expires_at >= args[0]);
      return { results: [] };
    }
    if (/^SELECT id, email, role/.test(text)) {
      return { results: tables.users.filter(item => item.email === args[0]) };
    }
    if (/^DELETE FROM login_attempts WHERE at </.test(text)) {
      tables.login_attempts = tables.login_attempts.filter(item => item.at >= args[0]);
      return { results: [] };
    }
    if (/^SELECT COUNT\(\*\) AS count FROM login_attempts WHERE email_hash/.test(text)) {
      return { results: [{ count: tables.login_attempts.filter(item => item.email_hash === args[0] && item.at >= args[1]).length }] };
    }
    if (/^SELECT COUNT\(\*\) AS count FROM login_attempts WHERE client_hash/.test(text)) {
      return { results: [{ count: tables.login_attempts.filter(item => item.client_hash === args[0] && item.at >= args[1]).length }] };
    }
    if (/^INSERT INTO login_attempts/.test(text)) {
      tables.login_attempts.push({ id: args[0], email_hash: args[1], client_hash: args[2], at: args[3] });
      return { results: [] };
    }
    if (/^DELETE FROM login_attempts WHERE email_hash/.test(text)) {
      tables.login_attempts = tables.login_attempts.filter(item => item.email_hash !== args[0] && item.client_hash !== args[1]);
      return { results: [] };
    }
    throw new Error(`대역이 모르는 쿼리: ${text.slice(0, 60)}`);
  };
  return {
    tables,
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return run(sql, args).results[0] || null; },
        async all() { return run(sql, args); },
        async run() { return run(sql, args); }
      };
      return statement;
    }
  };
}

async function withAdmin() {
  const db = fakeDb();
  db.tables.users.push({
    id: 'admin-1', email: 'admin@ms12.test', role: 'admin', org_id: '', name: '운영 관리자', status: 'active',
    ...(await createPasswordRecord(PASSWORD)), created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
  });
  return db;
}
function post(path, body, { cookie = '', site = 'same-origin' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' };
  if (cookie) headers.Cookie = cookie;
  if (site) headers['Sec-Fetch-Site'] = site;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}
// 미들웨어가 통과시키면 next()가 불린다. 불리지 않으면 뒤쪽 코드(=OpenAI 호출)는 실행되지 않는다.
async function runMiddleware(db, request) {
  let passed = false;
  const data = {};
  const response = await middleware({ request, env: { ARCHIVE_DB: db }, data, next: async () => { passed = true; return new Response('{}', { status: 200 }); } });
  return { response, passed, data };
}
const callAuth = (db, request, data = {}) => authRoute({ request, env: { ARCHIVE_DB: db }, data });
async function signIn(db) {
  const response = await callAuth(db, post('/api/auth', { action: 'login', email: 'admin@ms12.test', password: PASSWORD }));
  const setCookie = response.headers.get('set-cookie') || '';
  return { response, setCookie, cookie: `${SESSION_COOKIE}=${/__Host-ms12_session=([a-f0-9]+)/.exec(setCookie)?.[1] || ''}` };
}

test('비로그인 상태에서는 모든 기존 API가 401이고 뒤쪽 코드가 실행되지 않는다', async () => {
  const db = await withAdmin();
  for (const path of PROTECTED) {
    const { response, passed } = await runMiddleware(db, post(path, { action: 'anything' }));
    assert.equal(response.status, 401, path);
    assert.equal(passed, false, `${path}가 통과했다 — OpenAI 호출 경로가 열린다`);
    assert.match((await response.json()).error, /로그인이 필요합니다/);
  }
  // 조기 반환하던 보관함 작업도 인증 앞을 지나가지 못한다.
  for (const action of ['syncNotices', 'searchNotices']) {
    const { response, passed } = await runMiddleware(db, post('/api/archive', { action }));
    assert.equal(response.status, 401, action);
    assert.equal(passed, false, action);
  }
  // 로그인 경로만 열려 있다.
  const open = await runMiddleware(db, post('/api/auth', { action: 'login' }));
  assert.equal(open.passed, true);
});

test('잘못된 로그인은 401이고 쿠키를 주지 않으며 계정 존재 여부를 드러내지 않는다', async () => {
  const db = await withAdmin();
  const wrongPassword = await callAuth(db, post('/api/auth', { action: 'login', email: 'admin@ms12.test', password: 'wrong-passphrase-000' }));
  const noSuchUser = await callAuth(db, post('/api/auth', { action: 'login', email: 'nobody@ms12.test', password: PASSWORD }));
  assert.equal(wrongPassword.status, 401);
  assert.equal(noSuchUser.status, 401);
  assert.equal(wrongPassword.headers.get('set-cookie'), null);
  assert.equal(noSuchUser.headers.get('set-cookie'), null);
  // 두 실패의 문구가 같아야 이메일이 있는지 없는지 알 수 없다.
  assert.deepEqual(await wrongPassword.json(), await noSuchUser.json());
  assert.equal(db.tables.sessions.length, 0);
});

test('정상 로그인은 쿠키로만 세션을 주고 D1에는 해시만 남는다', async () => {
  const db = await withAdmin();
  const { response, setCookie, cookie } = await signIn(db);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.role, 'admin');
  // 응답 본문에 토큰이 없다.
  assert.doesNotMatch(JSON.stringify(body), /[a-f0-9]{64}/);
  // 쿠키 속성
  assert.match(setCookie, /^__Host-ms12_session=[a-f0-9]{64};/);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.doesNotMatch(setCookie, /Domain=/i);
  // D1에는 원문이 아니라 SHA-256 해시만 있다.
  const token = /__Host-ms12_session=([a-f0-9]{64})/.exec(setCookie)[1];
  assert.equal(db.tables.sessions.length, 1);
  assert.notEqual(db.tables.sessions[0].token_hash, token);
  assert.equal(db.tables.sessions[0].token_hash, await sha256Hex(token));

  // 쿠키를 들고 오면 미들웨어를 지나고 me가 열린다.
  const passing = await runMiddleware(db, post('/api/proposal', { action: 'draft' }, { cookie }));
  assert.equal(passing.passed, true);
  assert.equal(passing.data.user.email, 'admin@ms12.test');
  const meRequest = post('/api/auth', { action: 'me' }, { cookie });
  const meData = (await runMiddleware(db, meRequest)).data;
  const meResponse = await callAuth(db, post('/api/auth', { action: 'me' }, { cookie }), meData);
  assert.equal(meResponse.status, 200);
  assert.equal((await meResponse.json()).user.email, 'admin@ms12.test');
});

test('로그아웃한 세션과 만료된 세션은 다시 쓰지 못한다', async () => {
  const db = await withAdmin();
  const { cookie } = await signIn(db);
  const { data } = await runMiddleware(db, post('/api/auth', { action: 'logout' }, { cookie }));
  const out = await callAuth(db, post('/api/auth', { action: 'logout' }, { cookie }), data);
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /^__Host-ms12_session=; Max-Age=0/);
  assert.equal(db.tables.sessions.length, 0);
  // 같은 쿠키를 다시 써도 통과하지 않는다.
  const reused = await runMiddleware(db, post('/api/proposal', { action: 'draft' }, { cookie }));
  assert.equal(reused.response.status, 401);
  assert.equal(reused.passed, false);

  // 만료된 세션
  const again = await signIn(db);
  db.tables.sessions[0].expires_at = '2020-01-01T00:00:00.000Z';
  const expired = await runMiddleware(db, post('/api/proposal', { action: 'draft' }, { cookie: again.cookie }));
  assert.equal(expired.response.status, 401);
  assert.equal(expired.passed, false);
});

test('교차 출처의 상태 변경 요청은 세션이 있어도 403이다', async () => {
  const db = await withAdmin();
  const { cookie } = await signIn(db);
  for (const site of ['cross-site', 'same-site']) {
    const { response, passed } = await runMiddleware(db, post('/api/proposal', { action: 'draft' }, { cookie, site }));
    assert.equal(response.status, 403, site);
    assert.equal(passed, false, site);
  }
  // Sec-Fetch-Site가 없으면 Origin으로 본다.
  const foreign = new Request(`${ORIGIN}/api/proposal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: cookie }, body: '{}'
  });
  assert.equal((await runMiddleware(db, foreign)).response.status, 403);
  // 근거가 하나도 없으면 통과시키지 않는다.
  const bare = new Request(`${ORIGIN}/api/proposal`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{}' });
  assert.equal((await runMiddleware(db, bare)).response.status, 403);
  const url = new URL(`${ORIGIN}/api/proposal`);
  assert.equal(sameOriginRequest(new Request(url, { method: 'GET' }), url), true, '읽기 요청까지 막지는 않는다');
});

test('반복 로그인 실패를 제한한다', async () => {
  const db = await withAdmin();
  const attempt = () => callAuth(db, post('/api/auth', { action: 'login', email: 'admin@ms12.test', password: 'wrong-passphrase-000' }));
  for (let index = 0; index < 5; index += 1) assert.equal((await attempt()).status, 401);
  const limited = await attempt();
  assert.equal(limited.status, 429);
  assert.match((await limited.json()).error, /잠시 후 다시 시도/);
  // 제한 중에는 올바른 비밀번호도 세션을 만들지 않는다.
  const correct = await callAuth(db, post('/api/auth', { action: 'login', email: 'admin@ms12.test', password: PASSWORD }));
  assert.equal(correct.status, 429);
  assert.equal(db.tables.sessions.length, 0);
});

test('비밀번호 해시 방식과 반복 횟수를 사용자 행에 기록한다', async () => {
  const record = await createPasswordRecord(PASSWORD);
  // Workers가 한 번에 100,000회까지만 받아 이어 돌린다. 총 반복 횟수는 600,000회 그대로다.
  assert.equal(record.password_algo, 'PBKDF2-HMAC-SHA256-CHAIN');
  assert.equal(record.password_iterations, 600_000);
  assert.equal(PASSWORD_ALGO, 'PBKDF2-HMAC-SHA256-CHAIN');
  assert.equal(PASSWORD_ITERATIONS, 600_000);
  assert.ok(MAX_ITERATIONS_PER_CALL <= 100_000, 'Workers 한도를 넘는 호출을 만들면 안 된다');
  assert.match(record.password_salt, /^[a-f0-9]{32}$/);
  assert.match(record.password_hash, /^[a-f0-9]{64}$/);
  // 같은 비밀번호라도 salt가 달라 해시가 달라진다.
  const other = await createPasswordRecord(PASSWORD);
  assert.notEqual(record.password_salt, other.password_salt);
  assert.notEqual(record.password_hash, other.password_hash);
  // 스키마가 방식·반복 횟수·해시를 모두 담는다.
  for (const column of ['password_algo', 'password_iterations', 'password_salt', 'password_hash']) assert.match(migration, new RegExp(column));
  assert.match(migration, /token_hash TEXT PRIMARY KEY/);
  assert.doesNotMatch(migration, /token TEXT|password TEXT NOT NULL,/);
});

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('기본 비밀번호를 코드·migration에 넣지 않는다', () => {
  const cli = read('scripts/admin-cli.mjs');
  const create = read('scripts/create-admin.mjs');
  const authSource = read('functions/api/auth.js');
  // migration에는 계정 행이 없다.
  assert.doesNotMatch(migration, /INSERT INTO users/i);
  for (const source of [cli, create, authSource]) {
    assert.doesNotMatch(source, /(?:password|비밀번호)\s*[:=]\s*['"][^'"]{4,}['"]/i);
  }
  // 비밀번호는 두 번 숨김 입력으로만 받고, 해시가 담긴 임시 파일은 반드시 지운다.
  assert.match(cli, /export function askSecret\(question\)/);
  assert.match(cli, /const again = await askSecret\(`\$\{label\} 확인: `\);/);
  assert.match(cli, /if \(password !== again\) fail\('두 번 입력한 비밀번호가 다릅니다\.'\);/);
  assert.match(cli, /fs\.rmSync\(directory, \{ recursive: true, force: true \}\)/);
  assert.match(create, /createPasswordRecord\(password\)/);
  assert.match(create, /배포를 진행하지 마세요/);
});

test('관리자 스크립트는 셸을 거치지 않고 SQL을 통째로 넘긴다', async () => {
  const cli = read('scripts/admin-cli.mjs');
  // Windows 셸이 SQL을 공백마다 인자로 쪼개던 원인을 없앤다.
  assert.match(cli, /shell: false/);
  assert.doesNotMatch(cli, /shell: true/);
  assert.doesNotMatch(cli, /spawnSync\('npx'/, 'npx를 셸로 부르지 않는다');
  assert.match(cli, /spawnSync\(process\.execPath, \[WRANGLER, 'd1', 'execute', DATABASE, \.\.\.args\]/);
  // 값이 바뀌는 SQL은 임시 .sql 파일로만 넘기고 반드시 지운다.
  assert.match(cli, /`--file=\$\{file\}`/);
  assert.match(cli, /fs\.rmSync\(directory, \{ recursive: true, force: true \}\)/);
  assert.doesNotMatch(cli, /--command=\$\{sql\}[\s\S]{0,40}password/);
  // 조회에는 비밀값 열을 실을 수 없다.
  const { queryRows } = await import('../scripts/admin-cli.mjs');
  assert.equal(typeof queryRows, 'function');
  assert.match(cli, /const SECRET_COLUMN = .*password_hash/);
  assert.match(cli, /if \(SECRET_COLUMN\.test\(sql\)\) fail\('조회 SQL에 비밀값 열을 넣을 수 없습니다\.'\);/);

  // wrangler 응답에서 결과 배열만 안전하게 읽는다.
  const { parseRows } = await import('../scripts/admin-cli.mjs');
  const output = `├ Checking if file needs uploading\n│\n[\n  { "results": [ { "role": "admin", "status": "active" } ], "success": true }\n]\n`;
  assert.deepEqual(parseRows(output), [{ role: 'admin', status: 'active' }]);
  assert.deepEqual(parseRows('[{"results":[],"success":true}]'), []);
});

test('비밀번호 재설정은 기존 계정만 갱신하고 자료를 지우지 않는다', () => {
  const reset = read('scripts/reset-admin-password.mjs');
  // 같은 해싱 구조를 그대로 쓴다(600,000회는 server/password.js 한 곳에서만 정한다).
  assert.match(reset, /import \{ createPasswordRecord \} from '\.\.\/server\/password\.js';/);
  assert.match(reset, /readNewPassword\('새 비밀번호'\)/);
  // 반복 횟수를 직접 적지 않고 createPasswordRecord가 준 값을 그대로 넣는다.
  assert.doesNotMatch(reset, /iterations\s*[:=]\s*\d|\b\d{5,}\b/, '반복 횟수를 스크립트에 따로 적지 않는다');
  assert.match(reset, /password_iterations = \$\{record\.password_iterations\}/);
  // 계정을 새로 만들지 않는다.
  assert.doesNotMatch(reset, /INSERT INTO users/i);
  assert.match(reset, /이 스크립트는 계정을 새로 만들지 않습니다/);
  // 조회할 때 비밀값 열을 읽지 않는다.
  assert.match(reset, /SELECT id, email, role, status FROM users WHERE email/);
  assert.doesNotMatch(reset, /SELECT[^;]*password_/i);
  // 갱신 대상은 해시 관련 열뿐이고, 기존 세션·실패 기록만 지운다.
  assert.match(reset, /UPDATE users SET password_algo = [\s\S]+WHERE id = /);
  assert.match(reset, /DELETE FROM sessions WHERE user_id = /);
  assert.match(reset, /DELETE FROM login_attempts;/);
  assert.doesNotMatch(reset, /DELETE FROM users|DROP |archived_proposals|applicant_organizations|archived_notices/i);
  // 비밀번호·해시를 출력하지 않는다.
  for (const source of [reset, read('scripts/admin-cli.mjs'), read('scripts/create-admin.mjs')]) {
    assert.doesNotMatch(source, /console\.(log|error)\([^)]*\b(password|record\.password_hash|password_salt)\b/i);
  }
  assert.match(reset, /새 비밀번호와 해시는 출력하지 않습니다/);
});

test('앱은 로그인하기 전 작업 화면을 그리지 않고 토큰을 저장하지 않는다', () => {
  // 로그인 전에는 어떤 경우에도 작업 화면을 그리지 않는다. 소개 화면과 로그인 화면 둘 중 하나만 나온다.
  assert.match(app, /if \(auth\.status !== 'signedIn' && showAuthForm\(\)\) \{ app\.innerHTML = loginView\(\); bindLogin\(\); return; \}/);
  assert.match(app, /if \(auth\.status !== 'signedIn'\) \{ app\.innerHTML = landingView\(\); bindLanding\(\); return; \}/);
  assert.match(app, /void checkSession\(\);/);
  assert.match(app, /document\.querySelector\('#sign-out'\)\?\.addEventListener\('click', \(\) => void submitLogout\(\)\);/);
  // 세션이 끊기면 로그인 화면으로 되돌린다.
  assert.match(app, /if \(String\(error\?\.message \|\| ''\)\.includes\(UNAUTHORIZED\)\) return signOutLocally/);
  // 토큰·비밀번호를 브라우저 저장소에 넣지 않는다.
  const client = fs.readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /localStorage|sessionStorage|document\.cookie/);
  const authBlock = app.slice(app.indexOf("let auth = { status: 'checking'"), app.indexOf('function loadState()'));
  assert.doesNotMatch(authBlock, /localStorage|sessionStorage/);
  assert.match(client, /credentials: 'same-origin'/);
});
