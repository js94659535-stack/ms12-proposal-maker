import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  APPLICANT_AREAS, CONFIRMED_STATUS, addCandidateItems, applicantAreaSummary, buildApplicantOrganization,
  compareNoticeWithApplicant, confirmedItems, findApplicant, migrateCompanyFactsToApplicant, normalizeApplicant,
  planApplicantQuestions, splitApplicantProfile, upsertApplicant
} from '../src/applicants.js';
import { deleteApplicant, listApplicants, normalizeApplicantRecord, saveApplicant } from '../functions/api/archive.js';
import { localAnalyze } from '../src/fallback.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
function applicantA() {
  return normalizeApplicant({
    id: 'applicant-a', name: 'QA 신청기관 A',
    items: [
      { id: 'a-legal', area: 'legal', label: '법인 유형', value: '사회복지법인', status: CONFIRMED_STATUS, source: 'QA 법인등기부등본' },
      { id: 'a-programs', area: 'programs', label: '집단상담 프로그램 회기', value: '12회', status: CONFIRMED_STATUS, source: 'QA 2025 운영일지' },
      { id: 'a-staff', area: 'staff', label: '상근 상담사', value: '3명', status: CONFIRMED_STATUS, source: 'QA 인사기록' },
      { id: 'a-budget', area: 'budget', label: '자부담 가능액', value: 'QA 미확인 자부담 5,000,000원', status: '확인 필요', source: '' },
      { id: 'a-performance', area: 'performance', label: '2019년 위탁사업 실적', value: 'QA 오래된 실적 기록', status: '오래된 정보', source: '' }
    ]
  });
}
function applicantB() {
  return normalizeApplicant({
    id: 'applicant-b', name: 'QA 신청기관 B',
    items: [
      { id: 'b-legal', area: 'legal', label: '법인 유형', value: '비영리민간단체', status: CONFIRMED_STATUS, source: 'QA 등록증' },
      { id: 'b-facilities', area: 'facilities', label: '운영 시설', value: 'QA 상담실 2실', status: CONFIRMED_STATUS, source: 'QA 임대차계약서' }
    ]
  });
}

function applicantDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        values: [], bind(...values) { this.values = values; return this; },
        async first() { return sql.includes('SELECT created_at') ? rows.get(`${this.values[1]}:${this.values[0]}`) || null : null; },
        async all() { return { results: [...rows.values()].filter(row => row.owner_hash === this.values[0]) }; },
        async run() {
          if (sql.startsWith('DELETE')) { rows.delete(`${this.values[1]}:${this.values[0]}`); return { success: true }; }
          const [id, ownerHash, name, note, confirmedCount, unverifiedCount, applicantJson, createdAt, updatedAt] = this.values;
          rows.set(`${ownerHash}:${id}`, { id, owner_hash: ownerHash, name, note, confirmed_count: confirmedCount, unverified_count: unverifiedCount, applicant_json: applicantJson, created_at: createdAt, updated_at: updatedAt });
          return { success: true };
        }
      };
    }
  };
}

test('신청기관을 두 곳 이상 등록·수정하고 영역별 상태를 구분한다', () => {
  let applicants = [];
  applicants = upsertApplicant(applicants, applicantA());
  applicants = upsertApplicant(applicants, applicantB());
  assert.equal(applicants.length, 2);
  assert.deepEqual(applicants.map(item => item.name), ['QA 신청기관 A', 'QA 신청기관 B']);

  const renamed = { ...findApplicant(applicants, 'applicant-b'), name: 'QA 신청기관 B(수정)' };
  applicants = upsertApplicant(applicants, renamed);
  assert.equal(applicants.length, 2);
  assert.equal(findApplicant(applicants, 'applicant-b').name, 'QA 신청기관 B(수정)');

  const summary = applicantAreaSummary(applicantA());
  assert.equal(summary.length, APPLICANT_AREAS.length);
  assert.equal(summary.find(area => area.key === 'programs').confirmed, 1);
  assert.equal(summary.find(area => area.key === 'budget').needsCheck, 1);
  assert.equal(summary.find(area => area.key === 'performance').needsCheck, 1);
});

test('신청기관 A와 B를 바꾸면 계획서 작성에 전달되는 기관정보도 달라진다', () => {
  const a = buildApplicantOrganization(applicantA(), []);
  const b = buildApplicantOrganization(applicantB(), []);
  assert.equal(a.organization, 'QA 신청기관 A');
  assert.equal(b.organization, 'QA 신청기관 B');
  assert.notDeepEqual(a.confirmedFacts, b.confirmedFacts);
  assert.ok(a.confirmedFacts.some(fact => fact.content === '사회복지법인'));
  assert.ok(b.confirmedFacts.some(fact => fact.content === '비영리민간단체'));
  assert.ok(!JSON.stringify(b).includes('사회복지법인'));
  assert.ok(!JSON.stringify(a).includes('비영리민간단체'));

  const none = buildApplicantOrganization(null, []);
  assert.deepEqual(none.confirmedFacts, []);
  assert.match(none.rule, /\[확인 필요\]/);
});

test('확인 필요·오래된 정보는 값 자체가 생성 요청에 전달되지 않는다', () => {
  const organization = buildApplicantOrganization(applicantA(), []);
  const payload = JSON.stringify(organization);
  assert.ok(!payload.includes('QA 미확인 자부담 5,000,000원'));
  assert.ok(!payload.includes('QA 오래된 실적 기록'));
  // 현재 프로필과 사업·실적 이력을 나눠 전달한다. 이력의 값은 확인된 것만 담는다.
  assert.deepEqual(organization.needsVerification.map(item => item.status).sort(), ['확인 필요']);
  const pastRecords = organization.pastProjectRecords.flatMap(project => project.records);
  assert.deepEqual(pastRecords.map(record => record.status), ['오래된 정보']);
  assert.equal(pastRecords[0].content, '');
  assert.match(organization.rule, /pastProjectRecords는 지난 사업의 기록이므로/);
  assert.ok(organization.needsVerification.every(item => !Object.hasOwn(item, 'content') && !Object.hasOwn(item, 'value')));
  assert.ok(organization.confirmedFacts.every(fact => fact.status === CONFIRMED_STATUS && fact.confirmedByUser === true));
  assert.match(organization.rule, /needsVerification 항목은 값을 전달하지 않았으므로/);
});

test('이번 사업 값을 지정해도 신청기관 원본 정보는 그대로 남는다', () => {
  const applicant = applicantA();
  const projectValues = [{ id: 'pv-1', label: '집단상담 프로그램 회기', value: '16회', applicantItemId: 'a-programs' }];
  const organization = buildApplicantOrganization(applicant, projectValues);

  assert.equal(organization.projectSpecificValues[0].thisProjectValue, '16회');
  assert.equal(organization.projectSpecificValues[0].applicantOriginalValue, '12회');
  assert.equal(organization.projectSpecificValues[0].appliesToThisProposalOnly, true);
  assert.equal(applicant.items.find(item => item.id === 'a-programs').value, '12회');

  // 전달용 payload를 이번 사업 값으로 덮어써도 신청기관 원본은 훼손되지 않는다.
  organization.confirmedFacts.find(fact => fact.id === 'a-programs').content = '16회';
  organization.projectSpecificValues[0].applicantOriginalValue = '16회';
  assert.equal(applicant.items.find(item => item.id === 'a-programs').value, '12회');
  assert.equal(confirmedItems(applicant).find(item => item.id === 'a-programs').value, '12회');
});

test('공고 요구와 신청기관 정보를 네 갈래로 비교한다', () => {
  const analysis = localAnalyze({
    sourceText: '신청 자격은 사회복지법인 또는 비영리민간단체이다.\n상근 상담사 2명 이상을 배치해야 한다.\n최근 3년 자부담 실적 증빙을 제출해야 한다.\n총 16회기 프로그램을 운영해야 한다.\n참여 아동 청소년 인원은 40명이다.',
    projectType: '복지', title: 'QA 공고'
  });
  const comparison = compareNoticeWithApplicant(analysis.requirements, applicantA());
  const total = comparison.confirmedStrengths.length + comparison.needsEvidence.length + comparison.missingFromApplicant.length + comparison.decideInThisProject.length;
  assert.equal(total, analysis.requirements.length);
  assert.equal(comparison.applicantName, 'QA 신청기관 A');
  assert.ok(comparison.confirmedStrengths.length >= 1);
  assert.ok(comparison.confirmedStrengths.every(item => item.matchedItems.some(value => value.status === CONFIRMED_STATUS)));
  assert.ok(comparison.needsEvidence.every(item => item.matchedItems.length && item.matchedItems.every(value => value.status !== CONFIRMED_STATUS)));
  assert.ok(comparison.missingFromApplicant.every(item => !item.matchedItems.length));
  assert.ok(comparison.decideInThisProject.every(item => !item.matchedItems.length));

  const empty = compareNoticeWithApplicant(analysis.requirements, normalizeApplicant({ name: '빈 기관' }));
  assert.equal(empty.confirmedStrengths.length, 0);
  assert.equal(empty.needsEvidence.length, 0);
});

test('신청기관 정보로 확인되는 질문은 다시 묻지 않는다', () => {
  const questions = ['상근 상담사 인원을 알려 주세요.', '이번 사업의 홍보 방법을 알려 주세요.'];
  const plan = planApplicantQuestions(questions, applicantA());
  assert.deepEqual(plan.ask, ['이번 사업의 홍보 방법을 알려 주세요.']);
  assert.equal(plan.resolved.length, 1);
  assert.match(plan.resolved[0].answer, /상근 상담사: 3명/);

  // 확인되지 않은 정보로는 질문을 건너뛰지 않는다.
  const unverifiedOnly = planApplicantQuestions(['자부담 가능액을 알려 주세요.'], applicantA());
  assert.deepEqual(unverifiedOnly.ask, ['자부담 가능액을 알려 주세요.']);
  assert.equal(unverifiedOnly.resolved.length, 0);
});

test('이전 버전의 확정 회사 정보는 신청기관 한 곳으로 이전된다', () => {
  const applicant = migrateCompanyFactsToApplicant([
    { id: 'legacy-1', category: '인력', title: '운영 인력', content: '상담사 2명', confirmedByUser: true, confirmedAt: '2026-01-02T00:00:00.000Z' },
    { id: 'legacy-2', category: '예산', title: '예산 정보', content: '추정 예산', confirmedByUser: false }
  ]);
  // 특정 기관명을 코드에 박아 두지 않는다(22-14). 이름을 주지 않으면 중립적인 이름으로 만든다.
  assert.equal(applicant.name, '내 기관');
  assert.equal(applicant.items.length, 1);
  assert.equal(applicant.items[0].area, 'staff');
  assert.equal(applicant.items[0].status, CONFIRMED_STATUS);
});

test('문서에서 만든 등록 후보는 확인 필요로만 추가되고 기존 항목을 덮어쓰지 않는다', () => {
  const applicant = applicantA();
  const merged = addCandidateItems(applicant, [
    { area: 'programs', label: '집단상담 프로그램 회기', value: '16회' },
    { area: 'partners', label: '협력기관', value: 'QA 협력기관', status: CONFIRMED_STATUS }
  ]);
  assert.equal(merged.items.find(item => item.id === 'a-programs').value, '12회');
  assert.equal(merged.items.filter(item => item.label === '집단상담 프로그램 회기').length, 1);
  const added = merged.items.find(item => item.label === '협력기관');
  assert.equal(added.status, '확인 필요');
  assert.equal(applicant.items.length, 5);
});

test('신청기관 정보는 소유자 키 기준으로 D1에 저장·조회·삭제된다', async () => {
  const db = applicantDb();
  await saveApplicant(db, 'owner-1', applicantA());
  await saveApplicant(db, 'owner-1', applicantB());
  await saveApplicant(db, 'owner-2', applicantB());

  const mine = await listApplicants(db, 'owner-1');
  assert.deepEqual(mine.map(item => item.id).sort(), ['applicant-a', 'applicant-b']);
  assert.equal(mine.find(item => item.id === 'applicant-a').confirmedCount, 3);
  assert.equal(mine.find(item => item.id === 'applicant-a').unverifiedCount, 2);
  assert.equal((await listApplicants(db, 'owner-3')).length, 0);

  await deleteApplicant(db, 'owner-1', 'applicant-b');
  assert.deepEqual((await listApplicants(db, 'owner-1')).map(item => item.id), ['applicant-a']);
  assert.equal((await listApplicants(db, 'owner-2')).length, 1);

  await assert.rejects(() => saveApplicant(db, 'owner-1', { name: '이름만 있는 기관' }));
  assert.equal(normalizeApplicantRecord({ id: 'x', name: 'y', items: [{ label: 'a', status: '아무거나' }] }).items[0].status, '확인 필요');
});

test('신청기관 정보 흐름은 OpenAI를 호출하지 않고 기존 작성 단계에 연결된다', () => {
  const applicantSource = fs.readFileSync(new URL('../src/applicants.js', import.meta.url), 'utf8');
  assert.doesNotMatch(applicantSource, /fetch\(|openai/i);

  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /const views = \[noticeImportView, noticeConfirmView, applicantSelectView, businessSelectView, documentView, documentView\]/);
  assert.match(appSource, /applicants: applicantsToolView/);
  assert.match(appSource, /신청기관 정보<\/button>/);
  assert.doesNotMatch(appSource, /신청기관 정보창고/);
  // 마스터 설계 전에 신청기관 확인된 정보로 답할 수 있는 질문을 걸러낸다.
  assert.match(appSource, /state\.missingInformation = applyApplicantAnswers\(/);
  assert.match(appSource, /organization: organizationForGeneration\(\)/);
});

test('현재 기관 프로필과 사업·실적 이력을 같은 구조 안에서 구분한다', () => {
  const applicant = normalizeApplicant({
    id: 'scope-a', name: 'QA 기관',
    items: [
      { id: 's-1', area: 'basic', label: '기관명', value: 'QA 기관', status: CONFIRMED_STATUS, source: '법인등기부등본', asOf: '2026' },
      { id: 's-2', area: 'staff', label: '상근 인력', value: '9명', status: CONFIRMED_STATUS, source: '2026 인사기록', asOf: '2026' },
      { id: 's-3', area: 'budget', label: '총사업비', value: '16,100,000원', status: '확인 필요', source: 'QA 배분신청서에서 추출', asOf: '2026-09' },
      { id: 's-4', area: 'programs', label: '운영 회기', value: '20회기', status: '확인 필요', source: 'QA 배분신청서에서 추출', asOf: '2026-09' },
      { id: 's-5', area: 'performance', label: '2024년 사업실적', value: 'QA 학습지원 사업', status: CONFIRMED_STATUS, source: 'QA 결과보고서', asOf: '2024' }
    ]
  });
  const split = splitApplicantProfile(applicant);
  assert.deepEqual(split.profile.map(item => item.id).sort(), ['s-1', 's-2']);
  assert.deepEqual(split.history.map(item => item.id).sort(), ['s-3', 's-4', 's-5']);
  assert.equal(split.projects.length, 2);
  assert.deepEqual(split.projects.map(project => project.year), ['2026', '2024']);
  // 값은 그대로 남고 분류만 붙는다.
  assert.equal(applicant.items.length, 5);
  assert.equal(applicant.items.find(item => item.id === 's-3').value, '16,100,000원');

  const organization = buildApplicantOrganization(applicant, []);
  // 확정 사실은 현재 프로필에서만 나온다.
  assert.deepEqual(organization.confirmedFacts.map(fact => fact.title).sort(), ['기관명', '상근 인력']);
  // 지난 사업 실적은 근거로만 제안한다.
  const records = organization.pastProjectRecords.flatMap(project => project.records);
  assert.equal(records.length, 3);
  assert.equal(records.find(record => record.title === '2024년 사업실적').content, 'QA 학습지원 사업');
  assert.equal(records.find(record => record.title === '총사업비').content, '');
  assert.match(organization.rule, /이번 사업의 값으로 옮겨 적지 않는다/);
});
