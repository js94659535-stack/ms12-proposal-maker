// 가입 후 최소 정보와 연결된 소셜 계정 목록. 로그인한 본인 것만 읽고 쓴다.
import { CONSENT_VERSIONS, PROVIDER_LABELS, validateProfileForm } from '../../server/social-identity.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

export async function onRequest(context) {
  const { request, env, data } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  }
  // 미들웨어가 이미 세션을 확인했지만, 이 경로만 따로 불려도 안전하도록 다시 본다.
  if (!data.session?.user?.id) return json({ error: '로그인이 필요합니다.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }

  if (body.action === 'profile') return profile(env.ARCHIVE_DB, data.session.user);
  if (body.action === 'completeProfile') return completeProfile(env.ARCHIVE_DB, data.session.user, body);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

async function profile(db, user) {
  const row = await db.prepare('SELECT phone, org_name, is_contact, terms_version, privacy_version, consented_at, profile_completed_at FROM users WHERE id = ?')
    .bind(user.id).first();
  return json({
    user: { ...user, profileCompleted: Boolean(row?.profile_completed_at) },
    profile: {
      phone: row?.phone || '', orgName: row?.org_name || '', isContact: Boolean(row?.is_contact),
      termsVersion: row?.terms_version || '', privacyVersion: row?.privacy_version || '', consentedAt: row?.consented_at || ''
    },
    identities: await linkedIdentities(db, user.id),
    consent: CONSENT_VERSIONS
  }, 200);
}

async function completeProfile(db, user, body) {
  const checked = validateProfileForm(body);
  if (!checked.ok) return json({ error: checked.errors.join(' ') }, 400);
  const now = new Date().toISOString();
  // 동의한 문서의 버전과 시점을 함께 남긴다. 승인 여부는 관리자가 따로 정한다.
  await db.prepare(`UPDATE users SET name = ?, phone = ?, org_name = ?, is_contact = ?,
      terms_version = ?, privacy_version = ?, consented_at = ?, profile_completed_at = ?, updated_at = ? WHERE id = ?`)
    .bind(checked.value.name, checked.value.phone, checked.value.orgName, checked.value.isContact ? 1 : 0,
      CONSENT_VERSIONS.terms, CONSENT_VERSIONS.privacy, now, now, now, user.id).run();
  return json({ ok: true, profileCompleted: true, status: user.status, consent: CONSENT_VERSIONS }, 200);
}

async function linkedIdentities(db, userId) {
  const rows = await db.prepare('SELECT provider, email, linked_at FROM user_identities WHERE user_id = ? ORDER BY linked_at').bind(userId).all();
  return (rows?.results || []).map(row => ({ provider: row.provider, label: PROVIDER_LABELS[row.provider] || row.provider, email: row.email || '', linkedAt: row.linked_at }));
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
