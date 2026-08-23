import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BLUEPRINT_STATUSES, blueprintInputs, buildBlueprint, checkBlueprintLogic, detectApplicationTypes } from '../src/project-blueprint.js';
import { analyzeNoticeStructure } from '../src/notice-logic.js';
import { matchApplicantToNotice } from '../src/fit-matching.js';
import { CONFIRMED_STATUS, normalizeApplicant } from '../src/applicants.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
const NOTICE = analyzeNoticeStructure({
  title: '아동·청소년 가족기능 강화사업 공고',
  overview: `사업목적 : 아동의 건강한 성장발달과 가족기능 회복을 지원한다.
필요성 : 학대·방임으로 가족기능이 약화된 아동의 위기가 늘고 있다.
대상 : 지역 아동과 보호자.
신청자격 : 아동보호전문기관에서 사례관리 중인 학대피해아동에게 개입이 가능한 기관.
주요사업내용 : 아동 심리정서 회복 프로그램과 보호자 상담을 운영한다.
사업기간 : 2027. 1. ~ 2027. 12. 사업예산 총 100,000,000원 이내 (1개소당 10,000,000원 이내)
성과지표 : 사전·사후 검사 결과를 결과 보고에 포함한다.
제출 서류 : 사업계획서와 예산내역서를 제출하여야 한다.`
});

// 수완지역아동센터 유형: 운영 기록만 있고 학대피해아동 개입 경험·전문인력·협력기관은 확인되지 않았다.
const SUWAN = normalizeApplicant({
  id: 'suwan',
  name: '수완지역아동센터',
  items: [
    { id: 's1', area: 'basic', label: '기관명', value: '수완지역아동센터', status: CONFIRMED_STATUS, source: '고유번호증', asOf: '2026' },
    { id: 's2', area: 'budget', label: '총사업비', value: '2024년 총사업비 30,000,000원 집행', status: CONFIRMED_STATUS, source: '2024 결과보고서', asOf: '2024', projectName: '2024 방과후 사업' },
    { id: 's3', area: 'measurement', label: '성과측정 경험', value: '사전·사후 검사 실시', status: CONFIRMED_STATUS, source: '2024 결과보고서', asOf: '2024', projectName: '2024 방과후 사업' },
    { id: 's4', area: 'performance', label: '운영 회기', value: '주 2회 20회기 운영', status: CONFIRMED_STATUS, source: '2024 결과보고서', asOf: '2024', projectName: '2024 방과후 사업' }
  ]
});

function blueprintOf(applicant = SUWAN, projectValues = []) {
  const fit = matchApplicantToNotice(NOTICE, applicant);
  return buildBlueprint({ structure: NOTICE, applicant, fitResult: fit, projectValues });
}

test('공고·기관·이번 사업 세 가지 입력을 분리한다', () => {
  const fit = matchApplicantToNotice(NOTICE, SUWAN);
  const inputs = blueprintInputs(NOTICE, SUWAN, fit, []);
  assert.deepEqual(inputs.notice.map(entry => entry.title), ['목적', '대상', '필수 사업내용', '자격', '예산/기간', '성과 요구', '평가항목', '필수 제출사항']);
  assert.deepEqual(inputs.project.map(entry => entry.title), ['사업명', '대상', '인원', '기간', '회기', '핵심 프로그램', '수행인력', '협력기관', '예산', '성과목표', '성과지표']);
  // 이번 사업 값은 사용자가 확정하기 전에는 비어 있어야 한다.
  assert.ok(inputs.project.every(entry => entry.status === 'NEEDS_CONFIRMATION' && entry.value === ''));
  // 기관 실적은 DIRECT / RELATED / GENERAL로 나눠서 전달한다.
  assert.deepEqual(Object.keys(inputs.applicant.records), ['DIRECT', 'RELATED', 'GENERAL']);
  assert.ok(inputs.applicant.records.GENERAL.length > 0);
});

test('설계도 항목에 상태를 붙인다', () => {
  const blueprint = blueprintOf();
  assert.deepEqual(blueprint.items.map(entry => entry.title), [
    '신청유형', '사업 한 줄 정의', '해결하려는 문제', '핵심 대상', '사업 목적', '세부 목표', '핵심 프로그램',
    '프로그램별 대상/회기/담당', '수행체계', '기관 강점을 활용하는 부분', '필요한 협력', '예산 구조',
    '성과목표', '성과지표/측정방법', '공고 선정요건과의 연결', '아직 결정되지 않은 사항'
  ]);
  assert.ok(blueprint.items.every(entry => BLUEPRINT_STATUSES.includes(entry.status)));
  assert.equal(blueprint.items.find(entry => entry.key === 'purpose').status, 'CONFIRMED');
  assert.equal(blueprint.items.find(entry => entry.key === 'target').status, 'CONFIRMED');
  // 확정 전 설계안은 PROPOSED로만 남고 근거를 함께 붙인다.
  const proposed = blueprint.items.filter(entry => entry.status === 'PROPOSED');
  assert.ok(proposed.length > 0);
  assert.ok(proposed.every(entry => entry.question && entry.basis));
});

test('모르는 기관 사실은 만들지 않고 NEEDS_CONFIRMATION으로 남긴다', () => {
  const blueprint = blueprintOf();
  for (const key of ['delivery', 'partners', 'strengths', 'programDetails', 'budget', 'outcomeGoals']) {
    const entry = blueprint.items.find(item => item.key === key);
    assert.equal(entry.status, 'NEEDS_CONFIRMATION', `${entry.title}이(가) 확인 없이 채워졌습니다`);
    assert.ok(entry.question);
  }
  // 전문인력·협력기관 이름을 만들어 내지 않는다.
  const serialized = JSON.stringify(blueprint.items);
  assert.doesNotMatch(serialized, /협약을 체결한|전담 사회복지사 \d|사례관리사 \d/);
});

test('과거 실적의 인원·회기·예산을 이번 사업 값으로 복사하지 않는다', () => {
  const blueprint = blueprintOf();
  const design = blueprint.items.filter(entry => entry.status !== 'CONFIRMED');
  const serialized = JSON.stringify(design.map(entry => entry.value));
  // 과거 사업의 20회기 / 30,000,000원이 이번 사업 설계값으로 넘어오면 안 된다.
  assert.doesNotMatch(serialized, /20\s*회기/);
  assert.doesNotMatch(serialized, /30,000,000/);
  const detail = blueprint.items.find(entry => entry.key === 'programDetails');
  assert.match(detail.value, /회기 \[확인 필요\]/);
  assert.match(detail.value, /담당 \[확인 필요\]/);
});

test('사용자가 확정한 이번 사업 값은 CONFIRMED로 쓴다', () => {
  const blueprint = blueprintOf(SUWAN, [
    { key: 'name', value: '2027 아동 심리정서 회복 지원사업' },
    { key: 'headcount', value: '아동 15명' },
    { key: 'sessions', value: '12회기' },
    { key: 'staff', value: '전담 사회복지사 1명, 외부 상담사 1명' }
  ]);
  assert.equal(blueprint.items.find(entry => entry.key === 'summary').status, 'CONFIRMED');
  assert.equal(blueprint.items.find(entry => entry.key === 'delivery').status, 'CONFIRMED');
  const detail = blueprint.items.find(entry => entry.key === 'programDetails');
  assert.match(detail.value, /12회기/);
  assert.doesNotMatch(detail.value, /회기 \[확인 필요\]/);
});

test('문제→대상→목적→프로그램→회기·인력→예산→성과목표→성과지표를 검사한다', () => {
  const blueprint = blueprintOf();
  assert.deepEqual(blueprint.logic.map(link => link.link), [
    '해결하려는 문제 → 핵심 대상', '핵심 대상 → 사업 목적', '사업 목적 → 핵심 프로그램',
    '핵심 프로그램 → 프로그램별 대상/회기/담당', '프로그램별 대상/회기/담당 → 예산 구조',
    '예산 구조 → 성과목표', '성과목표 → 성과지표/측정방법'
  ]);
  assert.ok(blueprint.logic.every(link => ['연결됨', '잠정 연결', '설계 보완 필요'].includes(link.state)));
  // 끊어진 연결에는 반드시 질문이 붙는다.
  assert.ok(blueprint.logic.filter(link => link.state === '설계 보완 필요').every(link => link.question));
  // 설계가 덜 됐어도 초안 작성 자체는 막지 않는다.
  assert.equal(blueprint.readiness, 'DESIGN_INCOMPLETE');
  assert.equal(blueprint.canDraft, true);
  assert.match(blueprint.verdict, /^제출 전 점검 \d+곳 — 설계값 \d+ · 공고 요건 \d+$/);
  assert.ok(blueprint.verdictReasons.length > 0);
  // 미확정 값은 초안에서 [확인 필요] 자리로 남는다.
  assert.ok(blueprint.draftPlaceholders.some(entry => entry.placeholder.includes('[확인 필요]')));
  assert.ok(blueprint.submissionChecklist.length > 0);
});

test('설계가 모두 확정되면 본문 작성 단계로 넘어간다', () => {
  const blueprint = blueprintOf(SUWAN, [
    { key: 'name', value: '2027 아동 심리정서 회복 지원사업' },
    { key: 'target', value: '학대피해아동과 보호자' },
    { key: 'headcount', value: '아동 15명' },
    { key: 'period', value: '2027.1~2027.12' },
    { key: 'sessions', value: '12회기' },
    { key: 'programs', value: '아동 심리정서 회복 프로그램 / 보호자 상담' },
    { key: 'staff', value: '전담 사회복지사 1명' },
    { key: 'partners', value: '지역 아동보호전문기관(협약 예정)' },
    { key: 'budget', value: '총 20,000,000원 (인건비 8,000,000 / 프로그램비 10,000,000 / 운영비 2,000,000)' },
    { key: 'outcomeGoals', value: '아동 15명 심리정서 회복 사전·사후 개선' },
    { key: 'indicators', value: '아동 심리정서 사전·사후 검사, 보호자 상담 만족도 조사' }
  ]);
  assert.ok(blueprint.logic.every(link => link.state !== '설계 보완 필요'), JSON.stringify(blueprint.logic.filter(link => link.state === '설계 보완 필요')));
  assert.ok(['DRAFT_READY', 'SUBMISSION_READY'].includes(blueprint.readiness));
  assert.equal(blueprint.canDraft, true);
});

test('신청유형이 갈리면 유형을 먼저 고르게 하고 유형별 조건을 섞지 않는다', () => {
  const TWO_TYPES = analyzeNoticeStructure({
    title: '가족기능 강화사업 공고',
    overview: `사업목적 : 아동의 건강한 성장발달과 가족기능 회복.
신청유형 ○ 재학대예방형 - 아동보호전문기관에서 사례관리 중인 학대피해아동, 아동학대행위자, 가족구성원을 대상으로 개입이 가능한 기관 ○ 아동보호형 - 지역사회 내 어려움으로 보호를 필요로 하는 요보호아동, 보호자를 대상으로 개입이 가능한 기관.
주요사업내용 : 아동 심리정서 회복 프로그램과 보호자 상담을 운영한다.`
  });
  const types = detectApplicationTypes(TWO_TYPES);
  assert.deepEqual(types.map(entry => entry.name), ['재학대예방형', '아동보호형']);

  // 고르기 전 — 유형 항목은 NEEDS_CONFIRMATION이고 두 유형의 차이와 선택 질문을 준다.
  const before = buildBlueprint({ structure: TWO_TYPES, applicant: SUWAN, fitResult: matchApplicantToNotice(TWO_TYPES, SUWAN), projectValues: [] });
  const beforeType = before.items.find(entry => entry.key === 'applicationType');
  assert.equal(beforeType.status, 'NEEDS_CONFIRMATION');
  assert.match(beforeType.value, /재학대예방형/);
  assert.match(beforeType.value, /아동보호형/);
  assert.match(beforeType.question, /어느 유형으로 신청/);
  assert.equal(before.applicationTypes.blocked, true);
  assert.equal(before.canDraft, false);
  assert.equal(before.readiness, 'DESIGN_INCOMPLETE');
  // 두 유형이 섞인 문장은 그대로 설계값으로 쓰지 않는다.
  assert.equal(before.items.find(entry => entry.key === 'target').status, 'NEEDS_CONFIRMATION');

  // 고른 뒤 — 선택한 유형만 적용하고 다른 유형 조건은 설계에서 빠진다.
  const after = buildBlueprint({ structure: TWO_TYPES, applicant: SUWAN, fitResult: matchApplicantToNotice(TWO_TYPES, SUWAN), projectValues: [{ key: 'applicationType', value: '재학대예방형' }] });
  const afterType = after.items.find(entry => entry.key === 'applicationType');
  assert.equal(afterType.status, 'CONFIRMED');
  assert.match(afterType.basis, /아동보호형/);
  assert.equal(after.applicationTypes.selected, '재학대예방형');
  assert.equal(after.canDraft, true);
  const design = JSON.stringify(after.items.filter(entry => ['target', 'problem', 'programs', 'objectives'].includes(entry.key)).map(entry => entry.value));
  assert.match(design, /학대피해아동/);
  assert.doesNotMatch(design, /요보호아동/);
  // 공고 원문 자체는 유지한다.
  assert.ok(after.applicationTypes.options.some(entry => entry.name === '아동보호형' && /요보호아동/.test(entry.description)));
});

test('공고 선정요건 11개를 설계도 항목과 연결한다', () => {
  const blueprint = blueprintOf();
  assert.equal(blueprint.requirementLinks.length, NOTICE.fields.length);
  for (const link of blueprint.requirementLinks) {
    assert.ok(link.requirement && typeof link.covered === 'boolean' && typeof link.hasApplicantEvidence === 'boolean');
    if (!link.covered) assert.ok(link.gap, `${link.requirement} 부족 내용 없음`);
  }
  assert.ok(blueprint.requirementLinks.some(link => link.covered));
  assert.ok(blueprint.openQuestions.length > 0);
  assert.ok(blueprint.openQuestions.every(entry => entry.question && entry.section));
});

test('설계도 엔진은 외부 호출 없이 동작한다', () => {
  const source = fs.readFileSync(new URL('../src/project-blueprint.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|openai/i);
  // 논리 검사는 항목 배열만으로도 동작한다.
  assert.deepEqual(checkBlueprintLogic([]), []);
});
