// 공고의 선정 논리와 신청기관의 확인된 정보·사업실적을 항목별로 맞춰 본다.
// 규칙 기반 로컬 비교만 하고 외부 API를 호출하지 않는다. 점수를 만들지 않고 근거만 남긴다.
import { CONFIRMED_STATUS, areaTitle, splitApplicantProfile } from './applicants.js';

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

// 공고가 요구하는 기관 성격과 명백히 어긋나는 표시(영리 법인 등)만 충돌로 본다.
const NONPROFIT_REQUIRED = /비영리|사회복지법인|사단법인|재단법인|아동보호전문기관|지역아동센터|사회복지시설|공공기관/;
const FOR_PROFIT_MARK = /\(주\)|㈜|주식회사|유한회사|영리/;

function tokensOf(value) {
  return [...new Set(String(value || '').replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/).filter(token => token.length > 1))];
}
const STOPWORDS = new Set(['사업', '지원', '기관', '내용', '경우', '해당', '관련', '통해', '위한', '있는', '있음', '대상', '제출', '작성', '확인', '필요']);

function matchItems(fieldText, items, areas) {
  const keys = tokensOf(fieldText).filter(token => !STOPWORDS.has(token));
  return items
    .filter(item => areas.includes(item.area))
    .map(item => {
      const haystack = `${item.label} ${item.value} ${areaTitle(item.area)}`;
      const hits = keys.filter(token => haystack.includes(token));
      return { item, hits };
    })
    .filter(entry => entry.hits.length > 0 || entry.item.area === areas[0])
    .sort((left, right) => right.hits.length - left.hits.length);
}

function conflictFor(key, field, applicant) {
  if (key !== 'eligibility' && key !== 'riskFactors') return null;
  if (!NONPROFIT_REQUIRED.test(field.value)) return null;
  const marker = (applicant.items || []).find(item => FOR_PROFIT_MARK.test(`${item.label} ${item.value}`) && item.status === CONFIRMED_STATUS);
  if (!marker) return null;
  return { item: marker, reason: '공고는 비영리·사회복지 계열 기관을 요구하는데 확인된 기관 정보는 영리법인 표기입니다.' };
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
export function matchRequirement(field, applicant, split) {
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
  const historyHits = rule.allowHistory ? matchItems(field.value, split.history, rule.areas) : [];
  const confirmedProfile = profileHits.filter(entry => entry.item.status === CONFIRMED_STATUS);
  const confirmedHistory = historyHits.filter(entry => entry.item.status === CONFIRMED_STATUS);
  const unconfirmed = [...profileHits, ...historyHits].filter(entry => entry.item.status !== CONFIRMED_STATUS);
  const toEvidence = entry => ({ label: entry.item.label, value: entry.item.status === CONFIRMED_STATUS ? entry.item.value : '', status: entry.item.status, source: entry.item.source, asOf: entry.item.asOf || '', scope: split.profile.some(item => item.id === entry.item.id) ? 'profile' : 'history' });

  if (confirmedProfile.length) {
    return { ...base, state: 'MATCHED', applicantEvidence: confirmedProfile.slice(0, 3).map(toEvidence), reason: '확인된 현재 기관 정보로 요건을 뒷받침할 수 있습니다.', gap: '', question: '' };
  }
  if (confirmedHistory.length) {
    return { ...base, state: 'PARTIAL', applicantEvidence: confirmedHistory.slice(0, 3).map(toEvidence), reason: '과거 사업 기록으로는 경험이 확인되지만 현재 기관 상태로 확정된 근거는 아닙니다.', gap: '현재 시점의 자격·자원·인력 정보를 확인해 두면 근거가 강해집니다.', question: questionFor(field.key, field, 'PARTIAL') };
  }
  if (unconfirmed.length) {
    return { ...base, state: 'CONFIRMATION_REQUIRED', applicantEvidence: unconfirmed.slice(0, 3).map(toEvidence), reason: '관련 정보는 있으나 확인 필요·오래된 정보라 확정 근거로 쓸 수 없습니다.', gap: '담당자 확인 후 ‘확인됨’으로 바꿔야 사용할 수 있습니다.', question: questionFor(field.key, field, 'CONFIRMATION_REQUIRED') };
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
  const matches = (structure?.fields || []).map(field => matchRequirement(field, applicant, split));
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
    strengths: matches.filter(match => match.state === 'MATCHED' || match.state === 'PARTIAL').slice(0, 5),
    gaps: matches.filter(match => match.state === 'MISSING' || match.state === 'CONFLICT').slice(0, 5),
    confirmations: matches.filter(match => match.question).map(match => ({ requirement: match.requirement, question: match.question })),
    emphasis: matches.filter(match => match.state === 'MATCHED' || match.state === 'PARTIAL').map(match => ({ requirement: match.requirement, emphasis: match.emphasis, evidence: match.applicantEvidence })),
    // 지난 사업의 수치를 이번 사업 값으로 옮기지 않는다는 규칙을 함께 전달한다.
    rule: '기관 프로필의 확인됨 정보만 확정 근거로 사용한다. 과거 사업의 인원·회기·예산은 실적 근거로만 인용하고 이번 사업의 값으로 옮기지 않는다. 공고에 숫자 배점이 없으면 선정 확률이나 점수를 만들지 않는다.'
  };
}
