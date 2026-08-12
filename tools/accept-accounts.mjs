// 수용검사용 시험계정 만들기. 운영 화면의 실제 가입 절차를 그대로 쓴다.
// 만드는 계정에는 E2E-SIMPLE-FLOW 표식을 붙이고 끝나면 지운다. 기존 회원은 건드리지 않는다.
import fs from 'node:fs';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

export const MARK = 'E2E-SIMPLE-FLOW';
const stamp = process.argv[2] || 'a1';
const ROLES = (process.argv[3] || 'customer,agency,operator,admin').split(',');

const accounts = ROLES.map(role => ({
  role,
  email: `e2e-simple-${role}-${stamp}@ms12.test`,
  password: `Ms12-simple-${stamp}-${role}-ok`,
  name: `${MARK} ${role}`,
  phone: '010-0000-0000',
  org: `${MARK} 햇살지역아동센터`
}));

fs.mkdirSync(scratch('.'), { recursive: true });
const file = scratch('accept-accounts.json');
const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const merged = [...before.filter(item => !ROLES.includes(item.role)), ...accounts];
fs.writeFileSync(file, JSON.stringify(merged, null, 1));

const chrome = launch(scratch('accept-signup'), 9410);
const page = await attach(9410);
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };

try {
  await page.size(1280, 800);
  for (const [index, account] of accounts.entries()) {
    // 계정마다 브라우저 저장소를 비운다. 앞 계정의 세션이 남지 않게 한다.
    await page.go(SITE, 2500);
    await page.run("(() => { localStorage.clear(); sessionStorage.clear(); return '1'; })()");
    await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
    await page.go(SITE, 3500);

    await page.click('[data-landing="signup"]', 1800);
    if (!(await page.run("(() => JSON.stringify({ hit: !!document.querySelector('#login-password-confirm') }))()"))?.hit) {
      await page.click('#mode-signup', 1500);
    }
    await page.fill('#login-email', account.email);
    await page.fill('#login-password', account.password);
    await page.fill('#login-password-confirm', account.password);
    await page.click('#login-submit', 6000);

    const onProfile = await page.run("(() => JSON.stringify({ hit: !!document.querySelector('#profile-submit') }))()");
    if (onProfile?.hit) {
      await page.fill('#profile-name', account.name);
      await page.fill('#profile-phone', account.phone);
      await page.fill('#profile-org', account.org);
      await page.fill('#profile-contact', 'yes');
      await page.check('#agree-terms', true);
      await page.check('#agree-privacy', true);
      await page.click('#profile-submit', 5000);
    }
    const view = await page.snapshot();
    const waiting = /승인 대기|가입 신청/.test(`${view?.status} ${view?.heading} ${view?.notice}`);
    record(index + 1, `가입 신청 (${account.role})`, waiting || onProfile?.hit === true, `${account.email} · ${view?.heading || view?.status || ''}`);
  }
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
console.log(failures ? `\n실패 ${failures}건` : '\n시험계정 가입 신청 완료');
process.exit(0);
