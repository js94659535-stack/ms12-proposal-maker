// 대행회원 자격·한도·사용량을 D1에서 읽고 쓴다.
//
// 자료는 지우지 않는다. 자격 해제도 인계도 행을 남긴 채 소유와 상태만 바꾼다.
import { DEFAULT_LIMITS, agencyState, limitsOf, monthStart, todayInSeoul } from './agency.js';

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const count = row => Number(row?.n || 0);

export async function readGrant(db, userId) {
  if (!userId) return null;
  try { return await db.prepare('SELECT * FROM agency_grants WHERE user_id = ?').bind(String(userId)).first(); }
  catch { return null; }
}

export async function stateFor(db, userId, today = todayInSeoul()) {
  return agencyState(await readGrant(db, userId), today);
}

// 이번 달 사용량. ai_usage_events에 남은 실제 기록만 센다. 따로 세는 값을 만들지 않는다.
export async function monthlyUsage(db, userId, { proposalId = '' } = {}) {
  const since = monthStart();
  const empty = { plans: 0, diagnoses: 0, tokens: 0, costMicro: 0, calls: 0, revisionsForPlan: 0, since };
  if (!userId) return empty;
  try {
    const totals = await db.prepare(`SELECT COUNT(*) AS calls,
        COALESCE(SUM(total_tokens), 0) AS tokens, COALESCE(SUM(cost_micro), 0) AS cost,
        COUNT(DISTINCT CASE WHEN task IN ('master','fullProposal','coreProposal','draft') THEN proposal_id END) AS plans,
        SUM(CASE WHEN task = 'diagnosis' THEN 1 ELSE 0 END) AS diagnoses
      FROM ai_usage_events WHERE agency_user_id = ? AND at >= ?`).bind(String(userId), since).first();
    const perPlan = proposalId
      ? await db.prepare(`SELECT COUNT(*) AS n FROM ai_usage_events
          WHERE agency_user_id = ? AND proposal_id = ? AND task IN ('patchSections','rewrite','finalize')`)
        .bind(String(userId), String(proposalId)).first()
      : null;
    return {
      plans: Number(totals?.plans || 0), diagnoses: Number(totals?.diagnoses || 0),
      tokens: Number(totals?.tokens || 0), costMicro: Number(totals?.cost || 0),
      calls: Number(totals?.calls || 0), revisionsForPlan: count(perPlan), since
    };
  } catch { return empty; }
}

// 대행회원별 고객·의뢰 건수. 자료를 열지 않고 숫자만 센다.
export async function agencyFootprint(db, userId) {
  const one = async sql => {
    try { return count(await db.prepare(sql).bind(String(userId)).first()); } catch { return 0; }
  };
  return {
    clients: await one("SELECT COUNT(*) AS n FROM applicant_organizations WHERE agency_user_id = ?"),
    proposals: await one("SELECT COUNT(*) AS n FROM archived_proposals WHERE agency_user_id = ?"),
    inProgress: await one("SELECT COUNT(*) AS n FROM archived_proposals WHERE agency_user_id = ? AND stage <> 'final'")
  };
}

// 대행회원 목록. 최고관리자 화면과 운영관리자 조회가 같은 자료를 본다.
export async function listAgencies(db) {
  let rows = [];
  try { rows = (await db.prepare(`SELECT g.*, u.email, u.name, u.role, u.status AS account_status
      FROM agency_grants g LEFT JOIN users u ON u.id = g.user_id ORDER BY g.granted_at DESC`).all())?.results || []; }
  catch { rows = []; }
  const out = [];
  for (const row of rows) {
    const state = agencyState(row);
    const usage = await monthlyUsage(db, row.user_id);
    const footprint = await agencyFootprint(db, row.user_id);
    out.push({
      userId: row.user_id, email: row.email || '', name: row.name || '', role: row.role || '',
      accountStatus: row.account_status || '', status: state.status, active: state.active, reason: state.reason,
      startsOn: state.startsOn, endsOn: state.endsOn, grantedAt: row.granted_at || '', note: row.note || '',
      lastActiveAt: row.last_active_at || '', limits: state.limits, usage, footprint
    });
  }
  return { agencies: out, defaults: DEFAULT_LIMITS, today: todayInSeoul() };
}

// 지정·해제·일시중지·재개. 한 곳에서만 쓴다.
export async function saveGrant(db, { userId, status, actorId, limits = {}, startsOn = '', endsOn = '', note = '' }) {
  const now = new Date().toISOString();
  const existing = await readGrant(db, userId);
  const merged = limitsOf({ ...(existing || {}), ...renameLimits(limits) });
  const values = [
    String(userId), status, text(actorId, 60), existing?.granted_at || now,
    text(startsOn, 10) || existing?.starts_on || '', text(endsOn, 10) || (status === 'revoked' ? todayInSeoul() : existing?.ends_on || ''),
    merged.monthlyPlans, merged.revisionsPerPlan, merged.monthlyDiagnoses, merged.monthlyTokens, merged.monthlyCostMicro,
    text(note, 300) || existing?.note || '',
    status === 'revoked' ? now : '', status === 'revoked' ? text(actorId, 60) : '', now, existing?.last_active_at || ''
  ];
  await db.prepare(`INSERT INTO agency_grants
      (user_id, status, granted_by, granted_at, starts_on, ends_on, monthly_plans, revisions_per_plan,
       monthly_diagnoses, monthly_tokens, monthly_cost_micro, note, revoked_at, revoked_by, updated_at, last_active_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET status = excluded.status, granted_by = excluded.granted_by,
      starts_on = excluded.starts_on, ends_on = excluded.ends_on, monthly_plans = excluded.monthly_plans,
      revisions_per_plan = excluded.revisions_per_plan, monthly_diagnoses = excluded.monthly_diagnoses,
      monthly_tokens = excluded.monthly_tokens, monthly_cost_micro = excluded.monthly_cost_micro,
      note = excluded.note, revoked_at = excluded.revoked_at, revoked_by = excluded.revoked_by,
      updated_at = excluded.updated_at`).bind(...values).run();
  return agencyState(await readGrant(db, userId));
}

function renameLimits(limits = {}) {
  return {
    monthly_plans: limits.monthlyPlans, revisions_per_plan: limits.revisionsPerPlan,
    monthly_diagnoses: limits.monthlyDiagnoses, monthly_tokens: limits.monthlyTokens,
    monthly_cost_micro: limits.monthlyCostMicro
  };
}

export async function touchActivity(db, userId, at = new Date().toISOString()) {
  if (!userId) return;
  try { await db.prepare('UPDATE agency_grants SET last_active_at = ? WHERE user_id = ?').bind(at, String(userId)).run(); }
  catch { /* 활동 시각을 못 남겨도 작업은 막지 않는다 */ }
}

// 인계 전에 보여 줄 건수. 실행 전에 반드시 한 번 보여 준다.
export async function transferPreview(db, fromId, toId) {
  return { from: await agencyFootprint(db, fromId), to: await agencyFootprint(db, toId) };
}

// 인계. 행을 지우지 않고 소유만 옮긴다. 사용 기록(ai_usage_events)은 실제 실행자 그대로 둔다.
export async function transferAgencyData(db, fromId, toId) {
  const before = await agencyFootprint(db, fromId);
  await db.prepare('UPDATE applicant_organizations SET agency_user_id = ?, user_id = ? WHERE agency_user_id = ?')
    .bind(String(toId), String(toId), String(fromId)).run();
  await db.prepare('UPDATE archived_proposals SET agency_user_id = ?, user_id = ? WHERE agency_user_id = ?')
    .bind(String(toId), String(toId), String(fromId)).run();
  return { moved: before, after: await agencyFootprint(db, fromId), received: await agencyFootprint(db, toId) };
}
