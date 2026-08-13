// 기관정보를 두 단계로 나눈다.
//
// 처음 온 사람에게 인력·실적·시설·예산까지 다 적게 하면 계획서를 쓰기도 전에 지친다.
// 그래서 「기본정보」는 계획서를 시작하는 데 필요한 최소한만 받고, 「상세정보」는 선택으로 둔다.
// 상세정보가 비어 있어도 계획서 생성을 막지 않는다. 대신 모르는 자리는 [확인 필요]로 남는다.
//
// 화면 구분만 바뀐다. 저장 구조(applicant.items의 area)는 그대로여서 기존 자료가 그대로 보인다.

// 기본정보에 해당하는 영역. 나머지 영역은 모두 상세정보다.
export const BASIC_AREAS = Object.freeze(['basic', 'legal']);

// 상세정보 여덟 구역. 한 구역이 여러 저장 영역을 묶기도 한다(성과자료 = 성과측정 경험 + 근거자료).
export const DETAIL_GROUPS = Object.freeze([
  { key: 'clients', title: '이용자', areas: ['clients'], hint: '이용 인원·연령대·이용 방식처럼 기관이 실제로 만나는 사람들' },
  { key: 'staff', title: '인력', areas: ['staff'], hint: '상근·비상근 인원, 자격증, 담당 역할' },
  { key: 'performance', title: '실적', areas: ['performance'], hint: '연도·사업명·규모·성과' },
  { key: 'facilities', title: '시설', areas: ['facilities'], hint: '공간·장비·차량·운영 지역' },
  { key: 'programs', title: '프로그램', areas: ['programs'], hint: '프로그램명·대상·회기·운영 방식' },
  { key: 'partners', title: '협력기관', areas: ['partners'], hint: '기관명·협약 여부·역할' },
  { key: 'measurement', title: '성과자료', areas: ['measurement', 'references'], hint: '사용한 척도·측정 시기·증빙 문서' },
  { key: 'budget', title: '예산정보', areas: ['budget'], hint: '연간 예산 규모·자부담 가능액·회계 처리' }
]);

// 상세정보 화면 맨 위에 그대로 띄우는 안내. 문구를 바꾸지 않는다.
export const DETAIL_INTRO = '인력·사업실적·시설·보유 프로그램 등의 상세정보를 등록하면 AI가 기관의 실제 역량을 계획서에 반영할 수 있습니다. 반복 입력과 [확인 필요]가 줄어들며, 한 번 확인한 정보는 다음 계획서에서도 다시 사용할 수 있습니다.';

// 기본정보 다섯 칸이 저장될 때 붙는 항목명. quickToApplicantItems와 같은 이름을 쓴다.
export const BASIC_LABELS = Object.freeze({
  orgName: '기관명', orgType: '기관 유형', contact: '담당자', served: '주로 돕는 대상', strength: '강점·관련 경험'
});
const REQUIRED_KEYS = Object.freeze(['orgName', 'orgType', 'contact']);

const text = value => String(value ?? '').trim();
const itemsOf = applicant => (Array.isArray(applicant?.items) ? applicant.items : []);

function savedValue(applicant, key) {
  const label = BASIC_LABELS[key];
  const found = itemsOf(applicant).find(item => item.label === label && text(item.value));
  if (found) return text(found.value);
  return key === 'orgName' ? text(applicant?.name) : '';
}

// 저장된 기관에서 기본정보 입력칸을 다시 채운다. 없는 값을 만들지 않는다.
export function draftFromApplicant(applicant) {
  const draft = {};
  for (const key of Object.keys(BASIC_LABELS)) {
    const value = savedValue(applicant, key);
    if (value) draft[key] = value;
  }
  return draft;
}

// 기본정보가 계획서를 시작할 만큼 찼는지. 막기 위한 판정이 아니라 무엇이 비었는지 알려 주기 위한 것이다.
export function basicStatus(applicant, draft = {}) {
  const filledOf = key => text(draft[key]) || savedValue(applicant, key);
  const missing = REQUIRED_KEYS.filter(key => !filledOf(key));
  const filled = Object.keys(BASIC_LABELS).filter(key => filledOf(key));
  return {
    ready: missing.length === 0,
    missing: missing.map(key => BASIC_LABELS[key]),
    filled: filled.length,
    total: Object.keys(BASIC_LABELS).length,
    // 저장까지 끝났는지. 화면에서 「저장됨」과 「입력 중」을 구분한다.
    saved: Boolean(applicant) && REQUIRED_KEYS.every(key => savedValue(applicant, key))
  };
}

// 상세 구역별 등록 건수. 없는 구역을 억지로 채우라고 하지 않고 숫자만 보여 준다.
export function detailProgress(applicant) {
  const items = itemsOf(applicant);
  return DETAIL_GROUPS.map(group => {
    const list = items.filter(item => group.areas.includes(item.area));
    return {
      ...group,
      total: list.length,
      confirmed: list.filter(item => item.status === '확인됨').length
    };
  });
}

// 다음 계획서에서 그대로 다시 쓰이는 정보의 수. 상세정보를 왜 적는지 숫자로 보여 준다.
export function reusableCount(applicant) {
  return itemsOf(applicant).filter(item => item.status === '확인됨' && text(item.value)).length;
}
