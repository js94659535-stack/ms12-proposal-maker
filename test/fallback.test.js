import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { localAnalyze, localDraft } from '../src/fallback.js';
import { onRequest } from '../functions/api/proposal.js';

test('규칙 분석은 원문 근거를 보존한다', () => {
  const sourceText = '제출 마감은 2026년 9월 1일이다. 상담사 3명 이상을 필수 배치해야 한다. 평가 배점은 사업수행 50점이다.';
  const result = localAnalyze({ sourceText, projectType: '나라장터', title: '테스트 사업' });
  assert.ok(result.requirements.length >= 3);
  assert.ok(result.requirements.some(item => item.evidence.includes('상담사 3명')));
  assert.equal(result.mode, 'local');
});

test('로컬 초안은 확인되지 않은 기관 사실을 확인 필요로 둔다', () => {
  const analysis = localAnalyze({ sourceText: '제출 서류와 사업 운영 계획을 작성해야 한다.', projectType: '일반', title: '테스트' });
  const result = localDraft({ analysis, answers: [], organization: { capabilities: [{ name: '확인된 프로그램', status: '공개 확인' }] } });
  assert.ok(result.sections.length >= 6);
  assert.ok(result.sections.some(section => section.status === '확인 필요'));
});

test('확정 회사 정보만 있어도 로컬 완성 초안을 생성한다', () => {
  const analysis = localAnalyze({ sourceText: '집단상담 운영 계획과 결과보고서를 제출해야 한다.', projectType: '공공조달', title: '테스트' });
  const result = localDraft({ analysis, answers: [], organization: { confirmedFacts: [{ title: '운영 지역', content: '광주 지역 운영 가능', confirmedByUser: true }] } });
  assert.equal(result.sections.length, 10);
});

test('서버 API는 키가 없으면 외부 호출 전에 중단한다', async () => {
  const response = await onRequest({ env: {}, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' } }) });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /OPENAI_API_KEY/);
});

test('서버 API는 모델 환경변수가 없으면 외부 호출 전에 중단한다', async () => {
  const response = await onRequest({ env: { OPENAI_API_KEY: 'test-only' }, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' } }) });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /OPENAI_MODEL/);
});

test('서버 API는 POST와 application/json만 허용한다', async () => {
  const getResponse = await onRequest({ env: {}, request: new Request('https://example.test/api/proposal') });
  assert.equal(getResponse.status, 405);
  const mediaResponse = await onRequest({ env: {}, request: new Request('https://example.test/api/proposal', { method: 'POST', body: 'text' }) });
  assert.equal(mediaResponse.status, 415);
});

test('서버 API는 실제 본문 바이트와 원문 길이를 제한한다', async () => {
  const env = { OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'test-model' };
  const largeBody = JSON.stringify({ action: 'analyze', payload: { sourceText: '가'.repeat(300000) } });
  const bodyResponse = await onRequest({ env, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: largeBody }) });
  assert.equal(bodyResponse.status, 413);
  const longSource = JSON.stringify({ action: 'analyze', payload: { sourceText: 'a'.repeat(180001), organization: {} } });
  const sourceResponse = await onRequest({ env, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: longSource }) });
  assert.equal(sourceResponse.status, 400);
  assert.match(await sourceResponse.text(), /180,000/);
});

test('서버 함수에는 OpenAI 외부 호출이 한 곳뿐이고 재시도 루프나 민감 로그가 없다', () => {
  const source = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  assert.equal((source.match(/fetch\('https:\/\/api\.openai\.com\/v1\/responses'/g) || []).length, 1);
  assert.doesNotMatch(source, /\bconsole\.(?:log|info|debug|warn|error)\b/);
  assert.doesNotMatch(source, /\bretry\b|while\s*\(/i);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /max_output_tokens: LIMITS\.outputTokens\[body\.action\]/);
});

test('앱은 공고문 입력에서 시작하고 사용자 확정 회사 정보만 생성에 사용한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /step: 1,/);
  assert.match(source, /confirmedFacts: state\.companyFacts\.filter\(item => item\.confirmedByUser === true\)/);
  assert.doesNotMatch(source, /profileForPrompt|organizationProfile/);
  assert.match(source, /delete saved\.manualCompanyFacts/);
  assert.match(source, /addEventListener\('click', confirmCompanyFactDraft\)/);
});
