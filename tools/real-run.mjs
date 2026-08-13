// 실제 AI 완주 1회. 유료 호출은 이 도구에서 딱 한 번만 일어난다.
//
// 재는 것: 설계 요약이 화면에 처음 나온 시각, 묶음마다 화면에 나온 시각, 최종 완료 시각.
// 함께 보는 것: 작성 도중 부분 결과가 서버 보관자료에 남는지, 같은 묶음을 두 번 부르지 않는지,
// 부분 상태에서 저장·출력이 닫혀 있다가 완성 후 열리는지.
//
// 멈춤·오류 시험은 여기서 하지 않는다. 유료 호출을 늘리지 않으려는 것이다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const MARK = 'E2E-RUN';
const account = JSON.parse(fs.readFileSync(scratch('real-account.json'), 'utf8'));
const shots = scratch('real-shots');
fs.mkdirSync(shots, { recursive: true });

let failures = 0;
const results = [];
const record = (no, label, ok, detail = '') => { results.push({ no, label, ok, detail }); if (!step(no, label, ok, detail)) failures += 1; };
const clock = ms => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초`;
};
const stamp = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(11, 19);

const chrome = launch(scratch('realrun'), 9570);
const page = await attach(9570);
async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}
const read = keys => page.run(`(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ ${keys} }); })()`);

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

const log = [];
function note(line) { log.push(`${stamp()} ${line}`); console.log(`${stamp()} ${line}`); }

// 생성 요청의 상태 흐름을 그대로 남긴다. 값은 바꾸지 않고 보기만 한다.
const WATCH = `(() => {
  window.__watch = [];
  const orig = window.fetch;
  window.fetch = async (...args) => {
    const url = String(args[0]?.url || args[0] || '');
    const res = await orig(...args);
    if (!url.includes('/api/proposal')) return res;
    try {
      const data = await res.clone().json();
      window.__watch.push({ at: new Date().toISOString(), http: res.status, status: data?.status || '', pending: !!data?.pending, jobId: String(data?.jobId || '').slice(0, 12), error: String(data?.error || '').slice(0, 60) });
    } catch { /* 그대로 */ }
    return res;
  };
})()`;

try {
  await page.send('DOM.enable', {});
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
  await page.size(1280, 900);
  record(1, '로그인', await signIn(), account.email);

  // 기관 기본정보만 적는다. 상세정보 없이도 막히지 않는지 함께 본다.
  await page.fill('#quick-orgName', `${MARK} 물망초지역아동센터`, 300);
  await page.fill('#quick-orgType', '지역아동센터', 300);
  await page.fill('#quick-contact', '김담당 010-0000-0000', 400);
  await page.click('#quick-save', 3000);
  const org = await read("orgs: (s.applicants||[]).length, detail: ((s.applicants||[])[0]?.items||[]).filter(i => !['basic','legal'].includes(i.area)).length");
  record(2, '기본정보만 저장(상세정보 0건)', Number(org?.orgs) >= 1, `기관 ${org?.orgs}곳 · 상세정보 ${org?.detail}건`);

  // 공고는 실제 보관함에서 고른다.
  await page.click('#simple-find', 3000);
  await page.click('#fetch-notices', 4000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 4000);
  await page.run("(() => { const el = document.querySelector('[data-view-notice]'); if (el) el.click(); return '1'; })()", 12000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.run("(() => { const el = document.querySelector('[data-select-notice]'); if (el) el.click(); return '1'; })()", 8000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.run("(() => { const el = document.querySelector('[data-select-subproject]'); if (el) el.click(); return '1'; })()", 6000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  const picked = await read("title: (s.selectedNotice?.title||'').length, source: (s.sourceText||'').length");
  record(3, '공고 선택', Number(picked?.source || 0) > 100, `근거 ${picked?.source}자`);

  await page.go(SITE, 3000);
  await page.fill('#simple-idea', `${MARK} 방과후 돌봄이 끊긴 초등 저학년을 위해 주 2회 학습·정서 프로그램을 운영하고 싶습니다.`, 600);

  // ---------- 실제 유료 호출 1회 ----------
  const started = Date.now();
  note(`시작 · 「AI가 계획서 만들기」 누름`);
  await page.click('#simple-generate', 500);

  let designAt = 0;
  let serverPartialAt = 0;
  let serverPartialStage = '';
  const groupAt = [];
  let total = 0;
  let finishedAt = 0;
  const until = Date.now() + 20 * 60 * 1000;
  while (Date.now() < until) {
    const now = await page.run(`(() => {
      const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}');
      const staged = s.stagedGeneration || {};
      return JSON.stringify({
        design: !!staged.master,
        shown: !!document.querySelector('#writing-progress .summary-grid'),
        total: (staged.master?.sectionPlan||[]).length,
        done: (staged.completedGroupIds||[]).length,
        sections: (s.sections||[]).length,
        phase: staged.phase || '',
        busy: !!document.querySelector('.busy'),
        titles: (staged.master?.sectionPlan||[]).map(g => g.title)
      });
    })()`);
    if (now?.total) total = now.total;
    if (!designAt && now?.design && now?.shown) {
      designAt = Date.now();
      note(`설계 요약 화면 표시 · 시작 후 ${clock(designAt - started)} · 묶음 ${now.total}개 (${(now.titles || []).join(' / ')})`);
    }
    while (now?.done > groupAt.length) {
      const at = Date.now();
      groupAt.push(at);
      note(`${groupAt.length}번째 묶음 표시 · 시작 후 ${clock(at - started)} · 항목 ${now.sections}개`);
      // 첫 묶음이 끝난 직후, 아직 쓰는 중일 때 서버 보관을 확인한다.
      if (groupAt.length === 2 && !serverPartialAt) {
        const server = await page.run(`(async () => {
          const r = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': localStorage.getItem('ms12_archive_key_v1') || '' }, body: JSON.stringify({ action: 'listProposals' }) });
          const j = await r.json().catch(() => ({}));
          const mine = (j.proposals || [])[0] || null;
          return JSON.stringify({ status: r.status, stage: mine?.stage || '', title: String(mine?.title || '').slice(0, 40) });
        })()`);
        serverPartialAt = Date.now();
        serverPartialStage = `${server?.status} / ${server?.stage}`;
        note(`작성 도중 서버 보관 확인 · HTTP ${server?.status} · 단계 ${server?.stage}`);
      }
    }
    if (now?.phase === 'complete' || (total && now?.done === total && !now?.busy)) { finishedAt = Date.now(); break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!finishedAt) finishedAt = Date.now();
  note(`최종 완료 · 시작 후 ${clock(finishedAt - started)}`);
  await shot('01-complete');

  const final = await read("done: (s.stagedGeneration?.completedGroupIds||[]).length, sections: (s.sections||[]).length, chars: (s.sections||[]).reduce((a,x)=>a+String(x.content||'').length,0), phase: s.stagedGeneration?.phase||'', calls: JSON.stringify(s.stagedGeneration?.calls||{}), timeline: JSON.stringify((s.stagedGeneration?.timeline||[]).map(t => ({ k: t.kind, at: t.at, ms: t.ms })))");
  record(4, '설계 요약이 본문보다 먼저 나왔다', designAt > 0 && (!groupAt.length || designAt <= groupAt[0]),
    designAt ? `시작 후 ${clock(designAt - started)} (${stamp.call(null)} 기준 기록은 결과 파일 참조)` : '설계 표시를 잡지 못함');
  record(5, '묶음마다 화면에 이어서 나왔다', groupAt.length === total && total > 0,
    groupAt.map((at, index) => `${index + 1}묶음 ${clock(at - started)}`).join(' · '));
  record(6, '실제 완주', Number(final?.done) === total && Number(final?.sections) > 0 && final?.phase === 'complete',
    `묶음 ${final?.done}/${total} · 항목 ${final?.sections}개 · ${Number(final?.chars || 0).toLocaleString('ko-KR')}자 · 총 ${clock(finishedAt - started)}`);
  const calls = JSON.parse(final?.calls || '{}');
  record(7, '같은 묶음을 두 번 부르지 않았다', Object.values(calls).every(count => Number(count) === 1) && Object.keys(calls).length === total,
    `호출 횟수 ${JSON.stringify(calls)}`);
  record(8, '작성 도중 부분 결과가 서버 보관자료에 남았다', serverPartialStage.startsWith('200') && serverPartialStage.includes('parts'), serverPartialStage || '확인하지 못함');

  const ui = await page.run(`(() => JSON.stringify({
    partial: !!document.querySelector('#partial-writing'),
    save: !!document.querySelector('#save-proposal-archive'),
    docx: !!document.querySelector('#final-docx-top'),
    pdf: !!document.querySelector('#final-pdf-top'),
    confirm: !!document.querySelector('#run-final-confirm')
  }))()`);
  record(9, '완성 뒤 저장·출력·최종확정이 열린다', ui?.partial === false && ui?.save === true && ui?.docx === true,
    `부분카드 ${ui?.partial} · 저장 ${ui?.save} · DOCX ${ui?.docx} · PDF ${ui?.pdf} · 최종확정 ${ui?.confirm}`);

  const watch = await page.run("(() => JSON.stringify({ list: (window.__watch||[]).slice(-80) }))()");
  const seen = (watch?.list || []).map(item => `${String(item.at).slice(11, 19)} ${item.http} ${item.status || (item.error ? 'error' : 'result')}${item.error ? ' · ' + item.error : ''}`);
  note(`생성 요청 상태 흐름 ${seen.length}건`);
  for (const line of seen.slice(0, 12)) note(`  ${line}`);
  if (seen.length > 12) note(`  … ${seen.length - 12}건 더 (결과 파일 참조)`);

  fs.writeFileSync(scratch('real-run-timeline.json'), JSON.stringify({
    watch: watch?.list || [],
    startedAt: new Date(started).toISOString(),
    designAt: designAt ? new Date(designAt).toISOString() : '',
    designAfterMs: designAt ? designAt - started : 0,
    groups: groupAt.map((at, index) => ({ no: index + 1, at: new Date(at).toISOString(), afterMs: at - started })),
    finishedAt: new Date(finishedAt).toISOString(),
    totalMs: finishedAt - started,
    stateTimeline: JSON.parse(final?.timeline || '[]'),
    log
  }, null, 2));
} catch (error) {
  record(99, '중단', false, String(error.message).slice(0, 140));
} finally {
  fs.writeFileSync(scratch('real-run-result.json'), JSON.stringify(results, null, 2));
  console.log(`\n실패 ${failures}건 · 결과 ${scratch('real-run-result.json')} · 시간 ${scratch('real-run-timeline.json')}`);
  page.close();
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
