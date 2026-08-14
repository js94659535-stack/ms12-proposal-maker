// 구독 신청서. 회원이 적어 내고 관리자가 보고 연다.
//
// 결제는 아직 연결되어 있지 않다. 그래서 「신청 = 개설」이 아니다. 신청은 신청으로만 남기고,
// 실제 구독은 관리자가 확인한 뒤 기존 「월간 구독 부여」로 연다. 결제 완료를 가장하지 않는다.
//
// 회원 자료는 신청에 필요한 것만 받는다. 결제수단·카드번호 같은 것은 받지도 저장하지도 않는다.

export const REQUEST_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);
export const REQUEST_LABELS = Object.freeze({ pending: '검토 중', approved: '개설됨', rejected: '거절' });
export const BILLING_NOTE = '정기결제는 아직 연결되어 있지 않습니다. 신청하시면 관리자가 확인한 뒤 열어 드립니다.';

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateRequest(value = {}) {
  const errors = [];
  const orgName = text(value.orgName, 120);
  const contactName = text(value.contactName, 60);
  const phone = text(value.phone, 40);
  const purpose = text(value.purpose, 500);
  const wantedStart = text(value.wantedStart, 10);
  const monthlyPlans = text(value.monthlyPlans, 40);
  if (!orgName) errors.push('기관명을 적어 주세요.');
  if (!contactName) errors.push('담당자 이름을 적어 주세요.');
  if (!phone) errors.push('연락처를 적어 주세요.');
  if (purpose.length < 5) errors.push('무엇에 쓰실지 한 줄이라도 적어 주세요.');
  if (wantedStart && !DATE.test(wantedStart)) errors.push('희망 시작일은 2027-01-05 형식으로 적어 주세요.');
  // 결제가 연결되어 있지 않다는 사실을 확인해야 접수한다. 나중에 「몰랐다」가 생기지 않게 한다.
  if (value.noticeAck !== true) errors.push('관리자 확인 후 개설된다는 안내에 동의해 주세요.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { orgName, contactName, phone, purpose, wantedStart, monthlyPlans, noticeAck: true } };
}

// 같은 회원이 검토 중인 신청을 또 내지 않게 한다. 관리자 목록이 같은 건으로 채워지면 못 쓴다.
export function canSubmit(existing) {
  if (!existing) return { allowed: true };
  if (existing.status === 'pending') return { allowed: false, reason: '이미 신청하셨습니다. 관리자가 확인하는 중입니다.' };
  if (existing.status === 'approved') return { allowed: false, reason: '이미 구독이 열려 있습니다.' };
  return { allowed: true };
}

export function requestView(row) {
  if (!row) return null;
  return {
    id: row.id, userId: row.user_id, userEmail: row.user_email,
    orgName: row.org_name, contactName: row.contact_name, phone: row.phone,
    purpose: row.purpose, wantedStart: row.wanted_start, monthlyPlans: row.monthly_plans,
    status: row.status, statusLabel: REQUEST_LABELS[row.status] || row.status,
    decisionNote: row.decision_note, decidedAt: row.decided_at,
    createdAt: row.created_at
  };
}

export async function latestRequest(db, userId) {
  if (!db) return null;
  const row = await db.prepare('SELECT * FROM subscription_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(text(userId, 80)).first();
  return requestView(row);
}

export async function saveRequest(db, { userId, userEmail, value }) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO subscription_requests
    (id, user_id, user_email, org_name, contact_name, phone, purpose, wanted_start, monthly_plans, payment_ack, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?)`)
    .bind(id, text(userId, 80), text(userEmail, 200), value.orgName, value.contactName, value.phone,
      value.purpose, value.wantedStart, value.monthlyPlans, now, now).run();
  return latestRequest(db, userId);
}

export async function listRequests(db, { status = '' } = {}) {
  if (!db) return [];
  const rows = status
    ? await db.prepare('SELECT * FROM subscription_requests WHERE status = ? ORDER BY created_at DESC LIMIT 100').bind(status).all()
    : await db.prepare('SELECT * FROM subscription_requests ORDER BY created_at DESC LIMIT 100').all();
  return (rows?.results || []).map(requestView);
}

export async function decideRequest(db, { id, status, note = '', actorId = '' }) {
  if (!REQUEST_STATUSES.includes(status) || status === 'pending') return { ok: false, error: '처리 상태가 올바르지 않습니다.' };
  const row = await db.prepare('SELECT * FROM subscription_requests WHERE id = ?').bind(text(id, 80)).first();
  if (!row) return { ok: false, error: '신청서를 찾지 못했습니다.' };
  const now = new Date().toISOString();
  await db.prepare('UPDATE subscription_requests SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ? WHERE id = ?')
    .bind(status, text(actorId, 80), now, text(note, 300), now, row.id).run();
  return { ok: true, request: requestView({ ...row, status, decided_at: now, decision_note: text(note, 300) }) };
}
