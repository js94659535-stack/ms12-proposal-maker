// 회원체계 한 곳. 랜딩·계정 설정·관리자 화면이 모두 이 값을 읽으므로 가격과 편수가 어긋나지 않는다.
//
// 네 가지는 서로 별개다.
//   승인 상태  pending / active / suspended        (users.status, DB에는 suspended가 disabled로 들어 있다)
//   내부역할   customer / operator / admin          (users.role)
//   월간 구독  없음 / 활성 / 중지 / 종료             (subscriptions)
//   프리미엄   정식 수주계약                          (premium_contracts)
//
// users.plan = 'full'은 구독이 생기기 전에 쓰던 값이라 그대로 둔다. 레거시 전체 이용권으로 보존한다.

export const APPROVAL = Object.freeze({ pending: 'pending', active: 'active', suspended: 'suspended' });
// DB의 status 열은 예전부터 disabled를 쓴다. 열 값은 그대로 두고 부르는 이름만 맞춘다.
export const approvalOf = status => (String(status) === 'disabled' ? APPROVAL.suspended : String(status || APPROVAL.pending));
export const APPROVAL_LABELS = Object.freeze({ pending: '승인 대기', active: '승인 완료', suspended: '이용 중지' });

// 고객등급. 운영관리자·관리자는 고객등급이 아니므로 여기 없다.
export const TIERS = Object.freeze(['pending', 'member', 'subscriber', 'premium']);
// 회원 단계는 일곱이다. 승인 대기 → 승인회원 → 일반회원 → 구독회원, 그리고 에이전트·운영자·관리자.
// 수주계약은 등급으로 두지 않는다. 이름 뒤 왕관으로만 표시한다(PREMIUM_MARK).
export const TIER_LABELS = Object.freeze({
  pending: '승인 대기', member: '승인회원', legacy: '일반회원', subscriber: '구독회원',
  premium: '수주회원', staff: '운영 계정'
});

// 일곱 단계의 열림 범위와 활동 범위. 화면·안내표·보고가 모두 이 표 하나를 본다.
// 문구를 화면마다 따로 적으면 실제 권한과 어긋난다. 실제로 「전체 이용권」 등급이 표에서 빠져
// 회원이 자기와 다른 칸을 「지금 내 등급」으로 보고 있었다.
export const MEMBER_STEPS = Object.freeze([
  Object.freeze({
    key: 'pending', label: '승인 대기', axis: '상태',
    open: '기능 이름만 확인 · 실제 자료와 AI는 잠금',
    act: '가입정보 입력, 관리자 승인 기다리기',
    next: '관리자가 승인하면 승인회원이 된다'
  }),
  Object.freeze({
    key: 'member', label: '승인회원', axis: '등급',
    open: '핵심제안서 5쪽 · 계정당 평생 1회 · 읽기 전용, 공모정보 검색, 기관정보 관리',
    act: '핵심제안서 한 번 만들어 보기, 기관정보 쌓아 두기',
    next: '전체 이용권을 받거나 구독을 신청하면 편집·저장·출력이 열린다'
  }),
  Object.freeze({
    key: 'legacy', label: '일반회원', axis: '등급',
    open: '전체 계획서 작성·검증·출력 · 편집·저장·DOCX·PDF · 진단서',
    act: '자기 기관 계획서를 처음부터 끝까지 작성',
    next: '결제 없이 관리자가 부여한 이용권이다'
  }),
  Object.freeze({
    key: 'subscriber', label: '구독회원', axis: '등급',
    open: '월 편수 안에서 핵심제안서·진단서 · 편집·저장·출력',
    act: '매달 정해진 편수만큼 작성',
    next: '수주계약을 맺으면 이름 뒤에 왕관이 붙는다'
  }),
  Object.freeze({
    key: 'agency', label: '에이전트', axis: '역할',
    open: '고객 기관을 등록해 대신 작성 · 고객별 사용량 한도',
    act: '여러 고객 기관의 계획서 작성 대행',
    next: '최고관리자가 임명·해제한다. 요금 상품이 아니다'
  }),
  Object.freeze({
    key: 'operator', label: '운영자', axis: '역할',
    open: '허용된 운영업무 · 회원 승인·중지·검색 · 읽기 위주',
    act: '가입 승인, 이용 흔적 확인, 잠금 해제',
    next: '권한 범위는 최고관리자가 정한다'
  }),
  Object.freeze({
    key: 'admin', label: '관리자', axis: '역할',
    open: '전체 관리·열람 · 이용권 부여 · 에이전트 임명 · 수주계약 등록',
    act: '플랫폼 운영 전반',
    next: '화면에서 역할로 부여하지 않는다'
  })
]);
// 수주계약은 등급이 아니다. 위 어느 단계든 계약이 있으면 이름 뒤에 왕관을 붙인다.
export const PREMIUM_STEP_NOTE = '수주계약을 맺으면 등급과 별개로 이름 뒤에 👑이 붙고, 계약한 전문 작업이 열립니다.';

// 값이 흩어지지 않게 가격·편수·쪽수를 여기 한 곳에 둔다.
export const PRICING = Object.freeze({
  monthly: 6000, currency: 'KRW', priceLabel: '월 6,000원',
  // 실제 결제 연동은 아직 없다. 신청 문구만 보여 준다.
  applyLabel: '월간 구독 신청', contactLabel: '이용권 문의',
  billingNote: '정기결제는 아직 연결되지 않았습니다. 신청하시면 관리자가 확인 후 열어 드립니다.'
});

export const QUOTAS = Object.freeze({
  // 구독 주기마다 새로 주어지는 편수.
  subscriber: Object.freeze({ coreProposal: 3, diagnosis: 5, maxPages: 20 }),
  // 승인회원은 계정당 한 번, 5쪽 고정, 읽기 전용이다.
  member: Object.freeze({ coreProposal: 1, diagnosis: 0, maxPages: 5 })
});
export const MEMBER_FREE_PAGES = QUOTAS.member.maxPages;

// 공개용 우수 제안서 편수는 server/premium.js가 정한다. 여기서는 상품표에 실어 나르기만 한다.
export const SHOWCASE_LIMIT = 5;
export const CORE_ACTION = 'coreProposal';
export const DIAGNOSIS_ACTION = 'diagnosis';
// 전문 전체 계획서 작업. 프리미엄 진행 중 계약이나 레거시 전체 이용권에서만 열린다.
export const EXPERT_ACTIONS = Object.freeze(['analyze', 'master', 'draftPart', 'draft', 'fullProposal', 'preciseReview', 'patchSections', 'rewrite', 'finalize']);

export const LOCKED_NOTICE = '승인 대기 중에는 볼 수만 있습니다. 관리자가 승인하면 열립니다.';
export const MEMBER_ONE_SHOT = `승인회원은 ${MEMBER_FREE_PAGES}쪽 핵심제안서를 계정당 한 번, 읽기 전용으로 만들 수 있습니다.`;
export const MEMBER_READ_ONLY = `승인회원의 핵심제안서는 읽기 전용입니다. 편집·재작성·저장·DOCX·PDF·ZIP 출력은 ${PRICING.applyLabel} 후에 열립니다.`;
export const NEED_SUBSCRIPTION = `${PRICING.applyLabel} 후에 쓸 수 있는 기능입니다.`;
export const NEED_PREMIUM_WORK = '계약한 전문 전체 계획서 작업은 정식 수주계약이 진행 중일 때만 시작할 수 있습니다.';
export const QUOTA_SPENT = Object.freeze({
  coreProposal: `이번 구독 주기의 핵심제안서 ${QUOTAS.subscriber.coreProposal}편을 모두 썼습니다. 다음 갱신일에 새로 열립니다.`,
  diagnosis: `이번 구독 주기의 선정 가능성 진단서 ${QUOTAS.subscriber.diagnosis}편을 모두 썼습니다. 다음 갱신일에 새로 열립니다.`
});

// 공개 랜딩과 계정 설정이 함께 쓰는 상품표. 고객등급만 담는다.
export function membershipPlans() {
  return {
    pricing: PRICING,
    quotas: QUOTAS,
    // 공개 우수 제안서 편수. 화면이 숫자를 따로 적어 두지 않게 함께 내려 준다.
    showcaseLimit: SHOWCASE_LIMIT,
    tiers: [
      {
        id: 'pending', label: TIER_LABELS.pending, price: '',
        summary: '가입 후 관리자 승인을 기다리는 상태입니다.',
        features: ['전체 메뉴와 기능 이름 열람', '본인·기관정보 입력과 수정'],
        limits: ['자료 조회·생성·편집·저장·출력은 잠깁니다']
      },
      {
        id: 'member', label: TIER_LABELS.member, price: '무료',
        summary: '관리자가 승인한 회원입니다.',
        features: ['본인·기관정보 관리', `개인화된 ${MEMBER_FREE_PAGES}쪽 핵심제안서 계정당 1회(읽기 전용)`, '공개 공모정보 검색'],
        limits: ['편집·재작성·저장·DOCX·PDF·ZIP 출력은 잠깁니다']
      },
      {
        id: 'subscriber', label: TIER_LABELS.subscriber, price: PRICING.priceLabel,
        summary: '구독 주기마다 이용량이 새로 열립니다.',
        features: [
          `핵심제안서 ${QUOTAS.subscriber.coreProposal}편 (편당 최대 ${QUOTAS.subscriber.maxPages}쪽)`,
          `선정 가능성 진단서 ${QUOTAS.subscriber.diagnosis}편`,
          '핵심제안서 생성·편집·재작성·저장·DOCX·PDF 출력'
        ],
        limits: ['계약한 전문 전체 계획서 작업은 포함되지 않습니다']
      },
      {
        id: 'premium', label: TIER_LABELS.premium, price: '계약 문의',
        summary: '전문 사업계획서 작성·검토·수행 계약을 맺은 회원입니다.',
        features: [
          '구독회원 기능 전체', '계약한 전체 공모사업계획서 작업공간',
          '전문가 검토·수정 진행상태 확인', '공개용 우수 사업제안서 5편 열람', '공고 수집 이력 전체 검색'
        ],
        limits: ['계약이 끝나면 전달된 결과물 열람만 남습니다']
      }
    ]
  };
}

// 이 사람의 실제 등급과 열려 있는 기능. 서버가 이 판정으로 막는다.
export function membershipOf({ user = {}, subscription = null, contract = null, agencyActive = false } = {}) {
  const approval = approvalOf(user.status);
  const staff = ['admin', 'operator'].includes(user.role);
  // 에이전트는 요금을 내지 않는다. 최고관리자가 연 자격이 이용 권한을 대신한다.
  const legacyFull = !staff && (user.plan === 'full' || agencyActive === true);
  const subscriptionActive = subscription?.status === 'active';
  // 프리미엄 여부는 계약으로만 판정한다. users.plan = 'full' 하나로 정하지 않는다.
  const premium = Boolean(contract);
  const premiumWorking = Boolean(contract?.canStartWork);

  const tier = staff ? 'staff'
    : approval !== APPROVAL.active ? 'pending'
      : premium ? 'premium'
        : subscriptionActive ? 'subscriber'
          : legacyFull ? 'legacy' : 'member';

  const quota = tier === 'subscriber' || tier === 'premium' ? QUOTAS.subscriber : QUOTAS.member;
  const unlocked = staff || approval === APPROVAL.active;
  const paidTools = staff || legacyFull || tier === 'subscriber' || tier === 'premium';

  return {
    tier,
    label: TIER_LABELS[tier] || tier,
    approval, approvalLabel: APPROVAL_LABELS[approval] || approval,
    staff, legacyFull, premium, premiumWorking,
    subscription: subscription ? { ...subscription } : null,
    // 잠금 화면. 승인 전에는 이름만 보이고 아무 요청도 보내지 않는다.
    locked: !unlocked,
    // 핵심제안서
    canCoreProposal: unlocked,
    coreMaxPages: tier === 'member' || tier === 'legacy' ? (tier === 'legacy' ? QUOTAS.subscriber.maxPages : QUOTAS.member.maxPages) : quota.maxPages,
    coreReadOnly: tier === 'member',
    // 선정 가능성 진단서
    canDiagnosis: paidTools,
    // 편집·재작성·저장·출력
    canEdit: paidTools,
    canExport: paidTools,
    canSave: paidTools,
    // 계약한 전문 전체 계획서 작업
    canExpertWork: staff || legacyFull || premiumWorking
  };
}

// 막을 이유가 없으면 null. 있으면 왜 막는지 함께 돌려준다.
export function membershipRefusal(state, action) {
  if (state.locked) return { status: 403, error: LOCKED_NOTICE, locked: true };
  if (action === CORE_ACTION) return null;
  if (action === DIAGNOSIS_ACTION) {
    return state.canDiagnosis ? null : { status: 403, error: NEED_SUBSCRIPTION, needsSubscription: true };
  }
  if (EXPERT_ACTIONS.includes(action)) {
    if (state.canExpertWork) return null;
    // 구독회원에게 전문 작업권한이 열리지 않게 한다.
    if (state.tier === 'subscriber') return { status: 403, error: NEED_PREMIUM_WORK, needsPremium: true };
    return { status: 403, error: NEED_SUBSCRIPTION, needsSubscription: true };
  }
  return null;
}

// 핵심제안서 쪽수는 등급이 정한다. 승인회원은 5쪽으로 고정한다.
export function corePagesFor(state, requested) {
  const wanted = Number(requested) || MEMBER_FREE_PAGES;
  if (state.tier === 'member') return MEMBER_FREE_PAGES;
  return Math.min(Math.max(1, wanted), state.coreMaxPages);
}
