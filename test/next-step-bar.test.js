// 「다음 할 일」 띠는 한 함수가 그린다 (23-03).
//
// 실제로 났던 일: 두 화면이 거의 같은 .next-step-bar HTML을 각자 적고 있었다.
// 곧 사업 설계 화면에 셋째가 붙을 참이라, 그 전에 하나로 모았다(22-01에서 중분류 열두 자리를
// section() 하나로 모은 것과 같은 작업이다).
//
// 화면이 다른 것은 셋뿐이다 — 상자 이름표(id), 버튼 이름표(actionId), 처리기가 읽을 값(data-*).
// 문구·done 여부·클래스는 모두 판정 결과가 그대로 채운다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');
const bar = app.slice(app.indexOf('function stepBar(step, {'), app.indexOf('function bindNextStepBar('));

test('세 화면이 같은 함수를 부른다', () => {
  const org = app.slice(app.indexOf('function orgNextStepBar()'), app.indexOf('// 올린 자료에 답이 있는 칸을 화면을 그릴 때마다 채운다.'));
  const pick = app.slice(app.indexOf('function applicantPickBar()'), app.indexOf('function applicantSelectView()'));
  const design = app.slice(app.indexOf('function designNextStepBar()'), app.indexOf('function businessSelectView()'));
  assert.match(org, /return stepBar\(step, \{/);
  assert.match(pick, /return stepBar\(step, \{/);
  assert.match(design, /return stepBar\(step, \{/);
  assert.doesNotMatch(design, /class="next-step-bar/);
  // 어느 화면도 띠 HTML을 스스로 적지 않는다.
  assert.doesNotMatch(org, /class="next-step-bar/);
  assert.doesNotMatch(pick, /class="next-step-bar/);
  // 앱 전체에서 이 띠를 그리는 자리는 한 곳뿐이다.
  assert.equal([...app.matchAll(/class="next-step-bar/g)].length, 1);
  assert.equal([...app.matchAll(/class="button go next-step"/g)].length, 1);
});

test('화면이 넘기는 것은 이름표 둘과 데이터뿐이다', () => {
  assert.match(bar, /function stepBar\(step, \{ id, actionId, data = \{\} \}\)/);
  // 문구·done·클래스는 판정 결과에서 온다. 화면이 고를 수 있는 것이 아니다.
  assert.match(bar, /class="next-step-bar\$\{step\.done \? ' done' : ''\}" id="\$\{id\}"/);
  assert.match(bar, /\$\{step\.done \? '다 됐습니다' : '다음 할 일'\}/);
  assert.match(bar, /<strong>\$\{escapeHtml\(step\.message\)\}<\/strong>/);
  assert.match(bar, /<button class="button go next-step" id="\$\{actionId\}"\$\{marks\}>\$\{escapeHtml\(step\.actionLabel\)\}<\/button>/);
  // data-* 는 이름과 값을 그대로 받아 붙인다. 화면마다 개수가 다르다.
  assert.match(bar, /Object\.entries\(data\)\.map\(\(\[name, value\]\) => ` data-\$\{name\}="\$\{escapeHtml\(value\)\}"`\)\.join\(''\)/);
});

test('그려지는 글자가 작업 전과 같다', () => {
  // 23-03은 옮기기만 했다. 두 화면이 넘기는 값이 예전에 그 자리에 박혀 있던 것과 같아야 한다.
  const org = app.slice(app.indexOf('function orgNextStepBar()'), app.indexOf('// 올린 자료에 답이 있는 칸을 화면을 그릴 때마다 채운다.'));
  assert.match(org, /id: 'next-step-bar',/);
  assert.match(org, /actionId: 'next-step-action',/);
  assert.match(org, /data: \{ 'next-key': step\.key, 'next-bulk': bulk \? '1' : '', 'next-anchor': nextStepAnchor\(step\) \}/);
  const pick = app.slice(app.indexOf('function applicantPickBar()'), app.indexOf('function applicantSelectView()'));
  assert.match(pick, /id: 'pick-step-bar',/);
  assert.match(pick, /actionId: 'pick-step-action',/);
  assert.match(pick, /data: \{ 'pick-key': step\.key \}/);
});

test('초록은 화면마다 이 띠 하나뿐이다', () => {
  // 꽉 찬 초록(.button.go)이 그려지는 자리는 앱 전체에서 stepBar 안의 한 줄이다.
  // 화면마다 띠가 하나씩 놓이므로, 화면에서 보이는 꽉 찬 초록도 하나다.
  assert.equal([...bar.matchAll(/class="button go(?![-\w])/g)].length, 1);
  const view = app.slice(app.indexOf('function applicantsToolView()'), app.indexOf('function applicantSourcesView('));
  assert.equal([...view.matchAll(/\$\{orgNextStepBar\(\)\}/g)].length, 1);
  const pickView = app.slice(app.indexOf('function applicantSelectView()'), app.indexOf('function applicantLoadedView('));
  assert.equal([...pickView.matchAll(/\$\{applicantPickBar\(\)\}/g)].length, 1);
  // 23-04에서 셋째가 붙었다. 이 화면도 띠 하나뿐이다.
  const designView = app.slice(app.indexOf('function businessSelectView()'), app.indexOf('function applicantStatusTag('));
  assert.equal([...designView.matchAll(/\$\{designNextStepBar\(\)\}/g)].length, 1);
  assert.equal([...designView.matchAll(/class="button go(?![-\w])/g)].length, 0);
});

test('누르면 열고 나서 데려간다 — 차례는 한 곳에서만 지킨다', () => {
  const order = app.slice(app.indexOf('function bindNextStepBar(actionId, decide)'), app.indexOf('function orgNextStepBar()'));
  // 그 자리에서 끝내는 갈래는 열지도 데려가지도 않는다(실적 일괄 확인·다음 단계로 나가기).
  assert.match(order, /if \(plan\.act\) return void plan\.act\(\);/);
  // 여는 것이 먼저, 데려가는 것이 나중. 뒤집히면 닫힌 자리를 보여 준 뒤가 된다(22-01).
  assert.ok(order.indexOf('if (plan.open) plan.open();') < order.indexOf('if (plan.go) plan.go();'),
    '데려간 뒤에 여는 차례가 되었다');
  // 두 화면 모두 이 함수로 처리기를 단다. 각자 addEventListener를 걸지 않는다.
  assert.equal([...app.matchAll(/bindNextStepBar\('/g)].length, 3);
  assert.doesNotMatch(app, /querySelector\('#next-step-action'\)\?\.addEventListener/);
  assert.doesNotMatch(app, /querySelector\('#pick-step-action'\)\?\.addEventListener/);
});

test('스크롤 도우미는 그려진 띠에게 묻는다 — 세 화면 모두', () => {
  // 23-03까지는 어느 화면에 있든 기관정보 화면의 판정만 읽었다. 셋째 띠가 붙으면서
  // 그려진 띠에게 묻도록 바꿨다(23-04). 화면이 늘어도 이 함수는 그대로다.
  const scroll = app.slice(app.indexOf('function scrollToNextStep()'), app.indexOf('// 소개 화면에는 폼이 없다'));
  assert.match(scroll, /querySelector\('#next-step-action, #pick-step-action, #design-step-action'\)/);
  assert.doesNotMatch(scroll, /orgStepInfo\(\)/);
  // 띠로는 데려가지 않는다 — 띠는 이미 화면 맨 위라 제자리걸음이다.
  assert.match(scroll, /const target = document\.querySelector\('\.go-target'\) \|\| document\.querySelector\('\.go-place'\);/);
});
