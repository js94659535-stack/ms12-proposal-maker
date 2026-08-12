// 자동수집 실행기. 잠금 → 수집 → 보관함 반영 → 기록 순서로 한 번을 처리한다.
// 수집 규칙 자체는 건드리지 않는다. functions/api/notices.js가 쓰는 것을 그대로 받아 쓴다.
// AI는 부르지 않는다. 회원·계획서·기관정보·사용량 표에는 접근하지 않는다.
import { RUN_STATUS, decideRun } from './notice-run.js';

// 실행이 이보다 오래 「진행 중」이면 죽은 것으로 보고 잠금을 넘겨받는다.
export const LOCK_STALE_MINUTES = 15;
// 상태 화면에 보여 줄 최근 실행 수.
export const RECENT_RUNS = 10;

const minutesBefore = (now, minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();

// 한 번에 하나만 돌게 한다. 자동 실행과 관리자의 수동 실행이 겹치는 것을 막는다.
async function claimLock(db, trigger, now) {
  await db.prepare('INSERT OR IGNORE INTO notice_collection_state (id) VALUES (1)').run();
  const result = await db.prepare(
    "UPDATE notice_collection_state SET running_since = ?, running_trigger = ? WHERE id = 1 AND (running_since = '' OR running_since < ?)"
  ).bind(now.toISOString(), trigger, minutesBefore(now, LOCK_STALE_MINUTES)).run();
  return Number(result?.meta?.changes || 0) > 0;
}

async function releaseLock(db, patch) {
  await db.prepare(`UPDATE notice_collection_state SET running_since = '', running_trigger = '',
    last_run_at = ?, last_run_status = ?, last_success_at = ?, last_success_collected = ?, consecutive_failures = ?, last_failure_code = ?
    WHERE id = 1`)
    .bind(patch.lastRunAt, patch.lastRunStatus, patch.lastSuccessAt, patch.lastSuccessCollected, patch.consecutiveFailures, patch.lastFailureCode).run();
}

export async function readState(db) {
  await db.prepare('INSERT OR IGNORE INTO notice_collection_state (id) VALUES (1)').run();
  const row = await db.prepare(`SELECT running_since, running_trigger, last_run_at, last_run_status, last_success_at,
    last_success_collected, consecutive_failures, last_failure_code FROM notice_collection_state WHERE id = 1`).first();
  return {
    runningSince: row?.running_since || '', runningTrigger: row?.running_trigger || '',
    lastRunAt: row?.last_run_at || '', lastRunStatus: row?.last_run_status || '',
    lastSuccessAt: row?.last_success_at || '', lastSuccessCollected: Number(row?.last_success_collected || 0),
    consecutiveFailures: Number(row?.consecutive_failures || 0), lastFailureCode: row?.last_failure_code || ''
  };
}

// 실행 한 번. collect와 sync를 밖에서 넣어 시험할 수 있게 둔다.
export async function runCollection(db, { collect, sync, trigger = 'cron', now = new Date(), id = '' } = {}) {
  const before = await readState(db);
  if (!await claimLock(db, trigger, now)) {
    // 이미 돌고 있다. 두 번 돌리지 않고 그대로 돌아간다.
    return { skipped: true, reason: 'running', runningSince: before.runningSince, runningTrigger: before.runningTrigger };
  }

  const startedAt = now.toISOString();
  const runId = id || crypto.randomUUID();
  let outcome = null;
  try {
    let collected = { sources: [], notices: [] };
    try {
      collected = await collect();
    } catch (error) {
      // 수집기 자체가 터진 경우. 통로 목록이 없으므로 전부 실패로 본다.
      collected = { sources: [], notices: [] };
    }
    const notices = Array.isArray(collected.notices) ? collected.notices : [];
    const decision = decideRun({ sources: collected.sources || [], collected: notices.length, baseline: before.lastSuccessCollected });

    // 실패했으면 보관함을 건드리지 않는다. 빈 목록으로 덮어쓰는 일이 없어야 한다.
    let applied = { inserted: 0, updated: 0, unchanged: 0 };
    if (decision.syncable && typeof sync === 'function') applied = await sync(notices) || applied;

    const finishedAt = new Date(Math.max(now.getTime(), Date.now())).toISOString();
    outcome = {
      id: runId, startedAt, finishedAt, trigger, ...decision,
      inserted: Number(applied.inserted || 0), updated: Number(applied.updated || 0), unchanged: Number(applied.unchanged || 0),
      synced: decision.syncable, durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt))
    };
    await recordRun(db, outcome);
    return { skipped: false, ...outcome };
  } finally {
    const status = outcome?.status || RUN_STATUS.failed;
    const healthy = Boolean(outcome?.healthy);
    await releaseLock(db, {
      lastRunAt: startedAt,
      lastRunStatus: status,
      // 「정상 성공」일 때만 성공 시각과 기준 수량을 갱신한다.
      lastSuccessAt: healthy ? startedAt : before.lastSuccessAt,
      lastSuccessCollected: healthy ? Number(outcome?.collected || 0) : before.lastSuccessCollected,
      consecutiveFailures: healthy ? 0 : before.consecutiveFailures + 1,
      lastFailureCode: healthy ? '' : (outcome?.failureCode || before.lastFailureCode)
    });
  }
}

async function recordRun(db, run) {
  await db.prepare(`INSERT INTO notice_collection_runs
    (id, started_at, finished_at, trigger, status, listed, candidates, collected, inserted, updated, unchanged, failure_code, warning, synced, duration_ms, sources_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(run.id, run.startedAt, run.finishedAt, run.trigger, run.status, run.listed, run.candidates, run.collected,
      run.inserted, run.updated, run.unchanged, run.failureCode, run.warning, run.synced ? 1 : 0, run.durationMs,
      JSON.stringify(run.sources)).run();
}

// 관리자·운영관리자가 보는 상태판. 읽기만 한다.
export async function collectionStatus(db, { limit = RECENT_RUNS } = {}) {
  const state = await readState(db);
  const rows = await db.prepare(`SELECT id, started_at, finished_at, trigger, status, listed, candidates, collected,
    inserted, updated, unchanged, failure_code, warning, synced, duration_ms, sources_json
    FROM notice_collection_runs ORDER BY started_at DESC LIMIT ?`).bind(limit).all();
  const runs = (rows?.results || []).map(row => ({
    id: row.id, startedAt: row.started_at, finishedAt: row.finished_at, trigger: row.trigger, status: row.status,
    listed: Number(row.listed || 0), candidates: Number(row.candidates || 0), collected: Number(row.collected || 0),
    inserted: Number(row.inserted || 0), updated: Number(row.updated || 0), unchanged: Number(row.unchanged || 0),
    failureCode: row.failure_code || '', warning: row.warning || '', synced: Number(row.synced || 0) === 1,
    durationMs: Number(row.duration_ms || 0), sources: safeJson(row.sources_json)
  }));
  // 검색 자료 쪽 사실. 공고 내용은 읽지 않고 수량과 날짜만 본다.
  const archive = await db.prepare('SELECT COUNT(*) AS total, MAX(first_seen_at) AS newest, MAX(updated_at) AS touched FROM archived_notices').first();
  return {
    state, runs,
    archive: {
      total: Number(archive?.total || 0),
      lastNewNoticeAt: archive?.newest || '',
      lastUpdatedAt: archive?.touched || ''
    },
    // 공고 검색이 되는 것과 최신 공고가 들어오는 것은 다른 상태다. 둘을 따로 보여 준다.
    searchable: Number(archive?.total || 0) > 0,
    collectHealthy: state.lastRunStatus === RUN_STATUS.ok && state.consecutiveFailures === 0
  };
}

function safeJson(value) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
