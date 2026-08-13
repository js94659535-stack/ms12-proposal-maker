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

test('문서 종류를 잘못 골라도 서식을 읽는다', async () => {
  const { buildFormSpec } = await import('../src/form-spec.js');
  const form = fs.readFileSync(new URL('./fixtures/form-chest-2027-application.txt', import.meta.url), 'utf8');
  // 사용자가 종류를 「기타 안내자료」로 두었어도 내용으로 신청서인 것을 알아본다.
  const spec = buildFormSpec([{ id: 'f', fileName: '2027 배분신청서.txt', sourceType: '기타 안내자료', extractionStatus: 'success', extractedText: form }]);
  assert.ok(spec, '서식을 읽지 못했다');
  assert.ok(spec.items.length >= 20, `작성 항목 ${spec.items.length}개`);
  const names = spec.items.map(item => item.name);
  assert.ok(names.includes('문제 의식(사업 필요성)'), names.slice(0, 5).join(' | '));
  assert.ok(names.includes('예산 편성'));
});

test('분량 표기는 항목 이름에 넣지 않는다', async () => {
  const { buildFormSpec } = await import('../src/form-spec.js');
  const spec = buildFormSpec([{
    id: 'f', fileName: '서식.txt', sourceType: '사업계획서 서식', extractionStatus: 'success',
    extractedText: '1. 사업 필요성 (1,000자 이내)\n2. 사업 목표 ※ 2쪽 이내\n3. 문제 의식(사업 필요성)'
  }]);
  const names = spec.items.map(item => item.name);
  assert.ok(names.includes('사업 필요성'), names.join(' | '));
  assert.ok(names.includes('문제 의식(사업 필요성)'), names.join(' | '));
  assert.equal(spec.items.find(item => item.name === '사업 필요성').limitChars, 1000);
});

test('사용자 화면에서 내부 용어를 쓰지 않는다', () => {
  assert.ok(!app.includes('패키지'), '「패키지」는 우리끼리 쓰던 말이다');
  assert.match(app, /제출서류 한 벌/);
  assert.match(app, /아직 제출본으로 굳힐 수 없습니다/);
});

test('서식 항목 전체를 자리로 두고 같은 글을 여러 번 붙이지 않는다', async () => {
  const { SHARED } = await import('../src/form-fill.js');
  const plan = {
    skeleton: [
      { key: '', title: '1. 사업명', formItem: '1. 사업명' },
      { key: 'target', title: '참여 대상 및 인원', formItem: '참여 대상 및 인원' },
      { key: 'target', title: '참여자 선정 기준', formItem: '참여자 선정 기준' },
      { key: 'budget', title: '예산 편성', formItem: '예산 편성' }
    ],
    outline: [{ key: 'target', title: '대상', formItem: '' }],
    tables: []
  };
  const sections = [{ id: 'target', title: '대상', content: '초등 저학년 30명입니다.' }];
  const result = fillFormLayout({ plan, sections, tables: [] });
  // 서식 항목 네 자리가 모두 남는다. 우리 항목만 쓰지 않는다.
  assert.equal(result.sections.filter(item => item.fromForm).length, 4);
  assert.equal(result.sections[1].content, '초등 저학년 30명입니다.');
  // 같은 본문을 두 번째 자리에 다시 붙이지 않고, 나눠 적으라고 알린다.
  assert.equal(result.sections[2].content, SHARED);
  assert.equal(result.shared, 1);
  // 쓰지 않은 자리는 지어내지 않는다.
  assert.equal(result.sections[0].content, UNFILLED);
  assert.equal(result.sections[3].content, UNFILLED);
  assert.match(fillSummary(result), /앞 항목과 함께 쓴 자리 1개 · 아직 안 쓴 자리 2개/);
});

test('실제 신청서 23개 항목이 모두 자리로 남는다', async () => {
  const { buildFormSpec, formItemSkeleton, applyFormSpecToOutline } = await import('../src/form-spec.js');
  const { PROPOSAL_OUTLINE } = await import('../src/engagement.js');
  const form = fs.readFileSync(new URL('./fixtures/form-chest-2027-application.txt', import.meta.url), 'utf8');
  const spec = buildFormSpec([{ id: 'f', fileName: '배분신청서.txt', sourceType: '공모신청서', extractionStatus: 'success', extractedText: form }]);
  const outline = applyFormSpecToOutline(PROPOSAL_OUTLINE, spec);
  const skeleton = formItemSkeleton(spec, outline);
  assert.equal(skeleton.length, spec.items.length);
  assert.ok(skeleton.length >= 20, `자리 ${skeleton.length}개`);
  // 이름은 서식이 쓴 그대로다.
  assert.equal(skeleton[0].title, spec.items[0].name);
  // 대부분의 자리가 우리 본문과 이어진다. 이어지지 않은 자리도 버리지 않는다.
  assert.ok(skeleton.filter(item => item.key).length >= 15, `이어진 자리 ${skeleton.filter(item => item.key).length}개`);
});
