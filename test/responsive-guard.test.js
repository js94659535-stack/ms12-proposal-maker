// 좁은 화면 가로 넘침 재발 방지. 실제 브라우저 측정으로 원인을 찾아 고친 규칙을 그대로 고정한다.
// 브라우저 측정 자체는 tools/layout-smoke.mjs로 따로 돌린다(여기서는 원인 규칙만 지킨다).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function rule(selector) {
  const at = css.indexOf(`\n${selector}{`);
  assert.ok(at >= 0, `${selector} 규칙이 없다`);
  return css.slice(at + selector.length + 2, css.indexOf('}', at));
}

test('격자·유연 상자의 자식이 칸보다 넓어지지 못하게 막는다', () => {
  // 360×640 신청기관 준비(+29px)와 사업 설계(+402px) 넘침의 실제 원인이었다.
  const shrink = rule('.two-col>*,.three-col>*,.source-grid>*,.summary-grid>*,.cap-grid>*,.editor-layout>*,.archive-filters>*');
  assert.match(shrink, /min-width:0/);
  assert.match(rule('.field>*'), /min-width:0/);
  assert.match(rule('.field>*'), /max-width:100%/);
  // 선택칸은 가장 긴 항목 이름만큼 넓어지려 한다.
  assert.match(rule('select'), /max-width:100%/);
});

test('요구사항 카드 안의 두 칸 배치가 한 줄 flex로 눌리지 않는다', () => {
  // .requirement>div{display:flex}에 눌려 사업 설계 화면이 762px까지 벌어졌다.
  assert.match(rule('.requirement>.two-col,.requirement>.three-col'), /display:grid/);
  assert.match(rule('.requirement>div'), /flex-wrap:wrap/);
});

test('문서 영역은 끊을 곳 없는 긴 글자 때문에 넓어지지 않는다', () => {
  // 360×640 계획서 작성·검토 제출 화면(+8px)의 원인.
  assert.match(rule('.paper,.requirement,.question'), /overflow-wrap:anywhere/);
});

test('히어로의 음수 여백이 작업 영역 여백과 어긋나지 않는다', () => {
  // 화면 폭에 따라 .workspace 여백이 34→22→14→16px로 바뀐다. 히어로는 그만큼만 당겨야 한다.
  assert.match(css, /@media\(max-width:820px\)\{\.stage-hero\{margin-left:-14px;margin-right:-14px;padding-left:14px;padding-right:14px\}\}/);
  // 600px 아래에서는 음수 여백을 0으로 되돌린다. 이 보정은 기본 선언보다 반드시 뒤에 있어야 한다.
  // 미디어쿼리는 우선순위를 올리지 않으므로, 앞에 두면 뒤의 무조건 선언에 조용히 덮인다.
  const heroAt = css.indexOf('.stage-hero{display:flex');
  const zeroAt = css.indexOf('.stage-hero{margin:0 0 10px');
  assert.ok(heroAt > 0, '통합된 기본 선언이 없다');
  assert.ok(zeroAt > heroAt, '600px 보정이 기본 선언보다 앞에 있으면 죽는다');
});

test('360px 갈색 머리띠에서 제목이 줄바꿈되어 로고와 겹치지 않는다', () => {
  const narrow = css.slice(css.indexOf('@media(max-width:600px){\n  /* 갈색 머리띠'));
  assert.match(narrow, /\.workflow-brand \.brand strong\{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
  assert.match(narrow, /\.workflow-brand>\*\{min-width:0\}/);
  // 사업 유형 선택값이 보이도록 최소 너비를 준다.
  assert.match(narrow, /\.type-select-label select\{min-width:92px/);
});

test('「자동 저장 중」과 계정 표시가 서로 붙지 않는다', () => {
  assert.match(rule('.workflow-brand'), /gap:12px/);
  assert.match(rule('.workflow-brand .save-state'), /flex:0 0 auto/);
  assert.match(rule('.workflow-brand .mode'), /text-overflow:ellipsis/);
});

test('가로폭이 필요한 표만 자기 상자 안에서 스크롤한다', () => {
  assert.match(rule('.archive-table-wrap'), /overflow-x:auto/);
  // 화면 전체를 잘라 결함을 감추지 않는다.
  assert.doesNotMatch(css, /(?:^|\n)(?:html|body|\.layout|\.main|\.workspace)\{[^}]*overflow-x:hidden/);
});

test('1단계 머리말이 작업 영역을 화면 밖으로 밀지 않는다', () => {
  // 머리말은 제목 묶음과 시작 경로를 한 줄에 놓고 좁아지면 접는다.
  assert.match(css, /\.stage-hero\{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap/);
  assert.match(css, /\.stage-routes\{display:flex;flex-wrap:wrap/);
  assert.match(css, /\.stage-route\{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:1px;/);
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  // 큰 카드 3장과 좌우 화살표 대신 작은 단추만 둔다. 시작 경로 자체는 그대로 남는다.
  const hero마크업 = app.slice(app.indexOf('function stageHero('), app.indexOf('function noticeImportView('));
  assert.doesNotMatch(hero마크업, /home-deck|stage-route-no/);
  for (const action of ['fetch', 'upload', 'archive']) assert.ok(app.includes(`action: '${action}'`), action);
  assert.match(hero마크업, /data-route="\$\{escapeHtml\(route\.action\)\}"/);
  assert.match(app, /querySelectorAll\('\[data-route\]'\)/);
});

// ---------- 규칙이 흩어져 조용히 죽는 것을 막는다 ----------
// 「고쳤는데 화면에 반영되지 않는다」의 실제 원인이었다. 미디어쿼리는 우선순위를 올리지 않으므로
// 같은 선택자를 파일 여러 곳에서 다시 선언하면 뒤에 온 무조건 규칙이 앞의 좁은 화면 보정을 덮는다.
test('한 선택자를 여러 곳에서 다시 선언해 앞선 보정을 덮지 않는다', () => {
  // 미디어쿼리 밖(들여쓰기 없는 줄)에서 시작하는 선언만 센다.
  const topLevel = selector => (css.split(String.fromCharCode(10)).filter(line => line.startsWith(selector + String.fromCharCode(123))).length);
  for (const selector of ['.stage-hero', '.stage-route', '.stage-routes', '.stat-badge', '.stat-badges', '.dense-step']) {
    assert.equal(topLevel(selector), 1, `${selector}는 한 곳에서만 정의한다`);
  }
  // 좁은 화면 보정은 모두 기본 선언보다 뒤에 있어야 살아 있다.
  const base = css.indexOf('.stage-hero{display:flex');
  for (const media of ['@media(max-width:980px){.stage-hero', '@media(max-width:820px){.stage-hero']) {
    assert.ok(css.indexOf(media) > base, `${media}가 기본 선언보다 앞에 있다`);
  }
  // 지금 markup에 없는 옛 머리말 선택자가 남아 있지 않다.
  for (const dead of ['.stage-route-no', '.stage-routes .home-deck-track', '.stage-hero .home-deck-arrow']) {
    assert.ok(!css.includes(dead), `${dead}는 쓰이지 않는 규칙이다`);
  }
});
