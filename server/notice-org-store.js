// 공고 출처·기관 등록부의 저장. 읽기는 누구나(로그인한 사람), 쓰기는 권한을 본 뒤에만 부른다.
import { archiveNote, canManageOrg, newOrgId, orgView, validateOrg } from './notice-orgs.js';

export async function listOrgs(db) {
  if (!db) return [];
  const rows = await db.prepare('SELECT * FROM notice_orgs ORDER BY sort_order, name').all().catch(() => null);
  return (rows?.results || []).map(orgView);
}

export async function findOrg(db, id) {
  if (!db || !id) return null;
  return orgView(await db.prepare('SELECT * FROM notice_orgs WHERE id = ?').bind(String(id).slice(0, 40)).first().catch(() => null));
}

// 새로 넣거나 이름·분류·순서를 고친다. 처음부터 있던 여섯 가지도 이름은 고칠 수 있다.
export async function saveOrg(db, { id = '', value, actorId = '' }) {
  const existing = id ? await findOrg(db, id) : null;
  const checked = validateOrg(value, { existing });
  if (!checked.ok) return { ok: false, error: checked.errors.join(' ') };
  const now = new Date().toISOString();
  if (existing) {
    await db.prepare('UPDATE notice_orgs SET name = ?, category = ?, sort_order = ?, updated_at = ? WHERE id = ?')
      .bind(checked.value.name, checked.value.category, checked.value.sortOrder, now, existing.id).run();
    return { ok: true, org: await findOrg(db, existing.id), created: false };
  }
  const orgId = newOrgId();
  // 새로 넣은 곳은 자동수집이 없다. collects=0으로 두고 화면에서 「직접 업로드용」으로 적는다.
  await db.prepare(`INSERT INTO notice_orgs (id, name, category, sort_order, status, collects, builtin, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, 'active', 0, 0, ?, ?, ?)`)
    .bind(orgId, checked.value.name, checked.value.category, checked.value.sortOrder, now, now, String(actorId).slice(0, 80)).run();
  return { ok: true, org: await findOrg(db, orgId), created: true };
}

// 상태만 바꾼다. 어떤 경우에도 행을 지우지 않는다.
export async function setOrgStatus(db, { id, status, role }) {
  const org = await findOrg(db, id);
  if (!org) return { ok: false, error: '그 기관을 찾지 못했습니다.' };
  const action = status === 'archived' ? 'archive' : status === 'paused' ? 'pause' : 'restore';
  if (!canManageOrg(role, action)) return { ok: false, error: '이 동작은 최고관리자만 할 수 있습니다.', status: 403 };
  if (!['active', 'paused', 'archived'].includes(status)) return { ok: false, error: '상태 값이 올바르지 않습니다.' };
  const counts = await orgUsage(db, id);
  await db.prepare('UPDATE notice_orgs SET status = ?, updated_at = ? WHERE id = ?')
    .bind(status, new Date().toISOString(), org.id).run();
  return { ok: true, org: await findOrg(db, org.id), counts, note: archiveNote(counts) };
}

// 이 기관에 딸린 자료. 지우지 않는다는 말을 숫자로 보여 주기 위한 것이다.
export async function orgUsage(db, id) {
  if (!db) return { notices: 0, proposals: 0 };
  const key = String(id || '').slice(0, 40);
  const notices = await db.prepare('SELECT COUNT(*) AS total FROM archived_notices WHERE business_type = ?').bind(key).first().catch(() => null);
  const proposals = await db.prepare("SELECT COUNT(*) AS total FROM archived_proposals WHERE json_extract(payload, '$.project.type') = ?").bind(key).first().catch(() => null);
  return { notices: Number(notices?.total || 0), proposals: Number(proposals?.total || 0) };
}
