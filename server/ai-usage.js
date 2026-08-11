// OpenAI 호출의 사용량·비용 기록. 무엇을 얼마나 썼는지만 남긴다.
// 공고문·계획서 원문·프롬프트·응답 본문·API 키는 어떤 열에도 담지 않는다.
// 기록에 실패해도 생성 자체는 막지 않는다. 비용 기록 때문에 사용자의 작업이 깨지면 안 된다.

// 단가는 운영자가 Cloudflare 환경변수로 넣는다(1M 토큰당 USD).
// 값이 없으면 비용을 0으로 지어내지 않고 「단가 미설정」으로 표시하며 토큰만 기록한다.
export const PRICE_VARS = ['OPENAI_PRICE_INPUT_PER_MTOK', 'OPENAI_PRICE_CACHED_INPUT_PER_MTOK', 'OPENAI_PRICE_OUTPUT_PER_MTOK'];
// 계획서 한 건과 계정 하루에 걸어 두는 기본 상한. 환경변수로 올리거나 내릴 수 있다.
export const DEFAULT_CAPS = Object.freeze({ proposalCostUsd: 20, proposalTokens: 2_000_000, userDailyTokens: 6_000_000, warnRatio: 0.7 });
const MICRO = 1_000_000;
const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const count = value => { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.round(number) : 0; };

// OpenAI Responses API의 usage 모양에서 토큰 수만 꺼낸다.
// output_tokens에는 추론 토큰이 이미 포함되어 있고, cached_tokens는 input_tokens의 일부다.
export function extractUsage(data) {
  const usage = data?.usage || {};
  const input = count(usage.input_tokens);
  const output = count(usage.output_tokens);
  const cached = Math.min(count(usage.input_tokens_details?.cached_tokens), input);
  const reasoning = Math.min(count(usage.output_tokens_details?.reasoning_tokens), output);
  return { input, cached, output, reasoning, total: count(usage.total_tokens) || input + output };
}

export function priceOf(env) {
  const rate = name => { const value = Number(env?.[name]); return Number.isFinite(value) && value >= 0 ? value : null; };
  const input = rate(PRICE_VARS[0]);
  const cached = rate(PRICE_VARS[1]);
  const output = rate(PRICE_VARS[2]);
  const priced = input !== null && output !== null;
  // 캐시 단가를 따로 넣지 않았으면 입력 단가와 같게 본다. 실제보다 비용을 낮춰 잡지 않기 위해서다.
  return { input: input ?? 0, cached: cached ?? input ?? 0, output: output ?? 0, priced };
}

// 마이크로달러(USD × 1,000,000) 정수로 저장한다. 부동소수 오차 없이 더할 수 있다.
export function costMicro(usage, price) {
  if (!price.priced) return 0;
  const fresh = Math.max(usage.input - usage.cached, 0);
  return Math.round((fresh * price.input + usage.cached * price.cached + usage.output * price.output) / MICRO * MICRO);
}
export const usd = micro => Number(micro || 0) / MICRO;

// 한 번의 호출을 남긴다. 실패한 호출도 남긴다(실패에도 토큰이 청구될 수 있다).
export async function recordAiUsage(db, env, entry) {
  if (!db) return null;
  const usage = entry.usage || { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 };
  const price = priceOf(env);
  const row = {
    id: crypto.randomUUID(), at: (entry.at || new Date()).toISOString(),
    userId: clean(entry.userId, 80), userEmail: clean(entry.userEmail, 200), proposalId: clean(entry.proposalId, 80),
    task: clean(entry.task, 60) || 'unknown', model: clean(entry.model, 80),
    input: usage.input, cached: usage.cached, output: usage.output, reasoning: usage.reasoning,
    total: usage.total || usage.input + usage.output,
    costMicro: costMicro(usage, price), priced: price.priced ? 1 : 0,
    durationMs: count(entry.durationMs), ok: entry.ok ? 1 : 0,
    // 실패 사유는 미리 정한 짧은 코드만 남긴다. 오류 문장이나 응답 본문은 남기지 않는다.
    failureStage: clean(entry.failureStage, 40)
  };
  try {
    await db.prepare(`INSERT INTO ai_usage_events (id, at, user_id, user_email, proposal_id, task, model,
      input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens, cost_micro, priced, duration_ms, ok, failure_stage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(row.id, row.at, row.userId, row.userEmail, row.proposalId, row.task, row.model,
        row.input, row.cached, row.output, row.reasoning, row.total, row.costMicro, row.priced, row.durationMs, row.ok, row.failureStage).run();
  } catch { /* 기록 실패가 생성 결과를 막지 않는다. */ }
  return row;
}

// ---------- 상한 ----------
export function capsOf(env) {
  const number = (name, fallback) => { const value = Number(env?.[name]); return Number.isFinite(value) && value > 0 ? value : fallback; };
  return {
    proposalCostUsd: number('AI_PROPOSAL_COST_CAP_USD', DEFAULT_CAPS.proposalCostUsd),
    proposalTokens: number('AI_PROPOSAL_TOKEN_CAP', DEFAULT_CAPS.proposalTokens),
    userDailyTokens: number('AI_USER_DAILY_TOKEN_CAP', DEFAULT_CAPS.userDailyTokens),
    warnRatio: DEFAULT_CAPS.warnRatio
  };
}

export async function proposalSpend(db, proposalId) {
  const row = await db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(total_tokens), 0) AS tokens, COALESCE(SUM(cost_micro), 0) AS cost
    FROM ai_usage_events WHERE proposal_id = ?`).bind(clean(proposalId, 80)).first();
  return { calls: count(row?.calls), tokens: count(row?.tokens), costMicro: count(row?.cost) };
}
export async function userDailySpend(db, userId, now = new Date()) {
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const row = await db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(total_tokens), 0) AS tokens, COALESCE(SUM(cost_micro), 0) AS cost
    FROM ai_usage_events WHERE user_id = ? AND at >= ?`).bind(clean(userId, 80), since).first();
  return { calls: count(row?.calls), tokens: count(row?.tokens), costMicro: count(row?.cost) };
}

// 지금까지 쓴 양이 상한의 어디쯤인지. 단가가 없어도 토큰 상한은 언제나 동작한다.
export function budgetState(spend, caps, priced) {
  const tokenRatio = caps.proposalTokens ? spend.tokens / caps.proposalTokens : 0;
  const costRatio = priced && caps.proposalCostUsd ? usd(spend.costMicro) / caps.proposalCostUsd : 0;
  const ratio = Math.max(tokenRatio, costRatio);
  return {
    ratio, tokens: spend.tokens, costUsd: usd(spend.costMicro), calls: spend.calls,
    capTokens: caps.proposalTokens, capCostUsd: caps.proposalCostUsd, priced,
    level: ratio >= 1 ? 'blocked' : ratio >= caps.warnRatio ? 'warn' : 'ok'
  };
}

const CAP_MESSAGE = '이 계획서에 쓴 AI 사용량이 상한에 닿았습니다. 관리자에게 상한 조정을 요청해 주세요.';
const DAILY_MESSAGE = '오늘 이 계정이 쓴 AI 사용량이 상한에 닿았습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.';

// 부르기 전에 확인한다. 막을 이유가 없으면 null과 함께 지금 상태를 돌려준다.
export async function budgetRefusal(db, env, { proposalId = '', userId = '' } = {}, now = new Date()) {
  if (!db) return { refusal: null, budget: null };
  const caps = capsOf(env);
  const priced = priceOf(env).priced;
  // 계획서 식별자가 없으면 계획서 단위로 묶을 수 없다. 이때는 계정 하루 상한만 본다.
  const budget = proposalId ? budgetState(await proposalSpend(db, proposalId), caps, priced) : null;
  if (budget?.level === 'blocked') return { refusal: { status: 403, error: CAP_MESSAGE, capReached: true, budget }, budget };
  if (userId) {
    const daily = await userDailySpend(db, userId, now);
    if (caps.userDailyTokens && daily.tokens >= caps.userDailyTokens) {
      return { refusal: { status: 403, error: DAILY_MESSAGE, capReached: true, budget }, budget };
    }
  }
  return { refusal: null, budget };
}

// ---------- 관리자·운영관리자 조회 ----------
const PERIODS = new Set([7, 30, 90, 365]);
export const usagePeriod = value => (PERIODS.has(Number(value)) ? Number(value) : 30);

export async function usageReport(db, env, { days = 30, userId = '', proposalId = '' } = {}, now = new Date()) {
  const period = usagePeriod(days);
  const since = new Date(now.getTime() - period * 86_400_000).toISOString();
  const clauses = ['at >= ?'];
  const bindings = [since];
  if (userId) { clauses.push('user_id = ?'); bindings.push(clean(userId, 80)); }
  if (proposalId) { clauses.push('proposal_id = ?'); bindings.push(clean(proposalId, 80)); }
  const where = clauses.join(' AND ');
  const columns = `COUNT(*) AS calls, COALESCE(SUM(total_tokens), 0) AS tokens, COALESCE(SUM(input_tokens), 0) AS input_tokens,
    COALESCE(SUM(cached_input_tokens), 0) AS cached_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens,
    COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens, COALESCE(SUM(cost_micro), 0) AS cost,
    COALESCE(SUM(duration_ms), 0) AS duration, COALESCE(SUM(ok), 0) AS ok_calls`;

  const totals = await db.prepare(`SELECT ${columns} FROM ai_usage_events WHERE ${where}`).bind(...bindings).first();
  const byUser = await db.prepare(`SELECT user_id, user_email, ${columns} FROM ai_usage_events WHERE ${where}
    GROUP BY user_id, user_email ORDER BY cost DESC, tokens DESC LIMIT 50`).bind(...bindings).all();
  const byProposal = await db.prepare(`SELECT proposal_id, ${columns} FROM ai_usage_events WHERE ${where} AND proposal_id != ''
    GROUP BY proposal_id ORDER BY cost DESC, tokens DESC LIMIT 50`).bind(...bindings).all();
  const byDay = await db.prepare(`SELECT substr(at, 1, 10) AS day, ${columns} FROM ai_usage_events WHERE ${where}
    GROUP BY day ORDER BY day DESC LIMIT 90`).bind(...bindings).all();
  const byTask = await db.prepare(`SELECT task, model, ${columns} FROM ai_usage_events WHERE ${where}
    GROUP BY task, model ORDER BY cost DESC, tokens DESC LIMIT 50`).bind(...bindings).all();

  const caps = capsOf(env);
  const price = priceOf(env);
  return {
    period, since, priced: price.priced,
    // 단가는 값 자체가 비밀이 아니므로 그대로 보여 준다. API 키는 어디에도 담지 않는다.
    price: price.priced ? { inputPerMTok: price.input, cachedInputPerMTok: price.cached, outputPerMTok: price.output } : null,
    caps,
    totals: shape(totals),
    byUser: (byUser?.results || []).map(row => ({ userId: row.user_id || '', userEmail: row.user_email || '', ...shape(row) })),
    byProposal: (byProposal?.results || []).map(row => ({ proposalId: row.proposal_id, ...shape(row) })),
    byDay: (byDay?.results || []).map(row => ({ day: row.day, ...shape(row) })),
    byTask: (byTask?.results || []).map(row => ({ task: row.task, model: row.model || '', ...shape(row) }))
  };
}

function shape(row) {
  const calls = count(row?.calls);
  return {
    calls, okCalls: count(row?.ok_calls), failedCalls: Math.max(calls - count(row?.ok_calls), 0),
    tokens: count(row?.tokens), inputTokens: count(row?.input_tokens), cachedTokens: count(row?.cached_tokens),
    outputTokens: count(row?.output_tokens), reasoningTokens: count(row?.reasoning_tokens),
    costUsd: usd(count(row?.cost)), durationMs: count(row?.duration),
    averageMs: calls ? Math.round(count(row?.duration) / calls) : 0
  };
}
