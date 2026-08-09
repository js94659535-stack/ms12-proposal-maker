// 교과서용 [샘플] 프로젝트. 가상의 공모사업 1건과 가상 신청기관 2곳으로 전체 흐름을 미리 실행한 결과를 만든다.
// 규칙: 실제 기관·실제 공고를 흉내 내지 않는다. 모든 제목에 [샘플] 표시를 유지한다.
// 저장·버전·검증은 새로 만들지 않고 현재 엔진(notice-logic, fit-matching, project-blueprint,
// blueprint-draft-check, repair-plan, coaching-handoff)을 그대로 실행한다.
import { analyzeNoticeStructure, buildSelectionLogic, noticeLogicSummary, selectionRequirements } from './notice-logic.js';
import { matchApplicantToNotice } from './fit-matching.js';
import { buildBlueprint } from './project-blueprint.js';
import { checkDraftAgainstBlueprint } from './blueprint-draft-check.js';
import { applyRepairPlans, buildRepairPlans, repairPlanSummary } from './repair-plan.js';
import { appendProposalVersion, compareCoachingRounds, coachingVerdict } from './coaching-handoff.js';
import { normalizeApplicant } from './applicants.js';

export const SAMPLE_MARK = '[샘플]';
export const SAMPLE_NOTICE_KEY = 'sample:ms12-demo-2026';
export const SAMPLE_PROPOSAL_ID = 'sample-proposal-ms12-demo';
export const SAMPLE_NOTE = '이 자료는 사용법 설명을 위한 가상 예시입니다. 실제 공모기관·실제 기관 정보가 아니며 그대로 제출할 수 없습니다.';

const SAMPLE_OVERVIEW = `사업 목적: 지역 아동·청소년이 생성형 인공지능 도구를 안전하게 다루고 자기 표현에 활용하도록 돕는 창의교육 기반을 마련한다.
해결하려는 문제: 지역아동센터 이용 아동은 디지털 기기 접근 시간이 길지만 안전한 활용 교육과 지도 인력이 부족하여 학습 격차와 오·남용 위험이 함께 커지고 있다.
신청 대상: 초등학교 4학년부터 중학교 3학년까지의 지역 아동·청소년.
신청 자격: 지역아동센터, 청소년수련시설, 아동복지시설 등 비영리 아동·청소년 시설로서 2년 이상 상시 운영 중인 기관.
신청 유형: 기초형(디지털 안전·기초 활용 중심)과 심화형(창작·산출물 발표 중심) 중 하나를 선택하여 신청한다.
기초형은 인공지능 기초 활용과 디지털 안전 교육을 중심으로 하며 별도의 산출물 발표를 요구하지 않는다.
심화형은 창작 결과물 제작과 지역 발표회 개최를 필수로 하며 외부 강사와의 협력 계획을 함께 제출한다.
지원 내용: 프로그램 운영비, 강사비, 교구·재료비, 아동 활동비, 발표회 운영비를 지원한다.
지원 규모: 기관당 최대 20,000,000원 이내로 지원하며 총 12개 기관을 선정한다.
사업 기간: 2026년 10월 1일부터 2027년 6월 30일까지 9개월간 수행한다.
예산 기준: 총사업비의 60% 이상을 아동 직접 활동비로 편성해야 하며 기관 운영 인건비는 총사업비의 20%를 넘을 수 없다. 장비 구입비는 총사업비의 10% 이내로만 편성한다.
성과 요구: 참여 아동의 사전·사후 디지털 활용 태도 변화를 측정하고 회기별 출석률과 만족도를 정량 지표로 제출해야 한다. 사업 종료 후 결과보고서와 아동 산출물 자료를 제출한다.
제출 서류: 사업계획서, 예산 산출내역서, 기관 소개서, 최근 2년 사업 실적표, 협력기관 확인서(해당 기관에 한함), 개인정보 수집·이용 동의 서식.
탈락·감점 위험: 아동 직접 활동비 비율 미달, 회기 계획과 예산 산출의 불일치, 성과지표 미제시는 감점 사유이며 신청자격 미충족은 심사에서 제외한다.
마감일: 2026년 9월 18일 18시까지 접수한다.`;

const SAMPLE_CRITERIA = `평가 기준(100점): 사업 필요성 20점, 사업 계획의 구체성 25점, 수행 역량과 인력 20점, 예산 편성의 적정성 20점, 성과 관리 계획 15점.
가점: 최근 2년 이내 아동 대상 디지털·창의교육 운영 실적이 있는 기관에 가점 3점을 부여한다.
심사 방법: 서류 심사 후 필요 시 현장 확인을 실시한다.`;

// 1) [샘플 01] 원본 공고 — 가상의 공모기관과 가상의 사업이다.
export const SAMPLE_NOTICE = Object.freeze({
  isSample: true,
  sampleStatus: '완료',
  sampleApplicantText: '[샘플] 햇살지역아동센터 외 1곳',
  archiveNoticeKey: SAMPLE_NOTICE_KEY,
  source: 'sample',
  sourceLabel: '[샘플] 새싹복지재단(가상 공모기관)',
  dstbBsnsCode: 'SAMPLE-2026-AI-001',
  listSn: 'SAMPLE-2026-AI-001',
  title: '[샘플] 2026 지역 아동·청소년 AI 창의교육 지원사업',
  deadline: '2026-09-18',
  applicationPeriod: '2026-08-20 ~ 2026-09-18',
  performancePeriod: '2026-10-01 ~ 2027-06-30',
  supportLimit: '기관당 최대 20,000,000원 (총 12개 기관 선정)',
  eligibility: '지역아동센터·청소년수련시설·아동복지시설 등 2년 이상 상시 운영 중인 비영리 아동·청소년 시설',
  supportDetails: '프로그램 운영비, 강사비, 교구·재료비, 아동 활동비, 발표회 운영비',
  summary: '지역 아동·청소년이 생성형 인공지능을 안전하게 활용하도록 돕는 창의교육 지원사업(가상 예시).',
  overview: SAMPLE_OVERVIEW,
  detailText: SAMPLE_OVERVIEW,
  criteriaText: SAMPLE_CRITERIA,
  archivedAt: '2026-08-20T00:00:00.000Z',
  archiveUpdatedAt: '2026-08-20T00:00:00.000Z',
  references: [{ source: 'sample', listSn: 'SAMPLE-2026-AI-001' }],
  sampleNote: SAMPLE_NOTE
});

const item = (area, label, value, status = '확인됨', extra = {}) => ({ area, label, value, status, source: '[샘플] 기관 자체 확인 자료', asOf: '2026-08', ...extra });

// 2) [샘플 03] 신청기관 정보 — 가상 기관 2곳. 실제 기관명·개인정보를 쓰지 않는다.
export const SAMPLE_APPLICANTS = [
  normalizeApplicant({
    id: 'sample-applicant-haetsal',
    name: '[샘플] 햇살지역아동센터',
    note: '가상 신청기관 예시입니다. 실제 기관이 아닙니다.',
    items: [
      item('basic', '기관 유형', '지역아동센터(비영리 아동복지시설), 2014년 개소 후 상시 운영'),
      item('basic', '운영 지역', '가상시 별빛구 햇살동'),
      item('basic', '이용 아동 규모', '상시 이용 아동 38명(초4~중3 24명)'),
      item('staff', '상근 인력', '센터장 1명, 사회복지사 2명, 생활복지사 1명'),
      item('staff', '디지털 교육 담당', '사회복지사 1명이 아동 디지털 활용 교육을 3년째 담당'),
      item('facilities', '보유 공간', '학습실 2실(각 20㎡), 다목적실 1실'),
      item('facilities', '보유 장비', '노트북 8대, 태블릿 6대, 빔프로젝터 1대'),
      item('programs', '상시 운영 프로그램', '방과후 학습지원, 정서지원 집단프로그램, 급식지원'),
      item('performance', '2024년 아동 디지털 리터러시 교실', '초4~6 학년 아동 18명 대상 주 1회 12회기 운영, 출석률 88%', '확인됨', { scope: 'history' }),
      item('performance', '2025년 마을 미디어 창작단', '초5~중2 아동 15명 대상 주 1회 16회기 운영, 결과 발표회 1회 개최', '확인됨', { scope: 'history' }),
      item('performance', '2025년 아동 정서지원 집단상담', '아동 12명 대상 10회기 운영', '확인됨', { scope: 'history' }),
      item('budget', '최근 회계연도 예산 규모', '연간 2억 1천만원(보조금 포함)'),
      item('partners', '협력 실적', '별빛구 마을도서관과 2025년 독서·미디어 연계 프로그램 공동 운영'),
      item('staff', '외부 강사 확보 계획', '', '확인 필요'),
      item('budget', '자부담 가능 금액', '', '확인 필요')
    ]
  }),
  normalizeApplicant({
    id: 'sample-applicant-nareum',
    name: '[샘플] 나름청소년문화의집',
    note: '복수 기관 매칭 검증용 가상 신청기관입니다.',
    items: [
      item('basic', '기관 유형', '청소년수련시설(청소년문화의집), 2011년 개관'),
      item('basic', '운영 지역', '가상시 별빛구 나름동'),
      item('staff', '상근 인력', '관장 1명, 청소년지도사 3명'),
      item('facilities', '보유 공간', '동아리실 3실, 공연·발표장 1실(80석)'),
      item('programs', '상시 운영 프로그램', '청소년 동아리 지원, 진로체험, 문화예술 창작'),
      item('performance', '2025년 청소년 영상창작 동아리', '중1~중3 청소년 20명 대상 20회기 운영, 지역 상영회 1회', '확인됨', { scope: 'history' }),
      item('performance', '2024년 진로체험 프로그램', '청소년 60명 대상 8회 운영', '확인됨', { scope: 'history' }),
      item('partners', '협력 실적', '별빛구 청소년상담복지센터와 위기청소년 연계 협약 운영'),
      item('budget', '최근 회계연도 예산 규모', '', '확인 필요')
    ]
  })
];

// 3) [샘플 05] 사업 설계도에서 사용자가 확정한 이번 사업 값. 과거 실적 수치를 옮겨 쓰지 않는다.
export const SAMPLE_PROJECT_VALUES = [
  { key: 'applicationType', label: '신청유형', value: '심화형' },
  { key: 'name', label: '사업명', value: '[샘플] 우리동네 AI 창작교실' },
  { key: 'target', label: '대상', value: '별빛구 지역아동센터 이용 초4~중3 아동·청소년' },
  { key: 'headcount', label: '인원', value: '20명(초등 12명, 중등 8명)' },
  { key: 'period', label: '기간', value: '2026-10-01 ~ 2027-06-30(9개월)' },
  { key: 'sessions', label: '회기', value: '주 1회 90분, 총 24회기' },
  { key: 'programs', label: '핵심 프로그램', value: '디지털 안전 교육 4회기, AI 창작 도구 실습 12회기, 팀 창작 프로젝트 6회기, 지역 발표회 2회기' },
  { key: 'staff', label: '수행인력', value: '사회복지사 1명(총괄), 생활복지사 1명(운영지원), 외부 창작 강사 1명(주 1회 참여)' },
  { key: 'partners', label: '협력기관', value: '[샘플] 나름청소년문화의집(발표회 장소 제공·공동 운영)' },
  { key: 'budget', label: '예산', value: '총 18,000,000원(아동 직접 활동비 11,000,000원 61%, 강사비 3,600,000원, 교구·재료비 2,000,000원, 발표회 운영비 1,400,000원)' },
  { key: 'outcomeGoals', label: '성과목표', value: '참여 아동 20명의 디지털 활용 태도 사전·사후 점수 15% 향상, 창작 산출물 20편 완성' },
  { key: 'indicators', label: '성과지표', value: '회기별 출석률 85% 이상, 만족도 4.0/5.0 이상, 사전·사후 태도 검사 실시율 100%' }
];

const section = (id, title, content) => ({ id, title, content, status: '작성됨' });

// 4) [샘플 07] V1 초안 — 설계도 값만 사용하고 확인되지 않은 값은 [확인 필요]로 남긴다.
export const SAMPLE_SECTIONS_V1 = [
  section('sample-s1', '1. 사업명 및 신청유형', '사업명은 「[샘플] 우리동네 AI 창작교실」이며 신청유형은 심화형으로 신청한다. 심화형은 창작 결과물 제작과 지역 발표회 개최를 필수로 하므로, 본 사업은 팀 창작 프로젝트와 지역 발표회를 사업 내용에 포함하여 설계하였다.'),
  section('sample-s2', '2. 사업의 필요성', '별빛구 지역아동센터 이용 아동은 디지털 기기 접근 시간이 길지만 안전한 활용 교육과 지도 인력이 부족하다. 공고가 제시한 문제와 같이 학습 격차와 오·남용 위험이 함께 커지고 있으며, 본 기관 이용 아동 38명 중 초4~중3 아동은 24명으로 대상 규모가 확인된다.'),
  section('sample-s3', '3. 사업 대상 및 인원', '별빛구 지역아동센터 이용 초4~중3 아동·청소년 20명(초등 12명, 중등 8명)을 대상으로 한다. 이는 이번 사업에서 확정한 값이며 과거 사업의 참여 인원과는 별도로 산정하였다.'),
  section('sample-s4', '4. 사업 목표 및 성과지표', '참여 아동 20명의 디지털 활용 태도 사전·사후 점수를 15% 향상시키고 창작 산출물 20편을 완성하는 것을 목표로 한다. 성과지표는 회기별 출석률 85% 이상, 만족도 4.0/5.0 이상, 사전·사후 태도 검사 실시율 100%로 설정한다.'),
  section('sample-s5', '5. 사업 내용 및 추진 일정', '2026년 10월 1일부터 2027년 6월 30일까지 9개월간 주 1회 90분, 총 24회기를 운영한다. 디지털 안전 교육 4회기, AI 창작 도구 실습 12회기, 팀 창작 프로젝트 6회기, 지역 발표회 2회기로 구성한다.'),
  section('sample-s6', '6. 수행 인력 및 협력 체계', '사회복지사 1명이 총괄하고 생활복지사 1명이 운영을 지원하며 외부 창작 강사 1명이 주 1회 참여한다. 발표회는 [샘플] 나름청소년문화의집과 공동으로 운영하며 장소를 제공받는다. 외부 창작 강사의 구체적인 확보 방법은 [확인 필요].'),
  section('sample-s7', '7. 예산 계획', '총 18,000,000원을 편성한다. 아동 직접 활동비 11,000,000원(61%), 강사비 3,600,000원, 교구·재료비 2,000,000원, 발표회 운영비 1,400,000원이다. 공고 기준인 아동 직접 활동비 60% 이상을 충족한다. 기관 자부담 금액은 [확인 필요].'),
  section('sample-s8', '8. 기관 수행 역량 및 실적', '본 기관은 2014년 개소 후 상시 운영 중인 지역아동센터이며 노트북 8대와 태블릿 6대를 보유하고 있다. 2024년 아동 디지털 리터러시 교실(아동 18명, 12회기, 출석률 88%)과 2025년 마을 미디어 창작단(아동 15명, 16회기, 발표회 1회)을 운영한 실적이 있다. 위 실적은 근거로만 인용하며 이번 사업의 인원·회기 값으로 사용하지 않았다.')
];

// 5) [샘플 08] 1차 검증·코칭 결과 — 실제 검증 결과와 같은 구조로 남긴 예시 판정이다.
export const SAMPLE_COACHING_V1 = Object.freeze({
  verdict: '수정 후 재검토',
  summary: '공고 요구를 대체로 반영했으나 예산 산출 근거와 성과 측정 방법의 구체성이 부족하다.',
  issues: [
    { id: 'sample-issue-1', title: '강사비 산출 근거가 없다', location: '7. 예산 계획', evidence: '강사비 3,600,000원', problem: '단가와 횟수 없이 총액만 제시되어 예산 편성의 적정성 평가(20점)에서 감점될 수 있다.', suggestion: '강사비를 단가와 횟수로 나누어 산출 근거를 함께 적는다.', severity: '높음' },
    { id: 'sample-issue-2', title: '성과 측정 도구가 특정되지 않았다', location: '4. 사업 목표 및 성과지표', evidence: '사전·사후 태도 검사 실시율 100%', problem: '어떤 검사 도구로 무엇을 측정하는지 없어 성과 관리 계획(15점) 평가 근거가 약하다.', suggestion: '사용할 검사 도구와 측정 시점을 성과지표 옆에 함께 적는다.', severity: '보통' },
    { id: 'sample-issue-3', title: '외부 강사 확보 방법이 비어 있다', location: '6. 수행 인력 및 협력 체계', evidence: '외부 창작 강사의 구체적인 확보 방법은 [확인 필요]', problem: '수행 역량과 인력(20점) 항목에서 확인되지 않은 정보로 남아 있다.', suggestion: '기관이 확인한 사실만 채우고, 확정 전에는 [확인 필요] 표기를 유지한다.', severity: '보통' }
  ]
});

// 6) [샘플 13] 최종 검증 — 선택 수정 후 다시 검증한 결과 예시.
export const SAMPLE_COACHING_V2 = Object.freeze({
  verdict: '제출 검토 완료',
  summary: '예산 산출 근거가 보완되어 감점 위험이 줄었다. 확인되지 않은 값은 [확인 필요]로 남아 있어 제출 전 기관 확인이 필요하다.',
  issues: [
    { id: 'sample-issue-3', title: '외부 강사 확보 방법이 비어 있다', location: '6. 수행 인력 및 협력 체계', evidence: '외부 창작 강사의 구체적인 확보 방법은 [확인 필요]', problem: '기관이 확인해야 채울 수 있는 항목이다.', suggestion: '기관 확인 후 채운다. 확인 전에는 표기를 유지한다.', severity: '보통' }
  ]
});

// 7) [샘플 11] 사용자 결정 — 확인 필요 항목에 대해 사용자가 실제로 확정한 값.
export const SAMPLE_DECISIONS = [
  { question: '외부 창작 강사를 어떻게 확보합니까?', answer: '[샘플] 나름청소년문화의집이 보유한 창작 강사 인력풀에서 1명을 위촉하기로 협의 완료(2026-08 기준).' },
  { question: '기관 자부담 금액은 얼마입니까?', answer: '자부담 1,800,000원(총사업비의 10%)을 기관 예산으로 편성.' }
];

function applyBudgetDecision(sections, decisions) {
  // 사용자가 확정한 값만 [확인 필요] 자리를 대신한다. 확정하지 않은 자리는 그대로 둔다.
  const budget = decisions.find(entry => entry.question.includes('자부담'))?.answer || '';
  if (!budget) return sections;
  return sections.map(entry => (entry.id === 'sample-s7'
    ? { ...entry, content: entry.content.replace('기관 자부담 금액은 [확인 필요].', `기관 자부담은 ${budget}`) }
    : entry));
}

// 각 단계 결과를 현재 엔진으로 실제 실행해서 만든다. 화면에서는 이 결과를 그대로 보여 준다.
export function buildSampleProject() {
  const structure = analyzeNoticeStructure({ ...SAMPLE_NOTICE, criteriaText: SAMPLE_NOTICE.criteriaText });
  const logic = buildSelectionLogic(structure);
  const requirements = selectionRequirements(structure);
  const noticeSummary = noticeLogicSummary(structure, logic, requirements);
  const applicant = SAMPLE_APPLICANTS[0];
  const partner = SAMPLE_APPLICANTS[1];
  const fitResult = matchApplicantToNotice(structure, applicant);
  const partnerFit = matchApplicantToNotice(structure, partner);
  const blueprint = buildBlueprint({ structure, applicant, fitResult, projectValues: SAMPLE_PROJECT_VALUES });
  const master = buildSampleMaster(blueprint);

  const draftReviewV1 = checkDraftAgainstBlueprint({ blueprint, sections: SAMPLE_SECTIONS_V1, applicant, projectValues: SAMPLE_PROJECT_VALUES, structure });
  // 수정계획 → V2는 근거가 있는 수정만 반영하고, 사용자 확인이 필요한 항목은 질문으로 남긴다.
  const repairPlans = buildRepairPlans(SAMPLE_COACHING_V1.issues, { sections: SAMPLE_SECTIONS_V1, projectValues: SAMPLE_PROJECT_VALUES });
  const repairResult = applyRepairPlans(SAMPLE_SECTIONS_V1, repairPlans.filter(plan => plan.repairLevel !== 'USER_CONFIRMATION'));
  const sectionsV2 = repairResult.sections;
  // 사용자 결정 → 남은 확인 항목만 확정 답변으로 반영한다.
  const pending = repairPlans.filter(plan => plan.repairLevel === 'USER_CONFIRMATION');
  const confirmations = Object.fromEntries(pending.map(plan => [plan.id, SAMPLE_DECISIONS[0].answer]));
  const decisionResult = applyRepairPlans(sectionsV2, pending, { confirmations });
  const sectionsFinal = applyBudgetDecision(decisionResult.sections, SAMPLE_DECISIONS);
  const draftReviewFinal = checkDraftAgainstBlueprint({ blueprint, sections: sectionsFinal, applicant, projectValues: SAMPLE_PROJECT_VALUES, structure });

  let versions = appendProposalVersion([], { sections: SAMPLE_SECTIONS_V1, label: 'V1 초안', source: '계획서 작성' });
  versions = appendProposalVersion(versions, { sections: sectionsV2, label: 'V2 코칭 반영', source: '검증·코칭 반영' });
  versions = appendProposalVersion(versions, { sections: sectionsFinal, label: 'V3 최종본', source: '사용자 결정 반영' });
  const comparison = compareCoachingRounds(SAMPLE_COACHING_V1, SAMPLE_COACHING_V2);

  return {
    notice: SAMPLE_NOTICE,
    structure,
    logic,
    requirements,
    noticeSummary,
    applicant,
    partner,
    applicants: SAMPLE_APPLICANTS,
    fitResult,
    partnerFit,
    blueprint,
    master,
    sectionsV1: SAMPLE_SECTIONS_V1,
    draftReviewV1,
    coachingV1: { ...SAMPLE_COACHING_V1, verdictState: coachingVerdict(SAMPLE_COACHING_V1) },
    repairPlans,
    repairSummary: repairPlanSummary(repairPlans),
    repairResult,
    sectionsV2,
    decisionResult,
    decisions: SAMPLE_DECISIONS,
    sectionsFinal,
    coachingV2: SAMPLE_COACHING_V2,
    comparison,
    draftReviewFinal,
    versions
  };
}

// [샘플 06] 마스터 설계. 실제 master 응답과 같은 형태로 신청서 항목 묶음을 남긴다.
function buildSampleMaster(blueprint) {
  const value = key => blueprint.items.find(entry => entry.key === key)?.value || '';
  return {
    projectDesign: {
      projectName: '[샘플] 우리동네 AI 창작교실',
      target: '별빛구 지역아동센터 이용 초4~중3 아동·청소년',
      participantCount: '20명(초등 12명, 중등 8명)',
      projectPeriod: '2026-10-01 ~ 2027-06-30(9개월)',
      budgetStructure: ['아동 직접 활동비 11,000,000원(61%)', '강사비 3,600,000원', '교구·재료비 2,000,000원', '발표회 운영비 1,400,000원']
    },
    masterLogic: {
      coreProblem: value('problem'),
      selectionLogic: ['공고가 요구한 아동 직접 활동비 60% 이상 편성', '심화형 필수 요건인 창작 산출물과 지역 발표회 포함', '사전·사후 측정으로 성과 요구 충족'],
      writingRule: '공고 공식 요구 → 사용자 확정값 → 기관 확인정보 → 관련 실적 → 설계안 순으로 쓰고, 확인되지 않은 값은 [확인 필요]로 남긴다.'
    },
    sectionPlan: [
      { id: 'sample-group-1', title: '사업명·신청유형·필요성', sectionKeys: ['applicationType', 'problem'] },
      { id: 'sample-group-2', title: '대상·목표·성과지표', sectionKeys: ['target', 'outcomeGoals', 'indicators'] },
      { id: 'sample-group-3', title: '사업 내용·추진 일정', sectionKeys: ['programs', 'sessions', 'period'] },
      { id: 'sample-group-4', title: '수행 인력·협력·예산', sectionKeys: ['staff', 'partners', 'budget'] }
    ]
  };
}

// 14단계 목차. 화면에서 여는 순서와 설명을 한 곳에서 관리한다.
export const SAMPLE_STAGES = [
  { no: '01', id: 'notice', title: '원본 공고', screen: '공고 준비', desc: '가상의 공모기관이 낸 공고 원문입니다. 여기서 모든 근거가 시작됩니다.' },
  { no: '02', id: 'analysis', title: '공고 분석 결과', screen: '공고 분석', desc: '공고에서 목적·자격·필수내용·평가·성과 요구를 원문 문장과 함께 구조화한 결과입니다.' },
  { no: '03', id: 'applicant', title: '신청기관 정보', screen: '신청기관 준비', desc: '확인된 기관 정보와 과거 실적을 나눠 정리한 예시입니다.' },
  { no: '04', id: 'fit', title: '기관–공고 적합성', screen: '신청기관 준비', desc: '공고 요건별로 기관 근거가 있는지 대조한 결과입니다.' },
  { no: '05', id: 'blueprint', title: '사업 설계도', screen: '사업 설계', desc: '확정·근거 있음·설계안·확인 필요를 구분한 설계도 한 장입니다.' },
  { no: '06', id: 'master', title: '마스터 설계', screen: '계획서 작성', desc: '계획서를 어떤 묶음으로 나눠 쓸지 정한 결과입니다.' },
  { no: '07', id: 'draftV1', title: 'V1 초안', screen: '계획서 작성', desc: '설계도 값만 사용해 작성한 첫 초안입니다.' },
  { no: '08', id: 'coachingV1', title: '1차 검증·코칭', screen: '검토·제출', desc: '평가기준으로 문제를 찾고 위치·근거·수정 방향을 제시한 결과입니다.' },
  { no: '09', id: 'repair', title: '수정계획(repairPlan)', screen: '검토·제출', desc: '문제를 자동 수정 / 근거 기반 수정 / 사용자 확인으로 나눈 계획입니다.' },
  { no: '10', id: 'draftV2', title: 'V2 수정본', screen: '검토·제출', desc: '선택한 수정만 반영한 두 번째 버전입니다.' },
  { no: '11', id: 'decisions', title: '사용자 결정 반영', screen: '검토·제출', desc: '[확인 필요] 자리를 사용자가 확정한 값으로 채운 기록입니다.' },
  { no: '12', id: 'final', title: '최종본', screen: '검토·제출', desc: '사용자 결정까지 반영한 제출 후보 본문입니다.' },
  { no: '13', id: 'recheck', title: '최종 검증', screen: '검토·제출', desc: '수정 후 다시 검증해 1차 결과와 비교한 것입니다.' },
  { no: '14', id: 'submission', title: '제출용 결과', screen: '검토·제출', desc: '제출 전 확인 목록과 보관 상태입니다.' }
];

// 화면 → 그 화면에서 열 샘플 단계. 사용자의 실제 작업 상태는 건드리지 않는다.
export const SAMPLE_ENTRY_BY_STEP = { 0: 'notice', 1: 'analysis', 2: 'applicant', 3: 'blueprint', 4: 'draftV1', 5: 'coachingV1' };

// 자료보관함 우클릭에서 단계로 이동할 때 열 샘플 결과.
export const SAMPLE_STAGE_BY_STEP = { 0: 'notice', 1: 'analysis', 2: 'fit', 3: 'blueprint', 4: 'draftV1', 5: 'coachingV1' };

// 보관 스냅샷과 같은 모양으로 [샘플] 프로젝트를 담는다. 앱의 복원 경로를 그대로 검증하기 위한 것이다.
export function sampleProposalSnapshot(sample = buildSampleProject()) {
  return {
    project: { type: 'chest', title: '[샘플] 우리동네 AI 창작교실', issuer: SAMPLE_NOTICE.sourceLabel, deadline: SAMPLE_NOTICE.deadline },
    sourceText: SAMPLE_OVERVIEW,
    analysis: null,
    sponsorIntent: null,
    projectDesign: null,
    missingInformation: SAMPLE_DECISIONS.map(entry => entry.question),
    evidenceMap: [],
    qualityCheck: null,
    designAnswers: Object.fromEntries(SAMPLE_DECISIONS.map(entry => [entry.question, entry.answer])),
    designUnavailable: false,
    stagedGeneration: { phase: 'parts-ready', master: sample.master, parts: sample.master.sectionPlan.map((group, index) => ({ groupId: group.id, sections: [sample.sectionsV1[index * 2], sample.sectionsV1[index * 2 + 1]].filter(Boolean) })), completedGroupIds: sample.master.sectionPlan.map(group => group.id), continuitySummary: null },
    assemblyCheck: null,
    manualSources: [],
    matches: [],
    answers: [],
    sections: sample.sectionsFinal,
    reviewResult: null,
    reviewOriginalDraft: null,
    reviewFingerprint: '',
    companyFacts: [],
    selectedNotice: SAMPLE_NOTICE,
    aiMode: 'sample',
    selectedApplicantId: sample.applicant.id,
    projectValues: SAMPLE_PROJECT_VALUES,
    applicantResolvedQuestions: [],
    proposalVersions: sample.versions,
    // 수정 요청(revisionPlan)은 검증·코칭에서 만들어지는 별도 구조이므로 샘플 스냅샷에는 넣지 않는다.
    revisionPlan: null,
    noticeLogic: { structure: sample.structure, logic: sample.logic, requirements: sample.requirements, summary: sample.noticeSummary },
    draftReview: sample.draftReviewFinal,
    applicantSnapshot: sample.applicant
  };
}
