// 프로그램표와 산출식 예산 (10-07). 재단 공개 양식(서식 3 6-1·6-2, 서식 5)과 FAQ를 그대로 따른다.
//
// 양식에서 확인한 규정(2027 배움터 신청서 양식·작성방법 및 FAQ):
//  · 학생 1인 기준 연 35회 이상(프로젝트·봉사활동·성과발표회 포함). **자치회의는 횟수에 넣지 않는다.**
//    예외: 맞춤형 중 진로설계는 학생별 연 12회 이상, 4개월 이상 지속 참여.
//  · 강사비는 시간당 6만 원 이하. 보조강사는 더 낮은 단가. 한 사람이 강사와 실무자를 겸하면 둘 중 하나만.
//  · 학습재료비는 총액의 15~20% 안팎, 신규 사업은 30%까지. 체험(견학·캠프)은 총액의 15% 이하.
//  · 인건비+운영비는 총액의 25% 이하(지역공동체는 30% 이하). 강사비·보조강사비는 이 비율에서 제외.
//  · 지역공동체: 지역적으로 인접한 3개 이상 기관, 그중 학생이 등록된 배움터 2곳 이상, 같은 강사를 기관별로 파견하는 방식은 불가.
//  · 이주배경 잇다: 한국어를 모국어로 하지 않는 이주배경 학생, 청소년이 있으면 ITQ 과정 필수.
// 이 모듈은 plan.js를 부르지 않는다(순환을 피하려고). 인원과 사업 번호만 받는다.

export const RULES = {
  hourlyMax: 60_000, assistantHourly: 30_000, materialsShare: 0.30, outingShare: 0.15, adminShare: 0.25, adminShareCommunity: 0.30,
  minSessions: { default: 35, career: 12 }, minMonths: { career: 4 }
};

// groups: 'classes'면 인원을 15명 단위로 나눈 반 수, 숫자면 고정. assistant: 보조강사 투입 여부.
// matPer: 1인당 학습재료비(원). bus: 대여 버스 대수. fee: 입장권·대관·인쇄 등 진행비(원).
export const PROGRAMS = {
  humanities: [
    { name: '책과 토론 교실', stage: '1단계 탐구·학습', months: '3월~11월', sessions: 18, hours: 2, groups: 'classes', assistant: true, matPer: 25_000, place: '대표기관 활동실·참여 도서관 열람실',
      core: '월 1권 함께 읽고 질문을 만들어 토론한다. 읽은 내용을 자기 말과 근거로 설명하고 다른 의견과 비교하는 연습을 한다.',
      themes: ['오리엔테이션과 독서 진단', '내 독서 지도 그리기', '책① 함께 읽기', '책① 질문 만들기', '책① 찬반 토론', '책② 함께 읽기', '책② 역할 토론', '책② 근거 들어 주장하기', '책③ 함께 읽기', '책③ 비판적 글쓰기', '서로 다른 관점으로 바꿔 말하기', '책④ 함께 읽기', '책④ 토론', '사회 이슈 읽기(그림책·뉴스)', '토론 한마당 준비①', '토론 한마당 준비②', '독서 사후 진단', '돌아보기와 탐구 질문 정리'] },
    { name: '동네 탐구 현장 교실', stage: '1단계 탐구·학습', months: '5월~10월', sessions: 6, hours: 2.5, groups: 1, assistant: true, matPer: 8_000, bus: 3, fee: 300_000, place: '지역 도서관·시장·마을 역사 공간',
      core: '학생이 정한 마을 질문을 도서관 자료, 어르신 인터뷰, 현장 탐방으로 탐구한다.',
      themes: ['우리 마을 질문 정하기', '인터뷰 질문지 만들기', '도서관 탐방과 사서 인터뷰', '시장·마을 어르신 인터뷰', '동네 역사 공간 탐방', '인터뷰 정리와 탐구노트'] },
    { name: '마을 탐구신문 제작 동아리', stage: '2단계 프로젝트 기획·실행', months: '8월~12월', sessions: 8, hours: 2, groups: 1, assistant: false, matPer: 20_000, fee: 1_800_000, place: '대표기관 활동실',
      core: '학생이 취재 주제를 정하고 기사를 쓰고 편집해 「마을 탐구신문」을 만든다. 소그룹 3개가 각자 한 호를 맡는다.',
      themes: ['팀 구성과 주제 정하기', '취재 계획 세우기', '기사 쓰기①', '기사 쓰기②', '편집 회의', '편집·디자인①', '편집·디자인②', '시안 점검과 수정'] },
    { name: '봉사활동: 그림책 읽어 주기', stage: '3단계 성과 공유', months: '10월, 1월', sessions: 2, hours: 2, groups: 1, assistant: false, matPer: 5_000, fee: 100_000, place: '어린이집·지역 작은도서관',
      core: '배운 내용을 토대로 어린 아동에게 그림책을 읽어 주는 봉사활동을 2회 진행한다.',
      themes: ['어린이집 동생에게 책 읽어 주기', '지역 작은도서관 책 읽어 주기'] },
    { name: '마을 탐구 한마당(성과공유회)', stage: '3단계 성과 공유', months: '12월', sessions: 1, hours: 3, groups: 1, assistant: false, matPer: 0, fee: 800_000, place: '참여 도서관 강당',
      core: '탐구신문과 토론 결과를 보호자와 지역 주민 앞에서 학생이 직접 발표한다.',
      themes: ['마을 탐구 한마당'] }
  ],
  culture: [
    { name: 'AI 동화 기초: 이야기 구조와 AI 안전', stage: '1단계 탐구·학습', months: '3월~5월', sessions: 8, hours: 2, groups: 'classes', assistant: false, matPer: 10_000, place: '대표기관 및 참여기관 활동실',
      core: '이야기 구조(인물·사건·결말)를 배우고, AI에게 질문하는 법과 결과를 고르고 고치는 법, 저작권·창작 윤리와 개인정보 입력 금지 약속을 익힌다.',
      themes: ['오리엔테이션과 AI 안전 약속', '내 마음 이야기 모으기', '내 동네·내 꿈 인터뷰', '이야기 구조(인물·사건·결말)', '좋은 그림책 읽기', 'AI에게 질문하는 법', 'AI 결과를 고르고 고치는 법', '저작권과 창작 윤리'] },
    { name: 'AI와 함께 쓰는 이야기 교실', stage: '1단계 탐구·학습', months: '5월~8월', sessions: 10, hours: 2, groups: 'classes', assistant: true, matPer: 20_000, place: '대표기관 및 참여기관 활동실',
      core: '개인 이야기를 AI와 대화하며 쓰고 친구에게 읽어 주어 의견을 받고 고친다. 결과는 학생이 선택하고 책임진다.',
      themes: ['주인공 만들기', 'AI와 아이디어 나누기', '줄거리 짜기', '1장 쓰기', '1장 읽어 주고 의견 받기', '2장 쓰기', '2장 고치기', '3장 쓰기', '결말 쓰기', '첫 원고 서로 읽기'] },
    { name: '공동 그림책 제작 동아리', stage: '2단계 프로젝트 기획·실행', months: '8월~12월', sessions: 12, hours: 2, groups: 3, assistant: true, matPer: 40_000, fee: 2_100_000, place: '대표기관 활동실',
      core: '학생이 공동 주제를 정하고 글·그림·편집·낭독 역할을 나누어 팀별 그림책 한 권을 완성한다. 서로의 작품에 의견을 주고 수정한다.',
      themes: ['공동 주제 정하기', '역할 나누기(글·그림·편집·낭독)', '그림 생성 입문과 직접 그리기', '장면 그림 만들기①', '장면 그림 만들기②', '팀 원고 합치기', '서로의 작품에 의견 주기', '수정①', '수정②', '편집①', '편집②', '표지 완성'] },
    { name: '봉사활동: 동화 읽어 주기', stage: '3단계 성과 공유', months: '10월, 1월', sessions: 2, hours: 2, groups: 1, assistant: false, matPer: 5_000, fee: 100_000, place: '어린이집·지역 도서관',
      core: '완성한 동화를 어린 아동에게 읽어 주는 봉사활동을 2회 진행한다.',
      themes: ['어린 아동에게 동화 읽어 주기①', '어린 아동에게 동화 읽어 주기②'] },
    { name: '낭독회·전시 발표회', stage: '3단계 성과 공유', months: '12월~1월', sessions: 3, hours: 2.5, groups: 1, assistant: false, matPer: 0, fee: 1_800_000, place: '참여 도서관',
      core: '낭독 리허설, 출판기념 낭독회와 도서관 전시, 작품집 정리와 사후 평가를 한다.',
      themes: ['낭독 리허설', '출판기념 낭독회와 도서관 전시', '작품집 정리와 사후 평가'] }
  ],
  migrant: [
    { name: '나의 이야기·강점 찾기', stage: '1단계 탐구·학습', months: '3월~5월', sessions: 7, hours: 2, groups: 'classes', assistant: true, matPer: 15_000, place: '대표기관 활동실',
      core: '두 문화·두 언어의 경험을 자원으로 보고, 흥미·강점 검사를 해석해 자기 이야기를 정리한다. 다국어 안내를 쓴다.',
      themes: ['오리엔테이션(다국어 안내)', '정체성 지도 그리기', '두 문화, 나의 보물', '흥미·강점 검사', '검사 해석', '우리 가족 이야기', '나의 강점 발표'] },
    { name: '진로·진학 정보 교실', stage: '1단계 탐구·학습', months: '5월~9월', sessions: 8, hours: 2, groups: 'classes', assistant: true, matPer: 15_000, bus: 2, fee: 200_000, place: '대표기관 활동실·지역 학교·기관',
      core: '진로·진학 경로를 알아보고 직업인 인터뷰와 학과·일터 체험으로 진로 정보를 모으며, 한국 친구를 초대해 문화를 소개한다.',
      themes: ['직업 세계 입문', '진학 경로 알아보기', '직업인 인터뷰 준비', '직업인 인터뷰①', '직업인 인터뷰②', '학과·일터 체험', '한국 친구 초대·문화 소개', '진로 로드맵 초안'] },
    { name: 'ITQ 자격 교육(청소년반)', stage: '2단계 프로젝트 기획·실행', months: '6월~11월', sessions: 10, hours: 2, groups: 1, assistant: false, matPer: 25_000, fee: 600_000, place: '컴퓨터실(대표기관 또는 협력 기관)',
      core: '청소년은 ITQ 자격증 교육과정을 운영한다(재단 필수). 아동은 같은 시간에 한글·정보 활용 활동으로 대체한다. 응시료는 진행비에 둔다.',
      themes: ['컴퓨터 기초와 한글 문서', 'ITQ 한글①', 'ITQ 한글②', 'ITQ 한글③', 'ITQ 엑셀①', 'ITQ 엑셀②', 'ITQ 파워포인트①', 'ITQ 파워포인트②', '모의시험', '시험 대비와 응시'] },
    { name: '진로 포트폴리오·선후배 멘토링 동아리', stage: '2단계 프로젝트 기획·실행', months: '9월~12월', sessions: 6, hours: 2, groups: 1, assistant: true, matPer: 20_000, place: '대표기관 활동실',
      core: '학생 주도로 진로 포트폴리오를 만들고 선후배 멘토에게 의견을 받는다.',
      themes: ['팀 구성과 멘토 만남', '포트폴리오 구성', '포트폴리오 작성①', '포트폴리오 작성②', '멘토 피드백', '발표 연습'] },
    { name: '봉사활동: 지역 기관 연계', stage: '3단계 성과 공유', months: '10월, 1월', sessions: 2, hours: 2, groups: 1, assistant: false, matPer: 5_000, fee: 100_000, place: '지역 기관',
      core: '배운 내용을 토대로 지역 기관에서 봉사활동을 2회 진행한다.',
      themes: ['지역 기관 봉사①', '지역 기관 봉사②'] },
    { name: '포트폴리오 발표회', stage: '3단계 성과 공유', months: '12월~1월', sessions: 2, hours: 2.5, groups: 1, assistant: false, matPer: 0, fee: 800_000, place: '대표기관 강당·협력 기관',
      core: '발표 리허설과 보호자·지역 인사 앞 발표회를 한다.',
      themes: ['발표 리허설', '포트폴리오 발표회'] }
  ],
  career: [
    { name: '나를 알아가는 진로 교실', stage: '1단계 탐구·학습', months: '5월~6월', sessions: 4, hours: 2, groups: 'classes', assistant: false, matPer: 20_000, place: '대표기관 활동실',
      core: '흥미·적성 검사와 해석으로 강점을 찾고, 책임과 회복을 다루는 활동으로 자기 행동과 관계를 돌아본다. 서로의 이력은 묻지 않고 비밀을 지킨다.',
      themes: ['오리엔테이션과 약속(존중·비밀 보장)', '흥미·적성 검사', '검사 해석과 나의 강점', '책임과 회복: 나의 행동 돌아보기'] },
    { name: '진로 탐색 교실', stage: '1단계 탐구·학습', months: '6월~8월', sessions: 4, hours: 2, groups: 'classes', assistant: false, matPer: 20_000, place: '대표기관 활동실',
      core: '진로발달 검사와 직업 정보 읽기로 강점에 맞는 직업과 학과·진학 경로를 탐색한다.',
      themes: ['진로발달 검사', '직업 정보 읽기', '강점 기반 직업 탐색', '학과·진학 경로 탐색'] },
    { name: '꿈 인터뷰와 현장 탐방 프로젝트', stage: '2단계 프로젝트 기획·실행', months: '8월~10월', sessions: 6, hours: 3, groups: 1, assistant: true, matPer: 15_000, bus: 2, fee: 400_000, place: '지역 직업 현장·대학·특성화고',
      core: '청소년이 주제를 정해 직업인을 인터뷰하고 학과·일터를 체험하며 결과를 정리한다. 직업인·대학·기업·공공기관 등 지역 진로자원과 연계한다.',
      themes: ['프로젝트 주제와 팀 정하기', '직업인 인터뷰 준비', '직업인 인터뷰', '학과 체험', '일터 체험', '결과 정리'] },
    { name: '진로설계 포트폴리오 동아리', stage: '2단계 프로젝트 기획·실행', months: '9월~11월', sessions: 4, hours: 2, groups: 1, assistant: false, matPer: 25_000, place: '대표기관 활동실',
      core: '자기이해, 진로정보, 현장체험, 성찰과 실천 계획을 담은 학생별 진로설계 포트폴리오를 만든다.',
      themes: ['포트폴리오 구성', '포트폴리오 작성', '실천 계획 세우기', '멘토 피드백'] },
    { name: '진로설계 발표회', stage: '3단계 성과 공유', months: '11월', sessions: 2, hours: 2.5, groups: 1, assistant: false, matPer: 0, fee: 500_000, place: '대표기관 강당',
      core: '리허설과 개인별·그룹별 진로설계 발표회(개인 식별 정보 비공개)를 한다.',
      themes: ['발표 리허설', '진로설계 발표회와 사후 평가'] }
  ],
  community: [
    { name: '연합동아리: 우리 고장 문화탐방단', stage: '2단계 프로젝트 기획·실행', months: '3월~12월', sessions: 14, hours: 3, groups: 1, assistant: true, assistantCount: 3, matPer: 15_000, bus: 3, busTimes: 8, fee: 1_500_000, place: '생활권 안 문화유산·박물관·전통마을',
      core: '인접 기관의 학생이 한 팀으로 만나 탐방을 학생 주도로 기획하고 다녀온다. 사찰·교회 등은 건축·역사 유산으로서만 방문하고 의례 참여는 하지 않는다.',
      themes: ['연합동아리 첫 모임', '탐방 코스와 안전 약속', '탐방① 전통마을', '탐방② 박물관', '탐방③ 문화유산(건축·역사)', '탐방④ 지역 역사 공간', '탐방⑤ 마을 이야기 길', '탐방⑥ 사찰·교회 건축과 역사(의례 제외)', '탐방⑦ 전통시장', '탐방⑧ 예술·공예 공간', '중간 나눔', '탐방지도 점검', '다음 탐방 기획(학생 주도)', '탐방 마무리'] },
    { name: '기관별 사전·사후 학습 교실(공동 교육과정)', stage: '1단계 탐구·학습', months: '3월~11월', sessions: 10, hours: 2, groups: 'classes', assistant: false, matPer: 20_000, place: '각 참여 배움터 활동실',
      core: '세 기관이 같은 교재와 같은 주제로, 같은 시기에 탐방 전후 학습을 한다. 강사는 공동 교육과정 연수를 함께 받으며, 한 강사가 기관을 돌며 파견되는 방식이 아니다.',
      themes: ['우리 고장 이야기', '탐방 전 학습①', '탐방 전 학습②', '탐방 전 학습③', '탐방 후 정리①', '탐방 전 학습④', '탐방 후 정리②', '탐방 전 학습⑤', '탐방 후 정리③', '사후 정리와 평가'] },
    { name: '문화지도·탐방기록 팀 프로젝트', stage: '2단계 프로젝트 기획·실행', months: '6월~12월', sessions: 6, hours: 2, groups: 1, assistant: false, matPer: 30_000, fee: 1_500_000, place: '대표기관 활동실',
      core: '기관을 섞은 팀이 탐방 기록으로 「우리 고장 문화지도」와 탐방일지를 만든다.',
      themes: ['팀 구성과 주제', '기록 방법 익히기', '문화지도 만들기①', '문화지도 만들기②', '탐방일지 편집', '문화지도 완성'] },
    { name: '봉사활동: 마을 안내와 가꾸기', stage: '3단계 성과 공유', months: '10월, 1월', sessions: 2, hours: 3, groups: 1, assistant: false, matPer: 5_000, fee: 300_000, place: '지역 마을',
      core: '문화지도를 활용한 마을 안내와 마을 가꾸기 봉사활동을 2회 진행한다.',
      themes: ['마을 안내 봉사', '마을 가꾸기 봉사'] },
    { name: '공동 성과공유회', stage: '3단계 성과 공유', months: '9월, 12월, 1월', sessions: 3, hours: 3, groups: 1, assistant: false, matPer: 0, fee: 2_500_000, place: '참여 도서관·지역 공간',
      core: '중간 공유, 최종 성과공유회, 참여기관 평가를 통해 지역에 결과를 공개한다.',
      themes: ['중간 공유회', '최종 성과공유회', '참여기관 평가와 돌아보기'] }
  ]
};

export const classesOf = people => Math.ceil(people / 15);
const groupsOf = (program, people) => program.groups === 'classes' ? classesOf(people) : program.groups;

export function sessionTotal(id) { return PROGRAMS[id].reduce((sum, program) => sum + program.sessions, 0); }

const money = n => `${n.toLocaleString('ko-KR')}원`;

// 서식 5 예산서. 모든 줄이 「단가×수량」 산출식이다. 신청액은 이 합계이며, 한도와 비율 규정을 어기면 warnings에 적는다.
export function budgetFor(id, people, { cap = Infinity, practitionerMonths = 12, practitionerWage = 200_000 } = {}) {
  const rows = []; // { program, account, formula, amount }
  const add = (program, account, formula, amount) => rows.push({ program, account, formula, amount: Math.round(amount) });
  let instructorCount = 0;
  for (const program of PROGRAMS[id]) {
    const groups = groupsOf(program, people);
    const turns = program.sessions * groups;
    instructorCount += groups;
    add(program.name, '강사비', `주강사 ${money(RULES.hourlyMax)}×${program.hours}시간×${program.sessions}회×${groups}`, RULES.hourlyMax * program.hours * turns);
    if (program.assistant) {
      const assistants = program.assistantCount || groups;
      add(program.name, '보조강사비', `보조강사 ${money(RULES.assistantHourly)}×${program.hours}시간×${program.sessions}회×${assistants}`, RULES.assistantHourly * program.hours * program.sessions * assistants);
    }
    if (program.matPer) add(program.name, '학습재료비', `재료·교재 ${money(program.matPer)}×${people}명`, program.matPer * people);
    if (program.bus) add(program.name, '교통비', `버스 대여 ${money(300_000)}×${program.bus}대×${program.busTimes || program.sessions}회`, 300_000 * program.bus * (program.busTimes || program.sessions));
    add(program.name, '식비(간식)', `간식 ${money(2_000)}×${people}명×${program.sessions}회`, 2_000 * people * program.sessions);
    if (program.fee) add(program.name, '진행비', `입장·대관·인쇄·응시료 등 ${money(program.fee)}×1식`, program.fee);
  }
  add('운영', '운영비(식비)', `교강사 회의 식비 ${money(10_000)}×${instructorCount + 1}명×11회`, 10_000 * (instructorCount + 1) * 11);
  add('운영', '운영비(교통비)', `재단 교육 참여 교통비 ${money(30_000)}×2명×4회`, 30_000 * 2 * 4);
  add('인건비', '수당', `실무자 수당 ${money(practitionerWage)}×${practitionerMonths}개월`, practitionerWage * practitionerMonths);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const sum = test => rows.filter(row => test(row)).reduce((s, row) => s + row.amount, 0);
  const admin = sum(row => row.program === '운영' || row.program === '인건비');
  const materials = sum(row => row.account === '학습재료비');
  const outing = sum(row => row.account === '교통비' || row.account === '진행비');
  const warnings = [];
  if (total > cap) warnings.push(`산출액 ${money(total)}이 한도 ${money(cap)}를 넘는다. 인원이나 회차를 줄이거나 항목을 덜어 낸다.`);
  const adminCap = id === 'community' ? RULES.adminShareCommunity : RULES.adminShare;
  if (admin > total * adminCap) warnings.push(`인건비·운영비가 총액의 ${Math.round(admin / total * 100)}%로 한도 ${adminCap * 100}%를 넘는다.`);
  if (materials > total * RULES.materialsShare) warnings.push(`학습재료비가 총액의 ${Math.round(materials / total * 100)}%로 한도 30%를 넘는다.`);
  return { rows, total, admin, materials, outing, warnings, shares: { admin: admin / total, materials: materials / total } };
}
