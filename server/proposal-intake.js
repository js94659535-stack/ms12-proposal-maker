// 제안서 작성정보. 여러 쪽을 쓰려면 아이디어·목적·쪽수만으로는 모자란다.
//
// 그렇다고 처음부터 긴 설문을 펼치지 않는다. 공고문과 저장된 기관정보에서 이미 확인되는 것은
// 채워 두고 다시 묻지 않으며, 비어 있는 것만 한 번에 다섯 개까지 묻는다.
// 확인되지 않은 수치·실적·기관·법령·예산은 만들지 않고 [확인 필요]로 남긴다.

export const UNKNOWN = '[확인 필요]';
export const MAX_QUESTIONS = 5;

// 물어볼 항목. step이 낮을수록 먼저 묻는다.
export const INTAKE_FIELDS = Object.freeze([
  { key: 'problem', step: 1, label: '해결하려는 문제', hint: '무엇이 문제인지 한두 문장으로', required: true },
  { key: 'problemEvidence', step: 1, label: '문제를 뒷받침하는 확인된 근거', hint: '통계·조사·상담기록 등 출처가 있는 것만', required: true },
  { key: 'audience', step: 1, label: '대상', hint: '누구를 위한 사업인지', required: true },
  { key: 'audienceCount', step: 2, label: '예상 인원', hint: '숫자를 모르면 비워 두세요', required: true, numeric: true },
  { key: 'selection', step: 2, label: '대상 선정방법', hint: '어떻게 뽑는지', required: true },
  { key: 'period', step: 2, label: '사업 기간', hint: '시작~종료', required: true },
  { key: 'sessions', step: 2, label: '회기·횟수', hint: '주 1회 12회기 등', required: true },
  { key: 'place', step: 3, label: '장소', hint: '어디에서 하는지', required: true },
  { key: 'activities', step: 3, label: '핵심 활동', hint: '실제로 무엇을 하는지', required: true },
  { key: 'staff', step: 3, label: '담당 인력', hint: '누가 맡는지·자격', required: true },
  { key: 'partners', step: 3, label: '협력기관', hint: '없으면 없음이라고 적어 주세요', required: false },
  { key: 'budgetLimit', step: 4, label: '예산 한도', hint: '공고에 적힌 상한', required: true, numeric: true },
  { key: 'selfFunding', step: 4, label: '자부담 가능 여부', hint: '가능 금액 또는 불가', required: true },
  { key: 'outcome', step: 5, label: '기대 변화', hint: '끝나면 무엇이 달라지는지', required: true },
  { key: 'indicator', step: 5, label: '성과지표', hint: '무엇으로 재는지', required: true },
  { key: 'measurement', step: 5, label: '측정방법', hint: '언제 어떻게 재는지', required: true },
  { key: 'difference', step: 5, label: '기존 사업과 다른 점', hint: '왜 이 사업이어야 하는지', required: false }
]);

const text = value => String(value ?? '').trim();
const filled = value => Boolean(text(value)) && text(value) !== UNKNOWN;

// 공고문에서 확실히 읽히는 것만 가져온다. 애매하면 가져오지 않는다.
export function fromNotice(notice = {}) {
  const found = {};
  if (text(notice.supportLimit)) found.budgetLimit = { value: text(notice.supportLimit), source: '공고문 지원한도' };
  if (text(notice.eligibility)) found.audience = { value: text(notice.eligibility), source: '공고문 신청대상' };
  if (text(notice.applicationPeriod)) found.period = { value: text(notice.applicationPeriod), source: '공고문 사업기간' };
  return found;
}

// 저장된 기관정보에서 확인된 항목만 가져온다. 「확인 필요」 항목은 가져오지 않는다.
export function fromApplicant(applicant = {}) {
  const items = Array.isArray(applicant?.items) ? applicant.items : [];
  const confirmed = items.filter(item => item.status === '확인됨');
  const pick = (areas, labels) => confirmed.find(item => areas.includes(item.area) && labels.some(word => String(item.label).includes(word)));
  const found = {};
  const staff = pick(['staff'], ['인력', '담당', '자격']);
  if (staff) found.staff = { value: text(staff.value), source: `신청기관 확인 항목 · ${staff.label}` };
  const partners = pick(['partners'], ['협력', '협약']);
  if (partners) found.partners = { value: text(partners.value), source: `신청기관 확인 항목 · ${partners.label}` };
  const place = pick(['facilities'], ['공간', '시설', '장소']);
  if (place) found.place = { value: text(place.value), source: `신청기관 확인 항목 · ${place.label}` };
  return found;
}

// 지금 무엇을 알고 무엇을 모르는지 정리한다.
export function intakeState({ answers = {}, notice = {}, applicant = {} } = {}) {
  const auto = { ...fromNotice(notice), ...fromApplicant(applicant) };
  const fields = INTAKE_FIELDS.map(field => {
    const answered = filled(answers[field.key]);
    const prefill = auto[field.key];
    return {
      ...field,
      value: answered ? text(answers[field.key]) : text(prefill?.value || ''),
      // 회원이 직접 적었는지, 공고·기관정보에서 온 것인지 구분해 둔다.
      origin: answered ? 'member' : prefill ? 'auto' : '',
      source: answered ? '' : prefill?.source || '',
      known: answered || Boolean(prefill?.value)
    };
  });
  const missing = fields.filter(field => field.required && !field.known);
  return {
    fields,
    // 이미 아는 것은 다시 묻지 않는다.
    prefilled: fields.filter(field => field.origin === 'auto').map(field => ({ key: field.key, label: field.label, source: field.source })),
    missing: missing.map(field => field.key),
    // 한 번에 다섯 개까지만 묻는다. 낮은 단계부터.
    ask: missing.sort((left, right) => left.step - right.step).slice(0, MAX_QUESTIONS)
      .map(field => ({ key: field.key, step: field.step, label: field.label, hint: field.hint, numeric: Boolean(field.numeric) })),
    remaining: Math.max(0, missing.length - MAX_QUESTIONS),
    ready: missing.length === 0
  };
}

// 계획서에 넘길 값. 모르는 것은 지어내지 않고 [확인 필요]로 남긴다.
export function intakeFacts(state) {
  return Object.fromEntries((state?.fields || []).map(field => [field.key, field.known ? field.value : UNKNOWN]));
}

// 수치는 특히 조심한다. 숫자 칸에 숫자가 없으면 확인 필요로 되돌린다.
export function checkNumbers(state) {
  return (state?.fields || [])
    .filter(field => field.numeric && field.known && !/\d/.test(field.value))
    .map(field => ({ key: field.key, label: field.label, value: field.value, note: '숫자를 확인할 수 없어 [확인 필요]로 둡니다.' }));
}
