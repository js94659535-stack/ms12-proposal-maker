// 핵심 아이디어 입력칸 높이 확인. 데스크톱·모바일에서 최초 높이·자동 확장·삭제 후 축소를 잰다.
//
// 시험 계정으로만 로그인한다. 운영 회원 자료는 건드리지 않는다. AI는 부르지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const label = process.argv[3] || 'before';
const shots = scratch('idea-shots');
fs.mkdirSync(shots, { recursive: true });

const child = launch(scratch('idea-profile'), 9346);
const page = await attach(9346);

async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}

// 칸 높이와 화면 높이를 함께 잰다. 「빈 공간이 과한지」는 비율로 봐야 안다.
const measure = () => page.run(`(() => {
  const el = document.querySelector('#core-idea');
  if (!el) return JSON.stringify({ ok: false });
  const box = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return JSON.stringify({
    ok: true,
    height: Math.round(box.height),
    viewport: window.innerHeight,
    ratio: Math.round((box.height / window.innerHeight) * 100),
    scrollHeight: el.scrollHeight,
    clipped: el.scrollHeight > Math.ceil(box.height) + 1,
    overflowY: style.overflowY,
    minHeight: style.minHeight
  });
})()`);

async function signIn() {
  await page.go(SITE, 2500);
  await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 1500);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1200);
  return page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
}

const LONG = Array.from({ length: 14 }, (_, index) => `${index + 1}번째 줄입니다. 초등 4~6학년 정서지원 집단 프로그램을 주 1회 16회기로 운영하며 보호자 상담을 함께 합니다.`).join('\n');
const report = {};

console.log('로그인', await signIn());
for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  await page.size(width, height);
  await page.go(SITE, 3000);
  report[name] = {};
  report[name].empty = await measure();
  await shot(`${label}-${name}-empty`);

  await page.fill('#core-idea', LONG, 600);
  report[name].filled = await measure();
  await shot(`${label}-${name}-filled`);

  await page.fill('#core-idea', '', 600);
  report[name].cleared = await measure();
  await shot(`${label}-${name}-cleared`);
}
console.log(JSON.stringify(report, null, 1));
fs.writeFileSync(path.join(shots, `${label}.json`), JSON.stringify(report, null, 1));
child.kill();
process.exit(0);
