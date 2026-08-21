// 앞 항목들을 묶어 다시 말하는 요구사항에 꼬리표만 단다.
//
// 실제로 났던 일: 「필수사업 다섯 가지를 계획서에 모두 포함해야 한다」가 앞 다섯 줄을 묶은
// 요약인데 여섯 번째 요구로 따로 세어졌다. 합치거나 지우면 진짜 별개 요구를 잃을 수 있어
// 건수는 그대로 두고 표시만 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rollupIds, rollupMark } from '../src/requirement-rollup.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// 실제 공고(금융취약 중장년·노인)의 필수사업 문장이다. 마지막 줄이 앞 다섯을 묶었다.
const SIX = [
  '금융취약군을 선제적으로 발굴해야 한다',
  '금융교육과 맞춤형 금융상담을 수행해야 한다',
  '생활안정 지원을 수행해야 한다',
  '복지·법률·심리정서 서비스를 연계해야 한다',
  '사후관리와 금융복지 안전망 구축을 수행해야 한다',
  '필수사업 다섯 가지를 계획서에 모두 포함해야 한다'
];

test('여섯 줄에서 여섯 번째만 걸린다', () => {
  const marks = SIX.map(rollupMark);
  assert.deepEqual(marks.map(mark => mark.rollup), [false, false, false, false, false, true]);
  // 그렇게 본 까닭을 함께 돌려준다.
  assert.deepEqual(marks[5].reasons, ['다섯 가지', '모두']);
  // 앞 다섯은 까닭도 없다.
  assert.deepEqual(marks.slice(0, 5).flatMap(mark => mark.reasons), []);
});

test('법령 조항 나열은 걸리지 않는다', () => {
  // 공고 일곱 건에서 유일하게 걸렸던 오탐이다. 「각 호」는 법령을 인용하는 말버릇이라 신호에서 뺐다.
  const clause = '1.「국가공무원법」 제33조 각 호의 어느 하나에 해당하는 사람 2.「아동･청소년의 성보호에 관한 법률」에 따른 아동․청소년대상 성범죄 또는 「성폭력범죄의 처벌 등에 관한 특례법」에 따른 성폭력범죄를 범하여 벌금형을 선고받고 그 형이 확정된 날부터 10년이 지나지 아니하였거나, 금고이상의 형이나 치료감호를 선고받고 그 집행이 끝나거나 집행이 유예․면제된 날부터 10년이 지나지 아니한 사람 4.「아동복지법」에 따라 아동학대관련 범죄로 형 또는 치료감호를 선고받아 확정되고, 그 확정된 때부터 형 또는 치료감호의 전부 또는 일부의 집행이 종료되거나 집행을 받지 아니하기로 확정된 후 10년이 경과하지 아니한 사람';
  assert.equal(rollupMark(clause).rollup, false);
});

test('한쪽 신호만으로는 걸리지 않는다', () => {
  // 개수만 말하는 것은 요약이 아니다.
  assert.equal(rollupMark('프로그램 3개 분야를 운영한다').rollup, false);
  // 「모두」만 있는 것도 아니다.
  assert.equal(rollupMark('참여자는 모두 관내 거주자여야 한다').rollup, false);
  // 앞을 가리키면서 모두를 말하면 걸린다.
  const back = rollupMark('위 항목을 빠짐없이 계획서에 담아야 한다');
  assert.equal(back.rollup, true);
  assert.deepEqual(back.reasons, ['위 항목', '빠짐없이']);
});

test('건수와 순서는 건드리지 않는다', () => {
  const list = SIX.map((requirement, index) => ({ id: `req-${index + 1}`, requirement }));
  // 목록에서 빼지 않고 id만 골라 준다.
  assert.deepEqual(rollupIds(list), ['req-6']);
  assert.equal(list.length, 6);
});

test('화면은 그 칸에서만 꼬리표를 달고 숫자는 그대로 센다', () => {
  const view = app.slice(app.indexOf('function applicantFitView(applicant)'), app.indexOf('function projectValuesView('));
  // 「계획서에 답해야 할 요구사항」 칸에만 표시한다.
  assert.match(view, /\['계획서에 답해야 할 요구사항', comparison\.answerInProposal, '확인-필요', true\]/);
  assert.match(view, /\$\{markRollup \? rollupNote\(item\.requirement\) : ''\}/);
  // 숫자는 목록 길이 그대로다. 묶음이라고 빼지 않는다.
  assert.match(view, /\$\{escapeHtml\(name\)\} \$\{items\.length\}건/);
  const note = app.slice(app.indexOf('function rollupNote(requirement)'), app.indexOf('// 이 공고에 맞는 실적이 몇 건인지'));
  assert.match(note, /앞 항목들을 묶은 문장으로 보입니다\. 따로 세지 않아도 됩니다\./);
  assert.match(note, /그렇게 본 까닭: \$\{mark\.reasons/);
});
