// 화면의 버튼을 실제로 눌러 본다. 회색으로 막힌 것과 눌러도 아무 일 없는 것을 찾는다.
//   npm run build && node tools/button-audit.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SIZES = [[1280, 800], [768, 1024], [360, 640]];
const PORT = 8794;
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(file => fs.existsSync(file));

// 역할별로 같은 화면을 본다. 서버 차단은 그대로 두고 화면 상태만 본다.
const ROLES = {
  pending: { id: 'u-pending', email: 'pending@example.com', role: 'customer', status: 'pending', plan: 'trial', provider: 'email' },
  member: { id: 'u-member', email: 'member@example.com', role: 'customer', status: 'active', plan: 'trial', provider: 'email' },
  full: { id: 'u-full', email: 'full@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' },
  operator: { id: 'u-op', email: 'op@example.com', role: 'operator', status: 'active', plan: 'full', provider: 'email' },
  admin: { id: 'u-admin', email: 'admin@example.com', role: 'admin', status: 'active', plan: 'full', provider: 'email' }
};
let CURRENT = ROLES.full;

function serve() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || '{}');
      const answer = url.pathname === '/api/auth' && body.action === 'me' ? { user: CURRENT }
        : { notices: [], proposals: [], applicants: [], accounts: [], users: [], items: [], events: [], profile: {}, memberProfile: {}, assets: [] };
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(answer));
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const step = Number(url.searchParams.get('step') || 0);
      const tool = url.searchParams.get('tool') || '';
      const state = { activeTool: tool, homeSeen: true, portal: 'proposal', step };
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find(target => target.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 아직 */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('브라우저에 붙지 못했습니다.');
}

// 화면의 모든 버튼을 살펴 회색으로 막힌 것과 그 이유를 센다.
const SURVEY = `(() => {
  const buttons = [...document.querySelectorAll('button')];
  const greyed = buttons.filter(el => el.disabled).map(el => ({
    id: el.id || '', text: (el.textContent || '').trim().slice(0, 20),
    // 처리 중이라 잠근 것인지 구분한다.
    // 처리 중이거나, 목록 경계·되돌릴 이력 없음·저장할 변경 없음처럼 뜻이 분명한 잠금은 정당하다.
    busy: /처리 중|저장 중|만드는 중|불러오는|중…/.test(el.textContent || '')
      || ['workflow-back', 'workflow-forward', 'member-save', 'archive-delete-selected'].includes(el.id)
      || /^(이전|다음)$/.test((el.textContent || '').trim())
  }));
  const guided = [...document.querySelectorAll('[data-blocked]')].map(el => ({
    id: el.id || '', text: (el.textContent || '').trim().slice(0, 20), reason: (el.dataset.blocked || '').slice(0, 40), goto: el.dataset.goto || ''
  }));
  return JSON.stringify({ total: buttons.length, greyed, guided });
})()`;

const server = serve();
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
if (!CHROME) { console.error('브라우저를 찾지 못했습니다.'); process.exit(2); }
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9337',
  `--user-data-dir=${path.join(ROOT, 'node_modules', '.cache', 'button-audit')}`, 'about:blank'], { stdio: 'ignore' });

const ws = new WebSocket(await connect(9337));
await new Promise(resolve => ws.addEventListener('open', resolve));
let id = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});
const send = (method, params = {}) => new Promise(resolve => { const next = ++id; pending.set(next, resolve); ws.send(JSON.stringify({ id: next, method, params })); });
const evaluate = async expression => JSON.parse((await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value || 'null');

await send('Page.enable');
const SCREENS = [
  ['공고 준비', '?step=0'], ['공고 분석', '?step=1'], ['신청기관 준비', '?step=2'],
  ['사업 설계', '?step=3'], ['계획서 작성', '?step=4'], ['검토·제출', '?step=5'],
  ['계정 설정', '?tool=account']
];

let problems = 0;
for (const [roleName, user] of Object.entries(ROLES)) {
  CURRENT = user;
  console.log(`\n=== ${roleName} (${user.role}/${user.status}/${user.plan}) ===`);
  for (const [label, query] of SCREENS) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${query}` });
    await new Promise(resolve => setTimeout(resolve, 2500));
    const survey = await evaluate(SURVEY);
    if (!survey) { console.log(`${label.padEnd(12)} 화면을 읽지 못함`); continue; }
    // 처리 중이 아닌데 회색인 버튼만 문제로 센다.
    const bad = survey.greyed.filter(item => !item.busy);
    if (bad.length) problems += bad.length;
    console.log(`${label.padEnd(12)} 버튼 ${String(survey.total).padStart(3)} · 안내 연결 ${String(survey.guided.length).padStart(2)} · 이유 없는 회색 ${bad.length}${bad.length ? ' → ' + bad.map(item => item.id || item.text).join(', ') : ''}`);
    if (survey.guided.length) for (const item of survey.guided) console.log(`${' '.repeat(14)}↳ ${item.id || item.text}: ${item.reason}${item.goto ? ` → ${item.goto}` : ''}`);
  }
}

// 세 크기에서 주요 버튼이 실제로 눌리는지 본다.
CURRENT = ROLES.full;
console.log('\n=== 화면 크기별 「AI와 함께 전체 계획서 작성」 ===');
for (const [width, height] of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?step=4` });
  await new Promise(resolve => setTimeout(resolve, 2500));
  const before = await evaluate(`(() => {
    const el = document.querySelector('#generate-proposal') || document.querySelector('#generate-parts');
    if (!el) return JSON.stringify({ found: false });
    return JSON.stringify({ found: true, id: el.id, disabled: el.disabled, blocked: el.dataset.blocked || '', goto: el.dataset.goto || '' });
  })()`);
  if (!before?.found) { console.log(`${width}×${height} 버튼 없음`); continue; }
  await send('Runtime.evaluate', { expression: "(document.querySelector('#generate-proposal') || document.querySelector('#generate-parts')).click()" });
  await new Promise(resolve => setTimeout(resolve, 1200));
  const after = await evaluate(`(() => {
    const alert = document.querySelector('.alert.success, .alert.warning, .alert.danger');
    return JSON.stringify({ moved: !!document.querySelector('#engagement-applicant, .engagement'), notice: (alert?.textContent || '').trim().slice(0, 46) });
  })()`);
  console.log(`${width}×${height}  회색=${before.disabled} · 안내="${before.blocked.slice(0, 28)}" → 클릭 후 ${after.moved ? '설계 화면으로 이동' : after.notice ? `안내: ${after.notice}` : '변화 없음'}`);
  if (before.disabled) problems += 1;
}

ws.close();
server.close();
chrome.kill();
console.log(problems ? `\n이유 없는 회색 버튼 ${problems}건` : '\n이유 없이 회색인 버튼 없음');
process.exit(0);
