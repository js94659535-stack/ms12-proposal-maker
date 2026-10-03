// 제안요청서·공고문에서 「조건처럼 보이는 문장」을 일반 규칙으로 뽑는다(10-19).
// 문구마다 패턴을 손으로 쓰던 방식(10-17)을 버리고, 숫자+단위+조건어 · 날짜 · 의무/금지 표현을 찾는다.
// 결과는 확정이 아니라 후보다 — 사람이 확인하는 표(원문 근거 포함)로 보인다.
const COUNT = /(\d[\d,]*(?:\.\d+)?)\s*(명|개소|개|대|회|년|개월|일|%|쪽|MB)(?:\s*(이상|이하|이내|미만|초과|까지|이전|이후|내외|한도|최대|최소))?/g;
const AMOUNT = /(\d[\d,]*(?:\.\d+)?)\s*(억|만)?\s*원/g;
const DATE = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})?\.?/g;
const DUTY = /신청자격|제외|불가|필수|하여야|해야|반드시|금지|없어야|받지 못한|제출|자부담|보고/;

export function segments(text) {
  return String(text)
    .split(/\n+|\t+|(?=[○●•▪※ⅠⅡⅢ①②③④⑤⑥⑦⑧⑨⑩])/)
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(part => part.length >= 8);
}

export function extractCandidates(text, file = '') {
  const found = [];
  const seen = new Set();
  for (const quote of segments(text)) {
    const kinds = [];
    const numbers = [];
    for (const m of quote.matchAll(AMOUNT)) { kinds.push('금액'); numbers.push(`${m[1]}${m[2] || ''}원`); }
    for (const m of quote.matchAll(COUNT)) {
      // 날짜(2027. 1.)의 숫자와 「년」은 날짜 규칙이 맡는다. 조건어가 붙었거나 세는 단위일 때만 수량 후보다.
      if (m[2] === '년' && /^\d{4}$/.test(m[1])) continue;
      if (m[3] || /명|개소|개|대|회|개월|%/.test(m[2]) || /5년|\d+년간/.test(m[0])) { kinds.push('수량'); numbers.push(m[0].replace(/\s+/g, '')); }
    }
    for (const m of quote.matchAll(DATE)) { kinds.push('날짜'); numbers.push(`${m[1]}-${String(m[2]).padStart(2, '0')}${m[3] ? `-${String(m[3]).padStart(2, '0')}` : ''}`); }
    if (DUTY.test(quote)) kinds.push('의무·제외');
    if (!kinds.length) continue;
    const key = quote.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ id: `c${found.length + 1}`, file, quote: quote.slice(0, 200), kinds: [...new Set(kinds)], numbers: [...new Set(numbers)] });
  }
  return found;
}
