// 아코디언에서 「지금 무엇이 열려 있는가」를 정한다.
//
// 왜 따로 빼는가. 이 계산이 클릭 처리기 안에 있으면 DOM 없이는 확인할 수 없다.
// 그래서 「눌렀을 때 나머지가 닫히는가」를 시험이 값으로 보지 못하고 코드를 읽는 데 그쳤다(22-27).
// 여기로 빼면 브라우저 없이 값으로 지킨다. 그리고 판정이 한 곳에만 있게 된다 —
// 중분류(두 화면)와 소분류(여덟 구역·기본정보 두 구역)가 모두 이 두 함수만 부른다.
//
// 상태값의 뜻은 셋이고, 이 구분이 이 파일의 전부다.
//
//   undefined — 아직 고르지 않았다. 「다음 할 일」이 가리키는 것을 연다.
//   null      — 사람이 닫아 두었다. 아무것도 열지 않는다.
//   문자열     — 사람이 이것을 열었다.
//
// undefined와 null을 나눈 까닭이 여기 있다. 둘을 하나로 합치면, 사람이 닫아 둔 뒤에
// 자료가 조금 달라져 「다음 할 일」이 다른 곳을 가리키는 순간 화면이 제멋대로 다시 열린다.
// 닫아 둔 것을 화면이 무릅쓰면 안 된다. 다시 열어 주는 길은 맨 위 띠를 누르는 것 하나뿐이다.

// 하나를 눌렀을 때 다음에 열려 있어야 할 것.
// 열려 있던 것을 다시 누르면 닫는 것이고, 다른 것을 누르면 그것 하나만 열린다.
export function nextOpenGroup(current, clicked) {
  return current === clicked ? null : clicked;
}

// 실제로 그릴 때 어느 것이 열리는가.
// nextStepGroup은 「다음 할 일」이 가리키는 것, firstGroup은 가리키는 것이 없을 때의 첫 번째다.
export function resolveOpenGroup(state, nextStepGroup, firstGroup) {
  if (state === undefined) return nextStepGroup || firstGroup || null;
  if (state === null) return null;
  return state;
}
