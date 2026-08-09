// 검증에서 나온 문제를 「수정계획(repairPlan)」으로 구조화한다.
// 특정 계획서에 맞춘 규칙이 아니라 모든 사업계획서에 재사용하는 공통 레이어다.
// 규칙 기반 로컬 처리만 사용하며 외부 API를 호출하지 않는다.
import { compactEvidence, extractLockedValues, matchSectionsForIssue, verifyLockedValues } from './coaching-handoff.js';

export const ISSUE_TYPES = [
  'factual-conflict', 'calculation-error', 'missing-information', 'requirement-conflict',
  'logic-gap', 'evidence-gap', 'outcome-gap', 'role-scope-conflict', 'expression'
];
export const ISSUE_TYPE_LABELS = {
  'factual-conflict': '사실·수치 충돌', 'calculation-error': '계산·합계·산식 오류', 'missing-information': '필수정보 누락',
  'requirement-conflict': '공고·요강 요구와 충돌', 'logic-gap': '논리 연결 부족', 'evidence-gap': '근거 부족',
  'outcome-gap': '성과목표·지표 부족', 'role-scope-conflict': '인력·기관·역할 범위 불일치', 'expression': '표현·중복·가독성'
};
export const REPAIR_LEVELS = ['AUTO', 'EVIDENCE_BASED', 'USER_CONFIRMATION'];
// 수정에 사용할 사실의 우선순위. 추론만으로는 새 사실을 확정하지 않는다.
export const SOURCE_OF_TRUTH = ['공식 공고·요강·평가기준', '사용자가 확인한 이번 사업 정보', '확인된 신청기관 정보', '계획서 내부 원문', '추론'];

// 앞에 있는 규칙이 더 구체적이다. 표현 문제는 다른 유형이 아닐 때만 쓴다.
const TYPE_RULES = [
  { type: 'calculation-error', test: value => /합계|산식|계산|더하면|소계|총액|×|비율/.test(value.text) && /맞지 않|일치하지 않|오류|상충|초과/.test(value.text) && value.numbers.length >= 2 },
  { type: 'role-scope-conflict', test: value => /인력|담당자|조직도|역할|투입|협력기관|수행기관/.test(value.text) && /불일치|다르|상이|충돌|사이의/.test(value.text) },
  { type: 'requirement-conflict', test: value => /공고|요강|지침|자격 기준|평가기준|필수 제출|예산규정/.test(value.text) && /위반|충돌|미충족|불일치|어긋/.test(value.text) },
  { type: 'factual-conflict', test: value => /충돌|불일치|상충|다르게 기재|서로 다른|다릅니다/.test(value.text) },
  { type: 'outcome-gap', test: value => /성과목표|성과지표|목표값|측정도구|측정방법|달성기준|정량 지표/.test(value.text) },
  { type: 'missing-information', test: value => /공란|비어 있|미작성|누락|기재되지 않|미기재|작성되지 않/.test(value.text) },
  { type: 'logic-gap', test: value => /(?:맞지 않|부적합|연결|논리|흐름)/.test(value.text) && /대상|프로그램|직무|교육내용|필요성|성과/.test(value.text) },
  { type: 'evidence-gap', test: value => /근거|출처|입증|수요조사|선언적|자료가 없|확인할 수 없|제시되지 않/.test(value.text) },
  { type: 'expression', test: value => (value.riskType === 'expression' || /표현|중복|가독|편집|오탈자|장황/.test(value.text)) && !/근거|입증|누락|공란|부적합/.test(value.text) }
];

function text(value, max = 600) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
// 유형 판정에는 문제 설명만 쓴다. 개선 방향에는 여러 영역이 함께 언급돼 유형이 흐려진다.
function issueText(issue) {
  return [issue?.category, issue?.reason, issue?.problem, issue?.location].filter(Boolean).join(' ');
}
function numbersIn(value) {
  return [...new Set((String(value || '').match(/\d[\d,]*\s*(?:천원|만원|억원|원|명|회기|회|시간|주|개월|년|%)/g) || []).map(item => item.replace(/\s+/g, '')))];
}

export function classifyIssueType(issue) {
  const value = { text: issueText(issue), riskType: issue?.riskType || '', numbers: numbersIn(`${issue?.reason || ''} ${(issue?.evidenceRefs || []).map(ref => ref.excerpt).join(' ')}`) };
  return TYPE_RULES.find(rule => rule.test(value))?.type || 'evidence-gap';
}

// 서로 다른 두 값을 고르라고 요구하는 문제인지 확인한다(5명/8명, 2024/2025 등).
export function conflictingValues(issue) {
  const excerpts = (issue?.evidenceRefs || []).map(ref => ref.excerpt || '');
  const fromEvidence = excerpts.length >= 2 ? excerpts.map(numbersIn) : [];
  const pairs = new Set();
  if (fromEvidence.length >= 2) {
    for (const [index, values] of fromEvidence.entries()) {
      for (const other of fromEvidence.slice(index + 1)) {
        for (const value of values) for (const compare of other) if (value !== compare && unitOf(value) === unitOf(compare)) { pairs.add(value); pairs.add(compare); }
      }
    }
  }
  if (!pairs.size) {
    // 한 문장 안에서 "A인데 B" 형태로 두 값을 제시하는 경우
    const inline = numbersIn(`${issue?.reason || ''} ${issue?.problem || ''}`);
    const grouped = inline.reduce((groups, value) => ({ ...groups, [unitOf(value)]: [...(groups[unitOf(value)] || []), value] }), {});
    for (const values of Object.values(grouped)) if (values.length >= 2 && /충돌|불일치|상충|맞지 않|다릅|사이의/.test(issueText(issue))) values.forEach(value => pairs.add(value));
  }
  return [...pairs];
}
function unitOf(value) { return String(value).replace(/[\d,]/g, ''); }

// 산식을 읽어 입력값과 결과가 모두 확정되어 있는지 확인한다.
// A) 입력값이 확정되고 결과만 틀림 → 자동 산출 가능, B) 어느 입력값이 틀렸는지 알 수 없음 → 사용자 확인.
const FORMULA_PATTERN = /([\d,]+)\s*(천원|만원|억원|원|명|주|회기|회|시간|개월)?\s*[×xX*]\s*([\d,]+)\s*(천원|만원|억원|원|명|주|회기|회|시간|개월)?(?:\s*[×xX*]\s*([\d,]+)\s*(천원|만원|억원|원|명|주|회기|회|시간|개월)?)?/;
function numeric(value) { return Number(String(value ?? '').replace(/[^\d.]/g, '')); }

export function analyzeCalculation(issue, context = {}) {
  const evidence = (issue?.evidenceRefs || []).map(ref => ref.excerpt || '').join(' ');
  const scope = `${evidence} ${issue?.reason || ''}`;
  const match = evidence.match(FORMULA_PATTERN) || scope.match(FORMULA_PATTERN);
  if (!match) return { hasFormula: false, operandsConfirmed: false, computed: null, stated: [], ambiguous: numbersIn(scope).length >= 2 };
  const operands = [match[1], match[3], match[5]].filter(Boolean).map(numeric).filter(Number.isFinite);
  const unit = match[2] || match[4] || match[6] || '';
  const computed = operands.length >= 2 ? operands.reduce((product, value) => product * value, 1) : null;
  // 문서에 적힌 결과값만 본다. 검증 설명에 나온 계산값은 문서의 확정값이 아니다.
  const stated = numbersIn(evidence || scope).filter(value => unitOf(value) === unit).map(numeric).filter(value => Number.isFinite(value) && !operands.includes(value));
  const confirmedValues = [
    ...(context.projectValues || []).map(value => String(value.value ?? value.thisProjectValue ?? '')),
    ...(context.confirmedFacts || []).map(fact => String(fact.content ?? '')),
    ...(context.references || []).filter(reference => reference.usage === '공식 근거로 사용 가능').map(reference => String(reference.text ?? ''))
  ].join(' ');
  const operandsConfirmed = operands.length >= 2 && operands.every(value => confirmedValues.includes(value.toLocaleString()) || confirmedValues.includes(String(value)));
  // 결과값이 두 개 이상 경합하면 어느 입력이 틀렸는지 알 수 없다.
  const ambiguous = stated.length > 0 && computed !== null && !stated.includes(computed);
  return { hasFormula: true, operands, unit, computed, stated, operandsConfirmed, ambiguous };
}

function sourceForIssue(issue, context = {}) {
  const officialReference = (context.references || []).find(reference => reference.usage === '공식 근거로 사용 가능');
  if (officialReference) return { level: SOURCE_OF_TRUTH[0], detail: officialReference.fileName };
  const projectValue = (context.projectValues || []).find(value => issueText(issue).includes(String(value.label || '')));
  if (projectValue) return { level: SOURCE_OF_TRUTH[1], detail: `${projectValue.label} = ${projectValue.value ?? projectValue.thisProjectValue}` };
  const confirmedFact = (context.confirmedFacts || []).find(fact => issueText(issue).includes(String(fact.title || '')));
  if (confirmedFact) return { level: SOURCE_OF_TRUTH[2], detail: `${confirmedFact.title}: ${confirmedFact.content}` };
  if ((issue?.evidenceRefs || []).some(ref => ref.verified && ref.excerpt)) return { level: SOURCE_OF_TRUTH[3], detail: '계획서 원문 근거' };
  return { level: SOURCE_OF_TRUTH[4], detail: '확인된 근거 없음' };
}

function confirmationQuestionFor(issue, values, type) {
  const location = text(issue?.location, 120) || ISSUE_TYPE_LABELS[type];
  if (values.length >= 2) {
    return `${location}에서 ${values.join(' 와(과) ')} 중 이번 사업의 확정값은 무엇입니까? 두 값이 각각 다른 대상을 뜻한다면 어떤 기준으로 나뉘는지도 알려 주세요.`;
  }
  return `${location}의 확정 내용을 알려 주세요. 확인 전에는 계획서를 수정하지 않습니다.`;
}

function verificationRuleFor(type) {
  if (type === 'calculation-error') return '수정 후 산식과 합계를 다시 계산해 총액·소계가 일치하는지 확인한다.';
  if (type === 'factual-conflict' || type === 'role-scope-conflict') return '같은 값이 계획서 전체에서 하나로 통일되었는지 확인한다.';
  if (type === 'missing-information') return '해당 항목이 채워졌고 [확인 필요] 표시가 남아 있지 않은지 확인한다.';
  if (type === 'requirement-conflict') return '공식 공고·요강 원문과 대조해 요구 조건을 충족하는지 확인한다.';
  if (type === 'outcome-gap') return '성과지표에 목표값·측정도구·측정시기·담당이 모두 있는지 확인한다.';
  if (type === 'logic-gap') return '필요성 → 대상 → 프로그램 → 예산 → 성과목표 → 성과지표가 같은 수치로 이어지는지 확인한다.';
  if (type === 'expression') return '수정 전후에 사실·수치가 그대로인지 확인한다.';
  return '수정 내용이 확인된 근거 범위 안에 있는지 확인한다.';
}

// 문제 1건을 수정계획으로 만든다. 사실을 새로 만들지 않고 무엇이 필요한지만 정리한다.
export function buildRepairPlan(issue, context = {}) {
  const sections = context.sections || [];
  const type = classifyIssueType(issue);
  const sectionIds = matchSectionsForIssue(sections, issue);
  const targets = sectionIds.map(id => sections.find(section => section.id === id)).filter(Boolean);
  const values = conflictingValues(issue);
  const proposedRevision = text(issue?.example ?? issue?.suggestion, 800);
  const needsConfirmation = values.length >= 2 || issue?.requiresConfirmation === true;
  const source = sourceForIssue(issue, context);
  const hasPlaceholder = /\[확인 필요/.test(proposedRevision);

  // 실제로 믿을 수 있는 근거(공고·이번 사업 확정값·확인된 기관정보)가 있는지
  const trustedSource = [SOURCE_OF_TRUTH[0], SOURCE_OF_TRUTH[1], SOURCE_OF_TRUTH[2]].includes(source.level);
  const calculation = type === 'calculation-error' ? analyzeCalculation(issue, context) : null;
  const needsExternalFact = ['missing-information', 'outcome-gap', 'evidence-gap'].includes(type);

  let level = 'AUTO';
  let autoFixable = false;
  if (type === 'expression') { level = 'AUTO'; autoFixable = true; }
  else if (calculation?.hasFormula && calculation.operandsConfirmed && !calculation.ambiguous) {
    // A) 입력값이 모두 확정되고 결과만 틀린 경우 → 결과를 자동 산출한다.
    level = trustedSource ? 'EVIDENCE_BASED' : 'AUTO';
    autoFixable = true;
  } else if (type === 'calculation-error' || values.length >= 2) {
    // B) 어느 입력값이 맞는지 알 수 없는 경우 → 임의 선택하지 않는다.
    level = 'USER_CONFIRMATION';
  } else if (needsExternalFact) {
    // 없는 내용을 채우는 문제는 믿을 수 있는 근거가 있을 때만 수정한다.
    level = trustedSource ? 'EVIDENCE_BASED' : 'USER_CONFIRMATION';
  } else if (hasPlaceholder || !trustedSource) {
    level = source.level === SOURCE_OF_TRUTH[4] ? 'USER_CONFIRMATION' : 'EVIDENCE_BASED';
  }

  return {
    id: `repair-${type}-${text(issue?.location, 24).replace(/\s+/g, '') || 'general'}`,
    issueType: type,
    issueTypeLabel: ISSUE_TYPE_LABELS[type],
    repairLevel: level,
    targetSection: targets.map(section => ({ id: section.id, title: text(section.title, 80) })),
    currentContent: text(targets[0]?.content || issue?.current, 300),
    evidence: (issue?.evidenceRefs || []).filter(ref => ref?.excerpt).map(ref => ({ excerpt: text(ref.excerpt, 300), location: text(ref.proposalLocation || ref.pageOrSection, 80), verified: ref.verified === true })),
    problem: text(issue?.reason ?? issue?.problem, 500),
    repairMethod: text(issue?.direction, 500),
    lockedValues: [...new Set(targets.flatMap(section => extractLockedValues([section])))],
    conflictingValues: values,
    sourceOfTruth: source,
    requiresConfirmation: needsConfirmation || level === 'USER_CONFIRMATION',
    confirmationQuestion: level === 'USER_CONFIRMATION' ? confirmationQuestionFor(issue, calculation?.ambiguous ? [...new Set([...values, ...calculation.stated.map(value => `${value.toLocaleString()}${calculation.unit}`), `${calculation.computed?.toLocaleString()}${calculation.unit}`])].filter(Boolean) : values, type) : '',
    proposedRevision: autoFixable && calculation?.computed && !calculation.ambiguous
      ? `${proposedRevision} → 자동 산출 결과 ${calculation.computed.toLocaleString()}${calculation.unit}`.trim()
      : proposedRevision,
    autoFixable,
    computedValue: autoFixable && calculation?.computed ? `${calculation.computed.toLocaleString()}${calculation.unit}` : '',
    calculation: calculation ? { hasFormula: calculation.hasFormula, operands: calculation.operands || [], computed: calculation.computed, stated: calculation.stated, operandsConfirmed: calculation.operandsConfirmed, ambiguous: calculation.ambiguous } : null,
    verificationRule: verificationRuleFor(type),
    priority: text(issue?.priority, 20)
  };
}

export function buildRepairPlans(issues, context = {}) {
  return (Array.isArray(issues) ? issues : []).map(issue => buildRepairPlan(issue, context));
}

// 수정계획을 통해서만 V2를 만든다. 단계별로 실제 수정 여부가 다르다.
export function applyRepairPlans(sections, plans, { confirmations = {} } = {}) {
  let current = (Array.isArray(sections) ? sections : []).map(section => ({ ...section }));
  const applied = [];
  const questions = [];
  const blocked = [];

  for (const plan of Array.isArray(plans) ? plans : []) {
    const answer = confirmations[plan.id];
    const targets = plan.targetSection.map(target => current.find(section => section.id === target.id)).filter(Boolean);
    if (!targets.length) { blocked.push({ plan, reason: '수정할 문단을 찾지 못했습니다. 대상 항목을 직접 지정하세요.' }); continue; }

    if (plan.repairLevel === 'USER_CONFIRMATION' && !answer) { questions.push({ id: plan.id, question: plan.confirmationQuestion, values: plan.conflictingValues, location: plan.targetSection.map(target => target.title) }); continue; }
    if (plan.repairLevel === 'EVIDENCE_BASED' && !answer && plan.sourceOfTruth.level === SOURCE_OF_TRUTH[4]) { blocked.push({ plan, reason: '공식 공고·확인된 기관정보 등 근거가 없어 수정하지 않았습니다.' }); continue; }

    const revision = answer ? `${plan.proposedRevision.replace(/\[확인 필요[^\]]*\]/g, String(answer))}` : plan.proposedRevision;
    let changed = false;
    for (const target of targets) {
      const before = target.content;
      const after = `${before}\n\n[수정 · ${plan.issueTypeLabel}] ${revision}`.trim();
      const check = verifyLockedValues(before, after, plan.lockedValues);
      // 자동 산출한 계산 결과와 사용자가 확인해 준 값은 새 수치로 보지 않는다.
      const allowed = [plan.computedValue, answer ? String(answer) : ''].filter(Boolean).map(value => value.replace(/\s+/g, ''));
      const unexpected = [...check.removed, ...check.added].filter(value => !allowed.some(item => item.includes(value) || value.includes(item)));
      if (unexpected.length) { blocked.push({ plan, reason: `확정 수치가 바뀔 수 있어 수정하지 않았습니다: ${unexpected.join(' · ')}` }); continue; }
      target.content = after;
      target.status = plan.repairLevel === 'AUTO' ? '검토 필요' : '확인 필요';
      changed = true;
    }
    // 모든 대상 문단이 보류되면 수정한 것이 없다. 반영 건수로 세면 같은 내용의 새 버전이 만들어진다.
    if (changed) applied.push({ id: plan.id, issueType: plan.issueType, level: plan.repairLevel, sections: plan.targetSection.map(target => target.title), usedAnswer: Boolean(answer) });
  }

  return { sections: current, applied, questions, blocked };
}

export function repairPlanSummary(plans) {
  const byLevel = plans.reduce((counts, plan) => ({ ...counts, [plan.repairLevel]: (counts[plan.repairLevel] || 0) + 1 }), {});
  const byType = plans.reduce((counts, plan) => ({ ...counts, [plan.issueType]: (counts[plan.issueType] || 0) + 1 }), {});
  return { total: plans.length, byLevel, byType, needsConfirmation: plans.filter(plan => plan.repairLevel === 'USER_CONFIRMATION').length };
}

export { compactEvidence };
