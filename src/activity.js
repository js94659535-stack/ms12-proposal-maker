// 「어느 단계에서 멈췄는지」와 「어떤 종류의 오류가 났는지」만 서버에 남긴다.
// 오류 문구를 그대로 보내지 않고 미리 정한 코드로 바꿔 보낸다. 계획서 원문·입력값은 절대 나가지 않는다.
//
// 코드는 세 갈래로 나눈다. 셋을 한 통에 담으면 진짜 고장이 안내에 파묻힌다.
//   guide:   아직 하지 않은 일을 알려 준 것. 프로그램이 제대로 작동한 것이다.
//   blocked: 앞 단계가 없어 이번 일을 할 수 없는 것. 실패가 아니라 순서 문제다.
//   fail:    하려던 일이 실제로 안 된 것. 우리가 고쳐야 하는 것은 이것뿐이다.
// 그 밖에 바깥 원인(ai·net·limit·auth·server)은 갈래를 따로 둔다.
//
// 순서가 중요하다. 「~해 주세요」를 먼저 걸러야 아래 규칙이 안내를 실패로 잘못 집지 않는다.
const RULES = [
  // 바깥 원인 — 문구와 상관없이 원인이 분명한 것부터
  [/로그인이 필요|로그인을 마치지 못/, 'auth:required'],
  [/가입 승인 대기|승인해야 사용/, 'auth:pending'],
  [/관리자만|운영관리자만|허용되지 않은 출처/, 'auth:forbidden'],
  [/시도가 많습니다/, 'auth:throttled'],
  [/시간이 (너무 )?오래|초과|timeout/i, 'ai:timeout'],
  [/API 키|OPENAI|모델 ID|설정되지 않/i, 'ai:config'],
  [/보내지 못했|연결할 수 없|네트워크/, 'net:offline'],
  [/한도|용량|너무 (깁니다|큽니다|많습니다)/, 'limit:size'],

  // 아직 하지 않은 일 — 실패가 아니다
  [/(자 이상|이상 입력|이상 적어)/, 'guide:too-short'],
  [/(적어|입력해|붙여넣어|채워)\s*주세요/, 'guide:input'],
  [/고르세요|골라\s*주세요|선택해\s*주세요|하나 이상 선택|먼저 선택/, 'guide:choose'],
  [/먼저 .{0,20}(만들어|작성해|저장해|실행해|넣어|올려|확인해)\s*주세요|먼저 .{0,16}(하세요|해 주세요)/, 'guide:order'],
  [/(으)?로 시작해야|형식이 올바르지|올바른 .{0,8}형식|형식으로/, 'guide:format'],

  // 앞 단계가 없다 — 순서 문제
  [/계획서(가|를)? ?(없|아직)|본문이 없|작성할 내용이 없|출력할 내용이 없/, 'blocked:no-proposal'],
  [/신청기관.{0,10}(없|먼저|선택)/, 'blocked:no-applicant'],
  [/공고.{0,10}(없|먼저)|공고문을 붙여넣/, 'blocked:no-notice'],
  [/서식.{0,10}없|실행계약서가 없|설계.{0,6}없/, 'blocked:no-design'],
  [/찾지 못했|찾을 수 없|해당하는 .{0,10}없/, 'blocked:not-found'],
  [/남은 .{0,10}(없|모두 썼)|소진|더 이상/, 'blocked:quota'],
  [/하나로 특정하지 못|어느 것인지 알 수 없/, 'blocked:ambiguous'],

  // 진짜 실패
  [/파일|추출|변환/, 'fail:file'],
  [/저장하지 못|보관하지 못|보관함/, 'fail:save'],
  [/삭제하지 못|지우지 못|되돌리지 못/, 'fail:delete'],
  [/만들지 못|출력하지 못|내려받지 못|묶지 못/, 'fail:export'],
  [/처리하지 못|반영하지 못|수정하지 못|불러오지 못/, 'fail:apply'],
  // 마지막 그물. 「무엇이 없다」는 말은 실패가 아니라 앞 단계가 비어 있다는 뜻이다.
  // 진짜 실패는 「~하지 못했다」로 끝나므로 위에서 이미 걸린다.
  [/없습니다|없어서|없이는|아직 .{0,10}않았/, 'blocked:missing']
];

// 오류가 난 자리. 문구가 아니라 함수 자리를 가리키는 짧은 영문 이름이다.
// 문구는 바뀐다. 바뀌면 위 규칙은 조용히 깨진다. 이 이름은 그때도 남는다.
// 목록에 없는 값은 버린다. 실수로 사용자 입력이 넘어와도 새어 나가지 않게 하려는 것이다.
export const ORIGINS = new Set([
  'simple-generate', 'generate-parts', 'generate-full', 'revision', 'rewrite',
  'coaching', 'precise-review', 'proposal-review', 'region-brief',
  'export-review', 'export-final', 'export-form', 'export-hwpx', 'submission-zip',
  'archive-save', 'archive-open', 'archive-trash', 'applicant-save',
  'notice-fetch', 'notice-import', 'notice-file', 'blueprint', 'form-spec'
]);

export function errorCode(message) {
  const text = String(message || '');
  if (!text.trim()) return 'unknown';
  const status = /요청 실패 \((\d{3})\)/.exec(text);
  if (status) return `server:${status[1]}`;
  for (const [pattern, code] of RULES) if (pattern.test(text)) return code;
  return 'unknown';
}

// 코드 뒤에 자리를 덧붙인다. 서버의 코드 형식(소문자·숫자·: _ - , 40자)을 그대로 지킨다.
// 그래서 표를 바꾸지 않아도 된다. 길이를 넘기면 자리를 버리고 코드만 남긴다.
export function withOrigin(code, origin) {
  const slug = String(origin || '').trim().toLowerCase();
  if (!ORIGINS.has(slug)) return code;
  const joined = `${code}:${slug}`;
  return joined.length <= 40 ? joined : code;
}

// 같은 값을 잇달아 보내지 않는다. 화면이 여러 번 그려져도 기록은 한 번만 늘어난다.
let last = '';
export function resetActivityDedupe() { last = ''; }

export function reportActivity(kind, step, code) {
  const key = `${kind}|${step}|${code}`;
  if (key === last) return Promise.resolve(false);
  last = key;
  return fetch('/api/activity', {
    method: 'POST', credentials: 'same-origin', keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'report', kind, step, code })
  }).then(response => response.ok).catch(() => false);
}

export const reportStep = step => reportActivity('step', step, `step:${step}`);
export const reportError = (step, message, origin = '') => reportActivity('error', step, withOrigin(errorCode(message), origin));
