// 진로설계 가상 예시본 감사 보고서를 만든다(10-44): 회차 연결표, 예산 연결표, 심사 질문별 본문 위치, 교체 입력목록.
// 사용: node tools/career-audit.mjs <출력 폴더>
import fs from 'node:fs';
import path from 'node:path';
import { careerBody, careerGuide, derive, orgFacts, saturdaysIn, CLASS_DAYS, SETTING_FIELDS } from '../public/baeumteo/career-final.js';
import { PROGRAMS, TRACKS, monthlyLoad } from '../public/baeumteo/programs.js';

const out = path.resolve(process.argv[2] || 'reports/10-44-career-polish');
fs.mkdirSync(out, { recursive: true });
const d = derive({});
const body = careerBody({});
const lines = body.split('\n');
const prog = PROGRAMS.career;
const won = n => `${Math.round(n).toLocaleString('ko-KR')}원`;

// 1) 22회 연결표
const sessions = [];
for (const p of prog) {
  const months = Object.entries(p.schedule).flatMap(([m, n]) => Array(n).fill(Number(m)));
  p.themes.forEach((theme, i) => sessions.push({ no: sessions.length + 1, month: months[i], program: p.name, hours: p.hours, theme, track: TRACKS[p.tracks[i]] }));
}
const sessionTable = ['| 회차 | 달 | 프로그램 | 시간 | 주제 | 기여 영역 |', '|---|---|---|---|---|---|', ...sessions.map(s => `| ${s.no} | ${s.month}월 | ${s.program} | ${s.hours}h | ${s.theme} | ${s.track} |`)];
const byTrack = Object.entries(TRACKS).map(([k, v]) => `${v} ${sessions.filter(s => s.track === v).length}회`).join(' · ');
const load = monthlyLoad('career');

// 2) 예산 연결표: 계정과목이 어떤 회차·산출물에 닿는지
const link = r => {
  const p = prog.find(x => x.name === r.program);
  if (r.program === '운영') return r.account.includes('식비') ? `교강사 회의 ${d.meetings}회(교강사 ${d.C * 2}명+실무책임자 1명)` : '재단 교육 참여 4회(2명)';
  if (r.program === '인건비') return `실무책임자 12개월(모집·일정·출석·정산·보고)`;
  const n = p.sessions;
  if (r.account === '강사비') return `${p.sessions}회 × ${p.hours}시간 수업 (${p.groups === 'classes' ? `${d.C}개 반` : '전체'})`;
  if (r.account === '보조강사비') return `${p.sessions}회 수업의 반별 보조(면담·현장 인솔)`;
  if (r.account === '학습재료비') return `청소년 ${d.N}명의 ${p.name.includes('포트폴리오') ? '포트폴리오 제본·인쇄' : p.name.includes('봉사') ? '직업 정보 부스 자료' : '검사지·교재·활동지'}`;
  if (r.account === '교통비') return `${d.C}개 반이 따로 다녀오는 학과 체험 1회 + 사업장 방문 1회 = ${d.C * 2}회 (버스 1대)`;
  if (r.account.startsWith('식비')) return `${n}회 수업의 간식`;
  if (r.account === '진행비') return r.formula.includes('사례비') ? `직업인 인터뷰 12명 사례비` : r.formula.includes('체험료') ? '학과·일터 체험 입장·체험료' : r.formula.includes('보험') ? '봉사 보험·활동 도구' : r.formula.includes('현수막') ? '발표회 현수막·인쇄물' : r.formula.includes('음향') ? '발표회 음향·영상 장비 임차' : '발표회 다과(보호자 포함)';
  return '';
};
const budgetTable = ['| 프로그램 | 계정 | 산출 근거 | 금액 | 닿는 회차·산출물 |', '|---|---|---|---|---|', ...d.budget.rows.map(r => `| ${r.program} | ${r.account} | ${r.formula} | ${won(r.amount)} | ${link(r)} |`)];
const directTotal = d.budget.rows.filter(r => !['운영', '인건비'].includes(r.program)).reduce((a, r) => a + r.amount, 0);
const b = d.budget;

// 3) 심사위원 질문별 본문 위치
const find = prefix => { const i = lines.findIndex(l => l.startsWith(prefix)); return i < 0 ? '(없음)' : `${prefix.slice(0, 24)}…`; };
const questions = [
  ['왜 이 사업이 필요한가?', '서식 3 §5-3 마지막 문단(학교 진로교육 운영 현황·체험처 거리), §7-1 「이 사업이 해결하려는 필요와 사업의 대응」 표', ['이 지역의 교육 문제는', '이 사업이 해결하려는 필요']],
  ['왜 이 청소년들인가?', '서식 3 §5-2 선발기준, §5-3 사회경제적 현황(저소득 29·이주배경 5·연계 요청 8)', ['참여 청소년은 교육적 지원이 우선 필요한', '참여 청소년 42명은 모두']],
  ['왜 이 기관이 수행해야 하는가?', '서식 3 §4-2 「이 센터가 이번 사업을 맡는 이유」, 서식 1 대표자 자기소개서', ['이 센터가 이번 사업을 맡는 이유', '정다온은']],
  ['왜 이 프로그램 방식인가?', '서식 3 §7-1 「운영 방법을 이렇게 정한 이유」, 「다른 진로체험 프로그램과 다른 점」', ['운영 방법을 이렇게 정한 이유', '다른 진로체험 프로그램과']],
  ['지원금으로 무엇이 달라지는가?', '서식 3 §6 교육목표 ①②③(측정 가능한 목표), §7-1 결과물, 서식 5 예산서', ['① 자기이해', '프로젝트 성과 및 결과물']],
  ['계획한 인력과 일정으로 운영 가능한가?', '서식 3 §8 교육 장소(요일·시간), §9 「공간과 일정」, 서식 4 담당 인력, 월별 표(달별 회차)', ['공간과 일정', '<서식 4>']]
];
const qLines = questions.map(([q, where, probes]) => `- **${q}** — ${where}. 본문 확인: ${probes.every(p => lines.some(l => l.includes(p))) ? '찾음' : '없음'}`);

// 4) 실제 기관 입력목록(안내서 §2·§4·§7을 그대로)
const guide = careerGuide({});
const section = (from, to) => guide.slice(guide.indexOf(from), to ? guide.indexOf(to) : undefined).trim();

// 5) 수치 점검
const f = orgFacts(d.s);
const sat = saturdaysIn('2027-08-01', '2027-10-31');
const checks = [
  `청소년 ${d.N}명 = 기관 내 ${d.own} + ${d.s.partner1} ${d.p1} + ${d.s.partner2} ${d.p2} (각 기관 등록 ${f.main.grade.reduce((a, c) => a + c, 0)}·${f.partner1.grade.reduce((a, c) => a + c, 0)}·${f.partner2.grade.reduce((a, c) => a + c, 0)}명 안)`,
  `반 ${d.C}개(${d.sizes.join('·')}명), 반마다 주강사 1명+보조강사 1명, 주강사는 센터 비상근 강사 ${f.main.part - 1}명 중 ${d.C}명`,
  `수업 요일: ${CLASS_DAYS.slice(0, d.C).map((x, i) => `${i + 1}반 ${x}`).join(', ')} 16:30~18:30(2시간). 센터 3시간 수업 ${d.C * 4}회는 8~10월 토요일 ${sat}번 × 활동실 2곳 = ${sat * 2}칸 안`,
  `한 반의 달별 수업: ${Object.entries(load).map(([m, n]) => `${m}월 ${n}회`).join(', ')} (최대 ${Math.max(...Object.values(load))}회)`,
  `총 ${d.sessions}회 = ${byTrack}`,
  `사업비 ${won(b.total)} = 직접사업비 ${won(directTotal)} + 운영비 ${won(b.admin - b.rows.filter(r => r.program === '인건비').reduce((a, r) => a + r.amount, 0))} + 인건비 ${won(b.rows.filter(r => r.program === '인건비').reduce((a, r) => a + r.amount, 0))}`,
  `비율: 인건비·운영비 ${(b.shares.admin * 100).toFixed(1)}% (한도 25%), 학습재료비 ${(b.shares.materials * 100).toFixed(1)}% (신규 30%), 체험·견학 ${(b.shares.outing * 100).toFixed(1)}% (한도 15%)`,
  `청소년 1인당 사업비 ${won(b.total / d.N)}, 기관 연 예산 대비 ${(b.total / Number(f.main.budget.replace(/,/g, '')) * 100).toFixed(1)}%`
];

fs.writeFileSync(path.join(out, '1_내용정합성_수치.md'), ['# 내용 정합성 — 계산한 값', '', ...checks.map(c => `- ${c}`), ''].join('\n'));
fs.writeFileSync(path.join(out, '2_22회_연결표.md'), ['# 22회 전체와 기여 영역', '', byTrack, '', ...sessionTable, ''].join('\n'));
fs.writeFileSync(path.join(out, '3_예산_연결표.md'), ['# 예산 항목과 회차·산출물의 연결', '', `신청액 ${won(b.total)}`, '', ...budgetTable, ''].join('\n'));
fs.writeFileSync(path.join(out, '4_심사위원_질문별_본문_위치.md'), ['# 심사위원 질문과 본문 위치', '', ...qLines, ''].join('\n'));
fs.writeFileSync(path.join(out, '5_실제기관_입력목록.md'), ['# 실제 기관 입력목록', '', '아래 값을 알려 주시면 문서의 같은 말이 한꺼번에 바뀝니다(안내서에서 가져온 것).', '', section('## 2. 대표님이 바꿀 곳', '## 3.'), '', section('## 4. 실제 사실을 확인해야 하는 것', '## 5.'), '', section('## 7. 가상 값과 확인 필요 항목'), ''].join('\n'));
console.log(checks.join('\n'));
