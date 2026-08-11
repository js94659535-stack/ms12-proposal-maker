// 이용권. 화면에서 숨기는 것이 아니라 서버가 막는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as proposalRoute } from '../functions/api/proposal.js';
import { onRequest as coachingRoute } from '../functions/api/proposal-coaching.js';
import { onRequest as reviewRoute } from '../functions/api/proposal-review.js';
import { onRequest as archiveRoute } from '../functions/api/archive.js';
import { onRequest as adminRoute } from '../functions/api/admin.js';
import { onRequest as operatorRoute } from '../functions/api/operator.js';
import { onRequest as accountRoute } from '../functions/api/account.js';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';
import { CONTACT_LABEL, DEFAULT_PLAN, PLANS, TRIAL_ACTION, effectivePlan, hasFullAccess, planRefusal } from '../server/plan.js';
import { BLOCKED_ACTIONS } from '../server/operator-scope.js';
import { fakeDb } from './fixtures/fake-d1.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0007_plans.sql', import.meta.url), 'utf8');
const example = fs.readFileSync(new URL('../src/example-plan.js', import.meta.url), 'utf8');
const proposalSource = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'test-only-passphrase-9241';
const ENV = { OPENAI_API_KEY: 'mock-only', OPENAI_MODEL: 'mock-model' };
const ROUTES = { proposal: proposalRoute, coaching: coachingRoute, review: reviewRoute, archive: archiveRoute, admin: adminRoute, operator: operatorRoute, account: accountRoute, auth: authRoute };
const NOTICE = '○○재단 2027년 지역 아동 정서지원 사업 공고. 지원 대상은 지역 아동복지 기관이며, 사업기간은 8개월, 성과지표 제출이 필수입니다. 신청서에는 사업 필요성과 대상 선정 근거를 적어야 합니다.';
const SKETCH = {
  noticePurpose: '지역 아동의 정서 회복', selectionKeys: ['필요성 근거', '성과지표', '대상 선정'],
  projectName: '마음이 자라는 16주', problem: '집단 정서지원 과정이 없다', target: '초등 5~6학년 20명',
  goal: '정서조절 점수 15% 향상', activities: ['집단 프로그램 16회기', '보호자 간담회', '사후 측정'], expectedEffect: '재의뢰 감소'
};

function post(path, body, { cookie = '', headers = {} } = {}) {
  const base = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9', ...headers };
  if (cookie) base.Cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers: base, body: JSON.stringify(body) });
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
async function seedUser(db, { id, email, role = 'customer', status = 'active', plan = DEFAULT_PLAN, trialUsedAt = '' }) {
  db.tables.users.push({
    id, email, role, status, org_id: '', name: '', ...(await createPasswordRecord(PASSWORD)),
    plan, trial_used_at: trialUsedAt, phone: '', org_name: '', is_contact: 0,
    terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: '',
    created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
  });
}
async function signIn(db, email) {
  return cookieOf(await through(db, post('/api/auth', { action: 'login', email, password: PASSWORD }), 'auth'));
}
// OpenAI를 부르지 않고 정해진 결과만 돌려준다. 호출 횟수도 센다.
function mockOpenAI(result = SKETCH) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ output_text: JSON.stringify(result), status: 'completed' }), { headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('이용권 규칙은 역할을 먼저 보고 무료 체험에는 한 가지 작업만 연다', () => {
  assert.equal(effectivePlan({ role: 'admin', plan: 'trial' }), 'full', '관리자는 열 값과 무관하게 전체 기능');
  assert.equal(effectivePlan({ role: 'operator', plan: 'trial' }), 'full', '운영관리자도 전체 기능');
  assert.equal(effectivePlan({ role: 'customer', plan: 'full' }), 'full');
  assert.equal(effectivePlan({ role: 'customer', plan: 'trial' }), 'trial');
  // 알 수 없는 값이 들어오면 가장 좁은 권한으로 떨어진다.
  assert.equal(effectivePlan({ role: 'customer', plan: 'unlimited' }), 'trial');
  assert.equal(effectivePlan({}), 'trial');
  assert.deepEqual([...PLANS].sort(), ['full', 'trial']);

  const trialUser = { role: 'customer', plan: 'trial' };
  assert.equal(planRefusal(trialUser, TRIAL_ACTION), null);
  for (const action of ['analyze', 'master', 'draft', 'draftPart', 'fullProposal', 'preciseReview', 'patchSections', 'rewrite', 'finalize']) {
    assert.equal(planRefusal(trialUser, action)?.status, 403, action);
  }
  assert.equal(planRefusal({ role: 'customer', plan: 'full' }, 'fullProposal'), null);
  assert.equal(hasFullAccess(trialUser), false);
});

test('migration은 기존 활성 회원의 이용 권한을 보존하고 신규는 무료 체험으로 시작한다', () => {
  // 표를 다시 만들지 않고 열만 붙인다.
  assert.match(migration, /ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'trial'/);
  assert.match(migration, /ALTER TABLE users ADD COLUMN trial_used_at TEXT NOT NULL DEFAULT ''/);
  assert.match(migration, /UPDATE users SET plan = 'full' WHERE status = 'active' OR role IN \('admin', 'operator'\)/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  // 가입은 여전히 customer·pending으로만 만들어지고 plan 기본값이 무료 체험이다.
  assert.match(migration, /DEFAULT 'trial'/);
});

test('전체 이용권이 없으면 생성·검증·보관 API가 서버에서 막힌다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'trial-1', email: 'trial@ms12.test', plan: 'trial' });
  const cookie = await signIn(db, 'trial@ms12.test');
  const mock = mockOpenAI();
  try {
    for (const action of ['analyze', 'master', 'draft', 'draftPart', 'fullProposal', 'preciseReview', 'patchSections', 'rewrite', 'finalize']) {
      const response = await through(db, post('/api/proposal', { action, payload: { sourceText: NOTICE, organization: {} } }, { cookie }), 'proposal');
      assert.equal(response.status, 403, action);
      const body = await response.json();
      assert.equal(body.needsPlan, true, action);
      assert.ok(body.error.includes(CONTACT_LABEL), action);
    }
    // 검증·코칭과 심사 검토도 같은 기준으로 막힌다.
    const coaching = await through(db, post('/api/proposal-coaching', { action: 'startCoaching', proposalText: '가'.repeat(200) }, { cookie }), 'coaching');
    assert.equal(coaching.status, 403);
    const review = await through(db, post('/api/proposal-review', { sections: Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, title: 't', content: 'c' })) }, { cookie }), 'review');
    assert.equal(review.status, 403);
    // 계획서 보관도 전체 이용권 기능이다.
    const saved = await through(db, post('/api/archive', { action: 'saveProposal', proposal: { id: 'p1', title: 't', stage: 's', snapshot: {} } }, { cookie, headers: { 'X-Archive-Key': '12345678-1234-1234-1234-123456789abc' } }), 'archive');
    assert.equal(saved.status, 403);
    assert.equal((await saved.json()).needsPlan, true);
    // 막힌 요청은 OpenAI를 한 번도 부르지 않는다.
    assert.equal(mock.calls.length, 0, '차단된 요청이 비용을 쓰면 안 된다');
  } finally { mock.restore(); }
});

test('무료 체험은 계정당 한 번만 열리고 두 번째부터 서버가 거절한다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'trial-1', email: 'trial@ms12.test', plan: 'trial' });
  const cookie = await signIn(db, 'trial@ms12.test');
  const mock = mockOpenAI();
  try {
    const first = await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: { sourceText: NOTICE } }, { cookie }), 'proposal');
    assert.equal(first.status, 200);
    const body = await first.json();
    assert.equal(body.trialUsed, true);
    assert.equal(body.projectName, SKETCH.projectName);
    // 계획서 본문 항목은 결과에 없다.
    for (const key of ['sections', 'tables', 'masterLogic', 'analysis']) assert.equal(Object.hasOwn(body, key), false, key);
    // 사용 여부가 계정 행에 남는다.
    assert.match(db.tables.users.find(item => item.id === 'trial-1').trial_used_at, /^\d{4}-\d{2}-\d{2}T/);

    const second = await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: { sourceText: NOTICE } }, { cookie }), 'proposal');
    assert.equal(second.status, 403);
    const refused = await second.json();
    assert.equal(refused.trialUsed, true);
    assert.ok(refused.error.includes(CONTACT_LABEL));
    // 두 번째 요청은 OpenAI를 부르지 않는다.
    assert.equal(mock.calls.length, 1, '무료 체험은 계정당 한 번만 비용을 쓴다');
  } finally { mock.restore(); }
});

test('무료 체험 실패는 사용 기록을 남기지 않고 분량 상한을 지킨다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'trial-1', email: 'trial@ms12.test', plan: 'trial' });
  const cookie = await signIn(db, 'trial@ms12.test');
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'upstream down' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  try {
    const failed = await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: { sourceText: NOTICE } }, { cookie }), 'proposal');
    assert.equal(failed.status, 502);
    // 우리 쪽 실패이므로 체험 기회를 돌려준다.
    assert.equal(db.tables.users.find(item => item.id === 'trial-1').trial_used_at, '');
  } finally { globalThis.fetch = original; }

  // 너무 짧거나 너무 긴 공고는 받지 않는다.
  const short = await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: { sourceText: '짧음' } }, { cookie }), 'proposal');
  assert.equal(short.status, 400);
  const long = await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: { sourceText: '가'.repeat(20_001) } }, { cookie }), 'proposal');
  assert.equal(long.status, 400);
  assert.equal(db.tables.users.find(item => item.id === 'trial-1').trial_used_at, '');

  // 여덟 항목만 만들고 출력 토큰도 작게 묶어 둔다.
  assert.match(proposalSource, /trialCorePlan: 5_000/);
  assert.match(proposalSource, /required: \['noticePurpose', 'selectionKeys', 'projectName', 'necessity', 'target', 'goal', 'programs', 'schedule', 'organization', 'indicators', 'expectedEffect', 'checkNeeded'\]/);
});

test('관리자·운영관리자는 이용권 열과 무관하게 전체 기능을 쓴다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@ms12.test', role: 'admin', plan: 'trial' });
  await seedUser(db, { id: 'op-1', email: 'op@ms12.test', role: 'operator', plan: 'trial' });
  const mock = mockOpenAI({ analysis: { mode: 'ai' }, requirements: [] });
  try {
    for (const email of ['admin@ms12.test', 'op@ms12.test']) {
      const cookie = await signIn(db, email);
      const response = await through(db, post('/api/proposal', { action: 'analyze', payload: { projectType: 'g2b', project: {}, organization: {}, sourceText: NOTICE } }, { cookie }), 'proposal');
      assert.notEqual(response.status, 403, email);
    }
  } finally { mock.restore(); }
});

test('전체 이용권 부여·회수는 관리자만 하고 운영관리자는 조회만 한다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@ms12.test', role: 'admin', plan: 'full' });
  await seedUser(db, { id: 'op-1', email: 'op@ms12.test', role: 'operator', plan: 'full' });
  await seedUser(db, { id: 'cust-1', email: 'user@ms12.test', plan: 'trial', trialUsedAt: '2026-08-11T01:00:00.000Z' });
  const adminCookie = await signIn(db, 'admin@ms12.test');
  const operatorCookie = await signIn(db, 'op@ms12.test');

  // 운영관리자는 이용권을 바꾸려는 시도 자체가 거절되고 그 시도가 감사기록에 남는다.
  for (const action of ['setPlan', 'grantFullPlan', 'revokeFullPlan', 'resetTrial']) {
    assert.ok(BLOCKED_ACTIONS.has(action), action);
    const refused = await through(db, post('/api/operator', { action, id: 'cust-1', plan: 'full' }, { cookie: operatorCookie }), 'operator');
    assert.equal(refused.status, 403, action);
    assert.equal((await refused.json()).blocked, true, action);
  }
  assert.equal(db.tables.users.find(item => item.id === 'cust-1').plan, 'trial', '운영관리자는 이용권을 바꾸지 못한다');
  assert.ok(db.tables.admin_audit_log.some(item => item.action === 'blocked:setPlan' && item.actor_id === 'op-1'));

  // 운영관리자는 이용권과 무료 체험 사용 여부를 읽을 수 있다.
  const listed = (await (await through(db, post('/api/operator', { action: 'overview' }, { cookie: operatorCookie }), 'operator')).json()).users;
  const seen = listed.find(item => item.id === 'cust-1');
  assert.equal(seen.plan, 'trial');
  assert.equal(seen.trialUsed, true);

  // 관리자는 부여·회수할 수 있고 기록이 남는다.
  const granted = await through(db, post('/api/admin', { action: 'setPlan', id: 'cust-1', plan: 'full' }, { cookie: adminCookie }), 'admin');
  assert.equal(granted.status, 200);
  assert.equal(db.tables.users.find(item => item.id === 'cust-1').plan, 'full');
  assert.equal((await granted.json()).users.find(item => item.id === 'cust-1').effectivePlan, 'full');
  const revoked = await through(db, post('/api/admin', { action: 'setPlan', id: 'cust-1', plan: 'trial' }, { cookie: adminCookie }), 'admin');
  assert.equal(revoked.status, 200);
  assert.equal(db.tables.users.find(item => item.id === 'cust-1').plan, 'trial');
  assert.deepEqual(db.tables.admin_audit_log.filter(item => item.action.startsWith('admin.')).map(item => item.action), ['admin.grantFullPlan', 'admin.revokeFullPlan']);
  // 관리자 계정과 없는 이용권은 받지 않는다.
  assert.equal((await through(db, post('/api/admin', { action: 'setPlan', id: 'admin-1', plan: 'trial' }, { cookie: adminCookie }), 'admin')).status, 400);
  assert.equal((await through(db, post('/api/admin', { action: 'setPlan', id: 'cust-1', plan: 'unlimited' }, { cookie: adminCookie }), 'admin')).status, 400);
});

test('이용권을 바꾸면 다시 로그인하지 않아도 곧바로 반영된다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@ms12.test', role: 'admin', plan: 'full' });
  await seedUser(db, { id: 'cust-1', email: 'user@ms12.test', plan: 'trial' });
  const adminCookie = await signIn(db, 'admin@ms12.test');
  const userCookie = await signIn(db, 'user@ms12.test');

  const before = await (await through(db, post('/api/account', { action: 'profile' }, { cookie: userCookie }), 'account')).json();
  assert.equal(before.user.plan, 'trial');
  assert.equal(before.user.contactLabel, CONTACT_LABEL);

  await through(db, post('/api/admin', { action: 'setPlan', id: 'cust-1', plan: 'full' }, { cookie: adminCookie }), 'admin');
  // 세션을 끊지 않았는데도 같은 쿠키로 전체 이용권이 된다.
  assert.equal(db.tables.sessions.filter(item => item.user_id === 'cust-1').length, 1);
  const after = await (await through(db, post('/api/account', { action: 'profile' }, { cookie: userCookie }), 'account')).json();
  assert.equal(after.user.plan, 'full');
});

test('예시 계획서는 로그인 없이 열리고 서버를 부르지 않는다', () => {
  const view = app.slice(app.indexOf('// 로그인 없이 보는 정적 예시'), app.indexOf('// ---------- 3페이지 핵심계획서 무료 생성 ----------'));
  assert.ok(view.length > 500, '예시 화면을 찾지 못했다');
  // 로그인 여부와 상관없이 먼저 걸리는 분기다.
  assert.match(app, /if \(auth\.view === 'example'\) \{ app\.innerHTML = exampleView\(\); bindLanding\(\); return; \}/);
  assert.match(app, /data-landing-example/);
  // 서버를 부르지 않고 저장된 작업도 읽지 않는다.
  assert.doesNotMatch(view, /await |fetch\(|accountProfile|listArchived|trialSketchWithAI|\bstate\./);
  // 개인정보와 실제 기관정보를 담지 않는다.
  assert.doesNotMatch(example, /\d{2,3}-\d{3,4}-\d{4}|@[a-z0-9.-]+\.(com|kr|net|org)|\d{6}-\d{7}/i);
  assert.match(example, /○○기관/);
  assert.match(example, /가상/);
});

test('무료 체험 화면만 열리고 잠긴 기능은 이용권 문의로 표시한다', () => {
  const view = app.slice(app.indexOf('// ---------- 3페이지 핵심계획서 무료 생성 ----------'), app.indexOf('// 로그인과 회원가입을 한 화면에서'));
  assert.match(app, /function trialAccount\(\) \{ return auth\.status === 'signedIn' && auth\.user\?\.status === 'active' && !hasFullAccess\(\); \}/);
  assert.match(app, /if \(trialAccount\(\)\) \{ app\.innerHTML = trialView\(\); bindTrial\(\); return; \}/);
  // 3페이지 핵심계획서의 열한 항목을 보여 준다. 제출용 계획서 본문·예산표는 없다.
  for (const label of ['사업명', '공고 목적', '선정 핵심', '사업 필요성', '대상', '목표', '핵심 활동', '추진 일정', '수행 체계', '성과지표', '기대효과']) {
    assert.ok(view.includes(label), label);
  }
  // 개인 맞춤을 위해 기관·사업 메모를 함께 받는다.
  assert.ok(view.includes('id="trial-note"'), 'trial-note');
  // 잠긴 기능을 숨기지 않고 사유와 함께 보여 준다.
  for (const label of ['전체 계획서 작성', '반복 재작성', '검증·코칭', 'DOCX·PDF·ZIP 출력']) assert.ok(view.includes(label), label);
  // 문구는 상수 하나에서만 나온다. 서버와 화면이 같은 말을 쓴다.
  assert.match(app, /const CONTACT_LABEL = '이용권 문의';/);
  assert.ok(view.includes('${CONTACT_LABEL}'), '잠긴 기능에 이용권 문의 표시가 없다');
  // 결제 화면을 만들지 않는다.
  assert.doesNotMatch(app, /결제하기|카드 등록|payment|checkout/i);
  // 화면 게이트는 서버 차단을 대신하지 않는다.
  assert.match(app, /function hasFullAccess\(\) \{/);
  assert.match(app, /3페이지 무료 체험<\/button>/);
});
