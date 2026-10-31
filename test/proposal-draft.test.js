import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRfp } from '../public/rfp/rfp-read.js';
import { careerBody } from '../public/baeumteo/career-final.js';
import { readPlan, writingUnits } from '../public/rfp/rfp-plan.js';
import { systemPrompt, userContent, ruleLines, preferenceLines, checkDraft, checkPages, checkMarks, choiceSheet, stripMarks, costOf, usageRecord, draftSection, countTextTokens } from '../src/proposal-draft.js';
import { estimatePages } from '../src/page-estimate.js';

const rfpText = fs.readFileSync(new URL('./fixtures/rfp-unification-2027.txt', import.meta.url), 'utf8');
const { outline, constraints } = readRfp(rfpText);
const understanding = outline.sections.find(section => section.title === '사업 이해도');
const program = outline.sections.find(section => section.title === '신규 프로그램');
const facts = [{ source: '연혁.hwp', text: '2020 북구다문화센터 다문화 가정 진로 교육 상담\n광주시 15개 지역아동센터 순회 심리검사해석' }];
const project = { lead: '(주)마인드스토리', partners: [{ name: '(주)가르침에듀' }, { name: null, kind: '불교재단' }] };

test('프롬프트에 견본 계획서가 들어가지 않는다 — 규칙과 공고·기관 자료만 들어간다', () => {
  const prompt = [systemPrompt(), ...userContent({ rfpText, facts, project, section: program, constraints }).map(block => block.text)].join('\n');
  const sample = careerBody().split('\n').filter(line => line.length > 40);
  assert.ok(sample.length > 20);
  for (const line of sample) assert.ok(!prompt.includes(line), line.slice(0, 40));
  assert.ok(!/배움터|진로설계 포트폴리오/.test(prompt));
  assert.match(prompt, /활동 → 하는 일 → 결과물/);
  assert.match(prompt, /\[확인 필요/);
});

test('공고 원문·기관 자료는 캐시되는 앞 블록에, 절 요청은 뒤 블록에 둔다', () => {
  const blocks = userContent({ rfpText, facts, project, section: understanding, constraints });
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].cache_control, { type: 'ephemeral' });
  assert.ok(blocks[0].text.includes(rfpText));
  assert.equal(blocks[1].cache_control, undefined);
  assert.match(blocks[1].text, /「사업 이해도」 \(배점 10점\)/);
  assert.match(blocks[1].text, /효과적인 사업 추진 전략/);
  // 절이 달라도 앞 블록은 글자 하나 다르지 않다(캐시가 걸린다).
  assert.equal(userContent({ rfpText, facts, project, section: program, constraints })[0].text, blocks[0].text);
  // 역할분장은 비워 두고 사람에게 묻는다. 이름 모르는 구성사도 비운다.
  assert.match(blocks[0].text, /역할분장: \[확인 필요: 사람이 정함\]/);
  assert.match(blocks[0].text, /불교재단\(이름 \[확인 필요\]\)/);
});

test('규칙 숫자는 RFP에서 읽은 것이고, 금액 금지 공고에서는 금액을 주지 않는다', () => {
  const lines = ruleLines(constraints).join('\n');
  assert.match(lines, /인건비: 위탁사업비 총액의 30% 이내/);
  assert.match(lines, /제안서\(본보고서\): 30쪽 이내/);
  assert.match(lines, /2027-01-01 ~ 2028-12-31 \(2년\)/);
  assert.ok(!/\d원/.test(lines), lines);
});

test('「평가 우대」 문장만 뽑는다(「평가점수」는 아니다)', () => {
  assert.deepEqual(preferenceLines(rfpText), ['다양한 프로그램 운영을 위해 신규 상담지원·교육 프로그램을 포함하여 제안서 작성시 평가 우대']);
});

const ctx = { constraints, section: program, sources: [rfpText, facts[0].text], project };
const good = [
  '## 신규 프로그램',
  '### 신규 교류·체험·활동·행사 프로그램 편성',
  '- [제안] 마음 지도 그리기 → 심리검사 결과를 함께 읽는다 → 개인 해석 기록지',
  '- [제안] 참여 인원: [확인 필요: 목표 인원]',
  '### 프로그램의 다양성, 균형성',
  '광주시 15개 지역아동센터 순회 경험을 살린다.'
].join('\n');

test('검사: 규칙을 지킨 글은 fail이 없다', () => {
  const results = checkDraft(good, ctx);
  assert.deepEqual(results.filter(result => result.level === 'fail'), []);
  assert.ok(results.some(result => result.what === '비워 둔 곳 1곳'));
});

test('검사: 금액·지어낸 숫자·빠진 평가내용은 fail, 구성사 역할은 warn', () => {
  const bad = [
    '## 신규 프로그램',
    '### 신규 교류·체험·활동·행사 프로그램 편성',
    '연간 300명이 참여하고 1억 원을 들인다. (주)가르침에듀가 언어교육을 전담한다.'
  ].join('\n');
  const results = checkDraft(bad, ctx);
  const fails = results.filter(result => result.level === 'fail').map(result => result.what);
  assert.ok(fails.includes('제안서에 금액을 적지 말 것'), JSON.stringify(results));
  assert.ok(results.some(result => result.level === 'fail' && /300명/.test(result.detail)));
  assert.ok(fails.includes('평가내용 「프로그램의 다양성, 균형성」 소제목'));
  assert.ok(results.some(result => result.level === 'warn' && result.what === '구성사 역할을 적은 문장'));
});

// 목차표에서 나온 장: Ⅰ 개요 4쪽 = 절 4개 × 1쪽
const { plan: tocPlan, constraints: tocConstraints } = readPlan(rfpText);
const chapterOne = writingUnits(tocPlan).find(unit => unit.key === 'Ⅰ');
const filler = n => Array.from({ length: n }, (_, index) => `- [제안] 줄 ${index}`).join('\n');
const chapterText = sizes => ['## Ⅰ. 개요', ...chapterOne.parts.map((part, index) => `### ${part.key} ${part.title}\n${filler(sizes[index])}`)].join('\n\n');

test('분량: 절 하나라도 권장 쪽수(한 쪽 27줄)를 넘으면 fail, 장 전체도 따로 본다', () => {
  // 장 4쪽을 배점 비례(최소 0.5쪽)로 나눈다(10-07): Ⅰ.1 1.25 · Ⅰ.2 1.25 · Ⅰ.3 2.5 · Ⅰ.4 8.33점.
  assert.deepEqual(chapterOne.parts.map(part => part.pages.value), [0.5, 0.5, 0.5, 2.5]);
  const fits = checkPages(chapterText([10, 10, 10, 55]), chapterOne);
  assert.deepEqual(fits.filter(check => check.level === 'fail'), [], JSON.stringify(fits));
  const over = checkPages(chapterText([10, 20, 10, 55]), chapterOne);
  const fails = over.filter(check => check.level === 'fail').map(check => check.what);
  assert.equal(fails.length, 1, JSON.stringify(over));
  assert.match(fails[0], /Ⅰ\.2 .*\/ 권장 0\.5쪽/);
  // 출처 표시는 제출본에서 지우므로 쪽수에 넣지 않는다.
  const long = '- [사실: 기관 자료 연혁] 가';
  assert.equal(estimatePages(stripMarks(long)).lines, 1);
});

test('분량: 프롬프트가 절마다 줄 수로 분량을 알려 준다', () => {
  const request = userContent({ rfpText, facts, project, section: chapterOne, constraints: tocConstraints, plan: tocPlan })[1].text;
  assert.match(request, /### Ⅰ\.1 .*\(권장 0\.5쪽 = 약 14줄\)/);
  assert.match(request, /권장 4쪽 = 약 108줄/);
  assert.match(systemPrompt(), /한 쪽은 27줄, 한 줄은 한글 28자/);
});

test('제안·사실 표시: 글머리 줄과 표 줄에 없으면 fail, 표 머리 줄은 빼고 센다. 고를 목록은 [제안]만', () => {
  const text = [
    '### Ⅰ.1 사업 비전',
    'o [제안] 비전: 「마음을 잇다」',
    '  - [사실: 기관 자료 연혁] 2018년부터 학교 심리검사 운영',
    '  - 표시가 빠진 줄',
    '',
    '| 구분 | 내용 |',
    '|---|---|',
    '| [제안] 목표 | 정착 지원 |',
    '| 일정 | 1분기 |'
  ].join('\n');
  const [mark] = checkMarks(text);
  assert.equal(mark.level, 'fail');
  assert.match(mark.what, /제안 2줄, 사실 1줄, 표시 없음 2줄/);
  assert.match(mark.detail, /표시가 빠진 줄/);
  assert.match(mark.detail, /일정/);
  const sheet = choiceSheet(text, 'Ⅰ. 개요');
  assert.match(sheet, /- \[ \] 비전: 「마음을 잇다」/);
  assert.match(sheet, /- \[ \] 목표 \| 정착 지원/);
  assert.ok(!sheet.includes('2018년'));
  assert.equal(stripMarks('o [제안] 가 [사실: 공고 제7조] 나'), 'o 가 나');
});

test('기관이 정한 「쓰지 말 것」: 프롬프트 금지 목록에 들어가고, 쓰면 fail', () => {
  const omitting = { ...project, omit: [{ what: '종교 명칭·종교 활동 배제 문장', pattern: '종교', why: '사용자 결정' }] };
  const request = userContent({ rfpText, facts, project: omitting, section: program, constraints })[1].text;
  assert.match(request, /- 쓰지 않는다: 종교 명칭·종교 활동 배제 문장 \(기관 결정: 사용자 결정\)/);
  const text = `${good}\n- [사실: 공고 제7조] 특정 종교의 명칭과 종교 활동을 배제함`;
  const results = checkDraft(text, { ...ctx, project: omitting });
  assert.ok(results.some(result => result.level === 'fail' && /종교/.test(result.what) && /배제함/.test(result.detail)));
  assert.ok(checkDraft(good, { ...ctx, project: omitting }).some(result => result.level === 'pass' && /종교/.test(result.what)));
});

test('비용: Claude Opus 5.5 단가로 원화를 셈하고, fallback 시도는 그 모델 단가로 더한다', () => {
  const usage = { input_tokens: 1000, output_tokens: 2000, cache_creation_input_tokens: 10000, cache_read_input_tokens: 0 };
  // (1000×4 + 2000×20 + 10000×5) / 1e6 = 0.094달러
  assert.equal(costOf(usage, 'claude-opus-5-5', 1400).krw, Math.round(0.094 * 1400));
  const withFallback = {
    ...usage,
    iterations: [
      { type: 'message', model: null, input_tokens: 1000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      { type: 'fallback_message', model: 'claude-opus-4-8', input_tokens: 1000, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    ]
  };
  const cost = costOf(withFallback, 'claude-opus-5-5', 1400);
  assert.equal(cost.usd, (1000 * 4 + 1000 * 5 + 1000 * 25) / 1e6);
  assert.equal(costOf(usage, 'claude-unknown', 1400).krw, null);
  const record = usageRecord({ at: 't', section: 's', model: 'claude-opus-5-5', message: { model: 'claude-opus-4-8', stop_reason: 'end_turn', usage: withFallback }, krwPerUsd: 1400 });
  assert.equal(record.prompt_tokens, 2000);
  assert.equal(record.completion_tokens, 1000);
});

test('한 절 쓰기: 요청 모양, 토큰 기록, 검사가 함께 돈다(가짜 클라이언트)', async () => {
  let sent = null;
  const client = { beta: { messages: { stream: params => { sent = params; return { finalMessage: async () => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: good }], usage: { input_tokens: 500, output_tokens: 800, cache_creation_input_tokens: 15000, cache_read_input_tokens: 0 } }) }; } } } };
  const records = [];
  const result = await draftSection({ client, model: 'claude-opus-5-5', rfpText, facts, project, section: program, constraints, krwPerUsd: 1400, onUsage: record => records.push(record), now: () => '2026-10-31T00:00:00Z' });
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.fallbacks, 'default');
  assert.deepEqual(sent.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(sent.output_config.effort, 'high');
  assert.ok(!('thinking' in sent));
  assert.equal(records.length, 1);
  assert.equal(records[0].prompt_tokens, 15500);
  assert.equal(records[0].completion_tokens, 800);
  assert.equal(records[0].krw, Math.round(((500 * 4 + 800 * 20 + 15000 * 5) / 1e6) * 1400));
  assert.deepEqual(result.checks.filter(check => check.level === 'fail'), []);
});

test('한 절 쓰기: 거절이나 잘림은 fail로 남기고 기록은 그대로 한다', async () => {
  const fake = message => ({ beta: { messages: { stream: () => ({ finalMessage: async () => message }) } } });
  const records = [];
  const refused = await draftSection({ client: fake({ stop_reason: 'refusal', stop_details: { category: null }, content: [], usage: { input_tokens: 10, output_tokens: 0 } }), model: 'claude-opus-5-5', rfpText, facts, project, section: program, constraints, krwPerUsd: 1400, onUsage: record => records.push(record) });
  assert.equal(refused.refused, true);
  assert.equal(records.length, 1);
  const cut = await draftSection({ client: fake({ stop_reason: 'max_tokens', content: [{ type: 'text', text: good }], usage: { input_tokens: 10, output_tokens: 32000 } }), model: 'claude-opus-5-5', rfpText, facts, project, section: program, constraints, krwPerUsd: 1400 });
  assert.equal(cut.checks[0].what, '출력이 잘림(max_tokens)');
});

test('생각 토큰: API 칸이 있으면 그대로, 없으면 null, 블록 글 길이와 본문 토큰 어림을 함께 남긴다(10-08)', async () => {
  const content = [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: '본문' }];
  const withDetails = usageRecord({ at: 't', section: 's', model: 'claude-opus-5-5', krwPerUsd: 1400,
    message: { content, usage: { input_tokens: 10, output_tokens: 900, output_tokens_details: { thinking_tokens: 700 } } } });
  assert.equal(withDetails.thinking_tokens, 700);
  assert.equal(withDetails.thinking_blocks, 1);
  assert.equal(withDetails.thinking_chars, 0);
  const without = usageRecord({ at: 't', section: 's', model: 'claude-opus-5-5', krwPerUsd: 1400, message: { content, usage: { input_tokens: 10, output_tokens: 900 } } });
  assert.equal(without.thinking_tokens, null);
  const perTry = usageRecord({ at: 't', section: 's', model: 'claude-opus-5-5', krwPerUsd: 1400, message: { content, usage: { output_tokens: 900, iterations: [
    { input_tokens: 1, output_tokens: 300, output_tokens_details: { thinking_tokens: 200 } }, { input_tokens: 1, output_tokens: 600, output_tokens_details: { thinking_tokens: 400 } }] } } });
  assert.equal(perTry.thinking_tokens, 600);
  // 본문 토큰은 토큰 세기 API로: 「.」 몫을 뺀다
  const client = { beta: { messages: { countTokens: async ({ messages }) => ({ input_tokens: messages[0].content === '.' ? 8 : 108 }) } } };
  assert.equal(await countTextTokens(client, 'claude-opus-5-5', '본문'), 100);
  assert.equal(await countTextTokens({ beta: { messages: {} } }, 'claude-opus-5-5', '본문'), null);
});
