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

test('현황 배지는 숫자가 먼저 보이고 눌러 보이지 않는다', () => {
  // 큰 카드 넷(.summary-grid)을 이 화면에서는 쓰지 않는다.
  assert.doesNotMatch(archive, /class="summary-grid"/);
  assert.match(archive, /class="stat-badges"/);
  // 「보관 공고」와 「검색 결과」를 하나로 합쳤다. 필터가 없으면 같은 수가 두 번 나왔다.
  for (const label of ['목록', '신청기관 연결', '마감', '저장한 계획서']) {
    assert.ok(archive.includes(`'${label}'`), `${label} 배지`);
  }
  assert.ok(!archive.includes("'검색 결과'"), '검색 결과를 따로 세지 않는다');
  // 걸러진 것이 있을 때만 「N건 중 M건」으로 적는다.
  assert.match(archive, /data\.matched === data\.total \? `\$\{data\.total\}건` : `\$\{data\.total\}건 중 \$\{data\.matched\}건`/);
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
  assert.match(archive, /title="\$\{escapeHtml\(`\$\{label\} \$\{value\} · \$\{detail\}`\)\}"/);

  // 27곳 가운데 26곳이 표시 전용인데 흰 바탕에 테두리라 탭처럼 보였다.
  // 「눌렀는데 안 눌린다」가 그래서 났다. 표시 전용은 테두리를 지우고 바탕을 옅게 깐다.
  assert.match(rule('.stat-badge'), /border:1px solid transparent/);
  assert.match(rule('.stat-badge'), /cursor:default/);
  // 진짜 누르는 한 곳만 눌러 보이게 남긴다.
  assert.match(rule('.stat-badge.pickable'), /cursor:pointer/);
  assert.match(rule('.stat-badge.pickable'), /background:#fff/);
  assert.ok(rule('.stat-badge.pickable:hover'), '누를 수 있으면 손을 올렸을 때 반응한다');
});

test('보조 영역은 접히고 세 묶음이 순서대로 나온다', () => {
  // 직접 자료 추가는 접힌 채로 시작하고 자료가 있으면 펼친다.
  // 서식을 못 읽었으면 펼쳐 둔다. 서식은 이 자리로만 들어오는데 접혀 있으면
  // 「서식 미인식」 경고만 보이고 고칠 자리는 한 번 더 눌러야 나온다.
  assert.match(manualView, /<details class="card org-details" id="manual-sources" \$\{count \|\| formMissing \? 'open' : ''\}>/);
  assert.match(manualView, /const formMissing = !currentFormSpec\(\)\?\.items\?\.length;/);
  assert.match(manualView, /<summary><b>직접 자료 추가<\/b>\$\{count \? ` · \$\{count\}건` : ''\}/);
  // 누락 공고 URL도 접힌 보조 영역이다. 공고를 고르는 세 길 가운데 가장 드물게 쓴다.
  // 세 줄을 같은 모양으로 맞췄다. 누락 URL도 「제목 + 오른쪽 버튼」이고, 누르면 그 자리에서 펼쳐진다.
  assert.match(importView, /<summary class="card-title row-summary"><div><h3>누락 공고 URL<\/h3>/);
  assert.match(importView, /<span class="button secondary">주소로 추가<\/span><\/summary>/);
  // 실제로 목록에 넣는 버튼은 안에 그대로 있다. 처리기를 건드리지 않았다.
  assert.match(importView, /<button class="button secondary" id="import-notice-url">목록에 추가<\/button>/);
  // 공식 사이트 링크 둘은 카드 안 보조 줄로 남았다.
  assert.match(importView, /중앙회 공식 사이트<\/a>/);
  assert.match(importView, /광주지회 공식 사이트<\/a>/);
  // 설명이 가리키던 「아래 공고보관함」은 뺐다. 바로 아래 줄에 실제로 있으니 문장으로 가리킬 이유가 없다.
  assert.doesNotMatch(importView, /과거 공고는 아래/);
  assert.match(importView, /이 화면에서만 쓰는 임시 목록<\/b>이라 새로고침하면 사라집니다/);

  // 카드 여섯을 하는 일로 묶었다. 1~6 번호를 매기면 「순서대로 다 해야 한다」로 읽히는데
  // 실제로는 묶음 1의 셋 중 하나, 묶음 2의 둘 중 하나만 하면 되고 묶음 3은 선택이다.
  const body = importView.slice(importView.indexOf('<div class="dense-step">'));
  const order = [
    '공고 고르기', '기관 공고 가져오기', '누락 공고 URL', 'archiveView()',
    '공고문 넣기', '공고문·신청서 업로드', '공고문 직접 붙여넣기',
    '자료 더하기', 'manualSourcesView()'
  ];
  let last = -1;
  for (const needle of order) {
    const at = body.indexOf(needle);
    assert.ok(at > last, `${needle} 순서`);
    last = at;
  }
  // 몇 개를 해야 하는지 묶음 제목이 말한다. 「셋 중 하나」를 안 적으면 셋 다 해야 하는 줄 안다.
  assert.match(body, /<h3>공고 고르기 <span class="tag">이 중 하나<\/span>/);
  assert.match(body, /<h3>공고문 넣기 <span class="tag">둘 중 하나<\/span>/);
  assert.match(body, /<h3>자료 더하기 <span class="tag">선택<\/span>/);
  // 「묶음」은 내부 개념어다. 화면에 내지 않는다. 번호도 없는 순서를 암시해 빼 두었다.
  assert.doesNotMatch(body, /묶음 \d/);
  // 업로드와 붙여넣기는 같은 state.sourceText에 들어간다. 둘 다 할 필요가 없다고 적는다.
  assert.match(body, /같은 칸에 들어갑니다/);
  // 묶음 1과 2는 대체가 아니라 보완이다.
  assert.match(body, /서로 대체가 아니라 <b>보완<\/b>입니다/);
  // 서식이 묶음 3으로만 들어온다는 사실도 그 자리에서 말한다.
  assert.match(body, /신청서 서식은 이 자리로만 들어갑니다/);
});

test('다음 단계에 무엇이 필요한지 버튼 옆에 적되 막지는 않는다', () => {
  // 지금도 #next는 검사 없이 넘어간다. 그 동작은 바꾸지 않는다 — 막으면 위험하다.
  assert.match(app, /document\.querySelector\('#next'\)\?\.addEventListener\('click', \(\) => navigateToStep\(state\.step \+ 1/);
  // 대신 「이전」이 없어 비어 있던 왼쪽 자리에 안내를 넣는다.
  assert.match(app, /const left = back && state\.step > 0 \? '<button class="button secondary" id="back">이전<\/button>' : \(hint \|\| '<span><\/span>'\);/);
  // 준비되면 표시를 바꾸고, 아니면 무엇이 필요한지 적는다.
  assert.match(importView, /const ready = isStepComplete\(0\);/);
  assert.match(importView, /다음 단계 준비됨/);
  assert.match(importView, /공고를 하나 고르거나 공고문을 넣으면 다음이 준비됩니다/);
  // 넘어갈 수는 있다는 사실을 숨기지 않는다.
  assert.match(importView, /지금도 넘어갈 수는 있습니다/);
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
