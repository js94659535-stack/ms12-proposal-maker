// 확인-필요 빛깔 딱지 셋 가르기 (23-07).
//
// 실제로 났던 일: 설계도 한 장에 똑같이 생긴 딱지가 아홉인데 글자는 셋이었다.
//   「확인 필요」 설계 항목 — 사용자가 답해야 한다. 띠가 세는 것은 이것뿐이다
//   「미대응」   공고 선정요건 — 설계가 아직 닿지 않았다
//   「선택 가능」 신청유형 보기 — 고를 수 있다. 문제가 아니다
// 셋이 같은 회색(.status.확인-필요)을 함께 써서 세 바탕의 대비가 1.00이었다.
// 그래서 눈으로 세면 아홉인데 띠는 넷이라고 말했다(23-05). 23-06에서 숫자는 맞췄고,
// 남은 「많아 보임」이 빛깔 탓임을 여기서 갈랐다.
//
// 새 색은 만들지 않았다. 「확인 필요」는 이미 있던 .status.부족 규칙에 이름만 얹었고,
// 「선택 가능」은 색이 아니라 모양으로 물러난다 — 채우지 않고 글자색(currentColor)으로 두른다.
// 색만으로 알리지 않는다(22-01④): 자리도 함께 말한다 — 「미대응」은 접힌 줄 안에서만 나온다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contrastAt, toRgb } from '../src/color-contrast.js';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');
const css = read('../src/styles.css');

// ---------- CSS를 규칙 단위로 읽는다. 주석 문구가 아니라 선택자로만 찾는다 ----------

const RULES = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(hit => ({ selector: hit[1].trim(), body: hit[2] }));
const ruleFor = name => RULES.find(rule => rule.selector.split(',').some(one => one.trim().endsWith(`.status.${name}`)));
const TOKENS = Object.fromEntries([...css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map(hit => [hit[1], hit[2]]));
const solve = value => String(value || '').replace(/var\((--[a-z0-9-]+)\)/g, (_, name) => TOKENS[name] || '');
const declare = (rule, name) => solve((rule.body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`)) || [, ''])[1].trim());

// 세 딱지가 실제로 쓰는 표시. 채운 딱지에는 테두리가 없으므로 빈 값이 곧 「채웠다」다.
const BADGE = {
  '확인 필요': '답-필요',
  미대응: '확인-필요',
  '선택 가능': '보기'
};
const look = name => {
  const rule = ruleFor(name);
  assert.ok(rule, `.status.${name} 규칙이 없다`);
  const border = declare(rule, 'border');
  return {
    바탕: declare(rule, 'background') || '#f3f0ee',
    글자: declare(rule, 'color') || '#494039',
    테두리: border === 'none' ? '' : border
  };
};

test('셋은 서로 다른 표시를 쓴다', () => {
  const names = Object.values(BADGE);
  assert.equal(new Set(names).size, 3, '셋이 같은 클래스를 함께 쓴다');
  const looks = names.map(look);
  // 어느 둘도 바탕·글자·테두리가 모두 같지는 않다.
  assert.equal(new Set(looks.map(one => JSON.stringify(one))).size, 3);
  // 「선택 가능」만 채우지 않는다. 나머지 둘은 채운 알약이다.
  assert.ok(look('보기').테두리, '「선택 가능」에 테두리가 없다');
  assert.equal(look('답-필요').테두리, '');
  assert.equal(look('확인-필요').테두리, '');
  assert.equal(look('보기').바탕, '#fff');
});

test('갈린 값을 숫자로 못 박는다', () => {
  const 답 = look('답-필요');
  const 회색 = look('확인-필요');
  const 보기 = look('보기');
  // 「확인 필요」와 「미대응」은 바탕 밝기가 같다 — 1.00이다. 가르는 것은 글자 빛깔이다.
  assert.equal(contrastAt(답.바탕, 회색.바탕), 1);
  assert.equal(contrastAt(답.글자, 회색.글자), 1.76);
  // 밝기 차만으로는 약하다. 붉은 채널이 확실히 벌어져 있어야 색으로 읽힌다.
  assert.ok(toRgb(답.글자)[0] - toRgb(회색.글자)[0] >= 80, '붉은 채널이 덜 벌어졌다');
  // 「선택 가능」과 「미대응」은 글자 빛깔이 같다 — 바탕만으로는 1.12로 갈리지 않는다.
  assert.equal(보기.글자, 회색.글자);
  assert.equal(contrastAt(보기.바탕, 회색.바탕), 1.12);
  // 그래서 테두리가 가른다. 글자색으로 두르므로 흰 바탕 위에서 9.51로 또렷하다.
  assert.match(보기.테두리, /currentColor/);
  assert.equal(contrastAt(보기.글자, 보기.바탕), 9.51);
  // 글자는 셋 다 제 바탕 위에서 읽힌다.
  for (const one of [답, 회색, 보기]) assert.ok(contrastAt(one.글자, one.바탕) >= 4.5, `${one.글자} 글자가 흐리다`);
});

test('초록·갈색은 딱지에 들어오지 않는다', () => {
  // 초록(--go)은 「지금 여기부터 하세요」, 갈색(--blue)은 「이 화면에서 할 수 있는 일」이다.
  // 딱지는 「무엇을 세는가」라서 두 뜻과 겹치면 안 된다(색 규칙).
  const 예약 = ['--go', '--blue', '--camel'];
  for (const name of Object.values(BADGE)) {
    const rule = ruleFor(name);
    for (const token of 예약) {
      assert.ok(!rule.body.includes(`var(${token})`), `.status.${name}가 ${token}을 쓴다`);
      assert.ok(!rule.body.toLowerCase().includes(TOKENS[token].toLowerCase()), `.status.${name}가 ${token} 값을 쓴다`);
    }
  }
});

test('새 색을 만들지 않았다', () => {
  // 「확인 필요」는 규칙을 새로 쓰지 않고 이미 있던 .status.부족 자리에 이름만 얹었다.
  const rule = ruleFor('답-필요');
  assert.ok(rule.selector.split(',').some(one => one.trim() === '.status.부족'), '붉은색 값을 따로 적었다');
  // 「선택 가능」이 쓰는 색 둘은 CSS 다른 곳에도 있던 값이다.
  const 보기 = ruleFor('보기');
  for (const value of ['#fff', '#4d443c']) {
    const 전체 = [...css.matchAll(new RegExp(value.replace('#', '#'), 'gi'))].length;
    const 여기 = [...보기.body.matchAll(new RegExp(value, 'gi'))].length;
    assert.ok(전체 - 여기 >= 1, `${value}가 이 규칙에만 있다 — 새로 만든 색이다`);
  }
});

test('딱지를 그리는 자리는 하나다', () => {
  // 빛깔을 고르는 자리가 넷으로 흩어져 있어서 셋이 같은 회색을 함께 쓰게 됐다.
  const from = app.indexOf('function blueprintTypeView(');
  const to = app.indexOf('// 「사업계획서 의뢰 건」 한 장.');
  assert.ok(from > 0 && to > from);
  const region = app.slice(from, to);
  assert.ok(!region.includes('<span class="status '), '설계도가 딱지를 직접 그린다');
  assert.equal([...region.matchAll(/blueprintBadge\(/g)].length, 7);
  assert.match(app, /const blueprintBadge = \(tone, text\) => `<span class="status \$\{tone\}">\$\{escapeHtml\(text\)\}<\/span>`;/);
  assert.match(app, /NEEDS_CONFIRMATION: '답-필요' \};/);
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
const USER = { id: 'bd', email: 'bd@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' };
const EMPTY = { ok: true, notices: [], proposals: [], applicants: [], accounts: [], items: [], events: [], users: [], profile: {} };
globalThis.fetch = async (path, options = {}) => {
  const body = JSON.parse(options?.body || '{}');
  return { ok: true, status: 200, json: async () => (path === '/api/auth' && body.action === 'me' ? { ...EMPTY, user: USER } : EMPTY) };
};

let screen = 0;
async function drawDesign({ typeChosen = false } = {}) {
  const { SAMPLE_APPLICANTS, buildSampleProject, sampleProposalSnapshot } = await import('../src/sample-project.js');
  const snapshot = sampleProposalSnapshot(buildSampleProject());
  const projectValues = typeChosen
    ? [...(snapshot.projectValues || []), { id: 'v-type', blueprintKey: 'applicationType', label: '신청유형', value: '기초형' }]
    : snapshot.projectValues;
  frozen = JSON.stringify({ activeTool: 'workflow', step: 3, homeSeen: true, ...snapshot, projectValues, applicants: SAMPLE_APPLICANTS });
  const mine = fakeEl();
  root = mine;
  screen += 1;
  await import(`../src/app.js?badge=${screen}`);
  for (let i = 0; i < 800; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (String(mine.innerHTML).includes('id="project-blueprint"')) break;
  }
  const html = String(mine.innerHTML);
  frozen = null;
  return html.slice(html.indexOf('id="project-blueprint"'));
}
// 준비 상태 한 줄. 화면 전체가 지금 어디까지 왔는지 말하는 문장이라 딱지 셋과 세는 것이 다르고,
// 화면에 한 번만 나오며 셀 수 있는 항목이 아니다. 회색을 「미대응」과 함께 쓰는 넷째가 이것이다.
const READINESS = '신청유형을 먼저 선택하세요';
const badges = body => [...body.matchAll(/<span class="status ([^"]*)">([^<]*)<\/span>/g)]
  .map(hit => ({ tone: hit[1], text: hit[2], at: hit.index }));

test('★ 화면에서 셋이 서로 다른 표시로 나온다', async () => {
  for (const typeChosen of [false, true]) {
    const body = await drawDesign({ typeChosen });
    const drawn = badges(body);
    for (const [text, tone] of Object.entries(BADGE)) {
      const mine = drawn.filter(one => one.text === text);
      if (!mine.length) continue;
      assert.deepEqual([...new Set(mine.map(one => one.tone))], [tone], `「${text}」가 ${tone}로 나오지 않는다`);
    }
    // 같은 표시를 두 낱말이 나눠 쓰지 않는다. 준비 상태 한 줄만 빼고 본다.
    for (const tone of Object.values(BADGE)) {
      const words = new Set(drawn.filter(one => one.tone === tone).map(one => one.text));
      words.delete(READINESS);
      assert.ok(words.size <= 1, `${tone}를 ${[...words].join('·')}가 함께 쓴다`);
    }
    // 회색을 함께 쓰는 것은 그 문장 하나뿐이다. 다섯째가 끼어들면 여기서 걸린다.
    const grey = new Set(drawn.filter(one => one.tone === '확인-필요').map(one => one.text));
    assert.deepEqual([...grey].filter(word => word !== '미대응' && word !== READINESS), []);
  }
});

test('자리도 갈린다 — 「미대응」은 접힌 줄 안에서만 나온다', async () => {
  const body = await drawDesign({ typeChosen: true });
  const fold = body.indexOf('공고 선정요건 점검');
  assert.ok(fold > 0);
  const drawn = badges(body);
  assert.ok(drawn.filter(one => one.text === '미대응').every(one => one.at > fold), '「미대응」이 접힌 줄 밖에 있다');
  assert.ok(drawn.filter(one => one.text === '확인 필요').every(one => one.at < fold), '「확인 필요」가 접힌 줄 안에 있다');
});

test('★ 신청유형 칸이 제 항목의 상태 딱지를 단다', async () => {
  // 「선택 가능」은 보기에 붙는 말이라, 이 칸이 「확인 필요」 열넷에 든다는 것을 화면에서 볼 수 없었다 —
  // 유형을 고르기 전에는 요약 칸 5와 카드 딱지 4로 갈렸다. 이제 화면에서 셀 수 있는 수가 요약 칸과 같다.
  for (const [typeChosen, tone, text, count] of [[false, '답-필요', '확인 필요', 5], [true, '충족', '확정', 4]]) {
    const body = await drawDesign({ typeChosen });
    assert.match(body, new RegExp(`<h4 style="margin:0">신청유형 <span class="status ${tone}">${text}</span></h4>`));
    const tile = Number((body.match(/<span>확인 필요<\/span><strong>([0-9]+)<\/strong>/) || [, NaN])[1]);
    const drawn = badges(body).filter(one => one.text === '확인 필요' && one.tone === '답-필요').length;
    assert.equal(tile, count);
    assert.equal(drawn, count, `요약 칸 ${tile}인데 화면에 ${drawn}개다`);
  }
});
