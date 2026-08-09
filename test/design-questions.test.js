import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAX_DESIGN_QUESTIONS, QUESTION_KINDS, QUESTION_PRIORITY, buildDesignQuestions, reusableAnswerCandidates } from '../src/design-questions.js';
import { SOURCE_KINDS, makeApplicantSource, normalizeApplicant } from '../src/applicants.js';
import { buildSampleProject, SAMPLE_PROJECT_VALUES } from '../src/sample-project.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const sample = buildSampleProject();
const base = { structure: sample.structure, fitResult: sample.fitResult, blueprint: sample.blueprint, applicant: sample.applicant, projectValues: SAMPLE_PROJECT_VALUES };

test('기관자료는 종류·이름·주소·기준일로 기록하고 안전한 주소만 남긴다', () => {
  assert.deepEqual(SOURCE_KINDS, ['홈페이지', '블로그', '기관소개서·브로슈어', '과거 사업계획서', '결과보고서', '기타 기관자료']);
  const source = makeApplicantSource({ kind: '홈페이지', name: '기관 홈', url: 'https://example.org/about', asOf: '2026-03' });
  assert.equal(source.url, 'https://example.org/about');
  assert.equal(makeApplicantSource({ url: 'javascript:alert(1)' }).url, '');
  assert.equal(makeApplicantSource({ url: 'file:///etc/passwd' }).url, '');
  // 기존 신청기관 구조에 함께 저장한다(별도 DB를 만들지 않는다).
  const applicant = normalizeApplicant({ name: '테스트', sources: [{ kind: '블로그', url: 'https://blog.example.org' }] });
  assert.equal(applicant.sources.length, 1);
  assert.match(app, /function applicantSourcesView\(applicant\)/);
  assert.match(app, /id="add-applicant-source"/);
  assert.doesNotMatch(app, /fetch\('\/api\/fetch-url|crawl|사이트 전체/);
});

test('공고·기관 확인정보·확정값을 대조해 이미 아는 것은 묻지 않는다', () => {
  const plan = buildDesignQuestions(base);
  assert.ok(plan.questions.length > 0);
  assert.ok(plan.questions.length <= MAX_DESIGN_QUESTIONS);
  assert.match(plan.rule, /이미 확인된 내용은 묻지 않는다/);
  // 답을 적으면 그 질문은 사라진다.
  const answers = Object.fromEntries(plan.questions.map(item => [item.question, '확인한 내용을 적었습니다.']));
  const after = buildDesignQuestions({ ...base, answers });
  // 답한 질문은 다시 나오지 않고, 남아 있던 다음 우선순위 질문만 올라온다.
  for (const item of plan.questions) assert.ok(!after.questions.some(next => next.question === item.question), item.question);
  assert.ok(after.resolved.length >= plan.questions.length);
  assert.ok(after.questions.length < plan.questions.length);
});

test('질문은 필수 확인과 경쟁력으로 나뉘고 이유를 함께 표시한다', () => {
  const plan = buildDesignQuestions(base);
  for (const item of plan.questions) {
    assert.ok(QUESTION_KINDS.includes(item.kind), item.kind);
    assert.ok(item.reason.length > 0);
    assert.ok(QUESTION_PRIORITY.includes(item.priority), item.priority);
  }
  assert.ok(plan.questions.some(item => item.kind === '필수 확인'));
  assert.ok(plan.questions.some(item => item.kind === '경쟁력'));
});

test('우선순위대로 최대 5개만 묻고 억지로 채우지 않는다', () => {
  const plan = buildDesignQuestions(base);
  const order = plan.questions.map(item => QUESTION_PRIORITY.indexOf(item.priority));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.equal(plan.questions[0].priority, '공식 필수조건');
  // 물을 것이 없으면 아무것도 묻지 않는다.
  const empty = buildDesignQuestions({ structure: null, fitResult: null, blueprint: null, applicant: null, projectValues: [], aiQuestions: [] });
  assert.equal(empty.questions.length, 0);
  // 경쟁력 질문은 공고가 그 영역을 요구할 때만 만든다.
  const noCriteria = buildDesignQuestions({ ...base, structure: { fields: [], evaluationScores: [] } });
  assert.equal(noCriteria.questions.filter(item => item.kind === '경쟁력').length, 0);
});

test('답변은 이번 사업 정보로만 저장하고 기관 정보에는 후보로만 제안한다', () => {
  const plan = buildDesignQuestions(base);
  const target = plan.questions.find(item => /역량|인력|실적|프로그램/.test(item.question)) || plan.questions[0];
  const answers = { [target.question]: '아동 디지털 교육을 3년간 담당한 사회복지사 1명이 상시 배치되어 있습니다.' };
  const reuse = reusableAnswerCandidates(plan.questions, answers, sample.applicant);
  assert.ok(reuse.length >= 1);
  assert.equal(reuse[0].status, '확인 필요');
  assert.equal(reuse[0].source, '사업 설계 답변');
  // 화면도 자동 확정하지 않는다.
  assert.match(app, /function reuseAnswerToApplicant\(questionId\)/);
  assert.match(app, /status: '확인 필요', source: candidate\.source/);
  assert.match(app, /신청기관 정보에 「확인 필요」 상태로 추가했습니다/);
});

test('질문 화면 문구를 바꾸고 새 AI 호출을 만들지 않는다', () => {
  assert.match(app, /선정 가능성을 높이기 위한 핵심 질문/);
  assert.match(app, /공고와 신청기관 정보에서 확인되지 않은 내용 중 사업 설계와 평가에 중요한 내용만 질문합니다/);
  assert.doesNotMatch(app, /사업설계에 필요한 추가 답변/);
  assert.match(app, /function currentDesignQuestions\(\)/);
  // 질문 생성 경로에 API 호출이 없다.
  const body = app.slice(app.indexOf('function currentDesignQuestions()'), app.indexOf('function designQuestionsView()'));
  assert.doesNotMatch(body, /await |WithAI\(|fetch\(/);
  // 답변 반영은 기존 재생성 버튼 하나만 쓴다.
  assert.match(app, /id="regenerate-design"/);
});

test('질문에 답하지 않아도 초안 작성은 막지 않는다', () => {
  // 사업설계 AI가 남긴 필수 질문을 가장 먼저 보여 주되, 답하지 않아도 작성은 가능하다.
  const many = Array.from({ length: 8 }, (_, index) => `추가 확인 질문 ${index + 1}: 확인 항목 ${index + 1}은 무엇입니까?`);
  const plan = buildDesignQuestions({ ...base, aiQuestions: many });
  assert.equal(plan.questions.length, MAX_DESIGN_QUESTIONS);
  for (const item of plan.questions) assert.ok(many.includes(item.question), item.question);
  // 화면에도 함수에도 생성 잠금이 없다.
  assert.doesNotMatch(app, /waitingForAnswers|pendingRequiredAnswers/);
  assert.ok(app.includes('확인되지 않은 값은 만들지 않고 [확인 필요]로 남깁니다. 제출 가능 여부는 마지막 검토 단계에서 판단합니다.'));
});

test('비활성 버튼은 갈색 활성 버튼과 구분되게 표시한다', () => {
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.button:disabled,\.button\[disabled\]\{[^}]*cursor:not-allowed/);
  assert.match(css, /\.button:disabled,\.button\[disabled\]\{[^}]*background:#efece8/);
  assert.match(css, /\.button:disabled:hover,\.button\[disabled\]:hover\{/);
});
