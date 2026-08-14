// 프리미엄회원(정식 수주회원), 공개용 우수 제안서, 회원 본인정보.
// 화면에서 숨기는 것이 아니라 서버가 막는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as premiumRoute } from '../functions/api/premium.js';
import { onRequest as adminRoute } from '../functions/api/admin.js';
import { onRequest as operatorRoute } from '../functions/api/operator.js';
import { onRequest as accountRoute } from '../functions/api/account.js';
import { onRequest as authRoute } from '../functions/api/auth.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { createPasswordRecord } from '../server/password.js';
import { SESSION_COOKIE } from '../server/session.js';
import { BLOCKED_ACTIONS, OPERATOR_ACTIONS } from '../server/operator-scope.js';
import {
  PREMIUM_ADMIN_LABEL, PREMIUM_LABEL, SHOWCASE_LIMIT, canStartPremiumWork, contractState, findIdentifiers, validateShowcase
} from '../server/premium.js';
import { EDITABLE_FIELDS, LOCKED_FIELDS, REVIEW_FIELDS, auditDetail, changedFields, validateMemberProfile } from '../server/member-profile.js';
import { fakeDb } from './fixtures/fake-d1.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const premiumSource = fs.readFileSync(new URL('../functions/api/premium.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0010_premium.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://pro.ms12.org';
const PASSWORD = 'test-only-passphrase-9241';
const ROUTES = { premium: premiumRoute, admin: adminRoute, operator: operatorRoute, account: accountRoute, auth: authRoute };
const SHOWCASE = {
  title: '아동 정서지원 제안 사례', field: '아동·청소년', purpose: '정서 회복 프로그램 예산 확보',
  audience: '초등 고학년 20명', structure: '집단 프로그램 16회기와 보호자 간담회',
  outcomeDesign: '사전·사후 정서조절 점수를 비교해 성과를 확인', body: '공개 가능한 범위로 다듬은 본문입니다.'
};

function post(path, body, { cookie = '' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.9' };
  if (cookie) headers.Cookie = cookie;
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}
const cookieOf = response => `${SESSION_COOKIE}=${/__Host-ms12_session=([a-f0-9]{64})/.exec(response.headers.get('set-cookie') || '')?.[1] || ''}`;

async function through(db, request, route) {
  const data = {};
  const env = { ARCHIVE_DB: db };
  const blocked = await middleware({ request, env, data, next: async () => null });
  if (blocked) return blocked;
  return ROUTES[route]({ request, env, data });
}

async function seedUser(db, { id, email, role = 'customer', status = 'active', plan = 'full' }) {
  db.tables.users.push({
    id, email, role, status, org_id: '', name: '기존 이름', ...(await createPasswordRecord(PASSWORD)),
    plan, trial_used_at: '', phone: '', org_name: '기존 기관', is_contact: 0,
    terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: '',
    profile_updated_at: '', profile_review_needed: 0,
    created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
  });
}
const signIn = async (db, email) => cookieOf(await through(db, post('/api/auth', { action: 'login', email, password: PASSWORD }), 'auth'));

function seedContract(db, userId, patch = {}) {
  db.tables.premium_contracts.push({
    user_id: userId, status: 'active', started_on: '2026-01-01', ends_on: '2027-12-31', progress: '접수',
    progress_note: '', contract_name: '2027년 공모 대행', granted_by: 'admin-1',
    created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z', ...patch
  });
}

function seedShowcase(db, count, { isPublic = 1 } = {}) {
  for (let index = 0; index < count; index += 1) {
    db.tables.showcase_proposals.push({
      id: `show-${index}`, title: `사례 ${index}`, field: '아동·청소년', purpose: '목적', audience: '대상',
      structure: '구조', outcome_design: '성과설계', body: '본문', is_public: isPublic, sort_order: index,
      created_by: 'admin-1', created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z'
    });
  }
}

function seedNotice(db, key, patch = {}) {
  db.tables.archived_notices.push({
    source_key: key, source: 'gwangju', source_label: '광주지회', list_sn: key, dstb_bsns_code: key,
    title: `${key} 아동 지원사업 공모`, deadline: '2027-01-31', application_period: '2026-12-01 ~ 2027-01-31',
    summary: '아동 정서지원', eligibility: '사회복지기관', support_details: '프로그램비', support_limit: '3천만원',
    content_hash: key, notice_json: '{}', first_seen_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-05T00:00:00.000Z',
    region: '광주', audience: '아동·청소년', field: '복지', source_url: 'https://gwangju.chest.or.kr/x',
    last_checked_at: '2026-08-05T00:00:00.000Z', duplicate_of: '', is_public: 1,
    search_title: `${key} 아동 지원사업 공모`, search_keywords: '아동 광주', search_summary: '아동 정서지원', ...patch
  });
}

// ---------- 9. 프리미엄회원 ----------

test('프리미엄회원만 우수 제안서와 수집 이력을 열 수 있다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'plain-1', email: 'plain@example.com' });
  await seedUser(db, { id: 'prem-1', email: 'prem@example.com' });
  seedContract(db, 'prem-1');
  seedShowcase(db, 2);
  seedNotice(db, 'n-1');

  const plain = await signIn(db, 'plain@example.com');
  for (const action of ['status', 'showcase', 'noticeHistory']) {
    const response = await through(db, post('/api/premium', { action }, { cookie: plain }), 'premium');
    assert.equal(response.status, 403, action);
    const body = await response.json();
    assert.equal(body.needsPremium, true);
    assert.equal(body.proposals, undefined);
    assert.equal(body.notices, undefined);
  }

  const premium = await signIn(db, 'prem@example.com');
  const showcase = await (await through(db, post('/api/premium', { action: 'showcase' }, { cookie: premium }), 'premium')).json();
  assert.equal(showcase.proposals.length, 2);
  const history = await (await through(db, post('/api/premium', { action: 'noticeHistory' }, { cookie: premium }), 'premium')).json();
  assert.equal(history.total, 1);
});

test('프리미엄이라 부르지 않는다. 수주회원이라 적고 이름 뒤에 왕관을 붙인다', async () => {
  assert.equal(PREMIUM_LABEL, '수주회원');
  assert.equal(PREMIUM_ADMIN_LABEL, '정식 수주회원');
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@example.com', role: 'admin' });
  await seedUser(db, { id: 'prem-1', email: 'prem@example.com' });
  seedContract(db, 'prem-1');
  const admin = await signIn(db, 'admin@example.com');
  const listed = await (await through(db, post('/api/admin', { action: 'listUsers' }, { cookie: admin }), 'admin')).json();
  const target = listed.users.find(item => item.id === 'prem-1');
  assert.equal(target.premium, true);
  assert.equal(target.premiumLabel, PREMIUM_ADMIN_LABEL);
  assert.equal(target.contract.contractName, '2027년 공모 대행');
  // 회원 화면 문구는 프리미엄회원이다.
  // 화면에는 수주회원으로 적고 이름 뒤에 왕관을 붙인다.
  assert.match(app, /수주회원/);
  assert.match(app, /👑/);
  assert.match(app, /정식 수주회원/);
});

test('계약이 끝나면 결과물은 읽히지만 새 전문 작업은 시작할 수 없다', async () => {
  const ended = contractState({ status: 'active', startedOn: '2025-01-01', endsOn: '2026-01-01' }, '2026-08-12');
  assert.equal(ended.premium, true, '계약이 끝나도 화면은 열린다');
  assert.equal(ended.status, 'ended');
  assert.equal(ended.canStartWork, false);
  assert.equal(ended.readOnly, true);
  const running = contractState({ status: 'active', startedOn: '2026-01-01', endsOn: '2027-01-01' }, '2026-08-12');
  assert.equal(running.canStartWork, true);
  const suspended = contractState({ status: 'suspended', startedOn: '2026-01-01', endsOn: '2027-01-01' }, '2026-08-12');
  assert.equal(suspended.premium, true);
  assert.equal(suspended.canStartWork, false);
  assert.equal(canStartPremiumWork({ role: 'customer' }, { status: 'ended' }), false);

  // 계약이 끝난 회원도 화면은 열린다.
  const db = fakeDb();
  await seedUser(db, { id: 'prem-2', email: 'ended@example.com' });
  seedContract(db, 'prem-2', { status: 'ended', ends_on: '2026-01-31' });
  seedShowcase(db, 1);
  const cookie = await signIn(db, 'ended@example.com');
  const status = await (await through(db, post('/api/premium', { action: 'status' }, { cookie }), 'premium')).json();
  assert.equal(status.premium, true);
  assert.equal(status.contract.canStartWork, false);
  assert.equal(status.contract.statusLabel, '계약 종료');
});

test('프리미엄 권한 부여·중지는 관리자만 하고 운영관리자는 진행상태만 바꾼다', async () => {
  // 운영관리자 경로는 이름만 달라도 막는다.
  for (const action of ['setPremium', 'grantPremium', 'revokePremium']) {
    assert.ok(BLOCKED_ACTIONS.has(action), action);
  }
  assert.ok(OPERATOR_ACTIONS.has('setContractProgress'));
  assert.ok(!OPERATOR_ACTIONS.has('setPremium'));

  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@example.com', role: 'admin' });
  await seedUser(db, { id: 'oper-1', email: 'oper@example.com', role: 'operator' });
  await seedUser(db, { id: 'prem-1', email: 'prem@example.com' });

  const operator = await signIn(db, 'oper@example.com');
  const refused = await through(db, post('/api/operator', { action: 'setPremium', id: 'prem-1', contract: { status: 'active' } }, { cookie: operator }), 'operator');
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).blocked, true);
  assert.equal(db.tables.premium_contracts.length, 0, '운영관리자 요청으로 계약이 생기면 안 된다');
  // 막힌 시도도 기록에 남는다.
  assert.ok(db.tables.admin_audit_log.some(row => row.action === 'blocked:setPremium'));

  const admin = await signIn(db, 'admin@example.com');
  const granted = await through(db, post('/api/admin', { action: 'setPremium', id: 'prem-1', contract: { status: 'active', startedOn: '2026-08-01', endsOn: '2027-07-31', contractName: '2027 대행' } }, { cookie: admin }), 'admin');
  assert.equal(granted.status, 200);
  assert.equal(db.tables.premium_contracts[0].status, 'active');
  assert.ok(db.tables.admin_audit_log.some(row => row.action === 'admin.grantPremium'));

  // 운영관리자는 진행상태만 바꾼다. 계약 상태·기간은 그대로다.
  const moved = await through(db, post('/api/operator', { action: 'setContractProgress', id: 'prem-1', progress: '작성중', progressNote: '자료 수령' }, { cookie: operator }), 'operator');
  assert.equal(moved.status, 200);
  const contract = db.tables.premium_contracts[0];
  assert.equal(contract.progress, '작성중');
  assert.equal(contract.status, 'active');
  assert.equal(contract.ends_on, '2027-07-31');

  // 중지도 관리자만 한다.
  await through(db, post('/api/admin', { action: 'setPremium', id: 'prem-1', contract: { status: 'suspended' } }, { cookie: admin }), 'admin');
  assert.equal(db.tables.premium_contracts[0].status, 'suspended');
  assert.ok(db.tables.admin_audit_log.some(row => row.action === 'admin.revokePremium'));
});

// ---------- 10. 공개용 우수 제안서 ----------

test('공개는 다섯 편까지이고 관리자가 승인한 사본만 나간다', async () => {
  assert.equal(SHOWCASE_LIMIT, 5);
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@example.com', role: 'admin' });
  await seedUser(db, { id: 'prem-1', email: 'prem@example.com' });
  seedContract(db, 'prem-1');
  seedShowcase(db, 5);
  seedShowcase(db, 1, { isPublic: 0 });
  db.tables.showcase_proposals.at(-1).id = 'hidden-1';
  db.tables.showcase_proposals.at(-1).title = '비공개 사례';

  const premium = await signIn(db, 'prem@example.com');
  const listed = await (await through(db, post('/api/premium', { action: 'showcase' }, { cookie: premium }), 'premium')).json();
  assert.equal(listed.proposals.length, 5, '공개된 것만, 다섯 편까지');
  assert.ok(!listed.proposals.some(item => item.title === '비공개 사례'));
  // 화면 열람만 허용한다.
  assert.ok(listed.proposals.every(item => item.downloadable === false));

  const admin = await signIn(db, 'admin@example.com');
  const over = await through(db, post('/api/admin', { action: 'setShowcasePublic', id: 'hidden-1', isPublic: true }, { cookie: admin }), 'admin');
  assert.equal(over.status, 400);
  assert.match((await over.json()).error, /5편까지/);
  assert.equal(db.tables.showcase_proposals.find(item => item.id === 'hidden-1').is_public, 0);
});

test('식별정보가 남은 사본은 저장되지 않는다', () => {
  assert.deepEqual(findIdentifiers('문의 010-1234-5678'), ['전화번호']);
  assert.deepEqual(findIdentifiers('담당자 abc@example.com'), ['이메일']);
  assert.deepEqual(findIdentifiers('사업자 123-45-67890'), ['사업자·고유번호']);
  assert.ok(findIdentifiers('광주광역시 서구 상무대로 123').includes('주소'));
  assert.ok(findIdentifiers('○○지역아동센터가 수행').includes('기관명'));
  assert.deepEqual(findIdentifiers('아동 정서지원 프로그램을 16회기 운영합니다.'), []);

  const dirty = validateShowcase({ ...SHOWCASE, body: '문의: 062-000-1111' });
  assert.equal(dirty.ok, false);
  assert.match(dirty.errors.join(' '), /식별정보로 보이는 내용/);
  assert.ok(validateShowcase(SHOWCASE).ok);
});

test('회원 계획서 원본을 예시자료로 자동 전환하지 않는다', () => {
  // 공개 사본 표는 회원 계획서 표를 참조하지 않는다. 원본 식별자 열 자체가 없다.
  assert.doesNotMatch(migration, /showcase_proposals[\s\S]*?proposal_id|showcase_proposals[\s\S]*?archived_proposals/);
  // 공개 경로의 SQL은 회원 계획서·기관정보·감사기록 표를 건드리지 않는다.
  assert.doesNotMatch(premiumSource, /FROM\s+(archived_proposals|applicant_organizations|admin_audit_log|users|member_profiles)/);
  const adminSource = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');
  // 관리자 화면에도 「계획서를 예시로 옮기기」 같은 자동 전환은 없다.
  assert.doesNotMatch(adminSource, /INSERT INTO showcase_proposals[\s\S]{0,400}archived_proposals/);
});

// ---------- 11. 프리미엄 공고 수집 이력 ----------

test('수집 이력은 진행 중·마감·마감일 확인 필요를 갈라 보고 출처와 수집일을 준다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'prem-1', email: 'prem@example.com' });
  seedContract(db, 'prem-1');
  seedNotice(db, 'open-1', { deadline: '2099-12-31' });
  seedNotice(db, 'closed-1', { deadline: '2020-01-01' });
  seedNotice(db, 'unknown-1', { deadline: '' });
  const cookie = await signIn(db, 'prem@example.com');

  const all = await (await through(db, post('/api/premium', { action: 'noticeHistory' }, { cookie }), 'premium')).json();
  assert.equal(all.total, 3, '지난 공고까지 전부 본다');
  const first = all.notices[0];
  assert.ok(['source', 'collectedAt', 'lastCheckedAt', 'sourceLabel', 'region', 'audience', 'field'].every(key => key in first));
  // 관리자 전용 값은 나가지 않는다.
  assert.equal(first.isPublic, undefined);
  assert.equal(first.duplicate, undefined);
  assert.equal(first.contentHash, undefined);

  const pick = async state => (await (await through(db, post('/api/premium', { action: 'noticeHistory', filters: { state } }, { cookie }), 'premium')).json()).total;
  assert.equal(await pick('closed'), 1);
  assert.equal(await pick('unknown'), 1);
  assert.equal(await pick('open'), 1);

  // 맞춤검색과 광역검색을 모두 쓴다.
  const focused = await (await through(db, post('/api/premium', { action: 'noticeHistory', query: '아동', mode: 'focused' }, { cookie }), 'premium')).json();
  assert.equal(focused.modeLabel, '맞춤검색');
  const broad = await (await through(db, post('/api/premium', { action: 'noticeHistory', query: '정서지원', mode: 'broad' }, { cookie }), 'premium')).json();
  assert.equal(broad.modeLabel, '광역검색');
  assert.ok(broad.total >= 1);
});

test('프리미엄회원은 다른 회원 자료·감사기록·수집 설정에 닿을 수 없다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'prem-1', email: 'prem@example.com' });
  await seedUser(db, { id: 'other-1', email: 'other@example.com' });
  seedContract(db, 'prem-1');
  seedNotice(db, 'hidden-1', { is_public: 0 });
  seedNotice(db, 'shown-1');
  const cookie = await signIn(db, 'prem@example.com');

  // 비공개 처리된 자료는 이력에도 나오지 않는다.
  const history = await (await through(db, post('/api/premium', { action: 'noticeHistory' }, { cookie }), 'premium')).json();
  assert.equal(history.total, 1);
  assert.ok(!JSON.stringify(history).includes('hidden-1'));

  // 관리자·운영관리자 경로는 그대로 막힌다.
  for (const [path, route] of [['/api/admin', 'admin'], ['/api/operator', 'operator']]) {
    const response = await through(db, post(path, { action: 'listUsers' }, { cookie }), route);
    assert.equal(response.status, 403, path);
  }
  // 프리미엄 경로에는 공개 여부·수집 설정을 바꾸는 작업이 없다.
  for (const action of ['setNoticePublic', 'listUsers', 'usageReport', 'listShowcase', 'saveShowcase']) {
    const response = await through(db, post('/api/premium', { action }, { cookie }), 'premium');
    assert.equal(response.status, 400, action);
  }
  assert.doesNotMatch(premiumSource, /UPDATE |INSERT |DELETE /);
});

// ---------- 12·13. 본인정보 수정과 운영 반영 ----------

test('모든 회원이 자기 정보만 고치고 권한 항목은 요청해도 거절된다', async () => {
  assert.deepEqual(EDITABLE_FIELDS.map(([key]) => key), [
    'name', 'phone', 'orgName', 'orgType', 'orgAddress', 'orgIntro', 'staff', 'facilities', 'programs', 'achievements', 'partners', 'reuseNote'
  ]);
  for (const locked of ['role', 'status', 'plan', 'premium', 'usage', 'audit']) assert.ok(LOCKED_FIELDS.includes(locked), locked);

  const refused = validateMemberProfile({ name: '홍담당', role: 'admin' });
  assert.equal(refused.ok, false);
  assert.match(refused.errors.join(' '), /바꿀 수 없는 항목/);
  const email = validateMemberProfile({ name: '홍담당', email: 'new@example.com' });
  assert.equal(email.ok, false);
  assert.match(email.errors.join(' '), /로그인 이메일/);

  const db = fakeDb();
  await seedUser(db, { id: 'pending-1', email: 'pending@example.com', status: 'pending' });
  await seedUser(db, { id: 'member-1', email: 'member@example.com' });
  // 승인 대기 회원도 자기 정보를 고칠 수 있다.
  const pending = await signIn(db, 'pending@example.com');
  const saved = await through(db, post('/api/account', { action: 'saveProfile', name: '대기 담당', orgName: '대기 기관' }, { cookie: pending }), 'account');
  assert.equal(saved.status, 200);
  assert.equal(db.tables.users.find(item => item.id === 'pending-1').name, '대기 담당');
  // 역할·승인 상태는 그대로다.
  assert.equal(db.tables.users.find(item => item.id === 'pending-1').status, 'pending');
  assert.equal(db.tables.users.find(item => item.id === 'pending-1').role, 'customer');

  // 권한 항목을 함께 보내면 통째로 거절한다.
  const attempt = await through(db, post('/api/account', { action: 'saveProfile', name: '홍담당', role: 'admin', plan: 'full', status: 'active' }, { cookie: pending }), 'account');
  assert.equal(attempt.status, 400);
  assert.equal(db.tables.users.find(item => item.id === 'pending-1').role, 'customer');

  // 남의 계정을 가리켜도 통하지 않는다. 대상은 언제나 본인 세션의 id다.
  const member = await signIn(db, 'member@example.com');
  const other = await through(db, post('/api/account', { action: 'saveProfile', name: '남의 이름', userId: 'pending-1' }, { cookie: member }), 'account');
  assert.equal(other.status, 400, 'userId를 지정하는 요청은 받지 않는다');
  assert.equal(db.tables.users.find(item => item.id === 'pending-1').name, '대기 담당');
  assert.equal(db.tables.users.find(item => item.id === 'member-1').name, '기존 이름');
  // 본인 정보는 정상으로 바뀐다.
  await through(db, post('/api/account', { action: 'saveProfile', name: '내 이름' }, { cookie: member }), 'account');
  assert.equal(db.tables.users.find(item => item.id === 'member-1').name, '내 이름');
  assert.equal(db.tables.users.find(item => item.id === 'pending-1').name, '대기 담당');
});

test('바뀐 항목만 감사기록에 남기고 값은 남기지 않는다', async () => {
  const changed = changedFields({ name: '전', orgIntro: '같음' }, { name: '후', orgIntro: '같음' });
  assert.deepEqual(changed.map(item => item.key), ['name']);
  assert.equal(auditDetail(changed), '변경 항목: 담당자 이름');

  const db = fakeDb();
  await seedUser(db, { id: 'member-1', email: 'member@example.com' });
  const cookie = await signIn(db, 'member@example.com');
  await through(db, post('/api/account', { action: 'saveProfile', name: '새 담당', phone: '010-0000-0000', orgIntro: '비밀 소개 내용' }, { cookie }), 'account');
  const entry = db.tables.admin_audit_log.find(row => row.action === 'member.updateProfile');
  assert.ok(entry, '기록이 남는다');
  assert.match(entry.detail, /변경 항목/);
  // 값·비밀번호·변경 전 원문은 남기지 않는다.
  assert.ok(!entry.detail.includes('비밀 소개 내용'));
  assert.ok(!entry.detail.includes('010-0000-0000'));
  assert.ok(!JSON.stringify(entry).includes('password'));
});

test('중요 항목이 바뀌면 운영 화면에 확인 요청으로 뜨고 이용은 막지 않는다', async () => {
  assert.deepEqual([...REVIEW_FIELDS], ['orgName', 'orgType', 'bizNumber']);
  const db = fakeDb();
  await seedUser(db, { id: 'admin-1', email: 'admin@example.com', role: 'admin' });
  await seedUser(db, { id: 'oper-1', email: 'oper@example.com', role: 'operator' });
  await seedUser(db, { id: 'member-1', email: 'member@example.com' });
  const member = await signIn(db, 'member@example.com');

  // 기관명이 바뀌면 확인 요청.
  await through(db, post('/api/account', { action: 'saveProfile', name: '기존 이름', orgName: '새 기관명' }, { cookie: member }), 'account');
  const row = db.tables.users.find(item => item.id === 'member-1');
  assert.equal(row.profile_review_needed, 1);
  assert.ok(row.profile_updated_at, '변경시각이 남는다');
  assert.equal(row.status, 'active', '이용을 자동으로 멈추지 않는다');

  // 관리자·운영관리자 화면에 곧바로 보인다.
  const admin = await signIn(db, 'admin@example.com');
  const listed = await (await through(db, post('/api/admin', { action: 'listUsers' }, { cookie: admin }), 'admin')).json();
  const seen = listed.users.find(item => item.id === 'member-1');
  assert.equal(seen.profileReviewNeeded, true);
  assert.equal(seen.orgName, '새 기관명');
  assert.ok(seen.profileUpdatedAt);

  const operator = await signIn(db, 'oper@example.com');
  const overview = await (await through(db, post('/api/operator', { action: 'overview' }, { cookie: operator }), 'operator')).json();
  const watched = overview.users.find(item => item.id === 'member-1');
  assert.equal(watched.profileReviewNeeded, true);
  assert.ok(watched.profileUpdatedAt);

  // 이름만 바꾸면 확인 요청이 아니다.
  await through(db, post('/api/account', { action: 'saveProfile', name: '다른 이름', orgName: '새 기관명' }, { cookie: member }), 'account');
  assert.equal(db.tables.users.find(item => item.id === 'member-1').profile_review_needed, 0);
});

test('바꾼 기관정보는 새 문서부터 쓰고 저장된 계획서는 그대로 둔다', async () => {
  const db = fakeDb();
  await seedUser(db, { id: 'member-1', email: 'member@example.com' });
  db.tables.member_profiles.push({
    user_id: 'member-1', org_type: '사회복지법인', org_address: '', org_intro: '', staff: '사회복지사 3명',
    facilities: '', programs: '', achievements: '', partners: '', reuse_note: '', updated_at: '2026-08-01T00:00:00.000Z'
  });
  const cookie = await signIn(db, 'member@example.com');
  await through(db, post('/api/account', { action: 'saveProfile', name: '기존 이름', staff: '사회복지사 5명' }, { cookie }), 'account');
  const profile = await (await through(db, post('/api/account', { action: 'profile' }, { cookie }), 'account')).json();
  assert.equal(profile.memberProfile.staff, '사회복지사 5명', '다음 문서부터 최신 값을 쓴다');

  // 저장된 계획서를 건드리는 코드가 없다.
  const accountSource = fs.readFileSync(new URL('../functions/api/account.js', import.meta.url), 'utf8');
  assert.doesNotMatch(accountSource, /archived_proposals/);
  // 화면도 기존 계획서는 사용자가 다시 반영해야 한다고 알린다.
  assert.match(app, /이미 저장된 계획서는 자동으로 바뀌지 않습니다/);
});

test('마이그레이션은 더하기만 하고 기존 자료를 지우지 않는다', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS premium_contracts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS showcase_proposals/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS member_profiles/);
  assert.match(migration, /ALTER TABLE users ADD COLUMN profile_updated_at/);
  assert.doesNotMatch(migration, /DROP |DELETE FROM |TRUNCATE/);
});

test('저장한 기관정보를 새 문서 입력칸에 먼저 채워 준다', () => {
  // 다음에 만드는 핵심제안서부터 최신 기관정보를 쓴다.
  assert.match(app, /function memberFactsText\(\)/);
  // 제안서에서 다시 적지 않는다. 「내 정보」에 적어 둔 것을 그대로 보여 주고 쓴다.
  assert.match(app, /escapeHtml\(memberFactsText\(\)\)/);
  assert.match(app, /「내 정보」에 적어 둔 기관정보를 그대로 씁니다/);
});
