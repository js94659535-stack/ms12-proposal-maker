import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { UNRESOLVED_MARK, annotateDraftSections, checkDraftAgainstBlueprint, officialRequirementConflicts } from '../src/blueprint-draft-check.js';
import { buildBlueprint } from '../src/project-blueprint.js';
import { matchApplicantToNotice } from '../src/fit-matching.js';
import { analyzeNoticeStructure } from '../src/notice-logic.js';
import { CONFIRMED_STATUS, normalizeApplicant } from '../src/applicants.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
const NOTICE = analyzeNoticeStructure({
  title: '가족기능 강화사업 공고',
  overview: `사업목적 : 아동의 건강한 성장발달과 가족기능 회복.
신청유형 ○ 재학대예방형 - 아동보호전문기관에서 사례관리 중인 학대피해아동, 아동학대행위자, 가족구성원을 대상으로 개입이 가능한 기관 ○ 아동보호형 - 지역사회 내 어려움으로 보호를 필요로 하는 요보호아동, 보호자를 대상으로 개입이 가능한 기관.
주요사업내용 : 아동 심리정서 회복 프로그램과 보호자 상담을 운영한다.
성과지표 : 사전·사후 검사 결과를 결과 보고에 포함한다.`
});
const APPLICANT = normalizeApplicant({
  id: 'suwan', name: '수완지역아동센터',
  items: [
    { id: 's1', area: 'basic', label: '기관명', value: '수완지역아동센터', status: CONFIRMED_STATUS, source: '고유번호증', asOf: '2026' },
    { id: 's2', area: 'staff', label: '미확인 인력', value: '임상심리사 2명 상근', status: '확인 필요', source: '내부 메모', asOf: '2024' },
    { id: 's3', area: 'budget', label: '총사업비', value: '2024년 총사업비 16,100,000원 집행', status: CONFIRMED_STATUS, source: '2024 결과보고서', asOf: '2024', projectName: '2024 방과후 사업' },
    { id: 's4', area: 'performance', label: '운영 회기', value: '주 2회 20회기 운영', status: CONFIRMED_STATUS, source: '2024 결과보고서', asOf: '2024', projectName: '2024 방과후 사업' }
  ]
});
const VALUES = [
  { blueprintKey: 'applicationType', value: '재학대예방형' },
  { blueprintKey: 'sessions', value: '12회기' },
  { blueprintKey: 'headcount', value: '아동 15명' }
];
function blueprintOf() {
  return buildBlueprint({ structure: NOTICE, applicant: APPLICANT, fitResult: matchApplicantToNotice(NOTICE, APPLICANT), projectValues: VALUES.map(item => ({ key: item.blueprintKey, value: item.value })) });
}
function sectionsOf(rows) { return rows.map(([id, title, body]) => ({ id, title, body })); }

const GOOD = sectionsOf([
  ['necessity', '사업 필요성', '학대피해아동과 가족구성원의 가족기능 회복이 필요하다.'],
  ['target', '대상', '학대피해아동 15명과 보호자를 대상으로 한다.'],
  ['programs', '세부 프로그램', '학대피해아동 심리정서 회복 프로그램을 12회기 운영하고 보호자 상담을 병행한다.'],
  ['budget', '예산', '총 사업비는 [확인 필요] 상태로 남긴다.'],
  ['indicators', '성과지표', '학대피해아동 심리정서 사전·사후 검사로 측정한다. 측정 도구는 [확인 필요].']
]);

test('설계도를 따른 V1은 통과한다', () => {
  const report = checkDraftAgainstBlueprint({ blueprint: blueprintOf(), sections: GOOD, applicant: APPLICANT });
  assert.equal(report.byState.FAIL, 0, JSON.stringify(report.checks.filter(item => item.state === 'FAIL')));
  assert.equal(report.applicationType, '재학대예방형');
  assert.ok(report.checks.some(item => item.name === '미확정 값 표기' && item.state === 'PASS'));
  assert.ok(report.logicLinks.every(link => link.state === '연결됨'), JSON.stringify(report.logicLinks));
});

test('다른 신청유형 혼입·과거 수치 유입·확인 필요 정보 사용을 잡는다', () => {
  const bad = sectionsOf([
    ['necessity', '사업 필요성', '요보호아동 보호가 필요하다.'],
    ['target', '대상', '아동보호형 대상인 요보호아동을 대상으로 한다.'],
    ['programs', '세부 프로그램', '주 2회 20회기 운영한다.'],
    ['budget', '예산', '총사업비 16,100,000원을 집행한다.'],
    ['roles', '운영 인력·역할', '임상심리사 2명 상근 인력이 수행한다.']
  ]);
  const report = checkDraftAgainstBlueprint({ blueprint: blueprintOf(), sections: bad, applicant: APPLICANT });
  const failed = report.checks.filter(item => item.state === 'FAIL').map(item => item.name);
  assert.ok(failed.includes('다른 신청유형 혼입'), JSON.stringify(failed));
  assert.ok(failed.includes('과거 사업 수치 유입'), JSON.stringify(failed));
  assert.ok(failed.includes('확인되지 않은 기관정보 사용'), JSON.stringify(failed));
  assert.equal(report.verdict, '설계도 위반 있음');
});

test('미확정 항목은 원문을 건드리지 않고 [확인 필요]로 표시한다', () => {
  const blueprint = blueprintOf();
  const sections = sectionsOf([
    ['necessity', '사업 필요성', '학대피해아동 가족기능 회복이 필요하다.'],
    ['purpose', '목적', '가족기능 회복을 목적으로 한다.'],
    ['goals', '목표', '목표값은 기초선이 없어 확정할 수 없다.'],
    ['target', '대상', '학대피해아동 15명과 보호자를 대상으로 한다.'],
    ['programs', '세부 프로그램', '심리정서 회복 프로그램을 12회기 운영한다.'],
    ['schedule', '추진 일정', '2027년 1월부터 12월까지 운영한다.'],
    ['roles', '운영 인력·역할', '담당 인력 구성은 확인되지 않았다.'],
    ['budget', '예산', '총액은 확정하지 못했다.'],
    ['indicators', '성과지표', '측정도구는 정해지지 않았다.'],
    ['outcomes', '기대효과', '가족기능 회복을 기대한다.']
  ]);
  const before = JSON.stringify(sections);
  const annotated = annotateDraftSections({ blueprint, sections });
  // AI 원본은 그대로 두고 사본에만 상태를 붙인다.
  assert.equal(JSON.stringify(sections), before);
  assert.ok(annotated.every((section, index) => section.content === sections[index].content));
  const open = blueprint.items.filter(item => item.status === 'NEEDS_CONFIRMATION' && !['requirementLinks', 'openItems'].includes(item.key));
  const tracked = new Set(annotated.flatMap(section => section.unresolvedFrom));
  assert.ok(open.filter(item => ['delivery', 'partners', 'budget', 'outcomeGoals', 'indicators'].includes(item.key)).every(item => tracked.has(item.title)), JSON.stringify([...tracked]));
  assert.equal(annotated.find(section => section.id === 'budget').displayStatus, UNRESOLVED_MARK);
  // 확정된 항목에는 [확인 필요]를 붙이지 않는다.
  assert.notEqual(annotated.find(section => section.id === 'purpose').displayStatus, UNRESOLVED_MARK);
});

test('공고 기준과 사용자 확정값 충돌을 어느 쪽도 고치지 않고 구조화한다', () => {
  const notice = analyzeNoticeStructure({
    title: 'QA 공고',
    overview: '목표 : 핵심 참여자(아동, 보호자) 70명 이상 진행. 활동 횟수 : 프로그램 참여자 1인당 13회기 이상.'
  });
  const values = [
    { blueprintKey: 'headcount', label: '인원', value: '아동 15명과 보호자 15명' },
    { blueprintKey: 'sessions', label: '회기', value: '아동 12회기' },
    { blueprintKey: 'staff', label: '담당 인력', value: '전담 사회복지사 1명' }
  ];
  const conflicts = officialRequirementConflicts(notice, values);
  assert.equal(conflicts.length, 2, JSON.stringify(conflicts.map(item => item.field)));
  assert.ok(conflicts.every(item => item.type === 'OFFICIAL_REQUIREMENT_CONFLICT'));
  const headcount = conflicts.find(item => item.field === '인원');
  assert.match(headcount.officialValue, /70명 이상/);
  assert.match(headcount.userValue, /15명/);
  assert.match(headcount.officialEvidence.sentence, /70명 이상/);
  assert.match(headcount.question, /어느 쪽으로 확정/);
  // 인력 수는 참여자 기준과 뜻이 달라 충돌로 보지 않는다.
  assert.ok(!conflicts.some(item => item.field === '담당 인력'));
  // 기준을 지키면 충돌이 없다.
  assert.deepEqual(officialRequirementConflicts(notice, [{ blueprintKey: 'headcount', label: '인원', value: '아동 80명' }]), []);
});

test('설계도를 계획서 작성 요청과 화면에 연결했다', () => {
  const api = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  // 작성 우선순위를 프롬프트에 고정한다.
  assert.match(api, /PROJECT_BLUEPRINT는 이번 사업의 확정된 설계 기준이다/);
  assert.match(api, /1\) 공고의 공식 요구·선정논리 2\) 사용자가 확정한 이번 사업 값/);
  assert.match(api, /다른 신청유형의 대상·프로그램·성과를 섞지 않는다/);
  assert.match(api, /과거 사업 기록\(pastProjectRecords\)의 인원·회기·기간·예산을 이번 사업 값으로 옮겨 적지 않는다/);
  // master · fullProposal · draft(단발 생성)는 설계도 전체를 넣고, 분할 생성은 경량 문맥에 같은 규칙을 붙인다.
  assert.equal((api.match(/\$\{blueprintBlock\(payload\)\}/g) || []).length, 3);
  assert.match(api, /<MASTER_CONTEXT>\$\{JSON\.stringify\(partContext\(payload\)\)\}/);
  assert.match(api, /officialConflicts는 임의로 확정·해결하지 말고/);
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /projectBlueprint: blueprintHandoff\(\)/);
  assert.match(app, /function draftBlueprintCheckView\(\)/);
  assert.match(app, /checkDraftAgainstBlueprint\(\{ blueprint, sections: state\.sections, applicant: selectedApplicant\(\), conflicts \}\)/);
  // 화면은 원본을 고치지 않고 표시용 사본에만 [확인 필요]를 붙인다.
  assert.match(app, /annotateDraftSections\(\{ blueprint, sections: state\.sections \}\)/);
  assert.match(app, /OFFICIAL_REQUIREMENT_CONFLICT/);
  assert.match(app, /officialConflicts: currentOfficialConflicts\(\)/);
  // 공고 충돌이 있으면 서버가 제출 준비 완료로 올리지 않는다.
  assert.match(api, /const officialConflicts = \(payload\.projectBlueprint\?\.officialConflicts \|\| \[\]\)/);
  assert.match(api, /const needsReview = warnings\.length > 0 \|\| unresolvedItems\.length > 0 \|\| officialConflicts\.length > 0/);
  assert.match(api, /submissionReady: false/);
  // 점검은 V1을 수정하지 않는다.
  const checker = fs.readFileSync(new URL('../src/blueprint-draft-check.js', import.meta.url), 'utf8');
  assert.doesNotMatch(checker, /fetch\(|openai/i);
  assert.doesNotMatch(checker, /sections\[\w+\]\s*=/);
});
