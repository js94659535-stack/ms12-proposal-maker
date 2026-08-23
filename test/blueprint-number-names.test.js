// 설계도 숫자 셋에 제 이름 붙이기 (23-09).
//
// 실제로 났던 일: 한 화면에 「제출 전 18개 항목 확인 필요」와 요약 칸 「확인 필요 6」과
// 「필수 확인 6개」가 함께 나왔다. 셋이 세는 것이 다른데 「확인 필요」라는 같은 말을 써서
// 사용자가 어느 것을 믿을지 몰랐다(23-08 조사).
//
//   제출 전 점검 = 설계값(확정이 아닌 설계 항목) + 공고 요건(미대응이거나 기관 근거가 없는 것)
//   요약 칸 확인 필요 = 설계 항목 열넷 중 NEEDS_CONFIRMATION
//   먼저 답할 질문 = 그 항목들이 낸 질문. 일곱에서 자른다 — 항목 수가 아니다
//
// 값은 고치지 않았다. 무엇을 세는지 화면에서 말하게만 했다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBlueprint } from '../src/project-blueprint.js';
import { matchApplicantToNotice } from '../src/fit-matching.js';
import { analyzeNoticeStructure } from '../src/notice-logic.js';
import { SAMPLE_APPLICANTS, buildSampleProject, sampleProposalSnapshot } from '../src/sample-project.js';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');
const source = read('../src/project-blueprint.js');

const SNAPSHOT = sampleProposalSnapshot(buildSampleProject());
const STRUCTURE = SNAPSHOT.noticeLogic?.structure;
const NOTICE = SNAPSHOT.noticeLogic?.source || null;
const SAVED = (SNAPSHOT.projectValues || []).filter(item => item.blueprintKey)
  .map(item => ({ key: item.blueprintKey, value: item.value, source: '사용자 확정' }));
const plan = ({ structure = STRUCTURE, applicant, projectValues = [], notice = NOTICE }) =>
  buildBlueprint({ structure, applicant, fitResult: matchApplicantToNotice(structure, applicant), projectValues, notice });
const SAMPLE_APPLICANT = SAMPLE_APPLICANTS.find(one => one.id === SNAPSHOT.selectedApplicantId) || SAMPLE_APPLICANTS[0];
// 화면과 같은 상태. 신청유형을 고르지 않으면 판정 한 줄이 「신청유형 선택 필요」라서 숫자가 나오지 않는다.
const TYPED = [...SAVED, { key: 'applicationType', value: '기초형', source: '사용자 확정' }];
// 확인 필요 항목이 여덟을 넘는 자료. 공고가 성글면 설계도가 채울 근거가 없어 항목이 그만큼 열린다.
const SPARSE = {
  structure: analyzeNoticeStructure('공모사업 신청 안내. 신청자격은 비영리법인이다. 사업기간은 2026년 3월부터 12월까지이다. 수행 인력을 배치해야 한다.'),
  applicant: { name: '빈기관', items: [] },
  notice: ''
};
// 화면이 세는 것과 같은 방식으로 「먼저 답할 질문」을 센다. 일곱에서 자르는 것까지 같다.
const askedCount = blueprint => {
  const design = blueprint.items.filter(entry => !['requirementLinks', 'openItems'].includes(entry.key));
  const titles = new Set(design.filter(entry => entry.status === 'NEEDS_CONFIRMATION').map(entry => entry.title));
  return blueprint.openQuestions.filter(entry => titles.has(entry.section)).slice(0, 7).length;
};

test('제출 전 점검은 두 무리를 더한 값이고, 나뉜 수를 값에서 꺼낸다', () => {
  for (const input of [{ applicant: SAMPLE_APPLICANT, projectValues: TYPED }, SPARSE]) {
    const blueprint = plan(input);
    const 설계값 = blueprint.submissionChecklist.filter(entry => entry.kind === '설계값').length;
    const 요건 = blueprint.submissionChecklist.filter(entry => entry.kind === '공고 요건').length;
    assert.equal(설계값 + 요건, blueprint.submissionChecklist.length, '두 무리 말고 셋째가 들어왔다');
    assert.match(blueprint.verdict, new RegExp(`제출 전 점검 ${blueprint.submissionChecklist.length}곳 — 설계값 ${설계값} · 공고 요건 ${요건}$`));
    // 설계값 쪽은 설계 항목 열넷 중 확정이 아닌 것이다 — 요약 칸 「확인 필요」보다 늘 크거나 같다.
    assert.ok(설계값 >= blueprint.byStatus.NEEDS_CONFIRMATION);
  }
  // 나뉜 수를 손으로 적지 않는다. 목록에서 센다.
  assert.match(source, /const checked = kind => submissionChecklist\.filter\(entry => entry\.kind === kind\)\.length;/);
  assert.match(source, /제출 전 점검 \$\{submissionChecklist\.length\}곳 — 설계값 \$\{checked\('설계값'\)\} · 공고 요건 \$\{checked\('공고 요건'\)\}/);
});

test('판정 한 줄에 줄표는 하나뿐이다', () => {
  // 줄표가 둘이면 어디까지가 한 덩어리인지 흐려진다 —
  // 「초안 작성 가능 — 제출 전 점검 14곳 — 설계값 10 · 공고 요건 4」이 그랬다(23-10).
  const dashes = line => [...String(line).matchAll(/—/g)].length;
  for (const input of [{ applicant: SAMPLE_APPLICANT, projectValues: TYPED }, { applicant: SAMPLE_APPLICANT, projectValues: SAVED }, SPARSE]) {
    const { verdict } = plan(input);
    assert.ok(dashes(verdict) <= 1, `줄표가 ${dashes(verdict)}개다 — ${verdict}`);
  }
  // 갈래 셋을 모두 그려 볼 수는 없으므로 판정을 만드는 자리에서도 본다.
  const from = source.indexOf('const headline = ');
  const branches = source.slice(from, source.indexOf(';', from)).match(/`[^`]*`|'[^']*'/g) || [];
  assert.ok(branches.length >= 3, '갈래를 못 찾았다');
  for (const branch of branches) {
    assert.ok(dashes(branch) <= 1, `갈래에 줄표가 둘이다 — ${branch}`);
    // 앞머리 「초안 작성 가능」은 사라졌다. 갈색 「초안 작성」 버튼이 같은 말을 한다.
    assert.ok(!branch.includes('초안 작성 가능'), `앞머리가 남아 있다 — ${branch}`);
  }
});

test('★ 「먼저 답할 질문」과 요약 칸 「확인 필요」는 다른 값에서 나온다', () => {
  // 샘플 공고에서는 둘이 우연히 같다. 자료를 바꾸면 갈린다 —
  // 질문은 일곱에서 자르므로 확인 필요 항목이 여덟이 되는 순간 둘이 벌어진다.
  const 겹쳐보이는 = plan({ applicant: SAMPLE_APPLICANT, projectValues: TYPED });
  assert.equal(겹쳐보이는.byStatus.NEEDS_CONFIRMATION, 4);
  assert.equal(askedCount(겹쳐보이는), 4);
  const 갈리는 = plan(SPARSE);
  assert.equal(갈리는.byStatus.NEEDS_CONFIRMATION, 13);
  assert.equal(askedCount(갈리는), 7, '일곱에서 자르지 않고 있다');
  assert.notEqual(갈리는.byStatus.NEEDS_CONFIRMATION, askedCount(갈리는));
  // 화면도 같은 방식으로 센다. 자르는 자리가 사라지면 여기서 걸린다.
  assert.match(app, /const coreQuestions = blueprint\.openQuestions\.filter\(entry => coreTitles\.has\(entry\.section\)\)\.slice\(0, 7\);/);
});

// ---------- 그려진 화면 ----------

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
const USER = { id: 'nn', email: 'nn@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' };
const EMPTY = { ok: true, notices: [], proposals: [], applicants: [], accounts: [], items: [], events: [], users: [], profile: {} };
globalThis.fetch = async (path, options = {}) => {
  const body = JSON.parse(options?.body || '{}');
  return { ok: true, status: 200, json: async () => (path === '/api/auth' && body.action === 'me' ? { ...EMPTY, user: USER } : EMPTY) };
};

let screen = 0;
async function drawDesign() {
  const projectValues = [...(SNAPSHOT.projectValues || []), { id: 'v-type', blueprintKey: 'applicationType', label: '신청유형', value: '기초형' }];
  frozen = JSON.stringify({ activeTool: 'workflow', step: 3, homeSeen: true, ...SNAPSHOT, projectValues, applicants: SAMPLE_APPLICANTS });
  const mine = fakeEl();
  root = mine;
  screen += 1;
  await import(`../src/app.js?name=${screen}`);
  for (let i = 0; i < 800; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (String(mine.innerHTML).includes('id="project-blueprint"')) break;
  }
  const html = String(mine.innerHTML);
  frozen = null;
  return html.slice(html.indexOf('id="project-blueprint"'));
}

test('★ 화면의 숫자마다 무엇을 세는지 붙어 있다', async () => {
  const body = await drawDesign();
  // 제출 전 점검 — 나뉜 두 수가 함께 나온다.
  const split = body.match(/제출 전 점검 (\d+)곳 — 설계값 (\d+) · 공고 요건 (\d+)/);
  assert.ok(split, '제출 전 점검이 나뉜 수를 말하지 않는다');
  assert.equal(Number(split[2]) + Number(split[3]), Number(split[1]), `${split[2]} + ${split[3]} ≠ ${split[1]}`);
  // 요약 칸 — 무엇 중의 몇인지 말한다.
  const tile = Number((body.match(/<span>확인 필요<\/span><strong>(\d+)<\/strong><small>설계 항목 (\d+)개 중/) || [, NaN])[1]);
  const total = Number((body.match(/<span>확인 필요<\/span><strong>\d+<\/strong><small>설계 항목 (\d+)개 중/) || [, NaN])[1]);
  assert.equal(total, 14);
  assert.ok(tile <= total);
  // 질문은 항목이 아니라 질문이라고 말한다.
  assert.match(body, /<strong>먼저 답할 질문 \d+개<\/strong>/);
  assert.ok(!body.includes('필수 확인'), '「필수 확인」이 남아 있다');
});

test('제출 전 점검 숫자는 한 화면에 한 번만 나온다', async () => {
  const body = await drawDesign();
  assert.equal([...body.matchAll(/제출 전 점검 \d+곳/g)].length, 1);
  // 딱지 줄은 상태만 말하고 숫자를 되풀이하지 않는다.
  assert.match(body, /<span class="status 부분-충족">제출 전 확인이 필요한 항목이 있습니다<\/span>/);
  assert.ok(!/제출 전 확인이 필요한 항목이 있습니다 · \d+개/.test(body), '딱지가 같은 숫자를 다시 말한다');
});
