import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeUnsupportedCriticalIssues, onRequest, validateCoachingResult, validateCoachingResultDetailed, validateIssueRevision } from '../functions/api/proposal-coaching.js';
import { COACHING_QA_CASES, COACHING_QA_CRITERIA } from './fixtures/coaching-qa.js';

function fixture() {
  const verifiedEvidence = [{ sourceName: '계획서 원문', pageOrSection: '사업 필요성', proposalLocation: '사업 필요성', excerpt: '필요성과 실행계획을 평가', verified: true }];
  const finalChecks = ['자격', '필수 신청항목', '사업기간', '대상·인원', '회기', '예산 합계·예산규정', '성과목표·지표', '기관·협력 역할', '공식 평가항목 누락'].map(area => ({ area, status: '확인필요', note: `${area} 근거 확인 필요`, evidenceRefs: [] }));
  return {
    basis: 'official-evaluation', overallStatus: '보완 필요', summary: '평가기준 대응 근거를 보완해야 합니다.',
    checkedAreas: ['공모 목적·평가기준', '논리구조', '수치 일관성'],
    evaluationMatrix: [{ criterion: '사업 타당성', officialPoints: '20점', requirement: '필요성과 실행계획을 평가', proposalLocations: ['사업 필요성', '세부 프로그램'], status: '부분충족', evidenceRefs: verifiedEvidence }],
    issues: [{ category: '평가기준 대응', priority: '주요 개선', riskType: 'competition', location: '사업 필요성 2문단', reason: '공식 평가항목의 근거가 없습니다.', direction: '공고문 근거를 연결합니다.', example: '[확인 필요: 공식 통계]를 확인한 뒤 근거 문장을 추가합니다.', evidenceRefs: [], requiresConfirmation: true }],
    finalChecks,
    comparison: { previousVersion: 0, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] }
  };
}

test('검증·코칭 API는 POST와 JSON만 허용하고 키가 없으면 외부 호출 전에 중단한다', async () => {
  const get = await onRequest({ request: new Request('https://example.test/api/proposal-coaching'), env: {} });
  assert.equal(get.status, 405);
  const post = await onRequest({ request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env: {} });
  assert.equal(post.status, 503);
});

test('라이브 프로브는 작은 strict JSON schema로 OpenAI를 정확히 한 번 호출한다', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ output_text: JSON.stringify({ ok: true, message: 'probe-ok' }) }), { status: 200, headers: { 'x-request-id': 'req_probe_test', 'Content-Type': 'application/json' } }); };
  try {
    const response = await onRequest({ env: { OPENAI_API_KEY: 'secret-test-only', OPENAI_MODEL: 'gpt-5.6-sol', OPENAI_PROBE_TOKEN: 'probe-test-token' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenAI-Probe-Token': 'probe-test-token' }, body: JSON.stringify({ action: 'probe' }) }) });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(body.strictJsonSchema, true);
    assert.equal(body.diagnostic.configuredModel, 'gpt-5.6-sol');
    assert.equal(body.diagnostic.upstreamStatus, 200);
    assert.equal(body.diagnostic.upstreamRequestId, 'req_probe_test');
    const requestBody = JSON.parse(calls[0].options.body);
    assert.equal(requestBody.max_output_tokens, 200);
    assert.equal(requestBody.text.format.strict, true);
  } finally { globalThis.fetch = originalFetch; }
});

test('OpenAI 비429 오류는 실제 상태와 안전한 진단 정보를 보존하고 비밀정보를 노출하지 않는다', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'model_not_found', message: 'model unavailable' } }), { status: 400, headers: { 'x-request-id': 'req_error_test', 'Content-Type': 'application/json' } });
  try {
    const response = await onRequest({ env: { OPENAI_API_KEY: 'must-not-leak', OPENAI_MODEL: 'gpt-5.6-sol', OPENAI_PROBE_TOKEN: 'probe-test-token' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenAI-Probe-Token': 'probe-test-token' }, body: JSON.stringify({ action: 'probe', proposalText: 'must-not-appear' }) }) });
    const text = await response.text();
    const body = JSON.parse(text);
    assert.equal(response.status, 400);
    assert.equal(body.diagnostic.upstreamStatus, 400);
    assert.equal(body.diagnostic.upstreamErrorType, 'invalid_request_error');
    assert.equal(body.diagnostic.upstreamErrorCode, 'model_not_found');
    assert.equal(body.diagnostic.upstreamRequestId, 'req_error_test');
    assert.doesNotMatch(text, /must-not-leak|must-not-appear/);
  } finally { globalThis.fetch = originalFetch; }
});

test('코칭 결과는 문제 위치·이유·방향·예시와 근거 안전장치를 검증한다', () => {
  const payload = { proposalText: '사업 필요성에서 필요성과 실행계획을 평가하는 계획서 원문', criteriaText: '' };
  assert.equal(validateCoachingResult(fixture(), false, 0, payload), '');
  assert.match(validateCoachingResult({ ...fixture(), basis: 'common-criteria' }, true, 0, payload), /공식 평가표/);
  assert.match(validateCoachingResult({ ...fixture(), issues: [{ ...fixture().issues[0], location: '' }] }, false, 0, payload), /문제별 코칭 필드/);
  assert.match(validateCoachingResult({ ...fixture(), issues: [{ ...fixture().issues[0], example: '근거 없이 확정', requiresConfirmation: false }] }, false, 0, payload), /확인 필요/);
  assert.match(validateCoachingResult({ ...fixture(), issues: [{ ...fixture().issues[0], priority: '일반 개선' }] }, false, 0, payload), /주요 개선/);
  assert.match(validateCoachingResult({ ...fixture(), issues: [{ ...fixture().issues[0], riskType: 'budget-rule', priority: '주요 개선' }] }, false, 0, payload), /최우선 경고/);
  assert.match(validateCoachingResult({ ...fixture(), evaluationMatrix: [] }, true, 0, payload), /대응표/);
  assert.match(validateCoachingResult({ ...fixture(), comparison: { ...fixture().comparison, previousVersion: 1 } }, false, 0, payload), /이전 버전 비교/);
  assert.equal(validateCoachingResult({ ...fixture(), comparison: { ...fixture().comparison, previousVersion: 1 } }, true, 1, payload), '');
  const descriptiveMetadata = structuredClone(fixture());
  descriptiveMetadata.evaluationMatrix[0].evidenceRefs[0] = { ...descriptiveMetadata.evaluationMatrix[0].evidenceRefs[0], sourceName: '사용자 설명 자료명', pageOrSection: 'AI가 정리한 항목명', proposalLocation: '요약 위치' };
  assert.equal(validateCoachingResult(descriptiveMetadata, false, 0, payload), '');
  const invented = structuredClone(fixture()); invented.evaluationMatrix[0].evidenceRefs[0].excerpt = '존재하지 않는 규정 99페이지';
  assert.match(validateCoachingResult(invented, false, 0, payload), /확인되지 않는 근거/);
  assert.equal(validateCoachingResultDetailed(invented, false, 0, payload).stage, 'evidence-validation');
  assert.equal(validateCoachingResultDetailed({ ...fixture(), finalChecks: null }, false, 0, payload).stage, 'schema-validation');
  assert.equal(validateCoachingResultDetailed({ ...fixture(), basis: 'common-criteria' }, true, 0, payload).stage, 'application-validation');
});

test('정상 계획서의 근거 부족을 제출 불가·충돌·예산 위반으로 과잉진단하지 않는다', () => {
  const normal = fixture();
  normal.issues = [
    { ...normal.issues[0], priority: '최우선 경고', riskType: 'core-conflict', reason: '세부 설명이 부족합니다.', evidenceRefs: [{ sourceName: '계획서 원문', pageOrSection: '사업내용', proposalLocation: '사업내용', excerpt: '주 1회 학습코칭 20회와 보호자 교육 2회를 운영한다.', verified: true }], requiresConfirmation: false, example: '설명을 보완합니다.' },
    { ...normal.issues[0], priority: '최우선 경고', riskType: 'budget-rule', reason: '공식 예산규정 원문이 없습니다.', evidenceRefs: [{ sourceName: '계획서 원문', pageOrSection: '예산', proposalLocation: '예산', excerpt: '총사업비 30,000,000원이며 강사비 18,000,000원, 교재비 6,000,000원, 체험비 6,000,000원이다.', verified: true }], requiresConfirmation: false, example: '규정을 확인합니다.' },
  ];
  normalizeUnsupportedCriticalIssues(normal);
  assert.equal(normal.issues.filter(issue => issue.priority === '최우선 경고').length, 0);
  assert.ok(normal.issues.every(issue => issue.priority === '주요 개선' && issue.riskType === 'competition' && issue.requiresConfirmation));
});

test('전체 코칭은 OpenAI background 생성 한 번과 짧은 polling·완료 검증으로 반환한다', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  let generationCalls = 0;
  let retrievalCalls = 0;
  const cacheValues = new Map();
  globalThis.caches = { default: { match: async request => cacheValues.get(request.url), put: async (request, response) => cacheValues.set(request.url, response) } };
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') { generationCalls += 1; return new Response(JSON.stringify({ id: 'resp_background_test', status: 'queued' }), { status: 200, headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_start' } }); }
    retrievalCalls += 1;
    return new Response(JSON.stringify({ id: 'resp_background_test', status: 'completed', output_text: JSON.stringify(fixture()) }), { status: 200, headers: { 'Content-Type': 'application/json', 'x-request-id': `req_poll_${retrievalCalls}` } });
  };
  try {
    const headers = { 'Content-Type': 'application/json', 'X-Archive-Key': '12345678-1234-1234-1234-123456789abc' };
    const payload = { proposalText: '사업 필요성에서 검증할 사업계획서 본문입니다. 대상과 프로그램과 성과를 충분히 기술한 원문입니다.', criteriaText: '공식 평가표는 필요성과 실행계획을 평가합니다.', officialEvaluationProvided: true };
    const start = await onRequest({ env: { OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'mock-model' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers, body: JSON.stringify({ action: 'startCoaching', ...payload }) }) });
    assert.equal(start.status, 200);
    assert.equal((await start.json()).jobId, 'resp_background_test');
    const completedStartedAt = performance.now();
    const poll = await onRequest({ env: { OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'mock-model' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers, body: JSON.stringify({ action: 'pollCoaching', jobId: 'resp_background_test' }) }) });
    const pollResult = await poll.json();
    assert.equal(pollResult.status, 'completed');
    assert.equal(poll.status, 200);
    assert.equal(pollResult.basis, 'official-evaluation');
    assert.ok(performance.now() - completedStartedAt < 500);
    assert.equal(generationCalls, 1);
    assert.equal(retrievalCalls, 1);
  } finally { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; }
});

test('completed 검증 실패는 gateway 502가 아닌 안전한 422 진단으로 반환한다', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cacheValues = new Map();
  globalThis.caches = { default: { match: async request => cacheValues.get(request.url), put: async (request, response) => cacheValues.set(request.url, response) } };
  globalThis.fetch = async (url, options) => options.method === 'POST'
    ? new Response(JSON.stringify({ id: 'resp_invalid_test', status: 'queued' }), { headers: { 'Content-Type': 'application/json' } })
    : new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify({ basis: 'invalid' }) }), { headers: { 'Content-Type': 'application/json' } });
  try {
    const headers = { 'Content-Type': 'application/json', 'X-Archive-Key': '12345678-1234-1234-1234-123456789abc' };
    const payload = { action: 'startCoaching', proposalText: '검증 실패 상태 코드를 확인하기 위한 충분한 길이의 계획서 원문입니다.', criteriaText: '' };
    await onRequest({ env: { OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'mock-model' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers, body: JSON.stringify(payload) }) });
    const response = await onRequest({ env: { OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'mock-model' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers, body: JSON.stringify({ action: 'pollCoaching', jobId: 'resp_invalid_test' }) }) });
    const result = await response.json();
    assert.equal(response.status, 422);
    assert.equal(result.failureStage, 'schema-validation');
  } finally { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; }
});

test('문제별 AI 수정은 선택한 원문 구간만 한 번 호출하고 확정 수치를 보존한다', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const proposalText = '사업 필요성\n참여자 20명을 대상으로 10회 프로그램을 운영한다. 공식 근거를 반영한다.';
  const revision = { sectionLocation: '사업 필요성', originalExcerpt: '참여자 20명을 대상으로 10회 프로그램을 운영한다.', revisedText: '공식 평가기준에 따라 참여자 20명을 대상으로 10회 프로그램을 운영한다.', explanation: '평가기준과 실행 문장을 연결했습니다.', evidenceRefs: ['공식 평가기준'], requiresConfirmation: false };
  const calls = [];
  const rateValues = new Map();
  globalThis.caches = { default: { match: async request => rateValues.get(request.url), put: async (request, response) => rateValues.set(request.url, response) } };
  globalThis.fetch = async (url, options) => { calls.push(JSON.parse(options.body)); return new Response(JSON.stringify({ output_text: JSON.stringify(revision) }), { headers: { 'Content-Type': 'application/json' } }); };
  try {
    const response = await onRequest({ env: { OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'mock-model' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': '12345678-1234-1234-1234-123456789abc' }, body: JSON.stringify({ action: 'reviseIssue', proposalText, criteriaText: '공식 평가기준', issue: fixture().issues[0] }) }) });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].max_output_tokens, 2500);
    assert.equal(calls[0].text.format.name, 'proposal_issue_revision');
    assert.equal((await response.json()).revisedText, revision.revisedText);
  } finally { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; }
});

test('문제별 AI 수정은 자료보관함 키와 서버 호출 간격 제한을 적용한다', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const rateValues = new Map();
  let calls = 0;
  globalThis.caches = { default: { match: async request => rateValues.get(request.url), put: async (request, response) => rateValues.set(request.url, response) } };
  globalThis.fetch = async () => { calls += 1; return new Response('{}'); };
  const payload = JSON.stringify({ action: 'reviseIssue', proposalText: '검증할 계획서 원문이 충분히 긴 테스트 문장입니다. 대상과 기간과 실행방법을 함께 확인합니다.', issue: fixture().issues[0] });
  try {
    const missingKey = await onRequest({ env: { OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'mock-model' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }) });
    assert.equal(missingKey.status, 401);
    const headers = { 'Content-Type': 'application/json', 'X-Archive-Key': '12345678-1234-1234-1234-123456789abc' };
    const first = await onRequest({ env: { OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'mock-model' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers, body: payload }) });
    assert.equal(first.status, 502);
    const second = await onRequest({ env: { OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'mock-model' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers, body: payload }) });
    assert.equal(second.status, 429);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; }
});

test('문제별 수정안은 원문 단일 위치와 수치·근거 안전장치를 검증한다', () => {
  const text = '참여자 20명을 대상으로 10회 프로그램을 운영한다.';
  const valid = { sectionLocation: '사업 필요성', originalExcerpt: text, revisedText: '참여자 20명을 대상으로 10회 프로그램을 충실히 운영한다.', explanation: '실행 표현을 구체화합니다.', evidenceRefs: ['계획서 원문'], requiresConfirmation: false };
  assert.equal(validateIssueRevision(valid, text), '');
  assert.match(validateIssueRevision({ ...valid, revisedText: '참여자 30명을 대상으로 12회 운영한다.' }, text), /수치/);
  assert.match(validateIssueRevision({ ...valid, originalExcerpt: '없는 원문' }, text), /하나로 특정/);
  assert.match(validateIssueRevision({ ...valid, evidenceRefs: [], requiresConfirmation: false }, text), /확인 필요/);
});

test('상단 독립 코칭 화면은 외부 파일·붙여넣기·보관함·재검증·버전 저장을 지원한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /id="open-coaching"/);
  assert.match(source, /계획서 검증·코칭/);
  assert.match(source, /accept="\.pdf,\.docx,\.txt"/);
  assert.match(source, /id="coaching-text"/);
  assert.match(source, /data-coach-archive/);
  assert.match(source, /수정본 다시 검증/);
  assert.match(source, /stage: `coaching-v\$\{version\}`/);
  assert.match(source, /parentProposalId/);
  assert.match(source, /coachingSeriesId/);
  assert.match(source, /id="coaching-official-evaluation"/);
  assert.match(source, /합격확률을 추정하지 않으며/);
  assert.match(source, /평가기준 대응표/);
  assert.match(source, /해결된 문제/);
  assert.match(source, /남은 문제/);
  assert.match(source, /새로 생긴 문제/);
  assert.match(source, /validatedText/);
  for (const label of ['개선 작업판', '미수정', '수정중', '해결', '확인필요', '이 문제만 AI 수정안 만들기', '수정안 적용', '적용 되돌리기', '코칭 보고서 PDF 인쇄·저장']) assert.match(source, new RegExp(label));
  for (const label of ['근거 바로 확인', '자료명', '페이지·항목', '관련 원문', '제출 전 점검', '제출 전 필수 보완', '주요 개선 권장', '제출 검토 완료']) assert.match(source, new RegExp(label));
  assert.match(source, /action: 'reviseIssue'/);
  assert.match(source, /currentArchiveId/);
  assert.match(source, /document\.fonts\?\.ready\.then\(\(\)=>window\.print\(\)\)/);
  assert.match(source, /@page\{size:A4 portrait/);
  for (const value of ['pendingJob', 'startCoaching', 'pollCoaching', 'completeProposalCoaching', 'background 검증 작업을 시작했습니다', '새로고침 후에도 같은 탭', 'polling']) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /finalizeCoaching|resultCandidate/);
  assert.match(source, /if \(state\.activeTool === 'coaching' && state\.coaching\.pendingJob && !coachingPollActive\)/);
});

test('운영 진단 로그와 응답은 안전한 필드만 사용한다', () => {
  const source = fs.readFileSync(new URL('../functions/api/proposal-coaching.js', import.meta.url), 'utf8');
  for (const field of ['configuredModel', 'upstreamStatus', 'upstreamErrorType', 'upstreamErrorCode', 'upstreamRequestId', 'elapsedMs']) assert.match(source, new RegExp(field));
  assert.doesNotMatch(source, /console\.(?:log|info|error)\([^\n]*(?:OPENAI_API_KEY|proposalText|COACHING_INPUT)/);
  assert.match(source, /payload\.action === 'probe'/);
  for (const stage of ['openai-upstream', 'transport', 'parse', 'schema-validation', 'evidence-validation', 'application-validation', 'proxy/timeout']) assert.match(source, new RegExp(stage.replace('/', '\\/')));
  assert.match(source, /background: true/);
  assert.match(source, /\/v1\/responses\/\$\{encodeURIComponent\(jobId\)\}/);
  assert.match(source, /temporarily for polling \(about 10 minutes\)/);
});

test('실전 품질 QA A/B/C는 고정 더미 자료이며 일반 보관함 저장 동작을 포함하지 않는다', () => {
  assert.deepEqual(COACHING_QA_CASES.map(item => item.id), ['A', 'B', 'C']);
  assert.match(COACHING_QA_CASES[0].proposalText, /확인하지 않음|미정/);
  assert.match(COACHING_QA_CASES[1].proposalText, /20회.*24회/s);
  assert.match(COACHING_QA_CASES[2].proposalText, /총사업비 30,000,000원/);
  assert.match(COACHING_QA_CRITERIA, /신청자격|예산 합계|성과목표/);
  assert.doesNotMatch(JSON.stringify(COACHING_QA_CASES), /주민등록|전화번호|이메일|saveProposal|archive/);
  const qaSource = fs.readFileSync(new URL('../scripts/coaching-qa.mjs', import.meta.url), 'utf8');
  for (const field of ['httpStatus', 'failureStage', 'configuredModel', 'upstreamStatus', 'upstreamErrorType', 'upstreamErrorCode', 'upstreamRequestId', 'elapsedMs', 'generationCalls', 'pollingCount', 'totalElapsedMs']) assert.match(qaSource, new RegExp(field));
  assert.match(qaSource, /POLL_INTERVAL_MS = 5000/);
  assert.match(qaSource, /selectedCaseId/);
  assert.doesNotMatch(qaSource, /saveArchivedProposal|\/api\/archive|retry/i);
});

test('라이브 프로브는 전용 비밀값 없이는 OpenAI를 호출하지 않는다', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('{}'); };
  try {
    const response = await onRequest({ env: { OPENAI_API_KEY: 'secret', OPENAI_MODEL: 'gpt-5.6-sol', OPENAI_PROBE_TOKEN: 'server-token' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenAI-Probe-Token': 'wrong-token' }, body: JSON.stringify({ action: 'probe' }) }) });
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
