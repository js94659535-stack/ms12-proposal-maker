// 부분 결과. 계획서를 묶음으로 나눠 쓰는 동안 「어디까지 끝났는지」를 한 곳에서 판단한다.
//
// 규칙은 세 가지다.
// 1. 끝난 묶음은 무슨 일이 있어도 지우지 않는다(멈춤·오류·새로고침·재로그인).
// 2. 남은 묶음이 하나라도 있으면 완성이 아니다. 완성·저장·출력을 열지 않는다.
// 3. 이미 끝난 묶음은 다시 부르지 않는다. 이어쓰기는 실패한 묶음부터 시작한다.

const list = value => (Array.isArray(value) ? value : []);

export function writingState(staged, { busy = false, sections = 0 } = {}) {
  const groups = list(staged?.master?.sectionPlan);
  const done = list(staged?.completedGroupIds).length;
  const total = groups.length;
  return {
    total,
    done,
    started: Boolean(staged?.master),
    // 쓰는 중. 설계만 끝난 순간에도 이미 보여 줄 것이 있다.
    writing: Boolean(busy) && (sections > 0 || Boolean(staged?.master)),
    // 한 번에 다 쓴 경우. 그때는 묶음 기록이 비어 있어도 부분 결과가 아니다.
    // 이 표시가 없으면 이미 저장해 둔 계획서가 계속 막힌다 — 기록은 저장 시점 그대로이기 때문이다.
    partial: total > 0 && done < total && (done > 0 || sections > 0) && staged?.phase !== 'complete',
    complete: (total > 0 && done === total) || (staged?.phase === 'complete' && sections > 0),
    stopped: Boolean(staged?.stoppedAt),
    failedGroupId: String(staged?.failedGroupId || '')
  };
}

// 다음에 쓸 묶음. 끝난 것은 건너뛴다. 실패한 묶음이 있으면 그것이 맨 앞이다.
export function remainingGroups(staged) {
  const done = new Set(list(staged?.completedGroupIds));
  return list(staged?.master?.sectionPlan).filter(group => !done.has(group.id));
}

// 부분 결과일 때 완성·저장·출력을 막는 사유. 막을 이유가 없으면 빈 문자열이다.
// 화면에 실제로 있는 버튼 이름. 문구에서 「저기를 누르세요」라고 가리키려면 이름이 맞아야 한다.
export const WRITE_ALL_BUTTON = 'AI와 함께 전체 계획서 작성';
export const WRITE_REST_BUTTON = '남은 내용 이어서 작성';

export function partialBlockReason(staged, { busy = false, sections = 0 } = {}) {
  const view = writingState(staged, { busy, sections });
  if (view.writing) return '아직 쓰는 중입니다. 다 끝나면 저장과 출력이 열립니다.';
  if (!view.partial) return '';
  // 「묶음」은 우리끼리 쓰는 말이다. 그리고 무엇을 눌러야 하는지 말하지 않으면 멈춘 채로 남는다.
  //
  // 본문이 아예 없는 경우는 여기까지 오지 않는다(앞 관문이 먼저 잡는다).
  // 여기 오는 것은 쓰다 만 것이고, 한 항목도 못 끝냈으면 처음부터 다시 쓰는 편이 빠르다.
  if (!view.done) {
    return `본문이 만들다 만 상태로 남아 있습니다. 화면의 「${WRITE_ALL_BUTTON}」을 다시 누르면 본문이 만들어지고 그때 받을 수 있습니다.`;
  }
  return `본문 ${view.total}개 항목 가운데 ${view.done}개까지 썼습니다. 화면의 「${WRITE_REST_BUTTON}」을 누르면 나머지가 채워지고 그때 받을 수 있습니다.`;
}

export function recordTiming(timeline, entry) {
  return [...list(timeline), entry].slice(-40);
}

// 같은 묶음을 두 번 부르지 않았는지. 멈췄다 이어 쓰거나 실패 후 다시 시작할 때를 확인한다.
export function duplicateCalls(calls = {}) {
  return Object.entries(calls || {}).filter(([, count]) => Number(count) > 1).map(([id, count]) => ({ id, count: Number(count) }));
}

export function elapsedLabel(ms) {
  const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초` : `${seconds}초`;
}

// 화면에 그대로 적는 진행 기록. 시각은 저장된 값만 쓰고 새로 만들지 않는다.
export function timelineRows(timeline) {
  return list(timeline).map(entry => ({
    kind: entry.kind,
    title: entry.title || (entry.kind === 'design' ? '설계 요약' : entry.kind === 'done' ? '전체 완성' : '묶음'),
    at: String(entry.at || '').slice(11, 19),
    took: elapsedLabel(entry.ms)
  }));
}
