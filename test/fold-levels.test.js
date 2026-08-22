// 접힌 줄이 몇 층인지 눈에 보이게 한다(22-48).
//
// 실제로 났던 일: 중단원·소단원·소소단원이 전부 같은 흰 카드로 나와서 어느 것이 어느 층인지
// 알 수 없었다. 「무엇을 채웠고 무엇이 비었나」와 「2026 28건」이 같은 무게로 보였다.
//
// 규칙은 셋이다.
//   ① 층이 깊어질수록 배경이 옅어진다 — 변수 --fold-1·2·3 한 곳에서 정한다.
//   ② 색만으로 알리지 않는다 — 들여쓰기(--fold-indent)와 왼쪽 선(--fold-edge)이 함께 층을 말한다.
//   ③ 초록(다음 할 일)과 갈색(주 버튼)은 뜻이 있으므로 층 구분에 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles.css', 'utf8');
const block = css.slice(css.indexOf('/* 접기 세 층 (22-48)'));

test('세 층의 색을 변수 한 곳에서 정한다', () => {
  assert.match(block, /--fold-1:#fff;/);
  assert.match(block, /--fold-2:#faf7f3;/);
  assert.match(block, /--fold-3:#f4efe8;/);
  // 층마다 그 변수를 읽는다. 값을 손으로 다시 적지 않는다.
  assert.match(block, /\.card\.org-details\{background:var\(--fold-1\)\}/);
  assert.match(block, /\.card\[data-detail-group\],\.add-fold\{background:var\(--fold-2\)\}/);
  assert.match(block, /\.year-fold,\[data-detail-group\] \.card\.org-details\{background:var\(--fold-3\)/);
});

test('색만으로 알리지 않는다', () => {
  // 소단원·소소단원 모두 들여쓰기와 왼쪽 선을 함께 가진다.
  const indented = block.match(/margin-left:var\(--fold-indent\)/g) || [];
  assert.ok(indented.length >= 3, `들여쓴 층이 ${indented.length}곳뿐이다`);
  const edged = block.match(/border-left:3px solid var\(--fold-edge\)/g) || [];
  assert.ok(edged.length >= 3, `왼쪽 선이 ${edged.length}곳뿐이다`);
  // 좁은 화면에서는 들여쓰기를 줄이되 없애지는 않는다.
  assert.match(block, /@media\(max-width:760px\)\{:root\{--fold-indent:9px\}\}/);
});

test('층 구분에 초록·갈색을 쓰지 않는다', () => {
  assert.ok(!block.includes('var(--go)'), '다음 할 일 초록을 층 구분에 썼다');
  assert.ok(!block.includes('var(--blue)'), '주 버튼 갈색을 층 구분에 썼다');
  assert.ok(!block.includes('var(--green)'));
});

test('보관함의 연도 묶음도 같은 변수를 읽는다', () => {
  assert.match(block, /\.archive-year\{margin-left:var\(--fold-indent\);border-left:3px solid var\(--fold-edge\)/);
});
