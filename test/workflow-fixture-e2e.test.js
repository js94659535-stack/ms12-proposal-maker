import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMasterResult, validatePartResult } from '../functions/api/proposal.js';
import { validateReviewResult } from '../functions/api/proposal-review.js';
import { validateCoachingResult } from '../functions/api/proposal-coaching.js';
import { saveProposal, getProposal } from '../functions/api/archive.js';
import { buildPrintDocument, exportDocx } from '../src/export.js';

const sectionKeys = ['necessity', 'purpose', 'goals', 'target', 'programs', 'schedule', 'roles', 'budget', 'indicators', 'outcomes'];
const reviewLabels = ['공모 목적 적합성', '사업 필요성의 구체성과 설득력', '대상자 선정의 타당성', '프로그램과 실행 방법의 구체성', '신청기관과 협력기관 역할의 현실성', '예산의 적정성과 사업 내용의 일치', '성과목표와 성과지표의 측정 가능성', '계획서 전체의 논리적 일관성'];
const qaAnswers = Object.fromEntries(['기관 적격성', '대상·인원', '수행인력·협력기관', '회기·운영주기', '예산기준·성과도구'].map((key, index) => [key, `[QA fixture ${index + 1}] 사용자 확정값 대체 데이터`]));
const evidence = [{ id: 'e1', claim: 'QA 공식 근거', evidence: 'QA fixture 공식 원문', location: 'QA fixture 1항' }];

function masterFixture() {
  return {
    sponsorIntent: { coreProblem: 'QA 문제', policyPurpose: 'QA 목적', requiredTarget: 'QA 대상', expectedChange: 'QA 변화', selectionLogic: ['QA 기준'], mandatoryConditions: [], budgetRestrictions: [], evidence: ['QA fixture 공식 원문'] },
    projectDesign: { projectName: 'QA 전용 계획서', coreStrategy: 'QA 전략', target: 'QA 대상', participantCount: 'QA 10명', problem: 'QA 문제', purpose: 'QA 목적', quantitativeGoals: ['QA 목표'], qualitativeGoals: ['QA 변화'], changePath: ['QA 경로'], programs: ['QA 프로그램'], schedule: ['QA 일정'], applicantRoles: ['QA 신청기관 역할'], partnerRoles: ['QA 협력기관 역할'], budgetStructure: ['QA 예산'], performanceIndicators: ['QA 지표'], risks: ['QA 위험'], projectPeriod: '2099-01-01 ~ 2099-12-31', supportLimit: 'QA 10,000,000원' },
    masterLogic: { problem: 'QA 문제', causes: ['QA 원인'], targetRationale: 'QA 대상 근거', coreStrategy: 'QA 전략', differentiation: 'QA 차별성', implementationPrinciples: ['QA 실행'], baselineValues: [], outputOutcomeMeasurementLinks: [{}], evaluationResponsePlan: [{}], claimEvidencePlan: [{}] },
    sectionPlan: sectionKeys.map((key, index) => ({ id: `g${index + 1}`, title: `QA 목차 ${index + 1}`, sectionKeys: [key] })),
    missingInformation: Object.keys(qaAnswers), evidenceMap: evidence,
    qualityCheck: { noticeAlignment: true, singleSubprogramOnly: true, logicConsistency: true }
  };
}

function generatedSections() {
  return sectionKeys.map((id, index) => ({ id, title: `${index + 1}. QA 항목`, content: `QA fixture 본문 ${index + 1}. 실제 기관·사업 사실이 아닙니다.`, status: '검토 필요', citations: ['e1'] }));
}

function reviewFixture() {
  const structureCheck = { status: '충족', findings: [], affectedSectionKeys: [], evidenceRefs: ['QA fixture'] };
  const criteria = reviewLabels.map((label, index) => ({ key: `c${index + 1}`, label, score: 80, judgment: 'QA fixture 판단', strengths: [], issues: [], improvementDirection: '', evidenceRefs: ['QA fixture'] }));
  return { overallScore: 80, overallJudgment: 'QA 검토 완료', criticalIssues: [], structureReview: { noticeAndEvaluationFit: structureCheck, needDifferentiationFeasibility: structureCheck, baselineConsistency: structureCheck, applicationQuestionCoverage: structureCheck, crossSectionLogicAndDuplication: structureCheck, unsupportedClaims: structureCheck, affectedSectionKeys: [] }, criteria, consistencyReport: { participantCount: '일치', schedule: '일치', sessions: '일치', budget: '일치', roles: '일치', outputsAndOutcomes: '일치', eligibility: '일치' }, revisedSections: [], missingQuestions: [] };
}

function coachingFixture() {
  const evidenceRefs = [{ sourceName: 'QA fixture', pageOrSection: 'QA 항목', proposalLocation: 'QA 항목', excerpt: 'QA fixture 본문', verified: true }];
  return {
    overallStatus: '제출 검토 완료', summary: 'QA 코칭 완료', basis: 'common-criteria',
    checkedAreas: ['공모 목적·평가기준', '논리구조', '수치 일관성'],
    evaluationMatrix: [{ criterion: 'QA 기준', officialPoints: '', requirement: 'QA 요구', proposalLocations: ['QA 항목'], status: '충족', evidenceRefs }],
    issues: [],
    finalChecks: ['자격', '필수 신청항목', '사업기간', '대상·인원', '회기', '예산 합계·예산규정', '성과목표·지표', '기관·협력 역할', '공식 평가항목 누락'].map(area => ({ area, status: '충족', note: 'QA fixture 확인', evidenceRefs })),
    comparison: { previousVersion: 0, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] }
  };
}

function archiveDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        values: [], bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes('SELECT created_at')) return rows.get(`${this.values[1]}:${this.values[0]}`) || null;
          if (sql.includes('SELECT id, notice_key')) return rows.get(`${this.values[1]}:${this.values[0]}`) || null;
          return null;
        },
        async run() {
          const [id, ownerHash, noticeKey, title, stage, proposalJson, createdAt, updatedAt] = this.values;
          rows.set(`${ownerHash}:${id}`, { id, owner_hash: ownerHash, notice_key: noticeKey, title, stage, proposal_json: proposalJson, created_at: createdAt, updated_at: updatedAt });
          return { success: true };
        }
      };
    }
  };
}

test('QA fixture로 확인정보 이후 분할·완성·검토·코칭·저장·복원·출력을 연결한다', async () => {
  const master = masterFixture();
  assert.equal(Object.keys(qaAnswers).length, 5);
  assert.ok(Object.values(qaAnswers).every(value => value.startsWith('[QA fixture')));
  assert.equal(validateMasterResult(master), '');

  const sections = generatedSections();
  const continuityCheck = { masterAligned: true, applicationStructureAligned: true, terminologyConsistent: true, numericConsistent: true, noUnnecessaryRepetition: true, issues: [] };
  const continuitySummary = { fixedTerms: [], fixedValues: [], establishedDecisions: [], nextHandoff: [] };
  master.sectionPlan.forEach((group, index) => assert.equal(validatePartResult({ sections: [sections[index]], continuityCheck, continuitySummary }, group), ''));
  assert.equal(new Set(sections.map(section => section.id)).size, 10);
  assert.ok(sections.every(section => section.content.trim() && section.citations.length === 1));

  const review = reviewFixture();
  assert.equal(validateReviewResult(review), '');
  const coaching = coachingFixture();
  const coachingPayload = { proposalText: sections.map(section => section.content).join('\n'), criteriaText: '', officialEvaluationProvided: false };
  assert.equal(validateCoachingResult(coaching, false, 0, coachingPayload), '');

  const snapshot = { project: { title: 'QA 전용 계획서' }, designAnswers: qaAnswers, stagedGeneration: { phase: 'complete', master, parts: master.sectionPlan.map((group, index) => ({ groupId: group.id, sections: [sections[index]] })), completedGroupIds: master.sectionPlan.map(group => group.id) }, sections, reviewResult: review, coaching: { result: coaching, version: 1 } };
  const db = archiveDb();
  const saved = await saveProposal(db, 'qa-owner', { id: 'qa-fixture-proposal', noticeKey: 'qa:fixture', title: 'QA 전용 계획서', stage: 'review', snapshot });
  const restored = await getProposal(db, 'qa-owner', saved.id);
  assert.deepEqual(restored.snapshot, snapshot);
  assert.equal(restored.snapshot.stagedGeneration.phase, 'complete');
  assert.equal(restored.snapshot.sections.length, 10);

  const pdfHtml = buildPrintDocument(snapshot.project, sections);
  assert.equal((pdfHtml.match(/<section>/g) || []).length, 10);
  assert.match(pdfHtml, /lang="ko"/);
  assert.match(pdfHtml, /QA fixture 본문 10/);

  const downloads = [];
  const originalDocument = globalThis.document;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  globalThis.document = { createElement: () => ({ click() { downloads.push(this.download); } }) };
  URL.createObjectURL = () => 'blob:qa-fixture';
  URL.revokeObjectURL = () => {};
  try { await exportDocx(snapshot.project, sections); }
  finally { globalThis.document = originalDocument; URL.createObjectURL = originalCreateObjectURL; URL.revokeObjectURL = originalRevokeObjectURL; }
  assert.deepEqual(downloads, ['QA 전용 계획서_검토용.docx']);
});
