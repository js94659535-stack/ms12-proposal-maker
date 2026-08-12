// 시험자료 정리. 정리 전후 건수를 반드시 대조한다.
//
// 지우는 것: E2E-TEST 시험계정과 그 계정이 만든 세션·기관정보·계획서뿐이다.
// 남기는 것: 실제 회원 8명, 기존 계획서 29건과 실제 회원이 저장한 30번째, 공고 전부, 감사기록 전부.
// 감사기록은 지우지 않는다. E2E-TEST 실행이 있었다는 사실을 남긴다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DB = 'ms12-proposal-archive';
const WRANGLER = path.join('node_modules', 'wrangler', 'bin', 'wrangler.js');
const TEST_EMAIL = process.argv[2] || 'e2e-test-0812b@ms12.test';
const dry = !process.argv.includes('--apply');

function sql(command) {
  const out = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, '--remote', '--json', '--command', command],
    { env: { ...process.env, CI: 'true' }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const parsed = JSON.parse(out.slice(out.indexOf('[')).replace(/Assertion failed[\s\S]*$/, ''));
  return { rows: parsed[0].results, meta: parsed[0].meta };
}

const counts = () => sql(`SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM users WHERE email NOT LIKE 'e2e-test-%') AS realUsers,
  (SELECT COUNT(*) FROM archived_proposals) AS proposals,
  (SELECT COUNT(*) FROM archived_proposals WHERE user_id = '') AS unclaimed,
  (SELECT COUNT(*) FROM applicant_organizations) AS orgs,
  (SELECT COUNT(*) FROM archived_notices) AS notices,
  (SELECT COUNT(*) FROM sessions) AS sessions,
  (SELECT COUNT(*) FROM admin_audit_log) AS audit,
  (SELECT COUNT(*) FROM data_access_log) AS access,
  (SELECT COUNT(*) FROM ai_usage_events) AS ai,
  (SELECT COUNT(*) FROM idea_assets) AS assets`).rows[0];

const before = counts();
console.log('정리 전:', JSON.stringify(before));

const who = sql(`SELECT id, email, status, plan FROM users WHERE email = '${TEST_EMAIL}'`).rows[0];
if (!who) { console.log('시험계정이 없습니다. 정리할 것이 없습니다.'); process.exit(0); }
console.log('시험계정:', who.id, who.email, who.status, who.plan);

// 지울 대상을 먼저 세어 본다. 실제 회원 자료가 섞이지 않았는지 확인하는 관문이다.
const mine = sql(`SELECT
  (SELECT COUNT(*) FROM archived_proposals WHERE user_id = '${who.id}') AS proposals,
  (SELECT COUNT(*) FROM applicant_organizations WHERE user_id = '${who.id}') AS orgs,
  (SELECT COUNT(*) FROM sessions WHERE user_id = '${who.id}') AS sessions,
  (SELECT COUNT(*) FROM idea_assets WHERE user_id = '${who.id}') AS assets,
  (SELECT COUNT(*) FROM member_profiles WHERE user_id = '${who.id}') AS profiles`).rows[0];
console.log('시험계정이 만든 자료:', JSON.stringify(mine));

// E2E 표식이 붙지 않은 계획서가 섞여 있으면 멈춘다.
const suspicious = sql(`SELECT COUNT(*) AS n FROM archived_proposals WHERE user_id = '${who.id}' AND title NOT LIKE '%E2E-TEST%'`).rows[0].n;
if (Number(suspicious) > 0) {
  console.log(`중단: 시험계정 계획서 ${suspicious}건에 E2E-TEST 표식이 없습니다. 확인 전에는 지우지 않습니다.`);
  process.exit(2);
}

if (dry) { console.log('\n미리보기입니다. 실제로 지우려면 --apply를 붙이세요.'); process.exit(0); }

// 감사기록·열람기록·AI 사용기록은 지우지 않는다. 실행 사실을 남긴다.
for (const command of [
  `DELETE FROM archived_proposals WHERE user_id = '${who.id}'`,
  `DELETE FROM applicant_organizations WHERE user_id = '${who.id}'`,
  `DELETE FROM idea_assets WHERE user_id = '${who.id}'`,
  `DELETE FROM member_profiles WHERE user_id = '${who.id}'`,
  `DELETE FROM sessions WHERE user_id = '${who.id}'`,
  `DELETE FROM user_identities WHERE user_id = '${who.id}'`,
  `DELETE FROM users WHERE id = '${who.id}' AND email LIKE 'e2e-test-%'`
]) {
  const result = sql(command);
  console.log(`${result.meta.changes}건  ${command.slice(0, 62)}`);
}

const after = counts();
console.log('\n정리 후:', JSON.stringify(after));
const keep = ['realUsers', 'notices', 'audit', 'ai'];
let bad = 0;
for (const key of keep) {
  if (before[key] !== after[key]) { console.log(`경고: ${key} ${before[key]} → ${after[key]} (보존 대상인데 바뀜)`); bad += 1; }
}
// 실제 회원 계획서(미지정 29건 + 회원 1건)는 그대로여야 한다.
if (after.unclaimed !== 29) { console.log(`경고: 소유 미지정 계획서 ${after.unclaimed}건 (29건이어야 함)`); bad += 1; }
fs.writeFileSync(path.join(process.env.TEMP || '/tmp', 'ms12-e2e', 'cleanup.json'), JSON.stringify({ before, after }, null, 1));
console.log(bad ? `\n확인 필요 ${bad}건` : '\n보존 대상 모두 그대로입니다.');
process.exit(bad ? 1 : 0);
