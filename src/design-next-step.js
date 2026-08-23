// 사업 설계 화면(4단계)에서 「지금 할 일」 하나를 정한다.
//
// 왜 여기인가. `org-next-step.js`에 넣지 않았다 — 이름이 org-이고 다른 화면 둘이 읽는 파일이라,
// 이 화면 사정으로 그 파일을 흔들면 두 화면이 함께 흔들린다.
// `project-blueprint.js`에도 넣지 않았다 — 그 파일이 하는 일은 설계도를 만드는 것이고
// 이것이 하는 일은 화면의 차례를 정하는 것이다. 섞으면 설계도를 고칠 때마다 화면 흐름을 함께 봐야 한다.
// 그래서 org-next-step.js와 나란한 자리에 따로 둔다. 화면마다 판정 하나, 파일 하나다.
//
// 판정을 새로 계산하지 않는다. 어려운 대목(설계가 얼마나 됐나)은 buildBlueprint()가 이미
// readiness 세 갈래로 내놓았고, 여기서는 그 값을 차례로 옮겨 담을 뿐이다.

export const DESIGN_STEP_KEYS = Object.freeze(['subproject', 'notice', 'analyze', 'applicant', 'conflict', 'type', 'design', 'draft']);

const count = value => (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);

export function nextDesignStep({
  // 공고에 세부사업이 여럿이라 고르기를 기다리는 중인가. 0이면 기다리는 것이 없다.
  subprojectCount = 0,
  hasNotice = false,
  hasStructure = false,
  hasApplicant = false,
  conflictCount = 0,
  // buildBlueprint()의 결과. 공고 구조와 신청기관이 둘 다 있어야 만들어진다.
  blueprint = null
} = {}) {
  if (count(subprojectCount) > 0) {
    return {
      key: 'subproject',
      message: `이 공고에는 세부사업이 ${count(subprojectCount)}개입니다. 어느 사업으로 쓸지 먼저 고르세요 — 고른 사업 내용만 계획서에 들어갑니다.`,
      actionLabel: '세부사업 고르기',
      done: false
    };
  }
  if (!hasNotice) {
    return {
      key: 'notice',
      message: '아직 고른 공고가 없습니다. 공고가 있어야 이번 사업의 설계도를 만듭니다.',
      actionLabel: '공고 확인으로 가기',
      done: false
    };
  }
  if (!hasStructure) {
    return {
      key: 'analyze',
      message: '공고의 선정 논리를 아직 분석하지 않았습니다. 분석해야 무엇을 요구하는 공고인지 설계도에 담깁니다.',
      actionLabel: '공고 분석하러 가기',
      done: false
    };
  }
  if (!hasApplicant) {
    return {
      key: 'applicant',
      message: '이번 사업의 신청기관을 아직 고르지 않았습니다. 기관을 골라야 확인된 기관 정보가 설계도에 들어갑니다.',
      actionLabel: '신청기관 고르러 가기',
      done: false
    };
  }
  // 공고가 이미 정해 둔 값과 어긋난 것. 어느 쪽으로 할지 고르는 항목이 아니라 맞춰야 하는 값이라
  // 설계 이야기보다 앞이다.
  if (count(conflictCount) > 0) {
    return {
      key: 'conflict',
      message: `공고 기준과 어긋난 값이 ${count(conflictCount)}건입니다. 어느 쪽으로 할지 고르는 항목이 아니라 공고에 맞춰야 하는 값입니다.`,
      actionLabel: `${count(conflictCount)}건 맞추러 가기`,
      done: false
    };
  }
  // 여기서부터는 설계도가 있어야 묻는다. 설계도는 공고 구조와 신청기관이 둘 다 있어야 만들어지므로
  // 그 둘을 묻는 위의 두 갈래가 반드시 앞이다. 그래서 이 자리에 오면 설계도가 있다 —
  // 없다면 부르는 쪽이 차례를 어긴 것이고, 그때는 분석부터 다시 하라고 말한다.
  if (!blueprint) {
    return {
      key: 'analyze',
      message: '설계도를 만들 자료가 아직 없습니다. 공고 분석부터 다시 확인해 주세요.',
      actionLabel: '공고 분석하러 가기',
      done: false
    };
  }
  // 설계도가 스스로 낸 한 줄 판정을 그대로 쓴다. 같은 말을 두 번 짓지 않는다.
  //
  // 긴 쪽(verdictReasons)은 쓰지 않았다. 그것은 설계도 패널에 펼쳐 보이려고 만든 다섯 문장·수백 자라
  // 한 줄짜리 띠에 넣으면 띠가 문단이 된다(실측: 유형 미선택 상태에서 260자). 같은 판정에서 나온
  // 한 줄 요약이 verdict이고, 그 긴 문장들은 바로 아래 설계도 카드에 이미 그대로 나온다.
  const verdict = String(blueprint.verdict || '').trim();
  const types = blueprint.applicationTypes || {};
  if (types.blocked) {
    const names = (types.options || []).map(option => option.name).filter(Boolean);
    return {
      key: 'type',
      message: verdict || `신청유형이 ${names.join(' · ')}로 나뉩니다. 유형을 먼저 골라야 서로 다른 유형의 조건이 섞이지 않습니다.`,
      actionLabel: '신청유형 고르기',
      done: false
    };
  }
  if (blueprint.readiness === 'DESIGN_INCOMPLETE') {
    // 막는 걸음이 아니라 권하는 걸음이다. 초안은 지금도 만들어지고, 미정인 값은 [확인 필요]로 남는다.
    // 그 사실을 문장에 넣어 두어야 「답해야만 넘어간다」로 읽히지 않는다(대원칙 ①).
    const open = Number(blueprint.byStatus?.NEEDS_CONFIRMATION) || 0;
    return {
      key: 'design',
      message: `확인이 필요한 설계 항목이 ${open}개 남았습니다. 지금 초안을 만들어도 됩니다 — 미정인 값은 계획서에 [확인 필요]로 남습니다. 먼저 답하면 그만큼 채워집니다.`,
      actionLabel: '설계도에서 답하기',
      done: false
    };
  }
  if (blueprint.readiness === 'SUBMISSION_READY') {
    return {
      key: 'draft',
      message: `${verdict || '제출 문서 확정 단계로 진행 가능'}. 초안을 만드세요.`,
      actionLabel: '초안 작성',
      done: true
    };
  }
  const remaining = (blueprint.submissionChecklist || []).length;
  return {
    key: 'draft',
    message: `설계가 초안을 만들 만큼 찼습니다. 제출 전에 확인할 항목이 ${remaining}개 남아 있고, 그것은 초안을 만든 뒤에 봐도 됩니다.`,
    actionLabel: '초안 작성',
    done: false
  };
}
