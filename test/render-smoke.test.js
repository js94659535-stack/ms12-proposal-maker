// 화면이 예외 없이 그려지는지 확인한다. 브라우저 대신 최소 DOM만 흉내 내고 네트워크는 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_APPLICANTS, SAMPLE_STAGES, buildSampleProject, sampleProposalSnapshot } from '../src/sample-project.js';

const store = new Map();
globalThis.localStorage = { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const fakeEl = () => new Proxy({ innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} } }, {
  get: (target, prop) => (prop in target ? target[prop] : (typeof prop === 'string' && prop.startsWith('on') ? undefined : () => {})),
  set: (target, prop, value) => { target[prop] = value; return true; }
});
const root = fakeEl();
globalThis.document = { querySelector: selector => (selector === '#app' ? root : null), querySelectorAll: () => [], addEventListener() {}, createElement: () => fakeEl(), body: { append() {} } };
globalThis.window = { addEventListener() {}, innerWidth: 1400, innerHeight: 900, matchMedia: () => ({ matches: false, addEventListener() {} }) };
// 로그인 화면이 아니라 작업 화면을 그리려면 세션 확인에 응답해야 한다.
// 서버를 부르지 않고 가짜 응답만 돌려준다(승인된 이용권 회원 한 명).
const SESSION_USER = { id: 'smoke-user', email: 'smoke@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' };
const EMPTY = { ok: true, notices: [], proposals: [], applicants: [], accounts: [], items: [], events: [], users: [], profile: {} };
globalThis.fetch = async (path, options = {}) => {
  const body = JSON.parse(options?.body || '{}');
  const value = path === '/api/auth' && body.action === 'me' ? { ...EMPTY, user: SESSION_USER } : EMPTY;
  return { ok: true, status: 200, json: async () => value };
};
// 세션 확인과 뒤따르는 조회가 끝난 뒤의 화면을 본다.
const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); };

const snapshot = sampleProposalSnapshot(buildSampleProject());
const workflow = new Set();
const screens = [
  ['홈', { activeTool: 'home', homeSeen: true }],
  ...[0, 1, 2, 3, 4, 5].map(step => [`작업 ${step}단계 · 보관본 복원`, { activeTool: 'workflow', homeSeen: true, step, ...snapshot, applicants: SAMPLE_APPLICANTS }]),
  ['신청기관 정보', { activeTool: 'applicants', homeSeen: true, applicants: SAMPLE_APPLICANTS }],
  ['검증·코칭', { activeTool: 'coaching', homeSeen: true }],
  ['의뢰 건 · 고객 화면', { activeTool: 'engagement', homeSeen: true, applicants: SAMPLE_APPLICANTS }],
  ['의뢰 건 · 운영자 상세', { activeTool: 'engagement', homeSeen: true, applicants: SAMPLE_APPLICANTS, ...snapshot, engagement: { client: { name: '김담당' }, request: { title: '요청 사업' }, view: 'operator' } }],
  ...SAMPLE_STAGES.map(stage => [`[샘플] ${stage.no} ${stage.title}`, { activeTool: 'sample', sampleReturn: 'sample', sampleStage: stage.id, homeSeen: true }]),
  ['처음 사용', { homeSeen: true }]
];
for (const [index, [label]] of screens.entries()) if (label.startsWith('작업 ')) workflow.add(index);

for (const [index, [label, state]] of screens.entries()) {
  test(`${label} 화면이 오류 없이 그려진다`, async () => {
    store.set('ms12_project_v3', JSON.stringify(state));
    root.innerHTML = '';
    await import(`../src/app.js?screen=${index}`);
    await settle();
    const html = String(root.innerHTML);
    assert.ok(html.length > 500, `${label} 화면이 비어 있다`);
    // 로그인 화면·소개 화면으로 빠지면 아래 화면들을 검사하지 못한다.
    assert.doesNotMatch(html, /id="login-email"|data-landing-start/, `${label} 화면 대신 로그인·소개 화면이 나왔다`);
    if (workflow.has(index)) assert.match(html, /class="workflow-header"/, `${label}에 작업 화면 골격이 없다`);
  });
}

test('0단계 공고 준비 화면이 밀도 정리 마크업으로 그려진다', async () => {
  store.set('ms12_project_v3', JSON.stringify({ activeTool: 'workflow', homeSeen: true, step: 0, ...snapshot, applicants: SAMPLE_APPLICANTS }));
  root.innerHTML = '';
  await import('../src/app.js?screen=dense');
  await settle();
  const html = String(root.innerHTML);
  for (const needle of ['dense-step', 'stat-badges', 'id="fetch-notices"', 'id="source-files"', 'id="source-text"',
    'id="manual-sources"', 'id="missing-notice-url"', 'id="archive-box"', 'filter-details']) {
    assert.ok(html.includes(needle), needle);
  }
  // 큰 현황 카드 넷은 더 그리지 않는다.
  assert.doesNotMatch(html.slice(html.indexOf('id="archive-box"')), /class="summary-grid"/);
  // 태그가 어긋나면 접기 영역이 통째로 사라진다. 열고 닫힘이 맞는지 확인한다.
  const voids = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
  const stack = [];
  for (const match of html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const name = match[1].toLowerCase();
    if (voids.has(name) || match[2]) continue;
    if (match[0].startsWith('</')) {
      assert.equal(stack.pop(), name, `${name} 닫힘 태그가 맞지 않는다`);
    } else stack.push(name);
  }
  assert.deepEqual(stack, [], '닫히지 않은 태그가 있다');
});
