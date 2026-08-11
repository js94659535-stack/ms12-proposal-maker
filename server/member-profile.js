// 회원이 직접 고치는 본인정보. 무엇을 고칠 수 있는지 여기 목록이 정한다.
// 역할·승인·이용권·프리미엄·사용량은 이 목록에 없으므로 본인이 바꿀 수 없다.

// users 표에 이미 있는 항목.
export const USER_FIELDS = Object.freeze([
  ['name', '담당자 이름', 60],
  ['phone', '연락처', 40],
  ['orgName', '기관명', 120]
]);

// member_profiles 표에 새로 두는 항목.
export const PROFILE_FIELDS = Object.freeze([
  ['orgType', '기관 유형', 60],
  ['orgAddress', '기관 주소', 200],
  ['orgIntro', '기관 소개', 1000],
  ['staff', '보유 인력', 1000],
  ['facilities', '시설과 장비', 1000],
  ['programs', '주요 프로그램', 2000],
  ['achievements', '사업 실적', 2000],
  ['partners', '협력기관', 1000],
  ['reuseNote', '계획서 작성에 재사용할 기관정보', 2000]
]);

export const EDITABLE_FIELDS = Object.freeze([...USER_FIELDS, ...PROFILE_FIELDS]);

// 회원이 절대 바꿀 수 없는 것. 요청에 들어와도 무시하고, 바꾸려 하면 거절한다.
export const LOCKED_FIELDS = Object.freeze([
  'role', 'status', 'plan', 'premium', 'premiumStatus', 'contract', 'trialUsed', 'trialUsedAt',
  'usage', 'usageCap', 'audit', 'id', 'email', 'userId', 'profileReviewNeeded'
]);

// 바뀌면 관리자·운영관리자가 다시 확인해야 하는 항목.
export const REVIEW_FIELDS = Object.freeze(['orgName', 'orgType', 'bizNumber']);

export const EMAIL_LOCKED = '로그인 이메일은 이 화면에서 바꿀 수 없습니다. 이메일 확인 절차가 준비되면 열립니다.';

const PHONE = /^[0-9+\-()\s]{7,40}$/;

export function validateMemberProfile(body = {}) {
  const errors = [];
  const value = {};
  for (const [key, label, max] of EDITABLE_FIELDS) {
    const text = String(body[key] ?? '').trim();
    if (text.length > max) errors.push(`${label}은(는) ${max}자까지 넣을 수 있습니다.`);
    value[key] = text.slice(0, max);
  }
  if (!value.name) errors.push('담당자 이름을 적어 주세요.');
  if (value.phone && !PHONE.test(value.phone)) errors.push('연락처는 숫자와 -, +, () 만 넣어 주세요.');
  // 이메일 확인 절차가 없으므로 로그인 이메일 변경 요청은 받지 않는다.
  if (body.email !== undefined) errors.push(EMAIL_LOCKED);
  const locked = LOCKED_FIELDS.filter(field => body[field] !== undefined);
  if (locked.length) errors.push('본인이 바꿀 수 없는 항목이 요청에 들어 있습니다.');
  return { ok: errors.length === 0, errors, value, locked };
}

// 무엇이 바뀌었는지만 낸다. 감사기록에는 항목 이름만 남기고 값은 남기지 않는다.
export function changedFields(before = {}, after = {}) {
  return EDITABLE_FIELDS
    .filter(([key]) => String(before[key] ?? '') !== String(after[key] ?? ''))
    .map(([key, label]) => ({ key, label }));
}

export function needsReview(changed = []) {
  return changed.some(field => REVIEW_FIELDS.includes(field.key));
}

// 감사기록에 남길 한 줄. 값·비밀번호·변경 전 원문은 넣지 않는다.
export function auditDetail(changed = []) {
  if (!changed.length) return '바뀐 항목 없음';
  return `변경 항목: ${changed.map(field => field.label).join('·')}`.slice(0, 200);
}

// 계획서 작성에 넘길 기관정보. 새로 만드는 문서부터 이 값을 쓴다.
// 이미 저장된 계획서는 이 값으로 다시 쓰지 않는다.
export function reusableProfile(profile = {}) {
  const facts = [
    ['기관명', profile.orgName], ['기관 유형', profile.orgType], ['기관 주소', profile.orgAddress],
    ['기관 소개', profile.orgIntro], ['보유 인력', profile.staff], ['시설과 장비', profile.facilities],
    ['주요 프로그램', profile.programs], ['사업 실적', profile.achievements], ['협력기관', profile.partners],
    ['추가 참고', profile.reuseNote]
  ].filter(([, value]) => String(value || '').trim());
  return { facts: facts.map(([label, value]) => ({ label, value: String(value).trim() })), updatedAt: profile.updatedAt || '' };
}
