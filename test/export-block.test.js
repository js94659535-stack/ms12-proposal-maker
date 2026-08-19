// 받기·이동 버튼이 조용히 아무 일도 하지 않던 것을 막는다.
//
// 실제로 났던 일 둘.
//   ① 「검토·완성으로 이동」이 지금 있는 단계로 보내고 있었다. navigateToStep은 목적지가
//      같으면 빈 patch로 끝내므로 화면만 다시 그려지고 조용히 멈춘다.
//   ② 「받기」에서 형식을 누르면 closeSheet()가 먼저 돌아 시트가 닫히고, 막힌 이유는
//      화면 맨 위에 떠서 누른 자리에서는 보이지 않았다. 「아무 반응 없음」이 그래서 났다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('「검토·완성으로 이동」이 지금 단계로 보내지 않는다', () => {
  // 이 버튼은 completionMode가 거짓일 때, 즉 마지막 단계가 아닐 때만 나온다.
  assert.match(app, /const completionMode = state\.step === STEPS\.length - 1;/);
  assert.match(app, /id="go-to-review"/);
  // 목적지는 「검토·제출」이다. 숫자를 손으로 적지 않는다 — 단계가 늘면 엉뚱한 곳으로 간다.
  assert.match(app, /const REVIEW_STEP = STEPS\.length - 1;/);
  assert.match(app, /'#go-to-review'\)\?\.addEventListener\('click', \(\) => navigateToStep\(REVIEW_STEP\)\);/);
  // 예전 값으로 되돌아가면 다시 죽는다.
  assert.doesNotMatch(app, /'#go-to-review'\)\?\.addEventListener\('click', \(\) => navigateToStep\(4\)\)/);
});

test('막힌 이유를 계산하는 곳이 하나다', () => {
  // 화면이 쓰는 판정과 처리기가 쓰는 판정이 다르면 「눌러도 되는데 안 된다」가 난다.
  assert.match(app, /function exportBlockReason\(id\) \{/);
  assert.match(app, /function submissionExportBlock\(\) \{/);
  assert.match(app, /const blocked = copy === '제출본' \? submissionExportBlock\(\)/);
  // 부분 결과 사유는 writing-progress가 만든 문구를 그대로 쓴다. 새로 짓지 않는다.
  assert.match(app, /return partialBlock\(\);/);
});

test('막히면 시트를 닫지 않고 그 안에 이유를 띄운다', () => {
  assert.match(app, /const reason = exportBlockReason\(id\);/);
  // 이 순서가 핵심이다. 닫고 나서 오류를 띄우면 누른 자리에서는 보이지 않는다.
  const handler = app.slice(app.indexOf("document.querySelectorAll('[data-export-format]')"));
  const guard = handler.indexOf('if (reason) return setState({ exportBlock: reason });');
  const close = handler.indexOf('closeSheet();');
  assert.ok(guard > 0 && close > guard, '이유 검사가 closeSheet()보다 앞에 있어야 한다');
  // 시트가 그 값을 실제로 그린다.
  assert.match(app, /\$\{state\.exportBlock \? `<div class="alert danger"><strong>받지 못했습니다<\/strong>/);
});

test('형식 버튼을 회색으로만 두지 않는다', () => {
  // disabled면 눌러도 아무 일이 없고 이유도 안 나온다. 「고장」으로 읽힌다.
  const sheet = app.slice(app.indexOf('function exportSheet() {'), app.indexOf('\n}\n', app.indexOf('function exportSheet() {')));
  assert.doesNotMatch(sheet, /data-export-format="\$\{id\}" \$\{blocked \? 'disabled' : ''\}/);
  assert.match(sheet, /data-export-format="\$\{id\}" aria-disabled="\$\{Boolean\(blocked\)\}"/);
  // 인쇄 버튼도 같은 규칙을 쓴다.
  assert.match(sheet, /data-export-format="print" aria-disabled=/);
  assert.doesNotMatch(sheet, /data-export-format="print" \$\{state\.sections\.length \? '' : 'disabled'\}/);
});

test('받을 것을 바꾸거나 시트를 다시 열면 앞선 이유는 지운다', () => {
  // 남겨 두면 원인을 고친 뒤에도 빨간 상자가 계속 붙어 있다.
  assert.match(app, /setState\(\{ exportCopy: el\.dataset\.exportCopy, exportBlock: '' \}\)/);
  assert.match(app, /setState\(\{ sheet: \{ kind, payload \}, \.\.\.\(SHEET_OPENS\[kind\] \|\| \{\}\), notice: '', error: '', exportBlock: '' \}\)/);
});

test('저장 알림이 어디서 볼 수 있는지 함께 말한다', () => {
  // 「저장했습니다」만으로는 어디로 갔는지 알 수 없다. 계획서보관함은 1단계 맨 아래에 접혀 있다.
  assert.match(app, /계획서보관함에 저장했습니다\. 1단계 「공고 준비」 맨 아래 「지난 공고와 내 계획서」에서 열 수 있습니다\./);
});
