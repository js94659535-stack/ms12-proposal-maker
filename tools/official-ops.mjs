// 현재 가상 계획서(진로설계)를 재단 원본 맞춤형 양식의 칸에 넣는 작업 목록을 만든다(10-36).
// 표 번호(t)는 한글이 세는 번호(안쪽 표 포함 문서 순서), 칸은 (행 r, 열 c) 주소다(0부터, 합친 칸은 왼쪽 위 칸의 주소).
// 작업은 번호가 큰 표부터 한다 — 뒤쪽 표에서 줄을 더하거나 표를 복사해도 앞쪽 표 번호가 밀리지 않는다.
// 표를 복사하면 복사본이 놓이는 자리는 이 원본 파일에서 실측한 값이다: 예산서 표(70) 복사본은 71·72, 참여기관 표(15) 복사본은 20(안쪽 21·22·23).
import { careerBody, derive } from '../public/baeumteo/career-final.js';
import { PROGRAMS } from '../public/baeumteo/programs.js';

const num = n => Math.round(n).toLocaleString('ko-KR');
const cellsOf = l => l.replace(/^▦-? /, '').split(' | ');

export const PARTNER_COPY = 20; // 참여기관 ② 표(복사본). 안쪽 표는 21(학년), 22(사회경제), 23(주간 일정)
export const BUDGET_COPIES = [71, 72];

export function buildOps(setting = {}) {
  const d = derive(setting);
  const { s, N } = d;
  const body = careerBody(setting).split('\n');
  const line = prefix => {
    const hit = body.find(l => l.startsWith(prefix));
    if (!hit) throw new Error(`본문에 없음: ${prefix}`);
    return hit;
  };
  const chunk = (from, to) => {
    const a = body.findIndex(l => l.startsWith(from));
    const b = body.findIndex((l, i) => i > a && l.startsWith(to));
    if (a < 0 || b < 0) throw new Error(`구간 없음: ${from} ~ ${to}`);
    return body.slice(a, b).filter(l => l.trim() && !l.startsWith('▦'));
  };
  const tableRow = name => cellsOf(body.find(l => l.startsWith(`▦ ${name} |`)));
  const ops = [];
  const F = (t, r, c, text) => ops.push({ op: 'fill', t, r, c, mode: 'replace', text: String(text) });
  const below = (t, r, c) => ops.push({ op: 'row_below', t, r, c });
  const merge = (t, r, c, n) => ops.push({ op: 'merge_v', t, r, c, n });
  const del = (t, r, c) => ops.push({ op: 'row_delete', t, r, c });


  const prog = PROGRAMS.career;
  const b = d.budget;
  const rowsOf = name => b.rows.filter(r => r.program === name);
  const accountOf = (name, account) => {
    const list = rowsOf(name).filter(r => r.account === account);
    return list.length ? { formula: list.map(r => r.formula).join('; '), amount: num(list.reduce((x, r) => x + r.amount, 0)) } : null;
  };
  const programNames = prog.map(p => p.name);
  const sumOf = names => names.reduce((x, n) => x + rowsOf(n).reduce((y, r) => y + r.amount, 0), 0);

  // ================= 서식 5 =================
  // 자체 투입 자원 상자: 원본 표 71(예산서 표 70 바로 뒤의 한 칸 표). 표를 복사하기 전 번호로 먼저 채운다.
  F(71, 0, 0, [
    `공간: ${s.agency} 활동실 2곳·면담실 2곳 사용, ${s.partner1} 강당 무상 사용 (활동실 2곳, 면담실 2곳, 강당 1곳)`,
    `인력: 사회복무요원 1명이 매 수업 진행을 돕는다. 대학생 멘토 ${d.mentors}명은 자원봉사로 참여한다.`,
    '교구·도구: 노트북 12대, 이동식 탁자, 진로 검사 도구 이용료(센터 부담, 연 1,200,000원)',
    '후속 운영: 2028년 3월부터 「진로 포트폴리오 모임」 운영비(센터 자체 예산, 연 1,200,000원)'
  ].join('\n'));
  const blocks = [{ nameR: 1, accRows: [1, 2, 3, 4, 5, 6], subR: 7 }, { nameR: 8, accRows: [8, 9, 10, 11, 12, 13], subR: 14 }];
  const accounts = ['강사비', '보조강사비', '학습재료비', '교통비', '식비(간식)', '진행비'];
  const fillBlock = (t, blk, name) => {
    F(t, blk.nameR, 1, name);
    accounts.forEach((acc, i) => {
      const v = accountOf(name, acc);
      if (v) { F(t, blk.accRows[i], 3, v.formula); F(t, blk.accRows[i], 4, v.amount); }
    });
    F(t, blk.subR, 4, num(rowsOf(name).reduce((x, r) => x + r.amount, 0)));
  };
  // 표 70 은 프로그램 1·2, 복사 1(71)은 3·4, 복사 2(72)는 5·6 과 합계·운영비·인건비·총계
  ops.push({ op: 'table_copy_after', t: 70, times: 2 });
  const [c1, c2] = BUDGET_COPIES;
  fillBlock(c2, blocks[0], programNames[4]);
  fillBlock(c2, blocks[1], programNames[5]);
  F(c2, 15, 4, num(sumOf(programNames)));
  const opFood = accountOf('운영', '운영비(식비)');
  const opTrip = accountOf('운영', '운영비(교통비)');
  const pay = accountOf('인건비', '수당');
  F(c2, 16, 3, opFood.formula); F(c2, 16, 4, opFood.amount);
  F(c2, 17, 3, opTrip.formula); F(c2, 17, 4, opTrip.amount);
  F(c2, 18, 4, num(b.admin - rowsOf('인건비').reduce((x, r) => x + r.amount, 0)));
  F(c2, 19, 3, pay.formula); F(c2, 19, 4, pay.amount);
  F(c2, 20, 4, pay.amount);
  F(c2, 21, 4, num(b.total));
  fillBlock(c1, blocks[0], programNames[2]);
  fillBlock(c1, blocks[1], programNames[3]);
  fillBlock(70, blocks[0], programNames[0]);
  fillBlock(70, blocks[1], programNames[1]);

  // ================= 서식 4 =================
  F(65, 1, 1, '진로설계 포트폴리오 동아리(대학생 진로 멘토)');
  F(65, 1, 2, `${d.mentors}`);
  F(65, 1, 3, '인근 대학 상담·교육·사회복지 관련 학과 공개 모집과 학과 추천');
  F(65, 1, 4, '청소년 멘토링 경험 또는 관련 교육 이수, 아동학대·성범죄 경력 조회 동의, 7개월 이상 참여 가능');
  for (const col of [1, 2, 3, 4]) F(65, 2, col, '해당 없음');
  const people = [
    [s.rep, s.agency, String(s.repAge), '대표자(사업 총괄)', '청소년 상담 20년, 학교폭력 특별교육 위탁 운영 7년, 상담심리 석사'],
    [s.manager, s.agency, String(s.managerAge), '실무책임자(신청·정산·보고)', '청소년 교육복지 12년, 사회복지사 1급, 재단 사업 실무 경험 3회'],
    ...Array.from({ length: d.C }, (_, i) => [INSTR[i % INSTR.length][0], '외부 강사', String(INSTR[i % INSTR.length][1]), `${i + 1}반 주강사`, INSTR[i % INSTR.length][2]]),
    ...Array.from({ length: d.C }, (_, i) => [ASSIST[i % ASSIST.length][0], ASSIST[i % ASSIST.length][1], '20대', `${i + 1}반 보조강사(면담·현장 인솔)`, '청소년 학습멘토링 1~2년, 아동학대·성범죄 경력 조회 동의'])
  ];
  for (let i = 0; i < people.length - 4; i += 1) below(63, 5, 0);
  for (let i = people.length - 1; i >= 0; i -= 1) {
    const [name, org, age, role, career] = people[i];
    const r = 2 + i;
    F(63, r, 6, '(서명 또는 날인 자리)');
    F(63, r, 5, career);
    F(63, r, 4, role);
    F(63, r, 3, age);
    F(63, r, 2, org);
    F(63, r, 1, name);
    if (i >= 4) F(63, r, 0, String(i + 1));
  }

  // ================= 서식 3 =================
  // 9. 기반 활동(표 60): 3줄 + 줄 추가 1
  const r1 = tableRow('아동·청소년 자치회의');
  const r2 = tableRow('보호자와의 소통(보호자 모임·교육 등)');
  const r3 = tableRow('교강사 전체 회의');
  const r4 = tableRow('기타(협력기관 협의회 · 멘토 모임)');
  const quality = chunk('수업 질 관리와 결석 대응', '평가와 환류').join('\n');
  const space = line('공간과 일정:');
  const safety = chunk('안전과 아동보호', '후속 운영 계획').join('\n');
  const risks = body.filter(l => /^▦ (출석이|직업인이나|강사가|이동 중)/.test(l)).map(cellsOf).map(([a, c]) => `- ${a}: ${c}`).join('\n');
  below(60, 3, 0);
  F(60, 4, 2, r4[2]);
  F(60, 4, 1, r4[1]);
  F(60, 4, 0, r4[0]);
  F(60, 3, 2, [r3[2], space, quality].join('\n'));
  F(60, 3, 1, r3[1]);
  F(60, 2, 2, r2[2]);
  F(60, 2, 1, r2[1]);
  F(60, 1, 2, r1[2]);
  F(60, 1, 1, r1[1]);

  // 8. 교육 장소(표 58)
  F(58, 0, 1, chunk('대표기관의 활동실 2곳', '## 9.').join('\n'));
  F(58, 1, 1, '[교육 장소 전경 사진 자리 — 인물이 식별되지 않는 사진]');

  // 7-2 월별 핵심 교육내용(표 56)
  const monthly = monthlyOf(body, prog);
  const place = (m, p) => m.place || p.place;
  const first = (r, i, m) => { F(56, r, 5, place(m, prog[i])); F(56, r, 4, m.way); F(56, r, 3, m.rows[0].content); F(56, r, 2, m.rows[0].month); F(56, r, 1, prog[i].name); F(56, r, 0, String(i + 1)); };
  first(25, 5, monthly[5]);
  {
    const m = monthly[4]; // 봉사활동: 두 달을 한 줄로
    F(56, 24, 5, place(m, prog[4])); F(56, 24, 4, m.way);
    F(56, 24, 3, '학생이 만든 직업 비교표와 인터뷰 기록으로 후배 청소년(지역 아동센터·청소년시설)에게 직업 정보 부스를 운영하고(10월), 후배와 진로 이야기를 나눈 뒤 소감을 기록한다(11월).');
    F(56, 24, 2, m.rows.map(r => r.month).join('·')); F(56, 24, 1, prog[4].name); F(56, 24, 0, '5');
  }
  {
    const m = monthly[3]; // 포트폴리오 동아리: 원본 2줄 + 줄 추가 1
    first(22, 3, m);
    F(56, 23, 3, m.rows[1].content); F(56, 23, 2, m.rows[1].month);
    below(56, 23, 2);
    F(56, 24, 3, m.rows[2].content); F(56, 24, 2, m.rows[2].month);
  }
  const keep = [[15, 2, [16, 17, 18, 19, 20, 21]], [6, 1, [7, 8, 9, 10, 11, 12, 13, 14]], [1, 0, [2, 3, 4, 5]]]; // [첫 줄, 프로그램 번호, 이어지는 줄들]
  for (const [firstRow, idx, more] of keep) {
    const m = monthly[idx];
    first(firstRow, idx, m);
    m.rows.slice(1).forEach((r, j) => { F(56, more[j], 3, r.content); F(56, more[j], 2, r.month); });
  }
  for (const [, idx, more] of keep) for (const row of more.slice(monthly[idx].rows.length - 1).reverse()) del(56, row, 2);

  // 7-1 개요(표 54 삭제, 표 53 채움)
  ops.push({ op: 'table_delete', t: 54 });
  const stages = [[6, [4, 5]], [5, [2, 3]], [4, [0, 1]]]; // [단계 행, 프로그램 번호들] — 아래 단계부터
  for (const [row, [a, c]] of stages) {
    const cell = (r, p) => {
      F(53, r, 5, `${p.sessions}회/${p.hours}시간`);
      F(53, r, 4, p.core);
      F(53, r, 3, p.months);
      F(53, r, 2, p.groups === 'classes' ? `전체 ${N}명 · ${d.C}개 반` : `전체 ${N}명 함께`);
      F(53, r, 1, p.name);
    };
    below(53, row, 0);
    cell(row + 1, prog[c]);
    cell(row, prog[a]);
    merge(53, row, 0, 2);
  }
  F(53, 2, 1, line('대상 학생:'));
  F(53, 1, 1, [line('프로젝트 성과 및 결과물:'), line('연간 교육:'), ...chunk('후속 운영 계획', '<서식 4>')].join('\n'));
  F(53, 0, 1, [overviewText(body, line, chunk), safety, '[예상되는 어려움과 대응]', risks].join('\n'));

  // 6. 교육목표
  F(51, 0, 0, '해당 없음(신규 사업)');
  for (const row of [1, 2, 3]) F(49, row, 1, '해당 없음(신규 사업)');
  F(47, 0, 0, [...chunk('참여 청소년이 7개월 동안', '## 7.'), line('평가와 환류:')].join('\n'));

  // 5. 참여 예정 아동·청소년
  F(44, 0, 0, chunk('참여 예정 청소년 ', '## 6.').join('\n'));
  F(42, 1, 1, chunk('참여 청소년은 광산구 월곡동', '4) 참여 예정').join('\n'));
  F(42, 0, 1, `광주광역시 광산구 월곡동 ${d.region[0]}명, 우산동 ${d.region[1]}명, 신창동 ${d.region[2]}명`);
  F(40, 0, 0, line('참여 청소년은 교육적 지원이'));
  const pctOwn = Math.round(d.own / N * 100), pct1 = Math.round(d.p1 / N * 100), pct2 = 100 - pctOwn - pct1;
  F(38, 5, 1, '사업 참여 전체 아동‧청소년 중 (0)% — 0명');
  F(38, 4, 2, '예 (2026년 10월 협력 합의서 체결)');
  F(38, 3, 2, `${s.partner1}, ${s.partner2}`);
  F(38, 2, 1, `사업 참여 전체 아동‧청소년 중 (${pct1 + pct2})% — ${s.partner1} ${d.p1}명(${pct1}%), ${s.partner2} ${d.p2}명(${pct2}%)`);
  F(38, 2, 0, '☑ 지역 내 타 기관 협조(지역아동센터, 학교, 교육청 등)');
  F(38, 1, 1, `사업 참여 전체 아동‧청소년 중 (${pctOwn})% — ${d.own}명`);
  F(38, 1, 0, '☑ 기관 내 아동·청소년 대상');

  // 4. 지역 교육자원 현황
  F(35, 0, 0, chunk(s.partner1, '## 5.').join('\n'));
  const resources = body.filter(l => l.startsWith('▦ ')).map(cellsOf).filter(c => c.length === 3 && /(대표기관|참여기관|도보|버스)/.test(c[0] + c[1])).map(([a, loc, use]) => `- ${a} (${loc}): ${use}`);
  F(33, 0, 0, ['[지역 교육복지 자원지도 이미지 자리 — 대표기관·참여기관·학교·교육복지기관 위치 표시]', ...resources, line('광주광역시 공개 자료에 따르면')].join('\n'));

  // 1~3
  F(31, 2, 2, '자기이해 · 직업 탐색 · 현장 확인 · 진로설계 포트폴리오');
  F(31, 2, 0, '○');
  // 서식 2
  F(27, 0, 0, '해당 없음');
  F(25, 1, 0, '○');
  // 서식 1: 자기소개
  F(21, 1, 0, [line(s.rep), line('제가 믿는 교육철학은')].join('\n'));
  F(21, 0, 3, `${s.repTitle} 겸 센터장`);
  F(21, 0, 1, s.rep);

  // ================= 서식 1 =================
  const kinds = ['① 사회복지법인', '② 사단법인', '③ 종교법인', '④ 학교법인', '⑤ 재단법인', '⑥ 국가지방자치단체', '⑦ 임의단체', '⑧ 협동조합', '⑨ 법인(기타)', '⑩ 기타( )'];
  const org = (t, [tg, ts, tm], o) => {
    F(t, 0, 1, o.name);
    F(t, 0, 7, `${o.year} 년`);
    F(t, 1, 1, `${o.full} 명`);
    F(t, 1, 7, `${o.part} 명`);
    F(t, 2, 1, `${o.budget} 원`);
    F(t, 2, 7, `${o.fee} 원`);
    F(t, 4, 2, o.corp);
    F(t, 4, 8, o.corpRep);
    F(t, 5, 2, kinds.map((x, i) => (i + 1 === o.kind ? `○${x}` : x)).join('  '));
    const sum = o.grade.reduce((x, y) => x + y, 0);
    [0, 1, 2].forEach(i => F(tg, 1, 1 + i, String(o.grade[i])));
    F(tg, 1, 4, '0');
    F(tg, 1, 5, `${sum} 명`);
    [1, 2, 3, 5, 7].forEach((c, i) => F(ts, 1, c, String(o.soc1[i])));
    [1, 2, 4, 6].forEach((c, i) => F(ts, 3, c, String(o.soc2[i])));
    const sch = o.schedule;
    const cells = [[1, 0, sch[0][0]], [1, 1, sch[0][1]], [1, 6, sch[0][2]], [2, 0, sch[1][0]], [2, 1, sch[1][1]], [2, 2, sch[1][2]], [2, 3, sch[1][3]], [2, 4, sch[1][4]], [2, 5, sch[1][5]], [3, 0, sch[2][0]], [3, 2, sch[2][1]], [3, 3, sch[2][2]], [3, 4, sch[2][3]], [3, 5, sch[2][4]], [4, 0, sch[3][0]], [4, 1, sch[3][1]], [5, 0, sch[4][0]], [5, 1, sch[4][1]]];
    for (const [r, c, text] of cells.reverse()) F(tm, r, c, text);
    o.support.forEach((row, i) => { F(t, 10 + i, 8, row[3]); F(t, 10 + i, 5, row[2]); F(t, 10 + i, 3, row[1]); F(t, 10 + i, 1, row[0]); });
  };
  const orgs = orgData(s);
  // 참여기관 표 15(안쪽 16·17·18)를 복사해 참여기관 ② 표(20, 안쪽 21·22·23)로 쓴다
  ops.push({ op: 'table_copy_after', t: 15, times: 1 });
  org(PARTNER_COPY, [PARTNER_COPY + 1, PARTNER_COPY + 2, PARTNER_COPY + 3], orgs.partner2);
  org(15, [16, 17, 18], orgs.partner1);
  org(11, [12, 13, 14], orgs.main);
  F(10, 6, 2, s.partner2Rep); F(10, 6, 0, s.partner2);
  F(10, 5, 2, s.partner1Rep); F(10, 5, 0, s.partner1);
  F(10, 2, 3, '(직인 또는 서명 이미지 자리)');
  F(10, 2, 1, s.rep); F(10, 2, 0, s.agency);
  F(0, 2, 0, '※ 가상 설정으로 작성한 예시본입니다 (제출용이 아님)');

  // 「<작성 예시>」 글자: 문서에 네 곳(대표기관·참여기관 ①·참여기관 ②의 주간 일정표 머리, 7-1 개요 표 앞)이 있다.
  // 앞의 셋은 주간 일정표 이름으로 바꾸고, 7-1 앞의 것(마지막)은 예시 표를 지웠으므로 지운다.
  for (let i = 0; i < 3; i += 1) ops.push({ op: 'find_replace_line', find: '<작성 예시>', text: '<2026년 현재 교육과정 주간 일정표>' });
  ops.push({ op: 'find_delete_line', find: '<작성 예시>' });
  // 7-1 예시 표를 지우고 남은 빈 문단 둘이 빈 쪽을 만들므로 7-2 제목 앞에서 두 번 지운다(실측: 두 번에 빈 쪽이 사라진다)
  ops.push({ op: 'delete_back', find: '2) 프로젝트 및 교육프로그램별 핵심 교육내용', count: 2 });
  // 표 밖 문단
  ops.push({ op: 'find_replace_line', find: '202 년', text: '2027년 5월 1일부터 ～ 2027년 11월 30일까지' });
  ops.push({ op: 'find_append', find: '1. 사업명 :', text: ` ${line('「').trim()}` });
  return ops;
}

const INSTR = [
  ['최민서', 38, '청소년 진로·상담 강사 8년. 진로 검사 해석 자격(진로상담 전문가 과정 이수), 학교 연계 집단상담 150회기 운영'],
  ['한지우', 35, '직업·진학 교육 강사 6년. 지역 직업체험 프로그램 기획, 특성화고·전문대학 진학 설명회 진행'],
  ['오하윤', 33, '글쓰기·포트폴리오 지도 5년. 청소년 자서전·진로 포트폴리오 수업 40회 운영'],
  ['윤서준', 37, '청소년 상담·집단활동 지도 7년'],
  ['강예린', 34, '진로 코칭·면담 기법 지도 5년']
];
const ASSIST = [['장유나', '대학원 상담심리학 석사과정'], ['임도윤', '교육학 전공 4학년'], ['송하린', '청소년지도학 전공 4학년'], ['배지호', '사회복지학 전공 4학년'], ['문채원', '심리학 전공 4학년']];

function overviewText(body, line, chunk) {
  void 0;
  const glance = body.filter(l => l.startsWith('▦- ')).map(cellsOf).filter(c => ['대상', '기간과 횟수', '흐름', '결과물', '재단 지원금'].includes(c[0])).map(c => `▪ ${c[0]}: ${c[1]}`);
  const need = body.filter(l => l.startsWith('▦ ') && l.includes('(5-')).map(cellsOf).map(c => `▪ 필요: ${c[0]} (근거: ${c[1]}) → 대응: ${c[2]}`);
  return [
    // 「사업 한눈에」의 대상·기간·흐름·결과물·지원금은 원본 양식의 대상 학생, 성과 및 결과물, 단계별 표 칸에 이미 들어가므로 이 칸에서는 뺀다(쪽 넘침 방지)
    '[이 사업이 해결하려는 필요와 사업의 대응]', ...need,
    line('다른 진로체험 프로그램과'), line('프로젝트 주제 및 핵심 내용:'),
    ...chunk('운영 방법을 이렇게 정한 이유', '수업 장면 ①'), line('수업 장면 ①'), line('수업 장면 ②')
  ].join('\n');
}

function monthlyOf(body, prog) {
  const rows = body.filter(l => l.startsWith('▦ ')).map(cellsOf).filter(c => c.length === 6 && /^\d$/.test(c[0]) && /월$/.test(c[2]));
  return prog.map((p, i) => {
    const mine = rows.filter(r => Number(r[0]) === i + 1);
    return { rows: mine.map(r => ({ month: r[2], content: r[3] })), way: mine[0]?.[4] || '', place: mine[0]?.[5] || p.place };
  });
}

// 대표기관·참여기관의 운영 현황 가상 값(career-final 의 서식 1 값과 같다)
function orgData(s) {
  const main = {
    name: s.agency, year: 2016, full: 5, part: 6, budget: '342,000,000', fee: '0', grade: [0, 31, 23], soc1: [17, 15, 4, 21, 2], soc2: [0, 3, 0, 0], corp: s.agency, corpRep: s.rep, kind: 2,
    schedule: [['15:00~15:30', '등원, 간식, 자유 학습', '격주 토요일 문화·체험활동(09:00~12:00)'], ['15:30~17:00', '학습 멘토링(대학생)', '집단상담 「마음쉼터」', '진로·직업 탐색', '독서·글쓰기', '체육·문화활동'], ['17:00~18:30', '집단상담 「마음쉼터」', '진로 검사·상담', '독서·글쓰기', '동아리'], ['18:30~19:30', '저녁 식사와 휴식'], ['19:30~21:00', '개별 학습 지도·상담']],
    support: [['빛고을지역복지재단', '2024. 3. ~ 2025. 2.', '청소년 학습멘토링(대학생 멘토 10명 파견 포함)', '18,000,000'], ['빛고을지역복지재단', '2025. 3. ~ 2026. 2.', '청소년 집단상담 「마음쉼터」 운영', '21,000,000'], ['광산구청', '2026. 1. ~ 2026. 12.', '방과후 청소년 급식 지원', '9,600,000']]
  };
  const partner1 = {
    name: s.partner1, year: 2012, full: 4, part: 3, budget: '268,000,000', fee: '0', grade: [0, 52, 68], soc1: [21, 19, 6, 24, 3], soc2: [0, 4, 0, 0], corp: '광산구 (공공 위탁 운영)', corpRep: s.partner1Rep, kind: 6,
    schedule: [['15:00~15:30', '개방 공간 이용, 간식', '토요일 동아리·체험활동(10:00~13:00)'], ['15:30~17:00', '청소년 동아리', '진로 체험 프로그램', '학습 도움방', '청소년 상담', '문화예술 활동'], ['17:00~18:30', '진로 체험 프로그램', '학습 도움방', '청소년 상담', '문화예술 활동'], ['18:30~19:30', '저녁 식사와 휴식'], ['19:30~21:00', '자율 활동']],
    support: [['광산구청', '2024. 1. ~ 2024. 12.', '청소년 동아리 운영 지원', '12,000,000'], ['광주광역시', '2025. 1. ~ 2025. 12.', '청소년 문화예술 활동 지원', '15,000,000'], ['광산구청', '2026. 1. ~ 2026. 12.', '청소년 진로 체험 지원', '10,000,000']]
  };
  const partner2 = {
    name: s.partner2, year: 1998, full: 62, part: 14, budget: '5,120,000,000', fee: '0', grade: [0, 0, 640], soc1: [58, 40, 11, 150, 9], soc2: [0, 6, 0, 0], corp: '학교법인 신창학원', corpRep: s.partner2Rep, kind: 4,
    schedule: [['08:30~09:00', '등교, 아침 활동', '토요일 휴업(일부 동아리 활동)'], ['15:30~17:00', '방과후학교 교과', '방과후학교 교과', '방과후학교 진로 동아리', '방과후학교 교과', '방과후학교 교과'], ['17:00~18:30', '자율 학습', '자율 학습', '자율 학습', '자율 학습'], ['18:30~19:30', '저녁 식사'], ['19:30~21:00', '자율 학습']],
    support: [['광주광역시교육청', '2024. 3. ~ 2025. 2.', '진로체험 지원', '6,000,000'], ['광주광역시교육청', '2025. 3. ~ 2026. 2.', '고교학점제 선택과목 운영 지원', '8,500,000'], ['광산구청', '2026. 3. ~ 2026. 12.', '학교 밖 연계 진로 프로그램', '4,000,000']]
  };
  return { main, partner1, partner2 };
}
