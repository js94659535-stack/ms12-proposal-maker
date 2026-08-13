// 어느 계획서에 쓴 비용인지 묶으려고 식별자를 함께 보낸다. 화면이 정해 주고 없으면 빈 값이다.
let currentProposalId = '';
export function setUsageProposalId(value) { currentProposalId = String(value || '').slice(0, 80); }

async function request(action, payload, extra = {}) {
  const response = await fetch('/api/proposal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra, payload: { ...payload, proposalId: currentProposalId } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `서버 요청 실패 (${response.status})`);
  return data;
}

// MS12 핵심제안서. 제출처와 희망 쪽수에 맞춰 만들며, 계정당 한 번만 열리는지는 서버가 D1에서 확인한다.
export const coreProposalWithAI = payload => request('coreProposal', payload);
// 선정 가능성 진단서. 구독회원 기능이며 서버가 남은 편수를 확인한다.
export const diagnoseWithAI = payload => request('diagnosis', payload);
export const analyzeWithAI = payload => request('analyze', payload);
export const draftWithAI = payload => request('draft', payload);
// 설계는 오래 걸려 게이트웨이가 기다리다 끊는다. 시작만 하고 결과는 물어 가져온다.
// 화면은 예전과 같이 한 번 부르면 결과를 받는다. 기다리는 방식만 바뀐다.
export async function masterWithAI(payload, onWait = null) {
  const started = await request('master', payload);
  if (!started?.jobId) return started;
  const until = Date.now() + 15 * 60 * 1000;
  let waited = 0;
  while (Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    waited += 5;
    if (onWait) onWait(waited);
    const step = await request('master', payload, { jobId: started.jobId });
    if (!step?.pending) return step;
  }
  throw new Error('설계 작성이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.');
}
export const draftPartWithAI = payload => request('draftPart', payload);
// 승인된 설계안으로 계획서 전체를 한 번에 만든다.
export const fullProposalWithAI = payload => request('fullProposal', payload);
// 정밀 검증은 문제만 찾고, 부분 수정은 지목된 항목만 다시 쓴다.
export const preciseReviewWithAI = payload => request('preciseReview', payload);
export const patchSectionsWithAI = payload => request('patchSections', payload);
export const rewriteWithAI = payload => request('rewrite', payload);
// 확정값 반영은 문단별로 나눠 부르지 않고 한 번만 호출한다.
export const finalizeWithAI = payload => request('finalize', payload);
