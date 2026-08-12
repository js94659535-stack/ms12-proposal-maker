// 숫자와 항목이 서로 맞는지 서버가 검산한다.
// 모델이 계산한 합계를 믿지 않는다. 합계가 어긋나면 제출 준비 완료로 표시하지 않는다.

export const SEVERITY = Object.freeze({ critical: '치명적 문제', major: '중요 보완', minor: '권장 개선' });
export const SEVERITY_ORDER = Object.freeze([SEVERITY.critical, SEVERITY.major, SEVERITY.minor]);

const number = value => {
  const plain = String(value ?? '').replace(/[,\s원]/g, '');
  const parsed = Number(plain);
  return Number.isFinite(parsed) ? parsed : null;
};

function finding(severity, area, message, extra = {}) {
  return { severity, area, message, ...extra };
}

// ---------- 예산 검산 ----------
// 항목별 금액을 서버가 더한다. 모델이 적어 낸 총액·자부담·지원금과 맞는지 본다.
export function verifyBudget({ items = [], statedTotal, support, ownShare, limit } = {}) {
  const rows = (Array.isArray(items) ? items : []).map((item, index) => {
    const unit = number(item?.unitPrice ?? item?.unit);
    const count = number(item?.count ?? item?.quantity);
    const amount = number(item?.amount ?? item?.total);
    const computed = unit !== null && count !== null ? unit * count : null;
    return { index, name: String(item?.name || item?.title || `항목 ${index + 1}`), unit, count, amount, computed };
  });
  const findings = [];

  for (const row of rows) {
    if (row.computed !== null && row.amount !== null && row.computed !== row.amount) {
      findings.push(finding(SEVERITY.critical, '예산',
        `${row.name}: 단가×수량 ${row.computed.toLocaleString()}원과 적힌 금액 ${row.amount.toLocaleString()}원이 다릅니다.`,
        { itemIndex: row.index, computed: row.computed, stated: row.amount }));
    }
    if (row.amount === null && row.computed === null) {
      findings.push(finding(SEVERITY.major, '예산', `${row.name}: 금액을 확인할 수 없습니다.`, { itemIndex: row.index }));
    }
  }

  const sum = rows.reduce((total, row) => total + (row.amount ?? row.computed ?? 0), 0);
  const stated = number(statedTotal);
  if (stated !== null && sum !== stated) {
    findings.push(finding(SEVERITY.critical, '예산',
      `세부 합계 ${sum.toLocaleString()}원과 적힌 총액 ${stated.toLocaleString()}원이 다릅니다.`, { computed: sum, stated }));
  }
  const supportValue = number(support);
  const ownValue = number(ownShare);
  if (supportValue !== null && ownValue !== null) {
    const parts = supportValue + ownValue;
    const compareTo = stated ?? sum;
    if (parts !== compareTo) {
      findings.push(finding(SEVERITY.critical, '예산',
        `지원금 ${supportValue.toLocaleString()}원 + 자부담 ${ownValue.toLocaleString()}원 = ${parts.toLocaleString()}원이 총액 ${compareTo.toLocaleString()}원과 다릅니다.`,
        { computed: parts, stated: compareTo }));
    }
  }
  const limitValue = number(limit);
  if (limitValue !== null && supportValue !== null && supportValue > limitValue) {
    findings.push(finding(SEVERITY.critical, '예산',
      `신청 지원금 ${supportValue.toLocaleString()}원이 공고 지원한도 ${limitValue.toLocaleString()}원을 넘습니다.`,
      { computed: supportValue, stated: limitValue }));
  }
  return { rows, computedTotal: sum, statedTotal: stated, findings, balanced: findings.length === 0 };
}

// ---------- 인원 검산 ----------
// 목표 인원과 활동별 인원이 다르면 어느 쪽이 맞는지 사람이 정해야 한다.
export function verifyHeadcount({ target, activities = [] } = {}) {
  const targetValue = number(target);
  const rows = (Array.isArray(activities) ? activities : []).map((activity, index) => ({
    index, name: String(activity?.name || activity?.title || `활동 ${index + 1}`), count: number(activity?.count ?? activity?.headcount)
  }));
  const counted = rows.filter(row => row.count !== null);
  const findings = [];
  if (targetValue === null) return { findings, target: null, activityMax: null, matched: true };
  const max = counted.length ? Math.max(...counted.map(row => row.count)) : null;
  for (const row of counted) {
    if (row.count > targetValue) {
      findings.push(finding(SEVERITY.major, '대상 인원',
        `${row.name}의 인원 ${row.count}명이 사업 목표 인원 ${targetValue}명보다 많습니다.`, { activityIndex: row.index }));
    }
  }
  if (max !== null && max < targetValue && counted.length === rows.length && rows.length > 0) {
    findings.push(finding(SEVERITY.minor, '대상 인원',
      `활동별 최대 인원 ${max}명이 목표 인원 ${targetValue}명에 못 미칩니다. 목표 달성 경로를 확인해 주세요.`));
  }
  return { findings, target: targetValue, activityMax: max, matched: findings.length === 0 };
}

// ---------- 기간 충돌 ----------
// 여러 자료에 사업기간이 다르게 적혀 있으면 하나를 고르지 않고 충돌로 남긴다.
const PERIOD = /(20\d{2})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]?\s*(?:(\d{1,2})\s*[.일]?)?\s*[~\-–]\s*(20\d{2})?\s*[.\-년]?\s*(\d{1,2})\s*[.\-월]?\s*(?:(\d{1,2})\s*[.일]?)?/g;

export function verifyPeriods(documents = []) {
  const found = [];
  for (const document of Array.isArray(documents) ? documents : []) {
    const label = String(document?.label || document?.name || '자료');
    for (const match of String(document?.text || '').matchAll(PERIOD)) {
      const start = `${match[1]}-${String(match[2]).padStart(2, '0')}`;
      const endYear = match[4] || match[1];
      const end = `${endYear}-${String(match[5]).padStart(2, '0')}`;
      found.push({ label, period: `${start} ~ ${end}`, raw: match[0].replace(/\s+/g, ' ').trim() });
    }
  }
  const unique = [...new Set(found.map(item => item.period))];
  const findings = unique.length > 1
    ? [finding(SEVERITY.critical, '사업기간',
      `자료마다 사업기간이 다릅니다: ${found.map(item => `${item.label} ${item.period}`).join(' / ')}. 확인 전에는 확정하지 않습니다.`,
      { values: unique })]
    : [];
  return { found, unique, findings, conflict: unique.length > 1 };
}

// ---------- 평가항목 대응 ----------
export function verifyEvaluationCoverage({ criteria = [], sections = [] } = {}) {
  const text = (Array.isArray(sections) ? sections : []).map(section => `${section?.title || ''} ${section?.content || ''}`).join('\n');
  const compact = value => String(value || '').replace(/\s+/g, '').toLowerCase();
  const haystack = compact(text);
  const missing = (Array.isArray(criteria) ? criteria : []).filter(item => {
    const name = compact(item?.name || item?.title || item);
    if (!name || name.length < 2) return false;
    if (haystack.includes(name)) return false;
    // 이름이 길면 핵심 낱말로 한 번 더 본다.
    const words = String(item?.name || item?.title || item).split(/[\s·,]+/).filter(word => word.length >= 2);
    return !words.some(word => haystack.includes(compact(word)));
  }).map(item => String(item?.name || item?.title || item));
  const findings = missing.map(name => finding(SEVERITY.critical, '평가항목', `평가항목 「${name}」에 대응하는 내용이 계획서에 없습니다.`, { criterion: name }));
  return { missing, findings, covered: missing.length === 0 };
}

// ---------- 필수 첨부 ----------
export function verifyAttachments({ required = [], provided = [] } = {}) {
  const have = new Set((Array.isArray(provided) ? provided : []).map(item => String(item?.name || item).replace(/\s+/g, '')));
  const missing = (Array.isArray(required) ? required : [])
    .map(item => String(item?.name || item))
    .filter(name => ![...have].some(present => present.includes(name.replace(/\s+/g, ''))));
  const findings = missing.map(name => finding(SEVERITY.major, '첨부자료', `필수 첨부 「${name}」가 준비되지 않았습니다.`, { attachment: name }));
  return { missing, findings, complete: missing.length === 0 };
}

// ---------- 제출 준비 판정 ----------
// 치명적 문제가 하나라도 있으면 제출 준비 완료로 표시하지 않는다.
export function submissionReadiness(groups = []) {
  const findings = groups.flatMap(group => group?.findings || []);
  const counts = Object.fromEntries(SEVERITY_ORDER.map(level => [level, findings.filter(item => item.severity === level).length]));
  return {
    findings,
    counts,
    ready: counts[SEVERITY.critical] === 0,
    verdict: counts[SEVERITY.critical] ? '제출 전 수정 필요'
      : counts[SEVERITY.major] ? '보완 권고' : '제출 준비 확인'
  };
}
