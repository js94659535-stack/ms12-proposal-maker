// 역할별 첫 화면이 실제로 그려지는지 확인한다. 브라우저 대신 최소 DOM만 흉내 내고 네트워크는 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';

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

let session = null;
// 운영 현황은 서버가 센 값을 그대로 그린다. 여기서는 정해진 값을 돌려준다.
const OVERVIEW = {
  at: '2026-08-13T00:00:00Z',
  cards: [
    { key: 'pending', value: 2, note: '승인을 기다리는 계정이 있습니다.' },
    { key: 'agency', value: 5, note: '대행회원 1명 · 등록 고객 3곳' },
    { key: 'notices', value: 21, note: '모아 둔 공고 전체입니다.' },
    { key: 'collection', value: null, text: '정상', note: '마지막 성공 2026-08-12' },
    { key: 'drafts', value: 4, note: '' }, { key: 'unchecked', value: 3, note: '' },
    { key: 'usage', value: null, text: '12,457토큰', note: '최근 30일' },
    { key: 'members', value: 8, note: '' }, { key: 'assistant', value: null, text: '열기', note: '' }
  ]
};
const EMPTY = { ok: true, notices: [], proposals: [], applicants: [], accounts: [], items: [], events: [], users: [], profile: {} };
globalThis.fetch = async (path, options = {}) => {
  const body = JSON.parse(options?.body || '{}');
  if (path === '/api/auth' && body.action === 'me') return { ok: true, status: 200, json: async () => ({ ...EMPTY, user: session }) };
  if (path === '/api/admin' && body.action === 'overview') return { ok: true, status: 200, json: async () => OVERVIEW };
  return { ok: true, status: 200, json: async () => EMPTY };
};
const settle = async () => { for (let i = 0; i < 12; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); };

async function draw(user, state, tag) {
  session = user;
  store.set('ms12_project_v3', JSON.stringify(state));
  root.innerHTML = '';
  await import(`../src/app.js?roles=${tag}`);
  await settle();
  return String(root.innerHTML);
}

test('최고관리자는 관리자 포털 홈에서 운영 현황과 서비스 소개를 함께 본다', async () => {
  const html = await draw(
    { id: 'a1', email: 'admin@example.com', role: 'admin', status: 'active', plan: 'full', provider: 'email' },
    { activeTool: 'home', homeSeen: true, portal: 'admin' }, 'admin');
  assert.match(html, /class="admin-shortcuts"/, '운영 바로가기가 없다');
  // 아홉 가지 바로가기가 모두 그려진다.
  for (const label of ['승인 대기 회원', '대행회원·고객 의뢰', '공고보관함', '공고 수집 상태', '작성 중인 계획서',
    '확인 필요 계획서', 'AI 사용량·비용', '회원·이용권·계약', '관리자 AI 도우미']) {
    assert.ok(html.includes(label), label);
  }
  // 서비스 소개 구역이 같은 화면에 이어진다.
  for (const id of ['landing-value', 'landing-flow', 'landing-features', 'landing-audience', 'landing-security']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  // 회원 간편 화면으로 바뀌지 않는다.
  assert.doesNotMatch(html, /id="simple-generate"/);
  assert.match(html, /data-portal="proposal"/, '계획서 포털로 가는 단추가 없다');
});

test('일반회원의 첫 화면은 간편 작성이고 전문 기능 입구가 함께 있다', async () => {
  const html = await draw(
    { id: 'c1', email: 'member@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' },
    { activeTool: 'home', homeSeen: true }, 'customer');
  assert.match(html, /id="simple-generate"/, '간편 작성 화면이 아니다');
  assert.match(html, /지금 보는 화면/, '어느 화면인지 표시가 없다');
  assert.match(html, /회원 화면\(간편\)/);
  assert.match(html, /id="open-expert-detail"/, '작성 과정 자세히 보기 입구가 없다');
  // 머리띠의 보관함·기관정보·검증 입구가 남아 있다.
  for (const id of ['open-archive-box', 'open-applicants', 'open-coaching']) assert.ok(html.includes(`id="${id}"`), id);
  // 운영 현황은 보이지 않는다.
  assert.doesNotMatch(html, /class="admin-shortcuts"/);
});

test('대행회원은 간편 화면을 쓰고 고객 기관 화면을 함께 쓴다', async () => {
  const user = { id: 'g1', email: 'agency@example.com', role: 'agency', status: 'active', plan: 'full', provider: 'email' };
  const simple = await draw(user, { activeTool: 'home', homeSeen: true }, 'agency-home');
  assert.match(simple, /id="simple-generate"/);
  assert.doesNotMatch(simple, /class="admin-shortcuts"/);
  const clients = await draw(user, { activeTool: 'applicants', homeSeen: true }, 'agency-clients');
  assert.match(clients, /고객 기관 정보/, '대행회원 화면 이름이 반영되지 않았다');
  assert.match(clients, /등록된 고객 기관/);
});

test('운영관리자는 관리자 랜딩이 아니라 허용된 운영 화면을 쓴다', async () => {
  const html = await draw(
    { id: 'o1', email: 'op@example.com', role: 'operator', status: 'active', plan: 'full', provider: 'email' },
    { activeTool: 'operator', homeSeen: true, portal: 'admin' }, 'operator');
  assert.doesNotMatch(html, /class="admin-shortcuts"/, '운영관리자에게 관리자 랜딩이 보이면 안 된다');
  assert.ok(html.length > 500);
});
