// 역할별 기본 진입 화면과 서버 차단을 실제 로그인으로 확인한다. 자료를 바꾸지 않는다.
import fs from 'node:fs';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const list = JSON.parse(fs.readFileSync(scratch('accept-accounts.json'), 'utf8'));
const known = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const targets = [{ role: 'customer(승인됨)', ...known }, ...list];

const chrome = launch(scratch('accept-roles'), 9430);
const page = await attach(9430);
const out = [];

try {
  await page.size(1280, 800);
  for (const account of targets) {
    await page.go(SITE, 2500);
    await page.run("(() => { localStorage.clear(); sessionStorage.clear(); return '1'; })()");
    await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 600);
    await page.go(SITE, 3000);
    await page.click('[data-landing="login"]', 1800);
    await page.fill('#login-email', account.email, 250);
    await page.fill('#login-password', account.password, 250);
    await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
    await page.waitFor("!document.querySelector('#login-form')", 30000, 1200);
    await page.go(SITE, 3500);

    const screen = await page.run(`(() => JSON.stringify({
      role: (window.__ms12Role || ''),
      heading: (document.querySelector('h1, h2')?.textContent || '').trim().slice(0, 40),
      badge: (document.querySelector('.view-mode-bar')?.textContent || '').replace(/\\s+/g,' ').trim().slice(0, 36),
      portalChoice: !!document.querySelector('[data-portal="admin"]') && !!document.querySelector('[data-portal="proposal"]'),
      simple: !!document.querySelector('#simple-generate'),
      pending: /승인 대기|가입 신청/.test(document.body.innerText || ''),
      toggle: !!document.querySelector('#toggle-view'),
      detail: !!document.querySelector('#open-expert-detail'),
      adminShortcuts: !!document.querySelector('.admin-shortcuts'),
      archive: !!document.querySelector('#open-archive-box')
    }))()`);

    // 서버 차단. 화면과 어긋나는 곳이 없는지 본다.
    const api = await page.run(`(async () => {
      const call = async (path, body) => {
        try { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.status; }
        catch { return 0; }
      };
      return JSON.stringify({
        adminOverview: await call('/api/admin', { action: 'overview' }),
        operatorOverview: await call('/api/operator', { action: 'overview' }),
        archive: await call('/api/archive', { action: 'listProposals' }),
        collect: await call('/api/admin', { action: 'runNoticeCollection' })
      });
    })()`);

    out.push({ account: account.email, role: account.role, screen, api });
    console.log(`${String(account.role).padEnd(18)} 화면 ${screen?.pending ? '승인 대기' : screen?.portalChoice ? '포털 선택' : screen?.adminShortcuts ? '관리자 랜딩' : screen?.simple ? '간편 작성' : screen?.heading}`
      + ` · 전환 ${screen?.toggle ? '가능' : '없음'} · 자세히 ${screen?.detail ? '가능' : '없음'}`
      + ` · admin ${api?.adminOverview} operator ${api?.operatorOverview} archive ${api?.archive} 수집 ${api?.collect}`);
  }
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 200));
} finally {
  page.close();
  chrome.kill();
}
fs.writeFileSync(scratch('accept-roles-result.json'), JSON.stringify(out, null, 1));
process.exit(0);
