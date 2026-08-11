// 월간 구독의 D1 처리. 주기 넘김과 이용량 차감을 원자적으로 한다.
// 실제 결제는 아직 없다. 관리자가 시험용으로 넣고 끄는 값만 다룬다.
import { QUOTAS } from './membership.js';

export const SUBSCRIPTION_STATUSES = Object.freeze(['active', 'paused', 'ended']);
export const SUBSCRIPTION_LABELS = Object.freeze({ active: '구독 중', paused: '중지', ended: '종료', none: '구독 없음' });
export const KINDS = Object.freeze({ coreProposal: 'core_used', diagnosis: 'diagnosis_used' });

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// 한 달 뒤 같은 날. 말일이 없는 달이면 그 달의 마지막 날로 맞춘다.
export function addMonth(day) {
  if (!DATE.test(String(day || ''))) return '';
  const [year, month, date] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const safeDate = Math.min(date, lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(safeDate).padStart(2, '0')}`;
}

function shape(row) {
  if (!row) return null;
  return {
    userId: row.user_id, status: row.status, startedOn: row.started_on || '', endsOn: row.ends_on || '',
    cycleStart: row.cycle_start || '', renewsOn: row.renews_on || '',
    coreUsed: Number(row.core_used || 0), diagnosisUsed: Number(row.diagnosis_used || 0),
    note: row.note || '', updatedAt: row.updated_at || ''
  };
}

// 읽으면서 주기를 넘긴다. 갱신일이 지났고 아직 이용 중이면 이번 주기 사용량을 0으로 되돌린다.
export async function loadSubscription(db, userId, now = new Date()) {
  // D1이 붙지 않은 경로에서도 판정이 멈추지 않게 한다. 없으면 구독 없음으로 본다.
  if (!db?.prepare) return null;
  const row = await db.prepare(`SELECT user_id, status, started_on, ends_on, cycle_start, renews_on, core_used, diagnosis_used, note, updated_at
    FROM subscriptions WHERE user_id = ?`).bind(String(userId || '')).first();
  if (!row) return null;
  const day = today(now);
  const current = shape(row);
  // 기간이 끝났으면 상태부터 정리한다. 사용량은 그대로 둔다.
  if (current.status === 'active' && DATE.test(current.endsOn) && current.endsOn < day) {
    await db.prepare('UPDATE subscriptions SET status = ?, updated_at = ? WHERE user_id = ? AND status = ?')
      .bind('ended', new Date(now).toISOString(), current.userId, 'active').run();
    return { ...current, status: 'ended' };
  }
  if (current.status !== 'active' || !DATE.test(current.renewsOn) || current.renewsOn > day) return current;

  // 갱신일이 지났다. 다음 갱신일까지 한 달씩 밀면서 사용량을 새로 연다.
  let cycleStart = current.renewsOn;
  let renewsOn = addMonth(cycleStart);
  while (DATE.test(renewsOn) && renewsOn <= day) { cycleStart = renewsOn; renewsOn = addMonth(cycleStart); }
  const stamp = new Date(now).toISOString();
  await db.prepare(`UPDATE subscriptions SET cycle_start = ?, renews_on = ?, core_used = 0, diagnosis_used = 0, updated_at = ?
    WHERE user_id = ? AND renews_on = ?`).bind(cycleStart, renewsOn, stamp, current.userId, current.renewsOn).run();
  return { ...current, cycleStart, renewsOn, coreUsed: 0, diagnosisUsed: 0 };
}

export function remaining(subscription, kind) {
  const limit = QUOTAS.subscriber[kind] ?? 0;
  if (!subscription || subscription.status !== 'active') return 0;
  const used = kind === 'diagnosis' ? subscription.diagnosisUsed : subscription.coreUsed;
  return Math.max(0, limit - Number(used || 0));
}

// 이번 주기 한 편을 미리 차감한다. 조건부 UPDATE라 같은 계정이 동시에 눌러도 편수를 넘지 않는다.
// OpenAI를 부르기 전에 실행한다.
export async function consumeQuota(db, userId, kind, now = new Date()) {
  const column = KINDS[kind];
  const limit = QUOTAS.subscriber[kind];
  if (!column || !Number.isFinite(limit)) return false;
  const subscription = await loadSubscription(db, userId, now);
  if (!subscription || subscription.status !== 'active') return false;
  const result = await db.prepare(`UPDATE subscriptions SET ${column} = ${column} + 1, updated_at = ?
    WHERE user_id = ? AND status = 'active' AND cycle_start = ? AND ${column} < ?`)
    .bind(new Date(now).toISOString(), String(userId || ''), subscription.cycleStart, limit).run();
  const changes = Number(result?.meta?.changes);
  if (Number.isFinite(changes)) return changes > 0;
  // 바뀐 행 수를 알려 주지 않는 드라이버에서는 다시 읽어 확인한다.
  const after = await loadSubscription(db, userId, now);
  const before = kind === 'diagnosis' ? subscription.diagnosisUsed : subscription.coreUsed;
  const usedAfter = kind === 'diagnosis' ? after?.diagnosisUsed : after?.coreUsed;
  return Number(usedAfter || 0) > Number(before || 0);
}

// 우리 쪽 실패로 결과가 없으면 편수를 돌려준다. 사용자 잘못이 아니다.
export async function releaseQuota(db, userId, kind, now = new Date()) {
  const column = KINDS[kind];
  if (!column) return;
  await db.prepare(`UPDATE subscriptions SET ${column} = MAX(${column} - 1, 0), updated_at = ? WHERE user_id = ?`)
    .bind(new Date(now).toISOString(), String(userId || '')).run();
}

export function validateSubscription(value = {}, now = new Date()) {
  const errors = [];
  const status = SUBSCRIPTION_STATUSES.includes(value.status) ? value.status : 'active';
  const startedOn = String(value.startedOn || '').trim() || today(now);
  const endsOn = String(value.endsOn || '').trim();
  if (!DATE.test(startedOn)) errors.push('구독 시작일은 YYYY-MM-DD 형식으로 적어 주세요.');
  if (endsOn && !DATE.test(endsOn)) errors.push('구독 종료일은 YYYY-MM-DD 형식으로 적어 주세요.');
  if (DATE.test(startedOn) && endsOn && endsOn < startedOn) errors.push('구독 종료일이 시작일보다 앞설 수 없습니다.');
  return {
    ok: errors.length === 0, errors,
    value: { status, startedOn, endsOn, note: String(value.note || '').trim().slice(0, 200) }
  };
}
