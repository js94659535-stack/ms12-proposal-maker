// 검증·코칭 입력칸 높이를 실제 브라우저에서 확인한다.
// 빈칸 → 한 줄 → 긴 글 → 최대 높이 → 지우기 → 기본 높이 → 파일 불러오기 → 새로고침 복원.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const shots = scratch('textarea-shots');
fs.mkdirSync(shots, { recursive: true });
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };

const chrome = launch(scratch('textarea'), 9470);
const page = await attach(9470);
async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}
const box = id => page.run(`(() => {
  const el = document.querySelector('#${id}');
  if (!el) return JSON.stringify({ found: false });
  const style = getComputedStyle(el);
  return JSON.stringify({
    found: true, height: Math.round(el.getBoundingClientRect().height),
    scroll: el.scrollHeight, resize: style.resize, overflowY: style.overflowY, overflowX: style.overflowX,
    limit: Math.round(Math.min(window.innerHeight * 0.45, 480)),
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  });
})()`);
const type = (id, value) => page.run(`(() => {
  const el = document.querySelector('#${id}');
  if (!el) return '0';
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return '1';
})()`, 350);

try {
  await page.size(1280, 800);
  await page.go(SITE, 2500);
  await page.run("(() => { localStorage.clear(); sessionStorage.clear(); return '1'; })()");
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 1800);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
  // 검증·코칭 화면으로 들어간다.
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool='coaching'; s.expertDetail=true; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 4000);

  const long = '방과후 돌봄이 끊긴 초등 저학년 아동을 위해 주 2회 학습·정서 프로그램을 운영합니다. '.repeat(60);
  for (const id of ['coaching-text', 'coaching-criteria']) {
    const empty = await box(id);
    record(1, `${id} 빈칸 높이`, empty?.found === true && empty.height <= 110, `${empty?.height}px · 손잡이 ${empty?.resize}`);

    await type(id, '한 줄만 적습니다.');
    const one = await box(id);
    record(2, `${id} 한 줄`, one.height <= 110, `${one.height}px`);

    await type(id, long);
    const full = await box(id);
    record(3, `${id} 긴 글 → 최대 높이`, full.height <= full.limit + 2 && full.overflowY === 'auto',
      `${full.height}px / 한계 ${full.limit}px · 세로스크롤 ${full.overflowY} · 가로 ${full.overflowX}`);
    record(4, `${id} 가로 넘침 없음`, full.pageOverflow === false, `넘침 ${full.pageOverflow}`);

    await type(id, '');
    const cleared = await box(id);
    record(5, `${id} 지우면 기본 높이 복귀`, cleared.height <= 110, `${cleared.height}px`);
  }
  await shot('coaching-1280');

  // 보관함에서 현재 계획서를 불러온 뒤에도 높이를 다시 잰다.
  await type('coaching-text', long);
  await page.go(SITE, 3500);
  const restored = await box('coaching-text');
  record(6, '새로고침 뒤에도 내용 길이에 맞춘다', restored.height > 110 && restored.height <= restored.limit + 2, `${restored.height}px`);

  for (const [width, height] of [[1280, 800], [768, 1024], [360, 640]]) {
    await page.size(width, height);
    await page.go(SITE, 3000);
    const view = await box('coaching-text');
    await shot(`size-${width}`);
    record(7, `${width}×${height}`, view.pageOverflow === false, `높이 ${view.height}px · 한계 ${view.limit}px · 가로넘침 ${view.pageOverflow}`);
  }
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
console.log(failures ? `\n실패 ${failures}건` : '\n입력칸 높이 확인 통과');
process.exit(0);
