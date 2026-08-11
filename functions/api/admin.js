// 관리자 전용 계정 관리. 화면에서 숨기는 것이 아니라 여기서 실제로 막는다.
// 비밀번호 열은 읽지도 내보내지도 않는다.
import { recordAudit } from '../../server/audit.js';
import { usageReport } from '../../server/ai-usage.js';
import { RANK, adminNotice, findDuplicates, parseQuery, rankNotice, withDerived } from '../../server/notice-search.js';
import { DEFAULT_PLAN, PLANS, effectivePlan } from '../../server/plan.js';
import { revokeRecoveryCodes } from '../../server/recovery.js';
import {
  PREMIUM_ADMIN_LABEL, SHOWCASE_LIMIT, contractState, findIdentifiers, publicShowcase, validateContract, validateShowcase
} from '../../server/premium.js';

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
  // AI 사용량·비용. 회원별·계획서별·기간별로 본다.
  if (body.action === 'usageReport') return json(await usageReport(env.ARCHIVE_DB, env, { days: body.days, userId: body.userId, proposalId: body.proposalId }), 200);
  // 정식 수주회원(프리미엄) 부여·중지. 관리자만 한다. 운영관리자 경로에서는 언제나 거절된다.
  if (body.action === 'setPremium') return mutate(env.ARCHIVE_DB, actor, body.id, (db, target) => setPremium(db, target, body, actor));
  // 공개용 우수 제안서. 관리자가 만든 사본만 다룬다. 회원 계획서를 옮겨 오지 않는다.
  if (body.action === 'listShowcase') return json(await listShowcase(env.ARCHIVE_DB), 200);
  if (body.action === 'saveShowcase') return saveShowcase(env.ARCHIVE_DB, actor, body);
  if (body.action === 'setShowcasePublic') return setShowcasePublic(env.ARCHIVE_DB, actor, body);
  if (body.action === 'setShowcaseOrder') return setShowcaseOrder(env.ARCHIVE_DB, actor, body);
  if (body.action === 'deleteShowcase') return deleteShowcase(env.ARCHIVE_DB, actor, body);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

// ---------- 정식 수주회원(프리미엄) ----------

// 계약을 넣거나 고친다. 계약이 끝나도 행은 남긴다. 이미 전달한 결과물을 계속 읽어야 하기 때문이다.
async function setPremium(db, target, body, actor) {
  const checked = validateContract(body.contract || body);
  if (!checked.ok) return { error: checked.errors.join(' ') };
  const now = new Date().toISOString();
  const before = await db.prepare('SELECT status FROM premium_contracts WHERE user_id = ?').bind(target.id).first();
  const next = checked.value;
  await db.prepare(`INSERT INTO premium_contracts (user_id, status, started_on, ends_on, progress, progress_note, contract_name, granted_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET status=excluded.status, started_on=excluded.started_on, ends_on=excluded.ends_on,
      progress=excluded.progress, progress_note=excluded.progress_note, contract_name=excluded.contract_name, updated_at=excluded.updated_at`)
    .bind(target.id, next.status, next.startedOn, next.endsOn, next.progress, next.progressNote, next.contractName,
      String(actor?.id || ''), now, now).run();
  const action = next.status === 'active' ? 'admin.grantPremium' : 'admin.revokePremium';
  return { action, detail: `${PREMIUM_ADMIN_LABEL} ${before?.status || '없음'} → ${next.status}${next.endsOn ? ` (~${next.endsOn})` : ''}` };
}

// ---------- 공개용 우수 제안서 ----------

async function listShowcase(db) {
  const rows = (await db.prepare(`SELECT id, title, field, purpose, audience, structure, outcome_design, body,
    is_public, sort_order, created_at, updated_at FROM showcase_proposals ORDER BY sort_order, created_at`).all())?.results || [];
  const publicCount = rows.filter(row => Number(row.is_public) === 1).length;
  return {
    limit: SHOWCASE_LIMIT, publicCount,
    proposals: rows.map(row => ({
      ...publicShowcase(row), isPublic: Number(row.is_public) === 1,
      createdAt: row.created_at, updatedAt: row.updated_at,
      // 저장된 사본에 식별정보가 남았는지 다시 알려 준다.
      identifiers: findIdentifiers([row.title, row.field, row.purpose, row.audience, row.structure, row.outcome_design, row.body].join('\n'))
    }))
  };
}

async function saveShowcase(db, actor, body) {
  const checked = validateShowcase(body.proposal || body);
  if (!checked.ok) return json({ error: checked.errors.join(' '), identifiers: checked.identifiers }, 400);
  const now = new Date().toISOString();
  const id = String(body.id || '').trim();
  const value = checked.value;
  if (id) {
    const existing = await db.prepare('SELECT id FROM showcase_proposals WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: '해당 제안서를 찾지 못했습니다.' }, 404);
    await db.prepare(`UPDATE showcase_proposals SET title=?, field=?, purpose=?, audience=?, structure=?, outcome_design=?, body=?, updated_at=? WHERE id=?`)
      .bind(value.title, value.field, value.purpose, value.audience, value.structure, value.outcomeDesign, value.body, now, id).run();
    await recordAudit(db, { actor, action: 'admin.updateShowcase', targetId: id, detail: value.title.slice(0, 80) });
  } else {
    await db.prepare(`INSERT INTO showcase_proposals (id, title, field, purpose, audience, structure, outcome_design, body, is_public, sort_order, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), value.title, value.field, value.purpose, value.audience, value.structure, value.outcomeDesign, value.body,
        Number(body.order) || 0, String(actor?.id || ''), now, now).run();
    await recordAudit(db, { actor, action: 'admin.createShowcase', detail: value.title.slice(0, 80) });
  }
  return json({ ok: true, ...(await listShowcase(db)) }, 200);
}

async function setShowcasePublic(db, actor, body) {
  const id = String(body.id || '').trim();
  const wanted = body.isPublic === true || body.isPublic === 1;
  const row = await db.prepare('SELECT id, title, is_public FROM showcase_proposals WHERE id = ?').bind(id).first();
  if (!row) return json({ error: '해당 제안서를 찾지 못했습니다.' }, 404);
  if (wanted) {
    const publicCount = Number((await db.prepare('SELECT COUNT(*) AS n FROM showcase_proposals WHERE is_public = 1 AND id <> ?').bind(id).first())?.n || 0);
    // 공개는 다섯 편까지만. 넘기려 하면 무엇을 내려야 하는지 알려 준다.
    if (publicCount >= SHOWCASE_LIMIT) return json({ error: `공개는 ${SHOWCASE_LIMIT}편까지만 할 수 있습니다. 다른 제안서를 비공개로 바꾼 뒤 다시 시도해 주세요.` }, 400);
  }
  await db.prepare('UPDATE showcase_proposals SET is_public = ?, updated_at = ? WHERE id = ?').bind(wanted ? 1 : 0, new Date().toISOString(), id).run();
  await recordAudit(db, { actor, action: wanted ? 'admin.publishShowcase' : 'admin.unpublishShowcase', targetId: id, detail: String(row.title || '').slice(0, 80) });
  return json({ ok: true, ...(await listShowcase(db)) }, 200);
}

async function setShowcaseOrder(db, actor, body) {
  const order = Array.isArray(body.order) ? body.order.slice(0, 50).map(String) : [];
  if (!order.length) return json({ error: '순서를 정할 제안서가 없습니다.' }, 400);
  const now = new Date().toISOString();
  for (const [index, id] of order.entries()) {
    await db.prepare('UPDATE showcase_proposals SET sort_order = ?, updated_at = ? WHERE id = ?').bind(index, now, id).run();
  }
  await recordAudit(db, { actor, action: 'admin.reorderShowcase', detail: `${order.length}편 순서 변경` });
  return json({ ok: true, ...(await listShowcase(db)) }, 200);
}

async function deleteShowcase(db, actor, body) {
  const id = String(body.id || '').trim();
  const row = await db.prepare('SELECT id, title FROM showcase_proposals WHERE id = ?').bind(id).first();
  if (!row) return json({ error: '해당 제안서를 찾지 못했습니다.' }, 404);
  await db.prepare('DELETE FROM showcase_proposals WHERE id = ?').bind(id).run();
  await recordAudit(db, { actor, action: 'admin.deleteShowcase', targetId: id, detail: String(row.title || '').slice(0, 80) });
  return json({ ok: true, ...(await listShowcase(db)) }, 200);
}

// 목록. 비밀번호 열은 아예 SELECT에 넣지 않는다.
async function listUsers(db) {
  const users = await db.prepare(`SELECT id, email, role, status, name, phone, org_name, is_contact,
    terms_version, privacy_version, consented_at, profile_completed_at, created_at, plan, trial_used_at,
    profile_updated_at, profile_review_needed FROM users ORDER BY created_at`).all();
  const identities = await db.prepare('SELECT user_id, provider, email FROM user_identities ORDER BY linked_at').all();
  const byUser = new Map();
  for (const row of identities?.results || []) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push({ provider: row.provider, email: row.email || '' });
  }
  // 정식 수주계약과 회원이 직접 고친 기관정보를 함께 붙인다.
  const contracts = new Map();
  for (const row of (await db.prepare(`SELECT user_id, status, started_on, ends_on, progress, progress_note, contract_name, updated_at
    FROM premium_contracts`).all())?.results || []) contracts.set(row.user_id, row);
  const profiles = new Map();
  for (const row of (await db.prepare(`SELECT user_id, org_type, org_address, org_intro, staff, facilities, programs,
    achievements, partners, reuse_note, updated_at FROM member_profiles`).all())?.results || []) profiles.set(row.user_id, row);
  return (users?.results || []).map(row => ({
    id: row.id,
    // 소셜 계정 행의 email은 내부 식별용이라 사람에게 보여 주지 않는다.
    email: String(row.email || '').endsWith(SOCIAL_KEY_SUFFIX) ? '' : row.email,
    role: row.role, status: row.status, name: row.name || '', phone: row.phone || '', orgName: row.org_name || '',
    isContact: Boolean(row.is_contact), termsVersion: row.terms_version || '', privacyVersion: row.privacy_version || '',
    consentedAt: row.consented_at || '', profileCompleted: Boolean(row.profile_completed_at), createdAt: row.created_at,
    // 이용권과 무료 체험 사용 여부. plan은 저장된 값, effectivePlan은 역할까지 반영한 실제 권한이다.
    plan: row.plan || DEFAULT_PLAN, effectivePlan: effectivePlan(row), trialUsed: Boolean(row.trial_used_at), trialUsedAt: row.trial_used_at || '',
    identities: byUser.get(row.id) || [],
    ...premiumSummary(contracts.get(row.id)),
    // 회원이 직접 고친 기관정보. 언제 바뀌었는지와 다시 확인할 항목이 있는지 함께 본다.
    memberProfile: memberProfileOf(profiles.get(row.id)),
    profileUpdatedAt: row.profile_updated_at || '',
    profileReviewNeeded: Number(row.profile_review_needed || 0) === 1
  }));
}

// 관리자·운영관리자 화면에서는 「정식 수주회원」임을 함께 확인한다.
function premiumSummary(contract) {
  if (!contract) return { premium: false, premiumLabel: '', contract: null };
  const state = contractState({
    status: contract.status, startedOn: contract.started_on || '', endsOn: contract.ends_on || ''
  });
  return {
    premium: state.premium, premiumLabel: PREMIUM_ADMIN_LABEL,
    contract: {
      status: state.status, statusLabel: state.label, startedOn: contract.started_on || '', endsOn: contract.ends_on || '',
      progress: contract.progress || '접수', progressNote: contract.progress_note || '',
      contractName: contract.contract_name || '', canStartWork: state.canStartWork, updatedAt: contract.updated_at || ''
    }
  };
}

function memberProfileOf(row) {
  return {
    orgType: row?.org_type || '', orgAddress: row?.org_address || '', orgIntro: row?.org_intro || '',
    staff: row?.staff || '', facilities: row?.facilities || '', programs: row?.programs || '',
    achievements: row?.achievements || '', partners: row?.partners || '', reuseNote: row?.reuse_note || '',
    updatedAt: row?.updated_at || ''
  };
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
