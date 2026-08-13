import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REFERENCE_RULE, assessReference, assessReferences, projectContext, referenceNotices, referencePayload } from '../src/reference-materials.js';
import { validateCoachingResultDetailed } from '../functions/api/proposal-coaching.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
const CONTEXT = projectContext({
  proposalTitle: 'QA 청소년 학습회복 프로젝트',
  noticeTitle: '2026년 QA 배분사업 청소년 학습회복 공모',
  noticeDeadline: '2026-08-14',
  proposalText: 'QA 청소년 학습회복 프로젝트 계획서 본문'
});

const CURRENT_NOTICE = { id: 'r1', fileName: '2026 QA 공고문.txt', referenceType: '공고문', text: '2026년 QA 사회복지공동모금회 청소년 학습회복 공모 공고입니다. 총사업비: 30,000,000원. 신청기관은 비영리법인이어야 합니다.' };
const OLD_GUIDE = { id: 'r2', fileName: '2023 요강.txt', referenceType: '사업요강', text: '2023년 QA 사회복지공동모금회 청소년 학습회복 사업요강입니다. 지원 한도와 평가 배점을 안내합니다.' };
const OTHER_PROJECT = { id: 'r3', fileName: '2019 노인돌봄 요강.txt', referenceType: '사업요강', text: '2019년 QA 노인복지재단 어르신 돌봄 지원사업 요강입니다. 대상은 65세 이상 어르신입니다.' };
const UNKNOWN_SOURCE = { id: 'r4', fileName: '메모.txt', referenceType: '평가기준', text: '평가는 필요성 30점, 실행가능성 30점, 성과 40점으로 한다는 이야기를 들었습니다. 어디서 받은 자료인지 기억나지 않습니다.' };
const CONFLICTING_NOTICE = { id: 'r5', fileName: '2026 QA 공고문(수정).txt', referenceType: '공고문', text: '2026년 QA 사회복지공동모금회 청소년 학습회복 공모 공고입니다. 총사업비: 50,000,000원으로 변경되었습니다.' };

test('참고자료를 공식 근거·참고용·불일치·확인 필요로 판별한다', () => {
  assert.equal(assessReference(CURRENT_NOTICE, CONTEXT).usage, '공식 근거로 사용 가능');

  const old = assessReference(OLD_GUIDE, CONTEXT);
  assert.equal(old.usage, '관련 있으나 참고용');
  assert.match(old.reasons.join(' '), /자료 연도\(2023\).*2026/);

  assert.equal(assessReference(OTHER_PROJECT, CONTEXT).usage, '이번 사업과 맞지 않음');

  // 출처를 확인할 수 없으면 가짜로 단정하지 않는다.
  const unknown = assessReference(UNKNOWN_SOURCE, CONTEXT);
  assert.equal(unknown.usage, '출처/진위 확인 필요');
  assert.match(unknown.reasons.join(' '), /가짜로 단정하지 않으며/);

  // 공식 자료가 아닌 유형은 공식 기준으로 승격하지 않는다.
  assert.equal(assessReference({ ...CURRENT_NOTICE, referenceType: '기타 참고자료' }, CONTEXT).usage, '관련 있으나 참고용');
});

test('공식 근거끼리 값이 어긋나면 충돌로 낮추고 사용자에게 문장으로 보여준다', () => {
  const review = assessReferences([CURRENT_NOTICE, CONFLICTING_NOTICE, OLD_GUIDE, UNKNOWN_SOURCE], CONTEXT);
  assert.equal(review.officialCount, 0);
  assert.deepEqual(review.assessments.slice(0, 2).map(item => item.usage), ['내용끼리 충돌함', '내용끼리 충돌함']);
  assert.equal(review.conflicts[0].key, '총사업비·지원한도');

  const notices = referenceNotices(review, CONTEXT);
  assert.ok(notices.some(notice => /2023년 사업요강\(2023 요강\.txt\)은 현재 2026년 공모의 공식 기준으로 확인되지 않아 참고용으로만 사용했습니다/.test(notice)));
  assert.ok(notices.some(notice => /출처·진위를 확인할 수 없어/.test(notice)));
  assert.ok(notices.some(notice => /총사업비·지원한도 값이 참고자료 간에 충돌합니다/.test(notice)));
});

test('검증 요청은 계획서와 참고자료를 분리해 전달하고 사용 가능 여부를 함께 보낸다', () => {
  const payload = referencePayload([CURRENT_NOTICE, OLD_GUIDE], CONTEXT);
  assert.equal(payload.referenceRule, REFERENCE_RULE);
  assert.deepEqual(payload.references.map(item => item.usage), ['공식 근거로 사용 가능', '관련 있으나 참고용']);
  assert.deepEqual(payload.references.map(item => item.fileName), ['2026 QA 공고문.txt', '2023 요강.txt']);
  assert.deepEqual(payload.references.map(item => item.referenceType), ['공고문', '사업요강']);
  assert.ok(payload.references.every(item => item.text && item.reasons.length));
  assert.match(REFERENCE_RULE, /공식 근거로 사용 가능"인 자료만 공식 기준/);

  // 계획서 본문은 참고자료에 섞이지 않는다.
  assert.equal(JSON.stringify(payload).includes('계획서 본문'), false);
});

test('참고자료 원문도 근거 검증 대상이 되고 코칭 정책에 규칙이 있다', () => {
  const evidenceRefs = [{ sourceName: '2026 QA 공고문.txt', pageOrSection: '공고문', proposalLocation: '자격', excerpt: '신청기관은 비영리법인이어야 합니다', verified: true }];
  const result = {
    basis: 'common-criteria', overallStatus: '확인 필요', summary: 'QA', checkedAreas: ['자격'], evaluationMatrix: [], issues: [],
    finalChecks: ['자격', '필수 신청항목', '사업기간', '대상·인원', '회기', '예산 합계·예산규정', '성과목표·지표', '기관·협력 역할', '공식 평가항목 누락']
      .map(area => ({ area, status: '충족', note: 'QA', evidenceRefs })),
    comparison: { previousVersion: 0, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] }
  };
  const payload = { proposalText: 'QA 계획서 본문', criteriaText: '', references: [CURRENT_NOTICE] };
  assert.equal(validateCoachingResultDetailed(result, false, 0, payload).error, '');
  // 참고자료가 없으면 같은 근거는 확인되지 않아야 한다.
  assert.match(validateCoachingResultDetailed(result, false, 0, { proposalText: 'QA 계획서 본문', criteriaText: '' }).error, /확인되지 않는 근거/);

  const policy = fs.readFileSync(new URL('../functions/api/proposal-coaching.js', import.meta.url), 'utf8');
  assert.match(policy, /proposalText만 평가 대상 계획서다/);
  assert.match(policy, /usage가 "공식 근거로 사용 가능"인 자료만 공식 기준/);
  assert.match(policy, /2023년 요강은 현재 2026년 공모의 공식 기준으로 확인되지 않아 참고용으로만 사용했습니다/);
});

test('클릭 업로드와 드래그앤드롭이 같은 처리 경로를 쓰고 참고자료 화면이 연결된다', () => {
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /function bindDropzone\(selector, onFiles\)/);
  assert.match(appSource, /#coaching-file'\)\?\.addEventListener\('change', event => loadCoachingProposalFile\(event\.target\.files\?\.\[0\]\)\)/);
  assert.match(appSource, /bindDropzone\('#coaching-dropzone', files => loadCoachingProposalFile\(files\[0\]\)\)/);
  assert.match(appSource, /bindDropzone\('#reference-dropzone', files => addCoachingReferenceFiles\(files\)\)/);
  assert.match(appSource, /#reference-file'\)\?\.addEventListener\('change', event => addCoachingReferenceFiles/);
  assert.match(appSource, /function coachingReferenceView\(coaching\)/);
  assert.match(appSource, /\.\.\.referencePayload\(state\.coaching\.references \|\| \[\], coachingContext\(\)\)/);
  // 참고자료 판정은 각론 한 영역으로 들어갔다. 제목에 건수가 함께 붙는다.
  assert.match(appSource, /detailPanel\('references', label, open,/);
  const digest = fs.readFileSync(new URL('../server/review-digest.js', import.meta.url), 'utf8');
  assert.match(digest, /key: 'references', title: '참고자료 판정'/);
  const referenceSource = fs.readFileSync(new URL('../src/reference-materials.js', import.meta.url), 'utf8');
  assert.doesNotMatch(referenceSource, /fetch\(|openai/i);
});
