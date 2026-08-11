// 홈 화면 상단 바. 눌러도 아무 일이 없는 단추가 없는지 하나씩 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const home = app.slice(app.indexOf('function homeView()'), app.indexOf('function stageHero('));

test('구역 이동 단추가 가리키는 구역이 실제로 있다', () => {
  const targets = [...app.matchAll(/data-home-scroll="([a-z-]+)"/g)].map(match => match[1]);
  assert.ok(targets.length >= 3, '구역 이동 단추를 찾지 못했다');
  for (const id of new Set(targets)) {
    assert.ok(app.includes(`id="${id}"`), `data-home-scroll="${id}"가 가리키는 구역이 없다`);
  }
});

test('제품소개는 이미 보이는 히어로가 아니라 아래 구역으로 내려간다', () => {
  // 히어로에 붙어 있으면 맨 위에서 눌렀을 때 화면이 움직이지 않아 고장처럼 보인다.
  assert.doesNotMatch(app, /<section class="home-hero" id="home-product">/);
  assert.match(app, /<section class="home-section" id="home-product">\s*\n\s*<div class="home-head"><h2>서비스 화면<\/h2>/);
  // 히어로는 화면 맨 위에 있으므로 이동 대상이 아니다.
  const heroIndex = app.indexOf('<section class="home-hero"');
  const productIndex = app.indexOf('id="home-product"');
  assert.ok(heroIndex < productIndex, '제품소개 대상이 히어로보다 아래에 있어야 움직인다');
});

test('갈 곳이 없는 뒤로·앞으로는 눌리지 않는다', () => {
  // 작업 화면 헤더와 홈 내비게이션이 같은 기준을 쓴다.
  assert.equal((app.match(/id="workflow-back"[^>]*navigationHistory\.backStack\.length \? '' : 'disabled'/g) || []).length, 2);
  assert.equal((app.match(/id="workflow-forward"[^>]*navigationHistory\.forwardStack\.length \? '' : 'disabled'/g) || []).length, 2);
});

test('갈 곳이 없으면 화면 위치를 바꿔 두지 않는다', () => {
  // 바꿔 놓고 되돌리지 않으면 다음 렌더에서 홈이 사라진다.
  assert.match(app, /#workflow-back'\)\?\.addEventListener\('click', \(\) => \{ if \(!navigationHistory\.backStack\.length\) return; state\.activeTool = 'workflow'; navigateBack\(\); \}\)/);
  assert.match(app, /#workflow-forward'\)\?\.addEventListener\('click', \(\) => \{ if \(!navigationHistory\.forwardStack\.length\) return; state\.activeTool = 'workflow'; navigateForward\(\); \}\)/);
});

test('상단 바의 나머지 단추도 모두 처리기가 있다', () => {
  // 홈 내비게이션에 있는 모든 단추의 식별자·속성을 뽑아 처리기와 맞춰 본다.
  const nav = home.slice(home.indexOf('<nav class="home-nav">'), home.indexOf('</nav>'));
  const attributes = new Set([...nav.matchAll(/(id|data-[a-z-]+)="([^"$]*)"/g)].map(match => (match[1] === 'id' ? `#${match[2]}` : `[${match[1]}]`)));
  for (const hook of attributes) {
    if (hook === '#app') continue;
    const bound = hook.startsWith('#')
      ? app.includes(`querySelector('${hook}')`)
      : app.includes(`querySelectorAll('${hook}')`);
    assert.ok(bound, `${hook}에 연결된 처리기가 없다`);
  }
  // 포털 단추는 함수가 만들어 넣는다.
  assert.match(nav, /\$\{portalLinks\('button ghost'\)\}/);
  assert.match(app, /querySelectorAll\('\[data-portal\]'\)/);
});
