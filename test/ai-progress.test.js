import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const taskBlock = app.slice(app.indexOf('const AI_TASKS = {'), app.indexOf('let aiTask = null;'));

test('AI·API 작업마다 진행 이름과 완료 후 결과 위치를 정의한다', () => {
  const ids = [...taskBlock.matchAll(/^ {2}([a-zA-Z0-9]+): \{/gm)].map(match => match[1]);
  assert.ok(ids.length >= 18, `작업 정의 ${ids.length}개`);
  for (const id of ['analyze', 'master', 'parts', 'assemble', 'review', 'coaching', 'coachingRevision', 'repairV2']) {
    assert.ok(ids.includes(id), `${id} 작업 정의 없음`);
  }
  // 모든 작업은 완료 문구와 결과 앵커를 갖는다.
  for (const line of taskBlock.split('\n').filter(entry => /^ {2}[a-zA-Z0-9]+: \{/.test(entry))) {
    assert.match(line, /busy: '/, line);
    assert.match(line, /done: '[^']*완료'/, line);
    assert.match(line, /anchor: '#/, line);
  }
});

test('진행시간은 하나의 타이머로 초·분으로 세고 폴링을 늘리지 않는다', () => {
  assert.match(app, /function aiTaskLabel\(seconds\)/);
  // 00:00은 시각처럼 보인다. 1분 미만은 「42초」, 넘으면 「5분 33초」로 읽어 준다.
  assert.ok(app.includes("if (value < 60) return `${String(value).padStart(2, '0')}초`;"));
  assert.ok(app.includes("return `${Math.floor(value / 60)}분 ${String(value % 60).padStart(2, '0')}초`;"));
  // 수정 요청도 같은 타이머를 쓴다. 기다리는 동안 멈춘 것처럼 보이지 않게 한다.
  assert.ok(app.includes("setAiBusy('요청한 곳만 고치는 중...'"));
  assert.match(app, /경과시간 \$\{aiTaskLabel\(\(Date\.now\(\) - startedAt\) \/ 1000\)\}/);
  assert.match(app, /aiTask = taskId && AI_TASKS\[taskId\] \? \{ id: taskId, startedAt: busyStartedAt/);
  // background 검증은 최초 요청 시각을 그대로 이어 쓴다.
  assert.match(app, /startedAt: busyStartedAt \|\| Date\.now\(\)/);
  assert.match(app, /setTimeout\(\(\) => pollProposalCoaching\(\), 5000\)/);
});

test('완료되면 결과 위치로 옮기고 실패하면 옮기지 않는다', () => {
  assert.match(app, /function closeAiTask\(patch\)/);
  assert.match(app, /const failed = Boolean\(patch\.error\) && !patch\.partial;/);
  assert.match(app, /if \(!failed\) pendingAiMove = result;/);
  assert.match(app, /function runPendingAiMove\(\)/);
  assert.match(app, /if \(!move\.sameView\) return;/);
  assert.match(app, /target\.classList\.add\('result-flash'\)/);
  assert.match(app, /bind\(\); startBusyElapsedTimer\(\); fitAutoGrow\(\); runPendingAiMove\(\);/);
  // 실패는 현재 위치에서 원인을 보여 주고 다시 시도만 제공한다.
  assert.match(app, /data-ai-retry="\$\{escapeHtml\(result\.retry\)\}"/);
  assert.match(app, /다시 시도<\/button>/);
});

test('다른 화면으로 옮겨 갔으면 결과 보기 버튼으로만 이동한다', () => {
  assert.match(app, /sameView: task\.location === aiTaskLocation\(\)/);
  assert.match(app, /id="ai-result-go">결과 보기<\/button>/);
  assert.match(app, /function showAiResultLocation\(\)/);
  assert.match(app, /pendingAiMove = \{ \.\.\.result, sameView: true \}/);
});

test('결과 앵커와 강조 표시가 화면에 존재한다', () => {
  for (const anchor of ['result-logic', 'result-analysis', 'result-master', 'result-pipeline', 'result-repair', 'result-coaching', 'result-draft-check']) {
    assert.ok(app.includes(`id="${anchor}"`), `${anchor} 앵커 없음`);
  }
  assert.match(css, /\.result-flash\{animation:resultFlash/);
  assert.match(css, /\.ai-result\{/);
  // 새 페이지·라우트를 만들지 않는다.
  assert.doesNotMatch(app, /history\.pushState|new URL\(location/);
});

test('기존 AI 호출 흐름은 그대로 두고 작업 id만 덧붙인다', () => {
  const tagged = [...app.matchAll(/setAiBusy\([^\n]*?, '([a-zA-Z0-9]+)'\);/g)].map(match => match[1]);
  assert.ok(tagged.length >= 17, `작업 id가 붙은 호출 ${tagged.length}건`);
  for (const id of tagged) assert.ok(taskBlock.includes(`  ${id}: {`), `${id} 정의 없음`);
  // 완료 처리는 busy가 끝나는 한 곳에서만 한다.
  // 완료 처리는 상태 갱신과 단계 이동 두 경로에서 같은 함수를 쓴다.
  assert.equal((app.match(/const result = closeAiTask\(patch\);/g) || []).length, 2);
});

test('단계 이동으로 끝나는 작업도 완료 표시를 남기고 검증은 끝날 때까지 시간을 보여 준다', () => {
  // 마스터 설계처럼 navigateToStep으로 끝나는 작업도 ✓ 표시와 결과 이동을 받는다.
  assert.match(app, /function applyWorkflowLocation\(location, patch = \{\}\) \{[\s\S]{0,320}closeAiTask\(patch\)/);
  // background 검증은 시작이 아니라 완료 시점에 끝난다.
  assert.match(app, /setState\(\{ busy: '계획서 검증 중', coaching: state\.coaching/);
  assert.match(app, /if \(\['queued', 'in_progress'\]\.includes\(result\.status\)\) state\.busy = '계획서 검증 중';/);
  assert.match(app, /saveState\(\); render\(\); startBusyElapsedTimer\(\);/);
  // 전체 작성 후 자동 결합은 작성 시작 시각을 이어 쓴다.
  assert.match(app, /function markAiDoneAt\(taskId, startedAt, patch = \{\}\)/);
  assert.match(app, /assembleProposal\(startedAt\)/);
});
