// 카드를 「실제로 눌러」 본다.
//
// 앞선 시험은 코드가 있는지만 봤다 — 대응표에 값이 있고, 처리기 문장이 파일에 있고, 마크업에
// data-open-area 가 있는 것까지 확인하고 통과시켰다. 그런데 화면에서는 아무 일도 없었다.
// 이유는 요약(3단계 「신청기관 준비」)과 편집칸(사이드바 「신청기관 정보」)이 서로 다른 화면이라
// 열고 스크롤할 대상이 그 시점 DOM 에 아예 없었기 때문이다. 존재 검사로는 절대 잡히지 않는다.
//
// 그래서 여기서는 진짜로 그리고, 진짜로 처리기를 부르고, 다시 그려진 화면을 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_APPLICANTS, buildSampleProject, sampleProposalSnapshot } from '../src/sample-project.js';
import { APPLICANT_AREAS } from '../src/applicants.js';
import { areaDestination } from '../src/org-stage.js';

const store = new Map();
globalThis.localStorage = { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

// 지금 그려진 HTML에서 그 선택자에 해당하는 것을 찾아 가짜 요소로 돌려준다.
// 처리기는 등록해 두었다가 시험이 직접 부른다. 스크롤은 불렸는지만 적어 둔다.
const registry = new Map();
const scrolled = [];
const attrOf = selector => (selector.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/) || []).slice(1);
const idOf = selector => (selector.match(/^#([\w-]+)$/) || [])[1];
function present(selector) {
  const html = String(root.innerHTML);
  const id = idOf(selector);
  if (id) return html.includes(`id="${id}"`);
  const [attr, value] = attrOf(selector);
  if (!attr) return false;
  return value === undefined ? html.includes(`${attr}=`) : html.includes(`${attr}="${value}"`);
}
function fakeElement(key, dataset = {}) {
  return new Proxy({
    dataset, style: {}, classList: { add() {}, remove() {}, toggle() {} }, open: false,
    addEventListener: (type, fn) => registry.set(`${key}|${type}`, fn),
    scrollIntoView: () => scrolled.push(key)
  }, {
    get: (target, prop) => (prop in target ? target[prop] : (typeof prop === 'string' && prop.startsWith('on') ? undefined : () => {})),
    set: (target, prop, value) => { target[prop] = value; return true; }
  });
}
const root = fakeElement('#app');
function matches(selector) {
  const html = String(root.innerHTML);
  const [attr] = attrOf(selector);
  if (!attr) return present(selector) ? [fakeElement(selector)] : [];
  const camel = attr.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const found = [...new Set([...html.matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))].map(m => m[1]))];
  return found.map(value => fakeElement(`${selector}=${value}`, { [camel]: value }));
}
globalThis.document = {
  querySelector: selector => (selector === '#app' ? root : (present(selector) ? fakeElement(selector) : null)),
  querySelectorAll: selector => matches(selector),
  addEventListener() {}, createElement: () => fakeElement('created'), body: fakeElement('body'), documentElement: fakeElement('html')
};
globalThis.window = { addEventListener() {}, innerWidth: 1400, innerHeight: 900, matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.requestAnimationFrame = fn => fn();
const SESSION_USER = { id: 'click-user', email: 'click@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' };
const EMPTY = { ok: true, notices: [], proposals: [], applicants: [], accounts: [], items: [], events: [], users: [], profile: {} };
globalThis.fetch = async (path, options = {}) => {
  const body = JSON.parse(options?.body || '{}');
  return { ok: true, status: 200, json: async () => (path === '/api/auth' && body.action === 'me' ? { ...EMPTY, user: SESSION_USER } : EMPTY) };
};
const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); };

// 3단계 「신청기관 준비」. 여기가 열한 칸 요약이 그려지는 유일한 화면이다.
const applicant = SAMPLE_APPLICANTS[0];
store.set('ms12_project_v3', JSON.stringify({
  activeTool: 'workflow', homeSeen: true, step: 2,
  ...sampleProposalSnapshot(buildSampleProject()),
  applicants: SAMPLE_APPLICANTS, selectedApplicantId: applicant.id, openOrgGroups: []
}));
await import('../src/app.js?click=1');
await settle();

test('열한 칸이 실제로 그려지고 눌리는 모양이다', () => {
  const html = String(root.innerHTML);
  assert.ok(html.includes('불러온 신청기관 정보'), '요약 카드가 그려지지 않았다');
  for (const area of APPLICANT_AREAS) {
    assert.ok(html.includes(`<button type="button" data-open-area="${area.key}"`), `${area.title} 칸이 버튼이 아니다`);
  }
});

test('요약 화면에는 열 자리가 없다 — 그래서 화면을 옮겨야 한다', () => {
  // 이것이 처음 고침이 실패한 이유다. 시험이 이 사실을 보지 않아 통과했다.
  const html = String(root.innerHTML);
  assert.ok(!html.includes('data-detail-group='), '요약 화면에 편집 묶음이 생겼다면 이 시험을 다시 세워야 한다');
  assert.ok(!html.includes('id="applicant-doc"'), '요약 화면에 문서 추출 카드는 없다');
});

test('「수행인력」을 누르면 편집 화면이 열리고 그 자리로 간다', async () => {
  const handler = registry.get('[data-open-area]=staff|click');
  assert.ok(handler, '수행인력 카드에 처리기가 붙지 않았다');
  scrolled.length = 0;
  handler();
  await settle();
  const html = String(root.innerHTML);
  // 화면이 실제로 바뀌었는가.
  assert.ok(html.includes('data-detail-group="staff"'), '편집 묶음이 그려지지 않았다');
  // 그 묶음이 펼쳐져 있는가. 접혀 있으면 눌러도 아무것도 안 보인다.
  assert.match(html, /data-detail-group="staff"[^>]*\bopen\b/, '수행인력 묶음이 접힌 채로 열렸다');
  // 스크롤 대상이 그 시점 DOM 에 실제로 있었는가.
  assert.deepEqual(scrolled, ['[data-detail-group="staff"]'], '스크롤 대상을 찾지 못했다');
});

test('열한 칸 모두 실제 편집 자리로 이어진다', async () => {
  for (const area of APPLICANT_AREAS) {
    const target = areaDestination(area.key);
    const handler = registry.get(`[data-open-area]=${area.key}|click`);
    assert.ok(handler, `${area.title} 처리기 없음`);
    scrolled.length = 0;
    handler();
    await settle();
    assert.ok(String(root.innerHTML).includes(`data-detail-group="${target}"`), `${area.title} → ${target} 자리가 화면에 없다`);
    assert.deepEqual(scrolled, [`[data-detail-group="${target}"]`], `${area.title} 스크롤 실패`);
  }
});
