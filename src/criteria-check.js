// 절에 붙은 채점 기준마다 본문에 「답한 자리」가 있는지 본다(11-02).
//
// 낱말이 들어 있는지로 세지 않는다 — 낱말만 끼워 넣으면 통과한다.
// 근거(사용자 결정, 11-02): 판정자(작은 모델)가 기준마다 그 기준에 답한 줄을 본문에서 그대로 인용하고,
// 검사가 그 인용을 확인한다.
//   ① 인용이 그 절의 본문에 글자 그대로 있다 — 판정자가 줄을 지어내면 떨어진다.
//   ② 인용이 기준 문장을 되풀이한 줄이 아니다 — 두 글자 조각의 ECHO_SHARE 넘게 기준 문장에서 온 줄은 답으로 치지 않는다.
// 판정자는 기준이 묻는 것을 낱낱(elements)으로 나누고 그것마다 인용한다 — 「A와 B」에서 B만 답하고 넘어가지 못하게(11-02 보정).
// 묻는 것 가운데 하나라도 확인을 통과한 인용이 없으면 fail이고, 어느 기준의 무엇이 비었는지 적는다.
// 「답했다」는 판정자가 선언하지 않는다. 검사가 인용으로 정한다.
// 판정자 호출이 실패해도 막지 않는다 — warn으로 남긴다(대원칙 ②).
import { stripMarks, usageRecord } from './proposal-draft.js';

export const JUDGE_MODEL = 'claude-haiku-5-5';
export const ECHO_SHARE = 0.6;
const MIN_QUOTE = 6;

const squash = value => String(value).replace(/\s+/g, '');
// 줄 앞 기호(o · - ․ ※)와 [제안]/[사실] 표시를 떼고 빈칸을 하나로 — 인용과 본문을 같은 모양으로 견준다.
const plain = value => stripMarks(String(value)).replace(/^\s*(?:o|-|․|※|\*|·|\d+\.)\s+/gm, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

// 괄호 열거 「계획수립(비전, 목표, 연도별 추진방향 등)」의 낱낱.
const enumerated = details => details.flatMap(detail => (String(detail).match(/\(([^)]+)\)/)?.[1] || '').split(',')).map(item => item.replace(/\s*등$/, '').trim()).filter(Boolean);

// 절마다 채점 기준. 평가표에서 그 절에 붙은 줄(scoring)이 기준이다. 절이 없는 단위면 평가내용 큰 줄.
// 괄호 열거의 낱낱이 모두 「같은 줄 — 낱낱」으로 장 안 어딘가에 따로 붙어 있으면 그 원래 줄은 따로 보지 않는다 —
// 읽기(readPlan)가 이미 쪼개 절마다 붙였는데, 원래 줄을 한 절에서 또 보면 「Ⅰ.3에 비전이 없다」가 된다(11-02 보정).
export function criteriaOf(section) {
  const list = [];
  const parts = section.parts || [{ key: section.key || section.title, title: section.title, scoring: (section.writeWhat || []).map(point => ({ point: point.point, details: point.details || [] })) }];
  const split = new Set(parts.flatMap(part => (part.scoring || []).map(entry => squash(entry.point))));
  for (const part of parts) {
    const seen = new Set();
    for (const entry of part.scoring || []) {
      const items = enumerated(entry.details || []);
      if (items.length && items.every(item => split.has(squash(`${entry.point} — ${item}`)))) continue;
      const text = [entry.point, ...(entry.details || [])].join(' — ');
      if (seen.has(text)) continue;
      seen.add(text);
      // points: 평가표 배점 중 이 절에 붙은 몫(readPlan의 share). fail이면 이만큼이 답 없이 남는다.
      list.push({ id: `${part.key}-${seen.size}`, part: part.key, title: part.title, item: entry.item || null, text, points: entry.share ?? null });
    }
  }
  return list;
}

// 「### 절 이름」 아래 줄을 절마다 모은다(다음 ###까지).
export function partBodies(text, section) {
  const blocks = [];
  let current = null;
  for (const line of String(text).split('\n')) {
    const heading = line.match(/^#{3}\s+(.*)$/);
    if (heading) { current = { heading: heading[1], lines: [] }; blocks.push(current); continue; }
    if (current && line.trim() && !/^#/.test(line)) current.lines.push(line);
  }
  const parts = section.parts || [{ key: section.key || section.title, title: section.title }];
  const bodies = {};
  for (const part of parts) {
    const found = section.parts ? blocks.find(block => squash(block.heading).includes(squash(part.title))) : { lines: String(text).split('\n').filter(line => line.trim() && !/^#/.test(line)) };
    bodies[part.key] = found ? found.lines : [];
  }
  return bodies;
}

const bigrams = value => {
  const chars = [...String(value).replace(/[^\p{L}\p{N}]/gu, '')];
  return chars.slice(1).map((char, index) => chars[index] + char);
};
// 인용의 두 글자 조각 중 기준 문장에도 있는 것의 몫. 높으면 기준을 되풀이한 줄이다.
export function echoShare(quote, criterion) {
  const own = bigrams(quote);
  if (!own.length) return 1;
  const theirs = new Set(bigrams(criterion));
  return own.filter(pair => theirs.has(pair)).length / own.length;
}

// 공고(협약서 포함)를 옮긴 사실 줄 — 출처 표시가 「[사실: 기관 자료]」가 아닌 「[사실: …]」.
// 공고가 정한 것을 되옮긴 줄은 공고의 말이지 제안자의 답이 아니다(11-02 보정: low의 「부합성」을 협약서 의무 줄로 통과시켰다).
export const restatesNotice = line => /\[사실:(?!\s*기관 자료)[^\]]*\]/.test(line);

// 판정자의 인용 하나를 확인한다. 이유가 있으면 통과 못 한 것.
export function quoteProblem(quote, lines, criterion) {
  const q = plain(quote);
  if (q.length < MIN_QUOTE) return '인용이 너무 짧다';
  const found = lines.filter(line => plain(line).includes(q));
  if (!found.length) return '본문에 없는 줄';
  if (found.every(restatesNotice)) return '공고를 옮긴 줄';
  if (echoShare(q, criterion) > ECHO_SHARE) return '기준 문장을 되풀이한 줄';
  return null;
}

export function judgePrompt(section, criteria, bodies) {
  const system = [
    '너는 공공 제안서를 평가표 옆에 두고 읽는 검토자다. 채점 기준마다, 그 절의 본문에서 그 기준이 묻는 것에 실제로 답한 줄을 고른다.',
    '',
    '- 답한 줄: 기준이 묻는 것에 대해 이 사업의 구체적인 내용(무엇을, 어떻게, 언제, 무엇으로 확인하는지)을 적은 줄.',
    '- 기준의 낱말을 되풀이하기만 하고 내용이 없는 줄은 답이 아니다.',
    '- 「[사실: 공고 …]」「[사실: 협약서 …]」처럼 공고가 정한 것을 옮긴 줄은 답이 아니다. 제안자가 그것을 어떻게 하겠다는 줄을 찾는다. 「[사실: 기관 자료]」 줄은 답이 될 수 있다.',
    '- 「[확인 필요: …]」는 기관이 나중에 채울 값이다. 값이 비어 있어도 무엇을 재고 어떻게 확인하는지가 적혀 있으면 답한 줄이다. 값이 비었다는 이유로 답이 없다고 하지 않는다.',
    '- 먼저 기준이 묻는 것을 낱낱으로 나눠 elements에 하나씩 적는다(예: 「A의 B와 C의 D」면 「A의 B」와 「C의 D」 둘). 묻는 것이 하나면 하나만.',
    '- asks에는 기준 글자에서 그 부분을 한 글자도 바꾸지 않고 잘라 적는다. 기준에 없는 요구를 더하지 않는다.',
    '- elements마다 그것에 답한 줄을 quotes에 따로 고른다. 다른 element에 답한 줄을 끌어다 채우지 않는다. 없으면 빈 배열로 두고 missing에 무엇이 없는지 적는다.',
    '- quotes에는 본문 줄을 한 글자도 바꾸지 않고 옮긴다. 본문에 없는 말을 만들지 않는다.',
    '- 그 기준이 붙은 절의 본문만 본다.'
  ].join('\n');
  const user = [`장: ${section.title}`, ''];
  for (const part of section.parts || [{ key: section.key || section.title, title: section.title }]) {
    const own = criteria.filter(criterion => criterion.part === part.key);
    if (!own.length) continue;
    user.push(`## 절 ${part.key} ${part.title}`, '기준:', ...own.map(criterion => `- [${criterion.id}] ${criterion.text}`), '본문:', ...(bodies[part.key].length ? bodies[part.key] : ['(본문 없음)']), '');
  }
  return { system, user: user.join('\n') };
}

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          elements: {
            type: 'array',
            items: {
              type: 'object',
              properties: { asks: { type: 'string' }, quotes: { type: 'array', items: { type: 'string' } }, missing: { type: 'string' } },
              required: ['asks', 'quotes', 'missing'],
              additionalProperties: false
            }
          }
        },
        required: ['id', 'elements'],
        additionalProperties: false
      }
    }
  },
  required: ['results'],
  additionalProperties: false
};

// 기준 하나에 대한 판정자의 답에서, 묻는 것(낱낱)마다 확인을 통과한 인용(kept)과 떨어진 인용(dropped)을 가른다.
// 판정자가 이 기준을 빠뜨렸으면 null.
function checkedElements(criterion, bodies, result) {
  if (!result || !result.elements?.length) return null;
  // 「답했다」는 판정자가 말하지 않는다 — 묻는 것마다 확인을 통과한 인용이 있을 때만 검사가 정한다.
  // 묻는 것(asks)은 기준 글자의 한 토막이어야 한다. 판정자가 기준에 없는 요구를 지어내면 그 토막은 버린다.
  // 하나도 남지 않으면 기준 전체를 묻는 것 하나로 보고 모든 인용을 모은다.
  const pieces = result.elements.filter(element => squash(criterion.text).includes(squash(element.asks)));
  const asked = pieces.length ? pieces : [{ asks: criterion.text, quotes: result.elements.flatMap(element => element.quotes), missing: result.elements.map(element => element.missing).filter(Boolean).join(' · ') }];
  return asked.map(element => {
    const checked = element.quotes.map(quote => ({ quote, problem: quoteProblem(quote, bodies[criterion.part] || [], criterion.text) }));
    return { ...element, part: criterion.part, kept: checked.filter(entry => !entry.problem), dropped: checked.filter(entry => entry.problem) };
  });
}

const shortText = text => (text.length > 40 ? text.slice(0, 40) + '…' : text);
const emptyDetail = element => {
  const dropped = element.dropped.map(entry => `「${plain(entry.quote).slice(0, 30)}」 ${entry.problem}`);
  return [`「${element.asks}」에 답한 자리 없음${element.missing ? ` — ${element.missing}` : ''}`, ...dropped].join(' · ');
};

// 판정자의 답을 검사 결과로 바꾼다(돈 안 드는 부분 — 시험이 이것을 못 박는다).
//
// 같은 기준이 한 장의 여러 절에 붙어 있으면 그 절들을 한 묶음으로 본다(11-06, 사용자 결정).
//   근거: 절별 배점은 RFP가 아니라 우리가 나눈 것이다(평가표는 「기획구성 10점」까지만 말한다).
//   심사위원은 장을 읽고 항목으로 채점하므로, 같은 장의 다른 절에서 답했으면 점수는 받는다.
//   fail은 「점수를 못 받는다」는 뜻이어야 한다.
//   → 묻는 것마다 묶음의 어느 절에서든 답한 줄이 있으면 통과이고, 어느 절에서 답했는지 적는다.
//   → 다만 묶음 안에서 답이 하나도 없는 절은 warn — 쪽수만 쓰고 점수는 다른 절이 받는 꼴이라 사람이 「그 절에도 쓸지」 정한다.
// 묶음은 한 장 안에서만이다(criteria는 한 장의 것). 장이 다르면(Ⅱ.2와 Ⅲ.1) 심사위원이 되돌아가 읽지 않으니 각자 답해야 한다.
export function verdicts(criteria, bodies, answer) {
  const byId = new Map((answer?.results || []).map(result => [result.id, result]));
  const groups = new Map();
  for (const criterion of criteria) {
    const key = `${criterion.item ?? ''}|${squash(criterion.text)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(criterion);
  }
  const out = [];
  for (const group of groups.values()) {
    const first = group[0];
    const parts = group.map(criterion => criterion.part);
    const label = `채점 기준 「${parts.join('·')} ${shortText(first.text)}」`;
    const ids = group.map(criterion => criterion.id).join(',');
    const points = group.every(criterion => criterion.points == null) ? null : group.reduce((sum, criterion) => sum + (criterion.points ?? 0), 0);
    const judged = group.map(criterion => ({ criterion, elements: checkedElements(criterion, bodies, byId.get(criterion.id)) }));
    if (group.length === 1) {
      const { elements } = judged[0];
      if (!elements) { out.push({ level: 'fail', what: label, detail: '판정자가 이 기준을 답하지 않음', criterion: ids, points }); continue; }
      const empty = elements.filter(element => !element.kept.length);
      if (!empty.length) out.push({ level: 'pass', what: label, detail: elements.map(element => `${element.asks}: 「${plain(element.kept[0].quote).slice(0, 50)}」`).join(' · '), criterion: ids, points });
      else out.push({ level: 'fail', what: label, detail: empty.map(emptyDetail).join(' / '), criterion: ids, points, empty: empty.map(element => element.asks) });
      continue;
    }
    // 묶음: 절마다 판정자가 나눈 낱낱을 모은다. 낱낱 E는 어느 절에서든 E를 감싸는 낱낱(asks가 E를 품음)에 남은 인용이 있으면 답한 것이다.
    // 감싸는 쪽만 본다 — 「A와 B」에 답한 줄은 「A」에도 답했지만, 「A」에 답한 줄은 「A와 B」에 답하지 않았다.
    const all = judged.flatMap(entry => entry.elements || []);
    const answered = all.filter(element => element.kept.length);
    const asks = [...new Map(all.map(element => [squash(element.asks), element.asks])).values()];
    const rows = asks.map(text => {
      const by = answered.filter(element => squash(element.asks).includes(squash(text)));
      return { asks: text, by, tried: all.filter(element => squash(element.asks) === squash(text) && !element.kept.length) };
    });
    const empty = rows.filter(row => !row.by.length);
    if (!all.length) {
      out.push({ level: 'fail', what: label, detail: '판정자가 이 기준을 답하지 않음', criterion: ids, points, parts });
    } else if (!empty.length) {
      const detail = rows.map(row => `${row.asks}: ${row.by[0].part} 「${plain(row.by[0].kept[0].quote).slice(0, 50)}」`).join(' · ');
      out.push({ level: 'pass', what: label, detail, criterion: ids, points, parts, answeredIn: Object.fromEntries(rows.map(row => [row.asks, [...new Set(row.by.map(element => element.part))]])) });
    } else {
      const detail = empty.map(row => [`「${row.asks}」에 답한 자리 없음(${parts.join('·')} 모두)`, ...row.tried.map(element => `${element.part}: ${emptyDetail(element)}`)].join(' · '));
      out.push({ level: 'fail', what: label, detail: detail.join(' / '), criterion: ids, points, parts, empty: empty.map(row => row.asks) });
    }
    // 절마다, 다른 절에서는 답했는데 이 절에는 답이 없는 낱낱(11-05) — 점수는 받지만 사람이 「이 절에도 쓸지」 정한다.
    // 낱낱마다 따로 내면 쏟아지므로 기준(묶음) 하나에 한 줄로 모은다. warn 개수는 기준 수를 넘지 않는다.
    const gaps = [];
    for (const { criterion, elements } of judged) {
      if (!all.length) break;
      if (!elements) { gaps.push({ part: criterion.part, text: `${criterion.part}은 판정자가 답하지 않음` }); continue; }
      const own = elements.filter(element => element.kept.length);
      const lacking = rows.filter(row => row.by.length && !own.some(element => squash(element.asks).includes(squash(row.asks))));
      if (!lacking.length) continue;
      const elsewhere = [...new Set(lacking.flatMap(row => row.by.map(element => element.part)))].filter(part => part !== criterion.part);
      gaps.push({ part: criterion.part, share: criterion.points, asks: lacking.map(row => row.asks), idle: !own.length,
        text: `${criterion.part}에 ${lacking.map(row => `「${row.asks}」`).join(', ')}의 답이 없다 (${elsewhere.join('·')}에 있음)${own.length ? '' : ' — 이 절은 쪽수만 쓰고 있다'}` });
    }
    if (gaps.length) out.push({ level: 'warn', what: label, detail: gaps.map(gap => gap.text).join(' · '), criterion: ids, gaps });
  }
  return out;
}

// 판정자를 부르고 검사 결과와 비용 기록을 돌려준다.
export async function judgeCriteria({ client, text, section, model = JUDGE_MODEL, krwPerUsd, onUsage, now = () => new Date().toISOString() }) {
  const criteria = criteriaOf(section);
  if (!criteria.length) return [];
  const bodies = partBodies(text, section);
  const { system, user } = judgePrompt(section, criteria, bodies);
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } }
    });
    const record = usageRecord({ at: now(), section: `${section.title} · 채점 기준 검사`, model, message, krwPerUsd });
    record.kind = 'criteria';
    await onUsage?.(record);
    if (message.stop_reason === 'refusal') return [{ level: 'warn', what: '채점 기준 검사 못 함', detail: '판정자가 거절함' }];
    const json = (message.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
    return verdicts(criteria, bodies, JSON.parse(json));
  } catch (error) {
    return [{ level: 'warn', what: '채점 기준 검사 못 함', detail: String(error?.message || error).slice(0, 120) }];
  }
}
