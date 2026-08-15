// 「비밀번호 바꾸기」가 어디에 있는지 실제로 걸어서 확인한다. 아무것도 바꾸지 않고 보기만 한다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = scratch('pw-shots');
fs.mkdirSync(shots, { recursive: true });
const child = launch(scratch('pw-profile'), 9356);
const page = await attach(9356);

async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}

await page.go(SITE, 2500);
await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
await page.go(SITE, 3000);
await page.click('[data-landing="login"]', 1500);
await page.fill('#login-email', account.email, 250);
await page.fill('#login-password', account.password, 250);
await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
console.log('로그인', await page.waitFor("!document.querySelector('#login-form')", 40000, 1200));

const buttons = () => page.run("(() => JSON.stringify([...document.querySelectorAll('button')].map(el => (el.textContent||'').trim()).filter(Boolean).slice(0, 18)))()");
console.log('로그인 직후 화면 단추:', JSON.stringify(await buttons()));
await shot('1-after-login');

// 계획서 포털로 들어간다.
await page.run("(() => { const el = [...document.querySelectorAll('button')].find(item => (item.textContent||'').includes('계획서 포털')); if (el) el.click(); return '1'; })()", 2500);
console.log('계획서 포털 단추:', JSON.stringify(await buttons()));
await shot('2-proposal-portal');

// 계정 설정 열기.
const opened = await page.run("(() => { const el = document.querySelector('#open-account') || [...document.querySelectorAll('button')].find(item => (item.textContent||'').trim() === '계정 설정'); if (!el) return JSON.stringify({ ok: false }); el.click(); return JSON.stringify({ ok: true }); })()", 2000);
console.log('계정 설정 열기', JSON.stringify(opened));
const panel = await page.run("(() => { const el = document.querySelector('#password-panel'); if (!el) return JSON.stringify({ found: false }); el.open = true; el.scrollIntoView({ block: 'center' }); return JSON.stringify({ found: true, summary: (el.querySelector('summary')?.textContent||'').trim(), fields: ['#pw-current','#pw-next','#pw-confirm'].map(id => !!document.querySelector(id)) }); })()", 800);
console.log('비밀번호 칸:', JSON.stringify(panel));
await shot('3-password-panel');
child.kill();
process.exit(0);
