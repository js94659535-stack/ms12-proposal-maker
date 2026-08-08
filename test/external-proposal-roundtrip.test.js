import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EXTERNAL_SOURCE, appendProposalVersion, applySectionRevision, buildCoachingHandoff, buildExternalWorkingCopy,
  coachingVerdict, compareCoachingRounds, findProposalVersion, proposalTextFromSections, sectionsFromProposalText,
  verifyLockedValues
} from '../src/coaching-handoff.js';
import { validateCoachingResult } from '../functions/api/proposal-coaching.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
const EXTERNAL_TEXT = `QA 외부 사업계획서

1. 사업 개요
QA 외부 기관이 직접 작성한 계획서 원문이다.

2. 사업 대상
지역 중학생 30명을 대상으로 한다. 선정기준은 적지 않았다.

3. 운영 계획
주 1회 총 20회를 운영한다.

4. 예산
총사업비 30,000,000원으로 편성했다.`;

function externalCoachingResult() {
  const evidenceRefs = [{ sourceName: 'QA 외부 계획서', pageOrSection: '2. 사업 대상', proposalLocation: '2. 사업 대상', excerpt: '선정기준은 적지 않았다', verified: true }];
  return {
    basis: 'common-criteria', overallStatus: '보완 필요', summary: 'QA 외부 계획서 검증', checkedAreas: ['대상'],
    evaluationMatrix: [],
    issues: [{ category: '대상 선정기준 누락', priority: '주요 개선', riskType: 'competition', location: '2. 사업 대상', reason: 'QA 선정기준이 없어 심사에서 확인할 수 없다.', direction: '모집 방법과 선정기준을 적는다. 인원은 그대로 둔다.', example: 'QA 예시', evidenceRefs, requiresConfirmation: false }],
    finalChecks: ['자격', '필수 신청항목', '사업기간', '대상·인원', '회기', '예산 합계·예산규정', '성과목표·지표', '기관·협력 역할', '공식 평가항목 누락']
      .map(area => ({ area, status: area === '대상·인원' ? '보완필요' : '충족', note: 'QA 점검', evidenceRefs })),
    comparison: { previousVersion: 0, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] }
  };
}

test('외부 계획서 원문을 항목 단위 작업본으로 나누고 내용을 잃지 않는다', () => {
  const sections = sectionsFromProposalText(EXTERNAL_TEXT);
  assert.deepEqual(sections.map(section => section.title), ['QA 외부 사업계획서', '1. 사업 개요', '2. 사업 대상', '3. 운영 계획', '4. 예산']);
  assert.ok(sections.every(section => section.id.startsWith('external-') && section.status === '검토 필요'));
  assert.equal(sections[2].content, '지역 중학생 30명을 대상으로 한다. 선정기준은 적지 않았다.');
  // 원문 문장을 새로 만들거나 빠뜨리지 않는다.
  const rejoined = proposalTextFromSections(sections).replace(/\s+/g, ' ').trim();
  assert.equal(rejoined, EXTERNAL_TEXT.replace(/\s+/g, ' ').trim());

  // 제목이 없는 원문도 한 항목으로 처리한다.
  const plain = sectionsFromProposalText('QA 제목 없는 계획서 본문만 있는 경우입니다.');
  assert.equal(plain.length, 1);
  assert.equal(plain[0].content, 'QA 제목 없는 계획서 본문만 있는 경우입니다.');
});

test('외부 계획서 작업본은 업로드 원본을 그대로 보존한다', () => {
  const working = buildExternalWorkingCopy({ title: 'QA 외부 계획서', text: EXTERNAL_TEXT });
  assert.equal(working.title, 'QA 외부 계획서');
  assert.equal(working.originalText, EXTERNAL_TEXT);
  assert.equal(working.versions.length, 1);
  assert.equal(working.versions[0].label, '외부 원본');
  assert.equal(working.versions[0].source, EXTERNAL_SOURCE);
  assert.equal(working.versions[0].originalText, EXTERNAL_TEXT);

  // 작업본을 고쳐도 보존된 원본 버전은 변하지 않는다.
  const edited = applySectionRevision(working.sections, 'external-3', 'QA 수정 본문');
  assert.equal(edited[2].content, 'QA 수정 본문');
  assert.equal(working.versions[0].sections[2].content, '지역 중학생 30명을 대상으로 한다. 선정기준은 적지 않았다.');
  assert.equal(working.versions[0].originalText, EXTERNAL_TEXT);
});

test('외부 계획서도 검증 → 전달 → 수정본 → 재검증 왕복을 끝까지 연결한다', () => {
  const v1Result = externalCoachingResult();
  assert.equal(validateCoachingResult(v1Result, false, 0, { proposalText: EXTERNAL_TEXT, criteriaText: '' }), '');

  // 1) 업로드 원본 → 작업본 전환 (원본은 V1로 보존)
  const working = buildExternalWorkingCopy({ title: 'QA 외부 계획서', text: EXTERNAL_TEXT });
  let versions = working.versions;
  const originalSections = structuredClone(working.sections);

  // 2) 검증 결과 문제를 계획서 쓰기로 전달
  const coaching = { title: 'QA 외부 계획서', version: 1, seriesId: 'qa-external', result: v1Result, workItems: [{ status: '미수정' }] };
  const handoff = buildCoachingHandoff({ coaching, sections: working.sections, selectedIndexes: [0] });
  assert.equal(handoff.items.length, 1);
  assert.equal(handoff.items[0].sectionId, 'external-3');
  assert.deepEqual(handoff.items[0].lockedValues, ['30명']);
  assert.deepEqual(handoff.lockedValues, ['30명', '1회', '20회', '30,000,000원']);
  assert.equal(handoff.verdict.verdict, '수정 후 재검토');

  // 3) 전달받은 위치만 수정한 수정본
  const revised = '지역 중학생 30명을 대상으로 한다. 학교 추천과 기초학습 지원 필요도를 기준으로 선정한다.';
  const v2Sections = applySectionRevision(working.sections, handoff.items[0].sectionId, revised);
  assert.equal(verifyLockedValues(working.sections[2].content, revised, handoff.items[0].lockedValues).ok, true);
  assert.equal(verifyLockedValues(working.sections[2].content, '지역 중학생 45명을 대상으로 한다.', handoff.items[0].lockedValues).ok, false);
  assert.deepEqual(v2Sections.filter((section, index) => section.content !== originalSections[index].content).map(section => section.id), ['external-3']);

  // 4) V2 저장 · V1 원본 보존
  versions = appendProposalVersion(versions, { sections: v2Sections, label: '검증·코칭 v1 반영 수정본', verdict: handoff.verdict.verdict });
  assert.deepEqual(versions.map(item => item.version), [1, 2]);
  assert.equal(findProposalVersion(versions, 1).sections[2].content, originalSections[2].content);
  assert.equal(findProposalVersion(versions, 1).originalText, EXTERNAL_TEXT);
  assert.equal(findProposalVersion(versions, 2).sections[2].content, revised);

  // 5) 재검증 요청 본문은 수정본에서 만든다.
  const revalidationText = proposalTextFromSections(v2Sections);
  assert.ok(revalidationText.includes('기초학습 지원 필요도'));
  assert.ok(revalidationText.includes('총사업비 30,000,000원'));
  assert.ok(!revalidationText.includes('선정기준은 적지 않았다'));

  // 6) 재검증 결과 비교
  const v2Result = { ...v1Result, issues: [], finalChecks: v1Result.finalChecks.map(check => ({ ...check, status: '충족' })), comparison: { previousVersion: 1, resolvedIssues: ['2. 사업 대상'], remainingIssues: [], newIssues: [], improvedAreas: ['대상 선정기준'] } };
  assert.equal(validateCoachingResult(v2Result, false, 1, { proposalText: `${revalidationText}\n선정기준은 적지 않았다`, criteriaText: '' }), '');
  const rounds = compareCoachingRounds(v1Result, v2Result);
  assert.deepEqual(rounds.resolved, ['2. 사업 대상']);
  assert.deepEqual(rounds.added, []);
  assert.equal(coachingVerdict(v2Result, []).verdict, '제출 검토 완료');
});

test('외부 계획서 전환은 외부 호출 없이 화면 흐름에 연결된다', () => {
  const moduleSource = fs.readFileSync(new URL('../src/coaching-handoff.js', import.meta.url), 'utf8');
  assert.doesNotMatch(moduleSource, /fetch\(|openai/i);

  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /id="adopt-external-proposal"/);
  assert.match(appSource, /function adoptExternalProposal\(\)/);
  // 기존 작성 본문이 있으면 덮어쓰지 않는다.
  assert.match(appSource, /이미 작성 중인 계획서 본문이 있습니다\. 기존 본문을 덮어쓰지 않습니다\./);
  assert.match(appSource, /업로드 원문 보기/);
  assert.match(appSource, /analysisForRewrite\(item\)/);
});
