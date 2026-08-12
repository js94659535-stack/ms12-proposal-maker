// 자동수집 시험용 D1 대역. 이 기능이 쓰는 질의만 알아듣고, 모르는 질의는 던진다.
// 실제 D1처럼 UPDATE가 실제로 바꾼 행 수를 meta.changes로 돌려준다. 잠금 판정이 여기에 걸려 있다.

const RUN_COLUMNS = ['id', 'started_at', 'finished_at', 'trigger', 'status', 'listed', 'candidates', 'collected',
  'inserted', 'updated', 'unchanged', 'failure_code', 'warning', 'synced', 'duration_ms', 'sources_json'];

export function collectionDb() {
  const tables = { notice_collection_state: [], notice_collection_runs: [], archived_notices: [] };

  const emptyState = () => ({
    id: 1, running_since: '', running_trigger: '', last_run_at: '', last_run_status: '',
    last_success_at: '', last_success_collected: 0, consecutive_failures: 0, last_failure_code: ''
  });
  // 마이그레이션이 한 행을 미리 넣어 둔다(INSERT OR IGNORE ... VALUES (1)).
  tables.notice_collection_state.push(emptyState());

  function run(sql, args) {
    const text = sql.replace(/\s+/g, ' ').trim();

    if (text === 'INSERT OR IGNORE INTO notice_collection_state (id) VALUES (1)') {
      if (!tables.notice_collection_state.length) tables.notice_collection_state.push(emptyState());
      return { rows: [], changes: 0 };
    }

    if (text.startsWith('SELECT running_since, running_trigger')) {
      return { rows: tables.notice_collection_state.slice(0, 1), changes: 0 };
    }

    // 잠금 잡기. 비어 있거나 오래된 것만 넘겨받는다.
    if (text.startsWith('UPDATE notice_collection_state SET running_since = ?, running_trigger = ?')) {
      const [since, trigger, stale] = args;
      const row = tables.notice_collection_state[0];
      if (!row) return { rows: [], changes: 0 };
      if (row.running_since !== '' && !(row.running_since < stale)) return { rows: [], changes: 0 };
      row.running_since = since;
      row.running_trigger = trigger;
      return { rows: [], changes: 1 };
    }

    // 잠금 풀기 + 누적 상태 기록.
    if (text.startsWith("UPDATE notice_collection_state SET running_since = '', running_trigger = ''")) {
      const row = tables.notice_collection_state[0];
      if (!row) return { rows: [], changes: 0 };
      const [lastRunAt, lastRunStatus, lastSuccessAt, lastSuccessCollected, failures, failureCode] = args;
      Object.assign(row, {
        running_since: '', running_trigger: '', last_run_at: lastRunAt, last_run_status: lastRunStatus,
        last_success_at: lastSuccessAt, last_success_collected: lastSuccessCollected,
        consecutive_failures: failures, last_failure_code: failureCode
      });
      return { rows: [], changes: 1 };
    }

    if (text.startsWith('INSERT INTO notice_collection_runs')) {
      tables.notice_collection_runs.push(Object.fromEntries(RUN_COLUMNS.map((name, index) => [name, args[index]])));
      return { rows: [], changes: 1 };
    }

    if (text.startsWith('SELECT id, started_at, finished_at, trigger, status')) {
      const limit = Number(args[0] || 10);
      const rows = [...tables.notice_collection_runs].sort((left, right) => String(right.started_at).localeCompare(String(left.started_at))).slice(0, limit);
      return { rows, changes: 0 };
    }

    if (text.startsWith('SELECT COUNT(*) AS total, MAX(first_seen_at) AS newest')) {
      const list = tables.archived_notices;
      const max = key => list.reduce((best, row) => (String(row[key] || '') > best ? String(row[key]) : best), '');
      return { rows: [{ total: list.length, newest: max('first_seen_at'), touched: max('updated_at') }], changes: 0 };
    }

    throw new Error(`대역이 모르는 질의: ${text.slice(0, 90)}`);
  }

  return {
    tables,
    prepare(sql) {
      let bound = [];
      const self = {
        bind(...args) { bound = args; return self; },
        async run() { const result = run(sql, bound); return { success: true, meta: { changes: result.changes } }; },
        async first() { const result = run(sql, bound); return result.rows[0] || null; },
        async all() { const result = run(sql, bound); return { results: result.rows }; }
      };
      return self;
    }
  };
}
