// 관리자 전용 계정 관리. 화면에서 숨기는 것이 아니라 여기서 실제로 막는다.
// 비밀번호 열은 읽지도 내보내지도 않는다.
import { recordAudit } from '../../server/audit.js';
import { RANK, adminNotice, findDuplicates, parseQuery, rankNotice, withDerived } from '../../server/notice-search.js';
import { DEFAULT_PLAN, PLANS, effectivePlan } from '../../server/plan.js';
import { revokeRecoveryCodes } from '../../server/recovery.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const SOCIAL_KEY_SUFFIX = '@social.ms12.invalid';
// 관리자가 줄 수 있는 역할. 'admin'은 여기서 줄 수 없다. 관리자 계정은 스크립트로만 만든다.
const ASSIGNABLE_ROLES = new Set(['customer', 'operator']);

export async function onRequest(context) {
  const { request, env, data } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  }
  // 미들웨어가 로그인을 확인했지만 역할은 여기서 다시 본다. 이 경로만 따로 불려도 막힌다.
  const actor = data.session?.user;
  if (!actor?.id) return json({ error: '로그인이 필요합니다.' }, 401);
  if (actor.role !== 'admin' || actor.status !== 'active') return json({ error: '관리자만 사용할 수 있습니다.' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }

  if (body.action === 'listUsers') return json({ users: await listUsers(env.ARCHIVE_DB) }, 200);
  if (body.action === 'approveUser') return mutate(env.ARCHIVE_DB, actor, body.id, approve);
  if (body.action === 'disableUser') return mutate(env.ARCHIVE_DB, actor, body.id, disable);
  if (body.action === 'deleteUser') return mutate(env.ARCHIVE_DB, actor, body.id, remove);
  // 운영관리자 지정·해제는 관리자만 한다. 운영관리자 경로(/api/operator)에서는 언제나 거절된다.
  if (body.action === 'setRole') return mutate(env.ARCHIVE_DB, actor, body.id, (db, target) => setRole(db, target, body.role));
  // 전체 이용권 부여·회수는 관리자만 한다. 운영관리자 경로(/api/operator)에서는 언제나 거절된다.
  if (body.action === 'setPlan') return mutate(env.ARCHIVE_DB, actor, body.id, (db, target) => setPlan(db, target, body.plan));
  // 공모정보 관리. 공개 여부와 상관없이 모아 둔 자료 전체를 본다.
  if (body.action === 'listNotices') return json(await listNotices(env.ARCHIVE_DB, body.query), 200);
  if (body.action === 'setNoticePublic') return setNoticePublic(env.ARCHIVE_DB, actor, body);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

// 목록. 비밀번호 열은 아예 SELECT에 넣지 않는다.
async function listUsers(db) {
  const users = await db.prepare(`SELECT id, email, role, status, name, phone, org_name, is_contact,
    terms_version, privacy_version, consented_at, profile_completed_at, created_at, plan, trial_used_at FROM users ORDER BY created_at`).all();
  const identities = await db.prepare('SELECT user_id, provider, email FROM user_identities ORDER BY linked_at').all();
  const byUser = new Map();
  for (const row of identities?.results || []) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push({ provider: row.provider, email: row.email || '' });
  }
  return (users?.results || []).map(row => ({
    id: row.id,
    // 소셜 계정 행의 email은 내부 식별용이라 사람에게 보여 주지 않는다.
    email: String(row.email || '').endsWith(SOCIAL_KEY_SUFFIX) ? '' : row.email,
    role: row.role, status: row.status, name: row.name || '', phone: row.phone || '', orgName: row.org_name || '',
    isContact: Boolean(row.is_contact), termsVersion: row.terms_version || '', privacyVersion: row.privacy_version || '',
    consentedAt: row.consented_at || '', profileCompleted: Boolean(row.profile_completed_at), createdAt: row.created_at,
    // 이용권과 무료 체험 사용 여부. plan은 저장된 값, effectivePlan은 역할까지 반영한 실제 권한이다.
    plan: row.plan || DEFAULT_PLAN, effectivePlan: effectivePlan(row), trialUsed: Boolean(row.trial_used_at), trialUsedAt: row.trial_used_at || '',
    identities: byUser.get(row.id) || []
  }));
}

// 바꾸기 전에 공통으로 확인할 것들. 관리자 계정과 자기 자신은 건드리지 못한다.
async function mutate(db, actor, id, apply) {
  const target = await db.prepare('SELECT id, email, role, status, plan FROM users WHERE id = ?').bind(String(id || '')).first();
  if (!target) return json({ error: '해당 계정을 찾지 못했습니다.' }, 404);
  if (target.id === actor.id) return json({ error: '자기 계정은 이 화면에서 바꿀 수 없습니다.' }, 400);
  // 관리자 계정을 서로 지우거나 잠그지 못하게 한다. 관리자 추가·해제는 별도 절차로만 한다.
  if (target.role === 'admin') return json({ error: '관리자 계정은 이 화면에서 바꿀 수 없습니다.' }, 400);
  const outcome = await apply(db, target);
  if (outcome.error) {
    await recordAudit(db, { actor, action: 'admin.failed', targetId: target.id, targetEmail: target.email, result: 'failed', detail: outcome.error });
    return json({ error: outcome.error }, outcome.status || 400);
  }
  await recordAudit(db, { actor, action: outcome.action, targetId: target.id, targetEmail: target.email, detail: outcome.detail || '' });
  return json({ ok: true, users: await listUsers(db) }, 200);
}

async function approve(db, target) {
  if (target.status === 'active') return { error: '이미 이용 중인 계정입니다.' };
  // 승인은 status만 바꾼다. 역할은 절대 올리지 않는다.
  await db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
    .bind('active', new Date().toISOString(), target.id).run();
  return { action: 'admin.approve', detail: `${target.status} → 이용 중` };
}

async function disable(db, target) {
  if (target.status === 'disabled') return { error: '이미 중지된 계정입니다.' };
  await db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
    .bind('disabled', new Date().toISOString(), target.id).run();
  // 쓰던 세션을 남겨 두면 중지해도 그대로 쓰게 된다.
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
  return { action: 'admin.disable', detail: `${target.status} → 중지, 세션 종료` };
}

// 운영관리자 지정·해제. 'admin'은 여기서 줄 수 없고 관리자 계정은 대상이 되지 않는다.
async function setRole(db, target, role) {
  const next = String(role || '');
  if (!ASSIGNABLE_ROLES.has(next)) return { error: '지정할 수 있는 역할은 고객·운영관리자뿐입니다.' };
  if (target.role === next) return { error: '이미 같은 역할입니다.' };
  await db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(next, new Date().toISOString(), target.id).run();
  // 역할이 바뀌면 쓰던 세션을 끊어 새 권한으로 다시 로그인하게 한다.
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
  return { action: next === 'operator' ? 'admin.grantOperator' : 'admin.revokeOperator', detail: `${target.role} → ${next}, 세션 종료` };
}

// 전체 이용권 부여·회수. 세션을 끊을 필요는 없다. 이용권은 요청마다 users 행에서 다시 읽는다.
async function setPlan(db, target, plan) {
  const next = String(plan || '');
  if (!PLANS.has(next)) return { error: '이용권은 무료 체험 또는 전체 이용권만 지정할 수 있습니다.' };
  if (target.plan === next) return { error: '이미 같은 이용권입니다.' };
  await db.prepare('UPDATE users SET plan = ?, updated_at = ? WHERE id = ?').bind(next, new Date().toISOString(), target.id).run();
  return { action: next === 'full' ? 'admin.grantFullPlan' : 'admin.revokeFullPlan', detail: `${target.plan || DEFAULT_PLAN} → ${next}` };
}

// ---------- 공모정보 관리 ----------
// 공개 여부와 상관없이 모아 둔 자료 전체를 본다. 새로 수집하거나 외부를 부르지 않는다.
async function listNotices(db, query) {
  const rows = (await db.prepare(`SELECT source_key, source, source_label, list_sn, title, deadline, application_period,
    summary, eligibility, support_limit, content_hash, region, audience, field, source_url, last_checked_at,
    duplicate_of, is_public, first_seen_at, updated_at FROM archived_notices
    ORDER BY (deadline = '') ASC, deadline DESC LIMIT 400`).all())?.results || [];
  const derived = rows.map(withDerived);
  const duplicates = findDuplicates(derived);
  const terms = parseQuery(query);
  const now = new Date();
  const notices = derived
    // 관리자 검색은 공개 여부와 관계없이 전체를 대상으로 하고 광역 범위로 찾는다.
    .filter(row => rankNotice(row, terms, 'broad') !== RANK.none)
    .map(row => adminNotice(row, { duplicate: duplicates.has(row.source_key), duplicateOf: duplicates.get(row.source_key) || '' }, now));
  return {
    notices, total: notices.length, collected: rows.length,
    hidden: derived.filter(row => Number(row.is_public ?? 1) !== 1).length,
    duplicates: duplicates.size
  };
}

async function setNoticePublic(db, actor, body) {
  const key = String(body.key || '').slice(0, 180);
  const row = await db.prepare('SELECT source_key, title, is_public FROM archived_notices WHERE source_key = ?').bind(key).first();
  if (!row) return json({ error: '해당 공모정보를 찾지 못했습니다.' }, 404);
  const next = body.isPublic ? 1 : 0;
  if (Number(row.is_public ?? 1) === next) return json({ error: '이미 같은 공개 상태입니다.' }, 400);
  await db.prepare('UPDATE archived_notices SET is_public = ? WHERE source_key = ?').bind(next, key).run();
  await recordAudit(db, {
    actor, action: next ? 'notice.publish' : 'notice.hide', targetId: key,
    detail: `${String(row.title || '').slice(0, 80)} → ${next ? '공개' : '비공개'}`
  });
  return json({ ok: true, ...(await listNotices(db, body.query)) }, 200);
}

async function remove(db, target) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
  // 소셜 연결을 함께 지워야 그 소셜 계정을 다른 계정에 다시 연결할 수 있다.
  await db.prepare('DELETE FROM user_identities WHERE user_id = ?').bind(target.id).run();
  // 남아 있는 복구코드가 새 계정에 쓰이지 않게 함께 지운다.
  await revokeRecoveryCodes(db, target.id);
  await db.prepare('DELETE FROM users WHERE id = ?').bind(target.id).run();
  return { action: 'admin.delete', detail: '계정·소셜 연결·복구코드 삭제' };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
