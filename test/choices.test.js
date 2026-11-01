// 고를 제안 가르기(11-10): 값 · 약속 · 문구, 묶음, 배점 큰 절부터, 점수 줄.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { choicesOf, choicesSheet, scoreQuotesOf } from '../public/plan/choices.js';

const parts = [{ key: 'Ⅱ.1', title: '일반 현황', score: 3.33 }, { key: 'Ⅱ.2', title: '프로그램 운영 계획', score: 15 }];
const text = [
  '## Ⅱ. 사업운영계획',
  '### Ⅱ.1 일반 현황',
  'o [제안] 조직구성: 총괄책임자 아래 세 팀 배치',
  '- [제안] 인원·자격: [확인 필요: 명단]',
  '- [제안] 인력 변경: 사전승인 후 교체',
  '### Ⅱ.2 프로그램 운영 계획',
  'o [제안] 마음숲 심리 상담 과정',
  '- [제안] 정착 마음검사 → 종합심리검사 후 해석상담 → 개인 검사 해석지',
  '- [제안] 개인 심리상담 → 정서문제 회기 상담 → 회기별 상담기록지',
  '- [사실: 기관 자료] 2025 장성교육지원청 상담'
].join('\n');
const checks = [{ level: 'pass', what: '채점 기준 「Ⅱ.2 공간별 테마」', detail: '세부: 「정착 마음검사 → 종합심리검사 후 해석상담 → 개인 검사 해석지」' }];

test('제안 줄을 값·약속·문구로 가르고 묶음으로 모은다 — 사실 줄은 넣지 않는다', () => {
  const c = choicesOf(text, { parts, checks });
  // 아랫줄이 있는 머리(조직구성, 마음숲 심리 상담 과정)는 묶음 이름일 뿐 고를 줄이 아니다(11-14).
  assert.equal(c.total, 4);
  assert.deepEqual(c.promises.map(entry => [entry.part, entry.title, entry.lines.length]), [['Ⅱ.2', '마음숲 심리 상담 과정', 2]]);
  assert.deepEqual(c.values.flatMap(entry => entry.lines.map(line => line.text)), ['인원·자격: [확인 필요: 명단]']);
  assert.equal(c.wording.reduce((sum, entry) => sum + entry.lines.length, 0), 1);
  assert.equal(c.wording[0].title, '조직구성: 총괄책임자 아래 세 팀 배치');
  // 「→ 꼴」이 아닌 약속은 문구에 들어간다 — 알려진 한계(11-10). 써 보고 나오면 고친다.
  assert.ok(c.wording.some(entry => entry.lines.some(line => line.text.startsWith('인력 변경'))));
});

test('점수 줄 — 판정이 답으로 고른 줄에 표시', () => {
  const c = choicesOf(text, { parts, checks });
  assert.deepEqual(c.promises[0].lines.map(line => line.score), [true, false]);
  assert.equal(scoreQuotesOf([{ level: 'fail', what: '채점 기준 x', detail: '「아무 줄이나 여섯 글자 넘게」' }]).length, 0);
});

test('배점 큰 절부터 — 파일도 같은 갈래로', () => {
  const sheet = choicesSheet(text, { title: 'Ⅱ. 사업운영계획', parts, checks });
  assert.match(sheet, /누를 것은 약속 1묶음이다/);
  assert.match(sheet, /- \[ \] 다 할 수 있다 \/ \[ \] 뺄 줄 있음 — Ⅱ\.2 \(15점\) · 마음숲 심리 상담 과정/);
  assert.match(sheet, /정착 마음검사 .* ★점수 줄/);
  assert.match(sheet, /## 문구 1줄 — 기본 채택/);
});

test('11-10 한 편: 168줄(머리 29줄은 이름만) → 약속 31묶음 · 값 32 · 문구 64, 이름이 줄로 또 나오지 않는다', async () => {
  const { readPlan, writingUnits } = await import('../public/rfp/rfp-plan.js');
  const rfpText = fs.readFileSync(new URL('./fixtures/rfp-unification-2027.txt', import.meta.url), 'utf8');
  const project = JSON.parse(fs.readFileSync(new URL('../reports/10-05-unification/project.json', import.meta.url), 'utf8'));
  const dir = new URL('../reports/11-10-tidy/', import.meta.url);
  let promises = 0, values = 0, wording = 0, total = 0;
  for (const unit of writingUnits(readPlan(rfpText, { project }).plan)) {
    const draft = fs.readFileSync(new URL(fs.readdirSync(dir).find(name => name.startsWith(`draft_${unit.key}.`)), dir), 'utf8');
    const c = choicesOf(draft, { parts: unit.parts.map(part => ({ key: part.key, title: part.title, score: part.score })) });
    const n = list => list.reduce((sum, entry) => sum + entry.lines.length, 0);
    promises += c.promises.length; values += n(c.values); wording += n(c.wording); total += c.total;
    for (const entry of [...c.promises, ...c.wording, ...c.values]) if (!entry.standalone) assert.ok(!entry.lines.some(line => line.text === entry.title), `${unit.key} ${entry.title}`);
    // 배점 큰 절부터 — 묶음 배점이 내려가기만 한다.
    assert.ok(c.promises.every((entry, index, list) => !index || list[index - 1].score >= entry.score), unit.key);
    if (unit.key === 'Ⅰ') assert.equal(c.promises[0].part, 'Ⅰ.4');
  }
  assert.deepEqual([total, promises, values, wording], [168, 31, 32, 64]);
});

test('약속으로 옮긴 문구 줄은 따로 한 묶음 — 기준(→ 꼴)은 그대로(11-12)', async () => {
  const { lineKeyOf } = await import('../public/plan/choices.js');
  const key = lineKeyOf('Ⅱ', '인력 변경: 사전승인 후 교체');
  const c = choicesOf(text, { parts, checks, chapter: 'Ⅱ', moved: { [key]: { text: '인력 변경: 사전승인 후 교체' } } });
  assert.equal(c.promises.at(-1).title, '사람이 약속으로 옮긴 줄');
  assert.deepEqual(c.promises.at(-1).lines.map(line => line.id), [key]);
  assert.ok(!c.wording.some(entry => entry.lines.some(line => line.id === key)));
  // 옮기지 않으면 문구 그대로.
  assert.ok(choicesOf(text, { parts, chapter: 'Ⅱ' }).wording.some(entry => entry.lines.some(line => line.id === key)));
});

test('값 줄의 빈칸 id는 제출본에서 세는 pendingsOf와 같다(「장:몇째」)', async () => {
  const { pendingsOf } = await import('../public/plan/workspace.js');
  const { stripMarks } = await import('../src/proposal-draft.js');
  const draft = ['### Ⅱ.1 일반 현황', '- [사실: 공고] 보고 [확인 필요: 기한]', 'o [제안] 정서 개선 [확인 필요: 목표 %]', 'o [제안] 참여 비율 [확인 필요: 목표 %]'].join('\n');
  const fromChoices = choicesOf(draft, { parts, chapter: 'Ⅱ' }).values.flatMap(entry => entry.lines.flatMap(line => line.pendings.map(item => item.id)));
  const fromScreen = pendingsOf([{ key: 'Ⅱ' }], { Ⅱ: { submit: stripMarks(draft) } }).map(item => item.id);
  assert.deepEqual(fromChoices, ['Ⅱ:2', 'Ⅱ:3']);
  assert.deepEqual(fromScreen, ['Ⅱ:1', 'Ⅱ:2', 'Ⅱ:3']);
});
