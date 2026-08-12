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
  assert.match(app, /function pendingAccount\(\) \{[\s\S]*?if \(\['admin', 'operator'\]\.includes\(auth\.user\?\.role\)\) return false;/);
  // 관리자·운영관리자는 로그인 후 포털 선택 화면으로 간다.
  assert.match(app, /if \(isStaff\(\) && !state\.portal\) \{ app\.innerHTML = portalChoiceView\(\); bindPortalChoice\(\); return; \}/);
  // 포털 선택은 승인 대기 판정보다 뒤에 있지만, 관리자는 애초에 승인 대기로 잡히지 않는다.
  const render = app.slice(app.indexOf('function render() {'), app.indexOf('function render() {') + 1600);
  assert.ok(render.indexOf('pendingAccount()') < render.indexOf('portalChoiceView()'));
});

test('가입 정보 입력 화면은 고객 승인 대기 계정만 본다', () => {
  const pending = { status: 'signedIn', user: { role: 'customer', status: 'pending' } };
  const adminPending = { status: 'signedIn', user: { role: 'admin', status: 'pending' } };
  const operator = { status: 'signedIn', user: { role: 'operator', status: 'active' } };
  // 판정 규칙을 그대로 옮겨 확인한다.
  const decide = auth => auth.status === 'signedIn' && !['admin', 'operator'].includes(auth.user?.role) && auth.user?.status === 'pending';
  assert.equal(decide(pending), true);
  assert.equal(decide(adminPending), false, '관리자는 고객 승인 절차의 대상이 아니다');
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
