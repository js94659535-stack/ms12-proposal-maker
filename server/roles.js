// 역할 한 곳 정의. 화면과 서버가 같은 목록을 본다.
//
// 최고관리자(admin)   플랫폼 전체 관리·열람
// 운영관리자(operator) 최고관리자가 허용한 운영업무 수행
// 에이전트(agency)     자기 고객을 등록해 계획서 작성 대행
// 일반회원(customer)   자기 기관의 계획서를 직접 작성

export const ROLES = Object.freeze(['admin', 'operator', 'agency', 'customer']);

export const ROLE_LABEL = Object.freeze({
  admin: '최고관리자', operator: '운영관리자', agency: '에이전트', customer: '일반회원'
});

export const ROLE_DUTY = Object.freeze({
  admin: '플랫폼 전체 관리·열람',
  operator: '최고관리자가 허용한 운영업무 수행',
  agency: '자기 고객을 등록해 계획서 작성 대행',
  customer: '자기 기관의 계획서를 직접 작성'
});

// 관리자가 바꿔 줄 수 있는 역할. 최고관리자는 화면에서 넘겨주지 않는다.
// 에이전트(agency)은 여기에 없다. 임명 기록으로 정해지므로 「에이전트 관리」에서 다룬다.
export const ASSIGNABLE_ROLES = Object.freeze(['customer', 'operator']);

// 회원 쪽 역할. 자기 자료만 보고 쓴다.
export const MEMBER_ROLES = Object.freeze(['customer', 'agency']);
// 운영 쪽 역할. 관리자 포털에 들어간다.
export const STAFF_ROLES = Object.freeze(['admin', 'operator']);

export const isRole = value => ROLES.includes(String(value));
export const isMemberRole = value => MEMBER_ROLES.includes(String(value));
export const isStaffRole = value => STAFF_ROLES.includes(String(value));
// 에이전트는 여러 고객 기관을 등록해 그 기관 이름으로 계획서를 쓴다.
export const canHoldClients = value => String(value) === 'agency';
export const roleLabel = value => ROLE_LABEL[String(value)] || String(value || '');
