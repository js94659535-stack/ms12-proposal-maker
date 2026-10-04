// 근거자료 등록부 (10-25, 10-26에서 상태를 셋으로 나눔). 근거를 한곳에 등록하고, 본문의 인용과 작성자 안내서가 같은 등록부에서 나온다.
// kind(근거 유형): 공공통계 · 기관기록 · 현장조사 · 학술자료 · 작성예시
// verification(검증 상태): 원문 확인(사람이 원문 표·쪽을 직접 대조) · 2차 확인(도구가 읽은 요약, 원문 대조 전) · 확인 필요 · 사용 불가
// usage(사용 상태): 본문 사용 · 본문 임시 사용(원문 확인 전) · 안내서만 · 보류 · 제외
// 숫자가 있는 항목은 출처와 확인 정보를 모두 갖추어야 하고, 「원문 확인」이 아닌 값이 본문에 들어가면 「임시 사용」으로만 허용한다.
export const EVIDENCE = [
  { id: 'youth-pop', kind: '공공통계', verification: '2차 확인', usage: '본문 임시 사용', title: '광산구 청소년(9~24세) 인구 74,592명', value: 74592, unit: '명', target: '9~24세 합계(남 38,782·여 35,810)',
    publisher: '광주광역시', dataset: '청소년 인구현황(구별)', source: '광주광역시 청소년 인구현황(구별)', url: 'https://www.gwangju.go.kr/mogef/contentsView.do?pageId=mogef22', year: '2025.12.31.', table: '구별 표, 광산구 행, 합계 열',
    checkedOn: '2026-10-04', checkedBy: '웹 도구가 페이지를 읽은 요약(Claude)', method: '페이지를 도구로 읽음. 직접 내려받은 원문 없음', archive: '',
    insertedAs: '광주광역시 공개 자료에 따르면 광산구의 청소년(9~24세) 인구는 74,592명이다', applies: '서식 3-4, 서식 3-5-3', note: '제출 전 원문 표의 광산구 행·합계와 기준일을 직접 대조하고 「원문 확인」으로 올린다' },
  { id: 'gs-pop', kind: '공공통계', verification: '2차 확인', usage: '안내서만', title: '광산구 인구 405,394명(외국인 15,055명 포함), 172,127세대', value: 405394, unit: '명', target: '전체 주민',
    publisher: '광산구청', dataset: '기본현황', source: '광산구청 기본현황', url: 'https://www.gwangsan.go.kr/contentsView.do?pageId=www485', year: '2025.2.28.', table: '기본현황 본문',
    checkedOn: '2026-10-04', checkedBy: '웹 도구가 페이지를 읽은 요약(Claude)', method: '페이지를 도구로 읽음', archive: '',
    insertedAs: '', applies: '서식 3-4', note: '본문에는 쓰지 않았다(참고). 의미가 적다' },
  { id: 'low-income', kind: '공공통계', verification: '확인 필요', usage: '보류', title: '광산구 저소득·교육복지 지표(기초생활수급 아동·청소년 등)', applies: '서식 3-5-3', note: '광산구 통계연보 또는 광주시 복지 통계에서 찾는다. 대상 연령과 수급 종류를 함께 적는다' },
  { id: 'multicultural', kind: '공공통계', verification: '확인 필요', usage: '보류', title: '광산구 다문화학생 수', publisher: '광주광역시교육청', dataset: '다문화학생현황(공공데이터포털 15142913)', source: '광주광역시교육청 다문화학생현황', url: 'https://www.data.go.kr/data/15142913/fileData.do', applies: '서식 3-5-3',
    note: 'CSV를 내려받아 저장: 기준연도 · 지역 단위 · 학교급 · 학생 정의(국제결혼가정 자녀만인지 외국인가정 자녀까지인지) · 광산구 값 · 광주광역시 전체 값. 페이지에는 값이 없다' },
  { id: 'field', kind: '작성예시', verification: '확인 필요', usage: '본문 사용', title: '2026년 마음쉼터 참여 인원·소감, 참여 청소년 면담, 사전 검사', applies: '서식 3-5-4', note: '실제 기관 기록으로 교체(기관기록·현장조사)' },
  { id: 'method-tool', kind: '작성예시', verification: '확인 필요', usage: '보류', title: '쓸 진로 검사 도구의 공식 이름과 해석 방식', applies: '서식 3-7', note: '확정해 본문에 쓴다' },
  { id: 'academic', kind: '학술자료', verification: '확인 필요', usage: '제외', title: '자기이해·경험적 진로탐색을 설명하는 검증된 연구 1~2건', applies: '서식 3-6, 서식 3-7', note: '원문을 확인한 것만 넣는다' }
];
export const REQUIRED_FOR_VALUE = ['publisher', 'dataset', 'url', 'year', 'table', 'checkedOn', 'checkedBy', 'method', 'unit', 'target', 'insertedAs'];
export const cited = id => EVIDENCE.find(e => e.id === id);
export const evidenceLines = () => EVIDENCE.map(e => `- [${e.kind}] ${e.title} — 검증: ${e.verification} · 사용: ${e.usage}${e.year ? ` · 기준 ${e.year}` : ''}${e.dataset ? ` · 자료: ${e.publisher || ''} ${e.dataset}` : ''}${e.url ? ` (${e.url})` : ''}${e.checkedOn ? ` · 확인일 ${e.checkedOn}, ${e.method}` : ''} · 적용: ${e.applies}${e.note ? ` · 교체 메모: ${e.note}` : ''}`);

// 숫자가 없어도 심사에 영향을 주는 사실 주장(10-27). 상태: 증빙 확인 · 담당자 확인 · 확인 필요 · 작성 예시
export const CLAIMS = [
  { id: 'mou', text: '참여기관 두 곳과 2026년 10월 협력 합의서를 체결했다', applies: '서식 3-4-2', status: '작성 예시', proof: '합의서 사본', note: '실제 체결 여부와 날짜' },
  { id: 'interviewees', text: '직업인 12명(사업장 4곳)을 섭외했다', applies: '서식 3-4, 3-7', status: '작성 예시', proof: '섭외 확인서 또는 연락 기록', note: '실제 섭외 상태' },
  { id: 'school-hours', text: '참여 청소년 학교의 진로교육은 연 8~10시간에 그친다', applies: '서식 3-5-3', status: '작성 예시', proof: '학교 확인 또는 교육과정 자료', note: '학교별 실제 시수' },
  { id: 'seven-years', text: '학교폭력 특별교육을 7년간 운영했다', applies: '서식 1, 서식 3-5-4', status: '확인 필요', proof: '위탁 기간 확인서', note: '대표님 이력 메모와 위탁 서류 대조' },
  { id: 'hall', text: '참여기관 강당의 수용 인원이 40명이다(25평)', applies: '서식 3-8', status: '작성 예시', proof: '시설 확인과 사진', note: '실제 평수·수용 인원' },
  { id: 'followup-budget', text: '2028년 3월부터 자체 예산 연 1,200,000원을 편성한다', applies: '서식 3-9, 서식 5', status: '작성 예시', proof: '기관 예산 결의 또는 대표자 확인', note: '실제 편성 여부' },
  { id: 'people-real', text: '강사·보조강사·체험처(전문대학, 사업장)가 참여하기로 했다', applies: '서식 3-4, 서식 4', status: '작성 예시', proof: '참여 확인서, 이력서·동의서', note: '가상 이름 교체' },
  { id: 'org-facts', text: '대표기관·참여기관의 설립연도, 인력, 예산, 등록 청소년 수, 외부지원 3건', applies: '서식 1', status: '작성 예시', proof: '법인 서류, 결산서, 지원 확인서', note: '실제 값으로 교체' }
];
// 직접 붙이거나 받아야 하는 것
export const ATTACHMENTS = [
  { id: 'map', text: '지역 교육복지 자원지도 이미지(서식 3-4-1)', done: false },
  { id: 'photos', text: '교육 장소 전경 사진(서식 3-8)', done: false },
  { id: 'seal', text: '대표기관 직인 또는 대표자 서명(서식 1)', done: false },
  { id: 'consents', text: '담당 인력 개인정보 수집·이용 동의 서명 또는 날인(서식 4)', done: false }
];
