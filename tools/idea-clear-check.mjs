// 핵심 아이디어 칸: 빈칸 → 14줄 입력 → 전체 삭제. 실제 자판으로 넣고 지우며 높이를 잰다.
//
// 값을 코드로 밀어 넣으면 사람이 치는 것과 다른 길을 탈 수 있다. 그래서 여기서는
// Input.insertText로 넣고 Ctrl+A · Backspace로 지운다. 시험 계정으로만 한다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const label = process.argv[3] || 'clear';
const shots = scratch('idea-shots');
fs.mkdirSync(shots, { recursive: true });

const child = launch(scratch('idea-profile2'), 9348);
const page = await attach(9348);

const LINES = 14;
const TEXT = Array.from({ length: LINES }, (_, index) =>
  `${index + 1}번째 줄입니다. 초등 4~6학년 정서지원 집단 프로그램을 주 1회 16회기로 운영하며 보호자 상담을 함께 합니다.`).join('\n');

async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}

const measure = () => page.run(`(() => {
  const el = document.querySelector('#core-idea');
  if (!el) return JSON.stringify({ ok: false });
  const box = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return JSON.stringify({
    ok: true,
    height: Math.round(box.height),
    inline: el.style.height || '(없음)',
    minHeight: style.minHeight,
    chars: el.value.length,
    scrollHeight: el.scrollHeight,
    overflowY: style.overflowY,
    viewport: window.innerHeight,
    ratio: Math.round((box.height / window.innerHeight) * 100)
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

const focusIdea = () => page.run("(() => { const el = document.querySelector('#core-idea'); if (!el) return '0'; el.focus(); el.scrollIntoView({ block: 'center' }); return '1'; })()", 300);
const type = async value => { await page.send('Input.insertText', { text: value }); await new Promise(resolve => setTimeout(resolve, 500)); };
// 사람이 지우는 것과 같은 길로 지운다. 전체 선택 후 지우기.
async function clearByKeyboard() {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
  await new Promise(resolve => setTimeout(resolve, 600));
}

console.log('로그인', await signIn());
const report = {};
for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  await page.size(width, height);
  await page.go(SITE, 3000);
  await focusIdea();
  report[name] = { '1_빈칸': await measure() };
  await shot(`${label}-${name}-1-empty`);

  await type(TEXT);
  report[name]['2_14줄'] = await measure();
  await shot(`${label}-${name}-2-filled`);

  await clearByKeyboard();
  report[name]['3_전체삭제'] = await measure();
  await shot(`${label}-${name}-3-cleared`);
}
console.log(JSON.stringify(report, null, 1));
fs.writeFileSync(path.join(shots, `${label}.json`), JSON.stringify(report, null, 1));
child.kill();
process.exit(0);
