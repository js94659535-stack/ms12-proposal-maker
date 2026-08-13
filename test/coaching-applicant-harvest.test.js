import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applySafeCandidates, applyUpdateCandidate, buildUpdateCandidates, extractApplicantCandidates } from '../src/applicant-extract.js';
import { CONFIRMED_STATUS, normalizeApplicant } from '../src/applicants.js';

// 실제 OpenAI 호출 없이 고정 계획서 fixture만 사용한다.
const PROPOSAL_TEXT = `QA 청소년 학습회복 프로젝트 사업계획서
작성일: 2026-03-10

1. 신청기관
기관명: QA 신청기관 A
상근 인력 4명이 사업을 전담하며, 청소년상담사 2급 2명이 프로그램을 운영한다.
담당자 홍길동 010-1234-5678 (hong@example.com) 에게 문의한다.
상담실 3실과 집단상담실 1실을 운영한다.
QA 협력학교와 업무협약을 체결하여 대상자를 모집한다.

2. 사업 내용
프로그램은 주 1회 총 20회기로 운영한다.
총사업비는 30,000,000원이며 자부담 3,000,000원을 편성했다.
성과는 사전·사후 검사와 만족도 조사로 측정한다.
참여 청소년의 출석률 85%를 목표로 한다.

3. 수행 실적
2025년 청소년 마음건강 지원사업
2024년 지역아동 학습지원 사업`;

function applicant() {
  return normalizeApplicant({
    id: 'applicant-a', name: 'QA 신청기관 A',
    items: [
      { id: 'a-basic', area: 'basic', label: '기관명', value: 'QA 신청기관 A', status: CONFIRMED_STATUS, source: 'QA 등기부등본' },
      { id: 'a-staff', area: 'staff', label: '상근 인력', value: '3명', status: CONFIRMED_STATUS, source: 'QA 인사기록', asOf: '2026' },
      { id: 'a-performance', area: 'performance', label: '2024년 사업실적', value: '지역아동 학습지원 사업', status: CONFIRMED_STATUS, source: 'QA 결과보고서', asOf: '2024' }
    ]
  });
}
function harvest(base = applicant()) {
  return buildUpdateCandidates(base, extractApplicantCandidates(PROPOSAL_TEXT, { documentName: 'QA 계획서', includeNarrative: true, sourceLabel: '검증·코칭 계획서' }));
}
function pick(review, label) { return review.candidates.find(candidate => candidate.label === label); }

test('검증한 계획서에서 작성에 쓰이는 기관 사실만 뽑고 개인 신상정보는 수집하지 않는다', () => {
  const review = harvest();
  const labels = review.candidates.map(candidate => candidate.label);
  for (const label of ['기관명', '상근 인력', '보유 자격', '운영 시설', '협력기관', '운영 회기', '총사업비', '자부담', '성과측정 경험', '주요 성과', '2025년 사업실적', '2024년 사업실적']) {
    assert.ok(labels.includes(label), `${label} 후보가 없습니다`);
  }
  const serialized = JSON.stringify(review);
  for (const personal of ['010-1234-5678', 'hong@example.com', '홍길동']) assert.equal(serialized.includes(personal), false, `${personal}이 수집되었습니다`);

  // 문서 기준시점과 출처를 함께 보존한다.
  assert.equal(review.documentAsOf, '2026-03');
  assert.equal(pick(review, '2025년 사업실적').asOf, '2025');
  assert.match(pick(review, '총사업비').source, /QA 계획서\(검증·코칭 계획서\)에서 추출/);
  assert.ok(pick(review, '총사업비').excerpt.includes('30,000,000원'));

  // 서술형 규칙은 기관 문서 화면의 기존 동작을 바꾸지 않는다.
  const labeledOnly = extractApplicantCandidates(PROPOSAL_TEXT, { documentName: 'QA 계획서' }).candidates.map(item => item.label);
  assert.equal(labeledOnly.includes('총사업비'), false);
  assert.ok(labeledOnly.includes('기관명'));
});

test('과거 문서 값은 현재값을 덮어쓰지 않고 실적은 누적·중복은 근거만 추가한다', () => {
  const base = applicant();
  const review = harvest(base);

  // 인력 수가 다르면 충돌 후보로만 남고 기존 확인값은 그대로다.
  const staff = pick(review, '상근 인력');
  assert.equal(staff.kind, '충돌');
  assert.equal(staff.existingValue, '3명');
  assert.equal(base.items.find(item => item.id === 'a-staff').value, '3명');
  const afterConflict = applyUpdateCandidate(base, staff).items.find(item => item.id === 'a-staff');
  assert.equal(afterConflict.value, '4명');
  assert.equal(afterConflict.status, '확인 필요');
  assert.deepEqual(afterConflict.history.map(entry => entry.value), ['3명']);

  // 사업실적은 연도별 누적, 같은 실적은 근거만 추가.
  assert.equal(pick(review, '2025년 사업실적').kind, '누적 추가');
  assert.equal(pick(review, '2024년 사업실적').kind, '동일');
  const afterSame = applyUpdateCandidate(base, pick(review, '2024년 사업실적')).items.find(item => item.id === 'a-performance');
  assert.equal(afterSame.value, '지역아동 학습지원 사업');
  assert.equal(afterSame.status, CONFIRMED_STATUS);
  assert.match(afterSame.source, /QA 결과보고서 \/ QA 계획서/);

  // 일괄 반영은 신규·누적·근거 추가만 처리하고 충돌은 남긴다.
  const { applicant: updated, applied } = applySafeCandidates(base, review.candidates);
  assert.ok(applied >= 3);
  assert.equal(updated.items.find(item => item.id === 'a-staff').value, '3명');
  assert.deepEqual(updated.items.filter(item => item.label.endsWith('사업실적')).map(item => item.label).sort(), ['2024년 사업실적', '2025년 사업실적']);
  assert.ok(updated.items.every(item => item.status !== CONFIRMED_STATUS || ['a-basic', 'a-staff', 'a-performance'].includes(item.id)));
});

test('검증 결과 화면에서 신청기관 정보 반영으로 연결된다', () => {
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /function coachingApplicantView\(\)/);
  assert.match(appSource, /id="harvest-coaching-applicant"/);
  assert.match(appSource, /id="coaching-applicant-target"/);
  // 각론과 함께 열린다. 총론만 볼 때는 접힌다.
  assert.match(appSource, /result && state\.reviewDetail \? coachingApplicantView\(\) : ''/);
  assert.match(appSource, /includeNarrative: true, sourceLabel: '검증·코칭 계획서'/);
  // 코칭 본래 기능과 추가 AI 호출은 건드리지 않는다.
  assert.match(appSource, /function harvestApplicantFromCoaching\(\)[\s\S]{0,900}?extractApplicantCandidates\(state\.coaching\.text/);
  const extractSource = fs.readFileSync(new URL('../src/applicant-extract.js', import.meta.url), 'utf8');
  assert.doesNotMatch(extractSource, /fetch\(|openai/i);
});
