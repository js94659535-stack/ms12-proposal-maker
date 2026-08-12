// 관리자가 소셜 로그인 뒤 승인 대기 화면으로 떨어지던 문제.
// 화면 분기와 계정 연결 규칙을 함께 고정한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as adminRoute } from '../functions/api/admin.js';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as publicRoute } from '../functions/api/public.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';
import { decideIdentityAction } from '../server/social-identity.js';
import { fakeDb } from './fixtures/fake-d1.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const oauthSource = fs.readFileSync(new URL('../functions/api/oauth.js', import.meta.url), 'utf8');
const adminSource = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'test-only-passphrase-9241';
const ROUTES = { admin: adminRoute, auth: authRoute, public: publicRoute };

function post(path, body, { cookie = '' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9' };
  if (cookie) headers.Cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}
const cookieOf = response => `${SESSION_COOKIE}=${/__Host-ms12_session=([a-f0-9]{64})/.exec(response.headers.get('set-cookie') || '')?.[1] || ''}`;

async function through(db, request, route) {
  const data = {};
  const env = { ARCHIVE_DB: db };
  const blocked = await middleware({ request, env, data, next: async () => null });
  if (blocked) return blocked;
  return ROUTES[route]({ request, env, data });
}

async function seedUser(db, { id, email, role = 'customer', status = 'active', profileDone = false }) {
  db.tables.users.push({
    id, email, role, status, org_id: '', name: '', ...(await createPasswordRecord(PASSWORD)),
    plan: role === 'admin' ? 'full' : 'trial', trial_used_at: '', phone: '', org_name: '', is_contact: 0,
    terms_version: '', privacy_version: '', consented_at: profileDone ? '2026-08-10T00:00:00.000Z' : '',
    profile_completed_at: profileDone ? '2026-08-10T00:00:00.000Z' : '',
    profile_updated_at: '', profile_review_needed: 0,
    created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
  });
}
const signIn = async (db, email) => cookieOf(await through(db, post('/api/auth', { action: 'login', email, password: PASSWORD }), 'auth'));

// ---------- 화면 분기 ----------

test('활성 관리자·운영관리자는 기관 프로필이 없어도 승인 대기 화면으로 가지 않는다', () => {
  // 승인 대기 화면은 고객 계정만 본다.
  assert.ok(app.includes("function pendingAccount() {\n  return auth.status === 'signedIn' && auth.user?.role === 'customer' && auth.user?.status === 'pending';\n}"));
  // 관리자·운영관리자는 로그인 후 포털 선택 화면으로 간다.
  assert.ok(app.includes('if (isStaff() && !state.portal) { app.innerHTML = portalChoiceView(); bindPortalChoice(); return; }'));
  // 이용 중지·비활성 운영 계정은 그보다 먼저 걸러진다.
  const render = app.slice(app.indexOf('function render() {'), app.indexOf('function render() {') + 1800);
  assert.ok(render.indexOf('suspendedAccount() || inactiveStaff()') < render.indexOf('pendingAccount()'));
  assert.ok(render.indexOf('pendingAccount()') < render.indexOf('portalChoiceView()'));
});

test('가입 정보 입력 화면은 고객 승인 대기 계정만 본다', () => {
  const pending = { status: 'signedIn', user: { role: 'customer', status: 'pending' } };
  const adminPending = { status: 'signedIn', user: { role: 'admin', status: 'pending' } };
  const operator = { status: 'signedIn', user: { role: 'operator', status: 'active' } };
  // 판정 규칙을 그대로 옮겨 확인한다.
  const decide = auth => auth.status === 'signedIn' && auth.user?.role === 'customer' && auth.user?.status === 'pending';
  assert.equal(decide(pending), true);
  assert.equal(decide(adminPending), false, '관리자는 고객 승인 절차의 대상이 아니다. 대신 활성이 아니므로 작업 화면도 열리지 않는다');
  assert.equal(decide(operator), false);
});

// ---------- 자동 승격 금지 ----------

test('소셜 로그인은 이메일이 같아도 기존 계정에 붙지 않고 새 고객 계정을 만든다', () => {
  // 이메일로 계정을 찾아 붙이는 코드가 없다.
  assert.doesNotMatch(oauthSource, /WHERE\s+email\s*=\s*\?[^;]*profile\.email/i);
  assert.match(oauthSource, /이메일이 같아도 기존 계정에 붙이지 않는다/);
  // 만들어지는 계정은 언제나 customer·pending이다.
  assert.match(oauthSource, /SIGNUP_ROLE, profile\.name \|\| '', SIGNUP_STATUS/);
  const signup = fs.readFileSync(new URL('../server/signup.js', import.meta.url), 'utf8');
  assert.match(signup, /SIGNUP_ROLE = 'customer'/);
  assert.match(signup, /SIGNUP_STATUS = 'pending'/);
  // 소셜 경로에서 역할을 올리는 코드가 없다.
  assert.doesNotMatch(oauthSource, /role\s*=\s*'admin'|SET role/);
});

test('로그인하지 않은 상태의 소셜 연결 요청은 새 계정으로만 처리된다', () => {
  const profile = { providerSubject: 'sub-1', email: 'js94659535@gmail.com', name: '홍길동' };
  // 연결 모드인데 세션이 없으면 거절한다.
  assert.equal(decideIdentityAction({ mode: 'link', profile, existingIdentity: null, session: null }).action, 'reject');
  // 가입 모드에서 처음 보는 소셜이면 새 pending 계정을 만든다.
  assert.equal(decideIdentityAction({ mode: 'signup', profile, existingIdentity: null, session: null }).action, 'createPending');
});

// ---------- 안전한 연결 이전 ----------

test('관리자 소셜 연결 이전은 방금 로그인한 관리자 세션에서만 열린다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'owner@ms12.test', role: 'admin' });
  await seedUser(db, { id: 'social-1', email: 'social-key@social.ms12.invalid', role: 'customer', status: 'pending' });
  db.tables.user_identities.push({ id: 'i1', user_id: 'social-1', provider: 'google', provider_subject: 's1', email: 'owner@ms12.test', linked_at: '2026-08-12T00:00:00.000Z' });

  const cookie = await signIn(db, 'owner@ms12.test');
  const moved = await through(db, post('/api/admin', { action: 'transferIdentity', provider: 'google' }, { cookie }), 'admin');
  assert.equal(moved.status, 200);
  assert.equal(db.tables.user_identities[0].user_id, 'admin-1', '연결이 관리자 계정으로 옮겨진다');
  // 옮긴 계정의 세션은 끊는다.
  assert.equal(db.tables.sessions.filter(item => item.user_id === 'social-1').length, 0);
  // 기록이 남는다.
  assert.ok(db.tables.admin_audit_log.some(row => row.action === 'admin.transferIdentity'));
  // 역할·상태는 그대로다. 이메일이 같다고 승격하지 않는다.
  assert.equal(db.tables.users.find(item => item.id === 'social-1').role, 'customer');
  assert.equal(db.tables.users.find(item => item.id === 'social-1').status, 'pending');
  assert.equal(db.tables.users.find(item => item.id === 'admin-1').role, 'admin');
  assert.equal(db.tables.users.find(item => item.id === 'admin-1').status, 'active');
});

test('오래된 세션과 다른 이메일의 연결은 옮기지 않는다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'owner@ms12.test', role: 'admin' });
  await seedUser(db, { id: 'social-1', email: 'social-key@social.ms12.invalid', role: 'customer', status: 'pending' });
  db.tables.user_identities.push({ id: 'i1', user_id: 'social-1', provider: 'google', provider_subject: 's1', email: 'someone.else@example.com', linked_at: '2026-08-12T00:00:00.000Z' });
  const cookie = await signIn(db, 'owner@ms12.test');
  // 이메일이 다르면 찾지 못한다.
  const other = await through(db, post('/api/admin', { action: 'transferIdentity', provider: 'google' }, { cookie }), 'admin');
  assert.equal(other.status, 404);
  assert.equal(db.tables.user_identities[0].user_id, 'social-1');

  // 오래된 세션이면 다시 로그인하라고 알린다.
  db.tables.user_identities[0].email = 'owner@ms12.test';
  for (const session of db.tables.sessions) session.created_at = '2020-01-01T00:00:00.000Z';
  const stale = await through(db, post('/api/admin', { action: 'transferIdentity', provider: 'google' }, { cookie }), 'admin');
  assert.equal(stale.status, 401);
  assert.equal((await stale.json()).needsReauth, true);
  assert.equal(db.tables.user_identities[0].user_id, 'social-1', '옮기지 않는다');
});

test('보존할 자료가 있는 계정의 연결은 자동으로 옮기지 않는다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'owner@ms12.test', role: 'admin' });
  await seedUser(db, { id: 'social-1', email: 'social-key@social.ms12.invalid', role: 'customer', status: 'pending', profileDone: true });
  db.tables.user_identities.push({ id: 'i1', user_id: 'social-1', provider: 'google', provider_subject: 's1', email: 'owner@ms12.test', linked_at: '2026-08-12T00:00:00.000Z' });
  const cookie = await signIn(db, 'owner@ms12.test');
  const response = await through(db, post('/api/admin', { action: 'transferIdentity', provider: 'google' }, { cookie }), 'admin');
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.conflict, true);
  assert.ok(body.footprint.total > 0);
  assert.equal(db.tables.user_identities[0].user_id, 'social-1');
});

test('관리자 화면 코드는 비밀번호 열을 읽지 않는다', () => {
  assert.doesNotMatch(adminSource, /SELECT[^;]*password_/i);
  // 대신 방금 로그인한 세션인지로 본인을 확인한다.
  assert.match(adminSource, /const REAUTH_MINUTES = 15;/);
  assert.match(adminSource, /function recentLogin\(session, now = new Date\(\)\)/);
});

// ---------- 로그인 뒤에도 관리자 상태가 유지되는가 ----------

test('로그아웃하고 다시 로그인해도 관리자 역할과 상태가 그대로다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'owner@ms12.test', role: 'admin' });
  const first = await signIn(db, 'owner@ms12.test');
  await through(db, post('/api/auth', { action: 'logout' }, { cookie: first }), 'auth');
  const again = await signIn(db, 'owner@ms12.test');
  const me = await (await through(db, post('/api/auth', { action: 'me' }, { cookie: again }), 'auth')).json();
  assert.equal(me.user.role, 'admin');
  assert.equal(me.user.status, 'active');
  const row = db.tables.users.find(item => item.id === 'admin-1');
  assert.equal(row.role, 'admin');
  assert.equal(row.status, 'active');
});

test('관리자만 연결 가져오기 화면을 본다', () => {
  assert.match(app, /function identityTransferPanel\(\) \{\s*\n\s*if \(!isAdmin\(\)\) return '';/);
  assert.match(app, /data-transfer-identity/);
  assert.match(app, /소셜 로그인은 이메일이 같아도 관리자 계정에 붙지 않고 새 고객 계정을 만듭니다/);
});

// ---------- 이용 중지 계정 ----------

test('중지된 관리자·운영관리자는 포털도 작업 API도 열지 못한다', async () => {
  for (const role of ['admin', 'operator']) {
    const db = fakeDb();
    await seedUser(db, { id: `u-${role}`, email: `${role}@ms12.test`, role, status: 'active' });
    const cookie = await signIn(db, `${role}@ms12.test`);
    // 활성일 때는 열린다.
    const before = await through(db, post('/api/auth', { action: 'me' }, { cookie }), 'auth');
    assert.equal(before.status, 200, `${role} 활성 로그인`);

    // 관리자가 중지하면 같은 세션으로도 아무것도 못 한다.
    db.tables.users.find(item => item.id === `u-${role}`).status = 'disabled';
    for (const [path, route] of [['/api/admin', 'admin'], ['/api/public', 'public']]) {
      const response = await through(db, post(path, { action: path === '/api/admin' ? 'listUsers' : 'searchNotices' }, { cookie }), route);
      assert.equal(response.status, 403, `${role} ${path}`);
      assert.equal((await response.json()).suspended, true);
    }
    // 자기 상태 확인과 로그아웃만 열려 있다.
    const me = await through(db, post('/api/auth', { action: 'me' }, { cookie }), 'auth');
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.status, 'disabled');
    // 중지된 계정은 새로 로그인할 수도 없다.
    const login = await through(db, post('/api/auth', { action: 'login', email: `${role}@ms12.test`, password: PASSWORD }), 'auth');
    assert.equal(login.status, 401);
  }
});

test('중지된 고객도 공개 검색과 작업 API가 모두 막힌다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'c-1', email: 'c1@ms12.test', role: 'customer', status: 'active' });
  const cookie = await signIn(db, 'c1@ms12.test');
  db.tables.users.find(item => item.id === 'c-1').status = 'disabled';
  const search = await through(db, post('/api/public', { action: 'searchNotices', query: '' }, { cookie }), 'public');
  assert.equal(search.status, 403);
  assert.equal((await search.json()).suspended, true);
});

test('화면 분기 규칙이 역할과 상태를 함께 본다', () => {
  // 규칙을 그대로 옮겨 확인한다.
  const suspended = auth => auth.status === 'signedIn' && auth.user?.status === 'disabled';
  const inactiveStaff = auth => auth.status === 'signedIn' && ['admin', 'operator'].includes(auth.user?.role) && auth.user?.status !== 'active';
  const pending = auth => auth.status === 'signedIn' && auth.user?.role === 'customer' && auth.user?.status === 'pending';
  const signed = (role, status) => ({ status: 'signedIn', user: { role, status } });

  // admin·operator + active → 포털(막는 화면 어느 것에도 걸리지 않는다)
  for (const role of ['admin', 'operator']) {
    assert.equal(suspended(signed(role, 'active')), false);
    assert.equal(inactiveStaff(signed(role, 'active')), false);
    assert.equal(pending(signed(role, 'active')), false);
  }
  // 누구든 중지 → 이용 중지 화면
  for (const role of ['admin', 'operator', 'customer']) assert.equal(suspended(signed(role, 'disabled')), true, role);
  // 활성이 아닌 운영 계정도 작업 화면으로 못 간다.
  assert.equal(inactiveStaff(signed('admin', 'pending')), true);
  assert.equal(inactiveStaff(signed('operator', 'pending')), true);
  // customer + pending만 가입정보 화면
  assert.equal(pending(signed('customer', 'pending')), true);
  assert.equal(pending(signed('customer', 'active')), false);
  assert.equal(pending(signed('admin', 'pending')), false);

  // 화면과 서버가 같은 기준을 쓴다.
  const middlewareSource = fs.readFileSync(new URL('../functions/api/_middleware.js', import.meta.url), 'utf8');
  assert.match(middlewareSource, /session\?\.suspended && !SUSPENDED_PATHS\.has\(url\.pathname\)/);
  assert.match(middlewareSource, /const SUSPENDED_PATHS = new Set\(\['\/api\/auth'\]\)/);
  assert.match(app, /function blockedView\(\)/);
  assert.match(app, /이용이 중지된 계정입니다/);
});

test('중지된 세션은 /api/auth에서도 me와 logout만 쓸 수 있다', async () => {
  // signup은 중지된 채로 새 계정과 새 세션을 받아 가는 길이었다. 역할을 가리지 않고 막는다.
  for (const role of ['admin', 'operator', 'customer']) {
    const db = fakeDb();
    await seedUser(db, { id: `s-${role}`, email: `${role}@block.test`, role, status: 'active' });
    const cookie = await signIn(db, `${role}@block.test`);
    db.tables.users.find(item => item.id === `s-${role}`).status = 'disabled';
    const accounts = db.tables.users.length;

    const blocked = [
      { action: 'signup', email: `new-${role}@block.test`, password: PASSWORD, passwordConfirm: PASSWORD, terms: true, privacy: true, termsVersion: '1', privacyVersion: '1' },
      { action: 'login', email: `${role}@block.test`, password: PASSWORD },
      { action: 'recoverPassword', email: `${role}@block.test`, code: 'code', password: PASSWORD, passwordConfirm: PASSWORD },
      { action: 'nonsense' }
    ];
    for (const body of blocked) {
      const response = await through(db, post('/api/auth', body, { cookie }), 'auth');
      assert.equal(response.status, 403, `${role} ${body.action}`);
      assert.equal((await response.json()).suspended, true, `${role} ${body.action}`);
      // 막힌 요청은 새 세션 쿠키를 내주지 않는다.
      assert.doesNotMatch(response.headers.get('set-cookie') || '', /__Host-ms12_session=[a-f0-9]{64}/);
    }
    assert.equal(db.tables.users.length, accounts, `${role}: 중지된 세션에서 계정이 늘지 않는다`);

    // 자기 상태 확인과 로그아웃은 남는다.
    const me = await through(db, post('/api/auth', { action: 'me' }, { cookie }), 'auth');
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.status, 'disabled');
    const out = await through(db, post('/api/auth', { action: 'logout' }, { cookie }), 'auth');
    assert.equal(out.status, 200);
    assert.equal(db.tables.sessions.filter(item => item.user_id === `s-${role}`).length, 0, `${role}: 로그아웃이 실제로 세션을 지운다`);
  }
});

test('중지되지 않은 계정의 인증 흐름은 그대로다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'a-1', email: 'active@ms12.test', role: 'customer', status: 'active' });
  await seedUser(db, { id: 'p-1', email: 'pending@ms12.test', role: 'customer', status: 'pending' });
  // 활성·대기 계정은 로그인된다.
  for (const email of ['active@ms12.test', 'pending@ms12.test']) {
    const login = await through(db, post('/api/auth', { action: 'login', email, password: PASSWORD }), 'auth');
    assert.equal(login.status, 200, email);
  }
  // 대기 계정 세션으로도 가입은 여전히 열려 있다. 중지에만 걸리는 잠금이다.
  const cookie = await signIn(db, 'pending@ms12.test');
  const signup = await through(db, post('/api/auth', {
    action: 'signup', email: 'fresh@ms12.test', password: PASSWORD, passwordConfirm: PASSWORD,
    terms: true, privacy: true, termsVersion: '1', privacyVersion: '1'
  }, { cookie }), 'auth');
  assert.equal(signup.status, 200);
  // 로그인하지 않은 사람의 가입·복구도 막히지 않는다.
  const anonymous = await through(db, post('/api/auth', {
    action: 'signup', email: 'anon@ms12.test', password: PASSWORD, passwordConfirm: PASSWORD,
    terms: true, privacy: true, termsVersion: '1', privacyVersion: '1'
  }), 'auth');
  assert.equal(anonymous.status, 200);
  const recovery = await through(db, post('/api/auth', { action: 'recoverPassword', email: 'active@ms12.test', code: 'wrong', password: PASSWORD, passwordConfirm: PASSWORD }), 'auth');
  assert.equal(recovery.status, 401, '코드가 틀리면 401이지 403이 아니다');
});
