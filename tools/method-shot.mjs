// 진행 방식 보기 단추가 보이도록 굴려서 한 장 남긴다. 전후 비교용.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const label = process.argv[3] || 'method';
const shots = scratch('chip-shots');
fs.mkdirSync(shots, { recursive: true });

const child = launch(scratch('method-profile'), 9354);
const page = await attach(9354);

await page.go(SITE, 2500);
await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
await page.go(SITE, 3000);
await page.click('[data-landing="login"]', 1500);
await page.fill('#login-email', account.email, 250);
await page.fill('#login-password', account.password, 250);
await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1200);
await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);

for (const [screen, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  await page.size(width, height);
  await page.send('Network.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.go(SITE, 3500);
  await page.run("(() => { document.querySelector('[data-condition-chips=\"method\"]')?.scrollIntoView({ block: 'center' }); return '1'; })()", 800);
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  if (shot?.result?.data) fs.writeFileSync(path.join(shots, `${label}-${screen}.png`), Buffer.from(shot.result.data, 'base64'));
}
console.log('saved', label);
child.kill();
process.exit(0);
