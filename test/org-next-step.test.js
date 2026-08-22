// 지금 할 일 하나를 한 곳에서 정한다.
//
// 실제로 났던 일: 「일괄 반영」·「모두 확인됨으로」·「계획서 작성으로」를 세 번 연속 찾지 못했다.
// 이 화면의 주 버튼 자리가 아홉 곳이었으니 어느 것도 다음 할 일이 아니었다.
// 판정은 nextOrgStep 한 곳에서만 하고, 화면은 그 결과만 그린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NEXT_STEP_KEYS, nextOrgStep } from '../src/org-next-step.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
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
  assert.match(bar, /const step = nextOrgStep\(\{/);
  // 화면이 스스로 판정하지 않는다.
  assert.doesNotMatch(bar, /if \(.*applicantCount === 0\)/);
});

test('이 화면의 주 버튼은 띠 안의 하나뿐이다', () => {
  const names = ['applicantsToolView', 'orgNextStepBar', 'applicantBasicView', 'profileBridgePanel', 'applicantScopeView', 'applicantSourceView',
    'applicantDetailView', 'detailGroupPanel', 'performanceConfirmBar', 'applicantAreaFields', 'applicantSourcesView', 'applicantDocumentView', 'candidateReviewView', 'ideaAssetPanel'];
  const found = [];
  for (const name of names) {
    const start = app.indexOf(`function ${name}(`);
    if (start < 0) continue;
    const body = app.slice(start, app.indexOf('\n}\n', start));
    for (const match of body.matchAll(/button primary[^>]*id="([^"]*)"/g)) found.push(match[1]);
    // id가 없는 주 버튼도 세어야 한다.
    for (const match of body.matchAll(/button primary(?![^>]*id=)/g)) found.push(`${name}:이름없음`);
  }
  assert.deepEqual(found, ['next-step-action'], `주 버튼: ${found.join(', ')}`);
});

test('「채우러 가기」는 그 자리로 데려간다', () => {
  const handler = app.slice(app.indexOf("document.querySelector('#next-step-action')"), app.indexOf("document.querySelector('#undo-confirm-performance')"));
  assert.match(handler, /focusAnchor\(button\.dataset\.nextAnchor/);
  // 실적 확인은 데려가지 않고 그 자리에서 끝낸다.
  assert.match(handler, /if \(button\.dataset\.nextBulk\) return confirmAllPerformance\(\);/);
  assert.match(handler, /if \(button\.dataset\.nextKey === 'write'\) return void saveBasicInfo\(\{ thenWrite: true \}\);/);
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

test('초록은 한 자리뿐이다', () => {
  // 갈색이 아홉 자리로 늘어 뜻을 잃었던 길을 초록이 그대로 가지 않게 한다.
  // 초록은 goMark 한 통로로만 붙고, 그 통로는 「다음 할 일」 판정이 가리킬 때만 열린다.
  const names = ['applicantsToolView', 'orgPickerView', 'orgNextStepBar', 'applicantBasicView', 'profileBridgePanel', 'applicantScopeView', 'applicantSourceView',
    'applicantDetailView', 'detailGroupPanel', 'performanceConfirmBar', 'applicantAreaFields', 'applicantSourcesView', 'applicantDocumentView', 'candidateReviewView', 'ideaAssetPanel'];
  const marks = [];
  for (const name of names) {
    const start = app.indexOf(`function ${name}(`);
    if (start < 0) continue;
    const body = app.slice(start, app.indexOf('\n}\n', start));
    // 초록이 붙는 곳은 모두 goMark를 지나야 한다.
    for (const match of body.matchAll(/go-target|class="[^"]*go/g)) {
      assert.ok(/goMark\(/.test(body.slice(Math.max(0, match.index - 120), match.index + 120)), `${name}에서 goMark를 지나지 않은 초록이 있습니다`);
    }
    for (const match of body.matchAll(/goMark\('([^']+)'/g)) marks.push(match[1]);
  }
  // 한 판정에 한 자리다. 같은 열쇠가 두 곳에 붙으면 초록이 둘이 된다.
  assert.deepEqual([...marks].sort(), [...new Set(marks)].sort(), `같은 판정에 초록이 둘 이상입니다: ${marks.join(', ')}`);
  // 다섯 갈래에 각각 한 자리씩 있다.
  assert.deepEqual(marks.sort(), ['add-org', 'apply', 'basic', 'confirm', 'upload']);
});

test('초록은 판정이 가리킬 때만 켜지고 글자를 함께 둔다', () => {
  const gate = app.slice(app.indexOf('function goMark(key, kind'), app.indexOf('function orgNextStepBar()'));
  assert.match(gate, /if \(orgStepKey\(\) !== key\) return '';/);
  assert.match(gate, /kind === 'button' \? ' go' : ' go-target'/);
  // 색만으로 알리지 않는다.
  assert.match(app, /goNote\('upload', '여기에 올리세요'\)/);
  assert.match(app, /goNote\('basic', '여기를 채우세요'\)/);
  assert.match(app, /goNote\('add-org', '여기에 기관명을 적으세요'\)/);
  // 초록은 한 값에서만 온다.
  assert.match(css, /--go:#03C75A/);
  assert.match(css, /\.button\.go\{background:var\(--go\)/);
  assert.match(css, /\.go-target\{[^}]*border:2px solid var\(--go\)/);
});
