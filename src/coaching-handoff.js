// 「계획서 검증·코칭」 → 「계획서 쓰기」 왕복 규칙. DOM·네트워크에 의존하지 않으므로 브라우저와 node --test에서 같이 쓴다.
// 검증코치는 전체 계획서를 다시 쓰지 않고 수정에 필요한 정보만 작성 엔진에 전달한다.
export const VERDICTS = ['제출 검토 완료', '수정 후 재검토', '작성 단계로 반려'];
export const WRITER_RULE = '전달받은 위치만 수정한다. lockedValues의 확정값(대상·인원·기간·회기·예산·성과목표 등)은 바꾸지 않는다. 근거가 없으면 새 사실을 만들지 말고 [확인 필요: 정보]로 남긴다. 계획서 전체를 다시 쓰지 않는다.';

const CRITICAL_RISKS = new Set(['submission', 'eligibility', 'required-item', 'budget-rule', 'core-conflict']);
// 확정값으로 보호할 수치. 숫자와 단위가 붙은 값만 사용한다.
const LOCKED_VALUE_PATTERN = /\d[\d,.]*\s*(?:명|회기|회차|회|시간|주|개월|년|일|원|천원|만원|억원|%|점)/g;

function text(value, max = 400) { return String(value ?? '').trim().slice(0, max); }
function compact(value) { return String(value ?? '').replace(/[\s.·:()[\]-]/g, '').toLowerCase(); }
function verifiedEvidence(refs) {
  return (Array.isArray(refs) ? refs : []).filter(ref => ref?.verified && ref.excerpt)
    .map(ref => ({ sourceName: text(ref.sourceName, 120) || '계획서 원문', pageOrSection: text(ref.pageOrSection, 120), proposalLocation: text(ref.proposalLocation, 120), excerpt: text(ref.excerpt, 500) }));
}

export function extractLockedValues(source) {
  const body = Array.isArray(source) ? source.map(section => `${section?.title || ''}\n${section?.content || ''}`).join('\n') : String(source ?? '');
  return [...new Set((body.match(LOCKED_VALUE_PATTERN) || []).map(value => value.replace(/\s+/g, '')))];
}

// 코칭 문제 위치를 계획서 항목에 연결한다. 확실하지 않으면 빈 값으로 두고 사용자가 직접 고르게 한다.
export function matchSectionId(sections, location) {
  const key = compact(location).replace(/^\d+/, '');
  if (!key) return '';
  const list = Array.isArray(sections) ? sections : [];
  const exact = list.find(section => compact(section.title).replace(/^\d+/, '') === key || compact(section.id) === key);
  if (exact) return exact.id;
  const partial = list.find(section => {
    const title = compact(section.title).replace(/^\d+/, '');
    return title.length > 1 && key.length > 1 && (title.includes(key) || key.includes(title));
  });
  return partial ? partial.id : '';
}

// 검증 결과의 내부 판정. 정보가 부족하다는 이유만으로 반려하지 않는다.
export function coachingVerdict(result, workItems = []) {
  const issues = Array.isArray(result?.issues) ? result.issues : [];
  const unresolved = issues.filter((issue, index) => (workItems[index]?.status || '미수정') !== '해결');
  const blocking = unresolved.filter(issue => issue.priority === '최우선 경고' && CRITICAL_RISKS.has(issue.riskType) && !issue.requiresConfirmation && verifiedEvidence(issue.evidenceRefs).length > 0);
  const finalChecks = Array.isArray(result?.finalChecks) ? result.finalChecks : [];
  const needsConfirmation = [...unresolved.filter(issue => issue.requiresConfirmation).map(issue => text(issue.location, 120)), ...finalChecks.filter(check => check.status === '확인필요').map(check => `${check.area}: 확인 필요`)];
  if (blocking.length) {
    return { verdict: '작성 단계로 반려', blockingIssues: blocking.map(issue => text(issue.location, 120)), needsConfirmation, reason: '입력 근거에서 실제로 확인된 제출·자격·필수항목·예산·핵심 수치 문제가 남아 있습니다. 작성 단계에서 다시 정리해야 합니다.' };
  }
  if (unresolved.length || finalChecks.some(check => check.status === '보완필요') || needsConfirmation.length) {
    return { verdict: '수정 후 재검토', blockingIssues: [], needsConfirmation, reason: '남은 개선사항 또는 확인이 필요한 항목이 있습니다. 수정 후 다시 검증하세요.' };
  }
  return { verdict: '제출 검토 완료', blockingIssues: [], needsConfirmation, reason: '현재 기준에서 남은 문제와 확인 필요 항목이 없습니다.' };
}

// 검증 결과에서 사용자가 고른 문제만 「계획서 쓰기」로 넘길 전달값으로 만든다. 계획서 본문은 여기서 바꾸지 않는다.
export function buildCoachingHandoff({ coaching = {}, sections = [], selectedIndexes = null, createdAt = '' } = {}) {
  const result = coaching.result || { issues: [] };
  const issues = Array.isArray(result.issues) ? result.issues : [];
  const chosen = Array.isArray(selectedIndexes) && selectedIndexes.length ? [...new Set(selectedIndexes)].filter(index => issues[index]) : issues.map((_, index) => index);
  const lockedValues = extractLockedValues(sections);
  const items = chosen.map((index, order) => {
    const issue = issues[index];
    const sectionId = matchSectionId(sections, issue.location);
    const section = (sections || []).find(value => value.id === sectionId) || null;
    const sectionLocked = section ? extractLockedValues([section]) : [];
    return {
      id: `handoff-${order + 1}`,
      issueIndex: index,
      priority: text(issue.priority, 40),
      riskType: text(issue.riskType, 40),
      location: text(issue.location, 200),
      sectionId,
      problem: text(issue.category, 200) || '검증에서 확인된 문제',
      reason: text(issue.reason, 800),
      direction: text(issue.direction, 800),
      example: text(issue.example, 1000),
      evidence: verifiedEvidence(issue.evidenceRefs),
      lockedValues: sectionLocked,
      requiresConfirmation: issue.requiresConfirmation === true,
      confirmation: issue.requiresConfirmation === true ? '근거가 확인되지 않았습니다. 담당자 확인 전에는 [확인 필요: 정보]로 남깁니다.' : '',
      status: '전달됨'
    };
  });
  return {
    id: `handoff-v${Number(coaching.version || 0)}`,
    createdAt: createdAt || new Date().toISOString(),
    title: text(coaching.title, 200),
    fromVersion: Number(coaching.version || 0),
    seriesId: text(coaching.seriesId, 80),
    sourceProposalId: text(coaching.sourceProposalId, 80),
    verdict: coachingVerdict(result, coaching.workItems || []),
    lockedValues,
    items,
    writerRule: WRITER_RULE
  };
}

export function handoffItemsForSection(handoff, section) {
  if (!handoff || !section) return [];
  return (handoff.items || []).filter(item => item.sectionId === section.id);
}

// 코칭 지시를 그대로 쓰지 않고 작성 엔진용 지시문으로 정리한다.
export function revisionInstruction(items = []) {
  const lines = items.map((item, index) => `${index + 1}) 위치 ${item.location} · 문제 ${item.problem} · 이유 ${item.reason} · 개선방향 ${item.direction}${item.requiresConfirmation ? ' · 근거 미확인이므로 [확인 필요: 정보]로 남길 것' : ''}`);
  const locked = [...new Set(items.flatMap(item => item.lockedValues || []))];
  return `${lines.join('\n')}\n유지할 확정값: ${locked.join(', ') || '없음'}\n${WRITER_RULE}`;
}

// 원본 배열을 바꾸지 않고 새 배열을 만든다.
export function applySectionRevision(sections, sectionId, content, status = '검토 필요') {
  return (Array.isArray(sections) ? sections : []).map(section => (section.id === sectionId ? { ...section, content: String(content ?? ''), status } : section));
}

// 확정값이 사라지거나 바뀌었는지 확인한다. 통과하지 못하면 수정안을 적용하지 않는다.
export function verifyLockedValues(beforeText, afterText, lockedValues = null) {
  const before = String(beforeText ?? '');
  const after = String(afterText ?? '');
  const locked = Array.isArray(lockedValues) && lockedValues.length ? lockedValues : extractLockedValues(before);
  const compactAfter = after.replace(/\s+/g, '');
  const removed = locked.filter(value => before.replace(/\s+/g, '').includes(value) && !compactAfter.includes(value));
  const added = extractLockedValues(after).filter(value => !locked.includes(value) && !before.replace(/\s+/g, '').includes(value));
  return { ok: removed.length === 0 && added.length === 0, removed, added };
}

// 계획서 버전을 누적한다. 이전 버전은 지우지 않고 사본으로 보존한다.
export function appendProposalVersion(versions, { sections, label, source = '계획서 쓰기', verdict = '', savedAt = '', originalText = '' } = {}) {
  const list = Array.isArray(versions) ? versions : [];
  const version = list.length + 1;
  return [...list, {
    version,
    label: text(label, 100) || (version === 1 ? '최초 작성' : `수정본 v${version}`),
    source: text(source, 60),
    verdict: text(verdict, 40),
    savedAt: savedAt || new Date().toISOString(),
    // 외부에서 가져온 계획서는 원문 그대로도 함께 보존한다.
    originalText: String(originalText || '').slice(0, 200_000),
    sections: structuredClone(Array.isArray(sections) ? sections : [])
  }];
}

export const EXTERNAL_SOURCE = '외부 계획서';
const HEADING_PATTERNS = [
  /^\s*(?:\d+\s*[.)]|[IVXivx]+\s*\.|제\s*\d+\s*[장절]|[◆■□○●▶▷※#*·]+)\s*\S.*$/,
  /^\s*(?:【|〔|\[|<)[^\n]{1,50}(?:】|〕|\]|>)\s*$/,
  /^\s*[가-힣A-Za-z][^\n:：]{0,38}\s*[:：]\s*$/
];

function isHeadingLine(line) {
  const value = String(line || '').trim();
  if (!value || value.length > 60) return false;
  if (/[.!?]$/.test(value) && !/^\s*\d+\s*[.)]/.test(value)) return false;
  return HEADING_PATTERNS.some(pattern => pattern.test(value));
}

// 외부에서 가져온 계획서 원문을 항목 단위 작업본으로 나눈다. 문장을 새로 만들거나 지우지 않는다.
export function sectionsFromProposalText(value, { idPrefix = 'external' } = {}) {
  const body = String(value ?? '');
  const blocks = [];
  for (const line of body.split(/\r?\n/)) {
    if (isHeadingLine(line)) { blocks.push({ title: line.trim(), lines: [] }); continue; }
    if (!blocks.length) blocks.push({ title: '', lines: [] });
    blocks[blocks.length - 1].lines.push(line);
  }
  const used = blocks
    .map(block => ({ title: block.title, content: block.lines.join('\n').trim() }))
    .filter(block => block.title || block.content);
  // 번호 없는 문서 제목 한 줄로 시작하면 그 줄을 항목 제목으로 쓴다.
  if (used.length > 1 && !used[0].title && used[0].content && !used[0].content.includes('\n') && used[0].content.length <= 60) {
    used[0] = { title: used[0].content, content: '' };
  }
  if (!used.length) return [{ id: `${idPrefix}-1`, title: '외부 계획서 본문', content: body.trim(), status: '검토 필요', citations: [] }];
  return used.map((block, index) => ({ id: `${idPrefix}-${index + 1}`, title: block.title || `${index + 1}. 외부 계획서 본문`, content: block.content, status: '검토 필요', citations: [] }));
}

export function proposalTextFromSections(sections) {
  return (Array.isArray(sections) ? sections : []).map(section => `${section.title}\n${section.content}`.trim()).join('\n\n');
}

// 자료보관함에 저장된 계획서 스냅샷에서 본문만 꺼낸다. 저장 구조를 새로 만들지 않고 기존 필드를 순서대로 본다.
export function proposalTextFromSnapshot(snapshot) {
  if (Array.isArray(snapshot?.sections) && snapshot.sections.length) return proposalTextFromSections(snapshot.sections);
  if (String(snapshot?.coaching?.text || '').trim()) return String(snapshot.coaching.text);
  const version = (Array.isArray(snapshot?.proposalVersions) ? snapshot.proposalVersions : []).at(-1);
  return version ? proposalTextFromSections(version.sections) : '';
}

// 업로드한 외부 계획서를 원본 보존 상태로 두고 수정 가능한 작업본만 새로 만든다.
export function buildExternalWorkingCopy(coaching = {}) {
  const originalText = String(coaching.text || '');
  const sections = sectionsFromProposalText(originalText);
  return {
    title: text(coaching.title, 200) || '외부 계획서',
    originalText,
    sections,
    versions: appendProposalVersion([], { sections, label: '외부 원본', source: EXTERNAL_SOURCE, originalText })
  };
}

export function findProposalVersion(versions, version) {
  return (Array.isArray(versions) ? versions : []).find(item => Number(item.version) === Number(version)) || null;
}

// 재검증 결과 비교. AI가 comparison을 채우지 못한 경우에도 위치 기준으로 해결·잔존·신규를 구분한다.
export function compareCoachingRounds(previousResult, currentResult) {
  const previous = (previousResult?.issues || []).map(issue => text(issue.location, 200));
  const current = (currentResult?.issues || []).map(issue => text(issue.location, 200));
  const comparison = currentResult?.comparison || {};
  const fromAi = ['resolvedIssues', 'remainingIssues', 'newIssues', 'improvedAreas'].every(key => Array.isArray(comparison[key]));
  if (fromAi && (comparison.resolvedIssues.length || comparison.remainingIssues.length || comparison.newIssues.length || comparison.improvedAreas.length)) {
    return { source: 'coaching', previousVersion: Number(comparison.previousVersion || 0), resolved: comparison.resolvedIssues, remaining: comparison.remainingIssues, added: comparison.newIssues, improved: comparison.improvedAreas };
  }
  return {
    source: 'local',
    previousVersion: Number(comparison.previousVersion || 0),
    resolved: previous.filter(location => !current.includes(location)),
    remaining: previous.filter(location => current.includes(location)),
    added: current.filter(location => !previous.includes(location)),
    improved: []
  };
}
