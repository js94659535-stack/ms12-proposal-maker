// 열한 칸을 공고 기준으로 다시 세운다.
//
// 실제로 났던 일: 열한 칸이 모두 같은 크기로 늘어서 있었다. 96건인 「사업실적」과 0건인
// 「성과측정 경험」이 똑같이 생겼고, 「0건 확인됨」이 열한 번 반복됐다. 무엇을 먼저 채워야
// 하는지 화면이 말하지 않았다.
//
// 공고 요구사항을 열한 칸에 이어붙이는 일은 22-43에서 재보고 접었다. 두 길 다 못 쓴다.
//   · 기관이 가진 항목으로 잇기 — 요구 32건 중 21건이 붙지만 거의 다 「사업실적」으로 쏠린다.
//     기관이 가진 쪽으로 끌리므로 정작 비어 있는 칸은 영영 지목하지 못한다.
//   · 칸 이름·힌트 낱말로 잇기 — 32건 중 6건만 붙는다. 「금융취약군을 발굴해야 한다」는
//     어느 칸 이름과도 겹치지 않는다. 붙이려면 낱말 목록을 늘려야 하고 그러면 쓰레기통이 된다.
//
// 그래서 앞으로 올리는 것은 **근거가 있는 칸만**이다. 근거가 없으면 그 묶음을 만들지 않는다.
// 짐작으로 「이 공고가 요구합니다」라고 적으면 그 말을 믿을 수 없게 된다.
export function groupAreas(summary = [], { consortium = null, performanceMatches = 0 } = {}) {
  const list = Array.isArray(summary) ? summary : [];
  const why = new Map();
  for (const area of list) {
    // 컨소시엄 필수는 공고 문장에서 그대로 읽힌다(requiresConsortium). 짐작이 아니다.
    if (area.key === 'partners' && consortium?.required) {
      why.set(area.key, area.total
        ? `이 공고는 여러 기관이 함께해야 합니다 — 「${consortium.evidence}」`
        : `컨소시엄이 필수인데 비었습니다 — 「${consortium.evidence}」`);
    }
    // 실적은 이미 공고와 겹치는 건수를 세고 있다(다사113·22-41). 그 숫자가 근거다.
    if (area.key === 'performance' && performanceMatches > 0) {
      why.set(area.key, `이 공고와 겹치는 실적 ${performanceMatches}건`);
    }
  }
  const required = list.filter(area => why.has(area.key)).map(area => ({ ...area, why: why.get(area.key) }));
  const rest = list.filter(area => !why.has(area.key));
  return {
    required,
    // 값이 있는 칸이 먼저다. 빈 칸은 이름만 한 줄로 접는다 — 자리를 똑같이 차지하지 않게 한다.
    filled: rest.filter(area => area.total > 0),
    empty: rest.filter(area => !area.total)
  };
}
