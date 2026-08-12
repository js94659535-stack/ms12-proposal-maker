// 권한 체계. 화면이 아니라 서버 API가 실제로 막는지 확인한다.
// 기본값은 거절이다. 권한이 적혀 있지 않으면 아무것도 열리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onRequest as adminRoute } from '../functions/api/admin.js';
import { onRequest as operatorRoute } from '../functions/api/operator.js';
import { REASON, SECRET_COLUMNS, decideAccess, grantActive, proposalContentAccess, stripSecrets, validateGrant } from '../server/permissions.js';
import { accessDb, seedProposal } from './fixtures/fake-access-db.js';

const ORIGIN = 'https://pro.ms12.org';
const admin = { id: 'admin-1', email: 'admin@ms12.test', role: 'admin', status: 'active' };
const operator = { id: 'op-1', email: 'op@ms12.test', role: 'operator', status: 'active' };
const member = { id: 'mem-1', email: 'mem@ms12.test', role: 'customer', status: 'active' };

function call(route, actor, body) {
  const request = new Request(`${ORIGIN}/api/${route === adminRoute ? 'admin' : 'operator'}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return request;
}
const send = (route, db, actor, body) => route({ request: call(route, actor, body), env: { ARCHIVE_DB: db }, data: { session: { user: actor } } });

function seedUsers(db) {
  db.tables.users.push(
    { id: admin.id, email: admin.email, name: '관리자', role: 'admin', status: 'active' },
    { id: operator.id, email: operator.email, name: '운영관리자', role: 'operator', status: 'active' },
    { id: member.id, email: member.email, name: '회원', role: 'customer', status: 'active' }
  );
}

const grant = (patch = {}) => ({
  subjectId: operator.id, scope: 'proposals', targetKind: 'all', targetId: '',
  abilities: { view: true, viewContent: false, edit: false, download: false, manage: false, progress: false },
  startsOn: '', endsOn: '', note: '수주지원', ...patch
});

// ---------- 판정 규칙 ----------

test('권한이 적혀 있지 않으면 아무것도 열리지 않는다', () => {
  const decision = decideAccess({ actor: operator, grants: [], scope: 'proposals', ability: 'view', targetKind: 'proposal', targetId: 'p-1', targetUserId: 'mem-1' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, 403);
});

test('최고관리자는 업무자료를 모두 열람하고 그 권한은 권한 표로 줄지 않는다', () => {
  for (const scope of ['members', 'proposals', 'applicants', 'assets', 'usage', 'contracts']) {
    for (const ability of ['view', 'edit', 'download', 'manage']) {
      const decision = decideAccess({ actor: admin, grants: [], scope, ability, targetKind: 'user', targetUserId: 'mem-1' });
      assert.equal(decision.allowed, true, `${scope}/${ability}`);
      assert.equal(decision.reason, REASON.admin);
    }
  }
});

test('본인 자료는 언제나 본다', () => {
  const decision = decideAccess({ actor: member, grants: [], scope: 'proposals', ability: 'view', targetKind: 'proposal', targetId: 'p-1', targetUserId: member.id });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, REASON.owner);
});

test('열람권한만 받은 운영관리자는 수정도 내려받기도 못 한다', () => {
  const grants = [{ scope: 'proposals', target_kind: 'proposal', target_id: 'p-1', can_view: 1, can_view_content: 1, can_edit: 0, can_download: 0, revoked_at: '' }];
  const base = { actor: operator, grants, scope: 'proposals', targetKind: 'proposal', targetId: 'p-1', targetUserId: 'mem-1' };
  assert.equal(decideAccess({ ...base, ability: 'view' }).allowed, true);
  assert.equal(decideAccess({ ...base, ability: 'viewContent' }).allowed, true);
  assert.equal(decideAccess({ ...base, ability: 'edit' }).allowed, false);
  assert.equal(decideAccess({ ...base, ability: 'download' }).allowed, false);
});

test('지정하지 않은 다른 회원 자료는 같은 권한으로도 열리지 않는다', () => {
  const grants = [{ scope: 'proposals', target_kind: 'user', target_id: 'mem-1', can_view: 1, revoked_at: '' }];
  assert.equal(decideAccess({ actor: operator, grants, scope: 'proposals', ability: 'view', targetKind: 'proposal', targetId: 'p-1', targetUserId: 'mem-1' }).allowed, true);
  assert.equal(decideAccess({ actor: operator, grants, scope: 'proposals', ability: 'view', targetKind: 'proposal', targetId: 'p-9', targetUserId: 'mem-2' }).allowed, false);
});

test('기간이 지난 권한은 회수하지 않아도 닫힌다', () => {
  const base = { scope: 'proposals', target_kind: 'all', can_view: 1, revoked_at: '' };
  assert.equal(grantActive({ ...base, starts_on: '2026-08-01', ends_on: '2026-08-31' }, '2026-08-12'), true);
  assert.equal(grantActive({ ...base, starts_on: '2026-09-01', ends_on: '' }, '2026-08-12'), false, '시작 전');
  assert.equal(grantActive({ ...base, starts_on: '', ends_on: '2026-08-11' }, '2026-08-12'), false, '종료 후');
  assert.equal(grantActive({ ...base, revoked_at: '2026-08-11T00:00:00.000Z' }, '2026-08-12'), false, '회수됨');
});

test('최고관리자는 조건 없이 모든 계획서 원문을 연다', () => {
  const proposal = { id: 'p-1', user_id: 'mem-1', support_consent: 0 };
  // 회원 동의도 프리미엄 계약도 없어도 연다. 대표자 운영정책이다.
  const opened = proposalContentAccess({ actor: admin, proposal, contract: null });
  assert.equal(opened.allowed, true);
  assert.equal(opened.reason, REASON.admin);
  // 소유 회원이 지정되지 않은 기존 보관자료도 연다.
  assert.equal(proposalContentAccess({ actor: admin, proposal: { id: 'p-old', user_id: '', support_consent: 0 } }).allowed, true);
  // 구독·프리미엄 여부와 무관하다.
  assert.equal(proposalContentAccess({ actor: admin, proposal, contract: { active: true } }).allowed, true);
  // 본인은 언제나 연다.
  assert.equal(proposalContentAccess({ actor: { ...member, id: 'mem-1' }, proposal, contract: null }).allowed, true);
  // 중지된 관리자는 열지 못한다.
  assert.equal(proposalContentAccess({ actor: { ...admin, status: 'disabled' }, proposal }).allowed, false);
});

test('운영관리자는 지정받은 범위에서만 원문을 연다', () => {
  const proposal = { id: 'p-1', user_id: 'mem-1', support_consent: 0 };
  // 지정이 없으면 프리미엄 계약이 있어도 열리지 않는다.
  assert.equal(proposalContentAccess({ actor: operator, proposal, grants: [], contract: { active: true } }).allowed, false);
  // 최고관리자가 지정하면 그 지정이 근거가 된다.
  const grants = [{ scope: 'proposals', target_kind: 'proposal', target_id: 'p-1', can_view_content: 1, revoked_at: '' }];
  const opened = proposalContentAccess({ actor: operator, proposal, grants });
  assert.equal(opened.allowed, true);
  assert.equal(opened.reason, REASON.grant);
  // 계약·동의가 있으면 그 사실을 사유로 남긴다.
  assert.equal(proposalContentAccess({ actor: operator, proposal, grants, contract: { active: true } }).reason, REASON.premium);
  assert.equal(proposalContentAccess({ actor: operator, proposal: { ...proposal, support_consent: 1 }, grants }).reason, REASON.consent);
});

test('내려받기·수정 권한은 원문 열람 없이 줄 수 없다', () => {
  const bad = validateGrant(grant({ abilities: { view: true, viewContent: false, edit: false, download: true, manage: false, progress: false } }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(item => item.includes('내려받기')));
  const good = validateGrant(grant({ abilities: { view: true, viewContent: true, edit: false, download: true, manage: false, progress: false } }));
  assert.equal(good.ok, true);
});

test('비밀값은 어떤 응답에도 실리지 않는다', () => {
  const dirty = { id: 'u1', email: 'a@b.c', password_hash: 'x', passwordHash: 'x', nested: [{ token_hash: 't', name: '홍길동' }], provider_subject: 's' };
  const clean = stripSecrets(dirty);
  const text = JSON.stringify(clean);
  for (const secret of SECRET_COLUMNS) assert.ok(!text.includes(secret), secret);
  assert.ok(!text.includes('passwordHash'));
  assert.equal(clean.nested[0].name, '홍길동');
});

// ---------- 서버 API ----------

test('최고관리자는 권한을 지정하고 회수하며 그 즉시 반영된다', async () => {
  const db = accessDb();
  seedUsers(db);
  seedProposal(db, { user_id: member.id });

  const saved = await send(adminRoute, db, admin, { action: 'saveGrant', grant: grant() });
  assert.equal(saved.status, 200);
  const body = await saved.json();
  assert.equal(body.grants.length, 1);

  // 지정 즉시 운영관리자에게 보인다. 다시 로그인하지 않는다.
  const before = await send(operatorRoute, db, operator, { action: 'assignedProposals' });
  assert.equal((await before.json()).proposals.length, 1);

  // 회수하면 다음 요청부터 곧바로 막힌다.
  const revoked = await send(adminRoute, db, admin, { action: 'revokeGrant', id: db.tables.access_grants[0].id });
  assert.equal(revoked.status, 200);
  const after = await send(operatorRoute, db, operator, { action: 'assignedProposals' });
  assert.equal((await after.json()).proposals.length, 0, '회수 후 즉시 차단');
});

test('운영관리자는 권한을 스스로 지정하지 못한다', async () => {
  const db = accessDb();
  seedUsers(db);
  const response = await send(operatorRoute, db, operator, { action: 'saveGrant', grant: grant() });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.blocked, true);
  assert.match(body.error, /권한 지정/);
  assert.equal(db.tables.access_grants.length, 0);
});

test('권한 없는 API 직접 호출은 403이다', async () => {
  const db = accessDb();
  seedUsers(db);
  seedProposal(db, { user_id: member.id, support_consent: 1 });
  // 지정 없이 원문을 직접 부른다.
  const response = await send(operatorRoute, db, operator, { action: 'proposalContent', id: 'p-1' });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.ok(!JSON.stringify(body).includes('원문 내용'), '막힌 응답에 원문이 섞이지 않는다');
  // 회원 역할로 관리자 경로를 부르면 막힌다.
  const asMember = await send(adminRoute, db, member, { action: 'accessOverview' });
  assert.equal(asMember.status, 403);
});

test('열람권한만 받은 운영관리자는 원문을 열어도 수정·내려받기 권한은 없다', async () => {
  const db = accessDb();
  seedUsers(db);
  seedProposal(db, { user_id: member.id, support_consent: 1 });
  await send(adminRoute, db, admin, {
    action: 'saveGrant',
    grant: grant({ abilities: { view: true, viewContent: true, edit: false, download: false, manage: false, progress: false } })
  });
  const opened = await send(operatorRoute, db, operator, { action: 'proposalContent', id: 'p-1' });
  assert.equal(opened.status, 200);
  const list = await (await send(operatorRoute, db, operator, { action: 'assignedProposals' })).json();
  assert.equal(list.can.viewContent, true);
  assert.equal(list.can.edit, false);
  assert.equal(list.can.download, false);
});

test('모든 원문 열람이 감사기록에 남고 기록에 원문은 없다', async () => {
  const db = accessDb();
  seedUsers(db);
  seedProposal(db, { user_id: member.id, support_consent: 1 });
  await send(adminRoute, db, admin, { action: 'proposalContent', id: 'p-1' });
  // 막힌 열람도 남는다. 지정받지 않은 운영관리자가 부르면 거절되고 그 사실이 기록된다.
  await send(operatorRoute, db, operator, { action: 'proposalContent', id: 'p-1' });

  const log = db.tables.data_access_log;
  assert.equal(log.length, 2);
  assert.equal(log[0].action, 'viewContent');
  assert.equal(log[0].allowed, 1, '최고관리자 열람은 허용되고 기록된다');
  assert.equal(log[0].actor_role, 'admin');
  assert.equal(log[1].allowed, 0, '거절된 열람도 기록한다');
  assert.equal(log[1].actor_role, 'operator');
  const text = JSON.stringify(log);
  assert.ok(!text.includes('원문 내용'), '기록에 계획서 원문이 없다');
  for (const secret of ['password', 'token', 'secret']) assert.ok(!text.toLowerCase().includes(secret), secret);
});

test('회원별 이용현황은 편수·수정일 같은 메타정보만 준다', async () => {
  const db = accessDb();
  seedUsers(db);
  seedProposal(db, { id: 'p-1', user_id: member.id, export_count: 2 });
  seedProposal(db, { id: 'p-2', user_id: member.id, updated_at: '2026-08-11T00:00:00.000Z' });
  seedProposal(db, { id: 'p-old', user_id: '', owner_hash: 'hash-old' });

  const body = await (await send(adminRoute, db, admin, { action: 'memberUsage' })).json();
  const mine = body.members.find(item => item.id === member.id);
  assert.equal(mine.proposals, 2);
  assert.equal(mine.exportCount, 2);
  assert.equal(body.unclaimed.length, 1, '회원 미지정 자료를 따로 보여 준다');
  // 목록 어디에도 원문이 없다.
  assert.ok(!JSON.stringify(body).includes('원문 내용'));
  assert.ok(Object.keys(body.proposals[0]).includes('contentBytes'), '크기만 알려 준다');
});

test('기존 보관자료는 자동 귀속하지 않고 사유를 적어야 지정된다', async () => {
  const db = accessDb();
  seedUsers(db);
  seedProposal(db, { id: 'p-old', user_id: '', owner_hash: 'hash-old' });

  // 사유 없이 지정하면 거절한다.
  const noReason = await send(adminRoute, db, admin, { action: 'assignProposal', id: 'p-old', userId: member.id });
  assert.equal(noReason.status, 400);
  assert.equal(db.tables.archived_proposals[0].user_id, '');

  const done = await send(adminRoute, db, admin, { action: 'assignProposal', id: 'p-old', userId: member.id, note: '회원이 복구키로 확인' });
  assert.equal(done.status, 200);
  assert.equal(db.tables.archived_proposals[0].user_id, member.id);
  assert.ok(db.tables.data_access_log.some(row => row.action === 'claim' && row.reason.includes('복구키')));

  // 이미 연결된 자료를 다시 옮기지 않는다.
  const again = await send(adminRoute, db, admin, { action: 'assignProposal', id: 'p-old', userId: operator.id, note: '재지정' });
  assert.equal(again.status, 409);
});

test('최고관리자에게는 권한을 따로 지정하지 않는다', async () => {
  const db = accessDb();
  seedUsers(db);
  const response = await send(adminRoute, db, admin, { action: 'saveGrant', grant: grant({ subjectId: admin.id }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /최고관리자/);
});

// ---------- 구조 ----------

test('마이그레이션은 열과 표를 더하기만 한다', () => {
  const sql = fs.readFileSync(new URL('../migrations/0013_access_and_assets.sql', import.meta.url), 'utf8');
  for (const destructive of ['DROP ', 'DELETE ', 'UPDATE archived_proposals SET', 'UPDATE users SET']) {
    assert.ok(!sql.includes(destructive), destructive);
  }
  assert.match(sql, /ALTER TABLE archived_proposals ADD COLUMN user_id TEXT NOT NULL DEFAULT ''/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS access_grants/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS data_access_log/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS idea_assets/);
  // 기존 계정을 자동 동의로 만들지 않는다. 빈 값으로 시작한다.
  assert.match(sql, /ALTER TABLE users ADD COLUMN privacy_notice_version TEXT NOT NULL DEFAULT ''/);
});

test('권한 판정을 거치지 않고 계획서 원문을 내보내는 경로가 없다', () => {
  for (const file of ['admin.js', 'operator.js']) {
    const source = fs.readFileSync(new URL(`../functions/api/${file}`, import.meta.url), 'utf8');
    const reads = [...source.matchAll(/proposal_json/g)];
    // proposal_json을 읽는 곳마다 권한 판정과 기록이 함께 있어야 한다.
    if (!reads.length) continue;
    assert.match(source, /proposalContentAccess\(/, file);
    assert.match(source, /recordAccess\(/, file);
  }
});

// ---------- 대표자 운영정책: admin 전체 열람 ----------

test('최고관리자는 회원 등급과 무관하게 모든 계획서 원문을 연다', async () => {
  const db = accessDb();
  seedUsers(db);
  db.tables.users.push(
    { id: 'sub-1', email: 'sub@ms12.test', name: '구독회원', role: 'customer', status: 'active' },
    { id: 'pre-1', email: 'pre@ms12.test', name: '프리미엄회원', role: 'customer', status: 'active' }
  );
  db.tables.premium_contracts.push({ user_id: 'pre-1', status: 'active', started_on: '2026-01-01', ends_on: '2026-12-31' });
  // 일반회원 · 구독회원 · 프리미엄회원 · 소유 회원 미지정 자료.
  seedProposal(db, { id: 'p-basic', user_id: member.id, support_consent: 0 });
  seedProposal(db, { id: 'p-sub', user_id: 'sub-1', support_consent: 0 });
  seedProposal(db, { id: 'p-premium', user_id: 'pre-1', support_consent: 0 });
  seedProposal(db, { id: 'p-unowned', user_id: '', owner_hash: 'hash-old' });

  for (const id of ['p-basic', 'p-sub', 'p-premium', 'p-unowned']) {
    const response = await send(adminRoute, db, admin, { action: 'proposalContent', id });
    assert.equal(response.status, 200, id);
    const body = await response.json();
    assert.equal(body.reason, REASON.admin, id);
    assert.ok(body.snapshot, `${id} 원문이 실제로 열린다`);
  }
  // 네 번의 열람이 모두 기록에 남는다.
  const reads = db.tables.data_access_log.filter(row => row.action === 'viewContent' && row.actor_id === admin.id);
  assert.equal(reads.length, 4);
  assert.ok(reads.every(row => row.allowed === 1));
  // 기록에 원문은 없다.
  assert.ok(!JSON.stringify(db.tables.data_access_log).includes('원문 내용'));
});

test('역할별 원문 열람 결과가 서로 다르다', async () => {
  const db = accessDb();
  seedUsers(db);
  seedProposal(db, { id: 'p-1', user_id: member.id, support_consent: 0 });

  // 최고관리자: 열린다.
  assert.equal((await send(adminRoute, db, admin, { action: 'proposalContent', id: 'p-1' })).status, 200);
  // 운영관리자: 지정 전에는 막힌다.
  assert.equal((await send(operatorRoute, db, operator, { action: 'proposalContent', id: 'p-1' })).status, 403);
  // 원문 열람만 지정하면 열린다.
  await send(adminRoute, db, admin, {
    action: 'saveGrant',
    grant: grant({ abilities: { view: true, viewContent: true, edit: false, download: false, manage: false, progress: false } })
  });
  assert.equal((await send(operatorRoute, db, operator, { action: 'proposalContent', id: 'p-1' })).status, 200);
  // 열람만 받았으므로 수정·내려받기는 여전히 없다.
  const list = await (await send(operatorRoute, db, operator, { action: 'assignedProposals' })).json();
  assert.equal(list.can.edit, false);
  assert.equal(list.can.download, false);
  // 회수하면 다음 요청부터 곧바로 막힌다.
  await send(adminRoute, db, admin, { action: 'revokeGrant', id: db.tables.access_grants[0].id });
  assert.equal((await send(operatorRoute, db, operator, { action: 'proposalContent', id: 'p-1' })).status, 403);
  // 회원은 관리자 경로 자체가 막힌다.
  assert.equal((await send(adminRoute, db, member, { action: 'proposalContent', id: 'p-1' })).status, 403);
});

test('어떤 응답에도 비밀값이 실리지 않는다', async () => {
  const db = accessDb();
  seedUsers(db);
  // 대역이지만 실제 users 행에 있는 비밀 열을 흉내 내 넣어 둔다.
  Object.assign(db.tables.users[2], { password_hash: 'HASH', password_salt: 'SALT', token_hash: 'TOKEN', provider_subject: 'SUBJECT' });
  seedProposal(db, { id: 'p-1', user_id: member.id });

  const responses = await Promise.all([
    send(adminRoute, db, admin, { action: 'accessOverview' }),
    send(adminRoute, db, admin, { action: 'memberUsage' }),
    send(adminRoute, db, admin, { action: 'proposalContent', id: 'p-1' })
  ]);
  for (const response of responses) {
    const text = await response.text();
    for (const secret of ['HASH', 'SALT', 'TOKEN', 'SUBJECT', 'password_hash', 'provider_subject']) {
      assert.ok(!text.includes(secret), secret);
    }
  }
});
