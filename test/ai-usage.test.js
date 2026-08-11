// AI 사용량·비용 기록. 무엇을 남기고 무엇을 남기지 않는지, 상한이 실제로 막는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as proposalRoute } from '../functions/api/proposal.js';
import { onRequest as reviewRoute } from '../functions/api/proposal-review.js';
import { onRequest as coachingRoute } from '../functions/api/proposal-coaching.js';
import { onRequest as adminRoute } from '../functions/api/admin.js';
import { onRequest as operatorRoute } from '../functions/api/operator.js';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';
import { DEFAULT_CAPS, budgetState, capsOf, costMicro, extractUsage, priceOf, usageReport, usd } from '../server/ai-usage.js';
import { BLOCKED_ACTIONS, OPERATOR_ACTIONS } from '../server/operator-scope.js';
import { fakeDb } from './fixtures/fake-d1.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0009_ai_usage.sql', import.meta.url), 'utf8');
const usageSource = fs.readFileSync(new URL('../server/ai-usage.js', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'test-only-passphrase-9241';
// 단가를 넣어 실제 비용이 쌓이는지 본다. 1M 토큰당 USD.
const PRICED = { OPENAI_API_KEY: 'mock-only', OPENAI_MODEL: 'mock-model', OPENAI_PRICE_INPUT_PER_MTOK: '1', OPENAI_PRICE_CACHED_INPUT_PER_MTOK: '0.5', OPENAI_PRICE_OUTPUT_PER_MTOK: '10' };
const ROUTES = { proposal: proposalRoute, review: reviewRoute, coaching: coachingRoute, admin: adminRoute, operator: operatorRoute, auth: authRoute };
const NOTICE = '○○재단 2027년 지역 아동 정서지원 사업 공고. 지원 대상은 지역 아동복지 기관이며 사업기간은 8개월입니다. 사업 필요성과 대상 선정 근거를 적어야 합니다.';
const SECRET = '이것은 공고문 원문이자 계획서 원문입니다. 저장되면 안 됩니다.';
const USAGE = { input_tokens: 10_000, input_tokens_details: { cached_tokens: 4_000 }, output_tokens: 2_000, output_tokens_details: { reasoning_tokens: 800 }, total_tokens: 12_000 };
const RESULT = { analysis: { mode: 'ai' }, requirements: [] };

function post(path, body, { cookie = '', headers = {} } = {}) {
  const base = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9', ...headers };
  if (cookie) base.Cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers: base, body: JSON.stringify(body) });
}
const cookieOf = response => `${SESSION_COOKIE}=${/__Host-ms12_session=([a-f0-9]{64})/.exec(response.headers.get('set-cookie') || '')?.[1] || ''}`;

async function through(db, request, route, env = PRICED) {
  const data = {};
  const context = { request, env: { ARCHIVE_DB: db, ...env }, data };
  const blocked = await middleware({ ...context, next: async () => null });
  if (blocked) return blocked;
  return ROUTES[route](context);
}
async function seedUser(db, { id, email, role = 'customer', plan = 'full' }) {
  db.tables.users.push({
    id, email, role, status: 'active', org_id: '', name: '', ...(await createPasswordRecord(PASSWORD)),
    plan, trial_used_at: '', phone: '', org_name: '', is_contact: 0, terms_version: '', privacy_version: '',
    consented_at: '', profile_completed_at: '', created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
  });
}
const signIn = async (db, email) => cookieOf(await through(db, post('/api/auth', { action: 'login', email, password: PASSWORD }), 'auth'));

// OpenAI를 부르지 않고 usage가 실린 응답만 돌려준다.
function mockOpenAI({ result = RESULT, usage = USAGE, status = 200 } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const body = status === 200
      ? { output_text: JSON.stringify(result), status: 'completed', usage }
      : { error: { message: 'upstream down', type: 'server_error' }, usage };
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
async function withMember(plan = 'full') {
  const db = fakeDb();
  await seedUser(db, { id: 'member-1', email: 'member@ms12.test', plan });
  return { db, cookie: await signIn(db, 'member@ms12.test') };
}
const analyze = (db, cookie, payload = {}) => through(db, post('/api/proposal', {
  action: 'analyze', payload: { projectType: 'g2b', project: {}, organization: {}, sourceText: NOTICE, ...payload }
}, { cookie }), 'proposal');

test('토큰 계산과 비용 계산은 캐시·추론 토큰을 겹쳐 세지 않는다', () => {
  const usage = extractUsage({ usage: USAGE });
  assert.deepEqual(usage, { input: 10_000, cached: 4_000, output: 2_000, reasoning: 800, total: 12_000 });
  // 캐시 토큰은 input의 일부, 추론 토큰은 output의 일부다. 범위를 넘는 값은 잘라 낸다.
  const odd = extractUsage({ usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 500 }, output_tokens: 50, output_tokens_details: { reasoning_tokens: 900 } } });
  assert.equal(odd.cached, 100);
  assert.equal(odd.reasoning, 50);
  assert.deepEqual(extractUsage({}), { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 });

  // 신선한 입력 6,000 × $1 + 캐시 4,000 × $0.5 + 출력 2,000 × $10 = $0.028
  const price = priceOf(PRICED);
  assert.equal(price.priced, true);
  assert.equal(usd(costMicro(usage, price)).toFixed(6), '0.028000');
  // 단가가 없으면 비용을 지어내지 않는다.
  const bare = priceOf({ OPENAI_MODEL: 'mock-model' });
  assert.equal(bare.priced, false);
  assert.equal(costMicro(usage, bare), 0);
  // 캐시 단가를 넣지 않으면 입력 단가와 같게 본다(비용을 낮춰 잡지 않는다).
  assert.equal(priceOf({ OPENAI_PRICE_INPUT_PER_MTOK: '2', OPENAI_PRICE_OUTPUT_PER_MTOK: '8' }).cached, 2);
});

test('성공한 호출은 모델·토큰·시간만 남기고 원문과 프롬프트는 남기지 않는다', async () => {
  const { db, cookie } = await withMember();
  const mock = mockOpenAI();
  try {
    const response = await analyze(db, cookie, { sourceText: `${NOTICE} ${SECRET}`, proposalId: 'plan-1' });
    assert.equal(response.status, 200);
  } finally { mock.restore(); }

  assert.equal(db.tables.ai_usage_events.length, 1);
  const [row] = db.tables.ai_usage_events;
  assert.equal(row.task, 'analyze');
  assert.equal(row.model, 'mock-model');
  assert.equal(row.user_id, 'member-1');
  assert.equal(row.user_email, 'member@ms12.test');
  assert.equal(row.proposal_id, 'plan-1');
  assert.equal(row.input_tokens, 10_000);
  assert.equal(row.cached_input_tokens, 4_000);
  assert.equal(row.output_tokens, 2_000);
  assert.equal(row.reasoning_tokens, 800);
  assert.equal(row.total_tokens, 12_000);
  assert.equal(row.cost_micro, 28_000, '$0.028 = 28,000 마이크로달러');
  assert.equal(row.priced, 1);
  assert.equal(row.ok, 1);
  assert.equal(row.failure_stage, '');
  assert.ok(row.duration_ms >= 0);

  // 저장된 행 어디에도 원문·프롬프트·API 키가 없다.
  const stored = JSON.stringify(db.tables.ai_usage_events);
  for (const secret of [SECRET, NOTICE, 'mock-only', 'Bearer', '당신은 대한민국']) assert.ok(!stored.includes(secret), secret.slice(0, 20));
  // 저장 열 자체가 정해져 있다.
  assert.deepEqual(Object.keys(row).sort(), ['at', 'cached_input_tokens', 'cost_micro', 'duration_ms', 'failure_stage', 'id', 'input_tokens',
    'model', 'ok', 'output_tokens', 'priced', 'proposal_id', 'reasoning_tokens', 'task', 'total_tokens', 'user_email', 'user_id'].sort());
});

test('실패한 호출도 남기고 사유는 짧은 코드로만 남긴다', async () => {
  const { db, cookie } = await withMember();
  const mock = mockOpenAI({ status: 500 });
  try { assert.equal((await analyze(db, cookie, { proposalId: 'plan-1' })).status, 502); } finally { mock.restore(); }
  const upstream = db.tables.ai_usage_events.at(-1);
  assert.equal(upstream.ok, 0);
  assert.equal(upstream.failure_stage, 'openai-upstream');
  assert.equal(upstream.total_tokens, 12_000, '실패해도 청구될 수 있는 토큰은 기록한다');

  // 연결 자체가 끊긴 경우도 남긴다.
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('boom'); };
  try { assert.equal((await analyze(db, cookie, { proposalId: 'plan-1' })).status, 502); } finally { globalThis.fetch = original; }
  const transport = db.tables.ai_usage_events.at(-1);
  assert.equal(transport.ok, 0);
  assert.equal(transport.failure_stage, 'transport');
  assert.equal(transport.total_tokens, 0);
  // 오류 문장은 남기지 않는다.
  assert.ok(!JSON.stringify(db.tables.ai_usage_events).includes('boom'));
});

test('심사 검토와 검증·코칭 호출도 같은 방식으로 기록된다', async () => {
  const { db, cookie } = await withMember();
  const sections = Array.from({ length: 10 }, (_, index) => ({ id: `s${index}`, title: 't', content: SECRET }));
  const mock = mockOpenAI({ result: { overallScore: 80 } });
  try {
    await through(db, post('/api/proposal-review', { sections, proposalId: 'plan-2' }, { cookie }), 'review');
    await through(db, post('/api/proposal-coaching', { action: 'startCoaching', proposalText: SECRET.repeat(3), proposalId: 'plan-2' }, { cookie, headers: { 'X-Archive-Key': '12345678-1234-1234-1234-123456789abc' } }), 'coaching');
  } finally { mock.restore(); }
  const tasks = db.tables.ai_usage_events.map(row => row.task);
  assert.ok(tasks.includes('review'), '심사 검토 기록');
  assert.ok(tasks.includes('coaching:start'), '검증·코칭 시작 기록');
  assert.ok(db.tables.ai_usage_events.every(row => row.proposal_id === 'plan-2'));
  assert.ok(!JSON.stringify(db.tables.ai_usage_events).includes(SECRET));
});

test('계획서 한 건의 비용이 상한에 닿으면 서버가 다음 호출을 막는다', async () => {
  const caps = capsOf({ AI_PROPOSAL_TOKEN_CAP: '20000' });
  assert.equal(caps.proposalTokens, 20_000);
  assert.equal(caps.proposalCostUsd, DEFAULT_CAPS.proposalCostUsd);
  // 상한의 70%를 넘으면 경고, 100%에 닿으면 차단이다.
  assert.equal(budgetState({ tokens: 5_000, costMicro: 0, calls: 1 }, caps, false).level, 'ok');
  assert.equal(budgetState({ tokens: 15_000, costMicro: 0, calls: 1 }, caps, false).level, 'warn');
  assert.equal(budgetState({ tokens: 20_000, costMicro: 0, calls: 2 }, caps, false).level, 'blocked');
  // 단가가 없어도 토큰 상한은 동작한다. 비용 상한만 두면 상한이 꺼진 것처럼 되기 때문이다.
  assert.equal(budgetState({ tokens: 0, costMicro: 30_000_000, calls: 1 }, caps, true).level, 'blocked');
  assert.equal(budgetState({ tokens: 0, costMicro: 30_000_000, calls: 1 }, caps, false).level, 'ok');

  const { db, cookie } = await withMember();
  const env = { ...PRICED, AI_PROPOSAL_TOKEN_CAP: '20000' };
  const call = () => through(db, post('/api/proposal', { action: 'analyze', payload: { projectType: 'g2b', project: {}, organization: {}, sourceText: NOTICE, proposalId: 'plan-cap' } }, { cookie }), 'proposal', env);
  const mock = mockOpenAI();
  try {
    assert.equal((await call()).status, 200, '첫 호출 12,000토큰');
    assert.equal((await call()).status, 200, '두 번째 호출로 24,000토큰');
    const blocked = await call();
    assert.equal(blocked.status, 403, '상한을 넘긴 뒤에는 막힌다');
    const body = await blocked.json();
    assert.equal(body.capReached, true);
    assert.equal(body.budget.level, 'blocked');
    assert.match(body.error, /상한/);
    // 막힌 호출은 OpenAI를 부르지 않는다.
    assert.equal(mock.calls.length, 2, '차단된 요청이 비용을 더 쓰면 안 된다');
  } finally { mock.restore(); }
  // 다른 계획서는 그대로 쓸 수 있다.
  const other = mockOpenAI();
  try {
    assert.equal((await through(db, post('/api/proposal', { action: 'analyze', payload: { projectType: 'g2b', project: {}, organization: {}, sourceText: NOTICE, proposalId: 'plan-free' } }, { cookie }), 'proposal', env)).status, 200);
  } finally { other.restore(); }
});

test('계정 하루 상한이 계획서 식별자 없이도 막아 준다', async () => {
  const { db, cookie } = await withMember();
  const env = { ...PRICED, AI_USER_DAILY_TOKEN_CAP: '20000' };
  const call = () => through(db, post('/api/proposal', { action: 'analyze', payload: { projectType: 'g2b', project: {}, organization: {}, sourceText: NOTICE } }, { cookie }), 'proposal', env);
  const mock = mockOpenAI();
  try {
    assert.equal((await call()).status, 200);
    assert.equal((await call()).status, 200);
    const blocked = await call();
    assert.equal(blocked.status, 403, '계획서 식별자를 비워 상한을 피할 수 없다');
    assert.equal((await blocked.json()).capReached, true);
    assert.equal(mock.calls.length, 2);
  } finally { mock.restore(); }
});

test('관리자와 운영관리자가 회원별·계획서별·기간별 비용을 본다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@ms12.test', role: 'admin' });
  await seedUser(db, { id: 'op-1', email: 'op@ms12.test', role: 'operator' });
  await seedUser(db, { id: 'member-1', email: 'member@ms12.test' });
  const adminCookie = await signIn(db, 'admin@ms12.test');
  const operatorCookie = await signIn(db, 'op@ms12.test');
  const memberCookie = await signIn(db, 'member@ms12.test');

  const mock = mockOpenAI();
  try {
    for (const proposalId of ['plan-a', 'plan-a', 'plan-b']) {
      await through(db, post('/api/proposal', { action: 'analyze', payload: { projectType: 'g2b', project: {}, organization: {}, sourceText: NOTICE, proposalId } }, { cookie: memberCookie }), 'proposal');
    }
  } finally { mock.restore(); }

  for (const [label, cookie, route] of [['관리자', adminCookie, 'admin'], ['운영관리자', operatorCookie, 'operator']]) {
    const response = await through(db, post(`/api/${route}`, { action: 'usageReport', days: 30 }, { cookie }), route);
    assert.equal(response.status, 200, label);
    const report = await response.json();
    assert.equal(report.period, 30, label);
    assert.equal(report.priced, true, label);
    assert.equal(report.totals.calls, 3, label);
    assert.equal(report.totals.costUsd.toFixed(4), '0.0840', label);
    assert.equal(report.totals.tokens, 36_000, label);
    // 회원별
    assert.deepEqual(report.byUser.map(item => [item.userEmail, item.calls]), [['member@ms12.test', 3]], label);
    // 계획서별
    assert.deepEqual(report.byProposal.map(item => [item.proposalId, item.calls]), [['plan-a', 2], ['plan-b', 1]], label);
    // 기간별
    assert.equal(report.byDay.length, 1, label);
    assert.equal(report.byTask[0].task, 'analyze', label);
    assert.equal(report.caps.proposalTokens, DEFAULT_CAPS.proposalTokens, label);
  }

  // 기간을 좁히면 그 기간만 센다.
  const short = await (await through(db, post('/api/admin', { action: 'usageReport', days: 7 }, { cookie: adminCookie }), 'admin')).json();
  assert.equal(short.period, 7);
  // 목록에 없는 기간은 기본값 30일로 떨어진다.
  const odd = await (await through(db, post('/api/admin', { action: 'usageReport', days: 9999 }, { cookie: adminCookie }), 'admin')).json();
  assert.equal(odd.period, 30);
  // 일반 회원은 사용량을 볼 수 없다.
  assert.equal((await through(db, post('/api/admin', { action: 'usageReport' }, { cookie: memberCookie }), 'admin')).status, 403);
  assert.equal((await through(db, post('/api/operator', { action: 'usageReport' }, { cookie: memberCookie }), 'operator')).status, 403);
});

test('운영관리자는 사용량을 읽기만 하고 단가·상한은 바꾸지 못한다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'op-1', email: 'op@ms12.test', role: 'operator' });
  const cookie = await signIn(db, 'op@ms12.test');
  assert.ok(OPERATOR_ACTIONS.has('usageReport'));
  for (const action of ['setUsageCap', 'setPricing']) {
    assert.ok(BLOCKED_ACTIONS.has(action), action);
    const refused = await through(db, post('/api/operator', { action }, { cookie }), 'operator');
    assert.equal(refused.status, 403, action);
    assert.equal((await refused.json()).blocked, true, action);
  }
  assert.ok(db.tables.admin_audit_log.some(item => item.action === 'blocked:setUsageCap'));
});

test('단가를 넣지 않으면 비용을 0으로 지어내지 않고 미설정으로 알린다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@ms12.test', role: 'admin' });
  await seedUser(db, { id: 'member-1', email: 'member@ms12.test' });
  const adminCookie = await signIn(db, 'admin@ms12.test');
  const memberCookie = await signIn(db, 'member@ms12.test');
  const bare = { OPENAI_API_KEY: 'mock-only', OPENAI_MODEL: 'mock-model' };
  const mock = mockOpenAI();
  try {
    await through(db, post('/api/proposal', { action: 'analyze', payload: { projectType: 'g2b', project: {}, organization: {}, sourceText: NOTICE, proposalId: 'plan-x' } }, { cookie: memberCookie }), 'proposal', bare);
  } finally { mock.restore(); }
  const [row] = db.tables.ai_usage_events;
  assert.equal(row.priced, 0);
  assert.equal(row.cost_micro, 0);
  assert.equal(row.total_tokens, 12_000, '단가가 없어도 토큰은 남는다');
  const report = await (await through(db, post('/api/admin', { action: 'usageReport' }, { cookie: adminCookie }), 'admin', bare)).json();
  assert.equal(report.priced, false);
  assert.equal(report.price, null);
  assert.equal(report.totals.tokens, 12_000);
});

test('migration은 새 표만 만들고 원문을 담을 열을 두지 않는다', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_usage_events/);
  for (const column of ['model', 'input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_tokens', 'duration_ms', 'ok', 'task', 'user_id', 'proposal_id', 'cost_micro']) {
    assert.ok(migration.includes(column), column);
  }
  // 원문·프롬프트·응답·키를 담을 열이 없다.
  for (const column of ['prompt', 'source_text', 'proposal_text', 'response', 'output_text', 'api_key', 'content']) {
    assert.doesNotMatch(migration, new RegExp(`^\\s*${column} `, 'm'), column);
  }
  assert.doesNotMatch(migration, /DROP TABLE|ALTER TABLE|DELETE FROM/i);
  // 기록 실패가 생성을 막지 않는다.
  assert.match(usageSource, /catch \{ \/\* 기록 실패가 생성 결과를 막지 않는다\. \*\/ \}/);
});

test('사용량 화면은 관리자·운영관리자 양쪽에 붙어 있다', () => {
  assert.match(app, /function usagePanel\(\)/);
  assert.match(app, /id="open-admin-usage"/);
  assert.match(app, /data-operator-tab="usage"/);
  assert.match(app, /data-usage-days/);
  // 회원별·계획서별·작업별·날짜별을 모두 보여 준다.
  for (const label of ['회원별', '계획서별', '작업 종류별', '날짜별', '계획서 1건 상한']) assert.ok(app.includes(label), label);
  // 단가 미설정을 비용 0으로 오해하지 않게 안내한다.
  assert.ok(app.includes('단가가 설정되어 있지 않습니다'));
  // 화면이 지금 작업 중인 계획서 식별자를 사용량에 묶는다.
  assert.match(app, /setUsageProposalId\(state\.archiveProposalId \|\| state\.currentVersionId \|\| ''\)/);
});
