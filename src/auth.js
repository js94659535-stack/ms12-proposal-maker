// 로그인 상태 확인·전환. 세션은 쿠키에만 있으므로 토큰을 브라우저에 저장하지 않는다.
async function post(path, action, payload = {}) {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, ...data };
}

export const signup = (email, password, passwordConfirm) => post('/api/auth', 'signup', { email, password, passwordConfirm });
export const login = (email, password) => post('/api/auth', 'login', { email, password });
export const logout = () => post('/api/auth', 'logout');
export const currentUser = () => post('/api/auth', 'me');
export const UNAUTHORIZED = '로그인이 필요합니다.';

// 소셜 가입·연결. 공급자 토큰은 서버에서만 다루고 브라우저로 오지 않는다.
export const startSocial = (provider, mode = 'signup') => post('/api/oauth', 'start', { provider, mode });
export const finishSocial = (provider, code, state) => post('/api/oauth', 'callback', { provider, code, state });
export const accountProfile = () => post('/api/account', 'profile');
export const saveAccountProfile = value => post('/api/account', 'completeProfile', value);

// 공급자가 돌려보낸 주소에서 code·state만 읽는다. 읽고 나면 주소에서 지운다.
export function readOAuthCallback(search = globalThis.location?.search || '') {
  const params = new URLSearchParams(search);
  if (params.get('oauth') !== 'callback') return null;
  const code = params.get('code') || '';
  const state = params.get('state') || '';
  const provider = params.get('provider') || '';
  const error = params.get('error') || '';
  return { code, state, provider, error };
}
export function clearOAuthCallback() {
  globalThis.history?.replaceState?.({}, '', globalThis.location?.pathname || '/');
}
