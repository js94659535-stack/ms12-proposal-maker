// 프리미엄회원(정식 수주회원) 규칙. 화면 표시가 아니라 서버가 이 판정으로 막는다.
//
// 사용자에게는 「프리미엄회원」, 관리자·운영관리자 화면에서는 「정식 수주회원」으로 부른다.
// 월간 이용권(users.plan)과는 별개다. 계약 시작일·종료일·진행상태를 따로 관리한다.

export const PREMIUM_LABEL = '프리미엄회원';
export const PREMIUM_ADMIN_LABEL = '정식 수주회원';

export const CONTRACT_STATUSES = Object.freeze(['active', 'suspended', 'ended']);
export const CONTRACT_STATUS_LABELS = Object.freeze({
  active: '계약 진행 중', suspended: '중지', ended: '계약 종료'
});
// 전문가 작업 진행상태. 운영관리자가 바꿀 수 있고 권한과는 무관하다.
export const PROGRESS_STEPS = Object.freeze(['접수', '자료확인', '작성중', '검토중', '수정중', '전달완료', '보류']);

// 공개용 우수 제안서는 최대 다섯 편까지만 공개한다.
export const SHOWCASE_LIMIT = 5;

export const NEED_PREMIUM = `${PREMIUM_LABEL}에게만 열리는 기능입니다. 계약 문의로 연락해 주세요.`;
export const CONTRACT_ENDED = '계약이 종료되어 새로운 전문 작업은 시작할 수 없습니다. 이미 전달된 결과물은 그대로 보실 수 있습니다.';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// 계약 한 건의 실제 상태. 종료일이 지나면 저장된 값이 active여도 종료로 본다.
export function contractState(contract, at = today()) {
  if (!contract) return { premium: false, status: '', label: '', readOnly: false, canStartWork: false, expired: false };
  const stored = CONTRACT_STATUSES.includes(contract.status) ? contract.status : 'active';
  const endsOn = DATE.test(String(contract.endsOn || '')) ? contract.endsOn : '';
  const startsOn = DATE.test(String(contract.startedOn || '')) ? contract.startedOn : '';
  const expired = Boolean(endsOn) && endsOn < at;
  const notStarted = Boolean(startsOn) && startsOn > at;
  const status = stored === 'active' && expired ? 'ended' : stored;
  // 종료·중지여도 프리미엄 화면은 열어 둔다. 이미 전달한 결과물을 읽을 수 있어야 한다.
  return {
    premium: true,
    status,
    label: CONTRACT_STATUS_LABELS[status] || status,
    expired,
    notStarted,
    readOnly: status !== 'active' || notStarted,
    // 새 전문 작업을 시작할 수 있는지. 진행 중인 계약이고 기간 안일 때만 참이다.
    canStartWork: status === 'active' && !notStarted
  };
}

// 프리미엄 화면(우수 제안서·수집 이력·내 계약)에 들어갈 수 있는가.
// 관리자·운영관리자는 운영 목적으로 함께 본다.
export function canViewPremium(user, contract) {
  if (['admin', 'operator'].includes(user?.role)) return true;
  return contractState(contract).premium;
}

// 새 전문 작업을 시작할 수 있는가. 계약이 끝났으면 읽기만 남는다.
export function canStartPremiumWork(user, contract) {
  if (['admin', 'operator'].includes(user?.role)) return true;
  return contractState(contract).canStartWork;
}

export function premiumRefusal(user, contract) {
  if (canViewPremium(user, contract)) return null;
  return { status: 403, error: NEED_PREMIUM, needsPremium: true };
}

export function validateContract(value = {}) {
  const errors = [];
  const status = CONTRACT_STATUSES.includes(value.status) ? value.status : 'active';
  const startedOn = String(value.startedOn || '').trim();
  const endsOn = String(value.endsOn || '').trim();
  if (startedOn && !DATE.test(startedOn)) errors.push('계약 시작일은 YYYY-MM-DD 형식으로 적어 주세요.');
  if (endsOn && !DATE.test(endsOn)) errors.push('계약 종료일은 YYYY-MM-DD 형식으로 적어 주세요.');
  if (startedOn && endsOn && endsOn < startedOn) errors.push('계약 종료일이 시작일보다 앞설 수 없습니다.');
  const progress = PROGRESS_STEPS.includes(value.progress) ? value.progress : '접수';
  return {
    ok: errors.length === 0,
    errors,
    value: {
      status, startedOn, endsOn, progress,
      progressNote: String(value.progressNote || '').trim().slice(0, 300),
      contractName: String(value.contractName || '').trim().slice(0, 120)
    }
  };
}

// ---------- 공개용 우수 제안서 ----------

// 사람·기관을 특정할 수 있는 표기. 공개 사본에 남아 있으면 관리자에게 알린다.
const IDENTIFIERS = [
  ['전화번호', /(?:\+?82[-\s]?)?0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}/],
  ['이메일', /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ['주민등록번호', /\d{6}\s?-\s?[1-4]\d{6}/],
  ['사업자·고유번호', /\d{3}\s?-\s?\d{2}\s?-\s?\d{5}|\d{3}\s?-\s?\d{3}\s?-\s?\d{5}/],
  ['주소', /(?:[가-힣]+(?:시|도)\s+)?[가-힣]+(?:구|군|시)\s+[가-힣0-9]+(?:로|길)\s?\d+/],
  // 「○○지역아동센터」처럼 가린 이름도 기관명으로 본다. 관리자가 직접 지우고 저장하게 하려는 것이다.
  ['기관명', /[가-힣A-Za-z0-9○△□×*·]{2,20}(?:재단|복지관|센터|법인|협회|어린이집|학교|병원|교회|조합)/]
];

// 공개 사본에 식별정보가 남았는지 본다. 저장을 막지는 않고 무엇이 남았는지 알려 준다.
export function findIdentifiers(value) {
  const text = String(value || '');
  return IDENTIFIERS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

export const SHOWCASE_FIELDS = Object.freeze([
  ['title', '제목', 120],
  ['field', '제안 분야', 80],
  ['purpose', '제안 목적', 400],
  ['audience', '대상', 200],
  ['structure', '핵심 사업구조', 1200],
  ['outcomeDesign', '성과설계 방식', 1200],
  ['body', '공개 가능한 범위의 본문', 8000]
]);

export function validateShowcase(value = {}) {
  const errors = [];
  const clean = {};
  for (const [key, label, max] of SHOWCASE_FIELDS) {
    const text = String(value[key] ?? '').trim();
    if (text.length > max) errors.push(`${label}은(는) ${max}자까지 넣을 수 있습니다.`);
    clean[key] = text.slice(0, max);
  }
  if (!clean.title) errors.push('제목을 적어 주세요.');
  if (!clean.field) errors.push('제안 분야를 적어 주세요.');
  if (!clean.body) errors.push('공개할 본문을 적어 주세요.');
  // 식별정보는 관리자가 지운 뒤 저장하게 한다. 자동으로 지우면 지워진 줄 착각한다.
  const found = findIdentifiers(Object.values(clean).join('\n'));
  if (found.length) errors.push(`식별정보로 보이는 내용이 남아 있습니다(${found.join('·')}). 지우고 다시 저장해 주세요.`);
  return { ok: errors.length === 0, errors, value: clean, identifiers: found };
}

// 회원에게 보내는 모양. 원본 식별자·작성자·내부 메모는 넣지 않는다.
export function publicShowcase(row) {
  return {
    id: row.id, title: row.title || '', field: row.field || '', purpose: row.purpose || '',
    audience: row.audience || '', structure: row.structure || '', outcomeDesign: row.outcome_design || row.outcomeDesign || '',
    body: row.body || '', order: Number(row.sort_order ?? row.order ?? 0),
    // 원본 파일 내려받기는 열지 않는다. 화면 열람만 한다.
    downloadable: false
  };
}
