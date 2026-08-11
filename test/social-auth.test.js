import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleOAuthRequest } from '../functions/api/oauth.js';
import { onRequest as accountRoute } from '../functions/api/account.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';
import {
  CONSENT_VERSIONS, codeChallenge, createCodeVerifier, decideIdentityAction,
  normalizeProfile, validateProfileForm
} from '../server/social-identity.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0005_social_accounts.sql', import.meta.url), 'utf8');
const oauthSource = fs.readFileSync(new URL('../functions/api/oauth.js', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const ADMIN_PASSWORD = 'test-only-passphrase-9241';
// 공급자가 준다고 가정한 응답. 실제 호출은 하지 않는다.
const GOOGLE_PROFILE = { sub: '109876543210987654321', email: 'kim@example.org', name: '김담당' };
const KAKAO_PROFILE = { id: 4455667788, kakao_account: { email: 'kim@example.org', profile: { nickname: '김담당' } } };

function fakeDb() {
  const tables = { users: [], sessions: [], login_attempts: [], user_identities: [], oauth_states: [] };
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
    if (/^SELECT id, email, role, org_id, name, status, profile_completed_at FROM users WHERE id/.test(text)) return rows(tables.users.filter(i => i.id === args[0]));
    if (/^SELECT phone, org_name/.test(text)) return rows(tables.users.filter(i => i.id === args[0]));
    if (/^DELETE FROM login_attempts WHERE at </.test(text)) { tables.login_attempts = tables.login_attempts.filter(i => i.at >= args[0]); return rows([]); }
    if (/^SELECT COUNT\(\*\) AS count FROM login_attempts WHERE email_hash/.test(text)) return rows([{ count: tables.login_attempts.filter(i => i.email_hash === args[0] && i.at >= args[1]).length }]);
    if (/^SELECT COUNT\(\*\) AS count FROM login_attempts WHERE client_hash/.test(text)) return rows([{ count: tables.login_attempts.filter(i => i.client_hash === args[0] && i.at >= args[1]).length }]);
    if (/^INSERT INTO login_attempts/.test(text)) { tables.login_attempts.push({ id: args[0], email_hash: args[1], client_hash: args[2], at: args[3] }); return rows([]); }
    if (/^DELETE FROM login_attempts WHERE email_hash/.test(text)) { tables.login_attempts = tables.login_attempts.filter(i => i.email_hash !== args[0] && i.client_hash !== args[1]); return rows([]); }
    if (/^DELETE FROM oauth_states WHERE expires_at/.test(text)) { tables.oauth_states = tables.oauth_states.filter(i => i.expires_at >= args[0]); return rows([]); }
    if (/^INSERT INTO oauth_states/.test(text)) {
      tables.oauth_states.push({ state_hash: args[0], provider: args[1], code_verifier: args[2], mode: args[3], link_user_id: args[4], redirect_uri: args[5], created_at: args[6], expires_at: args[7] });
      return rows([]);
    }
    if (/^SELECT \* FROM oauth_states/.test(text)) return rows(tables.oauth_states.filter(i => i.state_hash === args[0]));
    if (/^DELETE FROM oauth_states WHERE state_hash/.test(text)) { tables.oauth_states = tables.oauth_states.filter(i => i.state_hash !== args[0]); return rows([]); }
    if (/^SELECT id, user_id FROM user_identities/.test(text)) return rows(tables.user_identities.filter(i => i.provider === args[0] && i.provider_subject === args[1]));
    if (/^INSERT INTO user_identities/.test(text)) {
      // 같은 소셜 계정은 한 번만 연결된다(UNIQUE (provider, provider_subject)).
      if (tables.user_identities.some(i => i.provider === args[2] && i.provider_subject === args[3])) throw new Error('UNIQUE constraint failed: user_identities.provider, user_identities.provider_subject');
      tables.user_identities.push({ id: args[0], user_id: args[1], provider: args[2], provider_subject: args[3], email: args[4], linked_at: args[5] });
      return rows([]);
    }
    if (/^SELECT provider, email, linked_at FROM user_identities/.test(text)) return rows(tables.user_identities.filter(i => i.user_id === args[0]));
    if (/^INSERT INTO users \(id, email, role, org_id, name, status, created_at, updated_at\)/.test(text)) {
      if (tables.users.some(i => i.email === args[1])) throw new Error('UNIQUE constraint failed: users.email');
      tables.users.push({ id: args[0], email: args[1], role: args[2], org_id: '', name: args[3], status: args[4], created_at: args[5], updated_at: args[6], phone: '', org_name: '', is_contact: 0, terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: '' });
      return rows([]);
    }
    if (/^UPDATE users SET name = \?, phone/.test(text)) {
      const user = tables.users.find(i => i.id === args[9]);
      if (user) Object.assign(user, { name: args[0], phone: args[1], org_name: args[2], is_contact: args[3], terms_version: args[4], privacy_version: args[5], consented_at: args[6], profile_completed_at: args[7], updated_at: args[8] });
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

const ENV = { GOOGLE_CLIENT_ID: 'fixture-google-client', KAKAO_REST_API_KEY: 'fixture-kakao-key' };
function post(path, body, { cookie = '' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9' };
  if (cookie) headers.Cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}
const cookieOf = response => `${SESSION_COOKIE}=${/__Host-ms12_session=([a-f0-9]{64})/.exec(response.headers.get('set-cookie') || '')?.[1] || ''}`;

// 미들웨어를 거쳐 세션을 채운 뒤 라우트를 부른다(실제 요청 흐름과 같다).
async function through(db, request, route, deps) {
  const data = {};
  const env = { ARCHIVE_DB: db, ...ENV };
  const blocked = await middleware({ request, env, data, next: async () => null });
  if (blocked) return blocked;
  return route === 'oauth' ? handleOAuthRequest({ request, env, data }, deps)
    : route === 'account' ? accountRoute({ request, env, data })
      : authRoute({ request, env, data });
}
// signup/link를 시작하고 돌아온 code를 처리하는 한 판.
async function socialRound(db, { provider, mode = 'signup', cookie = '', profile, tamper = {} }) {
  const started = await through(db, post('/api/oauth', { action: 'start', provider, mode }, { cookie }), 'oauth');
  if (!started.ok) return { started, finished: null };
  const state = new URL((await started.json()).authorizeUrl).searchParams.get('state');
  const exchangeCode = async () => profile;
  const finished = await through(db, post('/api/oauth', { action: 'callback', code: 'fixture-code', state, ...tamper }, { cookie }), 'oauth', { exchangeCode });
  return { started, finished, state };
}
async function seedAdmin(db) {
  db.tables.users.push({
    id: 'admin-1', email: 'admin@ms12.test', role: 'admin', org_id: '', name: '운영 관리자', status: 'active',
    ...(await createPasswordRecord(ADMIN_PASSWORD)), phone: '', org_name: '', is_contact: 0,
    terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: '',
    created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
  });
  const response = await through(db, post('/api/auth', { action: 'login', email: 'admin@ms12.test', password: ADMIN_PASSWORD }), 'auth');
  return { response, cookie: cookieOf(response) };
}

test('신규 Google·카카오 사용자는 customer·pending으로만 만들어진다', async () => {
  const db = fakeDb();
  const google = await socialRound(db, { provider: 'google', profile: GOOGLE_PROFILE });
  assert.equal(google.finished.status, 200);
  const body = await google.finished.json();
  assert.equal(body.created, true);
  assert.equal(body.user.role, 'customer');
  assert.equal(body.user.status, 'pending');
  assert.equal(body.user.profileCompleted, false);
  assert.equal(db.tables.users.length, 1);
  // 세션은 기존 __Host- 쿠키 그대로다.
  assert.match(google.finished.headers.get('set-cookie'), /^__Host-ms12_session=[a-f0-9]{64};.*Secure.*HttpOnly.*SameSite=Strict/);
  // 소셜 신원이 provider별 고유값으로 남는다.
  assert.deepEqual(db.tables.user_identities.map(item => [item.provider, item.provider_subject]), [['google', GOOGLE_PROFILE.sub]]);

  // 카카오도 같은 규칙이다. 이메일이 같아도 다른 계정으로 만든다.
  const kakao = await socialRound(db, { provider: 'kakao', profile: KAKAO_PROFILE });
  const kakaoBody = await kakao.finished.json();
  assert.equal(kakaoBody.user.role, 'customer');
  assert.equal(kakaoBody.user.status, 'pending');
  assert.equal(db.tables.users.length, 2, '같은 이메일이어도 계정을 합치지 않는다');
  assert.notEqual(kakaoBody.user.id, body.user.id);
  assert.equal(db.tables.user_identities.length, 2);
  // 계정 행의 email은 공급자별 내부 키다. 공급자가 준 이메일은 신원 행에만 남는다.
  assert.deepEqual(db.tables.users.map(item => item.email).sort(), [`google_${GOOGLE_PROFILE.sub}@social.ms12.invalid`, 'kakao_4455667788@social.ms12.invalid']);
  assert.ok(db.tables.users.every(item => item.email !== 'kim@example.org'));
  assert.ok(db.tables.user_identities.every(item => item.email === 'kim@example.org'));
  // admin·operator는 어떤 경로로도 붙지 않는다.
  assert.ok(db.tables.users.every(item => item.role === 'customer'));
});

test('같은 소셜 계정으로 다시 들어오면 새로 만들지 않고 그 계정으로 로그인한다', async () => {
  const db = fakeDb();
  const first = await socialRound(db, { provider: 'google', profile: GOOGLE_PROFILE });
  const firstId = (await first.finished.json()).user.id;
  const again = await socialRound(db, { provider: 'google', profile: GOOGLE_PROFILE });
  const againBody = await again.finished.json();
  assert.equal(again.finished.status, 200);
  assert.equal(againBody.created, false);
  assert.equal(againBody.user.id, firstId);
  assert.equal(db.tables.users.length, 1, '중복 가입이 생기지 않는다');
  assert.equal(db.tables.user_identities.length, 1);
});

test('로그인한 관리자가 두 공급자를 한 계정에 연결한다', async () => {
  const db = fakeDb();
  const { cookie } = await seedAdmin(db);
  for (const [provider, profile] of [['google', GOOGLE_PROFILE], ['kakao', KAKAO_PROFILE]]) {
    const round = await socialRound(db, { provider, mode: 'link', cookie, profile });
    assert.equal(round.finished.status, 200, provider);
    assert.equal((await round.finished.json()).linked, true, provider);
  }
  assert.equal(db.tables.users.length, 1, '연결은 새 계정을 만들지 않는다');
  assert.deepEqual(db.tables.user_identities.map(item => item.provider).sort(), ['google', 'kakao']);
  assert.ok(db.tables.user_identities.every(item => item.user_id === 'admin-1'));
  // 관리자 계정의 role·status는 그대로다.
  assert.equal(db.tables.users[0].role, 'admin');
  assert.equal(db.tables.users[0].status, 'active');
  // 이미 연결한 계정을 다시 연결해도 중복 행이 생기지 않는다.
  const repeat = await socialRound(db, { provider: 'google', mode: 'link', cookie, profile: GOOGLE_PROFILE });
  assert.equal((await repeat.finished.json()).alreadyLinked, true);
  assert.equal(db.tables.user_identities.length, 2);
});

test('비로그인 사용자는 남의 계정에 소셜 계정을 붙일 수 없다', async () => {
  const db = fakeDb();
  await seedAdmin(db);
  // 로그인 없이 link를 시작할 수 없다.
  const started = await through(db, post('/api/oauth', { action: 'start', provider: 'google', mode: 'link' }), 'oauth');
  assert.equal(started.status, 401);
  assert.equal(db.tables.oauth_states.length, 0);

  // 관리자가 시작한 연결을 다른 사람이 끝낼 수 없다.
  const { cookie } = await seedAdmin(db);
  const begin = await through(db, post('/api/oauth', { action: 'start', provider: 'google', mode: 'link' }, { cookie }), 'oauth');
  const state = new URL((await begin.json()).authorizeUrl).searchParams.get('state');
  const stolen = await through(db, post('/api/oauth', { action: 'callback', code: 'c', state }), 'oauth', { exchangeCode: async () => GOOGLE_PROFILE });
  assert.equal(stolen.status, 401);
  assert.equal(db.tables.user_identities.length, 0);

  // signup으로 만들어진 pending 계정은 관리자 계정을 건드리지 못한다.
  const signup = await socialRound(db, { provider: 'kakao', profile: KAKAO_PROFILE });
  assert.notEqual((await signup.finished.json()).user.id, 'admin-1');
});

test('state·PKCE가 맞지 않으면 막는다', async () => {
  const db = fakeDb();
  const exchangeCode = async () => GOOGLE_PROFILE;
  // 없는 state
  const unknown = await through(db, post('/api/oauth', { action: 'callback', code: 'c', state: 'a'.repeat(64) }), 'oauth', { exchangeCode });
  assert.equal(unknown.status, 400);

  // provider를 바꿔치기한 경우
  const begin = await through(db, post('/api/oauth', { action: 'start', provider: 'google', mode: 'signup' }), 'oauth');
  const state = new URL((await begin.json()).authorizeUrl).searchParams.get('state');
  const swapped = await through(db, post('/api/oauth', { action: 'callback', code: 'c', state, provider: 'kakao' }), 'oauth', { exchangeCode });
  assert.equal(swapped.status, 400);
  assert.equal(db.tables.users.length, 0);

  // state는 한 번 쓰면 사라진다(재사용 불가).
  const round = await socialRound(db, { provider: 'google', profile: GOOGLE_PROFILE });
  const replay = await through(db, post('/api/oauth', { action: 'callback', code: 'c', state: round.state }), 'oauth', { exchangeCode });
  assert.equal(replay.status, 400);

  // 만료된 state
  const later = await through(db, post('/api/oauth', { action: 'start', provider: 'kakao', mode: 'signup' }), 'oauth');
  const laterState = new URL((await later.json()).authorizeUrl).searchParams.get('state');
  db.tables.oauth_states.forEach(item => { item.expires_at = '2020-01-01T00:00:00.000Z'; });
  const expired = await through(db, post('/api/oauth', { action: 'callback', code: 'c', state: laterState }), 'oauth', { exchangeCode });
  assert.equal(expired.status, 400);

  // PKCE: 승인 주소에 S256 challenge가 실리고 verifier는 서버에만 남는다.
  const fresh = await through(db, post('/api/oauth', { action: 'start', provider: 'google', mode: 'signup' }), 'oauth');
  const url = new URL((await fresh.json()).authorizeUrl);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const stored = db.tables.oauth_states.at(-1);
  assert.equal(url.searchParams.get('code_challenge'), await codeChallenge(stored.code_verifier));
  assert.ok(!url.toString().includes(stored.code_verifier), 'verifier가 주소에 실리면 안 된다');
  const verifier = createCodeVerifier();
  assert.notEqual(await codeChallenge(verifier), await codeChallenge(`${verifier}x`));
});

test('가입 후 최소 정보와 동의 버전을 기록한다', async () => {
  const db = fakeDb();
  const round = await socialRound(db, { provider: 'google', profile: GOOGLE_PROFILE });
  const cookie = cookieOf(round.finished);

  // pending 계정은 작업 API를 쓰지 못한다.
  const blocked = await middleware({ request: post('/api/proposal', { action: 'draft' }, { cookie }), env: { ARCHIVE_DB: db, ...ENV }, data: {}, next: async () => null });
  assert.equal(blocked.status, 403);
  assert.match((await blocked.json()).error, /가입 승인 대기 중/);

  // 빠진 값이 있으면 받지 않는다.
  const partial = await through(db, post('/api/account', { action: 'completeProfile', name: '김담당', phone: '010-1234-5678', orgName: '한들센터', isContact: true, agreeTerms: true }, { cookie }), 'account');
  assert.equal(partial.status, 400);
  assert.match((await partial.json()).error, /개인정보 수집·이용에 동의/);

  const done = await through(db, post('/api/account', {
    action: 'completeProfile', name: '김담당', phone: '010-1234-5678', orgName: '한들가족지원센터', isContact: true, agreeTerms: true, agreePrivacy: true
  }, { cookie }), 'account');
  assert.equal(done.status, 200);
  const user = db.tables.users[0];
  assert.equal(user.phone, '010-1234-5678');
  assert.equal(user.org_name, '한들가족지원센터');
  assert.equal(user.is_contact, 1);
  assert.equal(user.terms_version, CONSENT_VERSIONS.terms);
  assert.equal(user.privacy_version, CONSENT_VERSIONS.privacy);
  assert.match(user.consented_at, /^\d{4}-\d{2}-\d{2}T/);
  // 정보를 냈다고 스스로 승인되지는 않는다.
  assert.equal(user.status, 'pending');
  assert.equal(user.role, 'customer');
});

test('공급자 토큰을 저장하거나 내보내지 않는다', async () => {
  const db = fakeDb();
  const round = await socialRound(db, { provider: 'google', profile: GOOGLE_PROFILE });
  const body = await round.finished.text();
  const dump = JSON.stringify(db.tables);
  for (const word of ['access_token', 'refresh_token', 'id_token', 'accessToken']) {
    assert.ok(!dump.includes(word), `D1에 ${word}가 남았다`);
    assert.ok(!body.includes(word), `응답에 ${word}가 나갔다`);
  }
  // 스키마에도 토큰 열이 없다.
  assert.doesNotMatch(migration, /access_token|refresh_token|id_token/i);
  // 토큰은 교환 함수 안에서만 쓰이고 반환·기록되지 않는다.
  assert.doesNotMatch(oauthSource, /console\.(log|warn|error)/);
  assert.match(oauthSource, /accessToken은 이 함수가 끝나면 사라진다/);
  const client = fs.readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /localStorage|sessionStorage|document\.cookie|access_token/);
});

test('식별·검증 규칙은 이메일만으로 계정을 합치지 않는다', () => {
  assert.deepEqual(normalizeProfile('google', GOOGLE_PROFILE), { provider: 'google', providerSubject: GOOGLE_PROFILE.sub, email: 'kim@example.org', name: '김담당' });
  assert.deepEqual(normalizeProfile('kakao', KAKAO_PROFILE), { provider: 'kakao', providerSubject: '4455667788', email: 'kim@example.org', name: '김담당' });
  assert.equal(normalizeProfile('google', { email: 'kim@example.org' }), null, 'sub가 없으면 받지 않는다');
  assert.equal(normalizeProfile('naver', { id: '1' }), null);

  const profile = normalizeProfile('google', GOOGLE_PROFILE);
  // 이메일이 같은 기존 계정이 있어도 signup은 새 계정을 만든다(합치지 않는다).
  assert.deepEqual(decideIdentityAction({ mode: 'signup', profile, existingIdentity: null }), { action: 'createPending', role: 'customer', status: 'pending' });
  assert.equal(decideIdentityAction({ mode: 'signup', profile, existingIdentity: { user_id: 'u1' } }).action, 'signIn');
  assert.equal(decideIdentityAction({ mode: 'link', profile, session: null }).status, 401);
  assert.equal(decideIdentityAction({ mode: 'link', profile, existingIdentity: { user_id: 'other' }, session: { user: { id: 'me' } } }).status, 409);
  assert.equal(decideIdentityAction({ mode: 'link', profile, existingIdentity: null, session: { user: { id: 'me' } } }).action, 'link');

  // 최소 정보 검사
  assert.equal(validateProfileForm({ name: '김', phone: '010', orgName: 'ㄱ' }).ok, false);
  assert.deepEqual(validateProfileForm({ name: '김담당', phone: '010-1234-5678', orgName: '한들센터', isContact: false, agreeTerms: true, agreePrivacy: true }).value,
    { name: '김담당', phone: '010-1234-5678', orgName: '한들센터', isContact: false });
});

test('기존 이메일·비밀번호 관리자 로그인이 그대로 동작한다', async () => {
  const db = fakeDb();
  const { response, cookie } = await seedAdmin(db);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.role, 'admin');
  assert.equal(body.user.status, 'active');
  // 승인된 계정은 작업 API를 그대로 쓴다.
  let passed = false;
  const allowed = await middleware({ request: post('/api/proposal', { action: 'draft' }, { cookie }), env: { ARCHIVE_DB: db, ...ENV }, data: {}, next: async () => { passed = true; return new Response('{}'); } });
  assert.equal(passed, true);
  assert.equal(allowed.status, 200);
  // 비로그인은 여전히 401이다.
  const anonymous = await middleware({ request: post('/api/proposal', { action: 'draft' }), env: { ARCHIVE_DB: db, ...ENV }, data: {}, next: async () => null });
  assert.equal(anonymous.status, 401);
});

test('설정값이 없으면 가짜 주소로 보내지 않는다', async () => {
  const db = fakeDb();
  const response = await handleOAuthRequest({ request: post('/api/oauth', { action: 'start', provider: 'google', mode: 'signup' }), env: { ARCHIVE_DB: db }, data: {} }, {});
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Google 로그인 설정이 아직 등록되지 않았습니다/);
  assert.equal(db.tables.oauth_states.length, 0);
});

test('화면에 소셜 시작·연결·가입정보 입력이 있다', () => {
  assert.match(app, /data-social="\$\{provider\}" data-social-mode="\$\{mode\}"/);
  assert.match(app, /\[\['google', 'Google'\], \['kakao', '카카오'\]\]/);
  assert.match(app, /\$\{socialButtons\('signup'\)\}/);
  // 승인 전에는 가입 절차 화면만 보여 준다.
  assert.match(app, /if \(pendingAccount\(\)\) \{ app\.innerHTML = pendingView\(\); bindLogin\(\); return; \}/);
  assert.match(app, /id="profile-name"|id="profile-phone"|id="profile-org"|id="profile-contact"/);
  assert.match(app, /id="agree-terms"/);
  assert.match(app, /id="agree-privacy"/);
  // 로그인한 사람은 계정 설정에서 두 번째 공급자를 연결한다.
  assert.match(app, /function accountLinkPanel\(\)/);
  assert.match(app, /data-social-mode="link"/);
  assert.match(app, /id="open-account"/);
});
