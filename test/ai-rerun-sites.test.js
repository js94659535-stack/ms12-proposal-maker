// 끝난 뒤 다시 눌러도 또 나가던 자리들 (23-17).
//
// 실제로 났던 일: 막고 있던 것이 `state.busy` 하나뿐이라 **도는 동안만** 막혔다.
// 끝나고 같은 단추를 다시 누르면 같은 입력으로 또 나갔다. 한 번에 77~404원이다.
// 23-16 실측에서 깨끗한 한 번(약 1,300원)과 실제 계획서 하나(4,774원)가 3.5배 벌어졌고,
// 그 차이를 만드는 자리가 여기다.
//
// 「심사 검토」가 쓰던 입력 지문(SHA-256) 대조를 나머지에 옮기고, 판정은 한 곳으로 모았다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');

// 자리마다 「어디까지가 그 함수인가」와 「무엇이 돈 드는 호출인가」.
const SITES = [
  { name: '심사 검토', from: 'async function runProposalReview(force = false) {', spend: "fetch('/api/proposal-review'" },
  { name: '정밀 검증', from: 'async function runPreciseReview(round = 1) {', spend: 'preciseReviewWithAI(' },
  { name: '계획서 전체 검증', from: 'async function runProposalCoaching() {', spend: "coachingRequest({ action: 'startCoaching'" },
  { name: '지역 현황', from: 'async function runRegionBrief() {', spend: 'regionBriefWithAI(' }
];
const regionOf = site => {
  const at = app.indexOf(site.from);
  assert.ok(at > 0, `${site.name} 함수를 못 찾았다`);
  const spend = app.indexOf(site.spend, at);
  assert.ok(spend > at, `${site.name}에서 돈 드는 호출을 못 찾았다`);
  return { at, spend, body: app.slice(at, spend) };
};

test('★ 네 자리 모두 돈 쓰기 전에 지문을 견준다', () => {
  for (const site of SITES) {
    const { body } = regionOf(site);
    assert.ok(body.includes('shouldRunAgain('), `${site.name}: 판정을 부르지 않는다`);
    assert.ok(body.includes('sha256Text('), `${site.name}: 입력 지문을 만들지 않는다`);
    // 지문을 만든 뒤에 판정한다. 순서가 뒤바뀌면 늘 「달라졌다」가 된다.
    assert.ok(body.indexOf('sha256Text(') < body.indexOf('shouldRunAgain('), `${site.name}: 판정이 지문보다 먼저다`);
  }
});

test('견줄 지문을 결과와 함께 남긴다', () => {
  // 남기지 않으면 다음 누름에서 견줄 것이 없어 늘 다시 부른다.
  assert.match(app, /state\.preciseReview = \{ round, issues, summary: reviewSummary\(issues\), fingerprint: sectionsFingerprint\(state\.sections\), inputFingerprint,/);
  assert.match(app, /state\.coaching = \{ \.\.\.state\.coaching, inputFingerprint \};/);
  assert.match(app, /regionBrief: \{ \.\.\.result, inputFingerprint \}/);
  // 심사 검토는 예전부터 제 자리에 남기고 있었다.
  assert.match(app, /state\.reviewFingerprint/);
});

test('판정은 한 곳에서만 한다', () => {
  // 판정 함수는 하나뿐이고, 23-11이 쓰던 옛 이름은 남아 있지 않다.
  assert.equal(fs.existsSync(new URL('../src/design-rerun.js', import.meta.url)), false, '옛 판정 파일이 남아 있다');
  assert.ok(!app.includes('shouldRunDesign'), '옛 이름을 아직 부른다');
  assert.match(app, /import \{ shouldRunAgain \} from '\.\/ai-rerun\.js';/);
  // 설계도 같은 판정을 읽는다. 자리마다 조건을 따로 적지 않는다.
  assert.match(app, /shouldRunAgain\(\{ redo: options\?\.redo === true, hasResult: Boolean\(state\.stagedGeneration\?\.master\), inputChanged: noticeLogicStale\(\) \}\)/);
  // 부르는 자리는 다섯. 늘어나면 이 숫자가 걸린다.
  assert.equal([...app.matchAll(/shouldRunAgain\(/g)].length, 5);
});

test('「다시 만들라」가 뜻인 자리는 그대로 둔다', () => {
  // 문서를 고치는 자리는 다시 누르는 것 자체가 「또 고쳐 줘」다. 지문으로 막으면 안 된다.
  for (const [name, from, next] of [
    ['문제 구간 수정', 'async function applyPreciseFixes() {', 'patchSectionsWithAI('],
    ['진단서', 'async function runDiagnosis() {', 'diagnoseWithAI(']
  ]) {
    const at = app.indexOf(from);
    assert.ok(at > 0, `${name} 함수를 못 찾았다`);
    const body = app.slice(at, app.indexOf(next, at));
    assert.ok(!body.includes('shouldRunAgain('), `${name}에 지문 대조가 붙었다`);
  }
  // 설계와 심사 검토는 「다시 만들기」를 부르는 쪽이 redo로 말한다.
  assert.equal([...app.matchAll(/generateCompleteProposal\(\{ redo: true \}\)/g)].length, 2);
  assert.match(app, /runProposalReview\(Boolean\(state\.reviewResult\)\)/);
});
