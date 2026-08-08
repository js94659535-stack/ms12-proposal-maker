import test from 'node:test';
import assert from 'node:assert/strict';
import { compactEvidence, hasExplicitCriticalEvidence, normalizeUnsupportedCriticalIssues, validateCoachingResultDetailed } from '../functions/api/proposal-coaching.js';

// 실제 OpenAI 호출 없이 고정 결과 fixture만 사용한다.
const PROPOSAL_TEXT = `사업명: QA 청소년 학습회복 프로젝트
신청기관: QA 영리법인 새봄컴퍼니
신청자격: 공고문은 비영리법인만 신청할 수 있으나 신청기관은 영리법인이다.
사업내용: 주 1회 학습코칭 20회를 운영한다. 세부 설명이 부족하다.`;

function baseResult(issues) {
  const evidenceRefs = [{ sourceName: '계획서 원문', pageOrSection: '신청자격', proposalLocation: '신청자격', excerpt: '공고문은 비영리법인만 신청할 수 있으나 신청기관은 영리법인이다.', verified: true }];
  return {
    basis: 'common-criteria', overallStatus: '보완 필요', summary: 'QA 검증',
    checkedAreas: ['자격'], evaluationMatrix: [], issues,
    finalChecks: ['자격', '필수 신청항목', '사업기간', '대상·인원', '회기', '예산 합계·예산규정', '성과목표·지표', '기관·협력 역할', '공식 평가항목 누락']
      .map(area => ({ area, status: '충족', note: 'QA 점검', evidenceRefs })),
    comparison: { previousVersion: 0, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] }
  };
}

function issue(overrides) {
  return {
    category: '신청자격', priority: '주요 개선', riskType: 'eligibility', location: '신청기관 항목',
    reason: 'QA 사유', direction: 'QA 개선방향', example: 'QA 수정 예시', evidenceRefs: [], requiresConfirmation: false, ...overrides
  };
}

const PAYLOAD = { proposalText: PROPOSAL_TEXT, criteriaText: '' };

test('근거가 명확한 자격 위반은 주요 개선으로 와도 최우선 경고로 정규화한다', () => {
  const clearViolation = issue({
    evidenceRefs: [{ sourceName: '계획서 원문', pageOrSection: '신청자격', proposalLocation: '신청자격', excerpt: '공고문은 비영리법인만 신청할 수 있으나 신청기관은 영리법인이다.', verified: true }]
  });
  assert.equal(hasExplicitCriticalEvidence(clearViolation), true);

  const result = baseResult([clearViolation]);
  // 정규화 전에는 riskType·priority 불일치로 422가 된다.
  assert.equal(validateCoachingResultDetailed(structuredClone(result), false, 0, PAYLOAD).stage, 'application-validation');

  normalizeUnsupportedCriticalIssues(result);
  assert.equal(result.issues[0].priority, '최우선 경고');
  assert.equal(result.issues[0].riskType, 'eligibility');
  assert.equal(result.issues[0].example, 'QA 수정 예시');
  assert.equal(validateCoachingResultDetailed(result, false, 0, PAYLOAD).error, '');
});

test('근거가 부족한 자격 문제는 최우선 경고로 올리지 않고 확인 필요로 낮춘다', () => {
  const weak = issue({
    reason: '신청자격 설명이 더 필요합니다.',
    evidenceRefs: [{ sourceName: '계획서 원문', pageOrSection: '사업내용', proposalLocation: '사업내용', excerpt: '주 1회 학습코칭 20회를 운영한다.', verified: true }]
  });
  assert.equal(hasExplicitCriticalEvidence(weak), false);

  const result = baseResult([weak]);
  normalizeUnsupportedCriticalIssues(result);
  assert.equal(result.issues[0].priority, '주요 개선');
  assert.equal(result.issues[0].riskType, 'competition');
  assert.equal(result.issues[0].requiresConfirmation, true);
  assert.match(result.issues[0].example, /^\[확인 필요: 공식 근거 확인\]/);
  assert.equal(validateCoachingResultDetailed(result, false, 0, PAYLOAD).error, '');

  // 근거가 아예 없는 경우도 확인 필요로만 남는다.
  const noEvidence = baseResult([issue({ priority: '최우선 경고', riskType: 'required-item' })]);
  normalizeUnsupportedCriticalIssues(noEvidence);
  assert.equal(noEvidence.issues[0].priority, '주요 개선');
  assert.equal(noEvidence.issues[0].riskType, 'competition');
  assert.equal(validateCoachingResultDetailed(noEvidence, false, 0, PAYLOAD).error, '');
});

test('정규화는 등급 불일치만 고치고 schema 오류·근거 위조는 계속 차단한다', () => {
  const forged = baseResult([issue({
    priority: '최우선 경고', riskType: 'eligibility',
    evidenceRefs: [{ sourceName: '공고문', pageOrSection: '3쪽', proposalLocation: '자격', excerpt: '존재하지 않는 규정 99조에 따라 신청 불가', verified: true }]
  })]);
  normalizeUnsupportedCriticalIssues(forged);
  assert.equal(validateCoachingResultDetailed(forged, false, 0, PAYLOAD).stage, 'evidence-validation');

  const broken = baseResult([issue({ location: '' })]);
  normalizeUnsupportedCriticalIssues(broken);
  assert.equal(validateCoachingResultDetailed(broken, false, 0, PAYLOAD).stage, 'schema-validation');

  const missingChecks = baseResult([issue()]);
  missingChecks.finalChecks = missingChecks.finalChecks.slice(0, 3);
  normalizeUnsupportedCriticalIssues(missingChecks);
  assert.equal(validateCoachingResultDetailed(missingChecks, false, 0, PAYLOAD).stage, 'schema-validation');
});

test('PDF 추출로 공백이 깨진 원문도 근거 대조를 통과하고 위조는 계속 막는다', () => {
  // 실제 배분신청서 PDF에서 나온 형태: "기 관 명   수완아동센터"
  const payload = { proposalText: '1) 기 관 명   수완아동센터  사업 기간   2026   년 9   월   1 일 (총 4   개월)', criteriaText: '' };
  const evidenceRefs = [{ sourceName: '계획서 원문', pageOrSection: '1쪽', proposalLocation: '기관명', excerpt: '기관명 수완아동센터', verified: true }];
  const result = {
    basis: 'common-criteria', overallStatus: '확인 필요', summary: 'QA', checkedAreas: ['자격'], evaluationMatrix: [], issues: [],
    finalChecks: ['자격', '필수 신청항목', '사업기간', '대상·인원', '회기', '예산 합계·예산규정', '성과목표·지표', '기관·협력 역할', '공식 평가항목 누락']
      .map(area => ({ area, status: '충족', note: 'QA', evidenceRefs })),
    comparison: { previousVersion: 0, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] }
  };
  assert.equal(compactEvidence('기 관 명   수완아동센터'), '기관명수완아동센터');
  assert.equal(validateCoachingResultDetailed(result, false, 0, payload).error, '');

  const forged = structuredClone(result);
  forged.finalChecks[0].evidenceRefs = [{ ...evidenceRefs[0], excerpt: '존재하지 않는 규정 99조에 따라 신청 불가' }];
  assert.equal(validateCoachingResultDetailed(forged, false, 0, payload).stage, 'evidence-validation');
});
