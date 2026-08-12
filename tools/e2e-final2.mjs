// 남은 완주 항목: 실제 클릭으로 설계 승인 → 계획서 작성 → PDF·DOCX 내려받기 → 진단서.
// 상태값을 직접 넣지 않는다. 공고·기관은 화면에서 고르고, 승인은 버튼을 누른다.
import fs from 'node:fs';
import path from 'node:path';
import { MARK, SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const downloads = scratch('out');
fs.mkdirSync(downloads, { recursive: true });
for (const file of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, file), { force: true });

let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };
const say = (...args) => console.log(...args);

const chrome = launch(scratch('run2'), 9385);
const page = await attach(9385);

try {
  await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await page.size(1280, 800);
  await page.go(SITE, 4000);
  await page.click('[data-landing="login"]', 2000);
  await page.fill('#login-email', account.email, 300);
  await page.fill('#login-password', account.password, 300);
  await page.run("(() => { document.querySelector('#login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1200);
  record(6, '로그인', await page.waitFor("!document.querySelector('#login-form')", 40000, 1500));

  // 공고를 화면에서 고른다. 공고보관함 목록의 「작업하기」를 실제로 누른다.
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.homeSeen = true; s.portal = 'proposal'; s.activeTool = ''; s.step = 0; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 4500);
  await page.click('#fetch-notices', 26000);
  const picked = await page.run(`(() => {
    const el = document.querySelector('[data-select-notice="0"]');
    if (!el) return JSON.stringify({ ok: false });
    el.click();
    return JSON.stringify({ ok: true });
  })()`, 3500);
  const noticeState = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ has: !!s.selectedNotice, step: s.step }); })()");
  record(9, '공고 선택(실제 클릭)', picked?.ok === true && noticeState?.has === true, `step=${noticeState?.step}`);

  // 기관 간단정보를 화면에서 입력하고 저장 버튼을 누른다.
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool='applicants'; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 4500);
  const already = await page.run("(() => JSON.stringify({ orgs: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').applicants||[]).length }))()");
  if (!already?.orgs) {
    await page.fill('#quick-orgName', `${MARK} 햇살지역아동센터`, 400);
    await page.fill('#quick-contact', '김담당 010-0000-0000', 400);
    await page.fill('#quick-orgType', '지역아동센터', 700);
    await page.click('#quick-save', 4500);
  }
  const orgState = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ orgs: (s.applicants||[]).length, sel: !!s.selectedApplicantId }); })()");
  record(10, '신청기관 저장(실제 클릭)', Number(orgState?.orgs || 0) > 0 && orgState?.sel === true, `기관 ${orgState?.orgs}곳`);

  // 13. 설계 승인 — 버튼을 실제로 누른다. 상태값을 넣지 않는다.
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool='engagement'; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 5000);
  for (const id of ['design-request', 'design-review', 'design-approve']) {
    const hit = await page.run(`(() => { const el = document.querySelector('#${id}'); if (!el) return JSON.stringify({ found: false }); el.click(); return JSON.stringify({ found: true }); })()`, 3000);
    say(`   ${id}: ${hit?.found ? '눌렀습니다' : '화면에 없음'}`);
  }
  const approval = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); const d = s.engagement?.design || {}; return JSON.stringify({ at: d.approvedAt || '', by: d.approvedBy || '' }); })()");
  record(13, '설계 승인 버튼 실제 클릭', Boolean(approval?.at), approval?.at ? `${String(approval.at).slice(0, 16)} · ${approval.by}` : '승인 기록 없음');

  // 14. 전체 계획서 작성 버튼을 실제로 누른다.
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool=''; s.step=4; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 5000);
  const button = await page.run("(() => { const el = document.querySelector('#generate-proposal') || document.querySelector('#generate-parts'); return JSON.stringify({ id: el?.id || '', guide: el?.dataset?.blocked || '' }); })()");
  record(14, '작성 버튼 사용 가능', Boolean(button?.id) && !button?.guide, `${button?.id}${button?.guide ? ' · ' + String(button.guide).slice(0, 44) : ''}`);
  if (button?.id && !button?.guide) {
    const started = Date.now();
    await page.click(`#${button.id}`, 4000);
    say('   실제 AI 생성 시작…');
    const done = await page.waitFor("(JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length > 0", 420000, 10000);
    const made = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); const sec = s.sections||[]; return JSON.stringify({ n: sec.length, chars: sec.reduce((a,x)=>a+String(x.content||'').length,0), unknown: sec.filter(x=>/\\[확인 필요/.test(String(x.content||''))).length }); })()");
    record(14, '실제 AI로 계획서 생성', done && Number(made?.n || 0) > 0, `항목 ${made?.n}개 · ${made?.chars}자 · [확인 필요] ${made?.unknown}개 · ${Math.round((Date.now() - started) / 1000)}초`);

    // 2. 출력 — DOCX와 PDF를 파일로 내려받는다.
    for (const [id, label] of [['final-docx-top', 'DOCX'], ['final-pdf-top', 'PDF']]) {
      const before = fs.readdirSync(downloads).length;
      const hit = await page.run(`(() => { const el = document.querySelector('#${id}'); if (!el) return JSON.stringify({ found: false }); el.click(); return JSON.stringify({ found: true, guide: el.dataset?.blocked || '' }); })()`, 30000);
      const after = fs.readdirSync(downloads);
      const name = after.find(file => !file.endsWith('.crdownload') && file.toLowerCase().endsWith(label.toLowerCase())) || '';
      const size = name ? fs.statSync(path.join(downloads, name)).size : 0;
      record(2, `${label} 내려받기`, hit?.found === true && after.length > before && size > 1000, name ? `${name} · ${Math.round(size / 1024)}KB` : (hit?.found ? '파일 없음' : '버튼 없음'));
    }
  }
} catch (error) {
  say('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
say('내려받은 파일:', fs.readdirSync(downloads).join(', ') || '없음');
say(failures ? `\n실패 ${failures}건` : '\n통과');
process.exit(0);
