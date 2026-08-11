// 회원체계. 승인 상태·내부역할·월간 구독·프리미엄 계약은 서로 별개다.
// 화면에서 숨기는 것이 아니라 서버가 막는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as proposalRoute } from '../functions/api/proposal.js';
import { onRequest as archiveRoute } from '../functions/api/archive.js';
import { onRequest as adminRoute } from '../functions/api/admin.js';
import { onRequest as operatorRoute } from '../functions/api/operator.js';
import { onRequest as accountRoute } from '../functions/api/account.js';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as publicRoute } from '../functions/api/public.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';
import { BLOCKED_ACTIONS } from '../server/operator-scope.js';
import {
  APPROVAL, MEMBER_FREE_PAGES, PRICING, QUOTAS, TIER_LABELS, approvalOf, corePagesFor, membershipOf, membershipPlans, membershipRefusal
} from '../server/membership.js';
import { addMonth, loadSubscription, remaining } from '../server/subscription.js';
import { fakeDb } from './fixtures/fake-d1.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0011_subscriptions.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'test-only-passphrase-9241';
const ENV = { OPENAI_API_KEY: 'mock-only', OPENAI_MODEL: 'mock-model' };
const ROUTES = { proposal: proposalRoute, archive: archiveRoute, admin: adminRoute, operator: operatorRoute, account: accountRoute, auth: authRoute, public: publicRoute };
const CORE_INPUT = {
  proposer: '○○지역아동센터', coreIdea: '초등 고학년 정서지원 집단 프로그램을 주 1회 16회기로 운영하려 합니다.',
  purpose: '내년도 예산 지원 요청', audienceType: 'public', recipient: '○○시청', targetPages: 12
};
const DIAGNOSIS_INPUT = {
  noticeTitle: '2027년 아동 정서지원 공모',
  noticeText: '지원 대상은 광주 소재 아동복지 기관이며 사업기간은 8개월입니다. 성과지표 제출이 필수이고 자부담 10%가 필요합니다. 평가는 필요성 30점, 실행력 40점, 성과관리 30점입니다.',
  organizationText: '지역아동센터로 10년간 운영했고 사회복지사 3명이 있습니다. 정서지원 프로그램 경험이 있습니다.'
};
const DIAGNOSIS_RESULT = {
  fitScore: 72, fitSummary: '요구 대부분을 충족하나 자부담 확인이 필요합니다.',
  requirements: [{ requirement: '광주 소재 아동복지 기관', status: '충족', evidence: '지역아동센터 10년 운영' }],
  strengths: [{ point: '정서지원 프로그램 경험', linkedRequirement: '실행력' }],
  risks: [{ risk: '자부담 10% 확보 미확인', severity: '높음', mitigation: '이사회 확인 필요' }],
  missingEvidence: [{ item: '자부담 확약서', why: '공고가 자부담 10%를 요구' }],
  questions: ['자부담 재원을 확보할 수 있습니까?'],
  judgement: '조건부 지원', judgementReason: '자부담이 확인되면 지원할 만합니다.'
};

function post(path, body, { cookie = '', headers = {} } = {}) {
  const base = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9', ...headers };
  if (cookie) base.Cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers: base, body: JSON.stringify(body) });
}
const cookieOf = response => `${SESSION_COOKIE}=${/__Host-ms12_session=([a-f0-9]{64})/.exec(response.headers.get('set-cookie') || '')?.[1] || ''}`;

async function through(db, request, route) {
  const data = {};
  const env = { ARCHIVE_DB: db, ...ENV };
  const blocked = await middleware({ request, env, data, next: async () => null });
  if (blocked) return blocked;
  return ROUTES[route]({ request, env, data });
}

async function seedUser(db, { id, email, role = 'customer', status = 'active', plan = 'trial', trialUsedAt = '' }) {
  db.tables.users.push({
    id, email, role, status, org_id: '', name: '담당자', ...(await createPasswordRecord(PASSWORD)),
    plan, trial_used_at: trialUsedAt, phone: '', org_name: '기관', is_contact: 0,
    terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: '',
    profile_updated_at: '', profile_review_needed: 0,
    created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z'
  });
}
const signIn = async (db, email) => cookieOf(await through(db, post('/api/auth', { action: 'login', email, password: PASSWORD }), 'auth'));

function seedSubscription(db, userId, patch = {}) {
  db.tables.subscriptions.push({
    user_id: userId, status: 'active', started_on: '2026-08-01', ends_on: '', cycle_start: '2026-08-01', renews_on: '2099-09-01',
    core_used: 0, diagnosis_used: 0, note: '', granted_by: 'admin-1',
    created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z', ...patch
  });
}
function seedContract(db, userId, patch = {}) {
  db.tables.premium_contracts.push({
    user_id: userId, status: 'active', started_on: '2026-01-01', ends_on: '2027-12-31', progress: '접수',
    progress_note: '', contract_name: '수주 계약', granted_by: 'admin-1',
    created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z', ...patch
  });
}

function mockOpenAI(result) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ output_text: JSON.stringify(result), status: 'completed' }), { headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
const CORE_RESULT = {
  title: '제안', summary: '요약',
  outline: Array.from({ length: 12 }, (_, index) => ({ page: index + 1, title: `${index + 1}쪽`, focus: '판단' })),
  sections: Array.from({ length: 12 }, (_, index) => ({ id: `s${index}`, title: `항목 ${index}`, page: index + 1, content: '내용' }))
};

// ---------- 네 가지가 서로 별개인지 ----------

test('승인 상태·역할·구독·프리미엄 계약은 서로 다른 값으로 판정한다', () => {
  assert.equal(approvalOf('disabled'), APPROVAL.suspended, 'DB의 disabled는 이용 중지로 읽는다');
  assert.equal(approvalOf('pending'), APPROVAL.pending);
  assert.equal(approvalOf('active'), APPROVAL.active);

  const pending = membershipOf({ user: { role: 'customer', status: 'pending' } });
  assert.equal(pending.tier, 'pending');
  assert.equal(pending.locked, true);

  const member = membershipOf({ user: { role: 'customer', status: 'active', plan: 'trial' } });
  assert.equal(member.tier, 'member');
  assert.equal(member.label, TIER_LABELS.member);
  assert.equal(member.canEdit, false);

  const subscriber = membershipOf({ user: { role: 'customer', status: 'active', plan: 'trial' }, subscription: { status: 'active' } });
  assert.equal(subscriber.tier, 'subscriber');
  assert.equal(subscriber.canDiagnosis, true);
  assert.equal(subscriber.canExpertWork, false, '구독만으로는 계약 전문 작업이 열리지 않는다');

  // 프리미엄은 계약으로만 판정한다. plan = full 하나로 정하지 않는다.
  const legacy = membershipOf({ user: { role: 'customer', status: 'active', plan: 'full' } });
  assert.equal(legacy.tier, 'legacy');
  assert.equal(legacy.premium, false);
  assert.equal(legacy.canExpertWork, true, '기존 전체 이용권 회원 권한은 그대로 지킨다');

  const premium = membershipOf({ user: { role: 'customer', status: 'active', plan: 'trial' }, contract: { canStartWork: true } });
  assert.equal(premium.tier, 'premium');
  assert.equal(premium.canExpertWork, true);
  const ended = membershipOf({ user: { role: 'customer', status: 'active', plan: 'trial' }, contract: { canStartWork: false } });
  assert.equal(ended.tier, 'premium');
  assert.equal(ended.canExpertWork, false, '계약이 끝나면 새 전문 작업은 막는다');
});

test('마이그레이션은 더하기만 하고 기존 자료를 지우지 않는다', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS subscriptions/);
  assert.doesNotMatch(migration, /DROP |DELETE FROM |TRUNCATE|UPDATE users SET plan/);
  // 기존 full 회원을 구독회원으로 바꾸지 않는다.
  assert.doesNotMatch(migration, /INSERT INTO subscriptions/);
});

// ---------- 1. 승인 대기 회원 ----------

test('승인 대기 회원은 잠금 안내만 보고 AI를 부르지 않는다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'p-1', email: 'pending@ms12.test', status: 'pending' });
  const cookie = await signIn(db, 'pending@ms12.test');
  const mock = mockOpenAI(CORE_RESULT);
  try {
    // 미들웨어가 작업 경로를 먼저 막는다.
    for (const [path, route] of [['/api/proposal', 'proposal'], ['/api/archive', 'archive']]) {
      const response = await through(db, post(path, { action: 'coreProposal', payload: CORE_INPUT }, { cookie }), route);
      assert.equal(response.status, 403, path);
    }
    assert.equal(mock.calls.length, 0, '승인 전에는 OpenAI를 부르지 않는다');
  } finally { mock.restore(); }

  // 잠금 화면은 이름만 보여 주고 서버를 부르지 않는다.
  assert.match(app, /data-locked-feature/);
  assert.match(app, /누르셔도 자료를 불러오거나 AI를 부르지 않습니다/);
  const bind = app.slice(app.indexOf('function bindMembership()'), app.indexOf('function bindMembership()') + 900);
  assert.doesNotMatch(bind, /fetch\(|WithAI\(|premium\w+\(/);

  // 본인·기관정보는 지금도 고칠 수 있다.
  const saved = await through(db, post('/api/account', { action: 'saveProfile', name: '대기 담당', orgName: '대기 기관' }, { cookie }), 'account');
  assert.equal(saved.status, 200);
});

// ---------- 2. 정식회원 ----------

test('정식회원은 5쪽 1회 읽기 전용이고 저장·재작성이 막힌다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'm-1', email: 'member@ms12.test' });
  const cookie = await signIn(db, 'member@ms12.test');
  const mock = mockOpenAI(CORE_RESULT);
  try {
    // 12쪽을 넣어도 5쪽으로 고정된다.
    const first = await through(db, post('/api/proposal', { action: 'coreProposal', payload: CORE_INPUT }, { cookie }), 'proposal');
    assert.equal(first.status, 200);
    const body = await first.json();
    assert.equal(body.targetPages, MEMBER_FREE_PAGES);
    assert.equal(body.readOnly, true);
    assert.equal(body.tier, 'member');

    // 두 번째는 서버가 막고 OpenAI를 부르지 않는다.
    const before = mock.calls.length;
    const second = await through(db, post('/api/proposal', { action: 'coreProposal', payload: CORE_INPUT }, { cookie }), 'proposal');
    assert.equal(second.status, 403);
    assert.equal(mock.calls.length, before);

    // 편집·재작성·검증은 막힌다.
    for (const action of ['rewrite', 'patchSections', 'finalize', 'fullProposal']) {
      const response = await through(db, post('/api/proposal', { action, payload: { sourceText: 'x'.repeat(60), organization: {} } }, { cookie }), 'proposal');
      assert.equal(response.status, 403, action);
    }
  } finally { mock.restore(); }

  // 저장도 막힌다.
  const saved = await through(db, post('/api/archive', { action: 'saveProposal', proposal: { id: 'p1', title: 't', stage: 's', snapshot: {} } },
    { cookie, headers: { 'X-Archive-Key': '12345678-1234-1234-1234-123456789abc' } }), 'archive');
  assert.equal(saved.status, 403);
  assert.equal((await saved.json()).needsSubscription, true);
  // 화면에서도 무료회원이라 부르지 않는다.
  assert.doesNotMatch(app, /무료회원/);
});

test('정식회원 생성이 실패하면 한 번의 기회를 돌려준다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'm-2', email: 'fail@ms12.test' });
  const cookie = await signIn(db, 'fail@ms12.test');
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: '일시 오류' } }), { status: 500 });
  try {
    const response = await through(db, post('/api/proposal', { action: 'coreProposal', payload: CORE_INPUT }, { cookie }), 'proposal');
    assert.ok(response.status >= 400);
  } finally { globalThis.fetch = original; }
  assert.equal(db.tables.users.find(item => item.id === 'm-2').trial_used_at, '', '실패하면 기회를 돌려준다');
});

// ---------- 3. 구독회원 ----------

test('구독회원은 핵심제안서 3편·진단서 5편을 따로 쓴다', async () => {
  assert.equal(QUOTAS.subscriber.coreProposal, 3);
  assert.equal(QUOTAS.subscriber.diagnosis, 5);
  assert.equal(QUOTAS.subscriber.maxPages, 20);
  assert.equal(PRICING.monthly, 6000);

  const db = fakeDb();
  await seedUser(db, { id: 's-1', email: 'sub@ms12.test' });
  seedSubscription(db, 's-1');
  const cookie = await signIn(db, 'sub@ms12.test');
  const mock = mockOpenAI(CORE_RESULT);
  try {
    for (let index = 0; index < 3; index += 1) {
      const response = await through(db, post('/api/proposal', { action: 'coreProposal', payload: CORE_INPUT }, { cookie }), 'proposal');
      assert.equal(response.status, 200, `${index + 1}편째`);
      const body = await response.json();
      assert.equal(body.targetPages, 12, '구독회원은 희망 쪽수를 그대로 쓴다');
      assert.equal(body.remaining.coreProposal, 2 - index);
    }
    // 네 번째는 OpenAI를 부르기 전에 막힌다.
    const before = mock.calls.length;
    const fourth = await through(db, post('/api/proposal', { action: 'coreProposal', payload: CORE_INPUT }, { cookie }), 'proposal');
    assert.equal(fourth.status, 403);
    const refused = await fourth.json();
    assert.equal(refused.quotaSpent, true);
    assert.equal(refused.kind, 'coreProposal');
    assert.equal(mock.calls.length, before, '막힌 요청은 비용을 쓰지 않는다');
    // 진단서 편수는 따로 남아 있다.
    assert.equal(db.tables.subscriptions[0].diagnosis_used, 0);
  } finally { mock.restore(); }
});

test('진단서는 5편까지이고 여섯 번째는 부르기 전에 막힌다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 's-2', email: 'diag@ms12.test' });
  seedSubscription(db, 's-2');
  const cookie = await signIn(db, 'diag@ms12.test');
  const mock = mockOpenAI(DIAGNOSIS_RESULT);
  try {
    const first = await through(db, post('/api/proposal', { action: 'diagnosis', payload: DIAGNOSIS_INPUT }, { cookie }), 'proposal');
    assert.equal(first.status, 200);
    const body = await first.json();
    // 요구한 일곱 가지가 모두 들어 있다.
    for (const key of ['fitScore', 'requirements', 'strengths', 'risks', 'missingEvidence', 'questions', 'judgement']) {
      assert.ok(key in body.diagnosis, key);
    }
    assert.equal(body.remaining.diagnosis, 4);

    for (let index = 0; index < 4; index += 1) {
      const response = await through(db, post('/api/proposal', { action: 'diagnosis', payload: DIAGNOSIS_INPUT }, { cookie }), 'proposal');
      assert.equal(response.status, 200, `${index + 2}편째`);
    }
    const before = mock.calls.length;
    const sixth = await through(db, post('/api/proposal', { action: 'diagnosis', payload: DIAGNOSIS_INPUT }, { cookie }), 'proposal');
    assert.equal(sixth.status, 403);
    assert.equal((await sixth.json()).kind, 'diagnosis');
    assert.equal(mock.calls.length, before);
    // 핵심제안서 편수는 그대로다.
    assert.equal(db.tables.subscriptions[0].core_used, 0);
  } finally { mock.restore(); }
});

test('구독 생성이 실패하면 편수를 돌려준다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 's-3', email: 'refund@ms12.test' });
  seedSubscription(db, 's-3');
  const cookie = await signIn(db, 'refund@ms12.test');
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: '일시 오류' } }), { status: 500 });
  try {
    const response = await through(db, post('/api/proposal', { action: 'diagnosis', payload: DIAGNOSIS_INPUT }, { cookie }), 'proposal');
    assert.ok(response.status >= 400);
  } finally { globalThis.fetch = original; }
  assert.equal(db.tables.subscriptions[0].diagnosis_used, 0, '실패한 진단서는 세지 않는다');
});

test('구독 주기가 지나면 이용량이 새로 열린다', async () => {
  assert.equal(addMonth('2026-01-31'), '2026-02-28');
  assert.equal(addMonth('2026-08-12'), '2026-09-12');
  const db = fakeDb();
  await seedUser(db, { id: 's-4', email: 'cycle@ms12.test' });
  seedSubscription(db, 's-4', { cycle_start: '2020-01-01', renews_on: '2020-02-01', core_used: 3, diagnosis_used: 5 });
  const after = await loadSubscription(db, 's-4');
  assert.equal(after.coreUsed, 0);
  assert.equal(after.diagnosisUsed, 0);
  assert.equal(remaining(after, 'coreProposal'), 3);
  assert.ok(after.renewsOn > '2026-08-12');
});

// ---------- 4·5. 프리미엄 연결과 구독 관리 ----------

test('구독회원에게 계약 전문 작업이 열리지 않고 프리미엄은 계약으로 판정한다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 's-5', email: 'subonly@ms12.test' });
  seedSubscription(db, 's-5');
  await seedUser(db, { id: 'pm-1', email: 'premium@ms12.test' });
  seedSubscription(db, 'pm-1');
  seedContract(db, 'pm-1');
  const mock = mockOpenAI({ analysis: { mode: 'ai' } });
  try {
    const subscriber = await signIn(db, 'subonly@ms12.test');
    const refused = await through(db, post('/api/proposal', { action: 'analyze', payload: { sourceText: 'x'.repeat(60), organization: {} } }, { cookie: subscriber }), 'proposal');
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).needsPremium, true);

    const premium = await signIn(db, 'premium@ms12.test');
    const allowed = await through(db, post('/api/proposal', { action: 'analyze', payload: { sourceText: 'x'.repeat(60), organization: {} } }, { cookie: premium }), 'proposal');
    assert.equal(allowed.status, 200);
  } finally { mock.restore(); }
});

test('구독은 관리자만 넣고 끄며 운영관리자는 조회만 한다', async () => {
  for (const action of ['setSubscription', 'grantSubscription', 'revokeSubscription']) assert.ok(BLOCKED_ACTIONS.has(action), action);

  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@ms12.test', role: 'admin' });
  await seedUser(db, { id: 'oper-1', email: 'oper@ms12.test', role: 'operator' });
  await seedUser(db, { id: 'u-1', email: 'user@ms12.test' });

  const operator = await signIn(db, 'oper@ms12.test');
  const refused = await through(db, post('/api/operator', { action: 'setSubscription', id: 'u-1', subscription: { status: 'active' } }, { cookie: operator }), 'operator');
  assert.equal(refused.status, 403);
  assert.equal(db.tables.subscriptions.length, 0);

  const admin = await signIn(db, 'admin@ms12.test');
  const granted = await through(db, post('/api/admin', { action: 'setSubscription', id: 'u-1', subscription: { status: 'active', startedOn: '2026-08-01' } }, { cookie: admin }), 'admin');
  assert.equal(granted.status, 200);
  assert.equal(db.tables.subscriptions[0].status, 'active');
  assert.equal(db.tables.subscriptions[0].renews_on, '2026-09-01');
  assert.ok(db.tables.admin_audit_log.some(row => row.action === 'admin.grantSubscription'));

  // 운영관리자는 목록에서 구독과 남은 편수를 읽을 수 있다.
  const overview = await (await through(db, post('/api/operator', { action: 'overview' }, { cookie: operator }), 'operator')).json();
  const seen = overview.users.find(item => item.id === 'u-1');
  assert.equal(seen.subscription.status, 'active');
  assert.equal(seen.tier, 'subscriber');
  assert.equal(seen.subscription.remaining.coreProposal, 3);
});

// ---------- 6. 회원 안내 ----------

test('공개 회원 안내는 고객등급 넷만 담고 한 설정에서 나온다', async () => {
  const plans = membershipPlans();
  assert.deepEqual(plans.tiers.map(tier => tier.id), ['pending', 'member', 'subscriber', 'premium']);
  // 운영관리자·관리자는 고객등급이 아니라 넣지 않는다.
  // 등급 이름에 운영 역할이 섞이지 않는다.
  assert.ok(plans.tiers.every(tier => !['운영관리자', '관리자'].includes(tier.label)));
  assert.ok(plans.tiers.every(tier => !['operator', 'admin', 'staff'].includes(tier.id)));
  assert.equal(plans.pricing.priceLabel, '월 6,000원');
  assert.ok(plans.tiers[2].features.some(item => item.includes('3편')));
  assert.ok(plans.tiers[2].features.some(item => item.includes('5편')));
  assert.ok(plans.tiers[2].features.some(item => item.includes('20쪽')));

  // 로그인 없이 랜딩에서 읽는다.
  const db = fakeDb();
  const response = await through(db, post('/api/public', { action: 'membershipPlans' }), 'public');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.tiers.map(tier => tier.id), ['pending', 'member', 'subscriber', 'premium']);
  assert.equal(body.pricing.monthly, 6000);
});

test('계정 설정에 승인 상태·등급·남은 편수·갱신일·계약이 함께 나온다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'v-1', email: 'view@ms12.test', trialUsedAt: '2026-08-02T00:00:00.000Z' });
  seedSubscription(db, 'v-1', { core_used: 1, diagnosis_used: 2, renews_on: '2099-09-01' });
  seedContract(db, 'v-1', { progress: '작성중' });
  const cookie = await signIn(db, 'view@ms12.test');
  const body = await (await through(db, post('/api/account', { action: 'profile' }, { cookie }), 'account')).json();
  const info = body.membership;
  assert.equal(info.approvalLabel, '승인 완료');
  assert.equal(info.tier, 'premium');
  assert.equal(info.freePages, MEMBER_FREE_PAGES);
  assert.equal(info.freeUsed, true);
  assert.equal(info.subscription.remaining.coreProposal, 2);
  assert.equal(info.subscription.remaining.diagnosis, 3);
  assert.equal(info.subscription.renewsOn, '2099-09-01');
  assert.equal(body.contract.progress, '작성중');
  // 랜딩·계정이 같은 상품표를 쓴다.
  assert.equal(body.plans.pricing.monthly, 6000);
});

test('화면은 같은 상품표를 읽고 값을 따로 적어 두지 않는다', () => {
  // 가격·편수·쪽수를 화면 코드에 다시 쓰지 않는다.
  const screens = app.slice(app.indexOf('// ---------- 회원 안내 ----------'), app.indexOf('// ---------- 내 정보 수정'));
  assert.doesNotMatch(screens, /6,000원|6000원/);
  assert.doesNotMatch(screens, /3편|5편/);
  assert.match(screens, /membershipPlansState\(\)/);
  assert.match(app, /fetchMembershipPlans\(\)/);
});

// ---------- 7. 보존 ----------

test('기존 전체 이용권 회원의 권한을 줄이지 않는다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'full-1', email: 'full@ms12.test', plan: 'full' });
  const cookie = await signIn(db, 'full@ms12.test');
  const mock = mockOpenAI({ analysis: { mode: 'ai' } });
  try {
    const response = await through(db, post('/api/proposal', { action: 'analyze', payload: { sourceText: 'x'.repeat(60), organization: {} } }, { cookie }), 'proposal');
    assert.equal(response.status, 200, '기존 full 회원은 그대로 쓴다');
  } finally { mock.restore(); }
  // 저장도 그대로 열린다.
  const saved = await through(db, post('/api/archive', { action: 'saveProposal', proposal: { id: 'p1', title: 't', stage: 's', snapshot: {} } },
    { cookie, headers: { 'X-Archive-Key': '12345678-1234-1234-1234-123456789abc' } }), 'archive');
  assert.equal(saved.status, 200);
  // 구독을 부여받지 않았는데 구독회원으로 바뀌지 않는다.
  assert.equal(db.tables.subscriptions.length, 0);
  const state = membershipOf({ user: { role: 'customer', status: 'active', plan: 'full' } });
  assert.equal(state.tier, 'legacy');
  assert.equal(state.canExport, true);
});

test('쪽수 상한은 등급이 정한다', () => {
  const member = membershipOf({ user: { role: 'customer', status: 'active', plan: 'trial' } });
  assert.equal(corePagesFor(member, 20), MEMBER_FREE_PAGES);
  assert.equal(corePagesFor(member, 1), MEMBER_FREE_PAGES);
  const subscriber = membershipOf({ user: { role: 'customer', status: 'active', plan: 'trial' }, subscription: { status: 'active' } });
  assert.equal(corePagesFor(subscriber, 20), 20);
  assert.equal(corePagesFor(subscriber, 30), 20, '편당 최대 20쪽');
  assert.equal(corePagesFor(subscriber, 7), 7);
});

test('승인 대기·구독 없음에는 거절 사유가 서로 다르다', () => {
  const pending = membershipOf({ user: { role: 'customer', status: 'pending' } });
  assert.equal(membershipRefusal(pending, 'coreProposal').locked, true);
  const member = membershipOf({ user: { role: 'customer', status: 'active', plan: 'trial' } });
  assert.equal(membershipRefusal(member, 'coreProposal'), null, '정식회원은 핵심제안서를 만들 수 있다');
  assert.equal(membershipRefusal(member, 'diagnosis').needsSubscription, true);
  assert.equal(membershipRefusal(member, 'fullProposal').needsSubscription, true);
  const subscriber = membershipOf({ user: { role: 'customer', status: 'active', plan: 'trial' }, subscription: { status: 'active' } });
  assert.equal(membershipRefusal(subscriber, 'diagnosis'), null);
  assert.equal(membershipRefusal(subscriber, 'fullProposal').needsPremium, true);
});
