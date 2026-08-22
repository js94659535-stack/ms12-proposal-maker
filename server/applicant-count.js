// 「확인됨 N건」을 세는 단 한 곳.
//
// 실제로 났던 일: 같은 숫자를 다섯 가지 방법으로 세고 있었다. 화면 네 곳이 손으로 세고,
// 도우미 셋이 각자 세고, 서버가 저장할 때 또 셌다. 값은 마침 같았지만 잣대는 달랐다.
// 화면은 상태만 봤고, 계획서로 나가는 목록은 값이 비었는지도 봤다.
//
// 잣대는 계획서로 나가는 쪽에 맞춘다. 값이 비어 있으면 확인됐다고 할 수 없다.
// 그렇지 않으면 「확인됨 96건」이라 적어 놓고 정작 96건이 나가지 않는 일이 생긴다.
export const CONFIRMED_STATUS = '확인됨';

export function isConfirmed(item) {
  return item?.status === CONFIRMED_STATUS && String(item?.value ?? '').trim() !== '';
}
export function countConfirmed(items) {
  return (Array.isArray(items) ? items : []).filter(isConfirmed).length;
}
// 확인되지 않은 것은 나머지 전부다. 둘을 더하면 언제나 전체가 된다.
export function countUnconfirmed(items) {
  const list = Array.isArray(items) ? items : [];
  return list.length - countConfirmed(list);
}
