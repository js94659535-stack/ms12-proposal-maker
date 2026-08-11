// 이메일 가입 입력 검사. 브라우저와 서버가 같은 규칙을 쓰도록 한 곳에 둔다.
// 네이버·다음을 비롯해 어떤 이메일이든 받는다. 공급자를 가리지 않는다.
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;
export const SIGNUP_ROLE = 'customer';
export const SIGNUP_STATUS = 'pending';
// 소셜 계정 행의 내부 식별용 주소. 사람이 이 주소로 가입할 수는 없다.
const RESERVED_DOMAIN = '@social.ms12.invalid';
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase().slice(0, 200);
}

export function validateSignup(value = {}) {
  const email = normalizeEmail(value.email);
  const errors = [];
  if (!EMAIL.test(email) || email.endsWith(RESERVED_DOMAIN)) errors.push('이메일 주소를 정확히 입력해 주세요.');
  const password = validateNewPassword(value);
  errors.push(...(password.ok ? [] : password.errors));
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { email, password: password.value.password } };
}

// 비밀번호 규칙만 본다. 가입과 복구코드로 다시 정할 때가 같은 기준을 쓴다.
export function validateNewPassword(value = {}) {
  const email = normalizeEmail(value.email);
  const password = String(value.password ?? '');
  const confirm = String(value.passwordConfirm ?? '');
  const errors = [];
  if (password.length < PASSWORD_MIN) errors.push(`비밀번호는 ${PASSWORD_MIN}자 이상으로 정해 주세요.`);
  else if (password.length > PASSWORD_MAX) errors.push('비밀번호가 너무 깁니다.');
  else if (/^(.)\1*$/.test(password)) errors.push('같은 문자만 반복한 비밀번호는 쓸 수 없습니다.');
  else if (localPart(email) && password.toLowerCase().includes(localPart(email))) errors.push('비밀번호에 이메일 아이디를 그대로 넣을 수 없습니다.');
  if (confirm !== password) errors.push('비밀번호 확인이 일치하지 않습니다.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { password } };
}

function localPart(email) {
  const name = String(email).split('@')[0] || '';
  return name.length >= 4 ? name.toLowerCase() : '';
}
