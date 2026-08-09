import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appendProposalVersion, findProposalVersion, verifyLockedValues } from '../src/coaching-handoff.js';
import { REPAIR_LEVELS, SOURCE_OF_TRUTH } from '../src/repair-plan.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('조립이 끝나면 검증 전 완성본 상태로 보관한다', () => {
  assert.match(app, /const PROPOSAL_STATES = \['작성중', '완성본·검토전', '검토중', '수정중', '재검토', '최종본'\]/);
  assert.match(app, /function markProposalAssembled\(\)/);
  assert.match(app, /setProposalFlow\(\{ status: '완성본·검토전'/);
  assert.match(app, /markAiDone\('assemble'[\s\S]{0,400}markProposalAssembled\(\)/);
  assert.match(app, /archiveCurrentProposal\('complete'\)/);
  // 완성 화면의 다섯 갈래
  for (const label of ['전체 계획서 보기', 'DOCX 내려받기', 'PDF 내려받기', '수정 요청', '검토·제출로 보내기']) {
    assert.ok(app.includes(label), label);
  }
});

test('수정 요청은 지정한 범위만 다시 쓰고 확정값을 지킨다', () => {
  assert.match(app, /async function applyRevisionRequest\(\)/);
  assert.match(app, /for \(const index of scope\)/);
  assert.match(app, /확정된 수치·기간·인원·예산과 공고 근거 문장, 신청기관 확인정보는 그대로 둔다/);
  assert.match(app, /확인되지 않은 사실은 만들지 말고 \[확인 필요\]로 남긴다/);
  // 확정값이 사라지면 그 항목은 반영하지 않는다.
  assert.match(app, /const check = verifyLockedValues\(/);
  assert.match(app, /if \(check\.removed\.length\) \{[\s\S]{0,120}continue; \}/);
  // 새 버전으로만 쌓고 요청 내용을 남긴다.
  assert.match(app, /appendProposalVersion\(state\.proposalVersions, \{ sections: state\.sections, label: `사용자 수정 요청 반영`, source: '수정 요청', reason: instruction/);
});

test('버전 이력은 보기·비교·복원과 생성 이유를 함께 보여 준다', () => {
  assert.match(app, /function versionHistoryView\(\)/);
  assert.match(app, /data-view-version=/);
  assert.match(app, /data-compare-version=/);
  assert.match(app, /data-restore-version=/);
  assert.match(app, /item\.reason \? ` · 요청: \$\{escapeHtml\(item\.reason\)\}`/);
  assert.match(app, /function versionDiffView\(item\)/);
  // 실제 버전 누적은 기존 엔진을 그대로 쓴다.
  let versions = appendProposalVersion([], { sections: [{ id: 's1', title: '1', content: 'a' }], label: '완성본' });
  versions = appendProposalVersion(versions, { sections: [{ id: 's1', title: '1', content: 'b' }], label: '수정 요청 반영', reason: '예산 부분 수정' });
  assert.equal(versions.length, 2);
  assert.equal(findProposalVersion(versions, 1).sections[0].content, 'a');
  assert.equal(versions[1].version, 2);
});

test('검토 제출은 버전을 고정하고 회차를 기록한다', () => {
  assert.match(app, /function sendVersionToReview\(\)/);
  assert.match(app, /const round = \(flow\.rounds \|\| \[\]\)\.length \+ 1;/);
  assert.match(app, /setProposalFlow\(\{ status: round > 1 \? '재검토' : '검토중', reviewTarget: target/);
  assert.match(app, /검토 대상 고정 · V\$\{proposalFlow\(\)\.reviewTarget\.version\} → \$\{proposalFlow\(\)\.reviewTarget\.round\}차 검토 제출/);
  assert.match(app, /function recordReviewRound\(result\)/);
  assert.match(app, /rounds: \[\.\.\.\(flow\.rounds \|\| \[\]\), \{ round:/);
  assert.match(app, /function reviewHistoryView\(\)/);
});

test('문제별 선택지와 환각 방지 규칙을 그대로 유지한다', () => {
  for (const label of ['수정안 적용', 'AI에게 수정 요청', '직접 수정', '현재 유지', '확인정보 입력']) {
    assert.ok(app.includes(label), label);
  }
  assert.match(app, /\['미수정', '수정중', '해결', '확인필요', '유지'\]\.includes\(status\)/);
  // 기존 수정계획 등급과 근거 우선순위는 그대로 쓴다.
  assert.deepEqual(REPAIR_LEVELS, ['AUTO', 'EVIDENCE_BASED', 'USER_CONFIRMATION']);
  assert.equal(SOURCE_OF_TRUTH[0], '공식 공고·요강·평가기준');
  assert.equal(SOURCE_OF_TRUTH[4], '추론');
  // 확정값이 사라지는 수정은 막는다(엔진 동작 확인).
  const check = verifyLockedValues('참여 아동 20명', '참여 아동 30명', null);
  assert.ok(check.removed.length > 0);
});

test('계획서 보관함은 상태별로 보이고 저장 데이터를 새로 만들지 않는다', () => {
  assert.match(app, /function proposalArchiveStatus\(item\)/);
  assert.match(app, /if \(stage === 'final'\) return '최종본';/);
  assert.match(app, /function proposalArchiveView\(proposals\)/);
  assert.match(app, /계획서 보관함 \$\{proposals\.length\}건/);
  for (const label of ['공고', '신청기관', '현재 버전', '버전 이력', '검토 이력', '수정 이력', '최종본']) {
    assert.ok(app.includes(`['${label}'`) || app.includes(`>${label}<`) || app.includes(`'${label}',`), label);
  }
  // 새 저장 경로를 만들지 않는다(기존 saveProposal만 사용).
  assert.doesNotMatch(app, /action: 'saveProposalFlow'|saveArchivedFlow/);
});

test('최종본은 사용자가 승인할 때만 만들고 이전 버전을 지우지 않는다', () => {
  assert.match(app, /function approveFinalProposal\(\)/);
  assert.match(app, /window\.confirm\(`남은 확인 항목 \$\{remaining\}건이 있습니다/);
  assert.match(app, /setProposalFlow\(\{ status: '최종본', approvedVersion: version/);
  assert.match(app, /archiveCurrentProposal\('final'\)/);
  assert.match(app, /id="approve-final-proposal"/);
  assert.match(app, /final: '최종본'/);
  assert.doesNotMatch(app, /proposalVersions = \[\]/);
});
