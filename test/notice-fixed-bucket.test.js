// 공고가 정한 조건을 「기관정보에 없음」으로 보내지 않는다.
//
// 실제로 났던 일: 「신청 마감은 2026년 8월 21일 18시이다」·「기관별 한도는 연간 3억 원」이
// 「기관정보에 없는 사항」에 들어가고, 안내가 「등록하거나 담당자에게 확인한다」고 했다.
// 따르면 공고 마감일이 기관정보에 박히고 다음 계획서에 「확인된 기관 사실」로 재사용된다.
//
// 낱말 목록을 늘려 잡지 않는다. 그것도 또 다른 쓰레기통이 된다.
// 판정 근거는 공고 실행계약서가 실제로 뽑아 둔 규칙뿐이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareNoticeWithApplicant, contractFixedRule } from '../src/applicants.js';
import { KOREAN_LABELS, internalNames, toKoreanLabel } from '../server/label-leak.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const contract = {
  rules: [
    { id: 'r1', category: '사업기간', title: '사업기간', ruleType: 'EXACT', value: '2027.1~2027.12', unit: '' },
    { id: 'r2', category: '예산', title: '기관별 한도', ruleType: 'MAX', value: '300000000', unit: '원' },
    { id: 'r3', category: '신청유형', title: '신청유형 택1', ruleType: 'CHOICE', value: ['거점', '통합'], unit: '' },
    { id: 'r4', category: '사업모델', title: '홈케어 파견', ruleType: 'REQUIRED', value: ['가정파견'], unit: '' }
  ]
};
const req = (requirement, location = '공고문 1쪽') => ({ id: requirement.slice(0, 4), requirement, location });

test('공고가 값을 정한 요구사항은 기관 등록 대상이 아니다', () => {
  const result = compareNoticeWithApplicant([
    req('기관별 한도는 연간 3억 원, 3년간 9억 원이다'),
    req('사업기간은 2027.1~2027.12이다')
  ], { items: [] }, contract);
  assert.equal(result.fixedByNotice.length, 2);
  assert.equal(result.missingFromApplicant.length, 0, '쓰레기통으로 가면 안 된다');
  for (const item of result.fixedByNotice) {
    assert.match(item.action, /기관정보에 등록하지 말고/);
  }
});

test('출처가 실행계약서면 어느 규칙인지 몰라도 공고 조건이다', () => {
  // 「신청 마감」은 계약 규칙 제목과 겹치지 않는다. 그래도 출처가 실행계약서면 공고가 정한 값이다.
  const [item] = compareNoticeWithApplicant(
    [req('신청 마감은 2026년 8월 21일 18시이다', 'NOTICE_CONTRACT · 공고 개요')], { items: [] }, contract).fixedByNotice;
  assert.ok(item, '출처만으로도 갈라야 한다');
  // 아무 규칙이나 붙이면 「신청 마감」에 「사업기간」 값이 달린다. 모르면 값을 안 적는다.
  assert.equal(item.noticeValue, '');
});

test('고른다·설계한다는 것은 공고가 정한 값이 아니다', () => {
  // CHOICE는 공고가 선택지만 주고 고르는 것은 이번 사업이다.
  // REQUIRED는 공고가 요구한 수행모델이라 기관이 설계로 답한다.
  assert.equal(contractFixedRule(req('신청유형 택1 중 하나를 고른다'), contract), null);
  assert.equal(contractFixedRule(req('홈케어 파견 모델을 반드시 포함한다'), contract), null);
});

test('실행계약서가 없어도 공고에 적힌 사실은 공고 조건이다', () => {
  // 이 시험은 원래 「계약서가 없으면 기관정보에 없는 사항으로 간다」였다. 그 동작이 문제였다 —
  // 계약서가 규칙을 못 뽑아내면 공고 마감일·예산한도가 「등록하거나 담당자에게 확인한다」로 갔다.
  // 이제 갈래는 출처와 어미가 정하고, 계약서는 값을 붙이는 데만 쓴다.
  const result = compareNoticeWithApplicant([req('기관별 한도는 연간 3억 원이다')], { items: [] }, null);
  assert.equal(result.fixedByNotice.length, 1);
  assert.equal(result.missingFromApplicant.length, 0);
  // 어느 규칙인지 모르므로 값은 적지 않는다. 지어내지 않는 쪽이 안전한 실패다.
  assert.equal(result.fixedByNotice[0].noticeValue, '');
});

test('낱말 목록을 늘려 판정하지 않는다', () => {
  const source = fs.readFileSync(new URL('../src/applicants.js', import.meta.url), 'utf8');
  // PROJECT_DECISION_PATTERN에 마감·한도·금액·거점을 더하면 또 다른 쓰레기통이 된다.
  const pattern = (source.match(/const PROJECT_DECISION_PATTERN = [^;]+;/) || [''])[0];
  for (const word of ['마감', '한도', '금액', '거점']) assert.ok(!pattern.includes(word), `${word}을 패턴에 더하지 않는다`);
  assert.match(source, /const CONTRACT_FIXED_TYPES = \['EXACT', 'MIN', 'MAX'\];/);
});

test('화면이 새 갈래를 그리고 계약서를 넘긴다', () => {
  assert.match(app, /compareNoticeWithApplicant\(requirements, applicant, currentNoticeContract\(\)\)/);
  assert.match(app, /key: 'fixed', name: '공고가 정한 조건 \(기관에 등록할 것이 아님\)', items: comparison\.fixedByNotice/);
  assert.match(app, /item\.noticeValue \? `<small><b>공고가 정한 값<\/b>/);
});

// ---------- 내부 이름을 화면에 내지 않는다 ----------

test('출처 이름을 한국어로 바꿔 그린다', () => {
  // 모델이 태그 이름을 출처로 인용한다. 태그가 그것이 읽은 자료의 유일한 이름이기 때문이다.
  assert.equal(toKoreanLabel('NOTICE_CONTRACT · 공고 개요'), '공고 실행계약서 · 공고 개요');
  assert.equal(toKoreanLabel('OFFICIAL_NOTICE_TEXT · 1. 주요사업내용'), '공고 원문 · 1. 주요사업내용');
  // 더 긴 이름의 일부를 건드리지 않는다.
  assert.equal(toKoreanLabel('NOTICE_CONTRACT_CONFLICT'), 'NOTICE_CONTRACT_CONFLICT');
  assert.equal(toKoreanLabel('공고문 3쪽'), '공고문 3쪽');
  assert.equal(toKoreanLabel(''), '');
});

test('이름 목록이 유출 검사와 같은 파일에서 나온다', () => {
  // 한쪽만 늘어나면, 화면은 한국어로 보이는데 검사는 못 잡거나 그 반대가 된다.
  const source = fs.readFileSync(new URL('../server/label-leak.js', import.meta.url), 'utf8');
  assert.match(source, /export const KOREAN_LABELS = Object\.freeze\(\{/);
  assert.match(source, /export function toKoreanLabel\(value\)/);
  // 바꿔 적는 이름은 모두 검사 대상이어야 한다. 검사에 없는 이름을 화면만 고치면 새는 줄 모른다.
  const names = internalNames('<NOTICE_CONTRACT>x</NOTICE_CONTRACT>');
  for (const name of Object.keys(KOREAN_LABELS)) {
    assert.ok(/^[A-Z][A-Z0-9_]+$/.test(name), `${name}은 태그 이름 꼴이어야 한다`);
  }
  assert.ok(names.includes('NOTICE_CONTRACT'));
  // 화면은 한국어로 보여도 모델은 여전히 태그를 인용한다. 검사는 계속 잡아야 정상이다.
  assert.match(app, /import \{ KOREAN_LABELS, toKoreanLabel \} from '\.\.\/server\/label-leak\.js';/);
});
