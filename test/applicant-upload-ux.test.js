// 올린 뒤 무슨 일이 일어났는지 보이게 한다.
//
// 실제로 났던 일: 「업데이트 후보 만들기를 눌렀지만 어떤 변화가 있는지 모르겠다. 아래에
// 후보 99개가 생겼지만 알아차림 표시가 없었다」, 「신규·누적·근거 추가만 일괄 반영을
// 어렵게 찾았다」. 결과는 화면 한참 아래에 조용히 생겼고 다음에 누를 곳은 회색 버튼이었다.
//
// 새 장치를 만들지 않는다. AI 결과 알림이 쓰던 길(pendingAiMove → 앵커로 스크롤 + result-flash)을
// 그대로 쓰고, 다음에 누를 버튼 하나만 표시한다. 화면 전체를 깜박이게 하지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('후보가 생기면 그 자리로 데려가고 잠깐 강조한다', () => {
  const build = app.slice(app.indexOf('function buildApplicantCandidates('), app.indexOf('function harvestApplicantFromCoaching'));
  assert.match(build, /pendingAiMove = \{ anchor: '#applicant-candidates', sameView: true \}/);
  // 후보가 없으면 데려갈 자리도 없다.
  assert.match(build, /if \(review\.candidates\.length\) pendingAiMove/);
  // 앵커는 후보 목록에 실제로 있다.
  assert.match(app, /<div id="applicant-candidates" tabindex="-1">/);
  // 이미 있는 강조 방식을 그대로 쓴다.
  const move = app.slice(app.indexOf('function runPendingAiMove()'), app.indexOf('function showAiResultLocation()'));
  assert.match(move, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(move, /classList\.add\('result-flash'\)/);
});

test('몇 건을 찾았는지와 다음에 누를 곳을 함께 알린다', () => {
  const build = app.slice(app.indexOf('function buildApplicantCandidates('), app.indexOf('function harvestApplicantFromCoaching'));
  assert.match(build, /에서 \$\{review\.candidates\.length\}건을 찾았습니다/);
  assert.match(build, /신규·누적·근거 추가만 일괄 반영/);
  // 못 찾았을 때는 못 찾았다고 말한다. 조용히 끝내지 않는다.
  assert.match(build, /기관 정보로 쓸 사실을 찾지 못했습니다/);
  const view = app.slice(app.indexOf('function candidateReviewView(review)'), app.indexOf('function coachingApplicantView()'));
  assert.match(view, /문서에서 \$\{review\.candidates\.length\}건을 찾았습니다/);
  // 한 번에 들어가는 건수를 버튼에 적어 둔다.
  assert.match(view, /const safe = review\.candidates\.filter\(item => SAFE_KINDS\.includes\(item\.kind\)\)\.length;/);
});

test('다음에 누를 곳 하나만 표시하고 화면 전체를 깜박이지 않는다', () => {
  const view = app.slice(app.indexOf('function candidateReviewView(review)'), app.indexOf('function coachingApplicantView()'));
  // 다음 할 일은 화면 맨 위 띠 하나가 말한다(22-12). 목록 안 단추는 주 버튼이 아니다.
  // 후보가 있으면 초록으로 눈에 띄게 한다(22-19). 갈색은 맨 위 띠 하나뿐이라 자리가 겹치지 않는다.
  assert.match(view, /class="button secondary\$\{goMark\('apply'\)\}" id="apply-safe-candidates"/);
  // 띠 안 버튼이 초록이다(22-52). 갈색은 「다음 할 일」에 쓰지 않는다.
  assert.match(app, /<button class="button go next-step" id="\$\{actionId\}"/);
  // 맥박은 네 번만 뛰고 멈춘다. 계속 움직이면 읽는 것을 방해한다.
  assert.match(css, /\.button\.next-step\{animation:nextStep 1\.5s ease-out 4\}/);
  assert.match(css, /@keyframes nextStep\{/);
  // 움직임을 줄여 달라고 해 둔 사람에게는 테두리로만 알린다.
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\s*\.button\.next-step\{animation:none;outline:2px solid var\(--blue\)/);
});

test('끌어다 놓기는 클릭과 같은 길로 간다', () => {
  // 카드 안 아무 곳에 놓아도 파일로 받는다. 붙여넣기 칸에 놓으면 파일 이름만 글자로 붙던 자리다.
  assert.match(app, /bindDropzone\('#applicant-doc-drop', files => void loadApplicantDocumentFile\(files\[0\]\)\);/);
  assert.match(app, /bindDropzone\('#applicant-doc', files => void loadApplicantDocumentFile\(files\[0\]\)\);/);
  assert.match(app, /<label class="dropzone" id="applicant-doc-drop" for="applicant-doc-file">/);
  // 고르기와 끌어다 놓기가 같은 함수를 부른다.
  assert.match(app, /async function loadApplicantDocumentFile\(file\) \{/);
  assert.match(app, /return loadApplicantDocumentFile\(event\.target\.files\?\.\[0\]\);/);
});

test('「여기에 놓기」라고 적힌 자리는 실제로 받는다', () => {
  // 1단계 공고문 업로드는 안내만 있고 처리기가 없어, 놓으면 파일이 그냥 열렸다.
  assert.match(app, /<label class="dropzone" id="notice-dropzone" for="source-files">/);
  assert.match(app, /bindDropzone\('#notice-dropzone', files => void addNoticeFiles\(files\)\);/);
  assert.match(app, /<label class="dropzone" id="manual-dropzone" for="manual-source-files">/);
  assert.match(app, /bindDropzone\('#manual-dropzone', files => addManualFiles\(\{ target: \{ files \} \}\)\);/);
});

test('글자를 끌어다 놓은 것은 가로채지 않는다', () => {
  const zone = app.slice(app.indexOf('function bindDropzone(selector, onFiles)'), app.indexOf('function fitTextarea('));
  // 파일이 아닐 때는 브라우저에 맡긴다. 우리가 preventDefault 하면 글자 끌어놓기가 죽는다.
  assert.match(zone, /if \(!files\.length\) return;/);
  const dropBody = zone.slice(zone.indexOf("addEventListener('drop'"));
  assert.ok(dropBody.indexOf('if (!files.length) return;') < dropBody.indexOf('stop(event);'), '파일 확인이 preventDefault보다 먼저다');
});

test('반영한 뒤에는 어디에 들어갔는지 보여 준다', () => {
  const apply = app.slice(app.indexOf('function applySafeApplicantCandidates()'), app.indexOf('function selectApplicantForProject('));
  // 넣은 자리를 열고 그 자리로 데려간다.
  assert.match(apply, /const group = areaDestination\(review\.candidates\.find\(candidate => SAFE_KINDS\.includes\(candidate\.kind\)\)\?\.area \|\| ''\);/);
  assert.match(apply, /pendingAiMove = \{ anchor: `\[data-detail-group="\$\{group\}"\]`, sameView: true \}/);
  assert.match(apply, /openOrgGroup: group \|\| state\.openOrgGroup,/);
  // 확인해야 쓰인다는 것을 그 자리에서 말한다.
  assert.match(apply, /모두 ‘확인 필요’ 상태이며, 확인해야 계획서에 사실로 쓰입니다/);
});
