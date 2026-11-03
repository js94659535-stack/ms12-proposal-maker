// 개업일과 그 전 날짜 — 한 곳(11-25).
// 법인의 실적은 개업일 이후 것만이다. 그 전 일은 대표자 개인의 경력이지 법인 실적이 아니다.
// 개업일은 코드에 박지 않는다 — 기관 자료에서 읽는다. 못 읽으면 짐작하지 않고 그렇다고 돌려준다.
// 쓰는 곳: 초안 검사(src/proposal-draft.js 「개업일 전 실적」), 실적 가르기(tools/records-since-opening.mjs).

const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// 「개업일 2021.08.26」 「개 업 연 월 일 : 2021 년 08 월 26 일」(사업자등록증) 「| 개업일 | 2021-08-26 |」
const OPENING = /개\s*업\s*(?:연\s*월\s*일|일\s*자?|일)\s*[|:：)\]]*\s*\|?\s*(\d{4})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})/g;

// 기관 자료 글들에서 개업일을 읽는다. 하나로 모이면 { date: 'YYYY-MM-DD' }, 없거나 서로 다르면 { reason }.
export function openingDateOf(texts = []) {
  const found = new Set();
  for (const text of texts) for (const m of String(text ?? '').matchAll(OPENING)) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= lastDay(y, mo)) found.add(ymd(y, mo, d));
  }
  if (found.size === 1) return { date: [...found][0] };
  if (!found.size) return { reason: '기관 자료에 개업일이 없다' };
  return { reason: `기관 자료의 개업일이 서로 다르다(${[...found].join(' · ')})` };
}

// 한 줄에 나온 날짜들 — 날짜마다 그 말이 가리킬 수 있는 가장 이른 날과 가장 늦은 날.
// 「2021.08.26」은 그날 하루, 「2021.08」은 그달, 「2021」만 있으면 그해 전체. 「2019~21」의 「21」처럼 두 자리는 날짜로 보지 않는다.
const DATE = /(?<![\d,.])((?:19|20)\d{2})(?:\s*(?:[.\-/]|년)\s*(\d{1,2})(?!\d)(?:\s*(?:[.\-/]|월)\s*(\d{1,2})(?!\d))?)?(?![\d,])/g;
export function datesIn(line) {
  const dates = [];
  for (const m of String(line ?? '').matchAll(DATE)) {
    const y = Number(m[1]);
    const mo = m[2] && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : null;
    const d = mo && m[3] && Number(m[3]) >= 1 && Number(m[3]) <= lastDay(y, mo) ? Number(m[3]) : null;
    dates.push({
      raw: mo ? m[0].trim() : m[1],
      from: ymd(y, mo ?? 1, d ?? 1),
      to: ymd(y, mo ?? 12, d ?? lastDay(y, mo ?? 12))
    });
  }
  return dates;
}

// 실적 한 건을 쓸지(11-25 나). 날짜 칸에 개업일 이후 날짜가 있는 건만 쓴다 — 승계한 건이라도 증빙 없이는 쓰지 않는다.
// 뺀 까닭을 갈래로 돌려준다: 날짜 빈칸 · 날짜 못 읽음 · 개업 전 시작해 이어짐(「2017~」) · 해만 있고 달 없음(「2021」) · 개업일 전.
export const DROP = { blank: '날짜 빈칸', unread: '날짜 못 읽음', ongoing: '개업 전 시작해 이어짐', yearOnly: '해만 있고 달 없음', before: '개업일 전' };
export function recordSince(dateCell, opening) {
  const cell = String(dateCell ?? '').trim();
  if (!cell) return { keep: false, why: DROP.blank };
  const first = datesIn(cell)[0];
  if (!first) return { keep: false, why: DROP.unread };
  if (first.from >= opening) return { keep: true };
  if (/[~∼～]\s*(?:$|현재|지금|계속|진행)/.test(cell)) return { keep: false, why: DROP.ongoing };
  if (first.to >= opening) return { keep: false, why: DROP.yearOnly };
  return { keep: false, why: DROP.before };
}

// 그 줄이 개업일 전을 가리키는가. before: 틀림없이 전(가장 늦은 날도 전), unsure: 전일 수도 있다(「2021」처럼 개업일을 걸친다).
export function beforeOpening(line, opening) {
  const before = [];
  const unsure = [];
  for (const date of datesIn(line)) {
    if (date.to < opening) before.push(date.raw);
    else if (date.from < opening) unsure.push(date.raw);
  }
  return { before, unsure };
}
