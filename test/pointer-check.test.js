// 가리킴 검사(11-07): 「(Ⅱ.3)」처럼 다른 절을 가리킨 줄이 있으면, 가리킨 절에 그 일을 하는 줄이 있는가.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pointersOf, pointerVerdicts, judgePointers } from '../src/pointer-check.js';
import { userContent } from '../src/proposal-draft.js';

// 11-05 모양을 줄인 것: Ⅰ.3이 Ⅱ.2·Ⅱ.3·Ⅴ를 가리키고, Ⅱ.3에는 수시보고 줄이 없다.
const chapters = [
  { title: 'Ⅰ', text: ['## Ⅰ. 개요', '### Ⅰ.3 사업 수행전략', '- [제안] 심리상담·검사·치유·코칭 → 진단 기반 개인·집단상담(Ⅱ.2 프로그램 운영 계획)', '- [제안] 통일부 요청 사항 → 접수·처리 기록, 수시보고(Ⅱ.3)', '- [제안] 관련 홈페이지 운영 → 일정·신청·결과 게시(Ⅴ. 홍보방안)', '- [제안] 연도별 추진방향을 해마다 다시 점검한다(Ⅰ.3 사업 수행전략)'].join('\n') },
  { title: 'Ⅱ', text: ['## Ⅱ. 사업운영계획', '### Ⅱ.2 프로그램 운영 계획', '- [제안] 마음건강 검사 → 종합심리·성격검사 후 개별 해석 상담 → 개인별 해석지', '- [제안] 집단상담 → 검사 결과로 4~6명 소집단 구성 → 회기 기록지', '### Ⅱ.3 운영성과 및 피드백 방안', '- [제안] 분기 분석 → 문항별 응답 분포·서술 의견 분류 → 분기 설문 분석표'].join('\n') },
  { title: 'Ⅴ', text: ['## Ⅴ. 홍보방안', '### Ⅴ 홍보방안', '- [제안] 홈페이지 게시 → 과정 일정·신청 안내·결과 소식 게시 → 게시 기록'].join('\n') }
];
const pointers = pointersOf(chapters);

test('괄호로 다른 절을 가리킨 줄을 찾는다 — 장만 적으면 그 장의 절 전부, 자기 절 가리킴은 뺀다', () => {
  assert.deepEqual(pointers.map(pointer => [pointer.from, pointer.to]), [['Ⅰ.3', ['Ⅱ.2']], ['Ⅰ.3', ['Ⅱ.3']], ['Ⅰ.3', ['Ⅴ']]]);
  assert.equal(pointers[1].claim, '통일부 요청 사항 → 접수·처리 기록, 수시보고');
  // 아직 안 쓴 장(Ⅱ가 폴더에 없음)을 가리킨 줄도 목차의 절 이름으로 찾는다 — 없으면 「가리킨 절에 없다」로 잡혀야 한다.
  const withoutII = chapters.filter(chapter => chapter.title !== 'Ⅱ');
  assert.deepEqual(pointersOf(withoutII).map(pointer => pointer.to[0]), ['Ⅴ']);
  assert.deepEqual(pointersOf(withoutII, { parts: ['Ⅰ.3', 'Ⅱ.2', 'Ⅱ.3', 'Ⅴ'] }).map(pointer => pointer.to[0]), ['Ⅱ.2', 'Ⅱ.3', 'Ⅴ']);
});

test('인용이 가리킨 절에 그대로 있어야 통과 — 지어낸 줄·다른 절의 줄(가리킨 줄 자신 포함)은 떨어진다', () => {
  const rows = pointerVerdicts(pointers, chapters, { results: [
    { id: pointers[0].id, quotes: ['집단상담 → 검사 결과로 4~6명 소집단 구성 → 회기 기록지'], missing: '' },
    { id: pointers[1].id, quotes: ['요청 사항 접수·처리 기록, 수시보고', '집단상담 → 검사 결과로 4~6명 소집단 구성 → 회기 기록지'], missing: '' },
    { id: pointers[2].id, quotes: ['관련 홈페이지 운영 → 일정·신청·결과 게시(Ⅴ. 홍보방안)'], missing: '' }
  ] });
  assert.deepEqual(rows.map(row => row.level), ['pass', 'warn', 'warn']);
  assert.match(rows[1].detail, /Ⅱ\.3에 그 일을 하는 줄이 없다/);
});

test('세 번 판정해 가리킴마다 다수로 — 비용 기록도 세 줄', async () => {
  let calls = 0;
  const answers = [
    [['홈페이지 게시 → 과정 일정·신청 안내·결과 소식 게시 → 게시 기록'], []],
    [['홈페이지 게시 → 과정 일정·신청 안내·결과 소식 게시 → 게시 기록'], []],
    [[], ['분기 분석 → 문항별 응답 분포·서술 의견 분류 → 분기 설문 분석표']]
  ];
  const client = { messages: { create: async () => {
    const [toV, toII3] = answers[calls++];
    const results = [{ id: pointers[0].id, quotes: ['마음건강 검사 → 종합심리·성격검사 후 개별 해석 상담 → 개인별 해석지'], missing: '' }, { id: pointers[1].id, quotes: toII3, missing: '수시보고 없음' }, { id: pointers[2].id, quotes: toV, missing: '' }];
    return { model: 'claude-haiku-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ results }) }], usage: { input_tokens: 1, output_tokens: 1 } };
  } } };
  const records = [];
  const rows = await judgePointers({ client, chapters, krwPerUsd: 1400, onUsage: record => records.push(record) });
  assert.equal(records.filter(record => record.kind === 'pointer').length, 3);
  assert.deepEqual(rows.map(row => [row.level, row.votes]), [['pass', '3/3'], ['warn', '2/3'], ['pass', '2/3']]);
});

test('가리킨 줄은 가리킴 받는 장의 생성 요청에 넣지 않는다 — 검사가 잡는다(11-08)', () => {
  const section = { key: 'Ⅱ', title: 'Ⅱ. 사업운영계획', score: 10, writeWhat: [] };
  const constraints = { amounts: [], derived: [], periods: [], longTerm: null, ratioCaps: [], pageCaps: [], prohibitions: [] };
  const request = userContent({ rfpText: '', facts: [], project: {}, section, constraints, incoming: pointersOf(chapters) })[1].text;
  assert.doesNotMatch(request, /가리킨 줄|수시보고/);
});
