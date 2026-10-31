// 공고(RFP) 본문 글자에서 평가표·제안서 목차·하드 제약을 읽는다(10-05).
//
// 입력은 문서에서 뽑은 글자다. 표는 칸이 탭, 줄이 줄바꿈으로 들어 있다(public/lib/hwpx-text.js·hwp-text.js가 그렇게 뽑는다).
// 어떤 공고의 항목 이름이나 숫자도 이 파일에 적지 않는다 — 전부 글자에서 읽는다.
// 평가표가 없으면 목차를 만들지 않고 그 이유를 돌려준다. 읽지 못한 것을 읽은 척하지 않는다.

const squash = value => String(value ?? '').replace(/\s+/g, '');
const cellsOf = line => line.split('\t').map(cell => cell.trim());

// 「평가항목 · 배점」처럼 항목 칸과 배점 칸이 함께 있는 줄이 평가표의 머리다.
const ITEM_HEAD = /^(평가|심사|세부)?(항목|지표)$|^평가요소$/;
const SCORE_HEAD = /^배점/;
const CONTENT_HEAD = /^(평가|심사)?(내용|기준)$|^세부(내용|기준|평가)|^착안/;
const SCORE_CELL = /^\(?(\d+(?:\.\d+)?)\)?\s*점?$/;
const SUBTOTAL = /^소계$/;
const TOTAL = /^(합계|총계|계|총점)$/;
const BULLET = /[✤❖◆◇■□●○◦•∙▪❍◯]/;

function isHeader(cells) {
  const names = cells.map(squash);
  return names.some(name => ITEM_HEAD.test(name)) && names.some(name => SCORE_HEAD.test(name));
}

// 평가내용 칸을 쓸 거리 목록으로 나눈다. 「✤ 큰 줄  - 작은 줄」 모양을 그대로 살린다.
export function splitPoints(content) {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const parts = text.split(new RegExp(`\\s*${BULLET.source}\\s*`)).map(part => part.trim()).filter(Boolean);
  return parts.map(part => {
    const [head, ...subs] = part.split(/\s+-\s+/).map(piece => piece.trim()).filter(Boolean);
    return subs.length ? { point: head, details: subs } : { point: head, details: [] };
  });
}

// 머리 줄 아래에서 탭이 없는 줄을 만날 때까지를 한 표로 읽는다.
function readTable(lines, start) {
  const header = cellsOf(lines[start]);
  const hasContent = header.some(cell => CONTENT_HEAD.test(squash(cell)));
  const items = [];
  const groups = [];
  let total = null;
  let group = null;
  let end = start + 1;
  for (; end < lines.length; end += 1) {
    const line = lines[end];
    if (!line.includes('\t')) break;
    const cells = cellsOf(line);
    const at = cells.findIndex(cell => SCORE_CELL.test(cell));
    if (at < 0) continue;
    const labels = cells.slice(0, at).filter(Boolean);
    // 「10 8 6 4 2」 같은 점수 눈금 줄은 항목이 아니다.
    if (!labels.length) continue;
    const score = Number(cells[at].match(SCORE_CELL)[1]);
    const names = labels.map(squash);
    if (names.some(name => SUBTOTAL.test(name))) {
      group = labels.filter(label => !SUBTOTAL.test(squash(label))).pop() || null;
      groups.push({ name: group, score });
      continue;
    }
    if (names.some(name => TOTAL.test(name))) { total = score; continue; }
    const name = labels[0];
    // 평가내용은 이름과 배점 사이의 칸, 없으면 배점 뒤의 글 칸이다(눈금 낱말 「우수」 같은 짧은 칸은 뺀다).
    const between = labels.slice(1).join(' ');
    const after = cells.slice(at + 1).filter(cell => cell.length > 15 || BULLET.test(cell)).join(' ');
    items.push({ name, score, group, content: between || after });
  }
  return { start, end, hasContent, items, groups, total };
}

const sameItem = (left, right) => {
  const a = squash(left).replace(/[^\p{L}\p{N}]/gu, '');
  const b = squash(right).replace(/[^\p{L}\p{N}]/gu, '');
  return a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));
};

// 글자 전체에서 평가표를 모두 찾아 항목·배점·평가내용·묶음(정량/정성 등)을 합친다.
export function readEvaluation(text) {
  const lines = String(text || '').split('\n');
  const tables = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes('\t') || !isHeader(cellsOf(lines[index]))) continue;
    const table = readTable(lines, index);
    if (table.items.length) tables.push(table);
    index = table.end - 1;
  }
  if (!tables.length) {
    const criteria = /(선정|심사|평가)\s*기준/.test(text);
    return {
      found: false,
      reason: criteria
        ? '선정·심사 기준은 있으나 항목마다 배점이 붙은 평가표가 없다'
        : '평가항목과 배점이 함께 있는 표를 찾지 못했다',
      items: [], groups: [], tables: 0
    };
  }

  // 같은 항목이 요약표와 상세표에 두 번 나온다. 이름이 더 긴 쪽(상세표의 정식 이름)과 평가내용이 있는 쪽을 남긴다.
  const items = [];
  const groups = [];
  // 상세표(평가내용 칸이 있는 표)의 순서를 목차 순서로 쓴다.
  for (const table of [...tables].sort((a, b) => Number(b.hasContent) - Number(a.hasContent))) {
    for (const group of table.groups) if (!groups.some(known => known.name === group.name)) groups.push(group);
    for (const item of table.items) {
      const known = items.find(entry => sameItem(entry.name, item.name) && entry.score === item.score);
      if (!known) { items.push({ ...item, aliases: [] }); continue; }
      if (item.name.length > known.name.length) { known.aliases.push(known.name); known.name = item.name; } else if (item.name !== known.name) known.aliases.push(item.name);
      if (!known.content && item.content) known.content = item.content;
      if (!known.group && item.group) known.group = item.group;
    }
  }
  const checks = tables.filter(table => table.total !== null).map(table => {
    const sum = table.items.reduce((acc, item) => acc + item.score, 0);
    return { what: `평가표 합계 ${table.total}점`, ok: sum === table.total || table.groups.length > 0, detail: `항목 배점 합 ${sum}점` };
  });
  for (const group of groups) {
    const sum = items.filter(item => item.group === group.name).reduce((acc, item) => acc + item.score, 0);
    checks.push({ what: `「${group.name}」 소계 ${group.score}점`, ok: sum === group.score, detail: `항목 배점 합 ${sum}점` });
  }
  return {
    found: true,
    tables: tables.length,
    items: items.map(item => ({ ...item, points: splitPoints(item.content) })),
    groups,
    total: tables.map(table => table.total).filter(value => value !== null).sort((a, b) => b - a)[0] ?? null,
    checks
  };
}

// 평가 항목이 그대로 제안서 목차가 된다. 글로 써서 심사받는 묶음(정성)만 고른다.
// 묶음 이름에 「정성」이 있으면 그 묶음, 없으면 평가내용이 붙은 항목 전부다.
export function outlineFromEvaluation(evaluation) {
  if (!evaluation?.found) return null;
  const written = evaluation.groups.find(group => /정성/.test(group.name || ''));
  const chosen = written
    ? evaluation.items.filter(item => item.group === written.name)
    : evaluation.items.filter(item => item.points.length);
  if (!chosen.length) return null;
  return {
    from: written ? `평가표 「${written.name}」 묶음` : '평가표에서 평가내용이 있는 항목',
    total: chosen.reduce((acc, item) => acc + item.score, 0),
    sections: chosen.map((item, index) => ({
      no: index + 1,
      title: item.name,
      score: item.score,
      aliases: item.aliases,
      writeWhat: item.points
    })),
    leftOut: evaluation.items.filter(item => !chosen.includes(item)).map(item => ({ name: item.name, score: item.score, group: item.group }))
  };
}

// ---------- 하드 제약 ----------

const SMALL = { 천: 1e3, 백: 1e2, 십: 10 };
const BIG = { 억: 1e8, 만: 1e4 };
const MONEY = /\d[\d,.]*\s*(?:억|천만|백만|십만|만|천|백)?(?:\s*\d[\d,.]*\s*(?:천만|백만|십만|만|천|백))*\s*원/g;

// 「504백만원」「252,000천원」「1억 5천만 원」「2천 5백만 원」「1만 5천원」「60,000원」을 원 단위 정수로 바꾼다.
// 천·백·십은 뒤에 오는 만·억에 함께 묶인다 — 「2천 5백만」은 2,500만이지 2천 + 5백만이 아니다.
export function parseWon(value) {
  const text = String(value).replace(/[\s,]/g, '').replace(/원$/, '');
  if (!/^\d/.test(text)) return null;
  let total = 0;
  let group = 0;
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)?(억|만|천|백|십)?/g)) {
    if (!match[0]) continue;
    const number = match[1] === undefined ? null : Number(match[1]);
    const unit = match[2];
    if (!unit) { group += number ?? 0; continue; }
    if (SMALL[unit]) { group += (number ?? 1) * SMALL[unit]; continue; }
    total += (group + (number ?? 0) || 1) * BIG[unit];
    group = 0;
  }
  return Math.round(total + group);
}

const DATE = /(\d{4})\s*[.\-]\s*(\d{1,2})\s*[.\-]\s*(\d{1,2})/g;
const dates = text => [...String(text).matchAll(DATE)].map(m => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);

// 한 줄을 「조각」으로 나눈다. 표 칸, 그리고 한 칸 안에 ◯·※로 이어 붙은 안내문을 따로 본다.
function clausesOf(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const cells = cellsOf(line);
    let topic = null;
    cells.forEach((cell, index) => {
      // 문장 끝(「…함.」「…음.」「…다.」)에서도 나눈다. 뒤 문장의 「경우」가 앞 문장의 한도를 조건부로 만들지 않게 한다.
      for (const piece of cell.split(/(?=[◯○❍※])|\s{2,}|(?<=[함음다]\.)\s+/)) {
        const clause = piece.trim();
        if (!clause) continue;
        // 「1) 강사비」처럼 번호 붙은 짧은 제목은 뒤 조각의 주제가 된다.
        const heading = clause.match(/^\d+\)\s*([^\d].{0,20})$/);
        if (heading) topic = heading[1].trim();
        out.push({ clause, row: cells, label: index > 0 ? cells[0] : null, topic, line });
      }
    });
  }
  return out;
}

const COST_TERM = /([가-힣]{1,8}비)(?=가|는|은|를|을|의|와|과|에서|에|및|\+|,|·|\)|\s|$)/g;
const DENOMINATOR = /((?:총\s*)?[가-힣]*(?:예산|사업비|금액)(?:\s*총액)?)\s*(?:에서|의|대비)/;
const ARTICLE = /제\s*\d+\s*조(?:\s*의\s*\d+)?(?:\s*\([^)]{1,20}\))?/;
const CONDITIONAL = /경우|한하여|단,/;

function readRatioCaps(clauses) {
  const caps = [];
  for (const { clause, line } of clauses) {
    const match = clause.match(/(\d+(?:\.\d+)?)\s*%\s*(이내|이하|미만|를\s*초과|을\s*초과|초과)/);
    if (!match) continue;
    if (!/[가-힣]비(?![율])|비용|예산|사업비|금액/.test(clause)) continue;
    const denominator = clause.slice(0, match.index).match(DENOMINATOR)?.[1]?.replace(/\s+/g, ' ').trim() || null;
    const terms = [...clause.slice(0, match.index).matchAll(COST_TERM)].map(m => m[1])
      .filter(term => !denominator || !denominator.includes(term));
    // 비용 낱말을 못 찾으면 「…에 드는 비용은」처럼 분모 앞까지를 이름으로 쓴다.
    const head = clause.slice(0, denominator ? clause.indexOf(denominator) : match.index);
    caps.push({
      kind: 'ratio-cap',
      what: terms.length ? terms.join('+') : head.replace(/^[\s◯○❍※\-·o]+/, '').replace(/\s*(은|는|이|가)\s*$/, '').trim(),
      terms,
      of: denominator,
      maxPercent: Number(match[1]),
      strict: match[2] === '미만',
      conditional: CONDITIONAL.test(clause),
      article: line.match(ARTICLE)?.[0] || null,
      quote: clause
    });
  }
  return caps;
}

function readPageCaps(clauses) {
  const caps = [];
  for (const { clause, row, label } of clauses) {
    const match = clause.match(/(\d+)\s*(쪽|페이지|page|매|p)\s*(이내|이하)/i);
    if (!match) continue;
    let subject = clause.slice(0, match.index).replace(/^[\s\-·o❍◯○]+/, '').replace(/[:：]\s*$/, '').replace(/A4\s*$/i, '').trim();
    if (!subject || /^A4$/i.test(subject)) subject = (label || row[0] || '').trim();
    subject = subject.replace(/\s+/g, ' ');
    if (!subject) continue;
    const soft = /권장/.test(clause);
    const known = caps.find(cap => squash(cap.subject) === squash(subject) && cap.maxPages === Number(match[1]));
    if (known) { known.quotes.push(clause); known.soft = known.soft && soft; continue; }
    caps.push({ kind: 'page-cap', subject, maxPages: Number(match[1]), soft, quotes: [clause] });
  }
  return caps;
}

function readAmounts(clauses) {
  const amounts = [];
  const caps = [];
  for (const { clause, label, topic } of clauses) {
    for (const match of clause.matchAll(MONEY)) {
      const won = parseWon(match[0]);
      if (!won) continue;
      const after = clause.slice(match.index + match[0].length, match.index + match[0].length + 16);
      const before = clause.slice(0, match.index);
      if (/^\s*(이하|이내|까지|를\s*초과|을\s*초과|초과)/.test(after) || /최대\s*$/.test(before)) {
        caps.push({
          kind: 'amount-cap',
          what: [label, topic].filter(Boolean).join(' · ') || null,
          per: before.match(/(시간당|1회당|회당|1인당|인당|1일|일당|월)\s*(최대\s*)?$/)?.[1] || null,
          maxWon: won,
          conditional: CONDITIONAL.test(clause),
          quote: clause
        });
        continue;
      }
      // 「위탁금액(총액) : 504백만원(…)」처럼 이름 : 금액 꼴만 정해진 금액으로 읽는다.
      const named = before.match(/^[\s\-·o❍◯○\d.)]*([^:：]{2,30}?)\s*[:：]\s*$/);
      if (!named) continue;
      amounts.push({
        kind: 'amount',
        label: named[1].trim(),
        won,
        vatIncluded: /부가가치세\s*포함|VAT\s*포함/i.test(clause) ? true : /부가가치세\s*(별도|제외)/.test(clause) ? false : null,
        period: dates(clause),
        quote: clause
      });
    }
  }
  return { amounts, caps };
}

function readPeriods(clauses) {
  const periods = [];
  for (const { clause } of clauses) {
    const match = clause.match(/((?:사업|계약|협약|운영|교육|위탁)\s*기간)\s*[:：]\s*(.+)/);
    if (!match) continue;
    const found = dates(match[2]);
    if (found.length < 2) continue;
    periods.push({ kind: 'period', label: match[1].replace(/\s+/g, ''), from: found[0], to: found[found.length - 1], years: Number(match[2].match(/\((\d+)\s*년\)/)?.[1]) || null, quote: clause });
  }
  return periods;
}

function readProhibitions(clauses) {
  return clauses
    .filter(({ clause }) => /금액이?\s*(명시|기재|표기)되지\s*않도록|금액을?\s*(명시|기재|표기)하지/.test(clause))
    .map(({ clause }) => ({ kind: 'no-amounts-in-proposal', quote: clause.replace(/^[\s\-·o]+/, '') }));
}

// RFP에서 하드 제약을 읽는다. 금액·기간·쪽수·비율 한도와 「금액을 적지 말 것」 같은 금지 문구다.
export function readConstraints(text) {
  const clauses = clausesOf(text);
  const { amounts, caps: amountCaps } = readAmounts(clauses);
  const periods = readPeriods(clauses);
  const derived = [];
  const checks = [];

  // 총액이 부가가치세를 포함하면 추정가격(부가가치세 제외)은 ÷1.1 이다(국가계약법 시행령 제2조 제1호). RFP 글자에 없으므로 계산값이라고 표시한다.
  const total = amounts.find(amount => /총액|총사업비|위탁금액|사업금액|계약금액/.test(amount.label) && amount.vatIncluded) ||
    amounts.find(amount => /총액|총사업비/.test(amount.label));
  if (total?.vatIncluded) {
    derived.push({ kind: 'estimated-price', label: '추정가격(부가가치세 제외)', won: Math.floor(total.won / 1.1), from: total.label, basis: `${total.label} ${total.won.toLocaleString('ko-KR')}원 ÷ 1.1 — RFP에 직접 적힌 값이 아니라 계산값` });
  }

  // 장기계속 계약: 차수별 금액의 합이 총액과 맞는지 본다.
  const installments = amounts.filter(amount => /장기계속\s*\d+\s*차|\d+\s*차\s*(년도|연도)?/.test(amount.label));
  const longTerm = /장기계속/.test(text) ? {
    kind: 'long-term-contract',
    installments: installments.map(item => ({ label: item.label, won: item.won, period: item.period })),
    years: installments.length || periods[0]?.years || null
  } : null;
  if (longTerm && total && installments.length) {
    const sum = installments.reduce((acc, item) => acc + item.won, 0);
    checks.push({ what: '장기계속 차수별 금액의 합 = 총액', ok: sum === total.won, detail: `${sum.toLocaleString('ko-KR')}원 / ${total.won.toLocaleString('ko-KR')}원` });
  }

  return {
    amounts,
    derived,
    longTerm,
    periods,
    ratioCaps: readRatioCaps(clauses),
    amountCaps,
    pageCaps: readPageCaps(clauses),
    prohibitions: readProhibitions(clauses),
    checks
  };
}

// 공고 하나를 읽는다. 평가표가 있으면 목차를 만들고, 없으면 기존 방식(양식 기반)으로 물러난다.
export function readRfp(text) {
  const evaluation = readEvaluation(text);
  const outline = outlineFromEvaluation(evaluation);
  return {
    evaluation,
    outline,
    fallback: outline ? null : { to: '양식 기반', reason: evaluation.reason || '평가표에서 글로 쓰는 항목을 고르지 못했다' },
    constraints: readConstraints(text)
  };
}

// ---------- 검사 ----------
// 만든 계획서(또는 AI가 쓴 글)를 RFP에서 읽은 제약에 견준다. 어긴 것은 fail, 확인할 것은 warn.
// plan: { budget?: { total, lines: [{ name, won }] }, pages?: { [문서 이름]: 쪽수 }, text?: 본문 }
export function checkPlan(constraints, plan = {}) {
  const results = [];
  const budget = plan.budget;
  if (budget?.total) {
    for (const cap of constraints.ratioCaps) {
      if (!cap.terms.length || cap.conditional) continue;
      const won = budget.lines.filter(line => cap.terms.some(term => line.name.includes(term))).reduce((acc, line) => acc + line.won, 0);
      const percent = (won / budget.total) * 100;
      const ok = cap.strict ? percent < cap.maxPercent : percent <= cap.maxPercent;
      results.push({ level: ok ? 'pass' : 'fail', what: `${cap.what} ${cap.maxPercent}% ${cap.strict ? '미만' : '이내'}${cap.article ? ` (${cap.article})` : ''}`, detail: `${percent.toFixed(1)}% (${won.toLocaleString('ko-KR')}원 / ${budget.total.toLocaleString('ko-KR')}원)` });
    }
    const total = constraints.amounts.find(amount => /총액|총사업비|위탁금액|사업금액/.test(amount.label));
    if (total) results.push({ level: budget.total <= total.won ? 'pass' : 'fail', what: `${total.label} ${total.won.toLocaleString('ko-KR')}원 이하`, detail: `${budget.total.toLocaleString('ko-KR')}원` });
    // 같은 이름의 한도가 여러 개면(사업 유형마다 다른 지원금액 등) 어느 것이 이 계획서에 맞는지 글자만으로는 모른다.
    // 가장 큰 한도를 넘으면 fail, 작은 한도만 넘으면 warn으로 둔다.
    const flat = constraints.amountCaps.filter(cap => !cap.per && !cap.conditional);
    for (const what of new Set(flat.map(cap => cap.what || '신청 금액'))) {
      const limits = [...new Set(flat.filter(cap => (cap.what || '신청 금액') === what).map(cap => cap.maxWon))].sort((a, b) => a - b);
      const won = budget.total;
      const text = limits.map(limit => limit.toLocaleString('ko-KR')).join(' / ');
      const level = won <= limits[0] ? 'pass' : won <= limits[limits.length - 1] ? 'warn' : 'fail';
      results.push({ level, what: `${what} ${text}원 이하${limits.length > 1 ? ' (공고에 한도가 여럿 — 해당 유형 확인)' : ''}`, detail: `${won.toLocaleString('ko-KR')}원` });
    }
  }
  for (const [name, pages] of Object.entries(plan.pages || {})) {
    for (const cap of constraints.pageCaps.filter(cap => squash(cap.subject).includes(squash(name)) || squash(name).includes(squash(cap.subject)))) {
      results.push({ level: pages <= cap.maxPages ? 'pass' : cap.soft ? 'warn' : 'fail', what: `${cap.subject} ${cap.maxPages}쪽 이내${cap.soft ? '(권장)' : ''}`, detail: `${pages}쪽` });
    }
  }
  if (plan.text) {
    const known = new Set([...constraints.amounts.map(a => a.won), ...constraints.derived.map(d => d.won), ...constraints.amountCaps.map(c => c.maxWon)]);
    for (const match of String(plan.text).matchAll(MONEY)) {
      const won = parseWon(match[0]);
      if (!won) continue;
      if (constraints.prohibitions.length) results.push({ level: 'fail', what: '제안서에 금액을 적지 말 것', detail: `본문에 「${match[0].trim()}」` });
      else if (!known.has(won)) results.push({ level: 'warn', what: 'RFP에 없는 금액', detail: `본문에 「${match[0].trim()}」 — 근거를 확인할 것` });
    }
  }
  return results;
}
