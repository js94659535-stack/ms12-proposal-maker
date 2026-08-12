import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as operatorRoute } from '../functions/api/operator.js';
import { onRequest as adminRoute } from '../functions/api/admin.js';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as activityRoute } from '../functions/api/activity.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';
import { BLOCKED_ACTIONS } from '../server/operator-scope.js';
import { newRecoveryCode, normalizeRecoveryCode, recoveryCodeHash } from '../server/recovery.js';
import { fakeDb } from './fixtures/fake-d1.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const operatorSource = fs.readFileSync(new URL('../functions/api/operator.js', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'test-only-passphrase-9241';
const NEW_PASSWORD = 'brand-new-passphrase-7710';
const ENV = { GOOGLE_CLIENT_ID: 'fixture-google-client', KAKAO_REST_API_KEY: 'fixture-kakao-key' };
const ROUTES = { operator: operatorRoute, admin: adminRoute, auth: authRoute, activity: activityRoute };

function post(path, body, { cookie = '', ip = '203.0.113.9' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': ip };
  if (cookie) headers.Cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}
const cookieOf = response => `${SESSION_COOKIE}=${/__Host-ms12_session=([a-f0-9]{64})/.exec(response.headers.get('set-cookie') || '')?.[1] || ''}`;

// 실제 요청과 같이 미들웨어를 먼저 지난다.
async function through(db, request, route) {
  const data = {};
  const env = { ARCHIVE_DB: db, ...ENV };
  const blocked = await middleware({ request, env, data, next: async () => null });
  if (blocked) return blocked;
  return ROUTES[route]({ request, env, data });
}

async function seedUser(db, { id, email, role, status, name = '', at = '2026-08-10T00:00:00.000Z', orgName = '한들센터', phone = '010-1234-5678' }) {
  db.tables.users.push({
    id, email, role, status, org_id: '', name, ...(await createPasswordRecord(PASSWORD)),
    phone, org_name: orgName, is_contact: 1,
    terms_version: '2026-08-10', privacy_version: '2026-08-10', consented_at: at, profile_completed_at: at,
    created_at: at, updated_at: at
  });
}
async function signIn(db, email, password = PASSWORD, ip = '203.0.113.9') {
  const response = await through(db, post('/api/auth', { action: 'login', email, password }, { ip }), 'auth');
  return { response, cookie: cookieOf(response) };
}
// 운영관리자 한 명과 고객 한 명이 있는 기본 상태.
async function withOperator() {
  const db = fakeDb();
  await seedUser(db, { id: 'op-1', email: 'op@ms12.test', role: 'operator', status: 'active', name: '운영관리자' });
  await seedUser(db, { id: 'cust-1', email: 'user@ms12.test', role: 'customer', status: 'active', name: '김고객' });
  const { cookie } = await signIn(db, 'op@ms12.test');
  return { db, cookie };
}
const call = (db, action, cookie, payload = {}) => through(db, post('/api/operator', { action, ...payload }, { cookie }), 'operator');
const findUser = (users, id) => users.find(item => item.id === id);

test('운영관리자가 아니면 운영 화면 API가 열리지 않는다', async () => {
  const { db } = await withOperator();
  assert.equal((await through(db, post('/api/operator', { action: 'overview' }), 'operator')).status, 401);

  const customer = await signIn(db, 'user@ms12.test');
  const refused = await call(db, 'overview', customer.cookie);
  assert.equal(refused.status, 403);
  assert.match((await refused.json()).error, /운영관리자만/);

  // 승인 대기 계정은 미들웨어에서 먼저 막힌다.
  await seedUser(db, { id: 'wait-1', email: 'wait@ms12.test', role: 'customer', status: 'pending' });
  const waiting = await signIn(db, 'wait@ms12.test');
  assert.equal((await call(db, 'overview', waiting.cookie)).status, 403);
});

test('운영관리자는 관리자 전용 화면을 쓰지 못한다', async () => {
  const { db, cookie } = await withOperator();
  const blocked = await through(db, post('/api/admin', { action: 'listUsers' }, { cookie }), 'admin');
  assert.equal(blocked.status, 403);
  assert.match((await blocked.json()).error, /관리자만/);
  // 역할 변경도 관리자 경로에서만 되고, 운영관리자 쿠키로는 닿지 못한다.
  assert.equal((await through(db, post('/api/admin', { action: 'setRole', id: 'cust-1', role: 'operator' }, { cookie }), 'admin')).status, 403);
  assert.equal(db.tables.users.find(item => item.id === 'cust-1').role, 'customer');
});

test('요금·환불·역할·영구 삭제 같은 동작은 서버가 거절하고 감사기록에 남긴다', async () => {
  const { db, cookie } = await withOperator();
  for (const [action, label] of BLOCKED_ACTIONS) {
    const response = await call(db, action, cookie, { id: 'cust-1', role: 'admin' });
    assert.equal(response.status, 403, action);
    const body = await response.json();
    assert.equal(body.blocked, true, action);
    assert.ok(body.error.includes(label), `${action} 응답에 ${label}이 없다`);
  }
  // 어떤 계정도 바뀌지 않았다.
  assert.deepEqual(db.tables.users.map(item => [item.role, item.status]), [['operator', 'active'], ['customer', 'active']]);
  const logged = db.tables.admin_audit_log.filter(item => item.result === 'blocked');
  assert.equal(logged.length, BLOCKED_ACTIONS.size);
  assert.ok(logged.every(item => item.actor_id === 'op-1' && item.action.startsWith('blocked:')));
  // 목록에 없는 이름도 그냥 통과시키지 않는다.
  assert.equal((await call(db, 'dropDatabase', cookie)).status, 400);
});

test('관리자·다른 운영관리자·내 계정은 운영 화면에서 바꾸지 못한다', async () => {
  const { db, cookie } = await withOperator();
  await seedUser(db, { id: 'admin-1', email: 'admin@ms12.test', role: 'admin', status: 'active' });
  await seedUser(db, { id: 'op-2', email: 'op2@ms12.test', role: 'operator', status: 'active' });

  for (const action of ['disableUser', 'endSessions', 'issueRecoveryCode', 'unlockLogin']) {
    assert.equal((await call(db, action, cookie, { id: 'admin-1' })).status, 403, action);
    assert.equal((await call(db, action, cookie, { id: 'op-2' })).status, 403, action);
    const self = await call(db, action, cookie, { id: 'op-1' });
    assert.equal(self.status, 400, action);
    assert.match((await self.json()).error, /자기 계정/);
    assert.equal((await call(db, action, cookie, { id: 'no-such' })).status, 404, action);
  }
  assert.ok(db.tables.users.every(item => item.status === 'active'));
  assert.equal(db.tables.account_recovery_codes.length, 0);
});

test('승인·중지·재활성화가 실행자·대상·동작·시간과 함께 남는다', async () => {
  const { db, cookie } = await withOperator();
  await seedUser(db, { id: 'wait-1', email: 'wait@ms12.test', role: 'customer', status: 'pending', name: '김담당' });

  const approved = await call(db, 'approveUser', cookie, { id: 'wait-1' });
  assert.equal(approved.status, 200);
  const afterApprove = await approved.json();
  assert.equal(findUser(afterApprove.users, 'wait-1').status, 'active');
  assert.equal(db.tables.users.find(item => item.id === 'wait-1').role, 'customer', '승인은 역할을 바꾸지 않는다');
  // 이미 이용 중인 계정은 다시 승인하지 않는다.
  assert.equal((await call(db, 'approveUser', cookie, { id: 'wait-1' })).status, 400);

  assert.equal((await call(db, 'disableUser', cookie, { id: 'wait-1' })).status, 200);
  assert.equal(db.tables.users.find(item => item.id === 'wait-1').status, 'disabled');
  // 중지된 계정은 승인이 아니라 재활성화로 다시 연다.
  assert.equal((await call(db, 'approveUser', cookie, { id: 'wait-1' })).status, 400);
  const back = await call(db, 'reactivateUser', cookie, { id: 'wait-1' });
  assert.equal(back.status, 200);
  assert.equal(db.tables.users.find(item => item.id === 'wait-1').status, 'active');
  // 이용 중인 계정은 재활성화 대상이 아니다.
  assert.equal((await call(db, 'reactivateUser', cookie, { id: 'wait-1' })).status, 400);

  const actions = db.tables.admin_audit_log.map(item => item.action);
  assert.deepEqual(actions.filter(item => item.startsWith('user.')), ['user.approve', 'user.disable', 'user.reactivate']);
  for (const entry of db.tables.admin_audit_log) {
    assert.equal(entry.actor_id, 'op-1');
    assert.equal(entry.actor_email, 'op@ms12.test');
    assert.equal(entry.actor_role, 'operator');
    assert.match(entry.at, /^\d{4}-\d{2}-\d{2}T/);
  }
  assert.ok(db.tables.admin_audit_log.filter(item => item.target_id === 'wait-1').length >= 3);
  // 감사기록은 응답으로도 함께 온다.
  assert.ok((await back.json()).audit.some(entry => entry.action === 'user.reactivate' && entry.targetEmail === 'wait@ms12.test'));
});

test('중지하면 쓰던 세션이 끊기고 전체 세션 종료도 따로 할 수 있다', async () => {
  const { db, cookie } = await withOperator();
  const first = await signIn(db, 'user@ms12.test');
  await signIn(db, 'user@ms12.test');
  assert.equal(db.tables.sessions.filter(item => item.user_id === 'cust-1').length, 2);

  // 전체 세션 종료: 계정 상태는 그대로 두고 로그인만 모두 푼다.
  assert.equal((await call(db, 'endSessions', cookie, { id: 'cust-1' })).status, 200);
  assert.equal(db.tables.sessions.filter(item => item.user_id === 'cust-1').length, 0);
  assert.equal(db.tables.users.find(item => item.id === 'cust-1').status, 'active');
  const reused = await middleware({ request: post('/api/proposal', { action: 'draft' }, { cookie: first.cookie }), env: { ARCHIVE_DB: db, ...ENV }, data: {}, next: async () => null });
  assert.equal(reused.status, 401);
  // 세션만 끊었으므로 다시 로그인된다.
  assert.equal((await signIn(db, 'user@ms12.test')).response.status, 200);

  assert.equal((await call(db, 'disableUser', cookie, { id: 'cust-1' })).status, 200);
  assert.equal(db.tables.sessions.filter(item => item.user_id === 'cust-1').length, 0);
  assert.equal((await signIn(db, 'user@ms12.test')).response.status, 401);
});

test('로그인 잠금 상태를 보고 계정 기준으로 풀 수 있다', async () => {
  const { db, cookie } = await withOperator();
  // 다섯 번 틀리면 잠긴다. IP 제한에 먼저 걸리지 않게 시도마다 다른 주소를 쓴다.
  for (let index = 0; index < 5; index += 1) await signIn(db, 'user@ms12.test', 'wrong-password', `198.51.100.${index}`);
  const locked = findUser((await (await call(db, 'overview', cookie)).json()).users, 'cust-1');
  assert.equal(locked.login.locked, true);
  assert.equal(locked.login.failures, 5);
  assert.equal((await signIn(db, 'user@ms12.test', PASSWORD, '198.51.100.200')).response.status, 429);

  assert.equal((await call(db, 'unlockLogin', cookie, { id: 'cust-1' })).status, 200);
  const opened = findUser((await (await call(db, 'overview', cookie)).json()).users, 'cust-1');
  assert.equal(opened.login.locked, false);
  assert.equal(opened.login.failures, 0);
  assert.equal((await signIn(db, 'user@ms12.test', PASSWORD, '198.51.100.201')).response.status, 200);
  assert.ok(db.tables.admin_audit_log.some(item => item.action === 'user.unlockLogin' && item.target_id === 'cust-1'));
});

test('복구코드는 해시로만 저장되고 운영관리자는 비밀번호를 알 수 없다', async () => {
  const { db, cookie } = await withOperator();
  const response = await call(db, 'issueRecoveryCode', cookie, { id: 'cust-1' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.recoveryCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(body.recoveryMinutes, 10);

  // 저장된 것은 해시뿐이다. 코드 원문·비밀번호는 어디에도 없다.
  const [saved] = db.tables.account_recovery_codes;
  assert.equal(saved.user_id, 'cust-1');
  assert.equal(saved.issued_by, 'op-1');
  assert.equal(saved.used_at, '');
  assert.equal(saved.code_hash, await recoveryCodeHash(body.recoveryCode));
  assert.ok(!JSON.stringify(db.tables.account_recovery_codes).includes(body.recoveryCode));
  // 발급 시각과 만료 시각이 10분 차이다.
  assert.equal(Date.parse(saved.expires_at) - Date.parse(saved.created_at), 10 * 60_000);
  // 감사기록에는 발급 사실만 남고 코드 값은 남지 않는다.
  const audit = db.tables.admin_audit_log.find(item => item.action === 'user.issueRecoveryCode');
  assert.ok(audit && !JSON.stringify(audit).includes(body.recoveryCode));

  // 목록에는 코드 값 없이 상태만 보인다.
  const listed = findUser((await (await call(db, 'overview', cookie)).json()).users, 'cust-1');
  assert.equal(listed.recovery.active, true);
  assert.ok(!JSON.stringify(listed).includes(body.recoveryCode));
  // 중지된 계정에는 발급하지 않는다.
  await call(db, 'disableUser', cookie, { id: 'cust-1' });
  assert.equal((await call(db, 'issueRecoveryCode', cookie, { id: 'cust-1' })).status, 400);
});

test('사용자가 복구코드로 새 비밀번호를 정하면 기존 세션과 남은 코드가 모두 폐기된다', async () => {
  const { db, cookie } = await withOperator();
  const before = await signIn(db, 'user@ms12.test');
  assert.equal(db.tables.sessions.filter(item => item.user_id === 'cust-1').length, 1);
  const code = (await (await call(db, 'issueRecoveryCode', cookie, { id: 'cust-1' })).json()).recoveryCode;
  // 예전에 남아 있던 다른 코드도 함께 폐기되는지 본다.
  const stray = newRecoveryCode();
  db.tables.account_recovery_codes.push({
    id: 'stray-1', user_id: 'cust-1', code_hash: await recoveryCodeHash(stray), issued_by: 'op-1',
    created_at: '2026-08-11T00:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z', used_at: ''
  });

  const recovered = await through(db, post('/api/auth', { action: 'recoverPassword', email: 'user@ms12.test', code, password: NEW_PASSWORD, passwordConfirm: NEW_PASSWORD }), 'auth');
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).recovered, true);
  // 세션과 남은 코드가 모두 사라진다.
  assert.equal(db.tables.sessions.filter(item => item.user_id === 'cust-1').length, 0);
  assert.equal(db.tables.account_recovery_codes.filter(item => item.user_id === 'cust-1').length, 0);
  const stale = await middleware({ request: post('/api/proposal', { action: 'draft' }, { cookie: before.cookie }), env: { ARCHIVE_DB: db, ...ENV }, data: {}, next: async () => null });
  assert.equal(stale.status, 401);

  // 새 비밀번호로만 로그인된다.
  assert.equal((await signIn(db, 'user@ms12.test', PASSWORD, '198.51.100.31')).response.status, 401);
  assert.equal((await signIn(db, 'user@ms12.test', NEW_PASSWORD, '198.51.100.32')).response.status, 200);
  // 같은 코드도 폐기된 코드도 다시 쓰이지 않는다.
  for (const value of [code, stray]) {
    const again = await through(db, post('/api/auth', { action: 'recoverPassword', email: 'user@ms12.test', code: value, password: 'another-passphrase-5512', passwordConfirm: 'another-passphrase-5512' }, { ip: '198.51.100.33' }), 'auth');
    assert.equal(again.status, 401);
  }
  assert.ok(db.tables.admin_audit_log.some(item => item.action === 'recovery.redeem' && item.target_id === 'cust-1'));
});

test('기한이 지났거나 다른 계정의 복구코드는 받아들이지 않는다', async () => {
  const { db, cookie } = await withOperator();
  await seedUser(db, { id: 'cust-2', email: 'other@ms12.test', role: 'customer', status: 'active' });
  const code = (await (await call(db, 'issueRecoveryCode', cookie, { id: 'cust-1' })).json()).recoveryCode;

  // 다른 사람 이메일로는 쓸 수 없다.
  const wrongOwner = await through(db, post('/api/auth', { action: 'recoverPassword', email: 'other@ms12.test', code, password: NEW_PASSWORD, passwordConfirm: NEW_PASSWORD }), 'auth');
  assert.equal(wrongOwner.status, 401);

  // 10분이 지나면 쓰지 못한다.
  db.tables.account_recovery_codes[0].expires_at = '2020-01-01T00:00:00.000Z';
  const expired = await through(db, post('/api/auth', { action: 'recoverPassword', email: 'user@ms12.test', code, password: NEW_PASSWORD, passwordConfirm: NEW_PASSWORD }, { ip: '198.51.100.41' }), 'auth');
  assert.equal(expired.status, 401);
  assert.match((await expired.json()).error, /복구코드/);
  // 비밀번호는 그대로다.
  assert.equal((await signIn(db, 'user@ms12.test', PASSWORD, '198.51.100.42')).response.status, 200);

  // 비밀번호 규칙은 가입 때와 같다.
  const fresh = (await (await call(db, 'issueRecoveryCode', cookie, { id: 'cust-1' })).json()).recoveryCode;
  const tooShort = await through(db, post('/api/auth', { action: 'recoverPassword', email: 'user@ms12.test', code: fresh, password: 'short', passwordConfirm: 'short' }, { ip: '198.51.100.43' }), 'auth');
  assert.equal(tooShort.status, 400);
  // 규칙에 걸렸을 뿐이므로 코드는 아직 살아 있다.
  assert.equal(db.tables.account_recovery_codes.filter(item => item.user_id === 'cust-1' && !item.used_at).length, 1);
});

test('복구코드는 대소문자·붙임표를 가리지 않고 같은 값으로 본다', async () => {
  assert.equal(normalizeRecoveryCode(' abcd-efgh jkmn '), 'ABCDEFGHJKMN');
  assert.equal(await recoveryCodeHash('abcd efgh jkmn'), await recoveryCodeHash('ABCD-EFGH-JKMN'));
  // 헷갈리는 글자는 쓰지 않는다.
  for (let index = 0; index < 20; index += 1) assert.doesNotMatch(newRecoveryCode(), /[01OIL]/);
});

test('멈춘 단계와 최근 오류는 계획서 원문 없이 코드로만 남는다', async () => {
  const { db, cookie } = await withOperator();
  const customer = await signIn(db, 'user@ms12.test');
  const report = (body, options = {}) => through(db, post('/api/activity', { action: 'report', ...body }, { cookie: customer.cookie, ...options }), 'activity');

  assert.equal((await report({ kind: 'step', step: 3, code: 'step:3' })).status, 200);
  assert.equal((await report({ kind: 'error', step: 4, code: 'ai:timeout' })).status, 200);
  // 문장이나 원문을 넣으면 코드로 인정하지 않고 unknown으로만 남는다.
  assert.equal((await report({ kind: 'error', step: 4, code: '우리 기관은 2026년 아동센터 사업을 …' })).status, 200);
  const stored = db.tables.user_activity_events.map(item => item.code);
  assert.deepEqual(stored, ['step:3', 'ai:timeout', 'unknown']);
  assert.ok(!JSON.stringify(db.tables.user_activity_events).includes('아동센터'));
  // 알 수 없는 종류는 저장하지 않는다.
  assert.equal((await report({ kind: 'proposal', step: 4, code: 'x' })).status, 400);
  assert.equal(db.tables.user_activity_events.length, 3);

  // 운영 화면에서 멈춘 단계와 최근 오류를 확인한다.
  const listed = findUser((await (await call(db, 'overview', cookie)).json()).users, 'cust-1');
  assert.equal(listed.stuck.step, 3);
  assert.equal(listed.stuck.stepLabel, '사업 설계');
  assert.equal(listed.stuck.lastErrorCode, 'unknown');
  assert.equal(listed.stuck.errorAfterStep, true);
  assert.equal(listed.sessions.count, 1);
  assert.ok(listed.sessions.lastSeenAt);

  const detail = await (await call(db, 'userDetail', cookie, { id: 'cust-1' })).json();
  assert.equal(detail.activity.length, 3);
  assert.deepEqual([...new Set(detail.activity.map(item => item.kind))].sort(), ['error', 'step']);
  assert.ok(detail.activity.every(item => /^[a-z0-9][a-z0-9:_-]*$/.test(item.code)));
});

test('회원 검색은 이름·이메일·기관명·연락처로 찾는다', async () => {
  const { db, cookie } = await withOperator();
  await seedUser(db, { id: 'cust-2', email: 'nara@ms12.test', role: 'customer', status: 'active', name: '박나라', orgName: '나라복지관', phone: '010-9999-0000' });

  const byName = await (await call(db, 'overview', cookie, { query: '박나라' })).json();
  assert.deepEqual(byName.users.map(item => item.id), ['cust-2']);
  assert.deepEqual((await (await call(db, 'overview', cookie, { query: '나라복지관' })).json()).users.map(item => item.id), ['cust-2']);
  assert.deepEqual((await (await call(db, 'overview', cookie, { query: '9999' })).json()).users.map(item => item.id), ['cust-2']);
  assert.deepEqual((await (await call(db, 'overview', cookie, { query: 'user@ms12' })).json()).users.map(item => item.id), ['cust-1']);
  assert.equal((await (await call(db, 'overview', cookie, { query: '없는이름' })).json()).users.length, 0);
  // 검색어가 없으면 모두 보인다.
  assert.equal((await (await call(db, 'overview', cookie)).json()).users.length, 3);
});

test('결제·이용량은 지어내지 않고 미연동으로만 알린다', async () => {
  const { db, cookie } = await withOperator();
  const body = await (await call(db, 'overview', cookie)).json();
  const keys = body.notIntegrated.map(item => item.key);
  assert.deepEqual(keys, ['paymentAmount', 'paymentStatus', 'subscriptionPeriod', 'usageVolume']);
  assert.ok(body.notIntegrated.every(item => item.reason.length > 10));
  // 응답 어디에도 결제 금액·상태 같은 값이 들어 있지 않다.
  for (const key of ['amount', 'paidAt', 'price', 'paymentStatus', 'usageCount']) {
    assert.ok(!body.users.some(user => Object.hasOwn(user, key)), key);
  }
  // 구독은 지어낸 값이 아니라 관리자가 손으로 넣은 실제 행이다. 없으면 「구독 없음」으로만 알린다.
  assert.ok(body.users.every(user => user.subscription && typeof user.subscription.status === 'string'));
  assert.ok(body.users.every(user => user.subscription.status !== 'none' || user.subscription.statusLabel === '구독 없음'));
  assert.ok(body.notIntegrated.some(item => item.reason.includes('결제 사실을 뜻하지 않습니다')));
  assert.ok(body.notIntegrated.some(item => item.reason.includes('X-Archive-Key')));
  // 이용권과 무료 체험 사용 여부는 지어낸 값이 아니라 D1에 실제로 저장된 값이라 그대로 보여 준다.
  assert.ok(body.users.every(user => ['trial', 'full'].includes(user.plan)));
  assert.ok(body.users.every(user => typeof user.trialUsed === 'boolean'));
  assert.equal(body.contactLabel, '이용권 문의');
});

test('운영 화면은 비밀번호 값을 읽지도 내보내지도 않는다', async () => {
  const { db, cookie } = await withOperator();
  await call(db, 'issueRecoveryCode', cookie, { id: 'cust-1' });
  const overview = await (await call(db, 'overview', cookie)).text();
  const detail = await (await call(db, 'userDetail', cookie, { id: 'cust-1' })).text();
  for (const word of ['password_hash', 'password_salt', 'password_algo', 'password_iterations', 'token_hash', 'code_hash', PASSWORD]) {
    for (const [label, body] of [['목록', overview], ['상세', detail]]) assert.ok(!body.includes(word), `${label} 응답에 ${word}가 나갔다`);
  }
  // SELECT 문에 비밀번호·세션·코드 해시 열 자체가 없다.
  assert.doesNotMatch(operatorSource, /SELECT[^;]*password_/i);
  assert.doesNotMatch(operatorSource, /SELECT[^;]*token_hash/i);
  assert.doesNotMatch(operatorSource, /console\.(log|warn|error)/);
});

test('운영관리자에게만 운영 화면 진입점이 보이고 관리자만 역할을 바꾼다', () => {
  // 화면 게이트는 서버 차단을 대신하지 않고 결과만 따른다.
  assert.match(app, /function isOperator\(\) \{ return auth\.status === 'signedIn' && \(auth\.user\?\.role === 'operator' \|\| auth\.user\?\.role === 'admin'\) && auth\.user\?\.status === 'active'; \}/);
  // 진입점은 포털 단추로 모였다. 운영관리자에게만 보인다.
  assert.match(app, /function isStaff\(\) \{ return isAdmin\(\) \|\| isOperator\(\); \}/);
  assert.match(app, /data-portal-open="operator"[^`]*>운영관리자</);
  assert.match(app, /if \(state\.activeTool === 'operator' && !isOperator\(\)\) state\.activeTool = 'home';/);
  assert.match(app, /operator: operatorView/);
  // 운영 화면 버튼과 처리기가 연결되어 있다.
  for (const attribute of ['data-operator-action', 'data-operator-detail', 'data-operator-tab']) assert.ok(app.includes(attribute), attribute);
  assert.match(app, /if \(kind === 'endSessions' && auth\.operator\.confirmEnd !== id\)/, '전체 세션 종료는 한 번 더 눌러야 한다');
  // 역할 지정은 관리자 화면에만 있다. 일반회원·대행회원·운영관리자 중에서 고른다.
  assert.match(app, /<select data-admin-role-id="\$\{item\.id\}"/);
  assert.match(app, /ASSIGNABLE_ROLES\.map\(role =>/);
  assert.match(app, /querySelectorAll\('select\[data-admin-role-id\]'\)\.forEach\(el => el\.onchange = \(\) => void runAdminAction\(el\.value, el\.dataset\.adminRoleId\)\)/);
  // 발급된 복구코드는 브라우저 저장소에 남기지 않는다.
  const persisted = app.slice(app.indexOf('function saveState()'), app.indexOf('function saveState()') + 2000);
  for (const word of ['operator:', 'recoveryCode', 'issued']) assert.ok(!persisted.includes(word), word);
});
