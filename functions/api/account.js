// 가입 후 최소 정보와 연결된 소셜 계정 목록. 로그인한 본인 것만 읽고 쓴다.
import { CONSENT_VERSIONS, PROVIDER_LABELS, validateProfileForm } from '../../server/social-identity.js';
import { CONTACT_LABEL, effectivePlan } from '../../server/plan.js';
import { recordAudit } from '../../server/audit.js';
import { PREMIUM_LABEL, contractState } from '../../server/premium.js';
import { MEMBER_FREE_PAGES, QUOTAS, membershipOf, membershipPlans } from '../../server/membership.js';
import { SUBSCRIPTION_LABELS, loadSubscription, remaining } from '../../server/subscription.js';
import { remainingFor } from '../../server/agency.js';
import { monthlyUsage, stateFor } from '../../server/agency-store.js';
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

  // 에이전트 본인이 보는 자격·한도·남은 편수. 남의 자격은 돌려주지 않는다.
  if (body.action === 'agencyMe') return agencyMe(env.ARCHIVE_DB, data.session.user);
  if (body.action === 'profile') return profile(env.ARCHIVE_DB, data.session.user);
  if (body.action === 'completeProfile') return completeProfile(env.ARCHIVE_DB, data.session.user, body);
  // 본인정보 수정. 승인 대기·정식·프리미엄 회원 모두 쓴다.
  if (body.action === 'saveProfile') return saveProfile(env.ARCHIVE_DB, data.session.user, body);
  // 개인정보·열람 안내 확인. 회원이 직접 누를 때만 기록한다. 기존 계정을 자동 동의로 만들지 않는다.
  if (body.action === 'acknowledgeNotice') return acknowledgeNotice(env.ARCHIVE_DB, data.session.user, body);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

async function profile(db, user) {
  const row = await db.prepare(`SELECT name, phone, org_name, is_contact, terms_version, privacy_version, consented_at,
    profile_completed_at, plan, trial_used_at, profile_updated_at, profile_review_needed, privacy_notice_version, privacy_notice_at FROM users WHERE id = ?`)
    .bind(user.id).first();
  const member = await memberProfile(db, user.id);
  const contract = await ownContract(db, user.id);
  const state = contractState(contract);
  const subscription = await loadSubscription(db, user.id);
  const membership = membershipOf({ user: { ...user, plan: row?.plan }, subscription, contract: state.premium ? state : null });
  return json({
    // 이용권과 무료 체험 사용 여부는 화면 안내용이다. 실제 차단은 생성 API가 다시 확인한다.
    user: {
      ...user, profileCompleted: Boolean(row?.profile_completed_at),
      plan: effectivePlan({ role: user.role, plan: row?.plan }), trialUsed: Boolean(row?.trial_used_at), trialUsedAt: row?.trial_used_at || '',
      contactLabel: CONTACT_LABEL,
      // 프리미엄 여부는 여기서 알려 주기만 한다. 실제 차단은 /api/premium이 다시 확인한다.
      premium: state.premium, premiumLabel: PREMIUM_LABEL, premiumStatus: state.status, premiumStatusLabel: state.label,
      premiumReadOnly: state.readOnly,
      // 어느 판 안내에 동의했는지. 비어 있으면 아직 확인하지 않은 것이다.
      privacyNoticeVersion: row?.privacy_notice_version || '', privacyNoticeAt: row?.privacy_notice_at || ''
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
    // 계정 설정에 보여 줄 이용현황. 랜딩·관리자 화면과 같은 설정값을 쓴다.
    membership: {
      tier: membership.tier, label: membership.label,
      approval: membership.approval, approvalLabel: membership.approvalLabel,
      locked: membership.locked, legacyFull: membership.legacyFull,
      canCoreProposal: membership.canCoreProposal, coreMaxPages: membership.coreMaxPages, coreReadOnly: membership.coreReadOnly,
      canDiagnosis: membership.canDiagnosis, canEdit: membership.canEdit, canExport: membership.canExport, canExpertWork: membership.canExpertWork,
      freePages: MEMBER_FREE_PAGES, freeUsed: Boolean(row?.trial_used_at),
      subscription: subscription
        ? {
          status: subscription.status, statusLabel: SUBSCRIPTION_LABELS[subscription.status] || subscription.status,
          startedOn: subscription.startedOn, endsOn: subscription.endsOn, renewsOn: subscription.renewsOn,
          remaining: { coreProposal: remaining(subscription, 'coreProposal'), diagnosis: remaining(subscription, 'diagnosis') },
          quota: QUOTAS.subscriber
        }
        : { status: 'none', statusLabel: SUBSCRIPTION_LABELS.none, remaining: { coreProposal: 0, diagnosis: 0 }, quota: QUOTAS.subscriber }
    },
    plans: membershipPlans(),
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

// 개인정보·업무자료 열람 안내 확인. 판 번호와 시각만 남긴다.
async function acknowledgeNotice(db, user, body) {
  const version = String(body?.version || '').trim().slice(0, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) return json({ error: '안내 판 번호가 올바르지 않습니다.' }, 400);
  const now = new Date().toISOString();
  await db.prepare('UPDATE users SET privacy_notice_version = ?, privacy_notice_at = ? WHERE id = ?').bind(version, now, user.id).run();
  return json({ privacyNoticeVersion: version, privacyNoticeAt: now }, 200);
}

// 에이전트 본인 화면에 적을 값. 자격·한도·이번 달 사용량·남은 편수·갱신일만 돌려준다.
// 다른 회원의 자격이나 비밀값은 담지 않는다.
async function agencyMe(db, user) {
  const state = await stateFor(db, user.id);
  if (!state.has) return json({ has: false }, 200);
  const usage = await monthlyUsage(db, user.id);
  return json({
    has: true, active: state.active, status: state.status, reason: state.reason,
    startsOn: state.startsOn, endsOn: state.endsOn, limits: state.limits,
    usage: { plans: usage.plans, diagnoses: usage.diagnoses, tokens: usage.tokens, calls: usage.calls, since: usage.since },
    remaining: remainingFor(state, usage)
  }, 200);
}
