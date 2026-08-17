// 다섯 자리 파이프라인. 배지와 패널이 같은 값을 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PIPELINE_STAGES, buildWritingPipeline } from '../src/writing-pipeline.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('자리는 다섯이고 순서가 정해져 있다', () => {
  assert.deepEqual(PIPELINE_STAGES.map(stage => stage.key), ['notice', 'analysis', 'design', 'writing', 'review']);
  assert.deepEqual(PIPELINE_STAGES.map(stage => stage.label), ['공고', '분석', '설계', '작성', '검증']);
});

test('아무것도 하지 않았으면 0이고 지금 자리는 공고다', () => {
  const pipeline = buildWritingPipeline({});
  assert.equal(pipeline.done, 0);
  assert.equal(pipeline.total, 5);
  assert.equal(pipeline.current.key, 'notice');
  assert.equal(pipeline.complete, false);
});

test('공고는 고르거나 붙여넣거나 둘 중 하나면 지난 것으로 본다', () => {
  assert.equal(buildWritingPipeline({ notice: { title: '취약계층 아동 교육사업' } }).done, 1);
  assert.equal(buildWritingPipeline({ pastedText: '가'.repeat(30) }).done, 1);
  // 너무 짧은 붙여넣기는 공고로 보지 않는다.
  assert.equal(buildWritingPipeline({ pastedText: '짧은 메모' }).done, 0);
});

test('설계는 사용자가 값을 확정했거나 마스터 설계가 나왔을 때다', () => {
  assert.equal(buildWritingPipeline({ projectValues: [{ key: 'target', value: '초1~초6 아동' }] }).current.key, 'notice');
  const withDesign = buildWritingPipeline({ notice: { title: 'ㄱ' }, analysis: { requirements: [1] }, projectValues: [{ value: '40명' }] });
  assert.equal(withDesign.done, 3);
  assert.equal(withDesign.current.key, 'writing');
  // 값이 빈 항목만 있으면 설계로 치지 않는다. 지어내지 않는다.
  assert.equal(buildWritingPipeline({ projectValues: [{ key: 'target', value: '' }] }).done, 0);
});

test('검증은 코칭·정밀검증·심사검토 어느 것이든 하나면 지난 것으로 본다', () => {
  const base = { notice: { title: 'ㄱ' }, analysis: { requirements: [1] }, projectValues: [{ value: 'ㄴ' }], sections: [{ id: 's1' }] };
  assert.equal(buildWritingPipeline(base).done, 4);
  assert.equal(buildWritingPipeline({ ...base, coaching: { result: {} } }).complete, true);
  assert.equal(buildWritingPipeline({ ...base, preciseReview: { summary: {} } }).complete, true);
  assert.equal(buildWritingPipeline({ ...base, reviewResult: {} }).complete, true);
});

test('화면은 한 곳에서 세고 배지와 줄이 그 값을 함께 쓴다', () => {
  assert.match(app, /function currentPipeline\(\)/);
  assert.match(app, /function pipelineBar\(\)/);
  // 머리 앞쪽에 배지가 붙은 「작성 과정」이 있고 그 아래에 줄이 있다.
  assert.match(app, /data-open-sheet="design">작성 과정\$\{sheetBadge\(`\$\{pipeline\.done\}\/\$\{pipeline\.total\}`/);
  assert.match(app, /<\/div>\s*\n\s*\$\{pipelineBar\(\)\}/);
  // 패널을 열면 맨 위가 파이프라인이다.
  assert.match(app, /body: `\$\{pipelineBar\(\)\}\$\{strategyView\(\)\}/);
  // 지난 자리·지금 자리를 눈으로 가른다.
  assert.match(app, /pipeline-step\$\{stage\.done \? ' done' : ''\}/);
});

test('간편 화면은 공고 얻는 길을 두 갈래로 보여 준다', () => {
  const view = app.slice(app.indexOf('function simpleWriteView()'), app.indexOf('function documentView()'));
  assert.match(view, /① 모아 둔 공고에서 찾기/);
  assert.match(view, /② 내가 찾은 공고 넣기/);
  assert.match(view, /id="simple-find"/);
  assert.match(view, /data-open-sheet="notice"/);
  // 내가 찾은 공고는 주소·파일·본문 세 길을 모두 받는다.
  const sheet = app.slice(app.indexOf("notice: () => ({"), app.indexOf('marks: () => ('));
  assert.match(sheet, /id="sheet-import-url"/);
  assert.match(sheet, /id="sheet-notice-file"/);
  assert.match(sheet, /id="sheet-notice-save"/);
  // 세 길 모두 기존 경로에 잇는다. 새 수집 경로를 만들지 않는다.
  assert.match(app, /document\.querySelector\('#sheet-import-url'\)\?\.addEventListener\('click', \(\) => \{ closeSheet\(\); void addMissingNotice\(\); \}\)/);
  assert.match(app, /void addNoticeFiles\(files\)/);
});

test('파일 읽기는 한 곳에만 둔다', () => {
  assert.match(app, /async function addNoticeFiles\(chosen = \[\]\)/);
  assert.match(app, /fileInput\.onchange = e => void addNoticeFiles\(\[\.\.\.e\.target\.files\]\)/);
  // 읽지 못한 파일도 목록에 남긴다.
  const fn = app.slice(app.indexOf('async function addNoticeFiles('), app.indexOf('// 지금 어디까지 왔는지'));
  assert.match(fn, /failed\.push\(/);
  assert.match(fn, /읽지 못해 이유를 표시했습니다/);
});
