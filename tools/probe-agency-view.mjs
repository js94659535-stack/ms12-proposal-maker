// 에이전트 화면에 무엇이 그려지는지만 본다. 자료를 바꾸지 않는다.
import fs from 'node:fs';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const list = JSON.parse(fs.readFileSync(scratch('agency-accounts.json'), 'utf8'));
const account = list.find(item => item.role === 'customer');
const admin = list.find(item => item.role === 'admin');
const chrome = launch(scratch('agency-probe'), 9460);
const page = await attach(9460);
try {
  await page.size(1280, 800);
  // 먼저 최고관리자로 자격을 연다. 시험계정에만 적용한다.
  await page.go(SITE, 2500);
  await page.run("(() => { localStorage.clear(); sessionStorage.clear(); return '1'; })()");
  await page.go(SITE, 3000);
  await page.click('[data-landing=\"login\"]', 1800);
  await page.fill('#login-email', admin.email, 250);
  await page.fill('#login-password', admin.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 2000);
  await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
  await page.run(`(async () => {
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setAgency', id: ${JSON.stringify(account.id)}, status: 'active', note: 'E2E-AGENCY 화면 확인' }) });
    return String(r.status);
  })()`, 1500);
  await page.go(SITE, 2500);
  // 관리자 세션을 실제로 끊는다. 저장소만 비우면 쿠키가 남아 그대로 로그인된 상태다.
  await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); localStorage.clear(); sessionStorage.clear(); return '1'; })()", 800);
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 1800);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 2500);
  await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
  await page.go(SITE, 5000);
  const view = await page.run(`(async () => {
    const me = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'me' }) }).then(r => r.json()).catch(() => ({}));
    const mine = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'agencyMe' }) }).then(r => r.json()).catch(() => ({}));
    return JSON.stringify({
      role: me?.user?.role || '', status: me?.user?.status || '',
      grant: mine?.status || '', active: mine?.active,
      bars: document.querySelectorAll('.view-mode-bar').length,
      quota: /남은 계획서/.test(document.body.innerText || ''),
      toggle: !!document.querySelector('#toggle-workspace'),
      head: (document.querySelector('h2')?.textContent || '').trim().slice(0, 24),
      barText: [...document.querySelectorAll('.view-mode-bar')].map(el => el.textContent.replace(/s+/g,' ').trim().slice(0, 60)),
      hasAgencyWord: /대행/.test(document.body.innerText || '')
    });
  })()`, 2000);
  console.log(JSON.stringify(view));
} finally { page.close(); chrome.kill(); }
process.exit(0);
