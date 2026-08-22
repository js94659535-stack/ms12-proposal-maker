// 기관 정보가 언제 것인지 보고 「다시 확인」을 띄운다.
//
// 왜. 「등록증이 바뀌면 스스로 고치기」는 이미 된다 — 새 등록증을 올리면 달라진 값을 짚어 주고
// 옛 값을 이력으로 남긴다. 모자란 것은 그 일을 언제 해야 하는지 아무도 말해 주지 않는 것이다.
//
// 상태는 건드리지 않는다. 「확인됨」을 저절로 「오래된 정보」로 내리면 사용자가 모르는 사이에
// 계획서에서 값이 빠진다. 표시만 한다.
//
// 무엇을 오래됐다고 보는가. 실제 자료를 보고 정했다.
// · 사업실적 99건은 2017~2026년에 고루 퍼져 있다 — 지난 사업 기록은 옛날 것이 당연하므로 대상이 아니다.
// · 기관 기본정보 4건은 모두 2021년 등록증에서 왔다 — 5년 전 값이고, 이런 것이 대상이다.
// · 기관명·고유번호·설립 시기·법인 유형은 바뀌면 서류가 새로 나오지만 몇 해가 지났다고 의심할 일은 아니다.
//   그래서 이 넷은 해가 지났다고 표시하지 않고, 기준시점이 아예 없을 때만 알린다.
// · 나머지 현재 정보(대표자·소재지·인력·시설·예산·협력기관 등)는 두 해가 지나면 다시 확인할 만하다.

// 지난 사업 기록. 오래된 것이 정상이다.
const HISTORY_AREAS = ['performance'];
// 해가 지났다고 의심하지 않는 항목. 바뀌면 서류가 바뀐다.
const SLOW_LABELS = ['기관명', '고유번호', '설립 시기', '법인 유형'];
export const STALE_YEARS = 2;

const yearOf = value => Number(String(value ?? '').match(/(19|20)\d{2}/)?.[0] || 0);

// 이 항목을 다시 확인할 때가 됐는가. 왜 그렇게 보는지 함께 돌려준다.
export function staleReason(item, thisYear) {
  if (!item || HISTORY_AREAS.includes(item.area)) return null;
  const slow = SLOW_LABELS.includes(item.label);
  const year = yearOf(item.asOf);
  if (!year) {
    return { kind: 'unknown', years: 0, note: '언제 기준인지 적혀 있지 않습니다. 문서를 올리면 기준시점이 함께 들어옵니다.' };
  }
  if (slow) return null;
  const years = thisYear - year;
  if (years < STALE_YEARS) return null;
  return { kind: 'old', years, year, note: `${year}년 기준입니다. 바뀌었으면 새 문서를 올려 주세요.` };
}

export function staleItems(items = [], thisYear = new Date().getFullYear()) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({ item, reason: staleReason(item, thisYear) }))
    .filter(entry => entry.reason);
}

// 카드 맨 위에 한 줄로 알릴 말. 없으면 빈 값이다.
export function staleSummary(items = [], thisYear = new Date().getFullYear()) {
  const stale = staleItems(items, thisYear);
  if (!stale.length) return null;
  const old = stale.filter(entry => entry.reason.kind === 'old');
  const unknown = stale.length - old.length;
  const oldest = old.length ? Math.min(...old.map(entry => entry.reason.year)) : 0;
  const parts = [];
  if (old.length) parts.push(`${old.length}건이 ${oldest}년 기준입니다`);
  if (unknown) parts.push(`${unknown}건은 언제 기준인지 적혀 있지 않습니다`);
  return { count: stale.length, message: `기관 정보 ${parts.join(' · ')}. 바뀌었으면 새 문서를 올려 확인하세요.` };
}
