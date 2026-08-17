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

test('작성 화면은 카드를 늘어놓지 않고 고정 도구띠 하나만 둔다', () => {
  const view = app.slice(app.indexOf('function documentView()'), app.indexOf('// 검증·코칭에서 전달받은 수정 요청'));
  // 본문 바로 위에 도구띠가 있고, 카드는 도구띠 뒤 패널로 들어갔다.
  assert.match(view, /\$\{completionPanelView\(\)\}\$\{documentToolbelt\(\)\}/);
  for (const card of ['submissionPackageView()', 'preciseReviewView()', 'proposalTablesView()', 'proposalPipelineView()', 'decisionCenterView()', 'assemblyCheckView()']) {
    assert.ok(!view.includes(`\${${card}}`), `${card}가 아직 화면에 늘어서 있다`);
  }
  // 카드를 만드는 함수는 지우지 않는다. 패널이 그대로 불러 쓴다.
  for (const card of ['submissionPackageView()', 'preciseReviewView()', 'proposalTablesView()', 'proposalPipelineView()']) {
    assert.ok(app.includes(card), `${card}가 사라졌다`);
  }
});

test('감춘 것은 도구띠의 숫자로 알린다', () => {
  const belt = app.slice(app.indexOf('function documentToolbelt()'), app.indexOf('// 「받기」 한 자리'));
  assert.match(belt, /sheetBadge\(blockers \|\| warnings, blockers \? '부족' : '부분-충족'\)/);
  assert.match(belt, /sheetBadge\(marks, marks \? '확인-필요' : ''\)/);
  for (const sheet of ['package', 'checks', 'review', 'tables', 'progress', 'design', 'export']) {
    assert.ok(belt.includes(`'${sheet}'`) || belt.includes(`"${sheet}"`), `도구띠에 ${sheet}가 없다`);
    // 도구띠가 부르는 패널은 모두 실제로 등록되어 있어야 한다.
    assert.match(app, new RegExp(`\\n  ${sheet}:`), `${sheet} 패널이 등록되지 않았다`);
  }
  // 숫자가 0이면 표시를 붙이지 않는다. 빈 배지가 늘어서면 그것도 소음이다.
  assert.match(app, /function sheetBadge\(count, tone = '확인-필요'\) \{\s*\n\s*return count \?/);
});

test('간편 화면도 완성 뒤에 카드를 쌓지 않는다', () => {
  const view = app.slice(app.indexOf('function simpleWriteView()'), app.indexOf('function documentView()'));
  // 완성 뒤에 딸려 오던 것들이 화면에서 빠졌다.
  for (const card of ['gapNoticeView()', 'aiJobsView()', 'openMarksPanel()', 'revisionPanel()', 'expertDetails()']) {
    assert.ok(!view.includes(`\${${card}}`) && !view.includes(`? ${card} :`), `${card}가 아직 간편 화면에 쌓인다`);
  }
  // 대신 도구띠 하나로 모았다.
  const actions = app.slice(app.indexOf('function simpleResultActions()'), app.indexOf('// 한 번에 수정 요청. 항목별로'));
  assert.match(actions, /class="doc-toolbelt"/);
  for (const sheet of ['marks', 'gap', 'revise', 'design', 'export']) {
    assert.ok(actions.includes(`data-open-sheet="${sheet}"`), `도구띠에 ${sheet}가 없다`);
  }
  // 쓰는 중일 때는 진행 화면만 남는다. 그때 도구를 늘어놓지 않는다.
  assert.match(view, /\$\{writing \? writingProgressView\(\) : ''\}/);
});

test('패널을 열면 그 안의 접힘도 함께 펴진다', () => {
  assert.match(app, /const SHEET_OPENS = \{ marks: \{ markOpen: true \}, revise: \{ reviseOpen: true \} \}/);
  assert.match(app, /setState\(\{ sheet: \{ kind, payload \}, \.\.\.\(SHEET_OPENS\[kind\] \|\| \{\}\)/);
});
