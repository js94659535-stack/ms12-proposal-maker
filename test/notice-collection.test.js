// 공고 자동수집. 성공·일부 실패·오류 화면·0건 급감·중복 실행·신규·갱신·기존 자료 보존을 고정한다.
// 실제 통신은 하지 않는다. 수집기는 밖에서 넣고, DB는 대역을 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FAILURE } from '../server/notice-collect.js';
import { FAILURE_CODE, RUN_STATUS, WARNING, decideRun, droppedSharply, trimSources } from '../server/notice-run.js';
import { collectionStatus, runCollection } from '../server/notice-collector.js';
import { collectionDb } from './fixtures/fake-collection-db.js';

const source = (patch = {}) => ({
  source: 'central', channel: 'board', label: '중앙회 누리집 공지사항', sourceLabel: '중앙회',
  status: 'ok', reason: '', listed: 40, candidates: 6, collected: 5, ...patch
});
const notices = count => Array.from({ length: count }, (unused, index) => ({
  source: 'central', listSn: `${1000 + index}`, title: `공모 ${index + 1}`, references: [{ source: 'central', listSn: `${1000 + index}` }]
}));

// ---------- 판정 규칙 ----------

test('모든 통로가 목록을 돌려주고 공고도 있으면 정상이다', () => {
  const decision = decideRun({ sources: [source(), source({ channel: 'proposal' })], collected: 9, baseline: 8 });
  assert.equal(decision.status, RUN_STATUS.ok);
  assert.equal(decision.failureCode, '');
  assert.equal(decision.warning, '');
  assert.equal(decision.syncable, true);
  assert.equal(decision.healthy, true);
  assert.equal(decision.listed, 80);
});

test('출처 하나가 실패하면 정상 성공으로 기록하지 않는다', () => {
  const decision = decideRun({
    sources: [source(), source({ source: 'gwangju', status: 'failed', reason: FAILURE.http, listed: 0, candidates: 0, collected: 0 })],
    collected: 5, baseline: 5
  });
  assert.equal(decision.status, RUN_STATUS.partial);
  assert.equal(decision.failureCode, FAILURE_CODE.http);
  // 성공 시각을 갱신하지 않는다.
  assert.equal(decision.healthy, false);
  // 살아 있는 출처의 신규·변경은 그래도 반영한다. 넣기만 하고 지우지 않으므로 안전하다.
  assert.equal(decision.syncable, true);
});

test('오류 화면을 HTTP 200으로 받으면 형식 실패로 적는다', () => {
  // 오류 화면 판정은 수집기가 하고(validListPayload), 여기서는 그 결과를 코드로 옮긴다.
  const decision = decideRun({
    sources: [source({ status: 'failed', reason: FAILURE.shape, listed: 0, candidates: 0, collected: 0 }),
      source({ source: 'gwangju', status: 'failed', reason: FAILURE.shape, listed: 0, candidates: 0, collected: 0 })],
    collected: 0, baseline: 12
  });
  assert.equal(decision.status, RUN_STATUS.failed);
  assert.equal(decision.failureCode, FAILURE_CODE.shape);
  assert.equal(decision.syncable, false, '실패했으면 보관함을 건드리지 않는다');
  assert.equal(decision.healthy, false);
});

test('통로는 살아 있는데 0건이면 성공이 아니라 경고다', () => {
  const decision = decideRun({ sources: [source({ candidates: 0, collected: 0 })], collected: 0, baseline: 10 });
  assert.equal(decision.status, RUN_STATUS.empty);
  assert.equal(decision.warning, WARNING.empty);
  assert.equal(decision.syncable, false, '0건으로 기존 자료를 덮지 않는다');
  assert.equal(decision.healthy, false);
});

test('최근 정상 실행보다 절반 이하로 줄면 급감으로 본다', () => {
  assert.equal(droppedSharply(5, 12), true);
  assert.equal(droppedSharply(7, 12), false);
  // 원래 적게 잡히던 것을 장애로 부르지 않는다.
  assert.equal(droppedSharply(1, 3), false);
  const decision = decideRun({ sources: [source({ collected: 4 })], collected: 4, baseline: 12 });
  assert.equal(decision.status, RUN_STATUS.ok);
  assert.equal(decision.warning, WARNING.drop);
  assert.equal(decision.healthy, false, '급감은 정상 성공으로 세지 않는다');
});

test('실행기록에는 공고 제목·본문·첨부를 남기지 않는다', () => {
  const trimmed = trimSources([{ ...source(), notices: notices(3), titles: ['공모 1'], bodyHtml: '<p>본문</p>' }]);
  assert.deepEqual(Object.keys(trimmed[0]).sort(), ['candidates', 'channel', 'code', 'collected', 'detailSkipped', 'label', 'listed', 'source', 'status']);
  const text = JSON.stringify(trimmed);
  for (const leak of ['공모 1', '본문', 'bodyHtml', 'notices']) assert.ok(!text.includes(leak), leak);
});

// ---------- 실행기 ----------

const collectOk = (count = 5, patch = {}) => async () => ({ sources: [source({ collected: count, ...patch })], notices: notices(count) });

test('정상 실행은 신규·갱신을 반영하고 성공 시각을 남긴다', async () => {
  const db = collectionDb();
  const applied = [];
  const run = await runCollection(db, {
    collect: collectOk(5),
    sync: async list => { applied.push(list.length); return { inserted: 3, updated: 2, unchanged: 0 }; },
    trigger: 'cron', now: new Date('2026-08-12T23:00:00.000Z'), id: 'run-1'
  });
  assert.equal(run.status, RUN_STATUS.ok);
  assert.equal(run.synced, true);
  assert.deepEqual(applied, [5]);
  assert.equal(run.inserted, 3);
  assert.equal(run.updated, 2);
  const state = db.tables.notice_collection_state[0];
  assert.equal(state.last_success_at, '2026-08-12T23:00:00.000Z');
  assert.equal(state.last_success_collected, 5);
  assert.equal(state.consecutive_failures, 0);
  assert.equal(state.running_since, '', '끝나면 잠금을 푼다');
  assert.equal(db.tables.notice_collection_runs.length, 1);
});

test('전부 실패하면 보관함을 건드리지 않고 연속 실패를 센다', async () => {
  const db = collectionDb();
  let synced = false;
  const failing = async () => ({
    sources: [source({ status: 'failed', reason: FAILURE.network, listed: 0, candidates: 0, collected: 0 })], notices: []
  });
  for (const stamp of ['2026-08-12T23:00:00.000Z', '2026-08-13T09:00:00.000Z']) {
    await runCollection(db, { collect: failing, sync: async () => { synced = true; return {}; }, now: new Date(stamp) });
  }
  assert.equal(synced, false, '실패했으면 sync를 부르지 않는다');
  const state = db.tables.notice_collection_state[0];
  assert.equal(state.consecutive_failures, 2);
  assert.equal(state.last_failure_code, FAILURE_CODE.network);
  assert.equal(state.last_success_at, '', '실패는 성공 시각을 남기지 않는다');
});

test('수집기가 통째로 터져도 기록만 남기고 자료는 그대로 둔다', async () => {
  const db = collectionDb();
  let synced = false;
  const run = await runCollection(db, {
    collect: async () => { throw new Error('boom'); },
    sync: async () => { synced = true; return {}; }, now: new Date('2026-08-12T23:00:00.000Z')
  });
  assert.equal(run.status, RUN_STATUS.failed);
  assert.equal(synced, false);
  assert.equal(db.tables.notice_collection_runs.length, 1);
  assert.equal(db.tables.notice_collection_state[0].running_since, '', '터져도 잠금은 푼다');
});

test('돌고 있는 동안에는 두 번째 실행이 그냥 돌아간다', async () => {
  const db = collectionDb();
  let running = null;
  const slow = () => new Promise(resolve => { running = resolve; });
  const first = runCollection(db, { collect: () => slow(), sync: async () => ({}), trigger: 'cron', now: new Date('2026-08-12T23:00:00.000Z') });
  // 첫 실행이 잠금을 잡을 때까지 기다린다.
  while (!running) await new Promise(resolve => setTimeout(resolve, 5));
  const second = await runCollection(db, { collect: collectOk(5), sync: async () => ({}), trigger: 'manual', now: new Date('2026-08-12T23:00:05.000Z') });
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'running');
  assert.equal(second.runningTrigger, 'cron');
  running({ sources: [source()], notices: notices(5) });
  await first;
  assert.equal(db.tables.notice_collection_runs.length, 1, '겹친 실행은 기록도 남기지 않는다');
});

test('멈춰 버린 잠금은 일정 시간이 지나면 넘겨받는다', async () => {
  const db = collectionDb();
  db.tables.notice_collection_state[0].running_since = '2026-08-12T22:00:00.000Z';
  db.tables.notice_collection_state[0].running_trigger = 'cron';
  const run = await runCollection(db, { collect: collectOk(4), sync: async () => ({ inserted: 4 }), now: new Date('2026-08-12T23:00:00.000Z') });
  assert.equal(run.skipped, false);
  assert.equal(run.status, RUN_STATUS.ok);
});

test('상태판은 실행기록·연속 실패·마지막 신규 유입일을 함께 돌려준다', async () => {
  const db = collectionDb();
  db.tables.archived_notices.push(
    { source_key: 'central:1', first_seen_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z' },
    { source_key: 'central:2', first_seen_at: '2026-08-11T05:00:00.000Z', updated_at: '2026-08-11T05:00:00.000Z' }
  );
  await runCollection(db, { collect: collectOk(5), sync: async () => ({ inserted: 1, updated: 1, unchanged: 3 }), trigger: 'manual', now: new Date('2026-08-12T23:00:00.000Z') });
  const status = await collectionStatus(db);
  assert.equal(status.runs.length, 1);
  assert.equal(status.runs[0].trigger, 'manual');
  assert.equal(status.runs[0].inserted, 1);
  assert.equal(status.archive.total, 2);
  assert.equal(status.archive.lastNewNoticeAt, '2026-08-11T05:00:00.000Z');
  // 검색이 되는 것과 수집이 정상인 것은 다른 상태다.
  assert.equal(status.searchable, true);
  assert.equal(status.collectHealthy, true);
  assert.equal(status.state.consecutiveFailures, 0);
});

test('검색 자료가 있어도 수집이 실패하면 수집 상태는 정상이 아니다', async () => {
  const db = collectionDb();
  db.tables.archived_notices.push({ source_key: 'central:1', first_seen_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' });
  await runCollection(db, {
    collect: async () => ({ sources: [source({ status: 'failed', reason: FAILURE.shape })], notices: [] }),
    sync: async () => ({}), now: new Date('2026-08-12T23:00:00.000Z')
  });
  const status = await collectionStatus(db);
  assert.equal(status.searchable, true, '검색은 그대로 된다');
  assert.equal(status.collectHealthy, false, '수집 성공과 검색 성공은 별개다');
  assert.equal(status.archive.total, 1, '실패해도 기존 자료는 남는다');
});

// ---------- 구조·안전 조건 ----------

test('자동수집 Worker는 공식 수집 규칙을 그대로 쓰고 AI를 부르지 않는다', () => {
  const worker = fs.readFileSync(new URL('../worker/notice-collector.js', import.meta.url), 'utf8');
  // 수집 규칙을 다시 구현하지 않는다.
  assert.match(worker, /import \{ collectNotices \} from '\.\.\/functions\/api\/notices\.js'/);
  assert.match(worker, /import \{ syncNotices \} from '\.\.\/functions\/api\/archive\.js'/);
  assert.match(worker, /trigger: 'cron'/);
  // AI·비밀값·삭제 경로가 없다.
  for (const forbidden of ['openai', 'OPENAI', 'DELETE', 'callModel']) assert.ok(!worker.includes(forbidden), forbidden);

  const config = fs.readFileSync(new URL('../worker/wrangler.toml', import.meta.url), 'utf8');
  // 한국시간 08:00·18:00 = UTC 23:00·09:00.
  assert.match(config, /crons = \["0 23 \* \* \*", "0 9 \* \* \*"\]/);
  assert.match(config, /binding = "ARCHIVE_DB"/);
  assert.match(config, /database_name = "ms12-proposal-archive"/);
});

test('공식 허용 도메인 밖으로는 요청하지 않는다', async () => {
  const { SOURCES } = await import('../server/notice-collect.js');
  const origins = Object.values(SOURCES).map(item => item.origin);
  assert.deepEqual(origins, ['https://chest.or.kr', 'https://gwangju.chest.or.kr']);
  const collect = fs.readFileSync(new URL('../functions/api/notices.js', import.meta.url), 'utf8');
  const hosts = [...collect.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map(match => match[1]);
  for (const host of new Set(hosts)) assert.ok(/(^|\.)chest\.or\.kr$/.test(host), `허용 도메인 밖: ${host}`);
  // 다른 출처의 첨부(공고문·신청서식)는 주소로 받아 오되, 수집 허용 목록을 통과한 주소만 연다.
  // 주소를 이 파일에 적어 두지 않고 allowedOrigin이 판단한다.
  assert.match(collect, /import \{ allowedOrigin \} from '\.\.\/\.\.\/server\/notice-sources\.js'/);
  assert.match(collect, /if \(!\/\^https:\\\/\\\/\/i\.test\(url\) \|\| !allowedOrigin\(url\)\) return json\(/);
});

test('마이그레이션은 표를 만들기만 하고 기존 자료를 건드리지 않는다', () => {
  const sql = fs.readFileSync(new URL('../migrations/0012_notice_collection.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS notice_collection_runs/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS notice_collection_state/);
  for (const destructive of ['DROP ', 'DELETE ', 'UPDATE archived_notices', 'ALTER TABLE archived_notices']) {
    assert.ok(!sql.includes(destructive), destructive);
  }
});

test('보관함 반영은 넣고 고치기만 한다. 지우는 경로가 없다', () => {
  const archive = fs.readFileSync(new URL('../functions/api/archive.js', import.meta.url), 'utf8');
  const sync = archive.slice(archive.indexOf('export async function syncNotices'), archive.indexOf('export async function searchNotices'));
  assert.ok(!/DELETE|DROP|TRUNCATE/i.test(sync), '자동수집이 공고를 지우지 못한다');
  assert.match(sync, /ON CONFLICT\(source_key\) DO UPDATE/);
});

test('운영관리자는 상태만 보고 수동 재수집은 관리자만 한다', async () => {
  const { BLOCKED_ACTIONS, OPERATOR_ACTIONS } = await import('../server/operator-scope.js');
  assert.ok(OPERATOR_ACTIONS.has('noticeCollection'), '운영관리자는 상태를 본다');
  assert.ok(!OPERATOR_ACTIONS.has('runNoticeCollection'), '운영관리자는 실행하지 않는다');
  assert.equal(BLOCKED_ACTIONS.get('runNoticeCollection'), '공고 수동 재수집');
  const operator = fs.readFileSync(new URL('../functions/api/operator.js', import.meta.url), 'utf8');
  assert.match(operator, /readOnly: true/);
  const admin = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');
  assert.match(admin, /if \(body\.action === 'runNoticeCollection'\)/);
  assert.match(admin, /trigger: 'manual'/);
  // 이미 돌고 있으면 409로 막는다.
  assert.match(admin, /running: true/);
});
