// 중분류는 아코디언이다 — 한 화면에 한 번에 하나만 열린다 (22-42에서 접기, 22-01에서 아코디언).
//
// 실제로 났던 일: 기관을 고르면 열한 칸 요약이 통째로 펼쳐지고, 그 아래 상세정보 여덟 구역 중
// 자료가 있는 구역이 또 펼쳐졌다. 실적 96건이 들어온 기관에서는 한 화면에 감당할 수 없는 양이 쏟아졌다.
// 접어 두는 것으로 한 번 줄였지만, 여럿을 동시에 열 수 있는 한 화면은 다시 길어졌다 —
// 중분류 다섯이 모두 펼쳐진 채로 나오는 일이 그대로 남아 있었다.
//
// 이제 화면은 늘 「제목 몇 줄 + 열린 내용 하나」다.
// 가로 탭이 아니라 세로로 세운 까닭은 제목이 길어서다 — 「불러온 신청기관 정보 · (주)마인드스토리」.
// 처음 열리는 것은 「다음 할 일」이 가리키는 중분류이고, 가리키는 것이 없으면 첫 번째다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/app.js', 'utf8').split('\r\n').join('\n');
const css = fs.readFileSync('src/styles.css', 'utf8');

test('두 화면의 중분류를 한 곳에 적어 둔다', () => {
  // 목록이 코드 여기저기 흩어져 있으면 「첫 번째」가 어느 것인지 화면마다 달라진다.
  const list = app.slice(app.indexOf('const SECTIONS = Object.freeze({'), app.indexOf('// 「다음 할 일」이 가리키는 중분류.'));
  assert.match(list, /applicants: \['picker', 'map', 'basic', 'candidates', 'detail', 'sources', 'documents'\]/);
  assert.match(list, /pick: \['picker', 'loaded', 'fit', 'values', 'questions'\]/);
});

test('중분류는 모두 같은 함수가 그린다', () => {
  // 열두 자리가 저마다 카드를 그리면 「하나만 열림」이 한 곳에서 지켜지지 않는다.
  const maker = app.slice(app.indexOf('function section(screen, key, {'), app.indexOf('// 소분류도 같은 형식이다.'));
  assert.match(maker, /const open = openSectionKey\(screen\) === key;/);
  assert.match(maker, /class="card org-details section\$\{mark\}" data-section="\$\{escapeHtml\(screen\)\}:\$\{escapeHtml\(key\)\}"/);
  assert.match(maker, /<div class="section-body">\$\{body\}<\/div>/);
  // 열두 중분류가 모두 이 함수를 지난다.
  const keys = [...app.matchAll(/section\('(applicants|pick)', '([a-z-]+)', \{/g)].map(m => `${m[1]}:${m[2]}`);
  assert.deepEqual(keys.sort(), [
    'applicants:basic', 'applicants:candidates', 'applicants:detail', 'applicants:documents',
    'applicants:map', 'applicants:picker', 'applicants:picker', 'applicants:sources',
    'pick:fit', 'pick:loaded', 'pick:picker', 'pick:questions', 'pick:values'
  ].sort(), `중분류를 그리는 자리: ${keys.join(', ')}`);
});

test('하나를 열면 나머지는 닫힌다', () => {
  const toggle = app.slice(app.indexOf("document.querySelectorAll('[data-section]')"), app.indexOf('  // 소분류도 한 번에 하나다'));
  // 무엇이 열려 있어야 하는지는 accordion-state가 정한다. 처리기는 그 값을 담기만 한다.
  assert.match(toggle, /const next = nextOpenGroup\(openSectionKey\(screen\), key\);/);
  // 나머지를 닫으려면 다시 그려야 한다.
  assert.match(toggle, /state\.openSections = \{ \.\.\.\(state\.openSections \|\| \{\}\), \[screen\]: next \};\s*\n\s*setState\(\{\}\);/);
});

test('처음 열리는 것은 「다음 할 일」이 가리키는 중분류다', () => {
  const key = app.slice(app.indexOf('function openSectionKey(screen)'), app.indexOf('// 중분류 한 칸.'));
  assert.match(key, /const pointed = screen === 'applicants' \? orgStepSection\(\) : pickStepSection\(\);/);
  // 「고르지 않았다·닫아 두었다·이것을 열었다」 셋을 가르는 규칙은 resolveOpenGroup 한 곳에 있다.
  assert.match(key, /resolveOpenGroup\(\(state\.openSections \|\| \{\}\)\[screen\], keys\.includes\(pointed\) \? pointed : '', keys\[0\] \|\| ''\)/);
});

test('펼침은 이번 화면에서만 기억한다', () => {
  // 22-19의 접기가 안 먹은 까닭이 이것이었다. 한 번 편 것이 브라우저에 저장돼 새로고침해도 펴져 있었다.
  const save = app.slice(app.indexOf('function saveState()'), app.indexOf('function loadNavigationHistory()'));
  for (const key of ['openAddForms: []', 'openFitGroups: []', 'openSections: {}', 'openOrgGroup: undefined', 'openOrgYears: []']) {
    assert.ok(save.includes(key), `${key}를 저장하고 있다`);
  }
});

test('빈 입력칸은 눌러서 펼친다', () => {
  // 22-38에서 센 여섯 곳 중 화면에서 늘 펼쳐져 있던 넷.
  for (const key of ['source', 'project-value', 'asset', 'reference']) {
    assert.ok(app.includes(`addForm('${key}'`), `${key} 칸이 접히지 않았다`);
  }
  const helper = app.slice(app.indexOf('function addForm(key, label, body)'), app.indexOf('// 중분류 아코디언.'));
  assert.match(helper, /class="add-fold" data-add-form=/);
});

test('연도는 하나만 열리게 하지 않는다', () => {
  // 소소분류까지 하나만 열면 2026을 열 때 2025가 닫혀 견줄 수가 없다.
  // 연도는 견주어 보는 것이라 여러 해를 함께 편다. 다만 처음에는 모두 접혀 있다(22-44).
  const fields = app.slice(app.indexOf('function applicantAreaFields(applicant, area, showTitle)'), app.indexOf('function comparisonRequirements()'));
  assert.match(fields, /const yearOpen = year => \(state\.openOrgYears \|\| \[\]\)\.includes\(year\);/);
});

test('세모 대신 탭 모양으로 열림을 말한다', () => {
  const tab = css.slice(css.indexOf('/* 중분류 아코디언 (22-01).'));
  // 열린 줄은 한 단계 진해지고, 왼쪽 막대가 두꺼워지고, 아이보리 내용이 딸려 나온다.
  assert.match(tab, /\.card\.section\{background:var\(--fold-body\)/);
  assert.match(tab, /\.card\.section>summary\{background:var\(--fold-1\);[^}]*box-shadow:inset 3px 0 0 var\(--fold-edge\)\}/);
  assert.match(tab, /\.card\.section\[open\]>summary\{background:var\(--fold-1-open\);box-shadow:inset 6px 0 0 var\(--fold-0\)\}/);
  // 세모는 붙이지 않는다. 신호가 둘이면 어느 것을 믿어야 할지 흐려진다.
  assert.match(tab, /\.card\.section>summary::before\{display:none\}/);
  // 색은 하나만 늘렸다. 열린 줄은 --navy의 30% 톤이고 내용은 22-54 전의 바탕색이다.
  assert.match(tab, /--fold-1-open:#c5c0bd;/);
  assert.match(tab, /--fold-body:#faf6f0;/);
});

test('소분류도 같은 형식이되 한 겹 옅다', () => {
  const tab = css.slice(css.indexOf('/* 중분류 아코디언 (22-01).'));
  assert.match(tab, /\.card\.section\.sub\{background:var\(--fold-3\)/);
  assert.match(tab, /\.card\.section\.sub>summary\{background:var\(--fold-2\)\}/);
  assert.match(tab, /\.card\.section\.sub\[open\]>summary\{background:var\(--fold-1\)\}/);
  // 층 규칙(22-55)은 그대로다 — 소분류가 중분류보다 옅다.
  const maker = app.slice(app.indexOf('function subSection(key, {'), app.indexOf('// 「다음 할 일」이 이 구역을 가리키는가.'));
  assert.match(maker, /class="card org-details section sub\$\{mark\}"/);
});
