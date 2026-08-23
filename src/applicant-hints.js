// 핵심 질문에 붙일 기관 정보 근거 (23-13).
//
// 실제로 났던 일: 답을 채울 수 있는 함수(planApplicantQuestions)는 멀쩡한데
// 화면에 나오는 다섯 질문이 그 함수를 지나지 않았다. 기관을 골라도 「0/5 답변」 그대로였다.
//
// 찾는 일은 여기서 하지 않는다. planApplicantQuestions() 한 곳에 맡기고 그 결과만 옮겨 담는다 —
// 견주는 잣대를 두 벌 두면 한쪽만 고쳐지는 날이 온다.
//
// ★ 답을 채우지 않는다. 어느 항목이 걸렸는지만 돌려준다. 답 칸에 넣는 것은 사람이 누를 때다.
import { confirmedItems, planApplicantQuestions } from './applicants.js';

// 질문 문장 → 걸린 기관 확인정보 항목들. 걸린 것이 없는 질문은 아예 담지 않는다.
export function applicantHints(questions, applicant) {
  const items = confirmedItems(applicant);
  if (!items.length) return new Map();
  const byId = new Map(items.map(item => [item.id, item]));
  // 한 질문씩 넘긴다. 여러 줄을 한꺼번에 넘기면 그 함수가 첫 줄을 제목으로 삼고 줄 사이의 낱말
  // 횟수로 중심 낱말을 가른다 — 공고 요구 목록에는 맞는 잣대지만, 서로 상관없는 질문 다섯에 대면
  // 붙는 근거가 목록의 순서와 조합에 따라 달라진다. 질문 하나는 제 낱말로만 판정한다.
  return new Map((Array.isArray(questions) ? questions : [])
    .map(one => String(one ?? ''))
    .filter(Boolean)
    .map(question => [question, (planApplicantQuestions([question], applicant).resolved[0]?.items || []).map(one => byId.get(one.id)).filter(Boolean)])
    .filter(([, matched]) => matched.length));
}

// 「실적」에서 온 것은 지난 사업 값이다. 이번 사업 값으로 옮겨 적으면 안 되는 것이라 값이 아니라
// 참고로 말한다. 질문 문구를 뒤져서 가르지 않는다 — 「과거 사업 수치를 그대로 쓰지 않습니다」와
// 「과거 사업 예산을 그대로 쓰지 않습니다」처럼 문장이 항목마다 달라서, 문구를 문자열로 찾는 자리가 된다.
// 근거가 어느 영역에서 왔는지는 자료에 이미 적혀 있다.
export function hintIsPastWork(items) {
  return (Array.isArray(items) ? items : []).some(item => item?.area === 'performance');
}

// 눌렀을 때 답 칸에 들어갈 글. 지난 실적이면 그렇다고 앞에 적는다.
export function hintText(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '';
  const body = list.map(item => `${item.label}: ${String(item.value ?? '').replace(/\s+/g, ' ').trim()}`).join(' / ');
  return hintIsPastWork(list) ? `지난 사업에서는 ${body}` : body;
}
