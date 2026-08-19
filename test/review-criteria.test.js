// 서버가 검증하는 값은 모델에게도 알려줘야 한다.
//
// 두 곳에서 같은 병이 있었다. 검증기는 정해진 값과 정확히 대조하는데
// 그 값이 프롬프트에 없어서, 모델이 알 길 없는 것을 맞히도록 요구하고 있었다.
// 그리고 같은 목록이 두 곳에 적혀 있으면 한쪽만 고치는 사고가 난다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CRITERIA, REVIEW_POLICY, validateReviewResult } from '../functions/api/proposal-review.js';

const review = fs.readFileSync(new URL('../functions/api/proposal-review.js', import.meta.url), 'utf8');
const coaching = fs.readFileSync(new URL('../functions/api/proposal-coaching.js', import.meta.url), 'utf8');

test('심사 기준 여덟 이름을 프롬프트가 알려 준다', () => {
  const labels = CRITERIA.map(([, label]) => label);
  assert.equal(labels.length, 8);
  // 이 이름들은 validateReviewResult가 정확한 일치를 요구한다.
  // 프롬프트에 없으면 모델이 지어내고, 지어내면 502가 난다.
  for (const label of labels) assert.ok(REVIEW_POLICY.includes(label), `프롬프트에 없음: ${label}`);
});

test('심사 기준 이름은 CRITERIA 한 곳에서만 나온다', () => {
  // 손으로 복사해 적으면 나중에 하나만 고치는 사고가 난다.
  assert.match(review, /\$\{CRITERIA\.map\(\(\[, label\]\) => label\)/);
  for (const [, label] of CRITERIA) {
    assert.equal((review.match(new RegExp(label, 'g')) || []).length, 1, `${label}이 두 번 이상 적혀 있다`);
  }
});

test('이름이 어긋난 심사 결과는 지금도 거절된다', () => {
  // 프롬프트에 넣었다고 검증을 푸는 것이 아니다. 마지막 벽은 그대로 둔다.
  const criteria = CRITERIA.map(([key, label], index) => ({
    key, label, score: 80, judgment: '판단', strengths: [], issues: [],
    improvementDirection: '', evidenceRefs: [`근거${index}`]
  }));
  const base = {
    overallScore: 80, overallJudgment: '판단',
    structureReview: Object.fromEntries([
      ...['noticeAndEvaluationFit', 'needDifferentiationFeasibility', 'baselineConsistency',
        'applicationQuestionCoverage', 'crossSectionLogicAndDuplication', 'unsupportedClaims']
        .map(key => [key, { status: '충족', findings: [], affectedSectionKeys: [], evidenceRefs: [] }]),
      ['affectedSectionKeys', []]
    ]),
    criticalIssues: [], criteria, consistencyReport: {}, revisedSections: [], missingQuestions: []
  };
  assert.equal(validateReviewResult(base), '');
  const renamed = { ...base, criteria: criteria.map((item, i) => (i ? item : { ...item, label: '공고 목적·평가기준 부합도' })) };
  assert.match(validateReviewResult(renamed), /심사 기준 이름이 일치하지 않습니다/);
});

test('코칭은 riskType과 우선순위의 짝을 식별자로 알려 준다', () => {
  // 프롬프트는 「제출 불가는 최우선 경고」라고 한국어로만 말했고
  // 검증기는 riskType === 'submission' 으로 판정했다. 그 사이를 모델이 이어야 했다.
  assert.match(coaching, /const RISK_PRIORITY = Object\.freeze\(\{/);
  assert.match(coaching, /riskType과 priority는 반드시 다음 짝으로 맞춘다/);
  assert.match(coaching, /\$\{RISK_RULE\}/);
  // 짝 문구가 표에서 만들어진다. 손으로 적은 것이 아니다.
  assert.match(coaching, /const RISK_RULE = RISK_TYPES\.map\(/);
});

test('코칭의 riskType 목록이 한 곳에서만 나온다', () => {
  // 예전에는 다섯 값이 스키마 enum과 CRITICAL_RISK_TYPES 두 곳에 따로 적혀 있었다.
  assert.match(coaching, /riskType: \{ type: 'string', enum: RISK_TYPES \}/);
  assert.match(coaching, /priority: \{ type: 'string', enum: PRIORITIES \}/);
  assert.match(coaching, /const CRITICAL_RISK_TYPES = RISK_TYPES\.filter\(/);
  // 표 안에서만 값이 적혀 있어야 한다.
  const table = coaching.slice(coaching.indexOf('const RISK_PRIORITY'), coaching.indexOf('const RISK_TYPES'));
  for (const type of ['submission', 'eligibility', 'required-item', 'budget-rule', 'core-conflict', 'competition', 'expression']) {
    assert.ok(table.includes(type), `표에 ${type}이 없다`);
  }
  // 검증기가 짝을 손으로 다시 적지 않는다.
  assert.doesNotMatch(coaching, /value\.riskType === 'competition' && value\.priority !== '주요 개선'/);
  assert.doesNotMatch(coaching, /value\.riskType === 'expression' && value\.priority !== '일반 개선'/);
});

// 표로 옮기면서 검증 오류 문구가 바뀌면, 그 문구로 세던 집계와 갈린다.
// 옮기기 전 문장을 여기 박아 두고 대조한다.
test('riskType 정리로 검증 문구가 바뀌지 않았다', () => {
  const before = {
    competition: '선정 경쟁력 위험은 주요 개선으로 분류해야 합니다.',
    expression: '표현 문제는 일반 개선으로 분류해야 합니다.'
  };
  const start = coaching.indexOf('const RISK_PRIORITY = Object.freeze({');
  const open = coaching.indexOf('{', start + 30);
  let depth = 0;
  let end = open;
  for (; end < coaching.length; end += 1) {
    if (coaching[end] === '{') depth += 1;
    else if (coaching[end] === '}') { depth -= 1; if (!depth) break; }
  }
  const table = (0, eval)(`(${coaching.slice(open, end + 1)})`); // eslint-disable-line no-eval
  for (const [type, expected] of Object.entries(before)) {
    const entry = table[type];
    assert.ok(entry, `${type}이 표에 없다`);
    assert.equal(`${entry.subject} ${entry.priority}으로 분류해야 합니다.`, expected, `${type} 문구가 바뀌었다`);
  }
  // 최우선 다섯은 한 문구로 함께 검사한다. 그 줄은 손대지 않았다.
  assert.match(coaching, /제출·자격·필수항목·예산·핵심 수치 위험은 최우선 경고여야 합니다\./);
});

// proposal.js와 같은 문제가 코칭에도 있었다. 길이에서 끊긴 응답은 HTTP 200으로 온다.
test('코칭도 잘린 응답을 성공으로 기록하지 않는다', () => {
  // 끊김을 아예 보지 않고 response.ok 만으로 기록하던 것을 고쳤다.
  assert.doesNotMatch(coaching, /noteCoachingUsage\(env, usageMeta, data, response\.ok, response\.ok \? '' : 'openai-upstream'/);
  assert.match(coaching, /const truncated = response\.ok && data\?\.status === 'incomplete';/);
  assert.match(coaching, /response\.ok && !truncated/);
  // 집계 이름은 proposal.js와 같은 것을 쓴다. 새 이름을 만들지 않는다.
  assert.match(coaching, /truncated \? 'output-incomplete' : ''/);
  // 두 자리 모두 고쳤다 — 바로 부르는 쪽과 background 조회 쪽.
  assert.equal((coaching.match(/const truncated = response\.ok && data\?\.status === 'incomplete';/g) || []).length, 2);
  // 토큰은 이미 나갔으므로 기록을 건너뛰지는 않는다.
  assert.doesNotMatch(coaching, /if \(truncated\) return;/);
});
