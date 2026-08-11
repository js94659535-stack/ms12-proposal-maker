// 이용권. 화면에서 숨기는 것이 아니라 서버가 이 규칙으로 막는다.
// 결제 기능은 아직 없다. 전체 이용권이 없는 사람에게는 「이용권 문의」로만 안내한다.
export const PLANS = new Set(['trial', 'full']);
export const DEFAULT_PLAN = 'trial';
// 관리자·운영관리자는 역할 자체로 전체 기능을 쓴다. plan 열 값과 무관하다.
export const FULL_ROLES = new Set(['admin', 'operator']);
// 무료 회원이 쓸 수 있는 유일한 생성 작업. 「핵심제안서」 한 부만 만든다.
// 사용 횟수 기록(users.trial_used_at)은 그대로 쓴다. 열 이름은 자료 안전을 위해 바꾸지 않았다.
export const CORE_PROPOSAL_ACTION = 'coreProposal';
export const TRIAL_ACTION = CORE_PROPOSAL_ACTION;
export const TRIAL_LABEL = '핵심제안서';
export const CONTACT_LABEL = '이용권 문의';
export const NEED_FULL = `전체 이용권이 있어야 쓸 수 있는 기능입니다. ${CONTACT_LABEL}로 연락해 주세요.`;
export const TRIAL_SPENT = `${TRIAL_LABEL} 무료 생성은 계정당 한 번만 쓸 수 있습니다. ${CONTACT_LABEL}로 연락해 주세요.`;

// 이 사람이 실제로 가진 이용권. 역할이 우선한다.
export function effectivePlan(user) {
  if (FULL_ROLES.has(user?.role)) return 'full';
  const plan = user?.plan;
  return PLANS.has(plan) ? plan : DEFAULT_PLAN;
}
export const hasFullAccess = user => effectivePlan(user) === 'full';
export const trialUsed = user => Boolean(user?.trialUsedAt);

// 막을 이유가 없으면 null. 무료 체험 중복 사용 여부는 D1에서 원자적으로 다시 확인한다.
export function planRefusal(user, action) {
  if (hasFullAccess(user)) return null;
  if (action !== TRIAL_ACTION) return { status: 403, error: NEED_FULL, needsPlan: true };
  return null;
}

// 무료 체험을 계정당 한 번만 쓰게 한다. 조건부 UPDATE라 같은 계정이 동시에 눌러도 한 번만 통과한다.
export async function consumeTrial(db, userId, now = new Date()) {
  const stamp = now.toISOString();
  const result = await db.prepare("UPDATE users SET trial_used_at = ?, updated_at = ? WHERE id = ? AND trial_used_at = ''")
    .bind(stamp, stamp, String(userId || '')).run();
  const changes = Number(result?.meta?.changes);
  if (Number.isFinite(changes)) return changes > 0;
  // 바뀐 행 수를 알려 주지 않는 드라이버에서는 방금 찍은 시각이 남았는지로 확인한다.
  const row = await db.prepare('SELECT trial_used_at FROM users WHERE id = ?').bind(String(userId || '')).first();
  return row?.trial_used_at === stamp;
}

// 우리 쪽 실패로 생성이 안 됐으면 체험 기회를 돌려준다. 사용자 잘못이 아니기 때문이다.
export async function releaseTrial(db, userId) {
  await db.prepare("UPDATE users SET trial_used_at = '' WHERE id = ?").bind(String(userId || '')).run();
}
