// 아코디언 열림 판정을 값으로 지킨다 (22-27).
//
// 실제로 났던 일: 「눌렀을 때 나머지가 닫히는가」를 확인하지 못했다. 계산이 클릭 처리기 안에 있어
// 브라우저 없이는 부를 수 없었고, 시험은 코드를 읽는 데 그쳤다. 그래서 계산만 따로 뺐다.
//
// 상태값의 뜻은 셋이다.
//   undefined — 아직 고르지 않았다 (「다음 할 일」이 가리키는 것을 연다)
//   null      — 사람이 닫아 두었다 (아무것도 열지 않는다)
//   문자열     — 사람이 이것을 열었다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextOpenGroup, resolveOpenGroup } from '../src/accordion-state.js';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');

// ---------- a. 눌렀을 때 다음에 열릴 것 ----------

test('열려 있던 것을 다시 누르면 닫힌다', () => {
  assert.equal(nextOpenGroup('detail', 'detail'), null);
  assert.equal(nextOpenGroup('clients', 'clients'), null);
});

test('다른 것을 누르면 그것 하나만 열린다', () => {
  assert.equal(nextOpenGroup('detail', 'sources'), 'sources');
  // 아무것도 열려 있지 않을 때 누르면 그것이 열린다.
  assert.equal(nextOpenGroup('', 'basic'), 'basic');
  assert.equal(nextOpenGroup(null, 'basic'), 'basic');
  assert.equal(nextOpenGroup(undefined, 'basic'), 'basic');
});

test('한 번 누르면 열린 것은 언제나 하나뿐이다', () => {
  // 어느 상태에서 무엇을 눌러도 결과는 「그 하나」이거나 「아무것도 아님」이다.
  // 돌려주는 값이 하나이므로 둘이 함께 열리는 길이 애초에 없다.
  const keys = ['picker', 'map', 'basic', 'candidates', 'detail', 'sources', 'documents'];
  for (const current of [undefined, null, '', ...keys]) {
    for (const clicked of keys) {
      const next = nextOpenGroup(current, clicked);
      assert.ok(next === null || next === clicked, `${String(current)} + ${clicked} → ${String(next)}`);
    }
  }
});

// ---------- b. 실제로 그릴 때 열리는 것 ----------

test('아직 고르지 않았으면 「다음 할 일」이 가리키는 것을 연다', () => {
  assert.equal(resolveOpenGroup(undefined, 'detail', 'picker'), 'detail');
});

test('가리키는 것이 없으면 첫 번째를 연다', () => {
  assert.equal(resolveOpenGroup(undefined, '', 'picker'), 'picker');
  // 첫 번째도 없으면 아무것도 열지 않는다. 구역 여덟은 이 길로 온다 —
  // 아무거나 하나를 열어 두면 그 구역만 특별해진다.
  assert.equal(resolveOpenGroup(undefined, '', ''), null);
});

test('사람이 닫아 두었으면 아무것도 열지 않는다', () => {
  assert.equal(resolveOpenGroup(null, 'detail', 'picker'), null);
});

test('사람이 연 것이 있으면 그것이다', () => {
  assert.equal(resolveOpenGroup('sources', 'detail', 'picker'), 'sources');
});

// ---------- c. 이 작업의 핵심 ----------

test('★ 닫아 둔 뒤에는 「다음 할 일」이 어디를 가리켜도 열리지 않는다', () => {
  // 여기서 열리면 사람이 닫은 것을 화면이 무릅쓰는 것이고, undefined와 null을 나눈 뜻이 사라진다.
  // 「다음 할 일」은 자료가 조금만 달라져도 옮겨 간다 — 확인 한 건만 눌러도 가리키는 곳이 바뀐다.
  // 그때마다 닫아 둔 칸이 되살아나면 사람은 같은 칸을 몇 번이고 다시 닫아야 한다.
  for (const pointed of ['detail', 'basic', 'candidates', 'sources', '', undefined]) {
    assert.equal(resolveOpenGroup(null, pointed, 'picker'), null, `가리키는 곳이 ${String(pointed)}일 때 열렸다`);
  }
  // 첫 번째가 무엇이든 상관없다.
  for (const first of ['picker', 'map', '', undefined]) {
    assert.equal(resolveOpenGroup(null, 'detail', first), null, `첫 번째가 ${String(first)}일 때 열렸다`);
  }
});

test('★ 닫고 → 판정이 옮겨 가고 → 다시 그려도 닫힌 채다', () => {
  // 화면 하나가 실제로 지나는 길을 그대로 밟아 본다.
  let stored;                                             // 아직 고르지 않음
  assert.equal(resolveOpenGroup(stored, 'basic', 'picker'), 'basic');   // 판정이 가리키는 것이 열린다
  stored = nextOpenGroup('basic', 'basic');               // 열려 있던 그것을 눌러 닫는다
  assert.equal(stored, null);
  assert.equal(resolveOpenGroup(stored, 'basic', 'picker'), null);      // 닫힌 채
  // 확인을 한 건 눌러 판정이 detail로 옮겨 갔다.
  assert.equal(resolveOpenGroup(stored, 'detail', 'picker'), null);     // 그래도 닫힌 채
  // 다시 여는 길은 사람이 누르는 것뿐이다.
  stored = nextOpenGroup('', 'detail');
  assert.equal(resolveOpenGroup(stored, 'basic', 'picker'), 'detail');
});

// ---------- d. 부르는 자리 ----------

test('처리기는 스스로 따지지 않고 nextOpenGroup을 부른다', () => {
  const section = app.slice(app.indexOf("document.querySelectorAll('[data-section]')"), app.indexOf('  // 소분류도 같은 함수를 쓴다.'));
  assert.match(section, /const next = nextOpenGroup\(openSectionKey\(screen\), key\);/);
  assert.match(section, /state\.openSections = \{ \.\.\.\(state\.openSections \|\| \{\}\), \[screen\]: next \};/);
  // 처리기 안에 판정이 남아 있으면 안 된다. el.open을 보고 다시 따지던 자리를 없앴다.
  assert.doesNotMatch(section, /el\.open/);

  const group = app.slice(app.indexOf('  // 소분류도 같은 함수를 쓴다.'), app.indexOf('  // 제목 줄의 「모두 확인」은'));
  assert.match(group, /const next = nextOpenGroup\(openGroupKey\(\), el\.dataset\.detailGroup\);/);
  assert.match(group, /state\.openOrgGroup = next;/);
  assert.doesNotMatch(group, /el\.open/);
});

test('그리는 자리도 같은 함수를 지난다 — 판정을 두 번 적지 않는다', () => {
  const key = app.slice(app.indexOf('function openSectionKey(screen)'), app.indexOf('// 중분류 한 칸.'));
  assert.match(key, /resolveOpenGroup\(\(state\.openSections \|\| \{\}\)\[screen\]/);
  const group = app.slice(app.indexOf('function openGroupKey()'), app.indexOf('function subSection(key,'));
  assert.match(group, /resolveOpenGroup\(state\.openOrgGroup, stepGroupKey\(orgStepInfo\(\)\), ''\)/);
  // 중분류(두 화면)와 소분류가 모두 이 파일 하나를 부른다. 다른 판정이 남아 있으면 안 된다.
  assert.match(app, /import \{ nextOpenGroup, resolveOpenGroup \} from '\.\/accordion-state\.js';/);
  assert.equal([...app.matchAll(/resolveOpenGroup\(/g)].length, 2);
  assert.equal([...app.matchAll(/nextOpenGroup\(/g)].length, 2);
});

test('「아직 고르지 않았다」는 undefined로 남는다', () => {
  // null을 초기값으로 두면 처음부터 「사람이 닫아 두었다」가 되어 아무것도 열리지 않는다.
  assert.match(app, /openOrgGroup: undefined,/);
  assert.doesNotMatch(app, /openOrgGroup: null/);
  // 화면마다 하나씩 담는 그릇은 빈 객체다 — 열쇠가 없으면 undefined다.
  assert.match(app, /openSections: \{\},/);
});

// ---------- e. 띠를 누르면 네 걸음 ----------

test('띠 클릭: 판정 읽기 → 중분류 열기 → 구역 열기 → 그 자리로 이동', () => {
  // 22-53에서 이은 「띠 → 그 자리 → 거기서 할 일」이 아코디언에서도 끊기지 않아야 한다.
  // 하나만 열리므로 데려가기만 하면 그 자리가 닫혀 있을 수 있다.
  const opener = app.slice(app.indexOf('function openStepSection(screen)'), app.indexOf('function openSectionKey(screen)'));
  const steps = [
    /const key = screen === 'applicants' \? orgStepSection\(\) : pickStepSection\(\);/,   // ① 판정 읽기
    /state\.openSections = \{ \.\.\.\(state\.openSections \|\| \{\}\), \[screen\]: key \};/, // ② 중분류 열기
    /if \(screen === 'applicants' && group\) state\.openOrgGroup = group;/                 // ③ 구역 열기
  ];
  let at = -1;
  for (const step of steps) {
    const found = opener.search(step);
    assert.ok(found > at, `걸음이 순서를 벗어났다: ${step}`);
    at = found;
  }
  // ④ 그 자리로 이동. 여는 것이 먼저이고 데려가는 것이 나중이다.
  const handler = app.slice(app.indexOf("document.querySelector('#next-step-action')"), app.indexOf("document.querySelector('#undo-bulk-confirm')"));
  assert.ok(handler.indexOf("openStepSection('applicants')") < handler.indexOf('focusAnchor(button.dataset.nextAnchor'),
    '데려간 뒤에 열면 이미 닫힌 자리를 보여 준 뒤가 된다');
  const pick = app.slice(app.indexOf("document.querySelector('#pick-step-action')"), app.indexOf("document.querySelector('#skip-applicant')"));
  assert.match(pick, /if \(key === 'pick'\) \{ openStepSection\('pick'\); return focusAnchor\('#applicant-picker'\); \}/);
});
