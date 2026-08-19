// 화면을 그렸을 때 같은 조회가 두 번 이상 나가지 않는다.
//
// 실제로 났던 일: 「신청기관 정보」 화면에서 화면 전체가 1초마다 다시 그려져
// 열어 둔 드롭다운이 닫히고 입력칸 커서가 사라졌다. 기관정보를 아예 못 채우는 상태였다.
//
// 고리는 이랬다. bind 는 렌더마다 돌고, 거기서 조건이 맞으면 조회를 시작하고,
// 그 조회가 setState 로 끝나면 다시 렌더 → 다시 bind → 다시 조회.
// 끊는 것은 「다시 부르지 않겠다」는 표시뿐인데, 그 표시가 응답의 ok 에 걸려 있었다.
// 서버는 listAssets 에 ok 를 붙이지 않아 성공해도 표시가 서지 않았다.
//
// 앞선 시험들이 이 고리를 못 잡은 이유는 렌더를 한 번만 재고 호출 수를 안 셌기 때문이다.
// 그래서 이 파일은 오직 호출 수만 센다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_APPLICANTS, buildSampleProject, sampleProposalSnapshot } from '../src/sample-project.js';

const store = new Map();
globalThis.localStorage = { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const fake = () => new Proxy({ innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} } }, {
  get: (target, prop) => (prop in target ? target[prop] : (typeof prop === 'string' && prop.startsWith('on') ? undefined : () => {})),
  set: (target, prop, value) => { target[prop] = value; return true; }
});
const root = fake();
// 렌더 중에 시작되는 조회는 「그 요소가 화면에 있는가」로 조건을 건다.
// 그러니 가짜 DOM도 지금 그려진 HTML을 실제로 봐야 한다. 늘 null 을 돌려주면 고리가 재현되지 않는다.
globalThis.document = {
  querySelector: selector => (selector === '#app' ? root : (String(root.innerHTML).includes(`id="${String(selector).slice(1)}"`) ? fake() : null)),
  querySelectorAll: () => [], addEventListener() {}, createElement: () => fake(), body: fake(), documentElement: fake()
};
globalThis.window = { addEventListener() {}, innerWidth: 1400, innerHeight: 900, matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.requestAnimationFrame = fn => fn();

const CAP = 30;
let counts = {};
let overflowed = '';
const USER = { id: 'loop-user', email: 'loop@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' };
const EMPTY = { ok: true, notices: [], proposals: [], applicants: [], accounts: [], items: [], events: [], users: [], profile: {} };
globalThis.fetch = async (path, options = {}) => {
  const body = JSON.parse(options?.body || '{}');
  const key = `${path}${body.action ? `:${body.action}` : ''}`;
  counts[key] = (counts[key] || 0) + 1;
  // 고리는 무한하다. 상한을 넘으면 답하지 않고 멈춰 세운다.
  // 오류를 던지면 부르는 쪽이 그것을 받아 또 setState 를 하고 고리가 그대로 계속 돈다 —
  // 실제로 시험이 끝나지 않았다. 영영 안 풀리는 약속을 돌려주면 그 자리에서 선다.
  if (counts[key] > CAP && !overflowed) overflowed = key;
  if (overflowed) return new Promise(() => {});
  // 서버가 실제로 돌려주는 모양 그대로다. listAssets 응답에는 ok 가 없다 —
  // 여기에 ok 를 넣어 주면 시험이 서버를 대신 고쳐 주는 셈이라 고리를 못 잡는다.
  if (body.action === 'listAssets') return { ok: true, status: 200, json: async () => ({ assets: [] }) };
  const value = path === '/api/auth' && body.action === 'me' ? { ...EMPTY, user: USER } : EMPTY;
  return { ok: true, status: 200, json: async () => value };
};
const settle = async () => { for (let i = 0; i < 120; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); };

const applicant = SAMPLE_APPLICANTS[0];
const snapshot = sampleProposalSnapshot(buildSampleProject());
// 알고 있는 중복 하나. 고리가 아니라 각각 한 번씩이라 이번 범위 밖이다.
// 홈은 step 이 0 인 채로 열리는데 bind 가 loadHomeRecent 와 loadRecentArchive 를 둘 다 시작하고
// 둘 다 listArchivedProposals 를 부른다(src/app.js 의 loadHomeRecent · loadRecentArchive).
// 여기 적어 두지 않으면 시험을 느슨하게 풀게 되고, 그러면 진짜 고리도 함께 지나간다.
const KNOWN = { '홈': { '/api/archive:listProposals': 2 } };
const SCREENS = [
  ['신청기관 정보 · 프로그램 묶음 펼침', { activeTool: 'applicants', homeSeen: true, applicants: SAMPLE_APPLICANTS, selectedApplicantId: applicant.id, applicantEditingId: applicant.id, openOrgGroups: ['programs'] }],
  ['3단계 신청기관 준비', { activeTool: 'workflow', homeSeen: true, step: 2, ...snapshot, applicants: SAMPLE_APPLICANTS, selectedApplicantId: applicant.id }],
  ['홈', { activeTool: 'home', homeSeen: true, applicants: SAMPLE_APPLICANTS }],
  ['0단계 공고 준비', { activeTool: 'workflow', homeSeen: true, step: 0, ...snapshot, applicants: SAMPLE_APPLICANTS }]
];

for (const [index, [label, screen]] of SCREENS.entries()) {
  test(`${label} 화면이 같은 조회를 두 번 부르지 않는다`, async () => {
    counts = {};
    overflowed = '';
    root.innerHTML = '';
    store.set('ms12_project_v3', JSON.stringify(screen));
    await import(`../src/app.js?loop=${index}`);
    await settle();
    assert.equal(overflowed, '', `${overflowed} 가 ${CAP}회를 넘겼다 — 렌더 고리다`);
    const allowed = KNOWN[label] || {};
    const repeated = Object.entries(counts).filter(([key, n]) => n > (allowed[key] || 1));
    assert.deepEqual(repeated, [], `같은 조회가 예상보다 많이 나갔다: ${repeated.map(([key, n]) => `${key} ${n}회`).join(', ')}`);
    // 적어 둔 중복이 사라지면 이 줄이 알려 준다. 목록이 낡은 채로 남지 않게 한다.
    for (const [key, expected] of Object.entries(allowed)) {
      assert.equal(counts[key], expected, `${key} 중복이 ${expected}회에서 바뀌었다 — KNOWN 을 고치세요`);
    }
  });
}

test('사업 아이디어 조회는 응답의 ok 가 아니라 실패 여부로 판정한다', () => {
  // ok 를 다시 보기 시작하면 고리가 그대로 돌아온다. 서버는 listAssets 에 ok 를 붙이지 않는다.
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async function loadIdeaAssets()'), source.indexOf('\n}\n', source.indexOf('async function loadIdeaAssets()')));
  assert.doesNotMatch(fn, /result\.ok/, 'ok 로 판정하면 성공해도 실패로 읽힌다');
  // 표시를 조회보다 먼저 세운다. 늦으면 응답을 기다리는 사이에 또 부른다.
  const marker = fn.indexOf('state.ideaAssetsLoaded = true;');
  assert.ok(marker > 0 && marker < fn.indexOf('await listIdeaAssets()'), '다시 부르지 않겠다는 표시가 조회보다 뒤에 있다');
  // 실패해도 표시가 남아야 한다. 안 그러면 실패할 때만 도는 고리가 된다.
  assert.match(fn, /catch \(error\) \{\s*setState\(\{ error: [^}]*ideaAssetsLoaded: true \}\);/);
});
import fs from 'node:fs';
