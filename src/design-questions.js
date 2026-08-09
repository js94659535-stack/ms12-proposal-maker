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
