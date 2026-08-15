// 공고보관함 「전체 보기」 확인. 실제로 눌러 모든 줄이 한 화면에 나오는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';
const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = scratch('archive-shots');
fs.mkdirSync(shots, { recursive: true });
const child = launch(scratch('archive-profile'), 9371);
const page = await attach(9371);
const shot = async name => { const r = await page.send('Page.captureScreenshot', { format: 'png' }); if (r?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(r.result.data, 'base64')); };

await page.go(SITE, 2500);
await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
await page.go(SITE, 3000);
await page.click('[data-landing="login"]', 1500);
await page.fill('#login-email', account.email, 250);
await page.fill('#login-password', account.password, 250);
await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
console.log('로그인', await page.waitFor("!document.querySelector('#login-form')", 40000, 1200));
await page.run("(() => { const el = [...document.querySelectorAll('button')].find(i => (i.textContent||'').includes('계획서 포털')); if (el) el.click(); return '1'; })()", 2200);
await page.run("(() => { const el = [...document.querySelectorAll('button')].find(i => (i.textContent||'').includes('공고보관함')); if (el) el.click(); return '1'; })()", 3500);
await page.run("(() => { const el = document.querySelector('#search-archive'); if (el) el.click(); return '1'; })()", 9000);
const state = () => page.run("(() => { const pager = (document.querySelector('.archive-pager span')?.textContent||'').trim(); const sizes = [...document.querySelectorAll('#archive-page-size option')].map(o => o.textContent.trim()); return JSON.stringify({ rows: document.querySelectorAll('.archive-table tbody tr').length, pager, sizes, allBtn: !!document.querySelector('#archive-show-all') }); })()");
console.log('기본:', JSON.stringify(await state()));
await page.run("(() => { document.querySelector('#archive-show-all')?.click(); return '1'; })()", 2500);
console.log('전체 보기:', JSON.stringify(await state()));
await page.run("(() => { document.querySelector('.archive-table')?.scrollIntoView({ block:'start' }); return '1'; })()", 600);
await shot('archive-all');
child.kill(); process.exit(0);
