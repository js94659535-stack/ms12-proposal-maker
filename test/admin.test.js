import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as adminRoute } from '../functions/api/admin.js';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { handleOAuthRequest } from '../functions/api/oauth.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';
import { fakeDb } from './fixtures/fake-d1.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const adminSource = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'test-only-passphrase-9241';
const KAKAO_PROFILE = { id: 4455667788 };

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
