// 제안서 본문 한 절을 AI에게 쓰게 할 때의 규칙·프롬프트·검사·비용(10-05).
//
// AI에게는 규칙만 준다. 견본 계획서(진로설계 등)는 넣지 않는다 — 구조와 어휘를 베껴 와서 어느 기관에나 붙는 글이 된다.
// 숫자는 규칙(RFP에서 읽은 값)과 기관 자료에 있는 것만 쓴다. 없으면 [확인 필요]로 비운다.
// 쓴 글은 검사가 다시 본다: 금액 금지, 출처 없는 숫자, 문단 길이, 평가내용을 빠짐없이 다뤘는지, 역할분장을 지어냈는지.
import { checkPlan } from '../public/rfp/rfp-read.js';

export const MAX_PARAGRAPH = 300;
export const PENDING = '[확인 필요';

// 모델별 단가(달러 / 100만 토큰). 출처: Anthropic 가격표(2026-10 기준). 캐시 쓰기는 입력의 1.25배.
export const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }
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
    '10. 출력은 마크다운 본문만 쓴다. 절 제목(##)으로 시작하고, 앞뒤에 설명이나 인사말을 붙이지 않는다.'
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

export function prohibitionLines(constraints) {
  return constraints.prohibitions.map(rule => `- 제안서에 금액을 적지 않는다 (공고: 「${rule.quote}」)`);
}

// 목차표에서 나온 장(절 여럿)의 요청. 절마다 작성내용(목차표)·채점 기준(평가표)·권장 쪽수를 준다.
function unitRequest(unit, plan) {
  const points = list => list.map(point => [`- ${point.point}`, ...point.details.map(detail => `  - ${detail}`)].join('\n'));
  const lines = [
    `이번에 쓸 장: 「${unit.title}」 (붙은 배점 ${unit.score}점${unit.pages ? `, 권장 ${unit.pages}쪽` : ''})`,
    '절마다 소제목(### 절 번호와 이름 그대로)을 하나씩 두고, 그 아래에서 작성내용을 모두 다루고 채점 기준에 답한다.'
  ];
  for (const part of unit.parts) {
    lines.push('', `### ${part.key} ${part.title}${part.pages ? ` (권장 ${part.pages.value}쪽)` : ''}`);
    lines.push('작성내용(공고 목차표):', ...(part.writeWhat.length ? points(part.writeWhat) : ['- (목차표에 적힌 내용 없음)']));
    lines.push('채점 기준(평가표):', ...(part.scoring.length
      ? part.scoring.map(entry => `- [${entry.item}${entry.role === '부차' ? ' · 부차(본진은 다른 절 — 여기서는 이 절의 맥락에 걸치는 만큼만)' : ''}] ${entry.point}${entry.details.length ? ` — ${entry.details.join(' / ')}` : ''}`)
      : ['- (이 절에 직접 붙은 평가 항목 없음 — 작성내용을 따른다)']));
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
    ...(prohibitionLines(constraints).length ? prohibitionLines(constraints) : ['- 없음']),
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
  for (const quantity of quantitiesOf(text.replace(/\[확인 필요[^\]]*\]/g, ''))) {
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
  for (const paragraph of text.split(/\n\s*\n/).map(part => part.trim()).filter(part => part && !/^#/.test(part))) {
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

  const pending = (text.match(/\[확인 필요[^\]]*\]/g) || []);
  results.push({ level: pending.length ? 'warn' : 'pass', what: `비워 둔 곳 ${pending.length}곳`, detail: pending.slice(0, 20).join(' · ') });
  return results;
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
    iterations: usage.iterations || null,
    usd: cost.usd,
    krw: cost.krw,
    krw_per_usd: krwPerUsd,
    unknown_price_models: cost.unknownModels
  };
}

export function textOf(message) {
  return (message.content || []).filter(block => block.type === 'text').map(block => block.text).join('').trim();
}

// 한 절을 쓴다. client는 Anthropic SDK 클라이언트(시험에서는 가짜)다. 호출이 끝나면 곧바로 onUsage로 기록을 넘긴다.
export async function draftSection({ client, model, effort = 'high', rfpText, facts, project, section, constraints, plan = null, onUsage, krwPerUsd, now = () => new Date().toISOString() }) {
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
  await onUsage?.(record);
  if (message.stop_reason === 'refusal') return { text: '', record, refused: true, checks: [{ level: 'fail', what: '모델이 쓰기를 거절함', detail: JSON.stringify(message.stop_details || null) }] };
  const text = textOf(message);
  const checks = checkDraft(text, { constraints, section, sources: [rfpText, ...facts.map(fact => fact.text)], project });
  if (message.stop_reason === 'max_tokens') checks.unshift({ level: 'fail', what: '출력이 잘림(max_tokens)', detail: '' });
  return { text, record, checks };
}
