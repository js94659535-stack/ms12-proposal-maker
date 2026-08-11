// 실제 브라우저로 작업 화면 여섯 곳의 가로 넘침을 재어 본다.
// npm test에는 넣지 않는다. 크롬이 있어야 하고 화면을 실제로 그려야 하기 때문이다.
//
//   npm run build
//   node tools/layout-smoke.mjs            (크롬 자동 실행)
//   node tools/layout-smoke.mjs --port 9222 (이미 띄운 크롬에 붙기)
//
// 표처럼 가로폭이 필요한 요소는 자체 스크롤 상자 안에 있으므로 넘침으로 세지 않는다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SIZES = [[1280, 800], [768, 1024], [360, 640]];
const STEPS = ['공고 준비', '공고 분석', '신청기관 준비', '사업 설계', '계획서 작성', '검토·제출'];
const PORT = 8791;
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(file => fs.existsSync(file));

// 작업 화면은 로그인해야 보인다. 세션 확인에만 가짜로 답하고 운영 서버는 부르지 않는다.
const USER = { id: 'layout-smoke', email: 'smoke@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' };
const EMPTY = { notices: [], proposals: [], applicants: [], accounts: [], items: [], events: [], profile: {} };

async function readState() {
  const { SAMPLE_APPLICANTS, buildSampleProject, sampleProposalSnapshot } = await import(new URL('../src/sample-project.js', import.meta.url));
  return { ...sampleProposalSnapshot(buildSampleProject()), applicants: SAMPLE_APPLICANTS, activeTool: 'workflow', homeSeen: true, portal: 'proposal' };
}

function serve(baseState) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || '{}');
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(url.pathname === '/api/auth' && body.action === 'me' ? { user: USER } : EMPTY));
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const state = { ...baseState, step: Number(url.searchParams.get('step') || 0) };
      const seed = `<script>localStorage.setItem('ms12_project_v3', ${JSON.stringify(JSON.stringify(state))});</script>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').replace('</head>', `${seed}</head>`));
    }
    const file = path.join(DIST, url.pathname);
    if (!file.startsWith(DIST) || !fs.existsSync(file)) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

async function connect(port) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find(target => target.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 아직 안 떴다 */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('크롬 디버깅 포트에 붙지 못했습니다.');
}

const MEASURE = `(() => {
  const view = document.documentElement.clientWidth;
  const scroller = el => {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowX;
      if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') return true;
    }
    return false;
  };
  const wide = [...document.querySelectorAll('body *')]
    .filter(el => { const box = el.getBoundingClientRect(); return (box.width || box.height) && (box.right > view + 1 || box.left < -1) && !scroller(el); })
    .slice(0, 5)
    .map(el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + '@' + Math.round(el.getBoundingClientRect().right));
  return JSON.stringify({ view, scrollWidth: document.documentElement.scrollWidth, workflow: !!document.querySelector('.workflow-header'), wide });
})()`;

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 0;
const state = await readState();
const server = serve(state);
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

let chrome = null;
let debugPort = port;
if (!port) {
  if (!CHROME) { console.error('크롬이나 엣지를 찾지 못했습니다. --port로 이미 띄운 브라우저에 붙여 주세요.'); process.exit(2); }
  debugPort = 9333;
  chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(ROOT, 'node_modules', '.cache', 'layout-smoke')}`, 'about:blank'], { stdio: 'ignore' });
}

const socketUrl = await connect(debugPort);
const ws = new WebSocket(socketUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));
let id = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});
const send = (method, params = {}) => new Promise(resolve => { const next = ++id; pending.set(next, resolve); ws.send(JSON.stringify({ id: next, method, params })); });

await send('Page.enable');
let failures = 0;
for (const [index, label] of STEPS.entries()) {
  for (const [width, height] of SIZES) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?step=${index}` });
    await new Promise(resolve => setTimeout(resolve, 4000));
    const result = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
    const measured = JSON.parse(result.result?.result?.value || '{}');
    const over = measured.scrollWidth > measured.view;
    if (over || !measured.workflow) failures += 1;
    console.log(`${label.padEnd(8)} ${String(width).padStart(4)}×${height}  가로 ${String(measured.scrollWidth).padStart(4)}/${String(measured.view).padStart(4)}  ${over ? '넘침 ' + measured.wide.join(', ') : '정상'}${measured.workflow ? '' : ' (작업 화면이 아님)'}`);
  }
}
ws.close();
server.close();
chrome?.kill();
console.log(failures ? `\n${failures}건 확인 필요` : '\n여섯 화면 × 세 크기 모두 가로 넘침 없음');
process.exit(failures ? 1 : 0);
