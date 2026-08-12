// 실제 브라우저로 운영 화면을 끝까지 걸어 보는 도구. 시험용이며 npm test에는 넣지 않는다.
// 시험자료에는 반드시 E2E-TEST 표식을 붙이고, 끝나면 지운다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const MARK = 'E2E-TEST';
export const SITE = 'https://pro.ms12.org';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(file => fs.existsSync(file));

// 쿠키를 단계 사이에 유지하려고 프로필 폴더를 고정한다.
export function launch(profileDir, port = 9340) {
  if (!CHROME) throw new Error('브라우저를 찾지 못했습니다.');
  fs.mkdirSync(profileDir, { recursive: true });
  return spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore' });
}

export async function attach(port = 9340) {
  let socketUrl = '';
  for (let attempt = 0; attempt < 60 && !socketUrl; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      socketUrl = targets.find(target => target.type === 'page')?.webSocketDebuggerUrl || '';
    } catch { /* 아직 */ }
    if (!socketUrl) await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!socketUrl) throw new Error('브라우저 디버깅 포트에 붙지 못했습니다.');

  const ws = new WebSocket(socketUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  // 응답이 오지 않으면 영원히 매달린다. 시간제한을 둔다.
  const send = (method, params = {}, timeoutMs = 30000) => new Promise(resolve => {
    const next = ++id;
    const timer = setTimeout(() => { pending.delete(next); resolve({ timedOut: true }); }, timeoutMs);
    pending.set(next, value => { clearTimeout(timer); resolve(value); });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');

  const api = {
    send, ws,
    async size(width, height) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    },
    async go(url, wait = 3500) {
      await send('Page.navigate', { url });
      await new Promise(resolve => setTimeout(resolve, wait));
    },
    async run(expression, wait = 0) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      const value = result.result?.result?.value;
      const thrown = result.result?.exceptionDetails?.exception?.description;
      if (thrown) return { error: String(thrown).slice(0, 200) };
      try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return value; }
    },
    // 값을 넣고 앱이 알아채도록 input 이벤트를 함께 보낸다.
    async fill(selector, value, wait = 250) {
      return api.run(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return JSON.stringify({ ok: false });
        const setter = Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
        setter.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return JSON.stringify({ ok: true });
      })()`, wait);
    },
    async check(selector, on = true, wait = 200) {
      return api.run(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return JSON.stringify({ ok: false });
        if (el.checked !== ${on}) el.click();
        return JSON.stringify({ ok: true, checked: el.checked });
      })()`, wait);
    },
    async click(selector, wait = 2500) {
      return api.run(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return JSON.stringify({ ok: false });
        el.click();
        return JSON.stringify({ ok: true, disabled: !!el.disabled, blocked: el.dataset?.blocked || '' });
      })()`, wait);
    },
    // 글자로 버튼을 찾아 누른다. id가 없는 버튼용.
    async clickText(text, wait = 2500) {
      return api.run(`(() => {
        const el = [...document.querySelectorAll('button, a.button')].find(item => (item.textContent || '').includes(${JSON.stringify(text)}));
        if (!el) return JSON.stringify({ ok: false });
        el.click();
        return JSON.stringify({ ok: true, text: (el.textContent || '').trim().slice(0, 24), disabled: !!el.disabled, blocked: el.dataset?.blocked || '' });
      })()`, wait);
    },
    // 화면 상태 요약. 제목·안내·보이는 버튼만 본다.
    async snapshot() {
      return api.run(`(() => {
        const text = selector => (document.querySelector(selector)?.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120);
        return JSON.stringify({
          heading: text('h1, h2, h3'),
          status: text('.status'),
          notice: text('.alert.success'),
          warning: text('.alert.warning'),
          error: text('.alert.danger'),
          buttons: [...document.querySelectorAll('button')].slice(0, 14).map(el => ({
            id: el.id || '', label: (el.textContent || '').trim().slice(0, 16), off: !!el.disabled, guide: (el.dataset?.blocked || '').slice(0, 30)
          })),
          url: location.href.replace(location.origin, ''),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        });
      })()`);
    },
    async waitFor(expression, timeoutMs = 180000, everyMs = 2000) {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        const hit = await api.run(`(() => JSON.stringify({ hit: !!(${expression}) }))()`);
        if (hit?.hit) return true;
        await new Promise(resolve => setTimeout(resolve, everyMs));
      }
      return false;
    },
    close() { ws.close(); }
  };
  return api;
}

export function step(no, label, ok, detail = '') {
  console.log(`${String(no).padStart(2)} ${ok ? '성공' : '실패'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

export const scratch = name => path.join(process.env.TEMP || '/tmp', 'ms12-e2e', name);
