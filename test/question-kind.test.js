// 질문을 무엇으로 가르는가.
//
// kind는 쓸 수 없다. 모델이 만든 질문에 출처만 보고 「필수 확인」을 붙이므로
// 「AI가 물으면 무엇이든 필수 확인」이 된다. 실제 다섯 질문 중 셋이 그렇게 어긋났다.
// 대신 근거가 어디 있는지로 가른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ANSWER_KINDS, SUGGESTABLE, classifyQuestion } from '../src/design-questions.js';
import { KOREAN_LABELS } from '../server/label-leak.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../src/design-questions.js', import.meta.url), 'utf8');
const noticeNames = [KOREAN_LABELS.NOTICE_CONTRACT, KOREAN_LABELS.OFFICIAL_NOTICE_TEXT];

const blueprint = {
  items: [
    { key: 'target', title: '대상', status: 'CONFIRMED' },
    { key: 'headcount', title: '인원', status: 'PROPOSED' },
    { key: 'sessions', title: '회기', status: 'PROPOSED' },
    { key: 'period', title: '기간', status: 'CONFIRMED' },
    { key: 'eligibility', title: '자격', status: 'NEEDS_CONFIRMATION' },
    { key: 'partners', title: '협력기관', status: 'NEEDS_CONFIRMATION' }
  ]
};
const contract = {
  rules: [
    { category: '사업기간', title: '사업기간', ruleType: 'EXACT', value: '2027.1~2027.12', unit: '' },
    { category: '신청유형', title: '신청유형 택1', ruleType: 'CHOICE', value: ['거점', '통합'], unit: '' }
  ]
};
const kindOf = question => classifyQuestion(question, { blueprint, contract, noticeNames }).kind;

// 화면에 실제로 떴던 다섯 질문. 전부 kind가 「필수 확인」으로 찍혀 있었다.
const REAL = [
  ['공고 실행계약서의 경계선 지능아동 사업·2027.1~12 조건은 잘못 연결된 것입니까, 아니면 선택 세부사업보다 우선 적용해야 합니까?', '판단'],
  ['공식 공고문의 사업기간은 본문상 2026.11~2029.10(3년)과 상단 표기 2026-11-01~2027-10-31 중 어느 것이 최종 기준입니까?', '판단'],
  ['마인드스토리는 광주광역시 광역단위 사업의 주관기관입니까, 참여기관입니까? 신청자격과 실제 투입인력도 확인해 주시겠습니까?', '사실 확인'],
  ['필수 컨소시엄을 구성할 2개 이상 기관의 명칭, 분야별 역할, 협약 여부는 무엇입니까?', '사실 확인'],
  ['연차별 대상 인원·프로그램 회기·총사업비와 항목별 배분·성과 목표값을 어떻게 확정하시겠습니까?', '설계']
];

test('실제 다섯 질문이 갈래대로 나뉜다', () => {
  for (const [question, expected] of REAL) {
    assert.equal(kindOf(question), expected, question.slice(0, 24));
  }
});

test('주어가 기관이면 무엇보다 먼저 사실 확인이다', () => {
  // 실제로 났던 일: 「마인드스토리의 … 신청자격 … 자료가 있습니까?」가 「판단」으로 나왔다.
  // 계약서에 category 「신청자격」 규칙(ELIGIBILITY)이 있어 3번 규칙이 걸렸다.
  // 기관 사실에 「판단」이 붙으면 나중에 AI가 제안하게 된다. 가장 위험한 어긋남이다.
  const contract = { rules: [{ category: '신청자격', title: '신청자격 충족', ruleType: 'ELIGIBILITY', value: '…' }] };
  const question = '마인드스토리의 법적 기관유형, 신청자격, 광역사업 수행인력, 금융·복지 관련 실적을 증빙할 자료가 있습니까?';
  const verdict = classifyQuestion(question, { blueprint, contract, noticeNames, applicantName: '마인드스토리' });
  assert.equal(verdict.kind, '사실 확인');
  assert.match(verdict.reason, /기관만 아는 사실/);
  // 공고 이름이 함께 있어도 주어가 이긴다.
  const both = classifyQuestion('공고 원문 기준으로 마인드스토리의 실적이 요건을 채웁니까?', { blueprint, contract, noticeNames, applicantName: '마인드스토리' });
  assert.equal(both.kind, '사실 확인');
  // 기관 이름을 모르면 이 규칙은 관여하지 않는다. 다른 규칙이 답하고 이유도 달라진다.
  const noName = classifyQuestion(question, { blueprint, contract, noticeNames });
  assert.doesNotMatch(noName.reason, /기관만 아는 사실/);
});

test('「~하시겠습니까」로 끝나면 설계다', () => {
  // 실제로 났던 일: 「연차별 발굴 인원, 금융상담 인원을 어떻게 설정하시겠습니까?」가
  // 설계도 「인원」에 걸려 「사실 확인」으로 나왔다. 사실을 묻는 말이 아니다.
  const question = '연차별 발굴 인원, 금융상담 인원을 어떻게 설정하시겠습니까?';
  assert.equal(classifyQuestion(question, { blueprint, contract, noticeNames }).kind, '설계');
  // 설계도가 아예 없어도 어미로 갈린다.
  assert.equal(classifyQuestion(question, {}).kind, '설계');
  // 「~입니까」는 앞에 두지 않는다. 「어느 것이 최종 기준입니까?」는 판단이다.
  assert.equal(kindOf(REAL[1][0]), '판단');
});

test('공고가 충족을 요구한 것은 판단이 아니다', () => {
  // ELIGIBILITY·FORMAT·EVALUATION은 공고가 값을 준 것이 아니라 기관이 채우라고 요구한 것이다.
  const contract = { rules: [{ category: '제출양식', title: '필수 제출서류·양식', ruleType: 'FORMAT', value: '…' }] };
  const verdict = classifyQuestion('제출양식을 갖추었습니까?', { blueprint: null, contract, noticeNames });
  assert.equal(verdict.kind, '사실 확인');
  assert.match(verdict.reason, /충족을 요구한다/);
  // 값을 정해 준 것만 판단이다.
  const fixed = { rules: [{ category: '사업기간', title: '사업기간', ruleType: 'EXACT', value: '2027.1~2027.12', unit: '' }] };
  assert.equal(classifyQuestion('사업기간 기준은 무엇으로 봅니까?', { blueprint: null, contract: fixed, noticeNames }).kind, '판단');
});

test('대조에 실패하면 사실 확인으로 떨어진다', () => {
  // 제안을 안 하는 쪽이 지어내는 것보다 낫다. 안전한 실패다.
  const verdict = classifyQuestion('전년도 이용 아동의 만족도는 어느 정도였습니까?', { blueprint, contract, noticeNames });
  assert.equal(verdict.kind, '사실 확인');
  assert.match(verdict.reason, /찾지 못해/);
  assert.equal(classifyQuestion('', { blueprint, contract, noticeNames }).kind, '사실 확인');
  assert.equal(classifyQuestion('아무 근거 없는 질문입니까?', {}).kind, '사실 확인', '설계도도 계약서도 없을 때');
});

test('설계도 항목의 상태가 사실과 설계를 가른다', () => {
  // 이름이 걸리는 것만으로는 모자란다. 걸린 항목이 무슨 상태인지가 답한다.
  assert.equal(kindOf('자격 요건을 채우고 있습니까?'), '사실 확인', '확인 필요 항목');
  assert.equal(kindOf('인원을 몇 명으로 잡으시겠습니까?'), '설계', '설계안 항목');
  assert.equal(kindOf('대상을 어떻게 정하시겠습니까?'), '설계', '확정 항목');
});

test('kind를 판정에 쓰지 않는다', () => {
  // 이것이 이 파일의 핵심이다. kind를 다시 읽기 시작하면 처음 문제로 돌아간다.
  const fn = source.slice(source.indexOf('export function classifyQuestion'), source.indexOf('\n}\n', source.indexOf('export function classifyQuestion')));
  assert.doesNotMatch(fn, /\bkind\b\s*===|item\.kind|entry\.kind|\.priority\b/);
  assert.deepEqual([...ANSWER_KINDS], ['판단', '사실 확인', '설계']);
  // 제안할 수 있는 갈래는 둘뿐이다. 사실 확인은 절대 제안하지 않는다.
  assert.deepEqual([...SUGGESTABLE], ['판단', '설계']);
  assert.ok(!SUGGESTABLE.includes('사실 확인'), '기관만 아는 사실은 제안 대상이 아니다');
});

test('공고가 정한 값과 선택지를 함께 돌려준다', () => {
  const verdict = classifyQuestion('사업기간을 어떻게 잡습니까?', { blueprint, contract, noticeNames });
  assert.equal(verdict.noticeValue, '사업기간: 2027.1~2027.12');
  const choice = classifyQuestion('신청유형을 무엇으로 합니까?', { blueprint, contract, noticeNames });
  assert.deepEqual(choice.choices, ['거점', '통합']);
  // CHOICE는 값 힌트가 아니다. 고르는 것은 이번 사업이다.
  assert.equal(choice.noticeValue, '');
});

test('여러 항목을 묻는 질문은 항목을 그대로 돌려준다', () => {
  // 문장을 잘라 나누지 않는다 — 한국어가 잘린다. 무엇을 묻는지 이름으로만 알린다.
  const verdict = classifyQuestion(REAL[4][0], { blueprint, contract, noticeNames });
  assert.equal(verdict.items.length, 3);
  assert.deepEqual(verdict.items.map(item => item.title), ['대상', '인원', '회기']);
  assert.doesNotMatch(source, /split\(['"`][·,]/, '문장을 구분자로 쪼개지 않는다');
});

test('화면이 갈래·힌트·묻는 가짓수를 그린다', () => {
  assert.match(app, /function questionField\(item, index\) \{/);
  assert.match(app, /const verdict = classifyQuestion\(item\.question, \{/);
  assert.match(app, /noticeNames: \[KOREAN_LABELS\.NOTICE_CONTRACT, KOREAN_LABELS\.OFFICIAL_NOTICE_TEXT\]/);
  assert.match(app, /이 질문은 <b>\$\{parts\.length\}가지<\/b>를 묻습니다/);
  assert.match(app, /<b>공고가 정한 값<\/b>/);
  assert.match(app, /<b>원문에 두 값이 있습니다<\/b>/);
  assert.match(app, /<b>공고가 준 선택지<\/b>/);
  // 나눈 칸은 하나의 답으로 합쳐 저장한다. 저장 모양은 문자열 그대로다.
  assert.match(app, /data-design-part=/);
  assert.match(app, /state\.designAnswers = \{ \.\.\.state\.designAnswers, \[question\]: parts\.join\(' \/ '\) \}/);
  // 이미 쓴 답이 있으면 칸을 나누지 않는다. 나누면 쓰던 답을 잃는다.
  assert.match(app, /const split = parts\.length && !answer\.trim\(\);/);
  // 설계도가 없으면 무엇을 하면 되는지 말한다. 조용히 「사실 확인」으로 떨어뜨리지 않는다.
  assert.match(app, /신청기관을 고르면 더 정확히 나뉩니다/);
  assert.match(app, /applicantName: selectedApplicant\(\)\?\.name \|\| ''/);
});
