// 계획서 한 편이 지나는 다섯 자리. 지금 어디까지 왔는지 한 줄로 말한다.
// 화면마다 따로 세지 않는다. 여기 하나로 세고 배지와 패널이 같은 값을 쓴다.
// 규칙으로만 판단하고 값을 지어내지 않는다. 근거가 없으면 아직 안 된 것으로 본다.

export const PIPELINE_STAGES = Object.freeze([
  { key: 'notice', label: '공고', hint: '공고를 고르거나 가져왔습니다' },
  { key: 'analysis', label: '분석', hint: '선정 논리와 필수 요건을 읽었습니다' },
  { key: 'design', label: '설계', hint: '대상·회기·예산 같은 이번 사업 값을 정했습니다' },
  { key: 'writing', label: '작성', hint: '계획서 본문을 만들었습니다' },
  { key: 'review', label: '검증', hint: '검증·코칭을 거쳤습니다' }
]);

const has = value => Array.isArray(value) ? value.length > 0 : Boolean(value);

export function buildWritingPipeline({
  notice = null, pastedText = '', analysis = null,
  projectValues = [], master = null, sections = [],
  coaching = null, preciseReview = null, reviewResult = null
} = {}) {
  const done = {
    notice: has(notice?.title) || String(pastedText || '').trim().length >= 30,
    analysis: has(analysis?.structure) || has(analysis?.requirements),
    // 설계는 사용자가 값을 확정했거나 마스터 설계가 나왔을 때로 본다.
    design: (projectValues || []).some(item => String(item?.value || '').trim()) || has(master),
    writing: has(sections),
    review: has(coaching?.result) || has(preciseReview?.summary) || has(reviewResult)
  };
  const stages = PIPELINE_STAGES.map(stage => ({ ...stage, done: Boolean(done[stage.key]) }));
  const count = stages.filter(stage => stage.done).length;
  // 지금 할 자리는 아직 안 된 것 중 맨 앞이다. 다 되었으면 마지막 자리에 머문다.
  const current = stages.find(stage => !stage.done) || stages[stages.length - 1];
  return { stages, done: count, total: stages.length, current, complete: count === stages.length };
}
