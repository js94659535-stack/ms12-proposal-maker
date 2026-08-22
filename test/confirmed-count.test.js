// 「확인됨 N건」은 한 곳에서만 센다.
//
// 실제로 났던 일: 같은 숫자를 다섯 가지 방법으로 셌다. 화면 네 곳이 손으로 세고(상태만 봤다),
// 계획서로 나가는 목록은 값이 비었는지도 봤고, 서버가 저장할 때 또 따로 셌다.
// 값이 마침 같았을 뿐이고, 값이 빈 항목을 확인됨으로 올리는 순간 화면과 계획서가 어긋난다.
//
// 이제 잣대는 server/applicant-count.js 하나다. 값이 비면 확인됨이 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { countConfirmed, countUnconfirmed, isConfirmed } from '../server/applicant-count.js';
import { applicantAreaSummary, confirmedItems, itemsBySource, normalizeApplicant, unverifiedItems } from '../src/applicants.js';
import { detailProgress, reusableCount } from '../src/org-stage.js';
import { normalizeApplicantRecord } from '../functions/api/archive.js';

const APPLICANT = normalizeApplicant({
  id: 'org-1', name: 'QA 기관',
  items: [
    { id: 'a', area: 'basic', label: '기관명', value: 'QA 기관', status: '확인됨', source: '고유번호증' },
    { id: 'b', area: 'staff', label: '상근 인력', value: '12명', status: '확인됨', source: '사업계획서' },
    // 값이 빈 채로 확인됨이 된 항목. 계획서에는 나가지 못하므로 확인됨으로 세지 않는다.
    { id: 'c', area: 'facilities', label: '보유 차량', value: '', status: '확인됨', source: '담당자 확인' },
    { id: 'd', area: 'performance', label: '2024년 사업실적', value: '○○학교 캠프', status: '확인 필요', source: '연혁' },
    { id: 'e', area: 'budget', label: '총사업비', value: '1억', status: '오래된 정보', source: '2019년 결산' }
  ]
});

test('값이 빈 항목은 확인됨으로 세지 않는다', () => {
  assert.equal(countConfirmed(APPLICANT.items), 2);
  assert.equal(countUnconfirmed(APPLICANT.items), 3);
  assert.equal(isConfirmed(APPLICANT.items.find(item => item.id === 'c')), false);
  // 둘을 더하면 언제나 전체가 된다. 화면이 「확인됨 2건 · 확인 필요 3건」으로 적는 근거다.
  assert.equal(countConfirmed(APPLICANT.items) + countUnconfirmed(APPLICANT.items), APPLICANT.items.length);
});

test('화면·계획서·서버가 같은 답을 낸다', () => {
  const once = countConfirmed(APPLICANT.items);
  // 계획서로 나가는 목록
  assert.equal(confirmedItems(APPLICANT).length, once);
  assert.equal(unverifiedItems(APPLICANT).length, APPLICANT.items.length - once);
  // 열한 칸 요약
  assert.equal(applicantAreaSummary(APPLICANT).reduce((sum, area) => sum + area.confirmed, 0), once);
  // 상세정보 여덟 구역 — 기본정보(basic·legal)는 여기에 들어가지 않으므로 그만큼 적다
  const detail = detailProgress(APPLICANT).reduce((sum, group) => sum + group.confirmed, 0);
  assert.equal(detail, countConfirmed(APPLICANT.items.filter(item => !['basic', 'legal'].includes(item.area))));
  // 다음 계획서에 다시 쓰이는 수
  assert.equal(reusableCount(APPLICANT), once);
  // 출처별 묶음
  assert.equal(itemsBySource(APPLICANT).reduce((sum, group) => sum + group.confirmed, 0), once);
  // 서버가 저장할 때 세는 값
  const record = normalizeApplicantRecord({ id: 'org-1', name: 'QA 기관', items: APPLICANT.items });
  assert.equal(record.confirmedCount, once);
  assert.equal(record.unverifiedCount, APPLICANT.items.length - once);
});

test('빈 항목에 값이 들어오면 모든 곳의 숫자가 함께 오른다', () => {
  const filled = { ...APPLICANT, items: APPLICANT.items.map(item => (item.id === 'c' ? { ...item, value: '승합차 1대' } : item)) };
  assert.equal(countConfirmed(filled.items), 3);
  assert.equal(confirmedItems(filled).length, 3);
  assert.equal(applicantAreaSummary(filled).reduce((sum, area) => sum + area.confirmed, 0), 3);
  assert.equal(normalizeApplicantRecord({ id: 'org-1', name: 'QA 기관', items: filled.items }).confirmedCount, 3);
});
