// 권한 확인. 회원 계정으로 관리 API를 부르면 403인지, 화면에 관리 탭이 없는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = scratch('org-shots');
fs.mkdirSync(shots, { recursive: true });
const child = launch(scratch('org-perm-profile'), 9361);
const page = await attach(9361);

await page.go(SITE, 2500);
await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
await page.go(SITE, 3000);
await page.click('[data-landing="login"]', 1500);
await page.fill('#login-email', account.email, 250);
await page.fill('#login-password', account.password, 250);
await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
console.log('로그인', await page.waitFor("!document.querySelector('#login-form')", 40000, 1200));

// 이 도구는 「막히는지」를 보는 것이다. 권한 있는 계정으로 돌리면 진짜로 만들어지고 진짜로 보관된다.
// 그래서 회원 계정이 아니면 쓰는 동작을 아예 보내지 않는다.
const me = await page.run("(async () => { const r = await fetch('/api/auth', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'me' }) }); const d = await r.json().catch(()=>({})); return JSON.stringify({ role: d.user?.role || '' }); })()", 300);
const memberOnly = me?.role === 'customer';
if (!memberOnly) console.log(`※ 회원 계정이 아닙니다(${me?.role}). 쓰는 요청은 보내지 않고 화면 확인만 합니다.`);

const call = (path, body) => page.run(`(async () => { const r = await fetch('${path}', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify(${JSON.stringify(body)}) }); const d = await r.json().catch(()=>({})); return JSON.stringify({ status: r.status, error: (d.error||'').slice(0, 40), count: (d.orgs||[]).length }); })()`, 400);

if (memberOnly) console.log('회원 → 목록 조회(운영 경로):', JSON.stringify(await call('/api/operator', { action: 'noticeOrgs' })));
if (memberOnly) console.log('회원 → 기관 추가:', JSON.stringify(await call('/api/operator', { action: 'saveNoticeOrg', name: '몰래 넣기', sortOrder: 1 })));
if (memberOnly) console.log('회원 → 상태 바꾸기:', JSON.stringify(await call('/api/operator', { action: 'setNoticeOrgStatus', id: 'chest', status: 'archived' })));
console.log('회원 → 고르는 목록(회원 경로):', JSON.stringify(await call('/api/account', { action: 'noticeOrgs' })));
console.log('화면에 관리 탭이 있는지:', JSON.stringify(await page.run("(() => JSON.stringify({ tab: !!document.querySelector('[data-operator-tab=\"orgs\"]'), manage: !!document.querySelector('[data-org-status]') }))()")));

// 모바일에서 목록이 잘리지 않는지
for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  await page.size(width, height);
  await page.go(SITE, 3000);
  // 회원 등급에 따라 첫 화면이 다르다. 작업 화면으로 들어가야 머리띠가 나온다.
  await page.run("(() => { const el = [...document.querySelectorAll('button')].find(i => (i.textContent||'').includes('계획서 포털')); if (el) el.click(); return '1'; })()", 2000);
  await page.run("(() => { const el = document.querySelector('[data-home-start]'); if (el) el.click(); return '1'; })()", 2200);
  await page.run("(() => { const el = document.querySelector('[data-topmenu=\"orgs\"]'); if (el) el.open = true; return '1'; })()", 700);
  const box = await page.run("(() => { const el = document.querySelector('.org-scope'); if (!el) return JSON.stringify({ found: false }); const r = el.getBoundingClientRect(); const list = document.querySelector('.org-scope-list'); return JSON.stringify({ found: true, width: Math.round(r.width), right: Math.round(r.right), viewport: window.innerWidth, clipped: r.right > window.innerWidth + 1 || r.left < -1, items: document.querySelectorAll('.org-scope-item').length, listScroll: list ? list.scrollHeight > list.clientHeight : false }); })()");
  console.log(`${name} 고르기 상자:`, JSON.stringify(box));
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  if (shot?.result?.data) fs.writeFileSync(path.join(shots, `perm-${name}.png`), Buffer.from(shot.result.data, 'base64'));
}
child.kill();
process.exit(0);
