// 「사업계획서 의뢰 건」 한 건의 경계를 정한다. 규칙 기반 로컬 처리만 하고 외부 API를 호출하지 않는다.
// 기관 영구정보(신청기관에 계속 남는 사실)와 이번 사업 정보(이 의뢰 건에서만 쓰는 값)를 절대 자동으로 섞지 않는다.
import { CONFIRMED_STATUS, splitApplicantProfile } from './applicants.js';

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
    ask: text(value.ask, 2000), receivedAt: text(value.receivedAt, 40), manager: text(value.manager, 60)
  };
}
export function normalizeEngagement(value = {}) {
  return {
    client: makeClient(value.client), request: makeNoticeRequest(value.request),
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

export function buildEngagement({ client, request, applicant, noticeLogic, manualSources = [], projectValues = [], sections = [], proposalVersions = [], proposalFlow = null, gate = null, blueprint = null } = {}) {
  const normalizedClient = makeClient(client);
  const normalizedRequest = makeNoticeRequest(request);
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
  const customerNext = nextAction(stage, { boundary, gate, sections, blueprint });

  return {
    client: normalizedClient, request: normalizedRequest, parts, boundary,
    stage, stageIndex: ENGAGEMENT_STAGES.indexOf(stage), customerNext,
    operator: {
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
function nextAction(stage, { boundary, gate, sections, blueprint }) {
  if (stage === '공고 요청') return { label: '공고 요청서 작성', why: '어떤 공고에 신청할지 알려 주시면 준비를 시작합니다.', target: 'engagement' };
  if (stage === '정보 확인') {
    return boundary.permanent.length
      ? { label: '기관 정보 확인', why: `확인이 필요한 기관 정보가 ${boundary.unverified}건 있습니다.`, target: 'applicants' }
      : { label: '기관 정보 등록', why: '신청기관 정보를 등록하면 공고와 맞는지 확인해 드립니다.', target: 'applicants' };
  }
  if (stage === '설계 승인') {
    return blueprint && !blueprint.canDraft
      ? { label: '신청유형 선택', why: '공고가 신청유형을 나눠 두어 하나를 골라야 합니다.', target: 'design' }
      : { label: '사업 설계 승인', why: '준비된 설계 내용을 확인하고 승인해 주세요.', target: 'design' };
  }
  if (!gate) return { label: '결과 확인', why: '작성된 계획서를 확인해 주세요.', target: 'proposal' };
  if (gate.blocking?.length) return { label: '공고 기준 보완', why: `공고가 정한 조건 ${gate.blocking.length}건을 아직 지키지 못했습니다.`, target: 'proposal' };
  return { label: '결과 확인', why: sections.length ? '공고 강제조건을 모두 지킨 계획서가 준비되었습니다.' : '계획서를 확인해 주세요.', target: 'proposal' };
}
