import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ASOF_UNKNOWN, applySafeCandidates, applyUpdateCandidate, buildUpdateCandidates, documentAsOf, extractApplicantCandidates } from '../src/applicant-extract.js';
import { CONFIRMED_STATUS, normalizeApplicant } from '../src/applicants.js';
import { normalizeApplicantRecord } from '../functions/api/archive.js';

// 실제 OpenAI 호출 없이 고정 문서 fixture만 사용한다.
const RECENT_DOCUMENT = `QA 기관소개서
작성일: 2026-03-10
기관명: QA 신청기관 A
법인 유형: 사단법인
상근 인력: 5명
보유 자격: 청소년상담사 2급 2명
2025년 청소년 마음건강 지원사업
이 문단은 기관 정보를 담고 있지 않은 일반 설명 문장입니다.`;

const OLD_DOCUMENT = `QA 2023 결과보고서
작성일: 2023-05-01
시설: 상담실 2실`;

function applicant() {
  return normalizeApplicant({
    id: 'applicant-a', name: 'QA 신청기관 A',
    items: [
      { id: 'a-basic', area: 'basic', label: '기관명', value: 'QA 신청기관 A', status: CONFIRMED_STATUS, source: 'QA 등기부등본' },
      { id: 'a-legal', area: 'legal', label: '법인 유형', value: '사회복지법인', status: CONFIRMED_STATUS, source: 'QA 법인등기부등본', asOf: '2025' },
      { id: 'a-staff', area: 'staff', label: '상근 인력', value: '3명', status: '확인 필요', source: '', asOf: '2024' },
      { id: 'a-facilities', area: 'facilities', label: '운영 시설', value: '상담실 3실', status: CONFIRMED_STATUS, source: 'QA 임대차계약서', asOf: '2026' },
      { id: 'a-performance', area: 'performance', label: '2019년 사업실적', value: 'QA 2019 위탁사업', status: '오래된 정보', source: '', asOf: '2019' }
    ]
  });
}
function review(doc, base = applicant()) { return buildUpdateCandidates(base, extractApplicantCandidates(doc, { documentName: 'QA문서.txt' })); }
function pick(result, label) { return result.candidates.find(candidate => candidate.label === label); }

test('기관 문서에서 항목과 기준시점을 추출하고 알 수 없으면 확인 필요로 남긴다', () => {
  const extraction = extractApplicantCandidates(RECENT_DOCUMENT, { documentName: 'QA문서.txt' });
  assert.equal(extraction.documentAsOf, '2026-03');
  assert.deepEqual(extraction.candidates.map(item => item.label).sort(), ['2025년 사업실적', '기관명', '법인 유형', '보유 자격', '상근 인력'].sort());
  assert.equal(pick(extraction, '상근 인력').value, '5명');
  assert.equal(pick(extraction, '상근 인력').asOf, '2026-03');
  assert.equal(pick(extraction, '2025년 사업실적').area, 'performance');
  assert.equal(pick(extraction, '2025년 사업실적').asOf, '2025');
  assert.match(pick(extraction, '기관명').source, /QA문서\.txt/);

  // 문서에 기준시점이 없으면 업로드 날짜를 기준시점으로 삼지 않는다.
  const undated = extractApplicantCandidates('기관명: QA 무날짜 기관\n상근 인력: 2명', {});
  assert.equal(documentAsOf('기관명: QA 무날짜 기관'), '');
  assert.equal(undated.candidates[0].asOf, '');
  assert.equal(undated.candidates[0].asOfStatus, ASOF_UNKNOWN);
});

test('추출 결과는 신규·동일·변경·충돌·누적으로만 분류하고 기관 정보를 바꾸지 않는다', () => {
  const base = applicant();
  const result = review(RECENT_DOCUMENT, base);
  assert.equal(pick(result, '기관명').kind, '동일');
  assert.equal(pick(result, '법인 유형').kind, '충돌');
  assert.equal(pick(result, '상근 인력').kind, '변경 가능성');
  assert.equal(pick(result, '보유 자격').kind, '신규');
  assert.equal(pick(result, '2025년 사업실적').kind, '누적 추가');
  assert.equal(pick(result, '법인 유형').existingValue, '사회복지법인');
  // 후보를 만드는 것만으로는 기관 원본이 변하지 않는다.
  assert.deepEqual(base.items.map(item => `${item.id}:${item.value}:${item.status}`), applicant().items.map(item => `${item.id}:${item.value}:${item.status}`));

  const older = review(OLD_DOCUMENT, base);
  assert.equal(pick(older, '운영 시설').kind, '이전 시점 정보');
});

test('반영은 사용자가 고른 후보만 적용하고 기존 값은 이력으로 남긴다', () => {
  const base = applicant();
  const result = review(RECENT_DOCUMENT, base);

  const added = applyUpdateCandidate(base, pick(result, '보유 자격'));
  const newItem = added.items.find(item => item.label === '보유 자격');
  assert.equal(newItem.status, '확인 필요');
  assert.equal(newItem.asOf, '2026-03');
  assert.match(newItem.source, /QA문서\.txt/);

  // 사업실적은 누적 정보이므로 기존 실적을 지우지 않는다.
  const cumulative = applyUpdateCandidate(base, pick(result, '2025년 사업실적'));
  assert.equal(cumulative.items.filter(item => item.area === 'performance').length, 2);
  assert.ok(cumulative.items.find(item => item.id === 'a-performance'));

  // 충돌 항목은 확인 후 반영하되 기존 확인값을 이력으로 보관하고 상태는 확인 필요로 내린다.
  const conflicted = applyUpdateCandidate(base, pick(result, '법인 유형')).items.find(item => item.id === 'a-legal');
  assert.equal(conflicted.value, '사단법인');
  assert.equal(conflicted.status, '확인 필요');
  assert.deepEqual(conflicted.history.map(entry => entry.value), ['사회복지법인']);

  // 동일 후보는 값·상태를 바꾸지 않고 근거만 덧붙인다.
  const same = applyUpdateCandidate(base, pick(result, '기관명')).items.find(item => item.id === 'a-basic');
  assert.equal(same.value, 'QA 신청기관 A');
  assert.equal(same.status, CONFIRMED_STATUS);
  assert.match(same.source, /^QA 등기부등본 \/ QA문서\.txt에서 추출/);
  assert.deepEqual(same.history, []);

  // 이전 시점 문서는 현재 값을 바꾸지 않고 이력만 추가한다.
  const older = applyUpdateCandidate(base, pick(review(OLD_DOCUMENT, base), '운영 시설')).items.find(item => item.id === 'a-facilities');
  assert.equal(older.value, '상담실 3실');
  assert.equal(older.status, CONFIRMED_STATUS);
  assert.deepEqual(older.history.map(entry => entry.value), ['상담실 2실']);
});

test('일괄 반영은 기존 값을 바꾸지 않는 신규·누적·근거 추가 후보만 처리한다', () => {
  const base = applicant();
  const result = review(RECENT_DOCUMENT, base);
  const { applicant: updated, applied } = applySafeCandidates(base, result.candidates);
  assert.equal(applied, 3);
  assert.equal(updated.items.find(item => item.id === 'a-legal').value, '사회복지법인');
  assert.equal(updated.items.find(item => item.id === 'a-staff').value, '3명');
  // 동일 후보는 값을 유지한 채 근거만 늘어난다.
  assert.equal(updated.items.find(item => item.id === 'a-basic').value, 'QA 신청기관 A');
  assert.match(updated.items.find(item => item.id === 'a-basic').source, /QA문서\.txt에서 추출/);
  assert.equal(updated.items.filter(item => item.status === '확인 필요' && item.label === '보유 자격').length, 1);
});

test('기준시점과 이력은 저장 형식과 화면 흐름에 연결된다', () => {
  const record = normalizeApplicantRecord({
    id: 'applicant-a', name: 'QA 신청기관 A',
    items: [{ id: 'a-legal', area: 'legal', label: '법인 유형', value: '사단법인', status: '확인 필요', asOf: '2026-03', history: [{ value: '사회복지법인', status: '확인됨', source: 'QA 법인등기부등본', asOf: '2025', recordedAt: '2026-03-10T00:00:00.000Z' }] }]
  });
  assert.equal(record.items[0].asOf, '2026-03');
  assert.deepEqual(record.items[0].history.map(entry => entry.value), ['사회복지법인']);

  const extractSource = fs.readFileSync(new URL('../src/applicant-extract.js', import.meta.url), 'utf8');
  assert.doesNotMatch(extractSource, /fetch\(|openai/i);

  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /applicantDocumentView\(editing\)/);
  assert.match(appSource, /data-apply-candidate/);
  assert.match(appSource, /apply-safe-candidates/);
});
