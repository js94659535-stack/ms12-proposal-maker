// 주요 기능 카드 여덟 개가 각각 제 화면을 여는지 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';
const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = scratch('feature-shots');
fs.mkdirSync(shots, { recursive: true });
const child = launch(scratch('feature-profile'), 9375);
const page = await attach(9375);
const results = [];
const note = (what, ok, detail = '') => { results.push({ what, ok }); console.log(`${ok ? '통과' : '실패'} | ${what}${detail ? ' — ' + detail : ''}`); };

await page.go(SITE, 2500);
await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
await page.go(SITE, 3000);
await page.click('[data-landing="login"]', 1500);
await page.fill('#login-email', account.email, 250);
await page.fill('#login-password', account.password, 250);
await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);

const toAdmin = () => page.run("(() => { const el = [...document.querySelectorAll('button')].find(i => (i.textContent||'').includes('관리자 포털')); if (el) el.click(); return '1'; })()", 2500);
const where = () => page.run("(() => JSON.stringify({ h: (document.querySelector('h1,h2,h3')?.textContent||'').trim().slice(0,26), step: (document.querySelector('.topmenu-label')?.textContent||'').trim().slice(0,24), archive: !!document.querySelector('#archive-box') }))()");

await toAdmin();
const cards = await page.run("(() => JSON.stringify([...document.querySelectorAll('[data-feature-go]')].map(el => ({ go: el.dataset.featureGo, title: (el.querySelector('h3')?.textContent||'').trim() }))))()");
note(`카드 ${cards.length}개가 문이 되었다`, cards.length === 8, cards.map(c => `${c.title}→${c.go}`).join(' / '));
await page.run("(() => { document.querySelector('#landing-features')?.scrollIntoView({ block:'start' }); return '1'; })()", 700);
const shot = await page.send('Page.captureScreenshot', { format: 'png' });
if (shot?.result?.data) fs.writeFileSync(path.join(shots, 'feature-cards.png'), Buffer.from(shot.result.data, 'base64'));

for (const card of cards) {
  await toAdmin();
  await page.run(`(() => { const el = document.querySelector('[data-feature-go="${card.go}"]'); if (!el) return '0'; el.click(); return '1'; })()`, 2500);
  const now = await where();
  const ok = card.go === 'archive' ? Boolean(now?.archive) : Boolean(now?.h) && !now?.h.includes('운영 현황');
  note(`${card.title} → ${card.go}`, ok, `${now?.h || ''} ${now?.step || ''}`.trim());
}
// 자판으로도 열린다.
await toAdmin();
await page.run("(() => { const el = document.querySelector('[data-feature-go]'); if (el) el.focus(); return '1'; })()", 400);
await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await new Promise(r => setTimeout(r, 1500));
const byKey = await where();
note('자판 Enter로 열기', Boolean(byKey?.h) && !byKey.h.includes('운영 현황'), byKey?.h || '');
console.log('실패', results.filter(r => !r.ok).length, '건');
child.kill(); process.exit(0);
