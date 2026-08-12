// 회원 유형별 실제 로그인 인수검사.
// 로컬 D1에 시험계정을 만들고 실제로 로그인해 확인한 뒤 만든 것만 지운다.
// 운영 D1은 건드리지 않는다. npm test에는 넣지 않는다(로컬 D1과 wrangler가 필요하다).
//
//   npm run build
//   node tools/membership-acceptance.mjs
//
// OpenAI는 부르지 않는다. 생성이 필요한 확인은 서버 거절 여부까지만 본다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = 'ms12-proposal-archive';
const PORT = 8793;
const PREFIX = 'acceptance-';
const PASSWORD = 'acceptance-only-passphrase-4417';
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const ACCOUNTS = [
  { id: `${PREFIX}pending`, email: 'acceptance.pending@ms12.invalid', status: 'pending', plan: 'trial', tier: 'pending' },
  { id: `${PREFIX}member`, email: 'acceptance.member@ms12.invalid', status: 'active', plan: 'trial', tier: 'member' },
  { id: `${PREFIX}subscriber`, email: 'acceptance.sub@ms12.invalid', status: 'active', plan: 'trial', tier: 'subscriber', subscription: 'active' },
  { id: `${PREFIX}premium`, email: 'acceptance.premium@ms12.invalid', status: 'active', plan: 'trial', tier: 'premium', contract: 'active' },
  { id: `${PREFIX}ended`, email: 'acceptance.ended@ms12.invalid', status: 'active', plan: 'trial', tier: 'premium', contract: 'ended' }
];

const results = [];
const record = (account, name, ok, detail = '') => {
  results.push({ account, name, ok, detail });
  console.log(`${ok ? '  OK ' : '  실패'} ${account.padEnd(12)} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---------- 로컬 D1 ----------
function d1(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
      'd1', 'execute', DB, '--local', '--json', '--command', sql], { cwd: ROOT, env: { ...process.env, CI: 'true' } });
    let out = '';
    let err = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { err += chunk; });
    child.on('close', code => (code === 0 ? resolve(out) : reject(new Error(err.slice(0, 400) || `wrangler exit ${code}`))));
  });
}

async function passwordRecord() {
  const { createPasswordRecord } = await import(new URL('../server/password.js', import.meta.url));
  return createPasswordRecord(PASSWORD);
}

async function seed() {
  const record_ = await passwordRecord();
  for (const account of ACCOUNTS) {
    await d1(`INSERT OR REPLACE INTO users (id, email, role, org_id, name, status, password_algo, password_iterations, password_salt, password_hash, plan, trial_used_at, created_at, updated_at)
      VALUES ('${account.id}', '${account.email}', 'customer', '', '인수검사', '${account.status}', '${record_.password_algo}', ${record_.password_iterations}, '${record_.password_salt}', '${record_.password_hash}', '${account.plan}', '', '${TODAY}T00:00:00.000Z', '${TODAY}T00:00:00.000Z')`);
    if (account.subscription) {
      await d1(`INSERT OR REPLACE INTO subscriptions (user_id, status, started_on, ends_on, cycle_start, renews_on, core_used, diagnosis_used, note, granted_by, created_at, updated_at)
        VALUES ('${account.id}', 'active', '${TODAY}', '', '${TODAY}', '2099-01-01', 0, 0, '인수검사', 'acceptance', '${TODAY}T00:00:00.000Z', '${TODAY}T00:00:00.000Z')`);
    }
    if (account.contract) {
      const ends = account.contract === 'ended' ? '2020-01-01' : '2099-12-31';
      const status = account.contract === 'ended' ? 'ended' : 'active';
      await d1(`INSERT OR REPLACE INTO premium_contracts (user_id, status, started_on, ends_on, progress, progress_note, contract_name, granted_by, created_at, updated_at)
        VALUES ('${account.id}', '${status}', '2026-01-01', '${ends}', '작성중', '인수검사', '인수검사 계약', 'acceptance', '${TODAY}T00:00:00.000Z', '${TODAY}T00:00:00.000Z')`);
    }
  }
  // 프리미엄 화면 확인용 공개 사본 한 편.
  await d1(`INSERT OR REPLACE INTO showcase_proposals (id, title, field, purpose, audience, structure, outcome_design, body, is_public, sort_order, created_by, created_at, updated_at)
    VALUES ('${PREFIX}showcase', '인수검사 사례', '아동·청소년', '검사용', '검사용', '검사용', '검사용', '검사용 본문', 1, 0, 'acceptance', '${TODAY}T00:00:00.000Z', '${TODAY}T00:00:00.000Z')`);
}

async function cleanup() {
  const ids = ACCOUNTS.map(account => `'${account.id}'`).join(',');
  for (const sql of [
    `DELETE FROM sessions WHERE user_id IN (${ids})`,
    `DELETE FROM subscriptions WHERE user_id IN (${ids})`,
    `DELETE FROM premium_contracts WHERE user_id IN (${ids})`,
    `DELETE FROM member_profiles WHERE user_id IN (${ids})`,
    `DELETE FROM user_activity_events WHERE user_id IN (${ids})`,
    `DELETE FROM account_recovery_codes WHERE user_id IN (${ids})`,
    `DELETE FROM ai_usage_events WHERE user_id IN (${ids})`,
    `DELETE FROM admin_audit_log WHERE target_id IN (${ids}) OR actor_id IN (${ids})`,
    `DELETE FROM showcase_proposals WHERE id = '${PREFIX}showcase'`,
    `DELETE FROM users WHERE id IN (${ids})`
  ]) await d1(sql);
  const left = await d1(`SELECT COUNT(*) AS n FROM users WHERE id LIKE '${PREFIX}%'`);
  const subs = await d1(`SELECT COUNT(*) AS n FROM subscriptions WHERE user_id LIKE '${PREFIX}%'`);
  return { users: Number(JSON.parse(left)[0]?.results?.[0]?.n ?? -1), subscriptions: Number(JSON.parse(subs)[0]?.results?.[0]?.n ?? -1) };
}

// ---------- 서버 ----------
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
      'pages', 'dev', 'dist', '--port', String(PORT), '--local'], { cwd: ROOT, env: { ...process.env, CI: 'true' } });
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(child); } };
    child.stdout.on('data', chunk => { if (String(chunk).includes(String(PORT))) setTimeout(done, 2500); });
    child.stderr.on('data', chunk => { if (String(chunk).includes(String(PORT))) setTimeout(done, 2500); });
    child.on('close', code => { if (!settled) reject(new Error(`pages dev 종료 ${code}`)); });
    setTimeout(done, 20000);
  });
}

async function call(path_, body, cookie = '', extra = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}`, 'Sec-Fetch-Site': 'same-origin', ...extra };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`http://127.0.0.1:${PORT}${path_}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 본문이 JSON이 아닐 수 있다 */ }
  return { status: response.status, json, cookie: (response.headers.get('set-cookie') || '').split(';', 1)[0] };
}

async function signIn(account) {
  const response = await call('/api/auth', { action: 'login', email: account.email, password: PASSWORD });
  return response.cookie;
}

// ---------- 확인 ----------
const CORE = {
  proposer: '인수검사 기관', coreIdea: '초등 고학년 정서지원 집단 프로그램을 주 1회 16회기로 운영하려 합니다.',
  purpose: '예산 요청', audienceType: 'public', recipient: '○○시청', targetPages: 12
};
const DIAGNOSIS = {
  noticeText: '지원 대상은 광주 소재 아동복지 기관입니다. 지원한도는 30,000,000원이며 사업기간은 8개월입니다. 평가는 필요성과 성과관리로 나눕니다.',
  organizationText: '지역아동센터로 10년간 운영했고 사회복지사 3명이 있습니다.'
};

async function checkPending(cookie) {
  const label = '승인 대기';
  for (const [path_, body] of [['/api/proposal', { action: 'coreProposal', payload: CORE }], ['/api/archive', { action: 'listProposals' }], ['/api/premium', { action: 'showcase' }]]) {
    const response = await call(path_, body, cookie);
    record(label, `${path_} 차단`, response.status === 403, `HTTP ${response.status}`);
  }
  const saved = await call('/api/account', { action: 'saveProfile', name: '대기 담당', orgName: '대기 기관' }, cookie);
  record(label, '본인정보 수정 가능', saved.status === 200, `HTTP ${saved.status}`);
}

async function checkMember(cookie) {
  const label = '정식회원';
  const profile = await call('/api/account', { action: 'profile' }, cookie);
  const membership = profile.json?.membership;
  record(label, '등급 판정', membership?.tier === 'member', membership?.label || '');
  record(label, '5쪽 고정', membership?.coreMaxPages === 5, `${membership?.coreMaxPages}쪽`);
  record(label, '읽기 전용', membership?.coreReadOnly === true);
  record(label, '편집·출력 차단', membership?.canEdit === false && membership?.canExport === false);
  // 보관함 식별키를 함께 보낸다. 키가 없으면 권한이 아니라 키 없음으로 막힌다.
  const saved = await call('/api/archive', { action: 'saveProposal', proposal: { id: 'x', title: 't', stage: 's', snapshot: {} } }, cookie, { 'X-Archive-Key': '12345678-1234-1234-1234-123456789abc' });
  record(label, '저장 차단', saved.status === 403, `HTTP ${saved.status}`);
  const diagnosis = await call('/api/proposal', { action: 'diagnosis', payload: DIAGNOSIS }, cookie);
  record(label, '진단서 차단', diagnosis.status === 403, `HTTP ${diagnosis.status}`);
  const expert = await call('/api/proposal', { action: 'fullProposal', payload: { sourceText: 'x'.repeat(80), organization: {} } }, cookie);
  record(label, '전문 작업 차단', expert.status === 403, `HTTP ${expert.status}`);
}

async function checkSubscriber(cookie) {
  const label = '구독회원';
  const profile = await call('/api/account', { action: 'profile' }, cookie);
  const membership = profile.json?.membership;
  record(label, '등급 판정', membership?.tier === 'subscriber', membership?.label || '');
  record(label, '최대 20쪽', membership?.coreMaxPages === 20, `${membership?.coreMaxPages}쪽`);
  record(label, '남은 편수 표시', membership?.subscription?.remaining?.coreProposal === 3 && membership?.subscription?.remaining?.diagnosis === 5,
    `제안서 ${membership?.subscription?.remaining?.coreProposal} · 진단서 ${membership?.subscription?.remaining?.diagnosis}`);
  record(label, '갱신일 표시', Boolean(membership?.subscription?.renewsOn), membership?.subscription?.renewsOn || '');
  const expert = await call('/api/proposal', { action: 'fullProposal', payload: { sourceText: 'x'.repeat(80), organization: {} } }, cookie);
  record(label, '전문 전체 계획서 403', expert.status === 403, `HTTP ${expert.status}`);
  const premium = await call('/api/premium', { action: 'showcase' }, cookie);
  record(label, '프리미엄 화면 차단', premium.status === 403, `HTTP ${premium.status}`);
}

async function checkPremium(cookie, { working }) {
  const label = working ? '프리미엄 진행' : '프리미엄 종료';
  const status = await call('/api/premium', { action: 'status' }, cookie);
  record(label, '전용 화면 열람', status.status === 200, `HTTP ${status.status}`);
  record(label, '계약 상태', status.json?.contract?.canStartWork === working, status.json?.contract?.statusLabel || '');
  const showcase = await call('/api/premium', { action: 'showcase' }, cookie);
  record(label, '우수 제안서 열람', showcase.status === 200 && Array.isArray(showcase.json?.proposals), `${showcase.json?.proposals?.length ?? 0}편`);
  const history = await call('/api/premium', { action: 'noticeHistory' }, cookie);
  record(label, '공고 수집 이력', history.status === 200, `${history.json?.total ?? 0}건`);
  const expert = await call('/api/proposal', { action: 'fullProposal', payload: { sourceText: 'x'.repeat(80), organization: {} } }, cookie);
  // 진행 중이면 권한은 통과한다(내용 검사에서 400이 날 수 있다). 종료면 403이어야 한다.
  record(label, working ? '전문 작업 허용' : '전문 작업 차단', working ? expert.status !== 403 : expert.status === 403, `HTTP ${expert.status}`);
}

// ---------- 실행 ----------
let server = null;
let exitCode = 0;
try {
  console.log('1) 로컬 D1에 시험계정 만들기');
  await seed();
  console.log('2) 로컬 개발서버 시작');
  server = await startServer();
  console.log('3) 계정별 실제 로그인 확인');
  for (const account of ACCOUNTS) {
    const cookie = await signIn(account);
    if (!cookie) { record(account.tier, '로그인', false, '세션 쿠키 없음'); continue; }
    if (account.id.endsWith('pending')) await checkPending(cookie);
    else if (account.id.endsWith('member')) await checkMember(cookie);
    else if (account.id.endsWith('subscriber')) await checkSubscriber(cookie);
    else if (account.id.endsWith('premium')) await checkPremium(cookie, { working: true });
    else if (account.id.endsWith('ended')) await checkPremium(cookie, { working: false });
  }
} catch (error) {
  console.error('인수검사 중단:', error.message);
  exitCode = 2;
} finally {
  server?.kill();
  console.log('4) 시험자료 삭제');
  try {
    const left = await cleanup();
    console.log(`   남은 시험계정 ${left.users}건 · 시험구독 ${left.subscriptions}건`);
    if (left.users !== 0 || left.subscriptions !== 0) exitCode = 3;
  } catch (error) { console.error('   삭제 실패:', error.message); exitCode = 3; }
}

const failed = results.filter(item => !item.ok);
console.log(`\n확인 ${results.length}건 · 통과 ${results.length - failed.length}건 · 실패 ${failed.length}건`);
process.exit(failed.length || exitCode ? 1 : 0);
