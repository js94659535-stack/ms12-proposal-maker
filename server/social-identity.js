// 소셜 로그인의 판단 규칙. 네트워크를 타지 않는 순수 함수라 fixture로 그대로 시험할 수 있다.
import { sha256Hex, toHex } from './password.js';

export const PROVIDERS = ['google', 'kakao'];
export const PROVIDER_LABELS = { google: 'Google', kakao: '카카오' };
export const OAUTH_MODES = ['signup', 'link'];
export const STATE_MINUTES = 10;
// 동의 문서를 고칠 때마다 올린다. 사용자 행에 이 값과 동의 시각을 함께 남긴다.
export const CONSENT_VERSIONS = { terms: '2026-08-10', privacy: '2026-08-10' };
// 신규 소셜 가입자는 언제나 이 값으로만 만든다.
export const SIGNUP_ROLE = 'customer';
export const SIGNUP_STATUS = 'pending';

const AUTHORIZE = {
  google: 'https://accounts.google.com/o/oauth2/v2/auth',
  kakao: 'https://kauth.kakao.com/oauth/authorize'
};
const SCOPES = { google: 'openid email profile', kakao: 'account_email profile_nickname' };

export function isProvider(value) { return PROVIDERS.includes(String(value)); }

// ---------- PKCE ----------
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function createCodeVerifier() { return toHex(crypto.getRandomValues(new Uint8Array(32))); }
export async function codeChallenge(verifier) {
  return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(verifier))));
}
export function createState() { return toHex(crypto.getRandomValues(new Uint8Array(32))); }
export const stateHash = state => sha256Hex(`oauth-state:${state}`);

// 승인 화면 주소. client id가 없으면 만들지 않는다(가짜 주소로 보내지 않는다).
export function authorizeUrl({ provider, clientId, redirectUri, state, challenge }) {
  if (!isProvider(provider)) throw new Error('지원하지 않는 소셜 로그인입니다.');
  if (!clientId) throw new Error(`${PROVIDER_LABELS[provider]} 설정값이 없어 시작할 수 없습니다.`);
  const url = new URL(AUTHORIZE[provider]);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', SCOPES[provider]);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

// 공급자가 준 사용자 정보에서 고유 식별자만 뽑는다. 토큰은 받지도 넘기지도 않는다.
export function normalizeProfile(provider, raw = {}) {
  if (provider === 'google') {
    const subject = String(raw.sub || '').trim();
    return subject ? { provider, providerSubject: subject, email: String(raw.email || '').trim().toLowerCase(), name: String(raw.name || '').trim() } : null;
  }
  if (provider === 'kakao') {
    const subject = raw.id === 0 || raw.id ? String(raw.id).trim() : '';
    const account = raw.kakao_account || {};
    return subject ? { provider, providerSubject: subject, email: String(account.email || '').trim().toLowerCase(), name: String(account.profile?.nickname || '').trim() } : null;
  }
  return null;
}

// 무엇을 할지 여기서 정한다. 이메일이 같다는 이유만으로는 절대 합치지 않는다.
export function decideIdentityAction({ mode, profile, existingIdentity = null, session = null }) {
  if (!profile?.providerSubject) return { action: 'reject', reason: '소셜 계정 정보를 확인하지 못했습니다.', status: 400 };
  if (!OAUTH_MODES.includes(mode)) return { action: 'reject', reason: '지원하지 않는 요청입니다.', status: 400 };

  if (mode === 'link') {
    // 로그인한 사람만 자기 계정에 연결한다. 남의 계정에는 붙일 수 없다.
    if (!session?.user?.id) return { action: 'reject', reason: '로그인한 뒤에 소셜 계정을 연결할 수 있습니다.', status: 401 };
    if (existingIdentity && existingIdentity.user_id !== session.user.id) {
      return { action: 'reject', reason: `이미 다른 계정에 연결된 ${PROVIDER_LABELS[profile.provider]} 계정입니다.`, status: 409 };
    }
    if (existingIdentity) return { action: 'alreadyLinked', userId: session.user.id };
    return { action: 'link', userId: session.user.id };
  }

  // 같은 소셜 계정으로 다시 들어오면 새로 만들지 않고 그 사용자로 로그인한다.
  if (existingIdentity) return { action: 'signIn', userId: existingIdentity.user_id };
  // 새 사람이다. 이메일이 기존 계정과 같아도 합치지 않고 새 계정을 만든다.
  return { action: 'createPending', role: SIGNUP_ROLE, status: SIGNUP_STATUS };
}

// 계정 행의 email은 로그인 식별용 내부 키로만 쓴다.
// 공급자가 준 이메일을 여기에 넣으면 users.email UNIQUE 때문에 다른 사람의 계정과 부딪히거나 합쳐진다.
// 실제 이메일은 user_identities.email에만 남긴다.
export function accountKeyEmail(provider, providerSubject) {
  return `${provider}_${String(providerSubject).replace(/[^a-z0-9]/gi, '').slice(0, 40)}@social.ms12.invalid`;
}

// 가입 후 최소 정보. 하나라도 비면 받지 않는다.
export function validateProfileForm(value = {}) {
  const errors = [];
  const name = String(value.name || '').trim();
  const phone = String(value.phone || '').trim();
  const orgName = String(value.orgName || '').trim();
  if (name.length < 2) errors.push('표시 이름을 2자 이상 입력해 주세요.');
  if (!/^[0-9][0-9\s-]{7,19}$/.test(phone)) errors.push('연락처를 숫자와 -만 써서 입력해 주세요.');
  if (orgName.length < 2) errors.push('기관명을 2자 이상 입력해 주세요.');
  if (typeof value.isContact !== 'boolean') errors.push('담당자 여부를 선택해 주세요.');
  if (value.agreeTerms !== true) errors.push('이용약관에 동의해야 합니다.');
  if (value.agreePrivacy !== true) errors.push('개인정보 수집·이용에 동의해야 합니다.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name: name.slice(0, 60), phone: phone.slice(0, 30), orgName: orgName.slice(0, 120), isContact: value.isContact } };
}
