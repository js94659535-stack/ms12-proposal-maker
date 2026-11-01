// 가리킴 검사(11-07): 한 줄이 「(Ⅱ.3)」처럼 다른 절을 가리키면, 가리킨 절에 그 일을 실제로 하는 줄이 있는가.
//
// 생긴 까닭: 11-05에서 Ⅰ.3만 다시 뽑자 「통일부 요청 사항 → 접수·처리 기록, 수시보고(Ⅱ.3)」가 생겼는데 Ⅱ.3에는 그 줄이 없었다.
// 가리키는 쪽만 고치고 가리킴 받는 쪽은 안 고쳐서 생긴 일이다.
//
// 글자 겹침으로는 못 가른다 — 11-05 Ⅰ.3 다섯 줄을 재 보니 있는 것(Ⅴ 0.14)과 없는 것(Ⅱ.3 0.11)이 섞였다.
// 그래서 채점 기준 검사와 같은 방식(사용자 결정 11-02 「AI가 인용, 검사가 확인」): 판정자가 가리킨 절에서 그 일을 하는 줄을 인용하고,
// 검사는 그 인용이 가리킨 절에 글자 그대로 있는지 본다. 세 번 돌려 다수로 정한다(11-07).
// 없으면 warn이다 — 점수를 잃는 것이 아니라 앞뒤가 안 맞는 것이다. 판정자 호출이 실패해도 막지 않는다(대원칙 ②).
// 가리킨 줄을 가리킴 받는 장의 생성 요청에 넣던 것(11-07)은 뺐다(11-08) — 검사가 이미 잡고, 넣자 Ⅱ장 생각이 39% 늘어 잘렸다.
import { usageRecord } from './proposal-draft.js';
import { sectionLines, plain } from './plan-checks.js';
import { JUDGE_MODEL, JUDGE_RUNS } from './criteria-check.js';

const MIN_QUOTE = 6;
const POINTER = /\(([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)(?:\.(\d+))?(?=[\s.)])[^)]*\)/g;
const squash = value => String(value).replace(/\s+/g, '');

// 다른 절을 괄호로 가리키는 줄. 「(Ⅱ.3)」은 그 절, 「(Ⅴ. 홍보방안)」처럼 장만 적으면 그 장의 절 전부가 가리킨 곳이다.
// 자기 절을 가리키는 것은 뺀다. 괄호 없이 글 속에 쓴 「Ⅱ.3 설문 결과로」는 보지 않는다(가리킴인지 설명인지 갈리지 않는다).
// parts: 목차의 절 이름들(없으면 원고에 있는 절). 아직 안 쓴 장을 가리킨 줄도 찾으려면 목차에서 받아야 한다.
export function pointersOf(chapters, { parts: known } = {}) {
  const lines = sectionLines(chapters);
  const parts = known || [...new Set(lines.map(line => line.part))];
  const out = [];
  for (const line of lines) {
    for (const match of line.text.matchAll(POINTER)) {
      const to = match[2] ? parts.filter(part => part === `${match[1]}.${match[2]}`) : parts.filter(part => part === match[1] || part.startsWith(`${match[1]}.`));
      if (!to.length || to.includes(line.part)) continue;
      out.push({ id: `p${out.length + 1}`, from: line.part, to, line: line.text, claim: line.text.replace(POINTER, '').trim() });
    }
  }
  return out;
}

export function pointerPrompt(pointers, chapters) {
  const lines = sectionLines(chapters);
  const system = [
    '너는 공공 제안서를 앞뒤로 맞춰 읽는 검토자다. 한 절의 줄이 다른 절을 가리키며 「그 일은 거기서 한다」고 했다. 가리킨 절에 그 일을 실제로 하는 줄이 있는지 본다.',
    '',
    '- 가리킨 절의 본문에서, 가리킨 줄이 말한 일(→ 뒤의 내용)을 구체적으로 하는 줄을 quotes에 고른다.',
    '- 같은 낱말이 있다는 것만으로 고르지 않는다. 그 일을 하는 줄이어야 한다.',
    '- quotes에는 본문 줄을 한 글자도 바꾸지 않고 옮긴다. 없으면 빈 배열로 두고 missing에 무엇이 없는지 적는다.',
    '- 가리킨 절의 본문만 본다.'
  ].join('\n');
  const user = [];
  for (const pointer of pointers) {
    user.push(`## [${pointer.id}] ${pointer.from} → ${pointer.to.join('·')}`, `가리킨 줄: ${pointer.line}`, '가리킨 절의 본문:');
    const body = lines.filter(line => pointer.to.includes(line.part));
    user.push(...(body.length ? body.map(line => `${line.part} | ${line.text}`) : ['(본문 없음)']), '');
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
        properties: { id: { type: 'string' }, quotes: { type: 'array', items: { type: 'string' } }, missing: { type: 'string' } },
        required: ['id', 'quotes', 'missing'],
        additionalProperties: false
      }
    }
  },
  required: ['results'],
  additionalProperties: false
};

// 판정자의 답 하나를 검사 결과로(돈 안 드는 부분). 인용이 가리킨 절에 그대로 있어야 남는다.
export function pointerVerdicts(pointers, chapters, answer) {
  const lines = sectionLines(chapters);
  const byId = new Map((answer?.results || []).map(result => [result.id, result]));
  return pointers.map(pointer => {
    const body = lines.filter(line => pointer.to.includes(line.part));
    const result = byId.get(pointer.id);
    const kept = (result?.quotes || []).map(quote => plain(quote)).filter(quote => quote.length >= MIN_QUOTE)
      .map(quote => body.find(line => squash(line.text).includes(squash(quote)))).filter(Boolean);
    const what = `가리킴 「${pointer.from} → ${pointer.to.length > 2 ? pointer.to[0].split('.')[0] : pointer.to.join('·')}」`;
    if (kept.length) return { level: 'pass', what, detail: `「${pointer.claim.slice(0, 40)}」 → ${kept[0].part} 「${kept[0].text.slice(0, 50)}」`, criterion: pointer.id };
    return { level: 'warn', what, detail: `「${pointer.claim.slice(0, 40)}」 — ${pointer.to.join('·')}에 그 일을 하는 줄이 없다${result?.missing ? ` (${result.missing})` : ''}. 가리킨 쪽을 고치거나 가리킴 받는 쪽에 쓴다`, criterion: pointer.id };
  });
}

// 세 번 판정해 가리킴마다 다수로 정한다. 비용 기록은 부를 때마다 하나씩(kind: 'pointer').
export async function judgePointers({ client, chapters, parts, model = JUDGE_MODEL, runs = JUDGE_RUNS, krwPerUsd, onUsage, now = () => new Date().toISOString() }) {
  const pointers = pointersOf(chapters, { parts });
  if (!pointers.length) return [];
  const { system, user } = pointerPrompt(pointers, chapters);
  const once = async () => {
    try {
      const message = await client.messages.create({ model, max_tokens: 8000, system, messages: [{ role: 'user', content: user }], output_config: { format: { type: 'json_schema', schema: SCHEMA } } });
      const record = usageRecord({ at: now(), section: '가리킴 검사', model, message, krwPerUsd });
      record.kind = 'pointer';
      await onUsage?.(record);
      if (message.stop_reason === 'refusal') return { error: '판정자가 거절함' };
      return { rows: pointerVerdicts(pointers, chapters, JSON.parse((message.content || []).filter(block => block.type === 'text').map(block => block.text).join(''))) };
    } catch (error) {
      return { error: String(error?.message || error).slice(0, 120) };
    }
  };
  const results = await Promise.all(Array.from({ length: runs }, once));
  const ok = results.filter(result => result.rows);
  if (!ok.length) return [{ level: 'warn', what: '가리킴 검사 못 함', detail: results[0].error }];
  const out = pointers.map((pointer, index) => {
    const rows = ok.map(result => result.rows[index]);
    const passes = rows.filter(row => row.level === 'pass');
    const level = passes.length * 2 > ok.length ? 'pass' : 'warn';
    const same = rows.filter(row => row.level === level);
    return { ...same[0], votes: `${same.length}/${ok.length}`, detail: same.length < ok.length ? `${same[0].detail} (판정 ${ok.length}번 중 ${same.length}번)` : same[0].detail };
  });
  const failed = results.filter(result => result.error);
  if (failed.length) out.push({ level: 'warn', what: '가리킴 판정 일부 실패', detail: `판정 ${runs}번 중 ${failed.length}번 실패 — 남은 ${ok.length}번으로 정함: ${failed[0].error}` });
  return out;
}
