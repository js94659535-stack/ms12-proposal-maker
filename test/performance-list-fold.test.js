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
  assert.match(fields, /<details class="year-fold" data-org-year="\$\{escapeHtml\(group\.year\)\}" \$\{\(state\.openOrgYears \|\| \[\]\)\.includes\(group\.year\) \? 'open' : ''\}>/);
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
