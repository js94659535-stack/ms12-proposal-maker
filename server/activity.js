// 사용자가 어느 단계에서 멈췄는지와 최근 오류 종류만 남긴다.
// 계획서 원문·입력값·개인정보는 받지도 저장하지도 않는다. 단계 번호와 미리 정한 코드만 통과한다.
export const ACTIVITY_STEPS = ['공고 준비', '공고 분석', '신청기관 준비', '사업 설계', '계획서 작성', '검토·제출'];
export const ACTIVITY_KINDS = new Set(['step', 'error']);
// 한 계정당 남기는 기록 수. 넘으면 오래된 것부터 지운다.
export const MAX_EVENTS_PER_USER = 40;
// 소문자·숫자와 : _ - 만 받는다. 문장이 들어올 자리를 아예 두지 않는다.
const CODE = /^[a-z0-9][a-z0-9:_-]{0,39}$/;

export function normalizeActivity(value = {}) {
  const kind = ACTIVITY_KINDS.has(value?.kind) ? value.kind : '';
  if (!kind) return null;
  const raw = Number(value?.step);
  const step = Number.isInteger(raw) && raw >= 0 && raw < ACTIVITY_STEPS.length ? raw : -1;
  const text = String(value?.code ?? '').trim().toLowerCase();
  return { kind, step, stepLabel: step >= 0 ? ACTIVITY_STEPS[step] : '', code: CODE.test(text) ? text : 'unknown' };
}

export async function recordActivity(db, userId, value, now = new Date()) {
  const event = normalizeActivity(value);
  if (!event || !userId) return null;
  await db.prepare('INSERT INTO user_activity_events (id, user_id, kind, step, step_label, code, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, event.kind, event.step, event.stepLabel, event.code, now.toISOString()).run();
  await trimActivity(db, userId);
  return event;
}

// 오래된 기록은 계정마다 정해진 수만 남기고 지운다.
async function trimActivity(db, userId) {
  const rows = await db.prepare('SELECT id FROM user_activity_events WHERE user_id = ? ORDER BY at DESC').bind(userId).all();
  for (const row of (rows?.results || []).slice(MAX_EVENTS_PER_USER)) {
    await db.prepare('DELETE FROM user_activity_events WHERE id = ?').bind(row.id).run();
  }
}

export async function recentActivity(db, userId, limit = 12) {
  const size = Math.min(Math.max(Number(limit) || 12, 1), MAX_EVENTS_PER_USER);
  const rows = await db.prepare(`SELECT kind, step, step_label, code, at FROM user_activity_events
    WHERE user_id = ? ORDER BY at DESC LIMIT ?`).bind(String(userId || ''), size).all();
  return (rows?.results || []).map(row => ({ kind: row.kind, step: Number(row.step), stepLabel: row.step_label || '', code: row.code || '', at: row.at }));
}

// 「멈춘 단계」는 마지막으로 머문 단계다. 그 뒤에 오류가 있었으면 함께 보여 준다.
export function stuckSummary(events = []) {
  const lastStep = events.find(item => item.kind === 'step' && item.step >= 0);
  const lastError = events.find(item => item.kind === 'error');
  if (!lastStep && !lastError) return { step: -1, stepLabel: '', at: '', lastErrorCode: '', lastErrorAt: '', errorAfterStep: false };
  const errorAfterStep = Boolean(lastError && (!lastStep || lastError.at >= lastStep.at));
  return {
    step: lastStep?.step ?? (lastError?.step ?? -1),
    stepLabel: lastStep?.stepLabel || lastError?.stepLabel || '',
    at: lastStep?.at || '',
    lastErrorCode: lastError?.code || '', lastErrorAt: lastError?.at || '', errorAfterStep
  };
}
