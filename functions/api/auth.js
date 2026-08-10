// 로그인·로그아웃·현재 사용자. 세션 원문은 응답 본문에 담지 않고 쿠키로만 내보낸다.
import { constantTimeEqual, derivePassword, sha256Hex } from '../../server/password.js';
import { clearedSessionCookie, createSession, destroySession, purgeExpiredSessions, sessionCookie, touchSession } from '../../server/session.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
// 이메일이 있는지 없는지 알 수 없게 실패는 언제나 같은 문구를 쓴다.
const LOGIN_FAILED = '이메일 또는 비밀번호가 올바르지 않습니다.';
const THROTTLED = '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.';
const WINDOW_MINUTES = 15;
const MAX_PER_EMAIL = 5;
const MAX_PER_CLIENT = 10;

export async function onRequest(context) {
  const { request, env, data } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }

  if (body.action === 'login') return login(env.ARCHIVE_DB, request, body);
  if (body.action === 'logout') return logout(env.ARCHIVE_DB, data.session);
  if (body.action === 'me') return me(env.ARCHIVE_DB, data.session);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

async function login(db, request, body) {
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const password = String(body.password || '');
  if (!email || !password) return json({ error: LOGIN_FAILED }, 401);

  const now = new Date();
  const emailHash = await sha256Hex(`email:${email}`);
  const clientHash = await sha256Hex(`client:${request.headers.get('cf-connecting-ip') || 'local'}`);
  if (await throttled(db, emailHash, clientHash, now)) return json({ error: THROTTLED }, 429);

  const user = await db.prepare('SELECT id, email, role, org_id, name, status, password_algo, password_iterations, password_salt, password_hash FROM users WHERE email = ?')
    .bind(email).first();
  // 계정이 없어도 같은 만큼 계산해 응답 시간으로 존재 여부가 드러나지 않게 한다.
  const salt = user?.password_salt || (await sha256Hex(`decoy:${email}`)).slice(0, 32);
  const iterations = Number(user?.password_iterations) || 600_000;
  let derived = '';
  try { derived = await derivePassword(password, { salt, iterations, algo: user?.password_algo || 'PBKDF2-HMAC-SHA256' }); }
  catch { derived = ''; }

  const ok = Boolean(user) && user.status === 'active' && derived && constantTimeEqual(derived, user.password_hash);
  if (!ok) {
    await recordAttempt(db, emailHash, clientHash, now);
    return json({ error: LOGIN_FAILED }, 401);
  }

  await purgeExpiredSessions(db, now);
  await clearAttempts(db, emailHash, clientHash);
  const session = await createSession(db, user.id, now);
  // 토큰은 Set-Cookie로만 나간다. 본문에는 넣지 않는다.
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookie(session.token, session.maxAge) });
}

async function logout(db, session) {
  if (session) await destroySession(db, session.tokenHash);
  return json({ ok: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
}

async function me(db, session) {
  if (!session) return json({ error: '로그인이 필요합니다.' }, 401);
  const renewed = await touchSession(db, session.tokenHash);
  return json({ user: session.user, expiresAt: renewed.expiresAt }, 200);
}

// ---------- 반복 실패 제한 ----------
async function throttled(db, emailHash, clientHash, now) {
  const since = new Date(now.getTime() - WINDOW_MINUTES * 60_000).toISOString();
  await db.prepare('DELETE FROM login_attempts WHERE at < ?').bind(since).run();
  const byEmail = await db.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE email_hash = ? AND at >= ?').bind(emailHash, since).first();
  if (Number(byEmail?.count || 0) >= MAX_PER_EMAIL) return true;
  const byClient = await db.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE client_hash = ? AND at >= ?').bind(clientHash, since).first();
  return Number(byClient?.count || 0) >= MAX_PER_CLIENT;
}
async function recordAttempt(db, emailHash, clientHash, now) {
  await db.prepare('INSERT INTO login_attempts (id, email_hash, client_hash, at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), emailHash, clientHash, now.toISOString()).run();
}
async function clearAttempts(db, emailHash, clientHash) {
  await db.prepare('DELETE FROM login_attempts WHERE email_hash = ? OR client_hash = ?').bind(emailHash, clientHash).run();
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, orgId: user.org_id || '', name: user.name || '' };
}
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
