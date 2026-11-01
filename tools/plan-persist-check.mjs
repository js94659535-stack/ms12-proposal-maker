// 사용: node tools/plan-persist-check.mjs — /plan/ 저장 시나리오를 헤드리스 Chrome으로 돈다(11-12, 돈 안 듦). 결과는 화면에, 사진은 임시 폴더에(마지막 줄).
// /plan/ 저장 시나리오(11-12): 고르고·채우고·답하고·옮기기 → 새로고침 후 다시 올리면 남아 있나 → 다른 공고면 빈 칸인가
// → 저장소를 지우고 내보낸 파일로 되살리기 → 저장이 막힌 브라우저.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import os from 'node:os';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
// 브라우저 프로필·임시 파일은 시스템 임시 폴더에 — 저장소를 어지르지 않는다.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ms12-persist-'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let file = path.join(repo, 'public', decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(8792);
const profile = path.join(scratch, 'chrome-persist');
fs.rmSync(profile, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${profile}`, '--window-size=1280,2400', 'about:blank']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch('http://127.0.0.1:9334/json')).json()).find(entry => entry.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.onopen = resolve);
let id = 0; const waiting = new Map();
ws.onmessage = event => { const msg = JSON.parse(event.data); if (waiting.has(msg.id)) { waiting.get(msg.id)(msg.result); waiting.delete(msg.id); } };
const send = (method, params = {}) => new Promise(resolve => { id += 1; waiting.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; };
await send('Page.enable'); await send('DOM.enable'); await send('Runtime.enable');
const win = file => path.resolve(file).replace(/\//g, '\\');
const upload = async (selector, files) => {
  const { root } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
  await send('DOM.setFileInputFiles', { nodeId, files });
  await sleep(1200);
};
const notice = win(`${repo}/test/fixtures/rfp-unification-2027.txt`);
const project = win(`${repo}/reports/10-05-unification/project.json`);
const dir = `${repo}/reports/11-10-tidy`;
const drafts = [...fs.readdirSync(dir).filter(name => /^(draft|submit)_/.test(name)).map(name => win(`${dir}/${name}`)),
  ...fs.readdirSync(`${repo}/reports/11-09-full`).filter(name => /^checks_[ⅠⅡⅢⅣⅤ]\./.test(name)).map(name => win(`${repo}/reports/11-09-full/${name}`))];
const open = async () => {
  await send('Page.navigate', { url: 'http://127.0.0.1:8792/plan/' }); await sleep(1500);
  await upload('#noticeFile', [notice, project]); await upload('#draftFile', drafts);
  await ev(`(async () => { [...document.querySelectorAll('#toc button')].find(x => x.dataset.key === 'Ⅱ').click(); await new Promise(r => setTimeout(r, 300)); })()`);
};
const look = () => ev(`JSON.stringify({
  save: document.getElementById('saveText')?.textContent,
  done: document.querySelectorAll('#choose .grp.done').length,
  value: document.querySelector('#choose input[data-value]')?.value,
  answer: document.querySelector('input[data-answer="roles"]')?.value,
  moved: [...document.querySelectorAll('#choose .grp .top span')].some(x => x.textContent.includes('사람이 약속으로 옮긴 줄')),
  next: document.querySelector('#next span')?.textContent,
  steps: [...document.querySelectorAll('.step span')].map(x => x.textContent).join(' | ')
})`);
const log = (label, value) => console.log(label.padEnd(22), value);

// 1) 고르고·채우고·답하고·옮긴다
await open();
log('처음', await look());
await ev(`(async () => {
  const tick = () => new Promise(r => setTimeout(r, 150));
  document.querySelector('#choose [data-ok]').click(); await tick();
  const v = document.querySelector('#choose input[data-value]'); v.value = '화·목 오후, 연 4기, 기수당 8회'; v.dispatchEvent(new Event('input')); v.dispatchEvent(new Event('change')); await tick();
  const a = document.querySelector('input[data-answer="roles"]'); a.value = '주관: 상담·총괄 / 가르침에듀: 교육과정'; a.dispatchEvent(new Event('input')); a.dispatchEvent(new Event('change')); await tick();
  const m = [...document.querySelectorAll('#choose [data-move]')].find(b => b.dataset.text.startsWith('인력 변경')); m.click(); await tick();
})()`);
log('고른 뒤', await look());
const stored = await ev(`JSON.stringify(Object.keys(localStorage).map(k => [k, JSON.parse(localStorage.getItem(k))]))`);
fs.writeFileSync(path.join(scratch, 'stored.json'), stored);
log('저장소', JSON.parse(stored).map(([k, v]) => `${k} choices ${Object.keys(v.choices).length} values ${Object.keys(v.values).length} answers ${Object.keys(v.answers).length} moved ${Object.keys(v.moved).length}`).join(' / '));

// 2) 새로고침 → 같은 파일을 다시 올리면 남아 있나
await open();
log('새로고침 뒤', await look());

// 3) 다른 공고(글자가 다르다) → 빈 칸
await send('Page.navigate', { url: 'http://127.0.0.1:8792/plan/' }); await sleep(1500);
const other = path.join(scratch, 'other-notice.txt');
fs.writeFileSync(other, `${fs.readFileSync(`${repo}/test/fixtures/rfp-unification-2027.txt`, 'utf8')}\n(다른 공고로 친다)`);
await upload('#noticeFile', [win(other), project]); await upload('#draftFile', drafts);
await ev(`(async () => { [...document.querySelectorAll('#toc button')].find(x => x.dataset.key === 'Ⅱ').click(); await new Promise(r => setTimeout(r, 300)); })()`);
log('다른 공고', await look());

// 4) 저장소를 지우고, 내보낸 파일로 되살린다
const [[key, saved]] = JSON.parse(stored);
const exported = path.join(scratch, 'exported.json');
fs.writeFileSync(exported, JSON.stringify({ kind: 'ms12-plan-choices', version: 1, key, notice: '통일부', ...saved }));
await ev(`localStorage.clear()`);
await open();
log('지운 뒤', await look());
await upload('#importFile', [win(exported)]);
log('불러온 뒤', await look());

// 5) 저장이 막힌 브라우저
await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('막힘', 'SecurityError'); } });` });
await open();
await ev(`(async () => { document.querySelector('#choose [data-ok]').click(); await new Promise(r => setTimeout(r, 200)); })()`);
log('막힌 브라우저', await look());
const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1280, height: 900, scale: 1 } });
fs.writeFileSync(path.join(scratch, 'blocked.png'), Buffer.from(shot.data, 'base64'));
console.log('사진', path.join(scratch, 'blocked.png'));
ws.close(); chrome.kill(); server.close();
