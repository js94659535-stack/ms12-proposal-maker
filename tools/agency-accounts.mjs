// 대행회원 확인용 시험계정을 운영 화면의 가입 절차로 만든다.
// 표식은 E2E-AGENCY. 확인이 끝나면 지운다. 운영 회원은 건드리지 않는다.
import fs from 'node:fs';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const MARK = 'E2E-AGENCY';
const stamp = process.argv[2] || 'v1';
const roles = (process.argv[3] || 'admin,operator,customer,other').split(',');
const accounts = roles.map(role => ({
  role,
  email: `e2e-agency-${role}-${stamp}@ms12.test`,
  password: `Ms12-agency-${stamp}-${role}-ok`,
  name: `${MARK} ${role}`,
  phone: '010-0000-0000',
  org: `${MARK} 시험기관`
}));

fs.mkdirSync(scratch('.'), { recursive: true });
const file = scratch('agency-accounts.json');
const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
fs.writeFileSync(file, JSON.stringify([...before.filter(item => !roles.includes(item.role)), ...accounts], null, 1));

const chrome = launch(scratch('agency-signup'), 9455);
const page = await attach(9455);
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };

try {
  await page.size(1280, 800);
  for (const [index, account] of accounts.entries()) {
    await page.go(SITE, 2500);
    await page.run("(() => { localStorage.clear(); sessionStorage.clear(); return '1'; })()");
    await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 700);
    await page.go(SITE, 3500);
    await page.click('[data-landing="signup"]', 1800);
    if (!(await page.run("(() => JSON.stringify({ hit: !!document.querySelector('#login-password-confirm') }))()"))?.hit) {
      await page.click('#mode-signup', 1500);
    }
    await page.fill('#login-email', account.email);
    await page.fill('#login-password', account.password);
    await page.fill('#login-password-confirm', account.password);
    await page.click('#login-submit', 6000);
    const onProfile = await page.run("(() => JSON.stringify({ hit: !!document.querySelector('#profile-submit'), error: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,60) }))()");
    if (onProfile?.hit) {
      await page.fill('#profile-name', account.name);
      await page.fill('#profile-phone', account.phone);
      await page.fill('#profile-org', account.org);
      await page.fill('#profile-contact', 'yes');
      await page.check('#agree-terms', true);
      await page.check('#agree-privacy', true);
      await page.click('#profile-submit', 5000);
    }
    record(index + 1, `가입 (${account.role})`, onProfile?.hit === true, `${account.email}${onProfile?.error ? ' · ' + onProfile.error : ''}`);
  }
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
console.log(failures ? `\n실패 ${failures}건` : '\n시험계정 가입 완료');
process.exit(0);
