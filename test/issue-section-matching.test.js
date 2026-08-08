import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachingHandoff, compactEvidence, matchSectionsForIssue } from '../src/coaching-handoff.js';
import { analyzeProposalStructure, buildStructuralRevision } from '../src/proposal-structure.js';
import { compactEvidence as serverCompactEvidence } from '../functions/api/proposal-coaching.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다. 공백은 실제 PDF 추출본처럼 깨져 있다.
const PROPOSAL = `QA 배분신청서

1. 배분신청서 표준 양식
기 관 명   QA 수완아동센터   사업 기간   2026   년 9   월   1 일 ~   2026 년 12   월 31   일 (총 4   개월)

2. 신청기관 현황
기 관 명   QA 수완지역아동센터   대 표 자   QA 대표

3. 사업 내용 및 추진방법
시행 기간 및 일정: 2026년 8월 1일 ~ 2026년 12월 31일 (총 5개월간 집중 수행)

4. 예산편성
총 사업비   16,100,000 원   인건비   4,400,000원`;

function issue(overrides) {
  return { category: 'QA 문제', priority: '주요 개선', riskType: 'competition', location: '문서 전반', reason: 'QA 사유', direction: 'QA 방향', example: 'QA 수정 예시 [확인 필요: 확정값]', evidenceRefs: [], requiresConfirmation: true, ...overrides };
}

const { sections } = analyzeProposalStructure(PROPOSAL, { documentName: 'QA 신청서' });
const titleOf = id => sections.find(section => section.id === id).title;

test('근거 문장으로 문단을 찾고 자연어 location은 마지막에만 쓴다', () => {
  // 서버와 같은 정규화 규칙을 쓴다.
  assert.equal(compactEvidence('기 관 명   QA 수완아동센터'), serverCompactEvidence('기 관 명   QA 수완아동센터'));

  // ① 근거 문장이 실제로 들어 있는 문단 (공백이 깨져 있어도 찾는다)
  const single = matchSectionsForIssue(sections, issue({
    location: '1 배분신청서의 사업기간 및 4 사업계획서의 시행 기간',
    evidenceRefs: [{ sourceName: '계획서', pageOrSection: '1쪽', proposalLocation: '사업기간', excerpt: '기관명 QA 수완아동센터', verified: true }]
  }));
  assert.equal(single.length, 1);
  assert.match(titleOf(single[0]), /1. 배분신청서 표준 양식/);

  // ② 근거가 없으면 proposalLocation
  const byLocation = matchSectionsForIssue(sections, issue({
    location: '알 수 없는 서술형 위치',
    evidenceRefs: [{ sourceName: '계획서', pageOrSection: '', proposalLocation: '4 예산편성', excerpt: '', verified: true }]
  }));
  assert.deepEqual(byLocation.map(titleOf), ['4. 예산편성']);

  // ③ 구조 분석이 찾아 둔 문단
  const bySection = matchSectionsForIssue(sections, issue({ location: '알 수 없는 위치', sectionId: sections[3].id }));
  assert.deepEqual(bySection, [sections[3].id]);

  // ④ 마지막 fallback: 자연어 location
  assert.deepEqual(matchSectionsForIssue(sections, issue({ location: '3. 사업 내용 및 추진방법' })).map(titleOf), ['3. 사업 내용 및 추진방법']);

  // 아무 것도 못 찾으면 빈 배열(수동 선택 대상)
  assert.deepEqual(matchSectionsForIssue(sections, issue({ location: '존재하지 않는 위치 표기' })), []);
});

test('근거가 두 곳이면 두 문단만 수정하고 나머지는 그대로 둔다', () => {
  const conflict = issue({
    category: '사업기간 핵심 수치 충돌',
    location: '1 배분신청서의 사업기간 및 4 사업계획서의 시행 기간·첫 번째 세부사업',
    example: '시행 기간 및 일정: [확인 필요: 최종 사업 시작일] ~ 2026년 12월 31일(총 [확인 필요]개월)',
    evidenceRefs: [
      { sourceName: '계획서', pageOrSection: '1쪽', proposalLocation: '사업기간', excerpt: '사업 기간 2026년 9월 1일 ~ 2026년 12월 31일 (총 4개월)', verified: true },
      { sourceName: '계획서', pageOrSection: '4쪽', proposalLocation: '시행 기간', excerpt: '시행 기간 및 일정: 2026년 8월 1일 ~ 2026년 12월 31일 (총 5개월간 집중 수행)', verified: true }
    ]
  });
  const matched = matchSectionsForIssue(sections, conflict);
  assert.equal(matched.length, 2);
  assert.deepEqual(matched.map(titleOf).sort(), ['1. 배분신청서 표준 양식', '3. 사업 내용 및 추진방법'].sort());

  const before = structuredClone(sections);
  const revision = buildStructuralRevision(before, [{ ...conflict, suggestion: conflict.example, problem: conflict.reason }]);
  const changed = revision.sections.filter((section, index) => section.content !== before[index].content);
  assert.equal(changed.length, 2);
  assert.deepEqual(revision.unassigned, []);
  // 관계없는 문단은 그대로
  assert.equal(revision.sections.length - changed.length, before.length - 2);
  assert.ok(revision.sections.every((section, index) => section.content === before[index].content || section.content.startsWith(before[index].content)));
  // V1 원본 배열은 변하지 않는다.
  assert.deepEqual(before, sections);
  // 확정 수치는 새로 생기지 않는다(공백 제거 후 비교).
  const numbersOf = value => (value.replace(/\s+/g, '').match(/\d[\d,]*(?:명|회기|원|개월)/g) || []);
  const invented = numbersOf(revision.sections.map(section => section.content).join('\n')).filter(value => !numbersOf(`${PROPOSAL} ${conflict.example}`).includes(value));
  assert.deepEqual(invented, []);
});

test('수정 요청 목록은 자동 연결 결과와 수동 선택을 함께 제공한다', () => {
  const issues = [
    issue({ category: '기관명 불일치', evidenceRefs: [
      { sourceName: '계획서', pageOrSection: '1쪽', proposalLocation: '기관명', excerpt: '기관명 QA 수완아동센터', verified: true },
      { sourceName: '계획서', pageOrSection: '2쪽', proposalLocation: '기관명', excerpt: '기관명 QA 수완지역아동센터', verified: true }
    ] }),
    issue({ category: '연결 실패 예시', location: '어디에도 없는 위치' })
  ];
  const handoff = buildCoachingHandoff({ coaching: { title: 'QA', version: 1, result: { issues } }, sections });
  assert.equal(handoff.items.length, 2);
  assert.equal(handoff.items[0].sectionIds.length, 2);
  assert.equal(handoff.items[0].sectionId, handoff.items[0].sectionIds[0]);
  // 자동 연결이 안 되면 화면에서 직접 고르도록 빈 값으로 남긴다.
  assert.equal(handoff.items[1].sectionId, '');
  assert.deepEqual(handoff.items[1].sectionIds, []);
});
