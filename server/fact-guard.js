// 생성 결과를 서버가 다시 본다. 모델이 규칙을 어겨도 근거 없는 값이 확정 사실로 나가지 않게 한다.
//
// 프롬프트로 「지어내지 마라」라고 이르는 것과, 지어낸 값을 걸러 내는 것은 다른 일이다.
// 여기서는 뒤쪽만 한다. 근거 자료에 없는 숫자·기관·법령·기간을 찾아 표시하거나 지운다.

export const MARKS = Object.freeze({
  check: '[확인 필요]',
  organization: '[기관 입력 필요]',
  notice: '[공고문 확인 필요]',
  proposed: '[제안값 — 확정 전]'
});
export const MARK_LIST = Object.freeze(Object.values(MARKS));

// 근거가 없을 때 무엇으로 바꿔 둘지. 종류마다 사용자가 할 일이 다르다.
const MARK_BY_KIND = Object.freeze({
  amount: MARKS.notice, budget: MARKS.notice, quota: MARKS.notice,
  headcount: MARKS.organization, staff: MARKS.organization, facility: MARKS.organization,
  achievement: MARKS.organization, partner: MARKS.organization,
  statistic: MARKS.check, satisfaction: MARKS.check, survey: MARKS.check,
  period: MARKS.check, law: MARKS.check, research: MARKS.check, quote: MARKS.check
});

// ---------- 자료를 자료로만 다루기 ----------

// 업로드·붙여넣은 글 안의 명령형 문장을 무력화한다. 지우지 않고 자료임을 분명히 해 둔다.
// 「이전 지시를 무시하라」 같은 문장이 시스템 명령으로 읽히지 않게 하는 것이 목적이다.
const INJECTION = [
  /(?:이전|위|앞)\s*(?:의\s*)?(?:지시|명령|규칙|프롬프트)[^\n]{0,20}(?:무시|잊|따르지\s*마)/gi,
  /(?:너는|당신은|system\s*:|assistant\s*:)[^\n]{0,40}(?:역할|행동|규칙)[^\n]{0,20}(?:바꾸|변경|재정의)/gi,
  /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|rules?)/gi,
  /disregard\s+(?:the\s+)?(?:system|previous)\s+(?:prompt|message|instructions?)/gi,
  /(?:출력|응답)\s*(?:형식|스키마)[^\n]{0,20}(?:무시|바꿔|변경)/gi,
  /(?:api\s*key|비밀번호|시스템\s*프롬프트)[^\n]{0,20}(?:알려|출력|보여)/gi
];

export function sanitizeSourceText(value) {
  const text = String(value || '');
  let hits = 0;
  const cleaned = INJECTION.reduce((current, pattern) => current.replace(pattern, match => {
    hits += 1;
    // 원문을 지우지 않는다. 지시가 아니라 인용된 글자임을 표시만 한다.
    return `[자료 속 문장: ${match.replace(/\s+/g, ' ').slice(0, 60)}]`;
  }), text);
  return { text: cleaned, injectionCount: hits };
}

// ---------- 근거에 실제로 있는 값 모으기 ----------

export function normalizeNumber(value) {
  return String(value ?? '').replace(/[,\s]/g, '');
}

// 「1억 2천만원」·「3,000만원」처럼 적힌 값을 숫자로 편다.
const KOREAN_UNITS = Object.freeze({ 억: 100_000_000, 천만: 10_000_000, 백만: 1_000_000, 십만: 100_000, 만: 10_000, 천: 1_000 });
export function expandKoreanNumber(text) {
  const clean = normalizeNumber(text);
  let total = 0;
  let matched = false;
  let rest = clean;
  for (const match of clean.matchAll(/(\d+(?:\.\d+)?)\s*(억|천만|백만|십만|만|천)/g)) {
    total += Number(match[1]) * KOREAN_UNITS[match[2]];
    matched = true;
    rest = rest.replace(match[0], '');
  }
  if (!matched) {
    const plain = clean.match(/^\d+(?:\.\d+)?/);
    return plain ? Number(plain[0]) : null;
  }
  // 「1억 2000」처럼 단위 없는 꼬리가 남으면 그대로 더한다.
  const tail = rest.match(/^\D*(\d+(?:\.\d+)?)/);
  if (tail) total += Number(tail[1]);
  return Number.isFinite(total) && total > 0 ? total : null;
}

// 숫자만으로는 근거가 되지 않는다. 「2027년 12월」이 「12명」을 뒷받침하지는 않기 때문이다.
// 그래서 값과 단위를 함께 본다.
const UNIT_CLASS = [
  ['money', /원/], ['person', /명|인(?!프라)/], ['count', /건|개소|개관|기관|개/],
  ['percent', /%|퍼센트|％/], ['score', /점/], ['times', /회|차례/], ['period', /년|개월|주|일/]
];
export function unitClassOf(unit) {
  const text = String(unit || '');
  for (const [name, pattern] of UNIT_CLASS) if (pattern.test(text)) return name;
  return 'plain';
}

// 근거 자료에 실제로 있는 「값+단위」 짝을 모은다.
export function sourceValues(sources) {
  const text = sourceText(sources);
  const found = new Set();
  for (const match of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(억원|천만원|백만원|만원|원|명|인|건|개소|개관|기관|개|%|퍼센트|％|점|회|차례|년|개월|주|일)?/g)) {
    const plain = normalizeNumber(match[1]);
    const unit = match[2] || '';
    const kind = unitClassOf(unit);
    found.add(`${kind}:${plain}`);
    found.add(`${kind}:${Number(plain)}`);
    // 「3,000만원」은 30,000,000원과 같은 값이다.
    if (kind === 'money' && /만원|억원|천만원|백만원/.test(unit)) {
      const expanded = expandKoreanNumber(`${plain}${unit.replace('원', '')}`);
      if (expanded) found.add(`money:${expanded}`);
    }
  }
  return found;
}

// 예전 이름. 값만 필요할 때 쓴다.
export function sourceNumbers(sources) {
  return new Set([...sourceValues(sources)].map(entry => entry.split(':')[1]));
}

export function sourceText(sources) {
  if (typeof sources === 'string') return sources;
  if (Array.isArray(sources)) return sources.map(sourceText).join('\n');
  if (sources && typeof sources === 'object') return Object.values(sources).map(sourceText).join('\n');
  return String(sources ?? '');
}

// ---------- 근거 없는 값 찾기 ----------

// 지어내기 쉬운 값들. 값과 단위를 함께 보고 근거 자료에 같은 짝이 있는지 확인한다.
const CLAIM_PATTERNS = [
  ['statistic', /(\d[\d,]*(?:\.\d+)?)\s*(%|퍼센트|％)/g],
  ['satisfaction', /만족도[^\n]{0,12}?(\d[\d,]*(?:\.\d+)?)\s*(점|%|퍼센트)/g],
  ['headcount', /(\d[\d,]*)\s*(명|인)(?![\s]*당)/g],
  ['amount', /(\d[\d,]*(?:\.\d+)?)\s*(억원|천만원|백만원|만원|천원|원)/g],
  ['quota', /(\d[\d,]*)\s*(건|개소|개관|기관)/g],
  ['achievement', /(\d[\d,]*)\s*(회|차례|년간|개월간)\s*(?:수행|운영|진행|선정)/g]
];

// 확인되지 않은 채로 쓰이면 곤란한 표현들.
const RISK_PATTERNS = [
  ['law', /「[^」]{2,40}법(?:률)?」|제\s?\d+\s?조(?:\s?제\s?\d+\s?항)?/g],
  ['research', /(?:연구|조사|보고서|백서)\s*(?:결과|에\s*따르면)|(?:20\d{2})\s*년\s*[^\n]{0,20}(?:연구|조사)/g],
  ['partner', /[가-힣A-Za-z0-9○△□×]{2,20}(?:재단|복지관|센터|법인|협회|대학교|병원|공단|진흥원)(?:와|과|은|는|이|가)?\s*(?:협약|업무협약|MOU|공동\s*수행|협력\s*체결)/g],
  ['survey', /(?:욕구|수요|만족도)\s*조사\s*(?:결과|에서)/g]
];

// 문장이 사실을 단정하는가. 「~할 예정」·「제안」·확인 표시가 붙어 있으면 단정이 아니다.
const HEDGED = /확인\s*필요|예정|제안|계획|검토|하겠|하려|권장|가정|추정|목표로|바랍니다/;

export function findUnsupportedClaims(value, sources) {
  const text = String(value || '');
  if (!text.trim()) return [];
  const values = sourceValues(sources);
  const haystack = compact(sourceText(sources));
  const found = [];
  const seen = new Set();

  for (const [kind, pattern] of CLAIM_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, 'g'))) {
      const raw = match[1];
      const unit = match[2] || '';
      const plain = normalizeNumber(raw);
      const unitKind = unitClassOf(unit);
      if (values.has(`${unitKind}:${plain}`) || values.has(`${unitKind}:${Number(plain)}`)) continue;
      // 「3,000만원」과 「30,000,000원」은 같은 값이다.
      const expanded = unitKind === 'money' ? expandKoreanNumber(`${plain}${unit.replace('원', '')}`) : null;
      if (expanded && values.has(`money:${expanded}`)) continue;
      // 자료에 적힌 그대로면 단위 표기가 달라도 근거가 있다고 본다.
      if (haystack.includes(compact(match[0]))) continue;
      const context = contextOf(text, match.index, match[0].length);
      // 이미 확인 표시가 붙어 있거나 제안임을 밝힌 문장은 그대로 둔다.
      if (marked(context) || HEDGED.test(context)) continue;
      const key = `${kind}:${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ kind, value: match[0].trim(), mark: MARK_BY_KIND[kind] || MARKS.check, context: context.slice(0, 120) });
    }
  }

  for (const [kind, pattern] of RISK_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, 'g'))) {
      const phrase = match[0].trim();
      if (haystack.includes(compact(phrase))) continue;
      const context = contextOf(text, match.index, match[0].length);
      if (marked(context) || HEDGED.test(context)) continue;
      const key = `${kind}:${phrase}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ kind, value: phrase, mark: MARK_BY_KIND[kind] || MARKS.check, context: context.slice(0, 120) });
    }
  }
  return found;
}

// 근거 없는 값에 표시를 붙인다. 문장을 지우지 않고 무엇을 확인해야 하는지 남긴다.
export function guardText(value, sources) {
  const text = String(value || '');
  const claims = findUnsupportedClaims(text, sources);
  if (!claims.length) return { text, claims: [], changed: false };
  let guarded = text;
  for (const claim of claims) {
    // 같은 값이 여러 번 나오면 모두 표시한다.
    guarded = guarded.split(claim.value).join(`${claim.value}${claim.mark}`);
  }
  return { text: guarded, claims, changed: true };
}

// 항목 묶음을 한 번에 본다. 본문 필드만 손대고 제목·식별자는 건드리지 않는다.
export function guardSections(sections, sources, field = 'content') {
  const claims = [];
  const guarded = (Array.isArray(sections) ? sections : []).map(section => {
    const result = guardText(section?.[field], sources);
    for (const claim of result.claims) claims.push({ ...claim, sectionId: section?.id || '', sectionTitle: section?.title || '' });
    return result.changed ? { ...section, [field]: result.text } : section;
  });
  return { sections: guarded, claims };
}

// ---------- 같은 말로 분량 채우기 ----------

export function repetitionReport(sections, field = 'content') {
  const rows = (Array.isArray(sections) ? sections : []).map(section => ({ id: section?.id || '', title: section?.title || '', text: String(section?.[field] || '') }));
  const sentences = new Map();
  for (const row of rows) {
    for (const raw of row.text.split(/(?<=[.!?。])\s+|\n+/)) {
      const key = compact(raw);
      if (key.length < 20) continue;
      if (!sentences.has(key)) sentences.set(key, []);
      sentences.get(key).push({ id: row.id, title: row.title, sentence: raw.trim().slice(0, 80) });
    }
  }
  const repeated = [...sentences.values()].filter(list => list.length > 1);
  const total = [...sentences.values()].length;
  return {
    repeatedSentences: repeated.map(list => ({ sentence: list[0].sentence, count: list.length, sections: list.map(item => item.title || item.id) })),
    repeatedCount: repeated.reduce((sum, list) => sum + list.length - 1, 0),
    totalSentences: total,
    // 같은 문장이 전체의 15%를 넘으면 분량 채우기로 본다.
    padded: total > 0 && repeated.reduce((sum, list) => sum + list.length - 1, 0) / total > 0.15
  };
}

// ---------- 도움 함수 ----------
const compact = value => String(value || '').replace(/\s+/g, '').toLowerCase();
const marked = context => MARK_LIST.some(mark => context.includes(mark));
// 값이 들어 있는 문장만 본다. 옆 문장의 「~하겠습니다」가 이 값을 제안으로 만들지 않게 하려는 것이다.
function contextOf(text, index, length) {
  const before = text.slice(0, index);
  const start = Math.max(before.lastIndexOf('.'), before.lastIndexOf('\n'), before.lastIndexOf('!'), before.lastIndexOf('?')) + 1;
  const after = text.slice(index + length);
  const stops = [after.indexOf('.'), after.indexOf('\n'), after.indexOf('!'), after.indexOf('?')].filter(at => at >= 0);
  const end = index + length + (stops.length ? Math.min(...stops) + 1 : after.length);
  return text.slice(start, end).trim();
}
