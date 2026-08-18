// 계획서 「지역 현황」에 들어가는 지표 목록. 무엇을 어디서 어떻게 구하는지를 한곳에 적어 둔다.
//
// 계획서에서 가장 자주 비는 자리가 지역 수치다. 값을 몰라서가 아니라
// 「어느 통계의 어느 표를 봐야 하는지」를 몰라서 비는 경우가 대부분이다.
// 그래서 지표마다 출처·표 이름·받는 방법·담당 부서까지 적어 둔다.
//
// 자동으로 부를 수 있는 것만 auto로 둔다. 나머지는 사람이 받아 적는 자리이며,
// 그 자리에도 「어디에 무엇을 요청하면 되는지」를 문장으로 남긴다. 값을 지어내지 않는다.

export const INDICATOR_KINDS = Object.freeze({
  auto: '앱이 조회',        // 연동된 공식 API로 바로 가져온다
  download: '자료 내려받기', // 공개 파일을 받아 세어야 한다
  request: '기관에 요청'     // 담당 부서에 문의해야 한다
});

export const INDICATORS = Object.freeze([
  Object.freeze({
    key: 'childPopulation', group: '아동 인구', kind: 'auto',
    label: '대상 연령 아동 인구',
    why: '사업 대상 규모가 지역에 실제로 존재함을 보이는 근거',
    source: 'KOSIS 「행정구역(시군구)별/1세별 주민등록인구」 (행정안전부)',
    how: '지역과 대상 연령(예: 6~11세)을 고르면 앱이 바로 조회한다. 나이 범위를 더한 값에는 합산식이 함께 남는다.',
    unit: '명'
  }),
  Object.freeze({
    key: 'basicWelfareChildren', group: '아동 인구', kind: 'request',
    label: '기초생활수급·차상위 아동 수',
    why: '「취약계층」 대상 사업임을 뒷받침하는 핵심 수치. 비율까지 적으면 설득력이 크게 오른다',
    source: '자치구 사회복지 담당 부서 / 복지로 복지통계 「기초생활보장 연령별 수급자수」',
    how: '자치구 사회복지과에 공문 또는 전화로 「관내 만 6~11세 기초생활수급·차상위 아동 수」를 요청한다. 공문이 가장 빠르고 근거로도 쓸 수 있다.',
    link: 'https://www.bokjiro.go.kr/ssis-tbu/twatga/sociGuaStat/SociGuaStatDetailIframe.do?datsNo=7&datsClNo=1012&datsClCrit=WS',
    unit: '명'
  }),
  Object.freeze({
    key: 'elementaryStudents', group: '아동 인구', kind: 'download',
    label: '관내 초등학생 수·학교 수',
    why: '학령기 아동 규모와 학교 접근성을 함께 보인다',
    source: '교육청 학생통계 / 학교알리미',
    how: '교육청 누리집의 학생 현황 자료 또는 학교알리미에서 관내 초등학교별 학생 수를 받아 합한다.',
    link: 'https://www.schoolinfo.go.kr',
    unit: '명'
  }),
  Object.freeze({
    key: 'centerCount', group: '지역아동센터', kind: 'download',
    label: '지역아동센터 개소 수',
    why: '사업을 함께할 기관이 지역에 얼마나 있는지, 연계 가능 범위가 얼마인지',
    source: '공공데이터포털 「지역아동센터 현황」 (자치구별 열 포함)',
    how: '파일을 내려받아 자치구 열로 걸러 센다. 시·도가 통합된 지역은 파일에 인접 지역이 함께 들어 있을 수 있으므로 반드시 자치구로 거른 뒤 센다.',
    link: 'https://www.data.go.kr/data/15043862/fileData.do',
    unit: '개소'
  }),
  Object.freeze({
    key: 'centerCapacity', group: '지역아동센터', kind: 'download',
    label: '지역아동센터 정원 합계',
    why: '이용 아동 수를 못 구할 때 대신 쓸 수 있는 값. 같은 파일에 들어 있다',
    source: '공공데이터포털 「지역아동센터 현황」의 정원 열',
    how: '위 파일의 정원 열을 자치구별로 합한다. 이용 아동 수와는 다른 값이므로 「정원 기준」이라고 밝혀 적는다.',
    link: 'https://www.data.go.kr/data/15043862/fileData.do',
    unit: '명'
  }),
  Object.freeze({
    key: 'centerUsers', group: '지역아동센터', kind: 'request',
    label: '지역아동센터 이용 아동 수',
    why: '연계 대상 아동의 실제 규모',
    source: '아동권리보장원 「전국 지역아동센터 통계조사보고서」 / 지역 지원단',
    how: '통계조사보고서의 시도·시군구별 표에서 해당 지역 행을 본다. 최신 값이 필요하면 지역 지원단에 문의한다.',
    link: 'https://www.ncrc.or.kr',
    unit: '명'
  }),
  Object.freeze({
    key: 'centerStaff', group: '지역아동센터', kind: 'request',
    label: '지역아동센터 종사자 수',
    why: '종사자 1인당 담당 아동을 계산해 「센터가 개별 지도까지 감당하기 어렵다」는 근거로 쓴다',
    source: '아동권리보장원 「전국 지역아동센터 통계조사보고서」',
    how: '같은 보고서의 종사자 현황 표를 본다. 이용 아동 수와 함께 있어야 1인당 담당 아동을 낼 수 있다.',
    link: 'https://www.ncrc.or.kr',
    unit: '명'
  }),
  Object.freeze({
    key: 'libraries', group: '교육·문화 자원', kind: 'download',
    label: '공공도서관 수·봉사 대상 인구',
    why: '지역의 독서·문해 기반이 얼마나 되는지. 협력 자원 후보이기도 하다',
    source: '도서관정보나루 / 문화체육관광부 「전국 문화기반시설 총람」',
    how: '지역별 도서관 현황 표에서 해당 지역 행을 본다.',
    link: 'https://www.data4library.kr',
    unit: '개소'
  }),
  Object.freeze({
    key: 'similarPrograms', group: '교육·문화 자원', kind: 'request',
    label: '관내 유사 사업 운영 건수',
    why: '중복 회피 근거이자 「빠진 고리를 채운다」는 논리의 바탕',
    source: '지자체·교육청·평생교육진흥원·도서관 사업 공고',
    how: '최근 2년 공고·결과 게시물을 직접 세어 성격별로 나눈다. 조사 방법과 기간을 계획서에 함께 적는다.',
    unit: '건'
  })
]);

// 지표 하나를 채우는 데 필요한 것을 한 문단으로. 화면과 문서가 같은 문장을 쓴다.
export function indicatorGuide(indicator) {
  if (!indicator) return '';
  return `${indicator.source} — ${indicator.how}`;
}

// 조사표. 지표별로 값·기준시점·출처를 담고, 빈 자리는 빈 자리로 남긴다.
export function emptySurvey(region = '') {
  return { region, values: {}, updatedAt: '' };
}

// 채운 값만 추린다. 계획서에 넣을 때는 이 결과만 쓴다.
export function filledIndicators(survey = {}) {
  return INDICATORS
    .map(indicator => ({ indicator, entry: (survey.values || {})[indicator.key] }))
    .filter(item => String(item.entry?.value ?? '').trim())
    .map(item => ({ ...item.indicator, value: String(item.entry.value).trim(), asOf: String(item.entry.asOf || '').trim(), note: String(item.entry.note || '').trim() }));
}

// 아직 비어 있는 자리. 무엇이 남았는지 세어 화면에 숫자로 알린다.
export function openIndicators(survey = {}) {
  const filled = new Set(filledIndicators(survey).map(item => item.key));
  return INDICATORS.filter(indicator => !filled.has(indicator.key));
}

// 1인당 담당 아동처럼 두 값이 모두 있어야 나오는 수치. 없으면 만들지 않는다.
export function derivedFigures(survey = {}) {
  const number = key => {
    const raw = String((survey.values || {})[key]?.value ?? '').replace(/[^\d.]/g, '');
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const users = number('centerUsers');
  const staff = number('centerStaff');
  const centers = number('centerCount');
  const rows = [];
  if (users && staff) rows.push({ label: '종사자 1인당 담당 아동', value: `${(users / staff).toFixed(1)}명`, basis: `이용 아동 ${users.toLocaleString('ko-KR')}명 ÷ 종사자 ${staff.toLocaleString('ko-KR')}명` });
  if (users && centers) rows.push({ label: '센터 1개소당 평균 이용 아동', value: `${(users / centers).toFixed(1)}명`, basis: `이용 아동 ${users.toLocaleString('ko-KR')}명 ÷ ${centers.toLocaleString('ko-KR')}개소` });
  const children = number('basicWelfareChildren');
  const population = number('childPopulation');
  if (children && population) rows.push({ label: '취약계층 아동 비율', value: `${((children / population) * 100).toFixed(1)}%`, basis: `수급·차상위 ${children.toLocaleString('ko-KR')}명 ÷ 아동 인구 ${population.toLocaleString('ko-KR')}명` });
  return rows;
}
