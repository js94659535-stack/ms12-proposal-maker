// 공고의 선정 논리와 신청기관의 확인된 정보·사업실적을 항목별로 맞춰 본다.
// 규칙 기반 로컬 비교만 하고 외부 API를 호출하지 않는다. 점수를 만들지 않고 근거만 남긴다.
import { CONFIRMED_STATUS, splitApplicantProfile } from './applicants.js';

export const MATCH_STATES = ['MATCHED', 'PARTIAL', 'MISSING', 'CONFIRMATION_REQUIRED', 'CONFLICT'];
export const FIT_VERDICTS = ['적합성이 높음', '조건부 적합', '보완 후 검토', '신청 적합성 낮음'];

// 공고 항목별로 어떤 기관 정보를 보는지. 현재 상태가 필요한 항목과 과거 실적으로 증명 가능한 항목을 나눈다.
const FIELD_RULES = {
  purpose: { areas: ['programs', 'performance', 'basic'], allowHistory: true, emphasis: '기관의 사업 방향이 공모 목적과 같음을 보여주는 문장' },
  problem: { areas: ['performance', 'programs', 'measurement'], allowHistory: true, emphasis: '같은 문제를 다뤄 온 경험과 그 근거' },
  target: { areas: ['programs', 'performance'], allowHistory: true, emphasis: '공고가 정한 대상과 같은 대상을 다룬 실적' },
  eligibility: { areas: ['legal', 'basic', 'facilities'], allowHistory: false, emphasis: '기관 유형·등록 상태를 증빙과 함께' },
  requiredContent: { areas: ['programs', 'performance'], allowHistory: true, emphasis: '요구된 사업내용을 수행한 프로그램 근거' },
  submissionItems: { areas: ['references', 'legal'], allowHistory: false, emphasis: '제출 서류를 갖추고 있음' },
  periodBudget: { areas: ['budget', 'performance'], allowHistory: true, emphasis: '비슷한 규모의 예산을 집행한 경험' },
  evaluation: { areas: ['performance', 'measurement', 'staff'], allowHistory: true, emphasis: '평가항목에 대응하는 수행 근거' },
  outcomes: { areas: ['measurement', 'performance'], allowHistory: true, emphasis: '성과지표와 측정 방법을 운영한 경험' },
  selectionFactors: { areas: ['partners', 'staff', 'facilities'], allowHistory: true, emphasis: '우대 요소에 해당하는 자원' },
  riskFactors: { areas: ['legal', 'basic'], allowHistory: false, emphasis: '결격 사유가 없음을 확인한 내용' }
};

// 공고가 명시적으로 배제하거나 자격을 한정한 경우에만 충돌로 본다. 능력·역할 요구는 충돌 근거가 아니다.
const EXPLICIT_EXCLUSION = [
  { key: 'for-profit', notice: /영리\s*(?:법인|기업|단체)[^\n]{0,20}(?:신청\s*불가|제외|불가|배제)|비영리[^\n]{0,10}(?:법인|기관|단체)에\s*한(?:함|하여|정)|비영리[^\n]{0,10}(?:법인|기관|단체)만\s*신청/, applicant: /\(주\)|㈜|주식회사|유한회사|영리법인/ },
  { key: 'legal-type', notice: /(?:사회복지법인|아동보호전문기관|지역아동센터|사회복지시설)[^\n]{0,20}(?:에\s*한(?:함|하여|정)|만\s*신청\s*가능|만\s*신청할\s*수)/, applicant: null },
  { key: 'excluded', notice: /(?:다음에\s*해당하는\s*곳은\s*제외|배분\s*제외\s*대상|신청\s*제한)/, applicant: null }
];
// 자격 문장이 능력·역할만 요구하는지(= 충돌 판정 금지) 확인한다.
const CAPACITY_ONLY = /개입이?\s*가능한\s*기관|수행이?\s*가능한\s*기관|운영\s*가능한\s*기관|역량을?\s*갖춘/;

export const RELEVANCE_LEVELS = ['DIRECT', 'RELATED', 'GENERAL'];
// DIRECT = 이 공모의 대상·문제·개입방식·성과목적과 직접 연결되는 실적
// RELATED = 일부 대상·역량·방법만 관련되고 같은 사업 근거는 아님
// GENERAL = 예산관리·회기운영·성과측정·조직운영처럼 주제와 무관한 수행능력 경험
const OPERATIONAL_RECORD = /사업비|예산|정산|회기|차시|시수|인력|직원|조직|성과\s*측정|측정\s*도구|만족도\s*조사|운영\s*기간/;
// 분야에서 흔히 쓰여 그 자체로는 직접성을 보장하지 못하는 낱말
const GENERIC_DOMAIN = new Set(['아동', '청소년', '청년', '학생', '가족', '보호자', '지역', '상담', '교육', '프로그램', '운영', '서비스', '참여', '활동', '제공', '센터', '기관', '성과', '평가', '측정', '목표', '예산', '회기', '인력', '지원사업', '맞춤형']);

export function recordRelevance(item, structure) {
  const haystack = `${item.label} ${item.value}`;
  // 예산·회기·인력·성과측정 같은 운영 경험은 주제와 무관한 일반 역량으로 본다.
  if (OPERATIONAL_RECORD.test(item.label) || ['budget', 'measurement', 'staff'].includes(item.area)) {
    return { level: 'GENERAL', hits: [], reason: '예산·회기·인력·성과측정 등 일반 사업수행 역량 경험입니다.' };
  }
  const categories = ['target', 'problem', 'requiredContent', 'purpose'];
  const distinctive = [];
  const generic = [];
  const matchedCategories = new Set();
  for (const key of categories) {
    const field = structure?.fields?.find(item => item.key === key);
    // 항목 전체가 아니라 대표 근거 문장과 겹치는지 본다. 첨부 전체 문장과의 우연한 겹침을 피한다.
    const text = field?.evidence?.[0]?.sentence || String(field?.value || '').slice(0, 300);
    for (const token of tokensOf(text)) {
      // 숫자만으로는 직접 실적 근거가 되지 않는다.
      if (STOPWORDS.has(token) || token.length < 2 || /^\d+$/.test(token) || !haystack.includes(token)) continue;
      if (GENERIC_DOMAIN.has(token)) { generic.push(token); continue; }
      distinctive.push(token);
      matchedCategories.add(key);
    }
  }
  const uniqueDistinctive = [...new Set(distinctive)];
  // 낱말 하나로는 직접 실적이 되지 않는다. 고유한 낱말 2개 이상이 서로 다른 항목 2개 이상에서 겹칠 때만 DIRECT.
  if (uniqueDistinctive.length >= 2 && matchedCategories.size >= 2) {
    return { level: 'DIRECT', hits: uniqueDistinctive, reason: `공모의 핵심 요소와 직접 겹칩니다: ${uniqueDistinctive.join(' · ')}` };
  }
  if (uniqueDistinctive.length === 1 || generic.length) {
    return { level: 'RELATED', hits: [...new Set([...uniqueDistinctive, ...generic])], reason: '대상·방법 일부만 관련되고 같은 사업의 근거는 아닙니다.' };
  }
  return { level: 'GENERAL', hits: [], reason: '공모 주제와 직접 연결되지 않는 일반 수행경험입니다.' };
}
// 일반 수행역량 실적만 근거로 쓸 수 있는 항목
const GENERAL_ALLOWED_KEYS = ['evaluation', 'periodBudget', 'selectionFactors', 'outcomes'];

function tokensOf(value) {
  return [...new Set(String(value || '').replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/).filter(token => token.length > 1))];
}
const STOPWORDS = new Set(['사업', '지원', '기관', '내용', '경우', '해당', '관련', '통해', '위한', '있는', '있음', '대상', '제출', '작성', '확인', '필요']);

// 실제로 겹치는 낱말이 있을 때만 근거로 본다. 영역이 같다는 이유만으로 매칭하지 않는다.
function matchItems(fieldText, items, areas) {
  const keys = tokensOf(fieldText).filter(token => !STOPWORDS.has(token));
  return items
    .filter(item => areas.includes(item.area))
    .map(item => {
      // 영역 이름은 근거가 아니다. 항목의 실제 내용과 겹칠 때만 근거로 본다.
      const haystack = `${item.label} ${item.value}`;
      const hits = keys.filter(token => haystack.includes(token));
      return { item, hits };
    })
    .filter(entry => entry.hits.length > 0)
    .sort((left, right) => right.hits.length - left.hits.length);
}

function conflictFor(key, field, applicant) {
  if (key !== 'eligibility' && key !== 'riskFactors') return null;
  // 능력·역할만 요구하는 문장은 자격 배제 근거가 아니다.
  if (CAPACITY_ONLY.test(field.value) && !EXPLICIT_EXCLUSION.some(rule => rule.applicant && rule.notice.test(field.value))) return null;
  for (const rule of EXPLICIT_EXCLUSION) {
    if (!rule.applicant || !rule.notice.test(field.value)) continue;
    const marker = (applicant.items || []).find(item => rule.applicant.test(`${item.label} ${item.value}`) && item.status === CONFIRMED_STATUS);
    if (marker) return { item: marker, reason: '공고가 명시적으로 배제한 기관 유형에 확인된 기관 정보가 해당합니다.' };
  }
  return null;
}

function questionFor(key, field, state) {
  const title = field.title;
  if (state === 'CONFIRMATION_REQUIRED') return `${title} 관련 기관 정보가 ‘확인 필요/오래된 정보’ 상태입니다. 현재도 유효한 사실인지 확인해 주시겠습니까? 확인되면 확인됨으로 바꿔 근거로 사용합니다.`;
  if (state === 'MISSING') return `${title}에 대해 기관이 제시할 수 있는 근거(실적·자격·자원)가 있습니까? 있다면 신청기관 정보에 등록해 주세요.`;
  if (state === 'CONFLICT') return `${title}에서 공고 요구와 기관의 확인된 사실이 어긋납니다. 신청 가능한 별도 자격(위탁·컨소시엄 등)이 있습니까?`;
  if (state === 'PARTIAL') return `${title}을 더 확실히 증명할 최근 실적이나 증빙이 있습니까?`;
  return '';
}

// 선정요건 한 개와 기관 정보를 맞춰 본다.
export function matchRequirement(field, applicant, split, structure = null) {
  const rule = FIELD_RULES[field.key] || { areas: ['basic'], allowHistory: true, emphasis: '관련 근거' };
  const noticeEvidence = field.evidence?.[0] || null;
  const base = {
    key: field.key,
    requirement: field.title,
    noticeAsked: field.status === '공식 근거 확인' ? String(field.value).slice(0, 200) : '공고에서 확인되지 않음',
    noticeEvidence: noticeEvidence ? { source: noticeEvidence.source, sentence: noticeEvidence.sentence } : null,
    emphasis: rule.emphasis
  };
  if (field.status !== '공식 근거 확인') {
    return { ...base, state: 'MISSING', reason: '공고에서 이 요건 자체가 확인되지 않아 기관 정보와 비교할 수 없습니다.', applicantEvidence: [], gap: '공고문·요강 원문을 추가로 확인해야 합니다.', question: `${field.title} 조건이 적힌 공고 문서를 추가로 넣어 주시겠습니까?` };
  }

  const conflict = conflictFor(field.key, field, applicant);
  if (conflict) {
    return {
      ...base, state: 'CONFLICT',
      applicantEvidence: [{ label: conflict.item.label, value: conflict.item.value, status: conflict.item.status, source: conflict.item.source, asOf: conflict.item.asOf || '', scope: 'profile' }],
      reason: conflict.reason,
      gap: '신청 자격을 충족하는 별도 근거가 필요합니다.',
      question: questionFor(field.key, field, 'CONFLICT')
    };
  }

  const profileHits = matchItems(field.value, split.profile, rule.areas);
  const allHistoryHits = rule.allowHistory ? matchItems(field.value, split.history, rule.areas) : [];
  // 일반 수행역량 실적은 대상 적합성·필수 사업내용의 근거로 쓰지 않는다.
  const historyHits = allHistoryHits.filter(entry => {
    const relevance = structure ? recordRelevance(entry.item, structure).level : 'DIRECT';
    entry.relevance = relevance;
    return relevance !== 'GENERAL' || GENERAL_ALLOWED_KEYS.includes(field.key);
  });
  const droppedGeneral = allHistoryHits.filter(entry => !historyHits.includes(entry));
  const confirmedProfile = profileHits.filter(entry => entry.item.status === CONFIRMED_STATUS);
  const confirmedHistory = historyHits.filter(entry => entry.item.status === CONFIRMED_STATUS);
  const unconfirmed = [...profileHits, ...historyHits].filter(entry => entry.item.status !== CONFIRMED_STATUS);
  const toEvidence = entry => ({ label: entry.item.label, value: entry.item.status === CONFIRMED_STATUS ? entry.item.value : '', status: entry.item.status, source: entry.item.source, asOf: entry.item.asOf || '', relevance: entry.relevance || '', scope: split.profile.some(item => item.id === entry.item.id) ? 'profile' : 'history' });

  if (confirmedProfile.length) {
    return { ...base, state: 'MATCHED', applicantEvidence: confirmedProfile.slice(0, 3).map(toEvidence), reason: '확인된 현재 기관 정보로 요건을 뒷받침할 수 있습니다.', gap: '', question: '' };
  }
  if (confirmedHistory.length) {
    return { ...base, state: 'PARTIAL', applicantEvidence: confirmedHistory.slice(0, 3).map(toEvidence), reason: '과거 사업 기록으로는 경험이 확인되지만 현재 기관 상태로 확정된 근거는 아닙니다.', gap: '현재 시점의 자격·자원·인력 정보를 확인해 두면 근거가 강해집니다.', question: questionFor(field.key, field, 'PARTIAL') };
  }
  if (unconfirmed.length) {
    return { ...base, state: 'CONFIRMATION_REQUIRED', applicantEvidence: unconfirmed.slice(0, 3).map(toEvidence), reason: '관련 정보는 있으나 확인 필요·오래된 정보라 확정 근거로 쓸 수 없습니다.', gap: '담당자 확인 후 ‘확인됨’으로 바꿔야 사용할 수 있습니다.', question: questionFor(field.key, field, 'CONFIRMATION_REQUIRED') };
  }
  if (droppedGeneral.length) {
    return {
      ...base, state: 'MISSING',
      applicantEvidence: droppedGeneral.slice(0, 2).map(entry => ({ ...toEvidence(entry), relevance: 'GENERAL' })),
      reason: '관련 실적이 이 공고의 대상·사업방식과 직접 연결되지 않는 일반 수행경험이라 이 요건의 근거로 쓰지 않았습니다.',
      gap: '공고 대상·사업내용과 직접 관련된 실적이 필요합니다.',
      question: `${field.title}에 해당하는 직접 실적(같은 대상·같은 사업방식)이 있습니까?`
    };
  }
  return { ...base, state: 'MISSING', applicantEvidence: [], reason: '기관 정보에서 이 요건과 연결할 근거를 찾지 못했습니다.', gap: '관련 실적·자격·자원을 신청기관 정보에 등록해야 합니다.', question: questionFor(field.key, field, 'MISSING') };
}

const CORE_KEYS = ['eligibility', 'requiredContent', 'target', 'periodBudget'];

// 점수를 만들지 않고 네 단계로만 결론을 낸다.
export function fitVerdict(matches) {
  if (!Array.isArray(matches) || !matches.length) return { verdict: '보완 후 검토', reasons: ['비교할 선정요건이 없습니다. 공고 자료를 먼저 분석해 주세요.'] };
  const byState = state => matches.filter(match => match.state === state);
  const core = matches.filter(match => CORE_KEYS.includes(match.key));
  const reasons = [];
  const conflicts = byState('CONFLICT');
  if (conflicts.length) {
    return { verdict: '신청 적합성 낮음', reasons: [`공고 요구와 확인된 기관 사실이 충돌합니다: ${conflicts.map(match => match.requirement).join(' · ')}`, ...conflicts.map(match => match.reason)] };
  }
  const coreMissing = core.filter(match => match.state === 'MISSING');
  const coreConfirm = core.filter(match => match.state === 'CONFIRMATION_REQUIRED');
  const matched = byState('MATCHED');
  const partial = byState('PARTIAL');
  if (coreMissing.length) reasons.push(`핵심 요건에 근거가 없습니다: ${coreMissing.map(match => match.requirement).join(' · ')}`);
  if (coreConfirm.length) reasons.push(`핵심 요건이 확인 필요 상태입니다: ${coreConfirm.map(match => match.requirement).join(' · ')}`);
  if (matched.length) reasons.push(`확인된 기관 정보로 뒷받침되는 요건 ${matched.length}건: ${matched.map(match => match.requirement).join(' · ')}`);
  if (partial.length) reasons.push(`과거 실적으로만 뒷받침되는 요건 ${partial.length}건: ${partial.map(match => match.requirement).join(' · ')}`);

  if (!coreMissing.length && !coreConfirm.length && matched.length >= Math.ceil(matches.length / 2)) return { verdict: '적합성이 높음', reasons };
  if (!coreMissing.length && matched.length + partial.length >= Math.ceil(matches.length / 3)) return { verdict: '조건부 적합', reasons };
  return { verdict: '보완 후 검토', reasons };
}

export function matchApplicantToNotice(structure, applicant) {
  const split = splitApplicantProfile(applicant);
  const matches = (structure?.fields || []).map(field => matchRequirement(field, applicant, split, structure));
  const records = split.history.map(item => ({ label: item.label, value: item.status === CONFIRMED_STATUS ? item.value : '', status: item.status, asOf: item.asOf || '', source: item.source, ...recordRelevance(item, structure) }));
  const verdict = fitVerdict(matches);
  const byState = Object.fromEntries(MATCH_STATES.map(state => [state, matches.filter(match => match.state === state).length]));
  return {
    applicantId: applicant?.id || '',
    applicantName: applicant?.name || '',
    noticeTitle: structure?.noticeTitle || '',
    matches,
    byState,
    verdict: verdict.verdict,
    verdictReasons: verdict.reasons,
    // 과거 실적이 이 공고와 얼마나 가까운지: DIRECT / RELATED / GENERAL
    recordRelevance: records,
    strengths: matches.filter(match => match.state === 'MATCHED' || match.state === 'PARTIAL').slice(0, 5),
    gaps: matches.filter(match => match.state === 'MISSING' || match.state === 'CONFLICT').slice(0, 5),
    confirmations: matches.filter(match => match.question).map(match => ({ requirement: match.requirement, question: match.question })),
    emphasis: matches.filter(match => match.state === 'MATCHED' || match.state === 'PARTIAL').map(match => ({ requirement: match.requirement, emphasis: match.emphasis, evidence: match.applicantEvidence })),
    // 지난 사업의 수치를 이번 사업 값으로 옮기지 않는다는 규칙을 함께 전달한다.
    rule: '기관 프로필의 확인됨 정보만 확정 근거로 사용한다. 과거 사업의 인원·회기·예산은 실적 근거로만 인용하고 이번 사업의 값으로 옮기지 않는다. 공고에 숫자 배점이 없으면 선정 확률이나 점수를 만들지 않는다.'
  };
}
