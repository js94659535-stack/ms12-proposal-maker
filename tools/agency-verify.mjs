// 대행회원 정책을 역할별로 실제 확인한다. 시험계정만 쓰고 운영 회원 자료는 건드리지 않는다.
// 확인 순서: 지정 → 대행 화면 → 한도 → 해제 → 개인 작업공간 → 인계 → 차단.
import fs from 'node:fs';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const accounts = JSON.parse(fs.readFileSync(scratch('agency-accounts.json'), 'utf8'));
const byRole = Object.fromEntries(accounts.map(item => [item.role, item]));
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };

const chrome = launch(scratch('agency'), 9450);
const page = await attach(9450);

async function signIn(account) {
  await page.go(SITE, 2500);
  await page.run("(() => { localStorage.clear(); sessionStorage.clear(); return '1'; })()");
  await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 600);
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 1800);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  return page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
}

const call = (path, body) => page.run(`(async () => {
  const r = await fetch(${JSON.stringify(path)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(body)}) });
  const text = await r.text();
  let data = {}; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 120) }; }
  return JSON.stringify({ status: r.status, error: String(data.error || '').slice(0, 90), keys: Object.keys(data).slice(0, 8), data });
})()`, 800);

const archiveCall = (action, body = {}) => page.run(`(async () => {
  const key = localStorage.getItem('ms12_archive_key_v1') || '';
  const r = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': key },
    body: JSON.stringify({ action: ${JSON.stringify(action)}, ...${JSON.stringify(body)} }) });
  const text = await r.text();
  let data = {}; try { data = JSON.parse(text); } catch { data = {}; }
  return JSON.stringify({ status: r.status, error: String(data.error || '').slice(0, 80), n: (data.applicants || data.proposals || []).length });
})()`, 800);

try {
  await page.size(1280, 800);

  // ---------- 1. 최고관리자가 일반회원을 대행회원으로 지정 ----------
  record(1, '최고관리자 로그인', await signIn(byRole.admin), byRole.admin.email);
  const granted = await call('/api/admin', { action: 'setAgency', id: byRole.customer.id, status: 'active', note: 'E2E-AGENCY 시험 지정' });
  record(2, '대행회원 지정', granted?.status === 200, `HTTP ${granted?.status} ${granted?.error || ''}`);
  const list = await call('/api/admin', { action: 'agencyList' });
  const listed = (list?.data?.agencies || []).find(row => row.userId === byRole.customer.id);
  record(3, '대행회원 목록·건수·한도 표시', Boolean(listed),
    listed ? `${listed.status} · 고객 ${listed.footprint?.clients}곳 · 편수 한도 ${listed.limits?.monthlyPlans}편` : '목록에 없음');

  // 한도를 아주 낮게 바꿔 초과 상황을 만든다.
  const limited = await call('/api/admin', {
    action: 'setAgency', id: byRole.customer.id, status: 'active',
    limits: { monthlyPlans: 1, revisionsPerPlan: 1, monthlyDiagnoses: 1, monthlyTokens: 1, monthlyCostMicro: 1 }
  });
  record(4, '한도 변경(토큰 1로 낮춤)', limited?.status === 200, `HTTP ${limited?.status}`);

  // ---------- 2. 운영관리자·일반회원의 지정 요청 ----------
  await signIn(byRole.operator);
  const opGrant = await call('/api/operator', { action: 'setAgency', id: byRole.other.id, status: 'active' });
  const opAdmin = await call('/api/admin', { action: 'setAgency', id: byRole.other.id, status: 'active' });
  const opList = await call('/api/operator', { action: 'agencyList' });
  record(5, '운영관리자 지정 요청 차단', opGrant?.status === 403 && opAdmin?.status === 403, `operator ${opGrant?.status} · admin ${opAdmin?.status}`);
  record(6, '운영관리자 현황 조회는 허용', opList?.status === 200 && opList?.data?.readOnly === true, `HTTP ${opList?.status} · 조회전용 ${opList?.data?.readOnly}`);

  await signIn(byRole.other);
  const memberGrant = await call('/api/admin', { action: 'setAgency', id: byRole.other.id, status: 'active' });
  record(7, '일반회원 지정 요청 차단', memberGrant?.status === 403, `HTTP ${memberGrant?.status}`);

  // ---------- 3. 대행회원 본인 ----------
  await signIn(byRole.customer);
  const me = await call('/api/account', { action: 'agencyMe' });
  record(8, '대행회원 본인 자격·남은 한도 조회', me?.status === 200 && me?.data?.has === true,
    `자격 ${me?.data?.status} · 남은 편수 ${me?.data?.remaining?.plans} · 갱신 ${me?.data?.remaining?.renewsOn}`);
  const view = await page.run(`(() => JSON.stringify({
    quota: /남은 계획서/.test(document.body.innerText || ''),
    toggle: !!document.querySelector('#toggle-workspace')
  }))()`);
  record(9, '대행회원 화면에 남은 편수·작업공간 전환 표시', view?.quota === true && view?.toggle === true, `표시 ${view?.quota} · 전환 ${view?.toggle}`);

  // 한도를 넘긴 상태에서 AI 호출은 부르기 전에 막혀야 한다.
  const blocked = await call('/api/proposal', { action: 'master', payload: { proposalId: 'e2e-agency', sourceText: 'E2E-AGENCY 한도 확인용 자료입니다. '.repeat(6) } });
  record(10, '한도 초과 시 AI 호출 전에 차단', blocked?.status === 403 && /한도|상한/.test(blocked?.error || ''), `HTTP ${blocked?.status} · ${blocked?.error}`);

  // 대행 업무 자료를 하나 만든다.
  const madeClient = await archiveCall('saveApplicant', {
    workspace: 'agency',
    applicant: { id: 'e2e-agency-client-1', name: 'E2E-AGENCY 고객기관', note: '시험자료', items: [] }
  });
  const agencyList = await archiveCall('listApplicants', { workspace: 'agency' });
  const personalList = await archiveCall('listApplicants', { workspace: 'personal' });
  record(11, '대행 업무 고객 등록·조회', madeClient?.status === 200 && Number(agencyList?.n) > 0,
    `등록 ${madeClient?.status} · 대행 ${agencyList?.n}곳 · 개인 ${personalList?.n}곳`);
  record(12, '개인 작업공간과 섞이지 않음', Number(personalList?.n) === 0, `개인 목록 ${personalList?.n}곳`);

  // ---------- 4. 자격 해제 ----------
  await signIn(byRole.admin);
  const revoked = await call('/api/admin', { action: 'setAgency', id: byRole.customer.id, status: 'revoked', note: 'E2E-AGENCY 해제 확인' });
  record(13, '자격 해제', revoked?.status === 200 && revoked?.data?.role === 'customer', `HTTP ${revoked?.status} · 역할 ${revoked?.data?.role}`);

  await signIn(byRole.customer);
  const afterRevoke = await archiveCall('listApplicants', { workspace: 'agency' });
  const personalAfter = await archiveCall('listApplicants', { workspace: 'personal' });
  record(14, '해제 즉시 대행 자료 접근 차단', afterRevoke?.status === 403, `HTTP ${afterRevoke?.status} · ${afterRevoke?.error}`);
  record(15, '해제 뒤 개인 작업공간은 정상', personalAfter?.status === 200, `HTTP ${personalAfter?.status}`);

  // ---------- 5. 인계 ----------
  await signIn(byRole.admin);
  await call('/api/admin', { action: 'setAgency', id: byRole.other.id, status: 'active', note: 'E2E-AGENCY 인계 대상' });
  const preview = await call('/api/admin', { action: 'agencyTransferPreview', fromId: byRole.customer.id, toId: byRole.other.id });
  record(16, '인계 전 건수 확인', preview?.status === 200, `고객 ${preview?.data?.from?.clients}곳 · 계획서 ${preview?.data?.from?.proposals}건`);
  const noConfirm = await call('/api/admin', { action: 'agencyTransfer', fromId: byRole.customer.id, toId: byRole.other.id });
  record(17, '확인 없이는 인계하지 않음', noConfirm?.status === 409, `HTTP ${noConfirm?.status}`);
  const moved = await call('/api/admin', { action: 'agencyTransfer', fromId: byRole.customer.id, toId: byRole.other.id, confirm: true, reason: 'E2E-AGENCY 인계' });
  record(18, '자료 인계', moved?.status === 200, `고객 ${moved?.data?.moved?.clients}곳 · 남은 ${moved?.data?.after?.clients}곳`);

  await signIn(byRole.other);
  const received = await archiveCall('listApplicants', { workspace: 'agency' });
  record(19, '인계받은 대행회원이 자료를 봄', received?.status === 200, `HTTP ${received?.status} · ${received?.n}곳`);

  // ---------- 6. 감사기록 ----------
  await signIn(byRole.admin);
  const audit = await call('/api/operator', { action: 'overview', query: '' });
  const marks = JSON.stringify(audit?.data?.audit || audit?.data?.events || []).match(/admin\.agency\.[a-z]+/g) || [];
  record(20, '지정·해제·인계 감사기록', marks.length >= 3, marks.slice(0, 6).join(', ') || '기록 확인 못 함');
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
console.log(failures ? `\n실패 ${failures}건` : '\n대행회원 정책 확인 통과');
process.exit(0);
