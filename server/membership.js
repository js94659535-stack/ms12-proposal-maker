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
export const TIER_LABELS = Object.freeze({
  pending: '승인 대기 회원', member: '정식회원', subscriber: '구독회원', premium: '프리미엄회원',
  legacy: '정식회원(기존 전체 이용권)', staff: '운영 계정'
});

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
  // 정식회원은 계정당 한 번, 5쪽 고정, 읽기 전용이다.
  member: Object.freeze({ coreProposal: 1, diagnosis: 0, maxPages: 5 })
});
export const MEMBER_FREE_PAGES = QUOTAS.member.maxPages;

export const CORE_ACTION = 'coreProposal';
export const DIAGNOSIS_ACTION = 'diagnosis';
// 전문 전체 계획서 작업. 프리미엄 진행 중 계약이나 레거시 전체 이용권에서만 열린다.
export const EXPERT_ACTIONS = Object.freeze(['analyze', 'master', 'draftPart', 'draft', 'fullProposal', 'preciseReview', 'patchSections', 'rewrite', 'finalize']);

export const LOCKED_NOTICE = '승인 대기 중에는 볼 수만 있습니다. 관리자가 승인하면 열립니다.';
export const MEMBER_ONE_SHOT = `정식회원은 ${MEMBER_FREE_PAGES}쪽 핵심제안서를 계정당 한 번, 읽기 전용으로 만들 수 있습니다.`;
export const MEMBER_READ_ONLY = `정식회원의 핵심제안서는 읽기 전용입니다. 편집·재작성·저장·DOCX·PDF·ZIP 출력은 ${PRICING.applyLabel} 후에 열립니다.`;
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
export function membershipOf({ user = {}, subscription = null, contract = null } = {}) {
  const approval = approvalOf(user.status);
  const staff = ['admin', 'operator'].includes(user.role);
  const legacyFull = !staff && user.plan === 'full';
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

// 핵심제안서 쪽수는 등급이 정한다. 정식회원은 5쪽으로 고정한다.
export function corePagesFor(state, requested) {
  const wanted = Number(requested) || MEMBER_FREE_PAGES;
  if (state.tier === 'member') return MEMBER_FREE_PAGES;
  return Math.min(Math.max(1, wanted), state.coreMaxPages);
}
