// 작업 화면 상단 내비게이션. 6단계와 작업 화면 목록을 드롭다운으로 접어 한 줄로 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const block = app.slice(app.indexOf('// ---------- 상단 드롭다운 ----------'), app.indexOf('function shell(content) {'));
// 작업 화면 상단 줄만 잘라 낸다. </header>는 다른 화면에도 있으므로 이 줄 뒤에서 찾는다.
const rowStart = app.indexOf('<div class="workflow-row">');
const row = app.slice(rowStart, app.indexOf('</header>', rowStart));

test('6단계가 세로로 나열되지 않고 드롭다운 하나로 접힌다', () => {
  assert.ok(block.length > 800, '드롭다운 코드를 찾지 못했다');
  // 상단 줄에는 단계 목록이 아니라 드롭다운 두 개만 들어간다.
  assert.match(row, /\$\{stepMenu\(\)\}\$\{toolMenu\(\)\}/);
  assert.doesNotMatch(row, /<nav class="workflow-steps"/, '작업 화면 상단에 단계 목록을 펼쳐 두지 않는다');
  // 닫힌 상태에 현재 단계가 보인다.
  assert.match(block, /const label = onStep \? `현재 단계: \$\{state\.step \+ 1\}\. \$\{STEPS\[state\.step\]\}` : '작업 단계';/);
  // 완료는 체크, 현재는 강조. 이동은 기존 data-step 처리기를 그대로 쓴다.
  assert.match(block, /\$\{complete \? '✓' : index \+ 1\}/);
  assert.match(block, /\$\{current \? 'active' : ''\} \$\{complete \? 'done' : ''\}/);
  assert.match(block, /data-step="\$\{index\}"/);
  assert.match(app, /querySelectorAll\('\[data-step\]'\)/);
  // 완료 판단은 기존 규칙을 그대로 쓴다.
  assert.match(block, /const complete = isStepComplete\(index\);/);
});

test('작업 화면 네 곳이 「작업 메뉴」 하나로 묶이고 처리기·권한은 그대로다', () => {
  for (const [id, label] of [['open-archive-box', '공고보관함·계획서보관함'], ['open-engagement', '의뢰 건'], ['open-applicants', '신청기관 정보'], ['open-coaching', '계획서 검증·코칭']]) {
    assert.ok(block.includes(`['${id}', '${label}'`), `${label} 항목`);
    // 같은 식별자를 쓰므로 기존 처리기가 그대로 붙는다.
    assert.ok(app.includes(`querySelector('#${id}')`), `${label} 처리기`);
  }
  assert.match(block, /topMenu\('tools', '작업 메뉴'/);
  // 상단 줄에 낱개 단추로 흩어져 있지 않다.
  assert.doesNotMatch(row, /id="open-archive-box"|id="open-engagement"|id="open-applicants"|id="open-coaching"/);
});

test('상단 배치는 사업 유형 · 현재 단계 · 작업 메뉴 · 이동 순서다', () => {
  const order = ['id="business-type"', '${stepMenu()}', '${toolMenu()}', 'class="workflow-history"'];
  let last = -1;
  for (const needle of order) {
    const at = row.indexOf(needle);
    assert.ok(at > last, `${needle} 순서`);
    last = at;
  }
});

test('뒤로·홈·앞으로는 갈 곳이 없으면 비활성이고 미리 상태를 바꾸지 않는다', () => {
  assert.match(row, /id="workflow-back"[^>]*navigationHistory\.backStack\.length \? '' : 'disabled'/);
  assert.match(row, /id="workflow-forward"[^>]*navigationHistory\.forwardStack\.length \? '' : 'disabled'/);
  assert.ok(row.includes('id="workflow-home"'));
  // 갈 곳이 없으면 activeTool을 바꾸지 않는다(이전에 홈이 사라지던 문제).
  assert.match(app, /#workflow-back'\)\?\.addEventListener\('click', \(\) => \{ if \(!navigationHistory\.backStack\.length\) return; state\.activeTool = 'workflow'; navigateBack\(\); \}\)/);
  assert.match(app, /#workflow-forward'\)\?\.addEventListener\('click', \(\) => \{ if \(!navigationHistory\.forwardStack\.length\) return; state\.activeTool = 'workflow'; navigateForward\(\); \}\)/);
});

test('드롭다운은 서로 닫히고 바깥 클릭·ESC로 닫히며 키보드로도 쓸 수 있다', () => {
  // <details>라서 열고 닫기와 키보드 조작은 브라우저가 해 준다.
  assert.match(block, /<details class="topmenu" data-topmenu="\$\{id\}"><summary class="history-button topmenu-summary">/);
  assert.match(block, /role="menu"/);
  assert.match(block, /role="menuitem"/);
  // 하나를 열면 나머지는 닫힌다.
  assert.match(block, /menu\.addEventListener\('toggle', \(\) => \{ if \(menu\.open\) closeTopMenus\(menu\); \}\)/);
  assert.match(app, /bindTopMenus\(\);/);
  // 바깥 클릭과 ESC로 닫는다.
  assert.match(app, /const inside = event\.target\.closest\('details\.topmenu'\);\s*\n\s*closeTopMenus\(inside\);/);
  assert.match(app, /if \(event\.key === 'Escape'\) \{ closeArchiveMenu\(\); closeTopMenus\(\); \}/);
  // 키보드 초점이 보이게 한다.
  assert.match(css, /\.topmenu-item:focus-visible\{outline:2px solid var\(--blue\)/);
});

test('메뉴가 다른 요소 뒤에 가리지 않고 좁은 화면에서도 펼쳐지지 않는다', () => {
  // 헤더(z-index 25)보다 위에 뜬다.
  assert.match(css, /\.topmenu-panel\{position:absolute;[^}]*z-index:40/);
  assert.match(css, /\.workflow-header\{position:sticky;top:0;z-index:25/);
  // 좁은 화면에서 드롭다운은 접힌 채 가로로 늘어난다. 단계가 세로로 펼쳐지지 않는다.
  const narrow = css.slice(css.indexOf('@media(max-width:760px){\n  /* 좁은 화면에서도 두 줄을 넘기지 않는다'));
  // 360px 가용폭 336에 86 + 84 + 84 + 여백 12 = 266이 들어가 첫 줄에 셋, 둘째 줄에 이동 단추다.
  assert.match(narrow, /\.type-select-label\{order:1;flex:1 1 86px/);
  assert.match(narrow, /\.topmenu\{order:2;flex:1 1 84px/);
  assert.match(narrow, /\.topmenu-label\{overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
  assert.match(narrow, /\.workflow-row\{display:flex;flex-wrap:wrap/);
  assert.match(narrow, /\.workflow-history\{order:3;flex:1 1 100%/);
  // 한 줄 배치를 위해 줄바꿈을 허용하되 줄 간격을 좁게 둔다.
  assert.match(css, /\.workflow-row\{flex-wrap:wrap;row-gap:6px\}/);
});
