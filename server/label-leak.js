// 프롬프트의 내부 이름이 결과 본문에 그대로 나오는지 본다.
//
// 실제로 났던 일: 계획서 설계 화면에 「최상위 NOTICE_CONTRACT는 …」이 그대로 인쇄됐다.
// 프롬프트가 `NOTICE_CONTRACT는 … 최상위 기준이다`라고 그 이름으로 개념을 정의했고,
// 모델이 근거를 설명하면서 배운 이름을 그대로 불렀다. 사용자가 눈으로 발견해서 알았다.
//
// 이름 목록을 손으로 적지 않는다. 태그가 늘 때 목록만 안 늘면 새 이름은 검사에서 빠지고,
// 그러면 검사가 있다는 사실이 오히려 안심시킨다. **프롬프트 자체에서 뽑는다.**

// <TAG> 꼴로 자료를 감싸는 이름. 이것이 유일한 목록 출처다.
const TAG_PATTERN = /<([A-Z][A-Z0-9_]{2,})>/g;

// 규칙 블록 이름은 뺀다. `<BLUEPRINT_RULE>`처럼 규칙 자체를 감싸는 껍데기여서
// 모델이 인용할 대상이 아니고, 검사에 넣으면 잡음만 는다.
const RULE_SUFFIX = /_RULE$/;

// 태그로는 나타나지 않지만 자료·규칙 문장에 그대로 실려 가는 값.
// ruleType·severity·conflict type이며 src/notice-contract.js와 화면 스키마에서 온다.
// 서버가 그 파일을 import하지 않으므로 여기 적는다. 늘어나면 여기 한 줄만 는다.
export const ENUM_WORDS = Object.freeze(['EXACT', 'MIN', 'MAX', 'CHOICE', 'REQUIRED', 'BLOCKING', 'NOTICE_CONTRACT_CONFLICT']);

const unique = values => [...new Set(values)];

/** 프롬프트에 실제로 쓰인 태그 이름. 프롬프트가 바뀌면 목록도 따라 바뀐다. */
export function tagNames(prompt) {
  return unique([...String(prompt || '').matchAll(TAG_PATTERN)].map(match => match[1]))
    .filter(name => !RULE_SUFFIX.test(name))
    .sort();
}

/** 이번 호출에서 검사할 이름 전부. 태그 + 열거값. */
export function internalNames(prompt) {
  return unique([...tagNames(prompt), ...ENUM_WORDS]).sort();
}

// 앞뒤가 영문·숫자·밑줄이 아니면 맨 이름으로 본다. 한국어 조사가 바로 붙어도 잡힌다.
const bare = name => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'g');

/**
 * 결과 본문에서 발견된 내부 이름. 많이 나온 순.
 * 막기 위한 것이 아니라 세기 위한 것이다 — 토큰은 이미 나갔다.
 */
export function findLeaks(text, names = []) {
  const body = String(text || '');
  if (!body) return [];
  return names
    .map(name => ({ name, count: (body.match(bare(name)) || []).length }))
    .filter(item => item.count > 0)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

/**
 * 프롬프트 원문에서 「태그로 감싼 이름이 한국어 문장 속에 맨 이름으로 다시 나오는」 자리.
 *
 * 새는 원인을 진단하는 쪽이다. 태그는 경계 표시라 안전하지만, 조사가 붙은 주어로 쓰면
 * 모델이 「이 사물의 이름」으로 배운다. 고칠 대상은 이쪽이다.
 */
export function proseLabels(source) {
  const text = String(source || '');
  const found = [];
  for (const name of tagNames(text)) {
    // 태그로 쓰인 자리를 먼저 지운다. 남는 것이 문장 속에 맨 이름으로 놓인 자리다.
    const stripped = text.split(`<${name}>`).join(' ').split(`</${name}>`).join(' ');
    const count = (stripped.match(bare(name)) || []).length;
    if (count) found.push({ name, count });
  }
  return found.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

// 모델이 태그 이름을 「출처 위치」로 인용한다. 태그가 그것이 읽은 자료의 유일한 이름이기 때문이다.
// 태그 44개를 전부 바꾸는 대신 화면에서 갈아 끼운다 — 이미 새어 나와 보관된 자료에도 적용된다.
// 이름 목록이 검사와 같은 파일에 있어야 한 쪽만 늘어나는 일이 없다.
export const KOREAN_LABELS = Object.freeze({
  NOTICE_CONTRACT: '공고 실행계약서',
  OFFICIAL_NOTICE_TEXT: '공고 원문',
  MANUAL_SOURCES: '직접 올린 자료',
  PROJECT_BLUEPRINT: '사업 설계도',
  APPROVED_DESIGN_PLAN: '승인 설계안',
  CONFIRMED_DESIGN: '설계 1걸음 결과',
  MASTER_CONTEXT: '마스터 설계',
  CANDIDATE_ASSETS: '신청기관 정보',
  SELECTED_SUBPROGRAM: '선택한 세부사업',
  REVIEW_BASIS: '검토 기준',
  CORE_IDEA: '핵심 아이디어',
  REFERENCE: '참고자료',
  PAGE_PLAN: '쪽 구성안',
  CONDITIONS: '입력 조건'
});

/** 화면에 내보내기 전에 내부 이름을 한국어로 바꾼다. 앞뒤가 영문·숫자·밑줄이면 건드리지 않는다. */
export function toKoreanLabel(value) {
  let text = String(value ?? '');
  if (!text) return text;
  for (const [name, korean] of Object.entries(KOREAN_LABELS)) {
    text = text.replace(new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'g'), korean);
  }
  return text;
}

// 기록에 남길 짧은 코드. user_activity_events의 code 규칙(소문자·숫자·: _ -, 40자)을 지킨다.
export function leakCode(action, name) {
  const clean = value => String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `leak:${clean(action)}:${clean(name)}`.slice(0, 40);
}
