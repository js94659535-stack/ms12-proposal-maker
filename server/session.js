// 세션 쿠키와 동일 출처 검사. 서버에서만 쓴다.
import { sha256Hex, toHex } from './password.js';
import { DEFAULT_PLAN } from './plan.js';

// __Host- 접두사는 Secure·Path=/·Domain 없음을 브라우저가 강제한다. 하위 도메인이 쿠키를 심을 수 없다.
export const SESSION_COOKIE = '__Host-ms12_session';
export const SESSION_HOURS = 12;
const TOKEN_BYTES = 32;
// 세션을 열어 줄 계정 상태. disabled는 어떤 경우에도 열지 않는다.
export const SESSION_STATUSES = new Set(['active', 'pending']);
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function newSessionToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}
export function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}
export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict`;
}
export function readSessionCookie(request) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=').trim();
  }
  return '';
}

// 상태를 바꾸는 요청은 같은 출처에서 온 것만 받는다. SameSite=Strict와 겹쳐 두 겹으로 막는다.
export function sameOriginRequest(request, url) {
  if (!STATE_CHANGING.has(request.method)) return true;
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin';
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  const referer = request.headers.get('referer');
  if (referer) { try { return new URL(referer).origin === url.origin; } catch { return false; } }
  // 출처를 확인할 근거가 하나도 없으면 통과시키지 않는다.
  return false;
}

export async function createSession(db, userId, now = new Date()) {
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3600_000).toISOString();
  await db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, now.toISOString(), expiresAt, now.toISOString()).run();
  return { token, expiresAt, maxAge: SESSION_HOURS * 3600 };
}

// 만료·비활성 계정은 세션이 있어도 통과시키지 않는다.
export async function loadSession(db, token, now = new Date()) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(`SELECT s.token_hash, s.expires_at, u.id AS user_id, u.email, u.role, u.org_id, u.name, u.status, u.plan, u.trial_used_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).bind(tokenHash).first();
  if (!row) return null;
  // pending은 가입 절차를 마치라고 붙여 둔 상태다. 세션은 열리지만 작업 API는 미들웨어가 막는다.
  if (!SESSION_STATUSES.has(row.status) || !row.expires_at || row.expires_at <= now.toISOString()) return null;
  return {
    tokenHash, expiresAt: row.expires_at,
    // 이용권은 요청마다 users 행에서 다시 읽는다. 관리자가 바꾸면 다시 로그인하지 않아도 곧바로 반영된다.
    user: {
      id: row.user_id, email: row.email, role: row.role, orgId: row.org_id || '', name: row.name || '', status: row.status,
      plan: row.plan || DEFAULT_PLAN, trialUsedAt: row.trial_used_at || ''
    }
  };
}

export async function touchSession(db, tokenHash, now = new Date()) {
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3600_000).toISOString();
  await db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?')
    .bind(now.toISOString(), expiresAt, tokenHash).run();
  return { expiresAt, maxAge: SESSION_HOURS * 3600 };
}
export async function destroySession(db, tokenHash) {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}
export async function purgeExpiredSessions(db, now = new Date()) {
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now.toISOString()).run();
}
