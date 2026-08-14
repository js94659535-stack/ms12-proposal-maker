import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as accountRoute } from '../functions/api/account.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';
import { PASSWORD_MIN, normalizeEmail, validateSignup } from '../server/signup.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'ms12-test-passphrase-1';

function fakeDb() {
  const tables = { users: [], sessions: [], login_attempts: [] };
  const run = (sql, args) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    const rows = results => ({ results });
    if (/^INSERT INTO sessions/.test(text)) { tables.sessions.push({ token_hash: args[0], user_id: args[1], created_at: args[2], expires_at: args[3], last_seen_at: args[4] }); return rows([]); }
    if (/^SELECT s\.token_hash/.test(text)) {
      const session = tables.sessions.find(item => item.token_hash === args[0]);
      const user = session && tables.users.find(item => item.id === session.user_id);
      return rows(session && user ? [{ ...session, user_id: user.id, email: user.email, role: user.role, org_id: user.org_id, name: user.name, status: user.status }] : []);
    }
    if (/^UPDATE sessions SET/.test(text)) { const s = tables.sessions.find(i => i.token_hash === args[2]); if (s) { s.last_seen_at = args[0]; s.expires_at = args[1]; } return rows([]); }
    if (/^DELETE FROM sessions WHERE token_hash/.test(text)) { tables.sessions = tables.sessions.filter(i => i.token_hash !== args[0]); return rows([]); }
    if (/^DELETE FROM sessions WHERE expires_at/.test(text)) { tables.sessions = tables.sessions.filter(i => i.expires_at >= args[0]); return rows([]); }
    if (/^SELECT id, email, role, org_id, name, status, plan, trial_used_at, password_algo/.test(text)) return rows(tables.users.filter(i => i.email === args[0]));
    if (/^SELECT phone, org_name/.test(text)) return rows(tables.users.filter(i => i.id === args[0]));
    if (/^UPDATE users SET name = \?, phone/.test(text)) {
      const user = tables.users.find(i => i.id === args[9]);
      if (user) Object.assign(user, { name: args[0], phone: args[1], org_name: args[2], is_contact: args[3], terms_version: args[4], privacy_version: args[5], consented_at: args[6], profile_completed_at: args[7] });
      return rows([]);
    }
    if (/^SELECT provider, email, linked_at FROM user_identities/.test(text)) return rows([]);
    if (/^DELETE FROM login_attempts WHERE at </.test(text)) { tables.login_attempts = tables.login_attempts.filter(i => i.at >= args[0]); return rows([]); }
    if (/^SELECT COUNT\(\*\) AS count FROM login_attempts WHERE email_hash/.test(text)) return rows([{ count: tables.login_attempts.filter(i => i.email_hash === args[0] && i.at >= args[1]).length }]);
    if (/^SELECT COUNT\(\*\) AS count FROM login_attempts WHERE client_hash/.test(text)) return rows([{ count: tables.login_attempts.filter(i => i.client_hash === args[0] && i.at >= args[1]).length }]);
    if (/^INSERT INTO login_attempts/.test(text)) { tables.login_attempts.push({ id: args[0], email_hash: args[1], client_hash: args[2], at: args[3] }); return rows([]); }
    if (/^DELETE FROM login_attempts WHERE email_hash/.test(text)) { tables.login_attempts = tables.login_attempts.filter(i => i.email_hash !== args[0] && i.client_hash !== args[1]); return rows([]); }
    if (/^INSERT INTO users \(id, email, role, org_id, name, status, password_algo/.test(text)) {
      if (tables.users.some(i => i.email === args[1])) throw new Error('UNIQUE constraint failed: users.email');
      tables.users.push({
        id: args[0], email: args[1], role: args[2], org_id: '', name: '', status: args[3],
        password_algo: args[4], password_iterations: args[5], password_salt: args[6], password_hash: args[7],
        phone: '', org_name: '', is_contact: 0, terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: '',
        created_at: args[8], updated_at: args[9]
      });
      return rows([]);
    }
    throw new Error(`대역이 모르는 쿼리: ${text.slice(0, 70)}`);
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

function post(path, body, { cookie = '', ip = '203.0.113.9' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': ip };
  if (cookie) headers.Cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}
const cookieOf = response => `${SESSION_COOKIE}=${/__Host-ms12_session=([a-f0-9]{64})/.exec(response.headers.get('set-cookie') || '')?.[1] || ''}`;

async function through(db, request, route = 'auth') {
  const data = {};
  const env = { ARCHIVE_DB: db };
  const blocked = await middleware({ request, env, data, next: async () => null });
  if (blocked) return blocked;
  return route === 'account' ? accountRoute({ request, env, data }) : authRoute({ request, env, data });
}
const join = (db, value, options) => through(db, post('/api/auth', { action: 'signup', ...value }, options));
const signIn = (db, email, password) => through(db, post('/api/auth', { action: 'login', email, password }));

test('어떤 이메일로도 가입할 수 있고 언제나 customer·pending으로만 만들어진다', async () => {
  const db = fakeDb();
  // 네이버·다음을 포함해 공급자를 가리지 않는다.
  for (const [index, email] of ['kim@naver.com', 'park@daum.net', 'lee@hanmail.net'].entries()) {
    const response = await join(db, { email, password: PASSWORD, passwordConfirm: PASSWORD }, { ip: `203.0.113.${index + 1}` });
    assert.equal(response.status, 200, email);
    const raw = await response.text();
    const body = JSON.parse(raw);
    assert.equal(body.created, true);
    assert.equal(body.user.role, 'customer');
    assert.equal(body.user.status, 'pending');
    assert.equal(body.user.email, email);
    // 가입 직후 바로 가입 정보 입력 화면으로 갈 수 있게 기존 세션 쿠키를 그대로 발급한다.
    assert.match(response.headers.get('set-cookie'), /^__Host-ms12_session=[a-f0-9]{64};.*Path=\/;.*Secure.*HttpOnly.*SameSite=Strict/);
    assert.doesNotMatch(response.headers.get('set-cookie'), /Domain=/);
    // 세션 토큰은 응답 본문에 담지 않는다.
    assert.doesNotMatch(raw, /__Host-ms12_session|[a-f0-9]{64}/);
  }
  assert.equal(db.tables.users.length, 3);
  assert.ok(db.tables.users.every(item => item.role === 'customer' && item.status === 'pending'));
});

test('가입한 비밀번호는 원문 없이 사용자마다 다른 salt로 저장된다', async () => {
  const db = fakeDb();
  await join(db, { email: 'kim@naver.com', password: PASSWORD, passwordConfirm: PASSWORD }, { ip: '203.0.113.1' });
  await join(db, { email: 'park@daum.net', password: PASSWORD, passwordConfirm: PASSWORD }, { ip: '203.0.113.2' });
  const [first, second] = db.tables.users;
  assert.equal(first.password_algo, 'PBKDF2-HMAC-SHA256-CHAIN');
  assert.equal(first.password_iterations, 600_000);
  assert.notEqual(first.password_salt, second.password_salt, '같은 비밀번호라도 salt가 달라야 한다');
  assert.notEqual(first.password_hash, second.password_hash);
  assert.equal(JSON.stringify(db.tables).includes(PASSWORD), false, '비밀번호 원문이 남으면 안 된다');
});

test('약한 비밀번호와 잘못된 이메일은 계정을 만들지 않는다', async () => {
  const db = fakeDb();
  const cases = [
    [{ email: 'kim', password: PASSWORD, passwordConfirm: PASSWORD }, /이메일 주소를 정확히/],
    [{ email: 'kim@naver.com', password: 'short', passwordConfirm: 'short' }, new RegExp(`${PASSWORD_MIN}자 이상`)],
    [{ email: 'kim@naver.com', password: 'aaaaaaaaaaaa', passwordConfirm: 'aaaaaaaaaaaa' }, /같은 문자만/],
    [{ email: 'kimdamdang@naver.com', password: 'kimdamdang2026', passwordConfirm: 'kimdamdang2026' }, /이메일 아이디를 그대로/],
    [{ email: 'kim@naver.com', password: PASSWORD, passwordConfirm: `${PASSWORD}x` }, /비밀번호 확인이 일치하지 않습니다/],
    [{ email: 'kakao_123@social.ms12.invalid', password: PASSWORD, passwordConfirm: PASSWORD }, /이메일 주소를 정확히/]
  ];
  for (const [payload, expected] of cases) {
    const response = await join(db, payload, { ip: '203.0.113.55' });
    assert.equal(response.status, 400, JSON.stringify(payload.email));
    assert.match((await response.json()).error, expected);
  }
  assert.equal(db.tables.users.length, 0);
  // 형식 검사에서 막힌 요청은 가입 횟수로 세지 않는다.
  assert.equal(db.tables.login_attempts.length, 0);
});

test('이미 쓰인 이메일로는 가입되지 않고 기존 계정 비밀번호가 바뀌지 않는다', async () => {
  const db = fakeDb();
  db.tables.users.push({
    id: 'admin-1', email: 'admin@ms12.test', role: 'admin', org_id: '', name: '운영 관리자', status: 'active',
    ...(await createPasswordRecord('admin-only-passphrase-77')), phone: '', org_name: '', is_contact: 0,
    terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: '',
    created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
  });
  const before = { ...db.tables.users[0] };

  const response = await join(db, { email: 'admin@ms12.test', password: PASSWORD, passwordConfirm: PASSWORD }, { ip: '203.0.113.7' });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /이미 가입에 사용된 이메일/);
  assert.equal(db.tables.users.length, 1);
  assert.deepEqual(db.tables.users[0], before, '기존 관리자 계정이 그대로다');
  // 가로챈 비밀번호로 들어갈 수 없다.
  assert.equal((await signIn(db, 'admin@ms12.test', PASSWORD)).status, 401);
  assert.equal((await signIn(db, 'admin@ms12.test', 'admin-only-passphrase-77')).status, 200);
});

test('같은 곳에서 계정을 계속 만들지 못한다', async () => {
  const db = fakeDb();
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await join(db, { email: `user${index}@naver.com`, password: PASSWORD, passwordConfirm: PASSWORD })).status, 200);
  }
  const blocked = await join(db, { email: 'user9@naver.com', password: PASSWORD, passwordConfirm: PASSWORD });
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /가입 시도가 많습니다/);
  assert.equal(db.tables.users.length, 3);
  // 다른 곳에서는 그대로 가입된다.
  assert.equal((await join(db, { email: 'other@daum.net', password: PASSWORD, passwordConfirm: PASSWORD }, { ip: '198.51.100.4' })).status, 200);
});

test('가입한 계정은 승인 전까지 작업 API를 쓰지 못하고 승인 뒤에 열린다', async () => {
  const db = fakeDb();
  const created = await join(db, { email: 'kim@naver.com', password: PASSWORD, passwordConfirm: PASSWORD });
  const cookie = cookieOf(created);

  const blocked = await middleware({ request: post('/api/proposal', { action: 'draft' }, { cookie }), env: { ARCHIVE_DB: db }, data: {}, next: async () => null });
  assert.equal(blocked.status, 403);
  assert.match((await blocked.json()).error, /가입 승인 대기/);

  // 가입 절차를 마치는 데 필요한 곳은 열려 있다.
  const profile = await through(db, post('/api/account', {
    action: 'completeProfile', name: '김담당', phone: '010-1234-5678', orgName: '한들센터', isContact: true, agreeTerms: true, agreePrivacy: true
  }, { cookie }), 'account');
  assert.equal(profile.status, 200);
  assert.equal(db.tables.users[0].status, 'pending', '정보를 냈다고 스스로 승인되지 않는다');

  // 승인 대기 상태로도 다시 로그인할 수 있다(화면은 가입 정보 입력만 열린다).
  const again = await signIn(db, 'kim@naver.com', PASSWORD);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).user.status, 'pending');

  // 관리자가 승인하면 그때 작업 API가 열린다.
  db.tables.users[0].status = 'active';
  let passed = false;
  const allowed = await middleware({ request: post('/api/proposal', { action: 'draft' }, { cookie: cookieOf(again) }), env: { ARCHIVE_DB: db }, data: {}, next: async () => { passed = true; return new Response('{}'); } });
  assert.equal(passed, true);
  assert.equal(allowed.status, 200);

  // 중지된 계정은 비밀번호가 맞아도 들어오지 못한다.
  db.tables.users[0].status = 'disabled';
  assert.equal((await signIn(db, 'kim@naver.com', PASSWORD)).status, 401);
});

test('입력 검사 규칙은 브라우저와 서버가 같은 것을 쓴다', () => {
  assert.equal(normalizeEmail('  KIM@Naver.COM '), 'kim@naver.com');
  assert.equal(validateSignup({ email: 'KIM@Naver.COM', password: PASSWORD, passwordConfirm: PASSWORD }).value.email, 'kim@naver.com');
  assert.equal(validateSignup({ email: 'kim@naver.com', password: PASSWORD, passwordConfirm: PASSWORD }).ok, true);
  assert.equal(validateSignup({ email: 'kim@naver.com', password: PASSWORD }).ok, false, '확인 입력이 없으면 받지 않는다');
});

test('로그인 화면이 로그인과 회원가입을 구분해 보여 준다', () => {
  assert.match(app, /id="mode-login"/);
  assert.match(app, /id="mode-signup"/);
  assert.match(app, /id="login-password-confirm"/);
  // 소셜 버튼 문구는 'Google로 시작하기'·'카카오로 시작하기'다.
  assert.match(app, /\[\['google', 'Google'\], \['kakao', '카카오'\]\]/);
  assert.match(app, /\$\{label\}\$\{mode === 'link' \? ' 계정 연결' : '로 시작하기'\}/);
  // 지금 무엇을 하는 중인지와 승인 절차를 화면에 적는다.
  assert.ok(app.includes('처음이시면 여기서 계정을 만드세요.'));
  assert.ok(app.includes('네이버·다음 등 어떤 이메일이든 됩니다.'));
  assert.ok(app.includes('가입한 뒤 관리자가 승인해야 작업 화면이 열립니다.'));
  assert.match(app, /auth\.mode === 'signup' \? submitSignup\(\) : submitLogin\(\)/);
  // 비밀번호는 브라우저 저장소에 남기지 않는다.
  const persisted = app.slice(app.indexOf('function saveState()'), app.indexOf('function saveState()') + 1500);
  assert.doesNotMatch(persisted, /passwordDraft|confirmDraft/);
});

test('요건을 못 갖춘 비밀번호는 요청을 보내지 않고 그 자리에서 알려 준다', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  // 화면과 서버가 같은 규칙(validateSignup)을 쓴다.
  assert.match(app, /import \{ PASSWORD_MIN, validateSignup \} from '\.\.\/server\/signup\.js';/);
  assert.match(app, /function signupBlock\(\) \{/);
  // 제출 전에 막는다. 400을 받으러 가지 않는다.
  assert.match(app, /if \(auth\.mode === 'signup'\) \{\s*\n\s*const reason = signupBlock\(\);\s*\n\s*if \(reason\) return setAuth\(\{ error: reason, notice: '' \}\);/);
  // 지금 몇 자인지, 몇 자 더 필요한지 적는다.
  assert.match(app, /자 더 필요합니다/);
  // 적는 동안 안내만 갈아 끼운다. 전체를 다시 그리면 커서가 튄다.
  assert.match(app, /hint\.outerHTML = signupHintView\(\);/);
});

test('비밀번호 최소 길이는 6자다', () => {
  assert.equal(PASSWORD_MIN, 6);
  assert.equal(validateSignup({ email: 'kim@naver.com', password: 'ab12cd', passwordConfirm: 'ab12cd' }).ok, true);
  assert.equal(validateSignup({ email: 'kim@naver.com', password: 'ab12', passwordConfirm: 'ab12' }).ok, false);
});
