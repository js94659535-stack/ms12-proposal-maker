import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest, validateCoachingResult } from '../functions/api/proposal-coaching.js';

function fixture() {
  return {
    basis: 'official-evaluation', overallStatus: '보완 필요', summary: '평가기준 대응 근거를 보완해야 합니다.',
    checkedAreas: ['공모 목적·평가기준', '논리구조', '수치 일관성'],
    issues: [{ category: '평가기준 대응', severity: '높음', location: '사업 필요성 2문단', reason: '공식 평가항목의 근거가 없습니다.', direction: '공고문 근거를 연결합니다.', example: '[확인 필요: 공식 통계]를 확인한 뒤 근거 문장을 추가합니다.', evidenceRefs: [], requiresConfirmation: true }]
  };
}

test('검증·코칭 API는 POST와 JSON만 허용하고 키가 없으면 외부 호출 전에 중단한다', async () => {
  const get = await onRequest({ request: new Request('https://example.test/api/proposal-coaching'), env: {} });
  assert.equal(get.status, 405);
  const post = await onRequest({ request: new Request('https://example.test/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env: {} });
  assert.equal(post.status, 503);
});

test('코칭 결과는 문제 위치·이유·방향·예시와 근거 안전장치를 검증한다', () => {
  assert.equal(validateCoachingResult(fixture()), '');
  assert.match(validateCoachingResult({ ...fixture(), basis: 'common-criteria' }, true), /공식 평가표/);
  assert.match(validateCoachingResult({ ...fixture(), issues: [{ ...fixture().issues[0], location: '' }] }), /문제별 코칭 필드/);
  assert.match(validateCoachingResult({ ...fixture(), issues: [{ ...fixture().issues[0], example: '근거 없이 확정', requiresConfirmation: false }] }), /확인 필요 상태/);
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
});
