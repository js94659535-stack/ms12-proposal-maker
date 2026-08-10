import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOpenAIError, openAIDiagnostic } from '../functions/api/proposal.js';
import { normalizeOpenAIError as coachingError, rateLimitInfo, safeDiagnostic } from '../functions/api/proposal-coaching.js';

// 실제 429 응답 모양만 흉내 낸 fixture. 요청 본문·공고문·기관정보·키는 담지 않는다.
const headersOf = values => new Headers(values);
const QUOTA = {
  raw: { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota', param: null } },
  headers: headersOf({ 'content-type': 'application/json' })
};
const RPM = {
  raw: { error: { message: 'Rate limit reached for gpt-x in organization org-… on requests per min (RPM): Limit 500, Used 500.', type: 'requests', code: 'rate_limit_exceeded', param: null } },
  headers: headersOf({
    'retry-after': '12', 'x-ratelimit-limit-requests': '500', 'x-ratelimit-remaining-requests': '0',
    'x-ratelimit-reset-requests': '12s', 'x-ratelimit-limit-tokens': '150000', 'x-ratelimit-remaining-tokens': '149000', 'x-ratelimit-reset-tokens': '1s'
  })
};
const TPM = {
  raw: { error: { message: 'Rate limit reached on tokens per min (TPM).', type: 'tokens', code: 'rate_limit_exceeded' } },
  headers: headersOf({ 'x-ratelimit-limit-tokens': '150000', 'x-ratelimit-remaining-tokens': '0', 'x-ratelimit-reset-tokens': '6m0s' })
};

test('429 진단은 status·type·code·rate limit 헤더만 남긴다', () => {
  const diagnostic = openAIDiagnostic(RPM.raw, 429, RPM.headers);
  assert.deepEqual(Object.keys(diagnostic).sort(), ['code', 'param', 'rateLimit', 'status', 'type']);
  assert.equal(diagnostic.status, 429);
  assert.equal(diagnostic.type, 'requests');
  assert.equal(diagnostic.code, 'rate_limit_exceeded');
  assert.equal(diagnostic.rateLimit['retry-after'], '12');
  assert.equal(diagnostic.rateLimit['x-ratelimit-limit-requests'], '500');
  assert.equal(diagnostic.rateLimit['x-ratelimit-remaining-requests'], '0');
  assert.equal(diagnostic.rateLimit['x-ratelimit-reset-requests'], '12s');
  assert.equal(diagnostic.rateLimit['x-ratelimit-limit-tokens'], '150000');
  assert.equal(diagnostic.rateLimit['x-ratelimit-reset-tokens'], '1s');
});

test('429 원인을 사용 한도와 속도 제한으로 구분해 보여 준다', () => {
  const quota = normalizeOpenAIError(QUOTA.raw, 429, QUOTA.headers);
  assert.match(quota, /사용 한도\(결제·크레딧\)를 초과/);
  assert.match(quota, /insufficient_quota/);

  const rpm = normalizeOpenAIError(RPM.raw, 429, RPM.headers);
  assert.match(rpm, /분당 요청 한도\(RPM\)/);
  assert.match(rpm, /재시도 가능 시점: 12/);

  const tpm = normalizeOpenAIError(TPM.raw, 429, TPM.headers);
  assert.match(tpm, /분당 토큰 한도\(TPM\)/);
  assert.match(tpm, /재시도 가능 시점: 6m0s/);

  // 헤더도 코드도 없는 429는 예전처럼 뭉뚱그려 알린다(없는 원인을 만들지 않는다).
  const unknown = normalizeOpenAIError({}, 429, headersOf({}));
  assert.match(unknown, /사용 한도 또는 요청 속도를 초과했습니다/);
  assert.doesNotMatch(unknown, /RPM|TPM|결제/);
});

test('민감정보는 진단·화면 문구 어디에도 남기지 않는다', () => {
  const secret = {
    error: {
      message: 'Authorization: Bearer sk-proj-SECRETKEY. 신청기관 온새미로지역아동센터 공고문 전문 …',
      type: 'Bearer sk-proj-SECRETKEY 가 섞인 값', code: '공고문 전문이 들어온 값', param: 'Authorization: Bearer sk-'
    }
  };
  const headers = headersOf({ authorization: 'Bearer sk-proj-SECRETKEY', 'openai-organization': 'org-secret', 'set-cookie': 'session=abc', 'retry-after': '30' });
  const diagnostic = openAIDiagnostic(secret, 429, headers);
  const dumped = JSON.stringify(diagnostic);
  const message = normalizeOpenAIError(secret, 429, headers);
  for (const leak of ['sk-proj', 'Bearer', 'Authorization', 'authorization', 'org-secret', 'session=abc', '온새미로', '공고문']) {
    assert.ok(!dumped.includes(leak), `진단에 ${leak} 유출`);
    assert.ok(!message.includes(leak), `화면 문구에 ${leak} 유출`);
  }
  // 식별자 형태가 아닌 type·code는 통째로 버린다.
  assert.equal(diagnostic.type, '');
  assert.equal(diagnostic.code, '');
  assert.equal(diagnostic.param, '');
  // 허용 목록에 없는 헤더는 담지 않는다. 허용 헤더는 그대로 남는다.
  assert.deepEqual(Object.keys(diagnostic.rateLimit), ['retry-after']);
  // 응답 원문(error.message)은 어떤 경로로도 담지 않는다.
  assert.ok(!dumped.includes('message'), '응답 원문 필드가 진단에 남음');
});

test('검증·코칭 경로도 계획서 작성과 같은 429 문구를 쓴다', () => {
  const label = '계획서 검증·코칭 시작';
  const cases = [
    [QUOTA, /사용 한도\(결제·크레딧\)를 초과/],
    [RPM, /분당 요청 한도\(RPM\)/],
    [TPM, /분당 토큰 한도\(TPM\)/]
  ];
  for (const [fixture, expected] of cases) {
    const rateLimit = rateLimitInfo(fixture.headers);
    const coaching = coachingError(fixture.raw, 429, label, rateLimit);
    const proposal = normalizeOpenAIError(fixture.raw, 429, fixture.headers);
    assert.match(coaching, expected);
    // 라벨만 다르고 원인 설명은 두 경로가 같아야 한다.
    assert.equal(coaching, `${label}: ${proposal.replace(/^OpenAI /, 'OpenAI ')}`);
  }
  // 정보가 없으면 두 경로 모두 뭉뚱그려 알린다.
  const unknown = coachingError({}, 429, label, {});
  assert.match(unknown, /사용 한도 또는 요청 속도를 초과했습니다/);
  assert.doesNotMatch(unknown, /RPM|TPM|결제/);
  // 429가 아닌 상태의 문구는 바뀌지 않는다.
  assert.equal(coachingError({}, 401, label), `${label}: OpenAI API 키가 유효하지 않습니다.`);
  assert.match(coachingError({ error: { code: 'model_not_found' } }, 404, label), /모델을 사용할 수 없습니다/);
  assert.match(coachingError({}, 500, label), /요청이 실패했습니다 \(500\)/);
});

test('검증·코칭 진단도 허용 목록과 식별자 규칙만 통과시킨다', () => {
  const rateLimit = rateLimitInfo(RPM.headers);
  const diagnostic = safeDiagnostic('gpt-x', 429, 'requests', 'rate_limit_exceeded', 'req_abc-1', 120, rateLimit);
  assert.equal(diagnostic.upstreamErrorType, 'requests');
  assert.equal(diagnostic.upstreamErrorCode, 'rate_limit_exceeded');
  assert.equal(diagnostic.upstreamRequestId, 'req_abc-1');
  assert.equal(diagnostic.rateLimit['x-ratelimit-remaining-requests'], '0');
  assert.equal(diagnostic.rateLimit['retry-after'], '12');

  // 오염된 값은 통째로 버리고, 허용 목록 밖 헤더는 담지 않는다.
  const dirtyHeaders = new Headers({ authorization: 'Bearer sk-proj-SECRETKEY', 'openai-organization': 'org-secret', 'set-cookie': 'session=abc', 'retry-after': '30' });
  const dirty = safeDiagnostic('gpt-x', 429, 'Bearer sk-proj-SECRETKEY 가 섞인 값', '신청기관 온새미로 공고문 전문', 'Authorization: Bearer sk-', 5, rateLimitInfo(dirtyHeaders));
  assert.equal(dirty.upstreamErrorType, '');
  assert.equal(dirty.upstreamErrorCode, '');
  assert.equal(dirty.upstreamRequestId, '');
  assert.deepEqual(Object.keys(dirty.rateLimit), ['retry-after']);
  const dumped = JSON.stringify(dirty) + coachingError({ error: { message: 'Bearer sk-proj-SECRETKEY 온새미로 공고문', type: '섞인 값', code: '섞인 값' } }, 429, '검증', rateLimitInfo(dirtyHeaders));
  for (const leak of ['sk-proj', 'Bearer', 'Authorization', 'authorization', 'org-secret', 'session=abc', '온새미로', '공고문']) {
    assert.ok(!dumped.includes(leak), `${leak} 유출`);
  }
});

test('429가 아닌 상태는 기존 문구를 그대로 쓴다', () => {
  assert.equal(normalizeOpenAIError({}, 401, headersOf({})), 'OpenAI API 키가 유효하지 않습니다.');
  assert.match(normalizeOpenAIError({ error: { code: 'model_not_found' } }, 404, headersOf({})), /모델을 사용할 수 없습니다/);
  assert.match(normalizeOpenAIError({}, 500, headersOf({})), /요청에 실패했습니다/);
});
