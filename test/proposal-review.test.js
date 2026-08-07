import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest, validateReviewResult } from '../functions/api/proposal-review.js';

const labels = ['공모 목적 적합성', '사업 필요성의 구체성과 설득력', '대상자 선정의 타당성', '프로그램과 실행 방법의 구체성', '신청기관과 협력기관 역할의 현실성', '예산의 적정성과 사업 내용의 일치', '성과목표와 성과지표의 측정 가능성', '계획서 전체의 논리적 일관성'];

function fixture() {
  return {
    overallScore: 78, overallJudgment: '근거 보완이 필요합니다.', criticalIssues: [],
    structureReview: {
      noticeAndEvaluationFit: { status: '충족', findings: [], affectedSectionKeys: [], evidenceRefs: ['공고문'] },
      needDifferentiationFeasibility: { status: '보완 필요', findings: ['필요성 근거 부족'], affectedSectionKeys: ['s1'], evidenceRefs: ['공고문'] },
      baselineConsistency: { status: '충족', findings: [], affectedSectionKeys: [], evidenceRefs: ['마스터 설계'] },
      applicationQuestionCoverage: { status: '충족', findings: [], affectedSectionKeys: [], evidenceRefs: ['신청서'] },
      crossSectionLogicAndDuplication: { status: '충족', findings: [], affectedSectionKeys: [], evidenceRefs: [] },
      unsupportedClaims: { status: '확인 필요', findings: ['대상 인원 확인 필요'], affectedSectionKeys: ['s1'], evidenceRefs: [] },
      affectedSectionKeys: ['s1']
    },
    criteria: labels.map((label, index) => ({ key: `c${index + 1}`, label, score: index ? 85 : 70, judgment: '공식 근거 기준 판단', strengths: [], issues: index ? [] : ['근거 부족'], improvementDirection: index ? '' : '[확인 필요: 대상 인원]', evidenceRefs: ['공고문'] })),
    consistencyReport: { participantCount: '확인 필요', schedule: '일치', sessions: '일치', budget: '확인 필요', roles: '일치', outputsAndOutcomes: '일치', eligibility: '확인 필요' },
    revisedSections: [{ sectionKey: 's1', title: '사업 필요성', reason: '80점 미만', afterText: '[확인 필요: 대상 인원] 공식 근거를 보완해야 합니다.', evidenceRefs: ['공고문'], requiresConfirmation: true }],
    missingQuestions: [{ question: '확정된 대상 인원은 몇 명입니까?', reason: '근거 부족', affectedSections: ['s1'] }]
  };
}

test('심사 API는 POST만 허용하고 환경변수 부재 시 외부 호출 전에 중단한다', async () => {
  const get = await onRequest({ request: new Request('https://example.test/api/proposal-review'), env: {} });
  assert.equal(get.status, 405);
  const post = await onRequest({ request: new Request('https://example.test/api/proposal-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env: {} });
  assert.equal(post.status, 503);
});

test('심사 결과는 지정된 8개 기준과 최대 5개 질문을 검증한다', () => {
  assert.equal(validateReviewResult(fixture()), '');
  assert.match(validateReviewResult({ ...fixture(), criteria: fixture().criteria.slice(0, 7) }), /8개 심사 기준/);
  assert.match(validateReviewResult({ ...fixture(), missingQuestions: Array(6).fill(fixture().missingQuestions[0]) }), /필수 필드/);
  assert.match(validateReviewResult({ ...fixture(), revisedSections: [{ ...fixture().revisedSections[0], sectionKey: 's2' }] }), /선별되지 않은/);
  assert.match(validateReviewResult({ ...fixture(), structureReview: null }), /전체 구조 검토/);
  assert.match(validateReviewResult({ ...fixture(), revisedSections: [{ ...fixture().revisedSections[0], evidenceRefs: [], requiresConfirmation: false, afterText: '근거 없이 확정한 사실' }] }), /확인 필요 상태/);
});

test('심사 버튼 요청은 mock OpenAI를 한 번만 호출하고 구조화 결과를 반환한다', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ output_text: JSON.stringify(fixture()) }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const sections = Array.from({ length: 10 }, (_, index) => ({ id: `s${index + 1}`, title: `항목 ${index + 1}`, content: `사용자가 수정한 최신 본문 ${index + 1}` }));
    const response = await onRequest({
      env: { OPENAI_API_KEY: 'mock-only', OPENAI_MODEL: 'mock-model' },
      request: new Request('https://example.test/api/proposal-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections, officialDetailText: '공식 공고 원문' }) })
    });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.openai\.com\/v1\/responses/);
    assert.match(calls[0].options.body, /사용자가 수정한 최신 본문 10/);
    assert.equal((await response.json()).criteria.length, 8);
  } finally { globalThis.fetch = originalFetch; }
});

test('심사는 사용자 클릭 한 번에 전용 POST를 호출하고 자동 적용하지 않는다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /state\.sections\.length !== 10/);
  assert.match(source, /fetch\('\/api\/proposal-review', \{ method: 'POST'/);
  assert.equal((source.match(/fetch\('\/api\/proposal-review'/g) || []).length, 1);
  assert.match(source, /if \(state\.reviewBusy/);
  assert.match(source, /reviewOriginalDraft = structuredClone\(state\.sections\)/);
  assert.doesNotMatch(source, /state\.sections\s*=\s*result\.revisedSections/);
});

test('최신 10개 본문과 마스터·완성 검증·근거 자료가 심사 요청에 포함된다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const field of ['selectedNotice', 'selectedSubprogram', 'officialDetailText', 'manualSources', 'applicationQuestions', 'evaluationCriteria', 'budgetCriteria', 'sponsorIntent', 'projectDesign', 'masterDesign', 'assemblyCheck', 'evidenceMap', 'confirmedOrganizationFacts', 'sections']) assert.match(source, new RegExp(`${field}:`));
});

test('전체 구조 검토 후 선별된 문제 항목만 수정안을 만들도록 제한한다', () => {
  const apiSource = fs.readFileSync(new URL('../functions/api/proposal-review.js', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(apiSource, /먼저 structureReview에서 계획서 전체/);
  assert.match(apiSource, /전체 계획서를 한 번에 재작성하지 않는다/);
  assert.match(apiSource, /affected\.has\(value\.sectionKey\)/);
  assert.match(appSource, /전체 구조를 먼저 검토하고 문제가 있는 항목만 보완/);
  assert.match(appSource, /result\.structureReview\.affectedSectionKeys\.includes/);
});

test('항목별·전체 보완은 revisedSections만 적용하고 원본 복원을 제공한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /function applyReviewSection/);
  assert.match(source, /function applyAllReviewSections/);
  assert.match(source, /function restoreReviewDraft/);
  assert.match(source, /sections: structuredClone\(state\.reviewOriginalDraft\)/);
  assert.match(source, /보완안은 자동 적용되지 않습니다/);
});

test('초안이 없으면 심사 버튼과 결과 화면을 표시하지 않는다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const emptyGuard = source.indexOf('if (!state.sections.length) return');
  const reviewButton = source.indexOf('id="proposal-review"');
  assert.ok(emptyGuard >= 0 && reviewButton > emptyGuard);
});
