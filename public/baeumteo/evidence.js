// 근거자료 등록부 (10-25). 근거를 한곳에 등록하고, 본문의 인용과 작성자 안내서가 같은 등록부에서 나온다.
// status: 공공자료 인용(출처 확인) · 작성 예시(가상) · 확인 필요(아직 찾지 못함) · 넣지 않음
// 출처 있는 항목은 url과 기준연도가 반드시 있어야 한다(test/career-final.test.js).
export const EVIDENCE = [
  { id: 'youth-pop', type: '지역', status: '공공자료 인용', title: '광산구 청소년(9~24세) 인구 74,592명', value: 74592,
    source: '광주광역시 청소년 인구현황(구별)', url: 'https://www.gwangju.go.kr/mogef/contentsView.do?pageId=mogef22', year: '2025.12.31.', applies: '서식 3-4, 서식 3-5-3', note: '원문 표에서 한 번 더 대조한다' },
  { id: 'gs-pop', type: '지역', status: '공공자료 인용', title: '광산구 인구 405,394명(외국인 15,055명 포함), 172,127세대', value: 405394,
    source: '광산구청 기본현황', url: 'https://www.gwangsan.go.kr/contentsView.do?pageId=www485', year: '2025.2.28.', applies: '서식 3-4', note: '본문에는 쓰지 않았다(참고)' },
  { id: 'low-income', type: '지역', status: '확인 필요', title: '광산구 저소득·교육복지 지표(기초생활수급 아동·청소년 등)', applies: '서식 3-5-3', note: '광산구 통계연보 또는 광주시 복지 통계에서 찾는다' },
  { id: 'multicultural', type: '지역', status: '확인 필요', title: '광산구 다문화학생 수', source: '광주광역시교육청 다문화학생현황(공공데이터포털 15142913)', url: 'https://www.data.go.kr/data/15142913/fileData.do', applies: '서식 3-5-3', note: '파일(CSV)을 내려받아 광산구 줄을 직접 확인한다. 페이지에는 값이 없다' },
  { id: 'field', type: '현장', status: '작성 예시', title: '2026년 마음쉼터 참여 인원·소감, 참여 청소년 면담, 사전 검사', applies: '서식 3-5-4', note: '실제 기관 기록으로 교체' },
  { id: 'method-tool', type: '방법', status: '확인 필요', title: '쓸 진로 검사 도구의 공식 이름과 해석 방식', applies: '서식 3-7', note: '확정해 본문에 쓴다' },
  { id: 'academic', type: '학술', status: '넣지 않음', title: '자기이해·경험적 진로탐색을 설명하는 검증된 연구 1~2건', applies: '서식 3-6, 3-7', note: '원문을 확인한 것만 넣는다' }
];
export const cited = id => EVIDENCE.find(e => e.id === id);
export const evidenceLines = () => EVIDENCE.map(e => `- [${e.type}] ${e.title} — 상태: ${e.status}${e.year ? `, 기준 ${e.year}` : ''}${e.source ? `, 출처: ${e.source}` : ''}${e.url ? ` (${e.url})` : ''}; 적용: ${e.applies}${e.note ? `; ${e.note}` : ''}`);
