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
  'issueRecoveryCode', // 일회용 계정 복구코드 발급
  'usageReport',   // AI 사용량·비용 조회(읽기 전용)
  'setContractProgress', // 수주 작업 진행상태 변경. 권한 자체는 건드리지 않는다
  'noticeCollection', // 공고 자동수집 상태 조회(읽기 전용). 실행은 관리자만 한다
  'assignedProposals', // 관리자가 지정해 준 계획서 목록(메타정보)
  'proposalContent',  // 지정받은 계획서의 원문. 프리미엄 계약이나 회원 동의가 함께 있어야 열린다
  'agencyList'        // 대행회원 현황 조회(읽기 전용). 지정·해제·한도·인계는 최고관리자만 한다
]);

// 운영관리자 권한으로는 서버에서 거절하는 동작. 화면에 버튼이 없더라도 여기서 다시 막는다.
export const BLOCKED_ACTIONS = new Map([
  ['setRole', '역할 변경'],
  ['setAgency', '대행회원 지정·해제'],
  ['agencyTransfer', '대행회원 자료 인계'],
  ['agencyTransferPreview', '대행회원 자료 인계'],
  ['setAgencyLimits', '대행회원 한도 변경'],
  ['grantOperator', '운영관리자 지정'],
  ['revokeOperator', '운영관리자 해제'],
  ['setPlan', '이용권 변경'],
  ['setSubscription', '월간 구독 지정·해제'],
  ['grantSubscription', '월간 구독 부여'],
  ['revokeSubscription', '월간 구독 중지'],
  ['setPremium', '정식 수주회원 지정·해제'],
  ['grantPremium', '정식 수주회원 부여'],
  ['revokePremium', '정식 수주회원 중지'],
  ['saveShowcase', '공개용 우수 제안서 편집'],
  ['setShowcasePublic', '공개용 우수 제안서 공개·비공개'],
  ['setUsageCap', 'AI 사용량 상한 변경'],
  ['grantFullPlan', '전체 이용권 부여'],
  ['revokeFullPlan', '전체 이용권 회수'],
  ['resetTrial', '무료 체험 사용 기록 초기화'],
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
  ['changeAdmin', '관리자 계정 변경'],
  ['runNoticeCollection', '공고 수동 재수집'],
  ['saveGrant', '권한 지정'],
  ['revokeGrant', '권한 회수'],
  ['assignProposal', '보관자료 회원 지정'],
  ['setNoticeSource', '수집 출처 사용·중지']
]);

// 결제·이용량은 아직 어디에도 쌓이지 않는다. 지어내지 않고 「미연동」이라고만 알린다.
export const NOT_INTEGRATED = [
  { key: 'paymentAmount', label: '결제금액', reason: '결제 기능이 연결되어 있지 않아 저장된 금액 자료가 없습니다. 전체 이용권이 없는 계정에는 「이용권 문의」로만 안내합니다.' },
  { key: 'paymentStatus', label: '결제상태', reason: '결제 기능이 연결되어 있지 않아 저장된 상태 자료가 없습니다. 대신 이용권(무료 체험·전체)과 무료 체험 사용 여부를 확인할 수 있습니다.' },
  { key: 'subscriptionPeriod', label: '결제 기준 이용기간', reason: '정기결제가 연결되어 있지 않습니다. 화면에 보이는 구독 기간은 관리자가 손으로 넣은 시험용 값이며 결제 사실을 뜻하지 않습니다.' },
  { key: 'usageVolume', label: '계획서·신청기관 이용량', reason: '계획서·신청기관 자료는 브라우저 복구키(X-Archive-Key) 기준으로 보관되어 계정과 연결되지 않습니다. 계정 기준으로 남는 것은 무료 5쪽 사용 여부와 구독 주기의 제안서·진단서 사용 편수뿐입니다.' }
];

// 대상으로 삼을 수 없는 계정인지 본다. 관리자·다른 운영관리자·자기 자신은 손대지 못한다.
export function targetRefusal(actor, target) {
  if (!target) return { status: 404, error: '해당 계정을 찾지 못했습니다.' };
  if (target.id === actor.id) return { status: 400, error: '자기 계정은 이 화면에서 바꿀 수 없습니다.' };
  if (target.role === 'admin') return { status: 403, error: '관리자 계정은 운영관리자가 바꿀 수 없습니다.' };
  if (target.role === 'operator') return { status: 403, error: '다른 운영관리자 계정은 운영관리자가 바꿀 수 없습니다.' };
  return null;
}
