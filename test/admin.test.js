import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as adminRoute } from '../functions/api/admin.js';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { handleOAuthRequest } from '../functions/api/oauth.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const adminSource = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'test-only-passphrase-9241';
const KAKAO_PROFILE = { id: 4455667788 };

function fakeDb() {
  const tables = { users: [], sessions: [], login_attempts: [], user_identities: [], oauth_states: [] };
  const run = (sql, args) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    const rows = results => ({ results });
    // ---- 세션·로그인(기존 경로와 같은 대역) ----
    if (/^INSERT INTO sessions/.test(text)) { tables.sessions.push({ token_hash: args[0], user_id: args[1], created_at: args[2], expires_at: args[3], last_seen_at: args[4] }); return rows([]); }
    if (/^SELECT s\.token_hash/.test(text)) {
      const session = tables.sessions.find(item => item.token_hash === args[0]);
      const user = session && tables.users.find(item => item.id === session.user_id);
      return rows(session && user ? [{ ...session, user_id: user.id, email: user.email, role: user.role, org_id: user.org_id, name: user.name, status: user.status }] : []);
    }
    if (/^UPDATE sessions SET/.test(text)) { const s = tables.sessions.find(i => i.token_hash === args[2]); if (s) { s.last_seen_at = args[0]; s.expires_at = args[1]; } return rows([]); }
    if (/^DELETE FROM sessions WHERE token_hash/.test(text)) { tables.sessions = tables.sessions.filter(i => i.token_hash !== args[0]); return rows([]); }
    if (/^DELETE FROM sessions WHERE expires_at/.test(text)) { tables.sessions = tables.sessions.filter(i => i.expires_at >= args[0]); return rows([]); }
    if (/^DELETE FROM sessions WHERE user_id/.test(text)) { tables.sessions = tables.sessions.filter(i => i.user_id !== args[0]); return rows([]); }
    if (/^SELECT id, email, role, org_id, name, status, password_algo/.test(text)) return rows(tables.users.filter(i => i.email === args[0]));
    if (/^SELECT id, email, role, org_id, name, status, profile_completed_at FROM users WHERE id/.test(text)) return rows(tables.users.filter(i => i.id === args[0]));
    if (/^DELETE FROM login_attempts WHERE at </.test(text)) { tables.login_attempts = tables.login_attempts.filter(i => i.at >= args[0]); return rows([]); }
    if (/^SELECT COUNT\(\*\) AS count FROM login_attempts WHERE email_hash/.test(text)) return rows([{ count: 0 }]);
    if (/^SELECT COUNT\(\*\) AS count FROM login_attempts WHERE client_hash/.test(text)) return rows([{ count: 0 }]);
    if (/^INSERT INTO login_attempts/.test(text)) { tables.login_attempts.push({ id: args[0] }); return rows([]); }
    if (/^DELETE FROM login_attempts WHERE email_hash/.test(text)) { tables.login_attempts = []; return rows([]); }
    // ---- 소셜(계정 삭제 뒤 다시 연결되는지 보려고 쓴다) ----
    if (/^DELETE FROM oauth_states WHERE expires_at/.test(text)) { tables.oauth_states = tables.oauth_states.filter(i => i.expires_at >= args[0]); return rows([]); }
    if (/^INSERT INTO oauth_states/.test(text)) {
      tables.oauth_states.push({ state_hash: args[0], provider: args[1], code_verifier: args[2], mode: args[3], link_user_id: args[4], redirect_uri: args[5], created_at: args[6], expires_at: args[7] });
      return rows([]);
    }
    if (/^SELECT \* FROM oauth_states/.test(text)) return rows(tables.oauth_states.filter(i => i.state_hash === args[0]));
    if (/^DELETE FROM oauth_states WHERE state_hash/.test(text)) { tables.oauth_states = tables.oauth_states.filter(i => i.state_hash !== args[0]); return rows([]); }
    if (/^SELECT id, user_id FROM user_identities/.test(text)) return rows(tables.user_identities.filter(i => i.provider === args[0] && i.provider_subject === args[1]));
    if (/^INSERT INTO user_identities/.test(text)) {
      if (tables.user_identities.some(i => i.provider === args[2] && i.provider_subject === args[3])) throw new Error('UNIQUE constraint failed: user_identities.provider, user_identities.provider_subject');
      tables.user_identities.push({ id: args[0], user_id: args[1], provider: args[2], provider_subject: args[3], email: args[4], linked_at: args[5] });
      return rows([]);
    }
    if (/^INSERT INTO users \(id, email, role, org_id, name, status, created_at, updated_at\)/.test(text)) {
      if (tables.users.some(i => i.email === args[1])) throw new Error('UNIQUE constraint failed: users.email');
      tables.users.push({
        id: args[0], email: args[1], role: args[2], org_id: '', name: args[3], status: args[4], created_at: args[5], updated_at: args[6],
        phone: '', org_name: '', is_contact: 0, terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: ''
      });
      return rows([]);
    }
    // ---- 관리자 화면 ----
    if (/^SELECT id, email, role, status, name, phone, org_name/.test(text)) return rows([...tables.users].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
    if (/^SELECT user_id, provider, email FROM user_identities/.test(text)) return rows(tables.user_identities);
    if (/^SELECT id, role, status FROM users WHERE id/.test(text)) return rows(tables.users.filter(i => i.id === args[0]));
    if (/^UPDATE users SET status = \?, updated_at = \? WHERE id/.test(text)) {
      const user = tables.users.find(i => i.id === args[2]);
      if (user) { user.status = args[0]; user.updated_at = args[1]; }
      return rows([]);
    }
    if (/^DELETE FROM user_identities WHERE user_id/.test(text)) { tables.user_identities = tables.user_identities.filter(i => i.user_id !== args[0]); return rows([]); }
    if (/^DELETE FROM users WHERE id/.test(text)) { tables.users = tables.users.filter(i => i.id !== args[0]); return rows([]); }
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

const ENV = { GOOGLE_CLIENT_ID: 'fixture-google-client', KAKAO_REST_API_KEY: 'fixture-kakao-key' };
function post(path, body, { cookie = '' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9' };
  if (cookie) headers.Cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}
const cookieOf = response => `${SESSION_COOKIE}=${/__Host-ms12_session=([a-f0-9]{64})/.exec(response.headers.get('set-cookie') || '')?.[1] || ''}`;

// 실제 요청과 같이 미들웨어를 먼저 지난다.
async function through(db, request, route, deps) {
  const data = {};
  const env = { ARCHIVE_DB: db, ...ENV };
  const blocked = await middleware({ request, env, data, next: async () => null });
  if (blocked) return blocked;
  if (route === 'oauth') return handleOAuthRequest({ request, env, data }, deps);
  return route === 'admin' ? adminRoute({ request, env, data }) : authRoute({ request, env, data });
}

async function seedUser(db, { id, email, role, status, name = '', at = '2026-08-10T00:00:00.000Z' }) {
  db.tables.users.push({
    id, email, role, status, org_id: '', name, ...(await createPasswordRecord(PASSWORD)),
    phone: '010-1234-5678', org_name: '한들센터', is_contact: 1,
    terms_version: '2026-08-10', privacy_version: '2026-08-10', consented_at: at, profile_completed_at: at,
    created_at: at, updated_at: at
  });
}
async function signIn(db, email) {
  const response = await through(db, post('/api/auth', { action: 'login', email, password: PASSWORD }), 'auth');
  return { response, cookie: cookieOf(response) };
}
async function withAdmin() {
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@ms12.test', role: 'admin', status: 'active', name: '운영 관리자' });
  const { cookie } = await signIn(db, 'admin@ms12.test');
  return { db, cookie };
}
const call = (db, action, cookie, payload = {}) => through(db, post('/api/admin', { action, ...payload }, { cookie }), 'admin');

test('관리자가 아니면 계정 관리 API가 열리지 않는다', async () => {
  const { db } = await withAdmin();
  // 로그인하지 않은 요청
  const anonymous = await through(db, post('/api/admin', { action: 'listUsers' }), 'admin');
  assert.equal(anonymous.status, 401);

  // 승인된 고객 계정 — 로그인은 되지만 관리자 화면은 못 쓴다.
  await seedUser(db, { id: 'cust-1', email: 'user@ms12.test', role: 'customer', status: 'active', name: '고객' });
  const { cookie } = await signIn(db, 'user@ms12.test');
  const customer = await call(db, 'listUsers', cookie);
  assert.equal(customer.status, 403);
  assert.match((await customer.json()).error, /관리자만/);

  // 승인 대기 계정(소셜 가입으로만 생긴다)은 미들웨어에서 먼저 막힌다.
  const started = await through(db, post('/api/oauth', { action: 'start', provider: 'kakao', mode: 'signup' }), 'oauth');
  const state = new URL((await started.json()).authorizeUrl).searchParams.get('state');
  const signup = await through(db, post('/api/oauth', { action: 'callback', code: 'fixture', state }), 'oauth', { exchangeCode: async () => KAKAO_PROFILE });
  const waitingId = (await signup.clone().json()).user.id;
  const blocked = await call(db, 'listUsers', cookieOf(signup));
  assert.equal(blocked.status, 403);
  assert.match((await blocked.json()).error, /가입 승인 대기/);

  // 고객이 직접 승인 요청을 보내도 상태가 바뀌지 않는다.
  await call(db, 'approveUser', cookie, { id: waitingId });
  assert.equal(db.tables.users.find(item => item.id === waitingId).status, 'pending');
});

test('관리자는 대기 계정을 승인하고 역할은 올리지 않는다', async () => {
  const { db, cookie } = await withAdmin();
  await seedUser(db, { id: 'wait-1', email: 'wait@ms12.test', role: 'customer', status: 'pending', name: '김담당', at: '2026-08-11T00:00:00.000Z' });

  const listed = await call(db, 'listUsers', cookie);
  assert.equal(listed.status, 200);
  const users = (await listed.json()).users;
  assert.deepEqual(users.map(item => [item.role, item.status]), [['admin', 'active'], ['customer', 'pending']]);
  assert.equal(users[1].orgName, '한들센터');

  const approved = await call(db, 'approveUser', cookie, { id: 'wait-1' });
  assert.equal(approved.status, 200);
  const after = db.tables.users.find(item => item.id === 'wait-1');
  assert.equal(after.status, 'active');
  assert.equal(after.role, 'customer', '승인은 역할을 바꾸지 않는다');
  // 응답으로 최신 목록이 함께 온다.
  assert.equal((await approved.json()).users.find(item => item.id === 'wait-1').status, 'active');

  // 이미 이용 중인 계정은 다시 승인하지 않는다.
  assert.equal((await call(db, 'approveUser', cookie, { id: 'wait-1' })).status, 400);
  // 없는 계정
  assert.equal((await call(db, 'approveUser', cookie, { id: 'no-such' })).status, 404);
});

test('내 계정과 다른 관리자 계정은 이 화면에서 바꾸지 못한다', async () => {
  const { db, cookie } = await withAdmin();
  await seedUser(db, { id: 'admin-2', email: 'admin2@ms12.test', role: 'admin', status: 'active' });

  for (const action of ['disableUser', 'deleteUser']) {
    const self = await call(db, action, cookie, { id: 'admin-1' });
    assert.equal(self.status, 400, action);
    assert.match((await self.json()).error, /자기 계정/);
    const other = await call(db, action, cookie, { id: 'admin-2' });
    assert.equal(other.status, 400, action);
    assert.match((await other.json()).error, /관리자 계정/);
  }
  assert.equal(db.tables.users.length, 2, '관리자 계정이 사라지지 않는다');
  assert.ok(db.tables.users.every(item => item.status === 'active'));
});

test('사용 중지하면 쓰던 세션까지 끊긴다', async () => {
  const { db, cookie } = await withAdmin();
  await seedUser(db, { id: 'cust-1', email: 'user@ms12.test', role: 'customer', status: 'active' });
  const customer = await signIn(db, 'user@ms12.test');
  assert.equal(db.tables.sessions.filter(item => item.user_id === 'cust-1').length, 1);

  assert.equal((await call(db, 'disableUser', cookie, { id: 'cust-1' })).status, 200);
  assert.equal(db.tables.users.find(item => item.id === 'cust-1').status, 'disabled');
  assert.equal(db.tables.sessions.filter(item => item.user_id === 'cust-1').length, 0);

  // 남아 있던 쿠키로는 아무것도 못 한다.
  const reused = await middleware({ request: post('/api/proposal', { action: 'draft' }, { cookie: customer.cookie }), env: { ARCHIVE_DB: db, ...ENV }, data: {}, next: async () => null });
  assert.equal(reused.status, 401);
  // 중지된 계정은 비밀번호가 맞아도 로그인되지 않는다.
  assert.equal((await signIn(db, 'user@ms12.test')).response.status, 401);
  // 중지한 계정을 다시 열 수 있다.
  assert.equal((await call(db, 'approveUser', cookie, { id: 'cust-1' })).status, 200);
  assert.equal(db.tables.users.find(item => item.id === 'cust-1').status, 'active');
});

test('계정을 지우면 소셜 연결도 함께 지워져 다른 계정에 다시 연결할 수 있다', async () => {
  const { db, cookie } = await withAdmin();
  // 관리자가 로그인 화면에서 「카카오로 시작하기」를 눌러 대기 계정이 생긴 상황.
  const started = await through(db, post('/api/oauth', { action: 'start', provider: 'kakao', mode: 'signup' }), 'oauth');
  const state = new URL((await started.json()).authorizeUrl).searchParams.get('state');
  const signup = await through(db, post('/api/oauth', { action: 'callback', code: 'fixture', state }), 'oauth', { exchangeCode: async () => KAKAO_PROFILE });
  const strayId = (await signup.json()).user.id;
  assert.equal(db.tables.user_identities.length, 1);

  // 그 카카오 계정은 이미 대기 계정에 물려 있어 관리자 계정에 연결되지 않는다.
  const begin = await through(db, post('/api/oauth', { action: 'start', provider: 'kakao', mode: 'link' }, { cookie }), 'oauth');
  const linkState = new URL((await begin.json()).authorizeUrl).searchParams.get('state');
  const refused = await through(db, post('/api/oauth', { action: 'callback', code: 'fixture', state: linkState }, { cookie }), 'oauth', { exchangeCode: async () => KAKAO_PROFILE });
  assert.equal(refused.status, 409);

  // 관리자 화면에서 대기 계정을 지운다. 삭제 뒤에는 같은 소셜 계정을 관리자 계정에 붙일 수 있다.
  assert.equal((await call(db, 'deleteUser', cookie, { id: strayId })).status, 200);
  assert.equal(db.tables.users.some(item => item.id === strayId), false);
  assert.equal(db.tables.user_identities.length, 0);

  const retry = await through(db, post('/api/oauth', { action: 'start', provider: 'kakao', mode: 'link' }, { cookie }), 'oauth');
  const retryState = new URL((await retry.json()).authorizeUrl).searchParams.get('state');
  const linked = await through(db, post('/api/oauth', { action: 'callback', code: 'fixture', state: retryState }, { cookie }), 'oauth', { exchangeCode: async () => KAKAO_PROFILE });
  assert.equal(linked.status, 200);
  assert.equal((await linked.json()).linked, true);
  assert.deepEqual(db.tables.user_identities.map(item => item.user_id), ['admin-1']);
  assert.equal(db.tables.users.find(item => item.id === 'admin-1').role, 'admin');
});

test('관리자 화면은 비밀번호 값을 읽지도 내보내지도 않는다', async () => {
  const { db, cookie } = await withAdmin();
  await seedUser(db, { id: 'cust-1', email: 'user@ms12.test', role: 'customer', status: 'pending' });
  const body = await (await call(db, 'listUsers', cookie)).text();
  for (const word of ['password_hash', 'password_salt', 'password_algo', 'password_iterations', 'token_hash', PASSWORD]) {
    assert.ok(!body.includes(word), `응답에 ${word}가 나갔다`);
  }
  // SELECT 문에 비밀번호 열 자체가 없다.
  assert.doesNotMatch(adminSource, /SELECT[^;]*password_/i);
  assert.doesNotMatch(adminSource, /console\.(log|warn|error)/);
  // 소셜 계정 행의 내부 식별용 이메일은 화면으로 내보내지 않는다.
  const social = await through(db, post('/api/oauth', { action: 'start', provider: 'kakao', mode: 'signup' }), 'oauth');
  const state = new URL((await social.json()).authorizeUrl).searchParams.get('state');
  await through(db, post('/api/oauth', { action: 'callback', code: 'fixture', state }), 'oauth', { exchangeCode: async () => KAKAO_PROFILE });
  const listed = await (await call(db, 'listUsers', cookie)).json();
  assert.ok(listed.users.every(item => !String(item.email).includes('social.ms12.invalid')));
});

test('관리자에게만 관리자 화면 진입점이 보인다', () => {
  // 화면 게이트는 서버 차단을 대신하지 않고 결과만 따른다.
  assert.match(app, /function isAdmin\(\) \{ return auth\.status === 'signedIn' && auth\.user\?\.role === 'admin' && auth\.user\?\.status === 'active'; \}/);
  assert.match(app, /\$\{isAdmin\(\) \? `<button class="history-button" id="open-admin"/);
  assert.match(app, /\$\{isAdmin\(\) \? '<button class="button ghost" id="open-admin-home">관리자<\/button>' : ''\}/);
  // 저장된 화면 위치가 남아 있어도 관리자가 아니면 열리지 않는다.
  assert.match(app, /if \(state\.activeTool === 'admin' && !isAdmin\(\)\) state\.activeTool = 'home';/);
  assert.match(app, /admin: adminView/);
  // 승인·중지·삭제 버튼과 처리기가 연결되어 있다.
  for (const attribute of ['data-admin-approve', 'data-admin-disable', 'data-admin-delete']) assert.ok(app.includes(attribute), attribute);
  assert.match(app, /runAdminAction\('approve'/);
  assert.match(app, /if \(kind === 'delete' && auth\.confirmDelete !== id\)/, '삭제는 한 번 더 눌러야 한다');
  // 관리자 목록을 브라우저 저장소에 남기지 않는다.
  const persisted = app.slice(app.indexOf('function saveState()'), app.indexOf('function loadState()') > app.indexOf('function saveState()') ? app.length : app.indexOf('function saveState()') + 2000);
  assert.doesNotMatch(persisted, /accounts:/);
});
