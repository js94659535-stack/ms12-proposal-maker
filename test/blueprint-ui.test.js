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
  assert.match(app, /\$\{proposalPipelineView\(\)\}\$\{decisionCenterView\(\)\}\$\{draftBlueprintCheckView\(\)\}/);
  // 단계 구분: V1 초안 · 검증 결과 · 수정계획 · V2 수정본 · 남은 확인 필요
  for (const label of ['V1 초안', '검증 결과', '수정계획', 'V2 수정본', '남은 확인 필요']) assert.ok(app.includes(label), label);
  // 남은 항목이 있으면 제출 준비 완료로 올리지 않는다는 문구를 유지한다.
  assert.match(app, /확인 전에는 제출 준비 완료로 올리지 않습니다/);
  // 새 상위 메뉴를 만들지 않는다(기존 워크플로 단계만 사용).
  assert.match(app, /const STEPS = \['공고 준비', '공고 분석', '신청기관 준비', '사업 설계', '계획서 작성', '검토·제출'\]/);
});

test('수정 상태를 다섯 가지로 구분해 보여준다', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const label of ['수정됨', '근거로 보강됨', '사용자 확인 필요', '아직 자료 부족', '공식요건 충돌']) assert.ok(app.includes(label), label);
  // 공식요건 충돌은 수정 상태와 분리해 표시한다.
  assert.match(app, /const conflict = plan\.conflictingValues\?\.length >= 2/);
});

test('남은 사용자 결정 6가지를 한 화면에 모으고 확정값만 반영한다', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /function decisionCenterView\(\)/);
  assert.match(app, /\$\{proposalPipelineView\(\)\}\$\{decisionCenterView\(\)\}/);
  // 인원·회기 충돌, 자격·협력, 지역 근거, 성과목표·측정도구, 예산·제출서류
  for (const label of ['참여인원 확정', '회기 확정', '기관 자격·수행인력', '협력체계', '지역 필요성 근거', '성과목표 수치', '성과지표·측정도구', '예산 총액·산출근거', '제출서류 준비']) {
    assert.ok(app.includes(label), label);
  }
  // 입력·저장은 이번 사업 값으로만 저장한다.
  assert.match(app, /data-decision-save/);
  assert.match(app, /setBlueprintValue\(key, field\?\.label \|\| key/);
  // 확정값이 없으면 최종본을 만들지 않는다.
  assert.match(app, /function buildFinalVersion\(\)/);
  assert.match(app, /확정된 값이 없습니다/);
  assert.match(app, /appendProposalVersion\(state\.proposalVersions \|\| \[\], \{ sections, label: '사용자 확정 반영 최종본'/);
  // 최종 제출본과 출력 흐름
  assert.match(app, /function finalSubmissionView\(\)/);
  assert.match(app, /completionMode \? finalSubmissionView\(\)/);
  assert.match(app, /임의로 제출 가능으로 올리지 않습니다/);
  assert.match(app, /id="docx"/);
});

test('최종 제출본 출력 버튼과 보관 스냅샷 연결이 끊기지 않는다', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  // 상단 도구모음과 최종 제출본 카드의 출력 버튼 id가 겹치지 않는다.
  assert.equal((app.match(/id="docx"/g) || []).length, 1);
  assert.match(app, /id="final-docx"/);
  assert.match(app, /querySelector\('#final-docx'\)\?\.addEventListener/);
  assert.match(app, /querySelector\('#final-pdf'\)\?\.addEventListener/);
  assert.match(app, /querySelector\('#final-print'\)\?\.addEventListener/);
  // 자료보관함에서 다시 열 때 공고 선정논리와 초안 상태가 함께 복원된다.
  assert.match(app, /'revisionPlan', 'noticeLogic', 'draftReview'\]/);
});

test('첫 화면과 상단 표시가 서비스용 한국어로 정리되어 있다', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  // 개발용 표현 제거
  assert.doesNotMatch(app, /Proposal Workbench|마인드스토리 내부용/);
  assert.match(app, /사업계획서 작성 도우미/);
  // 홈은 작업 화면과 분리된 별도 화면으로 존재한다.
  assert.match(app, /function homeView\(\)/);
  assert.match(app, /const tools = \{ home: homeView/);
  assert.match(app, /if \(state\.activeTool === 'home'\) return/);
  assert.match(app, /step: 0, activeTool: 'home'/);
  // 작업 화면(공고 준비)을 랜딩처럼 쓰지 않는다.
  assert.doesNotMatch(app, /startPanelView/);
  for (const label of ['공고 분석부터 제출본까지', '새 사업계획서 시작', '작성 중인 계획서 계속하기', '업무 흐름', '최근 작업', '핵심 가치', '작성 원칙', '아직 작성 중인 계획서가 없습니다']) assert.ok(app.includes(label), label);
  // 홈 워크플로 6단계는 요구된 이름·설명을 그대로 쓴다.
  for (const label of ['공고 업로드 · 요구사항 확인', '기관정보 · 실적 · 적합성', '대상 · 프로그램 · 예산 · 성과', '근거 기반 V1 작성', 'AI 코칭 · V2 · 사용자 결정', '최종본 · DOCX/PDF · 계획서보관함']) assert.ok(app.includes(label), label);
  // 홈 진입점이 기존 흐름으로 연결된다.
  for (const key of ['data-home-start', 'data-home-continue', 'data-home-archive', 'data-home-step']) assert.ok(app.includes(key), key);
  // 6개 대분류가 랜딩과 상단 내비게이션에서 같은 이름을 쓴다.
  for (const label of ['공고 준비', '공고 분석', '신청기관 준비', '사업 설계', '계획서 작성', '검토·제출']) assert.ok(app.includes(label), label);
  assert.match(app, /querySelector\('#open-coaching-home'\)\?\.addEventListener/);
  // 단계 메뉴 가로 스크롤 제거와 현재 단계 강조
  assert.match(css, /\.workflow-steps\{overflow-x:visible;flex-wrap:wrap/);
  assert.match(css, /\.workflow-step\.active\{background:var\(--blue-soft\)/);
});

test('홈 랜딩은 상단 메뉴·대화형 시작창·마지막 CTA를 갖춘다', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const label of ['제품소개', '이용방법', '주요기능', '새 사업계획서 시작', '공고문을 올리거나 사업 내용을 입력하면 첫 단계부터 안내합니다', '공고문 업로드', '직접 입력', '서비스 화면']) {
    assert.ok(app.includes(label), label);
  }
  // 6단계는 좌우로 넘겨 보고, 세로 스크롤 흐름은 그대로 유지한다.
  assert.match(app, /class="home-deck-track" data-deck-track/);
  assert.match(app, /data-deck-prev|data-deck-next/);
  assert.match(app, /querySelectorAll\('\[data-deck\]'\)/);
  // 상단 메뉴는 랜딩 섹션으로 이동하고, 시작창은 기존 공고 준비 흐름으로 연결한다.
  assert.match(app, /data-home-scroll="home-product"/);
  assert.match(app, /querySelectorAll\('\[data-home-scroll\]'\)/);
  assert.match(app, /querySelectorAll\('\[data-home-upload\]'\)[\s\S]{0,200}navigateToStep\(0/);
  assert.match(app, /querySelectorAll\('\[data-home-manual\]'\)[\s\S]{0,200}navigateToStep\(0/);
  // 가짜 로고·후기·숫자를 만들지 않는다.
  assert.doesNotMatch(app, /고객사|도입 기관 \d|후기|평점/);
});

test('이전에 저장된 화면 상태가 새 홈을 가리지 않는다', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  // 저장된 activeTool이 있어도 최초 1회는 홈을 보여 주고, 작업 데이터는 건드리지 않는다.
  assert.match(app, /if \(!saved\.homeSeen\) \{ restored\.activeTool = 'home'; restored\.homeSeen = true; \}/);
  assert.match(app, /activeTool: 'home', homeSeen: false/);
  assert.doesNotMatch(app, /if \(!saved\.homeSeen\)[\s\S]{0,120}sections: \[\]/);
});

test('모든 화면에서 홈·뒤로·앞으로 이동과 자료보관함 바로가기를 제공한다', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  // 작업·도구 화면(공통 셸)과 홈 화면 모두 이동 버튼을 갖는다.
  assert.match(app, /id="workflow-back" aria-label="뒤로 가기"/); // 홈 헤더
  assert.match(app, /id="workflow-forward" aria-label="앞으로 가기"/);
  assert.match(app, /⌂ 홈 화면/);
  assert.match(app, /querySelector\('#workflow-home'\)\?\.addEventListener\('click', \(\) => setState\(\{ activeTool: 'home'/);
  // 자료보관함은 홈과 작업 화면 상단에서 바로 열 수 있고, 해당 카드로 이동한다.
  assert.match(app, /id="open-archive-box"/);
  assert.match(app, /id="archive-box"/);
  assert.match(app, /querySelector\('#archive-box'\)\?\.scrollIntoView/);
});
