import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBlueprint } from '../src/project-blueprint.js';
import { matchApplicantToNotice } from '../src/fit-matching.js';
import { analyzeNoticeStructure } from '../src/notice-logic.js';
import { CONFIRMED_STATUS, buildApplicantOrganization, normalizeApplicant } from '../src/applicants.js';

const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('사업 설계도를 사업 선택 화면에 연결하고 엔진을 그대로 쓴다', () => {
  // 엔진을 화면에서 복제하지 않고 import해서 쓴다.
  assert.match(source, /import \{ buildBlueprint \} from '\.\/project-blueprint\.js'/);
  assert.match(source, /import \{ matchApplicantToNotice \} from '\.\/fit-matching\.js'/);
  assert.match(source, /function currentBlueprint\(\)/);
  assert.match(source, /buildBlueprint\(\{ structure, applicant, fitResult: matchApplicantToNotice\(structure, applicant\), projectValues: blueprintProjectValues\(\) \}\)/);
  // 계획서 작성(4단계) 앞 단계인 사업 선택 화면에 붙인다.
  assert.match(source, /function businessSelectView\(\)[\s\S]{0,900}\$\{blueprintView\(\)\}/);
  // 화면에 보여야 하는 항목
  assert.match(source, /const BLUEPRINT_CARD_KEYS = \['summary', 'problem', 'target', 'purpose', 'objectives', 'programs', 'programDetails', 'delivery', 'strengths', 'partners', 'budget', 'outcomeGoals', 'indicators'\]/);
  // 한국어 상태 표시
  assert.match(source, /CONFIRMED: '확정', SUPPORTED: '근거 있음', PROPOSED: '설계안', NEEDS_CONFIRMATION: '확인 필요'/);
  assert.match(source, /설계안 · 확정 아님/);
  // 신청유형 선택 · 입력 저장 · 초안 작성 버튼
  assert.match(source, /data-blueprint-type/);
  assert.match(source, /data-blueprint-save/);
  assert.match(source, /id="blueprint-draft"/);
  assert.match(source, /제출 전 확인이 필요한 항목이 있습니다/);
});

test('설계도 입력은 이번 사업 값으로만 저장한다', () => {
  // 기관 원본(applicants/items)을 건드리지 않고 projectValues에만 쓴다.
  assert.match(source, /function setBlueprintValue\(key, label, value\)[\s\S]{0,700}setState\(\{ projectValues: next/);
  assert.match(source, /function saveBlueprintInputs\(sectionKey\)[\s\S]{0,900}setState\(\{ projectValues: \[\.\.\.rest, \.\.\.added\]/);
  assert.doesNotMatch(source, /function saveBlueprintInputs[\s\S]{0,900}applicant\.items =/);
  // 초안으로 넘기는 데이터: 미확정은 [확인 필요], 설계안은 설계안 표시 유지
  assert.match(source, /function blueprintHandoff\(\)/);
  assert.match(source, /item\.status === 'NEEDS_CONFIRMATION' \? '\[확인 필요\]' : item\.value/);
  assert.match(source, /proposedOnly: item\.status === 'PROPOSED'/);
  assert.match(source, /projectBlueprint: blueprintHandoff\(\)/);
});

// 화면이 실제로 하는 계산과 같은 경로로 확인한다(브라우저 없이).
const NOTICE = analyzeNoticeStructure({
  title: '가족기능 강화사업 공고',
  overview: `사업목적 : 아동의 건강한 성장발달과 가족기능 회복.
신청유형 ○ 재학대예방형 - 아동보호전문기관에서 사례관리 중인 학대피해아동, 아동학대행위자, 가족구성원을 대상으로 개입이 가능한 기관 ○ 아동보호형 - 지역사회 내 어려움으로 보호를 필요로 하는 요보호아동, 보호자를 대상으로 개입이 가능한 기관.
주요사업내용 : 아동 심리정서 회복 프로그램과 보호자 상담을 운영한다.
사업기간 : 2027. 1. ~ 2027. 12. 사업예산 총 100,000,000원 이내
성과지표 : 사전·사후 검사 결과를 결과 보고에 포함한다.`
});
const APPLICANT = normalizeApplicant({
  id: 'suwan', name: '수완지역아동센터',
  items: [
    { id: 's1', area: 'basic', label: '기관명', value: '수완지역아동센터', status: CONFIRMED_STATUS, source: '고유번호증', asOf: '2026' },
    { id: 's2', area: 'budget', label: '총사업비', value: '2024년 총사업비 16,100,000원 집행', status: CONFIRMED_STATUS, source: '2024 결과보고서', asOf: '2024', projectName: '2024 방과후 사업' },
    { id: 's3', area: 'performance', label: '운영 회기', value: '주 2회 20회기 운영', status: CONFIRMED_STATUS, source: '2024 결과보고서', asOf: '2024', projectName: '2024 방과후 사업' }
  ]
});
// app.js의 currentBlueprint()와 같은 순서로 계산한다.
function screenBlueprint(projectValues) {
  const values = projectValues.filter(item => item.blueprintKey).map(item => ({ key: item.blueprintKey, value: item.value, source: '사용자 확정' }));
  return buildBlueprint({ structure: NOTICE, applicant: APPLICANT, fitResult: matchApplicantToNotice(NOTICE, APPLICANT), projectValues: values });
}

test('유형 선택 → 확인 필요 입력 → 즉시 재계산이 화면 경로에서 동작한다', () => {
  let projectValues = [];
  const before = screenBlueprint(projectValues);
  assert.equal(before.applicationTypes.options.length, 2);
  assert.equal(before.canDraft, false);
  assert.equal(before.readiness, 'DESIGN_INCOMPLETE');

  // 유형 선택(= data-blueprint-type 클릭)
  projectValues = [{ id: 'blueprint-applicationType', blueprintKey: 'applicationType', label: '신청유형', value: '재학대예방형', applicantItemId: '' }];
  const chosen = screenBlueprint(projectValues);
  assert.equal(chosen.canDraft, true);
  const chosenText = JSON.stringify(chosen.items.map(item => item.value));
  assert.match(chosenText, /학대피해아동/);
  assert.doesNotMatch(chosenText, /요보호아동/);
  // 과거 사업 수치는 자동으로 들어오지 않는다.
  assert.doesNotMatch(chosenText, /16,100,000/);
  assert.doesNotMatch(chosenText, /20회기/);
  assert.equal(chosen.items.find(item => item.key === 'programDetails').status, 'NEEDS_CONFIRMATION');

  // 확인 필요 값 입력(= data-blueprint-save 클릭)
  projectValues = [...projectValues,
    { id: 'blueprint-headcount', blueprintKey: 'headcount', label: '인원', value: '아동 15명', applicantItemId: '' },
    { id: 'blueprint-sessions', blueprintKey: 'sessions', label: '회기', value: '12회기', applicantItemId: '' },
    { id: 'blueprint-staff', blueprintKey: 'staff', label: '담당 인력', value: '전담 사회복지사 1명', applicantItemId: '' }];
  const filled = screenBlueprint(projectValues);
  const detail = filled.items.find(item => item.key === 'programDetails');
  assert.equal(detail.status, 'CONFIRMED');
  assert.match(detail.value, /12회기/);
  assert.equal(filled.items.find(item => item.key === 'delivery').status, 'CONFIRMED');
  assert.ok(filled.byStatus.NEEDS_CONFIRMATION < chosen.byStatus.NEEDS_CONFIRMATION);

  // 입력값은 이번 사업 값(projectSpecificValues)에만 남고 기관 원본은 그대로다.
  const organization = buildApplicantOrganization(APPLICANT, projectValues);
  assert.ok(organization.projectSpecificValues.some(item => item.thisProjectValue === '12회기'));
  assert.ok(organization.projectSpecificValues.every(item => item.appliesToThisProposalOnly));
  assert.deepEqual(APPLICANT.items.map(item => item.value), [
    '수완지역아동센터', '2024년 총사업비 16,100,000원 집행', '주 2회 20회기 운영'
  ]);
});

test('작성 화면에서 V1 → 검증 → 수정계획 → V2 → 남은 확인 필요를 구분해 보여준다', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /function proposalPipelineView\(\)/);
  assert.match(app, /\$\{proposalPipelineView\(\)\}\$\{draftBlueprintCheckView\(\)\}/);
  // 단계 구분: V1 초안 · 검증 결과 · 수정계획 · V2 수정본 · 남은 확인 필요
  for (const label of ['V1 초안', '검증 결과', '수정계획', 'V2 수정본', '남은 확인 필요']) assert.ok(app.includes(label), label);
  // 남은 항목이 있으면 제출 준비 완료로 올리지 않는다는 문구를 유지한다.
  assert.match(app, /확인 전에는 제출 준비 완료로 올리지 않습니다/);
  // 새 상위 메뉴를 만들지 않는다(기존 워크플로 단계만 사용).
  assert.match(app, /const STEPS = \['공고 가져오기', '공고 확인', '신청기관 선택', '사업 선택', '계획서 작성', '검토·완성'\]/);
});

test('수정 상태를 다섯 가지로 구분해 보여준다', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const label of ['수정됨', '근거로 보강됨', '사용자 확인 필요', '아직 자료 부족', '공식요건 충돌']) assert.ok(app.includes(label), label);
  // 공식요건 충돌은 수정 상태와 분리해 표시한다.
  assert.match(app, /const conflict = plan\.conflictingValues\?\.length >= 2/);
});
