// 초록 세 고리가 실제로 그려진 화면에서 이어지는지 본다 (22-53④⑤).
//
// 실제로 났던 일: 띠가 「확인하러 가기」라고 말해서 눌렀는데, 데려간 자리에는 아무 표시도 없었다.
// 확인 전인 것이 실적이 아니라 이용자·인력 쪽이면 그 구역에는 「모두 확인」 단추 자체가 없었다.
// 22-25에서 만든 화살표(➜)가 화면에 없다는 말도 같은 뿌리다 — 화살표는 초록에 매여 있는데
// 초록이 붙을 자리가 아예 없었으니 그릴 것도 없었다.
//
// 그래서 소스만 보지 않고 그려진 글자를 본다. 세 고리가 하나라도 빠지면 여기서 걸린다.
//   ① 띠 — 꽉 찬 초록 버튼 하나
//   ② 그 자리 — 그 구역 카드에 초록 테두리(go-place)
//   ③ 거기서 할 일 — 그 안의 「N건 모두 확인」에 초록 테두리와 화살표(go-target)
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
// 화면 하나를 그리는 동안 저장을 잠근다.
// 앞 화면이 남긴 뒷정리(자동 저장)가 뒤 화면이 세워 둔 상태를 덮어써서, 어떤 갈래를 보고 있는지가
// 실행할 때마다 달라졌다. 시험은 세워 둔 그대로를 읽어야 한다.
const SCREEN_KEY = 'ms12_project_v3';
let frozen = null;
globalThis.localStorage = {
  getItem: key => (key === SCREEN_KEY && frozen !== null ? frozen : (store.has(key) ? store.get(key) : null)),
  setItem: (key, value) => { if (key === SCREEN_KEY && frozen !== null) return; store.set(key, String(value)); },
  removeItem: key => store.delete(key)
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const fakeEl = () => new Proxy({ innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} } }, {
  get: (target, prop) => (prop in target ? target[prop] : (typeof prop === 'string' && prop.startsWith('on') ? undefined : () => {})),
  set: (target, prop, value) => { target[prop] = value; return true; }
});
// 화면마다 새 그릇을 준다. app.js 는 시작할 때 #app 을 한 번 잡아 두므로,
// 그릇을 갈아 주면 앞 화면이 늦게 부르는 다시 그리기가 이번 화면을 덮어쓰지 못한다.
let root = fakeEl();
globalThis.document = { querySelector: selector => (selector === '#app' ? root : null), querySelectorAll: () => [], addEventListener() {}, createElement: () => fakeEl(), body: { append() {} } };
globalThis.window = { addEventListener() {}, innerWidth: 1400, innerHeight: 900, matchMedia: () => ({ matches: false, addEventListener() {} }) };
const SESSION_USER = { id: 'chain-user', email: 'chain@example.com', role: 'customer', status: 'active', plan: 'full', provider: 'email' };
const EMPTY = { ok: true, notices: [], proposals: [], applicants: [], accounts: [], items: [], events: [], users: [], profile: {} };
globalThis.fetch = async (path, options = {}) => {
  const body = JSON.parse(options?.body || '{}');
  return { ok: true, status: 200, json: async () => (path === '/api/auth' && body.action === 'me' ? { ...EMPTY, user: SESSION_USER } : EMPTY) };
};
// 세션 확인과 뒤따르는 조회가 끝날 때까지 기다린다. 정해진 횟수만 돌리면 기계가 바쁠 때
// 로그인 화면을 찍고 지나가 시험이 들쭉날쭉해진다. 기다리는 것이 무엇인지를 보고 멈춘다.
const settle = async (el, until) => {
  // 기계가 바쁘면 세션 확인이 늦다. 횟수를 넉넉히 두어 덜 그려진 화면을 찍고 지나가지 않게 한다.
  for (let i = 0; i < 800; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (until(String(el.innerHTML))) return;
  }
};

const item = (id, area, label, value, status, source = '2026 연혁에서 추출') => ({
  id, area, label, value, status, source, origin: '파일 추출', asOf: '2026', history: []
});
// 실적은 이미 모두 확인했고(96건을 한 번에 올린 뒤의 상태) 다른 구역만 확인 전으로 남았다.
// 사용자가 실제로 걸린 자리가 이 상태다.
const applicant = (extra = []) => ({
  id: 'org-1', name: '(주)마인드스토리', note: '', updatedAt: '2026-08-20T00:00:00.000Z', sources: [], items: [
    item('b1', 'basic', '기관명', '(주)마인드스토리', '확인됨', '사업자등록증에서 추출'),
    item('b2', 'basic', '대표자', '박종석', '확인됨', '사업자등록증에서 추출'),
    item('p1', 'performance', '2026년 사업실적', '벧엘지역아동센터 미래설계 AI진로동화', '확인됨'),
    item('p2', 'performance', '2025년 사업실적', '광주 남구 가족센터 진로 설계프로그램', '확인됨'),
    ...extra
  ]
});
const quick = { orgName: '(주)마인드스토리', orgType: '주식회사', contact: '박종석 010-0000-0000' };
const open = (state, id = 'org-1') => ({ ...state, selectedApplicantId: id, applicantEditingId: id });

let screen = 0;
async function draw(state) {
  frozen = JSON.stringify({ activeTool: 'applicants', homeSeen: true, ...state });
  const mine = fakeEl();
  root = mine;
  screen += 1;
  await import(`../src/app.js?chain=${screen}`);
  // 「다음 할 일」 띠가 그려졌으면 이 화면이 다 그려진 것이다.
  await settle(mine, html => html.includes('id="next-step-bar"') || html.includes('등록된 신청기관이 없습니다'));
  const html = String(mine.innerHTML);
  frozen = null;
  return html;
}

test('확인 전이 실적 밖이면 그 구역이 초록이 되고 거기서 누를 것이 있다', async () => {
  const html = await draw(open({
    applicants: [applicant([item('c1', 'clients', '이용 인원', '연 1,200명', '확인 필요'), item('c2', 'clients', '연령대', '초등 4~6학년', '확인 필요')])],
    quickOrg: quick
  }));

  // ① 띠 — 꽉 찬 초록 버튼 하나가 「확인하러 가기」라고 말한다.
  assert.match(html, /class="button go next-step" id="next-step-action"/);
  assert.match(html, /확인하러 가기/);
  // 띠는 이용자 구역으로 데려간다. 바깥 카드까지만 데려다 놓지 않는다.
  assert.match(html, /data-next-anchor="\[data-detail-group=&quot;clients&quot;\]"/);

  // ② 그 자리 — 이용자 구역 카드에 초록 테두리가 붙고, 접혀 있지 않다.
  assert.match(html, /class="card org-details go-place" data-detail-group="clients" open/);

  // ③ 거기서 할 일 — 그 구역의 「2건 모두 확인」이 초록이다. 화살표는 이 클래스에 매여 있다.
  assert.match(html, /class="button secondary summary-action go-target" data-confirm-group="clients">2건 모두 확인<\/button>/);

  // 초록은 그 구역 하나뿐이다. 실적은 이미 다 확인해서 단추도 초록도 없다.
  assert.equal([...html.matchAll(/go-target/g)].length, 1);
  assert.equal([...html.matchAll(/go-place/g)].length, 1);
  assert.doesNotMatch(html, /data-confirm-group="performance"/);
});

test('확인 전이 실적이면 실적 구역이 초록이 된다', async () => {
  const base = applicant();
  const html = await draw(open({
    applicants: [{ ...base, items: base.items.map(entry => (entry.area === 'performance' ? { ...entry, status: '확인 필요' } : entry)) }],
    quickOrg: quick
  }));
  assert.match(html, /class="card org-details go-place" data-detail-group="performance" open/);
  assert.match(html, /class="button secondary summary-action go-target" data-confirm-group="performance">2건 모두 확인<\/button>/);
  // 띠는 데려가지 않고 그 자리에서 끝낸다.
  assert.match(html, /data-next-bulk="1"/);
});

test('빈 칸을 채우라고 할 때는 그 칸에 화살표와 글자가 함께 붙는다', async () => {
  // 자료 어디에도 답이 없는 기관이라야 「채우세요」가 남는다. 답이 있으면 묻지 않고 넣는다(22-53②).
  const bare = {
    id: 'org-2', name: '햇살센터', note: '', updatedAt: '2026-08-20T00:00:00.000Z', sources: [],
    items: [item('x1', 'facilities', '운영 시설', '상담실 2실', '확인됨')]
  };
  const html = await draw(open({ applicants: [bare], quickOrg: { orgName: '햇살센터' } }, 'org-2'));
  // 기본정보 카드가 「그 자리」, 첫 빈 칸이 「거기서 할 일」이다.
  assert.match(html, /class="card org-details go-place" id="applicant-editor"/);
  assert.match(html, /class="field go-target"/);
  // 색만으로 알리지 않는다.
  assert.match(html, /class="go-note">여기를 채우세요<\/small>/);
  assert.match(html, /data-next-key="basic"/);
});

test('어느 갈래에서도 가리키는 자리가 반드시 하나 있다', async () => {
  // 22-53④의 답. 화살표가 안 보이던 까닭은 초록이 붙을 자리가 아예 없어서였다.
  const bare = { id: 'org-3', name: '햇살센터', note: '', updatedAt: '2026-08-20T00:00:00.000Z', sources: [], items: [] };
  const cases = [
    ['기관이 없다', { applicants: [] }],
    ['등록된 기관 정보가 0건이다', open({ applicants: [bare], quickOrg: { orgName: '햇살센터', orgType: '지역아동센터', contact: '김담당' } }, 'org-3')],
    ['확인 전이 인력 쪽이다', open({ applicants: [applicant([item('s1', 'staff', '상근 인력', '5명', '확인 필요')])], quickOrg: quick })]
  ];
  for (const [label, state] of cases) {
    const html = await draw(state);
    assert.match(html, /go-target/, `${label}: 가리키는 자리가 없습니다`);
    assert.match(html, /go-place/, `${label}: 데려간 자리에 테두리가 없습니다`);
  }
});

test('올린 자료에 답이 있는 칸은 화면을 열자마자 채워진다', async () => {
  // 22-53②. 22-33에서 넣기로 했는데 세 사건에만 매여 있어 새로고침하면 비어 있었다.
  const html = await draw(open({
    applicants: [applicant([
      item('t1', 'programs', '업태', '서비스', '확인 필요', '사업자등록증에서 추출'),
      item('t2', 'programs', '종목', '교육서비스업', '확인 필요', '사업자등록증에서 추출')
    ])],
    quickOrg: { orgName: '(주)마인드스토리', contact: '박종석 010-0000-0000' }
  }));
  // 22-53①. 기관 유형은 등록증에서 읽은 이름으로 고르고, 어디서 골랐는지 밝힌다.
  assert.match(html, /<option value="주식회사" selected>주식회사<\/option>/);
  assert.match(html, /등록증의 기관명에 적힌 「\(주\)」로 골랐습니다/);
  // 주로 돕는 대상·강점도 채워지고 근거를 함께 적는다.
  assert.match(html, /id="quick-served" data-quick-field="served" value="아동 · 가족"/);
  assert.match(html, /id="quick-strength" data-quick-field="strength" value="업태 서비스 · 종목 교육서비스업 \//);
  assert.match(html, /등록증 업태 서비스 · 종목 교육서비스업/);
  assert.match(html, /잘한다는 판단이 아니라 등록된 값과 건수입니다/);
});
