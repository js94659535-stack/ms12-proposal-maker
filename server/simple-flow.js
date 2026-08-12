// 일반회원이 보는 간편 작성 흐름.
//
// 기존 공고 분석·사업 설계·근거 검증은 없애지 않는다. 화면에서만 접어 두고
// 안에서는 그대로 돈다. 회원에게는 네 걸음만 보인다.

export const SIMPLE_STEPS = Object.freeze([
  { key: 'find', label: '공고 찾기', hint: '조건에 맞는 공고를 찾습니다' },
  { key: 'pick', label: '공고 선택', hint: '고르면 분석은 자동으로 합니다' },
  { key: 'ask', label: '한 줄 작성 요청', hint: '하고 싶은 사업을 한두 문장으로' },
  { key: 'done', label: '계획서 완성', hint: '확인하고 수정 요청하면 됩니다' }
]);

// 접어서 유지하는 전문 기능. 삭제한 것이 아니라 「작성 과정 자세히 보기」 안에 있다.
export const HIDDEN_EXPERT = Object.freeze([
  '공고 분석과 강제조건',
  '사업 설계안과 승인',
  '평가기준 대응 논리',
  '근거·출처 추적',
  '사실검증과 평가자 검토',
  '항목별 재작성과 버전'
]);

// 화면 모드. 서버 차단은 이것과 무관하게 그대로 돈다.
export const VIEW_MODES = Object.freeze(['simple', 'expert']);

// 역할에 따른 기본 화면과 전환 가능 여부.
export function viewModeFor(user, requested = '') {
  const role = user?.role || 'customer';
  const wanted = VIEW_MODES.includes(requested) ? requested : '';
  if (role === 'admin') {
    // 최고관리자는 두 화면을 즉시 오간다. 기본은 전문가 화면이다.
    return { mode: wanted || 'expert', canToggle: true, reason: '' };
  }
  if (role === 'operator') {
    // 운영관리자는 간편 화면을 쓰고, 관리자가 허용한 상세만 함께 본다.
    return { mode: wanted || 'simple', canToggle: true, reason: '허용된 범위의 상세 기능만 열립니다.' };
  }
  return { mode: 'simple', canToggle: false, reason: '' };
}

// 지금 어느 걸음인지. 실제 상태에서 읽는다. 화면이 임의로 정하지 않는다.
export function currentStep({ noticeChosen = false, requestWritten = false, sections = 0 } = {}) {
  if (sections > 0) return 'done';
  if (noticeChosen && requestWritten) return 'ask';
  if (noticeChosen) return 'ask';
  return 'find';
}

// 계획서 완성 뒤 먼저 크게 보여 줄 것들. 이 다섯 가지만 앞에 둔다.
export const RESULT_ACTIONS = Object.freeze([
  { key: 'view', label: '계획서 확인' },
  { key: 'revise', label: '한 번에 수정 요청' },
  { key: 'save', label: '저장' },
  { key: 'export', label: 'PDF·DOCX 받기' },
  { key: 'expert', label: '전문 검토 보기' }
]);

// 추가 질문에 붙는 선택지. 모르면 넘어갈 수 있어야 작성이 멈추지 않는다.
export const ANSWER_CHOICES = Object.freeze([
  { key: 'suggest', label: 'AI 추천안 사용', note: '추천값은 [확인 필요]로 표시된 채 들어갑니다' },
  { key: 'unknown', label: '아직 모르겠어요', note: '[확인 필요]로 남깁니다' },
  { key: 'later', label: '나중에 확인', note: '지금은 넘기고 마지막에 다시 묻습니다' }
]);

export const MAX_QUESTIONS = 3;

// 회원이 고른 선택지를 값으로 바꾼다. 없는 사실을 만들지 않는 것이 규칙이다.
export function answerValue(choice, suggestion = '') {
  if (choice === 'suggest' && String(suggestion).trim()) {
    // 추천값도 확인 전에는 사실이 아니다. 표시를 달고 넣는다.
    return { value: String(suggestion).trim(), confirmed: false, mark: '[확인 필요: 추천값]' };
  }
  if (choice === 'later') return { value: '', confirmed: false, mark: '[확인 필요]', askAgain: true };
  return { value: '', confirmed: false, mark: '[확인 필요]' };
}
