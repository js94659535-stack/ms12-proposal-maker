import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDocumentPlan, canGenerateProposal } from '../src/engagement.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
// generateFullProposal 함수 본문만 잘라 본다(호출이 정말 한 번인지 확인하기 위해).
const fullProposalFn = app.slice(app.indexOf('async function generateFullProposal()'), app.indexOf('// 확인되지 않은 값이 있어도 초안 작성은 막지 않는다'));

test('계획서 생성은 설계안 1회 + 전체 작성 1회 구조를 쓴다', () => {
  // 첫 호출(master)은 본문이 아니라 설계안을 만든다.
  assert.match(api, /아직 계획서 본문을 작성하지 말고/);
  // 두 번째 호출은 승인된 설계안으로 본문과 표를 한 번에 만든다.
  assert.match(api, /const ACTIONS = \['analyze', 'master', 'draftPart', 'draft', 'fullProposal', 'preciseReview', 'patchSections', 'rewrite', 'finalize', CORE_PROPOSAL_ACTION];/);
  assert.match(api, /fullProposal: 20_000/);
  assert.match(api, /if \(action === 'fullProposal'\) return \{/);
  assert.match(api, /name: 'proposal_full_document', schema: FULL_PROPOSAL_SCHEMA/);
  assert.match(client, /export const fullProposalWithAI = payload => request\('fullProposal', payload\);/);
});

test('전체 계획서 작성 요청은 정확히 한 번만 만들어진다', () => {
  assert.ok(fullProposalFn.length > 200, '함수를 찾지 못했다');
  assert.equal((fullProposalFn.match(/await fullProposalWithAI\(/g) || []).length, 1);
  // 분할 반복을 쓰지 않는다.
  assert.doesNotMatch(fullProposalFn, /for \(const group of|draftPartWithAI|completedGroupIds/);
  // 신규 경로 버튼은 이 함수를 부르고, 이어쓰기 버튼만 기존 분할 경로를 쓴다.
  assert.match(app, /document\.querySelector\('#generate-proposal'\)\?\.addEventListener\('click', \(\) => generateFullProposal\(\)\);/);
  assert.match(app, /이 경로는 이미 분할 작성을 시작한 기존 계획서의 이어쓰기 전용이다/);
});

test('승인되지 않은 설계안이면 전체 계획서 작성을 실행하지 않는다', () => {
  assert.equal(canGenerateProposal({}).allowed, false);
  // 실행 경로와 버튼 양쪽에서 막는다.
  assert.match(fullProposalFn, /const permission = generationPermission\(\);\s*\n\s*if \(!permission\.allowed\) return setState\(\{ error: permission\.reason \}\);/);
  assert.match(app, /id="generate-proposal" \$\{generationPermission\(\)\.allowed \? '' : 'disabled'\}/);
  // 승인된 설계안이 서버에서도 필수다.
  assert.match(api, /if \(!payload\.designPlan \|\| typeof payload\.designPlan !== 'object'\) return '승인된 설계안이 없습니다\.';/);
  // 기존 계획서 열람·이어쓰기는 막지 않는다.
  assert.equal(canGenerateProposal({ sections: [{ id: 'necessity' }] }).allowed, true);
  assert.equal(canGenerateProposal({ startedParts: 1 }).allowed, true);
});

test('공고 강제조건·신청유형·기관 확인정보가 두 번째 호출 payload에 남는다', () => {
  // partPayload는 설계도·실행계약서·기관정보·확정 답변을 그대로 들고 간다.
  assert.match(fullProposalFn, /await fullProposalWithAI\(\{ \.\.\.partPayload\(\), designPlan: plan \}\)/);
  assert.match(app, /function partPayload\(\)[\s\S]{0,300}\.\.\.rest, narrative:/);
  assert.match(app, /projectBlueprint: blueprintHandoff\(\), noticeContract: contractHandoff\(\)/);
  // 서버 프롬프트에도 실행계약서와 승인 설계안이 함께 들어간다.
  assert.match(api, /<APPROVED_DESIGN_PLAN>\$\{JSON\.stringify\(payload\.designPlan\)\}<\/APPROVED_DESIGN_PLAN>/);
  assert.match(api, /if \(action === 'fullProposal'\) return \{[\s\S]{0,900}\$\{blueprintBlock\(payload\)\}/);
  // 승인 설계안에는 강제조건·신청유형·핵심값·수행모델이 들어 있다.
  assert.match(app, /function approvedDesignPlan\(\)/);
  assert.match(app, /const brief = engagement\.approval\.snapshot \|\| engagement\.brief;/);
});

test('목표 분량과 조판할 표는 설계안에서 정한다', () => {
  const contract = {
    rules: [
      { category: '예산', ruleType: 'MAX', value: 140000000, unit: '원' },
      { category: '사업기간', ruleType: 'EXACT', value: '2027.1~2027.12' },
      { category: '성과', ruleType: 'MIN', value: 98, unit: '%' },
      { category: '참여규모', ruleType: 'MIN', value: 70, unit: '명' }
    ]
  };
  const plan = buildDocumentPlan(contract);
  assert.equal(plan.outline.length, 10);
  assert.ok(plan.targetTotalChars > 0);
  assert.deepEqual(plan.tables.map(item => item.kind), ['예산표', '일정표', '성과지표표', '대상표']);
  assert.ok(plan.tables.every(item => item.columns.length >= 2 && item.source === '공고 실행계약서'));
  // 공고에 그 기준이 없으면 표를 만들지 않는다.
  assert.deepEqual(buildDocumentPlan({ rules: [] }).tables, []);
  // 표는 본문 문장이 아니라 구조로 받는다.
  assert.match(api, /const proposalTable = \{/);
  assert.match(api, /본문에 표를 그리지 말고 tables에 columns와 rows로 구조화해 넣는다/);
  assert.match(app, /function proposalTablesView\(\)/);
});

test('고객 화면에 내부 분할 진행률과 Master 용어를 보이지 않는다', () => {
  assert.doesNotMatch(app, /Master 생성 중|Master 생성 완료|마스터 설계 → 전체 작성/);
  assert.match(app, /busy: '설계안 생성 중', done: '설계안 생성 완료'/);
  assert.match(app, /설계안 승인 → 전체 계획서 완성/);
  // 진행률·분할 항목 목록은 이어쓰기 중일 때만 보인다.
  assert.match(app, /\$\{completed\.size \? `<details><summary>이어서 작성할 항목/);
  assert.match(app, /고객 화면에는 내부 분할 단위나 Master 용어를 보이지 않는다/);
});

test('생성 결과는 기존 버전·보관·게이트 흐름을 그대로 쓴다', () => {
  // V1 기록과 완성 상태는 기존 함수를 그대로 쓴다.
  assert.match(fullProposalFn, /recordProposalVersion\(\{ sections: state\.sections, label: 'V1 완성본'/);
  assert.match(fullProposalFn, /markProposalAssembled\(\)/);
  assert.match(fullProposalFn, /archiveCurrentProposal\('complete'\)/);
  // 실패하면 기존 계획서를 지우지 않는다.
  assert.match(fullProposalFn, /catch \(error\) \{ setState\(\{ busy: '', error: error\.message \}\); \}/);
  // 표도 보관 스냅샷에 함께 남는다.
  assert.match(app, /'engagement', 'proposalTables', 'preciseReview', 'submissionIncluded', 'currentVersionId'\]/);
});
