// 검증 결과를 총론 먼저 읽도록 정리한다.
//
// 왜 필요한가. 같은 문제가 제출 전 점검·평가기준 대응표·개선 작업판에서 각각 따로 적혀
// 세 번 읽히고, 화면은 첫 줄부터 각론이라 무엇부터 고쳐야 하는지 알 수 없었다.
//
// 여기서 하는 일 두 가지.
//  1. 세 곳에 흩어진 같은 문제를 검증 이슈 하나로 합친다. 근거는 버리지 않고 이슈에 모은다.
//  2. 그 이슈로 총론을 만든다. 점수나 합격확률은 만들지 않는다. 확인한 것과 확인 못 한 것을 나눠 적는다.

export const PRIORITY_ORDER = Object.freeze({ '최우선 경고': 0, '주요 개선': 1, '일반 개선': 2 });
export const TOP_ISSUE_LIMIT = 5;

const text = value => String(value ?? '').trim();
const list = value => (Array.isArray(value) ? value : []);

// 같은 문제인지 보는 열쇠. 이름과 위치를 느슨하게 맞춘다. 조사·기호 차이로 다른 문제로 세지 않는다.
export function issueKey(name = '', location = '') {
  const clean = value => text(value).toLowerCase().replace(/[\s·,()[\]{}"'“”‘’.!?~-]/g, '');
  return `${clean(name).slice(0, 40)}|${clean(location).slice(0, 24)}`;
}

function blank(name, location) {
  return {
    key: issueKey(name, location),
    name: text(name) || '이름 없는 문제',
    priority: '일반 개선',
    status: '미수정',
    criteria: [],      // 해당 평가기준
    locations: [],     // 계획서 위치
    risk: '',          // 위험 이유
    direction: '',     // 개선 방향
    evidence: [],      // 근거 원문
    howTo: '',         // 수정 방법
    needsConfirm: false,
    from: []           // 어느 영역에서 왔는지. 각론이 같은 이슈를 다르게 보여 줄 때 쓴다.
  };
}

function harder(left, right) {
  return (PRIORITY_ORDER[left] ?? 9) <= (PRIORITY_ORDER[right] ?? 9) ? left : right;
}

// 세 곳을 하나로 합친다. 먼저 온 값을 덮어쓰지 않고, 비어 있는 자리만 채운다.
export function mergeReviewIssues(result = {}, workItems = []) {
  const merged = new Map();
  let before = 0;

  // 이름이 조금 다르게 적혀 와도 같은 문제로 본다.
  // 「대상·인원」(제출 전 점검)과 「대상 인원 불일치」(개선 작업판)는 사용자에게 같은 하나다.
  const bare = value => text(value).toLowerCase().replace(/[\s·,()[\]{}"'“”‘’.!?~-]/g, '');
  const findRelated = name => {
    const target = bare(name);
    if (target.length < 3) return null;
    for (const [key, entry] of merged) {
      const other = bare(entry.name);
      if (other.length < 3) continue;
      if (other === target || other.includes(target) || target.includes(other)) return key;
    }
    return null;
  };

  const put = (name, location, patch, source) => {
    before += 1;
    const key = findRelated(name) || issueKey(name, location);
    const entry = merged.get(key) || blank(name, location);
    entry.priority = harder(patch.priority || '일반 개선', entry.priority);
    entry.risk = entry.risk || text(patch.risk);
    entry.direction = entry.direction || text(patch.direction);
    entry.howTo = entry.howTo || text(patch.howTo);
    entry.needsConfirm = entry.needsConfirm || Boolean(patch.needsConfirm);
    for (const value of list(patch.criteria)) if (value && !entry.criteria.includes(value)) entry.criteria.push(value);
    for (const value of list(patch.locations)) if (value && !entry.locations.includes(value)) entry.locations.push(value);
    // 근거 원문은 합치되 같은 문장을 두 번 담지 않는다.
    for (const value of list(patch.evidence)) {
      const excerpt = text(value?.excerpt || value);
      if (!excerpt || entry.evidence.some(item => text(item.excerpt) === excerpt)) continue;
      entry.evidence.push(typeof value === 'string' ? { excerpt: value, sourceName: '', verified: false } : value);
    }
    if (!entry.from.includes(source)) entry.from.push(source);
    merged.set(key, entry);
  };

  list(result.issues).forEach((issue, index) => {
    put(issue.category, issue.location, {
      priority: issue.priority, risk: issue.reason, direction: issue.direction, howTo: issue.example,
      locations: [issue.location], evidence: issue.evidenceRefs, needsConfirm: issue.requiresConfirmation
    }, '개선 작업판');
    const key = issueKey(issue.category, issue.location);
    const entry = merged.get(key);
    // 이미 손댄 상태가 있으면 그대로 잇는다. 화면을 다시 그려도 상태가 사라지지 않는다.
    if (workItems[index]?.status) entry.status = workItems[index].status;
    entry.sourceIndex = entry.sourceIndex ?? index;
  });

  for (const check of list(result.finalChecks)) {
    if (text(check.status) === '충족') { before += 1; continue; }
    put(check.area, check.area, {
      priority: text(check.status) === '보완필요' ? '최우선 경고' : '주요 개선',
      risk: check.detail, direction: check.action, locations: [check.area], evidence: check.evidenceRefs,
      needsConfirm: text(check.status) === '확인필요'
    }, '제출 전 필수 점검');
  }

  for (const row of list(result.evaluationMatrix)) {
    if (text(row.status) === '충족') { before += 1; continue; }
    put(row.criterion, list(row.proposalLocations)[0] || row.criterion, {
      priority: text(row.status) === '부족' ? '최우선 경고' : '주요 개선',
      risk: row.requirement, direction: row.gap || row.requirement,
      criteria: [text(row.officialPoints) ? `${row.criterion} (${row.officialPoints})` : row.criterion],
      locations: list(row.proposalLocations), evidence: row.evidenceRefs
    }, '평가기준 대응표');
  }

  const issues = [...merged.values()].sort((left, right) =>
    (PRIORITY_ORDER[left.priority] ?? 9) - (PRIORITY_ORDER[right.priority] ?? 9));
  return { issues, before, after: issues.length, removed: Math.max(0, before - issues.length) };
}

// 총론. 각론의 긴 근거를 되풀이하지 않는다. 점수·합격확률은 만들지 않는다.
export function buildOverview({ result = {}, issues = [], references = [], sectionCount = 0 } = {}) {
  const official = result.basis === 'official-evaluation';
  const top = issues.filter(item => item.status !== '해결').slice(0, TOP_ISSUE_LIMIT);
  const blocking = issues.filter(item => item.priority === '최우선 경고' && item.status !== '해결');
  const confirmNeeded = issues.filter(item => item.needsConfirm && item.status !== '해결');

  const strengths = list(result.checkedAreas).length
    ? [`${list(result.checkedAreas).slice(0, 4).join(' · ')} 영역이 계획서에 실제로 적혀 있어 검증할 수 있었습니다.`]
    : [];
  for (const row of list(result.evaluationMatrix)) {
    if (text(row.status) === '충족' && strengths.length < 4) strengths.push(`${text(row.criterion)}: 공식 요구를 충족했습니다.`);
  }
  for (const check of list(result.finalChecks)) {
    if (text(check.status) === '충족' && strengths.length < 5) strengths.push(`${text(check.area)}: 제출 요건을 갖췄습니다.`);
  }
  for (const area of list(result.comparison?.improvedAreas)) {
    if (strengths.length < 6) strengths.push(`지난 판보다 ${text(area)}가 나아졌습니다.`);
  }

  return {
    // 1) 먼저 잘된 점
    strengths: strengths.length ? strengths : ['아직 칭찬할 만큼 확인된 내용이 적습니다. 확정값을 채우면 다시 봅니다.'],
    // 2) 검증 범위와 기준
    scope: {
      areas: list(result.checkedAreas),
      basisLabel: official ? '공고가 준 공식 평가기준' : '공통 심사 기준(공식 평가표 없음)',
      officialProvided: official,
      referenceCount: references.length,
      sectionCount
    },
    // 3) 내부 종합판정. 공모기관의 선정 판정이 아니다.
    verdict: {
      status: text(result.overallStatus) || '확인 필요',
      summary: text(result.summary),
      note: '내부 품질관리 판정입니다. 공모기관의 선정·탈락 판정이 아니며 합격 확률을 계산하지 않습니다.'
    },
    // 4) 완성도와 검증 가능 범위. 숫자를 지어내지 않고 센 것만 적는다.
    coverage: {
      checkedAreas: list(result.checkedAreas).length,
      issueCount: issues.length,
      blocking: blocking.length,
      confirmNeeded: confirmNeeded.length,
      limit: official ? '' : '공식 평가표가 없어 배점 대비 충족도는 판정하지 못했습니다.'
    },
    // 5) 핵심 문제 최대 다섯
    top: top.map(item => ({ key: item.key, name: item.name, priority: item.priority, locations: item.locations.slice(0, 2), risk: item.risk })),
    // 6) 제출 전에 먼저 할 일
    order: [
      blocking.length ? `① 최우선 경고 ${blocking.length}건을 먼저 고칩니다.` : '',
      confirmNeeded.length ? `② 확인이 필요한 값 ${confirmNeeded.length}건을 채웁니다.` : '',
      issues.length - blocking.length - confirmNeeded.length > 0
        ? `③ 나머지 개선 ${issues.length - blocking.length - confirmNeeded.length}건을 살펴봅니다.` : ''
    ].filter(Boolean),
    // 7) 확인된 것과 확인할 수 없는 것
    confirmed: list(result.checkedAreas),
    unconfirmed: [
      official ? '' : '공식 평가표(배점표)를 받지 못해 배점별 대응은 확인하지 못했습니다.',
      references.length ? '' : '참고자료가 없어 계획서 밖 사실은 대조하지 못했습니다.',
      ...confirmNeeded.slice(0, 3).map(item => `${item.name}: 확인된 자료가 없어 판정하지 못했습니다.`)
    ].filter(Boolean),
    // 8) 권장 다음 행동
    next: blocking.length ? '우선 문제부터 수정하기'
      : confirmNeeded.length ? '확인이 필요한 값 채우기'
        : issues.length ? '남은 개선사항 살펴보기' : '제출 전 최종 점검'
  };
}

// 각론 여섯 영역. 제목에 건수를 적고 기본은 접어 둔다.
export function detailPanels({ result = {}, issues = [], references = [] } = {}) {
  const checks = list(result.finalChecks);
  return [
    { key: 'checks', title: '제출 전 필수 점검', count: checks.filter(item => text(item.status) !== '충족').length, total: checks.length },
    { key: 'sections', title: '항목별 검증 결과', count: issues.length, total: issues.length },
    { key: 'matrix', title: '평가기준 대응표', count: list(result.evaluationMatrix).filter(row => text(row.status) !== '충족').length, total: list(result.evaluationMatrix).length },
    { key: 'references', title: '참고자료 판정', count: references.filter(item => item.usage && item.usage !== '공식 근거').length, total: references.length },
    { key: 'evidence', title: '근거 원문', count: issues.reduce((sum, item) => sum + item.evidence.length, 0), total: issues.length },
    { key: 'work', title: '개선 작업판', count: issues.filter(item => item.status !== '해결').length, total: issues.length }
  ];
}
