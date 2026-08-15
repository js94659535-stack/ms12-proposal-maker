// 가져온 공고 목차 확인. 실제로 공고를 가져온 뒤 줄 접기·펼치기를 눌러 본다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';
const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = scratch('notice-shots');
fs.mkdirSync(shots, { recursive: true });
const child = launch(scratch('notice-profile'), 9363);
const page = await attach(9363);
const shot = async name => { const r = await page.send('Page.captureScreenshot', { format: 'png' }); if (r?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(r.result.data, 'base64')); };

await page.go(SITE, 2500);
await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
await page.go(SITE, 3000);
await page.click('[data-landing="login"]', 1500);
await page.fill('#login-email', account.email, 250);
await page.fill('#login-password', account.password, 250);
await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
await page.run("(() => { const el = [...document.querySelectorAll('button')].find(i => (i.textContent||'').includes('계획서 포털')); if (el) el.click(); return '1'; })()", 2200);
await page.run("(() => { const el = document.querySelector('[data-home-start]'); if (el) el.click(); return '1'; })()", 2500);

// 이미 모아 둔 공고를 화면 목록으로 불러온다.
// 1단계 화면에서 실제로 「공고 가져오기」를 누른다. 이미 모아 둔 자료를 화면 목록으로 불러온다.
await page.run("(() => { const el = document.querySelector('[data-step=\"0\"]'); if (el) el.click(); return '1'; })()", 2500);
const pressed = await page.run("(() => { const all = [...document.querySelectorAll('button')]; const el = all.find(i => (i.textContent||'').trim() === '공고 가져오기'); if (!el) return JSON.stringify({ found:false, labels: all.map(b => (b.textContent||'').trim()).filter(t => t.includes('가져')).slice(0,10) }); el.click(); return JSON.stringify({ found:true }); })()", 15000);
console.log('공고 가져오기:', JSON.stringify(pressed));
const state = () => page.run("(() => JSON.stringify({ rows: document.querySelectorAll('[data-notice-row]').length, groups: document.querySelectorAll('.notice-group').length, open: document.querySelectorAll('.notice-row.open').length, details: document.querySelectorAll('.notice-row-detail').length, badges: [...document.querySelectorAll('.notice-row .status')].slice(0,3).map(el => (el.textContent||'').trim()) }))()");
// 결과는 2단계 화면에 있다.
await page.run("(() => { const el = document.querySelector('[data-step=\"1\"]'); if (el) el.click(); return '1'; })()", 2500);
console.log('공고 목록 화면:', JSON.stringify(await state()));
await page.run("(() => { document.querySelector('.notice-index')?.scrollIntoView({ block:'start' }); return '1'; })()", 600);
await shot('index-collapsed');
await page.run("(() => { const el = document.querySelector('[data-notice-row]'); if (el) el.click(); return '1'; })()", 1500);
console.log('한 줄 펼침:', JSON.stringify(await state()));
await page.run("(() => { document.querySelector('.notice-index')?.scrollIntoView({ block:'start' }); return '1'; })()", 600);
await shot('index-one-open');
await page.run("(() => { const el = document.querySelector('#notice-rows-open'); if (el) el.click(); return '1'; })()", 1800);
console.log('모두 펼치기:', JSON.stringify(await state()));
await page.run("(() => { const el = document.querySelector('#notice-rows-close'); if (el) el.click(); return '1'; })()", 1800);
console.log('모두 접기:', JSON.stringify(await state()));
await page.size(390, 844);
await page.run("(() => { const el = document.querySelector('[data-notice-row]'); if (el) el.scrollIntoView({ block:'center' }); return '1'; })()", 700);
const mobile = await page.run("(() => { const el = document.querySelector('.notice-row-head'); if (!el) return JSON.stringify({ found:false }); const r = el.getBoundingClientRect(); return JSON.stringify({ found:true, right: Math.round(r.right), viewport: window.innerWidth, clipped: r.right > window.innerWidth + 1 }); })()");
console.log('모바일:', JSON.stringify(mobile));
await page.run("(() => { document.querySelector('.notice-index')?.scrollIntoView({ block:'start' }); return '1'; })()", 600);
await shot('index-mobile');
child.kill(); process.exit(0);
