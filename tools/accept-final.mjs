// 마지막 확인. 배포된 화면에서 표시 중복이 사라졌는지와 세 크기를 본다. 자료를 바꾸지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const shots = scratch('final-shots');
fs.mkdirSync(shots, { recursive: true });
const chrome = launch(scratch('accept'), 9440);
const page = await attach(9440);
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };
async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}

try {
  await page.size(1280, 800);
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 2000);
  await page.fill('#login-email', account.email, 300);
  await page.fill('#login-password', account.password, 300);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  await page.waitFor("!document.querySelector('#login-form')", 40000, 1500);

  for (const [width, height] of [[1280, 800], [768, 1024], [360, 640]]) {
    await page.size(width, height);
    await page.go(SITE, 4000);
    const view = await page.run(`(() => JSON.stringify({
      badges: document.querySelectorAll('.view-mode-bar').length,
      alerts: document.querySelectorAll('.alert').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      simple: !!document.querySelector('#simple-generate'),
      detail: !!document.querySelector('#open-expert-detail')
    }))()`);
    await shot(`entry-${width}`);
    record(width, `${width}×${height} 간편 화면`, view?.badges === 1 && view?.overflow === false && view?.simple === true,
      `표시줄 ${view?.badges}개 · 알림 ${view?.alerts}개 · 가로넘침 ${view?.overflow} · 자세히 ${view?.detail}`);
  }
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally { page.close(); chrome.kill(); }
console.log(failures ? `\n실패 ${failures}건` : '\n마지막 확인 통과');
process.exit(0);
