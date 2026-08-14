// 공모정보 검색. 맞춤검색·광역검색의 범위와 결과 순위, 공개 범위를 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as publicRoute } from '../functions/api/public.js';
import { onRequest as adminRoute } from '../functions/api/admin.js';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';
import { DEFAULT_MODE, RANK, compactText, deadlineState, findDuplicates, keywordsOf, normalizeText, parseQuery, publicNotice, rankNotice, searchMode } from '../server/notice-search.js';
import { fakeDb } from './fixtures/fake-d1.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const publicSource = fs.readFileSync(new URL('../functions/api/public.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0008_notice_search.sql', import.meta.url), 'utf8');
const middlewareSource = fs.readFileSync(new URL('../functions/api/_middleware.js', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'test-only-passphrase-9241';

// 제목·요약이 서로 다른 자료를 두어 어느 범위에서 걸리는지 가른다.
const NOTICES = [
  { key: 'a', title: '아동 정서지원 사업', summary: '지역 아동의 정서 회복을 돕는 프로그램', eligibility: '아동복지 기관', deadline: '2099-12-31', organizer: '중앙회' },
  { key: 'b', title: '청년 창업 지원사업', summary: '아동 돌봄 분야 창업도 신청할 수 있습니다', eligibility: '예비창업자', deadline: '2099-11-30', organizer: '서울지회' },
  { key: 'c', title: '복권기금 가족기능 강화사업', summary: '가정 기능 회복 지원', eligibility: '가족센터', deadline: '2099-10-31', organizer: '중앙회' },
  { key: 'd', title: '지난 노인 돌봄 사업', summary: '어르신 방문 돌봄', eligibility: '노인복지관', deadline: '2020-01-01', organizer: '부산광역시' }
];

function seedNotices(db, rows = NOTICES) {
  db.tables.archived_notices = rows.map(row => ({
    source_key: row.key, source: 'central', source_label: row.organizer, list_sn: row.key, dstb_bsns_code: row.key,
    title: row.title, deadline: row.deadline, application_period: `2026-01-01 ~ ${row.deadline}`,
    summary: row.summary, eligibility: row.eligibility, support_details: '프로그램 운영비', support_limit: '100,000,000',
    content_hash: `hash-${row.key}`, notice_json: JSON.stringify({ secret: '본문 원문 전체', title: row.title }),
    first_seen_at: '2026-08-07T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z',
    region: '', audience: '', field: '', source_url: row.url || '', last_checked_at: '2026-08-10T00:00:00.000Z',
    duplicate_of: '', is_public: row.isPublic === undefined ? 1 : row.isPublic,
    search_title: '', search_keywords: '', search_summary: ''
  }));
}
function post(path, body, { cookie = '' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9' };
  if (cookie) headers.Cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}
const cookieOf = response => `${SESSION_COOKIE}=${/__Host-ms12_session=([a-f0-9]{64})/.exec(response.headers.get('set-cookie') || '')?.[1] || ''}`;
const ROUTES = { public: publicRoute, admin: adminRoute, auth: authRoute };

async function through(db, request, route) {
  const data = {};
  const env = { ARCHIVE_DB: db };
  const blocked = await middleware({ request, env, data, next: async () => null });
  if (blocked) return blocked;
  return ROUTES[route]({ request, env, data });
}
// 공모정보 검색은 이제 로그인해야 열린다. 등급별로 범위가 다르므로 시험용 계정을 만들어 쓴다.
async function seedMember(db, { id, email, status = 'active', premium = false }) {
  db.tables.users.push({
    id, email, role: 'customer', status, org_id: '', name: '', ...(await createPasswordRecord(PASSWORD)),
    plan: 'trial', trial_used_at: '', phone: '', org_name: '', is_contact: 0,
    terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: '',
    profile_updated_at: '', profile_review_needed: 0,
    created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
  });
  if (premium) {
    db.tables.premium_contracts.push({
      user_id: id, status: 'active', started_on: '2026-01-01', ends_on: '2099-12-31', progress: '접수',
      progress_note: '', contract_name: '계약', granted_by: 'admin-1',
      created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
    });
  }
  return cookieOf(await through(db, post('/api/auth', { action: 'login', email, password: PASSWORD }), 'auth'));
}

// 정식회원 세션으로 검색한다. 등급 확인이 목적인 시험은 따로 계정을 만든다.
async function memberDb(rows) {
  const db = fakeDb();
  seedNotices(db, rows);
  const cookie = await seedMember(db, { id: 'member-1', email: 'member@ms12.test' });
  return { db, cookie };
}

let sharedMember = null;
async function sharedSearch(db, query, mode, filters) {
  // 순위·필터 시험은 범위 제한과 무관해야 하므로 전체를 볼 수 있는 프리미엄 세션으로 돈다.
  if (!sharedMember || sharedMember.db !== db) sharedMember = { db, cookie: await seedMember(db, { id: `m-${db.tables.users.length}`, email: `m${db.tables.users.length}@ms12.test`, premium: true }) };
  return through(db, post('/api/public', { action: 'searchNotices', query, mode, filters }, { cookie: sharedMember.cookie }), 'public');
}
const search = (db, query, mode, filters) => sharedSearch(db, query, mode, filters);
const keysOf = async response => (await response.json()).notices.map(item => item.key);

async function withAdmin() {
  const db = fakeDb();
  seedNotices(db);
  db.tables.users.push({
    id: 'admin-1', email: 'admin@ms12.test', role: 'admin', status: 'active', org_id: '', name: '',
    ...(await createPasswordRecord(PASSWORD)), plan: 'full', trial_used_at: '', phone: '', org_name: '', is_contact: 0,
    terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: '',
    created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
  });
  const cookie = cookieOf(await through(db, post('/api/auth', { action: 'login', email: 'admin@ms12.test', password: PASSWORD }), 'auth'));
  return { db, cookie };
}

test('검색어는 띄어쓰기·대소문자·특수문자 차이를 가리지 않고 한국어 부분검색을 지원한다', () => {
  assert.equal(normalizeText('  [거점유형] 2027년   복권기금/아동·청소년! '), '거점유형 2027년 복권기금 아동 청소년');
  assert.equal(compactText('가족 기능'), '가족기능');
  assert.deepEqual(parseQuery('아동, 정서  지원'), ['아동', '정서', '지원']);
  assert.deepEqual(parseQuery('AI 지원'), ['ai', '지원']);
  // 낱말 하나가 두 글자여도 낱말 안의 부분으로 찾는다.
  const row = { title: '복권기금 가족기능 강화사업', source_label: '중앙회', source: 'central', summary: '', eligibility: '', support_limit: '', application_period: '' };
  assert.equal(rankNotice({ ...row, search_title: normalizeText(row.title), search_keywords: keywordsOf(row) }, ['기금'], 'focused'), RANK.titlePart);
  assert.equal(searchMode('없는모드'), DEFAULT_MODE);
  assert.equal(DEFAULT_MODE, 'focused', '기본은 결과 정확도가 높은 맞춤검색이다');
});

test('맞춤검색은 제목과 연관 키워드만 보고 요약은 보지 않는다', async () => {
  const db = fakeDb();
  seedNotices(db);
  // 「창업」은 b의 제목에 있고 b의 요약에도 있다. a·c·d와는 무관하다.
  assert.deepEqual(await keysOf(await search(db, '창업', 'focused')), ['b']);
  // 「아동」은 a의 제목에 있고 b에는 요약에만 있다. 맞춤검색은 a만 찾는다.
  assert.deepEqual(await keysOf(await search(db, '아동', 'focused')), ['a']);
  // 「방문」·「회복」은 요약에만 있는 말이라 맞춤검색에서는 걸리지 않는다.
  assert.deepEqual(await keysOf(await search(db, '방문', 'focused')), []);
  assert.deepEqual(await keysOf(await search(db, '회복', 'focused')), []);
  // 「어르신」은 제목의 「노인」에 이어진 연관 키워드라 맞춤검색에서도 걸린다.
  assert.deepEqual(await keysOf(await search(db, '어르신', 'focused')), ['d']);
});

test('광역검색은 맞춤검색 범위에 요약을 더하고 제목 일치를 먼저 보여 준다', async () => {
  const db = fakeDb();
  seedNotices(db);
  // 요약에만 있던 자료가 광역검색에서는 걸린다.
  assert.deepEqual(await keysOf(await search(db, '방문', 'broad')), ['d']);
  // 「회복」은 a·c 두 자료의 요약에 있다. 둘 다 광역검색에서만 걸린다.
  assert.deepEqual((await keysOf(await search(db, '회복', 'broad'))).sort(), ['a', 'c']);

  // 「아동」은 a가 제목, b가 요약이다. 광역검색이어도 제목이 먼저다.
  const both = await (await search(db, '아동', 'broad')).json();
  assert.deepEqual(both.notices.map(item => item.key), ['a', 'b']);
  assert.equal(both.notices[0].matchedBy, '제목 포함');
  assert.equal(both.notices[1].matchedBy, '요약 내용 일치');
  assert.equal(both.mode, 'broad');
  assert.equal(both.modeLabel, '광역검색');
});

test('결과 순위는 제목 전체 일치 → 제목 포함 → 연관 키워드 → 요약 순이다', async () => {
  const db = fakeDb();
  seedNotices(db, [
    { key: 'exact', title: '아동 정서지원', summary: '설명', eligibility: '', deadline: '2099-12-31', organizer: '가기관' },
    { key: 'part', title: '2027년 아동 정서지원 확대사업', summary: '설명', eligibility: '', deadline: '2099-12-31', organizer: '나기관' },
    { key: 'keyword', title: '어린이 마음 돌봄', summary: '설명', eligibility: '', deadline: '2099-12-31', organizer: '다기관' },
    { key: 'summary', title: '지역 협력 사업', summary: '아동 정서지원 프로그램을 함께 운영', eligibility: '', deadline: '2099-12-31', organizer: '라기관' }
  ]);
  // 「아동」의 연관 키워드에 「어린이」가 이어져 있어 제목만으로도 keyword 등급으로 걸린다.
  const broad = await (await search(db, '아동 정서지원', 'broad')).json();
  assert.deepEqual(broad.notices.map(item => item.key), ['exact', 'part', 'summary']);
  assert.deepEqual(broad.notices.map(item => item.matchedBy), ['제목 전체 일치', '제목 포함', '요약 내용 일치']);

  const keyword = await (await search(db, '어린이', 'focused')).json();
  assert.deepEqual(keyword.notices.map(item => [item.key, item.matchedBy]), [['keyword', '제목 포함'], ['exact', '연관 키워드 일치'], ['part', '연관 키워드 일치']]);
});

test('공고 원문 전체는 검색 범위에도 응답에도 들어가지 않는다', async () => {
  const db = fakeDb();
  seedNotices(db);
  // notice_json 안에만 있는 말은 어느 방식으로도 찾히지 않는다.
  assert.deepEqual(await keysOf(await search(db, '본문 원문 전체', 'broad')), []);
  const body = await (await search(db, '아동', 'broad')).text();
  assert.ok(!body.includes('본문 원문 전체'), '응답에 공고 본문이 나갔다');
  // SELECT 문에 본문 열이 없다.
  assert.doesNotMatch(publicSource, /SELECT[^;`]*notice_json/);
  // 회원 자료 표를 이 경로의 어떤 SQL에서도 읽지 않는다(주석에 이름이 나오는 것은 설명이다).
  for (const table of ['archived_proposals', 'applicant_organizations', 'users', 'sessions', 'coaching_jobs']) {
    assert.doesNotMatch(publicSource, new RegExp(`(FROM|INTO|UPDATE|JOIN)\\s+${table}\\b`), table);
  }
  // 공고 표와, 등급을 판정할 계약 표만 읽는다. 회원 계획서·기관 자료는 읽지 않는다.
  assert.deepEqual([...new Set([...publicSource.matchAll(/FROM\s+(\w+)/g)].map(match => match[1]))].sort(), ['archived_notices', 'premium_contracts']);
  // 검색은 AI·외부 호출을 하지 않는다.
  assert.doesNotMatch(publicSource, /openai|fetch\(/i);
});

test('비회원에게는 공개 항목만 나가고 회원가입 안내가 함께 온다', async () => {
  const db = fakeDb();
  seedNotices(db);
  const body = await (await search(db, '아동', 'focused')).json();
  const [notice] = body.notices;
  assert.deepEqual(Object.keys(notice).sort(), [
    'applicationPeriod', 'audience', 'deadline', 'eligibility', 'field', 'key', 'matchedBy', 'organizer',
    'region', 'sourceLabel', 'sourceUrl', 'state', 'stateLabel', 'summary', 'supportAmount', 'title'
  ]);
  assert.ok(notice.summary && notice.eligibility && notice.applicationPeriod && notice.supportAmount && notice.sourceLabel);
  assert.match(body.signupNotice, /회원가입/);
  // 내부 운영 항목은 비회원 응답에 없다.
  for (const key of ['isPublic', 'collectedAt', 'lastCheckedAt', 'duplicate', 'contentHash', 'noticeJson']) {
    assert.equal(Object.hasOwn(notice, key), false, key);
  }
});

test('비공개로 표시한 자료는 어느 등급에게도 나오지 않는다', async () => {
  const db = fakeDb();
  seedNotices(db, [{ ...NOTICES[0], isPublic: 0 }, NOTICES[1]]);
  // 전체 이력을 볼 수 있는 프리미엄 세션에도 비공개 자료는 나오지 않는다.
  assert.deepEqual(await keysOf(await search(db, '', 'broad')), ['b']);
  const detail = await through(db, post('/api/public', { action: 'noticeDetail', key: 'a' }, { cookie: sharedMember.cookie }), 'public');
  assert.equal(detail.status, 404);
});

test('모집 상태·지역·대상·분야·주최기관으로 좁혀 볼 수 있다', async () => {
  const db = fakeDb();
  seedNotices(db);
  const all = await (await search(db, '', 'broad')).json();
  assert.equal(all.total, 4);
  // 마감이 지난 자료는 「마감」으로 표시된다.
  assert.equal(all.notices.find(item => item.key === 'd').state, 'closed');
  assert.deepEqual(await keysOf(await search(db, '', 'broad', { state: 'closed' })), ['d']);
  assert.deepEqual(await keysOf(await search(db, '', 'broad', { organizer: '부산' })), ['d']);
  assert.deepEqual((await keysOf(await search(db, '', 'broad', { audience: '노인' }))), ['d']);
  assert.deepEqual((await keysOf(await search(db, '', 'broad', { audience: '가족' }))).sort(), ['c']);
  // 필터 후보는 실제 자료에서만 센다.
  assert.ok(all.facets.organizer.some(item => item.value === '중앙회' && item.total === 2));
  assert.ok(all.facets.state.some(item => item.value === 'closed' && item.total === 1));
  assert.equal(deadlineState('2020-01-01', new Date('2026-08-11T00:00:00Z')), 'closed');
  assert.equal(deadlineState('2026-08-14', new Date('2026-08-11T00:00:00Z')), 'closing');
  assert.equal(deadlineState('2027-08-14', new Date('2026-08-11T00:00:00Z')), 'open');
});

test('공모정보 검색은 로그인 없이 열리고 다른 경로는 그대로 막혀 있다', async () => {
  const db = fakeDb();
  seedNotices(db);
  assert.match(middlewareSource, /PUBLIC_PATHS = new Set\(\['\/api\/auth', '\/api\/oauth', '\/api\/public'\]\)/);
  assert.equal((await search(db, '아동', 'focused')).status, 200);
  // 다른 경로는 여전히 로그인이 필요하다.
  for (const path of ['/api/proposal', '/api/archive', '/api/admin', '/api/operator', '/api/account', '/api/activity']) {
    const response = await middleware({ request: post(path, { action: 'x' }), env: { ARCHIVE_DB: db }, data: {}, next: async () => null });
    assert.equal(response?.status, 401, path);
  }
});

test('관리자만 전체 수집자료와 출처·수집일·중복·공개 여부를 본다', async () => {
  const { db, cookie } = await withAdmin();
  db.tables.archived_notices.push({ ...db.tables.archived_notices[0], source_key: 'a-dup', is_public: 0 });

  const listed = await through(db, post('/api/admin', { action: 'listNotices' }, { cookie }), 'admin');
  assert.equal(listed.status, 200);
  const body = await listed.json();
  assert.equal(body.collected, 5);
  assert.equal(body.hidden, 1, '비공개 자료도 관리자에게는 보인다');
  assert.equal(body.duplicates, 1);
  const duplicate = body.notices.find(item => item.key === 'a-dup');
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.duplicateOf, 'a');
  assert.equal(duplicate.isPublic, false);
  for (const key of ['sourceUrl', 'collectedAt', 'lastCheckedAt', 'contentHash']) assert.ok(Object.hasOwn(duplicate, key), key);
  assert.equal(duplicate.collectedAt, '2026-08-07T00:00:00.000Z');

  // 관리자 검색은 공개 여부와 상관없이 전체를 대상으로 한다.
  assert.deepEqual((await (await through(db, post('/api/admin', { action: 'listNotices', query: '어르신' }, { cookie }), 'admin')).json()).notices.map(item => item.key), ['d']);

  // 공개 여부를 바꾸면 비회원 검색 결과가 따라 바뀌고 감사기록이 남는다.
  assert.deepEqual(await keysOf(await search(db, '창업', 'focused')), ['b']);
  const hidden = await through(db, post('/api/admin', { action: 'setNoticePublic', key: 'b', isPublic: false }, { cookie }), 'admin');
  assert.equal(hidden.status, 200);
  assert.deepEqual(await keysOf(await search(db, '창업', 'focused')), []);
  assert.ok(db.tables.admin_audit_log.some(item => item.action === 'notice.hide' && item.target_id === 'b'));
  assert.equal((await through(db, post('/api/admin', { action: 'setNoticePublic', key: 'no-such', isPublic: false }, { cookie }), 'admin')).status, 404);
});

test('중복 판정은 내용 해시와 제목·마감일로만 한다', () => {
  const rows = [
    { source_key: 'a', content_hash: 'h1', title: '아동 사업', deadline: '2026-01-01' },
    { source_key: 'b', content_hash: 'h1', title: '다른 제목', deadline: '2026-02-02' },
    { source_key: 'c', content_hash: 'h2', title: '아동  사업', deadline: '2026-01-01' },
    { source_key: 'd', content_hash: 'h3', title: '전혀 다른 사업', deadline: '2026-03-03' }
  ];
  const marks = findDuplicates(rows);
  assert.equal(marks.get('b'), 'a', '내용 해시가 같으면 중복');
  assert.equal(marks.get('c'), 'a', '띄어쓰기만 다른 제목과 같은 마감일도 중복');
  assert.equal(marks.has('d'), false);
});

test('migration은 기존 공고 자료를 지우지 않고 열만 붙인다', () => {
  for (const column of ['region', 'audience', 'field', 'source_url', 'last_checked_at', 'duplicate_of', 'is_public', 'search_title', 'search_keywords', 'search_summary']) {
    assert.match(migration, new RegExp(`ADD COLUMN ${column} `), column);
  }
  assert.match(migration, /is_public INTEGER NOT NULL DEFAULT 1/, '기존 공모정보는 공개로 시작한다');
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|CREATE TABLE archived_notices/i);
  // 원문 본문은 검색 열에 넣지 않는다.
  assert.doesNotMatch(migration, /(ADD COLUMN|UPDATE)[^;]*notice_json/);
});

test('검색 화면은 두 방식을 고르게 하고 크롤링이라는 말을 쓰지 않는다', () => {
  const view = app.slice(app.indexOf('// ---------- 공모정보 검색 ----------'), app.indexOf('// 로그인 없이 보는 정적 예시'));
  assert.ok(view.length > 1000, '검색 화면을 찾지 못했다');
  assert.match(app, /if \(auth\.view === 'notices'\) \{ app\.innerHTML = noticeSearchView\(\); bindNoticeSearch\(\); return; \}/);
  for (const label of ['맞춤검색', '광역검색', '모집 상태', '지역', '대상', '분야', '주최기관']) assert.ok(view.includes(label), label);
  assert.ok(view.includes("mode: 'focused'") || app.includes("mode: 'focused'"), '기본은 맞춤검색');
  // 사용자 화면에는 「크롤링」이라는 말을 쓰지 않는다.
  assert.doesNotMatch(app, /크롤링/);
  // 검색 화면은 AI 경로를 부르지 않는다.
  assert.doesNotMatch(view, /coreProposalWithAI|analyzeWithAI|fullProposalWithAI/);
});

test('검색 범위는 회원등급이 정하고 서버가 막는다', async () => {
  const db = fakeDb();
  seedNotices(db);
  // 비회원은 실제 자료를 받지 못한다. 결과·건수·필터 후보가 모두 없다.
  const anonymous = await through(db, post('/api/public', { action: 'searchNotices', query: '' }), 'public');
  assert.equal(anonymous.status, 401);
  const refused = await anonymous.json();
  assert.equal(refused.needsSignup, true);
  assert.equal(refused.notices, undefined);
  assert.equal(refused.total, undefined);
  assert.equal(refused.facets, undefined);
  // 회원 안내는 로그인 없이도 열린다.
  const plans = await through(db, post('/api/public', { action: 'membershipPlans' }), 'public');
  assert.equal(plans.status, 200);

  // 승인 대기 회원은 403.
  const pending = await seedMember(db, { id: 'p-1', email: 'p1@ms12.test', status: 'pending' });
  const blocked = await through(db, post('/api/public', { action: 'searchNotices', query: '' }, { cookie: pending }), 'public');
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).needsApproval, true);

  // 승인회원은 현재 모집 중인 공고만 본다. 마감 공고 d는 나오지 않는다.
  const member = await seedMember(db, { id: 'm-9', email: 'm9@ms12.test' });
  const open = await through(db, post('/api/public', { action: 'searchNotices', query: '' }, { cookie: member }), 'public');
  const openBody = await open.json();
  assert.deepEqual(openBody.notices.map(item => item.key).sort(), ['a', 'b', 'c']);
  assert.equal(openBody.scope, 'open');
  // 마감 공고 상세도 열리지 않는다.
  const closed = await through(db, post('/api/public', { action: 'noticeDetail', key: 'd' }, { cookie: member }), 'public');
  assert.equal(closed.status, 403);

  // 프리미엄회원은 마감 공고까지 본다.
  const premium = await seedMember(db, { id: 'pm-9', email: 'pm9@ms12.test', premium: true });
  const all = await through(db, post('/api/public', { action: 'searchNotices', query: '' }, { cookie: premium }), 'public');
  const allBody = await all.json();
  assert.deepEqual(allBody.notices.map(item => item.key).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(allBody.scope, 'all');
  assert.equal((await (await through(db, post('/api/public', { action: 'noticeDetail', key: 'd' }, { cookie: premium }), 'public')).json()).notice.key, 'd');
});

test('공개 화면 문구가 새 회원계약을 따른다', () => {
  assert.match(app, /회원가입 후 관리자의 승인을 받은 승인회원은 현재 모집 중인 공모정보를 검색할 수 있습니다/);
  assert.doesNotMatch(app, /회원가입 없이 지금 열려 있는 공모/);
  assert.doesNotMatch(app, /회원가입 없이 검색할 수 있습니다/);
});
