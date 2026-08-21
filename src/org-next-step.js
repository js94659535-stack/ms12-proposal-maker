// 이 화면에서 「지금 할 일」 하나를 정한다.
//
// 왜 한 곳인가. 화면 곳곳이 저마다 「이걸 누르세요」를 말하면 주 버튼이 아홉 개가 되고,
// 그러면 어느 것도 다음 할 일이 아니다. 실제로 사용자가 「일괄 반영」·「모두 확인됨으로」·
// 「계획서 작성으로」를 세 번 연속 찾지 못했다. 판정은 여기서만 하고 화면은 결과만 그린다.
//
// 순서는 앞의 것이 끝나야 뒤의 것이 뜻을 갖는 차례다. 기관이 없으면 기본정보를 물어도 소용없고,
// 아무 정보도 없으면 확인할 것도 없다.

export const NEXT_STEP_KEYS = Object.freeze(['add-org', 'basic', 'upload', 'apply', 'confirm', 'write']);

const count = value => (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);

export function nextOrgStep({
  applicantCount = 0,
  hasApplicant = false,
  basicMissing = [],
  itemCount = 0,
  candidateCount = 0,
  performanceUnconfirmed = 0,
  otherUnconfirmed = 0
} = {}) {
  if (!hasApplicant || count(applicantCount) === 0) {
    return {
      key: 'add-org',
      message: '등록된 신청기관이 없습니다. 기관명을 적고 추가하세요.',
      actionLabel: '신청기관 추가하러 가기',
      done: false
    };
  }
  const missing = (Array.isArray(basicMissing) ? basicMissing : []).filter(Boolean);
  if (missing.length) {
    return {
      key: 'basic',
      message: `${missing.join(' · ')}이(가) 비어 있습니다. 이 세 가지만 있으면 계획서를 시작할 수 있습니다.`,
      actionLabel: '채우러 가기',
      done: false
    };
  }
  if (count(itemCount) === 0) {
    return {
      key: 'upload',
      message: '등록된 기관 정보가 없습니다. 연혁·사업계획서를 올리면 한 번에 채워집니다.',
      actionLabel: '연혁·사업계획서 올리기',
      done: false
    };
  }
  // 후보는 문서에서 찾아만 둔 값이다. 반영하지 않으면 기관 정보가 되지 않는다.
  if (count(candidateCount) > 0) {
    return {
      key: 'apply',
      message: `문서에서 찾은 후보 ${count(candidateCount)}건이 아직 반영되지 않았습니다.`,
      actionLabel: '후보 반영하러 가기',
      done: false
    };
  }
  if (count(performanceUnconfirmed) > 0) {
    return {
      key: 'confirm',
      message: `실적 ${count(performanceUnconfirmed)}건이 확인 전입니다. 확인해야 계획서에 쓰입니다.`,
      actionLabel: `${count(performanceUnconfirmed)}건 모두 확인`,
      done: false
    };
  }
  if (count(otherUnconfirmed) > 0) {
    return {
      key: 'confirm',
      message: `확인 전 정보가 ${count(otherUnconfirmed)}건 남아 있습니다. 확인한 정보만 계획서에 사실로 쓰입니다.`,
      actionLabel: '확인하러 가기',
      done: false
    };
  }
  return {
    key: 'write',
    message: '준비가 됐습니다.',
    actionLabel: '계획서 작성으로',
    done: true
  };
}
