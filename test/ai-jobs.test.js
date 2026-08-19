// 같은 작업을 두 번 결제하지 않는다. 과정·문구·분량은 그대로 두고 중복 호출과 반복 전송만 막는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GUARDED_ACTIONS, LEASE_MS, decideReuse, jobKey, stableInput, stableJson } from '../server/ai-jobs.js';

const api = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const usage = fs.readFileSync(new URL('../server/ai-usage.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0016_ai_jobs.sql', import.meta.url), 'utf8');

test('같은 입력은 키 순서가 달라도 같은 지문이 된다', () => {
  assert.equal(stableJson({ b: 1, a: [2, { d: 4, c: 3 }] }), stableJson({ a: [2, { c: 3, d: 4 }] , b: 1 }));
  // 계획서 식별자처럼 매번 달라지는 값은 지문에서 뺀다.
  assert.equal(stableInput('draftPart', { group: 'g1', proposalId: 'A' }), stableInput('draftPart', { group: 'g1', proposalId: 'B' }));
  assert.notEqual(stableInput('draftPart', { group: 'g1' }), stableInput('draftPart', { group: 'g2' }));
  assert.match(jobKey('user-1', 'draftPart', 'abc123'), /^user-1:draftPart:abc123$/);
});

test('끝난 작업은 다시 부르지 않고, 도는 작업은 이어받는다', () => {
  const now = Date.now();
  const soon = new Date(now + 60_000).toISOString();
  const past = new Date(now - 60_000).toISOString();
  assert.equal(decideReuse(null).kind, 'new');
  assert.equal(decideReuse({ status: 'done', result_json: '{"a":1}' }, now).kind, 'done');
  // 결과 사본이 없으면 다시 부를 수밖에 없다.
  assert.equal(decideReuse({ status: 'done', result_json: '' }, now).kind, 'new');
  // 배경으로 넘어간 작업은 시간이 아니라 작업번호로 이어받는다.
  assert.deepEqual(decideReuse({ status: 'running', job_id: 'resp_1', updated_at: new Date(now - 1000).toISOString() }, now), { kind: 'poll', jobId: 'resp_1' });
  // 앞단 호출은 요청 수명 상한(lease)까지만 막는다.
  const waiting = decideReuse({ status: 'running', job_id: '', lease_until: soon, updated_at: past }, now);
  assert.equal(waiting.kind, 'wait');
  assert.ok(waiting.seconds > 0);
  // 수명이 끝난 기록은 죽은 요청이다. 막지 않는다. 20분을 기다리게 하지 않는다.
  assert.equal(decideReuse({ status: 'running', job_id: '', lease_until: past, updated_at: past }, now).kind, 'new');
  // 사람이 「그래도 다시 만들기」를 누르면 무엇도 막지 않는다.
  assert.deepEqual(decideReuse({ status: 'running', job_id: '', lease_until: soon }, now, { force: true }), { kind: 'new', forced: true });
  assert.ok(LEASE_MS <= 6 * 60 * 1000, '앞단 대기는 몇 분을 넘지 않는다');
  assert.deepEqual([...GUARDED_ACTIONS], ['master', 'masterDesign', 'masterPlan', 'draftPart', 'fullProposal']);
});

test('막혀서 결과가 안 나오는 일이 없게 한다', () => {
  // 서버는 남은 시간과 강제 실행 가능 여부를 함께 알려 준다.
  assert.match(api, /return json\(\{ pending: true, duplicate: true, status: 'running', retryAfter: decision\.seconds, canForce: true \}, 200\);/);
  // 어디서 터지든 기록을 열어 둔다.
  assert.ok(api.includes("  let jobRecordId = '';") && api.indexOf("let jobRecordId") < api.indexOf("  try {"));
  assert.ok(api.includes("어디서 터졌든 기록을 열어 둔다"));
  // 화면은 기다리다 막히면 한 번은 강제로 새로 부른다.
  assert.match(client, /if \(result\?\.pending && result\?\.canForce\) return request\(action, \{ \.\.\.payload \}, \{ force: true \}\);/);
});

test('서버는 AI를 부르기 전에 기록을 남기고 같은 입력을 막는다', () => {
  // 호출 전에 기록을 만든다.
  assert.match(api, /jobRecordId = await startJob\(context\.env\.ARCHIVE_DB, \{ userId: user\.id, proposalId, action: body\.action, inputHash \}\)/);
  // 끝난 결과는 그대로 돌려주고 AI를 부르지 않는다.
  assert.match(api, /if \(decision\.kind === 'done'\) \{[\s\S]{0,200}return json\(\{ \.\.\.JSON\.parse\(existing\.result_json\), reused: true \}\);/);
  // 이미 도는 작업은 그 번호로 이어 보고, 앞단으로 도는 중이면 새로 부르지 않는다.
  assert.match(api, /if \(decision\.kind === 'poll'\) resumedJobId = decision\.jobId;/);
  // 작업번호를 받자마자 남긴다.
  assert.match(api, /await noteJobId\(context\.env\.ARCHIVE_DB, jobRecordId, startedId\)/);
  // 끝나면 결과를 사본으로 남기고, 실패는 실패로 남겨 다음 시도를 막지 않는다.
  assert.match(api, /await finishJob\(context\.env\.ARCHIVE_DB, jobRecordId, result, extractUsage\(raw\)\.total\)/);
  assert.match(api, /await failJob\(context\.env\.ARCHIVE_DB, jobRecordId\)/);
});

test('진행 중·완료된 작업을 다시 만들기 전에 보여 준다', () => {
  assert.match(api, /if \(body\.action === 'jobs'\) \{/);
  assert.match(client, /export const proposalJobs = proposalId => request\('jobs', \{ proposalId \}\);/);
  assert.match(app, /function aiJobsView\(\) \{/);
  assert.match(app, /같은 내용으로 다시 만들면 새로 결제됩니다/);
  assert.match(app, /async function loadAiJobs\(\) \{/);
});

test('같은 작업이 도는 중이면 화면은 기다렸다 그 결과를 받는다', () => {
  assert.match(client, /async function awaitResult\(action, payload/);
  assert.match(client, /while \(result\?\.pending && Date\.now\(\) < until\)/);
  assert.match(client, /export const draftPartWithAI = payload => awaitResult\('draftPart', payload\);/);
});

test('캐시 배치 변경은 적용하지 않는다', () => {
  // 유료 검증 1회에서 캐시 적중은 0%였고 본문 분량은 기준본보다 24% 줄었다.
  // 「품질이 하나라도 나빠지면 폐기한다」는 기준에 따라 순서 변경을 되돌렸다.
  const at = api.indexOf("if (action === 'draftPart') return {");
  const chr = "  };";
  const spec = api.slice(at, api.indexOf(String.fromCharCode(10) + chr, at));
  assert.match(spec, /prompt: `<MASTER_CONTEXT>/);
  // 문구는 처음부터 끝까지 그대로다.
  // 이름만 한국어로 바꿨다(MASTER_CONTEXT → 마스터 설계). 순서·문장 구성은 그대로다.
  for (const keep of ['위 마스터 설계는 앞 단계에서 이미 확정·검증된 기준이다', '공고 원문 전체는 다시 제공되지 않는다', 'sections의 id는 sectionKeys와 정확히 같아야 하며']) {
    assert.ok(spec.includes(keep), keep.slice(0, 20));
  }
});

test('비용은 그때 단가와 함께 남기고, 모르면 계산 불가로 적는다', () => {
  assert.match(migration, /price_input_micro INTEGER NOT NULL DEFAULT 0/);
  assert.match(usage, /priceInputMicro: Math\.round/);
  assert.match(usage, /price_input_micro, price_cached_micro, price_output_micro\)/);
  // 0원으로 적지 않는다.
  assert.match(app, /const money = \(value, priced = true\) => \(priced \? `\$\$\{Number\(value \|\| 0\)\.toFixed\(4\)\}` : '계산 불가'\);/);
  assert.match(app, /money\(report\.totals\.costUsd, report\.priced\)/);
});

test('화면이 부르는 작업 이름은 서버 허용 목록에 반드시 있다', () => {
  // 목록에 없으면 서버가 400으로 거절하고 사용자는 결과를 못 받는다. 실제로 한 번 그랬다.
  const used = [...client.matchAll(/request\('([a-zA-Z]+)'/g)].map(match => match[1]);
  const line = api.slice(api.indexOf('const ACTIONS = ['), api.indexOf('];', api.indexOf('const ACTIONS = [')));
  for (const action of new Set(used)) {
    assert.ok(line.includes(`'${action}'`) || /CORE_PROPOSAL_ACTION|DIAGNOSIS_ACTION/.test(line), `${action} 이 허용 목록에 없다`);
  }
  // 두 걸음 이름도 실제로 들어 있다.
  for (const action of ['masterDesign', 'masterPlan', 'draftPart', 'jobs']) assert.ok(line.includes(`'${action}'`), action);
});

test('거절도 기록에 남기고, 오래 걸리면 창을 닫아도 된다고 알린다', () => {
  // 우리 쪽 거절이 기록에 없으면 「가끔 결과가 안 나온다」를 확인할 방법이 없다.
  assert.match(api, /failureStage: 'input-rejected'/);
  assert.match(api, /return json\(\{ error: validation, rejected: true \}, 400\);/);
  // 기다리는 시간을 늘리되, 기다리지 않아도 되게 알린다.
  assert.match(client, /const MAX_WAIT_MS = 25 \* 60 \* 1000;/);
  assert.match(client, /keepGoing: waited \* 1000 >= KEEP_GOING_MS/);
  assert.match(app, /창을 닫아도 됩니다\. 다시 들어오면 이어서 받습니다/);
  // 다시 들어오면 스스로 이어받는다.
  assert.match(app, /async function resumeDesignJob\(\) \{/);
  assert.match(app, /void resumeDesignJob\(\);/);
});
