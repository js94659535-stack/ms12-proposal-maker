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

test('구역은 모두 접힌 채로 시작한다', () => {
  // 전에는 자료가 있는 구역을 펼쳐 두었다. 실적 96건이 그대로 쏟아져 화면을 감당할 수 없었다(22-42).
  const panel = app.slice(app.indexOf('function detailGroupPanel(applicant, group)'), app.indexOf('// 실적을 한 번에 확인됨으로 올리는 줄'));
  assert.match(panel, /const open = \(state\.openOrgGroups \|\| \[\]\)\.includes\(group\.key\) \|\| stepPointsAt\(group\.key\);/);
  assert.doesNotMatch(panel, /group\.total > 0/);
  // 접혀 있어도 무엇이 얼마나 있는지는 제목 줄에 남는다.
  assert.match(panel, /등록 \$\{group\.total\}건 · 확인됨 \$\{group\.confirmed\}건/);
  // 기본이 접힘이므로 「연 것」만 기억한다.
  const toggle = app.slice(app.indexOf("document.querySelectorAll('[data-detail-group]')"), app.indexOf("document.querySelector('#confirm-all-performance-head')"));
  assert.match(toggle, /if \(el\.open\) open\.add\(key\); else open\.delete\(key\);/);
  assert.doesNotMatch(toggle, /closed/);
});

test('「다음 할 일」이 가리키는 구역은 접지 않는다', () => {
  // 초록·화살표를 붙여 놓고 그 자리를 감추면 찾을 수가 없다.
  const helper = app.slice(app.indexOf('function stepPointsAt(groupKey)'), app.indexOf('function goMark('));
  assert.match(helper, /groupKey === 'performance' && orgStepKey\(\) === 'confirm'/);
  const fold = app.slice(app.indexOf('function orgFoldOpen(key)'), app.indexOf('function stepPointsAt('));
  assert.match(fold, /if \(key === 'detail'\) return step === 'confirm';/);
  // 기본정보 중단원도 가리키면 펼친다(22-47).
  assert.match(fold, /if \(key === 'basic'\) return step === 'basic' \|\| step === 'upload';/);
});

test('실적은 접힌 채로도 제목 줄에서 한 번에 확인할 수 있다', () => {
  const panel = app.slice(app.indexOf('function detailGroupPanel(applicant, group)'), app.indexOf('// 실적을 한 번에 확인됨으로 올리는 줄'));
  assert.match(panel, /id="confirm-all-performance-head">\$\{pending\}건 모두 확인<\/button>/);
  // 제목 줄의 단추는 묶음을 여닫지 않는다.
  const handler = app.slice(app.indexOf("document.querySelector('#confirm-all-performance-head')"), app.indexOf("document.querySelector('#open-all-details')"));
  assert.match(handler, /event\.stopPropagation\(\); confirmAllPerformance\(\)/);
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

test('반영 뒤 열어 주는 자리는 닫힘 기록을 지운다', () => {
  const apply = app.slice(app.indexOf('function applySafeApplicantCandidates()'), app.indexOf('function selectApplicantForProject('));
  // 닫아 둔 적이 있으면 열리지 않아, 넣어도 안 보이는 일이 생긴다.
  assert.match(apply, /closedOrgGroups: group \? \(state\.closedOrgGroups \|\| \[\]\)\.filter\(key => key !== group\) : state\.closedOrgGroups/);
});

test('손으로 넣는 칸은 아예 없다', () => {
  // 22-44에서 지웠다. 세 번 요청받았고, 값은 문서에서 들어오는 것이 원칙이다.
  // 이미 그 칸으로 넣어 둔 값은 그대로 두고 넣는 길만 없앴다.
  const fields = app.slice(app.indexOf('function applicantAreaFields(applicant, area, showTitle)'), app.indexOf('function applicantLoadedView'));
  assert.doesNotMatch(fields, /data-add-area=/);
  assert.doesNotMatch(fields, /문서에 없는 것을 손으로 넣기/);
  assert.doesNotMatch(fields, /새 항목명|새 항목 내용/);
  assert.ok(!app.includes('data-add-applicant-item'), '항목 추가 버튼이 남아 있다');
  assert.ok(!app.includes('function addApplicantItem('), '넣는 함수가 남아 있다');
  assert.ok(!app.includes('applicantItemDrafts'), '넣던 임시값이 남아 있다');
  // 대신 비어 있는 구역에는 한 줄과 올리러 가는 길만 둔다.
  assert.match(fields, /문서를 올리면 채워집니다/);
  assert.match(fields, /data-go-upload="1"/);
});
test('「전달할 확인된 정보」도 연도별로 접고 제목이 사실을 말한다', () => {
  const view = app.slice(app.indexOf('function confirmedInfoView(applicant, confirmed)'), app.indexOf('function applicantFitView(applicant)'));
  // 저장된 것과 이번 공고에 실리는 것은 다르다. 둘을 나눠 적는다.
  assert.match(view, /저장된 확인 정보 \$\{confirmed\.length\}건/);
  assert.match(view, /이번 공고에 실리는 것 \$\{sent\}건/);
  assert.match(view, /나머지 \$\{organization\.otherPastProjects\.count\}건은 건수만 전달/);
  // 실리는 건수는 실제로 보내는 자료에서 센다. 따로 세지 않는다.
  assert.match(view, /const organization = organizationForGeneration\(\);/);
  // 실적은 22-06에서 만든 연도 접기를 그대로 쓴다. 새로 만들지 않는다.
  assert.match(view, /groupItemsByYear\(records\)\.map\(group => `<details class="year-fold"/);
  // 기본은 접힘이다.
  assert.match(view, /<details><summary>저장된 확인 정보/);
});

test('출처별 정보의 실적도 접는다', () => {
  const view = app.slice(app.indexOf('function applicantSourceView(applicant)'), app.indexOf('function applicantBasicView('));
  assert.match(view, /groupItemsByYear\(performance\)\.map\(group => `<details class="year-fold"/);
  // 접기 기억은 다른 목록과 섞이지 않게 이름을 따로 쓴다.
  assert.match(view, /data-org-year="출처-\$\{escapeHtml\(group\.year\)\}"/);
});
