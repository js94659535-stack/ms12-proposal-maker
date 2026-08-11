// 로그인·가입 반복 시도 제한. 로그인 화면과 운영 화면이 같은 기준을 쓰도록 한 곳에 둔다.
// 어떤 계정을 노렸는지 알 수 없게 이메일은 해시로만 센다.
import { sha256Hex } from './password.js';

export const WINDOW_MINUTES = 15;
export const MAX_PER_EMAIL = 5;
export const MAX_PER_CLIENT = 10;
export const MAX_SIGNUP_PER_CLIENT = 3;

export const emailAttemptHash = email => sha256Hex(`email:${String(email || '').trim().toLowerCase()}`);
export const clientAttemptHash = ip => sha256Hex(`client:${ip || 'local'}`);
export const signupEmailHash = email => sha256Hex(`signup-email:${String(email || '').trim().toLowerCase()}`);
export const signupClientHash = ip => sha256Hex(`signup:${ip || 'local'}`);

export const attemptWindowStart = (now = new Date()) => new Date(now.getTime() - WINDOW_MINUTES * 60_000).toISOString();

// 계정(이메일) 기준 잠금만 푼다. 같은 IP에서 온 시도 기록은 누구 것인지 알 수 없어 건드리지 않는다.
export async function unlockEmailAttempts(db, email) {
  await db.prepare('DELETE FROM login_attempts WHERE email_hash = ?').bind(await emailAttemptHash(email)).run();
}

// 계정별 최근 실패 횟수와 잠금 여부. 이메일 해시로만 맞춰 본다.
export async function loginLockState(db, emailHashes, now = new Date()) {
  const since = attemptWindowStart(now);
  const rows = await db.prepare(`SELECT email_hash, COUNT(*) AS count, MAX(at) AS last_at
    FROM login_attempts WHERE at >= ? GROUP BY email_hash`).bind(since).all();
  const byHash = new Map((rows?.results || []).map(row => [row.email_hash, { count: Number(row.count || 0), lastAt: row.last_at || '' }]));
  const state = new Map();
  for (const [id, hash] of emailHashes) {
    const found = byHash.get(hash) || { count: 0, lastAt: '' };
    state.set(id, { failures: found.count, lastFailureAt: found.lastAt, locked: found.count >= MAX_PER_EMAIL, windowMinutes: WINDOW_MINUTES });
  }
  return state;
}
