// 공고 출처·기관 등록부. 고르는 목록과 관리 목록이 같은 자료를 본다.
//
// 규칙
// - 지우지 않는다. 안 쓰기로 한 곳은 상태만 바꾼다. 그 기관으로 모아 둔 공고와 계획서의 이름이 사라지면 안 된다.
// - 일시중지한 곳은 새로 고를 수 없고 자동수집에서도 빠지지만, 이미 고른 자료에는 그대로 남는다.
// - 이름만 등록한 곳은 「직접 업로드용」이다. 등록했다고 자동으로 모아 오지 않는다.
// - 추가·수정·중지·복원은 운영관리자까지, 보관(제거)은 최고관리자만.

export const ORG_STATUSES = Object.freeze(['active', 'paused', 'archived']);
export const ORG_STATUS_LABELS = Object.freeze({ active: '이용 중', paused: '일시중지', archived: '보관' });
export const MANUAL_ONLY_LABEL = '직접 업로드용';
export const COLLECTING_LABEL = '자동수집 연결됨';

// 누가 무엇을 할 수 있는지. 화면이 아니라 여기 목록으로 서버가 막는다.
export const ORG_ACTIONS = Object.freeze({
  save: ['operator', 'admin'],      // 추가·이름/분류/순서 수정
  pause: ['operator', 'admin'],     // 일시중지·다시 이용
  archive: ['admin'],               // 보관(화면에서 「제거」)
  restore: ['operator', 'admin']    // 보관 해제
});
export const canManageOrg = (role, action) => (ORG_ACTIONS[action] || []).includes(String(role || ''));

const text = (value, max) => String(value ?? '').trim().slice(0, max);

export function validateOrg(value = {}, { existing = null } = {}) {
  const errors = [];
  const name = text(value.name, 60);
  const category = text(value.category, 40);
  const order = Number(value.sortOrder);
  if (name.length < 2) errors.push('기관·출처 이름을 두 글자 이상 적어 주세요.');
  if (!Number.isFinite(order) || order < 0 || order > 9_999) errors.push('표시 순서는 0~9999 사이 숫자로 적어 주세요.');
  const status = ORG_STATUSES.includes(value.status) ? value.status : (existing?.status || 'active');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, category, sortOrder: Math.round(order), status } };
}

// 새 기관의 열쇠. 기존 여섯 가지의 키(chest·g2b…)는 그대로 두고 새것만 만든다.
export const newOrgId = () => `org-${crypto.randomUUID().slice(0, 8)}`;

export function orgView(row) {
  if (!row) return null;
  const status = ORG_STATUSES.includes(row.status) ? row.status : 'active';
  return {
    id: row.id, name: row.name, category: row.category || '',
    sortOrder: Number(row.sort_order) || 0,
    status, statusLabel: ORG_STATUS_LABELS[status],
    collects: Number(row.collects) === 1,
    // 자동수집이 없는 곳은 「직접 업로드용」이라고 그대로 적는다.
    collectLabel: Number(row.collects) === 1 ? COLLECTING_LABEL : MANUAL_ONLY_LABEL,
    builtin: Number(row.builtin) === 1,
    updatedAt: row.updated_at || ''
  };
}

const byOrder = (a, b) => a.sortOrder - b.sortOrder || String(a.name).localeCompare(String(b.name), 'ko');

// 고를 수 있는 곳. 일시중지·보관은 새로 고르지 못한다.
export const selectableOrgs = rows => (Array.isArray(rows) ? rows : []).filter(row => row.status === 'active').sort(byOrder);
// 관리 화면 목록. 보관까지 모두 보이되 상태 순서대로 둔다.
export const manageOrgs = rows => [...(Array.isArray(rows) ? rows : [])]
  .sort((a, b) => ORG_STATUSES.indexOf(a.status) - ORG_STATUSES.indexOf(b.status) || byOrder(a, b));

// 이미 고른 값은 그대로 둔다. 하나만 고르던 사람도 그대로 이어 쓴다.
export function normalizeSelection(value, rows) {
  const ids = new Set(selectableOrgs(rows).map(row => row.id));
  const list = Array.isArray(value) ? value : [value];
  const kept = [...new Set(list.map(item => text(item, 40)).filter(item => ids.has(item)))];
  return kept;
}

// 접었을 때 한 줄로. 「전체 6곳」, 「사랑의열매 외 2곳」처럼 고른 결과만 짧게 말한다.
export function selectionSummary(selected, rows) {
  const usable = selectableOrgs(rows);
  const chosen = usable.filter(row => (selected || []).includes(row.id));
  if (!usable.length) return '고를 수 있는 기관이 없습니다';
  if (!chosen.length) return '선택 안 함';
  if (chosen.length === usable.length) return `전체 ${usable.length}곳`;
  if (chosen.length === 1) return chosen[0].name;
  return `${chosen[0].name} 외 ${chosen.length - 1}곳`;
}

// 목록 안에서 찾기. 이름과 분류를 함께 본다.
export function searchOrgs(rows, query) {
  const needle = text(query, 40).toLowerCase();
  if (!needle) return rows;
  return (Array.isArray(rows) ? rows : []).filter(row => `${row.name} ${row.category}`.toLowerCase().includes(needle));
}

// 보관해도 되는지. 이 기관으로 모아 둔 공고나 쓴 계획서가 있으면 지우지 않고 보관만 한다.
export function archiveNote(counts = {}) {
  const notices = Number(counts.notices) || 0;
  const proposals = Number(counts.proposals) || 0;
  if (!notices && !proposals) return '연결된 자료가 없습니다. 보관해도 사라지는 자료가 없습니다.';
  return `연결된 공고 ${notices}건·계획서 ${proposals}건은 그대로 남습니다. 목록에서만 감춥니다.`;
}
