// 아코디언 열림 판정을 값으로 지킨다 (22-27 · 24-07에서 여럿으로).
//
// 실제로 났던 일: 「눌렀을 때 나머지가 닫히는가」를 확인하지 못했다. 계산이 클릭 처리기 안에 있어
// 브라우저 없이는 부를 수 없었고, 시험은 코드를 읽는 데 그쳤다. 그래서 계산만 따로 뺐다.
//
// 상태값의 뜻은 셋이다.
//   undefined — 아직 고르지 않았다 (「다음 할 일」이 가리키는 것을 연다)
//   []        — 사람이 모두 닫아 두었다 (아무것도 열지 않는다)
//   [...]     — 사람이 열어 둔 것들
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextOpenGroups, resolveOpenGroups, sameOpenGroups } from '../src/accordion-state.js';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');
const sorted = list => [...list].sort();

// ---------- a. 눌렀을 때 다음에 열릴 것 ----------

test('열려 있던 것을 다시 누르면 그것만 닫힌다', () => {
  assert.deepEqual(nextOpenGroups(['detail'], 'detail'), []);
  // ★ 이 작업의 핵심: 옆엣것은 그대로 열려 있다.
  assert.deepEqual(sorted(nextOpenGroups(['detail', 'sources', 'basic'], 'sources')), ['basic', 'detail']);
});

test('★ 둘을 열면 둘 다 열려 있다', () => {
  let open = nextOpenGroups(undefined, 'detail');
  assert.deepEqual(open, ['detail']);
  open = nextOpenGroups(open, 'sources');
  assert.deepEqual(sorted(open), ['detail', 'sources'], '앞엣것이 닫혔다');
  open = nextOpenGroups(open, 'basic');
  assert.deepEqual(sorted(open), ['basic', 'detail', 'sources']);
});

test('아무것도 열려 있지 않을 때 누르면 그것이 열린다', () => {
  assert.deepEqual(nextOpenGroups([], 'basic'), ['basic']);
  assert.deepEqual(nextOpenGroups(undefined, 'basic'), ['basic']);
});

test('같은 것을 두 번 담지 않는다', () => {
  const open = nextOpenGroups(['staff', 'staff'], 'budget');
  assert.deepEqual(sorted(open), ['budget', 'staff']);
});

// ---------- b. 실제로 그릴 때 열리는 것 ----------

test('★ 처음 열리는 것은 예전과 같다 — 「다음 할 일」이 가리키는 것 하나', () => {
  // 여럿을 담게 되었어도 사람이 손대기 전에는 하나만 열린다. 처음 보이는 화면은 그대로다.
  assert.deepEqual(resolveOpenGroups(undefined, 'detail', 'picker'), ['detail']);
});

test('가리키는 것이 없으면 첫 번째를 연다', () => {
  assert.deepEqual(resolveOpenGroups(undefined, '', 'picker'), ['picker']);
  // 첫 번째도 없으면 아무것도 열지 않는다. 구역 여덟은 이 길로 온다 —
  // 아무거나 하나를 열어 두면 그 구역만 특별해진다.
  assert.deepEqual(resolveOpenGroups(undefined, '', ''), []);
});

test('사람이 모두 닫아 두었으면 아무것도 열지 않는다', () => {
  assert.deepEqual(resolveOpenGroups([], 'detail', 'picker'), []);
});

test('사람이 연 것이 있으면 그것들이다', () => {
  assert.deepEqual(resolveOpenGroups(['sources', 'basic'], 'detail', 'picker'), ['sources', 'basic']);
});

// ---------- c. 닫아 둔 것을 되살리지 않는다 ----------

test('★ 닫아 둔 뒤에는 「다음 할 일」이 어디를 가리켜도 열리지 않는다', () => {
  // 여기서 열리면 사람이 닫은 것을 화면이 무릅쓰는 것이고, undefined와 []를 나눈 뜻이 사라진다.
  // 「다음 할 일」은 자료가 조금만 달라져도 옮겨 간다 — 확인 한 건만 눌러도 가리키는 곳이 바뀐다.
  // 그때마다 닫아 둔 칸이 되살아나면 사람은 같은 칸을 몇 번이고 다시 닫아야 한다.
  for (const pointed of ['detail', 'basic', 'candidates', 'sources', '', undefined]) {
    assert.deepEqual(resolveOpenGroups([], pointed, 'picker'), [], `가리키는 곳이 ${String(pointed)}일 때 열렸다`);
  }
  for (const first of ['picker', 'map', '', undefined]) {
    assert.deepEqual(resolveOpenGroups([], 'detail', first), [], `첫 번째가 ${String(first)}일 때 열렸다`);
  }
});

test('★ 닫고 → 판정이 옮겨 가고 → 다시 그려도 닫힌 채다', () => {
  // 화면 하나가 실제로 지나는 길을 그대로 밟아 본다.
  let stored;                                                                 // 아직 고르지 않음
  assert.deepEqual(resolveOpenGroups(stored, 'basic', 'picker'), ['basic']);  // 판정이 가리키는 것이 열린다
  stored = nextOpenGroups(['basic'], 'basic');                                // 열려 있던 그것을 눌러 닫는다
  assert.deepEqual(stored, []);
  assert.deepEqual(resolveOpenGroups(stored, 'basic', 'picker'), []);         // 닫힌 채
  // 확인을 한 건 눌러 판정이 detail로 옮겨 갔다.
  assert.deepEqual(resolveOpenGroups(stored, 'detail', 'picker'), []);        // 그래도 닫힌 채
  // 다시 여는 길은 사람이 누르는 것뿐이다.
  stored = nextOpenGroups([], 'detail');
  assert.deepEqual(resolveOpenGroups(stored, 'basic', 'picker'), ['detail']);
});

// ---------- d. 달라졌는지 재는 자리 ----------

test('차례만 다른 것은 같은 것으로 본다 — 헛되이 다시 그리지 않는다', () => {
  assert.ok(sameOpenGroups(['a', 'b'], ['b', 'a']));
  assert.ok(!sameOpenGroups(['a'], ['a', 'b']));
  assert.ok(!sameOpenGroups(undefined, []), '아직 안 고른 것과 모두 닫은 것은 다르다');
  assert.ok(sameOpenGroups(undefined, undefined));
});

// ---------- e. 부르는 자리 ----------

test('처리기는 스스로 따지지 않고 nextOpenGroups를 부른다', () => {
  const section = app.slice(app.indexOf("document.querySelectorAll('[data-section]')"), app.indexOf('  // 소분류도 같은 함수를 쓴다.'));
  // el.open은 브라우저가 여닫은 결과다. 판정에 **넘기되** 처리기가 스스로 따지지는 않는다(24-05).
  assert.match(section, /const next = nextOpenGroups\(openSectionKeys\(screen\), key, el\.open\);/);
  assert.match(section, /state\.openSections = \{ \.\.\.\(state\.openSections \|\| \{\}\), \[screen\]: next \};/);
  // 달라졌는지 재는 것도 그 파일이 한다. ===로 재면 배열은 언제나 달라 보여 헛되이 다시 그린다.
  assert.match(section, /if \(sameOpenGroups\(\(state\.openSections \|\| \{\}\)\[screen\], next\)\) return;/);
  // 처리기 안에서 el.open을 보고 무엇을 열지 정하면 판정이 두 곳이 된다.
  assert.doesNotMatch(section, /el\.open \?/);

  const group = app.slice(app.indexOf('  // 소분류도 같은 함수를 쓴다.'), app.indexOf('  // 열어 둔 구역을 한 번에 걷는다.'));
  assert.match(group, /const next = nextOpenGroups\(openGroupKeys\(\), el\.dataset\.detailGroup, el\.open\);/);
  assert.match(group, /if \(sameOpenGroups\(state\.openOrgGroups, next\)\) return;/);
  assert.match(group, /state\.openOrgGroups = next;/);
  assert.doesNotMatch(group, /el\.open \?/);
});

test('★ 같은 사건이 두 번 와도 방금 연 것이 닫히지 않는다', () => {
  // 실제로 났던 일: 접힌 줄을 누르면 1초도 안 되어 다시 닫혔다(24-05).
  // 브라우저가 이미 연 뒤에 사건이 오는데 그 결과를 안 받으면,
  // 두 번째 사건에서 그것을 「다시 누른 것」으로 읽어 도로 닫는다.
  let open = nextOpenGroups([], 'staff', true);
  assert.deepEqual(open, ['staff']);
  open = nextOpenGroups(open, 'staff', true);
  assert.deepEqual(open, ['staff'], '두 번째 사건에서 닫혔다');
  open = nextOpenGroups(open, 'staff', true);
  assert.deepEqual(open, ['staff']);
  // 브라우저가 닫았으면 그것만 빠진다. 이것도 몇 번을 와도 같다.
  assert.deepEqual(nextOpenGroups(['staff', 'budget'], 'staff', false), ['budget']);
  assert.deepEqual(nextOpenGroups(['budget'], 'staff', false), ['budget']);
  // 셋째 값을 안 주면 있는지 보고 뒤집는다.
  assert.deepEqual(nextOpenGroups(['staff'], 'staff'), []);
  assert.deepEqual(sorted(nextOpenGroups(['staff'], 'budget')), ['budget', 'staff']);
});

test('그리는 자리도 같은 함수를 지난다 — 판정을 두 번 적지 않는다', () => {
  const key = app.slice(app.indexOf('function openSectionKeys(screen)'), app.indexOf('// 중분류 한 칸.'));
  assert.match(key, /resolveOpenGroups\(\(state\.openSections \|\| \{\}\)\[screen\]/);
  const group = app.slice(app.indexOf('function openGroupKeys()'), app.indexOf('function subSection(key,'));
  assert.match(group, /resolveOpenGroups\(state\.openOrgGroups, stepGroupKey\(orgStepInfo\(\)\), ''\)/);
  // 중분류(두 화면)와 소분류가 모두 이 파일 하나를 부른다. 다른 판정이 남아 있으면 안 된다.
  assert.match(app, /import \{ nextOpenGroups, resolveOpenGroups, sameOpenGroups \} from '\.\/accordion-state\.js';/);
  assert.equal([...app.matchAll(/resolveOpenGroups\(/g)].length, 2);
});

test('「아직 고르지 않았다」는 undefined로 남는다', () => {
  // 빈 배열을 초기값으로 두면 처음부터 「사람이 닫아 두었다」가 되어 아무것도 열리지 않는다.
  assert.match(app, /openOrgGroups: undefined,/);
  assert.doesNotMatch(app, /openOrgGroups: \[\],/);
  // 화면마다 하나씩 담는 그릇은 빈 객체다 — 열쇠가 없으면 undefined다.
  assert.match(app, /openSections: \{\},/);
});

// ---------- f. 띠를 누르면 네 걸음 ----------

test('띠 클릭: 판정 읽기 → 중분류 열기 → 구역 열기 → 그 자리로 이동', () => {
  // 22-53에서 이은 「띠 → 그 자리 → 거기서 할 일」이 아코디언에서도 끊기지 않아야 한다.
  // 데려가기만 하면 그 자리가 닫혀 있을 수 있다.
  const opener = app.slice(app.indexOf('function openStepSection(screen)'), app.indexOf('function openSectionKeys(screen)'));
  const steps = [
    /const key = screen === 'applicants' \? orgStepSection\(\) : pickStepSection\(\);/,   // ① 판정 읽기
    /\[screen\]: nextOpenGroups\(openSectionKeys\(screen\), key, true\)/,                  // ② 중분류 열기
    /if \(screen === 'applicants' && group\) state\.openOrgGroups = nextOpenGroups\(openGroupKeys\(\), group, true\);/  // ③ 구역 열기
  ];
  let at = -1;
  for (const step of steps) {
    const found = opener.search(step);
    assert.ok(found > at, `걸음이 순서를 벗어났다: ${step}`);
    at = found;
  }
  // ★ 띠는 **더한다**. 사람이 열어 둔 것을 뺏지 않는다(24-07).
  assert.doesNotMatch(opener, /\[screen\]: key \};/);
  // ④ 그 자리로 이동. 여는 것이 먼저이고 데려가는 것이 나중이다.
  // 23-03에서 그 차례를 bindNextStepBar 한 곳으로 옮겼다. 화면은 무엇을 열고 어디로 갈지만 넘긴다.
  const order = app.slice(app.indexOf('function bindNextStepBar(actionId, decide)'), app.indexOf('function orgNextStepBar()'));
  assert.ok(order.indexOf('if (plan.open) plan.open();') < order.indexOf('if (plan.go) plan.go();'),
    '데려간 뒤에 열면 이미 닫힌 자리를 보여 준 뒤가 된다');
  // 그 자리에서 끝내는 갈래는 열지도 데려가지도 않는다.
  assert.match(order, /if \(plan\.act\) return void plan\.act\(\);/);
  const handler = app.slice(app.indexOf("bindNextStepBar('next-step-action'"), app.indexOf("document.querySelector('#undo-bulk-confirm')"));
  assert.match(handler, /open: \(\) => openStepSection\('applicants'\),/);
  assert.match(handler, /go: \(\) => focusAnchor\(button\.dataset\.nextAnchor/);
  const pick = app.slice(app.indexOf("bindNextStepBar('pick-step-action'"), app.indexOf("document.querySelector('#skip-applicant')"));
  assert.match(pick, /if \(key === 'pick'\) return \{ open: \(\) => openStepSection\('pick'\), go: \(\) => focusAnchor\('#applicant-picker'\) \};/);
});

// ---------- g. 한 번에 걷는 길 ----------

test('★ 여럿이 열리므로 「구역 모두 접기」가 돌아왔다', () => {
  // 22-01⑤에서 뺐던 까닭은 「접을 것이 하나뿐」이어서였다. 여덟이 함께 열리면 그 까닭이 사라진다.
  assert.match(app, /id="close-all-details"/);
  assert.match(app, /구역 모두 접기/);
  // 열린 것이 없으면 내보내지 않는다 — 눌러도 아무 일도 없는 단추를 두지 않는다.
  assert.match(app, /const closeAll = openGroupKeys\(\)\.length/);
  // 「모두 펼치기」는 그대로 없다. 여덟을 한꺼번에 펴면 실적 96건이 쏟아진다(22-42).
  assert.doesNotMatch(app, /id="open-all-details"/);
  assert.match(app, /state\.openOrgGroups = \[\];/);
});
