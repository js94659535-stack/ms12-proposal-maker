// 제안서 본문 한 절을 AI에게 쓰게 할 때의 규칙·프롬프트·검사·비용(10-05).
//
// AI에게는 규칙만 준다. 견본 계획서(진로설계 등)는 넣지 않는다 — 구조와 어휘를 베껴 와서 어느 기관에나 붙는 글이 된다.
// 숫자는 규칙(RFP에서 읽은 값)과 기관 자료에 있는 것만 쓴다. 없으면 [확인 필요]로 비운다.
// 쓴 글은 검사가 다시 본다: 금액 금지, 출처 없는 숫자, 문단 길이, 평가내용을 빠짐없이 다뤘는지, 역할분장을 지어냈는지.
import { checkPlan } from '../public/rfp/rfp-read.js';
import { LAYOUT, estimatePages } from './page-estimate.js';
import { PENDING } from '../public/plan/workspace.js';
import { judgeCriteria } from './criteria-check.js';

export const MAX_PARAGRAPH = 300;
export { PENDING };
// 줄마다 붙이는 출처 표시(10-07). 사장이 「고를 것(제안)」과 「확인된 것(사실)」을 가려 보게 한다. 제출본에서는 지운다.
export const MARK_PROPOSAL = '[제안]';
export const MARK_FACT = '[사실:';
const MARK = /\[(?:제안|사실:[^\]]*)\]\s*/g;
export const stripMarks = text => String(text).replace(MARK, '');

// 모델별 단가(달러 / 100만 토큰). 출처: Anthropic 가격표(2026-10 기준). 캐시 쓰기는 입력의 1.25배.
export const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  // 채점 기준 판정자(11-02). 입력·출력은 가격표(10만 토큰 이하 프롬프트). 캐시는 쓰지 않아 캐시 칸은 셈한 값(입력의 1.25배·0.1배).
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 }
};

export function systemPrompt({ maxParagraph = MAX_PARAGRAPH } = {}) {
  return [
    '너는 공공 입찰 제안서의 한 절을 쓰는 사람이다. 평가위원이 평가표를 옆에 두고 읽는다.',
    '',
    '지킬 것:',
    '1. 사실은 함께 준 「기관 자료」와 「공고 원문」에 있는 것만 쓴다. 기관이 가진 인력·실적·시설·협약·인증은 기관 자료에 있을 때만 쓴다.',
    `2. 자료에 없는 사실·숫자(인원, 횟수, 목표치, 날짜, 기관 이름)는 지어내지 말고 「${PENDING}: 무엇이 필요한지]」로 비워 둔다. 목표 인원이나 횟수도 자료에 없으면 비워 둔다.`,
    '3. 숫자는 「규칙이 정한 숫자」 목록과 공고 원문·기관 자료에 나온 것만 쓴다.',
    '4. 「금지」 목록에 있는 것은 쓰지 않는다. 금액 표기가 금지되어 있으면 금액을 한 번도 적지 않는다.',
    '5. 공동수급체 구성사의 역할분장은 사람이 정한다. 구성사 이름은 적어도 되지만 누가 무엇을 맡는지는 쓰지 말고 비워 둔다.',
    '6. 소제목은 요청에 적힌 대로 둔다(절마다 「### 절 번호와 이름」, 또는 평가내용 큰 줄마다 「### 큰 줄 글자 그대로」). 그 아래에서 작성내용을 모두 다루고 채점 기준에 답한다. 작은 줄(-)도 빠뜨리지 않는다.',
    '7. 활동·프로그램은 한 줄에 「활동 → 하는 일 → 결과물」 형식으로 쓴다. 결과물은 눈으로 확인할 수 있는 것(기록지, 보고서, 설문 결과 등)이다.',
    `8. 한 문단은 ${maxParagraph}자를 넘기지 않는다. 꾸밈말과 일반론(「~가 중요하다」「~에 기여할 것이다」)보다 이 공고·이 기관에만 맞는 내용을 쓴다.`,
    '9. 공고가 평가 우대·필수로 적은 것이 이 절과 관련 있으면 반드시 다룬다.',
    '10. 출력은 마크다운 본문만 쓴다. 절 제목(##)으로 시작하고, 앞뒤에 설명이나 인사말을 붙이지 않는다.',
    `11. 분량: 절마다 적힌 권장 쪽수를 넘기지 않는다. 제출 서식(본문 ${LAYOUT.bodyPt}pt, 줄 간격 160%, A4)에서 한 쪽은 ${LAYOUT.linesPerPage}줄, 한 줄은 한글 ${LAYOUT.perLine}자다. 문단은 끝 줄이 덜 차도 한 줄을 다 먹고, 빈 줄·소제목도 한 줄씩 먹는다. 표는 칸이 좁아 같은 글자가 더 많은 줄을 먹는다. 쪽수 안에 못 담으면 평가에 덜 중요한 것부터 뺀다.`,
    `12. 「o」「-」「․」「※」로 시작하는 줄과 표의 각 줄(머리 줄 제외)은 맨 앞에 출처 표시를 하나 붙인다.`,
    `    - 「${MARK_FACT} 기관 자료]」: 기관 자료(연혁 등)에 있는 실적·인력·자격·검사·시설. 「${MARK_FACT} 공고 …]」: 공고 원문이 정한 것(목적, 보고 기한, 조항 등). 출처 칸에 조항이나 자료 이름을 짧게 적는다.`,
    `    - 「${MARK_PROPOSAL}」: 우리가 새로 내놓는 것 — 비전 문구, 목표와 지표, 전략, 신규 프로그램, 일정 계획, 해석.`,
    '    - 사실과 제안이 한 줄에 섞이면 두 줄로 나눈다. 표에서는 첫 칸 맨 앞에 붙인다. 소제목(#)에는 붙이지 않는다.'
  ].join('\n');
}

// 규칙이 정한 숫자(RFP에서 읽은 값)를 AI가 그대로 받아 쓰도록 목록으로 만든다.
export function ruleLines(constraints) {
  const won = value => `${value.toLocaleString('ko-KR')}원`;
  const lines = [];
  // 금액 표기가 금지된 공고에서는 금액을 「쓸 숫자」로 주지 않는다(검사는 금액이 하나라도 나오면 fail).
  const amountsAllowed = !constraints.prohibitions.length;
  if (amountsAllowed) {
    for (const amount of constraints.amounts) lines.push(`- ${amount.label}: ${won(amount.won)}${amount.vatIncluded ? '(부가가치세 포함)' : ''}`);
    for (const item of constraints.derived) lines.push(`- ${item.label}: ${won(item.won)} (계산값)`);
  }
  for (const period of constraints.periods) lines.push(`- ${period.label}: ${period.from} ~ ${period.to}${period.years ? ` (${period.years}년)` : ''}`);
  if (constraints.longTerm) lines.push(`- 장기계속 계약 ${constraints.longTerm.years ?? ''}년${amountsAllowed ? `: ${constraints.longTerm.installments.map(item => `${item.label} ${won(item.won)}`).join(', ')}` : ` (차수 ${constraints.longTerm.installments.length}개)`}`);
  for (const cap of constraints.ratioCaps) lines.push(`- ${cap.what}: ${cap.of ? `${cap.of}의 ` : ''}${cap.maxPercent}% ${cap.strict ? '미만' : '이내'}${cap.article ? ` (${cap.article})` : ''}`);
  for (const cap of constraints.pageCaps) lines.push(`- ${cap.subject}: ${cap.maxPages}쪽 이내${cap.soft ? '(권장)' : ''}`);
  return lines;
}

export function prohibitionLines(constraints, project = {}) {
  return [
    ...constraints.prohibitions.map(rule => `- 제안서에 금액을 적지 않는다 (공고: 「${rule.quote}」)`),
    // 사람이 정한 「쓰지 말 것」(project.json의 omit). 공고 규칙이 아니라 기관의 결정이다.
    ...(project?.omit || []).map(rule => `- 쓰지 않는다: ${rule.what} (기관 결정${rule.why ? `: ${rule.why}` : ''})`)
  ];
}

const budget = pages => `권장 ${pages}쪽 = 약 ${Math.round(pages * LAYOUT.linesPerPage)}줄`;

// 목차표에서 나온 장(절 여럿)의 요청. 절마다 작성내용(목차표)·채점 기준(평가표)·권장 쪽수를 준다.
function unitRequest(unit, plan) {
  const points = list => list.map(point => [`- ${point.point}`, ...point.details.map(detail => `  - ${detail}`)].join('\n'));
  const lines = [
    `이번에 쓸 장: 「${unit.title}」 (붙은 배점 ${unit.score}점${unit.pages ? `, ${budget(unit.pages)}` : ''})`,
    '절마다 소제목(### 절 번호와 이름 그대로)을 하나씩 두고, 그 아래에서 작성내용을 모두 다루고 채점 기준에 답한다.',
    ...(unit.pages ? [`분량은 검사가 쪽수로 다시 센다. 절마다 적힌 줄 수를 넘기면 그 절은 탈락으로 본다. 장 제목 줄도 장 분량에 든다.`] : [])
  ];
  for (const part of unit.parts) {
    lines.push('', `### ${part.key} ${part.title}${part.pages ? ` (${budget(part.pages.value)})` : ''}`);
    lines.push('작성내용(공고 목차표):', ...(part.writeWhat.length ? points(part.writeWhat) : ['- (목차표에 적힌 내용 없음)']));
    lines.push('채점 기준(평가표):', ...(part.scoring.length
      ? part.scoring.map(entry => `- [${entry.item}${entry.role === '부차' ? ' · 부차(본진은 다른 절 — 여기서는 이 절의 맥락에 걸치는 만큼만)' : ''}] ${entry.point}${entry.details.length ? ` — ${entry.details.join(' / ')}` : ''}`)
      : ['- (이 절에 직접 붙은 평가 항목 없음 — 작성내용을 따른다)']));
    // 공고와 맞대기(project.json pair, 사람이 정함 — 11-05): 공고 대목의 항목마다 우리 제안을 한 줄씩 맞댄다.
    if (part.pair?.found) {
      lines.push(`공고 「${part.pair.notice}」와 맞대기(기관 결정): 이 절에 아래 항목마다 줄 하나씩 — 「${MARK_PROPOSAL} 공고 항목 → 우리가 하는 일(어느 절의 무엇)」. 하나도 빠뜨리지 않는다.`);
      lines.push(...(part.pair.items.length ? part.pair.items.map((item, index) => `  ${index + 1}) ${item}`) : part.pair.excerpt.map(line => `  | ${line}`)));
    }
    // 동점 우선순위는 공고에서 온 순서다. 분량을 늘리지 않고, 말로 힘을 더 주게 한다.
    for (const entry of part.priority || []) lines.push(`※ 이 절에는 동점 시 ${entry.rank}순위로 보는 항목(${entry.item})이 붙어 있다. 권장 쪽수 안에서 이 항목을 가장 구체적으로 쓴다.`);
  }
  if (plan?.crossCutting?.length) lines.push('', '전체에 걸친 채점 기준(특정 절에 붙지 않음):', ...plan.crossCutting.map(entry => `- [${entry.item}] ${entry.point}`));
  if (plan?.priority) lines.push('', `동점일 때 우선 보는 항목(공고): ${plan.priority.order.map(entry => entry.name).join(' → ')}`);
  const styles = plan?.format?.styles || [];
  if (styles.length) lines.push('', `제출 형식(공고 표준 서식): ${styles.map(style => `「${style.marker}」 ${style.size}pt ${style.font}`).join(', ')}. 본문 글머리는 이 순서(큰 것→작은 것)를 따른다.`);
  return lines.join('\n');
}

// 공고 원문과 기관 자료는 절이 바뀌어도 같으므로 앞에 두고 캐시한다. 절마다 바뀌는 요청은 맨 뒤에 둔다.
export function userContent({ rfpText, facts, project, section, constraints, preferences = [], plan = null }) {
  const partners = (project?.partners || []).map(partner => partner.name || `${partner.kind || '구성사'}(이름 ${PENDING}])`);
  const shared = [
    '<공고 원문>', rfpText, '</공고 원문>',
    '',
    '<기관 자료>',
    `주관기관: ${project?.lead || PENDING + ']'}`,
    `공동수급 구성사: ${partners.length ? partners.join(', ') : '없음'}`,
    `역할분장: ${PENDING}: 사람이 정함]`,
    ...facts.map(fact => `\n[자료: ${fact.source}]\n${fact.text}`),
    '</기관 자료>'
  ].join('\n');
  const request = [
    ...(section.parts ? [unitRequest(section, plan)] : [
      `이번에 쓸 절: 「${section.title}」 (배점 ${section.score}점)`,
      '',
      '평가내용(이 절을 채점하는 기준):',
      ...section.writeWhat.map(point => [`- ${point.point}`, ...point.details.map(detail => `  - ${detail}`)].join('\n'))
    ]),
    '',
    '규칙이 정한 숫자:',
    ...(ruleLines(constraints).length ? ruleLines(constraints) : ['- 없음']),
    '',
    '금지:',
    ...(prohibitionLines(constraints, project).length ? prohibitionLines(constraints, project) : ['- 없음']),
    ...(preferences.length ? ['', '공고가 평가 우대로 적은 것:', ...preferences.map(line => `- ${line}`)] : [])
  ].join('\n');
  return [
    { type: 'text', text: shared, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: request }
  ];
}

// 공고 글자에서 「평가 우대」 문장을 그대로 뽑는다.
export function preferenceLines(rfpText) {
  return [...new Set(String(rfpText).split(/\r?\n/).map(line => line.replace(/^[\s※*\-o]+/, '').trim()).filter(line => /평가\s*우대|(?<!평)가점/.test(line)))];
}

// ---------- 검사 ----------
const QUANTITY = /(\d[\d,]*(?:\.\d+)?)\s*(명|회|%|퍼센트|개소|개|곳|년|개월|시간|쪽|건|차시|차|점|세|주|일|가구|팀|종|권|부|회기)/g;
const normalize = value => String(Number(String(value).replace(/,/g, '')));

export function quantitiesOf(text) {
  return [...String(text).matchAll(QUANTITY)].map(match => ({ raw: match[0], number: normalize(match[1]), unit: match[2] }));
}

// 쓴 글을 규칙과 자료에 견준다. level: fail(어김) · warn(사람이 볼 것) · pass
export function checkDraft(text, { constraints, section, sources, project }) {
  const results = [];
  for (const result of checkPlan(constraints, { text })) results.push(result);

  // 출처 없는 숫자: 공고 원문·기관 자료·규칙 어디에도 없는 「숫자+단위」
  const known = new Set();
  for (const source of sources) for (const quantity of quantitiesOf(source)) known.add(`${quantity.number}${quantity.unit}`);
  for (const line of ruleLines(constraints)) for (const quantity of quantitiesOf(line)) known.add(`${quantity.number}${quantity.unit}`);
  const sourceNumbers = new Set(sources.flatMap(source => [...String(source).matchAll(/\d[\d,]*/g)].map(m => normalize(m[0]))));
  // 소제목 줄(#)은 보지 않는다 — 「### Ⅱ.1 일반 현황」의 「1 일」을 숫자+단위로 읽었다(11-02).
  const body = text.split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
  for (const quantity of quantitiesOf(body.replace(/\[확인 필요[^\]]*\]/g, ''))) {
    if (known.has(`${quantity.number}${quantity.unit}`)) continue;
    // 연도(2027년)·조항 번호처럼 공고에 숫자 자체가 있으면 단위가 달라도 넘긴다.
    if (quantity.unit === '년' && sourceNumbers.has(quantity.number)) continue;
    results.push({ level: 'fail', what: '출처 없는 숫자', detail: `「${quantity.raw}」 — 공고·기관 자료·규칙에 없다` });
  }

  // 소제목: 장 단위면 절 이름마다, 평가 항목 단위면 평가내용의 큰 줄마다 하나씩 있어야 한다.
  const headings = text.split('\n').filter(line => /^#{2,4}\s/.test(line)).map(line => line.replace(/^#+\s*/, '').replace(/\s+/g, ''));
  const required = section.parts
    ? section.parts.map(part => ({ key: part.title, label: `절 「${part.key} ${part.title}」 소제목` }))
    : section.writeWhat.map(point => ({ key: point.point, label: `평가내용 「${point.point}」 소제목` }));
  for (const need of required) {
    results.push({ level: headings.some(heading => heading.includes(need.key.replace(/\s+/g, ''))) ? 'pass' : 'fail', what: need.label, detail: '' });
  }

  // 문단 길이
  for (const paragraph of stripMarks(text).split(/\n\s*\n/).map(part => part.trim()).filter(part => part && !/^#/.test(part))) {
    for (const block of paragraph.split('\n').filter(line => !/^\s*[-*|]/.test(line))) {
      if (block.length > MAX_PARAGRAPH) results.push({ level: 'warn', what: `문단 ${MAX_PARAGRAPH}자 넘음`, detail: `${block.length}자 — 「${block.slice(0, 30)}…」` });
    }
  }

  // 공동수급 구성사의 역할을 지어냈는가: 구성사 이름이 나온 문장에 「담당·맡·운영·수행」이 있으면 사람이 본다.
  for (const partner of (project?.partners || []).map(item => item.name).filter(Boolean)) {
    for (const sentence of text.split(/(?<=[.다])\s+|\n/)) {
      if (sentence.includes(partner) && /담당|맡|운영|수행|전담|주관/.test(sentence) && !sentence.includes(PENDING)) {
        results.push({ level: 'warn', what: '구성사 역할을 적은 문장', detail: `「${sentence.trim().slice(0, 60)}」 — 역할분장은 사람이 정한다` });
      }
    }
  }

  results.push(...checkPages(text, section));
  results.push(...checkMarks(text));

  // 기관이 「쓰지 말라」고 정한 것(project.json의 omit: { what, pattern })
  for (const rule of project?.omit || []) {
    const hits = stripMarks(text).split('\n').filter(line => new RegExp(rule.pattern).test(line));
    results.push({ level: hits.length ? 'fail' : 'pass', what: `쓰지 말 것: ${rule.what}`, detail: hits.map(line => `「${line.trim().slice(0, 60)}」`).join(' · ') });
  }

  const pending = (text.match(/\[확인 필요[^\]]*\]/g) || []);
  results.push({ level: pending.length ? 'warn' : 'pass', what: `비워 둔 곳 ${pending.length}곳`, detail: pending.slice(0, 20).join(' · ') });
  return results;
}

// 분량: 출처 표시를 지운 제출본을 한글 실측 셈법(page-estimate.js)으로 쪽수로 바꿔 절·장의 권장 쪽수와 견준다. 넘으면 fail.
export function checkPages(text, section) {
  if (!section?.parts) return [];
  const estimate = estimatePages(stripMarks(text));
  const squash = value => String(value).replace(/\s+/g, '');
  const results = [];
  for (const part of section.parts) {
    if (!part.pages) continue;
    const found = estimate.parts.find(entry => entry.heading && squash(entry.heading).includes(squash(part.title)));
    if (!found) continue; // 소제목이 없으면 소제목 검사가 이미 fail
    const limit = part.pages.value;
    results.push({
      level: found.pages > limit ? 'fail' : 'pass',
      what: `분량 「${part.key} ${part.title}」 ${found.pages}쪽 / 권장 ${limit}쪽`,
      detail: `${found.lines}줄 (한 쪽 ${LAYOUT.linesPerPage}줄, 한 줄 한글 ${LAYOUT.perLine}자), 글자 ${found.chars}자`
    });
  }
  if (section.pages) {
    results.push({
      level: estimate.pages > section.pages ? 'fail' : 'pass',
      what: `분량 「${section.title}」 전체 ${estimate.pages}쪽 / 권장 ${section.pages}쪽`,
      detail: `${estimate.lines}줄, 글자 ${estimate.chars}자 — ${LAYOUT.basis}`
    });
  }
  return results;
}

// 줄마다 [제안] / [사실: 출처]가 붙었는가. 안 붙은 줄은 사장이 고를 수 없으므로 fail.
const MARKED_LINE = /^\s*(?:o|-|․|※|\*|·)\s+/;
export function checkMarks(text) {
  const lines = String(text).split('\n');
  const missing = [];
  let tableRow = 0;
  for (const line of lines) {
    if (/^\s*\|/.test(line)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
      tableRow += 1;
      if (tableRow === 1) continue; // 머리 줄
      const first = line.trim().replace(/^\|/, '').split('|')[0].replace(/\*\*/g, '').trim();
      if (!/^\[(?:제안|사실:[^\]]*)\]/.test(first)) missing.push(line.trim());
      continue;
    }
    tableRow = 0;
    if (!MARKED_LINE.test(line)) continue;
    const rest = line.replace(MARKED_LINE, '').replace(/^\*\*/, '');
    if (!/^\[(?:제안|사실:[^\]]*)\]/.test(rest)) missing.push(line.trim());
  }
  const proposals = (text.match(/\[제안\]/g) || []).length;
  const facts = (text.match(/\[사실:[^\]]*\]/g) || []).length;
  return [{
    level: missing.length ? 'fail' : 'pass',
    what: `제안·사실 표시 — 제안 ${proposals}줄, 사실 ${facts}줄, 표시 없음 ${missing.length}줄`,
    detail: missing.slice(0, 10).map(line => `「${line.slice(0, 50)}」`).join(' · ')
  }];
}

// 사장이 고를 목록: [제안] 줄을 절마다 모은다. 사실 줄은 출처별로 센다.
export function choiceSheet(text, title = '') {
  const out = [`# 고를 것 — ${title}`, '', '「[제안]」은 우리가 새로 내놓는 것이다. 쓸 것에 표시한다. 「[사실]」 줄은 자료에서 온 것이라 목록에 넣지 않았다(초안에서 확인).', ''];
  let heading = '';
  for (const line of String(text).split('\n')) {
    const h = line.match(/^#{2,4}\s+(.*)/);
    if (h) { heading = h[1]; out.push(`## ${heading}`); continue; }
    if (line.includes(MARK_PROPOSAL)) {
      const body = line.trim().replace(/^\|/, '').replace(/\|$/, '').replace(MARKED_LINE, '').replace(/\*\*/g, '').replace('[제안]', '').replace(/\s*\|\s*/g, ' | ').trim();
      out.push(`- [ ] ${body}`);
    }
  }
  return out.filter((line, index, all) => !(line.startsWith('## ') && (!all[index + 1] || all[index + 1].startsWith('## ')))).join('\n');
}

// ---------- 비용 ----------
// 한 번의 호출(또는 fallback이 끼면 시도마다)을 원화로 셈한다. 단가를 모르는 모델이면 null로 두고 숨기지 않는다.
export function costOf(usage, model, krwPerUsd) {
  const attempts = Array.isArray(usage?.iterations) && usage.iterations.length
    ? usage.iterations.map(entry => ({ model: entry.model || model, usage: entry }))
    : [{ model, usage }];
  let usd = 0;
  const unknown = [];
  for (const attempt of attempts) {
    const price = PRICES[attempt.model];
    if (!price) { unknown.push(attempt.model); continue; }
    const u = attempt.usage || {};
    usd += ((u.input_tokens || 0) * price.input + (u.output_tokens || 0) * price.output +
      (u.cache_creation_input_tokens || 0) * price.cacheWrite + (u.cache_read_input_tokens || 0) * price.cacheRead) / 1e6;
  }
  return { usd: unknown.length ? null : usd, krw: unknown.length ? null : Math.round(usd * krwPerUsd), unknownModels: unknown };
}

// 토큰 기록 한 줄. prompt_tokens = 캐시 안 된 입력 + 캐시 쓰기 + 캐시 읽기, completion_tokens = 출력.
// fallback이 끼면 top-level usage는 마지막 시도만 담는다. 시도별 기록(iterations)이 있으면 그것을 더한다.
export function usageRecord({ at, section, model, message, krwPerUsd }) {
  const usage = message.usage || {};
  const parts = Array.isArray(usage.iterations) && usage.iterations.length ? usage.iterations : [usage];
  const sum = key => parts.reduce((acc, part) => acc + (part[key] || 0), 0);
  const cost = costOf(usage, model, krwPerUsd);
  return {
    at,
    section,
    requested_model: model,
    model: message.model || model,
    stop_reason: message.stop_reason,
    prompt_tokens: sum('input_tokens') + sum('cache_creation_input_tokens') + sum('cache_read_input_tokens'),
    completion_tokens: sum('output_tokens'),
    input_tokens: sum('input_tokens'),
    cache_creation_input_tokens: sum('cache_creation_input_tokens'),
    cache_read_input_tokens: sum('cache_read_input_tokens'),
    output_tokens: sum('output_tokens'),
    // 생각 토큰(10-08). API가 usage.output_tokens_details.thinking_tokens로 따로 준다(출력 토큰 안에 들어 있고 단가도 같다).
    // 시도마다 있으면 더하고, 어디에도 없으면 null로 둔다(0으로 지어내지 않는다).
    thinking_tokens: thinkingTokens(usage, parts),
    // 응답에 온 thinking 블록. Opus 5.5는 기본이 display "omitted"라 블록은 와도 글은 빈 문자열이다 — 길이로는 셀 수 없다.
    thinking_blocks: (message.content || []).filter(block => block.type === 'thinking').length,
    thinking_chars: (message.content || []).filter(block => block.type === 'thinking').reduce((acc, block) => acc + (block.thinking || '').length, 0),
    iterations: usage.iterations || null,
    usd: cost.usd,
    krw: cost.krw,
    krw_per_usd: krwPerUsd,
    unknown_price_models: cost.unknownModels
  };
}

function thinkingTokens(usage, parts) {
  const of = part => part?.output_tokens_details?.thinking_tokens;
  if (parts.some(part => typeof of(part) === 'number')) return parts.reduce((acc, part) => acc + (of(part) || 0), 0);
  return typeof of(usage) === 'number' ? of(usage) : null;
}

// 본문 글이 몇 토큰인지 토큰 세기 API(무료)로 잰다. 「출력 − 본문」이 생각 토큰의 어림이다 — API 칸과 맞춰 보는 데 쓴다.
// 빈 메시지는 못 세므로 「.」 하나의 값을 빼서 메시지 틀 몫을 지운다. 세기에 실패해도 초안은 그대로 둔다.
export async function countTextTokens(client, model, text) {
  if (!client?.beta?.messages?.countTokens || !text) return null;
  try {
    const of = async content => (await client.beta.messages.countTokens({ model, messages: [{ role: 'user', content }] })).input_tokens;
    return (await of(text)) - (await of('.'));
  } catch { return null; }
}

export function textOf(message) {
  return (message.content || []).filter(block => block.type === 'text').map(block => block.text).join('').trim();
}

// 한 절을 쓴다. client는 Anthropic SDK 클라이언트(시험에서는 가짜)다. 호출이 끝나면 곧바로 onUsage로 기록을 넘긴다.
// 생성 effort 기본값. Opus 5.5는 생각 예산을 토큰 수로 받지 않는다 — budget_tokens는 400,
// task_budget은 최소 20,000(medium 출력 전체 16,383보다 큼)이라 400(11-02 확인). low는 내용이 빠졌다(11-01) → medium.
export const DEFAULT_EFFORT = 'medium';

// judge: 채점 기준마다 답한 자리가 있는지 판정자를 불러 본다(criteria-check.js). 끄려면 false.
export async function draftSection({ client, model, effort = DEFAULT_EFFORT, rfpText, facts, project, section, constraints, plan = null, onUsage, krwPerUsd, judge = true, now = () => new Date().toISOString() }) {
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort },
    system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent({ rfpText, facts, project, section, constraints, plan, preferences: preferenceLines(rfpText) }) }]
  });
  const message = await stream.finalMessage();
  const record = usageRecord({ at: now(), section: section.title, model, message, krwPerUsd });
  record.effort = effort;
  record.text_chars = textOf(message).length;
  record.text_tokens = await countTextTokens(client, model, textOf(message));
  record.thinking_estimate = record.text_tokens == null ? null : record.output_tokens - record.text_tokens;
  await onUsage?.(record);
  if (message.stop_reason === 'refusal') return { text: '', record, refused: true, checks: [{ level: 'fail', what: '모델이 쓰기를 거절함', detail: JSON.stringify(message.stop_details || null) }] };
  const text = textOf(message);
  const checks = checkDraft(text, { constraints, section, sources: [rfpText, ...facts.map(fact => fact.text)], project });
  if (message.stop_reason === 'max_tokens') checks.unshift({ level: 'fail', what: '출력이 잘림(max_tokens)', detail: '' });
  if (judge) checks.push(...await judgeCriteria({ client, text, section, krwPerUsd, onUsage, now }));
  return { text, record, checks };
}
