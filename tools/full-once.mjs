// 「전체 1회」 경로(fullProposal)를 실제로 한 번만 돌려 순차 6묶음 기준선과 비교한다.
//
// 코드는 바꾸지 않는다. 이미 있는 화면 단추만 눌러 기존 경로를 그대로 쓴다.
//   공고 선택 → 「선택 완료 · 다음 단계」(설계 2걸음) → 설계 승인 → 「AI와 함께 전체 계획서 작성」(fullProposal 1회)
// 순차 방식은 다시 돌리지 않는다. 앞서 측정한 값을 그대로 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const MARK = 'E2E-FULL';
const account = JSON.parse(fs.readFileSync(scratch('full-account.json'), 'utf8'));
const shots = scratch('full-shots');
fs.mkdirSync(shots, { recursive: true });

let failures = 0;
const results = [];
const record = (no, label, ok, detail = '') => { results.push({ no, label, ok, detail }); if (!step(no, label, ok, detail)) failures += 1; };
const clock = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`; };
const stamp = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(11, 19);
const log = [];
const note = line => { log.push(`${stamp()} ${line}`); console.log(`${stamp()} ${line}`); };

const chrome = launch(scratch('fullonce'), 9590);
const page = await attach(9590);
async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}
const read = keys => page.run(`(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ ${keys} }); })()`);

// 생성 요청의 상태 흐름. 100초를 넘겨 배경으로 옮겨 갔는지 그대로 남긴다.
const WATCH = `(() => {
  window.__watch = [];
  const orig = window.fetch;
  window.fetch = async (...args) => {
    const url = String(args[0]?.url || args[0] || '');
    const at = Date.now();
    const res = await orig(...args);
    if (!url.includes('/api/proposal')) return res;
    let action = '';
    try { action = JSON.parse(args[1]?.body || '{}').action || ''; } catch { /* 그대로 */ }
    try {
      const data = await res.clone().json();
      window.__watch.push({ action, ms: Date.now() - at, http: res.status, status: data?.status || '', pending: !!data?.pending, error: String(data?.error || '').slice(0, 70) });
    } catch { window.__watch.push({ action, ms: Date.now() - at, http: res.status, status: 'unparsed', pending: false, error: '' }); }
    return res;
  };
})()`;

async function signIn() {
  await page.go(SITE, 2500);
  await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 1500);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  const ok = await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.homeSeen = true; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 3000);
  return ok;
}

try {
  await page.send('DOM.enable', {});
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
  await page.size(1280, 900);
  record(1, '로그인', await signIn(), account.email);

  // 기준선과 같은 기관 기본정보(상세정보 0건).
  await page.fill('#quick-orgName', `${MARK} 물망초지역아동센터`, 300);
  await page.fill('#quick-orgType', '지역아동센터', 300);
  await page.fill('#quick-contact', '김담당 010-0000-0000', 400);
  await page.click('#quick-save', 3000);

  // 기준선과 같은 공고.
  await page.click('#simple-find', 3000);
  await page.click('#fetch-notices', 4000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 4000);
  await page.run("(() => { const el = document.querySelector('[data-view-notice]'); if (el) el.click(); return '1'; })()", 12000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.run("(() => { const el = document.querySelector('[data-select-notice]'); if (el) el.click(); return '1'; })()", 8000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.run("(() => { const el = document.querySelector('[data-select-subproject]'); if (el) el.click(); return '1'; })()", 6000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  const picked = await read("source: (s.sourceText||'').length, title: (s.selectedNotice?.title||'').slice(0,20)");
  record(2, '기준선과 같은 공고·기관', Number(picked?.source || 0) > 100, `근거 ${picked?.source}자`);

  // ---------- 설계(두 걸음). 기준선과 같은 경로다. ----------
  const designStarted = Date.now();
  note('설계 시작 · 「선택 완료 · 다음 단계」');
  const proceed = await page.run("(() => { const el = document.querySelector('#proceed-selected-notice'); if (!el) return JSON.stringify({ ok: false }); el.click(); return JSON.stringify({ ok: true }); })()", 1500);
  const designDone = await page.waitFor("!!(JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').stagedGeneration||{}).master", 15 * 60 * 1000, 1000);
  const designAt = Date.now();
  await page.waitFor("!document.querySelector('.busy')", 60000, 1000);
  const design = await read("groups: (s.stagedGeneration?.master?.sectionPlan||[]).length, timeline: JSON.stringify((s.stagedGeneration?.timeline||[]).map(t => t.ms))");
  record(3, '설계 완료(두 걸음)', proceed?.ok === true && designDone === true,
    `${clock(designAt - designStarted)} · 묶음 ${design?.groups}개 · 걸음 ${JSON.parse(design?.timeline || '[]').map(ms => Math.round(ms / 1000) + '초').join(' + ')}`);
  note(`설계 표시 · 시작 후 ${clock(designAt - designStarted)}`);
  await shot('01-design');

  // 기준선과 같은 한 줄 요청.
  await page.fill('#proposal-freeform', `${MARK} 방과후 돌봄이 끊긴 초등 저학년을 위해 주 2회 학습·정서 프로그램을 운영하고 싶습니다.`, 800);

  // ---------- 설계 승인(유료 호출 없음) ----------
  await page.run("(() => { const el = document.querySelector('#open-engagement-design'); if (el) el.click(); return '1'; })()", 2500);
  for (const id of ['#design-request', '#design-review', '#design-approve']) {
    await page.run(`(() => { const el = document.querySelector('${id}'); if (el) el.click(); return '1'; })()`, 1500);
  }
  const approved = await read("at: s.engagement?.design?.approvedAt || ''");
  record(4, '설계 승인', Boolean(approved?.at), String(approved?.at).slice(0, 16).replace('T', ' '));

  // ---------- 전체 1회 생성 ----------
  await page.run("(() => { const el = document.querySelector('#close-engagement') || document.querySelector('#back-to-work'); if (el) el.click(); return '1'; })()", 1500);
  await page.go(SITE, 3000);
  await page.run("(() => { const el = document.querySelector('#open-expert-detail'); if (el) el.click(); return '1'; })()", 2500);
  const button = await page.run("(() => JSON.stringify({ found: !!document.querySelector('#generate-proposal'), blocked: document.querySelector('#generate-proposal')?.dataset?.blocked || '' }))()");
  const bodyStarted = Date.now();
  note('전체 1회 생성 시작 · 「AI와 함께 전체 계획서 작성」');
  await page.run("(() => { const el = document.querySelector('#generate-proposal'); if (el) el.click(); return '1'; })()", 1500);
  const bodyDone = await page.waitFor("(JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length > 0", 20 * 60 * 1000, 1000);
  const bodyAt = Date.now();
  await page.waitFor("!document.querySelector('.busy')", 120000, 1000);
  record(5, '전체 1회 생성', bodyDone === true && button?.found === true,
    `본문 ${clock(bodyAt - bodyStarted)} · 단추 막힘 «${button?.blocked || '없음'}»`);
  note(`본문 표시 · 생성 시작 후 ${clock(bodyAt - bodyStarted)} · 설계부터 합계 ${clock((designAt - designStarted) + (bodyAt - bodyStarted))}`);
  await shot('02-full-result');

  // ---------- 결과 재기 ----------
  const metrics = await page.run(`(() => {
    const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}');
    const sections = s.sections || [];
    const text = sections.map(x => String(x.content||'')).join(String.fromCharCode(10));
    const design = (s.stagedGeneration && s.stagedGeneration.master && s.stagedGeneration.master.projectDesign) || {};
    const mark = String.fromCharCode(91) + '확인 필요';
    const keys = ['necessity','purpose','goals','target','programs','schedule','roles','budget','indicators','outcomes'];
    const ids = sections.map(x => x.id);
    return JSON.stringify({
      n: sections.length, chars: text.length,
      perSection: sections.map(x => ({ id: x.id, c: String(x.content||'').length })),
      missingKeys: keys.filter(k => !ids.includes(k)),
      duplicated: ids.filter((id, i) => ids.indexOf(id) !== i),
      unknown: text.split(mark).length - 1,
      tables: (s.proposalTables||[]).length,
      askItems: (s.missingInformation||[]).length,
      guard: s.serverGuard ? { injection: s.serverGuard.injectionCount || 0, flagged: (s.serverGuard.flagged||[]).length } : null,
      evidence: s.serverEvidence ? { claims: (s.serverEvidence.claims||[]).length } : null,
      evaluator: s.evaluatorReview ? { verdict: s.evaluatorReview.verdict || '', issues: (s.evaluatorReview.issues||[]).length } : null,
      period: design.projectPeriod || '', hitPeriod: design.projectPeriod ? text.split(design.projectPeriod).length-1 : 0,
      versions: (s.proposalVersions||[]).length
    });
  })()`);
  record(6, '신청서 10개 항목을 모두 채웠다', Number(metrics?.n) === 10 && (metrics?.missingKeys || []).length === 0 && (metrics?.duplicated || []).length === 0,
    `항목 ${metrics?.n}개 · 누락 ${(metrics?.missingKeys || []).join(',') || '없음'} · 중복 ${(metrics?.duplicated || []).join(',') || '없음'} · ${Number(metrics?.chars || 0).toLocaleString('ko-KR')}자`);
  record(7, '서버 검증 결과를 함께 받았다', true,
    `근거검증 ${metrics?.guard ? '있음' : '없음'} · 평가자검토 ${metrics?.evaluator ? metrics.evaluator.verdict + '/' + metrics.evaluator.issues + '건' : '없음'} · 표 ${metrics?.tables}개 · [확인 필요] ${metrics?.unknown}개 · 추가질문 ${metrics?.askItems}개`);

  const watch = await page.run("(() => JSON.stringify({ list: (window.__watch||[]) }))()");
  const calls = (watch?.list || []);
  const background = calls.filter(item => item.pending).length;
  record(8, '100초를 넘겨 배경으로 넘어갔는지', true,
    background ? `배경 전환 ${background}회` : '배경 전환 없음(모두 앞단 응답)');
  note(`호출 ${calls.length}건 · ${calls.map(c => `${c.action}:${Math.round(c.ms/1000)}초/${c.http}`).join(' · ')}`);

  fs.writeFileSync(scratch('full-once-result.json'), JSON.stringify({
    designMs: designAt - designStarted, bodyMs: bodyAt - bodyStarted, totalMs: (designAt - designStarted) + (bodyAt - bodyStarted),
    metrics, calls, log, results
  }, null, 2));
} catch (error) {
  record(99, '중단', false, String(error.message).slice(0, 140));
} finally {
  fs.writeFileSync(scratch('full-once-steps.json'), JSON.stringify(results, null, 2));
  console.log(`\n실패 ${failures}건 · 결과 ${scratch('full-once-result.json')}`);
  page.close();
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
