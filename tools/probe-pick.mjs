// 공고 고르기 경로만 들여다본다. 자료를 바꾸지 않는다.
import fs from 'node:fs';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const chrome = launch(scratch('accept'), 9425);
const page = await attach(9425);
const look = async label => {
  const view = await page.run(`(() => JSON.stringify({
    h: (document.querySelector('h1,h2')?.textContent || '').trim().slice(0, 34),
    step: JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').step,
    tool: JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').activeTool,
    detail: JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').expertDetail,
    results: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').noticeResults||[]).length,
    viewNotice: document.querySelectorAll('[data-view-notice]').length,
    archiveUse: document.querySelectorAll('[data-archive-use]').length,
    body: (document.querySelector('.workspace, .main')?.innerText || '').replace(/\\s+/g,' ').slice(0, 160)
  }))()`);
  console.log(label, JSON.stringify(view));
};
try {
  await page.size(1280, 800);
  await page.go(SITE, 2500);
  await page.run("(() => { localStorage.clear(); sessionStorage.clear(); return '1'; })()");
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 2000);
  await page.fill('#login-email', account.email, 300);
  await page.fill('#login-password', account.password, 300);
  await page.run("(() => { document.querySelector('#login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  await page.waitFor("!document.querySelector('#login-form')", 40000, 1500);
  await page.go(SITE, 4000);
  await look('로그인 뒤');
  await page.click('#simple-find', 3500);
  await look('공고 찾기');
  await page.click('#open-archive-box', 4000);
  await look('보관함');
  await page.run("(() => { document.querySelector('[data-archive-detail]')?.click(); return '1'; })()", 2500);
  await look('행 펼침');
  await page.run("(() => { document.querySelector('[data-archive-use]')?.click(); return '1'; })()", 4000);
  await look('작업 목록에 열기');
} finally { page.close(); chrome.kill(); }
process.exit(0);
