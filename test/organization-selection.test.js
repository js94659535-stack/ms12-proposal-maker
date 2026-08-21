// 계획서 호출에 실을 실적을 공고와 관련된 것만 펼친다.
//
// 실제로 났던 일: 기관 연혁 한 건에서 실적 99건이 들어오자 호출마다 실리는 기관 자료가
// 508자에서 9,953자가 됐다. 계획서는 묶음마다 다시 부르므로 그만큼 매번 실린다.
// 실적을 버리는 것이 아니라, 이번 공고와 상관없는 것을 펼치지 않고 건수만 알린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RELATED_LIMIT, buildApplicantOrganization, normalizeApplicant, relatedItems } from '../src/applicants.js';

const record = (year, value, id) => ({ id, area: 'performance', label: `${year}년 사업실적`, value, status: '확인 필요', source: 'QA 연혁에서 추출', asOf: String(year) });
// 실적이 많은 기관. 실제 연혁 한 건이 실적 99건이 되는 것이 이 상황이다.
const MANY = Array.from({ length: 40 }, (unused, index) => record(2000 + index, `${index}초등학교 학습역량강화 캠프`, `item-${index}`));
const APPLICANT = normalizeApplicant({
  id: 'org-1', name: 'QA 기관',
  items: [
    { area: 'basic', label: '기관명', value: 'QA 기관', status: '확인됨', source: 'QA 고유번호증' },
    ...MANY,
    record(2025, '광주광역자활센터 노인 금융피해 예방교육', 'item-senior')
  ]
});

test('공고와 낱말이 겹치는 실적만 펼치고 나머지는 건수만 알린다', () => {
  const organization = buildApplicantOrganization(APPLICANT, [], { noticeTitle: '노인 금융피해 예방 및 금융복지 지원사업' });
  const shown = organization.pastProjectRecords.flatMap(project => project.records);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].title, '2025년 사업실적');
  // 펼치지 않은 것은 없는 것이 아니다. 몇 건인지 밝힌다.
  assert.equal(organization.otherPastProjects.count, 40);
  assert.match(organization.otherPastProjects.note, /없는 실적이 아니라 펼치지 않은 실적/);
  // 지어내지 말라는 규칙을 함께 보낸다.
  assert.match(organization.rule, /otherPastProjects는 이번 공고와 관련이 적어 펼치지 않은 실적의 건수다/);
});

test('공고 정보가 아직 없으면 예전처럼 전부 싣는다', () => {
  const organization = buildApplicantOrganization(APPLICANT, []);
  assert.equal(organization.pastProjectRecords.flatMap(project => project.records).length, 41);
  assert.equal(organization.otherPastProjects, null);
});

test('실적이 상한보다 적으면 고르지 않고 전부 싣는다', () => {
  const small = normalizeApplicant({
    id: 'org-2', name: 'QA 작은 기관',
    items: [record(2024, '초등학교 학습 캠프', 's1'), record(2025, '노인복지관 금융교육', 's2')]
  });
  const organization = buildApplicantOrganization(small, [], { noticeTitle: '노인 금융피해 예방 지원사업' });
  assert.equal(organization.pastProjectRecords.flatMap(project => project.records).length, 2);
  assert.equal(organization.otherPastProjects, null);
});

test('실적 대부분에 들어 있는 낱말로는 고르지 않는다', () => {
  const items = Array.from({ length: 10 }, (unused, index) => ({ ...record(2020 + index, `${index}기관 학습 프로그램`), id: `item-${index}` }));
  // 「프로그램」은 열 건 모두에 있다. 이 낱말로는 어느 것도 가려낼 수 없다.
  assert.deepEqual(relatedItems(items, ['프로그램 운영 사업']), []);
  // 한 건에만 있는 낱말은 근거가 된다.
  const one = relatedItems([...items, { ...record(2026, '노인 금융교육'), id: 'item-x' }], ['노인 금융교육 사업']);
  assert.equal(one.length, 1);
  assert.equal(one[0].id, 'item-x');
});

test('공고와 다 겹쳐도 펼치는 건수에 상한이 있다', () => {
  const items = Array.from({ length: 50 }, (unused, index) => ({ ...record(2026, `${index}노인복지관 금융교육 ${index}`), id: `item-${index}` }));
  // 「금융교육」이 쉰 건 모두에 있으므로 흔한 낱말로 걸러지고, 남는 것이 없다.
  assert.deepEqual(relatedItems(items, ['금융교육']), []);
  // 스무 건 중 하나꼴로만 나오는 낱말은 근거가 되고, 그때는 상한까지만 펼친다.
  const many = Array.from({ length: 200 }, (unused, index) => ({
    ...record(2026, index % 4 === 0 ? `${index}노인복지관 어르신 상담` : `${index}초등학교 학습 캠프`),
    id: `mix-${index}`
  }));
  const related = relatedItems(many, ['노인 대상 상담 사업']);
  assert.equal(related.length, RELATED_LIMIT);
  // 상한을 0으로 두면 전부 돌려준다. 상한은 호출 자료를 지키기 위한 것이지 규칙이 아니다.
  assert.equal(relatedItems(many, ['노인 대상 상담 사업'], { limit: 0 }).length, 50);
});

// ---------- 화면 ----------
// 계획서에는 겹치는 실적만 펼쳐 실린다. 그 판정이 화면에 안 보이면 조용히 접힌 채로 나간다.
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('공고 × 신청기관 비교에 이 공고와 겹치는 실적 수를 보여 준다', () => {
  assert.match(app, /function fitPerformanceView\(applicant, requirements\)/);
  const view = app.slice(app.indexOf('function fitPerformanceView('), app.indexOf('function applicantFitView('));
  assert.match(view, /이 공고와 겹치는 실적 \$\{matches\.length\}건 \/ 전체 \$\{history\.length\}건/);
  // 무엇이 왜 걸렸는지 함께 보여 준다. 「예방」 하나로 걸린 것을 분야가 맞는 실적으로 읽지 않게 한다.
  assert.match(view, /겹친 낱말: \$\{escapeHtml\(entry\.words\.join\(' · '\)\)\}/);
  // 목록은 접어 둔다. 99건이 그대로 펼쳐지지 않는다.
  assert.match(view, /<details><summary>겹친 실적 \$\{matches\.length\}건 보기<\/summary>/);
  // 계획서에 몇 건이 실리고 몇 건이 건수로만 가는지 그 자리에서 말한다.
  assert.match(view, /계획서 작성 요청에는 겹치는 실적 \$\{sending\}건을 내용까지 싣고/);
  // 비교 화면이 실제로 부른다.
  const fit = app.slice(app.indexOf('function applicantFitView(applicant)'), app.indexOf('function applicantSummaryTiles') > 0 ? app.indexOf('function applicantSummaryTiles') : app.indexOf('function applicantFitView(applicant)') + 4000);
  assert.match(fit, /\$\{fitPerformanceView\(applicant, requirements\)\}/);
});

test('실적이 없거나 적으면 뜻을 말하되 신청 여부는 말하지 않는다', () => {
  const view = app.slice(app.indexOf('function fitPerformanceView('), app.indexOf('function applicantFitView('));
  assert.match(view, /이 공고 분야의 실적이 확인되지 않았습니다/);
  assert.match(view, /수행 역량을 다른 방식\(인력·프로그램·협력기관·유사 경험\)으로 보여야 합니다/);
  // 신청할지 말지는 회원이 정한다.
  assert.doesNotMatch(view, /신청하지|지원하지 마|적합하지 않습니다|포기/);
  // 실적이 하나도 없는 기관에게도 길을 알려 준다.
  assert.match(view, /등록된 사업실적이 없습니다/);
});
