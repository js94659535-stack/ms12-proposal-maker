// 프리미엄회원 전용 호출. 읽기만 한다. 실제 권한 확인은 서버가 한다.
async function post(action, payload = {}) {
  const response = await fetch('/api/premium', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data;
}

export const premiumStatus = () => post('status');
export const premiumShowcase = () => post('showcase');
export const premiumNoticeHistory = (query = '', mode = 'focused', filters = {}) => post('noticeHistory', { query, mode, filters });
