// 공고 출처·기관 등록부. 고르는 목록과 관리 목록이 같은 자료를 보고, 어떤 경우에도 지우지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MANUAL_ONLY_LABEL, ORG_STATUSES, ORG_STATUS_LABELS, archiveNote, canManageOrg,
  manageOrgs, normalizeSelection, orgView, searchOrgs, selectableOrgs, selectionSummary, validateOrg
} from '../server/notice-orgs.js';
import { OPERATOR_ACTIONS } from '../server/operator-scope.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../functions/api/operator.js', import.meta.url), 'utf8');
const account = fs.readFileSync(new URL('../functions/api/account.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0020_notice_orgs.sql', import.meta.url), 'utf8');

const row = (id, name, extra = {}) => orgView({ id, name, category: '분류', sort_order: 10, status: 'active', collects: 1, builtin: 1, updated_at: '', ...extra });
const ROWS = [
  row('chest', '사랑의열매'),
  row('family', '가족센터', { sort_order: 20 }),
  row('edu', '학교·교육청', { sort_order: 30, collects: 0 }),
  row('paused-one', '쉬는 기관', { sort_order: 40, status: 'paused' }),
  row('archived-one', '보관한 기관', { sort_order: 50, status: 'archived' })
];

test('상태는 셋뿐이고 쓰지 않을 곳은 상태만 바꾼다', () => {
  assert.deepEqual(ORG_STATUSES, ['active', 'paused', 'archived']);
  assert.deepEqual(Object.values(ORG_STATUS_LABELS), ['이용 중', '일시중지', '보관']);
  // 일시중지·보관은 새로 고르지 못한다. 관리 목록에는 그대로 남는다.
  assert.deepEqual(selectableOrgs(ROWS).map(item => item.id), ['chest', 'family', 'edu']);
  assert.equal(manageOrgs(ROWS).length, ROWS.length);
  assert.equal(manageOrgs(ROWS).at(-1).id, 'archived-one');
  // 지우는 문장이 없다. 상태만 바꾼다.
  const store = fs.readFileSync(new URL('../server/notice-org-store.js', import.meta.url), 'utf8');
  assert.ok(!/DELETE FROM notice_orgs/i.test(store), '등록부 행을 지우지 않는다');
  assert.match(archiveNote({ notices: 3, proposals: 2 }), /공고 3건·계획서 2건은 그대로 남습니다/);
});

test('추가·수정·중지·복원은 운영관리자까지, 보관은 최고관리자만', () => {
  for (const action of ['save', 'pause', 'restore']) {
    assert.equal(canManageOrg('operator', action), true, action);
    assert.equal(canManageOrg('admin', action), true, action);
  }
  assert.equal(canManageOrg('operator', 'archive'), false);
  assert.equal(canManageOrg('admin', 'archive'), true);
  // 회원은 무엇도 할 수 없다.
  for (const action of ['save', 'pause', 'archive', 'restore']) assert.equal(canManageOrg('customer', action), false);
  // 서버가 목록으로 다시 막는다.
  assert.match(api, /if \(!canManageOrg\(actor\.role, 'save'\)\) return json\(\{ error: '이 동작을 할 수 없습니다\.' \}, 403\);/);
  assert.match(api, /setOrgStatus\(db, \{ id: body\.id, status: body\.status, role: actor\.role \}\)/);
  for (const action of ['noticeOrgs', 'saveNoticeOrg', 'setNoticeOrgStatus']) assert.ok(OPERATOR_ACTIONS.has(action), action);
});

test('이름만 등록한 곳은 직접 업로드용으로 적는다', () => {
  const made = row('new-one', '새 기관', { collects: 0, builtin: 0 });
  assert.equal(made.collectLabel, MANUAL_ONLY_LABEL);
  assert.equal(row('chest', '사랑의열매').collectLabel, '자동수집 연결됨');
  // 새로 넣는 행은 언제나 collects=0이다. 이름을 넣었다고 모아 오지 않는다.
  const store = fs.readFileSync(new URL('../server/notice-org-store.js', import.meta.url), 'utf8');
  assert.match(store, /VALUES \(\?, \?, \?, \?, 'active', 0, 0, \?, \?, \?\)/);
  assert.match(app, /직접 업로드용/);
});

test('고른 결과를 한 줄로 적는다', () => {
  const usable = selectableOrgs(ROWS);
  assert.equal(selectionSummary(usable.map(item => item.id), ROWS), '전체 3곳');
  assert.equal(selectionSummary(['chest'], ROWS), '사랑의열매');
  assert.equal(selectionSummary(['chest', 'family'], ROWS), '사랑의열매 외 1곳');
  assert.equal(selectionSummary(['chest', 'family', 'edu'], ROWS), '전체 3곳');
  assert.equal(selectionSummary([], ROWS), '선택 안 함');
  // 쉬는 기관은 세지 않는다.
  assert.equal(selectionSummary(['chest', 'paused-one'], ROWS), '사랑의열매');
});

test('하나만 고르던 값은 그대로 이어 쓴다', () => {
  assert.deepEqual(normalizeSelection('chest', ROWS), ['chest']);
  assert.deepEqual(normalizeSelection(['chest', 'family'], ROWS), ['chest', 'family']);
  // 쉬는 기관·없는 기관은 걸러진다.
  assert.deepEqual(normalizeSelection(['chest', 'paused-one', 'nope'], ROWS), ['chest']);
  assert.deepEqual(normalizeSelection([], ROWS), []);
  // 화면도 예전 단일 값을 그대로 쓴다.
  assert.match(app, /return ids\.has\(state\.project\.type\) \? \[state\.project\.type\] : \[\];/);
});

test('이름과 분류로 찾는다', () => {
  assert.deepEqual(searchOrgs(ROWS, '가족').map(item => item.id), ['family']);
  assert.equal(searchOrgs(ROWS, '').length, ROWS.length);
  assert.equal(searchOrgs(ROWS, '없는말').length, 0);
});

test('이름과 순서를 검사한다', () => {
  assert.equal(validateOrg({ name: '가', sortOrder: 10 }).ok, false);
  assert.equal(validateOrg({ name: '광주복지재단', sortOrder: -1 }).ok, false);
  assert.equal(validateOrg({ name: '광주복지재단', sortOrder: 70 }).ok, true);
  assert.equal(validateOrg({ name: '광주복지재단', sortOrder: 70 }).value.status, 'active');
});

// ---------- 화면 ----------

test('머리띠에서 여러 곳을 고르고, 관리 화면에서 늘린다', () => {
  // 고르기: 검색·전체 선택·전체 해제·개별 체크
  assert.match(app, /id="org-scope-search"/);
  assert.match(app, /id="org-scope-all"/);
  assert.match(app, /id="org-scope-none"/);
  assert.match(app, /data-org-pick="\$\{escapeHtml\(item\.id\)\}"/);
  // 접었을 때 고른 결과만 한 줄로.
  assert.match(app, /공고 출처·기관: \$\{selectionSummary\(chosen, rows\)\}/);
  // 여러 곳은 찾는 범위일 뿐이다. 계획서 한 건은 공고 한 건에 붙는다.
  assert.match(app, /계획서 한 건은 고른 공고 한 건에만 연결됩니다/);
  // 관리 화면: 추가·수정·중지·복원·보관
  assert.match(app, /data-operator-tab="orgs"/);
  assert.match(app, /function noticeOrgPanel\(\)/);
  assert.match(app, /data-org-status="paused"/);
  assert.match(app, /data-org-status="active"/);
  assert.match(app, /data-org-status="archived"/);
  assert.match(app, /보관\(제거\)은 최고관리자만 할 수 있습니다/);
  // 추가한 기관이 고르는 목록에도 바로 보이게 다시 읽는다.
  assert.match(app, /state\.noticeOrgsLoaded = false;\s*void loadNoticeOrgs\(\);/);
  // 회원 화면은 이용 중인 곳만 받는다.
  assert.match(account, /if \(body\.action === 'noticeOrgs'\) return json\(\{ orgs: selectableOrgs\(await listOrgs\(env\.ARCHIVE_DB\)\) \}\);/);
});

test('처음 여섯 곳을 같은 열쇠로 옮긴다', () => {
  // 키가 바뀌면 이미 모아 둔 공고·계획서와 이어지지 않는다.
  for (const id of ['chest', 'family', 'edu', 'g2b', 'foundation', 'general']) assert.ok(migration.includes(`('${id}',`), id);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS notice_orgs/);
  assert.match(migration, /INSERT OR IGNORE INTO notice_orgs/);
});

test('고른 범위는 공고 검색에만 쓰이고 계획서 연결은 건드리지 않는다', async () => {
  const { passesFilters } = await import('../server/notice-search.js');
  const row = { business_type: 'family', title: '가족센터 공고', deadline: '' };
  // 고른 곳 안에 있으면 보이고, 밖이면 걸러진다.
  assert.equal(passesFilters(row, { businessTypes: ['chest', 'family'] }), true);
  assert.equal(passesFilters(row, { businessTypes: ['chest'] }), false);
  // 아무 곳도 고르지 않았으면 좁히지 않는다. 빈 화면을 주지 않는다.
  assert.equal(passesFilters(row, { businessTypes: [] }), true);
  assert.equal(passesFilters(row, {}), true);
  // 값이 비어 있는 옛 자료는 지금까지처럼 사랑의열매로 본다.
  assert.equal(passesFilters({ business_type: '', title: '옛 공고' }, { businessTypes: ['chest'] }), true);
  // 화면은 고른 범위를 검색 결과 위에 적는다.
  assert.match(app, /공고 출처·기관 범위: \$\{escapeHtml\(selectionSummary\(chosen, orgList\(\)\)\)\} · 머리띠에서 바꿉니다/);
  assert.match(app, /const scoped = \{ \.\.\.next\.filters, businessTypes: orgScope\(\) \};/);
  // 계획서에 붙는 유형은 여전히 하나다.
  assert.match(app, /if \(kept\.length\) state\.project\.type = kept\[0\];/);
});
