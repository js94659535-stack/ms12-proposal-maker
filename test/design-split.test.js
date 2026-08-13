// 설계를 두 걸음으로 나눈다. 한 번에 9천 토큰을 뽑느라 배경작업으로 밀려나 네 배 느려졌던 것을 되돌린다.
// 배경으로 넘어간 걸음은 작업번호를 남겨, 새로고침·시간초과 뒤에도 같은 결과를 받고 다시 과금하지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('설계 스키마를 두 걸음으로 나누고 합친 결과는 예전과 같은 모양이다', () => {
  // 1걸음: 의도·설계·근거. 2걸음: 논리사슬·목차 분할.
  assert.match(api, /const MASTER_DESIGN_SCHEMA = \{[\s\S]{0,400}required: \['sponsorIntent', 'projectDesign', 'missingInformation', 'evidenceMap', 'qualityCheck'\]/);
  assert.match(api, /const MASTER_PLAN_SCHEMA = \{[\s\S]{0,300}required: \['masterLogic', 'sectionPlan'\]/);
  // 예전 한 번 호출 경로는 그대로 남긴다. 보관된 계획서가 깨지지 않게 한다.
  assert.match(api, /const MASTER_SCHEMA = \{/);
  // 합친 결과를 예전과 같은 기준으로 검증한다. 기준을 낮추지 않는다.
  assert.match(api, /const merged = \{ \.\.\.\(body\.payload\.design \|\| \{\}\), masterLogic: result\.masterLogic, sectionPlan: result\.sectionPlan \};/);
  assert.match(api, /const masterError = validateMasterResult\(merged, body\.payload\);/);
});

test('두 걸음은 앞단으로 돌고, 끊길 때만 배경으로 옮긴다', () => {
  assert.match(api, /const BACKGROUND_ACTIONS = new Set\(\['master', 'masterDesign', 'masterPlan'\]\);/);
  assert.match(api, /const background = body\.action === 'master' \|\| \(BACKGROUND_ACTIONS\.has\(body\.action\) && body\.background === true\);/);
  // 진행 상황을 물을 때는 편수·체험 횟수를 다시 깎지 않는다.
  assert.match(api, /const polling = BACKGROUND_ACTIONS\.has\(body\.action\) && Boolean\(body\.jobId\);/);
  // 출력 한도도 걸음에 맞춰 나눈다.
  assert.match(api, /masterDesign: 8_000, masterPlan: 7_000/);
});

test('새 걸음이 허용 목록에 있다', () => {
  // 목록에 없으면 서버가 400 「지원하지 않는 작업입니다」로 막는다.
  assert.match(api, /const ACTIONS = \['analyze', 'master', 'masterDesign', 'masterPlan', 'draftPart',/);
});

test('2걸음은 1걸음 결과 없이는 돌지 않는다', () => {
  assert.match(api, /if \(action === 'masterPlan' && \(!payload\.design\?\.projectDesign \|\| !payload\.design\?\.sponsorIntent\)\) return '목차 분할에는 확정된 설계 1걸음 결과가 필요합니다\.';/);
  // 1걸음은 공고 원문을 받고, 2걸음은 앞 걸음 결과만 받는다(같은 원문을 두 번 보내지 않는다).
  assert.match(api, /const includesSource = action === 'analyze' \|\| action === 'master' \|\| action === 'masterDesign'/);
});

test('화면은 예전처럼 한 번 부르고, 안에서 두 걸음으로 나뉜다', () => {
  assert.match(client, /export async function masterWithAI\(payload, onWait = null, options = \{\}\)/);
  assert.match(client, /const design = await designStep\('masterDesign', payload, settings\);/);
  assert.match(client, /const plan = await designStep\('masterPlan', \{ \.\.\.payload, design \}, settings\);/);
  // 합쳐서 돌려주는 모양이 예전 한 번 호출과 같다.
  assert.match(client, /return \{ \.\.\.design, masterLogic: plan\.masterLogic, sectionPlan: plan\.sectionPlan,/);
});

test('끊긴 걸음만 배경으로 다시 돌리고 작업번호를 남긴다', () => {
  assert.match(client, /const GATEWAY_CUT = new Set\(\[502, 503, 504, 522, 524\]\);/);
  assert.match(client, /if \(!GATEWAY_CUT\.has\(error\.status\)\) throw error;/);
  assert.match(client, /const started = await request\(action, payload, \{ background: true \}\);/);
  assert.match(client, /if \(onJob\) onJob\(action, \{ id: started\.jobId, at: new Date\(\)\.toISOString\(\) \}\);/);
  // 오류에 상태 번호를 붙여야 끊김과 진짜 오류를 구분할 수 있다.
  assert.match(client, /error\.status = response\.status;/);
});

test('저장된 작업번호가 있으면 새로 부르지 않고 그 결과부터 받는다', () => {
  assert.match(client, /const saved = resume\?\.\[action\]\?\.id \|\| '';/);
  assert.match(client, /if \(saved\) \{\s*\n\s*try \{ return await pollJob\(action, payload, saved, onWait\); \}/);
  // 화면이 작업번호를 상태에 보관하고, 끝나면 지운다.
  assert.match(app, /designJobs: \{\},/);
  assert.match(app, /resume: state\.designJobs \|\| \{\},/);
  assert.match(app, /onJob: \(action, job\) => \{ state\.designJobs = \{ \.\.\.\(state\.designJobs \|\| \{\}\), \[action\]: job \}; saveState\(\); \},/);
  assert.match(app, /state\.designJobs = \{\};/);
});
