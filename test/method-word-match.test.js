// 방법 낱말로 분야가 다른 실적이 걸리는 것을 막는다.
//
// 실제로 났던 일: 금융취약 중장년·노인 공고에 마인드스토리 실적 7건이 「맞춤형」·「복지」·「예방」
// 하나로 걸렸다. 아동 학습, 진로 상담사 과정, 아토피 치유학교 같은 것들이다. 분야가 겹친 것이
// 아니라 방법이 겹친 것이라 실적 근거로 쓸 수 없다.
//
// 낱말 목록은 만들지 않는다. 대신 낱말 하나로 근거가 되려면 세 가지를 다 만족해야 한다.
//   ① 실적에서 드물고 ② 공고에서 중심 낱말이고(제목에 있거나 두 번 이상 나오고)
//   ③ 실적 안에서 그 낱말이 그대로 서 있어야 한다(「예방」이 「예방교육」에 묻혀 있으면 안 된다).
// 두 낱말 이상이 겹치면 묻힌 낱말도 함께 센다. 조이기만 하면 맞는 공고에서도 0건이 되기 때문이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApplicant, relatedMatches } from '../src/applicants.js';

const record = (year, value, id) => ({ id, area: 'performance', label: `${year}년 사업실적`, value, status: '확인 필요', source: '연혁에서 추출', asOf: String(year) });
const HISTORY = normalizeApplicant({
  id: 'org-1', name: 'QA 기관',
  items: [
    ...Array.from({ length: 20 }, (unused, index) => record(2000 + index, `${index}초등학교 학습역량강화 캠프`, `filler-${index}`)),
    record(2021, '장성 중학교 학교폭력 예방교육', 'buried'),
    record(2022, '광주 동성고등학교 다문화 맞춤형 학습역량강화', 'method'),
    record(2023, '장성 서삼초등학교 방과후 돌봄 프로그램', 'field'),
    record(2024, '시영복지관 사회성 UP 프로젝트', 'inside')
  ]
}).items.filter(item => item.area === 'performance');

const FINANCE = ['2026년 금융취약 중장년·노인의 금융피해 예방 및 금융복지 통합지원사업',
  '금융취약군을 선제적으로 발굴해야 한다', '금융교육과 맞춤형 금융상담을 수행해야 한다',
  '복지·법률·심리정서 서비스를 연계해야 한다'];

test('방법 낱말 하나로는 분야가 다른 실적이 걸리지 않는다', () => {
  const matched = relatedMatches(HISTORY, FINANCE, { limit: 0 });
  const ids = matched.map(entry => entry.item.id);
  // 「맞춤형」은 공고에서 한 번 스칠 뿐이라 혼자서는 근거가 되지 않는다.
  assert.ok(!ids.includes('method'), '맞춤형 하나로 걸리면 안 된다');
  // 「복지」가 「시영복지관」 속에 묻힌 것도 마찬가지다.
  assert.ok(!ids.includes('inside'), '묻힌 낱말 하나로 걸리면 안 된다');
});

test('제목에 있는 낱말도 실적 안에 묻혀 있으면 혼자서는 근거가 아니다', () => {
  // 「예방」은 공고 제목에 있어 중심 낱말이지만, 실적 쪽에서는 「예방교육」에 묻혀 있다.
  const matched = relatedMatches(HISTORY, FINANCE, { limit: 0 });
  assert.ok(!matched.some(entry => entry.item.id === 'buried'), '예방교육이 예방으로 걸리면 안 된다');
});

test('제목 낱말은 요구 문장에 다시 나오지 않아도 근거가 된다', () => {
  // 「장성」은 요구 문장에 한 번도 없지만 그 공고가 무엇에 관한 것인지를 말한다.
  const matched = relatedMatches(HISTORY, [
    '장성 방과후·돌봄 프로그램 지원 강화 사업',
    '아동에게 방과후 프로그램을 제공해야 한다',
    '강사를 배치하고 운영 계획을 내야 한다',
    '성과를 평가해 보고해야 한다'
  ], { limit: 0 });
  const ids = matched.map(entry => entry.item.id);
  assert.ok(ids.includes('field'), '장성 실적을 놓치면 안 된다');
  assert.ok(ids.includes('buried'), '장성 중학교 실적도 장성으로 걸려야 한다');
  // 방법 낱말(운영·평가·강사)만 겹친 채우기 실적은 걸리지 않는다.
  assert.ok(!ids.some(id => id.startsWith('filler-')), '방법 낱말로 채우기 실적이 걸리면 안 된다');
});

test('두 낱말 이상이 겹치면 묻힌 낱말도 함께 센다', () => {
  const matched = relatedMatches(HISTORY, [
    '방과후 돌봄 운영기관 모집',
    '방과후 돌봄 프로그램을 운영해야 한다',
    '초등학교 학생을 대상으로 해야 한다',
    '프로그램 계획을 제출해야 한다'
  ], { limit: 0 });
  // 「방과후」·「돌봄」 둘이 겹치므로 걸린다.
  assert.ok(matched.some(entry => entry.item.id === 'field'));
});

test('제목만 있는 공고에서는 이 잣대를 대지 않는다', () => {
  // 공고문을 아직 읽지 않아 요구 문장이 없을 때까지 조이면 실적이 하나도 안 실린다.
  const matched = relatedMatches(HISTORY, ['장성 방과후·돌봄 프로그램 지원 강화 사업'], { limit: 0 });
  assert.ok(matched.some(entry => entry.item.id === 'field'));
});
