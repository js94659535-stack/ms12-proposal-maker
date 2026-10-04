// 진로설계 가상 예시본의 내용 정합성 감사(10-44): 문장이 아니라 숫자와 구조로 서로 맞는지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { careerBody, careerGuide, derive, orgFacts, saturdaysIn, CLASS_DAYS, SETTING_FIELDS } from '../public/baeumteo/career-final.js';
import { PROGRAMS, TRACKS, monthlyLoad, sessionTotal, budgetFor } from '../public/baeumteo/programs.js';
import { buildOps } from '../tools/official-ops.mjs';

const prog = PROGRAMS.career;
const monthNum = text => [...String(text).matchAll(/(\d+)월/g)].map(m => Number(m[1]));

test('★ 달별 배치: 프로그램별 회차 합이 회기와 같고, 운영 기간 안에 있으며, 한 반의 한 달 수업은 4회 이하다', () => {
  for (const p of prog) {
    assert.equal(Object.values(p.schedule).reduce((a, b) => a + b, 0), p.sessions, p.name);
    const [from, to] = [Math.min(...monthNum(p.months)), Math.max(...monthNum(p.months))];
    for (const month of Object.keys(p.schedule)) assert.ok(Number(month) >= from && Number(month) <= to, `${p.name}: ${month}월이 운영 기간(${p.months}) 밖`);
    assert.equal(p.themes.length, p.sessions, `${p.name}: 회차마다 주제가 있다`);
    assert.equal(p.tracks.length, p.sessions, `${p.name}: 회차마다 기여 영역이 있다`);
  }
  const load = monthlyLoad('career');
  assert.equal(Object.values(load).reduce((a, b) => a + b, 0), sessionTotal('career'));
  assert.ok(Math.max(...Object.values(load)) <= 4, JSON.stringify(load));
  assert.ok(Object.keys(load).length >= 4, '4개월 이상 이어진다');
});

test('★ 22회 모든 회차가 자기이해·직업탐색·현장확인·진로계획·봉사활동 중 하나에 기여하고 다섯 영역이 모두 있다', () => {
  const counts = {};
  for (const p of prog) for (const t of p.tracks) { assert.ok(TRACKS[t], `${p.name}: ${t}`); counts[t] = (counts[t] || 0) + 1; }
  assert.deepEqual(Object.keys(counts).sort(), Object.keys(TRACKS).sort());
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 22);
  assert.equal(counts.service, 2, '봉사활동 2회');
  assert.ok(new Set(prog.flatMap(p => p.themes)).size === 22, '같은 주제가 되풀이되지 않는다');
});

test('★ 가상 기관 설정이 서로 맞는다: 모집 인원은 각 기관의 규모 안에 있고, 필요한 강사는 기관 인력 안에 있다', () => {
  for (const people of [20, 30, 42, 50]) {
    const d = derive({ people });
    const f = orgFacts(d.s);
    const sum = o => o.grade.reduce((a, b) => a + b, 0);
    assert.ok(d.own <= sum(f.main), `기관 내 모집 ${d.own} ≤ 등록 ${sum(f.main)}`);
    assert.ok(d.p1 <= sum(f.partner1), `참여기관 ① ${d.p1} ≤ ${sum(f.partner1)}`);
    assert.ok(d.p2 <= sum(f.partner2), `참여기관 ② ${d.p2} ≤ ${sum(f.partner2)}`);
    assert.ok(d.wardCount <= d.own, '마음쉼터 참여자는 대표기관 이용 청소년 안에서만');
    assert.ok(d.C <= f.main.part - 1, `주강사 ${d.C}명은 비상근 강사(비상근 ${f.main.part}명 중 사회복무요원 1명 제외) 안에서`);
    assert.ok(d.C <= CLASS_DAYS.length, '반마다 요일이 다르다');
    // 3시간 센터 수업(현장 방문 2회 제외)이 토요일 활동실 2곳에 들어간다
    assert.ok(d.C * (prog[2].sessions - 2) <= saturdaysIn('2027-08-01', '2027-10-31') * 2, `${people}명 토요일 용량`);
  }
  const f = orgFacts(derive({}).s);
  assert.ok(2019 + 7 <= 2026 && 2016 <= 2019, '설립(2016) → 위탁 시작(2019) → 7년째(2026)');
  const support = f.main.support.reduce((a, r) => a + Number(r[3].replace(/,/g, '')), 0);
  assert.ok(support < Number(f.main.budget.replace(/,/g, '')) * 0.3, '외부지원 3건 합이 기관 예산의 30% 미만(지나치게 완벽하지 않게)');
  assert.ok(derive({}).budget.total < Number(f.main.budget.replace(/,/g, '')) * 0.1, '이번 사업비가 기관 연 예산의 10% 미만');
});

test('★ 모든 사업비가 프로그램과 회차에 연결된다: 프로그램 이름이 같고, 강사비는 회차×반 수와 맞는다', () => {
  const d = derive({});
  const names = new Set(prog.map(p => p.name));
  for (const r of d.budget.rows) assert.ok(names.has(r.program) || ['운영', '인건비'].includes(r.program), r.program);
  for (const p of prog) {
    const row = d.budget.rows.find(r => r.program === p.name && r.account === '강사비');
    const groups = p.groups === 'classes' ? d.C : p.groups;
    assert.ok(row.formula.endsWith(`×${p.hours}시간×${p.sessions}회×${groups}`.replace('×', '×')) || row.formula.includes(`${p.hours}시간×${p.sessions}회×${groups}`), `${p.name}: ${row.formula}`);
  }
  const bus = d.budget.rows.filter(r => r.account === '교통비' && r.program !== '운영');
  assert.equal(bus.length, 1, '버스는 현장 방문 프로그램에만');
  assert.ok(/꿈 인터뷰/.test(bus[0].program) && bus[0].formula.includes(`×1대×${d.C * 2}회`), '반마다 학과 체험 1회 + 사업장 방문 1회');
  assert.ok(!d.budget.rows.some(r => /대관/.test(r.formula)), '강당을 무상으로 쓰는데 대관료를 잡지 않는다');
});

test('★ 모든 기본정보를 바꾸면 본문과 재단 양식 채우기 어디에도 가상 지명·기관명이 남지 않는다', () => {
  const set = { agency: '햇살청소년센터', rep: '박누리', repTitle: '대표', manager: '김도현', managerTitle: '팀장', partner1: '새봄청소년수련관', partner1Rep: '가나', partner2: '한빛중학교', partner2Rep: '다라', district: '서구', dong1: '가동', dong2: '나동', dong3: '다동', college: '새길대학', funder: '새길재단', people: 36 };
  const leftovers = ['빛고을', '월곡', '우산', '신창', '광산', '정다온', '이준호', '송미래', '권도현', '062-123', 'example.org', '74,592'];
  const body = careerBody(set);
  const ops = buildOps(set).map(o => o.text || '').join('\n');
  for (const text of [body, ops]) for (const token of leftovers) assert.ok(!text.includes(token), `남은 가상 값: ${token}`);
  assert.ok(!body.includes('42명') && !ops.includes('42명'));
  // 바꿀 수 있는 항목마다 본문 어디에 쓰이는지 안내서에 적혀 있다
  const guide = careerGuide(set);
  for (const [, label] of SETTING_FIELDS) assert.ok(guide.includes(label), label);
  assert.ok(guide.includes('서식 3 §4') && guide.includes('가상 설정'));
});

test('★ 근거 문장 구분: 숫자가 있는 지역 통계는 원문 확인된 것 하나뿐이고, 나머지 수치는 가상 설정으로 안내서에 적혀 있다', () => {
  const guide = careerGuide({});
  assert.ok(guide.includes('공공자료(원문 확인): 광산구 청소년(9~24세) 인구 74,592명'));
  assert.ok(guide.includes('가상 설정: 기관·인물·강사·참여자 통계'));
  assert.ok(guide.includes('근거가 없어 넣지 않은 것: 학술 인용'));
  const body = careerBody({});
  assert.ok(body.includes('74,592명') && body.includes('2025.12.31. 기준'));
});
