// 권한 표와 열람기록을 읽고 쓴다. 판정 자체는 permissions.js가 한다.
// 계획서 원문·비밀번호·토큰은 이 파일 어디에서도 기록하지 않는다.
import { grantView, proposalMeta, validateGrant } from './permissions.js';

export async function loadGrants(db, subjectId) {
  if (!subjectId) return [];
  const rows = await db.prepare(`SELECT id, subject_id, subject_role, scope, target_kind, target_id,
    can_view, can_view_content, can_edit, can_download, can_manage, can_progress,
    starts_on, ends_on, note, granted_by, granted_at, revoked_at, revoked_by
    FROM access_grants WHERE subject_id = ? AND revoked_at = '' ORDER BY granted_at DESC`).bind(String(subjectId)).all();
  return rows?.results || [];
}

export async function listGrants(db, subjectId = '') {
  const rows = subjectId
    ? await db.prepare(`SELECT id, subject_id, subject_role, scope, target_kind, target_id,
        can_view, can_view_content, can_edit, can_download, can_manage, can_progress,
        starts_on, ends_on, note, granted_by, granted_at, revoked_at, revoked_by
        FROM access_grants WHERE subject_id = ? ORDER BY granted_at DESC LIMIT 200`).bind(String(subjectId)).all()
    : await db.prepare(`SELECT id, subject_id, subject_role, scope, target_kind, target_id,
        can_view, can_view_content, can_edit, can_download, can_manage, can_progress,
        starts_on, ends_on, note, granted_by, granted_at, revoked_at, revoked_by
        FROM access_grants ORDER BY granted_at DESC LIMIT 200`).all();
  return (rows?.results || []).map(grantView);
}

export async function saveGrant(db, actor, value, { today = '', now = new Date() } = {}) {
  const checked = validateGrant(value, { today });
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const target = await db.prepare('SELECT id, role, status FROM users WHERE id = ?').bind(checked.value.subjectId).first();
  if (!target) return { ok: false, errors: ['해당 계정을 찾지 못했습니다.'] };
  // 최고관리자에게는 권한을 따로 주지 않는다. 이미 전부 볼 수 있고, 권한 표로 줄이지도 않는다.
  if (target.role === 'admin') return { ok: false, errors: ['최고관리자에게는 권한을 따로 지정하지 않습니다.'] };

  const id = crypto.randomUUID();
  const stamp = now.toISOString();
  const { abilities } = checked.value;
  await db.prepare(`INSERT INTO access_grants
    (id, subject_id, subject_role, scope, target_kind, target_id, can_view, can_view_content, can_edit, can_download, can_manage, can_progress, starts_on, ends_on, note, granted_by, granted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, checked.value.subjectId, target.role, checked.value.scope, checked.value.targetKind, checked.value.targetId,
      bit(abilities.view), bit(abilities.viewContent), bit(abilities.edit), bit(abilities.download), bit(abilities.manage), bit(abilities.progress),
      checked.value.startsOn, checked.value.endsOn, checked.value.note, actor.id, stamp).run();
  await recordAccess(db, { actor, action: 'grant', scope: checked.value.scope, targetKind: checked.value.targetKind, targetId: checked.value.targetId, targetUserId: checked.value.subjectId, reason: checked.value.note });
  return { ok: true, id };
}

// 회수는 즉시 걸린다. 판정이 요청마다 이 표를 다시 읽기 때문이다.
export async function revokeGrant(db, actor, id, { now = new Date() } = {}) {
  const key = String(id || '').trim();
  if (!key) return { ok: false, errors: ['권한을 지정해 주세요.'] };
  const row = await db.prepare('SELECT id, subject_id, scope, target_kind, target_id FROM access_grants WHERE id = ?').bind(key).first();
  if (!row) return { ok: false, errors: ['해당 권한을 찾지 못했습니다.'] };
  await db.prepare("UPDATE access_grants SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at = ''")
    .bind(now.toISOString(), actor.id, key).run();
  await recordAccess(db, { actor, action: 'revoke', scope: row.scope, targetKind: row.target_kind, targetId: row.target_id, targetUserId: row.subject_id });
  return { ok: true, id: key };
}

// 열람·내려받기·권한 변경 기록. 원문은 넣지 않고 무엇을 봤는지만 남긴다.
export async function recordAccess(db, { actor, action, scope = '', targetKind = '', targetId = '', targetUserId = '', allowed = true, reason = '' }, now = new Date()) {
  try {
    await db.prepare(`INSERT INTO data_access_log (id, at, actor_id, actor_role, action, scope, target_kind, target_id, target_user_id, allowed, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), now.toISOString(), String(actor?.id || ''), String(actor?.role || ''), String(action),
        String(scope), String(targetKind), String(targetId).slice(0, 120), String(targetUserId), allowed ? 1 : 0, String(reason).slice(0, 200)).run();
  } catch {
    // 기록에 실패해도 요청 자체를 막지는 않는다. 다만 조용히 넘기지 않도록 이 자리를 남겨 둔다.
  }
}

export async function listAccessLog(db, { subjectId = '', limit = 50 } = {}) {
  const rows = subjectId
    ? await db.prepare('SELECT id, at, actor_id, actor_role, action, scope, target_kind, target_id, target_user_id, allowed, reason FROM data_access_log WHERE actor_id = ? ORDER BY at DESC LIMIT ?').bind(String(subjectId), limit).all()
    : await db.prepare('SELECT id, at, actor_id, actor_role, action, scope, target_kind, target_id, target_user_id, allowed, reason FROM data_access_log ORDER BY at DESC LIMIT ?').bind(limit).all();
  return (rows?.results || []).map(row => ({
    id: row.id, at: row.at, actorId: row.actor_id, actorRole: row.actor_role, action: row.action,
    scope: row.scope, targetKind: row.target_kind, targetId: row.target_id, targetUserId: row.target_user_id,
    allowed: Number(row.allowed || 0) === 1, reason: row.reason || ''
  }));
}

// 회원별 계획서 편수와 메타정보. 원문(proposal_json)은 읽지 않는다.
export async function proposalUsage(db) {
  const rows = await db.prepare(`SELECT user_id, COUNT(*) AS count, MAX(updated_at) AS last_updated, SUM(export_count) AS exports
    FROM archived_proposals GROUP BY user_id`).all();
  return (rows?.results || []).map(row => ({
    userId: row.user_id || '',
    count: Number(row.count || 0),
    lastUpdatedAt: row.last_updated || '',
    exportCount: Number(row.exports || 0)
  }));
}

// 계획서 목록(메타정보만). 원문 열은 SELECT하지 않는다.
export async function listProposalMeta(db, { userId = '', includeUnclaimed = false, limit = 100 } = {}) {
  const base = `SELECT id, user_id, notice_key, title, stage, created_at, updated_at, export_count, support_consent,
    LENGTH(proposal_json) AS content_bytes FROM archived_proposals`;
  const rows = userId
    ? await db.prepare(`${base} WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`).bind(String(userId), limit).all()
    : includeUnclaimed
      ? await db.prepare(`${base} ORDER BY updated_at DESC LIMIT ?`).bind(limit).all()
      : await db.prepare(`${base} WHERE user_id != '' ORDER BY updated_at DESC LIMIT ?`).bind(limit).all();
  return (rows?.results || []).map(proposalMeta);
}

// 복구키를 가진 회원이 스스로 자기 계정에 붙인다. 관리자가 짐작해서 붙이지 않는다.
export async function claimProposals(db, { userId, ownerHash, actor, now = new Date() } = {}) {
  if (!userId || !ownerHash) return { claimed: 0 };
  const result = await db.prepare("UPDATE archived_proposals SET user_id = ?, claimed_at = ?, claimed_by = ? WHERE owner_hash = ? AND user_id = ''")
    .bind(String(userId), now.toISOString(), String(actor?.id || userId), String(ownerHash)).run();
  const claimed = Number(result?.meta?.changes || 0);
  if (claimed) await recordAccess(db, { actor: actor || { id: userId, role: 'customer' }, action: 'claim', scope: 'proposals', targetKind: 'user', targetUserId: String(userId), reason: `복구키로 ${claimed}건 연결` }, now);
  return { claimed };
}

const bit = value => (value ? 1 : 0);
