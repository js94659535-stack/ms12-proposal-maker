// 올린 신청서 서식에 작성 내용을 배치한다. 지어내지 않고, 버리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { UNFILLED, alignTableColumns, fillFormLayout, fillSummary } from '../src/form-fill.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const PLAN = {
  outline: [
    { key: 'necessity', title: '사업 필요성', formItem: '1) 사업 추진 배경 및 필요성', limitChars: 1000 },
    { key: 'goals', title: '목표', formItem: '2) 사업 목표', limitChars: 300 },
    { key: 'budget', title: '예산', formItem: '3) 소요 예산', limitChars: 0 }
  ],
  tables: [{ kind: 'budget', title: '예산 내역', columns: ['항목', '산출근거', '금액'] }]
};
const SECTIONS = [
  { id: 'necessity', title: '사업 필요성', content: '돌봄 공백이 큽니다.' },
  { id: 'goals', title: '목표', content: '가'.repeat(400) },
  { id: 'extraOne', title: '기대효과', content: '지속 운영합니다.' }
];
const TABLES = [{ kind: 'budget', title: '예산', rows: [['금액', '항목', '산출근거'], ['12,000,000', '인건비', '1명×12개월']] }];

test('서식 항목 이름과 순서를 그대로 쓴다', () => {
  const result = fillFormLayout({ plan: PLAN, sections: SECTIONS, tables: TABLES });
  assert.equal(result.ok, true);
  assert.equal(result.sections[0].title, '1. 1) 사업 추진 배경 및 필요성');
  assert.equal(result.sections[1].title, '2. 2) 사업 목표');
  assert.equal(result.sections[2].title, '3. 3) 소요 예산');
  assert.equal(result.sections[0].content, '돌봄 공백이 큽니다.');
});

test('쓰지 않은 항목을 지어내지 않는다', () => {
  const result = fillFormLayout({ plan: PLAN, sections: SECTIONS, tables: TABLES });
  // 예산 본문이 없으므로 확인 필요로 남는다.
  assert.equal(result.sections[2].content, UNFILLED);
  assert.deepEqual(result.unfilled, ['3) 소요 예산']);
  assert.equal(result.filled, 2);
});

test('서식에 없는 작성 내용도 버리지 않는다', () => {
  const result = fillFormLayout({ plan: PLAN, sections: SECTIONS, tables: TABLES });
  const extra = result.sections.find(item => item.id === 'extraOne');
  assert.ok(extra, '서식 밖 항목이 사라졌다');
  assert.equal(extra.title, '[서식 외] 기대효과');
  assert.equal(extra.content, '지속 운영합니다.');
  assert.deepEqual(result.extra, ['[서식 외] 기대효과']);
});

test('서식이 정한 분량 초과를 세어 알린다', () => {
  const result = fillFormLayout({ plan: PLAN, sections: SECTIONS, tables: TABLES });
  const goals = result.sections[1];
  assert.equal(goals.limitChars, 300);
  assert.equal(goals.over, 100);
  assert.match(fillSummary(result), /분량 초과 1개/);
});

test('표는 서식이 정한 칸 순서로 다시 세운다', () => {
  const aligned = alignTableColumns(PLAN.tables[0], TABLES[0]);
  assert.deepEqual(aligned.rows[0], ['항목', '산출근거', '금액']);
  assert.deepEqual(aligned.rows[1], ['인건비', '1명×12개월', '12,000,000']);
  assert.equal(aligned.note, '');
});

test('만들지 않은 표는 빈 값을 지어내지 않고 확인하게 둔다', () => {
  const aligned = alignTableColumns(PLAN.tables[0], null);
  assert.deepEqual(aligned.rows[0], ['항목', '산출근거', '금액']);
  assert.ok(aligned.rows[1].every(cell => cell === UNFILLED));
  assert.match(aligned.note, /값을 채워 주세요/);
});

test('서식에 없는 칸도 잃지 않는다', () => {
  const aligned = alignTableColumns(
    { title: '예산', columns: ['항목', '금액'] },
    { rows: [['항목', '금액', '비고'], ['인건비', '100', '3개월']] }
  );
  assert.deepEqual(aligned.rows[0], ['항목', '금액', '비고']);
  assert.deepEqual(aligned.rows[1], ['인건비', '100', '3개월']);
});

test('서식을 읽지 못하면 배치했다고 말하지 않는다', () => {
  const result = fillFormLayout({ plan: null, sections: SECTIONS });
  assert.equal(result.ok, false);
  assert.match(result.reason, /읽지 못했습니다/);
  assert.match(fillSummary(result), /읽지 못했습니다/);
});

test('화면에서 서식대로 받는 길이 열려 있다', () => {
  assert.match(app, /id="final-form-docx"/);
  assert.match(app, /fillFormLayout\(/);
});
