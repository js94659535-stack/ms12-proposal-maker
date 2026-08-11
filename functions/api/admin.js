// 관리자 전용 계정 관리. 화면에서 숨기는 것이 아니라 여기서 실제로 막는다.
// 비밀번호 열은 읽지도 내보내지도 않는다.
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const SOCIAL_KEY_SUFFIX = '@social.ms12.invalid';

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
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

// 목록. 비밀번호 열은 아예 SELECT에 넣지 않는다.
async function listUsers(db) {
  const users = await db.prepare(`SELECT id, email, role, status, name, phone, org_name, is_contact,
    terms_version, privacy_version, consented_at, profile_completed_at, created_at FROM users ORDER BY created_at`).all();
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
    identities: byUser.get(row.id) || []
  }));
}

// 바꾸기 전에 공통으로 확인할 것들. 관리자 계정과 자기 자신은 건드리지 못한다.
async function mutate(db, actor, id, apply) {
  const target = await db.prepare('SELECT id, role, status FROM users WHERE id = ?').bind(String(id || '')).first();
  if (!target) return json({ error: '해당 계정을 찾지 못했습니다.' }, 404);
  if (target.id === actor.id) return json({ error: '자기 계정은 이 화면에서 바꿀 수 없습니다.' }, 400);
  // 관리자 계정을 서로 지우거나 잠그지 못하게 한다. 관리자 추가·해제는 별도 절차로만 한다.
  if (target.role === 'admin') return json({ error: '관리자 계정은 이 화면에서 바꿀 수 없습니다.' }, 400);
  const failed = await apply(db, target);
  if (failed) return failed;
  return json({ ok: true, users: await listUsers(db) }, 200);
}

async function approve(db, target) {
  if (target.status === 'active') return json({ error: '이미 이용 중인 계정입니다.' }, 400);
  // 승인은 status만 바꾼다. 역할은 절대 올리지 않는다.
  await db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
    .bind('active', new Date().toISOString(), target.id).run();
  return null;
}

async function disable(db, target) {
  if (target.status === 'disabled') return json({ error: '이미 중지된 계정입니다.' }, 400);
  await db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
    .bind('disabled', new Date().toISOString(), target.id).run();
  // 쓰던 세션을 남겨 두면 중지해도 그대로 쓰게 된다.
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
  return null;
}

async function remove(db, target) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
  // 소셜 연결을 함께 지워야 그 소셜 계정을 다른 계정에 다시 연결할 수 있다.
  await db.prepare('DELETE FROM user_identities WHERE user_id = ?').bind(target.id).run();
  await db.prepare('DELETE FROM users WHERE id = ?').bind(target.id).run();
  return null;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
