// 프롬프트의 내부 이름이 결과 본문에 그대로 나오는지 검사한다.
//
// 실제로 났던 일: 설계 화면에 「최상위 NOTICE_CONTRACT는 '지역사회 내…'」가 인쇄됐다.
// 프롬프트가 `NOTICE_CONTRACT는 … 최상위 기준이다`라고 그 이름으로 개념을 정의했고,
// 모델이 근거를 설명하면서 배운 이름을 그대로 불렀다. **사용자가 눈으로 발견해서 알았다.**
// 이 시험은 다음에는 기록으로 알게 하려고 있다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENUM_WORDS, findLeaks, internalNames, leakCode, proseLabels, tagNames } from '../server/label-leak.js';

const route = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');

// 지금 프롬프트에서 문장 속에 맨 이름으로 놓인 자리. 고칠 대상이자 진척을 재는 자다.
// 여기가 0이 되면 유출 원인이 사라진다. 처음 20이었고, 정의 문장 다섯을 고쳐 15가 됐다.
//
// 고친 다섯: NOTICE_CONTRACT → 공고 실행계약서 · PROJECT_BLUEPRINT → 사업 설계도
// MASTER_CONTEXT → 마스터 설계 · APPROVED_DESIGN_PLAN → 승인 설계안
// CONFIRMED_DESIGN → 설계 1걸음 결과. 다섯 다 코드·화면에 이미 있던 말이고 새로 짓지 않았다.
const FIXED_PROSE_LABELS = [
  'NOTICE_CONTRACT', 'PROJECT_BLUEPRINT', 'MASTER_CONTEXT', 'APPROVED_DESIGN_PLAN', 'CONFIRMED_DESIGN'
];
const KNOWN_PROSE_LABELS = [
  'CONDITIONS', 'CORE_IDEA', 'PAGE_PLAN', 'CANDIDATE_ASSETS', 'CONFIRMED_VALUES',
  'CONTINUITY_SUMMARY', 'CURRENT_APPLICATION_GROUP', 'MANUAL_SOURCES', 'OFFICIAL_NOTICE_TEXT',
  'REFERENCE', 'RELEVANT_PREVIOUS_SECTIONS', 'REVIEW_BASIS', 'SELECTED_SUBPROGRAM',
  'SUBTITLE', 'WORKING_TITLE'
];

test('검사 목록을 손으로 적지 않고 프롬프트에서 뽑는다', () => {
  // 태그가 늘 때 목록만 안 늘면 새 이름은 검사에서 빠진다.
  // 그러면 검사가 있다는 사실이 오히려 안심시킨다.
  const prompt = '<ALPHA>가</ALPHA>\n<BETA_GAMMA>나</BETA_GAMMA>\n<DELTA_RULE>규칙</DELTA_RULE>';
  assert.deepEqual(tagNames(prompt), ['ALPHA', 'BETA_GAMMA'], '_RULE 껍데기는 검사 대상이 아니다');
  const names = internalNames(prompt);
  for (const word of ENUM_WORDS) assert.ok(names.includes(word), `열거값 ${word}이 빠졌다`);
  assert.ok(names.includes('ALPHA') && names.includes('BETA_GAMMA'));
});

test('결과에 맨 이름이 나오면 이름과 횟수를 돌려준다', () => {
  const names = internalNames('<NOTICE_CONTRACT>x</NOTICE_CONTRACT>');
  const text = '최상위 NOTICE_CONTRACT는 지역사회 내 아동을 정하고 있다. NOTICE_CONTRACT에 따라 기간을 맞춘다.';
  assert.deepEqual(findLeaks(text, names), [{ name: 'NOTICE_CONTRACT', count: 2 }]);
});

test('한국어 조사가 붙어도 잡고, 더 긴 이름의 일부는 잡지 않는다', () => {
  const names = ['NOTICE_CONTRACT', 'MIN'];
  assert.deepEqual(findLeaks('NOTICE_CONTRACT를 따른다', names), [{ name: 'NOTICE_CONTRACT', count: 1 }]);
  // NOTICE_CONTRACT_CONFLICT 안의 NOTICE_CONTRACT를 따로 세지 않는다.
  assert.deepEqual(findLeaks('type은 NOTICE_CONTRACT_CONFLICT이다', names), []);
  // MINIMUM 안의 MIN도 마찬가지다.
  assert.deepEqual(findLeaks('MINIMUM 값', names), []);
  assert.deepEqual(findLeaks('MIN 70명 이상', names), [{ name: 'MIN', count: 1 }]);
});

test('깨끗한 결과에는 아무것도 걸리지 않는다', () => {
  const names = internalNames('<NOTICE_CONTRACT>x</NOTICE_CONTRACT><PROJECT_BLUEPRINT>y</PROJECT_BLUEPRINT>');
  const clean = '공고 실행계약서가 정한 사업기간을 그대로 씁니다. 확인되지 않은 값은 [확인 필요]로 남깁니다.';
  assert.deepEqual(findLeaks(clean, names), []);
  assert.deepEqual(findLeaks('', names), []);
});

test('기록 코드는 활동기록이 받는 모양이다', () => {
  // user_activity_events의 code는 소문자·숫자와 : _ - 만 받고 40자까지다.
  const code = leakCode('masterDesign', 'NOTICE_CONTRACT');
  assert.equal(code, 'leak:masterdesign:notice_contract');
  assert.match(code, /^[a-z0-9][a-z0-9:_-]{0,39}$/);
  assert.ok(leakCode('a'.repeat(40), 'B'.repeat(40)).length <= 40);
});

// ---------- 지금 프롬프트의 상태 ----------

test('정의 문장 다섯은 이제 한국어 이름으로 부른다', () => {
  // 「X는 …이다」로 이름을 붙여 주면 모델이 그 이름을 배우고 본문에서 그렇게 부른다.
  // 실제로 화면에 나온 것이 「최상위 NOTICE_CONTRACT는 …」이었다.
  const found = proseLabels(route).map(item => item.name);
  for (const name of FIXED_PROSE_LABELS) assert.ok(!found.includes(name), `${name}이 아직 문장에 남아 있다`);
  // 태그는 그대로 둔다. 경계 표시라 안전하고, 바꾸면 자료를 찾는 자리가 흔들린다.
  for (const name of FIXED_PROSE_LABELS) assert.ok(tagNames(route).includes(name), `<${name}> 태그까지 지우면 안 된다`);
  // 대신 자료가 이미 쓰는 한국어 이름으로 부른다.
  assert.match(route, /위 공고 실행계약서는 공고가 이미 정한 조건이며/);
  assert.match(route, /위 사업 설계도는 이번 사업의 확정된 설계 기준이다/);
  assert.match(route, /위 마스터 설계는 앞 단계에서 이미 확정·검증된 기준이다/);
  assert.match(route, /위 승인 설계안은 고객·운영자가 승인한 설계안이며/);
  assert.match(route, /위 설계 1걸음 결과는 앞 걸음에서 확정한 설계다/);
});

test('문장 속에 맨 이름으로 놓인 자리가 지금 열다섯 곳이다', () => {
  // 이 수가 유출의 원인이다. **0이 되면 원인이 사라진다.**
  // 줄면 이 시험이 먼저 깨지면서 몇 개가 남았는지 알려 준다.
  const found = proseLabels(route);
  assert.deepEqual(found.map(item => item.name).sort(), [...KNOWN_PROSE_LABELS].sort());
  assert.equal(found.length, 15);
});

test('라우트가 모든 액션에서 검사하고 막지는 않는다', () => {
  assert.match(route, /const leaks = findLeaks\(outputText, internalNames\(specification\.prompt\)\);/);
  // 액션별 분기보다 앞에 있어야 한다 — 실제로 샌 masterDesign·masterPlan은 sections를 만들지 않는다.
  // CORE_PROPOSAL_ACTION 분기는 위쪽 쪽수 처리에도 있으므로 결과 처리 쪽 주석을 기준으로 잡는다.
  assert.ok(route.indexOf('const leaks = findLeaks(') < route.indexOf('// 무료 체험은 결과와 함께'));
  // 응답을 해석한 뒤여야 검사할 본문이 있다.
  assert.ok(route.indexOf('const outputText = extractOutputText(raw);') < route.indexOf('const leaks = findLeaks('));
  // 막지 않는다. 토큰은 이미 나갔다.
  assert.doesNotMatch(route, /if \(leaks\.length\) return/);
  // failureStage는 건드리지 않는다. 이건 실패가 아니라 품질 흠이다.
  assert.doesNotMatch(route, /leaks[^\n]*failureStage/);
  // 결과와 함께 돌려주고 활동기록에 남긴다.
  assert.match(route, /result\.guard = \{ \.\.\.\(result\.guard \|\| \{\}\), internalLabels: leaks/);
  assert.match(route, /code: leakCode\(body\.action, leak\.name\)/);
  // 접은 개수를 숨기지 않는다. 세 개만 남기고 몇 개였는지는 응답에 그대로 실린다.
  assert.match(route, /internalLabelsRecorded: Math\.min\(leaks\.length, 3\)/);
});
