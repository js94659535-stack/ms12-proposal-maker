import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('검토본 DOCX와 PDF는 같은 내용을 준다', () => {
  // 무엇이 들어가는지 한 곳에서만 정한다.
  assert.match(app, /function reviewOutput\(\) \{[\s\S]{0,500}tables: state\.proposalTables \|\| \[\]/);
  // DOCX도 표를 함께 넣는다. 예전에는 옵션 없이 불러 표가 통째로 빠졌다.
  const docx = app.slice(app.indexOf("querySelector('#final-docx-top')"), app.indexOf("querySelector('#final-hwpx-top')"));
  assert.match(docx, /const out = reviewOutput\(\);/);
  assert.match(docx, /exportDocx\(state\.project, out\.sections, \{ tables: out\.tables, pageBreaks: out\.pageBreaks \}\)/);
  // 부분 결과는 여전히 마지막에 한 번 더 막는다.
  assert.match(docx, /if \(refusePartial\(\)\) return;/);
  // PDF도 같은 자리에서 값을 받는다.
  const pdf = app.slice(app.indexOf('async function downloadProposalPdf()'));
  assert.match(pdf.slice(0, 600), /project: state\.project, \.\.\.reviewOutput\(\)/);
});

test('앞에 붙는 보완 안내만큼 쪽 나눔 자리를 민다', () => {
  // 검토본에는 보완 안내 한 장이 앞에 붙는다. 그만큼 항목 번호가 밀린다.
  assert.match(app, /const shift = sections\.length - state\.sections\.length;/);
  assert.match(app, /pageBreaks: \(state\.stagedGeneration\?\.pageBreaks \|\| \[\]\)\.map\(index => index \+ shift\)/);
});

test('데려갈 자리는 적은 순서대로 찾는다', () => {
  // 쉼표로 늘어놓으면 문서 순서로 잡혀 엉뚱한 카드에서 멈춘다.
  assert.match(app, /function scrollToFirst\(\.\.\.selectors\) \{[\s\S]{0,300}document\.querySelector\(selector\)/);
  // 「전체 계획서 보기」는 진행 상태 카드가 아니라 본문으로 간다.
  assert.match(app, /id="proposal-body"/);
  assert.match(app, /#open-full-proposal[\s\S]{0,200}scrollToFirst\('#proposal-body', '#final-submission', '#result-pipeline'\)/);
  assert.doesNotMatch(app, /querySelector\('#final-submission, #result-pipeline'\)/);
});
