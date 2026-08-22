// 계획서 검증보관함. 검증·코칭을 마친 완성본만 담기고, 계획서보관함의 원본은 그대로 남는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { coachingVerdict } from '../src/coaching-handoff.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('검증을 마친 완성본만 담는 단계 표시가 따로 있다', () => {
  assert.match(app, /const VERIFIED_STAGE = version => `verified-v\$\{Number\(version\) \|\| 1\}`/);
  assert.match(app, /const isVerifiedStage = stage => String\(stage \|\| ''\)\.startsWith\('verified-v'\)/);
  // 보관함 목록에 사람이 읽을 이름으로 나온다.
  assert.match(app, /검증 완료 완성본/);
  // 상태 표시와 색도 함께 정해 둔다.
  assert.match(app, /if \(isVerifiedStage\(stage\)\) return '검증 완료';/);
  assert.match(app, /if \(status === '최종본' \|\| status === '검증 완료'\) return '충족';/);
});

test('통과한 판만 담고, 담을 본문이 없으면 담지 않는다', () => {
  const fn = app.slice(app.indexOf('async function depositVerifiedProposal('), app.indexOf('async function completeProposalCoaching('));
  assert.match(fn, /if \(verdict\?\.verdict !== '제출 검토 완료'\) return '';/);
  assert.match(fn, /if \(!state\.sections\.length\) return '';/);
  assert.match(fn, /await archiveCurrentProposal\(VERIFIED_STAGE\(version\)\)/);
  // 담아도 계획서보관함의 원본을 지우거나 옮기지 않는다.
  assert.doesNotMatch(fn, /delete|remove|삭제/);
  // 검증이 끝나는 자리에서 부른다.
  assert.match(app, /const verified = await depositVerifiedProposal\(version, coachingVerdict\(result, state\.coaching\.workItems \|\| \[\]\)\)/);
});

test('판정 세 가지 중 「제출 검토 완료」만 담는 기준이다', () => {
  const clean = coachingVerdict({ issues: [], finalChecks: [] });
  assert.equal(clean.verdict, '제출 검토 완료');
  const remaining = coachingVerdict({ issues: [{ location: '7. 예산', priority: '주요 개선' }], finalChecks: [] });
  assert.equal(remaining.verdict, '수정 후 재검토');
});

test('검증보관함은 별도 메뉴와 화면으로 열린다', () => {
  assert.ok(app.includes("['open-verified-box', BOX.verified, 'verified']"), '작업 메뉴에 항목이 없다');
  assert.match(app, /verified: verifiedArchiveView/);
  assert.match(app, /function verifiedArchiveView\(\)/);
  assert.match(app, /function verifiedProposals\(\)\s*\{\s*\n\s*return \(state\.archiveProposals \|\| \[\]\)\.filter\(item => isVerifiedStage\(item\.stage\)\)/);
  assert.match(app, /querySelector\(id\)\?\.addEventListener\('click', \(\) => \{\s*\n\s*setState\(\{ activeTool: 'verified'/);
  // 비어 있을 때 다음 걸음을 알려 준다.
  assert.match(app, /아직 담긴 완성본이 없습니다/);
  assert.match(app, /id="open-coaching-from-verified"/);
});

test('목록은 한 줄 목차로 두고 눌러서 펼친다', () => {
  const view = app.slice(app.indexOf('function verifiedArchiveView()'), app.indexOf('// 계획서 하나를 열면'));
  assert.match(view, /class="archive-index"/);
  assert.match(view, /data-proposal-detail=/);
  assert.match(view, /data-open-archived-proposal=/);
  // 기존 상세 보기를 다시 쓴다. 새 상세 화면을 따로 만들지 않는다.
  assert.match(view, /proposalArchiveDetail\(item\)/);
});
