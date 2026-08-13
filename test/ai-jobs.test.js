// 같은 작업을 두 번 결제하지 않는다. 과정·문구·분량은 그대로 두고 중복 호출과 반복 전송만 막는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GUARDED_ACTIONS, STALE_MS, decideReuse, jobKey, stableInput, stableJson } from '../server/ai-jobs.js';

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
  assert.equal(decideReuse(null).kind, 'new');
  assert.equal(decideReuse({ status: 'done', result_json: '{"a":1}' }, now).kind, 'done');
  // 결과 사본이 없으면 다시 부를 수밖에 없다.
  assert.equal(decideReuse({ status: 'done', result_json: '' }, now).kind, 'new');
  const running = { status: 'running', job_id: 'resp_1', updated_at: new Date(now - 1000).toISOString() };
  assert.deepEqual(decideReuse(running, now), { kind: 'poll', jobId: 'resp_1' });
  // 앞단으로 도는 중이면 새로 부르지 않고 기다린다.
  assert.equal(decideReuse({ status: 'running', job_id: '', updated_at: new Date(now - 1000).toISOString() }, now).kind, 'wait');
  // 오래 방치된 기록이 영원히 길을 막지 않는다.
  assert.equal(decideReuse({ ...running, updated_at: new Date(now - STALE_MS - 1000).toISOString() }, now).kind, 'new');
  assert.deepEqual([...GUARDED_ACTIONS], ['master', 'masterDesign', 'masterPlan', 'draftPart', 'fullProposal']);
});

test('서버는 AI를 부르기 전에 기록을 남기고 같은 입력을 막는다', () => {
  // 호출 전에 기록을 만든다.
  assert.match(api, /jobRecordId = await startJob\(context\.env\.ARCHIVE_DB, \{ userId: user\.id, proposalId, action: body\.action, inputHash \}\)/);
  // 끝난 결과는 그대로 돌려주고 AI를 부르지 않는다.
  assert.match(api, /if \(decision\.kind === 'done'\) \{[\s\S]{0,200}return json\(\{ \.\.\.JSON\.parse\(existing\.result_json\), reused: true \}\);/);
  // 이미 도는 작업은 그 번호로 이어 보고, 앞단으로 도는 중이면 새로 부르지 않는다.
  assert.match(api, /if \(decision\.kind === 'poll'\) resumedJobId = decision\.jobId;/);
  assert.match(api, /if \(decision\.kind === 'wait'\) return json\(\{ pending: true, duplicate: true, status: 'running' \}, 200\);/);
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

test('draftPart 프롬프트는 고정 블록이 앞, 가변 자료가 뒤다', () => {
  const spec = api.slice(api.indexOf("if (action === 'draftPart') return {"), api.indexOf('\n  };', api.indexOf("if (action === 'draftPart') return {")));
  // 문구를 지우거나 줄이지 않았다. 순서만 바꿨다.
  for (const keep of ['MASTER_CONTEXT는 master 단계에서 이미 확정·검증된 기준이다', '공고 원문 전체는 다시 제공되지 않는다', 'sections의 id는 sectionKeys와 정확히 같아야 하며']) {
    assert.ok(spec.includes(keep), keep.slice(0, 20));
  }
  // 고정 규칙이 맨 앞이다.
  assert.match(spec, /prompt: `\$\{payload\.noticeContract\?\.rules\?\.length \? `\$\{CONTRACT_RULE\}\\n` : ''\}\$\{BLUEPRINT_RULE\}/);
  // 가변 자료는 지시문 뒤에 온다.
  assert.ok(spec.lastIndexOf('<CURRENT_APPLICATION_GROUP>') > spec.indexOf('sections의 id는 sectionKeys와'));
  assert.ok(spec.lastIndexOf('<RELEVANT_PREVIOUS_SECTIONS>') > spec.indexOf('sections의 id는 sectionKeys와'));
});

test('비용은 그때 단가와 함께 남기고, 모르면 계산 불가로 적는다', () => {
  assert.match(migration, /price_input_micro INTEGER NOT NULL DEFAULT 0/);
  assert.match(usage, /priceInputMicro: Math\.round/);
  assert.match(usage, /price_input_micro, price_cached_micro, price_output_micro\)/);
  // 0원으로 적지 않는다.
  assert.match(app, /const money = \(value, priced = true\) => \(priced \? `\$\$\{Number\(value \|\| 0\)\.toFixed\(4\)\}` : '계산 불가'\);/);
  assert.match(app, /money\(report\.totals\.costUsd, report\.priced\)/);
});
