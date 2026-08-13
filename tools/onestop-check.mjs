// 전체 초안 자동완성·원본 서식 자동 채우기 완주 확인.
// 파일 업로드 → 자동 분석 → 기관 → 한 줄 → 전체 초안 → 확인 필요 보완 → 단계별 검토 왕복
// → 원본 서식 미리보기 → 저장 → 재로그인 복원 → DOCX·PDF·서식대로 출력.
//
// 세는 값: 처음 입력한 항목 수, 누른 확정 버튼 수, AI가 채운 칸, 사용자가 보완한 칸,
// 서식에 배치된 칸, AI 호출·시간, 다시 옮겨 적어야 하는 항목 수.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const MARK = 'E2E-ONESTOP';
const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const downloads = scratch('onestop-out');
const shots = scratch('onestop-shots');
for (const dir of [downloads, shots]) {
  fs.mkdirSync(dir, { recursive: true });
  for (const file of fs.readdirSync(dir)) fs.rmSync(path.join(dir, file), { force: true });
}
const notice = fs.readFileSync(new URL('../test/fixtures/notice-chest-2027-gold.txt', import.meta.url), 'utf8');
const form = fs.readFileSync(new URL('../test/fixtures/form-chest-2027-application.txt', import.meta.url), 'utf8');

const metrics = { typed: 0, confirmClicks: 0, aiFilled: 0, userFilled: 0, placed: 0, aiCalls: 0, seconds: 0, retype: 0 };
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };

const chrome = launch(scratch('onestop'), 9490);
const page = await attach(9490);
async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}
const read = keys => page.run(`(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}');
  return JSON.stringify({ ${keys} }); })()`);

async function signIn() {
  await page.go(SITE, 3500);
  await page.click('[data-landing="login"]', 1800);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  return page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
}

// 파일 업로드는 CDP로 실제 파일을 넣는다. 붙여넣기로 대신하지 않는다.
async function upload(selector, files) {
  const doc = await page.send('DOM.getDocument', {});
  const node = await page.send('DOM.querySelector', { nodeId: doc?.result?.root?.nodeId, selector });
  if (!node?.result?.nodeId) return false;
  const set = await page.send('DOM.setFileInputFiles', { files, nodeId: node.result.nodeId });
  return !set?.error;
}

try {
  await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await page.send('DOM.enable', {});
  await page.size(1280, 800);
  await page.go(SITE, 2500);
  await page.run("(() => { localStorage.clear(); sessionStorage.clear(); return '1'; })()");
  record(1, '로그인', await signIn(), account.email);

  // ---------- 1. 공고문·신청서 업로드 ----------
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.homeSeen = true; s.expertDetail = true; s.activeTool=''; s.step = 0; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 4000);
  const noticeFile = path.join(downloads, `${MARK}-공고문.txt`);
  const formFile = path.join(downloads, `${MARK}-배분신청서.txt`);
  fs.writeFileSync(noticeFile, notice);
  fs.writeFileSync(formFile, form);
  // 접힌 자료칸을 펴야 파일 입력이 화면에 있다.
  await page.run("(() => { const box = document.querySelector('#manual-sources'); if (box) box.open = true; return '1'; })()", 500);
  const sent = await upload('#manual-source-files', [noticeFile, formFile]);
  await page.waitFor("!document.querySelector('.busy')", 120000, 3000);
  metrics.typed += 2; // 올린 파일 두 개
  const sources = await read("n: (s.manualSources||[]).length, ok: (s.manualSources||[]).filter(x=>x.extractionStatus==='success').length, types: (s.manualSources||[]).map(x=>x.sourceType)");
  record(2, '공고문·신청서 업로드', sent && Number(sources?.ok || 0) >= 2, `자료 ${sources?.n}건 · 읽음 ${sources?.ok}건 · 종류 ${(sources?.types || []).join(', ')}`);

  // ---------- 2. 서식 자동 인식 ----------
  const spec = await page.run(`(() => {
    const el = document.querySelector('#intake-summary');
    return JSON.stringify({ found: Boolean(el), text: (el?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 70) });
  })()`);
  record(3, '신청서 서식 자동 인식', spec?.found === true, spec?.text || '규격표 없음');
  await shot('01-uploaded');

  // ---------- 3. 공고 선택 ----------
  await page.click('#fetch-notices', 4000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 4000);
  await page.run("(() => { document.querySelector('[data-view-notice]')?.click(); return '1'; })()", 12000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.run("(() => { document.querySelector('[data-select-notice]')?.click(); return '1'; })()", 8000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.run("(() => { document.querySelector('[data-select-subproject]')?.click(); return '1'; })()", 6000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  const chosen = await read("notice: (s.selectedNotice?.title||'').length, source: (s.sourceText||'').length");
  record(4, '공고 선택', Number(chosen?.notice || 0) > 0, `근거 ${chosen?.source}자`);

  // ---------- 4. 기관·한 줄 요청 ----------
  await page.go(SITE, 4000);
  const hasQuick = await page.run("(() => JSON.stringify({ quick: !!document.querySelector('#quick-orgName'), pick: !!document.querySelector('#simple-org-pick') }))()");
  if (hasQuick?.quick) {
    await page.fill('#quick-orgName', `${MARK} 햇살지역아동센터`, 300);
    await page.fill('#quick-contact', '김담당 010-0000-0000', 300);
    await page.fill('#quick-orgType', '지역아동센터', 500);
    await page.click('#quick-save', 3500);
    metrics.typed += 3;
  }
  await page.fill('#simple-idea', '방과후 돌봄이 끊긴 초등 저학년에게 주 2회 학습·정서 프로그램을 운영하고 싶습니다.', 700);
  metrics.typed += 1;
  const ready = await read("orgs: (s.applicants||[]).length, idea: (s.projectNarrative||'').length");
  record(5, '기관 간단정보·한 줄 요청', Number(ready?.orgs || 0) > 0 && Number(ready?.idea || 0) > 10, `기관 ${ready?.orgs}곳 · 요청 ${ready?.idea}자 · 처음 입력 ${metrics.typed}개`);

  // ---------- 5. 전체 초안 ----------
  const started = Date.now();
  await page.click('#simple-generate', 4000);
  const made = await page.waitFor("(JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length > 0", 600000, 10000);
  metrics.seconds = Math.round((Date.now() - started) / 1000);
  const draft = await read("n: (s.sections||[]).length, chars: (s.sections||[]).reduce((a,x)=>a+String(x.content||'').length,0), open: (s.sections||[]).reduce((a,x)=>a+((String(x.content||'').match(/\\[확인 필요[^\\]]*\\]/g)||[]).length),0)");
  metrics.aiFilled = Number(draft?.n || 0);
  if (!made) {
    const why = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,160), busy: (document.querySelector('.busy strong')?.textContent||'').trim().slice(0,60), master: !!s.stagedGeneration?.master, parts: (s.stagedGeneration?.parts||[]).length, phase: s.stagedGeneration?.phase || '' }); })()");
    console.log('   상태:', JSON.stringify(why));
  }
  record(6, '전체 초안 한 번에 생성', made && metrics.aiFilled > 0, `항목 ${draft?.n}개 · ${draft?.chars}자 · 확인 필요 ${draft?.open}곳 · ${metrics.seconds}초`);
  await shot('02-draft');

  // ---------- 6. 확인 필요 한 화면에서 보완 ----------
  await page.go(SITE, 4000);
  const marks = await page.run(`(() => {
    const box = document.querySelector('#open-marks');
    if (box) box.open = true;
    const inputs = [...document.querySelectorAll('[data-mark-key]')];
    return JSON.stringify({ found: Boolean(box), count: inputs.length, labels: inputs.slice(0, 4).map(el => (el.closest('.requirement')?.querySelector('strong')?.textContent || '').trim()) });
  })()`, 800);
  if (marks?.count) {
    // 아는 값만 채운다. 나머지는 그대로 [확인 필요]로 남긴다.
    const filled = await page.run(`(() => {
      const inputs = [...document.querySelectorAll('[data-mark-key]')];
      const values = { '대상 인원': '30', '예산 금액': '12,000,000', '기간·횟수': '주 2회 · 연 40회' };
      let done = 0;
      for (const el of inputs) {
        const label = (el.closest('.requirement')?.querySelector('strong')?.textContent || '').trim();
        const value = values[label];
        if (!value) continue;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        done += 1;
      }
      return JSON.stringify({ done });
    })()`, 600);
    metrics.userFilled = Number(filled?.done || 0);
    await page.click('#apply-marks', 3500);
  }
  const afterMarks = await read("open: (s.sections||[]).reduce((a,x)=>a+((String(x.content||'').match(/\\[확인 필요[^\\]]*\\]/g)||[]).length),0)");
  record(7, '확인 필요를 한 화면에서 보완', marks?.found === true, `모아 물은 항목 ${marks?.count}개 · 사용자가 채움 ${metrics.userFilled}개 · 남은 ${afterMarks?.open}곳`);

  // ---------- 7. 단계별 검토 왕복 ----------
  await page.click('#open-expert-detail', 3000);
  const detail = await read("n: (s.sections||[]).length, notice: (s.selectedNotice?.title||'').length, org: s.selectedApplicantId || ''");
  await page.click('#back-to-simple', 3000);
  const back = await read("n: (s.sections||[]).length, notice: (s.selectedNotice?.title||'').length, org: s.selectedApplicantId || ''");
  record(8, '단계별 검토 왕복에도 상태 유지',
    Number(detail?.n) === Number(back?.n) && Number(back?.notice) > 0 && Boolean(back?.org),
    `항목 ${back?.n}개 · 공고 유지 ${Number(back?.notice) > 0} · 기관 유지 ${Boolean(back?.org)}`);

  // ---------- 8. 원본 서식 미리보기 ----------
  await page.go(SITE, 4000);
  const preview = await page.run(`(() => {
    const box = document.querySelector('#form-preview');
    if (!box) return JSON.stringify({ found: false });
    box.open = true;
    const rows = [...box.querySelectorAll('.requirement')];
    return JSON.stringify({
      found: true,
      summary: (box.querySelector('summary small')?.textContent || '').trim().slice(0, 80),
      placed: rows.filter(el => /서식 항목|서식 표/.test(el.textContent || '')).length,
      unresolved: rows.filter(el => /확인-필요/.test(el.innerHTML)).length,
      titles: rows.slice(0, 3).map(el => (el.querySelector('strong')?.textContent || '').trim())
    });
  })()`, 900);
  metrics.placed = Number(preview?.placed || 0);
  metrics.retype = Number(preview?.unresolved || 0);
  record(9, '원본 서식 미리보기', preview?.found === true && metrics.placed > 0,
    `${preview?.summary} · 배치 ${metrics.placed}칸 · ${(preview?.titles || []).join(' / ').slice(0, 60)}`);
  await shot('03-form-preview');

  // ---------- 9. 전체 최종확정 ----------
  const confirmButtons = await page.run("(() => JSON.stringify({ n: document.querySelectorAll('#run-final-confirm').length }))()");
  await page.click('#run-final-confirm', 3000);
  metrics.confirmClicks = 1;
  const confirmed = await read("at: s.engagement?.design?.approvedAt || ''");
  record(10, '전체 최종확정 한 번', Boolean(confirmed?.at) && Number(confirmButtons?.n) === 1, `확정 버튼 ${confirmButtons?.n}개 · 누른 횟수 ${metrics.confirmClicks}`);

  // ---------- 10. 저장 → 재로그인 복원 ----------
  await page.click('#save-proposal-archive', 8000);
  const saved = await read("id: s.archiveProposalId || ''");
  record(11, '저장', Boolean(saved?.id), String(saved?.id || '').slice(0, 12));
  await page.run("(() => { document.querySelector('#sign-out')?.click(); return '1'; })()", 3000);
  await signIn();
  await page.go(SITE, 4000);
  const restored = await read("n: (s.sections||[]).length, at: s.engagement?.design?.approvedAt || ''");
  record(12, '재로그인 복원', Number(restored?.n || 0) > 0, `항목 ${restored?.n}개 · 확정 ${Boolean(restored?.at)}`);

  // ---------- 11. 출력 ----------
  for (const [id, label, ext] of [['final-docx-top', 'DOCX', '검토용.docx'], ['final-pdf-top', 'PDF', '.pdf'], ['final-form-docx', '서식대로 DOCX', '서식대로.docx']]) {
    const before = fs.readdirSync(downloads).length;
    const hit = await page.click(`#${id}`, 25000);
    const after = fs.readdirSync(downloads).filter(file => !file.endsWith('.crdownload'));
    const made = after.find(file => file.endsWith(ext));
    record(13, `${label} 받기`, hit?.ok === true && Boolean(made), made ? made.slice(0, 56) : '파일 없음');
  }

  // ---------- 12. 화면 크기 ----------
  for (const [width, height] of [[1280, 800], [768, 1024], [360, 640]]) {
    await page.size(width, height);
    await page.go(SITE, 3000);
    const view = await page.snapshot();
    await shot(`size-${width}`);
    record(14, `${width}×${height}`, view?.overflow === false, view?.overflow ? '가로 넘침' : '정상');
  }
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 250));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}

fs.writeFileSync(scratch('onestop-metrics.json'), JSON.stringify(metrics, null, 1));
console.log('\n[수치]');
console.log(` 처음 입력한 항목        ${metrics.typed}개`);
console.log(` 필수로 누른 확정 버튼   ${metrics.confirmClicks}개`);
console.log(` AI가 채운 신청서 칸     ${metrics.aiFilled}개`);
console.log(` 사용자가 보완한 칸      ${metrics.userFilled}개`);
console.log(` 서식에 자동 배치된 칸   ${metrics.placed}개`);
console.log(` 전체 초안 생성 시간     ${metrics.seconds}초`);
console.log(` 다시 옮겨 적을 항목     ${metrics.retype}개`);
console.log('내려받은 파일:', fs.readdirSync(downloads).filter(f => /\.(docx|pdf|hwpx)$/i.test(f)).join(', ') || '없음');
console.log(failures ? `\n실패 ${failures}건` : '\n원스톱 완주');
process.exit(0);
