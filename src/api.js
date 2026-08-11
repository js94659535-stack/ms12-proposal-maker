async function request(action, payload) {
  const response = await fetch('/api/proposal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `서버 요청 실패 (${response.status})`);
  return data;
}

// 1페이지 사업구상 무료 체험. 계정당 한 번만 열리며 서버가 D1에서 사용 여부를 확인한다.
export const trialSketchWithAI = payload => request('trialSketch', payload);
export const analyzeWithAI = payload => request('analyze', payload);
export const draftWithAI = payload => request('draft', payload);
export const masterWithAI = payload => request('master', payload);
export const draftPartWithAI = payload => request('draftPart', payload);
// 승인된 설계안으로 계획서 전체를 한 번에 만든다.
export const fullProposalWithAI = payload => request('fullProposal', payload);
// 정밀 검증은 문제만 찾고, 부분 수정은 지목된 항목만 다시 쓴다.
export const preciseReviewWithAI = payload => request('preciseReview', payload);
export const patchSectionsWithAI = payload => request('patchSections', payload);
export const rewriteWithAI = payload => request('rewrite', payload);
// 확정값 반영은 문단별로 나눠 부르지 않고 한 번만 호출한다.
export const finalizeWithAI = payload => request('finalize', payload);
