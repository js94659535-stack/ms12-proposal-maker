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
import { PRICING } from '../server/membership.js';

const PRICING_APPLY = PRICING.applyLabel;

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0007_plans.sql', import.meta.url), 'utf8');
const example = fs.readFileSync(new URL('../src/example-plan.js', import.meta.url), 'utf8');
const proposalSource = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'test-only-passphrase-9241';
const ENV = { OPENAI_API_KEY: 'mock-only', OPENAI_MODEL: 'mock-model' };
const ROUTES = { proposal: proposalRoute, coaching: coachingRoute, review: reviewRoute, archive: archiveRoute, admin: adminRoute, operator: operatorRoute, account: accountRoute, auth: authRoute };
const NOTICE = '○○재단 2027년 지역 아동 정서지원 사업 공고. 지원 대상은 지역 아동복지 기관이며, 사업기간은 8개월, 성과지표 제출이 필수입니다. 신청서에는 사업 필요성과 대상 선정 근거를 적어야 합니다.';
// 핵심제안서 첫 단계 입력. 검사에 통과하는 최소 조합이다.
const CORE_INPUT = { proposer: '○○지역아동센터', coreIdea: '초등 고학년 정서지원 집단 프로그램을 주 1회 16회기로 운영하려 합니다.', purpose: '내년도 예산 지원 요청', audienceType: 'public', recipient: '○○시청', targetPages: 3 };
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

// 구독회원. 쪽수를 자유롭게 고르는 시험은 이 계정으로 한다(정식회원은 5쪽 고정이다).
function seedSubscription(db, userId, patch = {}) {
  db.tables.subscriptions.push({
    user_id: userId, status: 'active', started_on: '2026-08-01', ends_on: '', cycle_start: '2026-08-01', renews_on: '2099-09-01',
    core_used: 0, diagnosis_used: 0, note: '', granted_by: 'admin-1',
    created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z', ...patch
  });
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
      // 이제 거절 사유가 등급별로 갈린다. 정식회원에게는 구독 신청을, 그 밖에는 이용권 문의를 알린다.
      assert.ok(body.needsSubscription || body.needsPlan || body.needsPremium, action);
      assert.ok(body.error.includes(CONTACT_LABEL) || body.error.includes(PRICING_APPLY), action);
    }
    // 검증·코칭과 심사 검토도 같은 기준으로 막힌다.
    const coaching = await through(db, post('/api/proposal-coaching', { action: 'startCoaching', proposalText: '가'.repeat(200) }, { cookie }), 'coaching');
    assert.equal(coaching.status, 403);
    const review = await through(db, post('/api/proposal-review', { sections: Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, title: 't', content: 'c' })) }, { cookie }), 'review');
    assert.equal(review.status, 403);
    // 계획서 보관도 전체 이용권 기능이다.
    const saved = await through(db, post('/api/archive', { action: 'saveProposal', proposal: { id: 'p1', title: 't', stage: 's', snapshot: {} } }, { cookie, headers: { 'X-Archive-Key': '12345678-1234-1234-1234-123456789abc' } }), 'archive');
    assert.equal(saved.status, 403);
    // 정식회원의 5쪽 제안서는 읽기 전용이라 저장이 열리지 않는다.
    assert.equal((await saved.json()).needsSubscription, true);
    // 막힌 요청은 OpenAI를 한 번도 부르지 않는다.
    assert.equal(mock.calls.length, 0, '차단된 요청이 비용을 쓰면 안 된다');
  } finally { mock.restore(); }
});

test('핵심제안서는 계정당 한 번만 열리고 두 번째부터 서버가 거절한다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'trial-1', email: 'trial@ms12.test', plan: 'trial' });
  const cookie = await signIn(db, 'trial@ms12.test');
  const mock = mockOpenAI();
  try {
    const first = await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: CORE_INPUT }, { cookie }), 'proposal');
    assert.equal(first.status, 200);
    const body = await first.json();
    assert.equal(body.trialUsed, true);
    // 정식회원은 희망 쪽수와 무관하게 5쪽으로 고정된다.
    assert.equal(body.targetPages, 5);
    assert.equal(body.readOnly, true);
    assert.ok(Array.isArray(body.sections) && body.sections.length >= 4);
    // 사용 여부가 계정 행에 남는다.
    assert.match(db.tables.users.find(item => item.id === 'trial-1').trial_used_at, /^\d{4}-\d{2}-\d{2}T/);

    const second = await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: CORE_INPUT }, { cookie }), 'proposal');
    assert.equal(second.status, 403);
    const refused = await second.json();
    assert.equal(refused.trialUsed, true);
    assert.ok(refused.error.includes(CONTACT_LABEL));
    // 두 번째 요청은 OpenAI를 부르지 않는다.
    assert.equal(mock.calls.length, 1, '핵심제안서는 계정당 한 번만 비용을 쓴다');
  } finally { mock.restore(); }
});

test('핵심제안서 실패는 사용 기록을 남기지 않고 잘못된 입력을 막는다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'trial-1', email: 'trial@ms12.test', plan: 'trial' });
  const cookie = await signIn(db, 'trial@ms12.test');
  const call = payload => through(db, post('/api/proposal', { action: TRIAL_ACTION, payload }, { cookie }), 'proposal');

  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'upstream down' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  try {
    assert.equal((await call(CORE_INPUT)).status, 502);
    // 우리 쪽 실패이므로 기회를 돌려준다.
    assert.equal(db.tables.users.find(item => item.id === 'trial-1').trial_used_at, '');
  } finally { globalThis.fetch = original; }

  // 빈 핵심 아이디어와 잘못된 쪽수를 막는다.
  for (const [label, payload] of [
    ['빈 아이디어', { ...CORE_INPUT, coreIdea: '' }],
    ['너무 짧은 아이디어', { ...CORE_INPUT, coreIdea: '짧음' }],
    ['0쪽', { ...CORE_INPUT, targetPages: 0 }],
    ['21쪽', { ...CORE_INPUT, targetPages: 21 }],
    ['소수 쪽수', { ...CORE_INPUT, targetPages: 2.5 }],
    ['숫자가 아닌 쪽수', { ...CORE_INPUT, targetPages: '세쪽' }],
    ['빈 쪽수', { ...CORE_INPUT, targetPages: '' }],
    ['제출처 없음', { ...CORE_INPUT, audienceType: '' }]
  ]) {
    const response = await call(payload);
    assert.equal(response.status, 400, label);
  }
  assert.equal(db.tables.users.find(item => item.id === 'trial-1').trial_used_at, '', '막힌 요청은 기회를 쓰지 않는다');

  // 출력 상한은 쪽수를 따른다.
  assert.match(proposalSource, /max_output_tokens: body\.action === CORE_PROPOSAL_ACTION \? outputTokensFor\(body\.payload\.plan\.pages\)/);
  assert.match(proposalSource, /required: \['title', 'subtitle', 'summary', 'outline', 'sections', 'tables', 'checkNeeded'\]/);
  // 닿지 않는 옛 분기와 스키마는 남겨 두지 않는다.
  for (const dead of ['trialCorePlanLegacy', 'TRIAL_CORE_PLAN_SCHEMA', 'settleBudget']) {
    assert.ok(!proposalSource.includes(dead), `${dead}가 남아 있다`);
  }
});

test('예산 방향은 근거가 있을 때만 제시하고 없으면 금액을 만들지 않는다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'trial-1', email: 'trial@ms12.test', plan: 'trial' });
  const cookie = await signIn(db, 'trial@ms12.test');
  const mock = mockOpenAI();
  let withBudget = '';
  let withoutBudget = '';
  try {
    // 5쪽이면 예산 방향 항목이 구성에 들어간다.
    seedSubscription(db, 'trial-1');
    await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: { ...CORE_INPUT, targetPages: 5 } }, { cookie }), 'proposal');
    withBudget = JSON.parse(mock.calls[0].options.body).input[1].content[0].text;
  } finally { mock.restore(); }

  const short = fakeDb();
  await seedUser(short, { id: 'trial-2', email: 'trial2@ms12.test', plan: 'trial' });
  const shortCookie = await signIn(short, 'trial2@ms12.test');
  seedSubscription(short, 'trial-2');
  const shortMock = mockOpenAI();
  try {
    // 1쪽이면 예산 방향이 구성에 없으므로 예산 규칙도 붙지 않는다.
    await through(short, post('/api/proposal', { action: TRIAL_ACTION, payload: { ...CORE_INPUT, targetPages: 1 } }, { cookie: shortCookie }), 'proposal');
    withoutBudget = JSON.parse(shortMock.calls[0].options.body).input[1].content[0].text;
  } finally { shortMock.restore(); }

  // 근거가 있으면 그 범위 안에서 항목별 방향만, 없으면 정해진 문구로 남긴다.
  assert.match(withBudget, /「예산 방향」 항목은 방향만 적는다/);
  assert.match(withBudget, /인건비·프로그램비·재료비·홍보비/);
  assert.match(withBudget, /\[확인 필요: 공고문 또는 기관 확인 필요\]/);
  assert.match(withBudget, /추정 금액을 근거처럼 적지 않는다/);
  // 상세 산출내역과 제출용 예산표는 이 기능에서 만들지 않는다.
  assert.match(withBudget, /상세 산출내역\(단가 × 수량 × 개월수\)과 제출용 예산표는 만들지 않는다/);
  assert.doesNotMatch(withoutBudget, /「예산 방향」 항목은 방향만 적는다/, '예산 항목이 없는 분량에는 규칙을 붙이지 않는다');
});

test('제출처 유형에 따라 제안서 구조와 강조점이 달라진다', async () => {
  const structureOf = async audienceType => {
    const db = fakeDb();
    await seedUser(db, { id: 'trial-1', email: 'trial@ms12.test', plan: 'trial' });
    const cookie = await signIn(db, 'trial@ms12.test');
    const mock = mockOpenAI();
    try {
      const response = await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: { ...CORE_INPUT, targetPages: 5, audienceType } }, { cookie }), 'proposal');
      assert.equal(response.status, 200);
      const body = await response.json();
      const prompt = JSON.parse(mock.calls[0].options.body).input[1].content[0].text;
      return { titles: body.sections.map(section => section.title), prompt, audience: body.audience };
    } finally { mock.restore(); }
  };

  const publicOffice = await structureOf('public');
  const company = await structureOf('company');
  const foundation = await structureOf('foundation');

  // 같은 아이디어·같은 쪽수인데 항목 구성이 서로 다르다.
  assert.notDeepEqual(publicOffice.titles, company.titles);
  assert.notDeepEqual(company.titles, foundation.titles);
  assert.notDeepEqual(publicOffice.titles, foundation.titles);

  // 제출처가 앞세우는 것이 실제로 항목 이름에 나타난다.
  assert.ok(publicOffice.titles.includes('공익성과 정책 연계 효과'), '관공서는 공익성·정책 연계');
  assert.ok(publicOffice.titles.includes('실행체계와 역할 분담'));
  assert.ok(company.titles.includes('기대효과와 차별성'), '기업은 차별성');
  assert.ok(company.titles.includes('비용 대비 가치'));
  assert.ok(foundation.titles.includes('대상자의 필요와 배경'), '재단은 대상자의 필요');
  assert.ok(foundation.titles.includes('지속가능성과 위험 대응'));

  // 강조점이 프롬프트에도 실려 간다.
  assert.match(publicOffice.prompt, /공익성 · 정책 연계 · 실행체계 · 예산 · 성과/);
  assert.match(company.prompt, /기대효과 · 차별성 · 비용 대비 가치 · 협력방식/);
  assert.match(foundation.prompt, /대상자의 필요 · 사회적 가치 · 성과 · 지속가능성/);
  assert.equal(publicOffice.audience, '관공서·공공기관');
  assert.equal(company.audience, '기업');
});

test('희망 쪽수에 따라 항목 수와 분량이 달라지고 같은 말로 채우지 않는다', async () => {
  const shapeOf = async pages => {
    const db = fakeDb();
    await seedUser(db, { id: 'sub-1', email: 'sub@ms12.test', plan: 'trial' });
    seedSubscription(db, 'sub-1');
    const cookie = await signIn(db, 'sub@ms12.test');
    const mock = mockOpenAI();
    try {
      const response = await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: { ...CORE_INPUT, targetPages: pages } }, { cookie }), 'proposal');
      const body = await response.json();
      const prompt = JSON.parse(mock.calls[0].options.body).input[1].content[0].text;
      const tokens = JSON.parse(mock.calls[0].options.body).max_output_tokens;
      return { body, prompt, tokens };
    } finally { mock.restore(); }
  };

  const three = await shapeOf(3);
  const five = await shapeOf(5);
  const seven = await shapeOf(7);

  // 쪽이 늘면 항목이 늘어난다.
  assert.equal(three.body.sections.length, 7);
  assert.equal(five.body.sections.length, 9);
  assert.equal(seven.body.sections.length, 11);
  assert.ok(three.body.sections.length < five.body.sections.length);
  assert.ok(five.body.sections.length < seven.body.sections.length);

  // 쪽이 늘면 항목별 계획 분량 합계도 늘고 출력 상한도 늘어난다.
  const planned = shape => shape.body.sections.reduce((sum, section) => sum + section.plannedChars, 0);
  assert.ok(planned(three) < planned(five) && planned(five) < planned(seven));
  assert.ok(three.tokens < five.tokens && five.tokens < seven.tokens);

  // 쪽 번호가 1쪽부터 목표 쪽까지 이어진다.
  assert.equal(Math.max(...seven.body.sections.map(section => section.page)), 7);
  assert.equal(Math.min(...three.body.sections.map(section => section.page)), 1);

  // 짧으면 의사결정에 먼저 필요한 항목부터 남고, 길면 뒤 항목까지 펼친다.
  const titles = shape => shape.body.sections.map(section => section.title);
  assert.ok(titles(three).includes('제안 개요') && titles(three).includes('핵심 제안 내용'));
  assert.ok(!titles(three).includes('위험과 대응'), '3쪽에는 뒤쪽 항목까지 넣지 않는다');
  assert.ok(titles(seven).includes('위험과 대응'), '7쪽에서는 위험 대응까지 펼친다');

  // 분량을 늘리려고 같은 말을 반복하지 말라고 프롬프트가 못 박는다.
  assert.match(three.prompt, /같은 말을 다시 쓰거나, 한 문장을 늘려 쓰거나, 앞 항목 내용을 옮겨 적지 않는다/);
  assert.match(three.prompt, /쓸 내용이 모자라면 짧게 끝내고/);
  // 표는 분량이 있을 때만 넣는다.
  assert.match(three.prompt, /tables에는 표로 보여야 이해가 빠른 내용만 2개까지/);
  assert.match(five.prompt, /tables에는 표로 보여야 이해가 빠른 내용만 3개까지/);
});

test('구성안을 먼저 만들고 그 구성대로 본문을 쓴다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'trial-1', email: 'trial@ms12.test', plan: 'trial' });
  seedSubscription(db, 'trial-1');
  const cookie = await signIn(db, 'trial@ms12.test');
  // 모델이 항목을 빠뜨리고 쪽 번호를 흔들어도 구성안이 결과를 잡아 준다.
  const mock = mockOpenAI({ title: '제안', summary: '요약', outline: [{ page: 1, title: '1쪽', focus: '판단' }], sections: [{ id: 'idea', title: '멋대로 바꾼 제목', page: 99, content: '내용' }], tables: [], checkNeeded: [] });
  try {
    const body = await (await through(db, post('/api/proposal', { action: TRIAL_ACTION, payload: { ...CORE_INPUT, targetPages: 3 } }, { cookie }), 'proposal')).json();
    // 구성안이 정한 항목이 모두 있고 순서도 그대로다.
    assert.equal(body.sections.length, 7);
    assert.equal(body.sections[0].id, 'overview');
    // 쪽 번호는 구성안 값을 쓴다. 모델이 보낸 99쪽은 무시한다.
    assert.ok(body.sections.every(section => section.page >= 1 && section.page <= 3));
    // 모델이 채우지 못한 항목은 지어내지 않고 확인 필요로 남는다.
    assert.ok(body.sections.some(section => section.content.includes('[확인 필요]')));
    // 프롬프트가 구성안을 먼저 적게 하고, 스키마도 outline이 sections보다 앞에 있다.
    const prompt = JSON.parse(mock.calls[0].options.body).input[1].content[0].text;
    assert.match(prompt, /먼저 outline에 페이지별 구성안을 적는다/);
    assert.ok(proposalSource.indexOf("outline: { type: 'array'") < proposalSource.indexOf("sections: { type: 'array'"));
  } finally { mock.restore(); }
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
  const view = app.slice(app.indexOf('// 로그인 없이 보는 정적 예시'), app.indexOf('// ---------- MS12 핵심제안서 ----------'));
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

test('핵심제안서 화면만 열리고 잠긴 기능은 이용권 문의로 표시한다', () => {
  const view = app.slice(app.indexOf('// ---------- MS12 핵심제안서 ----------'), app.indexOf('// 로그인과 회원가입을 한 화면에서'));
  assert.match(app, /function trialAccount\(\) \{ return auth\.status === 'signedIn' && auth\.user\?\.status === 'active' && !hasFullAccess\(\); \}/);
  assert.match(app, /if \(trialAccount\(\)\) \{ app\.innerHTML = coreProposalView\(\); bindCoreProposal\(\); return; \}/);
  // 받는 것은 넷이다. 제안 목적은 제출처 유형과 아이디어에서 드러나므로 없앴다.
  for (const id of ['core-idea', 'core-audience', 'core-recipient', 'core-pages']) {
    assert.ok(view.includes(`id="${id}"`), id);
  }
  assert.ok(!view.includes('id="core-purpose"'), '제안 목적은 묻지 않는다');
  // 제안자·기관 정보는 「내 정보」에서 가져온다. 여기서 다시 적지 않는다.
  for (const label of ['제안자·기관 기본정보', '핵심 아이디어', '제출처 유형', '실제 제출기관명', '희망 페이지 수']) {
    assert.ok(view.includes(label), label);
  }
  assert.ok(view.includes('id="core-open-profile"'), '기관정보를 적으러 가는 자리가 있다');
  // 제출처 여섯 갈래를 모두 고를 수 있다.
  for (const label of ['관공서·공공기관', '기업', '재단·복지기관', '학교·교육기관', '내부보고', '기타']) assert.ok(view.includes(label), label);
  // 3페이지에 묶인 이름과 고정 분량이 화면에서 사라졌다.
  assert.doesNotMatch(view, /3페이지 핵심계획서|세 쪽/);
  assert.ok(view.includes('MS12 핵심제안서'));
  // 잠긴 기능을 숨기지 않고 사유와 함께 보여 준다. 전체 계획서와는 구분해서 적는다.
  for (const label of ['공모사업 전체 계획서', '반복 재작성', '검증·코칭', '상세 산출내역·제출용 예산표']) assert.ok(view.includes(label), label);
  // 문구는 상수 하나에서만 나온다. 서버와 화면이 같은 말을 쓴다.
  assert.match(app, /const CONTACT_LABEL = '이용권 문의';/);
  assert.ok(view.includes('${CONTACT_LABEL}'), '잠긴 기능에 이용권 문의 표시가 없다');
  // 결제 화면을 만들지 않는다.
  assert.doesNotMatch(app, /결제하기|카드 등록|payment|checkout/i);
  // 화면 게이트는 서버 차단을 대신하지 않는다.
  assert.match(app, /function hasFullAccess\(\) \{/);
  assert.match(app, /3페이지 무료 체험<\/button>/);
});

test('미리보기와 내려받기가 같은 쪽 나눔을 쓰고 글자 크기를 줄이지 않는다', () => {
  const view = app.slice(app.indexOf('// ---------- MS12 핵심제안서 ----------'), app.indexOf('// 로그인과 회원가입을 한 화면에서'));
  const exportSource = fs.readFileSync(new URL('../src/export.js', import.meta.url), 'utf8');
  const pdfSource = fs.readFileSync(new URL('../src/pdf-export.js', import.meta.url), 'utf8');
  // 화면과 출력이 같은 함수로 쪽을 나눈다.
  assert.match(view, /function corePagesOf\(result\)/);
  assert.match(view, /function corePageBreaks\(result\)/);
  assert.match(view, /pageBreaks: corePageBreaks\(result\)/);
  assert.ok(view.includes('id="core-docx"') && view.includes('id="core-pdf"'));
  // 두 출력기가 쪽 나눔을 받는다.
  assert.match(exportSource, /pageBreakBefore: pageBreaks\.includes\(index\)/);
  assert.match(pdfSource, /if \(pageBreaks\.includes\(index\) && y > PAGE\.top\) newPage\(\);/);
  // 쪽수를 맞추려고 글자 크기·여백을 줄이지 않는다. 기존 값이 그대로다.
  assert.match(pdfSource, /export const PAGE = \{ width: 210, height: 297, top: 16, right: 15, bottom: 18, left: 15 \}/);
});

test('핵심제안서는 두 가지만 묻는다 — 어디에 내는지, 내 여건과 하려는 일', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const at = app.indexOf('function coreProposalView');
  const view = app.slice(at, app.indexOf('\n}\n', at));
  // 전체 계획서용 13개 질문 판은 이 화면에 없다.
  assert.ok(!view.includes('intakePanel'), '작성정보 13문항은 핵심제안서에 넣지 않는다');
  // 두 묶음으로만 묻는다.
  assert.match(view, /1\. 어디에 제안하나요/);
  assert.match(view, /2\. 내 여건과 하려는 일/);
  // 나머지는 접어 둔다. 필수는 아이디어 하나뿐이다.
  assert.match(view, /<details><summary>더 적을 것이 있으면 \(선택\)<\/summary>/);
  const order = [...view.matchAll(/<label for="(core-[a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(order.slice(0, 3), ['core-audience', 'core-recipient', 'core-idea']);
});

test('핵심 아이디어는 장문으로 적고, 아래 단답 칸에서 고르거나 적는다', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  const { CONDITION_FIELDS, validateCoreProposalInput } = await import('../server/core-proposal.js');
  // 대상·인원·기간·횟수·방식 다섯을 고르거나 직접 적는다.
  assert.deepEqual(CONDITION_FIELDS.map(item => item.key), ['target', 'people', 'period', 'times', 'method']);
  for (const item of CONDITION_FIELDS) { assert.ok(item.options.length >= 5, item.key); assert.ok(item.hint, item.key + ' 설명'); }
  // 「예상 인원」은 우리 인력으로 읽힌다. 참여할 사람 수라고 분명히 적는다.
  assert.equal(CONDITION_FIELDS.find(item => item.key === 'people').label, '참여 대상 인원');
  assert.match(CONDITION_FIELDS.find(item => item.key === 'people').hint, /우리 기관 인력이 아닙니다/);
  // 서버에도 키가 아니라 사람이 읽는 이름으로 넘긴다.
  assert.match(api, /function labelConditions\(conditions = \{\}\)/);
  // 화면은 고르기와 직접 적기를 한 칸에서 함께 받는다.
  assert.match(app, /list="cond-list-\$\{item\.key\}"/);
  assert.match(app, /data-core-condition="\$\{item\.key\}"/);
  assert.match(app, /고르지 않아도 됩니다\. 비운 칸은 지어내지 않고 \[확인 필요\]로 남습니다\./);
  // 비운 칸은 아예 넘기지 않는다.
  const checked = validateCoreProposalInput({ coreIdea: '초등 4~6학년 정서지원 집단 프로그램을 주 1회 16회기로 운영합니다.', targetPages: 5, audienceType: 'public', conditions: { target: '초등학생', people: '' } });
  assert.deepEqual(checked.value.conditions, { target: '초등학생' });
  // 서버는 적힌 값만 쓰고 없는 값은 지어내지 않는다.
  assert.match(api, /<CONDITIONS>\$\{JSON\.stringify\(labelConditions\(input\.conditions\)\)\}<\/CONDITIONS>/);
  assert.match(api, /CONDITIONS는 제안자가 골라 적은 단답 조건/);
});

test('단답 보기는 제출처와 적은 내용에 따라 바뀐다', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const { CONDITION_FIELDS, conditionFieldsFor } = await import('../server/core-proposal.js');
  const options = (fields, key) => fields.find(item => item.key === key).options;
  // 학교에 내는데 「소상공인」이 먼저 보이면 고를 것이 없다.
  const school = conditionFieldsFor({ audienceType: 'school', text: '초등 4~6학년 정서지원 집단 프로그램' });
  assert.equal(options(school, 'target')[0], '초등학생');
  assert.equal(options(school, 'method')[0], '집단 프로그램');
  // 적은 낱말이 보기를 앞으로 끌어올린다.
  const senior = conditionFieldsFor({ audienceType: 'foundation', text: '홀몸 어르신 반찬 배달' });
  assert.equal(options(senior, 'target')[0], '어르신');
  assert.ok(options(senior, 'method').includes('물품·급식 지원'));
  // 기본 보기는 사라지지 않고 뒤에 남는다. 고를 것이 줄어들면 안 된다.
  for (const field of CONDITION_FIELDS) {
    const now = conditionFieldsFor({ audienceType: 'school', text: '어르신' }).find(item => item.key === field.key);
    for (const option of field.options) assert.ok(now.options.includes(option), field.key + ' ' + option);
    assert.equal(new Set(now.options).size, now.options.length, field.key + ' 보기가 겹치지 않는다');
  }
  // 아무것도 고르지 않았을 때도 그대로 쓸 수 있다.
  assert.deepEqual(conditionFieldsFor().map(item => item.key), CONDITION_FIELDS.map(item => item.key));
  // 화면은 적는 동안 목록만 갈아 끼운다. 다시 그리면 글자를 치던 자리를 잃는다.
  assert.match(app, /conditionFieldsFor\(\{ audienceType: draft\.audienceType, text: `\$\{draft\.coreIdea\} \$\{draft\.recipient\}` \}\)/);
  assert.match(app, /const refreshConditionOptions = \(\) => \{/);
  assert.match(app, /#core-idea'\)\?\.addEventListener\('input', refreshConditionOptions\)/);
});
