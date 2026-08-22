// 「이번 사업의 신청기관을 선택하세요」 화면에도 「다음 할 일」이 있다 (22-56).
//
// 실제로 났던 일: 기관을 고르고 나면 「이 기관으로 신청」이 「다시 불러오기」로 바뀌어 사라진다.
// 그래서 확인 전 정보가 10건 남아 있는데도 화면 어디에도 다음에 할 일이 없었다.
// 22-52에서 「이 화면에는 띠가 없어 버튼 하나가 유일한 다음 할 일」이라고 해 두었는데,
// 그 버튼마저 조건부였던 것이다.
//
// 판정은 이 화면 몫으로 따로 둔다 — 여기서 하는 일은 정보를 채우는 것이 아니라 「누구로 신청할지」를
// 정하는 것이라, 기관정보 화면의 차례(문서 올리기·후보 반영·칸 채우기)가 뜻이 없다.
// 대신 규칙은 같다: 한 화면에 다음 할 일은 하나, 판정은 한 곳에서, 띠는 결과만 그린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PICK_STEP_KEYS, nextApplicantPick } from '../src/org-next-step.js';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');

test('네 갈래에서 무엇을 할지 하나씩 정해진다', () => {
  const none = nextApplicantPick({ applicantCount: 0 });
  assert.equal(none.key, 'add-org');
  assert.match(none.message, /등록된 신청기관이 없습니다/);
  // 없어도 계획서는 만들어진다는 것을 함께 말한다. 이 화면은 고르기를 강요하지 않는다.
  assert.match(none.message, /등록하지 않아도 계획서는 만들어지지만/);

  const pick = nextApplicantPick({ applicantCount: 2 });
  assert.equal(pick.key, 'pick');
  assert.equal(pick.actionLabel, '기관 고르기');

  const confirm = nextApplicantPick({ applicantCount: 1, hasPick: true, pickName: '(주)마인드스토리', unconfirmed: 10, confirmed: 96 });
  assert.equal(confirm.key, 'confirm');
  assert.match(confirm.message, /\(주\)마인드스토리의 확인 전 정보가 10건입니다/);
  assert.equal(confirm.actionLabel, '10건 확인하러 가기');
  assert.equal(confirm.done, false);

  const done = nextApplicantPick({ applicantCount: 1, hasPick: true, pickName: '(주)마인드스토리', unconfirmed: 0, confirmed: 106 });
  assert.equal(done.key, 'next');
  assert.equal(done.actionLabel, '사업 선택으로');
  assert.equal(done.done, true);
  assert.deepEqual([...PICK_STEP_KEYS], ['add-org', 'pick', 'confirm', 'next']);
});

test('앞의 것이 먼저다', () => {
  // 기관이 없으면 확인할 것도 고를 것도 없다.
  assert.equal(nextApplicantPick({ applicantCount: 0, hasPick: true, unconfirmed: 10 }).key, 'add-org');
  // 고르지 않았으면 확인보다 그것이 먼저다.
  assert.equal(nextApplicantPick({ applicantCount: 3, hasPick: false, unconfirmed: 10 }).key, 'pick');
});

test('띠는 제목 줄 바로 아래 하나뿐이고 판정은 한 곳에서 온다', () => {
  const view = app.slice(app.indexOf('function applicantSelectView()'), app.indexOf('function applicantLoadedView('));
  // 제목 줄 다음이 띠다. 기관정보 화면과 같은 자리·같은 모양이다.
  assert.match(view, /신청기관 정보 관리<\/button><\/div>\s*\n\s*\$\{applicantPickBar\(\)\}/);
  // 판정은 applicantPickStep 한 곳에서 하고, 띠와 「처음 열리는 중분류」가 같은 값을 읽는다.
  const judge = app.slice(app.indexOf('function applicantPickStep()'), app.indexOf('function applicantPickBar()'));
  assert.match(judge, /return nextApplicantPick\(\{/);
  const bar = app.slice(app.indexOf('function applicantPickBar()'), app.indexOf('function applicantSelectView()'));
  assert.match(bar, /const step = applicantPickStep\(\);/);
  assert.match(bar, /class="next-step-bar\$\{step\.done \? ' done' : ''\}" id="pick-step-bar"/);
  // 꽉 찬 초록은 이 하나뿐이다.
  assert.equal([...bar.matchAll(/class="button go(?![-\w])/g)].length, 1);
  assert.equal([...view.matchAll(/class="button go(?![-\w])/g)].length, 0);
  // 화면이 스스로 판정하지 않는다.
  assert.doesNotMatch(bar, /if \(/);
});

test('갈래마다 데려가는 곳이 다르다', () => {
  const handler = app.slice(app.indexOf("document.querySelector('#pick-step-action')"), app.indexOf("document.querySelector('#skip-applicant')"));
  assert.match(handler, /if \(key === 'add-org'\) return setState\(\{ activeTool: 'applicants'/);
  // 중분류가 한 번에 하나만 열리므로, 데려가기 전에 그 중분류부터 연다(22-01).
  assert.match(handler, /if \(key === 'pick'\) \{ openStepSection\('pick'\); return focusAnchor\('#applicant-picker'\); \}/);
  // 확인하는 자리는 이 화면이 아니라 기관정보 화면이다. 거기 띠로 넘겨준다(22-53).
  assert.match(handler, /if \(key === 'confirm'\) return openApplicantEditor\(\{ anchor: '#next-step-bar' \}\);/);
  assert.match(handler, /return navigateToStep\(state\.step \+ 1/);
  // 데려갈 자리에 이름표가 있어야 한다.
  assert.match(app, /section\('pick', 'picker', \{[^}]*id: 'applicant-picker',/);
});

test('「공고 × 신청기관 비교」의 여섯 묶음은 기본 접힘이다', () => {
  // 요약 여섯 칸이 이미 건수를 말한다. 목록까지 펼치면 한 화면에 요구사항 열일곱 줄이 쏟아진다.
  const view = app.slice(app.indexOf('function applicantFitView(applicant)'), app.indexOf('function projectValuesView('));
  assert.doesNotMatch(view, /items\.length \? 'open' : ''/);
  assert.match(view, /const fitOpen = key => \(state\.openFitGroups \|\| \[\]\)\.includes\(key\);/);
  assert.match(view, /data-fit-group="\$\{escapeHtml\(group\.key\)\}" \$\{fitOpen\(group\.key\) \? 'open' : ''\}/);
  // 접힌 줄에 무엇이 몇 건인지 남는다.
  assert.match(view, /<summary>\$\{escapeHtml\(group\.name\)\} \$\{group\.items\.length\}건<\/summary>/);
  // 펼친 묶음은 기억한다 — 읽는 중에 다시 그렸다고 닫히면 읽을 수가 없다.
  const toggle = app.slice(app.indexOf("document.querySelectorAll('[data-fit-group]')"), app.indexOf("document.querySelectorAll('[data-add-form]')"));
  assert.match(toggle, /if \(el\.open\) open\.add\(key\); else open\.delete\(key\);/);
  assert.match(toggle, /state\.openFitGroups = \[\.\.\.open\];/);
  // 이번 화면에서만 기억한다. 다음에 들어오면 다시 접힌다.
  const save = app.slice(app.indexOf('function saveState()'), app.indexOf('function loadNavigationHistory()'));
  assert.match(save, /openFitGroups: \[\]/);
});

test('「부족한 정보만 확인」의 빈 칸도 눌러서 펼친다', () => {
  const view = app.slice(app.indexOf('function applicantQuestionsView(applicant)'), app.indexOf('function noticeTrashView()'));
  assert.match(view, /data-add-form="applicant-questions"/);
  // 다만 이미 적어 둔 답이 있으면 펴 둔다. 적은 것을 감추면 안 된다.
  assert.match(view, /const openAsk = answered > 0 \|\| \(state\.openAddForms \|\| \[\]\)\.includes\('applicant-questions'\);/);
  assert.match(view, /답할 질문 \$\{asked\.length\}건/);
  // 이미 확인된 질문 목록도 펼쳐 두지 않는다 — 할 일이 없는 목록이다.
  assert.doesNotMatch(view, /<details open>/);
});
