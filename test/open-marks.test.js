// 확인 필요 표시를 한자리에서 채운다. 확인 절차를 없애는 것이 아니라 반복 입력을 없앤다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyOpenMarks, collectOpenMarks, openMarkTotal } from '../src/open-marks.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const SECTIONS = [
  { id: 'target', title: '대상', content: '참여 아동은 [확인 필요]명입니다.' },
  { id: 'budget', title: '예산', content: '총 예산은 [확인 필요]원이며 인건비는 [확인 필요: 인건비 총액]입니다.' },
  { id: 'goals', title: '목표', content: '연 [확인 필요]명에게 제공합니다.' }
];

test('무엇을 묻는 자리인지 앞뒤 글에서 읽어 이름을 붙인다', () => {
  const marks = collectOpenMarks(SECTIONS);
  const labels = marks.map(item => item.label);
  assert.ok(labels.includes('대상 인원'), labels.join(', '));
  assert.ok(labels.includes('예산 금액'), labels.join(', '));
  // 표시 안에 적힌 설명이 있으면 그것을 그대로 쓴다.
  assert.ok(labels.includes('인건비 총액'), labels.join(', '));
});

test('같은 것을 묻는 자리는 하나로 묶어 한 번만 묻는다', () => {
  const marks = collectOpenMarks(SECTIONS);
  const people = marks.find(item => item.label === '대상 인원');
  assert.equal(people.count, 2, '대상·목표 두 곳이 하나로 묶여야 한다');
  assert.deepEqual(people.sections, ['대상', '목표']);
  assert.equal(openMarkTotal(SECTIONS), 4);
});

test('한 번 넣은 값이 묶인 자리에 모두 들어간다', () => {
  const marks = collectOpenMarks(SECTIONS);
  const people = marks.find(item => item.label === '대상 인원');
  const result = applyOpenMarks(SECTIONS, { [people.key]: '35' });
  assert.equal(result.filled, 2);
  assert.equal(result.sections[0].content, '참여 아동은 35명입니다.');
  assert.equal(result.sections[2].content, '연 35명에게 제공합니다.');
  // 채우지 않은 자리는 그대로 남는다.
  assert.equal(result.left, 2);
  assert.match(result.sections[1].content, /\[확인 필요\]원/);
});

test('빈 값으로 표시를 지우지 않는다', () => {
  const marks = collectOpenMarks(SECTIONS);
  const result = applyOpenMarks(SECTIONS, Object.fromEntries(marks.map(item => [item.key, '   '])));
  assert.equal(result.filled, 0);
  assert.equal(result.left, 4, '빈 값으로 확인 절차를 건너뛸 수 없다');
});

test('문맥을 함께 보여 준다', () => {
  const marks = collectOpenMarks(SECTIONS);
  assert.ok(marks.every(item => item.context.includes('【')), '앞뒤 글이 없다');
  assert.ok(marks[0].context.includes('참여 아동은'));
});

test('화면에 한자리 채우기 판과 처리기가 있다', () => {
  assert.match(app, /function openMarksPanel\(\) \{/);
  assert.match(app, /id="apply-marks"/);
  assert.match(app, /data-mark-key="\$\{escapeHtml\(item\.key\)\}"/);
  assert.match(app, /const result = applyOpenMarks\(state\.sections, state\.markDraft \|\| \{\}\);/);
  // 왜 비워 두었는지 그 자리에 적는다.
  assert.match(app, /AI가 기관 실적·인력·예산을 지어내지 않도록 비워 둔 자리입니다/);
  // 제출이 막혔을 때 채우러 가는 길이 있다.
  assert.match(app, /id="package-fill-open"/);
  assert.match(app, /id="package-review-docx"/);
});
