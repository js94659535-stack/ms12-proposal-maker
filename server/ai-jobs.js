// 같은 작업을 두 번 결제하지 않는다.
//
// 규칙 세 가지.
// 1. AI를 부르기 전에 기록을 남긴다. 창을 닫아도 그 작업이 어디 있는지 알 수 있어야 한다.
// 2. 같은 계획서·같은 단계·같은 입력이면 새로 부르지 않는다. 끝난 것은 그 결과를 주고,
//    돌고 있는 것은 그 작업번호를 준다.
// 3. 오래 방치된 기록은 막지 않는다. 한 번 어긋난 기록이 영원히 길을 막으면 안 된다.
//
// 프롬프트·공고 원문은 담지 않는다. 결과 사본은 다시 부르지 않기 위해서만 둔다.

// 앞단 호출이 살아 있을 수 있는 최대 시간. 요청이 이보다 오래 살아남는 일은 없다.
// 이 시각을 넘긴 running 기록은 「죽은 것」이며 길을 막지 않는다. 시간으로 짐작하는 것이 아니라
// 요청 수명의 상한이라 확실하다. (서버 요청 시간제한 300초 + 여유 30초)
export const LEASE_MS = 330 * 1000;
// 배경 작업은 시간으로 판단하지 않는다. 작업번호로 상류 상태를 확인한다.
// 다만 상류 보관이 끝난 뒤까지 남은 기록은 정리한다.
export const BACKGROUND_LEASE_MS = 20 * 60 * 1000;
// 예전 이름. 남은 호출부가 있으면 같은 뜻으로 동작한다.
export const STALE_MS = LEASE_MS;
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
export function decideReuse(row, now = Date.now(), { force = false } = {}) {
  // 사람이 「그래도 다시 만들기」를 눌렀으면 무엇도 막지 않는다. 막혀서 결과가 안 나오는 일이 더 나쁘다.
  if (force) return { kind: 'new', forced: true };
  if (!row) return { kind: 'new' };
  if (row.status === 'done' && row.result_json) return { kind: 'done' };
  if (row.status !== 'running') return { kind: 'new' };
  // 배경으로 넘어간 작업은 시간이 아니라 상류 상태로 판단한다.
  if (row.job_id) {
    const age = now - Date.parse(row.updated_at || row.created_at || 0);
    return Number.isFinite(age) && age > BACKGROUND_LEASE_MS ? { kind: 'new' } : { kind: 'poll', jobId: row.job_id };
  }
  // 앞단 호출은 수명 상한까지만 막는다. 그 시각을 넘겼으면 죽은 요청이다.
  const lease = Date.parse(row.lease_until || 0);
  if (Number.isFinite(lease) && lease > now) return { kind: 'wait', until: row.lease_until, seconds: Math.ceil((lease - now) / 1000) };
  return { kind: 'new' };
}

export async function findJob(db, userId, action, inputHash) {
  if (!db) return null;
  return db.prepare('SELECT * FROM ai_jobs WHERE id = ?').bind(jobKey(userId, action, inputHash)).first();
}

export async function startJob(db, { userId, proposalId, action, inputHash, forced = false, leaseMs = LEASE_MS }) {
  if (!db) return null;
  const at = new Date();
  const now = at.toISOString();
  const lease = new Date(at.getTime() + leaseMs).toISOString();
  const id = jobKey(userId, action, inputHash);
  await db.prepare(`INSERT INTO ai_jobs (id, user_id, proposal_id, action, input_hash, job_id, status, result_json, total_tokens, reused_count, created_at, updated_at, lease_until, attempts, force_count)
    VALUES (?, ?, ?, ?, ?, '', 'running', '', 0, 0, ?, ?, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET status = 'running', job_id = '', result_json = '', updated_at = excluded.updated_at,
      lease_until = excluded.lease_until, attempts = ai_jobs.attempts + 1, force_count = ai_jobs.force_count + ?`)
    .bind(id, text(userId, 80), text(proposalId, 80), text(action, 40), text(inputHash, 64), now, now, lease, forced ? 1 : 0, forced ? 1 : 0).run();
  return id;
}

// 배경으로 넘어갔으면 작업번호를 바로 남긴다. 이것이 있어야 창을 닫아도 결과를 되찾는다.
export async function noteJobId(db, id, jobId) {
  if (!db || !id || !jobId) return;
  const at = new Date();
  await db.prepare('UPDATE ai_jobs SET job_id = ?, updated_at = ?, lease_until = ? WHERE id = ?')
    .bind(text(jobId, 120), at.toISOString(), new Date(at.getTime() + BACKGROUND_LEASE_MS).toISOString(), id).run();
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
  const rows = await db.prepare(`SELECT action, status, job_id, total_tokens, reused_count, created_at, updated_at, lease_until, attempts, force_count
    FROM ai_jobs WHERE user_id = ? AND proposal_id = ? ORDER BY updated_at DESC LIMIT 20`)
    .bind(text(userId, 80), text(proposalId, 80)).all();
  const now = Date.now();
  return (rows?.results || []).map(row => ({
    action: row.action, status: row.status, hasJobId: Boolean(row.job_id),
    tokens: Number(row.total_tokens || 0), reused: Number(row.reused_count || 0),
    at: row.updated_at,
    attempts: Number(row.attempts || 0), forced: Number(row.force_count || 0),
    live: row.status === 'running' && (Boolean(row.job_id) ? now - Date.parse(row.updated_at || 0) < BACKGROUND_LEASE_MS : Date.parse(row.lease_until || 0) > now)
  }));
}
