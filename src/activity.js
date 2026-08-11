// 「어느 단계에서 멈췄는지」와 「어떤 종류의 오류가 났는지」만 서버에 남긴다.
// 오류 문구를 그대로 보내지 않고 미리 정한 코드로 바꿔 보낸다. 계획서 원문·입력값은 절대 나가지 않는다.
const RULES = [
  [/로그인이 필요/, 'auth:required'],
  [/가입 승인 대기|승인해야 사용/, 'auth:pending'],
  [/관리자만|운영관리자만|허용되지 않은 출처/, 'auth:forbidden'],
  [/시도가 많습니다/, 'auth:throttled'],
  [/시간이 (너무 )?오래|초과|timeout/i, 'ai:timeout'],
  [/API 키|OPENAI|모델 ID|설정되지 않/i, 'ai:config'],
  [/너무 (깁니다|큽니다|많습니다)|용량|한도/, 'input:too-large'],
  [/보내지 못했|연결할 수 없|네트워크/, 'network'],
  [/파일|추출|변환/, 'file:extract'],
  [/보관함|저장하지 못/, 'archive:save']
];

export function errorCode(message) {
  const text = String(message || '');
  if (!text.trim()) return 'unknown';
  const status = /요청 실패 \((\d{3})\)/.exec(text);
  if (status) return `server:${status[1]}`;
  for (const [pattern, code] of RULES) if (pattern.test(text)) return code;
  return 'unknown';
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
export const reportError = (step, message) => reportActivity('error', step, errorCode(message));
