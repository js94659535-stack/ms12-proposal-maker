// 접힌 줄이 몇 층인지 눈에 보이게 한다(22-48에서 셋, 22-54에서 넷, 22-55에서 색으로).
//
// 실제로 났던 일: 중단원·소단원·소소단원이 전부 같은 흰 카드로 나와서 어느 것이 어느 층인지
// 알 수 없었다. 22-54에서 바탕을 흰색으로 바꾸고 층을 네 겹 회색으로 세웠지만, 네 겹이 모두
// 옅은 회색이라 층간 대비가 1.09·1.09·1.07밖에 되지 않아 여전히 눈으로 갈리지 않았다.
// 농도는 「조금 더 진하다」까지만 말할 수 있다.
//
// 규칙은 다섯이다.
//   ① 바탕은 흰색이다.
//   ② 층은 농도가 아니라 색으로 가른다 — 맨 위는 어두운 바탕에 흰 글자, 내려갈수록 옅어져
//      맨 아래가 흰색이다. 흰색은 맨 아래 한 층에만 쓴다(세 겹 안이라 바탕과 맞닿지 않는다).
//   ③ 색을 새로 만들지 않는다 — 상단 브랜드 띠가 쓰는 --navy 하나와 그것을 흰색에 섞은 톤뿐이다.
//   ④ 색만으로 알리지 않는다 — 들여쓰기(--fold-indent)와 왼쪽 선(--fold-edge)과 세모가 함께 말한다.
//   ⑤ 초록(지금 여기부터 하세요)과 갈색(이 화면에서 할 수 있는 일)은 뜻이 있으므로 층에 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/styles.css', 'utf8');
// 층 규칙만 잘라 본다. 뒤에 붙는 다른 규칙까지 함께 보면 엉뚱한 것을 잡는다.
const section = (from, to) => css.slice(css.indexOf(from), to ? css.indexOf(to) : undefined);
const block = section('/* 접기 네 층 (22-48에서 셋', '/* 층마다 제목 글자도 다르게 (22-50)');

// 밝기와 대비. 층이 정말로 갈리는지는 눈이 아니라 이 숫자로 지킨다.
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lum = hex => {
  const lin = c => (c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const NAVY = (css.match(/--navy:(#[0-9a-f]{6})/) || [])[1];

test('바탕은 흰색이다', () => {
  assert.match(css, /^:root\{[^}]*background:#fff;/);
  // 어디에서도 예전 베이지를 다시 칠하지 않는다(까닭을 적은 주석에는 남는다).
  assert.ok(!/background:\s*#faf6f0/.test(css), '예전 베이지 바탕이 남아 있다');
});

test('맨 위 층은 어두운 바탕에 흰 글자다', () => {
  // 22-54는 회색 위에 검은 글자여서 화면 제목이 묻혔다. 이제 화면을 열면 그것이 가장 먼저 읽힌다.
  assert.match(block, /--fold-0:var\(--navy\);/);
  assert.match(block, /--fold-0-ink:#fff;/);
  assert.match(block, /\.page-heading,\.document-toolbar\{background:var\(--fold-0\);color:var\(--fold-0-ink\)/);
  // 제목 줄 안의 설명글도 어두운 바탕에서 읽혀야 한다.
  assert.match(block, /\.page-heading p,\.document-toolbar p,[\s\S]{0,160}color:var\(--fold-0-dim\)\}/);
  const dim = (block.match(/--fold-0-dim:(#[0-9a-f]{6});/) || [])[1];
  assert.ok(contrast('#ffffff', NAVY) >= 7, '흰 글자가 어두운 층에서 읽히지 않는다');
  assert.ok(contrast(dim, NAVY) >= 4.5, `옅은 글자(${dim})가 어두운 층에서 읽히지 않는다`);
});

test('가운데 두 층은 그 색을 흰색에 섞은 톤이다 — 새 색을 만들지 않는다', () => {
  const mid = ['--fold-1', '--fold-2'].map(name => (block.match(new RegExp(`${name}:(#[0-9a-f]{6});`)) || [])[1]);
  assert.ok(mid.every(Boolean), `가운데 층 색이 빠졌다: ${mid.join(' ')}`);
  const navy = rgb(NAVY);
  for (const tone of mid) {
    // 흰색과 --navy를 잇는 선 위에 있으면 섞은 톤이다. 벗어나면 새로 만든 색이다.
    const ratios = rgb(tone).map((c, i) => (255 - c) / (255 - navy[i]));
    const spread = Math.max(...ratios) - Math.min(...ratios);
    assert.ok(spread < 0.02, `${tone}이 --navy와 흰색을 잇는 선 위에 있지 않다`);
  }
  // 맨 아래 한 층만 흰색이다. 세 겹 안이라 바탕과 맞닿지 않는다.
  assert.match(block, /--fold-3:#fff;/);
});

test('층이 내려갈수록 밝아지고 이웃한 층이 눈으로 갈린다', () => {
  const tones = [NAVY, ...['--fold-1', '--fold-2'].map(n => (block.match(new RegExp(`${n}:(#[0-9a-f]{6});`)) || [])[1]), '#ffffff'];
  for (let i = 1; i < tones.length; i += 1) {
    assert.ok(lum(tones[i]) > lum(tones[i - 1]), `${i}층이 위층보다 밝지 않다: ${tones.join(' → ')}`);
  }
  // 22-54는 층간이 1.09·1.09·1.07이라 갈리지 않았다. 맨 위 한 칸이 그때 전체보다 커야 한다.
  assert.ok(contrast(tones[0], tones[1]) >= 4, `대단원과 중단원이 갈리지 않는다 (${contrast(tones[0], tones[1]).toFixed(2)})`);
  assert.ok(contrast(tones[1], tones[2]) >= 1.2, `중단원과 소단원이 갈리지 않는다 (${contrast(tones[1], tones[2]).toFixed(2)})`);
  // 중단원 카드는 흰 바탕에서도 떠올라야 한다.
  assert.ok(contrast(tones[1], '#ffffff') >= 1.3, '중단원 카드가 바탕에서 떠오르지 않는다');
});

test('층마다 그 변수를 읽고 값을 손으로 다시 적지 않는다', () => {
  assert.match(block, /\.card,[^{]*\{background:var\(--fold-1\)\}/);
  assert.match(block, /\.card \.card,\.card\[data-detail-group\],\.add-fold\{background:var\(--fold-2\)\}/);
  assert.match(block, /\.card \.card \.card,\.year-fold,\[data-detail-group\] \.card\.org-details\{background:var\(--fold-3\)\}/);
  // 카드·연도·홈 카드·화면 띠가 저마다 색을 다시 적던 자리가 없어야 한다.
  for (const selector of ['.card{', '.year-fold{', '.landing-card{', '.home-step{', '.home-card{', '.home-empty{', '.home-shot{', '.doc-toolbelt{', '.pipeline{']) {
    const rule = css.slice(css.indexOf(selector), css.indexOf(selector) + 260).split('}')[0];
    assert.ok(!/background:(#|var\(--fold)/.test(rule), `${selector} 이 배경을 다시 적는다`);
  }
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
  // 초록 = 지금 여기부터 하세요, 갈색 = 이 화면에서 할 수 있는 일, 이 색 = 몇 층인가.
  assert.ok(!block.includes('var(--go)'), '다음 할 일 초록을 층 구분에 썼다');
  assert.ok(!block.includes('var(--blue)'), '주 버튼 갈색을 층 구분에 썼다');
  assert.ok(!block.includes('var(--green)'));
});

test('보관함의 연도 묶음도 같은 변수를 읽는다', () => {
  assert.match(block, /\.archive-year\{margin-left:var\(--fold-indent\);border-left:3px solid var\(--fold-edge\)/);
});

// ---------- 22-50: 층마다 제목 글자 ----------
const type = section('/* 층마다 제목 글자도 다르게 (22-50)', '/* 초록 버튼은 맨 위 띠 하나뿐이다(22-52)');

test('제목 크기와 농도를 변수 한 곳에서 정한다', () => {
  for (const name of ['--fold-title-1:16px', '--fold-title-2:15px', '--fold-title-3:14px', '--fold-ink-2:#4a3d33', '--fold-ink-3:#6a5b50']) {
    assert.ok(type.includes(name), `${name}이 없다`);
  }
  // 값을 손으로 다시 적지 않는다. 층마다 변수를 읽는다.
  const sizes = [...new Set([...type.matchAll(/font-size:([^;}]+)/g)].map(match => match[1]))];
  assert.ok(sizes.every(size => size.startsWith('var(--fold-')), `변수가 아닌 크기가 있다: ${sizes.join(' ')}`);
});

test('굵기는 400과 500 둘뿐이다', () => {
  assert.match(type, /--fold-weight:500;/);
  assert.match(type, /--fold-weight-plain:400;/);
  const weights = [...new Set([...type.matchAll(/font-weight:([^;}]+)/g)].map(match => match[1]))];
  assert.ok(weights.every(weight => weight.startsWith('var(--fold-weight')), `600·700이 남아 있다: ${weights.join(' ')}`);
});

test('제목에 새 색을 쓰지 않는다', () => {
  assert.ok(!type.includes('var(--go)') && !type.includes('var(--blue)') && !type.includes('var(--green)'));
  // 농도는 기존 잉크색에서만 내려온다.
  assert.match(type, /--fold-ink-1:var\(--ink\)/);
});

test('부제는 층과 상관없이 한 가지다', () => {
  // 층은 제목·배경·들여쓰기 셋이 이미 말한다. 부제까지 층을 따라가면 잡음이 된다.
  assert.match(type, /--fold-sub-size:12px;/);
  const sub = type.slice(type.indexOf('.org-details>summary small'));
  assert.match(sub, /font-size:var\(--fold-sub-size\);font-weight:var\(--fold-weight-plain\);color:var\(--muted\)/);
});

// ---------- 22-53③: 접히는 줄인지 눈에 보이게 ----------
//
// 실제로 났던 일: 「무엇을 채웠고 무엇이 비었나」·「기본정보 · 마인드스토리」·「입력 후보」·
// 「상세정보 (선택)」가 모두 같은 흰 카드로 나와서, 어느 것이 눌러서 펼치는 줄인지 알 수 없었다.
// 배경 농도(22-48)와 제목 글자(22-50)는 「몇 층인가」를 말할 뿐 「눌러서 펴는가」는 말하지 않는다.
const mark = section('/* 접힌 줄인지 눈에 보이게 (22-53③)');

test('접히는 줄에는 모두 세모가 붙는다', () => {
  // 네 층 어디서나 같은 표시다. 층은 배경·들여쓰기·글자가 이미 말한다.
  assert.match(mark, /\.org-details>summary::before,\.year-fold>summary::before,\.item-fold>summary::before,\.add-fold>summary::before\{/);
  // 펼치면 아래를 가리킨다.
  assert.match(mark, /\.org-details\[open\]>summary::before,[\s\S]{0,160}\{transform:rotate\(90deg\)\}/);
});

test('세모는 글자가 아니라 테두리로 그린다', () => {
  // 「▸」는 글꼴에 없으면 네모로 뜬다. 테두리로 그리면 어느 컴퓨터에서나 같은 모양이 나온다.
  assert.match(mark, /content:'';/);
  assert.match(mark, /border-left:calc\(var\(--fold-mark-size\) \* 1\.6\) solid var\(--fold-mark\)/);
  assert.match(mark, /border-top:var\(--fold-mark-size\) solid transparent;border-bottom:var\(--fold-mark-size\) solid transparent/);
  assert.match(mark, /--fold-mark:#a2968a;--fold-mark-size:5px/);
});

test('브라우저가 그리던 표시는 지우고 우리 것 하나만 남긴다', () => {
  // summary 를 display:flex 로 두면 브라우저 삼각형이 사라진다. 그것이 22-53③의 뿌리였다.
  // 다시 살릴 수는 없으므로 우리가 그리고, 남아 있을지 모를 기본 표시는 지워 둘이 되지 않게 한다.
  assert.match(css, /\.org-details>summary\{display:flex/);
  assert.match(mark, /\.org-details>summary,\.year-fold>summary,\.item-fold>summary,\.add-fold>summary\{list-style:none\}/);
  assert.match(mark, /::-webkit-details-marker\{display:none\}/);
  assert.match(mark, /::marker\{content:''\}/);
});

test('세모 색은 새로 만들지 않는다', () => {
  // 초록(다음 할 일)과 갈색(주 버튼)은 이미 뜻이 있다. 세모는 옅은 잉크 하나만 쓴다.
  assert.ok(!mark.includes('var(--blue)') && !mark.includes('var(--green)'));
  // 다만 「다음 할 일」이 가리키는 줄에서는 세모도 초록이다. 자리를 함께 말한다.
  assert.match(mark, /\.go-place>summary::before\{border-left-color:var\(--go\)\}/);
});

// ---------- 22-54③: 같은 중단원이면 글자도 같다 ----------
//
// 실제로 났던 일: 한 화면 안에서 「공고 × 신청기관 비교」는 굵고 크고
// 「기본정보 · 마인드스토리」는 작아 보였다. 둘 다 화면에 바로 놓인 카드, 곧 같은 중단원인데도.
//
// 까닭은 h2와 summary의 차이가 아니라 **h3와 summary의 차이**였다.
// 접히는 중단원은 제목을 summary 안의 b가 들어 22-50이 정한 값을 따랐고,
// 접히지 않는 중단원은 제목이 h3라 브라우저 기본값(1.17em ≈ 18.7px · 700)이 그대로 나왔다.
test('중단원 제목은 접히든 안 접히든 같은 크기·같은 굵기다', () => {
  const summary = type.match(/\.card\.org-details>summary\{([^}]*)\}/)[1];
  const heading = type.match(/\.card>h3,\.card>\.card-title h3\{([^}]*)\}/)[1];
  assert.equal(heading, summary, `중단원 제목이 둘로 갈린다:\n  summary ${summary}\n  h3      ${heading}`);
  assert.match(summary, /font-size:var\(--fold-title-1\);font-weight:var\(--fold-weight\)/);
});

test('소단원 제목도 접히든 안 접히든 같다', () => {
  const rule = type.match(/\.card\[data-detail-group\]>summary,\.add-fold>summary,\s*\n\.card \.card>h3,\.card \.card>\.card-title h3\{([^}]*)\}/);
  assert.ok(rule, '소단원의 접는 제목과 h3 제목이 한 규칙에 묶여 있지 않다');
  assert.match(rule[1], /font-size:var\(--fold-title-2\);font-weight:var\(--fold-weight\)/);
});

test('대단원 제목 크기도 같은 변수에서 온다', () => {
  assert.match(type, /--fold-title-0:27px;/);
  // 화면 제목 줄이 값을 손으로 다시 적지 않는다.
  assert.match(css, /\.page-heading h2,\.document-toolbar h2\{margin:0;font-size:var\(--fold-title-0\)\}/);
  // 화면 제목을 그리는 어느 자리도 27px를 손으로 다시 적지 않는다.
  assert.ok(!/.(page-heading|document-toolbar|compact-intro) h2{[^}]*27px/.test(css), '27px를 손으로 다시 적는 자리가 남아 있다');
});
