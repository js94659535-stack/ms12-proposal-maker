// 운영관리자(operator) 화면의 서버. 화면에서 숨기는 것이 아니라 여기서 실제로 막는다.
// 비밀번호 열은 읽지도 내보내지도 않는다. 계획서 원문도 이 경로에서는 다루지 않는다.
import { recentActivity, stuckSummary } from '../../server/activity.js';
import { listAudit, listAuditForTarget, recordAudit } from '../../server/audit.js';
import { emailAttemptHash, loginLockState, unlockEmailAttempts } from '../../server/login-attempts.js';
import { BLOCKED_ACTIONS, NOT_INTEGRATED, OPERATOR_ACTIONS, OPERATOR_ROLES, targetRefusal } from '../../server/operator-scope.js';
import { usageReport } from '../../server/ai-usage.js';
import { CONTACT_LABEL, DEFAULT_PLAN, effectivePlan } from '../../server/plan.js';
import { PREMIUM_ADMIN_LABEL, PROGRESS_STEPS, contractState } from '../../server/premium.js';
import { issueRecoveryCode } from '../../server/recovery.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const SOCIAL_KEY_SUFFIX = '@social.ms12.invalid';
const RECENT_EVENTS = 500;

export async function onRequest(context) {
  const { request, env, data } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  }
  // 미들웨어가 로그인을 확인했지만 역할은 여기서 다시 본다. 이 경로만 따로 불려도 막힌다.
  const actor = data.session?.user;
  if (!actor?.id) return json({ error: '로그인이 필요합니다.' }, 401);
  if (!OPERATOR_ROLES.has(actor.role) || actor.status !== 'active') return json({ error: '운영관리자만 사용할 수 있습니다.' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }
  const action = String(body.action || '');

  // 요금·환불·역할 변경·영구 삭제 같은 동작은 이 경로에서 언제나 거절한다.
  if (BLOCKED_ACTIONS.has(action)) {
    const label = BLOCKED_ACTIONS.get(action);
    await recordAudit(env.ARCHIVE_DB, { actor, action: `blocked:${action}`, targetId: String(body.id || ''), result: 'blocked', detail: `${label}은(는) 운영관리자 권한 밖입니다.` });
    return json({ error: `${label}은(는) 운영관리자가 할 수 없는 작업입니다.`, blocked: true }, 403);
  }
  if (!OPERATOR_ACTIONS.has(action)) return json({ error: '지원하지 않는 작업입니다.' }, 400);

  const db = env.ARCHIVE_DB;
  if (action === 'overview') return json(await overview(db, body), 200);
  if (action === 'userDetail') return userDetail(db, body.id);
  // 사용량·비용은 읽기만 한다. 단가·상한을 바꾸는 동작은 이 경로에 없다.
  if (action === 'usageReport') return json(await usageReport(db, env, { days: body.days, userId: body.userId, proposalId: body.proposalId }), 200);
  if (action === 'approveUser') return mutate(db, actor, body, approve);
  if (action === 'disableUser') return mutate(db, actor, body, disable);
  if (action === 'reactivateUser') return mutate(db, actor, body, reactivate);
  if (action === 'unlockLogin') return mutate(db, actor, body, unlock);
  if (action === 'endSessions') return mutate(db, actor, body, endSessions);
  // 수주 작업 진행상태만 바꾼다. 프리미엄 권한 자체는 BLOCKED_ACTIONS가 막는다.
  if (action === 'setContractProgress') return mutate(db, actor, body, (database, target) => setContractProgress(database, target, body));
  return mutate(db, actor, body, recovery);
}

// ---------- 읽기 ----------
async function overview(db, body) {
  const users = await directory(db, String(body.query || ''));
  return { users, audit: await listAudit(db, { limit: 50 }), notIntegrated: NOT_INTEGRATED, blocked: [...BLOCKED_ACTIONS.values()], contactLabel: CONTACT_LABEL };
}

async function userDetail(db, id) {
  const users = await directory(db, '');
  const user = users.find(item => item.id === String(id || ''));
  if (!user) return json({ error: '해당 계정을 찾지 못했습니다.' }, 404);
  return json({
    user,
    // 「멈춘 단계·최근 오류」는 단계 번호와 오류 코드만 담는다. 계획서 원문과 입력값은 들어가지 않는다.
    activity: await recentActivity(db, user.id, 12),
    audit: await listAuditForTarget(db, user.id, { limit: 20 }),
    notIntegrated: NOT_INTEGRATED
  }, 200);
}

// 회원 목록. 비밀번호 열은 아예 SELECT에 넣지 않는다.
async function directory(db, query) {
  const users = (await db.prepare(`SELECT id, email, role, status, name, phone, org_name, is_contact,
    terms_version, privacy_version, consented_at, profile_completed_at, created_at, updated_at, plan, trial_used_at,
    profile_updated_at, profile_review_needed FROM users ORDER BY created_at`).all())?.results || [];
  const contracts = new Map();
  for (const row of (await db.prepare('SELECT user_id, status, started_on, ends_on, progress, progress_note, contract_name, updated_at FROM premium_contracts').all())?.results || []) contracts.set(row.user_id, row);
  const memberProfiles = new Map();
  for (const row of (await db.prepare('SELECT user_id, org_type, org_address, org_intro, staff, facilities, programs, achievements, partners, reuse_note, updated_at FROM member_profiles').all())?.results || []) memberProfiles.set(row.user_id, row);
  const identities = (await db.prepare('SELECT user_id, provider, email FROM user_identities ORDER BY linked_at').all())?.results || [];
  const sessions = (await db.prepare(`SELECT user_id, COUNT(*) AS session_count, MAX(last_seen_at) AS last_seen_at, MAX(expires_at) AS expires_at
    FROM sessions GROUP BY user_id`).all())?.results || [];
  const events = (await db.prepare(`SELECT user_id, kind, step, step_label, code, at FROM user_activity_events ORDER BY at DESC LIMIT ${RECENT_EVENTS}`).all())?.results || [];
  const codes = (await db.prepare('SELECT user_id, created_at, expires_at, used_at FROM account_recovery_codes ORDER BY created_at DESC').all())?.results || [];
  const now = new Date();
  const locks = await loginLockState(db, await Promise.all(users.map(async row => [row.id, await emailAttemptHash(row.email)])), now);

  const byUser = group(identities, row => row.user_id);
  const sessionByUser = new Map(sessions.map(row => [row.user_id, row]));
  const eventsByUser = group(events, row => row.user_id);
  const codeByUser = new Map();
  for (const row of codes) if (!codeByUser.has(row.user_id)) codeByUser.set(row.user_id, row);

  const nowIso = now.toISOString();
  const rows = users.map(row => {
    const session = sessionByUser.get(row.id);
    const own = (eventsByUser.get(row.id) || []).map(item => ({ kind: item.kind, step: Number(item.step), stepLabel: item.step_label || '', code: item.code || '', at: item.at }));
    const code = codeByUser.get(row.id);
    return {
      id: row.id,
      // 소셜 계정 행의 email은 내부 식별용이라 사람에게 보여 주지 않는다.
      email: String(row.email || '').endsWith(SOCIAL_KEY_SUFFIX) ? '' : row.email,
      role: row.role, status: row.status, name: row.name || '', phone: row.phone || '', orgName: row.org_name || '',
      isContact: Boolean(row.is_contact), termsVersion: row.terms_version || '', privacyVersion: row.privacy_version || '',
      consentedAt: row.consented_at || '', profileCompleted: Boolean(row.profile_completed_at),
      createdAt: row.created_at, updatedAt: row.updated_at || '',
      // 이용권과 무료 체험 사용 여부는 읽기만 한다. 바꾸는 동작은 BLOCKED_ACTIONS가 거절한다.
      plan: effectivePlan(row), planColumn: row.plan || DEFAULT_PLAN, trialUsed: Boolean(row.trial_used_at), trialUsedAt: row.trial_used_at || '',
      identities: (byUser.get(row.id) || []).map(item => ({ provider: item.provider, email: item.email || '' })),
      sessions: { count: Number(session?.session_count || 0), lastSeenAt: session?.last_seen_at || '', expiresAt: session?.expires_at || '' },
      login: locks.get(row.id) || { failures: 0, lastFailureAt: '', locked: false },
      stuck: stuckSummary(own),
      // 정식 수주회원 여부와 계약·진행상태. 권한을 바꾸는 동작은 이 경로에 없다.
      ...premiumSummary(contracts.get(row.id)),
      memberProfile: memberProfileOf(memberProfiles.get(row.id)),
      profileUpdatedAt: row.profile_updated_at || '',
      profileReviewNeeded: Number(row.profile_review_needed || 0) === 1,
      recovery: code
        ? { issued: true, active: !code.used_at && String(code.expires_at) > nowIso, issuedAt: code.created_at, expiresAt: code.expires_at, usedAt: code.used_at || '' }
        : { issued: false, active: false, issuedAt: '', expiresAt: '', usedAt: '' }
    };
  });
  return filterRows(rows, query);
}

// 이름·이메일·기관명·연락처·식별자 어디에 있어도 찾는다.
function filterRows(rows, query) {
  const needle = String(query || '').trim().toLowerCase().slice(0, 100);
  if (!needle) return rows;
  return rows.filter(row => [row.name, row.email, row.orgName, row.phone, row.id, ...row.identities.map(item => item.email)]
    .some(value => String(value || '').toLowerCase().includes(needle)));
}

function group(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = key(row);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

// ---------- 실행 ----------
// 바꾸기 전에 공통으로 확인할 것들. 관리자·다른 운영관리자·자기 자신은 건드리지 못한다.
async function mutate(db, actor, body, apply) {
  const id = String(body.id || '');
  const target = await db.prepare('SELECT id, email, role, status FROM users WHERE id = ?').bind(id).first();
  const refusal = targetRefusal(actor, target);
  if (refusal) {
    await recordAudit(db, { actor, action: `refused:${apply.name}`, targetId: id, targetEmail: target?.email || '', result: 'refused', detail: refusal.error });
    return json({ error: refusal.error }, refusal.status);
  }
  const outcome = await apply(db, target, actor);
  if (outcome.error) {
    await recordAudit(db, { actor, action: `failed:${apply.name}`, targetId: target.id, targetEmail: target.email, result: 'failed', detail: outcome.error });
    return json({ error: outcome.error }, outcome.status || 400);
  }
  await recordAudit(db, { actor, action: outcome.action, targetId: target.id, targetEmail: target.email, detail: outcome.detail || '' });
  return json({ ok: true, ...(outcome.body || {}), users: await directory(db, String(body.query || '')), audit: await listAudit(db, { limit: 50 }) }, 200);
}

async function approve(db, target) {
  if (target.status === 'active') return { error: '이미 이용 중인 계정입니다.' };
  if (target.status === 'disabled') return { error: '중지된 계정입니다. 재활성화를 사용해 주세요.' };
  // 승인은 status만 바꾼다. 역할은 절대 올리지 않는다.
  await setStatus(db, target.id, 'active');
  return { action: 'user.approve', detail: '승인 대기 → 이용 중' };
}

async function reactivate(db, target) {
  if (target.status !== 'disabled') return { error: '중지된 계정만 재활성화할 수 있습니다.' };
  await setStatus(db, target.id, 'active');
  return { action: 'user.reactivate', detail: '중지 → 이용 중' };
}

async function disable(db, target) {
  if (target.status === 'disabled') return { error: '이미 중지된 계정입니다.' };
  await setStatus(db, target.id, 'disabled');
  // 쓰던 세션을 남겨 두면 중지해도 그대로 쓰게 된다.
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
  return { action: 'user.disable', detail: `${target.status} → 중지, 세션 종료` };
}

async function unlock(db, target) {
  // 계정(이메일) 기준 잠금만 푼다. 같은 IP에서 온 시도 기록은 누구 것인지 알 수 없어 그대로 둔다.
  await unlockEmailAttempts(db, target.email);
  return { action: 'user.unlockLogin', detail: '로그인 실패 기록(계정 기준) 삭제' };
}

async function endSessions(db, target) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id).run();
  return { action: 'user.endSessions', detail: '전체 세션 종료' };
}

// 수주 작업 진행상태 변경. 계약 기간·상태(권한)는 손대지 않고 진행 단계와 메모만 바꾼다.
async function setContractProgress(db, target, body) {
  const progress = String(body.progress || '');
  if (!PROGRESS_STEPS.includes(progress)) return { error: `진행상태는 ${PROGRESS_STEPS.join('·')} 중에서 고를 수 있습니다.` };
  const contract = await db.prepare('SELECT status, progress FROM premium_contracts WHERE user_id = ?').bind(target.id).first();
  if (!contract) return { error: `${PREMIUM_ADMIN_LABEL} 계약이 없는 계정입니다.` };
  const note = String(body.progressNote || '').trim().slice(0, 300);
  await db.prepare('UPDATE premium_contracts SET progress = ?, progress_note = ?, updated_at = ? WHERE user_id = ?')
    .bind(progress, note, new Date().toISOString(), target.id).run();
  return { action: 'operator.setContractProgress', detail: `${contract.progress || '접수'} → ${progress}` };
}

// 정식 수주회원 요약. 운영관리자는 읽고 진행상태만 바꾼다.
function premiumSummary(contract) {
  if (!contract) return { premium: false, premiumLabel: '', contract: null };
  const state = contractState({ status: contract.status, startedOn: contract.started_on || '', endsOn: contract.ends_on || '' });
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

async function recovery(db, target, actor) {
  if (target.status === 'disabled') return { error: '중지된 계정에는 복구코드를 발급하지 않습니다.' };
  const issued = await issueRecoveryCode(db, { userId: target.id, issuedBy: actor.id });
  // 코드 원문은 이 응답에만 한 번 실린다. 감사기록에는 발급 사실과 시각만 남는다.
  return {
    action: 'user.issueRecoveryCode', detail: `${issued.minutes}분 유효·1회용 복구코드 발급`,
    body: { recoveryCode: issued.code, recoveryExpiresAt: issued.expiresAt, recoveryMinutes: issued.minutes }
  };
}

async function setStatus(db, id, status) {
  await db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').bind(status, new Date().toISOString(), id).run();
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
