// 로그인 상태 확인·전환. 세션은 쿠키에만 있으므로 토큰을 브라우저에 저장하지 않는다.
async function request(action, payload = {}) {
  const response = await fetch('/api/auth', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, ...data };
}

export const login = (email, password) => request('login', { email, password });
export const logout = () => request('logout');
export const currentUser = () => request('me');
export const UNAUTHORIZED = '로그인이 필요합니다.';
