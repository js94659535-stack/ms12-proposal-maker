import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PRECISION_SCOPES, PRECISION_SEVERITIES, PROPOSAL_MODES,
  applyPatchedSections, buildReviewBasis, normalizeReviewIssues, reviewSummary, sectionsToPatch, verifyUntouched
} from '../src/precise-review.js';
import { appendProposalVersion, findProposalVersion } from '../src/coaching-handoff.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');

const SECTIONS = [
  { id: 'necessity', title: '1. 사업 필요성', content: '지역 학대피해아동 가정의 돌봄 공백이 확인된다.', status: '확정', citations: [] },
  { id: 'target', title: '4. 대상', content: '핵심 참여자 36명을 대상으로 한다.', status: '확정', citations: [] },
  { id: 'programs', title: '5. 세부 프로그램', content: '홈케어플래너 파견과 가정방문 모니터링을 운영한다.', status: '확정', citations: [] },
  { id: 'budget', title: '8. 예산', content: '총사업비 139,500,000원.', status: '확정', citations: [] }
];
const ISSUES_RAW = [
  { sectionId: 'target', severity: 'BLOCKING', scope: '공고 강제조건', target: '본문', problem: '핵심 참여자가 36명으로 공고 기준에 미달한다.', basis: '공고 실행계약 MIN 70명 이상', instruction: '핵심 참여자를 70명 이상으로 다시 쓴다.' },
  { sectionId: 'budget', severity: '주의', scope: '서식 규격', target: '표', problem: '예산 산출근거 열이 비어 있다.', basis: '서식 예산표 열: 세목·세세목·산출근거', instruction: '산출근거를 수량×단가×횟수로 채운다.' },
  { sectionId: '없는항목', severity: 'BLOCKING', scope: '공고 강제조건', target: '본문', problem: 'x', basis: 'y', instruction: 'z' },
  { sectionId: 'necessity', severity: '주의', scope: '내부 정합성', target: '본문', problem: '', basis: 'y', instruction: 'z' }
];

test('검증 기준은 확정된 네 가지만 담고 본문을 고치지 말라고 명시한다', () => {
  assert.deepEqual(PROPOSAL_MODES, ['표준형', '정밀형']);
  assert.deepEqual(PRECISION_SEVERITIES, ['BLOCKING', '주의', '참고']);
  assert.deepEqual(PRECISION_SCOPES, ['공고 강제조건', '승인 설계안', '서식 규격', '내부 정합성', '수요근거 충돌']);
  const basis = buildReviewBasis({
    contract: { rules: [{ id: 'c1', category: '참여규모', title: '핵심 참여자 규모', ruleType: 'MIN', value: 70, unit: '명', severity: 'BLOCKING', evidence: '70명 이상' }] },
    formSpec: { items: [{ name: '사업 필요성', limitChars: 0, limitPages: 0 }], tables: [{ kind: '예산표', title: '예산 편성', columns: ['세목', '산출근거'] }], attachments: [{ name: '신청기관현황' }] },
    designPlan: { approvedAt: '2026-08-10', applicationType: { selected: '재학대예방형' }, coreValues: [{ key: 'headcount', value: '72명' }], requiredModels: [{ title: '홈케어플래너 파견' }] },
    demand: { confirmed: [{ title: '대상자 수요', basis: '공고 근거', items: [{ text: '학대피해아동 가정 개입 필요' }] }] }
  });
  assert.equal(basis.noticeContract.length, 1);
  assert.equal(basis.formSpec.tables[0].kind, '예산표');
  assert.equal(basis.approvedDesign.applicationType.selected, '재학대예방형');
  assert.equal(basis.demandEvidence[0].area, '대상자 수요');
  assert.match(basis.rule, /본문을 고치지 말고 문제만 지목한다/);
  // 확인 필요 수요근거는 기준에 넣지 않는다.
  assert.equal(buildReviewBasis({ demand: { confirmed: [] } }).demandEvidence.length, 0);
});

test('문제는 지정한 다섯 항목으로 저장하고 계획서에 없는 구간은 버린다', () => {
  const issues = normalizeReviewIssues(ISSUES_RAW, SECTIONS);
  assert.equal(issues.length, 2, '없는 sectionId와 내용이 빈 문제는 버린다');
  for (const issue of issues) {
    for (const key of ['sectionId', 'severity', 'problem', 'basis', 'instruction']) assert.ok(issue[key], key);
  }
  assert.equal(issues[0].sectionId, 'target');
  assert.equal(issues[0].severity, 'BLOCKING');
  const summary = reviewSummary(issues);
  assert.equal(summary.total, 2);
  assert.equal(summary.blocking, 1);
  assert.equal(summary.verdict, '수정 필요');
  assert.deepEqual(summary.sections.sort(), ['budget', 'target']);
  assert.equal(reviewSummary([]).verdict, '문제 없음');
});

test('문제가 있는 항목만 수정 요청에 넣는다', () => {
  const issues = normalizeReviewIssues(ISSUES_RAW, SECTIONS);
  const targets = sectionsToPatch(SECTIONS, issues);
  assert.deepEqual(targets.map(item => item.id), ['target', 'budget']);
  assert.ok(!targets.some(item => item.id === 'necessity' || item.id === 'programs'), '정상 구간은 요청에 넣지 않는다');
  assert.equal(targets[0].issues.length, 1);
  assert.equal(targets[0].content, SECTIONS[1].content);
});

test('정상 구간은 수정 전후가 완전히 같다', () => {
  const issues = normalizeReviewIssues(ISSUES_RAW, SECTIONS);
  const patched = [
    { id: 'target', content: '핵심 참여자 72명(피해아동 36명, 보호자 36명)을 대상으로 한다.', status: '확정', note: '' },
    { id: 'budget', content: '총사업비 139,500,000원. 산출근거: 홈케어플래너 4명 × 12개월.', status: '확정', note: '' },
    // 요청하지 않은 항목을 돌려줘도 반영하지 않는다.
    { id: 'necessity', content: '몰래 바뀐 내용', status: '확정', note: '' }
  ];
  const applied = applyPatchedSections(SECTIONS, patched, issues);
  assert.deepEqual(applied.changed.sort(), ['budget', 'target']);
  assert.equal(applied.sections[0].content, SECTIONS[0].content, '필요성은 그대로');
  assert.equal(applied.sections[2].content, SECTIONS[2].content, '프로그램은 그대로');
  assert.match(applied.sections[1].content, /72명/);
  // 지목되지 않은 항목이 바뀌지 않았음을 따로 확인한다.
  assert.deepEqual(verifyUntouched(SECTIONS, applied.sections, issues), { ok: true, broken: [] });
  const tampered = applied.sections.map((section, index) => (index === 0 ? { ...section, content: '바꿔치기' } : section));
  assert.equal(verifyUntouched(SECTIONS, tampered, issues).ok, false);
  assert.deepEqual(verifyUntouched(SECTIONS, tampered, issues).broken, ['necessity']);
  // 내용이 같거나 비면 바꾸지 않는다.
  const noop = applyPatchedSections(SECTIONS, [{ id: 'target', content: SECTIONS[1].content, status: '확정', note: '' }, { id: 'budget', content: '  ', status: '확정', note: '' }], issues);
  assert.deepEqual(noop.changed, []);
  assert.deepEqual(noop.skipped.sort(), ['budget', 'target']);
});

test('수정본은 새 버전으로 쌓이고 이전 버전이 남는다', () => {
  const issues = normalizeReviewIssues(ISSUES_RAW, SECTIONS);
  let versions = appendProposalVersion([], { sections: SECTIONS, label: 'V1 완성본' });
  const applied = applyPatchedSections(SECTIONS, [{ id: 'target', content: '핵심 참여자 72명.', status: '확정', note: '' }], issues);
  versions = appendProposalVersion(versions, { sections: applied.sections, label: '정밀 검증 1차 부분 수정', source: '정밀 검증', reason: '1개 항목 수정' });
  assert.equal(versions.length, 2);
  assert.equal(findProposalVersion(versions, 1).sections[1].content, SECTIONS[1].content, 'V1 원문 보존');
  assert.match(findProposalVersion(versions, 2).sections[1].content, /72명/);
});

test('정밀 검증은 정밀형에서만, 운영자 버튼으로만 실행된다', () => {
  assert.match(app, /function proposalMode\(\)/);
  assert.match(app, /if \(proposalMode\(\) !== '정밀형'\) return setState\(\{ error: '정밀 검증은 정밀형 계획서에서만 실행합니다\.' \}\);/);
  assert.match(app, /id="run-precise-review"/);
  assert.match(app, /id="apply-precise-fixes"/);
  assert.match(app, /지금은 표준형 계획서입니다/);
  // 표준형 전체 생성 흐름은 그대로 둔다.
  assert.match(app, /id="generate-proposal"/);
  assert.match(app, /async function generateFullProposal\(\)/);
});

test('검증은 본문을 바꾸지 않고 수정은 한 번의 호출로 끝난다', () => {
  const reviewFn = app.slice(app.indexOf('async function runPreciseReview'), app.indexOf('// 2) 부분 수정'));
  const patchFn = app.slice(app.indexOf('async function applyPreciseFixes'), app.indexOf('// 사업환경·수요근거표'));
  // 검증 호출 1회, 본문 변경 감지
  assert.equal((reviewFn.match(/await preciseReviewWithAI\(/g) || []).length, 1);
  assert.match(reviewFn, /검증 중 계획서 본문이 바뀌었습니다/);
  assert.doesNotMatch(reviewFn, /state\.sections =/);
  // 수정 호출 1회, 지목 외 변경 시 반영하지 않음
  assert.equal((patchFn.match(/await patchSectionsWithAI\(/g) || []).length, 1);
  assert.match(patchFn, /if \(!untouched\.ok\) throw new Error\(/);
  assert.match(patchFn, /appendProposalVersion\(state\.proposalVersions, \{[\s\S]{0,200}label: `정밀 검증 \$\{review\.round\}차 부분 수정`/);
  // 자동 재시도가 없다.
  assert.doesNotMatch(reviewFn, /for \(|while \(/);
  assert.doesNotMatch(patchFn, /for \(|while \(/);
  assert.match(app, /자동 재시도는 하지 않습니다/);
});

test('서버는 검증·수정 작업을 따로 등록하고 본문을 돌려받지 않는다', () => {
  assert.match(api, /'fullProposal', 'preciseReview', 'patchSections', 'rewrite', 'finalize'\]\.includes\(body\.action\)/);
  assert.match(api, /preciseReview: 8_000, patchSections: 10_000/);
  // 검증 스키마에는 본문 필드가 없다.
  const schema = api.slice(api.indexOf('const PRECISE_REVIEW_SCHEMA'), api.indexOf('const PATCH_SCHEMA'));
  assert.match(schema, /sectionId/);
  assert.match(schema, /severity/);
  assert.match(schema, /basis/);
  assert.match(schema, /instruction/);
  assert.doesNotMatch(schema, /\bcontent\b/);
  assert.match(api, /계획서 본문을 다시 쓰지 말고 문제만 반환한다/);
  assert.match(api, /받은 항목 외에는 아무것도 만들지 않는다/);
});

test('부분 수정 후 제출 게이트를 다시 본다', () => {
  // 게이트는 화면을 그릴 때마다 현재 본문으로 다시 계산한다.
  assert.match(app, /function currentSubmissionGate\(\)/);
  const view = app.slice(app.indexOf('function preciseReviewView()'), app.indexOf('// 사업환경·수요근거표 —'));
  assert.match(view, /const gate = currentSubmissionGate\(\);/);
  assert.match(view, /수정 후 제출 게이트/);
  // 공고 분석을 아직 돌리지 않았어도 원문이 있으면 계약서를 만들어 판정한다(게이트가 조용히 비지 않게).
  assert.match(app, /if \(!currentNoticeContract\(\)\?\.rules\?\.length && state\.sections\.length\) ensureNoticeLogic\(\);/);
  assert.match(app, /남은 강제조건 \$\{gate\.blocking\.length\}건/);
  // 보관 스냅샷에 검증 결과가 함께 남는다.
  assert.match(app, /'engagement', 'proposalTables', 'preciseReview'\]/);
});
