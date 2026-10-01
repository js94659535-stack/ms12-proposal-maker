// 제출용 상세본 (10-06 → 10-07에서 재단 양식 순서로 다시 짬).
// 재단 공개 신청서 양식의 서식 1~5 순서와 항목 이름을 그대로 따른다. 유형별 양식이 다르다:
//  · 미래형(인문·사회 탐구, 문화예술 창작)  · 맞춤형(이주배경 잇다, 진로설계)  · 연결형(지역공동체)
// 기관만 아는 값은 `[확인 필요]`로 둔다. 숫자는 programs.js의 프로그램표와 산출식에서 온다.
import { FUND, budgetPlan, capOf, leadName, minSessionsOf, people, slotName, unionSize } from './plan.js';
import { PROGRAMS, RULES, classesOf, sessionTotal } from './programs.js';

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
  culture: '참여 예정 학생 중 일부는 2026년 벧엘지역아동센터에서 마인드스토리와 함께한 「미래설계 AI진로동화 프로젝트」에 참여했다. [확인 필요: 참여 학생 수, 당시 교육 기간과 횟수, 남은 아쉬움] 이번 사업은 그 경험 위에서 교육 기간을 늘리고, 개인 창작에서 공동 창작과 수정 과정, 지역 공유로 확장한다는 점을 쓴다. 다른 기관 지원 사업이었다면 재단의 지속 사업이 아니라 신규 사업으로 표시한다.',
  migrant: '이주배경 학생을 대상으로 한 진로 교육은 2020·2023년 북구다문화센터, 2025년 광산구·무안군가족센터, 2026년 영광 가족센터와 동성고 다문화 학습역량강화로 이어져 왔다. [확인 필요: 참여 예정 학생 개인의 참여 경험]',
  career: '학교폭력 특별교육을 7년째 운영해 왔다(2021년 광주서부교육지원청 위탁 등). 다만 참여 학생의 조치 이력은 사업 서류에 적지 않고 구분하지 않는다. [확인 필요: 위탁 기간 확인서]',
  community: '인접한 세 기관이 공동 교육과정으로 운영한 경험이 없다면 신규 사업으로 쓴다. [확인 필요: 참여 기관별 기존 협력 경험]'
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

const groupsText = (program, count) => program.groups === 'classes' ? `전체 ${count}명을 ${classesOf(count)}개 반(반당 15명 이하)으로 운영` : program.groups === 1 ? `전체 ${count}명 함께` : `전체 ${count}명을 ${program.groups}개 소그룹으로 운영`;

function programSection(project, count) {
  const programs = PROGRAMS[project.id];
  const lines = ['1) 프로젝트 및 교육프로그램 운영 개요',
    `프로젝트 주제와 핵심 내용: ${project.title}. ${project.goal}.`,
    `프로젝트 성과 및 결과물: ${project.outputs.join(', ')}. 봉사활동${project.id === 'career' ? ' 없이 발표회로' : ' 2회와 성과공유회로'} 지역과 나눈다.`,
    `대상 학생: [확인 필요: 학년·연령대] 전체 ${count}명.`,
    `연간 교육: 학생 1인 기준 ${sessionTotal(project.id)}회(재단 최소 ${minSessionsOf(project)}회). 프로젝트·봉사활동·성과발표회를 포함하고 자치회의는 포함하지 않는다.`,
    '단계 | 프로그램명 | 참여학생 | 운영 기간 | 핵심 활동 및 교육 규모 | 운영 회기/회당 시간'];
  for (const program of programs) lines.push(`${program.stage} | ${program.name} | ${groupsText(program, count)} | ${program.months} | ${program.core} | ${program.sessions}회/${program.hours}시간`);
  lines.push(`합계: 학생 1인 ${sessionTotal(project.id)}회`, '', '2) 프로젝트 및 교육프로그램별 핵심 교육내용 (월별)');
  programs.forEach((program, index) => {
    lines.push(`${index + 1}. ${program.name} (운영방식: ${groupsText(program, count)}${program.assistant ? ', 주강사+보조강사' : ', 주강사'} / 교육 장소: ${program.place})`);
    for (const [month, themes] of monthlyThemes(program)) lines.push(`  ${month}월: ${themes.join(' → ')}`);
  });
  return lines;
}

function recruit(project, input, count) {
  const slots = project.slots.map(slot => slotName(slot, input)).join(', ');
  return [
    '1) 모집 계획',
    `□ 기관 내 아동·청소년 대상: 사업 참여 전체 ${count}명 중 (60)% [확인 필요: 실제 비율]`,
    `□ 지역 내 타 기관 협조(지역아동센터, 학교, 교육청 등): 전체 중 (30)%. 협조 기관명: ${slots}. 협의 여부: [확인 필요]`,
    '□ 기타(공개모집 등): 전체 중 (10)%. 배움터 소속이 아닌 지역 아동·청소년도 참여할 수 있다.',
    '2) 선발기준',
    '○ 교육적 지원이 우선 필요한 학생을 먼저 받는다: 저소득층(기초생활수급·차상위·중위소득 75% 내외), 농어촌(면 단위) 거주, 이주배경.',
    '○ 같은 순위에서는 참여 의지(본인 면담), 보호자 동의, 지속 참여 가능성(결석 대응에 동의)을 본다.',
    '○ 기관 내 학생도 같은 기준으로 선발하고, 정원이 넘으면 사회경제적 필요가 큰 학생을 먼저 받는다.',
    '3) 참여 예정 아동·청소년의 사회경제적 현황',
    '참여 학생 거주 지역: ○○시 ○○구 ○○동 [확인 필요: 읍면동 단위]',
    '사회경제적 배경: 거주 지역의 특징(재개발 계획 등), 보호자의 직종, 거주 형태, 경제적 상황, 문화적 배경, 지역의 교육 문제를 쓴다. [확인 필요: 기관이 아는 실제 상황 — 가장 먼저 채워야 할 칸]',
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
  return [
    '<서식 4> 담당 인력 정보',
    `대표자: ${leadName(input)} 대표 [확인 필요: 성명·소속·연령·교육복지 경력]`,
    '실무책임자: [확인 필요: 성명·경력] — 강사를 겸하면 강사비와 인건비 중 하나만 책정한다.',
    '강사: 확정되면 이력서와 개인정보 동의서를, 미정이면 아래 모집 계획을 쓴다.',
    '강사 모집 계획:',
    ...PROGRAMS[project.id].map(program => `- ${program.name}: 주강사 ${program.groups === 'classes' ? classesOf(count) : 1}명${program.assistant ? ' + 보조강사' : ''} / 모집 방법: 기관 추천과 공개 모집 / 선발 기준: 해당 분야 전문성, 아동·청소년 교육 경험, 아동학대·성범죄 경력 조회 동의`),
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
  lines.push('기관 자체 투입 자원(인력·교구·연계 자원·자부담): [확인 필요: 사회복무요원 투입, 보유 교구, 무료 사용 공간 등]');
  return lines;
}

export function detailedPlan(project, input = {}) {
  const lead = leadName(input);
  const count = people(project, input);
  const form = FORM[project.id];
  const places = [...new Set(PROGRAMS[project.id].map(p => p.place))].map(place => `○ ${place}: 위치·크기·수용 인원 [확인 필요]`);
  const goals = GOALS[project.id].map(([goal, how], i) => `${i + 1}) ${goal} (확인 방법: ${how})`);
  const out = [];
  const push = (...lines) => out.push(...lines);
  push(`${FUND.name} — ${form} 지원사업 신청서(제출용 상세본)`,
    '※ 재단 공개 양식(서식 1~5)의 순서와 항목 이름을 따랐다. 신청서는 한글 파일에 옮겨 쓰고 PDF로 변환해 제출한다.', '',
    '<서식 1> 대표기관 및 참여기관 소개',
    `1. 명단: 대표기관 ${lead}`, ...project.slots.map(slot => `참여기관: ${slotName(slot, input)} (${slot.role})`),
    '2. 운영 현황: 설립연도, 상근·비상근 인력, 2026년 전체 예산, 학생 1인당 월 이용료, 외부지원 현황(2024~2026) [확인 필요: 기관별 사실 — 강사 파견·대학생 자원봉사자 파견도 포함]',
    '3. 대표자 자기소개: 교육복지 분야 경력(재단 사업 참여 경력 포함)과 교육철학 중심으로 쓴다. [확인 필요: 대표자 본인 서술]', '',
    '<서식 2> 배움터 책무성 점검표',
    '대표기관의 점검표만 제출한다. 최근 5년 이내 회계부정·불법행위나 성폭력·학대 관련 처분 이력이 없는지 사실대로 답한다. [확인 필요]', '',
    '<서식 3> 교육지원사업 계획서');

  if (form === '연결형') {
    push(`1. 사업명: ${project.title}`,
      '2. 사업의 필요성',
      '1) 지역 아동·청소년의 현황 및 교육복지 과제',
      '참여 학생 거주 지역: ○○시 ○○구 ○○동 [확인 필요]',
      '사회경제적 배경: 거주 지역의 특징, 보호자 직종, 거주 형태, 경제적 상황, 교육·문화 인프라. [확인 필요]',
      `교육복지 과제: ${project.need}`,
      '협력사업의 필요성: 한 기관이 혼자 하기 어려운 문화 체험과 학생 교류를 인접한 기관이 공동 교육과정으로 풀어야 하는 이유를 쓴다. 기관별 강사 파견이 아니라 공동 기획·공동 운영임을 분명히 한다.',
      '2) 지역 교육자원 현황',
      `① 지역 교육복지 자원지도: 대표기관 ${lead}와 참여기관, 학생이 다니는 학교·복지기관·공공시설·문화유산의 위치를 지도에 표시해 첨부한다. [확인 필요: 지도 자료]`,
      '② 기관 간 협력·연계 내용:', ...project.slots.map(slot => `- ${slotName(slot, input)}: ${slot.ask}`),
      `연합 기관 현황: 현재 이름이 정해진 곳은 ${unionSize(project, input)}곳이다. 지역적으로 인접한 3개 이상 기관이어야 하고 그중 학생이 등록된 배움터가 2곳 이상이어야 한다.`,
      '3) 3년 후 기대하는 변화·성과',
      '아동·청소년: 1년 차에 지역 문화를 기획·탐방·기록하는 경험을 하고, 3년 차에는 이 연합동아리가 학생 자치로 이어져 후배에게 탐방을 안내한다.',
      '지역의 교육환경: 지금은 기관마다 따로 가는 체험을, 3년 후에는 공동 교육과정과 공동 교재, 매년 갱신되는 「우리 고장 문화지도」로 정착시킨다.',
      '기관 간 협력체계: 1년 차 협의회 구축, 2년 차 기관별 역할의 정례화, 3년 차 지역 교육자원이 연합 체계에 상시 참여하는 것을 목표로 한다. [확인 필요: 현재 상황과 비교할 항목]',
      '3. 교육 기간: 2027년 3월부터 2028년 1월까지(교육), 2028년 2월 결과보고·정산',
      '4. 참여 예정 아동·청소년', ...recruit(project, input, count).slice(0, 8),
      '5. 교육목표 【신규 사업】', ...goals,
      '6. 교육프로그램 및 프로젝트 내용', ...programSection(project, count),
      '7. 교육 장소', ...places, '전경 사진은 인물이 식별되지 않게 첨부한다.',
      '8. 효과적인 사업 운영을 위한 기반 활동 계획', ...foundation(project),
      `9. 사업 운영 조직도: 협의회(대표기관 ${lead}와 참여기관 실무자) → 실무팀(교강사·학생 자치회 대표) → 지역 자원(도서관·문화유산 장소). 이미 조직이 있으면 그대로, 없으면 공란으로 둘 수 있다.`);
  } else {
    push(`1. 사업명: ${project.title}`,
      `2. 신청 사업 유형: ${form} 지원사업 — ${project.type}. 세부 교육 주제 키워드: ${{ humanities: '독서·토론·마을 탐구', culture: 'AI 동화·공동 그림책', migrant: '정체성·진로 포트폴리오·ITQ', career: '자기이해·직업 탐색·진로 포트폴리오' }[project.id]}`,
      project.id === 'career' ? '3. 교육 기간: 2027년 5월부터 2027년 11월까지(7개월, 재단 기준 4개월 이상 지속 참여)' : '3. 교육 기간: 2027년 3월부터 2028년 1월까지');
    let n = 4;
    if (form === '맞춤형') {
      push('4. 지역 교육자원 현황',
        `1) 지역 교육복지 자원지도: 대표기관 ${lead}와 참여기관, 학생이 다니는 학교·교육복지기관·공공시설의 위치를 지도에 표시해 첨부한다. [확인 필요: 지도 자료]`,
        '2) 기관 간 협력·연계 내용:', ...project.slots.map(slot => `- ${slotName(slot, input)}: ${slot.ask}`));
      n = 5;
    }
    push(`${n}. 참여 예정 아동·청소년`, ...recruit(project, input, count),
      `${n + 1}. 교육목표 【신규 사업】`, ...goals,
      `${n + 2}. 교육프로그램 및 프로젝트 내용`, ...programSection(project, count),
      `${n + 3}. 교육 장소`, ...places, '전경 사진은 인물이 식별되지 않게 첨부한다.',
      `${n + 4}. 효과적인 사업 운영을 위한 기반 활동 계획`, ...foundation(project));
  }
  push('', ...personnel(project, input, count), '', ...budgetTable(project, input, count), '',
    '평가와 환류: 사전·사후 과제 비교, 출석(연 80% 이상 출석 학생 85% 목표), 산출물, 학생 주도성 기록(주제 결정·역할 수행·수정 기록), 지역 공유 기록을 모아 단계마다 수업을 조정한다. 목표치는 기존 자료나 초기 조사로 정하며 실적처럼 미리 쓰지 않는다.',
    `안전·아동보호: 교강사·봉사자는 아동학대·성범죄 경력 조회에 동의한 사람만 참여한다. 개인 식별 정보는 성과공유회와 산출물에 싣지 않는다. 종교적·정치적으로 편향된 활동은 하지 않는다. ${project.lockNote}`);
  return out.join('\n');
}
