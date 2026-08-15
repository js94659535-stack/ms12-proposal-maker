// 머리띠의 ← 뒤로 · ⌂ 홈 · 앞으로 → 가 실제로 도는지 본다. 여러 화면에서 같은 것을 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = scratch('nav-shots');
fs.mkdirSync(shots, { recursive: true });
const child = launch(scratch('nav-profile'), 9358);
const page = await attach(9358);

const state = () => page.run(`(() => {
  const btn = id => { const el = document.querySelector(id); return el ? { found: true, disabled: !!el.disabled, label: (el.textContent || '').trim() } : { found: false }; };
  return JSON.stringify({
    heading: (document.querySelector('h2, h1')?.textContent || '').trim().slice(0, 30),
    step: (document.querySelector('[data-menu-label="steps"], .topmenu-label')?.textContent || '').trim().slice(0, 30),
    back: btn('#workflow-back'), home: btn('#workflow-home'), forward: btn('#workflow-forward')
  });
})()`);
const press = id => page.run(`(() => { const el = document.querySelector('${id}'); if (!el) return JSON.stringify({ ok: false }); if (el.disabled) return JSON.stringify({ ok: false, disabled: true }); el.click(); return JSON.stringify({ ok: true }); })()`, 1800);

await page.go(SITE, 2500);
await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
await page.go(SITE, 3000);
await page.click('[data-landing="login"]', 1500);
await page.fill('#login-email', account.email, 250);
await page.fill('#login-password', account.password, 250);
await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
// 포털 고르기 화면이 먼저 나온다. 계획서 포털로 들어간다.
await page.run("(() => { const el = [...document.querySelectorAll('button')].find(i => (i.textContent||'').includes('계획서 포털')); if (el) el.click(); return '1'; })()", 2500);
console.log('1) 계획서 포털 홈', JSON.stringify(await state()));

// 작업 화면으로 들어간다. 홈에서는 단계 단추가 아예 없다.
await page.run("(() => { const el = document.querySelector('[data-home-start]'); if (el) el.click(); return '1'; })()", 2500);
console.log('2) 새 계획서 시작(단계 1)', JSON.stringify(await state()));

// 작업 단계 메뉴를 열고 다른 단계로 간다.
const goStep = async index => {
  await page.run("(() => { const el = [...document.querySelectorAll('button')].find(i => (i.textContent||'').includes('작업 단계') || (i.textContent||'').includes('현재 단계')); if (el) el.click(); return '1'; })()", 600);
  await page.run(`(() => { const el = document.querySelector('[data-step="${index}"]'); if (!el) return '0'; el.click(); return '1'; })()`, 1800);
  return state();
};
console.log('3) 2단계로', JSON.stringify(await goStep(1)));
console.log('4) 3단계로', JSON.stringify(await goStep(2)));
console.log('5) 뒤로 누름', JSON.stringify(await press('#workflow-back')), JSON.stringify(await state()));
console.log('6) 앞으로 누름', JSON.stringify(await press('#workflow-forward')), JSON.stringify(await state()));
console.log('7) 홈 누름', JSON.stringify(await press('#workflow-home')), JSON.stringify(await state()));

const shot = await page.send('Page.captureScreenshot', { format: 'png' });
if (shot?.result?.data) fs.writeFileSync(path.join(shots, 'nav.png'), Buffer.from(shot.result.data, 'base64'));
child.kill(); process.exit(0);
