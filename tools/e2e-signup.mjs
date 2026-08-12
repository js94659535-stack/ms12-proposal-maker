// 1~3단계: 랜딩 → 회원가입 → 가입정보·동의 → 승인 대기 화면.
// 운영 화면을 그대로 쓴다. 만드는 계정에는 E2E-TEST 표식을 붙인다.
import fs from 'node:fs';
import { MARK, SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const stamp = process.argv[2] || '00000';
const account = {
  email: `e2e-test-${stamp}@ms12.test`,
  password: `Ms12-e2e-${stamp}-check`,
  name: `${MARK} 담당자`,
  phone: '010-0000-0000',
  org: `${MARK} 햇살지역아동센터`
};
fs.mkdirSync(scratch('.'), { recursive: true });
fs.writeFileSync(scratch('account.json'), JSON.stringify(account, null, 1));
console.log('시험계정:', account.email);

const chrome = launch(scratch('profile'), 9340);
const page = await attach(9340);
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };

try {
  await page.size(1280, 800);

  // 1. 랜딩페이지 → 회원가입
  await page.go(SITE, 4000);
  const landing = await page.snapshot();
  record(1, '랜딩페이지 표시', Boolean(landing?.heading), landing?.heading);
  await page.click('[data-landing="signup"]', 1800);
  let form = await page.snapshot();
  if (!form?.buttons?.some(item => item.id === 'login-submit')) {
    await page.click('#mode-signup', 1500);
    form = await page.snapshot();
  }
  record(1, '회원가입 화면 진입', Boolean(form?.buttons?.some(item => item.id === 'login-submit')), form?.heading);

  // 2. 가입정보 입력
  await page.fill('#login-email', account.email);
  await page.fill('#login-password', account.password);
  await page.fill('#login-password-confirm', account.password);
  const submitted = await page.click('#login-submit', 6000);
  record(2, '가입 신청 제출', submitted?.ok === true);

  // 가입 직후에는 가입정보 화면이 나온다.
  const afterSignup = await page.snapshot();
  const onProfile = Boolean(afterSignup?.buttons?.some(item => item.id === 'profile-submit'));
  record(2, '가입정보 입력 화면 도달', onProfile, afterSignup?.heading || afterSignup?.error);

  if (onProfile) {
    await page.fill('#profile-name', account.name);
    await page.fill('#profile-phone', account.phone);
    await page.fill('#profile-org', account.org);
    await page.fill('#profile-contact', 'yes');
    await page.check('#agree-terms', true);
    await page.check('#agree-privacy', true);
    const saved = await page.click('#profile-submit', 5000);
    record(2, '가입정보·동의 저장', saved?.ok === true);
  }

  // 3. 승인 대기 화면
  const pending = await page.snapshot();
  const waiting = /승인 대기/.test(`${pending?.status} ${pending?.heading} ${pending?.notice}`);
  record(3, '승인 대기 화면 확인', waiting, `${pending?.heading} · ${pending?.status}`);

  // 승인 전에는 작업 화면이 열리지 않아야 한다. 서버 차단이 유지되는지 본다.
  const blocked = await page.run(`(async () => {
    const response = await fetch('/api/archive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listProposals' })
    });
    return JSON.stringify({ status: response.status });
  })()`);
  record(3, '승인 전 작업 API 차단 유지', blocked?.status === 403 || blocked?.status === 401, `HTTP ${blocked?.status}`);

  // 세 크기에서 승인 대기 화면이 깨지지 않는지 본다.
  for (const [width, height] of [[1280, 800], [768, 1024], [360, 640]]) {
    await page.size(width, height);
    await page.go(SITE, 3000);
    const view = await page.snapshot();
    record(3, `승인 대기 화면 ${width}×${height}`, view?.overflow === false, view?.overflow ? '가로 넘침' : '정상');
  }
} finally {
  page.close();
  chrome.kill();
}
console.log(failures ? `\n실패 ${failures}건` : '\n1~3단계 통과');
process.exit(failures ? 1 : 0);
