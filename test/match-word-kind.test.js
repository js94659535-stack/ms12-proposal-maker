// 겹친 낱말이 분야인지 방법인지 화면에서 보이게 한다.
//
// 실제로 났던 일: 22-39로 방법 낱말 하나로 걸리는 것은 막았지만, 「지원」·「교육」처럼 방법 낱말
// 둘이 겹치면 그대로 통과한다. 학교폭력 공고에서는 12건 중 10건이 그렇다. 더 조여 봤더니
// 맞는 공고가 무너져서(아동 14건 → 2건) 조이지 않기로 했다. 대신 무엇으로 걸렸는지 말한다.
//
// 판정은 22-39의 세 조건을 그대로 쓴다. 새 잣대도, 낱말 목록도 만들지 않는다.
//   셋 다 넘김           → 분야 낱말
//   드물고 중심인데 묻힘  → 「지역아동센터」 속 「아동」. 분야일 수 있으나 확실하지 않다
//   드물지 않거나 안 중심 → 방법 낱말
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeApplicant, relatedMatches } from '../src/applicants.js';

const record = (year, value, id) => ({ id, area: 'performance', label: `${year}년 사업실적`, value, status: '확인 필요', source: '연혁에서 추출', asOf: String(year) });
const HISTORY = normalizeApplicant({
  id: 'org-1', name: 'QA 기관',
  items: [
    // 「지원」·「운영」은 이 기관이 늘 쓰는 말이라 실적 여기저기에 있다. 그래서 드문 낱말이 아니다.
    ...Array.from({ length: 20 }, (unused, index) => record(2000 + index,
      `${index}초등학교 학습역량강화 캠프${index % 4 === 0 ? ' 지원' : ''}${index % 6 === 0 ? ' 운영' : ''}`, `filler-${index}`)),
    record(2021, '장성 서삼초등학교 방과후 돌봄 프로그램', 'field'),
    record(2022, '광주광역시 지역아동센터 방과후돌봄교실 미술놀이', 'buried'),
    record(2023, '전남 일자리센터 자신감 회복 운영 지원', 'method')
  ]
}).items.filter(item => item.area === 'performance');

const NOTICE = [
  '장성 방과후·돌봄 아동 지원사업',
  '아동에게 방과후 돌봄 프로그램을 제공해야 한다',
  '지원 계획과 운영 방법을 내야 한다',
  '지원 성과를 보고해야 한다'
];

test('세 조건으로 분야 낱말과 방법 낱말이 갈린다', () => {
  const matched = relatedMatches(HISTORY, NOTICE, { limit: 0 });
  const of = id => matched.find(entry => entry.item.id === id);
  // 「장성」·「방과후」·「돌봄」은 셋을 다 넘겼다.
  assert.ok(of('field').fieldWords.includes('장성'));
  assert.equal(of('field').methodOnly, false);
  // 「아동」은 「지역아동센터」 속에 묻혀 있다. 분야일 수 있으나 확실하지 않다고 말한다.
  assert.deepEqual(of('buried').fieldWords, []);
  assert.ok(of('buried').buriedWords.includes('아동'));
  assert.equal(of('buried').methodOnly, false);
  // 「운영」·「지원」만 겹친 것은 방법이 겹친 것이다.
  assert.equal(of('method').methodOnly, true);
  assert.deepEqual(of('method').fieldWords, []);
  assert.deepEqual(of('method').buriedWords, []);
});

test('방법만 겹친 것도 걸러내지 않는다', () => {
  // 거르면 맞는 공고에서도 목록이 무너진다. 남겨 두고 표시만 한다.
  const matched = relatedMatches(HISTORY, NOTICE, { limit: 0 });
  assert.ok(matched.some(entry => entry.item.id === 'method'));
  assert.ok(matched.every(entry => Array.isArray(entry.wordMarks) && entry.wordMarks.length));
  // 성격은 낱말마다 붙는다. 한 실적 안에 분야 낱말과 방법 낱말이 섞일 수 있다.
  const kinds = new Set(matched.flatMap(entry => entry.wordMarks.map(mark => mark.kind)));
  assert.ok(kinds.has('field') && kinds.has('method'));
});

test('화면이 세 가지를 그대로 말한다', () => {
  const app = fs.readFileSync('src/app.js', 'utf8');
  assert.match(app, /분야가 겹쳤습니다/);
  assert.match(app, /분야 낱말이 더 긴 말 속에 있습니다/);
  assert.match(app, /분야가 아니라 방법이 겹쳤습니다/);
  // 겹친 실적 목록의 각 줄에 붙는다.
  assert.match(app, /\$\{escapeHtml\(entry\.item\.status\)\}<\/small>\$\{matchNote\(entry\)\}/);
  // 머리에도 몇 건인지 적는다.
  assert.match(app, /const methodOnly = matches\.filter\(entry => entry\.methodOnly\)\.length;/);
});
