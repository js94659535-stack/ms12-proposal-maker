// 평가자 관점 검증. 점수 하나로 끝내지 않고 무엇을 고쳐야 하는지 항목으로 돌려준다.
import { SEVERITY, submissionReadiness, verifyBudget, verifyEvaluationCoverage, verifyHeadcount, verifyPeriods, verifyAttachments } from './consistency.js';
import { findUnsupportedClaims, repetitionReport } from './fact-guard.js';

export { SEVERITY };

// 과장·보장 표현. 선정을 약속하거나 근거 없이 단정하는 말이다.
const OVERCLAIM = [
  ['보장', /반드시\s*선정|선정을\s*보장|100%\s*(?:달성|성공|보장)|틀림없이|확실히\s*(?:선정|달성)/g],
  ['과장', /국내\s*최초|유일한\s*기관|최고의\s*(?:역량|전문성)|압도적|획기적/g],
  ['단정', /(?:모든|전체)\s*(?:대상자|참여자)[^\n]{0,15}(?:만족|향상|개선)(?:합니다|한다|했다)/g]
];

// 문제 → 대상 → 목표 → 활동 → 인력 → 예산 → 성과. 하나라도 끊기면 평가자가 실행 가능성을 믿기 어렵다.
const CHAIN = [
  ['problem', '해결하려는 문제'], ['target', '사업 대상'], ['goal', '목표'],
  ['activities', '세부 활동'], ['staff', '수행인력'], ['budget', '예산'], ['outcome', '성과지표']
];

function item(severity, area, finding, action, extra = {}) {
  return { severity, area, finding, action, ...extra };
}

// 계획서 한 부를 평가자의 눈으로 본다. 자료가 없으면 없다고 말하고 지어내지 않는다.
export function evaluatorReview({
  notice = {}, applicant = {}, sections = [], chain = {}, budget = null, headcount = null,
  documents = [], criteria = [], attachments = null, sources = ''
} = {}) {
  const findings = [];
  const text = sections.map(section => `${section?.title || ''}\n${section?.content || ''}`).join('\n');

  // 1. 신청 자격
  if (!notice.eligibility) {
    findings.push(item(SEVERITY.critical, '신청 자격', '공고의 신청 자격을 확인하지 못했습니다.', '공고문에서 신청 자격 조항을 찾아 넣어 주세요.'));
  } else if (!applicant.eligibilityConfirmed) {
    findings.push(item(SEVERITY.critical, '신청 자격', '신청 자격 충족 여부가 확인되지 않았습니다.', '기관정보에서 자격 요건 충족을 확인해 주세요.'));
  }

  // 2. 공고 목적과의 연결
  if (notice.purpose && !overlaps(text, notice.purpose)) {
    findings.push(item(SEVERITY.major, '공고 목적', '공고 목적과 직접 이어지는 문장을 찾지 못했습니다.', '사업 목적 항목에서 공고 목적을 그대로 받아 연결해 주세요.'));
  }

  // 3. 대상자 필요의 근거
  if (!chain.demandEvidence) {
    findings.push(item(SEVERITY.major, '대상자 필요', '대상자의 필요를 뒷받침하는 근거가 연결되지 않았습니다.', '확인된 조사·상담·통계 근거를 연결하거나 확인 필요로 남겨 주세요.'));
  }

  // 4. 수행 역량
  if (!applicant.capacityConfirmed) {
    findings.push(item(SEVERITY.major, '수행 역량', '신청기관이 실제로 수행할 수 있다는 확인된 근거가 부족합니다.', '인력·시설·실적 중 확인된 항목을 연결해 주세요.'));
  }

  // 5~7. 논리 사슬
  for (const [key, label] of CHAIN) {
    if (!chain[key]) findings.push(item(SEVERITY.critical, '논리 연결', `${label}이(가) 비어 있어 앞뒤 항목이 이어지지 않습니다.`, `${label} 항목을 채우거나 확인 필요로 남겨 주세요.`, { chainKey: key }));
  }

  // 8. 숫자 검산
  const budgetCheck = budget ? verifyBudget(budget) : { findings: [] };
  const headcountCheck = headcount ? verifyHeadcount(headcount) : { findings: [] };
  const periodCheck = verifyPeriods(documents);
  // 9. 평가항목 누락
  const coverage = verifyEvaluationCoverage({ criteria, sections });
  // 10. 필수 첨부
  const attachmentCheck = attachments ? verifyAttachments(attachments) : { findings: [] };
  // 검산 결과도 「무엇이 문제이고 무엇을 해야 하는가」 같은 모양으로 맞춘다.
  findings.push(...[budgetCheck, headcountCheck, periodCheck, coverage, attachmentCheck]
    .flatMap(check => (check.findings || []).map(asFinding)));

  // 11. 과장·보장 표현
  for (const [label, pattern] of OVERCLAIM) {
    for (const match of text.matchAll(pattern)) {
      findings.push(item(SEVERITY.major, '표현', `${label} 표현이 있습니다: 「${match[0].trim()}」`, '확인된 사실로 바꾸거나 문장을 지워 주세요.'));
    }
  }

  // 12. 근거 없는 값
  const unsupported = findUnsupportedClaims(text, sources);
  for (const claim of unsupported.slice(0, 20)) {
    findings.push(item(SEVERITY.critical, '근거 없는 값', `자료에 없는 값이 그대로 쓰였습니다: 「${claim.value}」`, `${claim.mark}로 두고 확인한 뒤 채워 주세요.`, { kind: claim.kind }));
  }

  // 13. 같은 말로 분량 채우기
  const repetition = repetitionReport(sections);
  if (repetition.padded) {
    findings.push(item(SEVERITY.minor, '분량', `같은 문장이 ${repetition.repeatedCount}번 반복됩니다.`, '반복 문장을 지우고 근거가 부족한 곳은 확인 필요로 남겨 주세요.'));
  }

  const readiness = submissionReadiness([{ findings }]);
  return {
    findings,
    counts: readiness.counts,
    verdict: readiness.verdict,
    submitReady: readiness.ready,
    // 제출자가 마지막으로 확인해야 할 것.
    finalChecks: findings.filter(entry => entry.severity !== SEVERITY.minor).slice(0, 10).map(entry => entry.action),
    budget: budgetCheck, headcount: headcountCheck, period: periodCheck, coverage, attachments: attachmentCheck, repetition
  };
}


// 검산 모듈은 message로 알려 준다. 평가자 검토는 finding·action으로 쓴다. 여기서 한 모양으로 맞춘다.
const ACTION_BY_AREA = {
  '예산': '금액을 다시 확인해 합계를 맞춰 주세요.',
  '대상 인원': '목표 인원과 활동별 인원 중 어느 쪽이 맞는지 확정해 주세요.',
  '사업기간': '어느 자료의 기간이 맞는지 확인하고 하나로 맞춰 주세요.',
  '평가항목': '해당 평가항목에 대응하는 항목을 추가해 주세요.',
  '첨부자료': '필수 첨부를 준비하거나 준비 상태를 표시해 주세요.'
};
function asFinding(entry) {
  return { severity: entry.severity, area: entry.area, finding: entry.message, action: ACTION_BY_AREA[entry.area] || '확인 후 수정해 주세요.', ...entry };
}
function overlaps(text, phrase) {
  const words = String(phrase || '').split(/[\s·,]+/).filter(word => word.length >= 2);
  const haystack = String(text || '').replace(/\s+/g, '');
  return words.some(word => haystack.includes(word));
}
