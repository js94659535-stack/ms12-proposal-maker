// 제출용 상세본 (10-06 → 10-07에서 재단 양식 순서로 다시 짬).
// 재단 공개 신청서 양식의 서식 1~5 순서와 항목 이름을 그대로 따른다. 유형별 양식이 다르다:
//  · 미래형(인문·사회 탐구, 문화예술 창작)  · 맞춤형(이주배경 잇다, 진로설계)  · 연결형(지역공동체)
// 기관만 아는 값은 `[확인 필요]`로 둔다. 숫자는 programs.js의 프로그램표와 산출식에서 온다.
import { FUND, budgetPlan, capOf, leadName, minSessionsOf, optimalInput, people, slotName, unionSize, won } from './plan.js?v=1015';
import { PROGRAMS, RULES, classesOf, sessionTotal } from './programs.js?v=1015';

const FORM = { humanities: '미래형', culture: '미래형', migrant: '맞춤형', career: '맞춤형', community: '연결형' };
const GOALS = {
  humanities: [['읽은 것을 자기 생각과 근거로 설명하고 다른 의견과 견주어 고친다', '3월·12월 같은 기준의 토론·글쓰기 과제를 비교'], ['학생이 정한 마을 질문을 직접 조사해 신문으로 완성한다', '팀별 신문 1호 완성과 취재·수정 기록'], ['배운 것을 어린 동생과 지역에 나누는 경험을 한다', '봉사활동 2회 참여 기록과 성찰문']],
  culture: [['자신의 경험을 이야기로 표현하고 친구와 고쳐 완성한다', '개인 원고의 초안·수정본 비교'], ['공동 주제를 정하고 역할을 나누어 팀 그림책을 낸다', '팀별 그림책 1권과 역할 분담 기록'], ['AI를 창작의 도구로 안전하게 쓰는 태도를 갖춘다', 'AI 사용 약속 이행 점검표와 자기평가']],
  migrant: [['자신의 정체성과 강점을 말과 글로 설명한다', '강점 발표와 포트폴리오 첫 장 평가'], ['진로·진학 정보를 찾아 자기 로드맵을 만든다', '로드맵 초안과 최종본, 직업인 인터뷰 기록'], ['지역 기관·또래와 관계를 넓히고 청소년은 ITQ에 도전한다', '지역 연계 활동 기록과 ITQ 응시 결과']],
  career: [['자신의 강점·흥미와 지난 경험(관계 경험 포함)을 돌아보고 말한다', '검사 해석 면담과 성찰 기록'], ['관심 직업을 직접 조사하고 현장에서 확인한다', '직업인 인터뷰·체험 기록'], ['실천 가능한 진로 계획을 세우고 발표한다', '진로설계 포트폴리오와 발표 평가']],
  community: [['학생이 인접 기관 친구들과 함께 지역 문화를 기획·탐방·기록한다', '연합동아리 활동 기록과 문화지도'], ['세 기관이 공동 교육과정으로 운영하는 체계를 만든다', '공동 교재, 협의회 회의록'], ['지역 자원(도서관·문화유산·가족센터)을 학생 교육에 연결한다', '연계 기관 목록과 협약 현황']]
};
const EXPERIENCE = {
  humanities: '독서·토론 교육 경험은 마인드스토리의 2026년 전주고 진로독서 프로젝트(독서역량 진단), 2025년 여수 시립환경도서관 독해력지도사 양성 등으로 확인된다. 참여 예정 학생 개인의 유사 프로그램 참여 경험은 모집 후 확인한다.',
  culture: '참여 예정 학생 중 일부는 2026년 벧엘지역아동센터에서 마인드스토리와 함께한 「미래설계 AI진로동화 프로젝트」에 참여했다. {{expCulture}} 이번 사업은 그 경험 위에서 교육 기간을 늘리고, 개인 창작에서 공동 창작과 수정 과정, 지역 공유로 확장한다는 점을 쓴다. 다른 기관 지원 사업이었다면 재단의 지속 사업이 아니라 신규 사업으로 표시한다.',
  migrant: '이주배경 학생을 대상으로 한 진로 교육은 2020·2023년 북구다문화센터, 2025년 광산구·무안군가족센터, 2026년 영광 가족센터와 동성고 다문화 학습역량강화로 이어져 왔다. {{expMigrant}}',
  career: '학교폭력 특별교육을 7년째 운영해 왔다(2021년 광주서부교육지원청 위탁 등). 다만 참여 학생의 조치 이력은 사업 서류에 적지 않고 구분하지 않는다. {{entrust}}',
  community: '인접한 세 기관이 공동 교육과정으로 운영한 경험이 없다면 신규 사업으로 쓴다. {{expCommunity}}'
};

// "3월~11월" · "10월, 1월" · "12월~1월" → [3..11] · [10,1] · [12,1]
export function monthsOf(text) {
  const nums = [...String(text).matchAll(/(\d+)월/g)].map(m => Number(m[1]));
  if (/~/.test(text) && nums.length === 2) {
    const out = [nums[0]];
    while (out[out.length - 1] !== nums[1] && out.length < 13) out.push(out[out.length - 1] % 12 + 1);
    return out;
  }
  return nums;
}
// 회차 주제를 월에 순서대로 나눈다. 회차가 월보다 적으면 앞 달부터 하나씩 받는다.
export function monthlyThemes(program) {
  const months = monthsOf(program.months).slice(0, program.themes.length);
  const base = Math.floor(program.themes.length / months.length);
  let extra = program.themes.length % months.length;
  let at = 0;
  return months.map(month => {
    const take = base + (extra-- > 0 ? 1 : 0);
    const part = program.themes.slice(at, at + take);
    at += take;
    return [month, part];
  });
}

// 진로설계 기본 일정은 5월~11월(7개월). 선택한 조합의 운영 가능 기간이 더 짧으면(최소 4개월) 달을 비례해 줄인다.
export function careerWindow(input = {}) {
  const months = input.applied?.months;
  return months ? Math.max(4, Math.min(7, months)) : 7;
}
function compressMonths(text, window) {
  if (window >= 7) return text;
  const mapped = text.replace(/(\d+)월/g, (_, m) => `${5 + Math.round((Number(m) - 5) * (window - 1) / 6)}월`);
  return mapped.replace(/(\d+)월~\1월/g, '$1월');
}
export function programsOf(project, input = {}) {
  const window = project.id === 'career' ? careerWindow(input) : 7;
  return PROGRAMS[project.id].map(program => ({ ...program, months: project.id === 'career' ? compressMonths(program.months, window) : program.months }));
}

const groupsText = (program, count) => program.groups === 'classes' ? `전체 ${count}명을 ${classesOf(count)}개 반(반당 15명 이하)으로 운영` : program.groups === 1 ? `전체 ${count}명 함께` : `전체 ${count}명을 ${program.groups}개 소그룹으로 운영`;

function programSection(project, count, input = {}) {
  const programs = programsOf(project, input);
  const lines = ['1) 프로젝트 및 교육프로그램 운영 개요',
    `프로젝트 주제와 핵심 내용: ${project.title}. ${project.goal}.`,
    `프로젝트 성과 및 결과물: ${project.outputs.join(', ')}. 봉사활동${project.id === 'career' ? ' 없이 발표회로' : ' 2회와 성과공유회로'} 지역과 나눈다.`,
    `대상 학생: {{grade}} 전체 ${count}명.`,
    `연간 교육: 학생 1인 기준 ${sessionTotal(project.id)}회(재단 최소 ${minSessionsOf(project)}회). 프로젝트·봉사활동·성과발표회를 포함하고 자치회의는 포함하지 않는다.`,
    '단계 | 프로그램명 | 참여학생 | 운영 기간 | 핵심 활동 및 교육 규모 | 운영 회기/회당 시간'];
  for (const program of programs) lines.push(`${program.stage} | ${program.name} | ${groupsText(program, count)} | ${program.months} | ${program.core} | ${program.sessions}회/${program.hours}시간`);
  lines.push(`합계: 학생 1인 ${sessionTotal(project.id)}회`, ...quantities(project, count), '', '2) 프로젝트 및 교육프로그램별 핵심 교육내용 (월별)',
    '▦ 연번 | 프로그램명 | 월 | 핵심 교육내용 | 운영방식 | 교육 장소');
  programs.forEach((program, index) => {
    const way = `${groupsText(program, count)}${program.assistant ? ', 주강사+보조강사' : ', 주강사'}`;
    for (const [month, themes] of monthlyThemes(program)) lines.push(`▦ ${index + 1} | ${program.name} | ${month}월 | ${themes.join(' → ')} | ${way} | ${program.place}`);
  });
  return lines;
}

function recruit(project, input, count) {
  const slots = project.slots.map(slot => slotName(slot, input)).join(', ');
  return [
    '1) 모집 계획',
    '▦ 모집방법 | 내용',
    `▦ 기관 내 아동·청소년 대상 | 사업 참여 전체 ${count}명 중 (60)% {{ratio}}`,
    `▦ 지역 내 타 기관 협조(지역아동센터, 학교, 교육청 등) | 전체 중 (30)% · 협조 기관명: ${slots} · 협의 여부: {{consult}}`,
    '▦ 기타(공개모집 등) | 전체 중 (10)% · 배움터 소속이 아닌 지역 아동·청소년도 참여할 수 있다.',
    '2) 선발기준',
    '○ 교육적 지원이 우선 필요한 학생을 먼저 받는다: 저소득층(기초생활수급·차상위·중위소득 75% 내외), 농어촌(면 단위) 거주, 이주배경.',
    '○ 같은 순위에서는 참여 의지(본인 면담), 보호자 동의, 지속 참여 가능성(결석 대응에 동의)을 본다.',
    '○ 기관 내 학생도 같은 기준으로 선발하고, 정원이 넘으면 사회경제적 필요가 큰 학생을 먼저 받는다.',
    '3) 참여 예정 아동·청소년의 사회경제적 현황',
    '참여 학생 거주 지역: {{area}}',
    '사회경제적 배경: {{who}}',
    '※ 위 현황(읍면동, 보호자 직종, 거주 형태)은 교육적 필요를 설명하는 자료이며, 그것만으로 지원 대상 여부가 정해지지 않는다. 대상 해당 여부는 선발 때 기초생활수급·차상위 확인, 중위소득 75% 내외 확인, 면 단위 거주지 확인, 이주배경(모국어) 확인으로 따로 밝힌다.',
    ...(project.id === 'career' ? ['※ 학교폭력 특별교육 7년 운영은 사업 수행 역량의 근거이며 이번 참여 청소년의 대상 적합성을 대신하지 않는다. 대상 적합성은 위 확인 방법과 모집 경로(교육지원청·학교·기관 의뢰, 공개 모집)로 보인다. 조치 이력은 서류에 적지 않는다.'] : []),
    '4) 참여 예정 아동·청소년의 유사 프로그램 참여 경험(신규 사업)',
    EXPERIENCE[project.id]
  ];
}

function foundation(project) {
  const joint = project.id === 'community';
  return [
    '구분 | 연간 진행 횟수 | 핵심 논의 사항',
    `아동·청소년 자치회의 | 11회(월 1회, 교육 횟수에 포함하지 않음) | 다음 달 활동 정하기, ${project.id === 'career' ? '진로 포트폴리오 점검' : '봉사활동 대상·방법'}, 성과공유회 기획, 규칙 점검${joint ? ', 탐방 코스 선정' : ''}`,
    '보호자와의 소통(보호자 모임·교육 등) | 3회 | 시작 설명회, 중간 소식 나눔과 가정 연계 안내, 성과공유회',
    '교강사 전체 회의 | 11회(월 1회) | 회차 일지 공유, 다음 달 수업 조정, 학생 상황 공유, 안전 점검',
    `기타(${joint ? '참여기관 협의회·강사 공동 연수' : '교강사 학습동아리·협력기관 협의'}) | ${joint ? '협의회 분기 1회 이상 + 강사 공동 연수 연 2회' : '분기 1회'} | ${joint ? '공동 교육과정 점검, 기관 간 학생 교류 조정, 사각지대 학생 발굴' : '협력기관 역할 점검과 연계 자원 확인'}`,
    '출석과 결석 대응: 2회 연속 결석하면 담당자가 보호자와 연락해 사유를 확인하고 보충 참여나 개별 안내를 제공한다. 사업 시작 후 3개월 안에 빠진 자리는 대기자로 채운다.'
  ];
}

function personnel(project, input, count) {
  const main = program => (program.groups === 'classes' ? classesOf(count) : 1);
  return [
    '<서식 4> 담당 인력 정보',
    '▦ 연번 | 성명·소속·연령(만) | 담당 역할 | 교육복지 관련 경력 및 자격 현황 | 개인정보 처리 동의 서명 혹은 날인',
    `▦ 1 | {{leaderName}} (${leadName(input)}, 만 {{leaderAge}}세) | 대표자 | {{leaderCareer}} | (서명 또는 날인)`,
    '▦ 2 | {{practitioner}} | 실무책임자(강사를 겸하면 강사비와 인건비 중 하나만 책정) | {{practCareer}} | (서명 또는 날인)',
    `▦ 3 | 강사(확정되면 성명) | 주강사 ${Math.max(...PROGRAMS[project.id].map(main))}명 이상 | 확정되면 이력서를 첨부 | (서명 또는 날인)`,
    '강사가 확정되면 이력서와 개인정보 수집·이용 동의서를 쓰고, 미정이면 아래 강사 모집 계획을 쓴다.',
    '강사 모집 계획:',
    '▦ 연번 | 담당 프로그램 | 모집 인원(명) | 모집 방법 | 선발 기준',
    ...PROGRAMS[project.id].map((program, i) => `▦ ${i + 1} | ${program.name} | 주강사 ${main(program)}명${program.assistant ? ' + 보조강사' : ''} | 기관 추천과 공개 모집 | 해당 분야 전문성, 아동·청소년 교육 경험, 아동학대·성범죄 경력 조회 동의`),
    '강사 채용은 투명한 절차로 하고, 대표자·실무자와 특수관계(가족 등)인 사람은 채용하지 않는다.'
  ];
}

export function budgetTable(project, input, count) {
  const budget = budgetPlan(project, input);
  const lines = ['<서식 5> 예산서 (단위: 원, 재단 지원금 신청액만)', '구분 | 프로그램명 | 계정과목 | 산출 근거 | 예산'];
  for (const row of budget.rows) lines.push(`${row.program === '운영' ? '운영비' : row.program === '인건비' ? '인건비' : '직접사업비'} | ${row.program} | ${row.account} | ${row.formula} | ${row.amount.toLocaleString('ko-KR')}`);
  lines.push(`총계 ${budget.total.toLocaleString('ko-KR')}원 (재단 한도 ${capOf(project, input).toLocaleString('ko-KR')}원 이하)`);
  const adminCap = project.id === 'community' ? RULES.adminShareCommunity : RULES.adminShare;
  lines.push(`비율 확인: 인건비+운영비 ${Math.round(budget.shares.admin * 1000) / 10}%(한도 ${adminCap * 100}%), 학습재료비 ${Math.round(budget.shares.materials * 1000) / 10}%(신규 사업 한도 30%), 체험·견학성 지출 ${Math.round(budget.outing / budget.total * 1000) / 10}%(한도 15%)`);
  lines.push('강사비 기준: 시간당 6만 원 이하, 보조강사는 더 낮은 단가(여기서는 3만 원). 강사 1인 1일 30만 원을 넘기지 않는다.');
  if (budget.warnings.length) lines.push(...budget.warnings.map(text => `주의: ${text}`));
  lines.push('기관 자체 투입 자원(인력·교구·연계 자원·자부담): {{selfResources}}');
  return lines;
}


// ---------- 사실 질문 · 가상 값 · 점검 (10-13) ----------
// 템플릿 속 빈칸은 `{{열쇠}}` 토큰이다. 사용자가 답을 넣으면 그 답으로, 가상 모드면 〔가상〕 표시를 붙인 예시로,
// 아니면 `[확인 필요: …]`로 바뀐다. 질문 목록은 문서에 실제로 들어 있는 토큰에서 뽑으므로 문서와 어긋나지 않는다.
export const FACTS = {
  area: ['거주 지역(읍면동)', '참여 학생이 주로 사는 시·구·읍면동은 어디입니까?'],
  who: ['사회경제적 배경', '그 지역의 특징, 보호자 직종, 거주 형태, 경제 상황, 지역의 교육 문제를 아는 대로 적어 주세요. (가장 먼저 채울 칸)'],
  grade: ['학년·연령대', '참여 학생의 학년이나 연령대와 반 구성은 어떻게 됩니까?'],
  ratio: ['모집 비율', '기관 내·타 기관 협조·공개 모집이 각각 몇 %입니까? (위 60/30/10은 계획 값)'],
  consult: ['협조 기관과의 협의 여부', '협조 기관과 이미 협의했습니까? (예/아니오와 상황)'],
  map: ['지역 교육자원 지도', '자원지도로 낼 자료가 준비됐습니까? (파일 이름 등)'],
  compare: ['현재 상황(3년 후 변화의 비교 기준)', '지금 기관 간 협력은 어느 정도입니까? (공동 활동 횟수 등)'],
  expCulture: ['2026년 벧엘 활동 내용', '벧엘지역아동센터 2026년 활동의 참여 학생 수, 기간·횟수, 남은 아쉬움은?'],
  expMigrant: ['학생의 유사 프로그램 경험', '참여 예정 학생이 이전에 비슷한 프로그램에 참여한 경험이 있습니까?'],
  expCommunity: ['기관별 기존 협력 경험', '참여 기관끼리 지금까지 함께한 활동이 있습니까?'],
  entrust: ['학교폭력 특별교육 위탁 증빙', '위탁 기간과 교육지원청 확인서가 있습니까? (기관명·기간)'],
  leaderName: ['대표자 성명', '대표자 성명은?'],
  leaderAge: ['대표자 만 나이', '대표자의 만 나이는?'],
  leaderRole: ['대표자의 기관 내 역할', '기관 안에서 어떤 역할입니까? (대표자, 센터장 등)'],
  leaderCareer: ['대표자 교육복지 경력·자격', '교육복지 관련 경력과 자격 현황은?'],
  practitioner: ['실무책임자 성명·나이', '실무책임자 성명과 만 나이는?'],
  practCareer: ['실무책임자 경력·자격', '실무책임자의 교육복지 관련 경력과 자격은?'],
  leaderBio: ['대표자 자기소개', '대표자의 교육복지 경력(재단 사업 경력 포함)과 교육철학을 직접 적어 주세요.'],
  founded: ['설립연도', '기관 설립연도는?'],
  staffing: ['상근·비상근 인력', '상근 인력과 비상근 인력(사회복무요원 등)은 각각 몇 명입니까?'],
  budget2026: ['2026년 기관 전체 예산', '2026년 기관 전체 예산(원)은?'],
  tuition: ['학생 1인당 월 이용료', '학생 1인당 월 이용료(원)는? (없으면 0원)'],
  enrolled: ['등록 아동·청소년 수(학년별)', '초등·중등·고등·기타 학년별 등록 학생 수와 합계는?'],
  socio: ['등록 학생 사회경제적 현황', '법정저소득·한부모·조손·맞벌이·장애·시설거주·국제결혼가정·외국인가정 학생 수는? (중복 응답)'],
  operator: ['운영법인·단체와 운영주체 성격', '운영법인 또는 단체명, 대표자명, 운영주체 성격(사회복지법인·사단법인·협동조합 등)은?'],
  schedule2026: ['2026년 핵심 교육과정 운영 현황', '지금 기관에서 진행하는 교육과정의 주간 일정은? (별도 일정표를 첨부해도 됩니다)'],
  external: ['외부지원 현황(2024~2026)', '최근 3년 외부지원 기관, 기간, 내용, 금액은? (강사·자원봉사자 파견 포함)'],
  accountability: ['책무성 점검 답변', '최근 5년 내 회계부정·불법행위나 성폭력·학대 관련 처분 이력이 있습니까?'],
  placeInfo: ['교육 장소 정보', '교육 장소의 위치, 크기(평수), 수용 인원은?'],
  selfResources: ['기관 자체 투입 자원', '사회복무요원 투입, 보유 교구, 무료로 쓸 공간, 자부담이 있습니까?']
};

// 가상 예시 값. 사업마다 다른 것(area·who·grade)과 공통을 나눠 둔다. 사실이 아니다.
const VIRTUAL = {
  humanities: { area: '광주광역시 광산구 ○○동·○○동(가칭)', who: '참여 예정 학생의 약 70%가 기초생활수급·차상위·한부모 가정이다. 보호자는 비정규직·일용직 종사 비율이 높고, 거주 형태는 임대아파트와 다가구 주택이 많다. 인근에 학교 밖에서 책을 함께 읽고 토론하는 프로그램과 공간이 부족해, 방과 후 시간이 혼자 보내는 시간이 된다.', grade: '초등 4~6학년 15명, 중학교 1~2학년 15명' },
  culture: { area: '광주광역시 광산구·북구 ○○동(가칭)', who: '참여 예정 학생의 약 65%가 저소득·한부모·조손 가정이고, 보호자는 야간·교대 근무 비율이 높다. 학생들은 자기 이야기를 끝까지 글과 그림으로 완성해 본 경험이 적고, 방과 후에 창작 활동을 지도받을 곳이 없다.', grade: '초등 3~6학년 45명(15명씩 3개 반)' },
  migrant: { area: '광주광역시 광산구·북구 ○○동(가칭)', who: '참여 예정 학생은 한국어를 모국어로 하지 않는 이주배경 학생이다. 보호자는 제조업·서비스업 종사가 많고 한국어 정보 접근이 어려워 진학·진로 정보를 얻기 힘들다. 거주 형태는 월세 다세대 주택이 많고, 지역에 이주배경 청소년을 위한 진로 프로그램이 거의 없다.', grade: '초등 5~6학년 15명, 중학생 15명, 고등학생 15명(청소년반 ITQ 대상)' },
  career: { area: '광주광역시 광산구·서구 ○○동(가칭)', who: '참여 예정 청소년은 저소득 가정이거나 학교·또래 관계에서 어려움을 겪은 청소년이 함께 있다. 보호자는 비정규직이 많고 청소년과 진로를 의논할 시간이 적다. 지역에 진로 검사·상담과 현장 체험을 연결해 주는 곳이 부족하다. 학생의 조치 이력은 구분하지 않는다.', grade: '중학교 2학년~고등학교 2학년' },
  community: { area: '광주광역시 광산구 ○○동·○○동·○○동(가칭, 한 생활권)', who: '세 기관 학생의 약 65%가 저소득·한부모 가정이다. 학생들은 지역의 문화유산과 역사 공간을 직접 가 본 경험이 적고, 기관이 서로 가까이 있어도 학생 간 교류 기회가 없다. 문화 체험이 가정 형편에 따라 갈린다.', grade: '초등 4학년~중학교 2학년' }
};
const VIRTUAL_COMMON = {
  ratio: '계획 값', consult: '협의 중', map: '지도 첨부 예정',
  compare: '현재는 기관별로 따로 체험을 가는 상태(공동 교류 연 0회)',
  expCulture: '2026년 하반기 12회기 참여, 기간이 짧아 작품을 끝까지 다듬고 나누지 못한 점이 아쉬움으로 남음',
  expMigrant: '일부 학생이 가족센터 진로 프로그램에 짧게 참여한 경험이 있음',
  expCommunity: '세 기관은 연 1~2회 행사 때 협력한 경험이 있으나 공동 교육과정 운영은 처음임',
  entrust: '위탁 증빙은 별도 제출', leaderName: '○○○(가명)', leaderAge: '4○', leaderRole: '대표자', leaderCareer: '지역아동센터 센터장 7년, 사회복지사 1급',
  practitioner: '○○○(가명), 만 3○세', practCareer: '사회복지사 1급, 지역아동센터 근무 5년',
  leaderBio: '지역아동센터 센터장으로 7년 일했고 지역 아동·청소년 단체와 도서관 단체에서 활동했다. 아이들이 스스로 질문하고 결과물을 만들어 나누는 경험이 교육복지의 핵심이라는 철학으로 사업을 이끈다.',
  founded: '2015년', staffing: '상근 3명 · 비상근 2명(사회복무요원 1명 포함)', budget2026: '180,000,000원', tuition: '0원(이용료 없음)',
  enrolled: '초등학생 38명 · 중학생 12명 · 고등학생 5명 · 합계 55명',
  socio: '법정저소득 22명 · 한부모 14명 · 조손 5명 · 맞벌이 20명 · 장애 2명 (중복 응답)',
  operator: '② 사단법인 (법인명·대표자명은 서식에 기재)', schedule2026: '평일 13:00~19:00 방과 후 돌봄·학습·특기 활동, 토요일 문화체험(주간 일정표 별도 첨부)',
  external: '2024~2026 지역 재단 지원 1건(가상)',
  accountability: '해당 이력 없음', placeInfo: '○○동 소재, 약 12평, 최대 20명',
  selfResources: '사회복무요원 1인 보조 투입, 기존 도서·교구 보유, 협력 도서관 강당 무료 사용'
};
const VIRTUAL_BANNER = '※ 경고: 〔가상〕 표시는 예시로 지어낸 값이며 사실이 아니다. 제출 전에 모두 실제 값으로 바꾸거나 지워야 한다.';

const TOKEN = /\{\{(\w+)\}\}/g;
export function factKeys(project) {
  return [...new Set([...detailedPlanRaw(project, {}).matchAll(TOKEN)].map(match => match[1]))];
}
// 질문 목록: 문서에 들어 있는 토큰 순서대로, 답이 있는지와 함께.
export function factList(project, input = {}) {
  return factKeys(project).map(key => {
    const answer = String(input.facts?.[key] || '').trim();
    return { key, label: FACTS[key][0], ask: FACTS[key][1], answer, answered: Boolean(answer) };
  });
}
export function resolveFacts(text, project, input = {}) {
  let usedVirtual = false;
  const out = text.replace(TOKEN, (_, key) => {
    const answer = String(input.facts?.[key] || '').trim();
    if (answer) return answer;
    if (input.virtual) { usedVirtual = true; return `〔가상〕${VIRTUAL[project.id][key] ?? VIRTUAL_COMMON[key]}`; }
    return `[확인 필요: ${FACTS[key][0]}]`;
  });
  return usedVirtual ? out.replace(/^(.*?\n)/, `$1${VIRTUAL_BANNER}\n`) : out;
}

// 제출 전 점검. 오류는 제출할 수 없는 것, 확인은 사람이 채울 것, 안내는 알아 둘 것.
export function reviewPlan(project, input = {}) {
  const count = people(project, input);
  const budget = budgetPlan(project, input);
  const text = detailedPlan(project, input);
  const items = [];
  const add = (level, message) => items.push({ level, message });
  if (count < FUND.minPeople) add('오류', `참여 인원이 ${count}명이다. 사업 전체 ${FUND.minPeople}명 이상이어야 한다.`);
  if (sessionTotal(project.id) < minSessionsOf(project)) add('오류', `학생 1인 교육이 ${sessionTotal(project.id)}회로 재단 최소 ${minSessionsOf(project)}회에 못 미친다.`);
  for (const warning of budget.warnings) add('오류', warning);
  if (/〔가상〕/.test(text)) add('오류', '가상 값(〔가상〕)이 남아 있다. 제출 전에 실제 값으로 바꾸거나 지워야 한다.');
  const open = factList(project, input).filter(item => !item.answered);
  if (open.length && !input.virtual) add('확인', `미확인 사실 ${open.length}건: ${open.map(item => item.label).join(', ')}`);
  if (!String(input.lead || '').trim()) add('확인', '대표기관이 정해지지 않았다. 대표기관은 비영리 기관(단체)이어야 한다.');
  const unnamed = project.slots.filter(slot => !String(input.partners?.[slot.key] || '').trim());
  if (unnamed.length) add('확인', `이름이 정해지지 않은 협력 자리 ${unnamed.length}곳: ${unnamed.map(slot => slot.role).join(', ')}`);
  if (project.id === 'community' && unionSize(project, input) < 3) add('오류', `지역공동체는 인접한 3개 이상 기관이 필요하다. 지금 이름이 정해진 곳은 ${unionSize(project, input)}곳이다.`);
  if (project.id === 'migrant' && capOf(project, input) === project.cap) add('안내', '기본 규모(5천만 원 이하)로 진행할 수 있다. 5개 이상 기관이 연합해야 하는 것은 1억 5천만 원까지 키울 때뿐이다.');
  if (project.id === 'career') add('안내', '7년 운영은 수행 역량의 근거이고 대상 적합성을 대신하지 않는다. 모집 경로와 소득·수급 확인 방법이 필요하다.');
  add('안내', '한 기관은 한 사업만 신청할 수 있고, 대표·참여 어느 쪽이든 다른 사업에 들어갈 수 없다.');
  return items;
}

// 인원에 따라 달라지는 수량. 학생 수가 바뀌면 산출물 수와 성과 목표가 함께 바뀐다.
export function quantities(project, count) {
  const attend = Math.ceil(count * 0.85);
  const outputs = {
    humanities: [`탐구노트 ${count}권`, `팀별 마을 탐구신문 ${Math.ceil(count / 10)}호(팀당 100부)`],
    culture: [`개인 원고 ${count}편`, `팀별 그림책 ${Math.ceil(count / 5)}권(팀당 ${count}부 인쇄)`, '작품집 합본 100부'],
    migrant: [`진로 로드맵·포트폴리오 ${count}부`, 'ITQ 응시: 청소년반'],
    career: [`진로설계 포트폴리오 ${count}부`, `개인 실천 계획서 ${count}부`],
    community: [`탐방일지 ${count}권`, `우리 고장 문화지도 ${Math.max(1, Math.ceil(count / 30))}종(기관 섞은 팀별)`]
  }[project.id];
  return [
    `산출물 수량(인원에 따라 자동 계산): ${outputs.join(', ')}`,
    `성과 목표: 연 ${Math.ceil(sessionTotal(project.id) * 0.8)}회 이상 출석하는 학생 ${attend}명 이상(참여 ${count}명의 85%), 반 수 ${classesOf(count)}개`
  ];
}

function detailedPlanRaw(project, input = {}) {
  const lead = leadName(input);
  const count = people(project, input);
  const form = FORM[project.id];
  const places = ['▦ 교육 장소 | 위치·크기·수용 인원 | 전경 사진(인물이 식별되지 않게)', ...[...new Set(PROGRAMS[project.id].map(p => p.place))].map(place => `▦ ${place} | {{placeInfo}} | [사진 붙임]`)];
  const goals = GOALS[project.id].map(([goal, how], i) => `${i + 1}) ${goal} (확인 방법: ${how})`);
  const out = [];
  const push = (...lines) => out.push(...lines);
  push(`${FUND.name} — ${form} 지원사업 신청서(제출용 상세본)`,
    '※ 재단 공개 양식(서식 1~5)의 순서와 항목 이름을 따랐다. 신청서는 한글 파일에 옮겨 쓰고 PDF로 변환해 제출한다.', '',
    '<서식 1> 대표기관 및 참여기관 소개',
    '1. 대표기관 및 참여기관 명단',
    `제출하는 모든 신청서류의 내용이 사실임을 확인하며, 귀 재단의 「2027년 배움터 교육지원사업」에 대한 안내 및 유의사항을 인지하였으며, 이에 동의합니다. 또한 신청서 내용이 허위로 밝혀질 경우, 선정이 확정된 사업이라도 취소될 수 있음을 확인합니다.`,
    '2026년    월    일',
    '▦ 구분 | 기관명 | 대표자명 | 기관 직인 혹은 대표자 서명',
    `▦ 대표기관 | ${lead} | {{leaderName}} | (직인 또는 서명)`,
    ...project.slots.map(slot => `▦ 참여기관 | ${slotName(slot, input)}${input.applied && String(input.partners?.[slot.key] || '').trim() ? '' : ` (${slot.role})`} | (대표자명 기재) | `),
    ...(input.applied ? ['기관별 역할(실제 기관 정보 기준):', ...input.applied.roles.map(line => `- ${line}`), ...(input.applied.extra || []).map(name => `- 추가 참여기관: ${name}`)] : []),
    '(재)삼성꿈장학재단 이사장 귀중',
    '2. 대표기관 및 참여기관 운영 현황 — 대표기관',
    '▦ 항목 | 작성 내용',
    `▦ 대표기관명 | ${lead}`,
    '▦ 설립연도 | {{founded}}',
    '▦ 상근·비상근 인력 수 | {{staffing}}',
    '▦ 2026년 기관 전체 예산 | {{budget2026}}',
    '▦ 학생 1인당 월 이용료 | {{tuition}}',
    '▦ 기관 전체 등록 아동·청소년 수(학년별) | {{enrolled}}',
    '▦ 사회경제적 현황(중복 응답) | {{socio}}',
    '▦ 운영법인 또는 단체 · 운영주체 성격 | {{operator}}',
    '▦ 2026년 핵심 교육과정 운영 현황(주간 일정) | {{schedule2026}}',
    '▦ 외부지원 현황(2024~2026) | {{external}}',
    '참여기관은 참여기관마다 같은 표를 작성한다(대표기관 외 참여기관이 함께 신청하는 경우에만).',
    '3. 대표자(혹은 실무책임자) 자기소개서 — 교육복지 분야 경력(재단 사업 참여 경력 포함)과 교육철학 중심. 기관 소개가 아니라 본인 소개를 쓴다.',
    '▦ 작성자 명 | 기관 내 역할(예: 대표자, 센터장, 생활복지사)',
    '▦ {{leaderName}} | {{leaderRole}}',
    '{{leaderBio}}', '',
    '<서식 2> 배움터 책무성 점검표',
    '대표기관의 점검표만 제출한다.',
    '▦ 문항 | 응답(해당없음 / 해당있음)',
    '▦ 1. 최근 5년 이내(신청일 기준) 사회복지사업법 제40조 제1항 제4호의 회계부정·불법행위·부당행위, 또는 같은 항 제9호의 성폭력범죄·학대 관련 범죄로 정부·지방자치단체 등으로부터 처분을 받은 사실 | {{accountability}}',
    '▦ 2. 1번이 「해당있음」인 경우: 발생 시기/기간 · 사건 종류(회계부정, 인권침해 등) · 진행 상황(조사/수사/재판, 처분 확정 여부) | (해당없음이면 미기재)',
    '▦ 3. 2번과 관련한 기관의 의견(특정 개인이 식별되는 이름·직위는 쓰지 않는다) | (필요 시 기재)',
    '',     '<서식 3> 교육지원사업 계획서');

  if (form === '연결형') {
    push(`1. 사업명: ${project.title}`,
      '2. 사업의 필요성',
      '1) 지역 아동·청소년의 현황 및 교육복지 과제',
      '참여 학생 거주 지역: {{area}}',
      '사회경제적 배경: {{who}}',
      '※ 위 현황은 교육적 필요를 설명하는 자료이며, 그것만으로 지원 대상 여부가 정해지지 않는다. 대상 해당 여부는 선발 때 수급·차상위·소득 기준, 면 단위 거주지, 이주배경 확인으로 따로 밝힌다.',
      `교육복지 과제: ${project.need}`,
      '협력사업의 필요성: 한 기관이 혼자 하기 어려운 문화 체험과 학생 교류를 인접한 기관이 공동 교육과정으로 풀어야 하는 이유를 쓴다. 기관별 강사 파견이 아니라 공동 기획·공동 운영임을 분명히 한다.',
      '2) 지역 교육자원 현황',
      `① 지역 교육복지 자원지도: 대표기관 ${lead}와 참여기관, 학생이 다니는 학교·복지기관·공공시설·문화유산의 위치를 지도에 표시해 첨부한다. {{map}}`,
      '② 기관 간 협력·연계 내용:', ...project.slots.map(slot => input.applied && String(input.partners?.[slot.key] || '').trim() ? `- ${slotName(slot, input)}: 역할은 서식 1의 「기관별 역할」 참조` : `- ${slotName(slot, input)}: ${slot.ask}`),
      `연합 기관 현황: 현재 이름이 정해진 곳은 ${unionSize(project, input)}곳이다. 지역적으로 인접한 3개 이상 기관이어야 하고 그중 학생이 등록된 배움터가 2곳 이상이어야 한다.`,
      '3) 3년 후 기대하는 변화·성과',
      '아동·청소년: 1년 차에 지역 문화를 기획·탐방·기록하는 경험을 하고, 3년 차에는 이 연합동아리가 학생 자치로 이어져 후배에게 탐방을 안내한다.',
      '지역의 교육환경: 지금은 기관마다 따로 가는 체험을, 3년 후에는 공동 교육과정과 공동 교재, 매년 갱신되는 「우리 고장 문화지도」로 정착시킨다.',
      '기관 간 협력체계: 1년 차 협의회 구축, 2년 차 기관별 역할의 정례화, 3년 차 지역 교육자원이 연합 체계에 상시 참여하는 것을 목표로 한다. {{compare}}',
      '3. 교육 기간: 2027년 3월부터 2028년 1월까지(교육), 2028년 2월 결과보고·정산',
      '4. 참여 예정 아동·청소년', ...recruit(project, input, count).slice(0, 8),
      '5. 교육목표 【신규 사업】', ...goals,
      '6. 교육프로그램 및 프로젝트 내용', ...programSection(project, count, input),
      '7. 교육 장소', ...places, '장소가 아직 확정되지 않았으면 공간 확보 계획을 쓴다.',
      '8. 효과적인 사업 운영을 위한 기반 활동 계획', ...foundation(project),
      `9. 사업 운영 조직도: 협의회(대표기관 ${lead}와 참여기관 실무자) → 실무팀(교강사·학생 자치회 대표) → 지역 자원(도서관·문화유산 장소). 이미 조직이 있으면 그대로, 없으면 공란으로 둘 수 있다.`);
  } else {
    push(`1. 사업명: ${project.title}`,
      `2. 신청 사업 유형: ${form} 지원사업 — ${project.type}. 세부 교육 주제 키워드: ${{ humanities: '독서·토론·마을 탐구', culture: 'AI 동화·공동 그림책', migrant: '정체성·진로 포트폴리오·ITQ', career: '자기이해·직업 탐색·진로 포트폴리오' }[project.id]}`,
      project.id === 'career' ? `3. 교육 기간: 2027년 5월부터 2027년 ${4 + careerWindow(input)}월까지(${careerWindow(input)}개월, 재단 기준 4개월 이상 지속 참여)` : '3. 교육 기간: 2027년 3월부터 2028년 1월까지');
    let n = 4;
    if (form === '맞춤형') {
      push('4. 지역 교육자원 현황',
        `1) 지역 교육복지 자원지도: 대표기관 ${lead}와 참여기관, 학생이 다니는 학교·교육복지기관·공공시설의 위치를 지도에 표시해 첨부한다. {{map}}`,
        '2) 기관 간 협력·연계 내용:', ...project.slots.map(slot => input.applied && String(input.partners?.[slot.key] || '').trim() ? `- ${slotName(slot, input)}: 역할은 서식 1의 「기관별 역할」 참조` : `- ${slotName(slot, input)}: ${slot.ask}`));
      n = 5;
    }
    push(`${n}. 참여 예정 아동·청소년`, ...recruit(project, input, count),
      `${n + 1}. 교육목표 【신규 사업】`, ...goals,
      `${n + 2}. 교육프로그램 및 프로젝트 내용`, ...programSection(project, count, input),
      `${n + 3}. 교육 장소`, ...places, '장소가 아직 확정되지 않았으면 공간 확보 계획을 쓴다.',
      `${n + 4}. 효과적인 사업 운영을 위한 기반 활동 계획`, ...foundation(project));
  }
  push('', ...personnel(project, input, count), '', ...budgetTable(project, input, count), '',
    '평가와 환류: 사전·사후 과제 비교, 출석(연 80% 이상 출석 학생 85% 목표), 산출물, 학생 주도성 기록(주제 결정·역할 수행·수정 기록), 지역 공유 기록을 모아 단계마다 수업을 조정한다. 목표치는 기존 자료나 초기 조사로 정하며 실적처럼 미리 쓰지 않는다.',
    `안전·아동보호: 교강사·봉사자는 아동학대·성범죄 경력 조회에 동의한 사람만 참여한다. 개인 식별 정보는 성과공유회와 산출물에 싣지 않는다. 종교적·정치적으로 편향된 활동은 하지 않는다. ${project.lockNote}`);
  return out.join('\n');
}


// 가상 최적 기준과 지금 입력을 견줘 달라진 것을 보여 준다(10-15). 기관 이름만 바뀐 것이 아니라
// 인원·반 수·신청액·연합 기관 수·산출물·성과 목표가 함께 어떻게 바뀌었는지가 핵심이다.
export function changeLog(project, input = {}) {
  const base = optimalInput(project);
  const rows = [];
  const why = input.applied?.why || {};
  const diff = (what, from, to, reason) => { if (String(from) !== String(to)) rows.push({ what, from: String(from), to: String(to), why: reason || '' }); };
  const baseCount = people(project, base);
  const count = people(project, input);
  diff('참여 인원', `${baseCount}명`, `${count}명`, why.people || '입력한 인원');
  diff('반 수', `${classesOf(baseCount)}개`, `${classesOf(count)}개`, '반은 15명 단위로 나눈다(인원이 바뀌면 함께 바뀜)');
  diff('연합 기관 수(이름이 정해진 곳)', `${unionSize(project, base)}곳`, `${unionSize(project, input)}곳`, why.union || '이름을 넣은 기관 수');
  diff('신청 한도', won(capOf(project, base)), won(capOf(project, input)), '연합 기관 수가 5곳 미만이면 기본 한도');
  diff('신청액', won(budgetPlan(project, base).total), won(budgetPlan(project, input).total), '인원과 반 수가 바뀌어 강사비·재료비·간식비·진행비가 단가×수량으로 다시 계산됨');
  const baseQ = quantities(project, baseCount);
  const nowQ = quantities(project, count);
  diff('산출물 수량', baseQ[0].replace(/^[^:]+: /, ''), nowQ[0].replace(/^[^:]+: /, ''), '산출물은 인원에 비례');
  diff('성과 목표', baseQ[1].replace(/^[^:]+: /, ''), nowQ[1].replace(/^[^:]+: /, ''), '출석 목표는 참여 인원의 85%');
  if (project.id === 'career') diff('교육 기간', '7개월(5~11월)', `${careerWindow(input)}개월(5~${4 + careerWindow(input)}월)`, why.months || '운영 가능 기간');
  if (input.applied) diff('기관별 역할', '가상 기준 역할', `${input.applied.roles.length}개 기관의 실제 정보 기준 역할`, `조합 「${input.applied.label}」을 적용함`);
  return rows;
}

export function detailedPlan(project, input = {}) {
  return resolveFacts(detailedPlanRaw(project, input), project, input);
}
