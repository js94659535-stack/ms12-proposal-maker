// 협력기관을 모으며 쓰는 계획서 (10-05). 기관이 하나도 없어도 끝까지 읽히고, 이름이 들어오면 그 자리만 바뀐다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FUND, PROJECTS, planText, pitchText, budgetRows, capOf, unionSize } from '../public/baeumteo/plan.js';

const CRITERIA = ['1. 배움터 및 담당인력', '2. 참여 아동·청소년의 적합성', '3. 교육복지사업의 필요성', '4. 사업 내용과 운영 계획', '5. 네트워킹과 협력 체계', '6. 예산편성의 타당성'];

test('★ 기관이 하나도 정해지지 않아도 여섯 항목이 모두 있는 계획서가 나온다', () => {
  for (const project of PROJECTS) {
    const text = planText(project, {});
    for (const heading of CRITERIA) assert.ok(text.includes(heading), `${project.id}: ${heading} 없음`);
    assert.ok(!/undefined|NaN|\[object/.test(text), `${project.id}: 깨진 값`);
    assert.ok(text.includes('〔대표기관 선정 중〕'));
    assert.ok(text.includes('섭외 중'));
  }
});

test('요강 숫자를 지킨다 — 15명 이상, 연 35회 이상, 예산 합이 신청액', () => {
  for (const project of PROJECTS) {
    const text = planText(project, { people: 3 });
    assert.ok(Number(/참여 아동·청소년: (\d+)명/.exec(text)[1]) >= FUND.minPeople, `${project.id}: 15명 미만`);
    assert.ok(Number(/1인당 연 (\d+)회 교육/.exec(text)[1]) >= FUND.minSessions, `${project.id}: 35회 미만`);
    assert.equal(budgetRows(project).reduce((sum, row) => sum + row[1], 0), capOf(project), `${project.id}: 예산 합 불일치`);
  }
});

test('이름이 들어오면 그 자리만 바뀌고 나머지는 섭외 중으로 남는다', () => {
  const culture = PROJECTS.find(project => project.id === 'culture');
  const text = planText(culture, { lead: '벧엘지역아동센터', partners: { p1: '가나지역아동센터' } });
  assert.ok(text.includes('대표기관: 벧엘지역아동센터'));
  assert.ok(text.includes('가나지역아동센터'));
  assert.ok(!text.includes('〔대표기관 선정 중〕'));
  assert.ok(text.includes('섭외 중'), '이름 없는 자리는 남아 있어야 한다');
});

test('이주배경은 연합 5곳 이상이어야 한도가 1억 5천만 원으로 오른다', () => {
  const migrant = PROJECTS.find(project => project.id === 'migrant');
  assert.equal(capOf(migrant, {}), 50_000_000);
  const input = { lead: '가', partners: { p1: '나', p2: '다', p3: '라' } };
  assert.equal(unionSize(migrant, input), 4);
  assert.equal(capOf(migrant, input), 50_000_000);
  input.partners.p4 = '마';
  assert.equal(capOf(migrant, input), 150_000_000);
});

test('섭외 요약은 1기관 1사업 규칙과 마감을 먼저 알린다', () => {
  for (const project of PROJECTS) {
    const text = pitchText(project, {});
    assert.ok(text.includes('다른 사업에는 참여할 수 없습니다'), `${project.id}: 중복 불가 안내 없음`);
    assert.ok(text.includes('2026. 11. 11.'));
    assert.ok(text.includes('기관연동'));
  }
});

test('지역공동체는 종교 의례를 넣지 않고 종단을 참여기관이 아닌 탐방 장소 협력으로 둔다', () => {
  const community = PROJECTS.find(project => project.id === 'community');
  assert.ok(planText(community, {}).includes('종교 의례 참여는 포함하지 않는다'));
  assert.ok(community.slots.find(slot => /문화유산 장소/.test(slot.role)).role.startsWith('협력'));
});

test('진로설계는 학교폭력 특별교육 실적을 근거로 쓰되 대상 적합성 위험을 알린다', () => {
  const career = PROJECTS.find(project => project.id === 'career');
  const text = planText(career, {});
  assert.ok(text.includes('학교폭력 가해학생 특별교육 7년째'));
  assert.ok(career.lockNote.includes('대상 적합성'));
});
