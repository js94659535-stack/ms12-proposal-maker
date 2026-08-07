async function request(action, payload) {
  const response = await fetch('/api/proposal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `서버 요청 실패 (${response.status})`);
  return data;
}

export const analyzeWithAI = payload => request('analyze', payload);
export const draftWithAI = payload => request('draft', payload);
export const masterWithAI = payload => request('master', payload);
export const draftPartWithAI = payload => request('draftPart', payload);
export const rewriteWithAI = payload => request('rewrite', payload);
