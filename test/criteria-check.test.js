// 채점 기준마다 답한 자리가 있는가(11-02). 판정자(AI)는 가짜 답으로 대신하고, 검사가 인용을 어떻게 확인하는지를 못 박는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readPlan, writingUnits } from '../public/rfp/rfp-plan.js';
import { criteriaOf, partBodies, verdicts, echoShare, restatesNotice, judgeCriteria } from '../src/criteria-check.js';
import { draftSection } from '../src/proposal-draft.js';

// 통일부 Ⅰ장 모양을 줄인 단위. Ⅰ.3에 「부합성과 종합 추진일정」 기준이 붙어 있다.
const section = {
  key: 'Ⅰ', title: 'Ⅰ. 개요',
  parts: [
    { key: 'Ⅰ.1', title: '사업 비전', scoring: [{ item: '사업 이해도', point: '효과적인 사업 추진 전략 — 비전', details: [] }] },
    { key: 'Ⅰ.3', title: '사업 수행전략', scoring: [
      { item: '사업 이해도', point: '효과적인 사업 추진 전략', details: ['사업운영 계획수립(비전, 연도별 추진방향 등)'] },
      { item: '사업 이해도', point: '효과적인 사업 추진 전략 — 연도별 추진방향', details: [] },
      { item: '기획구성', point: '제안요청서와 부합성과 종합 추진일정의 합리성', details: [] }
    ] }
  ]
};
const draft = [
  '## Ⅰ. 개요',
  '### Ⅰ.1 사업 비전',
  'o [제안] 비전: 「마음은 단단하게, 말은 가깝게」',
  '### Ⅰ.3 사업 수행전략',
  '- [제안] 2027년 기반 구축: 수요조사·사전검사, 과정 시범 운영',
  '- [제안] 심리 지원 → 상담센터에서 상담·검사·치유·코칭',
  '- [제안] 제안요청서와 부합성을 갖춘 종합 추진일정',
  '- [사실: 협약서 제8조] 중간보고는 매분기 종료 후 14일 이내에 제출한다.',
  '- [제안] 연초 수요조사·사전검사 → 연중 과정 운영 → 연말 성과평가'
].join('\n');
const bodies = partBodies(draft, section);
const criteria = criteriaOf(section);
const fit = criteria.find(criterion => criterion.text.startsWith('제안요청서'));
const answer = elements => ({ results: [{ id: fit.id, elements }] });
const judge = elements => verdicts([fit], bodies, answer(elements))[0];

test('괄호 열거가 이미 절마다 쪼개져 붙었으면 원래 줄은 따로 보지 않는다', () => {
  assert.deepEqual(criteria.map(criterion => criterion.text), ['효과적인 사업 추진 전략 — 비전', '효과적인 사업 추진 전략 — 연도별 추진방향', '제안요청서와 부합성과 종합 추진일정의 합리성']);
  // 통일부 공고에서도: Ⅰ.3에 남은 「사업운영 계획수립(비전, 목표, 연도별 추진방향 등)」은 빠지고 부합성은 남는다.
  const rfpText = fs.readFileSync(new URL('./fixtures/rfp-unification-2027.txt', import.meta.url), 'utf8');
  const unit = writingUnits(readPlan(rfpText).plan).find(entry => entry.key === 'Ⅰ');
  const texts = criteriaOf(unit).map(criterion => criterion.text);
  assert.ok(!texts.some(text => text.includes('계획수립(')), texts.join(' / '));
  assert.ok(texts.includes('효과적인 사업 추진 전략 — 비전'));
});

test('묻는 것마다 본문에 있는 제안 줄을 인용하면 답한 것이다', () => {
  const result = judge([
    { asks: '제안요청서와 부합성', quotes: ['심리 지원 → 상담센터에서 상담·검사·치유·코칭'], missing: '' },
    { asks: '종합 추진일정의 합리성', quotes: ['[제안] 연초 수요조사·사전검사 → 연중 과정 운영 → 연말 성과평가'], missing: '' }
  ]);
  assert.equal(result.level, 'pass', result.detail);
});

test('묻는 것 하나라도 비면 fail이고, 어느 것이 비었는지 적는다 — 낱말만 있는 줄·공고를 옮긴 줄은 답이 아니다', () => {
  const result = judge([
    { asks: '제안요청서와 부합성', quotes: ['제안요청서와 부합성을 갖춘 종합 추진일정', '중간보고는 매분기 종료 후 14일 이내에 제출한다.'], missing: '' },
    { asks: '종합 추진일정의 합리성', quotes: ['연초 수요조사·사전검사 → 연중 과정 운영 → 연말 성과평가'], missing: '' }
  ]);
  assert.equal(result.level, 'fail');
  assert.deepEqual(result.empty, ['제안요청서와 부합성']);
  assert.match(result.detail, /기준 문장을 되풀이한 줄/);
  assert.match(result.detail, /공고를 옮긴 줄/);
});

test('판정자가 지어낸 인용은 본문에 없어서 떨어진다', () => {
  const result = judge([
    { asks: '제안요청서와 부합성', quotes: ['위탁사무 셋을 제안 프로그램과 하나씩 맞댔다'], missing: '' },
    { asks: '종합 추진일정의 합리성', quotes: ['연초 수요조사·사전검사 → 연중 과정 운영 → 연말 성과평가'], missing: '' }
  ]);
  assert.equal(result.level, 'fail');
  assert.match(result.detail, /본문에 없는 줄/);
});

test('판정자가 기준에 없는 요구를 지어내면 그 토막은 버린다', () => {
  const result = judge([
    { asks: '제안요청서와 부합성', quotes: ['심리 지원 → 상담센터에서 상담·검사·치유·코칭'], missing: '' },
    { asks: '종합 추진일정의 합리성', quotes: ['연초 수요조사·사전검사 → 연중 과정 운영 → 연말 성과평가'], missing: '' },
    { asks: '보고 일정을 어떻게 맞추는지', quotes: [], missing: '준비 계획 없음' }
  ]);
  assert.equal(result.level, 'pass', result.detail);
});

test('판정자가 기준을 빠뜨리면 fail', () => {
  assert.equal(verdicts([fit], bodies, { results: [] })[0].level, 'fail');
});

test('되풀이·공고 줄 판정의 재료', () => {
  assert.ok(echoShare('제안요청서와 부합성을 갖춘 종합 추진일정', fit.text) > 0.6);
  assert.ok(echoShare('심리 지원 → 상담센터에서 상담·검사·치유·코칭', fit.text) < 0.6);
  assert.ok(restatesNotice('- [사실: 협약서 제8조] 중간보고는'));
  assert.ok(restatesNotice('o [사실: 공고 Ⅱ.5] 신규 프로그램'));
  assert.ok(!restatesNotice('- [사실: 기관 자료] 종합심리검사 운영'));
  assert.ok(!restatesNotice('- [제안] 심리 지원'));
});

test('판정자 호출이 실패해도 막지 않고 warn으로 남긴다', async () => {
  const client = { messages: { create: async () => { throw new Error('연결 끊김'); } } };
  const checks = await judgeCriteria({ client, text: draft, section, krwPerUsd: 1400 });
  assert.deepEqual(checks.map(check => [check.level, check.what]), [['warn', '채점 기준 검사 못 함']]);
});

test('한 장 쓰기가 판정자를 부르고, 판정자 비용도 따로 기록한다', async () => {
  let judged = null;
  const client = {
    beta: { messages: { stream: () => ({ finalMessage: async () => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: draft }], usage: { input_tokens: 10, output_tokens: 10 } }) }) } },
    messages: { create: async params => { judged = params; return { model: 'claude-haiku-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ results: [{ id: criteriaOf(unit).find(criterion => criterion.text.startsWith('제안요청서')).id, elements: [{ asks: '제안요청서와 부합성', quotes: [], missing: '대응 줄 없음' }] }] }) }], usage: { input_tokens: 3000, output_tokens: 2000 } }; } }
  };
  // 실제 통일부 Ⅰ장 단위(project.json의 연결대로 부합성이 Ⅰ.3에 붙는다)
  const rfpText = fs.readFileSync(new URL('./fixtures/rfp-unification-2027.txt', import.meta.url), 'utf8');
  const project = JSON.parse(fs.readFileSync(new URL('../reports/10-05-unification/project.json', import.meta.url), 'utf8'));
  const { plan, constraints } = readPlan(rfpText, { project });
  const unit = writingUnits(plan).find(entry => entry.key === 'Ⅰ');
  const records = [];
  const result = await draftSection({ client, model: 'claude-opus-5-5', rfpText, facts: [], project, section: unit, constraints, plan, krwPerUsd: 1400, onUsage: record => records.push(record) });
  assert.equal(judged.model, 'claude-haiku-5-5');
  assert.equal(judged.output_config.format.type, 'json_schema');
  assert.deepEqual(records.map(record => record.kind ?? 'draft'), ['draft', 'criteria']);
  assert.equal(records[1].krw, Math.round(((3000 * 0.1 + 2000 * 0.5) / 1e6) * 1400));
  const failed = result.checks.filter(check => check.what.startsWith('채점 기준') && check.level === 'fail');
  assert.ok(failed.some(check => check.what.includes('제안요청서와 부합성') && check.detail.includes('대응 줄 없음')));
});
