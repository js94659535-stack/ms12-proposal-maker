// 같은 작업을 두 번 결제하지 않는다.
//
// 규칙 세 가지.
// 1. AI를 부르기 전에 기록을 남긴다. 창을 닫아도 그 작업이 어디 있는지 알 수 있어야 한다.
// 2. 같은 계획서·같은 단계·같은 입력이면 새로 부르지 않는다. 끝난 것은 그 결과를 주고,
//    돌고 있는 것은 그 작업번호를 준다.
// 3. 오래 방치된 기록은 막지 않는다. 한 번 어긋난 기록이 영원히 길을 막으면 안 된다.
//
// 프롬프트·공고 원문은 담지 않는다. 결과 사본은 다시 부르지 않기 위해서만 둔다.

// 이 시간이 지나도록 끝나지 않은 기록은 길을 막지 않는다.
export const STALE_MS = 20 * 60 * 1000;
// 결과 사본의 크기 한도. 넘으면 사본 없이 기록만 남긴다(그때는 다시 부른다).
export const RESULT_LIMIT = 400_000;
// 중복을 막을 작업. 생성 계열만 본다.
export const GUARDED_ACTIONS = new Set(['master', 'masterDesign', 'masterPlan', 'draftPart', 'fullProposal']);

const text = (value, max) => String(value ?? '').trim().slice(0, max);

// 입력이 같은지 판정할 때 쓰는 값. 시각·식별자처럼 매번 달라지는 것은 뺀다.
export function stableInput(action, payload = {}) {
  const copy = { ...payload };
  delete copy.proposalId;
  return `${action}|${stableJson(copy)}`;
}

// 키 순서가 달라도 같은 입력으로 보이게 정렬해서 문자열로 만든다.
export function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export async function hashInput(action, payload) {
  const bytes = new TextEncoder().encode(stableInput(action, payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(part => part.toString(16).padStart(2, '0')).join('');
}

export const jobKey = (userId, action, inputHash) => `${text(userId, 80)}:${text(action, 40)}:${inputHash.slice(0, 32)}`;

// 이 기록을 지금 다시 쓸 수 있는지. 끝난 것은 결과를, 도는 것은 작업번호를 준다.
export function decideReuse(row, now = Date.now()) {
  if (!row) return { kind: 'new' };
  const age = now - Date.parse(row.updated_at || row.created_at || 0);
  if (row.status === 'done' && row.result_json) return { kind: 'done' };
  if (row.status === 'running' && Number.isFinite(age) && age < STALE_MS) {
    return row.job_id ? { kind: 'poll', jobId: row.job_id } : { kind: 'wait' };
  }
  return { kind: 'new' };
}

export async function findJob(db, userId, action, inputHash) {
  if (!db) return null;
  return db.prepare('SELECT * FROM ai_jobs WHERE id = ?').bind(jobKey(userId, action, inputHash)).first();
}

export async function startJob(db, { userId, proposalId, action, inputHash }) {
  if (!db) return null;
  const now = new Date().toISOString();
  const id = jobKey(userId, action, inputHash);
  await db.prepare(`INSERT INTO ai_jobs (id, user_id, proposal_id, action, input_hash, job_id, status, result_json, total_tokens, reused_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '', 'running', '', 0, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = 'running', job_id = '', result_json = '', updated_at = excluded.updated_at`)
    .bind(id, text(userId, 80), text(proposalId, 80), text(action, 40), text(inputHash, 64), now, now).run();
  return id;
}

// 배경으로 넘어갔으면 작업번호를 바로 남긴다. 이것이 있어야 창을 닫아도 결과를 되찾는다.
export async function noteJobId(db, id, jobId) {
  if (!db || !id || !jobId) return;
  await db.prepare('UPDATE ai_jobs SET job_id = ?, updated_at = ? WHERE id = ?')
    .bind(text(jobId, 120), new Date().toISOString(), id).run();
}

export async function finishJob(db, id, result, totalTokens = 0) {
  if (!db || !id) return;
  const body = JSON.stringify(result ?? null);
  await db.prepare('UPDATE ai_jobs SET status = ?, result_json = ?, total_tokens = ?, updated_at = ? WHERE id = ?')
    .bind('done', body.length > RESULT_LIMIT ? '' : body, Number(totalTokens) || 0, new Date().toISOString(), id).run();
}

export async function failJob(db, id) {
  if (!db || !id) return;
  await db.prepare("UPDATE ai_jobs SET status = 'failed', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
}

export async function countReuse(db, id) {
  if (!db || !id) return;
  await db.prepare('UPDATE ai_jobs SET reused_count = reused_count + 1, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
}

// 이 계획서에 지금 돌고 있는 작업과 이미 끝난 작업. 다시 만들기 전에 화면이 먼저 보여 준다.
export async function jobsForProposal(db, userId, proposalId) {
  if (!db) return [];
  const rows = await db.prepare(`SELECT action, status, job_id, total_tokens, reused_count, created_at, updated_at
    FROM ai_jobs WHERE user_id = ? AND proposal_id = ? ORDER BY updated_at DESC LIMIT 20`)
    .bind(text(userId, 80), text(proposalId, 80)).all();
  const now = Date.now();
  return (rows?.results || []).map(row => ({
    action: row.action, status: row.status, hasJobId: Boolean(row.job_id),
    tokens: Number(row.total_tokens || 0), reused: Number(row.reused_count || 0),
    at: row.updated_at,
    live: row.status === 'running' && now - Date.parse(row.updated_at || 0) < STALE_MS
  }));
}
