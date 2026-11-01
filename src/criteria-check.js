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
      list.push({ id: `${part.key}-${seen.size}`, part: part.key, title: part.title, item: entry.item || null, text });
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

// 판정자의 답을 검사 결과로 바꾼다(돈 안 드는 부분 — 시험이 이것을 못 박는다).
export function verdicts(criteria, bodies, answer) {
  const byId = new Map((answer?.results || []).map(result => [result.id, result]));
  return criteria.map(criterion => {
    const label = `채점 기준 「${criterion.part} ${criterion.text.length > 40 ? criterion.text.slice(0, 40) + '…' : criterion.text}」`;
    const result = byId.get(criterion.id);
    if (!result || !result.elements?.length) return { level: 'fail', what: label, detail: '판정자가 이 기준을 답하지 않음', criterion: criterion.id };
    // 「답했다」는 판정자가 말하지 않는다 — 묻는 것마다 확인을 통과한 인용이 있을 때만 검사가 정한다.
    // 묻는 것(asks)은 기준 글자의 한 토막이어야 한다. 판정자가 기준에 없는 요구를 지어내면 그 토막은 버린다.
    // 하나도 남지 않으면 기준 전체를 묻는 것 하나로 보고 모든 인용을 모은다.
    const pieces = result.elements.filter(element => squash(criterion.text).includes(squash(element.asks)));
    const asked = pieces.length ? pieces : [{ asks: criterion.text, quotes: result.elements.flatMap(element => element.quotes), missing: result.elements.map(element => element.missing).filter(Boolean).join(' · ') }];
    const elements = asked.map(element => {
      const checked = element.quotes.map(quote => ({ quote, problem: quoteProblem(quote, bodies[criterion.part] || [], criterion.text) }));
      return { ...element, kept: checked.filter(entry => !entry.problem), dropped: checked.filter(entry => entry.problem) };
    });
    const empty = elements.filter(element => !element.kept.length);
    if (!empty.length) {
      return { level: 'pass', what: label, detail: elements.map(element => `${element.asks}: 「${plain(element.kept[0].quote).slice(0, 50)}」`).join(' · '), criterion: criterion.id };
    }
    const detail = empty.map(element => {
      const dropped = element.dropped.map(entry => `「${plain(entry.quote).slice(0, 30)}」 ${entry.problem}`);
      return [`「${element.asks}」에 답한 자리 없음${element.missing ? ` — ${element.missing}` : ''}`, ...dropped].join(' · ');
    });
    return { level: 'fail', what: label, detail: detail.join(' / '), criterion: criterion.id, empty: empty.map(element => element.asks) };
  });
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
