// 협력기관을 모으며 쓰는 계획서 (10-05 → 10-07). 재단 공개 양식과 FAQ의 규정을 하나씩 검증한다.
// 기관이 하나도 없어도 끝까지 읽히고, 이름이 들어오면 그 자리만 바뀐다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FUND, PROJECTS, planText, pitchText, capOf, unionSize, budgetPlan, minSessionsOf, optimalInput } from '../public/baeumteo/plan.js';
import { PROGRAMS, RULES, budgetFor, sessionTotal } from '../public/baeumteo/programs.js';
import { detailedPlan, monthlyThemes, monthsOf } from '../public/baeumteo/detail.js';

const byId = id => PROJECTS.find(project => project.id === id);

test('★ 기관이 하나도 정해지지 않아도 요약본과 상세본이 끝까지 읽힌다', () => {
  for (const project of PROJECTS) {
    for (const text of [planText(project, {}), detailedPlan(project, {}), pitchText(project, {})]) {
      assert.ok(!/undefined|NaN|\[object|Infinity/.test(text), `${project.id}: 깨진 값`);
      assert.ok(text.includes('섭외 중') || text.includes('선정 중'), `${project.id}: 빈 자리 표시`);
    }
  }
});

test('★ 학생 1인 교육 횟수가 재단 기준 이상이다 — 진로설계만 12회, 나머지 35회. 자치회의는 세지 않는다', () => {
  for (const project of PROJECTS) {
    const total = sessionTotal(project.id);
    assert.ok(total >= minSessionsOf(project), `${project.id}: ${total}회`);
    for (const program of PROGRAMS[project.id]) {
      assert.equal(program.themes.length, program.sessions, `${project.id}/${program.name}: 주제 수`);
      assert.ok(program.themes.every(theme => !/자치회의/.test(theme)), `${project.id}/${program.name}: 자치회의는 교육 횟수에 넣지 않는다`);
    }
  }
  assert.equal(minSessionsOf(byId('career')), 12);
  assert.ok(sessionTotal('career') >= 12 && sessionTotal('career') < 35);
  for (const id of ['humanities', 'culture', 'migrant', 'community']) assert.equal(sessionTotal(id), 35);
});

test('봉사활동 2회가 필수인 유형에는 봉사활동이 정확히 2회 있다(진로설계 제외)', () => {
  for (const project of PROJECTS.filter(p => p.id !== 'career')) {
    const service = PROGRAMS[project.id].filter(program => /^봉사활동/.test(program.name)).reduce((n, p) => n + p.sessions, 0);
    assert.equal(service, 2, `${project.id}: 봉사활동 ${service}회`);
  }
});

test('★ 예산이 재단 규정을 지킨다 — 강사비 6만 원 이하, 한도 이하, 인건비·운영비·학습재료비 비율', () => {
  for (const project of PROJECTS) {
    const budget = budgetPlan(project, {});
    assert.ok(budget.total <= capOf(project, {}), `${project.id}: 신청액 ${budget.total} > 한도`);
    assert.deepEqual(budget.warnings, [], `${project.id}: ${budget.warnings}`);
    const adminCap = project.id === 'community' ? RULES.adminShareCommunity : RULES.adminShare;
    assert.ok(budget.shares.admin <= adminCap, `${project.id}: 인건비·운영비 ${budget.shares.admin}`);
    assert.ok(budget.shares.materials <= RULES.materialsShare, `${project.id}: 학습재료비 ${budget.shares.materials}`);
    for (const row of budget.rows.filter(r => r.account === '강사비')) {
      const hourly = Number(/주강사 ([\d,]+)원×/.exec(row.formula)[1].replace(/,/g, ''));
      assert.ok(hourly <= RULES.hourlyMax, `${project.id}: 강사비 시간당 ${hourly}`);
    }
    assert.equal(budget.rows.reduce((s, r) => s + r.amount, 0), budget.total);
  }
});

test('인원이 늘어 한도를 넘으면 예산이 경고한다', () => {
  assert.ok(budgetFor('humanities', 120, { cap: 30_000_000 }).warnings.length > 0);
});

test('이주배경은 청소년 ITQ 과정을, 지역공동체는 공동 교육과정을 갖는다', () => {
  assert.ok(PROGRAMS.migrant.some(program => /ITQ/.test(program.name)));
  const community = PROGRAMS.community.map(p => p.name).join(' ');
  assert.match(community, /연합동아리/);
  assert.match(community, /공동 교육과정/);
  assert.ok(byId('community').lockNote.includes('3개 이상'));
  assert.ok(byId('community').lockNote.includes('강사를 기관별로 파견하는 방식은 지원하지 않습니다'));
});

test('이주배경은 연합 5곳 이상이어야 한도가 1억 5천만 원으로 오른다', () => {
  const migrant = byId('migrant');
  assert.equal(capOf(migrant, {}), 50_000_000);
  const input = { lead: '가', partners: { p1: '나', p2: '다', p3: '라' } };
  assert.equal(unionSize(migrant, input), 4);
  assert.equal(capOf(migrant, input), 50_000_000);
  input.partners.p4 = '마';
  assert.equal(capOf(migrant, input), 150_000_000);
});

test('이름이 들어오면 그 자리만 바뀌고 나머지는 섭외 중으로 남는다', () => {
  const text = detailedPlan(byId('culture'), { lead: '벧엘지역아동센터', partners: { p1: '가나지역아동센터' } });
  assert.ok(text.includes('대표기관 벧엘지역아동센터'));
  assert.ok(text.includes('가나지역아동센터'));
  assert.ok(!text.includes('〔대표기관 선정 중〕'));
  assert.ok(text.includes('섭외 중'));
});

test('★ 상세본은 재단 양식의 서식 1~5와 유형별 항목 순서를 따른다', () => {
  const mustHave = ['<서식 1>', '<서식 2>', '<서식 3>', '<서식 4>', '<서식 5>', '1) 모집 계획', '2) 선발기준', '교육목표', '운영 개요', '핵심 교육내용', '교육 장소', '기반 활동'];
  for (const project of PROJECTS) {
    const text = detailedPlan(project, {});
    for (const part of mustHave) assert.ok(text.includes(part), `${project.id}: ${part}`);
    if (project.id !== 'community') assert.ok(text.includes('사회경제적 현황'), `${project.id}: 사회경제적 현황`);
  }
  const order = (text, ...parts) => parts.map(part => text.indexOf(part)).every((at, i, all) => at >= 0 && (i === 0 || at > all[i - 1]));
  assert.ok(order(detailedPlan(byId('humanities'), {}), '4. 참여 예정', '5. 교육목표', '6. 교육프로그램', '7. 교육 장소', '8. 효과적인'), '미래형 번호 순서');
  assert.ok(order(detailedPlan(byId('migrant'), {}), '4. 지역 교육자원 현황', '5. 참여 예정', '6. 교육목표', '7. 교육프로그램', '8. 교육 장소', '9. 효과적인'), '맞춤형 번호 순서');
  const community = detailedPlan(byId('community'), {});
  assert.ok(order(community, '2. 사업의 필요성', '3) 3년 후 기대하는 변화·성과', '3. 교육 기간', '9. 사업 운영 조직도'), '연결형 번호 순서');
  assert.ok(community.includes('종교 의례'));
});

test('월별 핵심 교육내용은 모든 회차 주제를 빠짐없이 한 번씩 담는다', () => {
  for (const project of PROJECTS) {
    for (const program of PROGRAMS[project.id]) {
      assert.deepEqual(monthlyThemes(program).flatMap(([, themes]) => themes), program.themes, `${project.id}/${program.name}`);
    }
  }
  assert.deepEqual(monthsOf('12월~1월'), [12, 1]);
  assert.deepEqual(monthsOf('10월, 1월'), [10, 1]);
  assert.equal(monthsOf('3월~11월').length, 9);
});

test('예산서의 프로그램 이름은 6-2 핵심 교육내용의 프로그램 이름과 같다', () => {
  for (const project of PROJECTS) {
    const names = new Set(PROGRAMS[project.id].map(p => p.name));
    for (const row of budgetPlan(project, {}).rows.filter(r => r.program !== '운영' && r.program !== '인건비')) assert.ok(names.has(row.program), `${project.id}: ${row.program}`);
  }
});

test('진로설계는 학교폭력 특별교육 실적을 쓰되 조치 이력 비구분과 대상 적합성 위험을 알린다', () => {
  const career = byId('career');
  const text = detailedPlan(career, {});
  assert.ok(text.includes('학교폭력 특별교육을 7년째'));
  assert.ok(text.includes('조치 이력은 사업 서류에 적지 않고 구분하지 않는다'));
  assert.ok(career.lockNote.includes('대상 적합성'));
});

test('섭외 요약은 1기관 1사업 규칙과 마감, 기관연동, PDF 제출을 먼저 알린다', () => {
  for (const project of PROJECTS) {
    const text = pitchText(project, {});
    assert.ok(text.includes('다른 사업에는 참여할 수 없습니다'));
    assert.ok(text.includes('2026. 11. 11.'));
    assert.ok(text.includes('기관연동'));
    assert.ok(text.includes('PDF'));
  }
  assert.equal(FUND.minSessions, 35);
});

test('진로설계는 20~50명 어느 규모든 한도(2천5백만 원)와 비율 규정 안에서 예산이 나온다', () => {
  const career = byId('career');
  assert.deepEqual(career.peopleRange, [20, 50]);
  for (const count of [20, 30, 40, 50]) {
    const budget = budgetPlan(career, { people: count });
    assert.ok(budget.total <= capOf(career, {}), `${count}명: ${budget.total}`);
    assert.deepEqual(budget.warnings, [], `${count}명: ${budget.warnings}`);
  }
  assert.match(detailedPlan(career, { people: 50 }), /4개 반/);
});

test('★ 가상 최적 조건: 모든 칸이 채워지고 모든 가상 값에 표시가 붙으며 규정과 한도를 지킨다', () => {
  for (const project of PROJECTS) {
    const input = optimalInput(project);
    const text = detailedPlan(project, input);
    assert.ok(text.includes('경고: 〔가상〕 표시는 예시로 지어낸 값이며 사실이 아니다'), `${project.id}: 경고 문구`);
    assert.ok(text.includes('〔가상〕'), `${project.id}: 가상 표시`);
    const left = text.match(/\[확인 필요[^\]]*\]/g) || [];
    assert.deepEqual(left, [], `${project.id}: 남은 확인 필요 ${left}`);
    assert.ok(!text.includes('섭외 중') && !text.includes('선정 중'), `${project.id}: 빈 자리`);
    const budget = budgetPlan(project, input);
    assert.ok(budget.total <= capOf(project, input), `${project.id}: ${budget.total} > ${capOf(project, input)}`);
    assert.deepEqual(budget.warnings, [], `${project.id}: ${budget.warnings}`);
  }
  const migrant = byId('migrant');
  assert.equal(unionSize(migrant, optimalInput(migrant)), 5);
  assert.equal(capOf(migrant, optimalInput(migrant)), 150_000_000);
});

test('가상 값은 켠 때만 나온다 — 기본 출력에는 〔가상〕이 없다', () => {
  for (const project of PROJECTS) assert.ok(!detailedPlan(project, {}).includes('〔가상〕'), project.id);
});
