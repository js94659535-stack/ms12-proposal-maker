// 운영관리자가 할 수 있는 일과 할 수 없는 일. 화면이 아니라 서버가 이 목록으로 막는다.
export const OPERATOR_ROLES = new Set(['operator', 'admin']);

// 운영관리자가 실제로 실행할 수 있는 동작.
export const OPERATOR_ACTIONS = new Set([
  'overview',      // 회원 목록·검색·감사기록을 한 번에 읽는다
  'userDetail',    // 한 계정의 상태·이용 흔적·최근 오류
  'approveUser',   // 승인(대기 → 이용 중)
  'disableUser',   // 중지(+ 쓰던 세션 종료)
  'reactivateUser',// 재활성화(중지 → 이용 중)
  'unlockLogin',   // 로그인 잠금 해제
  'endSessions',   // 전체 세션 종료
  'issueRecoveryCode' // 일회용 계정 복구코드 발급
]);

// 운영관리자 권한으로는 서버에서 거절하는 동작. 화면에 버튼이 없더라도 여기서 다시 막는다.
export const BLOCKED_ACTIONS = new Map([
  ['setRole', '역할 변경'],
  ['grantOperator', '운영관리자 지정'],
  ['revokeOperator', '운영관리자 해제'],
  ['setPassword', '비밀번호 직접 지정'],
  ['viewPassword', '비밀번호 조회'],
  ['deleteUser', '계정 영구 삭제'],
  ['purgeUserData', '자료 영구 삭제'],
  ['exportAll', '전체 자료 내보내기'],
  ['refund', '환불'],
  ['setPricing', '요금·상품 변경'],
  ['setBillingPolicy', '결제정책 변경'],
  ['setApiKey', 'API 키 변경'],
  ['setModel', '모델 변경'],
  ['updateSettings', '시스템 설정 변경'],
  ['changeAdmin', '관리자 계정 변경']
]);

// 결제·이용량은 아직 어디에도 쌓이지 않는다. 지어내지 않고 「미연동」이라고만 알린다.
export const NOT_INTEGRATED = [
  { key: 'paymentAmount', label: '결제금액', reason: '결제 기능이 연결되어 있지 않아 저장된 금액 자료가 없습니다.' },
  { key: 'paymentStatus', label: '결제상태', reason: '결제 기능이 연결되어 있지 않아 저장된 상태 자료가 없습니다.' },
  { key: 'subscriptionPeriod', label: '이용기간', reason: '이용기간(구독) 자료를 저장하는 곳이 없습니다. 가입일과 계정 상태만 확인할 수 있습니다.' },
  { key: 'usageVolume', label: '이용량(작성·검증 건수)', reason: '계획서·신청기관 자료는 브라우저 복구키(X-Archive-Key) 기준으로 보관되어 계정과 연결되지 않습니다.' }
];

// 대상으로 삼을 수 없는 계정인지 본다. 관리자·다른 운영관리자·자기 자신은 손대지 못한다.
export function targetRefusal(actor, target) {
  if (!target) return { status: 404, error: '해당 계정을 찾지 못했습니다.' };
  if (target.id === actor.id) return { status: 400, error: '자기 계정은 이 화면에서 바꿀 수 없습니다.' };
  if (target.role === 'admin') return { status: 403, error: '관리자 계정은 운영관리자가 바꿀 수 없습니다.' };
  if (target.role === 'operator') return { status: 403, error: '다른 운영관리자 계정은 운영관리자가 바꿀 수 없습니다.' };
  return null;
}
