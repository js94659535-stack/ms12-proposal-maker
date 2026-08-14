// 에이전트 자격과 AI 사용 한도.
//
// 규칙 세 가지를 여기 한 곳에 둔다.
//  1. 자격은 최고관리자만 준다. 신청·결제로 올라가지 않고 에이전트끼리 넘길 수도 없다.
//  2. 요금은 받지 않지만 AI 비용은 한도로 막는다. 한도를 정하지 않았으면 기본 한도를 쓴다(무제한 아님).
//  3. 자격을 잃으면 대행 업무 자료는 다음 요청부터 닫힌다. 자료는 지우지 않고 최고관리자가 보존한다.

export const AGENCY_STATUSES = Object.freeze(['active', 'paused', 'revoked']);
export const AGENCY_STATUS_LABEL = Object.freeze({
  active: '이용 중', paused: '일시중지', revoked: '자격 해제', none: '에이전트 아님'
});

// 최고관리자가 값을 정하지 않았을 때 적용하는 기본 한도. 비워 두어도 무제한이 되지 않는다.
export const DEFAULT_LIMITS = Object.freeze({
  monthlyPlans: 10,          // 월간 계획서 생성 편수
  revisionsPerPlan: 2,       // 계획서 한 편당 AI 수정 횟수
  monthlyDiagnoses: 5,       // 월간 선정 가능성 진단 횟수
  monthlyTokens: 1_500_000,  // 월간 토큰 상한
  monthlyCostMicro: 30_000_000 // 월간 비용 상한(마이크로달러 = $30)
});

export const LIMIT_FIELDS = Object.freeze([
  ['monthlyPlans', '월간 계획서 편수', '편'],
  ['revisionsPerPlan', '계획서별 수정 횟수', '회'],
  ['monthlyDiagnoses', '월간 진단서 횟수', '회'],
  ['monthlyTokens', '월간 토큰 상한', '토큰'],
  ['monthlyCostMicro', '월간 비용 상한', '마이크로달러']
]);

// 대행 업무 자료와 개인 작업공간. 섞이지 않게 값 하나로 가른다.
export const WORKSPACES = Object.freeze(['personal', 'agency']);
export const workspaceOf = value => (WORKSPACES.includes(String(value)) ? String(value) : 'personal');

const int = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
};

// 저장된 한도에 기본값을 덮어 읽는다. 0이나 빈 값은 「정하지 않음」이고 기본 한도를 쓴다.
export function limitsOf(row = {}) {
  return {
    monthlyPlans: int(row.monthly_plans ?? row.monthlyPlans, DEFAULT_LIMITS.monthlyPlans),
    revisionsPerPlan: int(row.revisions_per_plan ?? row.revisionsPerPlan, DEFAULT_LIMITS.revisionsPerPlan),
    monthlyDiagnoses: int(row.monthly_diagnoses ?? row.monthlyDiagnoses, DEFAULT_LIMITS.monthlyDiagnoses),
    monthlyTokens: int(row.monthly_tokens ?? row.monthlyTokens, DEFAULT_LIMITS.monthlyTokens),
    monthlyCostMicro: int(row.monthly_cost_micro ?? row.monthlyCostMicro, DEFAULT_LIMITS.monthlyCostMicro)
  };
}

// 화면·서버가 함께 보는 자격 상태. 날짜는 한국시간 기준 날짜 문자열(YYYY-MM-DD)로 비교한다.
export function agencyState(row, today = todayInSeoul()) {
  if (!row || !row.user_id) return { has: false, active: false, status: 'none', reason: '에이전트이 아닙니다.' };
  const status = AGENCY_STATUSES.includes(row.status) ? row.status : 'revoked';
  const starts = String(row.starts_on || '');
  const ends = String(row.ends_on || '');
  const limits = limitsOf(row);
  const base = { has: true, status, limits, startsOn: starts, endsOn: ends, grantedAt: row.granted_at || '', note: row.note || '' };
  if (status === 'revoked') return { ...base, active: false, reason: '에이전트 자격이 해제되었습니다. 기존 자료는 최고관리자가 보존합니다.' };
  if (status === 'paused') return { ...base, active: false, reason: '에이전트 사용이 일시중지되었습니다. 최고관리자에게 문의해 주세요.' };
  if (starts && today < starts) return { ...base, active: false, reason: `대행 업무는 ${starts}부터 시작합니다.` };
  if (ends && today > ends) return { ...base, active: false, reason: `에이전트 자격이 ${ends}에 끝났습니다.` };
  return { ...base, active: true, reason: '' };
}

// 이번 달 사용량과 한도를 견준다. AI를 부르기 전에 이것부터 본다.
// kind: 'plan'(새 계획서) | 'revision'(수정) | 'diagnosis'(진단서) | 'other'
export function limitCheck({ state, usage = {}, kind = 'other' } = {}) {
  if (!state?.has) return { allowed: true, reason: '' };
  if (!state.active) return { allowed: false, code: 'inactive', reason: state.reason };
  const limits = state.limits || DEFAULT_LIMITS;
  const used = {
    plans: Number(usage.plans || 0), diagnoses: Number(usage.diagnoses || 0),
    tokens: Number(usage.tokens || 0), costMicro: Number(usage.costMicro || 0),
    revisionsForPlan: Number(usage.revisionsForPlan || 0)
  };
  if (used.tokens >= limits.monthlyTokens) {
    return { allowed: false, code: 'tokens', reason: `이번 달 토큰 상한 ${limits.monthlyTokens.toLocaleString('ko-KR')}에 닿았습니다. 다음 달 1일에 다시 열립니다.` };
  }
  if (used.costMicro >= limits.monthlyCostMicro) {
    return { allowed: false, code: 'cost', reason: `이번 달 비용 상한 $${(limits.monthlyCostMicro / 1_000_000).toFixed(2)}에 닿았습니다. 다음 달 1일에 다시 열립니다.` };
  }
  if (kind === 'plan' && used.plans >= limits.monthlyPlans) {
    return { allowed: false, code: 'plans', reason: `이번 달 계획서 ${limits.monthlyPlans}편을 모두 썼습니다. 다음 달 1일에 다시 열립니다.` };
  }
  if (kind === 'diagnosis' && used.diagnoses >= limits.monthlyDiagnoses) {
    return { allowed: false, code: 'diagnoses', reason: `이번 달 진단서 ${limits.monthlyDiagnoses}회를 모두 썼습니다. 다음 달 1일에 다시 열립니다.` };
  }
  if (kind === 'revision' && used.revisionsForPlan >= limits.revisionsPerPlan) {
    return { allowed: false, code: 'revisions', reason: `이 계획서의 AI 수정 ${limits.revisionsPerPlan}회를 모두 썼습니다. 직접 편집은 계속할 수 있습니다.` };
  }
  return { allowed: true, reason: '' };
}

// 화면에 그대로 적는 남은 양과 갱신일.
export function remainingFor(state, usage = {}) {
  const limits = state?.limits || DEFAULT_LIMITS;
  const left = (limit, used) => Math.max(0, limit - Number(used || 0));
  return {
    plans: left(limits.monthlyPlans, usage.plans),
    diagnoses: left(limits.monthlyDiagnoses, usage.diagnoses),
    tokens: left(limits.monthlyTokens, usage.tokens),
    costMicro: left(limits.monthlyCostMicro, usage.costMicro),
    renewsOn: nextMonthStart()
  };
}

// AI 작업 이름을 한도 종류로 옮긴다. 이름을 모르면 어떤 편수도 깎지 않는다.
const PLAN_TASKS = new Set(['master', 'fullProposal', 'coreProposal', 'draft']);
const REVISION_TASKS = new Set(['patchSections', 'rewrite', 'finalize']);
export function limitKindFor(task) {
  const name = String(task || '');
  if (name === 'diagnosis') return 'diagnosis';
  if (PLAN_TASKS.has(name)) return 'plan';
  if (REVISION_TASKS.has(name)) return 'revision';
  return 'other';
}

// 자격을 넘기거나 스스로 올라갈 수 없다. 지정·해제는 활성 최고관리자만 한다.
export function canManageAgency(actor) {
  return Boolean(actor && actor.role === 'admin' && actor.status === 'active');
}
// 에이전트이 자기 자격이나 남의 자격을 건드리는 일을 막는다.
export function rejectsSelfPromotion(actor, targetId) {
  if (!canManageAgency(actor)) return { allowed: false, reason: '에이전트 지정·해제는 최고관리자만 할 수 있습니다.' };
  if (String(actor.id) === String(targetId)) return { allowed: false, reason: '자기 계정의 에이전트 자격은 이 화면에서 바꿀 수 없습니다.' };
  return { allowed: true, reason: '' };
}

// 인계는 자격이 살아 있는 다른 에이전트에게만 한다.
export function transferCheck({ from, to, fromState, toState }) {
  if (!from || !to) return { allowed: false, reason: '넘길 에이전트와 받을 에이전트를 모두 고르세요.' };
  if (String(from) === String(to)) return { allowed: false, reason: '같은 계정으로는 인계할 수 없습니다.' };
  if (!fromState?.has) return { allowed: false, reason: '넘길 자료의 에이전트 기록이 없습니다.' };
  if (!toState?.has) return { allowed: false, reason: '받을 계정이 에이전트이 아닙니다. 먼저 에이전트로 지정하세요.' };
  if (toState.status === 'revoked') return { allowed: false, reason: '자격이 해제된 계정으로는 인계할 수 없습니다.' };
  return { allowed: true, reason: '' };
}

export function todayInSeoul(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
// 이번 달 사용량을 셀 시작 시각(한국시간 1일 00:00을 UTC로 옮긴 값).
export function monthStart(now = new Date()) {
  const seoul = todayInSeoul(now);
  return `${seoul.slice(0, 7)}-01T00:00:00.000Z`;
}
export function nextMonthStart(now = new Date()) {
  const [year, month] = todayInSeoul(now).split('-').map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}
