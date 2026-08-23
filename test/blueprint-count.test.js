// 「확인 필요」를 한 곳에서만 센다 (23-06).
//
// 실제로 났던 일: 띠가 「확인이 필요한 설계 항목이 6개」라고 하는데 설계도에서 세면 4개였다.
// 띠와 요약 칸이 읽는 byStatus는 items 열여섯을 세고, 카드로 그려지는 것은 열셋이었다.
// 차이는 언제나 같은 둘 — requirementLinks(공고 선정요건 대응 요약)와 openItems(확인 필요 묶음)로,
// 설계 칸이 아니라 다른 것을 요약한 줄이다.
//
// 「설계 항목」은 design 열넷으로 정했다. 카드 열셋이 아닌 까닭은 applicationType 때문이다 —
// 카드가 아닐 뿐 화면에 나오고, 23-04 띠의 여섯째 갈래가 그리로 데려간다.
// 띠가 가리키는 것이 개수에 없으면 그것대로 어긋난다.
//
// 숫자는 그려진 화면에서 읽어 못 박는다. 손으로 만든 설계도로는 화면과 같은 값이 나오지 않는다 —
// 화면은 저장된 이번 사업 값과 공고 원문 전체를 함께 넘기기 때문이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBlueprint } from '../src/project-blueprint.js';
import { matchApplicantToNotice } from '../src/fit-matching.js';
import { analyzeNoticeStructure } from '../src/notice-logic.js';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');
const source = read('../src/project-blueprint.js');
// 화면이 카드로 그리는 열셋. app.js의 목록을 그대로 읽어 온다 — 손으로 옮겨 적으면 어긋난다.
const CARD_KEYS = JSON.parse(`[${(app.match(/const BLUEPRINT_CARD_KEYS = \[([^\]]*)\]/) || [, ''])[1].replace(/'/g, '"')}]`);
const DESIGN_OUT = ['requirementLinks', 'openItems'];

// ---------- 세는 자리 ----------

test('세는 자리는 하나뿐이다', () => {
  // 같은 filter를 두 번 적으면 한쪽만 고쳐지는 날이 온다.
  assert.equal([...source.matchAll(/!\['requirementLinks', 'openItems'\]\.includes/g)].length, 1);
  // byStatus가 그 하나를 읽는다. items를 직접 세지 않는다.
  assert.match(source, /const byStatus = Object\.fromEntries\(BLUEPRINT_STATUSES\.map\(status => \[status, design\.filter\(entry => entry\.status === status\)\.length\]\)\);/);
  // design이 byStatus보다 먼저 정해진다.
  assert.ok(source.indexOf('const design = items.filter') < source.indexOf('const byStatus ='), 'design이 byStatus 뒤에 있다');
  // 띠도 요약 칸도 스스로 세지 않고 그 값을 읽는다.
  assert.match(read('../src/design-next-step.js'), /Number\(blueprint\.byStatus\?\.NEEDS_CONFIRMATION\) \|\| 0/);
  assert.match(app, /<span>확인 필요<\/span><strong>\$\{blueprint\.byStatus\.NEEDS_CONFIRMATION\}<\/strong>/);
});

test('요약 칸 넷의 합이 설계 항목 열넷이다', () => {
  // 넷 중 하나만 다른 무리를 세면 합이 맞지 않고, 나란히 놓인 네 숫자가 한 덩어리로 읽히지 않는다.
  const structure = analyzeNoticeStructure('공모사업 신청 안내. 신청자격은 비영리법인이다. 사업기간은 2026년 3월부터 12월까지이다. 수행 인력을 배치해야 한다.');
  const applicant = { name: '햇살센터', items: [] };
  const blueprint = buildBlueprint({ structure, applicant, fitResult: matchApplicantToNotice(structure, applicant), projectValues: [], notice: '' });
  const design = blueprint.items.filter(entry => !DESIGN_OUT.includes(entry.key));
  assert.equal(blueprint.items.length, 16);
  assert.equal(design.length, 14, '설계 항목이 열넷이 아니다');
  const sum = Object.values(blueprint.byStatus).reduce((total, one) => total + one, 0);
  assert.equal(sum, 14, `요약 칸 넷의 합이 ${sum}이다`);
  // 세지 않기로 한 둘은 사라지지 않았다. 숫자에서만 뺐다.
  for (const key of DESIGN_OUT) assert.ok(blueprint.items.some(entry => entry.key === key), `${key}가 items에서 사라졌다`);
});

test('세지 않기로 한 둘은 카드로도 그리지 않는다', () => {
  // 숫자에서 뺐다고 화면에 새로 그리지 않는다. 접힌 줄과 알림으로 나오던 그대로다.
  assert.equal(CARD_KEYS.length, 13);
  for (const key of DESIGN_OUT) assert.ok(!CARD_KEYS.includes(key), `${key}를 카드로 그린다`);
  assert.match(app, /공고 선정요건 점검 \$\{noticeChecks\.length\}개 · 남은 질문 \$\{restQuestions\.length\}개/);
});

// ---------- 그려진 화면에서 읽은 숫자 ----------

const store = new Map();
const KEY = 'ms12_project_v3';
let frozen = null;
globalThis.localStorage = {
  getItem: k => (k === KEY && frozen !== null ? frozen : (store.has(k) ? store.get(k) : null)),
  setItem: (k, v) => { if (k === KEY && frozen !== null) return; store.set(k, String(v)); },
  removeItem: k => store.delete(k)
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const fakeEl = () => new Proxy({ innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} } }, {
  get: (t, p) => (p in t ? t[p] : (typeof p === 'string' && p.startsWith('on') ? undefined : () => {})),
  set: (t, p, v) => { t[p] = v; return true; }
});
let root = fakeEl();
globalThis.document = { querySelector: s => (s === '#app' ? root : null), querySelectorAll: () => [], addEventListener() {}, createElement: () => fakeEl(), body: { append() {} } };
globalThis.window = { addEventListener() {}, innerWidth: 1400, innerHeight: 900, matchMedia: () => ({ matches: false, addEventListener() {} }) };
const USER = { id: 'bc', email: 'bc@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' };
const EMPTY = { ok: true, notices: [], proposals: [], applicants: [], accounts: [], items: [], events: [], users: [], profile: {} };
globalThis.fetch = async (path, options = {}) => {
  const body = JSON.parse(options?.body || '{}');
  return { ok: true, status: 200, json: async () => (path === '/api/auth' && body.action === 'me' ? { ...EMPTY, user: USER } : EMPTY) };
};

let screen = 0;
async function drawDesign({ typeChosen = false } = {}) {
  const { SAMPLE_APPLICANTS, buildSampleProject, sampleProposalSnapshot } = await import('../src/sample-project.js');
  const snapshot = sampleProposalSnapshot(buildSampleProject());
  // 신청유형을 고르지 않으면 띠가 개수를 말하지 않는다 — 「신청유형을 고르세요」가 먼저다(23-04 갈래 6).
  const projectValues = typeChosen
    ? [...(snapshot.projectValues || []), { id: 'v-type', blueprintKey: 'applicationType', label: '신청유형', value: '기초형' }]
    : snapshot.projectValues;
  frozen = JSON.stringify({ activeTool: 'workflow', step: 3, homeSeen: true, ...snapshot, projectValues, applicants: SAMPLE_APPLICANTS });
  const mine = fakeEl();
  root = mine;
  screen += 1;
  await import(`../src/app.js?count=${screen}`);
  for (let i = 0; i < 800; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (String(mine.innerHTML).includes('id="project-blueprint"')) break;
  }
  const html = String(mine.innerHTML);
  frozen = null;
  return html.slice(html.indexOf('class="workspace"'));
}

test('샘플 공고에서 요약 칸 넷을 실제 값으로 못 박는다', async () => {
  const read4 = body => {
    const tile = name => Number((body.match(new RegExp(`<span>${name}</span><strong>([0-9]+)</strong>`)) || [, NaN])[1]);
    return { 확정: tile('확정'), '근거 있음': tile('근거 있음'), 설계안: tile('설계안'), '확인 필요': tile('확인 필요') };
  };
  // 23-06 전에는 합이 열여섯이었다 — requirementLinks·openItems 둘이 함께 세어졌다.
  const untyped = read4(await drawDesign());
  assert.deepEqual(untyped, { 확정: 3, '근거 있음': 4, 설계안: 2, '확인 필요': 5 });
  assert.equal(Object.values(untyped).reduce((total, one) => total + one, 0), 14);
  // 신청유형을 고르면 그 한 칸이 확인 필요에서 확정으로 옮겨 간다. 합은 그대로 열넷이다.
  const chosen = read4(await drawDesign({ typeChosen: true }));
  assert.deepEqual(chosen, { 확정: 4, '근거 있음': 4, 설계안: 2, '확인 필요': 4 });
  assert.equal(Object.values(chosen).reduce((total, one) => total + one, 0), 14);
});

test('★ 띠 숫자 = 요약 칸 숫자 = 화면에서 셀 수 있는 항목 수', async () => {
  const body = await drawDesign({ typeChosen: true });
  const tile = Number((body.match(/<span>확인 필요<\/span><strong>([0-9]+)<\/strong>/) || [, NaN])[1]);
  const band = Number((body.match(/확인이 필요한 설계 항목이 ([0-9]+)개/) || [, NaN])[1]);
  // 카드에 붙은 「확인 필요」 딱지. 사람이 화면에서 셀 수 있는 것이 이것이다.
  const cards = [...body.matchAll(/<span class="status [^"]*">확인 필요<\/span>/g)].length;
  assert.equal(band, tile, `띠 ${band} vs 요약 칸 ${tile}`);
  assert.equal(band, cards, `띠 ${band} vs 카드 딱지 ${cards}`);
  assert.equal(band, 4);
});
