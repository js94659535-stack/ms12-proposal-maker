import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ISSUE_TYPES, REPAIR_LEVELS, SOURCE_OF_TRUTH, applyRepairPlans, buildRepairPlan, buildRepairPlans,
  classifyIssueType, conflictingValues, repairPlanSummary
} from '../src/repair-plan.js';
import { analyzeProposalStructure } from '../src/proposal-structure.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
const PROPOSAL = `QA 사업계획서

1. 사업 개요
참여 인력 수 : 5 명으로 운영한다.

2. 조직도
기획팀 8명이 사업에 참여한다.

3. 예산
청년 체류지원비 50천원×50명×12주 9,000천원

4. 성과지표
사후 검사를 실시한다.

5. 표현
같은 제목이 두 번 반복된다.`;

const { sections } = analyzeProposalStructure(PROPOSAL, { documentName: 'QA 계획서' });

function issue(overrides) {
  return { category: 'QA', priority: '주요 개선', riskType: 'competition', location: '3. 예산', reason: 'QA 사유', direction: 'QA 방향', example: 'QA 수정 예시', evidenceRefs: [], requiresConfirmation: false, ...overrides };
}

test('검증 문제를 9개 수정 유형으로 구조화한다', () => {
  const cases = [
    ['calculation-error', issue({ reason: '산출내역 50천원×50명×12주는 30,000천원인데 표에는 9,000천원으로 기재되어 합계가 맞지 않습니다.' })],
    ['role-scope-conflict', issue({ reason: '참여 인력 수 5명과 조직도상 8명 사이의 불일치가 있습니다.' })],
    ['requirement-conflict', issue({ reason: '공고의 필수 제출 서류 요건과 계획서 내용이 충돌합니다.' })],
    ['factual-conflict', issue({ reason: '사업기간이 2024년과 2025년으로 서로 다르게 기재되었습니다.' })],
    ['outcome-gap', issue({ reason: '성과지표의 목표값과 측정도구가 제시되지 않았습니다.' })],
    ['missing-information', issue({ reason: '신청서 첫 장의 예산란이 공란입니다.' })],
    ['logic-gap', issue({ reason: '직무명과 교육내용이 서로 맞지 않아 대상과 프로그램 연결이 끊깁니다.' })],
    ['evidence-gap', issue({ reason: '강점이 선언적이고 수요조사 등 근거가 제시되지 않습니다.' })],
    ['expression', issue({ riskType: 'expression', reason: '같은 제목이 중복되어 가독성이 떨어집니다.' })]
  ];
  for (const [expected, value] of cases) assert.equal(classifyIssueType(value), expected, `${expected} 분류 실패: ${value.reason}`);
  assert.deepEqual([...new Set(cases.map(item => item[0]))].sort(), [...ISSUE_TYPES].sort());
});

test('수정계획은 필수 항목을 모두 채우고 확정값을 보호한다', () => {
  const plan = buildRepairPlan(issue({
    location: '3. 예산',
    reason: '산출내역 50천원×50명×12주는 30,000천원인데 표에는 9,000천원으로 기재되어 합계가 맞지 않습니다.',
    example: '청년 체류지원비: 50천원 × [확인 필요: 인원]명 × [확인 필요: 주수]주',
    evidenceRefs: [{ sourceName: '계획서', pageOrSection: '3. 예산', proposalLocation: '3. 예산', excerpt: '청년 체류지원비 50천원×50명×12주 9,000천원', verified: true }]
  }), { sections });

  for (const key of ['issueType', 'targetSection', 'currentContent', 'evidence', 'problem', 'repairMethod', 'lockedValues', 'requiresConfirmation', 'confirmationQuestion', 'proposedRevision', 'verificationRule']) {
    assert.ok(plan[key] !== undefined, `${key} 누락`);
  }
  assert.equal(plan.issueType, 'calculation-error');
  assert.ok(REPAIR_LEVELS.includes(plan.repairLevel));
  assert.equal(plan.repairLevel, 'USER_CONFIRMATION');
  assert.deepEqual(plan.targetSection.map(target => target.title), ['3. 예산']);
  assert.ok(plan.lockedValues.includes('50천원'));
  assert.ok(plan.evidence[0].verified);
  assert.match(plan.confirmationQuestion, /확정값은 무엇입니까/);
  assert.match(plan.verificationRule, /합계/);
});

test('사실 판단이 필요한 문제는 AI가 값을 고르지 않고 질문을 만든다', () => {
  const staff = issue({ location: '2. 조직도', reason: '참여 인력 수 5명과 조직도상 8명 사이의 불일치가 있습니다.', example: '총 투입인력: [확인 필요: 인원]명' });
  assert.deepEqual(conflictingValues(staff).sort(), ['5명', '8명']);
  const plan = buildRepairPlan(staff, { sections });
  assert.equal(plan.repairLevel, 'USER_CONFIRMATION');
  assert.match(plan.confirmationQuestion, /5명/);
  assert.match(plan.confirmationQuestion, /8명/);
  // 질문 단계에서는 본문을 바꾸지 않는다.
  const before = structuredClone(sections);
  const run = applyRepairPlans(before, [plan]);
  assert.equal(run.applied.length, 0);
  assert.equal(run.questions.length, 1);
  assert.deepEqual(run.sections.map(section => section.content), sections.map(section => section.content));

  // 확인값을 받은 뒤에는 해당 문제만 수정한다.
  const answered = applyRepairPlans(structuredClone(sections), [plan], { confirmations: { [plan.id]: '5명(전담)' } });
  assert.equal(answered.applied.length, 1);
  assert.equal(answered.questions.length, 0);
  const changed = answered.sections.filter((section, index) => section.content !== sections[index].content);
  // 수정계획이 연결한 문단만 바뀌고, 각 문단은 원문 뒤에 덧붙는다.
  assert.equal(changed.length, plan.targetSection.length);
  assert.deepEqual(changed.map(section => section.id).sort(), plan.targetSection.map(target => target.id).sort());
  assert.ok(changed.every(section => /5명\(전담\)/.test(section.content)));
  assert.ok(changed.every(section => section.content.startsWith(sections.find(item => item.id === section.id).content)));
  assert.equal(answered.sections.length - changed.length, sections.length - plan.targetSection.length);
});

test('근거 우선순위에 따라 EVIDENCE_BASED 수정 여부가 갈린다', () => {
  const gap = issue({ location: '4. 성과지표', reason: '성과지표의 목표값과 측정도구가 제시되지 않았습니다.', example: '성과지표: [확인 필요: 목표값]' });
  const withoutSource = buildRepairPlan(gap, { sections: [] });
  assert.equal(withoutSource.sourceOfTruth.level, SOURCE_OF_TRUTH[4]);
  const blocked = applyRepairPlans(structuredClone(sections), [withoutSource]);
  assert.equal(blocked.applied.length, 0);
  assert.equal(blocked.blocked.length, 1);

  const withOfficial = buildRepairPlan({ ...gap, evidenceRefs: [{ sourceName: '계획서', pageOrSection: '4. 성과지표', proposalLocation: '4. 성과지표', excerpt: '사후 검사를 실시한다.', verified: true }] }, {
    sections, references: [{ fileName: '2026 공고문.pdf', usage: '공식 근거로 사용 가능' }]
  });
  assert.equal(withOfficial.sourceOfTruth.level, SOURCE_OF_TRUTH[0]);
  assert.equal(withOfficial.repairLevel, 'EVIDENCE_BASED');
  const applied = applyRepairPlans(structuredClone(sections), [withOfficial]);
  assert.equal(applied.applied.length, 1);
});

test('표현 문제만 AUTO로 실제 수정하고 V1은 보존한다', () => {
  const plans = buildRepairPlans([
    issue({ location: '5. 표현', riskType: 'expression', reason: '같은 제목이 중복되어 가독성이 떨어집니다.', example: '중복된 제목을 하나로 정리한다.' }),
    issue({ location: '2. 조직도', reason: '참여 인력 수 5명과 조직도상 8명 사이의 불일치가 있습니다.', example: '[확인 필요: 인원]명' })
  ], { sections });
  assert.deepEqual(plans.map(plan => plan.repairLevel), ['AUTO', 'USER_CONFIRMATION']);

  const v1 = structuredClone(sections);
  const run = applyRepairPlans(v1, plans);
  assert.equal(run.applied.length, 1);
  assert.equal(run.applied[0].level, 'AUTO');
  assert.equal(run.questions.length, 1);
  // 원본 배열은 그대로 남는다.
  assert.deepEqual(v1.map(section => section.content), sections.map(section => section.content));
  const summary = repairPlanSummary(plans);
  assert.equal(summary.total, 2);
  assert.equal(summary.needsConfirmation, 1);
});

test('수정계획 레이어는 외부 호출 없이 화면에 연결된다', () => {
  const source = fs.readFileSync(new URL('../src/repair-plan.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|openai/i);
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /function repairPlanView\(\)/);
  assert.match(appSource, /id="apply-repair-plans"/);
  assert.match(appSource, /buildRepairPlans\(/);
});
