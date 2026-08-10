// 「사업환경·수요근거표」 — 사업의 필요성을 뒷받침하는 근거를 공고·기관자료에서 모아 출처와 함께 정리한다.
// 규칙 기반 로컬 처리만 하고 외부 API·검색·크롤링을 하지 않는다. 출처 없는 통계·수요는 사실로 확정하지 않는다.
import { CONFIRMED_STATUS, splitApplicantProfile } from './applicants.js';

// 근거가 어디서 왔는지. 이 네 가지로만 구분한다.
export const EVIDENCE_BASIS = ['공고 근거', '기관 확인 사실', '업로드 자료', '확인 필요'];
// 공고 유형별로 필요한 근거 항목. 유형이 없으면 공통 항목만 쓴다.
export const DEMAND_AREAS = [
  { key: 'policy', title: '정책·제도 배경', pattern: /정책|제도|법|조례|계획|기본계획|국정|지자체|공공/, types: ['*'] },
  { key: 'region', title: '지역 여건', pattern: /지역|권역|시·군|읍면동|인구|접근성|공백|격차|농어촌|도시/, types: ['*'] },
  { key: 'target', title: '대상자 수요', pattern: /대상|참여자|아동|청소년|보호자|가구|가정|노인|장애|욕구|수요|어려움|위기|학대|결손/, types: ['*'] },
  { key: 'service', title: '기존 서비스 현황', pattern: /기존|현재\s*운영|유사\s*사업|서비스\s*제공|연계|의뢰|중복|미충족|사각/, types: ['*'] },
  { key: 'capacity', title: '기관 자원·역량', pattern: /인력|시설|공간|장비|예산|실적|경험|자격|협력|network|네트워크/, types: ['*'] },
  { key: 'learning', title: '학습·교육 여건', pattern: /학교|학급|학습|성적|기초학력|교육과정|진로|방과후/, types: ['edu'] },
  { key: 'market', title: '시장·수요처 여건', pattern: /시장|매출|고객|수요처|판로|상권|매장|창업|사업자/, types: ['general', 'g2b'] }
];
export const DEMAND_STATUSES = ['확정', '확인 필요'];

const clean = (value, max = 400) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// 숫자·비율이 들어간 문장은 출처가 없으면 사실로 쓰지 않는다.
const HAS_FIGURE = /\d[\d,.]*\s*(?:명|가구|건|개소|%|퍼센트|원|시간|회|년|개월)/;

function areasFor(projectType) {
  return DEMAND_AREAS.filter(area => area.types.includes('*') || area.types.includes(projectType));
}
function pick(area, sentences, limit = 2) {
  return sentences.filter(entry => area.pattern.test(entry.text)).slice(0, limit);
}

// 공고 원문 근거: 공고 구조 분석 결과의 문장만 쓴다(요약·추론 문장을 만들지 않는다).
function noticeSentences(structure) {
  return (structure?.fields || []).flatMap(field => (field.evidence || []).map(entry => ({
    text: clean(entry.sentence), source: '공고', file: '공고 원문', location: entry.source || '공고 원문'
  })));
}
// 기관 확인 사실: 확인됨 상태만 근거로 쓴다. 확인 필요 정보는 근거가 아니다.
function applicantSentences(applicant) {
  const split = splitApplicantProfile(applicant || { items: [] });
  return [...split.profile, ...split.history]
    .filter(item => item.status === CONFIRMED_STATUS && String(item.value || '').trim())
    .map(item => ({
      text: clean(`${item.label}: ${item.value}`), source: '기관', file: applicant?.name || '신청기관 정보',
      location: `신청기관 정보 · ${item.label}`, origin: item.origin || '', asOf: item.asOf || ''
    }));
}
// 업로드 자료: 읽기에 성공한 직접 자료의 문장만 쓴다.
function uploadSentences(manualSources) {
  return (manualSources || [])
    .filter(item => item?.extractionStatus === 'success' && String(item.extractedText || '').trim())
    .flatMap(item => String(item.extractedText).split(/\n+|(?<=[.!?。])\s+/)
      .map(line => clean(line))
      .filter(line => line.length > 12)
      .slice(0, 400)
      .map(line => ({ text: line, source: '자료', file: item.fileName, location: `${item.fileName} · ${item.sourceType}` })));
}

function entry(area, basis, found, question) {
  return {
    key: area.key, title: area.title, basis,
    status: basis === '확인 필요' ? '확인 필요' : '확정',
    items: found.map(item => ({
      text: item.text, file: item.file, location: item.location,
      // 수치가 있는 문장은 출처가 분명할 때만 사실로 쓴다.
      hasFigure: HAS_FIGURE.test(item.text)
    })),
    question: basis === '확인 필요' ? question : ''
  };
}

export function buildDemandEvidence({ structure, applicant, manualSources = [], projectType = '' } = {}) {
  const notice = noticeSentences(structure);
  const organization = applicantSentences(applicant);
  const uploads = uploadSentences(manualSources);
  const rows = areasFor(projectType).map(area => {
    const fromNotice = pick(area, notice);
    if (fromNotice.length) return entry(area, '공고 근거', fromNotice);
    const fromOrg = pick(area, organization);
    if (fromOrg.length) return entry(area, '기관 확인 사실', fromOrg);
    const fromUpload = pick(area, uploads);
    if (fromUpload.length) return entry(area, '업로드 자료', fromUpload);
    return entry(area, '확인 필요', [], `${area.title}을 보여 주는 자료나 확인된 사실이 있으신가요? (출처를 함께 알려 주세요)`);
  });
  const confirmed = rows.filter(row => row.status === '확정');
  const open = rows.filter(row => row.status === '확인 필요');
  return {
    projectType, rows, confirmed, open,
    byBasis: Object.fromEntries(EVIDENCE_BASIS.map(basis => [basis, rows.filter(row => row.basis === basis).length])),
    // 부족한 근거는 만들지 않고 그대로 남긴다.
    openPoints: open.map(row => `${row.title}: 뒷받침할 근거가 없습니다.`),
    questions: open.map(row => row.question),
    status: open.length ? '확인 필요' : '확정',
    rule: '출처가 없는 통계·수요·지역 문제는 사실로 확정하지 않는다. 확인된 근거만 설계안에 넘긴다.'
  };
}

// 승인된 설계안에 실어 보낼 근거만 추린다. 확인 필요 항목은 질문으로만 넘긴다.
export function approvedDemandEvidence(demand) {
  if (!demand?.rows?.length) return null;
  return {
    rule: demand.rule,
    evidence: demand.confirmed.map(row => ({
      area: row.title, basis: row.basis,
      items: row.items.map(item => ({ text: item.text, source: item.file, location: item.location }))
    })),
    openQuestions: demand.questions.slice(0, 5)
  };
}
