// 「정밀 검증·부분 수정」 — 확정된 기준 네 가지와 계획서를 대조해 문제 구간만 찾아 고친다.
// 검증은 본문을 바꾸지 않는다. 수정은 문제가 지목한 항목에만 적용하고 나머지는 글자 하나 건드리지 않는다.
export const PROPOSAL_MODES = ['표준형', '정밀형'];
export const PRECISION_SEVERITIES = ['BLOCKING', '주의', '참고'];
// 이번 단계의 검증 범위. 문장별 전체 환각 검사는 포함하지 않는다.
export const PRECISION_SCOPES = ['공고 강제조건', '승인 설계안', '서식 규격', '내부 정합성', '수요근거 충돌'];

const clean = (value, max = 600) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const SECTION_ORDER = ['necessity', 'purpose', 'goals', 'target', 'programs', 'schedule', 'roles', 'budget', 'indicators', 'outcomes'];

// 검증 기준 한 묶음. 확정된 것만 넣고 확인 필요 항목은 기준이 아니라 참고로만 넘긴다.
export function buildReviewBasis({ contract, formSpec, designPlan, demand } = {}) {
  return {
    scopes: PRECISION_SCOPES,
    noticeContract: (contract?.rules || []).map(rule => ({
      id: rule.id, category: rule.category, title: clean(rule.title, 120), ruleType: rule.ruleType,
      value: Array.isArray(rule.value) ? rule.value.join(' / ') : String(rule.value),
      unit: rule.unit || '', severity: rule.severity, evidence: clean(rule.evidence, 200)
    })),
    approvedDesign: designPlan ? {
      approvedAt: designPlan.approvedAt || '', applicationType: designPlan.applicationType || null,
      coreValues: designPlan.coreValues || [], requiredModels: designPlan.requiredModels || []
    } : null,
    formSpec: formSpec ? {
      items: (formSpec.items || []).map(item => ({ name: item.name, limitChars: item.limitChars, limitPages: item.limitPages })),
      tables: (formSpec.tables || []).map(table => ({ kind: table.kind, title: table.title, columns: table.columns })),
      attachments: (formSpec.attachments || []).map(item => item.name)
    } : null,
    demandEvidence: (demand?.confirmed || []).map(row => ({ area: row.title, basis: row.basis, items: row.items.map(item => clean(item.text, 200)) })),
    rule: '기준에 없는 문제를 만들지 않는다. 본문을 고치지 말고 문제만 지목한다. 확인되지 않은 값은 문제로 보되 사실을 지어내 채우지 않는다.'
  };
}

// 문제 하나의 모양. sectionId가 계획서에 없으면 버린다(엉뚱한 구간을 고치지 않기 위해).
export function normalizeReviewIssues(raw, sections = []) {
  const ids = new Set((sections || []).map((section, index) => section.id || SECTION_ORDER[index]));
  const issues = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const sectionId = clean(item?.sectionId, 40);
    if (!ids.has(sectionId)) continue;
    const severity = PRECISION_SEVERITIES.includes(item?.severity) ? item.severity : '주의';
    const scope = PRECISION_SCOPES.includes(item?.scope) ? item.scope : '내부 정합성';
    const problem = clean(item?.problem, 400);
    const basis = clean(item?.basis, 400);
    const instruction = clean(item?.instruction, 400);
    if (!problem || !basis || !instruction) continue;
    if (issues.some(entry => entry.sectionId === sectionId && entry.problem === problem)) continue;
    issues.push({ id: `issue-${issues.length + 1}`, sectionId, severity, scope, problem, basis, instruction, target: item?.target === '표' ? '표' : '본문' });
  }
  return issues;
}

export function reviewSummary(issues = []) {
  const bySeverity = Object.fromEntries(PRECISION_SEVERITIES.map(severity => [severity, issues.filter(item => item.severity === severity).length]));
  const byScope = Object.fromEntries(PRECISION_SCOPES.map(scope => [scope, issues.filter(item => item.scope === scope).length]));
  return {
    total: issues.length, bySeverity, byScope,
    sections: [...new Set(issues.map(item => item.sectionId))],
    blocking: issues.filter(item => item.severity === 'BLOCKING').length,
    verdict: issues.some(item => item.severity === 'BLOCKING') ? '수정 필요' : issues.length ? '보완 권고' : '문제 없음'
  };
}

// 고칠 항목만 추린다. 문제가 없는 항목은 아예 요청에 넣지 않는다.
export function sectionsToPatch(sections = [], issues = []) {
  const ids = new Set(issues.map(item => item.sectionId));
  return (sections || [])
    .map((section, index) => ({ ...section, id: section.id || SECTION_ORDER[index] }))
    .filter(section => ids.has(section.id))
    .map(section => ({ id: section.id, title: section.title, content: section.content, issues: issues.filter(item => item.sectionId === section.id) }));
}

// 수정 결과를 원본에 되붙인다. 지목되지 않은 항목은 원본 객체를 그대로 두어 한 글자도 바뀌지 않게 한다.
export function applyPatchedSections(sections = [], patched = [], issues = []) {
  const targeted = new Set(issues.map(item => item.sectionId));
  const byId = new Map((Array.isArray(patched) ? patched : []).map(item => [clean(item?.id, 40), item]));
  const changed = [];
  const preserved = [];
  const skipped = [];
  const next = (sections || []).map((section, index) => {
    const id = section.id || SECTION_ORDER[index];
    const replacement = byId.get(id);
    if (!targeted.has(id) || !replacement) { preserved.push(id); return section; }
    const content = String(replacement.content || '');
    // 내용이 비었거나 그대로면 바꾸지 않는다.
    if (!content.trim() || content === section.content) { skipped.push(id); preserved.push(id); return section; }
    changed.push(id);
    return { ...section, content, status: replacement.status || section.status };
  });
  return { sections: next, changed, preserved, skipped };
}

// 수정 전후를 비교해 지목되지 않은 항목이 정말 그대로인지 확인한다.
export function verifyUntouched(before = [], after = [], issues = []) {
  const targeted = new Set(issues.map(item => item.sectionId));
  const broken = [];
  for (let index = 0; index < before.length; index += 1) {
    const id = before[index]?.id || SECTION_ORDER[index];
    if (targeted.has(id)) continue;
    if (before[index]?.content !== after[index]?.content || before[index]?.title !== after[index]?.title) broken.push(id);
  }
  return { ok: broken.length === 0, broken };
}
