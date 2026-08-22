// 실적 목록을 해마다 접는다.
//
// 실제로 났던 일: 「너무 어마어마해서 엄두를 못 내고 있다」. 연혁 한 건에서 들어온 실적 99건이
// 2017~2026년 열 해 치가 한꺼번에 펼쳐져 화면이 끝없이 이어졌다. 게다가 같은 99건이
// 「입력 후보」의 사업·실적 이력과 「2단계 상세정보 실적」 두 곳에 나와 길이가 두 배였다.
//
// 목록을 줄이지 않는다. 접어 두고 필요한 해만 펼친다. 규모는 맨 위에서 한 줄로 먼저 말한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('실적이 여덟 건을 넘으면 해마다 접는다', () => {
  const fields = app.slice(app.indexOf('function applicantAreaFields(applicant, area, showTitle)'), app.indexOf('function comparisonRequirements()'));
  assert.match(fields, /const folded = area\.key === 'performance' && items\.length > YEAR_FOLD_MIN;/);
  assert.match(app, /const YEAR_FOLD_MIN = 8;/);
  // 접는 자리는 details다. 기본은 접힘이고, 펼친 해만 open이 붙는다.
  assert.match(fields, /<details class="year-fold" data-org-year="\$\{escapeHtml\(group\.year\)\}" \$\{yearOpen\(group\.year\) \? 'open' : ''\}>/);
  // 해는 모두 접는다. 열어 둔 해만 기억한다(22-44).
  assert.match(fields, /const yearOpen = year => \(state\.openOrgYears \|\| \[\]\)\.includes\(year\);/);
  // 해마다 몇 건인지·그중 확인됨이 몇인지 summary에 적는다.
  assert.match(fields, /\$\{group\.items\.length\}건 <small class="muted">확인됨/);
  // 실적이 아닌 영역은 예전처럼 그대로 편다.
  assert.match(fields, /: list\(items\)\)/);
});

test('펼쳐 둔 해를 기억한다', () => {
  // 한 건 고칠 때마다 접히면 쓸 수 없다.
  assert.match(app, /openOrgYears: \[\]/);
  const handler = app.slice(app.indexOf("document.querySelectorAll('[data-org-year]')"), app.indexOf("document.querySelectorAll('[data-detail-group]')"));
  assert.match(handler, /state\.openOrgYears = \[\.\.\.open\];/);
  assert.match(handler, /saveState\(\);/);
});

test('목록을 보기 전에 규모를 한 줄로 말한다', () => {
  const bar = app.slice(app.indexOf('function performanceConfirmBar(applicant)'), app.indexOf('// 실적이 이만큼을 넘으면'));
  assert.match(bar, /사업실적 \$\{items\.length\}건 · \$\{span\}확인됨 \$\{items\.length - pending\}건/);
  // 몇 해치인지 함께 적는다.
  assert.match(bar, /\$\{years\[0\]\}~\$\{years\[years\.length - 1\]\}년/);
});

test('입력 후보의 사업·실적 이력도 접어 둔다', () => {
  const scope = app.slice(app.indexOf('function applicantScopeView(applicant)'), app.indexOf('// 어떤 문서에서 어떤 정보가 들어왔는지'));
  // 예전에는 이 카드가 열린 채로 99건을 쏟아 냈다.
  assert.doesNotMatch(scope, /<details class="card org-details" open>/);
  assert.match(scope, /<details class="year-fold"><summary><b>\$\{escapeHtml\(project\.year \|\| '연도 확인 필요'\)\}<\/b> \$\{project\.items\.length\}건/);
});

test('접힌 줄은 눌러서 펼치는 것으로 보인다', () => {
  assert.match(css, /\.year-fold\{border:1px solid var\(--line\)/);
  assert.match(css, /\.year-fold>summary\{[^}]*cursor:pointer/);
});

test('구역은 한 번에 하나만 열린다', () => {
  // 전에는 자료가 있는 구역을 펼쳐 두었다. 실적 96건이 그대로 쏟아져 화면을 감당할 수 없었고(22-42),
  // 여럿을 열어 둘 수 있게 두었더니 화면이 다시 길어졌다. 이제 하나뿐이다(22-56⑤).
  const panel = app.slice(app.indexOf('function detailGroupPanel(applicant, group)'), app.indexOf('// 실적을 한 번에 확인됨으로 올리는 줄'));
  assert.doesNotMatch(panel, /group\.total > 0/);
  // 접혀 있어도 무엇이 얼마나 있는지는 제목 줄에 남는다.
  assert.match(panel, /sub: `등록 \$\{group\.total\}건 · 확인됨 \$\{group\.confirmed\}건`/);
  // 여는 규칙은 subSection 한 곳에 있다.
  assert.match(app, /function openGroupKey\(\) \{\s*\n\s*const chosen = state\.openOrgGroup;/);
  assert.match(app, /const open = openGroupKey\(\) === key;/);
  // 연 것 하나만 기억한다. 닫으면 빈 문자열이라 아무것도 열리지 않은 채로 둔다.
  const toggle = app.slice(app.indexOf("document.querySelectorAll('[data-detail-group]')"), app.indexOf("  // 제목 줄의 「모두 확인」은"));
  assert.match(toggle, /if \(el\.open\) state\.openOrgGroup = key;/);
  assert.match(toggle, /else if \(openGroupKey\(\) === key\) state\.openOrgGroup = '';/);
  assert.doesNotMatch(toggle, /closed/);
});

test('「다음 할 일」이 가리키는 구역이 처음 열린다', () => {
  // 초록·화살표를 붙여 놓고 그 자리를 감추면 찾을 수가 없다.
  // 가리키는 구역이 무엇인지는 판정 한 곳(stepGroupKey)이 정한다. 확인 전이 기본정보 쪽인데
  // 실적 96건이 펼쳐지던 것을 그렇게 고쳤다(22-49).
  const helper = app.slice(app.indexOf('function stepPointsAt(groupKey)'), app.indexOf('function goHere('));
  assert.match(helper, /return Boolean\(groupKey\) && stepGroupKey\(orgStepInfo\(\)\) === groupKey;/);
  const where = app.slice(app.indexOf('function stepGroupKey(step)'), app.indexOf('function nextStepAnchor('));
  assert.match(where, /if \(step\.area === 'performance'\) return 'performance';/);
  // 사람이 고르기 전에는 판정이 가리키는 구역이 열린 것이다.
  const group = app.slice(app.indexOf('function openGroupKey()'), app.indexOf('function subSection(key,'));
  assert.match(group, /return stepGroupKey\(orgStepInfo\(\)\) \|\| '';/);
});

test('접힌 채로도 제목 줄에서 한 번에 확인할 수 있다', () => {
  // 실적만이 아니다. 확인 전이 남은 구역이면 어느 구역이든 같은 단추가 붙는다(22-53⑤).
  const panel = app.slice(app.indexOf('function detailGroupPanel(applicant, group)'), app.indexOf('// 실적을 한 번에 확인됨으로 올리는 줄'));
  assert.match(panel, /action: confirmGroupButton\(group\.key, pending\),/);
  assert.match(panel, /const pending = group\.total - group\.confirmed;/);
  const button = app.slice(app.indexOf('function confirmGroupButton(groupKey, pending)'), app.indexOf('function detailGroupPanel('));
  assert.match(button, /if \(!pending\) return '';/);
  assert.match(button, /data-confirm-group="\$\{escapeHtml\(groupKey\)\}">\$\{pending\}건 모두 확인<\/button>/);
  // 제목 줄의 단추는 묶음을 여닫지 않는다.
  const handler = app.slice(app.indexOf("document.querySelectorAll('[data-confirm-group]')"), app.indexOf("document.querySelector('#recheck-upload')"));
  assert.match(handler, /event\.stopPropagation\(\);\s*\n?\s*confirmAllInGroup\(el\.dataset\.confirmGroup\)/);
});

test('한 건은 한 줄로 접히고 눌러야 편집칸이 펴진다', () => {
  const fields = app.slice(app.indexOf('function applicantAreaFields(applicant, area, showTitle)'), app.indexOf('function comparisonRequirements()'));
  assert.match(fields, /<details class="item-fold">\$\{summaryLine\(item\)\}<article class="requirement">/);
  // 한 줄에 연도·내용·상태·출처가 보인다.
  assert.match(fields, /const summaryLine = item =>/);
  assert.match(fields, /\$\{applicantStatusTag\(item\.status\)\}/);
  // 문서에서 온 값과 손으로 넣은 값을 구분해 적는다.
  assert.match(fields, /const fromDocument = item => \/에서 추출\/\.test/);
  assert.match(fields, /\$\{fromDocument\(item\) \? '문서에서' : '직접 입력'\}/);
});

test('반영 뒤에는 넣은 자리가 열린다', () => {
  const apply = app.slice(app.indexOf('function applySafeApplicantCandidates()'), app.indexOf('function selectApplicantForProject('));
  // 한 번에 하나만 열리므로 「닫아 둔 기록」이 따로 없다. 넣은 구역을 열린 하나로 삼는다.
  assert.match(apply, /openOrgGroup: group || state.openOrgGroup,/);
  assert.doesNotMatch(app, /closedOrgGroups/);
});
