// 핵심 질문에 기관 정보 근거 보이기 (23-13).
//
// 실제로 났던 일: 답을 채울 수 있는 함수(planApplicantQuestions)는 멀쩡한데 화면의 다섯 질문이
// 그 함수를 지나지 않았다. 기관을 골라도 「0/5 답변」 그대로였다(23-12 조사).
//
// ★ 이 작업의 핵심은 「답 칸에 자동으로 값이 들어가지 않는다」이다. 찾은 것은 근거와 함께
// 보여 주기만 하고, 답 칸에 들어가는 것은 사람이 누를 때뿐이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applicantHints, hintIsPastWork, hintText } from '../src/applicant-hints.js';
import { buildDesignQuestions } from '../src/design-questions.js';
import { buildBlueprint } from '../src/project-blueprint.js';
import { matchApplicantToNotice } from '../src/fit-matching.js';
import { SAMPLE_APPLICANTS, buildSampleProject, sampleProposalSnapshot } from '../src/sample-project.js';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');
const hints = read('../src/applicant-hints.js');

const SNAPSHOT = sampleProposalSnapshot(buildSampleProject());
const STRUCTURE = SNAPSHOT.noticeLogic?.structure || null;
const NOTICE = SNAPSHOT.noticeLogic?.source || null;
const APPLICANT = SAMPLE_APPLICANTS.find(one => one.id === SNAPSHOT.selectedApplicantId) || SAMPLE_APPLICANTS[0];
const SAVED = (SNAPSHOT.projectValues || []).filter(one => one.blueprintKey)
  .map(one => ({ key: one.blueprintKey, value: one.value, source: '사용자 확정' }));

function fiveQuestions() {
  const fitResult = matchApplicantToNotice(STRUCTURE, APPLICANT);
  const blueprint = buildBlueprint({ structure: STRUCTURE, applicant: APPLICANT, fitResult, projectValues: SAVED, notice: NOTICE });
  const plan = buildDesignQuestions({
    structure: STRUCTURE, fitResult, blueprint, applicant: APPLICANT,
    projectValues: SNAPSHOT.projectValues || [], aiQuestions: SNAPSHOT.missingInformation || [], answers: {}
  });
  return plan.questions.map(item => item.question);
}

test('★ 화면의 다섯이 그 함수를 지난다', () => {
  const asked = fiveQuestions();
  assert.equal(asked.length, 5);
  const found = applicantHints(asked, APPLICANT);
  // 샘플 자료로 하나가 걸린다. 0이면 이어지지 않은 것이고, 다섯이면 아무거나 걸리는 것이다.
  assert.equal(found.size, 1);
  const [question, items] = [...found][0];
  assert.ok(asked.includes(question));
  assert.ok(items.length >= 1);
  // 근거는 확인된 기관 항목 그대로다 — 어느 항목에서 나왔는지 댈 수 있어야 한다.
  for (const item of items) {
    assert.ok(item.id && item.label && item.value, '근거에 항목 정보가 없다');
    assert.ok(APPLICANT.items.some(one => one.id === item.id), '기관에 없는 항목이 근거로 나왔다');
  }
});

test('찾은 것이 없으면 아무것도 내지 않는다', () => {
  // 기관이 없을 때, 확인정보가 없을 때, 질문이 없을 때 — 셋 다 빈 채로 둔다. 지어내지 않는다.
  assert.equal(applicantHints(fiveQuestions(), null).size, 0);
  assert.equal(applicantHints(fiveQuestions(), { name: '빈기관', items: [] }).size, 0);
  assert.equal(applicantHints([], APPLICANT).size, 0);
  // 기관 자료와 아무 상관 없는 질문에는 붙지 않는다.
  assert.equal(applicantHints(['우주선 발사대를 어디에 세우시겠습니까?'], APPLICANT).size, 0);
});

test('붙는 근거가 다른 질문 때문에 달라지지 않는다', () => {
  // 한꺼번에 넘기면 그 함수가 첫 줄을 제목으로 삼고 줄 사이의 낱말 횟수로 중심 낱말을 가른다.
  // 질문 하나는 제 낱말로만 판정해야 한다.
  const asked = fiveQuestions();
  const together = applicantHints(asked, APPLICANT);
  const reversed = applicantHints([...asked].reverse(), APPLICANT);
  assert.deepEqual([...reversed.keys()].sort(), [...together.keys()].sort());
  for (const question of asked) {
    const alone = applicantHints([question], APPLICANT);
    assert.equal(alone.size, together.has(question) ? 1 : 0, `혼자 물었을 때와 다르다 — ${question.slice(0, 30)}`);
  }
  assert.match(hints, /planApplicantQuestions\(\[question\], applicant\)/);
});

test('지난 실적에서 온 것은 값이 아니라 참고로 말한다', () => {
  // 가르는 것은 질문 문구가 아니라 근거가 어느 영역에서 왔는지다.
  const past = [{ id: 'a', area: 'performance', label: '2025년 미디어 창작단', value: '아동 15명 주 1회 16회기' }];
  const now = [{ id: 'b', area: 'staff', label: '상근 인력', value: '사회복지사 2명' }];
  assert.equal(hintIsPastWork(past), true);
  assert.equal(hintIsPastWork(now), false);
  assert.match(hintText(past), /^지난 사업에서는 /);
  assert.ok(!hintText(now).startsWith('지난 사업에서는'));
  assert.equal(hintText([]), '');
  // 섞여 있으면 지난 실적 쪽으로 본다 — 그쪽이 안전한 실패다.
  assert.equal(hintIsPastWork([...now, ...past]), true);
});

// ---------- 부르는 자리 ----------

test('★ 답 칸에는 누를 때만 들어간다', () => {
  const from = app.indexOf('function currentDesignQuestions()');
  // 모으는 길과 그리는 길만 본다 — 누름 처리기는 그 뒤에 있고, 쓰는 곳은 거기 하나뿐이다.
  const to = app.indexOf('function useApplicantHint(index)');
  assert.ok(from > 0 && to > from);
  const region = app.slice(from, to);
  assert.ok(region.includes('function questionField(item, index, hint)'), '그리는 길이 안 들어왔다');
  assert.ok(region.includes('applicantHints('), '다섯이 그 함수를 지나지 않는다');
  // 받은 근거를 실제로 그린다. 모으기만 하고 안 보여 주면 아무것도 달라지지 않는다.
  assert.match(region, /\$\{applicantHintView\(hint, index\)\}/);
  assert.match(app, /questionField\(item, index, plan\.hints\.get\(item\.question\)\)/);
  assert.ok(!/state\.designAnswers\s*=/.test(region), '그리는 길에서 답 칸에 쓴다');
  // 쓰는 곳은 누름 처리기 하나뿐이다.
  assert.match(app, /function useApplicantHint\(index\) \{/);
  assert.match(app, /\[data-use-applicant-hint\]'\)\.forEach\(el => el\.onclick = \(\) => useApplicantHint\(Number\(el\.dataset\.useApplicantHint\)\)\);/);
  // 답 칸의 값은 여전히 저장된 답에서만 온다.
  assert.match(app, /<textarea data-design-answer="\$\{index\}"[^`]*>\$\{escapeHtml\(answer\)\}<\/textarea>/);
});

test('근거 없이 값만 보이지 않는다', () => {
  const from = app.indexOf('function applicantHintView(items, index)');
  const to = app.indexOf('function useApplicantHint(index)');
  assert.ok(from > 0 && to > from);
  const region = app.slice(from, to);
  assert.match(region, /if \(!items\?\.length\) return '';/);
  // 항목 이름과 값이 함께 나온다. 값만 내지 않는다.
  assert.match(region, /areaTitle\(one\.area\)[\s\S]{0,80}escapeHtml\(one\.label\)[\s\S]{0,120}escapeHtml\(String\(one\.value/);
  // 누르는 단추가 있고, 무엇이 일어나는지 미리 말한다.
  assert.match(region, /data-use-applicant-hint="\$\{index\}"/);
  assert.ok(region.includes('자동으로 확정되지 않습니다'));
});
