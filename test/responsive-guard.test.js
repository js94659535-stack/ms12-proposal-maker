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
  const narrow = css.slice(css.indexOf('@media(max-width:600px){\n  /* 히어로의 음수 여백이'));
  assert.match(narrow, /\.stage-hero\{margin-left:0;margin-right:0/);
});

test('360px 갈색 머리띠에서 제목이 줄바꿈되어 로고와 겹치지 않는다', () => {
  const narrow = css.slice(css.indexOf('@media(max-width:600px){\n  /* 히어로의 음수 여백이'));
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
  assert.match(css, /\.stage-hero\{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap/);
  assert.match(css, /\.stage-routes\{display:flex;flex-wrap:wrap/);
  assert.match(css, /\.stage-route\{display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:8px 14px/);
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  // 큰 카드 3장과 좌우 화살표 대신 작은 단추만 둔다. 시작 경로 자체는 그대로 남는다.
  const hero마크업 = app.slice(app.indexOf('function stageHero('), app.indexOf('function noticeImportView('));
  assert.doesNotMatch(hero마크업, /home-deck|stage-route-no/);
  for (const action of ['fetch', 'upload', 'archive']) assert.ok(app.includes(`action: '${action}'`), action);
  assert.match(hero마크업, /data-route="\$\{escapeHtml\(route\.action\)\}"/);
  assert.match(app, /querySelectorAll\('\[data-route\]'\)/);
});
