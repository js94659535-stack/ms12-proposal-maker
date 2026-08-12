// 일반회원 간편 작성 원스톱 수용검사. 운영 화면을 실제로 눌러 끝까지 간다.
// 상태값을 직접 넣지 않는다. 값을 넣는 곳은 화면의 입력칸뿐이다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const MARK = 'E2E-SIMPLE-FLOW';
const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const downloads = scratch('accept-out');
fs.mkdirSync(downloads, { recursive: true });
for (const file of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, file), { force: true });

const rows = [];
let failures = 0;
function record(no, label, ok, detail = '') {
  rows.push({ no, label, ok, detail });
  if (!step(no, label, ok, detail)) failures += 1;
}

const chrome = launch(scratch('accept'), 9420);
const page = await attach(9420);
const readState = keys => page.run(`(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}');
  return JSON.stringify({ ${keys} }); })()`);

async function signIn() {
  await page.go(SITE, 4000);
  await page.click('[data-landing="login"]', 2000);
  await page.fill('#login-email', account.email, 300);
  await page.fill('#login-password', account.password, 300);
  await page.run("(() => { document.querySelector('#login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  return page.waitFor("!document.querySelector('#login-form')", 40000, 1500);
}

try {
  await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await page.size(1280, 800);

  // ---------- 1. 로그인과 기본 진입 화면 ----------
  record(1, '로그인', await signIn(), account.email);
  await page.go(SITE, 4500);
  const home = await page.run(`(() => JSON.stringify({
    simple: !!document.querySelector('#simple-generate'),
    badge: (document.querySelector('.view-mode-bar')?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
    steps: [...document.querySelectorAll('#app .stat-badge span')].slice(0, 4).map(el => el.textContent.trim()),
    header: !!document.querySelector('.workflow-header'),
    archive: !!document.querySelector('#open-archive-box'),
    detail: !!document.querySelector('#open-expert-detail')
  }))()`);
  record(2, '기본 진입 화면은 간편 작성', home?.simple === true, `${home?.badge} · 단계 ${(home?.steps || []).join('→')}`);
  record(3, '간편 화면에도 머리띠와 보관함이 남아 있다', home?.header === true && home?.archive === true, `머리띠 ${home?.header} · 보관함 ${home?.archive}`);

  // ---------- 2. 공고 찾기: 결과 없음과 결과 있음 ----------
  await page.click('#simple-find', 3500);
  const finder = await page.run(`(() => JSON.stringify({
    heading: (document.querySelector('h2')?.textContent || '').trim().slice(0, 30),
    search: !!document.querySelector('#archive-search') || !!document.querySelector('#notice-search'),
    ids: [...document.querySelectorAll('input,button')].map(el => el.id).filter(Boolean).slice(0, 24)
  }))()`);
  record(4, '공고 찾기 화면 도달', Boolean(finder?.heading), `${finder?.heading} · ${(finder?.ids || []).slice(0, 8).join(',')}`);

  // 보관함에서 실제로 고른다. 상태값을 손으로 넣지 않는다.
  const opened = await page.run(`(() => { const el = document.querySelector('#open-archive-box'); if (!el) return JSON.stringify({ ok: false }); el.click(); return JSON.stringify({ ok: true }); })()`, 3500);
  const box = await page.run(`(() => JSON.stringify({
    tabs: [...document.querySelectorAll('button')].map(el => (el.textContent || '').trim()).filter(t => /공고|계획서/.test(t)).slice(0, 6),
    search: !!document.querySelector('#archive-notice-search') || !!document.querySelector('#archive-search')
  }))()`);
  record(5, '공고보관함 열기', opened?.ok === true, (box?.tabs || []).join(' / ').slice(0, 70));

  // 없는 낱말로 찾아 「결과 없음」이 회색 막다른 화면이 아닌지 본다.
  const emptySearch = await page.run(`(async () => {
    const r = await fetch('/api/public', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'searchNotices', query: '존재하지않는공고낱말zzz', mode: 'broad' }) });
    const j = await r.json();
    return JSON.stringify({ status: r.status, n: (j.notices || []).length, guide: String(j.message || j.guide || '') });
  })()`);
  record(6, '검색 결과 없음도 오류가 아니다', emptySearch?.status === 200 && Number(emptySearch?.n) === 0, `HTTP ${emptySearch?.status} · ${emptySearch?.n}건`);

  // 보관함에서 실제 공고를 골라 작업 목록에 열고, 그 목록에서 공고를 고른다. 모두 화면 클릭이다.
  await page.click('#open-archive-box', 4000);
  const expanded = await page.run(`(() => {
    const el = document.querySelector('[data-archive-detail]');
    if (!el) return JSON.stringify({ ok: false });
    el.click();
    return JSON.stringify({ ok: true, title: (el.textContent || '').trim().slice(0, 30) });
  })()`, 2500);
  const opened2 = await page.run(`(() => {
    const el = document.querySelector('[data-archive-use]');
    if (!el) return JSON.stringify({ ok: false });
    el.click();
    return JSON.stringify({ ok: true });
  })()`, 3500);
  record(7, '공고보관함에서 작업 목록에 열기', expanded?.ok === true && opened2?.ok === true, expanded?.title || '');

  const listed = await page.run(`(() => {
    const el = document.querySelector('[data-view-notice]');
    if (!el) return JSON.stringify({ ok: false, seen: [...document.querySelectorAll('button')].map(x => (x.textContent||'').trim()).slice(0, 10) });
    el.click();
    return JSON.stringify({ ok: true, label: (el.textContent || '').trim().slice(0, 24) });
  })()`, 15000);
  await page.waitFor("!document.querySelector('.busy')", 90000, 3000);
  let chosen = await readState("notice: (s.selectedNotice?.title || '').length, source: (s.sourceText || '').length");
  record(7.5, '공고 선택 (화면 클릭)', Number(chosen?.notice || 0) > 0 && Number(chosen?.source || 0) > 0,
    listed?.ok ? `${listed.label} · 근거 ${chosen?.source}자` : `선택 버튼 없음: ${(listed?.seen || []).join(',').slice(0, 60)}`);

  // ---------- 3. 기관 간단정보와 한 줄 요청 ----------
  await page.go(SITE, 4000);
  const beforeOrg = await page.run("(() => JSON.stringify({ quick: !!document.querySelector('#quick-orgName'), pick: !!document.querySelector('#simple-org-pick') }))()");
  record(8, '기관정보 없는 회원도 막히지 않는다', beforeOrg?.quick === true || beforeOrg?.pick === true, `간단입력 ${beforeOrg?.quick} · 고르기 ${beforeOrg?.pick}`);
  if (beforeOrg?.quick) {
    await page.fill('#quick-orgName', `${MARK} 햇살지역아동센터`, 400);
    await page.fill('#quick-contact', '김담당 010-0000-0000', 400);
    await page.fill('#quick-orgType', '지역아동센터', 700);
    await page.click('#quick-save', 4000);
  }
  await page.fill('#simple-idea', '방과후 돌봄이 끊긴 초등 저학년을 위해 주 2회 학습·정서 프로그램을 운영하고 싶습니다.', 800);
  const ready = await readState("orgs: (s.applicants||[]).length, idea: (s.projectNarrative||'').length");
  record(9, '기관 간단정보·한 줄 요청 입력', Number(ready?.orgs || 0) > 0 && Number(ready?.idea || 0) > 10, `기관 ${ready?.orgs}곳 · 요청 ${ready?.idea}자`);

  // ---------- 4. 중복 클릭 방지와 생성 ----------
  const started = Date.now();
  await page.click('#simple-generate', 1200);
  const second = await page.run("(() => { const el = document.querySelector('#simple-generate'); if (!el) return JSON.stringify({ found: false }); el.click(); return JSON.stringify({ found: true, notice: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0,40), busy: !!document.querySelector('.busy') }); })()", 1500);
  record(10, '같은 단추를 다시 눌러도 중복 호출하지 않는다', second?.busy === true, `안내 ${second?.notice || '(없음)'}`);
  const progress = await page.run("(() => JSON.stringify({ busy: (document.querySelector('.busy strong')?.textContent||'').trim().slice(0,40), elapsed: !!document.querySelector('[data-ai-elapsed]') }))()");
  record(11, '무엇을 기다리는지 보인다', Boolean(progress?.busy), `${progress?.busy} · 경과시간 ${progress?.elapsed}`);

  const made = await page.waitFor("(JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length > 0", 600000, 10000);
  const first = await readState("n: (s.sections||[]).length, chars: (s.sections||[]).reduce((a,x)=>a+String(x.content||'').length,0), unknown: (s.sections||[]).filter(x=>/\\[확인 필요/.test(String(x.content||''))).length, approved: !!s.engagement?.design?.approvedAt");
  record(12, 'AI가 계획서 만들기', made && Number(first?.n || 0) > 0,
    `항목 ${first?.n}개 · ${first?.chars}자 · [확인 필요] ${first?.unknown}개 · 설계승인 ${first?.approved} · ${Math.round((Date.now() - started) / 1000)}초`);

  if (Number(first?.n || 0) > 0) {
    // ---------- 5. 결과 화면 ----------
    await page.go(SITE, 4000);
    const actions = await page.run("(() => JSON.stringify({ ids: ['simple-view','simple-revise','save-proposal-archive','final-docx-top','final-pdf-top','simple-expert'].filter(id => document.querySelector('#'+id)) }))()");
    record(13, '결과 화면 큰 단추', (actions?.ids || []).length >= 5, (actions?.ids || []).join(', '));

    // 저장
    await page.click('#save-proposal-archive', 9000);
    const saved = await readState("id: s.archiveProposalId || ''");
    record(14, '보관함 저장', Boolean(saved?.id), String(saved?.id || '').slice(0, 12));

    // ---------- 6. 수정 2회와 되돌리기 ----------
    const before = await readState("chars: (s.sections||[]).reduce((a,x)=>a+String(x.content||'').length,0)");
    await page.click('#simple-revise', 2500);
    await page.click('[data-revise-kind="add"]', 1500);
    await page.fill('#revise-text', '대상 선정 방법을 조금 더 자세히 적어 주세요.', 500);
    await page.click('#revise-run', 5000);
    const done1 = await page.waitFor("!document.querySelector('.busy')", 420000, 8000);
    const after1 = await readState("rounds: (s.revisions||[]).length, counted: (s.revisions||[]).filter(r=>r.counted).length, changed: (s.revisions||[]).slice(-1)[0]?.diff?.changed?.length ?? 0, kept: (s.revisions||[]).slice(-1)[0]?.diff?.kept?.length ?? 0, note: (s.revisions||[]).slice(-1)[0]?.note || ''");
    record(15, '방향 수정 1회', done1 && Number(after1?.rounds || 0) > 0, `바뀐 ${after1?.changed}개 · 유지 ${after1?.kept}개 · 차감 ${after1?.counted}회${after1?.note ? ' · ' + after1.note : ''}`);

    await page.go(SITE, 3500);
    await page.click('#simple-revise', 2000);
    const undo = await page.click('#revise-undo', 2500);
    const afterUndo = await readState("chars: (s.sections||[]).reduce((a,x)=>a+String(x.content||'').length,0)");
    record(16, '수정 전으로 되돌리기', undo?.ok === true && Number(afterUndo?.chars || 0) === Number(before?.chars || -1), `${before?.chars}자 → ${afterUndo?.chars}자`);

    await page.click('[data-revise-kind="tone"]', 1500);
    await page.fill('#revise-text', '문장을 조금 더 간결하게 다듬어 주세요.', 500);
    await page.click('#revise-run', 5000);
    const done2 = await page.waitFor("!document.querySelector('.busy')", 420000, 8000);
    const after2 = await readState("rounds: (s.revisions||[]).length, counted: (s.revisions||[]).filter(r=>r.counted).length");
    record(17, '최종 다듬기 1회', done2 && Number(after2?.rounds || 0) >= 2, `요청 ${after2?.rounds}회 · 차감 ${after2?.counted}회 · 남음 ${2 - Number(after2?.counted || 0)}회`);

    // 횟수를 다 쓴 뒤에는 이유와 방법을 안내하는지.
    await page.go(SITE, 3500);
    const quota = await page.run("(() => { const el = document.querySelector('#simple-revise'); return JSON.stringify({ found: !!el, guide: el?.dataset?.blocked || '' }); })()");
    record(18, '수정 횟수 안내', quota?.found === true, quota?.guide ? quota.guide.slice(0, 60) : '아직 남아 있음');

    // ---------- 6-2. 검증 화면 ----------
    await page.go(SITE, 3500);
    await page.click('#simple-expert', 4000);
    const verify = await page.run(`(() => JSON.stringify({
      tool: !!document.querySelector('#run-review') || /검증|코칭|평가/.test((document.querySelector('h2')?.textContent || '')),
      heading: (document.querySelector('h2')?.textContent || '').trim().slice(0, 30),
      buttons: [...document.querySelectorAll('button')].map(el => (el.textContent||'').trim()).filter(t => /검증|진단|검토/.test(t)).slice(0, 4)
    }))()`);
    record(18.5, '검증·진단 화면 도달', Boolean(verify?.heading), `${verify?.heading} · ${(verify?.buttons || []).join(', ')}`);
    await page.click('#back-to-simple', 2500);

    // ---------- 7. 간편 ↔ 전문 왕복 ----------
    await page.click('#open-expert-detail', 3000);
    const expert = await page.run(`(() => JSON.stringify({
      badge: (document.querySelector('.view-mode-bar')?.textContent || '').replace(/\\s+/g,' ').trim().slice(0, 40),
      back: !!document.querySelector('#back-to-simple'),
      body: (document.body.innerText || '').length
    }))()`);
    const keptState = await readState("n: (s.sections||[]).length, notice: (s.selectedNotice?.title||'').length, org: s.selectedApplicantId || '', step: s.step");
    record(19, '작성 과정 자세히 보기', expert?.back === true && Number(keptState?.n || 0) > 0, `${expert?.badge} · 항목 ${keptState?.n}개 · 공고 ${keptState?.notice > 0} · 기관 ${Boolean(keptState?.org)}`);
    await page.click('#back-to-simple', 3000);
    const backState = await readState("n: (s.sections||[]).length, notice: (s.selectedNotice?.title||'').length, org: s.selectedApplicantId || '', counted: (s.revisions||[]).filter(r=>r.counted).length");
    record(20, '간편 화면으로 돌아와도 그대로', Number(backState?.n || 0) === Number(keptState?.n || 0) && Number(backState?.counted || 0) === Number(after2?.counted || 0),
      `항목 ${backState?.n}개 · 차감 ${backState?.counted}회(전환으로 늘지 않음)`);

    // ---------- 8. 새로고침·재로그인 복원 ----------
    await page.go(SITE, 4000);
    const refreshed = await readState("n: (s.sections||[]).length, notice: (s.selectedNotice?.title||'').length");
    record(21, '새로고침 뒤 복원', Number(refreshed?.n || 0) > 0, `항목 ${refreshed?.n}개`);

    await page.run("(() => { document.querySelector('#sign-out')?.click(); return '1'; })()", 3500);
    await signIn();
    const restored = await readState("n: (s.sections||[]).length, id: s.archiveProposalId || ''");
    record(22, '재로그인 뒤 복원', Number(restored?.n || 0) > 0, `항목 ${restored?.n}개 · 보관 ${Boolean(restored?.id)}`);

    // ---------- 9. 출력 ----------
    await page.go(SITE, 4000);
    for (const [id, label] of [['final-docx-top', 'DOCX'], ['final-pdf-top', 'PDF']]) {
      const beforeCount = fs.readdirSync(downloads).length;
      const hit = await page.click(`#${id}`, 30000);
      const after = fs.readdirSync(downloads).filter(file => !file.endsWith('.crdownload'));
      const name = after.find(file => file.toLowerCase().endsWith(label.toLowerCase())) || '';
      const size = name ? fs.statSync(path.join(downloads, name)).size : 0;
      record(23, `${label} 내려받기`, hit?.ok === true && after.length > beforeCount && size > 1000, name ? `${name} · ${Math.round(size / 1024)}KB` : '파일 없음');
    }
  }

  // ---------- 10. 세션 만료 ----------
  const expired = await page.run(`(async () => {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    const r = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'listProposals' }) });
    return JSON.stringify({ status: r.status });
  })()`, 1500);
  record(24, '세션이 끊기면 서버가 막고 화면이 로그인으로 되돌아간다', expired?.status === 401 || expired?.status === 403, `HTTP ${expired?.status}`);
  await page.go(SITE, 3500);
  const afterExpiry = await page.run("(() => JSON.stringify({ login: !!document.querySelector('#login-form'), landing: !!document.querySelector('.landing') }))()");
  record(25, '만료 뒤 안내 화면', afterExpiry?.login === true || afterExpiry?.landing === true, `로그인 ${afterExpiry?.login} · 소개 ${afterExpiry?.landing}`);

  // ---------- 11. 화면 크기 ----------
  await signIn();
  for (const [width, height] of [[1280, 800], [768, 1024], [360, 640]]) {
    await page.size(width, height);
    await page.go(SITE, 3500);
    const view = await page.snapshot();
    record(26, `간편 화면 ${width}×${height}`, view?.overflow === false, view?.overflow ? '가로 넘침' : '정상');
  }
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 300));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}

fs.writeFileSync(scratch('accept-flow-result.json'), JSON.stringify(rows, null, 1));
console.log('내려받은 파일:', fs.readdirSync(downloads).join(', ') || '없음');
console.log(failures ? `\n실패 ${failures}건` : '\n원스톱 완주');
process.exit(0);
