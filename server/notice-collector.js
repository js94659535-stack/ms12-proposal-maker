// 자동수집 실행기. 잠금 → 수집 → 보관함 반영 → 기록 순서로 한 번을 처리한다.
// 수집 규칙 자체는 건드리지 않는다. functions/api/notices.js가 쓰는 것을 그대로 받아 쓴다.
// AI는 부르지 않는다. 회원·계획서·기관정보·사용량 표에는 접근하지 않는다.
import { RUN_STATUS, decideRun } from './notice-run.js';
import { SOURCES, runnable } from './notice-sources.js';
import { mergeAcrossSources } from './notice-dedupe.js';

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
    // 여러 출처에서 온 목록을 하나로 묶는다. 링크는 모두 남긴다.
    const raw = Array.isArray(collected.notices) ? collected.notices : [];
    const combined = mergeAcrossSources(raw);
    const notices = combined.notices;
    const decision = decideRun({ sources: collected.sources || [], collected: notices.length, baseline: before.lastSuccessCollected });

    // 실패했으면 보관함을 건드리지 않는다. 빈 목록으로 덮어쓰는 일이 없어야 한다.
    let applied = { inserted: 0, updated: 0, unchanged: 0 };
    if (decision.syncable && typeof sync === 'function') applied = await sync(notices) || applied;

    const finishedAt = new Date(Math.max(now.getTime(), Date.now())).toISOString();
    outcome = {
      id: runId, startedAt, finishedAt, trigger, ...decision,
      inserted: Number(applied.inserted || 0), updated: Number(applied.updated || 0), unchanged: Number(applied.unchanged || 0),
      synced: decision.syncable, durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
      merged: combined.merged,
      // 출처별 제외 사유. 건수만 남기고 제목·본문은 넣지 않는다.
      skippedCounts: mergeSkipped(collected.sources || [])
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
    (id, started_at, finished_at, trigger, status, listed, candidates, collected, inserted, updated, unchanged, failure_code, warning, synced, duration_ms, sources_json, skipped_json, merged)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(run.id, run.startedAt, run.finishedAt, run.trigger, run.status, run.listed, run.candidates, run.collected,
      run.inserted, run.updated, run.unchanged, run.failureCode, run.warning, run.synced ? 1 : 0, run.durationMs,
      JSON.stringify(run.sources), JSON.stringify(run.skippedCounts || {}), Number(run.merged || 0)).run();
}

// 관리자·운영관리자가 보는 상태판. 읽기만 한다.
export async function collectionStatus(db, { limit = RECENT_RUNS } = {}) {
  const state = await readState(db);
  const rows = await db.prepare(`SELECT id, started_at, finished_at, trigger, status, listed, candidates, collected,
    inserted, updated, unchanged, failure_code, warning, synced, duration_ms, sources_json, skipped_json, merged
    FROM notice_collection_runs ORDER BY started_at DESC LIMIT ?`).bind(limit).all();
  const runs = (rows?.results || []).map(row => ({
    id: row.id, startedAt: row.started_at, finishedAt: row.finished_at, trigger: row.trigger, status: row.status,
    listed: Number(row.listed || 0), candidates: Number(row.candidates || 0), collected: Number(row.collected || 0),
    inserted: Number(row.inserted || 0), updated: Number(row.updated || 0), unchanged: Number(row.unchanged || 0),
    failureCode: row.failure_code || '', warning: row.warning || '', synced: Number(row.synced || 0) === 1,
    durationMs: Number(row.duration_ms || 0), sources: safeJson(row.sources_json),
    skippedCounts: safeObject(row.skipped_json), merged: Number(row.merged || 0)
  }));
  // 검색 자료 쪽 사실. 공고 내용은 읽지 않고 수량과 날짜만 본다.
  const archive = await db.prepare('SELECT COUNT(*) AS total, MAX(first_seen_at) AS newest, MAX(updated_at) AS touched FROM archived_notices').first();
  const settings = await readSourceSettings(db);
  return {
    state, runs,
    // 출처별 상태. 무엇이 켜져 있고 무엇이 왜 꺼져 있는지 함께 알려 준다.
    sources: SOURCES.map(source => {
      const gate = runnable(source, { settings, secrets: {} });
      return {
        id: source.id, group: source.group, label: source.label, organization: source.organization,
        kind: source.kind, origin: source.origin, verified: source.verified,
        needsSecret: source.needsSecret, note: source.note,
        enabled: settings[source.id] === undefined ? source.defaultEnabled : Boolean(settings[source.id]),
        // 인증키 유무는 상태판에서 알려 주지 않는다. 값도 이름도 여기서 다루지 않는다.
        blocked: gate.ok ? '' : gate.reason
      };
    }),
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

// 출처 켜고 끄기. 행이 없으면 등록부의 기본값을 따른다.
export async function readSourceSettings(db) {
  try {
    const rows = await db.prepare('SELECT source_id, enabled FROM notice_source_settings').all();
    return Object.fromEntries((rows?.results || []).map(row => [row.source_id, Number(row.enabled || 0) === 1]));
  } catch {
    // 표가 아직 없으면 기본값으로 돈다.
    return {};
  }
}

export async function setSourceEnabled(db, { sourceId, enabled, actor, note = '', now = new Date() } = {}) {
  const source = SOURCES.find(item => item.id === sourceId);
  if (!source) return { ok: false, error: '알 수 없는 출처입니다.' };
  // 아직 연결하지 못한 출처는 켤 수 없다. 켜 두면 매번 실패로 쌓인다.
  if (enabled && (!source.verified || source.kind === 'blocked')) {
    return { ok: false, error: '아직 공식 경로를 확인하지 못한 출처라 켤 수 없습니다.' };
  }
  await db.prepare(`INSERT INTO notice_source_settings (source_id, enabled, updated_at, updated_by, note)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by, note = excluded.note`)
    .bind(sourceId, enabled ? 1 : 0, now.toISOString(), String(actor?.id || ''), String(note).slice(0, 200)).run();
  return { ok: true, sourceId, enabled: Boolean(enabled) };
}

// 출처별 제외 사유를 하나로 모은다.
function mergeSkipped(sources) {
  const total = {};
  for (const source of sources) {
    for (const [reason, count] of Object.entries(source?.skipped || {})) total[reason] = (total[reason] || 0) + count;
  }
  return total;
}

function safeObject(value) { try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
