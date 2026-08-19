// 「공고 × 신청기관 비교」가 무엇을 보고 갈래를 정하는가.
//
// 실제로 났던 일: 아래 일곱 문장 가운데 여섯이 「이번 사업에서 새로 결정」·「기관정보에 없는 사항」으로
// 갔다. 전부 공고 원문에 이미 적혀 있는 값이라 사용자가 정할 수 없는 것들이다.
// 「등록하거나 담당자에게 확인한다」를 따르면 공고 마감일이 기관정보에 박히고
// 다음 계획서에 「확인된 기관 사실」로 재사용된다.
//
// 제목 일치로는 안 됐다 — 「신청기간」·「사업수행기간」은 규칙 제목 「사업기간」과 글자가 다르다.
// 낱말 목록을 늘리지 않는다. 보는 것은 둘뿐이다: 출처가 어디이고, 문장이 어떻게 끝나는가.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPLIES_TO_WORD, compareNoticeWithApplicant, contractFixedRule, statementForm } from '../src/applicants.js';

const contract = {
  rules: [
    { id: 'r1', category: '사업기간', title: '사업기간', ruleType: 'EXACT', value: '2026.11~2029.10', unit: '', appliesTo: 'period' },
    { id: 'r2', category: '예산', title: '사업비 한도', ruleType: 'MAX', value: '1000000000', unit: '원', appliesTo: 'budget' }
  ]
};
// 사용자가 실제로 본 화면 그대로다. 문장도 출처도 손대지 않았다.
const REAL = [
  ['신청유형은 전국단위 또는 광역단위 중 하나를 선택한다.', '공식 공고문 2. 신청유형', 'decideInThisProject'],
  ['공식 원문의 신청기간은 2026년 7월 1일부터 8월 21일 18시까지다.', '공식 공고문 3. 신청기간', 'fixedByNotice'],
  ['광역단위 예산한도는 연간 최대 10억 원, 3년간 최대 30억 원이다.', '공식 공고문 5. 기관별 예산한도', 'fixedByNotice'],
  ['공고 시스템 개요에는 사업수행기간이 2026년 11월 1일부터 2027년 10월 31일까지로 표시된다.', '공식 공고문 시스템 개요', 'fixedByNotice'],
  ['선택 사업은 금융취약 중장년·노인의 금융피해 예방 및 금융복지 통합지원 광역단위 사업이다.', '공식 공고문 제목', 'fixedByNotice'],
  ['지원대상은 중위소득 150% 이내의 55세 이상 금융취약계층이다.', '공식 공고문 1. 주요사업내용', 'fixedByNotice'],
  ['매 연차 평가 결과에 따라 차년도 지속지원 여부가 결정된다.', '공식 공고문 4. 사업기간', 'fixedByNotice']
];
const bucketOf = (requirement, location) => {
  const result = compareNoticeWithApplicant([{ id: 'x', requirement, location }], { items: [] }, contract);
  return Object.keys(result).find(key => Array.isArray(result[key]) && result[key].length) || '';
};

test('실제 일곱 문장이 제 갈래로 간다', () => {
  for (const [requirement, location, bucket] of REAL) {
    assert.equal(bucketOf(requirement, location), bucket, requirement.slice(0, 22));
  }
});

test('「~해야 한다」는 공고가 정한 조건으로 가지 않는다', () => {
  // 공고가 값을 준 것이 아니라 기관이 채우라고 요구한 것이다.
  // 여기로 옮기면 「기관정보에 등록하지 말고 그대로 지키세요」가 붙어 기관이 답할 일이 사라진다.
  for (const sentence of [
    '금융교육과 맞춤형 금융상담을 수행해야 한다.',
    '금융취약군을 선제적으로 발굴해야 한다.',
    '필수사업 다섯 가지를 계획서에 모두 포함해야 한다.'
  ]) {
    assert.notEqual(bucketOf(sentence, '공식 공고문 1. 주요사업내용'), 'fixedByNotice', sentence.slice(0, 18));
  }
  // 규칙 제목과 겹쳐도 어미가 이긴다. 「사업기간」이 들어 있어도 요구는 요구다.
  assert.notEqual(bucketOf('사업기간 안에 필수사업을 모두 수행해야 한다.', '공식 공고문 4. 사업기간'), 'fixedByNotice');
});

test('어미 목록은 셋뿐이다', () => {
  assert.equal(statementForm('신청기간은 8월 21일 18시까지다'), '사실');
  assert.equal(statementForm('사업수행기간이 2027년 10월 31일까지로 표시된다'), '사실');
  assert.equal(statementForm('지속지원 여부가 결정된다'), '사실');
  assert.equal(statementForm('광역단위 사업이다.'), '사실');
  assert.equal(statementForm('둘 중 하나를 선택한다'), '결정');
  assert.equal(statementForm('세부 내용은 기관이 정한다'), '결정');
  assert.equal(statementForm('금융교육을 수행해야 한다'), '요구');
  assert.equal(statementForm('사업 시작 시점이 조정될 수 있다'), '', '걸리지 않으면 갈래를 바꾸지 않는다');
  assert.equal(statementForm(''), '');
  const source = fs.readFileSync(new URL('../src/applicants.js', import.meta.url), 'utf8');
  const forms = (source.match(/const STATEMENT_FORMS = \[[\s\S]*?\];/) || [''])[0];
  assert.equal((forms.match(/form: '/g) || []).length, 3, '형태를 늘리면 쓰레기통이 된다');
});

test('출처가 공고가 아니면 어미만으로 옮기지 않는다', () => {
  // 사용자가 붙여넣은 자료의 사실 서술까지 「공고가 정한 조건」이 되면 안 된다.
  assert.notEqual(bucketOf('우리 기관 상근 인력은 3명이다.', '직접 올린 자료'), 'fixedByNotice');
});

test('제목이 달라도 appliesTo 로 규칙을 알아본다', () => {
  // 「신청기간」·「사업수행기간」은 규칙 제목 「사업기간」과 글자가 다르다.
  for (const sentence of ['공식 원문의 신청기간은 8월 21일까지다', '사업수행기간이 2027년 10월까지로 표시된다']) {
    assert.equal(contractFixedRule({ requirement: sentence, location: '공식 공고문' }, contract)?.id, 'r1', sentence.slice(0, 12));
  }
  // 「예산한도」는 규칙 제목 「사업비 한도」와 겹치지 않는다. appliesTo 가 budget 이라 걸린다.
  assert.equal(contractFixedRule({ requirement: '광역단위 예산한도는 연간 최대 10억 원이다', location: '공식 공고문' }, contract)?.id, 'r2');
});

test('appliesTo 이름이 규칙이 쓰는 키와 같다', () => {
  // 한쪽만 바뀌면 대조가 조용히 아무것도 못 알아본다.
  const source = fs.readFileSync(new URL('../src/notice-contract.js', import.meta.url), 'utf8');
  for (const key of Object.keys(APPLIES_TO_WORD)) {
    assert.match(source, new RegExp(`appliesTo: '${key}'`), `${key} 는 notice-contract.js 가 실제로 쓰는 키여야 한다`);
  }
});
