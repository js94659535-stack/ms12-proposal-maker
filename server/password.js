// 비밀번호 해싱. Cloudflare Workers와 Node가 같은 WebCrypto를 쓰므로 관리자 생성 스크립트와 서버가 같은 코드를 탄다.
export const PASSWORD_ALGO = 'PBKDF2-HMAC-SHA256';
export const PASSWORD_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

export function toHex(bytes) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export function fromHex(value) {
  const text = String(value || '');
  const out = new Uint8Array(Math.floor(text.length / 2));
  for (let index = 0; index < out.length; index += 1) out[index] = parseInt(text.slice(index * 2, index * 2 + 2), 16);
  return out;
}
export function newSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

// 반복 횟수는 사용자 행에 적힌 값을 그대로 쓴다. 값을 올려도 기존 계정이 열린다.
export async function derivePassword(password, { salt, iterations = PASSWORD_ITERATIONS, algo = PASSWORD_ALGO } = {}) {
  if (algo !== PASSWORD_ALGO) throw new Error('지원하지 않는 비밀번호 해시 방식입니다.');
  if (!salt) throw new Error('salt가 필요합니다.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: Number(iterations) }, key, KEY_BITS);
  return toHex(bits);
}

export async function createPasswordRecord(password) {
  const salt = newSalt();
  return {
    password_algo: PASSWORD_ALGO, password_iterations: PASSWORD_ITERATIONS, password_salt: salt,
    password_hash: await derivePassword(password, { salt })
  };
}

// 길이 정보가 새어 나가지 않도록 항상 같은 만큼 비교한다.
export function constantTimeEqual(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) diff |= a.charCodeAt(index % (a.length || 1)) ^ b.charCodeAt(index % (b.length || 1));
  return diff === 0;
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return toHex(digest);
}
