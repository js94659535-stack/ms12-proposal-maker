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
globalThis.fetch = async () => { throw new Error('테스트에서는 네트워크를 쓰지 않는다.'); };

const snapshot = sampleProposalSnapshot(buildSampleProject());
const screens = [
  ['홈', { activeTool: 'home', homeSeen: true }],
  ...[0, 1, 2, 3, 4, 5].map(step => [`작업 ${step}단계 · 보관본 복원`, { activeTool: 'workflow', homeSeen: true, step, ...snapshot, applicants: SAMPLE_APPLICANTS }]),
  ['신청기관 정보', { activeTool: 'applicants', homeSeen: true, applicants: SAMPLE_APPLICANTS }],
  ['검증·코칭', { activeTool: 'coaching', homeSeen: true }],
  ...SAMPLE_STAGES.map(stage => [`[샘플] ${stage.no} ${stage.title}`, { activeTool: 'sample', sampleReturn: 'sample', sampleStage: stage.id, homeSeen: true }]),
  ['처음 사용', { homeSeen: true }]
];

for (const [index, [label, state]] of screens.entries()) {
  test(`${label} 화면이 오류 없이 그려진다`, async () => {
    store.set('ms12_project_v3', JSON.stringify(state));
    root.innerHTML = '';
    await import(`../src/app.js?screen=${index}`);
    assert.ok(String(root.innerHTML).length > 500, `${label} 화면이 비어 있다`);
  });
}
