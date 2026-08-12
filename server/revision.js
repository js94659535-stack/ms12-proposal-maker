// 계획서 「한 번에 수정 요청」 규칙.
//
// 항목마다 따로 고치게 하면 사람은 어디를 눌러야 할지 모른다. 요청은 한 번만 받고,
// 영향을 받는 부분만 고친다. 요청하지 않은 내용과 확인된 사실은 그대로 둔다.
//
// 수정 기회는 계획서 한 편당 두 번이다. 다만 「AI가 실패한 것」까지 회원이 물어서는 안 된다.
// 그래서 정상적으로 수정본이 만들어져 저장됐을 때만 깎는다.

export const REVISION_KINDS = Object.freeze([
  { key: 'add', label: '내용 추가', hint: '빠진 내용을 넣습니다' },
  { key: 'direction', label: '방향 변경', hint: '사업의 방향을 바꿉니다' },
  { key: 'length', label: '분량 조정', hint: '늘리거나 줄입니다' },
  { key: 'tone', label: '문체 다듬기', hint: '표현만 고칩니다' },
  { key: 'numbers', label: '예산·일정·인원 변경', hint: '수치를 바꿉니다' },
  { key: 'free', label: '직접 요청', hint: '원하는 대로 적습니다' }
]);

// 두 번의 성격이 다르다. 방향을 크게 바꾸는 것 한 번, 마지막 다듬기 한 번.
export const QUOTA = Object.freeze({ direction: 1, polish: 1 });
export const TOTAL_QUOTA = QUOTA.direction + QUOTA.polish;

// 깎지 않는 경우. 회원 잘못이 아닌 것과 사람이 직접 고친 것은 세지 않는다.
export const FREE_REASONS = Object.freeze({
  failed: 'AI 호출이 실패했습니다',
  empty: '결과가 만들어지지 않았습니다',
  recovery: '빠진 항목을 되살렸습니다',
  typo: '오탈자·확정 사실을 바로잡았습니다',
  manual: '회원이 직접 고쳤습니다'
});

// 방향을 크게 바꾸는 요청인지. 문체·분량만 손대는 것은 다듬기로 본다.
export function revisionSlot(kind) {
  return ['tone', 'length'].includes(String(kind)) ? 'polish' : 'direction';
}

const PIVOT = /전부 (?:바꿔|바꾸|다시)|처음부터 다시|완전히 다른|다른 공고|공고를 바꾸|사업을 바꾸|대상을 (?:전부|모두) 바꾸/;

// 공고·대상·목적·핵심사업을 전부 바꾸는 요청은 수정이 아니다. 새 계획서로 안내한다.
export function isNewPlanRequest({ kind = '', text = '', changesNotice = false } = {}) {
  if (changesNotice) return true;
  const value = String(text || '');
  if (PIVOT.test(value)) return true;
  // 방향 변경이면서 대상·목적·사업을 함께 바꾸겠다고 하면 사실상 새 계획서다.
  if (kind === 'direction') {
    const targets = ['대상', '목적', '사업'].filter(word => value.includes(word)).length;
    return targets >= 3 && /바꾸|변경|다르게/.test(value);
  }
  return false;
}

export function usedOf(history = []) {
  const counted = history.filter(item => item?.counted);
  return {
    direction: counted.filter(item => item.slot === 'direction').length,
    polish: counted.filter(item => item.slot === 'polish').length
  };
}

export function remainingOf(history = []) {
  const used = usedOf(history);
  return {
    direction: Math.max(0, QUOTA.direction - used.direction),
    polish: Math.max(0, QUOTA.polish - used.polish),
    total: Math.max(0, TOTAL_QUOTA - used.direction - used.polish)
  };
}

// 요청을 받아도 되는지. 받을 수 없으면 왜인지와 무엇을 하면 되는지 함께 돌려준다.
export function canRevise({ kind = 'free', text = '', history = [], changesNotice = false } = {}) {
  if (isNewPlanRequest({ kind, text, changesNotice })) {
    return {
      allowed: false, reason: 'newPlan',
      message: '공고·대상·목적·핵심사업을 모두 바꾸는 요청입니다. 수정이 아니라 새 계획서로 만드는 편이 정확합니다.',
      action: '새 계획서 만들기'
    };
  }
  const slot = revisionSlot(kind);
  const remaining = remainingOf(history);
  if (remaining[slot] > 0) return { allowed: true, slot, remaining };
  // 같은 칸이 없어도 다른 칸이 남아 있으면 그것으로 쓴다.
  const other = slot === 'direction' ? 'polish' : 'direction';
  if (remaining[other] > 0) return { allowed: true, slot: other, remaining };
  return {
    allowed: false, reason: 'quota',
    message: `이 계획서의 AI 수정 ${TOTAL_QUOTA}회를 모두 썼습니다. 직접 편집은 계속할 수 있고, 새 계획서를 만들면 다시 ${TOTAL_QUOTA}회가 주어집니다.`,
    action: '직접 편집하기'
  };
}

// 실제로 깎을지 정한다. 결과가 나오고 저장까지 됐을 때만 깎는다.
export function settleRevision({ slot = 'direction', ok = false, saved = false, changedSections = 0, freeReason = '' } = {}) {
  if (freeReason) return { counted: false, slot, note: FREE_REASONS[freeReason] || freeReason };
  if (!ok) return { counted: false, slot, note: FREE_REASONS.failed };
  if (!changedSections) return { counted: false, slot, note: FREE_REASONS.empty };
  if (!saved) return { counted: false, slot, note: '저장되지 않아 횟수를 세지 않았습니다' };
  return { counted: true, slot, note: '' };
}

const norm = value => String(value ?? '').replace(/\s+/g, ' ').trim();

// 무엇이 바뀌고 무엇이 그대로인지 보여 준다. 요청하지 않은 항목이 바뀌면 그것도 드러난다.
export function diffSections(before = [], after = []) {
  const byId = new Map(before.map(section => [section.id ?? section.title, section]));
  const changed = [];
  const kept = [];
  for (const section of after) {
    const key = section.id ?? section.title;
    const old = byId.get(key);
    if (!old) { changed.push({ title: section.title, kind: 'added' }); continue; }
    if (norm(old.content) === norm(section.content)) kept.push(section.title);
    else changed.push({ title: section.title, kind: 'edited', before: old.content, after: section.content });
  }
  const removed = before.filter(section => !after.some(item => (item.id ?? item.title) === (section.id ?? section.title)));
  return { changed, kept, removed: removed.map(section => section.title) };
}

// 새로 생긴 [확인 필요]. 근거 없는 수치가 슬쩍 들어오는 것을 막는다.
export function newUnknowns(before = [], after = []) {
  const count = sections => sections.reduce((sum, section) => sum + (String(section.content || '').match(/\[확인 필요/g) || []).length, 0);
  return Math.max(0, count(after) - count(before));
}

// 수정본이 확인된 사실을 지우지 않았는지 본다. 지웠으면 그 자리를 알려 준다.
export function keptFacts(facts = [], after = []) {
  const text = after.map(section => norm(section.content)).join(' ');
  return {
    kept: facts.filter(fact => norm(fact) && text.includes(norm(fact))),
    lost: facts.filter(fact => norm(fact) && !text.includes(norm(fact)))
  };
}

// 대상·활동·일정·인력·예산·성과지표가 서로 어긋나지 않는지 함께 본다.
export const CONSISTENCY_FIELDS = Object.freeze(['대상', '활동', '일정', '인력', '예산', '성과지표']);
export function consistencyTargets(sections = []) {
  const text = sections.map(section => `${section.title}\n${section.content}`).join('\n');
  return CONSISTENCY_FIELDS.filter(field => text.includes(field));
}
