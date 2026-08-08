import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LOGIC_CHAIN, PROPOSAL_FIELDS, analyzeProposalStructure, buildStructuralRevision, extractionQuality,
  reviewProposalStructure, revisionFromProposalText
} from '../src/proposal-structure.js';
import { appendProposalVersion, findProposalVersion } from '../src/coaching-handoff.js';
import { buildCoachingHandoff } from '../src/coaching-handoff.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.

// (1) 읽히기는 했지만 구조가 무너진 계획서: PDF 추출처럼 한 줄로 붙어 있고 제목이 없다.
const UNSTRUCTURED = `QA 청소년 학습회복 프로젝트 사업계획서 본 사업은 지역 청소년의 학습 결손을 줄이기 위한 것이다. 참여자는 지역 중학생이며 프로그램은 학습코칭으로 구성한다. 자세한 내용은 담당자가 정한다.`;

// (2) 항목은 있으나 논리·수치 연결이 약한 계획서
const WEAK_CHAIN = `QA 청소년 학습회복 프로젝트

1. 사업 필요성
지역 중학생의 기초학습 결손이 확인되어 학습회복 지원이 필요하다.

2. 대상 및 인원
지역 중학생 30명을 공개 모집한다.

3. 세부 프로그램
주 1회 학습코칭을 총 20회기 운영한다.

4. 추진 일정
2027년 3월부터 8월까지 운영하며 총 24회기를 진행한다.

5. 운영 인력 및 역할
QA 신청기관 담당자가 모집과 운영을 맡는다.

6. 예산
총사업비 30,000,000원이며 강사비 18,000,000원, 교재비 6,000,000원, 체험비 8,000,000원이다.

7. 성과목표
참여 청소년 45명의 학습 태도를 개선한다.

8. 성과지표
학습 태도가 좋아지는 것을 목표로 한다.`;

test('구조화가 안 된 계획서는 추출 상태와 빈 항목을 그대로 알려준다', () => {
  const structure = analyzeProposalStructure(UNSTRUCTURED, { documentName: 'QA 구조없는 계획서.pdf' });
  assert.equal(structure.originalText, UNSTRUCTURED);
  assert.equal(structure.quality.totalChars, UNSTRUCTURED.length);
  assert.ok(structure.quality.warnings.some(warning => /제목 구분이 무너/.test(warning)), structure.quality.warnings.join(' / '));
  assert.equal(structure.fields.length, PROPOSAL_FIELDS.length);

  // 없는 항목을 만들어내지 않는다.
  const missing = structure.fields.filter(field => field.status === '없음').map(field => field.key);
  for (const key of ['budget', 'goals', 'indicators']) assert.ok(missing.includes(key), `${key}가 없음으로 표시되지 않았습니다`);
  assert.ok(structure.fields.every(field => field.status === '없음' || field.evidence), '찾은 항목에는 근거 문장이 있어야 합니다');
  assert.ok(structure.fields.every(field => field.location));

  const review = reviewProposalStructure(structure);
  assert.ok(review.findings.length >= 5);
  assert.ok(review.findings.every(item => item.problem && item.whyRisky && item.basis && item.direction && item.suggestion));
  assert.ok(review.findings.every(item => item.current));
  // 근거가 없는 항목은 [확인 필요]로 남긴다.
  assert.ok(review.findings.filter(item => item.priority === '주요 개선').every(item => /\[확인 필요/.test(item.suggestion)));

  assert.equal(extractionQuality('', []).warnings.includes('원문 텍스트가 비어 있습니다.'), true);
});

test('논리 연결과 수치 충돌을 구체적으로 표시한다', () => {
  const structure = analyzeProposalStructure(WEAK_CHAIN, { documentName: 'QA 약한 계획서.txt' });
  const review = reviewProposalStructure(structure);

  // 필요성 → 대상 → 프로그램 → 예산 → 성과목표 → 성과지표
  assert.deepEqual(review.chain.map(link => link.from), ['사업 필요성', '대상 및 인원', '세부 프로그램', '예산', '성과목표']);
  assert.equal(review.chain.length, LOGIC_CHAIN.length - 1);

  const conflictKeys = review.conflicts.map(item => item.key);
  assert.ok(conflictKeys.includes('participants'), JSON.stringify(review.conflicts));
  assert.ok(conflictKeys.includes('sessions'));
  assert.ok(conflictKeys.includes('budget'));

  const participants = review.findings.find(item => item.id.includes('conflict-participants'));
  assert.equal(participants.priority, '최우선 경고');
  assert.equal(participants.riskType, 'core-conflict');
  assert.match(participants.problem, /30명 \/ 45명|45명 \/ 30명/);
  assert.match(participants.suggestion, /\[확인 필요/);
  assert.ok(participants.evidenceRefs.every(ref => ref.verified && WEAK_CHAIN.includes(ref.excerpt)));

  const budget = review.findings.find(item => item.id.includes('conflict-budget'));
  assert.equal(budget.riskType, 'budget-rule');
  assert.match(budget.problem, /32,000,000원|30,000,000원/);

  const measure = review.findings.find(item => item.id.includes('weak-measure'));
  assert.equal(measure.priority, '일반 개선');

  // 심사형 순서(현재 내용 → 문제점 → 불리한 이유 → 근거 → 보완 방향 → 수정 문장)를 모두 채운다.
  for (const item of review.findings) {
    assert.ok(item.current && item.problem && item.whyRisky && item.basis && item.direction && item.suggestion, JSON.stringify(item));
  }
});

test('검증 결과에서 실제 V2 수정본을 만들고 원본을 보존한다', () => {
  const structure = analyzeProposalStructure(WEAK_CHAIN, { documentName: 'QA 약한 계획서.txt' });
  const review = reviewProposalStructure(structure);
  const major = review.findings.filter(item => item.priority !== '일반 개선');

  const revision = revisionFromProposalText(WEAK_CHAIN, major);
  const before = revision.originalSections;
  const after = revision.sections;

  // V1 원본 보존 + 문제 있는 섹션만 변경
  assert.notEqual(before, after);
  const changed = after.filter((section, index) => section.content !== before[index].content).map(section => section.id);
  assert.deepEqual(changed.sort(), [...revision.changedSectionIds].sort());
  assert.ok(changed.length > 0 && changed.length < after.length, `변경 ${changed.length} / 전체 ${after.length}`);
  assert.ok(after.filter((section, index) => section.content === before[index].content).length > 0);

  // 확정 수치는 새로 만들지도, 지우지도 않는다.
  const numbersOf = text => (text.match(/\d[\d,]*\s*(?:명|회기|원)/g) || []).sort();
  const beforeNumbers = numbersOf(before.map(section => section.content).join('\n'));
  const afterNumbers = numbersOf(after.map(section => section.content).join('\n'));
  assert.ok(beforeNumbers.every(value => afterNumbers.includes(value)), '원문 수치가 사라졌습니다');
  const invented = afterNumbers.filter(value => !beforeNumbers.includes(value));
  assert.deepEqual(invented, [], `새 수치가 생겼습니다: ${invented.join(', ')}`);

  // 보완안은 [확인 필요]를 유지하고 수정 전/후를 비교할 수 있다.
  const revisedTargetSection = after.find(section => section.id === revision.changedSectionIds[0]);
  assert.match(revisedTargetSection.content, /\[보완안 · /);
  assert.match(revisedTargetSection.content, /\[확인 필요/);
  assert.equal(revisedTargetSection.status, '확인 필요');
  assert.ok(revisedTargetSection.content.startsWith(before.find(section => section.id === revisedTargetSection.id).content));

  // 버전 스택: V1 원본 유지, V2 추가
  let versions = appendProposalVersion([], { sections: before, label: '외부 원본' });
  versions = appendProposalVersion(versions, { sections: after, label: '검증 반영 수정본' });
  assert.deepEqual(versions.map(item => item.version), [1, 2]);
  assert.equal(findProposalVersion(versions, 1).sections.find(section => section.id === revisedTargetSection.id).content.includes('[보완안'), false);
  assert.equal(findProposalVersion(versions, 2).sections.find(section => section.id === revisedTargetSection.id).content.includes('[보완안'), true);

  // 기존 왕복 구조(계획서 쓰기로 전달)에 그대로 넘길 수 있다.
  const handoff = buildCoachingHandoff({ coaching: { title: 'QA', version: 1, result: { issues: major } }, sections: before });
  assert.equal(handoff.items.length, major.length);
  assert.ok(handoff.items.every(item => item.location && item.reason && item.direction));
  assert.ok(handoff.lockedValues.includes('30명'));
});

test('구조 분석은 외부 호출 없이 검증 화면에 연결된다', () => {
  const source = fs.readFileSync(new URL('../src/proposal-structure.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|openai/i);

  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /id="analyze-proposal-structure"/);
  assert.match(appSource, /id="apply-structure-revision"/);
  assert.match(appSource, /function proposalStructureView\(\)/);
  assert.match(appSource, /analyzeProposalStructure\(state\.coaching\.text/);
});
