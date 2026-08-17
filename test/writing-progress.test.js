// 부분 결과. 멈춤·오류·새로고침·재로그인 뒤에도 끝난 묶음을 잃지 않고, 완성 전에는 저장·출력을 열지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { duplicateCalls, elapsedLabel, partialBlockReason, recordTiming, remainingGroups, timelineRows, writingState } from '../src/writing-progress.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const staged = (done, extra = {}) => ({
  master: { sectionPlan: [{ id: 'g1', title: '사업 개요' }, { id: 'g2', title: '추진 계획' }, { id: 'g3', title: '예산' }] },
  completedGroupIds: ['g1', 'g2', 'g3'].slice(0, done),
  parts: [], ...extra
});

test('묶음이 남아 있으면 완성이 아니다', () => {
  const partial = writingState(staged(2), { busy: '', sections: 5 });
  assert.equal(partial.partial, true);
  assert.equal(partial.complete, false);
  assert.equal(partial.done, 2);
  assert.equal(partial.total, 3);
  const full = writingState(staged(3), { busy: '', sections: 9 });
  assert.equal(full.complete, true);
  assert.equal(full.partial, false);
});

test('부분 결과에서는 저장·출력을 열지 않는다', () => {
  assert.match(partialBlockReason(staged(2), { busy: '', sections: 5 }), /3묶음 중 2묶음까지만/);
  // 쓰는 중에도 열지 않는다.
  assert.match(partialBlockReason(staged(1), { busy: '작성 중', sections: 2 }), /아직 쓰는 중/);
  // 다 끝나면 막을 이유가 없다.
  assert.equal(partialBlockReason(staged(3), { busy: '', sections: 9 }), '');
  // 아직 시작도 안 했으면 이 판단이 관여하지 않는다.
  assert.equal(partialBlockReason(null, { busy: '', sections: 0 }), '');
});

test('이어쓰기는 남은 묶음만 다시 부른다', () => {
  const left = remainingGroups(staged(2));
  assert.deepEqual(left.map(group => group.id), ['g3']);
  // 끝난 묶음은 목록에 없다. 다시 부르지 않는다는 뜻이다.
  assert.equal(remainingGroups(staged(3)).length, 0);
});

test('같은 묶음을 두 번 부르면 드러난다', () => {
  assert.deepEqual(duplicateCalls({ g1: 1, g2: 1 }), []);
  assert.deepEqual(duplicateCalls({ g1: 1, g2: 2 }), [{ id: 'g2', count: 2 }]);
});

test('진행 기록은 저장된 시각과 걸린 시간만 적는다', () => {
  const timeline = recordTiming([], { kind: 'design', title: '설계 요약', at: '2026-08-13T10:20:30.000Z', ms: 65000 });
  const rows = timelineRows(timeline);
  assert.equal(rows[0].at, '10:20:30');
  assert.equal(rows[0].took, '1분 05초');
  assert.equal(elapsedLabel(9000), '9초');
});

// ---------- 화면과 처리 ----------

test('멈추면 이번 묶음까지만 쓰고 다음 묶음은 시작하지 않는다', () => {
  assert.match(app, /if \(stopWriting\) return stopWritingHere\(completed\.size, all\.length\);/);
  assert.match(app, /if \(stopWriting && completed\.size < all\.length\) return stopWritingHere\(completed\.size, all\.length\);/);
  assert.match(app, /function requestStopWriting\(\) \{/);
  assert.match(app, /id="stop-writing"/);
  // 멈춰도 끝난 묶음은 지우지 않는다.
  const fn = app.slice(app.indexOf('function stopWritingHere('), app.indexOf('function stopWritingHere(') + 900);
  assert.ok(!/completedGroupIds = \[\]|parts = \[\]/.test(fn), '멈춤이 끝난 묶음을 지우면 안 된다');
  assert.match(fn, /archiveCurrentProposal\('parts'\)/);
});

test('묶음마다 보관자료에 남겨 새로고침·재로그인에도 살아남는다', () => {
  const loop = app.slice(app.indexOf('async function generateProposalParts()'), app.indexOf('// 멈춤. 지금 호출까지만'));
  // 묶음이 끝날 때마다 저장한다. 마지막에 한 번만 저장하면 도중에 나가면 잃는다.
  assert.match(loop, /state\.sections = sectionsSoFar\(\);[\s\S]{0,600}archiveCurrentProposal\('parts'\)/);
  // 오류가 나도 끝난 것까지 저장한다.
  assert.match(loop, /state\.stagedGeneration\.failedGroupId = groups\.find\(group => !completed\.has\(group\.id\)\)\?\.id \|\| '';/);
});

test('묶음별 호출 횟수를 남겨 중복 호출을 확인한다', () => {
  assert.match(app, /state\.stagedGeneration\.calls = \{ \.\.\.\(state\.stagedGeneration\.calls \|\| \{\}\), \[group\.id\]: Number\(\(state\.stagedGeneration\.calls \|\| \{\}\)\[group\.id\]\) \+ 1 \}|calls \|\| \{\}\)\[group\.id\] \|\| 0\) \+ 1/);
  // 이미 끝난 묶음은 건너뛴다.
  assert.match(app, /if \(completed\.has\(group\.id\)\) continue;/);
  // 같은 단추를 두 번 눌러도 두 번 돌지 않는다.
  assert.match(app, /async function generateProposalParts\(\) \{\s*\n\s*if \(aiBusy/);
});

test('설계와 묶음이 나온 시각을 실제로 기록한다', () => {
  // 설계는 두 걸음이라 기록도 두 줄이다.
  assert.match(app, /\{ kind: 'design', title: '설계 뼈대', at: new Date\(stepAt\.design \|\| Date\.now\(\)\)\.toISOString\(\)/);
  assert.match(app, /\{ kind: 'design', title: '논리·목차', at: new Date\(\)\.toISOString\(\)/);
  assert.match(app, /kind: 'group', id: group\.id, title: group\.title, at: new Date\(\)\.toISOString\(\), ms: Date\.now\(\) - groupStartedAt/);
  assert.match(app, /\{ kind: 'done', title: '전체 완성', at: new Date\(\)\.toISOString\(\), ms: Date\.now\(\) - startedAt \}/);
  assert.match(app, /function writingTimelineView\(\) \{/);
});

test('저장·출력 처리기가 부분 결과를 마지막에 한 번 더 막는다', () => {
  assert.match(app, /function refusePartial\(\) \{/);
  for (const id of ['#final-docx-top', '#final-hwpx-top', '#final-pdf-top', '#final-form-docx', '#save-proposal-archive', '#package-docx', '#package-pdf']) {
    const at = app.indexOf(`querySelector('${id}')?.addEventListener`);
    assert.ok(at > 0, id);
    assert.match(app.slice(at, at + 260), /if \(!refusePartial\(\)\)|if \(refusePartial\(\)\) return;/, id);
  }
  // 부분 결과 화면에는 이어쓰기만 있고 저장·출력 단추가 없다.
  const view = app.slice(app.indexOf('function partialWritingView()'), app.indexOf('function simpleResultActions()'));
  assert.match(view, /id="resume-writing"/);
  assert.ok(!/id="save-proposal-archive"|final-docx-top|final-pdf-top|run-final-confirm/.test(view));
});
