// 지금 할 일 하나를 한 곳에서 정한다.
//
// 실제로 났던 일: 「일괄 반영」·「모두 확인됨으로」·「계획서 작성으로」를 세 번 연속 찾지 못했다.
// 이 화면의 주 버튼 자리가 아홉 곳이었으니 어느 것도 다음 할 일이 아니었다.
// 판정은 nextOrgStep 한 곳에서만 하고, 화면은 그 결과만 그린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NEXT_STEP_KEYS, nextOrgStep } from '../src/org-next-step.js';

// 줄바꿈을 한 가지로 맞춰 읽는다. 윈도우에서 받아 온 사본은 줄 끝이 CRLF여서
// 함수 하나를 잘라 내는 자(줄바꿈 + 닫는 중괄호)가 어긋났고, 그러면 시험이 파일 끝까지를
// 한 함수로 보아 어느 함수에서 걸렸는지도 알 수 없게 된다.
const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');
const css = read('../src/styles.css');
const ready = { hasApplicant: true, applicantCount: 1, basicMissing: [], itemCount: 96 };

test('다섯 상태에서 무엇을 할지 하나씩 정해진다', () => {
  // 1. 기관이 없다
  const none = nextOrgStep({ applicantCount: 0, hasApplicant: false });
  assert.equal(none.key, 'add-org');
  assert.match(none.message, /등록된 신청기관이 없습니다/);

  // 2. 기관 유형·담당자가 비었다
  const basic = nextOrgStep({ ...ready, basicMissing: ['기관 유형', '담당자'] });
  assert.equal(basic.key, 'basic');
  assert.match(basic.message, /기관 유형 · 담당자이\(가\) 비어 있습니다/);
  assert.equal(basic.actionLabel, '채우러 가기');

  // 3. 등록 정보가 0건이다
  const upload = nextOrgStep({ ...ready, itemCount: 0 });
  assert.equal(upload.key, 'upload');
  assert.equal(upload.actionLabel, '연혁·사업계획서 올리기');

  // 4. 확인 안 된 실적이 있다
  const confirm = nextOrgStep({ ...ready, performanceUnconfirmed: 96 });
  assert.equal(confirm.key, 'confirm');
  assert.equal(confirm.message, '실적 96건이 확인 전입니다. 확인해야 계획서에 쓰입니다.');
  assert.equal(confirm.actionLabel, '96건 모두 확인');

  // 5. 다 됐다
  const write = nextOrgStep(ready);
  assert.equal(write.key, 'write');
  assert.equal(write.message, '준비가 됐습니다.');
  assert.equal(write.actionLabel, '계획서 작성으로');
  assert.equal(write.done, true);
});

test('문서에서 찾아만 둔 후보가 있으면 그것부터 말한다', () => {
  // 반영하지 않은 후보는 기관 정보가 아니다. 확인하라고 하기 전에 넣으라고 한다.
  const apply = nextOrgStep({ ...ready, candidateCount: 99, performanceUnconfirmed: 96 });
  assert.equal(apply.key, 'apply');
  assert.match(apply.message, /후보 99건이 아직 반영되지 않았습니다/);
});

test('앞의 것이 먼저다', () => {
  // 기관이 없으면 나머지를 물어도 소용없다.
  assert.equal(nextOrgStep({ hasApplicant: false, basicMissing: ['담당자'], itemCount: 0, performanceUnconfirmed: 5 }).key, 'add-org');
  // 기본정보가 비면 확인보다 그것이 먼저다.
  assert.equal(nextOrgStep({ ...ready, basicMissing: ['담당자'], performanceUnconfirmed: 5 }).key, 'basic');
  // 실적 말고 다른 곳에 확인 전 정보가 있으면 그 자리로 데려간다.
  const other = nextOrgStep({ ...ready, otherUnconfirmed: 3 });
  assert.equal(other.key, 'confirm');
  assert.equal(other.actionLabel, '확인하러 가기');
  assert.deepEqual([...NEXT_STEP_KEYS], ['add-org', 'basic', 'upload', 'apply', 'confirm', 'write']);
});

test('띠는 제목 바로 아래 하나뿐이고 판정은 한 곳에서 온다', () => {
  const view = app.slice(app.indexOf('function applicantsToolView()'), app.indexOf('function applicantSourcesView('));
  // 제목 줄 다음이 띠다.
  assert.match(view, /작성 흐름으로 돌아가기<\/button><\/div>\s*\$\{orgNextStepBar\(\)\}/);
  const bar = app.slice(app.indexOf('function orgNextStepBar()'), app.indexOf('// 기관정보 화면. 페이지를 새로'));
  // 판정은 orgStepInfo() 한 곳에서 오고 띠는 그 결과만 그린다(22-49).
  assert.match(bar, /const step = orgStepInfo\(\);/);
  assert.match(app, /function orgStepInfo\(\) \{[\s\S]{0,900}?return nextOrgStep\(\{/);
  // 화면이 스스로 판정하지 않는다.
  assert.doesNotMatch(bar, /if \(.*applicantCount === 0\)/);
});

test('이 화면에서 초록 버튼은 띠 안의 하나뿐이고 갈색은 없다', () => {
  // 띠의 HTML은 23-03에서 stepBar() 한 곳으로 모였다. 꽉 찬 초록도 거기 한 번만 적혀 있다.
  const names = ['applicantsToolView', 'stepBar', 'applicantBasicView', 'applicantCandidateView', 'profileBridgePanel', 'applicantScopeView', 'applicantSourceView',
    'applicantDetailView', 'detailGroupPanel', 'performanceConfirmBar', 'applicantAreaFields', 'applicantSourcesView', 'applicantDocumentView', 'candidateReviewView', 'ideaAssetPanel'];
  const found = [];
  for (const name of names) {
    const start = app.indexOf(`function ${name}(`);
    if (start < 0) continue;
    const body = app.slice(start, app.indexOf('\n}\n', start));
    // 22-52에서 「다음 할 일」의 색을 초록 하나로 모았다. 이 화면에는 갈색 주 버튼이 없다.
    for (const match of body.matchAll(/button primary[^>]*id="([^"]*)"/g)) found.push(`갈색:${match[1]}`);
    for (const match of body.matchAll(/button primary(?![^>]*id=)/g)) found.push(`갈색:${name}:이름없음`);
    for (const match of body.matchAll(/button go[^-][^>]*id="([^"]*)"/g)) found.push(match[1]);
  }
  assert.deepEqual(found, ['${actionId}'], `버튼: ${found.join(', ')}`);
  // 그 하나에 실제로 들어가는 이름표는 두 화면이 각각 넘긴다.
  assert.match(app, /actionId: 'next-step-action',/);
  assert.match(app, /actionId: 'pick-step-action',/);
  // 갈색이 「다음 할 일」을 말하는 자리는 앱 어디에도 없다(22-52).
  assert.ok(!app.includes('button primary next-step'), '갈색으로 다음 할 일을 말하는 버튼이 남아 있다');
});

test('「채우러 가기」는 그 자리로 데려간다', () => {
  const handler = app.slice(app.indexOf("bindNextStepBar('next-step-action'"), app.indexOf("document.querySelector('#undo-bulk-confirm')"));
  assert.match(handler, /go: \(\) => focusAnchor\(button\.dataset\.nextAnchor/);
  // 실적 확인은 데려가지 않고 그 자리에서 끝낸다.
  assert.match(handler, /if \(button\.dataset\.nextBulk\) return \{ act: confirmAllPerformance \};/);
  assert.match(handler, /if \(button\.dataset\.nextKey === 'write'\) return \{ act: \(\) => void saveBasicInfo\(\{ thenWrite: true \}\) \};/);
  // 데려가는 방식은 이미 있는 것을 쓴다.
  const focus = app.slice(app.indexOf('function focusAnchor(anchor)'), app.indexOf('// 기관정보 화면이 지금 다루는 기관'));
  assert.match(focus, /pendingAiMove = \{ anchor, sameView: true \}/);
});

test('올려 둔 후보가 기다리면 그것부터 가리킨다', () => {
  // 등록증을 올린 새 기관: 항목은 아직 0건이고 기본정보도 비어 있지만, 후보 5건이 기다린다.
  // 반영해야 기관 정보가 되고 그 값이 기본정보 칸을 채우기도 한다.
  const step = nextOrgStep({ hasApplicant: true, applicantCount: 1, basicMissing: ['기관 유형', '담당자'], itemCount: 0, candidateCount: 5 });
  assert.equal(step.key, 'apply');
  assert.match(step.message, /후보 5건이 아직 반영되지 않았습니다/);
  // 후보가 없으면 예전 순서 그대로다.
  assert.equal(nextOrgStep({ hasApplicant: true, applicantCount: 1, basicMissing: ['담당자'], itemCount: 0 }).key, 'basic');
  assert.equal(nextOrgStep({ hasApplicant: true, applicantCount: 1, basicMissing: [], itemCount: 0 }).key, 'upload');
  // 기관이 없으면 여전히 그것이 먼저다.
  assert.equal(nextOrgStep({ hasApplicant: false, candidateCount: 5 }).key, 'add-org');
});

test('초록은 goMark·goPlace 두 통로로만 붙는다', () => {
  // 갈색이 아홉 자리로 늘어 뜻을 잃었던 길을 초록이 그대로 가지 않게 한다.
  // 초록이 붙는 곳은 모두 판정을 지나야 하고, 그 통로는 「다음 할 일」이 가리킬 때만 열린다.
  // 띠(orgNextStepBar)는 빼 둔다. 띠의 초록은 판정 그 자체이고 — orgStepInfo()를 바로 부른다 —
  // 어디에 붙일지 고를 일이 없다. 그 하나뿐이라는 것은 위 시험이 따로 지킨다.
  const names = ['applicantsToolView', 'orgPickerView', 'applicantBasicView', 'applicantCandidateView', 'profileBridgePanel', 'applicantScopeView', 'applicantSourceView',
    'applicantDetailView', 'confirmGroupButton', 'detailGroupPanel', 'performanceConfirmBar', 'applicantAreaFields', 'applicantSourcesView', 'applicantDocumentView', 'candidateReviewView', 'ideaAssetPanel'];
  const marks = [];
  const places = [];
  for (const name of names) {
    const start = app.indexOf(`function ${name}(`);
    if (start < 0) continue;
    const body = app.slice(start, app.indexOf('\n}\n', start));
    for (const match of body.matchAll(/go-target|go-place|class="[^"]*go/g)) {
      assert.ok(/go(?:Mark|Place)\(/.test(body.slice(Math.max(0, match.index - 140), match.index + 140)), `${name}에서 판정을 지나지 않은 초록이 있습니다`);
    }
    for (const match of body.matchAll(/goMark\('([^']+)'(?:, ([^)]+))?\)/g)) marks.push([match[1], match[2] || ''].filter(Boolean).join(':'));
    for (const match of body.matchAll(/goPlace\('([^']+)'(?:, ([^)]+))?\)/g)) places.push([match[1], match[2] || ''].filter(Boolean).join(':'));
  }
  // 한 판정에 한 자리다. 같은 열쇠가 두 곳에 붙으면 초록이 둘이 된다.
  // confirm 은 구역까지 함께 적으므로 겹치지 않는다 — 그리는 자리는 구역마다 하나뿐이다.
  assert.deepEqual([...marks].sort(), [...new Set(marks)].sort(), `같은 판정에 초록이 둘 이상입니다: ${marks.join(', ')}`);
  assert.deepEqual(marks.sort(), ['add-org', 'apply', 'basic', 'confirm:groupKey', 'upload']);
  // 「그 자리」도 다섯 갈래 모두에 있다. 구역 카드는 기본정보 안과 상세정보 안 두 곳에서 그린다.
  assert.deepEqual([...new Set(places)].sort(), ['add-org', 'apply', 'basic', 'confirm:area.key', 'confirm:group.key', 'upload']);
});

test('띠에서 시작해 자리로 가고 거기서 할 일까지 이어진다', () => {
  // 22-53⑤. 「확인하러 가기」를 눌러 그 자리로 갔는데 거기서 무엇을 할지 초록이 없었다.
  // 세 고리 중 하나라도 끊기면 「찾아 헤매지 않는다」가 완성되지 않는다.

  // ① 띠 — 꽉 찬 초록 버튼은 기관정보 화면의 이 하나뿐이다.
  const view = app.slice(app.indexOf('function applicantsToolView()'), app.indexOf('function applicantSourcesView('));
  assert.equal([...view.matchAll(/class="button go(?![-\w])/g)].length, 0);
  // 꽉 찬 초록은 앱 전체에서 stepBar() 안의 한 줄뿐이다(23-03).
  const bar = app.slice(app.indexOf('function stepBar(step, {'), app.indexOf('function bindNextStepBar('));
  assert.equal([...bar.matchAll(/class="button go(?![-\w])/g)].length, 1);
  assert.equal([...app.matchAll(/class="button go next-step"/g)].length, 1);

  // ② 그 자리 — 띠가 데려가는 곳이 곧 초록 테두리가 붙는 구역 카드다. 같은 값을 읽는다.
  const where = app.slice(app.indexOf('function stepGroupKey(step)'), app.indexOf('// 지금 「다음 할 일」이 무엇인지'));
  assert.match(where, /if \(step\.area === 'performance'\) return 'performance';/);
  assert.match(where, /return areaDestination\(\(step\.areas \|\| \[\]\)\[0\] \|\| ''\);/);
  // 바깥 카드가 아니라 그 구역 카드로 데려간다. 바깥까지만 데려다 놓으면 거기서 또 찾아야 한다.
  assert.match(where, /if \(group\) return `\[data-detail-group="\$\{group\}"\]`;/);

  // ③ 거기서 할 일 — 확인 전이 남은 구역이면 어느 구역이든 「N건 모두 확인」이 있다.
  const button = app.slice(app.indexOf('function confirmGroupButton(groupKey, pending)'), app.indexOf('function detailGroupPanel('));
  assert.match(button, /goMark\('confirm', groupKey\)/);
  assert.match(button, /data-confirm-group="/);
  assert.match(button, /\$\{pending\}건 모두 확인/);
  // 실적만이 아니다. 상세 여덟 구역이 같은 셈을 쓴다.
  const panel = app.slice(app.indexOf('function detailGroupPanel(applicant, group)'), app.indexOf('// 실적을 한 번에 확인됨으로 올리는 줄'));
  assert.match(panel, /const pending = group\.total - group\.confirmed;/);
  assert.doesNotMatch(panel, /group\.key === 'performance' \? group\.total - group\.confirmed : 0/);
  // 기본정보 안의 두 구역에도 같은 단추가 있다.
  const basic = app.slice(app.indexOf("function applicantBasicView(applicant, who = '신청기관')"), app.indexOf('function applicantCandidateView('));
  assert.match(basic, /action: confirmGroupButton\(area\.key, pending\),/);

  // 누르면 그 구역을 통째로 올리고, 되돌리는 길이 같은 자리에 남는다.
  assert.match(app, /function confirmAllInGroup\(groupKey\) \{/);
  assert.match(app, /applicantConfirmUndo: \{ applicantId: applicant\.id, group: groupKey, at: Date\.now\(\), items: changed \}/);
  assert.match(app, /confirmAllInGroup\(el\.dataset\.confirmGroup\)/);
  assert.match(app, /function groupUndoBar\(applicant, groupKey\)/);
});

test('가리키는 자리가 접혀 있으면 그 자리가 열린 채로 시작한다', () => {
  // 가리켜 놓고 감추면 눌러서 열고 또 찾아야 한다.
  // 중분류는 한 번에 하나만 열리므로(22-01), 처음 열리는 하나가 판정이 가리키는 것이어야 한다.
  const where = app.slice(app.indexOf('function orgStepSection()'), app.indexOf('function openStepSection(screen)'));
  assert.match(where, /if \(group\) return BASIC_AREAS\.includes\(group\) \? 'basic' : 'detail';/);
  assert.match(where, /'add-org': 'picker', basic: 'basic', upload: 'basic', apply: 'candidates'/);
  const key = app.slice(app.indexOf('function openSectionKeys(screen)'), app.indexOf('// 중분류 한 칸.'));
  // 사람이 고른 적이 있으면 그것이 답이다. 빈 목록은 「모두 닫아 두었다」는 뜻이라 그대로 둔다.
  assert.match(key, /const open = resolveOpenGroups\(\(state\.openSections \|\| \{\}\)\[screen\], keys\.includes\(pointed\) \? pointed : '', keys\[0\] \|\| ''\);/);
  assert.match(key, /return open\.filter\(one => keys\.includes\(one\)\);/);
  // 소분류도 같은 규칙이다.
  assert.match(app, /function stepPointsAt\(groupKey\) \{\s*\n\s*return Boolean\(groupKey\) && stepGroupKey\(orgStepInfo\(\)\) === groupKey;/);
  // 띠를 누르면 가리키는 중분류와 구역을 함께 연다.
  const opener = app.slice(app.indexOf('function openStepSection(screen)'), app.indexOf('function openSectionKeys(screen)'));
  // 여는 것이지 뺏는 것이 아니다 — 사람이 열어 둔 나머지는 그대로 둔다(24-07).
  assert.match(opener, /\[screen\]: nextOpenGroups\(openSectionKeys\(screen\), key, true\)/);
  assert.match(opener, /if \(screen === 'applicants' && group\) state\.openOrgGroups = nextOpenGroups\(openGroupKeys\(\), group, true\);/);
});

test('초록은 판정이 가리킬 때만 켜지고 글자를 함께 둔다', () => {
  const gate = app.slice(app.indexOf("function goHere(key, area = '')"), app.indexOf('function orgNextStepBar()'));
  // 열쇠말만 보지 않는다. 구역까지 말한 자리는 그 구역일 때만 켜진다.
  assert.match(gate, /return area \? stepGroupKey\(step\) === area : true;/);
  // ③ 할 일은 테두리와 화살표, ② 자리는 테두리만. 꽉 찬 초록은 맨 위 띠 버튼 하나뿐이다(22-52).
  assert.match(gate, /return goHere\(key, area\) \? ' go-target' : '';/);
  assert.match(gate, /return goHere\(key, area\) \? ' go-place' : '';/);
  // 색만으로 알리지 않는다.
  assert.match(app, /goNote\('upload', '여기에 올리세요'\)/);
  assert.match(app, /goNote\('basic', '여기를 채우세요'\)/);
  assert.match(app, /goNote\('add-org', '여기에 기관명을 적으세요'\)/);
  // 초록은 한 값에서만 온다.
  assert.match(css, /--go:#03C75A/);
  assert.match(css, /\.button\.go\{background:var\(--go\)/);
  assert.match(css, /\.go-target\{[^}]*border:2px solid var\(--go\)/);
  // 자리에는 화살표를 붙이지 않는다. 화살표가 둘이면 어디를 누르라는 말인지 다시 흐려진다.
  assert.match(css, /\.go-place\{border-color:var\(--go\)/);
  assert.ok(!css.includes('.go-place::before'));
});

test('기록할 자리 앞에 화살표가 네 번 깜박이고 멈춘다', () => {
  // 초록이 붙는 그 자리에만 붙는다. 판정이 옮겨 가면 화살표도 함께 옮겨 간다.
  assert.match(css, /\.go-target::before\{content:'➜'/);
  assert.match(css, /animation:goArrow 1\.4s ease-out 4\}/);
  assert.match(css, /@keyframes goArrow\{/);
  // 글꼴에 이 글자가 없으면 네모가 뜬다. 기호 글꼴을 뒤에 세워 어디서나 화살표가 나오게 한다(22-53④).
  assert.match(css, /\.go-target::before\{[^}]*font-family:"Segoe UI Symbol"/);
  // 버튼에도 붙는다. 버튼은 자리가 좁으므로 위치를 다시 정해 둔다.
  assert.match(css, /\.button\.go-target::before\{top:9px;left:9px\}/);
  // 값이 들어가면 초록이 사라지고 화살표도 함께 사라진다 — 같은 클래스에 매여 있다.
  assert.match(css, /\.go-target\{position:relative;border:2px solid var\(--go\)/);
  // 움직임을 줄여 달라고 해 둔 분에게는 화살표만 두고 깜박임을 없앤다.
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]{0,240}\.go-target::before\{animation:none\}/);
});

test('확인 전이 실적 밖이면 실적을 펼치지 않고 어디인지 말한다', () => {
  // 실제로 났던 일: 확인 전 8건이 기본정보 쪽인데 「확인 전」이라는 열쇠말만 보고
  // 실적 96건이 통째로 펼쳐졌다(22-49).
  const step = nextOrgStep({
    applicantCount: 1, hasApplicant: true, basicMissing: [], itemCount: 104, candidateCount: 0,
    performanceUnconfirmed: 0, otherUnconfirmed: 8,
    otherUnconfirmedAreas: [{ key: 'basic', title: '기관 기본정보', count: 5 }, { key: 'legal', title: '법적 유형·신청자격', count: 3 }]
  });
  assert.equal(step.key, 'confirm');
  assert.equal(step.area, 'other');
  assert.deepEqual(step.areas, ['basic', 'legal']);
  // 8건이 어디에 있는지 문장에 적는다. 「8건」만으로는 어디를 열어야 할지 알 수 없다.
  assert.match(step.message, /기관 기본정보 5건 · 법적 유형·신청자격 3건/);
});

test('실적이 확인 전이면 실적을 가리킨다', () => {
  const step = nextOrgStep({
    applicantCount: 1, hasApplicant: true, basicMissing: [], itemCount: 104, candidateCount: 0,
    performanceUnconfirmed: 96, otherUnconfirmed: 8
  });
  assert.equal(step.area, 'performance');
  assert.match(step.actionLabel, /96건 모두 확인/);
});
