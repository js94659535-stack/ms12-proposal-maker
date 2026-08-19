// 사업 설계에서 사용자에게 물을 것만 고른다. 새 AI 호출 없이 이미 만들어 둔 결과만 다시 읽는다.
// 공고 구조(notice-logic) · 적합성(fit-matching) · 설계도(project-blueprint) · 확정값 · 기관 확인정보를 대조한다.
import { CONFIRMED_STATUS, confirmedItems, normalizeProjectValues } from './applicants.js';

export const QUESTION_KINDS = ['필수 확인', '경쟁력'];
// 7) 우선순위: 공식 필수조건 → 배점 큰 부족정보 → 사실·수치 충돌 → 사업 차별성 → 성과·지속가능성
export const QUESTION_PRIORITY = ['공식 필수조건', '평가배점 부족정보', '사실·수치 충돌', '사업 차별성', '성과·지속가능성'];
export const MAX_DESIGN_QUESTIONS = 5;

const PRIORITY_ORDER = Object.fromEntries(QUESTION_PRIORITY.map((name, index) => [name, index]));

function text(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function tokensOf(value) {
  return [...new Set(text(value).split(/[^가-힣A-Za-z0-9]+/).filter(token => token.length >= 2 && !/^\d+$/.test(token)))];
}
// 이미 아는 내용인지 본다. 확정값·기관 확인정보·이번 답변에 같은 말이 있으면 다시 묻지 않는다.
function alreadyKnown(question, known) {
  const tokens = tokensOf(question);
  if (!tokens.length) return false;
  const hits = tokens.filter(token => known.includes(token));
  return hits.length >= Math.max(2, Math.ceil(tokens.length * 0.5));
}
function knownText({ applicant, projectValues, answers }) {
  const confirmed = confirmedItems(applicant).map(item => `${item.label} ${item.value}`).join(' ');
  const values = [...normalizeProjectValues(projectValues).values()].map(item => `${item.label} ${item.value}`).join(' ');
  const answered = Object.entries(answers || {}).filter(([, value]) => text(value)).map(([question, value]) => `${question} ${value}`).join(' ');
  return tokensOf(`${confirmed} ${values} ${answered}`).join(' ');
}

// 경쟁력 질문은 공고 평가기준이 그 영역을 실제로 요구할 때만 만든다.
const EDGE_QUESTIONS = [
  { id: 'edge-capability', priority: '평가배점 부족정보', reason: '평가기준: 수행역량', match: /역량|인력|전문|수행|조직/, question: '이 사업을 우리 기관이 가장 잘 수행할 수 있다고 말할 근거는 무엇입니까? (확인된 실적·인력·자원 기준)' },
  { id: 'edge-difference', priority: '사업 차별성', reason: '평가기준: 사업 차별성', match: /차별|특화|우수|창의|중점|우대/, question: '기존에 해 오던 사업과 이번 사업은 무엇이 다릅니까?' },
  { id: 'edge-change', priority: '성과·지속가능성', reason: '평가기준: 성과계획', match: /성과|지표|효과|변화|평가/, question: '참여자에게 어떤 변화가 나타나야 이 사업이 성공했다고 볼 수 있습니까?' },
  { id: 'edge-sustain', priority: '성과·지속가능성', reason: '평가기준: 지속가능성', match: /지속|사후|종료 후|자립|연계/, question: '지원이 끝난 뒤에도 이어 갈 수 있는 것은 무엇입니까?' }
];

function noticeAsks(structure, pattern) {
  const fields = structure?.fields || [];
  const scores = structure?.evaluationScores || [];
  return fields.some(field => pattern.test(`${field.title} ${field.value}`)) || scores.some(score => pattern.test(String(score.criterion)));
}
function biggestScore(structure) {
  const scores = (structure?.evaluationScores || []).filter(score => Number(score.points) > 0 && Number(score.points) < 100);
  return scores.sort((left, right) => Number(right.points) - Number(left.points))[0] || null;
}

export function buildDesignQuestions({ structure = null, fitResult = null, blueprint = null, applicant = null, projectValues = [], aiQuestions = [], answers = {} } = {}) {
  const known = knownText({ applicant, projectValues, answers });
  const candidates = [];
  const push = (entry) => {
    const question = text(entry.question);
    if (!question || candidates.some(item => item.question === question)) return;
    candidates.push({ ...entry, question });
  };

  // 0) 사업설계 AI가 「반드시 확인」으로 남긴 질문을 가장 먼저 묻는다(이 질문만 생성을 막는다).
  for (const question of aiQuestions || []) {
    push({ id: `ai-${text(question).slice(0, 24)}`, question, kind: '필수 확인', reason: '필수정보', priority: '공식 필수조건' });
  }
  // 1) 공식 필수조건: 설계도가 확인 필요로 남긴 핵심 항목
  for (const item of blueprint?.items || []) {
    if (item.status !== 'NEEDS_CONFIRMATION' || !item.question) continue;
    if (['requirementLinks', 'openItems'].includes(item.key)) continue;
    push({ id: `blueprint-${item.key}`, question: item.question, kind: '필수 확인', reason: `필수정보: ${item.title}`, priority: '공식 필수조건' });
  }
  // 공고가 요구하는데 기관 근거가 없는 항목
  for (const gap of fitResult?.gaps || []) {
    if (gap.state === 'CONFLICT') continue;
    push({ id: `gap-${gap.key || gap.requirement}`, question: `${gap.requirement}에 대해 이번 사업에서 제시할 내용은 무엇입니까?`, kind: '필수 확인', reason: `필수정보: ${gap.requirement}`, priority: '공식 필수조건' });
  }

  // 2) 평가배점이 큰데 근거가 부족한 항목
  const top = biggestScore(structure);
  if (top) {
    push({ id: `score-${top.criterion}`, question: `평가에서 배점이 큰 「${top.criterion}」(${top.points}점)을 무엇으로 증명하시겠습니까?`, kind: '경쟁력', reason: `평가기준: ${top.criterion} ${top.points}점`, priority: '평가배점 부족정보' });
  }

  // 3) 사실·수치 충돌
  for (const match of fitResult?.matches || []) {
    if (match.state !== 'CONFLICT') continue;
    push({ id: `conflict-${match.key || match.requirement}`, question: `${match.requirement}에서 공고 기준과 기관 정보가 다릅니다. 어느 값을 이번 사업 기준으로 확정하시겠습니까?`, kind: '필수 확인', reason: '사실·수치 확인', priority: '사실·수치 충돌' });
  }

  // 4~5) 차별성·성과·지속가능성은 공고가 그 영역을 요구할 때만 묻는다.
  for (const entry of EDGE_QUESTIONS) {
    if (!noticeAsks(structure, entry.match)) continue;
    push({ id: entry.id, question: entry.question, kind: '경쟁력', reason: entry.reason, priority: entry.priority });
  }


  const asked = candidates
    .filter(entry => !text(answers?.[entry.question]))
    .filter(entry => !alreadyKnown(entry.question, known))
    .sort((left, right) => (PRIORITY_ORDER[left.priority] ?? 9) - (PRIORITY_ORDER[right.priority] ?? 9));

  const resolved = candidates.filter(entry => text(answers?.[entry.question]) || alreadyKnown(entry.question, known));
  return {
    questions: asked.slice(0, MAX_DESIGN_QUESTIONS),
    resolved: resolved.map(entry => entry.question),
    total: candidates.length,
    rule: '공고·기관 확인정보·이번 사업 확정값에서 이미 확인된 내용은 묻지 않는다. 답변은 이번 사업 정보로만 저장하고 기관 정보에는 사용자가 확인해야 반영한다.'
  };
}

// 질문이 무엇을 가리키는지로 갈래를 정한다.
//
// kind는 쓸 수 없다. 모델이 만든 질문에 출처만 보고 「필수 확인」을 붙이므로
// 「AI가 물으면 무엇이든 필수 확인」이 된다. 실제 다섯 질문 중 셋이 그렇게 어긋났다.
//
// 대신 근거가 어디 있는지를 본다. 순서가 곧 규칙이다.
//   1) 질문이 공고를 이름으로 부르면 → 판단 (근거가 공고에 있다)
//   2) 설계도 항목에 걸리면 그 항목의 status를 읽는다
//      확인 필요 → 사실 확인 (기관만 안다) · 그 밖 → 설계 (이번 사업에서 정한다)
//   3) 공고 실행계약서의 category에 걸리면 → 판단
//   4) 아무것도 안 걸리면 → 사실 확인
//
// 4번이 안전한 실패다. 제안을 안 하는 쪽이 지어내는 것보다 낫다.
export const ANSWER_KINDS = Object.freeze(['판단', '사실 확인', '설계']);
export const SUGGESTABLE = Object.freeze(['판단', '설계']);

// 공고를 가리키는 말. 이름 표는 label-leak.js 한 곳에서 온다.
// 「공식 공고문」은 그 표의 「공고 원문」과 글자가 달라 한 낱말만 별도로 둔다.
// 목록을 늘리지 않는다 — 늘리기 시작하면 또 다른 쓰레기통이 된다.
const NOTICE_ALIAS = '공고문';

// 어미 두 형태만 본다. 낱말이 아니라 문장 끝 모양이라 늘어날 여지가 적다.
// 「~있습니까/입니까」는 앞에 두면 안 된다 — 「어느 것이 최종 기준입니까?」는 판단이다.
// 그래서 그것은 아무것도 안 걸렸을 때 이유를 또렷하게 하는 데만 쓴다.
const DECIDE_ENDING = /(하시겠습니까|하시겠어요|잡으시겠습니까|정하시겠습니까)\s*\??$/;
const HAVE_ENDING = /(있습니까|입니까|있나요|인가요)\s*\??$/;

// 공고가 「값을 정해 준」 규칙. 나머지는 공고가 「기관이 충족하라」고 요구한 것이다.
const CONTRACT_DECIDED_TYPES = ['EXACT', 'MIN', 'MAX', 'CHOICE'];

export function classifyQuestion(question, { blueprint = null, contract = null, noticeNames = [], applicantName = '' } = {}) {
  const label = text(question);
  const base = { kind: '사실 확인', reason: '가리키는 근거를 찾지 못해 기관 확인으로 둔다', items: [], noticeValue: '', choices: [] };
  if (!label) return base;

  const items = (blueprint?.items || []).filter(item => {
    const title = text(item?.title);
    return title.length >= 2 && label.includes(title);
  });
  const rules = (contract?.rules || []).filter(rule => {
    const category = text(rule?.category);
    return category.length >= 2 && label.includes(category);
  });
  // 값이 하나로 정해진 규칙만 힌트로 쓴다. CHOICE는 선택지로 따로 보여 준다.
  const fixed = rules.filter(rule => ['EXACT', 'MIN', 'MAX'].includes(rule?.ruleType));
  const choices = rules.filter(rule => rule?.ruleType === 'CHOICE').flatMap(rule => (Array.isArray(rule.value) ? rule.value : []));
  const hint = fixed.map(rule => `${text(rule.title)}: ${text(rule.value)}${text(rule.unit)}`.trim());
  const extra = { items, noticeValue: hint.join(' · '), choices };

  // 0) 주어가 기관이면 그것으로 끝이다. 공고 이름이 함께 있어도 이것이 이긴다.
  //    기관 이름은 낱말 목록이 아니라 고른 신청기관에서 온다. 늘어나지 않는다.
  const who = text(applicantName);
  if (who.length >= 2 && label.includes(who)) {
    return { ...base, ...extra, kind: '사실 확인', reason: `${who}에 대해 묻는다 — 기관만 아는 사실이다` };
  }
  // 0-1) 「~하시겠습니까」는 사실을 묻는 말이 아니다. 앞으로 정할 것을 묻는다.
  //      어미는 두 형태만 본다. 목록을 늘리면 또 다른 쓰레기통이 된다.
  if (DECIDE_ENDING.test(label)) {
    return { ...base, ...extra, kind: '설계', reason: '앞으로 정할 것을 묻는다(~하시겠습니까)' };
  }
  // 1) 공고를 이름으로 부른다.
  if ([...noticeNames, NOTICE_ALIAS].some(name => text(name) && label.includes(text(name)))) {
    return { ...base, ...extra, kind: '판단', reason: '질문이 공고 자료를 근거로 지목한다' };
  }
  // 2) 설계도 항목에 걸리면 그 항목의 상태가 답한다.
  if (items.length) {
    const needsOrg = items.some(item => item?.status === 'NEEDS_CONFIRMATION');
    return needsOrg
      ? { ...base, ...extra, kind: '사실 확인', reason: `설계도 「${text(items[0].title)}」이 기관 확인을 기다린다` }
      : { ...base, ...extra, kind: '설계', reason: `설계도 「${text(items[0].title)}」은 이번 사업에서 정한다` };
  }
  // 3) 공고가 값을 정해 둔 갈래만 판단이다.
  //    ELIGIBILITY·FORMAT·EVALUATION·REQUIRED는 공고가 「기관이 충족하라」고 요구한 것이지
  //    값을 정해 준 것이 아니다. 실제로 「신청자격」이 여기 걸려 기관 사실에 판단이 붙었다.
  const decided = rules.filter(rule => CONTRACT_DECIDED_TYPES.includes(rule?.ruleType));
  if (decided.length) return { ...base, ...extra, kind: '판단', reason: `공고가 「${text(decided[0].category)}」를 정해 두었다` };
  if (rules.length) {
    return { ...base, ...extra, kind: '사실 확인', reason: `공고가 「${text(rules[0].category)}」 충족을 요구한다 — 기관이 답한다` };
  }
  // 4) 아무것도 안 걸린다. 「~있습니까/입니까」면 지금 있는 것을 묻는 말이라 더 분명하다.
  if (HAVE_ENDING.test(label)) return { ...base, ...extra, reason: '지금 있는 것을 묻는다(~있습니까/입니까)' };
  return { ...base, ...extra };
}

// 9) 기관 자체 정보로 재사용할 만한 답변만 「신청기관 정보에 추가할까요?」 후보로 제안한다(자동 확정 금지).
const REUSABLE = /인력|자격|시설|공간|장비|협력|네트워크|실적|프로그램|지역|전문|경험/;
export function reusableAnswerCandidates(questions = [], answers = {}, applicant = null) {
  const confirmed = confirmedItems(applicant).map(item => `${item.label} ${item.value}`).join(' ');
  return questions
    .map(entry => ({ entry, answer: text(answers?.[entry.question]) }))
    .filter(({ entry, answer }) => answer.length >= 10 && (REUSABLE.test(entry.question) || REUSABLE.test(answer)))
    .filter(({ answer }) => !confirmed.includes(answer.slice(0, 20)))
    .map(({ entry, answer }) => ({
      questionId: entry.id,
      label: text(entry.reason).replace(/^평가기준:\s*|^필수정보:\s*/, '') || '기관 정보',
      value: answer.slice(0, 400),
      status: CONFIRMED_STATUS === '확인됨' ? '확인 필요' : '확인 필요',
      source: '사업 설계 답변'
    }));
}
