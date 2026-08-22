// 공고 요구를 어디로 보낼지 가른다.
//
// 실제로 났던 일: 「금융취약군을 선제적으로 발굴해야 한다」·「생활안정 지원을 수행해야 한다」가
// 「기관정보에 없는 사항 · 등록하거나 담당자에게 확인한다」로 떨어졌다. 기관 프로필에 등록할 수
// 있는 값이 하나도 아니다. 마지막 칸이 쓰레기통이라 갈 곳 없는 요구가 전부 거기 모였다.
//
// 기관정보로 남기는 것은 「기관이 갖추고 있어야 하는 것」뿐이고, 나머지 수행 요구는
// 「계획서에 답해야 할 요구사항」으로 간다. 판정은 이미 있는 자격 규칙이 하고 낱말을 늘리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareNoticeWithApplicant, normalizeApplicant } from '../src/applicants.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const req = (requirement, index) => ({ id: `req-${index + 1}`, category: '사업내용', requirement, mandatory: true, location: '공고 원문' });
const EMPTY = normalizeApplicant({ id: 'org-1', name: 'QA 기관' });
const compare = list => compareNoticeWithApplicant(list.map(req), EMPTY, null);

test('수행 요구는 기관정보가 아니라 계획서에서 답할 것으로 간다', () => {
  // 실제 공고(금융취약 중장년·노인)의 필수사업 문장이다.
  const result = compare([
    '금융취약군을 선제적으로 발굴해야 한다',
    '금융교육과 맞춤형 금융상담을 수행해야 한다',
    '생활안정 지원을 수행해야 한다',
    '사후관리와 금융복지 안전망 구축을 수행해야 한다',
    '필수사업 다섯 가지를 계획서에 모두 포함해야 한다'
  ]);
  assert.equal(result.answerInProposal.length, 5);
  assert.equal(result.missingFromApplicant.length, 0);
  assert.equal(result.answerInProposal[0].action, '기관정보가 아니라 계획서 본문에서 답할 내용입니다.');
});

test('기관이 갖춰야 할 것은 그대로 기관정보 칸에 남는다', () => {
  const result = compare([
    '신청 기관은 사회복지법인 자격을 갖춰야 한다',
    '고유번호증 등 증빙 서류를 제출해야 한다',
    '결격 사유가 없어야 한다'
  ]);
  assert.equal(result.missingFromApplicant.length, 3);
  assert.equal(result.answerInProposal.length, 0);
  assert.match(result.missingFromApplicant[0].action, /등록하거나 담당자에게 확인한다/);
});

test('다른 갈래는 그대로다', () => {
  // 공고가 값을 정해 준 사실(「~이다」)은 여전히 「공고가 정한 조건」이다.
  const fixed = compare(['사업 수행 기간은 12개월이다']);
  assert.equal(fixed.fixedByNotice.length, 1);
  assert.equal(fixed.answerInProposal.length, 0);
  // 이번 사업에서 정할 값도 그대로다.
  const decide = compare(['참여 인원과 회기를 정한다']);
  assert.equal(decide.decideInThisProject.length, 1);
  assert.equal(decide.answerInProposal.length, 0);
});

test('화면은 두 칸을 다른 이름으로 보여 준다', () => {
  const view = app.slice(app.indexOf('function applicantFitView(applicant)'), app.indexOf('function fitPerformanceView(') > 0 ? app.indexOf('function projectValuesView(') : app.length);
  assert.match(view, /key: 'answer', name: '계획서에 답해야 할 요구사항', items: comparison\.answerInProposal, status: '확인-필요', markRollup: true/);
  assert.match(view, /key: 'missing', name: '기관정보에 없는 사항 \(기관이 갖춰야 할 것\)', items: comparison\.missingFromApplicant, status: '부족'/);
});
