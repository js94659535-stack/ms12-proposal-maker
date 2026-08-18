// 어느 계획서에 쓴 비용인지 묶으려고 식별자를 함께 보낸다. 화면이 정해 주고 없으면 빈 값이다.
let currentProposalId = '';
export function setUsageProposalId(value) { currentProposalId = String(value || '').slice(0, 80); }

async function request(action, payload, extra = {}) {
  const response = await fetch('/api/proposal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra, payload: { ...payload, proposalId: currentProposalId } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `서버 요청 실패 (${response.status})`);
    // 게이트웨이가 기다리다 끊은 것과 진짜 오류를 구분해야 뒷단에서 배경모드로 옮길 수 있다.
    error.status = response.status;
    throw error;
  }
  return data;
}

// MS12 핵심제안서. 제출처와 희망 쪽수에 맞춰 만들며, 계정당 한 번만 열리는지는 서버가 D1에서 확인한다.
export const coreProposalWithAI = payload => request('coreProposal', payload);
// 선정 가능성 진단서. 구독회원 기능이며 서버가 남은 편수를 확인한다.
export const diagnoseWithAI = payload => request('diagnosis', payload);
export const analyzeWithAI = payload => request('analyze', payload);
// 지역 현황 문단. 조사표에 채운 값만 근거로 쓰고, 없는 수치는 [확인 필요]로 남긴다.
export const regionBriefWithAI = payload => request('regionBrief', payload);
export const draftWithAI = payload => request('draft', payload);
// 설계는 두 걸음으로 나눠 부른다.
//
// 한 번에 9천 토큰을 뽑던 때는 100초 게이트웨이 제한을 피하려고 배경작업으로 돌렸는데,
// 배경작업은 앞단보다 네 배쯤 느려(초당 19토큰 대 80토큰) 8분이 걸리고 때로는 15분을 넘겨 실패했다.
// 걸음을 나누면 각 걸음이 5천 토큰 안팎이라 앞단으로도 100초 안에 끝난다.
// 그래도 끊기면 그 걸음만 배경으로 다시 돌리고, 작업번호를 밖에 알려 주어 다시 부르지 않게 한다.
const GATEWAY_CUT = new Set([502, 503, 504, 522, 524]);
const POLL_MS = 5000;
// 배경작업을 기다리는 시간. 상류가 느린 날 15분에 걸려 결과를 못 받은 일이 두 번 있었다.
// 기다림 자체는 돈이 들지 않는다(작업은 이미 돌고 있다). 그래서 넉넉히 잡는다.
const MAX_WAIT_MS = 25 * 60 * 1000;
// 이만큼 지나면 「창을 닫아도 된다」고 알린다. 작업번호를 저장해 두었으므로 잃지 않는다.
export const KEEP_GOING_MS = 5 * 60 * 1000;

async function pollJob(action, payload, jobId, onWait, since = 0) {
  const until = Date.now() + MAX_WAIT_MS;
  let waited = since;
  while (Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
    waited += POLL_MS / 1000;
    // 오래 걸리면 기다리는 방법을 알려 준다. 창을 닫아도 결과는 남는다.
    if (onWait) onWait(waited, { jobId, keepGoing: waited * 1000 >= KEEP_GOING_MS });
    const step = await request(action, payload, { jobId });
    if (!step?.pending) return step;
  }
  const error = new Error('설계 작성이 25분을 넘었습니다. 작업번호를 저장해 두었으니 다시 들어오면 「이어서 받기」로 같은 결과를 받습니다. 새로 결제되지 않습니다.');
  error.jobId = jobId;
  throw error;
}

// 한 걸음. 저장된 작업번호가 있으면 새로 부르지 않고 그 결과부터 받아 온다.
async function designStep(action, payload, { onWait = null, resume = null, onJob = null } = {}) {
  const saved = resume?.[action]?.id || '';
  if (saved) {
    try { return await pollJob(action, payload, saved, onWait); }
    catch (error) { if (error.jobId) throw error; /* 사라진 작업번호면 아래에서 새로 부른다 */ }
  }
  try {
    // 같은 입력이 이미 돌고 있으면 기다렸다 그 결과를 받는다. 새로 부르지 않는다.
    return await awaitResult(action, payload);
  } catch (error) {
    if (!GATEWAY_CUT.has(error.status)) throw error;
    // 앞단이 끊겼다. 같은 걸음을 배경으로 옮기고 작업번호를 남긴다.
    const started = await request(action, payload, { background: true });
    if (!started?.jobId) throw error;
    if (onJob) onJob(action, { id: started.jobId, at: new Date().toISOString() });
    return pollJob(action, payload, started.jobId, onWait);
  }
}

export async function masterWithAI(payload, onWait = null, options = {}) {
  const settings = { onWait, ...options };
  const design = await designStep('masterDesign', payload, settings);
  if (options.onStep) options.onStep('design');
  const plan = await designStep('masterPlan', { ...payload, design }, settings);
  if (options.onStep) options.onStep('plan');
  // 화면과 뒷단이 쓰는 모양은 예전 한 번 호출과 똑같이 맞춘다.
  return { ...design, masterLogic: plan.masterLogic, sectionPlan: plan.sectionPlan,
    masterStatus: plan.masterStatus, submissionReady: plan.submissionReady, warnings: plan.warnings, officialConflicts: plan.officialConflicts, note: plan.note };
}
// 서버가 「같은 작업이 이미 돌고 있다」고 하면 새로 부르지 않고 끝날 때까지 기다린다.
// 같은 입력을 두 번 결제하지 않기 위해서다. 끝난 결과가 있으면 서버가 그 사본을 돌려준다.
async function awaitResult(action, payload, { limitMs = MAX_WAIT_MS, onWaitInfo = null } = {}) {
  const until = Date.now() + limitMs;
  let result = await request(action, payload);
  while (result?.pending && Date.now() < until) {
    if (onWaitInfo) onWaitInfo(result);
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
    result = await request(action, payload);
  }
  // 기다려도 안 끝나면 막힌 채로 두지 않는다. 한 번은 강제로 새로 부른다.
  // 결과가 아예 안 나오는 것이 두 번 결제보다 나쁘다.
  if (result?.pending && result?.canForce) return request(action, { ...payload }, { force: true });
  if (result?.pending) throw new Error('같은 작업이 아직 끝나지 않았습니다. 잠시 후 「이어받기」로 결과를 확인해 주세요.');
  return result;
}
export const draftPartWithAI = payload => awaitResult('draftPart', payload);
// 이 계획서에 지금 돌고 있는 작업과 이미 끝난 작업. 다시 만들기 전에 화면이 먼저 보여 준다.
export const proposalJobs = proposalId => request('jobs', { proposalId });
// 승인된 설계안으로 계획서 전체를 한 번에 만든다.
export const fullProposalWithAI = payload => request('fullProposal', payload);
// 정밀 검증은 문제만 찾고, 부분 수정은 지목된 항목만 다시 쓴다.
export const preciseReviewWithAI = payload => request('preciseReview', payload);
export const patchSectionsWithAI = payload => request('patchSections', payload);
export const rewriteWithAI = payload => request('rewrite', payload);
// 확정값 반영은 문단별로 나눠 부르지 않고 한 번만 호출한다.
export const finalizeWithAI = payload => request('finalize', payload);
