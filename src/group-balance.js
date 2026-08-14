// 한 번에 얼마나 쓸지 정한다.
//
// 밖에서는 단추 하나지만 안에서는 묶음으로 나눠 쓴다. 지금은 그 묶음 수를 모델이 정하고
// 크기 기준이 없어, 한 묶음이 366자로 끝나기도 하고 1,400자를 넘기도 한다.
//
// 기록이 말하는 것은 분명하다. 한 번에 뽑는 양이 클수록 결과가 아예 안 나올 위험이 커진다.
//   · 설계를 한 번에(출력 8,000~12,000토큰) → 결과 미생성 2회
//   · 묶음 생성(출력 평균 2,114토큰, 67회) → 미생성 0회
//   · 설계를 두 걸음(4,000토큰대)으로 나눈 뒤 → 2회 연속 성공
//
// 그래서 목표 분량을 기준으로 묶음 경계만 다시 잡는다. 항목·순서·문구·근거는 건드리지 않는다.
// 큰 묶음은 쪼개고, 너무 작은 묶음은 옆과 합쳐 호출 수를 줄인다(호출마다 설계 문맥이 다시 들어간다).

// 한글 기준 대략 1토큰 ≈ 1.6자. 실측(출력 2,114토큰 ≈ 3,400자)에서 얻은 값이다.
export const CHARS_PER_TOKEN = 1.6;
// 한 호출이 뽑을 목표 분량. 위 기록에서 안전했던 구간(출력 4,000토큰 이하)을 자로 삼는다.
export const SAFE_CHARS = 5_000;
// 이보다 작으면 옆과 합친다. 호출 한 번에 붙는 고정 입력(설계 문맥·지시문)이 아깝다.
export const SMALL_CHARS = 1_200;

const list = value => (Array.isArray(value) ? value : []);
const charsOf = (keys, outline) => list(keys).reduce((sum, key) => sum + (outline.find(item => item.key === key)?.targetChars || 0), 0);

// 묶음별 목표 분량. 화면과 시험이 같은 값을 본다.
export function groupSizes(sectionPlan, outline) {
  return list(sectionPlan).map(group => ({
    id: group.id, title: group.title, keys: list(group.sectionKeys),
    chars: charsOf(group.sectionKeys, outline),
    tokens: Math.round(charsOf(group.sectionKeys, outline) / CHARS_PER_TOKEN)
  }));
}

// 큰 묶음은 쪼갠다. 항목 순서를 바꾸지 않고 앞에서부터 담다가 한도를 넘으면 새 묶음을 연다.
function splitGroup(group, outline, limit) {
  const keys = list(group.sectionKeys);
  if (keys.length < 2 || charsOf(keys, outline) <= limit) return [group];
  const parts = [];
  let bucket = [];
  for (const key of keys) {
    const next = [...bucket, key];
    if (bucket.length && charsOf(next, outline) > limit) { parts.push(bucket); bucket = [key]; continue; }
    bucket = next;
  }
  if (bucket.length) parts.push(bucket);
  if (parts.length < 2) return [group];
  return parts.map((part, index) => ({
    ...group,
    id: `${group.id}-${index + 1}`,
    // 제목은 원래 묶음 이름을 유지하고 몇 번째 조각인지만 덧붙인다. 서식 항목명을 바꾸지 않는다.
    title: `${group.title} (${index + 1}/${parts.length})`,
    sectionKeys: part
  }));
}

// 목표 분량 기준으로 묶음 경계를 다시 잡는다. 항목은 하나도 빠지거나 겹치지 않는다.
export function rebalanceGroups(sectionPlan, outline, { safeChars = SAFE_CHARS, smallChars = SMALL_CHARS } = {}) {
  const groups = list(sectionPlan).filter(group => list(group.sectionKeys).length);
  if (!groups.length) return { groups: list(sectionPlan), changed: false, reason: '분할 정보가 없어 그대로 둔다' };

  // 1) 큰 묶음 쪼개기
  const split = groups.flatMap(group => splitGroup(group, outline, safeChars));

  // 2) 작은 묶음 합치기. 바로 뒤와만 합쳐 순서를 지킨다.
  const merged = [];
  for (const group of split) {
    const previous = merged[merged.length - 1];
    const size = charsOf(group.sectionKeys, outline);
    const canMerge = previous && charsOf(previous.sectionKeys, outline) + size <= safeChars
      && (charsOf(previous.sectionKeys, outline) < smallChars || size < smallChars);
    if (!canMerge) { merged.push({ ...group }); continue; }
    merged[merged.length - 1] = {
      ...previous,
      sectionKeys: [...previous.sectionKeys, ...group.sectionKeys],
      title: previous.title === group.title ? previous.title : `${previous.title} · ${group.title}`
    };
  }

  const before = groups.flatMap(group => group.sectionKeys);
  const after = merged.flatMap(group => group.sectionKeys);
  // 항목이 하나라도 사라지거나 순서가 바뀌면 쓰지 않는다. 안전한 쪽으로 되돌린다.
  if (before.join('|') !== after.join('|')) return { groups, changed: false, reason: '항목 구성이 달라져 원래 분할을 유지한다' };
  const changed = merged.length !== groups.length;
  return {
    groups: merged,
    changed,
    reason: changed ? `목표 분량 기준으로 ${groups.length}묶음 → ${merged.length}묶음` : '조정할 것이 없다',
    sizes: groupSizes(merged, outline)
  };
}

// 조정이 무엇을 바꾸는지 사람 말로. 화면과 보고에 같은 문장을 쓴다.
export function balanceSummary(before, after, outline) {
  const sizes = groupSizes(before, outline);
  const next = groupSizes(after, outline);
  const big = sizes.filter(item => item.chars > SAFE_CHARS).length;
  const small = sizes.filter(item => item.chars < SMALL_CHARS).length;
  return {
    before: sizes.length, after: next.length,
    tooBig: big, tooSmall: small,
    maxBefore: Math.max(0, ...sizes.map(item => item.chars)),
    maxAfter: Math.max(0, ...next.map(item => item.chars))
  };
}
