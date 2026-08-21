// 실적을 한 번에 확인됨으로 올리고, 잘못 눌렀으면 한 번에 되돌린다.
//
// 실제로 났던 일: 연혁 한 건에서 실적 99건이 들어왔는데 상태는 항목마다 골라야 해서 99번을
// 눌러야 했다. 그때까지 그 값들은 계획서로 전달되지 않아 비용만 들고 값어치는 0이었다.
// 다만 확인됨은 「기관이 사실이라고 보증한다」는 뜻이라 한 번에 올리는 것은 위험한 쪽이다.
// 그래서 무엇을 보증하는지 화면에 적고, 되돌리는 길을 같은 자리에 둔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIRMED_STATUS, buildApplicantOrganization, confirmAreaItems, confirmedItems, normalizeApplicant, restoreItemStatuses } from '../src/applicants.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const performance = (year, value, status = '확인 필요') => ({ id: `p-${year}`, area: 'performance', label: `${year}년 사업실적`, value, status, source: 'QA 연혁에서 추출', asOf: String(year) });
const applicant = () => normalizeApplicant({
  id: 'org-1', name: 'QA 기관',
  items: [
    { id: 'basic-1', area: 'basic', label: '기관명', value: 'QA 기관', status: '확인 필요', source: '' },
    performance(2024, 'QA초등학교 학습역량강화'),
    performance(2025, 'QA중학교 진로캠프', '오래된 정보'),
    performance(2026, 'QA고등학교 독서캠프', CONFIRMED_STATUS)
  ]
});

test('실적만 한 번에 확인됨으로 올린다', () => {
  const { applicant: updated, changed } = confirmAreaItems(applicant(), 'performance');
  // 이미 확인됨인 것은 건드리지 않고, 실적이 아닌 항목도 그대로 둔다.
  assert.equal(changed.length, 2);
  assert.deepEqual(changed.map(entry => entry.status), ['확인 필요', '오래된 정보']);
  assert.equal(updated.items.find(item => item.id === 'basic-1').status, '확인 필요');
  assert.equal(confirmedItems(updated).filter(item => item.area === 'performance').length, 3);
});

test('확인됨이 되어야 계획서에 값이 실린다', () => {
  const before = buildApplicantOrganization(applicant(), []);
  const filled = records => records.flatMap(project => project.records).filter(record => record.content).length;
  assert.equal(filled(before.pastProjectRecords), 1);
  const { applicant: updated } = confirmAreaItems(applicant(), 'performance');
  assert.equal(filled(buildApplicantOrganization(updated, []).pastProjectRecords), 3);
});

test('방금 올린 것만 한 번에 되돌린다', () => {
  const { applicant: updated, changed } = confirmAreaItems(applicant(), 'performance');
  const { applicant: back, restored } = restoreItemStatuses(updated, changed);
  assert.equal(restored, 2);
  assert.equal(back.items.find(item => item.id === 'p-2024').status, '확인 필요');
  // 되돌리기는 원래 상태로 돌아간다. 전부 「확인 필요」로 뭉개지 않는다.
  assert.equal(back.items.find(item => item.id === 'p-2025').status, '오래된 정보');
  // 원래부터 확인됨이던 것은 되돌리지 않는다.
  assert.equal(back.items.find(item => item.id === 'p-2026').status, CONFIRMED_STATUS);
});

test('그 사이에 손으로 바꾼 항목은 되돌리지 않는다', () => {
  const { applicant: updated, changed } = confirmAreaItems(applicant(), 'performance');
  const touched = { ...updated, items: updated.items.map(item => (item.id === 'p-2024' ? { ...item, status: '오래된 정보' } : item)) };
  const { applicant: back, restored } = restoreItemStatuses(touched, changed);
  assert.equal(restored, 1);
  assert.equal(back.items.find(item => item.id === 'p-2024').status, '오래된 정보');
});

test('무엇을 보증하는 것인지 누르기 전에 말한다', () => {
  const bar = app.slice(app.indexOf('function performanceConfirmBar(applicant)'), app.indexOf('// 한 영역의 등록 항목과 새 항목 입력칸'));
  assert.match(bar, /기관이 확인한 사실/);
  // 문서에서 읽은 값이라는 것을 밝힌다.
  assert.match(bar, /올린 문서에서 읽은 <b>원문 그대로<\/b>/);
  // 한 번에 확인하는 단추는 묶음 제목 줄 하나뿐이다(22-11). 상자 안에 같은 단추를 두지 않는다.
  assert.doesNotMatch(bar, /id="confirm-all-performance"/);
  assert.match(bar, /위 「실적」 제목 줄의 단추를 쓰세요/);
  assert.match(app, /id="confirm-all-performance-head">\$\{pending\}건 모두 확인<\/button>/);
  // 되돌리는 길은 같은 자리에 있다.
  assert.match(bar, /id="undo-confirm-performance"/);
  assert.match(bar, /방금 확인한 \$\{undo\.items\.length\}건 되돌리기/);
  // 실적 묶음에만 붙는다.
  assert.match(app, /\$\{group\.key === 'performance' \? performanceConfirmBar\(applicant\) : ''\}/);
});

test('한 건이라도 손으로 바꾸면 일괄 되돌리기 기록을 지운다', () => {
  const handler = app.slice(app.indexOf("document.querySelectorAll('[data-applicant-status]')"), app.indexOf("document.querySelector('#confirm-all-performance')"));
  assert.match(handler, /applicantConfirmUndo: null/);
  // 되돌리기 기록은 이번 화면에서만 쓴다. 저장했다가 다음 날 되돌리지 않는다.
  const save = app.slice(app.indexOf('function saveState()'), app.indexOf('function loadNavigationHistory()'));
  assert.match(save, /applicantConfirmUndo: null/);
});
