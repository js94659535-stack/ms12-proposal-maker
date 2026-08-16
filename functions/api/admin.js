// 관리자 전용 계정 관리. 화면에서 숨기는 것이 아니라 여기서 실제로 막는다.
// 비밀번호 열은 읽지도 내보내지도 않는다.
import { recordAudit } from '../../server/audit.js';
import { collectionStatus, readSourceSettings, runCollection, setSourceEnabled } from '../../server/notice-collector.js';
import { collectExtraSources } from '../../server/extra-collect.js';
import { listAccessLog, listGrants, listProposalMeta, proposalUsage, recordAccess, revokeGrant, saveGrant } from '../../server/access-store.js';
import { REASON, SCOPES, ABILITIES, proposalContentAccess, stripSecrets, todayInSeoul } from '../../server/permissions.js';
import { collectNotices } from './notices.js';
import { syncNotices } from './archive.js';
import { usageReport } from '../../server/ai-usage.js';
import { RANK, adminNotice, findDuplicates, parseQuery, rankNotice, withDerived } from '../../server/notice-search.js';
import { DEFAULT_PLAN, PLANS, effectivePlan } from '../../server/plan.js';
import { revokeRecoveryCodes } from '../../server/recovery.js';
import {
  PREMIUM_ADMIN_LABEL, SHOWCASE_LIMIT, contractState, findIdentifiers, publicShowcase, validateContract, validateShowcase
} from '../../server/premium.js';
import { membershipOf, membershipPlans } from '../../server/membership.js';
import { ASSIGNABLE_ROLES, MEMBER_ROLES, roleLabel } from '../../server/roles.js';
import { adminOverview } from '../../server/admin-overview.js';
import { AGENCY_STATUSES, canManageAgency, rejectsSelfPromotion, transferCheck } from '../../server/agency.js';
import { listAgencies, saveGrant as saveAgencyGrant, stateFor, transferAgencyData, transferPreview } from '../../server/agency-store.js';
import { SUBSCRIPTION_LABELS, addMonth, remaining, validateSubscription } from '../../server/subscription.js';
import { decideRequest, listRequests } from '../../server/subscription-request.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const SOCIAL_KEY_SUFFIX = '@social.ms12.invalid';
// 관리자가 줄 수 있는 역할. 'admin'은 여기서 줄 수 없다. 관리자 계정은 스크립트로만 만든다.
const ASSIGNABLE = new Set(ASSIGNABLE_ROLES);

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

  // 관리자 랜딩 위쪽 운영 현황. 건수와 시각만 돌려준다.
  if (body.action === 'overview') return json(await adminOverview(env.ARCHIVE_DB), 200);
  // ---------- 에이전트 ----------
  // 파는 상품이 아니다. 최고관리자가 임명하고 최고관리자만 거둔다.
  if (body.action === 'agencyList') return json(await listAgencies(env.ARCHIVE_DB), 200);
  if (body.action === 'setAgency') return setAgency(env.ARCHIVE_DB, actor, body);
  if (body.action === 'agencyTransferPreview') {
    return json(await transferPreview(env.ARCHIVE_DB, String(body.fromId || ''), String(body.toId || '')), 200);
  }
  if (body.action === 'agencyTransfer') return runTransfer(env.ARCHIVE_DB, actor, body);
  if (body.action === 'listUsers') return json({ users: await listUsers(env.ARCHIVE_DB) }, 200);
  // 구독 신청서. 승인하면 기존 「월간 구독 부여」를 그대로 실행한다. 별도 경로를 만들지 않는다.
  if (body.action === 'subscriptionRequests') return json({ requests: await listRequests(env.ARCHIVE_DB) }, 200);
  if (body.action === 'decideSubscriptionRequest') return decideSubscription(env.ARCHIVE_DB, actor, body);
  if (body.action === 'approveUser') return mutate(env.ARCHIVE_DB, actor, body.id, approve);
  if (body.action === 'disableUser') return mutate(env.ARCHIVE_DB, actor, body.id, disable);
  if (body.action === 'deleteUser') return mutate(env.ARCHIVE_DB, actor, body.id, remove);
  // 운영관리자 지정·해제는 관리자만 한다. 운영관리자 경로(/api/operator)에서는 언제나 거절된다.
  if (body.action === 'setRole') return mutate(env.ARCHIVE_DB, actor, body.id, (db, target) => setRole(db, target, body.role));
  // 전체 이용권 부여·회수는 관리자만 한다. 운영관리자 경로(/api/operator)에서는 언제나 거절된다.
  if (body.action === 'setPlan') return mutate(env.ARCHIVE_DB, actor, body.id, (db, target) => setPlan(db, target, body.plan));
  // 공모정보 관리. 공개 여부와 상관없이 모아 둔 자료 전체를 본다.
  // ---------- 권한 관리 ----------
  if (body.action === 'accessOverview') return json(stripSecrets(await accessOverview(env.ARCHIVE_DB, body.subjectId)), 200);
  if (body.action === 'saveGrant') return applyGrant(env.ARCHIVE_DB, actor, body.grant);
  if (body.action === 'revokeGrant') return dropGrant(env.ARCHIVE_DB, actor, body.id);
  // 회원별 계획서는 메타정보만 본다. 원문은 따로 근거가 있어야 열린다.
  if (body.action === 'memberUsage') return json(stripSecrets(await memberUsage(env.ARCHIVE_DB)), 200);
  if (body.action === 'proposalContent') return readProposalContent(env.ARCHIVE_DB, actor, body.id);
  // 기존 보관자료의 소유 회원을 관리자가 확인하고 지정한다. 짐작으로 붙이지 않는다.
  if (body.action === 'assignProposal') return assignProposal(env.ARCHIVE_DB, actor, body);

  // 자동수집 상태판. 읽기만 한다.
  if (body.action === 'noticeCollection') return json(await collectionStatus(env.ARCHIVE_DB), 200);
  // 수동 재수집. 자동 실행과 같은 경로를 쓰고 같은 잠금에 걸린다.
  // 새 출처가 왜 안 열리는지 서버에서 직접 한 번 열어 본다. 저장하지 않고 응답 상태만 돌려준다.
  // 내 컴퓨터에서는 열리는데 서버에서는 막히는 일이 있어, 도는 자리에서 확인해야 안다.
  if (body.action === 'probeSource') return probeSource(String(body.id || ''));
  if (body.action === 'runNoticeCollection') return runNoticeCollection(env.ARCHIVE_DB, actor, env);
  // 출처별 켜고 끄기. 최고관리자만 바꾼다.
  if (body.action === 'setNoticeSource') {
    const result = await setSourceEnabled(env.ARCHIVE_DB, { sourceId: body.sourceId, enabled: body.enabled === true, actor, note: body.note });
    if (!result.ok) return json({ error: result.error }, 400);
    await recordAudit(env.ARCHIVE_DB, { actor, action: 'admin.setNoticeSource', targetId: String(body.sourceId || ''), detail: result.enabled ? '수집 출처 사용' : '수집 출처 중지' });
    return json(await collectionStatus(env.ARCHIVE_DB), 200);
  }
  if (body.action === 'listNotices') return json(await listNotices(env.ARCHIVE_DB, body.query), 200);
  if (body.action === 'setNoticePublic') return setNoticePublic(env.ARCHIVE_DB, actor, body);
  // 보관 공고 영구 삭제. 최고관리자만, 그리고 계획서가 걸려 있지 않은 것만 지운다.
  if (body.action === 'deleteNotices') return deleteNotices(env.ARCHIVE_DB, actor, body);
  // AI 사용량·비용. 회원별·계획서별·기간별로 본다.
  if (body.action === 'usageReport') return json(await usageReport(env.ARCHIVE_DB, env, { days: body.days, userId: body.userId, proposalId: body.proposalId }), 200);
  // 정식 수주회원(프리미엄) 부여·중지. 관리자만 한다. 운영관리자 경로에서는 언제나 거절된다.
  // 월간 구독은 관리자만 넣고 끈다. 운영관리자 경로에서는 언제나 거절된다.
  // 소셜 로그인이 만든 별도 계정의 연결을 관리자 계정으로 가져온다. 비밀번호 재확인이 필요하다.
  if (body.action === 'transferIdentity') return transferIdentity(env.ARCHIVE_DB, actor, body, data.session);
  if (body.action === 'setSubscription') return mutate(env.ARCHIVE_DB, actor, body.id, (db, target) => setSubscription(db, target, body, actor));
  if (body.action === 'membershipPlans') return json(membershipPlans(), 200);
  if (body.action === 'setPremium') return mutate(env.ARCHIVE_DB, actor, body.id, (db, target) => setPremium(db, target, body, actor));
  // 공개용 우수 제안서. 관리자가 만든 사본만 다룬다. 회원 계획서를 옮겨 오지 않는다.
  if (body.action === 'listShowcase') return json(await listShowcase(env.ARCHIVE_DB), 200);
  if (body.action === 'saveShowcase') return saveShowcase(env.ARCHIVE_DB, actor, body);
  if (body.action === 'setShowcasePublic') return setShowcasePublic(env.ARCHIVE_DB, actor, body);
  if (body.action === 'setShowcaseOrder') return setShowcaseOrder(env.ARCHIVE_DB, actor, body);
  if (body.action === 'deleteShowcase') return deleteShowcase(env.ARCHIVE_DB, actor, body);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

// ---------- 에이전트 지정·해제·한도 ----------
// 자격과 한도를 한 번에 저장한다. 요금·구독과 섞지 않는다. 에이전트 자신은 이 경로를 통과하지 못한다.
async function setAgency(db, actor, body) {
  const targetId = String(body.id || '');
  const gate = rejectsSelfPromotion(actor, targetId);
  if (!gate.allowed) return json({ error: gate.reason }, 403);
  const status = String(body.status || '');
  if (!AGENCY_STATUSES.includes(status)) return json({ error: '자격 값은 이용 중·일시중지·자격 해제 중 하나여야 합니다.' }, 400);

  const target = await db.prepare('SELECT id, email, role, status FROM users WHERE id = ?').bind(targetId).first();
  if (!target) return json({ error: '대상 계정을 찾지 못했습니다.' }, 404);
  if (target.role === 'admin' || target.role === 'operator') {
    return json({ error: '운영 계정은 에이전트로 지정하지 않습니다.' }, 400);
  }

  const before = await stateFor(db, targetId);
  const state = await saveAgencyGrant(db, {
    userId: targetId, status, actorId: actor.id, limits: body.limits || {},
    startsOn: body.startsOn || '', endsOn: body.endsOn || '', note: body.note || ''
  });

  // users.role은 그대로 둔다. 에이전트는 임명 기록으로 읽는 역할이고, 로그인 계정은 일반회원 그대로다.
  // 자격을 거두면 다음 요청부터 곧바로 일반회원으로 돌아간다. 세션을 끊지 않는다.
  const nextRole = status === 'revoked' ? 'customer' : 'agency';

  await recordAudit(db, {
    actor, action: `admin.agency.${status}`, targetId,
    detail: `${before.status} → ${status}${body.note ? ` · ${String(body.note).slice(0, 80)}` : ''}`
  });
  return json({ ok: true, state, role: nextRole }, 200);
}

// 자료 인계. 건수를 세어 돌려주고 행은 지우지 않는다.
async function runTransfer(db, actor, body) {
  if (!canManageAgency(actor)) return json({ error: '자료 인계는 최고관리자만 할 수 있습니다.' }, 403);
  const fromId = String(body.fromId || '');
  const toId = String(body.toId || '');
  const fromState = await stateFor(db, fromId);
  const toState = await stateFor(db, toId);
  const gate = transferCheck({ from: fromId, to: toId, fromState, toState });
  if (!gate.allowed) return json({ error: gate.reason }, 400);
  // 화면에서 건수를 확인했다는 표시가 있어야 실행한다.
  if (body.confirm !== true) {
    return json({ error: '인계할 건수를 확인한 뒤 다시 실행해 주세요.', preview: await transferPreview(db, fromId, toId) }, 409);
  }
  const result = await transferAgencyData(db, fromId, toId);
  await recordAudit(db, {
    actor, action: 'admin.agency.transfer', targetId: fromId,
    detail: `${fromId} → ${toId} · 고객 ${result.moved.clients}곳 · 계획서 ${result.moved.proposals}건${body.reason ? ` · ${String(body.reason).slice(0, 80)}` : ''}`
  });
  return json({ ok: true, ...result }, 200);
}

// ---------- 소셜 연결 이전 ----------
// 소셜 로그인은 이메일이 같아도 기존 계정에 붙지 않고 새 customer·pending 계정을 만든다.
// 관리자가 소셜로 들어와 승인 대기 화면을 보는 일이 그래서 생긴다.
// 이메일이 같다는 이유만으로 옮기지 않는다. 관리자가 비밀번호를 다시 입력해 본인임을 확인하고,
// 옮겨 올 계정에 지킬 자료가 없을 때만 연결을 가져온다.
async function transferIdentity(db, actor, body, session) {
  const provider = String(body.provider || '');
  if (!['google', 'kakao'].includes(provider)) return json({ error: '연결할 소셜 종류를 고르세요.' }, 400);
  // 관리자 계정에는 소셜 로그인으로 들어올 수 없으므로 이 세션은 비밀번호 로그인으로 만들어진 것이다.
  // 되돌리기 어려운 작업이라 「방금 로그인했는가」를 한 번 더 본다.
  if (!recentLogin(session)) {
    return json({ error: '관리자 비밀번호로 다시 로그인한 뒤 15분 안에 실행해 주세요.', needsReauth: true }, 401);
  }

  const me = await db.prepare('SELECT id, email, role, status FROM users WHERE id = ?').bind(actor.id).first();
  if (!me || me.role !== 'admin' || me.status !== 'active') return json({ error: '관리자만 사용할 수 있습니다.' }, 403);
  // 비밀번호 재확인. 실패는 기록에 남기고 어떤 것도 바꾸지 않는다.

  const rows = (await db.prepare(`SELECT i.id, i.user_id, i.email, u.role, u.status, u.profile_completed_at, u.consented_at
    FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ?`).bind(provider).all())?.results || [];
  // 관리자 로그인 이메일과 같은 소셜 계정만 대상으로 본다.
  const owned = rows.filter(row => String(row.email || '').toLowerCase() === String(me.email || '').toLowerCase());
  if (!owned.length) return json({ error: '관리자 이메일과 같은 소셜 연결을 찾지 못했습니다.' }, 404);
  if (owned.length > 1) return json({ error: '같은 이메일의 소셜 연결이 여러 개입니다. 어느 것을 옮길지 확인이 필요합니다.', conflict: true }, 409);
  const found = owned[0];
  if (found.user_id === me.id) return json({ ok: true, alreadyLinked: true, users: await listUsers(db) }, 200);

  // 옮겨 올 계정에 지킬 자료가 있으면 옮기지 않고 충돌로 알린다.
  const kept = await accountFootprint(db, found.user_id);
  if (kept.total > 0) {
    await recordAudit(db, { actor, action: 'admin.transferIdentity', targetId: found.user_id, result: 'blocked', detail: `보존할 자료 ${kept.total}건` });
    return json({ error: '옮겨 올 계정에 보존할 자료가 있어 자동으로 옮기지 않았습니다.', conflict: true, footprint: kept }, 409);
  }
  // 회원 계정(일반회원·에이전트)의 연결만 옮긴다. 운영 계정은 옮기지 않는다.
  if (!MEMBER_ROLES.includes(found.role)) {
    return json({ error: '회원 계정의 연결만 옮길 수 있습니다.', conflict: true }, 409);
  }

  const now = new Date().toISOString();
  await db.prepare('UPDATE user_identities SET user_id = ?, linked_at = ? WHERE id = ?').bind(me.id, now, found.id).run();
  // 옮긴 뒤에는 그 계정으로 남아 있던 세션을 끊는다. 승인 대기 화면이 계속 뜨지 않게 한다.
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(found.user_id).run();
  await recordAudit(db, { actor, action: 'admin.transferIdentity', targetId: found.user_id, detail: `${provider} 연결을 관리자 계정으로 이전, 세션 종료` });
  return json({ ok: true, transferred: true, users: await listUsers(db) }, 200);
}

// 방금 로그인한 세션인지. 오래된 세션으로는 연결을 옮기지 못하게 한다.
const REAUTH_MINUTES = 15;
function recentLogin(session, now = new Date()) {
  const startedAt = Date.parse(String(session?.createdAt || ''));
  if (!Number.isFinite(startedAt)) return false;
  return now.getTime() - startedAt <= REAUTH_MINUTES * 60_000;
}

// 이 계정에 지킬 자료가 있는지. 하나라도 있으면 자동 정리하지 않는다.
async function accountFootprint(db, userId) {
  const row = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM member_profiles WHERE user_id = ?1) AS profiles,
    (SELECT COUNT(*) FROM subscriptions WHERE user_id = ?1) AS subscriptions,
    (SELECT COUNT(*) FROM premium_contracts WHERE user_id = ?1) AS contracts,
    (SELECT COUNT(*) FROM users WHERE id = ?1 AND (profile_completed_at <> '' OR consented_at <> '')) AS profileDone`)
    .bind(String(userId || '')).first();
  const counts = {
    profiles: Number(row?.profiles || 0), subscriptions: Number(row?.subscriptions || 0),
    contracts: Number(row?.contracts || 0), profileDone: Number(row?.profileDone || 0)
  };
  return { ...counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
}

// 구독 신청서 처리. 승인하면 그 회원에게 실제 구독을 연다(기존 setSubscription을 그대로 쓴다).
async function decideSubscription(db, actor, body) {
  const decided = await decideRequest(db, { id: body.id, status: body.status, note: body.note, actorId: actor?.id || '' });
  if (!decided.ok) return json({ error: decided.error }, 400);
  let detail = `구독 신청 ${decided.request.statusLabel}`;
  if (body.status === 'approved') {
    const target = await db.prepare('SELECT id, email, role, status FROM users WHERE id = ?').bind(decided.request.userId).first();
    if (!target) return json({ error: '신청한 회원을 찾지 못했습니다.' }, 404);
    const result = await setSubscription(db, target, { subscription: { status: 'active', startedOn: decided.request.wantedStart || undefined, note: `구독 신청서 승인 · ${decided.request.orgName}` } }, actor);
    if (result.error) return json({ error: result.error }, 400);
    detail = `${detail} · ${result.detail}`;
  }
  await recordAudit(db, { actor, action: 'admin.subscriptionRequest', targetId: decided.request.userId, targetEmail: decided.request.userEmail, detail });
  return json({ requests: await listRequests(db), request: decided.request }, 200);
}

// ---------- 월간 구독(시험용) ----------
// 실제 결제 연동이 없으므로 결제 완료를 가장하지 않는다. 관리자가 확인한 건만 손으로 연다.
async function setSubscription(db, target, body, actor) {
  const checked = validateSubscription(body.subscription || body);
  if (!checked.ok) return { error: checked.errors.join(' ') };
  const next = checked.value;
  const now = new Date().toISOString();
  const before = await db.prepare('SELECT status FROM subscriptions WHERE user_id = ?').bind(target.id).first();
  // 새 주기는 시작일부터 센다. 이용량은 주기가 바뀔 때만 0으로 돌아간다.
  const cycleStart = next.startedOn;
  const renewsOn = addMonth(cycleStart);
  await db.prepare(`INSERT INTO subscriptions (user_id, status, started_on, ends_on, cycle_start, renews_on, note, granted_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET status=excluded.status, started_on=excluded.started_on, ends_on=excluded.ends_on,
      cycle_start=excluded.cycle_start, renews_on=excluded.renews_on, note=excluded.note, updated_at=excluded.updated_at`)
    .bind(target.id, next.status, next.startedOn, next.endsOn, cycleStart, renewsOn, next.note, String(actor?.id || ''), now, now).run();
  const action = next.status === 'active' ? 'admin.grantSubscription' : 'admin.revokeSubscription';
  return { action, detail: `월간 구독 ${before?.status || '없음'} → ${next.status}${next.endsOn ? ` (~${next.endsOn})` : ''}` };
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
  const subscriptions = new Map();
  for (const row of (await db.prepare(`SELECT user_id, status, started_on, ends_on, cycle_start, renews_on, core_used, diagnosis_used, note, updated_at
    FROM subscriptions`).all())?.results || []) subscriptions.set(row.user_id, row);
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
    ...subscriptionSummary(subscriptions.get(row.id), row, contracts.get(row.id)),
    // 회원이 직접 고친 기관정보. 언제 바뀌었는지와 다시 확인할 항목이 있는지 함께 본다.
    memberProfile: memberProfileOf(profiles.get(row.id)),
    profileUpdatedAt: row.profile_updated_at || '',
    profileReviewNeeded: Number(row.profile_review_needed || 0) === 1
  }));
}

// 월간 구독과 고객등급. 승인 상태·이용권과 섞지 않는다.
function subscriptionSummary(row, user, contract) {
  const subscription = row
    ? {
      status: row.status, startedOn: row.started_on || '', endsOn: row.ends_on || '', renewsOn: row.renews_on || '',
      cycleStart: row.cycle_start || '', coreUsed: Number(row.core_used || 0), diagnosisUsed: Number(row.diagnosis_used || 0), note: row.note || ''
    }
    : null;
  const membership = membershipOf({
    user, subscription,
    contract: contract ? contractState({ status: contract.status, startedOn: contract.started_on || '', endsOn: contract.ends_on || '' }) : null
  });
  return {
    tier: membership.tier, tierLabel: membership.label, approval: membership.approval, approvalLabel: membership.approvalLabel,
    subscription: subscription
      ? {
        ...subscription, statusLabel: SUBSCRIPTION_LABELS[subscription.status] || subscription.status,
        remaining: { coreProposal: remaining(subscription, 'coreProposal'), diagnosis: remaining(subscription, 'diagnosis') }
      }
      : { status: 'none', statusLabel: SUBSCRIPTION_LABELS.none, remaining: { coreProposal: 0, diagnosis: 0 } }
  };
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
  if (!ASSIGNABLE.has(next)) return { error: `지정할 수 있는 역할은 ${ASSIGNABLE_ROLES.map(roleLabel).join('·')}뿐입니다.` };
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

// 보관 공고를 실제로 지운다.
//
// 화면의 「삭제」는 지금까지 이 기기 목록에서만 감추는 것이었다. 관리자가 정말 지워야 할 때가 있어
// 이 경로를 둔다. 다만 두 가지는 지키지 않으면 지우지 않는다.
//  · 그 공고로 저장해 둔 계획서가 있으면 지우지 않는다. 계획서가 근거를 잃는다.
//  · 무엇을 지웠는지 감사기록에 남긴다. 제목은 80자까지만 적는다.
async function deleteNotices(db, actor, body) {
  const keys = [...new Set((Array.isArray(body.keys) ? body.keys : []).map(key => String(key || '').slice(0, 180)).filter(Boolean))].slice(0, 200);
  if (!keys.length) return json({ error: '지울 공고를 고르지 않았습니다.' }, 400);

  const marks = keys.map(() => '?').join(',');
  const rows = (await db.prepare(`SELECT source_key, title FROM archived_notices WHERE source_key IN (${marks})`).bind(...keys).all())?.results || [];
  if (!rows.length) return json({ error: '해당 공고를 찾지 못했습니다.' }, 404);

  const linked = (await db.prepare(`SELECT DISTINCT notice_key FROM archived_proposals WHERE notice_key IN (${marks})`).bind(...keys).all())?.results || [];
  const blocked = new Set(linked.map(row => String(row.notice_key)));
  const removable = rows.filter(row => !blocked.has(String(row.source_key)));
  if (!removable.length) {
    return json({ error: '고른 공고에는 저장된 계획서가 걸려 있어 지우지 않았습니다.', kept: rows.length }, 409);
  }

  const targets = removable.map(row => String(row.source_key));
  const targetMarks = targets.map(() => '?').join(',');
  await db.prepare(`DELETE FROM archived_notices WHERE source_key IN (${targetMarks})`).bind(...targets).run();
  await recordAudit(db, {
    actor, action: 'notice.delete', targetId: targets.slice(0, 3).join(','),
    detail: `공고 ${targets.length}건 삭제${blocked.size ? ` · 계획서 연결로 보존 ${blocked.size}건` : ''} · ${removable.slice(0, 2).map(row => String(row.title || '').slice(0, 40)).join(' / ')}`
  });
  return json({ ok: true, deleted: targets.length, kept: blocked.size }, 200);
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

// 관리자가 직접 돌리는 재수집. 이미 돌고 있으면 두 번 돌리지 않는다.
async function runNoticeCollection(db, actor, env = {}) {
  const settings = await readSourceSettings(db);
  const secrets = { G2B_SERVICE_KEY: env.G2B_SERVICE_KEY || '' };
  const result = await runCollection(db, {
    collect: async () => {
      const [chest, extra] = await Promise.all([
        collectNotices(fetch).catch(() => ({ sources: [], notices: [] })),
        collectExtraSources(fetch, { settings, secrets }).catch(() => ({ sources: [], notices: [] }))
      ]);
      return { sources: [...chest.sources, ...extra.sources], notices: [...chest.notices, ...extra.notices] };
    },
    sync: notices => syncNotices(db, notices),
    trigger: 'manual'
  });
  if (result.skipped) {
    return json({ error: '이미 수집이 진행 중입니다. 끝난 뒤에 다시 눌러 주세요.', running: true, ...await collectionStatus(db) }, 409);
  }
  await recordAudit(db, { actor, action: 'admin.runNoticeCollection', result: result.status, detail: `수동 재수집 · 발급 ${result.collected}건 · 신규 ${result.inserted}건 · 갱신 ${result.updated}건` });
  return json({ run: result, ...await collectionStatus(db) }, 200);
}

// ---------- 권한 관리 ----------
// 최고관리자만 여기까지 온다(위에서 역할을 이미 확인했다).
async function accessOverview(db, subjectId = '') {
  const users = await db.prepare("SELECT id, email, name, role, status FROM users WHERE role != 'admin' ORDER BY role, email").all();
  return {
    subjects: (users.results || []).map(row => ({ id: row.id, email: row.email, name: row.name || '', role: row.role, status: row.status })),
    grants: await listGrants(db, String(subjectId || '')),
    accessLog: await listAccessLog(db, { subjectId: String(subjectId || ''), limit: 50 }),
    scopes: SCOPES, abilities: ABILITIES
  };
}

async function applyGrant(db, actor, grant) {
  const result = await saveGrant(db, actor, grant, { today: todayInSeoul() });
  if (!result.ok) return json({ error: result.errors.join(' ') }, 400);
  await recordAudit(db, { actor, action: 'admin.saveGrant', targetId: String(grant?.subjectId || ''), detail: `${grant?.scope} 권한 지정` });
  return json({ id: result.id, ...stripSecrets(await accessOverview(db, String(grant?.subjectId || ''))) }, 200);
}

async function dropGrant(db, actor, id) {
  const result = await revokeGrant(db, actor, id);
  if (!result.ok) return json({ error: result.errors.join(' ') }, 400);
  await recordAudit(db, { actor, action: 'admin.revokeGrant', targetId: String(id || ''), detail: '권한 회수' });
  return json({ id: result.id, ...stripSecrets(await accessOverview(db)) }, 200);
}

// 회원별 이용현황. 편수·최근 수정일·출력 횟수 같은 메타정보만 모은다.
async function memberUsage(db) {
  const [users, usage, proposals] = await Promise.all([
    db.prepare("SELECT id, email, name, role, status FROM users ORDER BY email").all(),
    proposalUsage(db),
    listProposalMeta(db, { includeUnclaimed: true, limit: 200 })
  ]);
  const byUser = new Map(usage.map(item => [item.userId, item]));
  return {
    members: (users.results || []).map(row => ({
      id: row.id, email: row.email, name: row.name || '', role: row.role, status: row.status,
      proposals: byUser.get(row.id)?.count || 0,
      lastUpdatedAt: byUser.get(row.id)?.lastUpdatedAt || '',
      exportCount: byUser.get(row.id)?.exportCount || 0
    })),
    // 회원과 아직 연결되지 않은 기존 보관자료. 관리자가 확인한 뒤에만 지정한다.
    unclaimed: proposals.filter(item => !item.userId),
    proposals
  };
}

// 계획서 원문. 프리미엄 계약이나 회원 동의가 있어야 열리고, 열람은 반드시 기록에 남는다.
async function readProposalContent(db, actor, id) {
  const key = String(id || '').trim().slice(0, 80);
  const row = await db.prepare('SELECT id, user_id, title, stage, notice_key, created_at, updated_at, export_count, support_consent, proposal_json FROM archived_proposals WHERE id = ?').bind(key).first();
  if (!row) return json({ error: '해당 계획서를 찾지 못했습니다.' }, 404);
  const contract = row.user_id ? await premiumContract(db, row.user_id) : null;
  const decision = proposalContentAccess({ actor, proposal: row, grants: [], contract, today: todayInSeoul() });
  await recordAccess(db, {
    actor, action: 'viewContent', scope: 'proposals', targetKind: 'proposal', targetId: key,
    targetUserId: row.user_id || '', allowed: decision.allowed, reason: decision.reason || decision.error || ''
  });
  if (!decision.allowed) return json({ error: decision.error, meta: metaOf(row) }, decision.status || 403);
  return json({ meta: metaOf(row), reason: decision.reason, snapshot: safeJson(row.proposal_json) }, 200);
}

async function premiumContract(db, userId) {
  const row = await db.prepare('SELECT status, started_on, ends_on FROM premium_contracts WHERE user_id = ?').bind(String(userId)).first();
  return row ? contractState({ status: row.status, startedOn: row.started_on || '', endsOn: row.ends_on || '' }) : null;
}

function metaOf(row) {
  return {
    id: row.id, userId: row.user_id || '', title: row.title || '', stage: row.stage || '',
    noticeKey: row.notice_key || '', createdAt: row.created_at || '', updatedAt: row.updated_at || '',
    exportCount: Number(row.export_count || 0), supportConsent: Number(row.support_consent || 0) === 1
  };
}

// 기존 보관자료를 특정 회원에게 지정한다. 이메일·기관명이 비슷하다는 이유로는 하지 않는다.
async function assignProposal(db, actor, body) {
  const id = String(body?.id || '').trim().slice(0, 80);
  const userId = String(body?.userId || '').trim().slice(0, 80);
  const note = String(body?.note || '').trim().slice(0, 200);
  if (!id || !userId) return json({ error: '계획서와 회원을 모두 지정해 주세요.' }, 400);
  if (!note) return json({ error: '어떤 근거로 지정하는지 사유를 적어 주세요.' }, 400);
  const target = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!target) return json({ error: '해당 회원을 찾지 못했습니다.' }, 404);
  const row = await db.prepare('SELECT id, user_id FROM archived_proposals WHERE id = ?').bind(id).first();
  if (!row) return json({ error: '해당 계획서를 찾지 못했습니다.' }, 404);
  if (row.user_id) return json({ error: '이미 회원과 연결된 계획서입니다. 먼저 연결을 확인해 주세요.' }, 409);
  await db.prepare('UPDATE archived_proposals SET user_id = ?, claimed_at = ?, claimed_by = ? WHERE id = ?')
    .bind(userId, new Date().toISOString(), actor.id, id).run();
  await recordAccess(db, { actor, action: 'claim', scope: 'proposals', targetKind: 'proposal', targetId: id, targetUserId: userId, reason: note });
  await recordAudit(db, { actor, action: 'admin.assignProposal', targetId: id, detail: `보관자료를 회원에게 지정 · ${note}` });
  return json({ id, userId, ...stripSecrets(await memberUsage(db)) }, 200);
}

// 저장된 계획서 원문을 객체로 되돌린다. 깨져 있으면 빈 객체로 둔다.
function safeJson(value) { try { return JSON.parse(value); } catch { return {}; } }

// 출처 한 곳을 서버에서 열어 본다. 저장하지 않는다. 제목·본문은 돌려주지 않는다.
async function probeSource(id) {
  const { SOURCES } = await import('../../server/notice-sources.js');
  const source = SOURCES.find(item => item.id === id);
  if (!source) return json({ error: '그 출처를 찾지 못했습니다.' }, 400);
  const target = `${source.origin}${source.path}`;
  const UA = 'Mozilla/5.0 (compatible; MS12NoticeBot/1.0; +https://pro.ms12.org)';
  try {
    const response = await fetch(target, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'ko-KR,ko;q=0.9' }, redirect: 'follow' });
    const text = await response.text();
    return json({ ok: true, id, status: response.status, bytes: text.length, server: response.headers.get('server') || '', looksLikeBoard: /li_body/.test(text) }, 200);
  } catch (error) {
    return json({ ok: false, id, name: String(error?.name || ''), error: String(error?.message || error).slice(0, 160) }, 200);
  }
}
