// 앞 항목들을 묶어 다시 말하는 요구사항에 꼬리표를 단다.
//
// 왜. 실제 공고에서 「필수사업 다섯 가지를 계획서에 모두 포함해야 한다」가 앞의 다섯 줄을 묶은
// 요약인데 여섯 번째 요구로 따로 세어졌다. 요구를 뽑는 두 길(AI 분석·규칙 추출) 어디에도
// 겹치는 요구를 합치는 장치가 없다.
//
// 합치지도 지우지도 않는다. 숫자에서 빼지도 않는다 — 여섯 건은 그대로 여섯 건이고 꼬리표만 단다.
// 판정이 틀렸을 때 잃는 것이 안내 한 줄뿐이어야 한다.
//
// 무엇으로 보는가. 개수를 말하거나(「다섯 가지」) 앞을 가리키면서(「위 항목」·「앞의」·「상기」)
// 「모두」·「빠짐없이」를 함께 말하면 묶음으로 본다.
// 내용이 겹치는지는 보지 않는다 — 실제 여섯 줄로 재 보니 요약 문장이 앞과 공유하는 낱말은
// 「한다」 하나뿐이었고, 오히려 진짜 별개 요구인 셋째·다섯째가 두 개씩 겹쳤다. 겹침으로 보면
// 진짜 요구가 먼저 걸린다.
//
// 「각 호」는 신호에서 뺀다. 법령을 인용하는 말버릇이라 결격사유 조항 나열이 통째로 걸린다.

const COUNT_WORD = /(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*가지|\d+\s*(?:가지|개)\s*(?:사업|항목|분야|영역|과제|프로그램)/;
const POINT_BACK = /위\s*(?:항목|사업|내용)|앞의\s*(?:항목|사업|내용)|상기\s*(?:항목|사업|내용)|해당\s*항목/;
const ALL_WORD = /모두|전부|빠짐없이|일괄|반드시\s*포함/;

const phrase = (text, pattern) => text.match(pattern)?.[0]?.replace(/\s+/g, ' ').trim() || '';

// 요구사항 한 줄을 본다. 묶음으로 보이면 그렇게 본 까닭을 함께 돌려준다.
export function rollupMark(requirement) {
  const text = String(requirement ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { rollup: false, reasons: [] };
  const pointer = phrase(text, COUNT_WORD) || phrase(text, POINT_BACK);
  const all = phrase(text, ALL_WORD);
  if (!pointer || !all) return { rollup: false, reasons: [] };
  return { rollup: true, reasons: [pointer, all] };
}

// 목록에서 묶음으로 보이는 것의 id만 모은다. 순서도 건수도 바꾸지 않는다.
export function rollupIds(requirements = []) {
  return (Array.isArray(requirements) ? requirements : [])
    .filter(item => rollupMark(item?.requirement ?? item).rollup)
    .map(item => item?.id || '')
    .filter(Boolean);
}
