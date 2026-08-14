// 세션 쿠키와 동일 출처 검사. 서버에서만 쓴다.
import { sha256Hex, toHex } from './password.js';
import { DEFAULT_PLAN } from './plan.js';

// __Host- 접두사는 Secure·Path=/·Domain 없음을 브라우저가 강제한다. 하위 도메인이 쿠키를 심을 수 없다.
export const SESSION_COOKIE = '__Host-ms12_session';
export const SESSION_HOURS = 12;
const TOKEN_BYTES = 32;
// 세션을 열어 줄 계정 상태. disabled는 어떤 경우에도 열지 않는다.
// 로그인과 복구코드가 열리는 상태. 중지된 계정은 여기에 없으므로 새로 로그인할 수 없다.
export const SESSION_STATUSES = new Set(['active', 'pending']);
// 이미 있던 세션을 읽을 수 있는 상태. 중지된 계정도 세션은 읽히지만 미들웨어가 작업 경로를 모두 막는다.
// 그래야 「이용이 중지되었습니다」를 화면에 알려 줄 수 있다. 로그인 자체는 위 목록이 막는다.
export const SESSION_VIEW_STATUSES = new Set(['active', 'pending', 'disabled']);
// DB의 disabled는 화면에서 「이용 중지」로 부른다.
export const isSuspended = status => String(status) === 'disabled';
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
// 임명이 살아 있는 동안만 에이전트로 읽는다. 운영 계정의 역할은 바꾸지 않는다.
function roleWithAgency(row) {
  if (row.role === 'admin' || row.role === 'operator') return row.role;
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const live = row.agency_status === 'active'
    && (!row.agency_starts_on || today >= row.agency_starts_on)
    && (!row.agency_ends_on || today <= row.agency_ends_on);
  return live ? 'agency' : row.role;
}

export async function loadSession(db, token, now = new Date()) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(`SELECT s.token_hash, s.expires_at, s.created_at, u.id AS user_id, u.email, u.role, u.org_id, u.name, u.status, u.plan, u.trial_used_at,
      g.status AS agency_status, g.starts_on AS agency_starts_on, g.ends_on AS agency_ends_on
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN agency_grants g ON g.user_id = u.id
    WHERE s.token_hash = ?`).bind(tokenHash).first();
  if (!row) return null;
  // pending은 가입 절차를 마치라고 붙여 둔 상태다. 세션은 열리지만 작업 API는 미들웨어가 막는다.
  if (!SESSION_VIEW_STATUSES.has(row.status) || !row.expires_at || row.expires_at <= now.toISOString()) return null;
  return {
    tokenHash, expiresAt: row.expires_at,
    // 중지된 계정인지. 미들웨어가 이 값으로 작업 경로를 막는다.
    suspended: isSuspended(row.status),
    // 세션이 언제 만들어졌는지. 되돌릴 수 없는 작업은 「방금 로그인했는가」를 함께 본다.
    createdAt: row.created_at || '',
    // 이용권은 요청마다 users 행에서 다시 읽는다. 관리자가 바꾸면 다시 로그인하지 않아도 곧바로 반영된다.
    user: {
      id: row.user_id, email: row.email, role: roleWithAgency(row), orgId: row.org_id || '', name: row.name || '', status: row.status,
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
