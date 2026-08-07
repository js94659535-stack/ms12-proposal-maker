import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest, validateCoachingResult, validateIssueRevision } from '../functions/api/proposal-coaching.js';

function fixture() {
  return {
    basis: 'official-evaluation', overallStatus: '보완 필요', summary: '평가기준 대응 근거를 보완해야 합니다.',
    checkedAreas: ['공모 목적·평가기준', '논리구조', '수치 일관성'],
    evaluationMatrix: [{ criterion: '사업 타당성', officialPoints: '20점', requirement: '필요성과 실행계획을 평가', proposalLocations: ['사업 필요성', '세부 프로그램'], status: '부분충족', evidenceRefs: ['공식 평가표'] }],
    issues: [{ category: '평가기준 대응', priority: '주요 개선', riskType: 'competition', location: '사업 필요성 2문단', reason: '공식 평가항목의 근거가 없습니다.', direction: '공고문 근거를 연결합니다.', example: '[확인 필요: 공식 통계]를 확인한 뒤 근거 문장을 추가합니다.', evidenceRefs: [], requiresConfirmation: true }],
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
  assert.equal(validateCoachingResult(fixture()), '');
  assert.match(validateCoachingResult({ ...fixture(), basis: 'common-criteria' }, true), /공식 평가표/);
  assert.match(validateCoachingResult({ ...fixture(), issues: [{ ...fixture().issues[0], location: '' }] }), /문제별 코칭 필드/);
  assert.match(validateCoachingResult({ ...fixture(), issues: [{ ...fixture().issues[0], example: '근거 없이 확정', requiresConfirmation: false }] }), /확인 필요 상태/);
  assert.match(validateCoachingResult({ ...fixture(), issues: [{ ...fixture().issues[0], priority: '일반 개선' }] }), /주요 개선/);
  assert.match(validateCoachingResult({ ...fixture(), issues: [{ ...fixture().issues[0], riskType: 'budget-rule', priority: '주요 개선' }] }), /최우선 경고/);
  assert.match(validateCoachingResult({ ...fixture(), evaluationMatrix: [] }, true), /대응표/);
  assert.match(validateCoachingResult({ ...fixture(), comparison: { ...fixture().comparison, previousVersion: 1 } }), /이전 버전 비교/);
  assert.equal(validateCoachingResult({ ...fixture(), comparison: { ...fixture().comparison, previousVersion: 1 } }, true, 1), '');
});

test('공식 평가표를 우선하는 구조화 코칭 결과를 한 번의 요청으로 반환한다', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ output_text: JSON.stringify(fixture()) }), { headers: { 'Content-Type': 'application/json' } }); };
  try {
    const response = await onRequest({ env: { OPENAI_API_KEY: 'mock', OPENAI_MODEL: 'mock-model' }, request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposalText: '검증할 사업계획서 본문입니다. 대상과 프로그램과 성과를 충분히 기술한 원문입니다.', criteriaText: '공식 평가표', officialEvaluationProvided: true }) }) });
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.equal((await response.json()).basis, 'official-evaluation');
  } finally { globalThis.fetch = originalFetch; }
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
  assert.match(source, /action: 'reviseIssue'/);
  assert.match(source, /currentArchiveId/);
  assert.match(source, /document\.fonts\?\.ready\.then\(\(\)=>window\.print\(\)\)/);
  assert.match(source, /@page\{size:A4 portrait/);
});

test('운영 진단 로그와 응답은 안전한 필드만 사용한다', () => {
  const source = fs.readFileSync(new URL('../functions/api/proposal-coaching.js', import.meta.url), 'utf8');
  for (const field of ['configuredModel', 'upstreamStatus', 'upstreamErrorType', 'upstreamErrorCode', 'upstreamRequestId', 'elapsedMs']) assert.match(source, new RegExp(field));
  assert.doesNotMatch(source, /console\.(?:log|info|error)\([^\n]*(?:OPENAI_API_KEY|proposalText|COACHING_INPUT)/);
  assert.match(source, /payload\.action === 'probe'/);
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
