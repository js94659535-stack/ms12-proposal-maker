import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, widthOf, toBlocks, linesOf, estimatePages } from '../src/page-estimate.js';

// 기준값은 한글 2020 실측(tools/page-measure.ps1 → reports/10-07-pages/measure-factory.json)
test('한 줄 한글 28자, 한 쪽 27줄: 28자는 한 줄, 29자는 두 줄, 27줄이 한 쪽', () => {
  assert.equal(LAYOUT.perLine, 28);
  assert.equal(LAYOUT.linesPerPage, 27);
  assert.equal(linesOf({ type: 'para', text: '가'.repeat(28) }), 1);
  assert.equal(linesOf({ type: 'para', text: '가'.repeat(29) }), 2);
  // 실측: 숫자는 한 줄 56자 = 한글의 절반 폭
  assert.equal(linesOf({ type: 'para', text: '1'.repeat(56) }), 1);
  assert.equal(linesOf({ type: 'para', text: '1'.repeat(57) }), 2);
  assert.equal(estimatePages(Array(27).fill('가').join('\n')).pages, 1);
});

test('마크다운 꾸밈은 지우고, 표 구분 줄은 빼고, 겹친 빈 줄은 하나로 센다', () => {
  const blocks = toBlocks('## 제목\n\n\n**굵게** 본문\n| 가 | 나 |\n|---|---|\n| 다 | 라 |');
  assert.deepEqual(blocks.map(block => block.type), ['heading', 'blank', 'para', 'table']);
  assert.equal(blocks[2].text, '굵게 본문');
  assert.equal(blocks[3].rows.length, 2);
  assert.equal(widthOf('가 1'), 1 + LAYOUT.spaceWidth + LAYOUT.digitWidth);
});

test('표는 칸 폭이 좁아 같은 글자가 더 많은 줄을 먹는다', () => {
  const text = '가'.repeat(20);
  const asPara = linesOf({ type: 'para', text });
  const asCell = linesOf({ type: 'table', rows: [[text, '나', '다']] });
  assert.equal(asPara, 1);
  assert.ok(asCell > 2, String(asCell));
});

test('절(###)마다 나눠 세고, 첫 ### 앞(장 제목)은 따로 둔다', () => {
  const estimate = estimatePages('## Ⅰ. 개요\n\n### Ⅰ.1 비전\n가\n\n### Ⅰ.2 목표\n나');
  assert.deepEqual(estimate.parts.map(part => part.heading), [null, 'Ⅰ.1 비전', 'Ⅰ.2 목표']);
  assert.equal(estimate.parts[0].lines, Math.round((LAYOUT.headingPt / LAYOUT.bodyPt + 1) * 10) / 10);
});
