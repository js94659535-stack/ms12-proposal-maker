// 옆에서 밀려 들어오는 패널. 화면을 갈아치우지 않고 덮는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('패널은 뒤 화면을 지우지 않고 덮는다', () => {
  // 화면 갈아치우기(activeTool)가 아니라 별도 상태로 연다. 그래야 있던 자리로 돌아온다.
  assert.match(app, /function openSheet\(kind, payload = null\)/);
  assert.match(app, /setState\(\{ sheet: \{ kind, payload \}/);
  assert.match(app, /function closeSheet\(\) \{ setState\(\{ sheet: null \}\); \}/);
  // 본문(workspace)은 그대로 두고 그 위에 얹는다.
  assert.match(app, /<section class="workspace">\$\{content\}<\/section>\s*\n\s*\$\{sheetView\(\)\}/);
});

test('패널은 저장하지 않는다. 새로고침하면 닫힌 채로 시작한다', () => {
  assert.match(app, /submissionZip: null, lastDownload: null, sheet: null \};/);
  assert.equal((app.match(/lastDownload: null, sheet: null \};/g) || []).length, 2, '불러오기·저장 두 곳에서 모두 비운다');
});

test('바깥·닫기·ESC 어느 쪽으로도 닫힌다', () => {
  assert.match(app, /class="sheet-scrim" data-sheet-close="1"/);
  assert.match(app, /class="sheet-close" data-sheet-close="1" aria-label="닫기"/);
  assert.match(app, /querySelectorAll\('\[data-sheet-close\]'\)\.forEach\(el => el\.onclick = \(\) => closeSheet\(\)\)/);
  assert.match(app, /if \(state\.sheet\) closeSheet\(\);/);
  // 읽어 주는 프로그램에도 창으로 알린다.
  assert.match(app, /role="dialog" aria-modal="true"/);
});

test('받기는 한 자리에 모으고, 무엇을 받는지 먼저 고른다', () => {
  const sheet = app.slice(app.indexOf('function exportSheet()'), app.indexOf('function runExportFormat('));
  assert.match(sheet, /pick\('검토본', '검토본'/);
  assert.match(sheet, /pick\('제출본', '제출본'/);
  // 검토본은 내부용이라고 그 자리에서 밝힌다.
  assert.match(sheet, /검토본은 제출용이 아닙니다/);
  // 막혔으면 이유를 패널 안에서 말한다. 다른 화면으로 보내지 않는다.
  assert.match(sheet, /지금은 \$\{escapeHtml\(copy\)\}을 받을 수 없습니다/);
  // 형식은 기존 출력 경로로 넘긴다. 새 출력 방식을 만들지 않는다.
  const run = app.slice(app.indexOf('function runExportFormat(id)'), app.indexOf('// 파일을 받은 다음'));
  assert.match(run, /if \(id\.startsWith\('submission-'\)\) return exportFinalPackage\(id\.replace\('submission-', ''\)\);/);
  assert.match(run, /if \(refusePartial\(\)\) return;/);
  assert.match(run, /downloadProposalPdf\(\)/);
});

test('흩어져 있던 받기 버튼 자리에 「받기」 하나만 둔다', () => {
  const simple = app.slice(app.indexOf('function simpleResultActions()'), app.indexOf('// 한 번에 수정 요청. 항목별로'));
  assert.match(simple, /data-open-sheet="export">받기/);
  // 같은 카드에 형식 버튼을 늘어놓지 않는다.
  assert.ok(!/id="final-docx-top"|id="final-hwpx-top"|id="final-pdf-top"/.test(simple), '형식 버튼이 카드에 남아 있다');
});

test('좁은 화면에서는 옆이 아니라 아래에서 올라오고, 움직임을 줄인 설정을 따른다', () => {
  assert.match(css, /@media\(max-width:700px\)\{[\s\S]{0,240}animation-name:sheet-up/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\s*\n?\s*\.sheet,\.sheet-scrim\{animation:none\}/);
  // 패널 안에서만 스크롤한다. 뒤 화면의 세로 스크롤 방식은 그대로 둔다.
  assert.match(css, /\.sheet-body\{flex:1;overflow:auto/);
});
