import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  WRITER_RULE, appendProposalVersion, applySectionRevision, buildCoachingHandoff, coachingVerdict,
  compareCoachingRounds, extractLockedValues, findProposalVersion, handoffItemsForSection, matchSectionId,
  revisionInstruction, verifyLockedValues
} from '../src/coaching-handoff.js';
import { validateCoachingResult } from '../functions/api/proposal-coaching.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
const V1_SECTIONS = [
  { id: 'necessity', title: '1. 사업 필요성', content: 'QA 지역 중학생의 학습 결손이 확인된다. 근거 문장은 짧고 설득력이 약하다.', status: '검토 필요', citations: [] },
  { id: 'target', title: '4. 사업 대상', content: 'QA 대상은 지역 중학생 30명이며 선정기준은 적지 않았다.', status: '검토 필요', citations: [] },
  { id: 'budget', title: '8. 예산 계획', content: 'QA 총사업비 30,000,000원이며 세부 산출근거는 아래 표와 같다.', status: '검토 필요', citations: [] }
];

function coachingResultV1() {
  const evidenceRefs = [{ sourceName: 'QA 계획서', pageOrSection: '4. 사업 대상', proposalLocation: '4. 사업 대상', excerpt: '선정기준은 적지 않았다', verified: true }];
  return {
    basis: 'common-criteria', overallStatus: '보완 필요', summary: 'QA v1 검증',
    checkedAreas: ['대상', '필요성'],
    evaluationMatrix: [],
    issues: [
      { category: '대상 선정기준 누락', priority: '주요 개선', riskType: 'competition', location: '4. 사업 대상', reason: 'QA 대상 선정기준이 없어 심사에서 근거를 확인할 수 없다.', direction: '모집 방법과 선정기준을 대상 항목에 적는다. 인원은 그대로 둔다.', example: 'QA 예시 문장', evidenceRefs, requiresConfirmation: false },
      { category: '필요성 근거 부족', priority: '일반 개선', riskType: 'expression', location: '1. 사업 필요성', reason: 'QA 필요성 서술이 추상적이다.', direction: '확인된 지역 자료 범위에서 구체화한다.', example: '[확인 필요: 지역 통계 출처] QA 예시', evidenceRefs: [], requiresConfirmation: true }
    ],
    finalChecks: ['자격', '필수 신청항목', '사업기간', '대상·인원', '회기', '예산 합계·예산규정', '성과목표·지표', '기관·협력 역할', '공식 평가항목 누락']
      .map(area => ({ area, status: area === '대상·인원' ? '보완필요' : '충족', note: 'QA 점검', evidenceRefs })),
    comparison: { previousVersion: 0, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] }
  };
}

function coachingResultV2(previous) {
  const evidenceRefs = [{ sourceName: 'QA 계획서', pageOrSection: '1. 사업 필요성', proposalLocation: '1. 사업 필요성', excerpt: 'QA 지역 중학생', verified: true }];
  return {
    ...previous,
    overallStatus: '확인 필요', summary: 'QA v2 재검증',
    issues: [previous.issues[1], { category: '표현 중복', priority: '일반 개선', riskType: 'expression', location: '8. 예산 계획', reason: 'QA 중복 표현이 있다.', direction: '중복 문장을 정리한다.', example: 'QA 예시', evidenceRefs, requiresConfirmation: false }],
    finalChecks: previous.finalChecks.map(check => ({ ...check, status: check.area === '대상·인원' ? '충족' : check.status })),
    comparison: { previousVersion: 1, resolvedIssues: ['4. 사업 대상'], remainingIssues: ['1. 사업 필요성'], newIssues: ['8. 예산 계획'], improvedAreas: ['대상 선정기준'] }
  };
}

test('검증 결과의 선택한 문제만 계획서 쓰기 전달값으로 만든다', () => {
  const result = coachingResultV1();
  const coaching = { title: 'QA 계획서', version: 1, seriesId: 'qa-series', result, workItems: [{ status: '미수정' }, { status: '확인필요' }] };
  const all = buildCoachingHandoff({ coaching, sections: V1_SECTIONS });
  assert.equal(all.items.length, 2);

  const handoff = buildCoachingHandoff({ coaching, sections: V1_SECTIONS, selectedIndexes: [0] });
  assert.equal(handoff.items.length, 1);
  const item = handoff.items[0];
  assert.equal(item.location, '4. 사업 대상');
  assert.equal(item.sectionId, 'target');
  assert.equal(item.problem, '대상 선정기준 누락');
  assert.ok(item.reason && item.direction);
  assert.equal(item.evidence.length, 1);
  assert.deepEqual(item.lockedValues, ['30명']);
  assert.equal(item.requiresConfirmation, false);
  assert.equal(handoff.writerRule, WRITER_RULE);
  assert.deepEqual(handoff.lockedValues, ['30명', '30,000,000원']);
  assert.equal(handoff.fromVersion, 1);

  // 근거가 없는 문제는 확인 필요사항으로 전달한다.
  const unverified = buildCoachingHandoff({ coaching, sections: V1_SECTIONS, selectedIndexes: [1] }).items[0];
  assert.equal(unverified.evidence.length, 0);
  assert.ok(unverified.confirmation.includes('확인 필요'));

  assert.deepEqual(handoffItemsForSection(handoff, V1_SECTIONS[1]).map(value => value.id), ['handoff-1']);
  assert.deepEqual(handoffItemsForSection(handoff, V1_SECTIONS[2]), []);
  assert.match(revisionInstruction(handoff.items), /유지할 확정값: 30명/);
  assert.match(revisionInstruction(handoff.items), /계획서 전체를 다시 쓰지 않는다/);
  assert.equal(matchSectionId(V1_SECTIONS, '알 수 없는 위치'), '');
});

test('내부 판정은 근거가 확인된 중대 문제에만 반려를 사용한다', () => {
  const result = coachingResultV1();
  assert.equal(coachingVerdict(result, [{ status: '미수정' }, { status: '미수정' }]).verdict, '수정 후 재검토');

  // 정보 부족(확인 필요)만으로는 반려하지 않는다.
  const unsupported = structuredClone(result);
  unsupported.issues[0] = { ...unsupported.issues[0], priority: '최우선 경고', riskType: 'required-item', requiresConfirmation: true, evidenceRefs: [] };
  assert.equal(coachingVerdict(unsupported, [{ status: '미수정' }, { status: '미수정' }]).verdict, '수정 후 재검토');

  // 근거가 확인된 필수항목 누락은 작성 단계로 반려한다.
  const blocking = structuredClone(result);
  blocking.issues[0] = { ...blocking.issues[0], priority: '최우선 경고', riskType: 'required-item', requiresConfirmation: false };
  const verdict = coachingVerdict(blocking, [{ status: '미수정' }, { status: '해결' }]);
  assert.equal(verdict.verdict, '작성 단계로 반려');
  assert.deepEqual(verdict.blockingIssues, ['4. 사업 대상']);

  const clean = structuredClone(result);
  clean.issues = [];
  clean.finalChecks = clean.finalChecks.map(check => ({ ...check, status: '충족' }));
  assert.equal(coachingVerdict(clean, []).verdict, '제출 검토 완료');
});

test('V1 → 코칭 전달 → V2 수정본 → 재검증 왕복에서 원본과 확정값을 보존한다', () => {
  const v1Result = coachingResultV1();
  assert.equal(validateCoachingResult(v1Result, false, 0, { proposalText: `${V1_SECTIONS.map(section => section.content).join('\n')}\nQA 지역 중학생\n선정기준은 적지 않았다`, criteriaText: '' }), '');

  // 1) 계획서 V1 저장
  let versions = appendProposalVersion([], { sections: V1_SECTIONS, label: '최초 작성' });
  assert.equal(versions.length, 1);
  assert.equal(versions[0].version, 1);

  // 2) 검증 문제를 계획서 쓰기로 전달
  const coaching = { title: 'QA 계획서', version: 1, seriesId: 'qa-series', result: v1Result, workItems: [{ status: '미수정' }, { status: '확인필요' }] };
  const handoff = buildCoachingHandoff({ coaching, sections: V1_SECTIONS, selectedIndexes: [0] });
  assert.equal(handoff.verdict.verdict, '수정 후 재검토');

  // 3) 전달받은 위치만 수정한 수정본
  const revised = 'QA 대상은 지역 중학생 30명이며, 학교 추천과 기초학습 지원 필요도를 기준으로 선정한다.';
  const v2Sections = applySectionRevision(V1_SECTIONS, handoff.items[0].sectionId, revised);
  assert.notEqual(v2Sections, V1_SECTIONS);
  assert.equal(V1_SECTIONS[1].content, 'QA 대상은 지역 중학생 30명이며 선정기준은 적지 않았다.');
  assert.equal(v2Sections[1].content, revised);
  assert.equal(v2Sections[0].content, V1_SECTIONS[0].content);

  // 확정 수치는 바뀌지 않았다.
  const locked = verifyLockedValues(V1_SECTIONS[1].content, revised, handoff.items[0].lockedValues);
  assert.equal(locked.ok, true);
  const broken = verifyLockedValues(V1_SECTIONS[1].content, 'QA 대상은 지역 중학생 45명이며 선정기준을 추가했다.', handoff.items[0].lockedValues);
  assert.equal(broken.ok, false);
  assert.deepEqual(broken.removed, ['30명']);
  assert.deepEqual(broken.added, ['45명']);
  assert.deepEqual(extractLockedValues(v2Sections), ['30명', '30,000,000원']);

  // 4) V2 별도 저장 · V1 원본 보존
  versions = appendProposalVersion(versions, { sections: v2Sections, label: '검증·코칭 v1 반영 수정본', verdict: handoff.verdict.verdict });
  assert.deepEqual(versions.map(item => item.version), [1, 2]);
  assert.equal(findProposalVersion(versions, 1).sections[1].content, V1_SECTIONS[1].content);
  assert.equal(findProposalVersion(versions, 2).sections[1].content, revised);
  versions[1].sections[1].content = 'QA 외부 변경';
  assert.equal(findProposalVersion(versions, 1).sections[1].content, V1_SECTIONS[1].content);

  // 5) 재검증 결과 비교: 해결·남은·새 문제
  const v2Result = coachingResultV2(v1Result);
  const rounds = compareCoachingRounds(v1Result, v2Result);
  assert.equal(rounds.source, 'coaching');
  assert.deepEqual(rounds.resolved, ['4. 사업 대상']);
  assert.deepEqual(rounds.remaining, ['1. 사업 필요성']);
  assert.deepEqual(rounds.added, ['8. 예산 계획']);

  // AI 비교가 비어 있어도 위치 기준으로 직접 비교한다.
  const localRounds = compareCoachingRounds(v1Result, { ...v2Result, comparison: { previousVersion: 1, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] } });
  assert.equal(localRounds.source, 'local');
  assert.deepEqual(localRounds.resolved, ['4. 사업 대상']);
  assert.deepEqual(localRounds.added, ['8. 예산 계획']);
  assert.equal(coachingVerdict(v2Result, [{ status: '확인필요' }, { status: '미수정' }]).verdict, '수정 후 재검토');
});

test('왕복 흐름은 외부 호출 없이 화면과 저장 단계에 연결된다', () => {
  const moduleSource = fs.readFileSync(new URL('../src/coaching-handoff.js', import.meta.url), 'utf8');
  assert.doesNotMatch(moduleSource, /fetch\(|openai/i);

  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /id="send-issues-to-writer"/);
  assert.match(appSource, /data-coaching-select/);
  assert.match(appSource, /id="send-revision-to-coaching"/);
  assert.match(appSource, /id="save-revision-version"/);
  assert.match(appSource, /data-restore-version/);
  // 보관 스냅샷에는 버전·수정계획과 함께 공고 선정논리·초안 상태도 담아 다시 열 때 흐름이 이어진다.
  assert.match(appSource, /'proposalVersions', 'revisionPlan', 'noticeLogic', 'draftReview'\]/);
  assert.match(appSource, /revision-v\$\{version\}/);
  for (const label of ['제출 검토 완료', '수정 후 재검토', '작성 단계로 반려']) assert.match(appSource + fs.readFileSync(new URL('../src/coaching-handoff.js', import.meta.url), 'utf8'), new RegExp(label));
});
