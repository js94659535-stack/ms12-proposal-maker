// 신청기관 정보를 두 층 다 접는다.
//
// 실제로 났던 일: 기관을 고르면 열한 칸 요약이 통째로 펼쳐지고, 그 아래 상세정보 여덟 구역 중
// 자료가 있는 구역이 또 펼쳐졌다. 실적 96건이 들어온 기관에서는 한 화면에 감당할 수 없는 양이 쏟아졌다.
//
// 이제 바깥 두 층은 접혀 있고 접힌 줄에 건수가 남는다. 눌러야 열린다.
// 다만 「다음 할 일」이 가리키는 자리는 접지 않는다 — 가리켜 놓고 감추면 찾을 수가 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/app.js', 'utf8');

test('불러온 신청기관 정보가 접혀 있고 줄에 건수가 남는다', () => {
  const view = app.slice(app.indexOf('function applicantLoadedView(applicant)'), app.indexOf('// 앞 항목들을 묶은 문장으로 보이면'));
  assert.match(view, /<details class="card org-details" data-org-fold="loaded" \$\{orgFoldOpen\('loaded'\) \? 'open' : ''\}>/);
  assert.match(view, /확인됨 \$\{confirmed\.length\}건 · 확인 필요 \$\{needsCheck\}건/);
  // 열한 칸 요약은 그 안에 있다.
  assert.ok(view.indexOf('class="summary-grid"') > view.indexOf('data-org-fold="loaded"'));
});

test('상세정보도 접혀 있고 줄에 구역 수와 건수가 남는다', () => {
  const view = app.slice(app.indexOf('function applicantDetailView(applicant)'), app.indexOf('function detailGroupPanel(applicant, group)'));
  assert.match(view, /<details class="card org-details" id="applicant-detail" data-org-fold="detail"/);
  assert.match(view, /여덟 구역 중 \$\{filled\}구역에 자료 \$\{total\}건/);
});

test('펼침은 이번 화면에서만 기억한다', () => {
  const save = app.slice(app.indexOf('function saveState()'), app.indexOf('function loadNavigationHistory()'));
  for (const key of ['openAddForms', 'openOrgFolds', 'openOrgGroups', 'openOrgYears']) {
    assert.ok(save.includes(key + ": []"), key + "를 저장하고 있다");
  }
});

test('빈 입력칸은 눌러서 펼친다', () => {
  // 22-38에서 센 여섯 곳 중 화면에서 늘 펼쳐져 있던 넷.
  for (const key of ['source', 'project-value', 'asset', 'reference']) {
    assert.ok(app.includes(`addForm('${key}'`), `${key} 칸이 접히지 않았다`);
  }
  const helper = app.slice(app.indexOf('function addForm(key, label, body)'), app.indexOf('function orgFoldOpen(key)'));
  assert.match(helper, /class="add-fold" data-add-form=/);
});

test('접는 층은 셋을 넘지 않고 해는 모두 접힌다', () => {
  // 상세정보 → 구역 → 연도. 그 아래는 항목이다.
  // 22-42에서 맨 위 해를 열어 두었다가 22-44에서 되돌렸다 — 실적 28건이 펼쳐진 채로 나왔다.
  const fields = app.slice(app.indexOf('function applicantAreaFields(applicant, area, showTitle)'), app.indexOf('function applicantLoadedView'));
  assert.match(fields, /const yearOpen = year => \(state\.openOrgYears \|\| \[\]\)\.includes\(year\);/);
});
