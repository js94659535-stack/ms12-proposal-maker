// 가입이 왜 막혔는지만 본다. 자료를 바꾸지 않는다.
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const email = process.argv[2];
const password = process.argv[3];
const chrome = launch(scratch('probe'), 9415);
const page = await attach(9415);
try {
  await page.size(1280, 800);
  await page.go(SITE, 3000);
  const result = await page.run(`(async () => {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signup', email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)}, confirm: ${JSON.stringify(password)}, passwordConfirm: ${JSON.stringify(password)} }) });
    const text = (await r.text()).slice(0, 200);
    return JSON.stringify({ status: r.status, text });
  })()`);
  console.log(JSON.stringify(result));
} finally { page.close(); chrome.kill(); }
process.exit(0);
