// Google·카카오 회원가입과 계정 연결. 공급자 토큰은 받아 쓰고 버리며 어디에도 저장하지 않는다.
// 실제 교환은 exchangeCode로 분리해 두어 fixture로 그대로 시험할 수 있다.
import {
  CONSENT_VERSIONS, PROVIDER_LABELS, SIGNUP_ROLE, SIGNUP_STATUS, STATE_MINUTES,
  authorizeUrl, codeChallenge, createCodeVerifier, createState, decideIdentityAction,
  accountKeyEmail, isProvider, normalizeProfile, stateHash
} from '../../server/social-identity.js';
import { createSession, sessionCookie } from '../../server/session.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const CALLBACK_PATH = '/?oauth=callback';

export function onRequest(context) {
  return handleOAuthRequest(context, { exchangeCode });
}

export async function handleOAuthRequest(context, deps = {}) {
  const { request, env, data } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }
  if (body.action === 'start') return start(env, request, body, data.session);
  if (body.action === 'callback') return callback(env, request, body, data.session, deps);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

// 1) 승인 화면으로 보내기 전에 state와 PKCE를 만들어 서버에만 남긴다.
async function start(env, request, body, session) {
  const provider = String(body.provider || '');
  const mode = body.mode === 'link' ? 'link' : 'signup';
  if (!isProvider(provider)) return json({ error: '지원하지 않는 소셜 로그인입니다.' }, 400);
  if (mode === 'link' && !session?.user?.id) return json({ error: '로그인한 뒤에 소셜 계정을 연결할 수 있습니다.' }, 401);

  const clientId = providerConfig(env, provider).clientId;
  if (!clientId) return json({ error: `${PROVIDER_LABELS[provider]} 로그인 설정이 아직 등록되지 않았습니다.` }, 503);

  const now = new Date();
  const state = createState();
  const verifier = createCodeVerifier();
  const redirectUri = new URL(CALLBACK_PATH, new URL(request.url).origin).toString();
  await env.ARCHIVE_DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(now.toISOString()).run();
  await env.ARCHIVE_DB.prepare(`INSERT INTO oauth_states (state_hash, provider, code_verifier, mode, link_user_id, redirect_uri, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(await stateHash(state), provider, verifier, mode, mode === 'link' ? session.user.id : '', redirectUri,
      now.toISOString(), new Date(now.getTime() + STATE_MINUTES * 60_000).toISOString()).run();

  return json({ authorizeUrl: authorizeUrl({ provider, clientId, redirectUri, state, challenge: await codeChallenge(verifier) }), mode }, 200);
}

// 2) 돌아온 code를 확인한다. state가 없거나 만료됐거나 provider가 다르면 여기서 끝난다.
async function callback(env, request, body, session, deps) {
  const code = String(body.code || '');
  const state = String(body.state || '');
  // 어느 공급자인지는 저장해 둔 state 기록이 알고 있다. 브라우저 값을 믿지 않는다.
  const claimed = String(body.provider || '');
  if (!code || !state) return json({ error: '소셜 로그인 요청이 올바르지 않습니다.' }, 400);

  const now = new Date();
  const hash = await stateHash(state);
  const record = await env.ARCHIVE_DB.prepare('SELECT * FROM oauth_states WHERE state_hash = ?').bind(hash).first();
  // state는 한 번만 쓴다. 확인 결과와 상관없이 지운다.
  await env.ARCHIVE_DB.prepare('DELETE FROM oauth_states WHERE state_hash = ?').bind(hash).run();
  if (!record) return json({ error: '만료되었거나 확인할 수 없는 로그인 요청입니다. 다시 시도해 주세요.' }, 400);
  const provider = record.provider;
  if (!isProvider(provider) || (claimed && claimed !== provider)) {
    return json({ error: '만료되었거나 확인할 수 없는 로그인 요청입니다. 다시 시도해 주세요.' }, 400);
  }
  if (record.expires_at <= now.toISOString()) return json({ error: '로그인 요청 유효시간이 지났습니다. 다시 시도해 주세요.' }, 400);
  if (record.mode === 'link' && record.link_user_id !== (session?.user?.id || '')) {
    return json({ error: '연결을 시작한 계정으로 로그인한 상태에서만 마칠 수 있습니다.' }, 401);
  }

  // 공급자와의 교환. 결과에서 고유 식별자만 꺼내 쓰고 토큰은 돌려받은 자리에서 버린다.
  let profile;
  try {
    const raw = await (deps.exchangeCode || exchangeCode)({
      provider, code, codeVerifier: record.code_verifier, redirectUri: record.redirect_uri, config: providerConfig(env, provider)
    });
    profile = normalizeProfile(provider, raw);
  } catch {
    return json({ error: `${PROVIDER_LABELS[provider]} 인증을 마치지 못했습니다.` }, 502);
  }
  if (!profile) return json({ error: '소셜 계정 정보를 확인하지 못했습니다.' }, 400);

  const existingIdentity = await env.ARCHIVE_DB.prepare('SELECT id, user_id FROM user_identities WHERE provider = ? AND provider_subject = ?')
    .bind(provider, profile.providerSubject).first();
  const decision = decideIdentityAction({ mode: record.mode, profile, existingIdentity, session });
  if (decision.action === 'reject') return json({ error: decision.reason }, decision.status);

  if (decision.action === 'alreadyLinked') return json({ linked: true, provider, alreadyLinked: true }, 200);
  if (decision.action === 'link') {
    await insertIdentity(env.ARCHIVE_DB, decision.userId, profile, now);
    return json({ linked: true, provider }, 200);
  }

  let userId = decision.userId;
  if (decision.action === 'createPending') {
    // 이메일이 같아도 기존 계정에 붙이지 않는다. 언제나 새 계정을 customer·pending으로 만든다.
    userId = crypto.randomUUID();
    await env.ARCHIVE_DB.prepare(`INSERT INTO users (id, email, role, org_id, name, status, created_at, updated_at)
      VALUES (?, ?, ?, '', ?, ?, ?, ?)`)
      .bind(userId, accountKeyEmail(provider, profile.providerSubject), SIGNUP_ROLE, profile.name || '', SIGNUP_STATUS,
        now.toISOString(), now.toISOString()).run();
    await insertIdentity(env.ARCHIVE_DB, userId, profile, now);
  }

  // 기존 세션 구조를 그대로 쓴다. 비밀번호 로그인과 같은 쿠키다.
  const created = await createSession(env.ARCHIVE_DB, userId, now);
  const user = await env.ARCHIVE_DB.prepare('SELECT id, email, role, org_id, name, status, profile_completed_at FROM users WHERE id = ?').bind(userId).first();
  return json({
    signedIn: true, provider, created: decision.action === 'createPending',
    user: { id: user.id, email: user.email, role: user.role, orgId: user.org_id || '', name: user.name || '', status: user.status, profileCompleted: Boolean(user.profile_completed_at) },
    consent: CONSENT_VERSIONS
  }, 200, { 'Set-Cookie': sessionCookie(created.token, created.maxAge) });
}

async function insertIdentity(db, userId, profile, now) {
  await db.prepare('INSERT INTO user_identities (id, user_id, provider, provider_subject, email, linked_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, profile.provider, profile.providerSubject, profile.email || '', now.toISOString()).run();
}

export function providerConfig(env = {}, provider) {
  if (provider === 'google') return { clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '' };
  return { clientId: env.KAKAO_REST_API_KEY || '', clientSecret: env.KAKAO_CLIENT_SECRET || '' };
}

// 실제 교환. 받은 토큰은 이 함수 안에서만 쓰고 돌려주지 않는다.
const TOKEN_URL = { google: 'https://oauth2.googleapis.com/token', kakao: 'https://kauth.kakao.com/oauth/token' };
const PROFILE_URL = { google: 'https://openidconnect.googleapis.com/v1/userinfo', kakao: 'https://kapi.kakao.com/v2/user/me' };
async function exchangeCode({ provider, code, codeVerifier, redirectUri, config }) {
  const form = new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, redirect_uri: redirectUri, code, code_verifier: codeVerifier });
  if (config.clientSecret) form.set('client_secret', config.clientSecret);
  const tokenResponse = await fetch(TOKEN_URL[provider], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  if (!tokenResponse.ok) throw new Error('token exchange failed');
  const accessToken = (await tokenResponse.json())?.access_token;
  if (!accessToken) throw new Error('no access token');
  const profileResponse = await fetch(PROFILE_URL[provider], { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!profileResponse.ok) throw new Error('profile fetch failed');
  return profileResponse.json();
  // accessToken은 이 함수가 끝나면 사라진다. 반환값·D1·로그 어디에도 넣지 않는다.
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
