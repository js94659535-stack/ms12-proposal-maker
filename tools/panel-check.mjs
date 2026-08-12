// 새로 붙인 화면(권한 관리·사업 아이디어·제안서 작성정보·신청기관 안내)을 실제 브라우저로 재 본다.
// 가로 넘침과 한글 한 글자 줄바꿈을 본다. 운영 서버는 부르지 않는다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SIZES = [[1280, 800], [768, 1024], [360, 640]];
const PORT = 8793;
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find(file => fs.existsSync(file));

// 관리자 화면을 보려면 관리자 세션이어야 한다. 세션 확인 응답만 가짜로 돌려준다.
const ADMIN_USER = { id: 'panel-admin', email: 'panel@example.com', role: 'admin', status: 'active', plan: 'full', provider: 'email' };
// 무료 회원. 핵심제안서 화면과 단계적 질문을 이 계정으로 본다.
const TRIAL_USER = { id: 'panel-trial', email: 'trial@example.com', role: 'customer', status: 'active', plan: 'trial', provider: 'email' };
let USER = ADMIN_USER;
const ACCESS = {
  subjects: [{ id: 'op-1', email: 'operator@example.com', name: '운영관리자', role: 'operator', status: 'active' }],
  grants: [{
    id: 'g1', subjectId: 'op-1', scope: 'proposals', targetKind: 'proposal', targetId: 'p-1',
    abilities: { view: true, viewContent: true, edit: false, download: false, manage: false, progress: false },
    startsOn: '2026-08-01', endsOn: '2026-12-31', note: '수주지원 담당', grantedBy: 'panel-admin', grantedAt: '2026-08-12T00:00:00.000Z', revokedAt: ''
  }],
  accessLog: [{ id: 'l1', at: '2026-08-12T01:00:00.000Z', actorId: 'op-1', actorRole: 'operator', action: 'viewContent', scope: 'proposals', targetKind: 'proposal', targetId: 'p-1', targetUserId: 'mem-1', allowed: true, reason: '프리미엄 계약' }],
  scopes: ['members', 'proposals', 'applicants', 'assets', 'usage', 'contracts'],
  abilities: ['view', 'viewContent', 'edit', 'download', 'manage', 'progress']
};
const APPLICANT = {
  id: 'org-1', name: '햇살복지관', note: '2026년 기준', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
  items: [
    { id: 'i1', area: 'basic', label: '기관명', value: '햇살복지관', status: '확인됨', source: '법인 등기부', origin: '기관 확인', history: [] },
    { id: 'i2', area: 'staff', label: '보유 인력', value: '사회복지사 4명, 간호사 1명', status: '확인 필요', source: '내 정보(회원 입력)', origin: '고객 입력', history: [] }
  ]
};
const ASSETS = [{
  id: 'a1', name: '방과후 아동 돌봄교실', kind: '프로그램', status: 'verified',
  problem: '맞벌이 가정 아동의 방과후 돌봄 공백', audience: '초등 1~3학년', activities: '학습지도·급식·정서지원',
  duration: '주 3회 12회기', resources: '사회복지사 2명, 프로그램실 1실', experience: '2025년 12회기 운영, 참여 24명',
  evidence: '2025년 결과보고서', adaptable: '회기와 대상 연령 조정 가능', evidenceConfirmed: true, updatedAt: '2026-08-10T00:00:00.000Z'
}];

function serve() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || '{}');
      const answer = url.pathname === '/api/auth' && body.action === 'me' ? { user: USER }
        : body.action === 'accessOverview' ? ACCESS
        : body.action === 'listAssets' ? { assets: ASSETS }
        : body.action === 'listApplicants' ? { applicants: [APPLICANT] }
        : { notices: [], proposals: [], applicants: [], accounts: [], users: [], items: [], events: [], profile: {}, memberProfile: { orgName: '햇살복지관', orgType: '사회복지법인', programs: '방과후 돌봄', achievements: '2025년 아동 돌봄 사업' } };
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(answer));
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const tool = url.searchParams.get('tool') || 'admin';
      const state = {
        activeTool: tool, homeSeen: true, portal: tool === 'admin' ? 'admin' : 'proposal', applicantEditingId: 'org-1', step: 2,
        applicants: [APPLICANT], selectedApplicantId: 'org-1', applicantEditingId: 'org-1',
        ideaAssets: ASSETS, ideaAssetsLoaded: true, intakeAnswers: {},
        selectedNotice: { title: '아동 돌봄 지원사업', summary: '방과후 돌봄 공백 해소', supportLimit: '3천만원', eligibility: '광주 지역 아동복지기관' }
      };
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
    } catch { /* 아직 안 떴다 */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('브라우저 디버깅 포트에 붙지 못했습니다.');
}

const MEASURE = `(() => {
  const view = document.documentElement.clientWidth;
  const round = value => Math.round(value);
  const scroller = el => {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowX;
      if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') return true;
    }
    return false;
  };
  const wide = [...document.querySelectorAll('body *')]
    .filter(el => { const box = el.getBoundingClientRect(); return (box.width || box.height) && (box.right > view + 1 || box.left < -1) && !scroller(el); })
    .slice(0, 4).map(el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + '@' + round(el.getBoundingClientRect().right));
  // 한글이 한 글자씩 세로로 끊기는지. 글자 노드에 Range를 걸어 실제 줄 수를 센다.
  const lines = el => {
    const node = [...el.childNodes].find(child => child.nodeType === 3 && child.textContent.trim());
    if (!node) return 1;
    const range = document.createRange();
    range.selectNodeContents(node);
    return Math.max(1, range.getClientRects().length);
  };
  const split = [...document.querySelectorAll('label, .stat-badge span, .tag, .status, h4, summary b, option')]
    .map(el => ({ text: (el.textContent || '').trim().slice(0, 14), chars: (el.textContent || '').replace(/\\s/g, '').length, lines: lines(el) }))
    .filter(item => item.chars >= 4 && item.chars / item.lines < 2.2)
    .slice(0, 4);
  const seen = selector => Boolean(document.querySelector(selector));
  return JSON.stringify({
    view, scrollWidth: document.documentElement.scrollWidth, wide, split,
    panels: {
      access: seen('#access-subject'),
      grants: document.querySelectorAll('[data-revoke-grant]').length,
      assets: seen('#idea-assets'),
      intake: seen('#proposal-intake'),
      areaGuide: seen('.stat-badges'),
      profileBridge: seen('#pull-profile-info')
    }
  });
})()`;

const server = serve();
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
if (!CHROME) { console.error('크롬이나 엣지를 찾지 못했습니다.'); process.exit(2); }
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9335',
  `--user-data-dir=${path.join(ROOT, 'node_modules', '.cache', 'panel-check')}`, 'about:blank'], { stdio: 'ignore' });

const ws = new WebSocket(await connect(9335));
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
for (const [tool, label] of [['admin', '권한 관리'], ['applicants', '신청기관·아이디어·기관정보'], ['core', '핵심제안서 작성정보']]) {
  USER = tool === 'core' ? TRIAL_USER : ADMIN_USER;
  for (const [width, height] of SIZES) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?tool=${tool}` });
    await new Promise(resolve => setTimeout(resolve, 4000));
    // 관리자 화면은 「권한 관리」를 눌러야 열린다.
    if (tool === 'admin') {
      await send('Runtime.evaluate', { expression: "document.querySelector('#open-admin-access')?.click()" });
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    const result = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
    const measured = JSON.parse(result.result?.result?.value || '{}');
    const over = measured.scrollWidth > measured.view;
    const broken = (measured.split || []).length > 0;
    if (over || broken) failures += 1;
    console.log(`${label.padEnd(26)} ${String(width).padStart(4)}×${height}  가로 ${measured.scrollWidth}/${measured.view} ${over ? '넘침 ' + measured.wide.join(', ') : '정상'}${broken ? ' · 글자 쪼개짐 ' + JSON.stringify(measured.split) : ''}  ${JSON.stringify(measured.panels)}`);
  }
}
ws.close();
server.close();
chrome.kill();
console.log(failures ? `\n${failures}건 확인 필요` : '\n두 화면 × 세 크기 모두 가로 넘침·글자 쪼개짐 없음');
process.exit(failures ? 1 : 0);
