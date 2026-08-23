// 설계를 다시 만들 것인가 (23-11).
//
// 실제로 났던 일: 「선택 완료 · 다음 단계」를 끝난 뒤 한 번 더 눌렀더니 공고 분석이 다시 돌았다.
// 막고 있던 것은 `state.busy` 하나뿐이라 도는 동안만 막혔고, 끝나고 나면 아무것도 막지 않았다.
// AI 호출이라 누를 때마다 돈이 든다.
//
// `ensureNoticeLogic()`은 이 일과 상관이 없다. 그것은 「없으면 만든다」이고 AI를 부르지 않는다.
// 돈이 드는 것은 `masterWithAI` 한 걸음이고, 그 걸음의 화면 문구가 「공고문을 분석하고…」다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldRunDesign } from '../src/design-rerun.js';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');

test('만들어 둔 것이 없으면 만들고, 있으면 만들지 않는다', () => {
  assert.equal(shouldRunDesign({ hasMaster: false }), true);
  assert.equal(shouldRunDesign({ hasMaster: true }), false);
  // 아무것도 넘기지 않아도 「없다」로 본다 — 첫 호출을 막지 않는다.
  assert.equal(shouldRunDesign(), true);
  assert.equal(shouldRunDesign({}), true);
});

test('다시 만들라는 뜻인 자리는 언제나 만든다', () => {
  for (const hasMaster of [false, true]) {
    for (const noticeChanged of [false, true]) assert.equal(shouldRunDesign({ redo: true, hasMaster, noticeChanged }), true);
  }
});

test('공고가 바뀌었으면 앞 공고의 설계를 쓰지 않는다', () => {
  assert.equal(shouldRunDesign({ hasMaster: true, noticeChanged: true }), true);
  assert.equal(shouldRunDesign({ hasMaster: true, noticeChanged: false }), false);
});

test('★ 결과가 있는 상태에서 두 번 눌러도 호출은 한 번이다', () => {
  // 화면을 그리지 않고 누름을 흉내 낸다. 누를 때마다 판정을 묻고, 만들었으면 결과가 남는다.
  let calls = 0;
  const state = { master: null, noticeTitle: '가 공고', analysedTitle: '' };
  const press = ({ redo = false } = {}) => {
    if (!shouldRunDesign({ redo, hasMaster: Boolean(state.master), noticeChanged: Boolean(state.analysedTitle) && state.analysedTitle !== state.noticeTitle })) return;
    calls += 1;
    state.master = { at: calls };
    state.analysedTitle = state.noticeTitle;
  };
  press();
  press();
  press();
  assert.equal(calls, 1, `세 번 눌러 ${calls}번 불렀다`);
  // 「설계 다시 만들기」는 그대로 다시 만든다.
  press({ redo: true });
  assert.equal(calls, 2);
  // 공고를 바꾸면 앞 설계를 쓰지 않는다.
  state.noticeTitle = '나 공고';
  press();
  assert.equal(calls, 3);
  press();
  assert.equal(calls, 3, '같은 공고인데 또 불렀다');
});

// ---------- 부르는 자리 ----------

test('판정이 돈 드는 걸음보다 먼저 온다', () => {
  const from = app.indexOf('async function generateCompleteProposal(');
  const to = app.indexOf('function generationPayload()');
  assert.ok(from > 0 && to > from);
  const region = app.slice(from, to);
  const guard = region.indexOf('shouldRunDesign(');
  const spend = region.indexOf("setAiBusy('공고문을 분석하고");
  assert.ok(guard > 0, '판정을 부르지 않는다');
  assert.ok(spend > 0 && guard < spend, '판정이 AI 호출 뒤에 있다');
  // 막는 것이 busy 하나뿐이던 때로 돌아가지 않는다.
  assert.match(region, /if \(aiBusy\('이미 계획서를 만들고 있습니다'\)\) return;/);
});

test('앞으로 가는 단추는 redo로 부르지 않는다', () => {
  // 「선택 완료 · 다음 단계」·「사업계획서 작성 →」·「초안 작성」은 앞으로 가라는 뜻이다.
  assert.match(app, /#proceed-selected-notice'\)\?\.addEventListener\('click', \(\) => generateCompleteProposal\(\)\);/);
  assert.match(app, /analyzeButton\.addEventListener\('click', \(\) => generateCompleteProposal\(\)\);/);
  assert.match(app, /#blueprint-draft'\)\?\.addEventListener\('click', createDraft\);/);
  // 「설계 다시 만들기」와 실행계약서 충돌 반영만 다시 만든다.
  assert.match(app, /#regenerate-design'\)\?\.addEventListener\('click', \(\) => generateCompleteProposal\(\{ redo: true \}\)\);/);
  assert.equal([...app.matchAll(/generateCompleteProposal\(\{ redo: true \}\)/g)].length, 2);
  // 클릭 처리기로 함수를 그대로 넘기지 않는다 — 그러면 MouseEvent가 첫 인자로 들어간다.
  assert.ok(!/addEventListener\('click', generateCompleteProposal\)/.test(app));
});
