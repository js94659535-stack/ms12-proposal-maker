// 일회용 계정 복구코드. 10분 유효·1회 사용·해시 저장.
// 운영관리자는 비밀번호를 보거나 정할 수 없고, 이 코드를 발급해 사용자가 직접 정하게만 한다.
import { sha256Hex } from './password.js';

export const RECOVERY_TTL_MINUTES = 10;
// 헷갈리는 0·O·1·I·L은 뺀다. 전화로 불러 줘도 잘못 적히지 않게 한다.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUPS = 3;
const GROUP_LENGTH = 4;
const CODE_LENGTH = GROUPS * GROUP_LENGTH;

// 나머지 연산의 치우침을 없애려고 알파벳 길이의 배수를 넘는 값은 버리고 다시 뽑는다.
export function newRecoveryCode() {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const letters = [];
  while (letters.length < CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(CODE_LENGTH))) {
      if (byte >= limit) continue;
      letters.push(ALPHABET[byte % ALPHABET.length]);
      if (letters.length === CODE_LENGTH) break;
    }
  }
  return Array.from({ length: GROUPS }, (_, index) => letters.slice(index * GROUP_LENGTH, (index + 1) * GROUP_LENGTH).join('')).join('-');
}

// 사용자가 소문자나 공백·붙임표를 섞어 넣어도 같은 코드로 본다.
export function normalizeRecoveryCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
}
export const recoveryCodeHash = code => sha256Hex(`recovery:${normalizeRecoveryCode(code)}`);

export async function purgeExpiredRecoveryCodes(db, now = new Date()) {
  await db.prepare('DELETE FROM account_recovery_codes WHERE expires_at < ?').bind(now.toISOString()).run();
}

// 발급. 아직 쓰지 않은 이전 코드는 함께 버려 언제나 한 장만 살아 있게 한다.
export async function issueRecoveryCode(db, { userId, issuedBy = '' }, now = new Date()) {
  await purgeExpiredRecoveryCodes(db, now);
  await revokeRecoveryCodes(db, userId);
  const code = newRecoveryCode();
  const expiresAt = new Date(now.getTime() + RECOVERY_TTL_MINUTES * 60_000).toISOString();
  await db.prepare(`INSERT INTO account_recovery_codes (id, user_id, code_hash, issued_by, created_at, expires_at, used_at)
    VALUES (?, ?, ?, ?, ?, ?, '')`)
    .bind(crypto.randomUUID(), userId, await recoveryCodeHash(code), issuedBy, now.toISOString(), expiresAt).run();
  // 원문은 이 반환값에만 있다. 저장소에는 해시만 남는다.
  return { code, expiresAt, minutes: RECOVERY_TTL_MINUTES };
}

export async function revokeRecoveryCodes(db, userId) {
  await db.prepare('DELETE FROM account_recovery_codes WHERE user_id = ?').bind(String(userId || '')).run();
}

// 확인과 소모를 한 번에 한다. 대상 계정이 다르거나 이미 썼거나 시간이 지났으면 받아들이지 않는다.
export async function consumeRecoveryCode(db, { userId, code }, now = new Date()) {
  const row = await db.prepare('SELECT id, user_id, expires_at, used_at FROM account_recovery_codes WHERE code_hash = ?')
    .bind(await recoveryCodeHash(code)).first();
  if (!row || row.user_id !== userId || row.used_at || !row.expires_at || row.expires_at <= now.toISOString()) return null;
  await db.prepare('UPDATE account_recovery_codes SET used_at = ? WHERE id = ?').bind(now.toISOString(), row.id).run();
  return { id: row.id };
}

// 운영 화면에 보여 줄 상태. 코드 값이나 해시는 내보내지 않는다.
export async function recoveryStatus(db, userId, now = new Date()) {
  const row = await db.prepare(`SELECT created_at, expires_at, used_at FROM account_recovery_codes
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`).bind(String(userId || '')).first();
  if (!row) return { issued: false, active: false, issuedAt: '', expiresAt: '', usedAt: '' };
  const active = !row.used_at && String(row.expires_at) > now.toISOString();
  return { issued: true, active, issuedAt: row.created_at, expiresAt: row.expires_at, usedAt: row.used_at || '' };
}
