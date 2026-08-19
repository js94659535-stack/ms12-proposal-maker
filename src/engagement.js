// 「사업계획서 의뢰 건」 한 건의 경계를 정한다. 규칙 기반 로컬 처리만 하고 외부 API를 호출하지 않는다.
// 기관 영구정보(신청기관에 계속 남는 사실)와 이번 사업 정보(이 의뢰 건에서만 쓰는 값)를 절대 자동으로 섞지 않는다.
import { CONFIRMED_STATUS, splitApplicantProfile } from './applicants.js';
import { ITEM_SOURCE_TYPES, applyFormSpecToOutline, formItemSkeleton, mergeFormTables } from './form-spec.js';

// 고객이 보는 단계. 내부 6단계 작업 화면과 별개이며 고객에게는 이 4단계만 보여 준다.
export const ENGAGEMENT_STAGES = ['공고 요청', '정보 확인', '설계 승인', '결과 확인'];
// 기관자료가 어디서 왔는지. 값과 함께 남겨 두고 자동으로 승격하지 않는다.
export const ITEM_ORIGINS = ['고객 입력', '파일 추출', '운영자 수정', '기관 확인'];
// 한 의뢰 건이 들고 있는 정보. scope가 '기관 영구'인 것은 의뢰 건이 끝나도 기관에 남는다.
export const ENGAGEMENT_PARTS = [
  { key: 'client', title: '고객 담당자', scope: '의뢰 건' },
  { key: 'applicant', title: '신청기관 기본정보·기관현황·근거자료', scope: '기관 영구' },
  { key: 'request', title: '공고 요청서', scope: '의뢰 건' },
  { key: 'noticeFiles', title: '공고문·신청서식·첨부자료', scope: '의뢰 건' },
  { key: 'contract', title: '공고 실행계약서', scope: '의뢰 건' },
  { key: 'design', title: '이번 사업 설계값·확인값', scope: '의뢰 건' },
  { key: 'proposal', title: '계획서 버전·검증·제출본', scope: '의뢰 건' }
];
export const PART_STATES = ['없음', '준비 중', '준비됨'];

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// 설계 승인 상태. 이 다섯 가지만 쓴다.
export const DESIGN_STATES = ['설계 준비 중', '확인 요청', '운영자 검토', '설계 승인', '계획서 작성 완료'];
// 실제 로그인 권한이 없으므로 현재 화면 전환 역할을 그대로 기록한다.
export const APPROVAL_ROLES = ['고객', '운영자'];
// 계획서 목차와 항목별 작성 방향·목표 분량. 승인 전에 무엇을 어떻게 쓸지 먼저 합의한다.
export const PROPOSAL_OUTLINE = [
  { key: 'necessity', title: '사업 필요성', direction: '지역 문제와 대상의 어려움을 근거와 함께 제시', targetChars: 900 },
  { key: 'purpose', title: '목적', direction: '공고 목적과 같은 방향임을 한 문단으로 정리', targetChars: 500 },
  { key: 'goals', title: '목표', direction: '확정한 인원·회기·성과 수치로 측정 가능한 목표 제시', targetChars: 600 },
  { key: 'target', title: '대상', direction: '공고가 정한 대상과 선정 기준·모집 방법', targetChars: 700 },
  { key: 'programs', title: '세부 프로그램', direction: '공고의 핵심 수행모델을 중심으로 활동·회기·담당 배치', targetChars: 1400 },
  { key: 'schedule', title: '추진 일정', direction: '공고 사업기간 안에서 월별 추진 순서', targetChars: 600 },
  { key: 'roles', title: '운영 인력·역할', direction: '확인된 기관 인력과 협력기관의 역할 분담', targetChars: 700 },
  { key: 'budget', title: '예산', direction: '공고 편성 기준과 한도 안에서 수량×단가×횟수', targetChars: 800 },
  { key: 'indicators', title: '성과지표', direction: '측정도구·시기·담당을 포함한 지표', targetChars: 600 },
  { key: 'outcomes', title: '기대효과', direction: '사업 종료 후 지향점과 지속 방안', targetChars: 500 }
];
// 설계안에서 먼저 합의해야 하는 이번 사업 핵심값.
const CORE_FIELDS = [
  { key: 'target', label: '대상' }, { key: 'headcount', label: '인원' }, { key: 'period', label: '기간' },
  { key: 'sessions', label: '회기' }, { key: 'budget', label: '예산' }
];

// 조판 가능한 표는 코드가 정한다. 공고 실행계약서에 그 기준이 있을 때만 표를 요구한다.
const TABLE_PLANS = [
  { id: 'budget-table', kind: '예산표', title: '예산 산출 내역', columns: ['항목', '산출 근거(수량×단가×횟수)', '금액(원)'], when: rules => rules.some(item => item.category === '예산') },
  { id: 'schedule-table', kind: '일정표', title: '추진 일정', columns: ['시기', '추진 내용', '담당'], when: rules => rules.some(item => item.category === '사업기간') },
  { id: 'indicator-table', kind: '성과지표표', title: '성과지표·측정 계획', columns: ['성과목표', '지표', '측정도구', '측정시기', '담당'], when: rules => rules.some(item => item.category === '성과' || item.category === '활동횟수') },
  { id: 'target-table', kind: '대상표', title: '참여자 구성', columns: ['구분', '인원', '선정 기준'], when: rules => rules.some(item => item.category === '참여규모') }
];
// 문서 목표 분량과 항목별 분량, 코드가 조판할 표를 설계안에서 미리 정한다.
// 신청서 서식이 있으면 서식이 정한 항목명·분량·필수 표가 기본값보다 우선한다.
export function buildDocumentPlan(contract, formSpec = null) {
  const rules = contract?.rules || [];
  const fromContract = TABLE_PLANS.filter(plan => plan.when(rules)).map(({ when, ...plan }) => ({ ...plan, source: '공고 실행계약서' }));
  const outline = applyFormSpecToOutline(PROPOSAL_OUTLINE, formSpec);
  return {
    outline,
    // 배치용 뼈대. 생성은 표준 목차로 하고, 내보낼 때는 서식 항목 전체를 자리로 둔다.
    skeleton: formItemSkeleton(formSpec, outline),
    targetTotalChars: outline.reduce((sum, item) => sum + item.targetChars, 0),
    tables: mergeFormTables(fromContract, formSpec),
    attachments: formSpec?.attachments || [],
    budgetForm: formSpec?.budgetForm || null,
    formSpecStatus: formSpec ? formSpec.status : '서식 없음',
    // 서식을 읽었더라도 분량 제한이 실제로 없으면 기본값으로 쓴다고 그대로 알린다.
    limitSource: outline.some(item => item.limitSource === '신청서 서식') ? '신청서 서식' : '기본값'
  };
}

// 서식을 읽었는지 화면이 한 문장으로 말한다.
//
// 화면에서 항목 이름만 봐서는 서식을 읽었는지 알 수 없다. 읽었든 못 읽었든
// PROPOSAL_OUTLINE의 같은 항목이 나오기 때문이다(applyFormSpecToOutline은 title을 바꾸지 않는다).
// 그래서 「못 읽었다」를 화면이 직접 말하지 않으면 사용자가 알아챌 방법이 없다.
//
// 상태를 둘이 아니라 셋으로 나눈다. 서식을 읽었는데 분량 제한만 못 찾은 경우가 실제로 있고,
// 그걸 「반영됨」에 넣으면 분량이 기본값이라는 사실이 숨는다.
export const FORM_NOTICE_STATES = Object.freeze(['none', 'partial', 'full']);

function formSourceName(formSpec) {
  const sources = formSpec?.sources || [];
  const item = sources.find(source => ITEM_SOURCE_TYPES.includes(source.sourceType)) || sources[0];
  return text(item?.fileName, 120);
}

export function formSpecNotice(formSpec = null, attachments = []) {
  const zip = (attachments || []).some(file => /\.zip$/i.test(String(file?.name || '')));
  const items = formSpec?.items || [];
  const fileName = formSourceName(formSpec);
  const total = PROPOSAL_OUTLINE.length;

  if (!items.length || !fileName) {
    return {
      state: 'none', tone: 'warning', applied: 0,
      headline: `서식 미인식 — 기본 ${total}개 항목으로 작성됨`,
      detail: '공고 서식이 따로 있으면 항목·분량이 다를 수 있습니다.',
      // ZIP은 자동으로 풀지 않는다. 서식이 그 안에 있는데 못 읽었을 수 있다.
      zipHint: zip ? '이 ZIP 안에 서식이 있을 수 있습니다. 내려받아 푼 뒤 사업계획서 서식 파일을 올려 주세요.' : ''
    };
  }

  // 서식을 읽었다고 목차에 반영되는 것이 아니다. applyFormSpecToOutline은 세 조건이
  // 모두 맞을 때만 적용한다 — 항목 이름이 OUTLINE_MATCH에 걸리고, 그 항목에 글자 수나
  // 쪽수 제한이 있을 때. 그때 그 항목만 이름과 분량이 서식 것으로 바뀐다.
  // 그래서 「읽은 항목 수」가 아니라 「실제로 적용된 항목 수」를 세야 사실과 맞는다.
  const applied = applyFormSpecToOutline(PROPOSAL_OUTLINE, formSpec)
    .filter(item => item.limitSource === '신청서 서식').length;
  const tables = (formSpec.tables || []).length;
  const files = (formSpec.attachments || []).length;
  const read = [tables ? `필수 표 ${tables}개` : '', files ? `첨부서류 ${files}개` : ''].filter(Boolean).join(' · ');

  if (!applied) {
    return {
      state: 'partial', tone: 'caution', applied: 0,
      headline: `서식 일부만 읽음 — ${fileName}에서 항목 ${items.length}개를 읽었으나 목차에 반영된 것은 없음`,
      detail: `본문은 기본 ${total}개 항목의 이름과 분량으로 나갑니다.`
        + (read ? ` ${read}는 서식에서 읽었습니다.` : ' 서식에서 항목별 분량 제한을 찾지 못했습니다.'),
      zipHint: ''
    };
  }
  return {
    state: 'full', tone: 'ok', applied,
    headline: `서식 반영됨 — ${fileName} 기준 · ${total}개 중 ${applied}개 항목`,
    detail: `그 ${applied}개는 서식의 항목 이름과 분량을 따르고, 나머지 ${total - applied}개는 기본 이름·기본 분량입니다.`
      + (read ? ` ${read}도 서식에서 읽었습니다.` : '')
      + (items.length > total ? ` 서식 항목 ${items.length}개 가운데 본문으로 쓰는 것은 ${total}개입니다.` : ''),
    zipHint: ''
  };
}

export function makeDesignApproval(value = {}) {
  return {
    requestedAt: text(value.requestedAt, 40), requestedBy: APPROVAL_ROLES.includes(value.requestedBy) ? value.requestedBy : '',
    reviewStartedAt: text(value.reviewStartedAt, 40),
    approvedAt: text(value.approvedAt, 40), approvedBy: APPROVAL_ROLES.includes(value.approvedBy) ? value.approvedBy : '',
    note: text(value.note, 500),
    // 승인 시점의 설계안을 그대로 남긴다. 이후 설계가 바뀌어도 무엇을 승인했는지 남는다.
    snapshot: value.snapshot && typeof value.snapshot === 'object' ? value.snapshot : null
  };
}
// 상태는 저장된 승인 기록과 실제 작성 결과에서 계산한다. 별도 상태 필드를 따로 두지 않는다.
export function designStatus({ approval, sections = [] } = {}) {
  const record = makeDesignApproval(approval);
  if (sections.length) return '계획서 작성 완료';
  if (record.approvedAt) return '설계 승인';
  if (record.reviewStartedAt) return '운영자 검토';
  if (record.requestedAt) return '확인 요청';
  return '설계 준비 중';
}
// 승인 뒤에 이번 사업 확정값이 바뀌면 승인 snapshot은 옛것이 된다. 그대로 기준으로 쓰지 않는다.
export function designSnapshotStale(approval, brief) {
  const snapshot = makeDesignApproval(approval).snapshot;
  if (!snapshot || !brief) return false;
  const values = plan => (plan.coreValues || []).map(item => `${item.key}=${item.value}`).join('|');
  return values(snapshot) !== values(brief) || (snapshot.applicationType?.selected || '') !== (brief.applicationType?.selected || '');
}

// 승인 전에는 전체 계획서 작성을 실행하지 않는다. 이미 시작한 작성의 이어쓰기와 열람은 막지 않는다.
// 초안 작성은 막지 않는다. 항목마다 확정을 눌러야 시작할 수 있으면 사용자가 지친다.
// 설계 확인은 선택이고, 확정은 마지막에 「전체 최종확정」 한 번으로 한다.
export function canGenerateProposal({ approval, sections = [], startedParts = 0 } = {}) {
  if (makeDesignApproval(approval).approvedAt) return { allowed: true, reason: '' };
  if (sections.length || startedParts) return { allowed: true, reason: '이미 시작한 작성을 이어서 진행합니다.' };
  return { allowed: true, reason: '설계 확인 없이 초안을 먼저 만듭니다. 확정은 마지막에 한 번 합니다.' };
}

// 승인 전에 보여 줄 설계안 한 장. 공고 강제조건과 이번 사업 값, 확인된 사실을 한자리에 모은다.
export function buildDesignBrief({ contract, blueprint, applicant, projectValues = [], locks = {}, formSpec = null } = {}) {
  const rules = contract?.rules || [];
  const valueOf = key => (projectValues || []).find(item => (item.blueprintKey || item.key) === key)?.value || '';
  const coreValues = CORE_FIELDS.map(field => {
    const lock = locks[field.key];
    const confirmed = valueOf(field.key);
    if (lock?.mode === 'OFFICIAL_LOCKED') return { ...field, value: lock.value, basis: '공고 확정' };
    if (confirmed) return { ...field, value: confirmed, basis: lock?.bound ? `이번 사업 확정 (공고 허용 ${lock.bound})` : '이번 사업 확정' };
    return { ...field, value: '[확인 필요]', basis: lock?.bound ? `공고 허용 ${lock.bound}` : '아직 정하지 않음' };
  });
  const split = organizationBoundary(applicant, projectValues);
  return {
    blockingRules: rules.filter(item => item.severity === 'BLOCKING').map(item => ({
      title: String(item.title).slice(0, 90), ruleType: item.ruleType,
      official: Array.isArray(item.value) ? item.value.join(' / ') : `${item.value}${item.unit || ''}`
    })),
    applicationType: { selected: blueprint?.applicationTypes?.selected || '', options: (blueprint?.applicationTypes?.options || []).map(option => option.name) },
    coreValues,
    requiredModels: rules.filter(item => item.ruleType === 'REQUIRED' && item.category === '사업모델').map(item => ({ title: String(item.title).slice(0, 90), keyphrases: Array.isArray(item.value) ? item.value : [] })),
    confirmedFacts: split.permanent.filter(item => item.status === '확인됨').map(item => `${item.label}: ${String(item.value).slice(0, 80)}`),
    openFacts: [
      ...split.permanent.filter(item => item.status !== '확인됨').map(item => `${item.label} (기관 정보 확인 필요)`),
      ...coreValues.filter(item => item.value === '[확인 필요]').map(item => `${item.label} (이번 사업 값 미정)`)
    ],
    documentPlan: buildDocumentPlan(contract, formSpec),
    formSpec: formSpec ? { status: formSpec.status, items: formSpec.items.length, tables: formSpec.tables.length, attachments: formSpec.attachments.length, openPoints: formSpec.openPoints, sources: formSpec.sources } : null,
    outline: buildDocumentPlan(contract, formSpec).outline,
    targetTotalChars: buildDocumentPlan(contract, formSpec).targetTotalChars
  };
}

// 고객 담당자. 연락처는 이 의뢰 건 진행에 필요한 만큼만 두고 기관 영구정보로 올리지 않는다.
export function makeClient(value = {}) {
  return {
    name: text(value.name, 60), position: text(value.position, 60),
    contact: text(value.contact, 120), note: text(value.note, 500)
  };
}
// 고객이 보내온 공고 요청서. 공고 원문·실행계약서와 별개로 「무엇을 의뢰했는가」를 남긴다.
export function makeNoticeRequest(value = {}) {
  return {
    title: text(value.title, 200), issuer: text(value.issuer, 120), deadline: text(value.deadline, 40),
    // 아직 등록되지 않은 기관은 이름만 받아 둔다. 신청기관 정보(기관 영구)로 자동 등록하지 않는다.
    applicantName: text(value.applicantName, 120),
    ask: text(value.ask, 2000), receivedAt: text(value.receivedAt, 40), manager: text(value.manager, 60)
  };
}
export function normalizeEngagement(value = {}) {
  return {
    client: makeClient(value.client), request: makeNoticeRequest(value.request),
    design: makeDesignApproval(value.design),
    // 신청서 서식 규격표는 이 의뢰 건에 저장한다. 없으면 null로 둔다.
    formSpec: value.formSpec && typeof value.formSpec === 'object' ? value.formSpec : null,
    // 계획서 유형. 정밀 검증·부분 수정은 정밀형에서만 쓴다.
    mode: value.mode === '정밀형' ? '정밀형' : '표준형',
    view: value.view === 'operator' ? 'operator' : 'customer'
  };
}

// 기관 영구정보와 이번 사업 값의 경계. 어느 쪽도 자동으로 옮기지 않고 겹치는 것만 알려 준다.
export function organizationBoundary(applicant, projectValues = []) {
  const split = splitApplicantProfile(applicant || { items: [] });
  const permanent = split.profile.map(item => ({ label: item.label, value: item.value, status: item.status, origin: item.origin || '', asOf: item.asOf || '' }));
  const records = split.history.map(item => ({ label: item.label, value: item.value, status: item.status, origin: item.origin || '' }));
  const thisProject = (projectValues || []).filter(item => item?.value).map(item => ({ key: item.blueprintKey || item.key || '', label: item.label || '', value: String(item.value) }));
  // 과거 실적 문장이 이번 사업 값으로 그대로 복사된 경우만 혼입으로 본다.
  const mixed = thisProject.filter(entry => records.some(record => record.value && record.value === entry.value))
    .map(entry => ({ ...entry, from: records.find(record => record.value === entry.value).label }));
  return {
    permanent, records, thisProject, mixed,
    confirmed: permanent.filter(item => item.status === CONFIRMED_STATUS).length,
    unverified: permanent.filter(item => item.status !== CONFIRMED_STATUS).length,
    withoutOrigin: [...permanent, ...records].filter(item => !item.origin).length
  };
}

function part(key, state, detail) {
  const meta = ENGAGEMENT_PARTS.find(entry => entry.key === key);
  return { key, title: meta.title, scope: meta.scope, state, detail };
}

export function buildEngagement({ client, request, design, applicant, noticeLogic, manualSources = [], projectValues = [], sections = [], proposalVersions = [], proposalFlow = null, gate = null, blueprint = null, locks = {}, formSpec = null } = {}) {
  const normalizedClient = makeClient(client);
  const normalizedRequest = makeNoticeRequest(request);
  const approval = makeDesignApproval(design);
  const designState = designStatus({ approval, sections });
  const boundary = organizationBoundary(applicant, projectValues);
  const contract = noticeLogic?.contract || null;
  const readFiles = (manualSources || []).filter(item => item?.extractionStatus === 'success').length;
  const hasNotice = Boolean(noticeLogic?.structure?.totalChars);
  const parts = [
    part('client', normalizedClient.name ? '준비됨' : '없음', normalizedClient.name ? `${normalizedClient.name}${normalizedClient.position ? ` · ${normalizedClient.position}` : ''}` : '담당자 정보 없음'),
    part('applicant', applicant?.name ? (boundary.confirmed ? '준비됨' : '준비 중') : '없음', applicant?.name ? `${applicant.name} · 확인됨 ${boundary.confirmed} / 확인 필요 ${boundary.unverified} · 실적 ${boundary.records.length}` : '신청기관 미선택'),
    part('request', normalizedRequest.title ? '준비됨' : '없음', normalizedRequest.title ? `${normalizedRequest.title}${normalizedRequest.deadline ? ` · 마감 ${normalizedRequest.deadline}` : ''}` : '요청서 없음'),
    part('noticeFiles', hasNotice ? '준비됨' : readFiles ? '준비 중' : '없음', hasNotice ? `공고 원문 ${noticeLogic.structure.totalChars.toLocaleString()}자 · 첨부 ${readFiles}건` : `첨부 ${readFiles}건`),
    part('contract', contract?.rules?.length ? '준비됨' : '없음', contract?.rules?.length ? `조건 ${contract.rules.length}개 · 강제조건 ${contract.blockingCount}개` : '공고 분석 후 생성'),
    part('design', boundary.thisProject.length ? (blueprint?.canDraft ? '준비됨' : '준비 중') : '없음', boundary.thisProject.length ? `이번 사업 확정값 ${boundary.thisProject.length}건${blueprint ? ` · ${blueprint.readiness}` : ''}` : '확정값 없음'),
    part('proposal', sections.length ? '준비됨' : '없음', sections.length ? `본문 ${sections.length}개 · 버전 ${proposalVersions.length}개 · 검토 ${(proposalFlow?.rounds || []).length}회` : '계획서 없음')
  ];

  // 고객에게는 내부 6단계 대신 이 4단계만 보여 준다.
  const stage = !hasNotice && !normalizedRequest.title ? '공고 요청'
    : !applicant?.name || !boundary.confirmed ? '정보 확인'
      : !sections.length ? '설계 승인'
        : '결과 확인';
  const brief = buildDesignBrief({ contract, blueprint, applicant, projectValues, locks, formSpec });
  const customerNext = nextAction(stage, { boundary, gate, sections, blueprint, designState, brief });

  return {
    client: normalizedClient, request: normalizedRequest, parts, boundary,
    approval, designState, brief,
    canGenerate: canGenerateProposal({ approval, sections }),
    stage, stageIndex: ENGAGEMENT_STAGES.indexOf(stage), customerNext,
    operator: {
      designState,
      approvedAt: approval.approvedAt, approvedBy: approval.approvedBy,
      approvedSnapshot: Boolean(approval.snapshot),
      openFacts: brief.openFacts.length,
      noticeAnalyzed: hasNotice,
      contractRules: contract?.rules?.length || 0,
      blockingRules: contract?.blockingCount || 0,
      applicationType: blueprint?.applicationTypes?.selected || '',
      blueprintReadiness: blueprint?.readiness || '',
      submissionChecklist: (blueprint?.submissionChecklist || []).length,
      versions: proposalVersions.length,
      reviewRounds: (proposalFlow?.rounds || []).length,
      proposalStatus: proposalFlow?.status || '',
      gateStatus: gate?.status || '',
      gateBlocking: (gate?.blocking || []).length,
      gateCounts: gate?.counts || null,
      mixedValues: boundary.mixed.length,
      withoutOrigin: boundary.withoutOrigin
    }
  };
}

// 고객이 지금 할 일 하나. 내부 단계 이름이나 엔진 이름을 노출하지 않는다.
function nextAction(stage, { boundary, gate, sections, blueprint, designState, brief }) {
  if (stage === '공고 요청') return { label: '공고 요청서 작성', why: '어떤 공고에 신청할지 알려 주시면 준비를 시작합니다.', target: 'engagement' };
  if (stage === '정보 확인') {
    return boundary.permanent.length
      ? { label: '기관 정보 확인', why: `확인이 필요한 기관 정보가 ${boundary.unverified}건 있습니다.`, target: 'applicants' }
      : { label: '기관 정보 등록', why: '신청기관 정보를 등록하면 공고와 맞는지 확인해 드립니다.', target: 'applicants' };
  }
  if (stage === '설계 승인') {
    if (blueprint && !blueprint.canDraft) return { label: '신청유형 선택', why: '공고가 신청유형을 나눠 두어 하나를 골라야 합니다.', target: 'design' };
    if (designState === '설계 준비 중') return { label: '설계안 확인 요청', why: '준비된 설계안을 확인하시고 검토를 요청해 주세요.', target: 'design' };
    if (designState === '확인 요청') return { label: '검토 결과 기다리기', why: '요청하신 설계안을 담당자가 확인하고 있습니다.', target: 'design' };
    if (designState === '운영자 검토') return { label: '사업 설계 승인', why: brief?.openFacts?.length ? `확인이 필요한 항목 ${brief.openFacts.length}건을 보고 승인 여부를 정해 주세요.` : '설계안을 확인하고 승인해 주세요.', target: 'design' };
    return { label: '계획서 작성 시작', why: '설계가 승인되어 계획서를 작성할 수 있습니다.', target: 'proposal' };
  }
  if (!gate) return { label: '결과 확인', why: '작성된 계획서를 확인해 주세요.', target: 'proposal' };
  if (gate.blocking?.length) return { label: '공고 기준 보완', why: `공고가 정한 조건 ${gate.blocking.length}건을 아직 지키지 못했습니다.`, target: 'proposal' };
  return { label: '결과 확인', why: sections.length ? '공고 강제조건을 모두 지킨 계획서가 준비되었습니다.' : '계획서를 확인해 주세요.', target: 'proposal' };
}
