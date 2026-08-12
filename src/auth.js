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
// 운영관리자에게 받은 일회용 코드로 본인이 직접 새 비밀번호를 정한다.
export const recoverPassword = (email, code, password, passwordConfirm) => post('/api/auth', 'recoverPassword', { email, code, password, passwordConfirm });
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
// 본인정보 수정. 역할·승인·이용권·프리미엄 상태는 서버가 받지 않는다.
export const saveMemberInfo = value => post('/api/account', 'saveProfile', value);

// 개인정보·업무자료 열람 안내 확인. 회원이 직접 누를 때만 부른다.
export const acknowledgePrivacyNotice = version => post('/api/account', 'acknowledgeNotice', { version });
