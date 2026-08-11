// 가입 후 최소 정보와 연결된 소셜 계정 목록. 로그인한 본인 것만 읽고 쓴다.
import { CONSENT_VERSIONS, PROVIDER_LABELS, validateProfileForm } from '../../server/social-identity.js';
import { CONTACT_LABEL, effectivePlan } from '../../server/plan.js';
import { recordAudit } from '../../server/audit.js';
import { PREMIUM_LABEL, contractState } from '../../server/premium.js';
import { EDITABLE_FIELDS, LOCKED_FIELDS, PROFILE_FIELDS, auditDetail, changedFields, needsReview, validateMemberProfile } from '../../server/member-profile.js';

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
  // 본인정보 수정. 승인 대기·정식·프리미엄 회원 모두 쓴다.
  if (body.action === 'saveProfile') return saveProfile(env.ARCHIVE_DB, data.session.user, body);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

async function profile(db, user) {
  const row = await db.prepare(`SELECT name, phone, org_name, is_contact, terms_version, privacy_version, consented_at,
    profile_completed_at, plan, trial_used_at, profile_updated_at, profile_review_needed FROM users WHERE id = ?`)
    .bind(user.id).first();
  const member = await memberProfile(db, user.id);
  const contract = await ownContract(db, user.id);
  const state = contractState(contract);
  return json({
    // 이용권과 무료 체험 사용 여부는 화면 안내용이다. 실제 차단은 생성 API가 다시 확인한다.
    user: {
      ...user, profileCompleted: Boolean(row?.profile_completed_at),
      plan: effectivePlan({ role: user.role, plan: row?.plan }), trialUsed: Boolean(row?.trial_used_at), trialUsedAt: row?.trial_used_at || '',
      contactLabel: CONTACT_LABEL,
      // 프리미엄 여부는 여기서 알려 주기만 한다. 실제 차단은 /api/premium이 다시 확인한다.
      premium: state.premium, premiumLabel: PREMIUM_LABEL, premiumStatus: state.status, premiumStatusLabel: state.label,
      premiumReadOnly: state.readOnly
    },
    profile: {
      phone: row?.phone || '', orgName: row?.org_name || '', isContact: Boolean(row?.is_contact),
      termsVersion: row?.terms_version || '', privacyVersion: row?.privacy_version || '', consentedAt: row?.consented_at || ''
    },
    // 회원이 직접 고칠 수 있는 항목만 담는다. 역할·승인·이용권·프리미엄 상태는 들어가지 않는다.
    memberProfile: { name: row?.name || '', phone: row?.phone || '', orgName: row?.org_name || '', ...member },
    editableFields: EDITABLE_FIELDS.map(([key, label]) => ({ key, label })),
    lockedFields: [...LOCKED_FIELDS],
    profileUpdatedAt: row?.profile_updated_at || '',
    profileReviewNeeded: Number(row?.profile_review_needed || 0) === 1,
    contract: contract ? { status: state.status, statusLabel: state.label, progress: contract.progress, startedOn: contract.startedOn, endsOn: contract.endsOn } : null,
    identities: await linkedIdentities(db, user.id),
    consent: CONSENT_VERSIONS
  }, 200);
}

async function memberProfile(db, userId) {
  const row = await db.prepare(`SELECT org_type, org_address, org_intro, staff, facilities, programs, achievements, partners, reuse_note, updated_at
    FROM member_profiles WHERE user_id = ?`).bind(String(userId || '')).first();
  return {
    orgType: row?.org_type || '', orgAddress: row?.org_address || '', orgIntro: row?.org_intro || '',
    staff: row?.staff || '', facilities: row?.facilities || '', programs: row?.programs || '',
    achievements: row?.achievements || '', partners: row?.partners || '', reuseNote: row?.reuse_note || '',
    updatedAt: row?.updated_at || ''
  };
}

async function ownContract(db, userId) {
  const row = await db.prepare('SELECT status, started_on, ends_on, progress FROM premium_contracts WHERE user_id = ?')
    .bind(String(userId || '')).first();
  if (!row) return null;
  return { status: row.status, startedOn: row.started_on || '', endsOn: row.ends_on || '', progress: row.progress || '접수' };
}

// 본인정보 수정. 목록에 있는 항목만 바꾸고, 무엇이 바뀌었는지만 감사기록에 남긴다.
async function saveProfile(db, user, body) {
  const checked = validateMemberProfile(body);
  if (!checked.ok) return json({ error: checked.errors.join(' '), lockedFields: checked.locked }, 400);
  const before = { ...(await memberProfile(db, user.id)) };
  const row = await db.prepare('SELECT name, phone, org_name FROM users WHERE id = ?').bind(user.id).first();
  const current = { name: row?.name || '', phone: row?.phone || '', orgName: row?.org_name || '', ...before };
  const changed = changedFields(current, checked.value);
  const now = new Date().toISOString();
  const review = needsReview(changed);

  await db.prepare('UPDATE users SET name = ?, phone = ?, org_name = ?, profile_updated_at = ?, profile_review_needed = ?, updated_at = ? WHERE id = ?')
    .bind(checked.value.name, checked.value.phone, checked.value.orgName, now, review ? 1 : 0, now, user.id).run();
  await db.prepare(`INSERT INTO member_profiles (user_id, org_type, org_address, org_intro, staff, facilities, programs, achievements, partners, reuse_note, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET org_type=excluded.org_type, org_address=excluded.org_address, org_intro=excluded.org_intro,
      staff=excluded.staff, facilities=excluded.facilities, programs=excluded.programs, achievements=excluded.achievements,
      partners=excluded.partners, reuse_note=excluded.reuse_note, updated_at=excluded.updated_at`)
    .bind(user.id, ...PROFILE_FIELDS.map(([key]) => checked.value[key]), now).run();

  // 값은 남기지 않는다. 어떤 항목이 바뀌었는지만 남긴다.
  if (changed.length) {
    await recordAudit(db, { actor: user, action: 'member.updateProfile', targetId: user.id, targetEmail: user.email, detail: auditDetail(changed) });
  }
  return json({ ok: true, changed: changed.map(field => field.label), profileUpdatedAt: now, profileReviewNeeded: review }, 200);
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
