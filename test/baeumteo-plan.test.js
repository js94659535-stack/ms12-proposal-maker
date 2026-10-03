// 협력기관을 모으며 쓰는 계획서 (10-05 → 10-07). 재단 공개 양식과 FAQ의 규정을 하나씩 검증한다.
// 기관이 하나도 없어도 끝까지 읽히고, 이름이 들어오면 그 자리만 바뀐다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FUND, PROJECTS, planText, pitchText, capOf, unionSize, budgetPlan, minSessionsOf, optimalInput, CHECKLIST } from '../public/baeumteo/plan.js';
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
    assert.ok(budget.shares.outing <= RULES.outingShare, `${project.id}: 체험·견학성 지출 ${budget.shares.outing}`);
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
  assert.ok(text.includes('대표기관 | 벧엘지역아동센터'), '서식 1 명단 표의 대표기관 행');
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
  assert.match(detailedPlan(career, { people: 50 }), /3개 반\(반당 17명 이하\)/);
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

// 같은 주소로 내용이 바뀌는 모듈은 브라우저 캐시에서 옛것과 새것이 섞여 화면이 비었다(10-08).
// 모듈끼리 부르는 주소에 같은 버전 표시를 붙이고, 캐시를 매번 확인하게 하는 헤더를 둔다.
import fs from 'node:fs';
test('단독 화면의 모듈 주소는 같은 버전 표시를 갖고 캐시 헤더가 있다', () => {
  const dir = new URL('../public/baeumteo/', import.meta.url);
  const versions = new Set();
  for (const name of ['index.html', 'plan.js', 'detail.js', 'programs.js']) {
    const text = fs.readFileSync(new URL(name, dir), 'utf8');
    for (const match of text.matchAll(/from '\.\/([\w-]+\.js)(\?v=[\w-]+)?'/g)) {
      assert.ok(match[2], `${name}: ${match[1]}에 버전 표시가 없다`);
      versions.add(match[2]);
    }
  }
  assert.equal(versions.size, 1, `버전 표시가 여러 가지다: ${[...versions]}`);
  const headers = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /\/baeumteo\/\*\s+Cache-Control: no-cache/);
});

test('문화예술 AI동화는 15명씩 3개 반, 45명으로 3천만 원 한도 안에서 나온다', () => {
  const culture = byId('culture');
  const budget = budgetPlan(culture, {});
  assert.match(detailedPlan(culture, {}), /전체 45명을 3개 반/);
  assert.ok(budget.total <= 30_000_000, `${budget.total}`);
  assert.deepEqual(budget.warnings, []);
});

test('제출 전 점검표는 여섯 영역이고 각각 완료 조건 문장을 갖는다', () => {
  assert.equal(CHECKLIST.length, 6);
  assert.deepEqual(CHECKLIST.map(([name]) => name), ['기관', '대상 학생', '교육과정', '운영 실적', '예산', '제출 서류']);
  assert.ok(CHECKLIST.every(([, condition]) => condition.length > 15));
});

test('★ 진행비도 서식 5처럼 단가×수량 산출식이다 — 「1식」이 없고 모든 줄에 두 수가 곱해진다', () => {
  for (const project of PROJECTS) {
    for (const row of budgetPlan(project, optimalInput(project)).rows) {
      assert.ok(!/1식/.test(row.formula), `${project.id}: ${row.formula}`);
      assert.ok(/[\d,]+원×/.test(row.formula) || /×/.test(row.formula), `${project.id}: ${row.account} ${row.formula}`);
    }
  }
});

test('★ 학생 한 명이 같은 시간에 두 번 강사비가 나가지 않는다 — 프로그램 회차가 서로 겹치지 않는다', () => {
  for (const project of PROJECTS) {
    const sessions = PROGRAMS[project.id].reduce((n, p) => n + p.sessions, 0);
    assert.equal(sessions, sessionTotal(project.id));
    const seen = new Set();
    for (const program of PROGRAMS[project.id]) for (const theme of program.themes) {
      const key = `${program.name}|${theme}`;
      assert.ok(!seen.has(key), `${project.id}: 같은 회차가 두 번 ${key}`);
      seen.add(key);
    }
  }
});

test('대상 적합성은 수행 역량과 따로 쓴다 — 읍면동·직종은 필요 설명이지 대상 확정이 아니다', () => {
  for (const project of PROJECTS) {
    assert.match(detailedPlan(project, {}), /지원 대상 여부가 정해지지 않는다/);
  }
  const career = detailedPlan(byId('career'), {});
  assert.match(career, /수행 역량의 근거이며 이번 참여 청소년의 대상 적합성을 대신하지 않는다/);
  assert.match(byId('career').leadHint, /수행 역량/);
});

// ---------- 사실 질문 · 점검 · 연동 (10-13) ----------
import { factList, factKeys, reviewPlan, quantities, resolveFacts } from '../public/baeumteo/detail.js';

test('★ 질문 목록은 문서의 빈칸에서 나오고, 답을 넣으면 그 칸만 그 답으로 바뀐다', () => {
  for (const project of PROJECTS) {
    const keys = factKeys(project);
    assert.ok(keys.length >= 10, `${project.id}: 질문 ${keys.length}개`);
    const before = detailedPlan(project, {});
    assert.ok(before.includes('[확인 필요: 사회경제적 배경]'), `${project.id}: 사회경제 빈칸`);
    const after = detailedPlan(project, { facts: { who: '월곡동 임대아파트 거주 학생이 많다.' } });
    assert.ok(after.includes('월곡동 임대아파트 거주 학생이 많다.'));
    assert.ok(!after.includes('[확인 필요: 사회경제적 배경]'));
    assert.ok(after.includes('[확인 필요: 거주 지역(읍면동)]'), '답하지 않은 칸은 그대로 남는다');
    assert.equal(factList(project, { facts: { who: '답' } }).filter(item => item.answered).length, 1);
  }
});

test('모든 사실에 답하면 확인 필요가 하나도 남지 않고, 가상 표시도 붙지 않는다', () => {
  for (const project of PROJECTS) {
    const facts = Object.fromEntries(factKeys(project).map(key => [key, `답-${key}`]));
    const text = detailedPlan(project, { facts });
    assert.deepEqual(text.match(/\[확인 필요[^\]]*\]/g) || [], [], project.id);
    assert.ok(!text.includes('〔가상〕'), project.id);
    assert.ok(!/\{\{\w+\}\}/.test(text), `${project.id}: 풀리지 않은 토큰`);
  }
});

test('사용자 답이 가상 값보다 우선한다', () => {
  const humanities = byId('humanities');
  const text = detailedPlan(humanities, { ...optimalInput(humanities), facts: { area: '광주 광산구 월곡동' } });
  assert.ok(text.includes('광주 광산구 월곡동'));
  assert.ok(!text.includes('광주광역시 광산구 ○○동·○○동(가칭)'));
  assert.ok(text.includes('〔가상〕'), '답하지 않은 칸은 가상으로 남는다');
});

test('★ 점검: 인원 미달·한도 초과·가상 잔존·지역공동체 3곳 미만을 오류로 잡는다', () => {
  const levels = (project, input) => reviewPlan(project, input).filter(item => item.level === '오류').map(item => item.message);
  assert.ok(levels(byId('humanities'), { people: 10 }).length === 0, '인원은 최소 15명으로 보정된다');
  assert.ok(levels(byId('humanities'), { people: 120 }).some(text => text.includes('한도')));
  assert.ok(levels(byId('culture'), optimalInput(byId('culture'))).some(text => text.includes('가상 값')));
  assert.ok(levels(byId('community'), {}).some(text => text.includes('3개 이상 기관')));
  const ready = reviewPlan(byId('humanities'), {});
  assert.ok(ready.some(item => item.level === '확인' && item.message.includes('미확인 사실')));
  assert.ok(ready.some(item => item.message.includes('한 기관은 한 사업만')));
});

test('이주배경 점검은 5곳 연합이 필수가 아니라고 알린다', () => {
  const notes = reviewPlan(byId('migrant'), {}).filter(item => item.level === '안내').map(item => item.message).join(' ');
  assert.match(notes, /5개 이상 기관이 연합해야 하는 것은 1억 5천만 원까지 키울 때뿐/);
});

test('★ 학생 수가 바뀌면 반 수·산출물·재료 수량·예산·성과 목표가 함께 바뀐다', () => {
  const culture = byId('culture');
  const a = detailedPlan(culture, { people: 30 });
  const b = detailedPlan(culture, { people: 45 });
  assert.match(a, /2개 반/); assert.match(b, /3개 반/);
  assert.match(a, /개인 원고 30편/); assert.match(b, /개인 원고 45편/);
  assert.match(a, /팀별 그림책 6권\(팀당 30부 인쇄\)/); assert.match(b, /팀별 그림책 9권\(팀당 45부 인쇄\)/);
  assert.match(a, /\(6팀×30부\)/); assert.match(b, /\(9팀×45부\)/);
  assert.match(a, /학생 26명 이상/); assert.match(b, /학생 39명 이상/);
  assert.ok(budgetPlan(culture, { people: 30 }).total < budgetPlan(culture, { people: 45 }).total);
  assert.deepEqual(quantities(byId('career'), 20).length, 2);
});

test('resolveFacts는 토큰만 바꾸고 나머지 문장은 건드리지 않는다', () => {
  const out = resolveFacts('앞 {{area}} 뒤', byId('humanities'), { facts: { area: '월곡동' } });
  assert.equal(out, '앞 월곡동 뒤');
});

// ---------- 추진 조합 제안 · 변경 내역 (10-15) ----------
import { COMBOS, CRITERIA, comboText } from '../public/baeumteo/combos.js';
import { changeLog } from '../public/baeumteo/detail.js';

test('★ 사업마다 조합이 1안과 대안 2안이고, 다섯 기준의 상·중·하 비교와 이유·위험을 갖는다', () => {
  assert.deepEqual(Object.keys(COMBOS).sort(), PROJECTS.map(p => p.id).sort());
  assert.equal(CRITERIA.length, 5);
  for (const project of PROJECTS) {
    const options = COMBOS[project.id];
    assert.equal(options.length, 3, project.id);
    assert.match(options[0].name, /^1안/);
    assert.match(options[1].name, /^대안 A/);
    assert.match(options[2].name, /^대안 B/);
    for (const option of options) {
      assert.equal(option.rate.length, 5);
      assert.ok(option.rate.every(r => ['상', '중', '하'].includes(r)), `${project.id}/${option.name}`);
      assert.ok(option.why.length > 15 && option.risk.length > 15, `${project.id}/${option.name}: 이유·위험`);
      assert.ok(option.partners.length >= 1);
    }
    assert.ok(comboText(project.id).includes('위험:'));
  }
});

test('조합 제안은 규정과 어긋나는 제안을 하지 않는다 — 지역공동체 종단은 협력, 이주배경 5곳은 선택', () => {
  const community = COMBOS.community[0];
  assert.ok(community.partners.some(line => /^협력.*사찰.*교회/.test(line)), '종단은 참여기관이 아니라 협력');
  assert.ok(community.partners.some(line => /학생 등록 배움터 2곳 이상/.test(line)));
  assert.match(COMBOS.migrant[1].why, /5곳 연합은 필수가 아니다/);
  assert.match(COMBOS.migrant[0].risk, /기관 이름 5개만으로는 규모를 정당화하지 못한다/);
  assert.match(COMBOS.career[0].risk, /대상 적합성을 대신하지 않는다/);
  for (const project of PROJECTS) for (const option of COMBOS[project.id]) {
    assert.ok(!/확정|수락했다|참여하기로/.test(option.lead + option.partners.join('')), `${project.id}/${option.name}: 참여 의사를 확정처럼 썼다`);
  }
});

test('★ 가상본이 센터 3곳·45명인데 실제는 센터 2곳·30명이면 이름만이 아니라 반·산출물·예산·성과 목표가 바뀐다', () => {
  const culture = byId('culture');
  const actual = { lead: '벧엘지역아동센터', partners: { p1: '가나지역아동센터' }, people: '30' };
  const rows = changeLog(culture, actual);
  const find = what => rows.find(row => row.what === what);
  assert.deepEqual([find('참여 인원').from, find('참여 인원').to], ['45명', '30명']);
  assert.deepEqual([find('반 수').from, find('반 수').to], ['3개', '2개']);
  assert.ok(find('연합 기관 수(이름이 정해진 곳)'));
  assert.ok(find('신청액'));
  assert.ok(find('산출물 수량').to.includes('개인 원고 30편'));
  assert.ok(find('성과 목표').to.includes('26명'));
});

test('가상 최적 그대로면 달라진 것이 없다', () => {
  for (const project of PROJECTS) assert.deepEqual(changeLog(project, optimalInput(project)), [], project.id);
});

// ---------- 실제 기관정보에 따른 조합 재평가 (10-16, 진로설계 기준 사례) ----------
import { SCENARIOS, recommendCombos, applyCombo, evaluateCombo, normalizeOrg } from '../public/baeumteo/orgs.js';
import { OPTIMAL_PEOPLE } from '../public/baeumteo/plan.js';
import { programsOf, careerWindow } from '../public/baeumteo/detail.js';

const career = () => byId('career');
const planned = OPTIMAL_PEOPLE.career;

test('★ 기관이 충분하면 필수 조건을 모두 채운 조합이 추천되고, 모든 판단에 근거 문장이 붙는다', () => {
  const { combos } = recommendCombos(career(), SCENARIOS.sufficient[1], planned);
  const best = combos[0];
  assert.equal(best.status, '실행 가능');
  assert.equal(best.students, 42);
  for (const combo of combos) for (const check of combo.checks) {
    assert.ok(['충족', '미충족', '미확인', '안내'].includes(check.result));
    assert.ok(check.basis.length > 8, `${combo.label}/${check.item}: 근거`);
    assert.ok(!/^(상|중|하)$/.test(check.result), '상·중·하로 확정하지 않는다');
  }
  assert.ok(best.checks.some(check => check.item === '모집 가능 학생' && /42명 = /.test(check.basis)), '합계의 산식');
  assert.ok(combos.some(combo => combo.status === '조건부 가능'), '증빙이 일부뿐인 기관 대표는 조건부');
});

test('★ 모집 가능 인원이 15명 미만이면 모든 조합이 불가이고 적용할 수 없다', () => {
  const { combos } = recommendCombos(career(), SCENARIOS.shortage[1], planned);
  assert.ok(combos.length > 0);
  assert.ok(combos.every(combo => combo.status === '불가'), combos.map(c => c.status).join());
  assert.ok(combos.every(combo => combo.checks.some(check => check.required && check.result === '미충족' && check.item === '모집 가능 학생')));
});

test('★ 자격·의사·기간이 비어 있으면 판단 보류이고 실행 가능으로 추천하지 않는다', () => {
  const { combos, excluded } = recommendCombos(career(), SCENARIOS.unconfirmed[1], planned);
  assert.ok(combos.every(combo => combo.status !== '실행 가능'), combos.map(c => c.status).join());
  assert.ok(combos.some(combo => combo.status === '판단 보류'));
  assert.ok(excluded.some(e => e.name.includes('E기관') && /참여 의사가 없다/.test(e.reason)), '참여 의사 없음은 제외');
  assert.ok(excluded.some(e => e.name.includes('D단체') && /대표기관으로는 제외/.test(e.reason)), '비영리가 아니면 대표 제외');
  assert.ok(combos.every(combo => !combo.lead.includes('D단체')), '비영리 아님이 대표가 되지 않는다');
  const hold = combos.find(combo => combo.status === '판단 보류');
  assert.ok(hold.checks.some(check => check.required && check.result === '미확인'));
});

test('정보가 없는 항목을 지어내지 않는다 — 기관 정보가 없으면 조합도 없다', () => {
  assert.equal(recommendCombos(career(), [], planned).combos.length, 0);
  const lone = evaluateCombo(career(), { name: '기관' }, [], planned);
  assert.equal(lone.status, '판단 보류');
  assert.ok(lone.checks.filter(check => check.required).every(check => check.result === '미확인'));
  assert.equal(normalizeOrg({ students: '' }).students, null);
});

test('진로설계는 운영 가능 기간이 4개월 미만이면 불가다', () => {
  const orgs = [{ name: 'A', nonprofit: 'yes', students: 20, months: 3, intent: 'confirmed' }];
  const result = recommendCombos(career(), orgs, planned).combos[0];
  assert.equal(result.status, '불가');
  assert.ok(result.checks.some(check => check.item === '운영 가능 기간' && check.result === '미충족'));
});

test('지역공동체는 3곳 미만이거나 학생이 등록된 배움터가 2곳 미만이면 불가다', () => {
  const community = byId('community');
  const two = [{ name: 'A', nonprofit: 'yes', students: 20, intent: 'confirmed', months: 11 }, { name: 'B', nonprofit: 'yes', students: 20, intent: 'confirmed', months: 11 }];
  assert.equal(recommendCombos(community, two, 90).combos[0].status, '불가');
  const noStudents = [...two, { name: 'C', nonprofit: 'yes', students: 0, intent: 'confirmed', months: 11 }].map((o, i) => (i === 1 ? { ...o, students: 0 } : o));
  const bad = recommendCombos(community, noStudents, 90).combos.find(combo => combo.members.length === 3);
  assert.equal(bad.status, '불가');
});

test('★ 추천 조합을 적용하면 기관·인원·일정·역할·예산·성과 목표가 함께 바뀌고 이유가 변경 내역에 남는다', () => {
  const orgs = SCENARIOS.sufficient[1];
  const { combos } = recommendCombos(career(), orgs, planned);
  const result = applyCombo(career(), combos[0], orgs, planned);
  const input = { ...result };
  assert.equal(input.lead, combos[0].lead);
  assert.equal(input.people, '42');
  assert.equal(input.applied.months, 6);
  const text = detailedPlan(career(), input);
  assert.match(text, /기관별 역할\(실제 기관 정보 기준\)/);
  assert.match(text, /학생 \d+명 모집/);
  assert.match(text, /2027년 5월부터 2027년 10월까지\(6개월/, '일정이 6개월로 줄었다');
  assert.equal(careerWindow(input), 6);
  assert.notDeepEqual(programsOf(career(), input).map(p => p.months), PROGRAMS.career.map(p => p.months), '프로그램 달 표시가 줄었다');
  assert.match(text, /연 18회 이상 출석하는 학생 36명 이상/, '성과 목표가 인원 42명에 맞춰 바뀜');
  const rows = changeLog(career(), input);
  const why = what => rows.find(row => row.what === what)?.why || '';
  assert.match(why('참여 인원'), /확보 가능한 학생 합계 42명/);
  assert.match(why('연합 기관 수(이름이 정해진 곳)'), /선택한 조합의 기관 수/);
  assert.match(why('교육 기간'), /6개월/);
  assert.match(why('신청액'), /단가×수량/);
  assert.ok(rows.some(row => row.what === '기관별 역할'));
  assert.ok(budgetPlan(career(), input).total <= capOf(career(), input));
  assert.ok(reviewPlan(career(), input).some(item => item.level === '오류' && item.message.includes('가상 값')), '가상 기관이므로 제출 전 오류로 잡는다');
});

test('인원 부족 조합은 적용 때 인원이 확보 가능 인원으로 줄고, 모르는 기관이 있으면 인원을 정하지 않는다', () => {
  const few = [{ name: 'A', nonprofit: 'yes', students: 18, staff: 2, venue: 'yes', months: 7, intent: 'confirmed', proof: 'yes' }];
  const combo = recommendCombos(career(), few, planned).combos[0];
  assert.equal(applyCombo(career(), combo, few, planned).people, '18');
  const unknown = [{ name: 'A', nonprofit: 'yes', students: '', months: 7, intent: 'confirmed' }];
  const hold = recommendCombos(career(), unknown, planned).combos[0];
  assert.equal(applyCombo(career(), hold, unknown, planned).people, '');
});
