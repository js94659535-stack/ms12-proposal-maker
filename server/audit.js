// 감사기록. 누가·누구를·무엇을·언제 했는지만 남긴다.
// 비밀번호·복구코드 원문·계획서 원문은 어떤 열에도 넣지 않는다.
const MAX_DETAIL = 200;

export async function recordAudit(db, { actor, action, targetId = '', targetEmail = '', result = 'ok', detail = '' }, now = new Date()) {
  await db.prepare(`INSERT INTO admin_audit_log (id, actor_id, actor_email, actor_role, action, target_id, target_email, result, detail, at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), String(actor?.id || ''), String(actor?.email || ''), String(actor?.role || ''),
      String(action), String(targetId || ''), String(targetEmail || ''), String(result || 'ok'),
      String(detail || '').slice(0, MAX_DETAIL), now.toISOString()).run();
}

export async function listAudit(db, { limit = 50 } = {}) {
  const rows = await db.prepare(`SELECT actor_email, actor_role, action, target_id, target_email, result, detail, at
    FROM admin_audit_log ORDER BY at DESC LIMIT ?`).bind(auditLimit(limit)).all();
  return toEntries(rows);
}

// 한 계정에 대한 기록만 본다. 계정 화면에서 「이 계정에 무슨 일이 있었나」를 바로 확인한다.
export async function listAuditForTarget(db, targetId, { limit = 20 } = {}) {
  const rows = await db.prepare(`SELECT actor_email, actor_role, action, target_id, target_email, result, detail, at
    FROM admin_audit_log WHERE target_id = ? ORDER BY at DESC LIMIT ?`).bind(String(targetId || ''), auditLimit(limit)).all();
  return toEntries(rows);
}

const auditLimit = value => Math.min(Math.max(Number(value) || 50, 1), 200);

function toEntries(rows) {
  return (rows?.results || []).map(row => ({
    actorEmail: row.actor_email || '', actorRole: row.actor_role || '', action: row.action,
    targetId: row.target_id || '', targetEmail: row.target_email || '', result: row.result || 'ok',
    detail: row.detail || '', at: row.at
  }));
}
