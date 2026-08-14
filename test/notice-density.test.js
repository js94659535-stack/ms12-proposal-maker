// 공고 준비 화면 밀도. 기능은 그대로 두고 카드·입력칸·현황 표시의 높이만 줄인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const importView = app.slice(app.indexOf('function noticeImportView() {'), app.indexOf('// 자료보관함.'));
const manualView = app.slice(app.indexOf('function manualSourcesView() {'), app.indexOf('function attachmentView() {'));
const archive = app.slice(app.indexOf('function archiveView() {'), app.indexOf('function archiveStageLabel('));
// 규칙 하나를 통째로 꺼내 값을 확인한다(속기 표기라 정규식보다 이 편이 안전하다).
function rule(selector) {
  const at = css.indexOf(`\n${selector}{`);
  assert.ok(at >= 0, `${selector} 규칙이 없다`);
  return css.slice(at + selector.length + 2, css.indexOf('}', at));
}

test('공고 준비 화면 전체가 밀도 정리 영역으로 묶인다', () => {
  assert.match(importView, /<div class="dense-step">/);
  // 히어로와 하단 이동 단추는 밖에 두고 카드만 묶는다.
  assert.ok(importView.indexOf('stageHero(') < importView.indexOf('<div class="dense-step">'));
  assert.ok(importView.indexOf('${archiveView()}</div>') < importView.indexOf('${footer('));
  assert.match(rule('.dense-step>.card'), /padding:12px 14px/);
  assert.match(rule('.dense-step'), /gap:8px/);
});

test('내용이 없어도 큰 빈 상자가 생기지 않는다', () => {
  // 파일 영역은 한 줄 높이로 줄인다(기본 .dropzone은 min-height 150px).
  const dropzone = rule('.dense-step .dropzone');
  assert.match(dropzone, /min-height:0/);
  assert.match(dropzone, /padding:10px 12px/);
  // 업로드 칸과 붙여넣기 칸의 높이를 서로 맞추지 않는다. 내용이 적은 쪽이 늘어나면 그게 빈 공간이다.
  assert.match(rule('.dense-step .source-grid'), /align-items:start/);
  assert.match(rule('.dense-step .source-grid>.card'), /align-self:start;height:auto/);
  // 붙여넣기 칸은 기본을 낮추고 넘치면 스크롤하거나 사용자가 늘린다.
  const textarea = rule('.dense-step .source-text');
  assert.match(textarea, /height:118px/);
  assert.match(textarea, /overflow:auto/);
  assert.match(textarea, /resize:vertical/);
  // 자료 유형 선택은 보통 입력칸 높이로 둔다.
  assert.match(rule('.dense-step select'), /padding:8px 10px/);
});

test('현황 넷은 숫자가 먼저 보이는 작은 배지로 가로 나열된다', () => {
  // 큰 카드 넷(.summary-grid)을 이 화면에서는 쓰지 않는다.
  assert.doesNotMatch(archive, /class="summary-grid"/);
  assert.match(archive, /class="stat-badges"/);
  for (const label of ['보관 공고', '검색 결과', '신청기관 연결', '저장한 계획서']) {
    assert.ok(archive.includes(`'${label}'`), `${label} 배지`);
  }
  // 숫자를 먼저 그린다.
  assert.match(archive, /<strong>\$\{value\}<\/strong><span>\$\{escapeHtml\(label\)\}<\/span>/);
  // 가로로 늘어놓고 좁아지면 줄바꿈한다.
  const badges = rule('.stat-badges');
  assert.match(badges, /display:flex/);
  assert.match(badges, /flex-wrap:wrap/);
  // 배지가 카드처럼 커서 부담스럽다는 지적으로 높이를 절반으로 줄였다. 내용이 길면 늘어난다.
  assert.match(rule('.stat-badge strong'), /font-size:13px/);
  assert.match(rule('.stat-badge'), /min-height:22px/);
  // 큰 카드가 아니라 40~48px 소형 배지다.
  assert.match(rule('.stat-badge'), /min-height:22px/);
  // 긴 설명은 배지에서 빼고 도움말로만 남긴다.
  assert.match(rule('.stat-badge small'), /display:none/);
  // 좁은 화면에서 접히는 설명은 배지 제목으로 남겨 둔다.
  assert.match(archive, /title="\$\{escapeHtml\(`\$\{label\} \$\{value\}건 · \$\{detail\}`\)\}"/);
});

test('보조 영역은 접히고 주요 세 영역은 먼저 보인다', () => {
  // 직접 자료 추가는 접힌 채로 시작하고 자료가 있으면 펼친다.
  assert.match(manualView, /<details class="card org-details" id="manual-sources" \$\{count \? 'open' : ''\}>/);
  assert.match(manualView, /<summary><b>직접 자료 추가<\/b>\$\{count \? ` · \$\{count\}건` : ''\}/);
  // 누락 공고 URL도 접힌 보조 영역이다.
  assert.match(importView, /<details class="card org-details"><summary>누락 공고 URL과 공식 사이트<\/summary>/);
  // 주요 세 영역은 접지 않고 순서대로 먼저 나온다.
  const order = ['기관 공고 가져오기', '공고문·신청서 업로드', '공고문 직접 붙여넣기', 'manualSourcesView()', '누락 공고 URL'];
  // 히어로 안내 카드에도 같은 문구가 있으므로 밀도 정리 영역부터 본다.
  const body = importView.slice(importView.indexOf('<div class="dense-step">'));
  let last = -1;
  for (const needle of order) {
    const at = body.indexOf(needle);
    assert.ok(at > last, `${needle} 순서`);
    last = at;
  }
});

test('공고보관함은 목록을 먼저 보여 주고 상세 필터는 펼쳐서 본다', () => {
  assert.match(archive, /<details class="filter-details" \$\{activeFilters \? 'open' : ''\}><summary>상세 필터/);
  // 필터가 걸려 있으면 숨기지 않는다.
  assert.match(archive, /const activeFilters = Object\.values\(table\.filters \|\| \{\}\)\.filter\(value => value\)\.length;/);
  // 검색 도구와 표는 그대로 보인다.
  assert.ok(archive.indexOf('id="archive-query"') < archive.indexOf('class="filter-details"'));
  assert.match(archive, /class="archive-table"/);
});

test('기존 기능과 처리기는 그대로 남는다', () => {
  for (const needle of ['id="fetch-notices"', 'id="source-files"', 'id="source-text"', 'id="char-count"',
    'id="missing-notice-url"', 'id="import-notice-url"', 'id="manual-source-type"', 'id="manual-source-files"',
    'id="manual-source-name"', 'id="manual-source-text"', 'id="add-manual-text"', 'id="archive-box"',
    'data-remove-file=', 'data-manual-source-type=', 'data-remove-manual-source=']) {
    assert.ok(app.includes(needle), needle);
  }
  assert.match(importView, /chest\.or\.kr\/bbs\/1000\/initPostList\.do/);
  assert.match(importView, /gwangju\.chest\.or\.kr\/bbs\/1000\/initPostList\.do/);
  assert.match(importView, /누락 공고 가져오기/);
  assert.match(archive, /id="find-matching-notices"/);
  assert.match(archive, /id="list-archived-proposals"/);
});

test('좁은 화면에서 한 열로 접히고 누를 수 있는 크기를 지킨다', () => {
  // 업로드와 붙여넣기는 넓은 화면에서 두 열, 980px 아래에서 한 열이 된다.
  assert.match(css, /\.two-col,\.three-col,\.source-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:980px\)\{[^@]*\.source-grid,\.two-col,\.three-col\{grid-template-columns:1fr\}/);
  const narrow = css.slice(css.indexOf('@media(max-width:760px){\n  .dense-step{gap:8px}'));
  assert.ok(narrow.length > 200, '좁은 화면 규칙을 찾지 못했다');
  assert.match(narrow, /\.dense-step \.button,\.inline-row \.button\{min-height:38px\}/);
  assert.match(narrow, /input:not\(\[type=checkbox\]\),\.inline-row input\{min-height:38px;font-size:14px\}/);
  // 가로 스크롤이 생기지 않도록 긴 표만 자기 영역 안에서 스크롤한다.
  assert.match(rule('.archive-table-wrap'), /overflow-x:auto/);
  assert.match(rule('.inline-row input'), /min-width:0/);
});
