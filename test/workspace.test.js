// 계획서 작업대(10-12)의 판정 — 다음 할 일 · 배점 채움 · 질문 · 초안 파일 붙이기.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readPlan } from '../public/rfp/rfp-plan.js';
import { chaptersOf, sortDraftFiles, coverage, pendingsOf, questionsOf, daysLeft, nextStep, draftFileLabel, PENDING } from '../public/plan/workspace.js';
import { PENDING as enginePending } from '../src/proposal-draft.js';

const rfpText = fs.readFileSync(new URL('./fixtures/rfp-unification-2027.txt', import.meta.url), 'utf8');
const project = JSON.parse(fs.readFileSync(new URL('../reports/10-05-unification/project.json', import.meta.url), 'utf8'));
const { plan } = readPlan(rfpText, { project });
const chapters = chaptersOf(plan);
const submit = '## Ⅰ. 개요\no 목표 인원: [확인 필요: 연도별 목표 인원]\no 만족도: [확인 필요: 목표 점수]\no 또 [확인 필요: 연도별 목표 인원]';

test('엔진과 작업대가 같은 [확인 필요] 머리말과 같은 파일 이름 규칙을 쓴다', () => {
  assert.equal(enginePending, PENDING);
  assert.equal(draftFileLabel('Ⅰ. 개요'), 'Ⅰ._개요');
  const tool = fs.readFileSync(new URL('../tools/proposal-draft.mjs', import.meta.url), 'utf8');
  assert.match(tool, /const fileName = draftFileLabel/);
});

test('생성 도구의 파일을 장에 붙이고, 맞지 않는 파일은 버리지 않고 밝힌다', () => {
  assert.deepEqual(chapters.map(chapter => chapter.key), ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']);
  const { byChapter, unmatched } = sortDraftFiles(chapters, [
    { name: 'submit_Ⅰ._개요.md', text: submit }, { name: 'draft_Ⅰ._개요.md', text: '[제안] …' },
    { name: 'checks_Ⅰ._개요.json', text: '[]' }, { name: 'submit_Ⅸ._없는장.md', text: 'x' }, { name: 'usage.jsonl', text: '' }
  ]);
  assert.deepEqual(Object.keys(byChapter.Ⅰ).sort(), ['checks', 'draft', 'submit']);
  assert.deepEqual(unmatched, ['submit_Ⅸ._없는장.md', 'usage.jsonl']);
});

test('배점 채움은 제출본이 있는 장의 배점이고, 분모는 평가표 합계다', () => {
  const none = coverage(plan, chapters, {});
  assert.deepEqual(none, { filled: 0, total: 70, done: 0, of: 5 });
  const one = coverage(plan, chapters, { Ⅰ: { submit } });
  assert.equal(one.filled, chapters[0].score);
  assert.equal(one.done, 1);
});

test('비워 둔 곳은 자리마다 하나 — 같은 이름표라도 다른 값이다(11-12)', () => {
  const found = pendingsOf(chapters, { Ⅰ: { submit } });
  assert.deepEqual([...new Set(found.map(item => item.what))], ['연도별 목표 인원', '목표 점수']);
  assert.ok(found.every((item, index) => item.id === `Ⅰ:${index + 1}`));
  // 11-09 Ⅰ장: 「목표 %」가 두 자리(정서 개선 비율 · 지역주민 참여 비율) — 둘 다 센다.
  const two = ['o 정서 개선: 사전·사후 검사 개선 비율 [확인 필요: 목표 %]', 'o 지역주민 함께 참여 비율: [확인 필요: 목표 %]'].join('\n');
  const pend = pendingsOf(chapters, { Ⅰ: { submit: two } });
  assert.deepEqual(pend.map(item => [item.id, item.what]), [['Ⅰ:1', '목표 %'], ['Ⅰ:2', '목표 %']]);
  assert.match(pend[1].line, /지역주민 함께 참여 비율/);
});

test('질문은 project.json에서 빈 칸으로 정한다 — 통일부 건은 역할분장 하나', () => {
  assert.deepEqual(questionsOf(project).map(q => q.key), ['roles', 'fill:협력 하나센터 이름']);
  assert.deepEqual(questionsOf({ ...project, fill: { '협력 하나센터 이름': '서울 강서하나센터' } }).map(q => q.key), ['roles']);
  assert.deepEqual(questionsOf({ lead: 'A', partners: [{ name: null }], roles: null }).map(q => q.key), ['partner-0', 'roles', 'deadline']);
  assert.deepEqual(questionsOf(null).map(q => q.key), ['project']);
});

test('마감을 모르면 남은 날을 지어내지 않는다', () => {
  assert.equal(daysLeft(null), null);
  assert.equal(daysLeft('아무 글'), null);
  assert.equal(daysLeft('2026-12-08T10:00:00+09:00', new Date('2026-10-31T12:00:00+09:00')), 38);
});

test('다음 할 일은 하나이고 차례대로 넘어간다 — 질문이 남아도 막지 않는다', () => {
  const base = { noticeText: rfpText, plan, chapters };
  assert.equal(nextStep({}).step, 'notice');
  assert.equal(nextStep({ ...base }).step, 'facts');
  const facts = [{ source: '연혁', text: '…' }];
  const withQuestion = nextStep({ ...base, facts, questions: questionsOf(project), drafts: {} });
  assert.equal(withQuestion.step, 'questions');
  assert.equal(withQuestion.chapter, 'Ⅰ');
  assert.match(withQuestion.text, /Ⅰ\. 개요 초안을 만드세요 — 먼저 질문 2개/); // 역할분장 + 협력 하나센터 이름(11-12)
  const drafts = Object.fromEntries(chapters.map(chapter => [chapter.key, { submit: 'x' }]));
  assert.equal(nextStep({ ...base, facts, drafts, pendings: [{ chapter: 'Ⅰ', what: 'x' }] }).text, '초안이 비워 둔 곳 1곳을 채우세요');
  assert.match(nextStep({ ...base, facts, drafts }).text, /모든 장의 초안이 있습니다/);
});

test('작업대 화면은 판정을 스스로 하지 않고 workspace.js와 readPlan을 부른다', () => {
  const page = fs.readFileSync(new URL('../public/plan/index.html', import.meta.url), 'utf8');
  assert.match(page, /from '\.\/workspace\.js'/);
  assert.match(page, /readPlan\(state\.noticeText, \{ project/);
  assert.equal([...page.matchAll(/class="next"/g)].length, 1);
  for (const banned of ['fetch(', 'http://', 'https://']) assert.ok(!page.includes(banned), banned);
});
