import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SAMPLE_APPLICANTS, SAMPLE_MARK, SAMPLE_NOTICE, SAMPLE_NOTICE_KEY, SAMPLE_STAGES, buildSampleProject, sampleProposalSnapshot } from '../src/sample-project.js';
import { UNRESOLVED_MARK } from '../src/blueprint-draft-check.js';
import { applyRepairPlans, buildRepairPlans } from '../src/repair-plan.js';

const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const sample = buildSampleProject();

test('샘플 자료는 모든 이름에 [샘플] 표시를 유지하고 실제 기관을 흉내 내지 않는다', () => {
  assert.equal(SAMPLE_MARK, '[샘플]');
  assert.ok(SAMPLE_NOTICE.title.startsWith(SAMPLE_MARK));
  assert.match(SAMPLE_NOTICE.sourceLabel, /\[샘플\].*가상/);
  assert.equal(SAMPLE_NOTICE.isSample, true);
  for (const applicant of SAMPLE_APPLICANTS) assert.ok(applicant.name.startsWith(SAMPLE_MARK), applicant.name);
  // 운영 D1에 저장하지 않는다: 샘플 키는 실제 공고 키(central:/gwangju:)와 겹치지 않는다.
  assert.match(SAMPLE_NOTICE_KEY, /^sample:/);
  assert.doesNotMatch(appSource, /syncArchivedNotices\(\[SAMPLE_NOTICE\]|saveArchivedProposal\(\{ *id: SAMPLE_PROPOSAL_ID/);
});

test('전체 흐름 14단계가 실제 엔진 결과로 모두 만들어진다', () => {
  assert.equal(SAMPLE_STAGES.length, 14);
  // 01 공고 → 02 분석
  assert.ok(sample.structure.fields.every(field => field.status));
  assert.ok(sample.structure.fields.filter(field => field.status === '공식 근거 확인').length >= 8);
  assert.ok(sample.structure.evaluationScores.length >= 5);
  assert.ok(sample.requirements.length >= 5);
  // 03 기관 → 04 적합성 (복수 기관)
  assert.equal(sample.applicants.length, 2);
  assert.ok(sample.fitResult.matches.length >= 8);
  assert.ok(sample.partnerFit.matches.length >= 8);
  assert.notEqual(sample.fitResult.applicantId, sample.partnerFit.applicantId);
  // 05 설계도: 신청유형 선택까지 끝나 초안 작성이 가능하다
  assert.deepEqual(sample.blueprint.applicationTypes.options.map(option => option.name), ['기초형', '심화형']);
  assert.equal(sample.blueprint.applicationTypes.selected, '심화형');
  assert.equal(sample.blueprint.canDraft, true);
  // 06 master → 07 V1
  assert.ok(sample.master.sectionPlan.length >= 4);
  assert.equal(sample.sectionsV1.length, 8);
  // 08 검증 → 09 수정계획 → 10 V2
  assert.equal(sample.coachingV1.issues.length, 3);
  assert.equal(sample.repairPlans.length, 3);
  assert.ok(sample.repairResult.applied.length >= 2);
  // 11 사용자 결정 → 12 최종본 → 13 재검증 → 14 제출
  assert.equal(sample.decisionResult.applied.length, 1);
  assert.ok(sample.versions.length === 3);
  assert.deepEqual(sample.versions.map(version => version.version), [1, 2, 3]);
  assert.equal(sample.coachingV2.verdict, '제출 검토 완료');
});

test('V1 → V2 → 최종본은 실제로 달라지고 이전 버전이 그대로 보존된다', () => {
  const v1 = JSON.stringify(sample.versions[0].sections);
  const v2 = JSON.stringify(sample.versions[1].sections);
  const v3 = JSON.stringify(sample.versions[2].sections);
  assert.notEqual(v1, v2);
  assert.notEqual(v2, v3);
  assert.equal(v1, JSON.stringify(sample.sectionsV1));
  // 사용자 확인 전에는 [확인 필요]가 남고, 확정 후에는 확정 값이 들어간다.
  assert.ok(sample.sectionsV2.some(section => section.content.includes(UNRESOLVED_MARK)));
  assert.ok(sample.sectionsFinal.some(section => section.content.includes('자부담')));
  assert.deepEqual(sample.comparison.remaining, ['6. 수행 인력 및 협력 체계']);
  assert.ok(sample.comparison.resolved.length >= 2);
});

test('설계도 대비 자동 점검은 과거 실적 인용을 수치 유입으로 잘못 잡지 않는다', () => {
  const leak = sample.draftReviewFinal.checks.find(check => check.name === '과거 사업 수치 유입');
  assert.equal(leak.state, 'PASS');
  assert.equal(sample.draftReviewV1.byState.FAIL, 0);
  assert.equal(sample.draftReviewFinal.byState.FAIL, 0);
});

test('모든 대상 문단이 보류되면 반영 건수로 세지 않는다', () => {
  // 수정안이 새 수치를 만들면 보류된다. 이때 반영으로 세면 같은 내용의 새 버전이 생긴다.
  const sections = [{ id: 's1', title: '7. 예산 계획', content: '강사비 3,600,000원을 편성한다.', status: '작성됨' }];
  const issue = { id: 'i1', title: '산출 근거 없음', location: '7. 예산 계획', evidence: '강사비 3,600,000원', problem: '단가와 횟수가 없다.', suggestion: '1회 150,000원 × 24회기로 나누어 적는다.', severity: '높음' };
  const projectValues = [{ key: 'budget', label: '예산', value: '총 18,000,000원(강사비 3,600,000원)' }];
  const plans = buildRepairPlans([issue], { sections, projectValues });
  assert.equal(plans[0].repairLevel, 'EVIDENCE_BASED');
  const run = applyRepairPlans(sections, plans);
  assert.equal(run.blocked.length, 1);
  assert.equal(run.applied.length, 0);
  assert.equal(run.sections[0].content, sections[0].content);
});

test('보관 스냅샷으로 저장했다 열면 master·parts·본문·버전·기관·공고가 그대로 복원된다', () => {
  const snapshot = sampleProposalSnapshot(sample);
  // app.js가 저장하는 필드 목록과 같은 키를 담는다.
  for (const key of ['project', 'stagedGeneration', 'sections', 'proposalVersions', 'selectedNotice', 'selectedApplicantId', 'projectValues', 'noticeLogic', 'draftReview', 'revisionPlan']) {
    assert.ok(key in snapshot, `스냅샷에 ${key}가 없다`);
  }
  // 저장 → 직렬화 → 복원(앱의 openArchivedProposal과 같은 전개 방식)
  const restored = { ...JSON.parse(JSON.stringify(snapshot)) };
  assert.equal(restored.stagedGeneration.phase, 'parts-ready');
  assert.deepEqual(restored.stagedGeneration.completedGroupIds, sample.master.sectionPlan.map(group => group.id));
  assert.equal(restored.stagedGeneration.master.projectDesign.projectName, sample.master.projectDesign.projectName);
  assert.equal(restored.sections.length, sample.sectionsFinal.length);
  assert.equal(restored.proposalVersions.length, 3);
  assert.equal(restored.selectedNotice.archiveNoticeKey, SAMPLE_NOTICE_KEY);
  assert.equal(restored.applicantSnapshot.id, sample.applicant.id);
  assert.equal(restored.selectedApplicantId, sample.applicant.id);
  // 새 계획서를 만드는 것이 아니라 기존 내용을 그대로 잇는다.
  assert.deepEqual(restored.sections.map(section => section.title), sample.sectionsFinal.map(section => section.title));
});

test('샘플은 별도 화면에서만 열리고 현재 작업 상태를 덮어쓰지 않는다', () => {
  assert.match(appSource, /const tools = \{ home: homeView, coaching: coachingView, applicants: applicantsToolView, sample: sampleView, engagement: engagementView \}/);
  assert.match(appSource, /function openSample\(stageId, from = state\.activeTool\)/);
  assert.match(appSource, /setState\(\{ activeTool: 'sample', sampleStage: stage/);
  // openSample은 sampleStage·sampleReturn·activeTool 외의 작업 데이터를 건드리지 않는다.
  const body = appSource.slice(appSource.indexOf('function openSample('), appSource.indexOf('function closeSample('));
  assert.doesNotMatch(body, /sections:|proposalVersions:|stagedGeneration:|selectedNotice:|applicants:/);
  // 각 화면에 예시 열기 버튼이 있다.
  for (const stage of ['notice', 'analysis', 'applicant', 'fit', 'blueprint', 'draftV1', 'coachingV1', 'final']) {
    assert.ok(appSource.includes(`sampleButton('${stage}'`) || appSource.includes(`data-open-sample="${stage}"`), `${stage} 샘플 진입점 없음`);
  }
  // 자료보관함에서는 우클릭 단계 이동이 샘플 결과로 연결된다.
  assert.match(appSource, /if \(key === SAMPLE_NOTICE_KEY\) return openSample\(SAMPLE_STAGE_BY_STEP\[step\]/);
  assert.match(appSource, /return \[SAMPLE_NOTICE, \.\.\.\(state\.archiveNotices \|\| \[\]\)\]/);
});
