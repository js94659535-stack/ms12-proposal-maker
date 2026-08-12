// 「0. 공고 준비」 화면을 실제 브라우저로 그려 영역별 높이를 잰다.
// 소스 문자열이 아니라 계산된 상자 크기를 본다. 운영과 같은 dist 번들을 그대로 띄운다.
//
//   npm run build
//   node tools/step0-density.mjs
//   node tools/step0-density.mjs --files   (업로드한 파일이 있는 상태로)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SIZES = [[1280, 800], [768, 1024], [360, 640]];
const PORT = 8792;
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(file => fs.existsSync(file));

const USER = { id: 'step0-density', email: 'density@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' };
const EMPTY = { notices: [], proposals: [], applicants: [], accounts: [], items: [], events: [], profile: {} };
const withFiles = process.argv.includes('--files');

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
      const seed = `<script>localStorage.setItem('ms12_project_v3', ${JSON.stringify(JSON.stringify(baseState))});</script>`;
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
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
  const round = value => Math.round(value);
  const box = selector => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { h: round(rect.height), w: round(rect.width) };
  };
  const cards = [...document.querySelectorAll('.source-grid > .card')].map(el => round(el.getBoundingClientRect().height));
  const routes = [...document.querySelectorAll('.stage-route')].map(el => {
    const rect = el.getBoundingClientRect();
    return { h: round(rect.height), w: round(rect.width), top: round(rect.top) };
  });
  const badges = [...document.querySelectorAll('.stat-badge')].map(el => {
    const rect = el.getBoundingClientRect();
    return { h: round(rect.height), w: round(rect.width), top: round(rect.top) };
  });
  const manual = document.querySelector('#manual-sources');
  // 한글이 한 글자씩 끊기는지. 글자 노드에 Range를 걸어 실제 줄 수를 센다.
  const lines = el => {
    const node = [...el.childNodes].find(child => child.nodeType === 3 && child.textContent.trim());
    if (!node) return 1;
    const range = document.createRange();
    range.selectNodeContents(node);
    return Math.max(1, range.getClientRects().length);
  };
  const narrow = [...document.querySelectorAll('.stat-badge span, .stat-badge strong, .stage-route strong, .card-title h3')]
    .map(el => ({ text: (el.textContent || '').trim().slice(0, 12), chars: (el.textContent || '').replace(/\\s/g, '').length, lines: lines(el) }))
    .filter(item => item.chars >= 3 && item.chars / item.lines < 2.5);
  const scroller = el => {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowX;
      if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') return true;
    }
    return false;
  };
  const wide = [...document.querySelectorAll('body *')]
    .filter(el => { const rect = el.getBoundingClientRect(); return (rect.width || rect.height) && (rect.right > view + 1 || rect.left < -1) && !scroller(el); })
    .slice(0, 5).map(el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + '@' + round(el.getBoundingClientRect().right));
  const fold = document.querySelector('#archive-box');
  // 어떤 선언이 실제로 이겼는지. 뒤에 온 무조건 규칙이 앞의 미디어쿼리를 덮는지 확인한다.
  const heroEl = document.querySelector('.stage-hero');
  const heroStyle = heroEl ? (s => ({ ml: s.marginLeft, mb: s.marginBottom, pt: s.paddingTop, pb: s.paddingBottom }))(getComputedStyle(heroEl)) : null;
  // 화면 안에 들어오는 세로 구간을 알기 위해 문서 기준 위치도 같이 낸다.
  const top = selector => { const el = document.querySelector(selector); return el ? round(el.getBoundingClientRect().top + window.scrollY) : null; };
  return JSON.stringify({
    heroStyle,
    tops: { hero: top('.stage-hero'), fetch: top('.dense-step > .card'), source: top('.source-grid'), manual: top('#manual-sources'), archive: top('#archive-box'), badges: top('.stat-badges') },
    view, scrollWidth: document.documentElement.scrollWidth,
    hero: box('.stage-hero'),
    routes, routeRows: new Set(routes.map(r => r.top)).size,
    fetchCard: box('.dense-step > .card'),
    sourceCards: cards, sourceGap: cards.length === 2 ? Math.abs(cards[0] - cards[1]) : null,
    dropzone: box('.dropzone'), textarea: box('.source-text'),
    manual: manual ? { open: manual.hasAttribute('open'), h: round(manual.getBoundingClientRect().height) } : null,
    badges, badgeRows: new Set(badges.map(b => b.top)).size,
    badgeBoxH: box('.stat-badges')?.h ?? null,
    // 현황 배지 아래 첫 도구줄까지가 화면 안에 들어오는지
    badgesBottom: badges.length ? round(Math.max(...badges.map(b => b.top + b.h))) : null,
    archiveOpen: fold ? fold.hasAttribute('open') : null,
    narrow, wide
  });
})()`;

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 0;
// 실제로 쓰던 계정처럼 자료가 든 상태. 빈 화면만 재면 「빈 공간이 넓다」는 증상을 못 본다.
async function sampleState() {
  const { SAMPLE_APPLICANTS, buildSampleProject, sampleProposalSnapshot } = await import(new URL('../src/sample-project.js', import.meta.url));
  return { ...sampleProposalSnapshot(buildSampleProject()), applicants: SAMPLE_APPLICANTS };
}
const state = {
  ...(process.argv.includes('--sample') ? await sampleState() : {}),
  activeTool: 'workflow', homeSeen: true, portal: 'proposal', step: 0,
  ...(withFiles ? {
    files: [{ name: '2026-공모-안내문.pdf', type: 'PDF', characters: 18342, text: '샘플' }],
    manualSources: [{ id: 'm1', title: '기관 소개서', type: 'DOCX', characters: 4210, text: '샘플' }]
  } : {})
};
const server = serve(state);
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

let chrome = null;
let debugPort = port;
if (!port) {
  if (!CHROME) { console.error('크롬이나 엣지를 찾지 못했습니다.'); process.exit(2); }
  debugPort = 9334;
  chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(ROOT, 'node_modules', '.cache', 'step0-density')}`, 'about:blank'], { stdio: 'ignore' });
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
// --live: 로컬 dist가 아니라 실제 운영 화면을 그린다.
// 정적 자산만 운영에서 받고 /api/ 요청은 보내기 전에 가로채 가짜로 답한다. 운영 자료는 건드리지 않는다.
const live = process.argv.includes('--live');
if (live) {
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('ms12_project_v3', ${JSON.stringify(JSON.stringify(state))}); } catch (error) { /* 무시 */ }`
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  ws.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.method !== 'Fetch.requestPaused') return;
    const post = message.params.request.postData || '{}';
    const answer = /"action"\s*:\s*"me"/.test(post) ? { user: USER } : EMPTY;
    await send('Fetch.fulfillRequest', {
      requestId: message.params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'content-type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(answer)).toString('base64')
    });
  });
}
for (const [width, height] of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
  await send('Page.navigate', { url: live ? 'https://pro.ms12.org/' : `http://127.0.0.1:${PORT}/` });
  await new Promise(resolve => setTimeout(resolve, 4000));
  const result = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
  console.log(`### ${width}×${height}${withFiles ? ' (자료 있음)' : ''}`);
  console.log(result.result?.result?.value || JSON.stringify(result));
}
ws.close();
server.close();
chrome?.kill();
process.exit(0);
