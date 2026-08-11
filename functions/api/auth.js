// 로그인·로그아웃·현재 사용자. 세션 원문은 응답 본문에 담지 않고 쿠키로만 내보낸다.
import { PASSWORD_ALGO, constantTimeEqual, createPasswordRecord, derivePassword } from '../../server/password.js';
import { SESSION_STATUSES, clearedSessionCookie, createSession, destroySession, purgeExpiredSessions, sessionCookie, touchSession } from '../../server/session.js';
import { SIGNUP_ROLE, SIGNUP_STATUS, validateNewPassword, validateSignup } from '../../server/signup.js';
import { MAX_PER_CLIENT, MAX_PER_EMAIL, MAX_SIGNUP_PER_CLIENT, WINDOW_MINUTES, attemptWindowStart, clientAttemptHash, emailAttemptHash, signupClientHash, signupEmailHash } from '../../server/login-attempts.js';
import { consumeRecoveryCode, purgeExpiredRecoveryCodes, revokeRecoveryCodes } from '../../server/recovery.js';
import { recordAudit } from '../../server/audit.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
// 이메일이 있는지 없는지 알 수 없게 실패는 언제나 같은 문구를 쓴다.
const LOGIN_FAILED = '이메일 또는 비밀번호가 올바르지 않습니다.';
const THROTTLED = '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.';
const SIGNUP_THROTTLED = '가입 시도가 많습니다. 잠시 후 다시 시도해 주세요.';
// 복구코드도 같은 문구만 돌려준다. 코드가 틀렸는지 시간이 지났는지 알려 주지 않는다.
const RECOVERY_FAILED = '복구코드가 올바르지 않거나 사용 기한이 지났습니다. 운영관리자에게 새 코드를 요청해 주세요.';
// 가입 화면에서만 이메일 사용 여부를 알려 준다. 대신 한 곳에서 여러 번 두드리지 못하게 막는다.
const EMAIL_TAKEN = '이미 가입에 사용된 이메일입니다. 로그인하거나 다른 이메일을 사용해 주세요.';

export async function onRequest(context) {
  const { request, env, data } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }

  if (body.action === 'signup') return signup(env.ARCHIVE_DB, request, body);
  if (body.action === 'login') return login(env.ARCHIVE_DB, request, body);
  // 운영관리자가 발급한 일회용 코드로 사용자가 자기 비밀번호를 직접 정한다.
  if (body.action === 'recoverPassword') return recoverPassword(env.ARCHIVE_DB, request, body);
  if (body.action === 'logout') return logout(env.ARCHIVE_DB, data.session);
  if (body.action === 'me') return me(env.ARCHIVE_DB, data.session);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

// 어떤 이메일이든 스스로 가입한다. 다만 언제나 customer·pending으로만 만들어진다.
async function signup(db, request, body) {
  const checked = validateSignup(body);
  if (!checked.ok) return json({ error: checked.errors.join(' ') }, 400);

  const now = new Date();
  const clientHash = await signupClientHash(request.headers.get('cf-connecting-ip'));
  const emailHash = await signupEmailHash(checked.value.email);
  if (await signupThrottled(db, clientHash, now)) return json({ error: SIGNUP_THROTTLED }, 429);
  // 성공·실패를 가리지 않고 남긴다. 한 곳에서 계정을 대량으로 만들지 못하게 하는 것이 목적이다.
  await recordAttempt(db, emailHash, clientHash, now);

  const record = await createPasswordRecord(checked.value.password);
  const id = crypto.randomUUID();
  const iso = now.toISOString();
  try {
    await db.prepare(`INSERT INTO users (id, email, role, org_id, name, status, password_algo, password_iterations, password_salt, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, checked.value.email, SIGNUP_ROLE, SIGNUP_STATUS,
        record.password_algo, record.password_iterations, record.password_salt, record.password_hash, iso, iso).run();
  } catch {
    // email UNIQUE. 이미 있는 계정의 비밀번호는 건드리지 않는다.
    return json({ error: EMAIL_TAKEN }, 409);
  }

  const session = await createSession(db, id, now);
  return json({
    created: true,
    user: { id, email: checked.value.email, role: SIGNUP_ROLE, orgId: '', name: '', status: SIGNUP_STATUS }
  }, 200, { 'Set-Cookie': sessionCookie(session.token, session.maxAge) });
}

async function login(db, request, body) {
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const password = String(body.password || '');
  if (!email || !password) return json({ error: LOGIN_FAILED }, 401);

  const now = new Date();
  const emailHash = await emailAttemptHash(email);
  const clientHash = await clientAttemptHash(request.headers.get('cf-connecting-ip'));
  if (await throttled(db, emailHash, clientHash, now)) return json({ error: THROTTLED }, 429);

  const user = await db.prepare('SELECT id, email, role, org_id, name, status, password_algo, password_iterations, password_salt, password_hash FROM users WHERE email = ?')
    .bind(email).first();
  // 계정이 없어도 같은 만큼 계산해 응답 시간으로 존재 여부가 드러나지 않게 한다.
  const salt = user?.password_salt || decoySalt(emailHash);
  const iterations = Number(user?.password_iterations) || 600_000;
  let derived = '';
  try { derived = await derivePassword(password, { salt, iterations, algo: user?.password_algo || PASSWORD_ALGO }); }
  catch { derived = ''; }

  // 승인 대기 계정도 로그인은 된다. 작업 API는 미들웨어가 막는다. 중지된 계정은 들어오지 못한다.
  const ok = Boolean(user) && SESSION_STATUSES.has(user.status) && derived && constantTimeEqual(derived, user.password_hash);
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

// ---------- 일회용 복구코드로 비밀번호 다시 정하기 ----------
// 운영관리자는 이 값을 알 수 없다. 코드를 받은 사용자만 자기 비밀번호를 정한다.
async function recoverPassword(db, request, body) {
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const now = new Date();
  const emailHash = await emailAttemptHash(email);
  const clientHash = await clientAttemptHash(request.headers.get('cf-connecting-ip'));
  if (await throttled(db, emailHash, clientHash, now)) return json({ error: THROTTLED }, 429);

  // 비밀번호 규칙은 가입 때와 같다. 코드가 맞는지 보기 전에 먼저 검사한다.
  const checked = validateNewPassword({ email, password: body.password, passwordConfirm: body.passwordConfirm });
  if (!checked.ok) return json({ error: checked.errors.join(' ') }, 400);

  await purgeExpiredRecoveryCodes(db, now);
  const user = await db.prepare('SELECT id, email, role, org_id, name, status FROM users WHERE email = ?').bind(email).first();
  // 중지된 계정은 복구코드로도 열리지 않는다. 계정이 없을 때와 같은 문구를 쓴다.
  const usable = Boolean(user) && SESSION_STATUSES.has(user.status);
  const consumed = usable ? await consumeRecoveryCode(db, { userId: user.id, code: body.code }, now) : null;
  if (!consumed) {
    await recordAttempt(db, emailHash, clientHash, now);
    return json({ error: RECOVERY_FAILED }, 401);
  }

  const record = await createPasswordRecord(checked.value.password);
  await db.prepare(`UPDATE users SET password_algo = ?, password_iterations = ?, password_salt = ?, password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(record.password_algo, record.password_iterations, record.password_salt, record.password_hash, now.toISOString(), user.id).run();
  // 새 비밀번호를 정하면 쓰던 세션과 남은 복구코드를 모두 버린다.
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  await revokeRecoveryCodes(db, user.id);
  await clearAttempts(db, emailHash, clientHash);
  await recordAudit(db, { actor: { id: user.id, email: user.email, role: user.role }, action: 'recovery.redeem', targetId: user.id, targetEmail: user.email, detail: '사용자가 복구코드로 비밀번호를 다시 정함' }, now);
  // 새 비밀번호로 직접 로그인하게 한다. 여기서 세션을 열어 주지 않는다.
  return json({ ok: true, recovered: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
}

// ---------- 반복 실패 제한 ----------
async function throttled(db, emailHash, clientHash, now) {
  const since = attemptWindowStart(now);
  await db.prepare('DELETE FROM login_attempts WHERE at < ?').bind(since).run();
  const byEmail = await db.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE email_hash = ? AND at >= ?').bind(emailHash, since).first();
  if (Number(byEmail?.count || 0) >= MAX_PER_EMAIL) return true;
  const byClient = await db.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE client_hash = ? AND at >= ?').bind(clientHash, since).first();
  return Number(byClient?.count || 0) >= MAX_PER_CLIENT;
}
// 가입은 같은 곳에서 짧은 시간에 여러 번 하지 못한다.
async function signupThrottled(db, clientHash, now) {
  const since = attemptWindowStart(now);
  await db.prepare('DELETE FROM login_attempts WHERE at < ?').bind(since).run();
  const byClient = await db.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE client_hash = ? AND at >= ?').bind(clientHash, since).first();
  return Number(byClient?.count || 0) >= MAX_SIGNUP_PER_CLIENT;
}
async function recordAttempt(db, emailHash, clientHash, now) {
  await db.prepare('INSERT INTO login_attempts (id, email_hash, client_hash, at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), emailHash, clientHash, now.toISOString()).run();
}
async function clearAttempts(db, emailHash, clientHash) {
  await db.prepare('DELETE FROM login_attempts WHERE email_hash = ? OR client_hash = ?').bind(emailHash, clientHash).run();
}

// 계정이 없을 때 쓰는 가짜 salt. 이메일 해시에서 뽑아 같은 이메일이면 늘 같은 값이 나온다.
function decoySalt(emailHash) { return String(emailHash).slice(0, 32); }
function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, orgId: user.org_id || '', name: user.name || '', status: user.status };
}
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
