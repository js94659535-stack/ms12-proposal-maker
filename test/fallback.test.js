import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { localAnalyze, localDraft } from '../src/fallback.js';
import { draftReviewState, incompleteFailure, masterReviewState, mixedApplicationType, normalizeManualSources, onRequest, partContext, partReviewState, validateEngineResult, validateMasterResult, validatePartResult } from '../functions/api/proposal.js';
import { buildOfficialSummary, classifyAttachment, handleNoticeRequest, isBusinessNotice, mergeNoticeCandidates, splitSubprojects } from '../functions/api/notices.js';
import { boardListResponse, boardPostResponse, noticeRequest, officialFetcher, portalListResponse } from './fixtures/official-board.js';
import { buildPrintDocument } from '../src/export.js';
import { onRequest as handleArchiveRequest, syncNotices } from '../functions/api/archive.js';
// 전체 이용권 세션. 생성 API는 이용권을 서버에서 확인하므로 테스트도 실제와 같은 맥락을 넘긴다.
const FULL_ACCESS = { session: { user: { id: 'test-full', email: 'full@ms12.test', role: 'customer', status: 'active', plan: 'full' } } };

test('규칙 분석은 원문 근거를 보존한다', () => {
  const sourceText = '제출 마감은 2026년 9월 1일이다. 상담사 3명 이상을 필수 배치해야 한다. 평가 배점은 사업수행 50점이다.';
  const result = localAnalyze({ sourceText, projectType: '나라장터', title: '테스트 사업' });
  assert.ok(result.requirements.length >= 3);
  assert.ok(result.requirements.some(item => item.evidence.includes('상담사 3명')));
  assert.equal(result.mode, 'local');
});

test('로컬 초안은 확인되지 않은 기관 사실을 확인 필요로 둔다', () => {
  const analysis = localAnalyze({ sourceText: '제출 서류와 사업 운영 계획을 작성해야 한다.', projectType: '일반', title: '테스트' });
  const result = localDraft({ analysis, answers: [], organization: { capabilities: [{ name: '확인된 프로그램', status: '공개 확인' }] } });
  assert.ok(result.sections.length >= 6);
  assert.ok(result.sections.some(section => section.status === '확인 필요'));
});

test('확정 회사 정보만 있어도 로컬 완성 초안을 생성한다', () => {
  const analysis = localAnalyze({ sourceText: '집단상담 운영 계획과 결과보고서를 제출해야 한다.', projectType: '공공조달', title: '테스트' });
  const result = localDraft({ analysis, answers: [], organization: { confirmedFacts: [{ title: '운영 지역', content: '광주 지역 운영 가능', confirmedByUser: true }] } });
  assert.equal(result.sections.length, 10);
});

test('서버 API는 키가 없으면 외부 호출 전에 중단한다', async () => {
  const response = await onRequest({ data: FULL_ACCESS, env: {}, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' } }) });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /OPENAI_API_KEY/);
});

test('서버 API는 모델 환경변수가 없으면 외부 호출 전에 중단한다', async () => {
  const response = await onRequest({ data: FULL_ACCESS, env: { OPENAI_API_KEY: 'test-only' }, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' } }) });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /OPENAI_MODEL/);
});

test('서버 API는 POST와 application/json만 허용한다', async () => {
  const getResponse = await onRequest({ data: FULL_ACCESS, env: {}, request: new Request('https://example.test/api/proposal') });
  assert.equal(getResponse.status, 405);
  const mediaResponse = await onRequest({ data: FULL_ACCESS, env: {}, request: new Request('https://example.test/api/proposal', { method: 'POST', body: 'text' }) });
  assert.equal(mediaResponse.status, 415);
});

test('서버 API는 실제 본문 바이트와 원문 길이를 제한한다', async () => {
  const env = { OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'test-model' };
  const largeBody = JSON.stringify({ action: 'analyze', payload: { sourceText: '가'.repeat(300000) } });
  const bodyResponse = await onRequest({ data: FULL_ACCESS, env, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: largeBody }) });
  assert.equal(bodyResponse.status, 413);
  const longSource = JSON.stringify({ action: 'analyze', payload: { sourceText: 'a'.repeat(180001), organization: {} } });
  const sourceResponse = await onRequest({ data: FULL_ACCESS, env, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: longSource }) });
  assert.equal(sourceResponse.status, 400);
  assert.match(await sourceResponse.text(), /180,000/);
});

test('서버 함수에는 OpenAI 외부 호출이 한 곳뿐이고 재시도 루프나 민감 로그가 없다', () => {
  const source = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  assert.equal((source.match(/fetch\('https:\/\/api\.openai\.com\/v1\/responses'/g) || []).length, 1);
  assert.doesNotMatch(source, /\bconsole\.(?:log|info|debug|warn|error)\b/);
  // 'retry-after'는 OpenAI가 알려 주는 재시도 가능 시점(응답 헤더 이름)일 뿐 재시도 로직이 아니다.
  assert.doesNotMatch(source.replaceAll('retry-after', 'rate-limit-reset-hint'), /\bretry\b|while\s*\(/i);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /timeoutMs:\s*300_000/);
  // 핵심제안서만 쪽수에 따라 상한이 달라지고, 진단서는 고정 상한, 나머지 작업은 작업별 고정값을 그대로 쓴다.
  assert.match(source, /max_output_tokens: body\.action === CORE_PROPOSAL_ACTION \? outputTokensFor\(body\.payload\.plan\.pages\)/);
  assert.match(source, /: body\.action === DIAGNOSIS_ACTION \? DIAGNOSIS_TOKENS : LIMITS\.outputTokens\[body\.action\]/);
  // master 설계는 한 번에 전체 구조를 반환하므로 draft와 같은 출력 상한을 쓴다.
  assert.match(source, /master:\s*12_000/);
  assert.match(source, /draftPart:\s*7_000/);
  assert.match(source, /body\.action === 'analyze' \? 'medium' : 'low'/);
});

test('모든 계획서는 마스터 설계와 신청서 항목별 분할 생성을 거쳐 완성한다', () => {
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const apiSource = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  // 설계는 background로 돌아간다. 시작하고 결과를 물어 가져오며 기다린 시간을 보여 준다.
  assert.match(appSource, /masterWithAI\(completePayload, seconds =>/);
  const masterApi = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
  // 설계는 두 걸음(masterDesign → masterPlan)으로 나눠 부르고, 끊긴 걸음만 배경으로 다시 돌린다.
  assert.match(masterApi, /const design = await designStep\('masterDesign', payload, settings\);/);
  assert.match(masterApi, /const plan = await designStep\('masterPlan', \{ \.\.\.payload, design \}, settings\);/);
  assert.match(masterApi, /const step = await request\(action, payload, \{ jobId \}\);/);
  assert.match(masterApi, /if \(!step\?\.pending\) return step;/);
  assert.match(appSource, /id="generate-parts"/);
  assert.match(appSource, /draftPartWithAI/);
  assert.match(appSource, /id="assemble-proposal"/);
  assert.match(appSource, /설계안 승인 → 전체 계획서 완성/);
  assert.match(apiSource, /페이지 수·문서 길이로 나누지 않는다/);
  assert.match(apiSource, /sectionPlan: \{ type: 'array', minItems: 2, items:/);
  assert.doesNotMatch(apiSource, /sectionPlan: \{ type: 'array', minItems: 2, maxItems:/);
});

test('계획서는 자유입력과 「전체 작성」 버튼 하나로 만든다', () => {
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  // 항목별 생성 버튼은 없앤다.
  assert.doesNotMatch(appSource, /data-generate-part|이 항목만 AI 생성|이 항목만 다시 생성/);
  assert.match(appSource, /async function generateProposalParts\(\) \{/);
  // 사용자는 한 번만 누르고, 남은 항목이 있으면 이어서 작성한다.
  // 버튼은 하나다. 설계 승인 전에도 눌리며, 누르면 설계 확인 화면으로 이어진다.
  // 신규 계획서는 승인된 설계안으로 한 번에 만들고, 이어쓰기 경로만 분할 버튼을 쓴다.
  assert.ok(appSource.includes(`id="generate-proposal" ${'${'}guard(generationPermission().allowed ? '' : generationPermission().reason, 'design')}>AI와 함께 전체 계획서 작성`));
  assert.ok(appSource.includes(`id="generate-parts" ${'${'}guard(generationPermission().allowed ? '' : generationPermission().reason, 'design')}>남은 내용 이어서 작성`));
  assert.ok(appSource.includes('const completed = new Set(staged.completedGroupIds || []);'));
  // 자유입력은 선택이며 이번 사업에만 저장한다.
  assert.match(appSource, /id="proposal-freeform"/);
  assert.match(appSource, /state\.projectNarrative = event\.target\.value/);
  assert.ok(appSource.includes("narrative: String(state.projectNarrative || '').slice(0, 4000)"));
  // 질문 미답변으로 생성을 막지 않는다.
  assert.doesNotMatch(appSource, /waitingForAnswers/);
  assert.doesNotMatch(appSource, /pendingRequiredAnswers/);
  // 모두 끝나면 사용자가 다시 누르지 않아도 하나로 합친다.
  assert.ok(appSource.includes('if (completed.size === all.length) assembleProposal(startedAt);'));
  // 실패 시에는 완료분을 보존하고 자동 재시도하지 않는다.
  // 오류로 멈춰도 끝난 묶음은 그대로 두고 실패한 묶음부터 다시 시작한다.
  assert.match(appSource, /작성이 중단되었습니다\. 완료된 \$\{completed\.size\}묶음은 그대로 있으며/);
});

test('마스터 설계는 10개 호환 항목을 중복 없이 포함하고 분할 결과는 요청 항목과 일치한다', () => {
  const keys = ['necessity', 'purpose', 'goals', 'target', 'programs', 'schedule', 'roles', 'budget', 'indicators', 'outcomes'];
  const masterLogic = { problem: '공식 문제', coreStrategy: '핵심 전략', outputOutcomeMeasurementLinks: [{}], evaluationResponsePlan: [{}], claimEvidencePlan: [{}] };
  const master = { sponsorIntent: { evidence: ['공식 근거'] }, masterLogic, evidenceMap: [{ id: 'e1' }], qualityCheck: { noticeAlignment: true, singleSubprogramOnly: true, logicConsistency: true }, sectionPlan: [{ id: 'a', title: '배경과 목적', sectionKeys: keys.slice(0, 4) }, { id: 'b', title: '수행계획', sectionKeys: keys.slice(4, 8) }, { id: 'c', title: '성과', sectionKeys: keys.slice(8) }] };
  assert.equal(validateMasterResult(master), '');
  assert.match(validateMasterResult({ ...master, sectionPlan: [{ id: 'a', title: '중복', sectionKeys: [...keys.slice(0, 9), 'necessity'] }, { id: 'b', title: '누락', sectionKeys: ['outcomes'] }] }), /한 번씩/);
  const continuityCheck = { masterAligned: true, applicationStructureAligned: true, terminologyConsistent: true, numericConsistent: true, noUnnecessaryRepetition: true, issues: [] };
  const continuitySummary = { fixedTerms: [], fixedValues: [], establishedDecisions: [], nextHandoff: [] };
  const partSections = ['necessity', 'purpose'].map(id => ({ id, title: id, content: `${id} 항목의 본문으로 충분한 길이의 내용을 담고 있다.`, citations: [], status: '검토 필요' }));
  assert.equal(validatePartResult({ sections: partSections, continuityCheck, continuitySummary }, { sectionKeys: ['necessity', 'purpose'] }), '');
  assert.match(validatePartResult({ sections: partSections.slice(0, 1), continuityCheck, continuitySummary }, { sectionKeys: ['necessity', 'purpose'] }), /일치하지 않습니다/);
  // 자기점검 실패는 더 이상 분할 결과를 폐기하지 않는다(경고로 분리).
  assert.equal(validatePartResult({ sections: partSections, continuityCheck: { ...continuityCheck, numericConsistent: false, issues: ['인원 불일치'] }, continuitySummary }, { sectionKeys: ['necessity', 'purpose'] }), '');
  const variablePlan = keys.map((key, index) => ({ id: `g${index}`, title: key, sectionKeys: [key] }));
  assert.equal(validateMasterResult({ ...master, sectionPlan: variablePlan }), '');
});

test('분할 생성은 구조적 실패만 막고 자기점검·충돌은 경고로 남긴다', () => {
  const group = { id: 'g1', title: '문제 의식과 목적', sectionKeys: ['necessity', 'purpose'] };
  const payload = {
    group,
    projectBlueprint: {
      applicationType: '재학대예방형', otherApplicationTypes: ['아동보호형'],
      officialConflicts: [{ field: '인원', officialValue: '70명 이상', userValue: '15명' }],
      items: [{ section: '핵심 대상', status: '확정', value: '학대피해아동 15명' }]
    }
  };
  const body = value => `${value} 이 항목은 공고 근거와 확정값을 그대로 유지하며 충분한 길이의 본문을 담고 있다.`;
  const continuitySummary = { fixedTerms: [], fixedValues: [], establishedDecisions: [], nextHandoff: [] };
  const ok = {
    sections: [
      { id: 'necessity', title: '사업 필요성', content: body('학대피해아동 가정의 재학대 위험을 낮춘다.'), citations: ['e1'], status: '검토 필요' },
      { id: 'purpose', title: '목적', content: body('가족기능 회복과 재학대 예방을 목적으로 한다.'), citations: ['e1'], status: '검토 필요' }
    ],
    continuityCheck: { masterAligned: true, applicationStructureAligned: true, terminologyConsistent: true, numericConsistent: false, noUnnecessaryRepetition: true, issues: ['공고 70명 이상과 설계 15명이 충돌한다'] },
    continuitySummary
  };

  // A. 항목은 정확한데 자기점검 하나가 false → 결과 유지 + NEEDS_REVIEW
  assert.equal(validatePartResult(ok, group, payload), '');
  const stateA = partReviewState(ok, payload);
  assert.equal(stateA.partStatus, 'NEEDS_REVIEW');
  assert.deepEqual(stateA.warnings.filter(item => item.check === 'numericConsistent').map(item => item.label), ['수치 일관성']);
  assert.deepEqual(stateA.issues, ['공고 70명 이상과 설계 15명이 충돌한다']);

  // B. 요청 항목 누락 → 구조적 실패
  assert.match(validatePartResult({ ...ok, sections: [ok.sections[0]] }, group, payload), /요청한 신청서 항목과 일치하지 않습니다/);
  // C. 요청하지 않은 항목 추가 → 구조적 실패
  assert.match(validatePartResult({ ...ok, sections: [...ok.sections, { id: 'budget', title: '예산', content: body('예산'), citations: [], status: '확인 필요' }] }, group, payload), /요청한 신청서 항목과 일치하지 않습니다/);
  // 본문이 비어 있으면 구조적 실패
  assert.match(validatePartResult({ ...ok, sections: [{ ...ok.sections[0], content: '짧음' }, ok.sections[1]] }, group, payload), /본문이 비어 있는/);

  // D. 공식 충돌이 있어도 결과를 폐기하지 않는다.
  assert.equal(validatePartResult(ok, group, payload), '');
  assert.equal(partReviewState(ok, payload).officialConflicts[0].type, 'OFFICIAL_REQUIREMENT_CONFLICT');

  // E. 다른 신청유형이 설계 문장으로 섞이면 결정적 실패. 근거·충돌 설명은 혼입이 아니다.
  const mixed = { ...ok, sections: [{ ...ok.sections[0], content: body('요보호아동을 발굴해 지역사회 보호를 제공한다.') }, ok.sections[1]] };
  assert.match(validatePartResult(mixed, group, payload), /섞였습니다/);
  const explained = { ...ok, sections: [{ ...ok.sections[0], content: body('공고에는 아동보호형도 있으나 본 사업은 해당하지 않는다.') }, ok.sections[1]] };
  assert.equal(validatePartResult(explained, group, payload), '');

  // officialConflicts로 이미 구조화된 공고 기준값은 일반 경고에서 중복 생성하지 않는다.
  const bothValues = { ...ok, sections: [{ ...ok.sections[0], content: `${ok.sections[0].content} 공고 기준은 70명 이상이고 현재 설계값은 15명이다.` }, ok.sections[1]] };
  const dedup = partReviewState(bothValues, payload);
  assert.equal(dedup.warnings.filter(item => item.check === 'confirmedValue').length, 0, JSON.stringify(dedup.warnings));
  assert.equal(dedup.officialConflicts.length, 1);
  // 충돌로 등록되지 않은 다른 수치는 계속 경고한다.
  const strayValue = { ...ok, sections: [{ ...ok.sections[0], content: `${ok.sections[0].content} 참여아동은 40명으로 한다.` }, ok.sections[1]] };
  assert.equal(partReviewState(strayValue, payload).warnings.filter(item => item.check === 'confirmedValue').length, 1);

  // 경고도 충돌도 없으면 PART_READY
  const clean = partReviewState({ ...ok, continuityCheck: { masterAligned: true, applicationStructureAligned: true, terminologyConsistent: true, numericConsistent: true, noUnnecessaryRepetition: true, issues: [] } }, { group, projectBlueprint: { applicationType: '재학대예방형', otherApplicationTypes: ['아동보호형'], items: [] } });
  assert.equal(clean.partStatus, 'PART_READY');
  assert.equal(clean.warnings.length, 0);
});

test('분할 생성은 공고 원문 전체 대신 master가 확정한 경량 문맥만 다시 쓴다', () => {
  const payload = {
    sourceText: '공'.repeat(70_000),
    selectedSubprogram: '재학대예방형 사업',
    group: { id: 'g1', title: '문제 의식과 목적', sectionKeys: ['necessity', 'purpose'] },
    master: {
      masterLogic: {
        problem: '학대피해아동 가족기능 약화', causes: '보호자 양육부담', coreStrategy: '가정방문 사례관리',
        baselineValues: [{ item: '핵심 참여자', value: '공고 70명 이상 / 설계 15명 충돌로 [확인 필요]' }],
        outputOutcomeMeasurementLinks: [{ output: '가정방문 기록', outcome: '재학대 위험 감소' }, { output: '예산 집행', outcome: '예산 적정성' }],
        evaluationResponsePlan: [{ criterion: '사업 필요성', plan: '지역 문제 근거 제시' }, { criterion: '예산 적정성', plan: '단가 근거 제시' }],
        claimEvidencePlan: [{ claim: '문제 규모', evidence: '공고문: 재학대 예방이 필요하다', location: '공고문 3쪽' }, { claim: '예산 한도', evidence: '1개소당 140,000,000원', location: '공고문 7쪽' }]
      },
      evidenceMap: [{ id: 'e1', claim: '대상', evidence: '학대피해아동 대상', location: '공고문' }, { id: 'e2', claim: '예산', evidence: '예산 한도', location: '공고문' }],
      sponsorIntent: { coreProblem: '재학대 위험', expectedChange: '가족기능 회복', selectionLogic: ['가정 단위 개입'] }
    },
    organization: {
      confirmedFacts: [{ title: '기관명', content: '수완지역아동센터' }, { title: '운영 시설', content: '상담실 보유' }],
      needsVerification: [{ title: '전문인력' }],
      projectSpecificValues: [{ label: '인원', thisProjectValue: '학대피해아동 15명, 보호자 15명' }],
      pastProjectRecords: [{ year: '2024', records: [{ title: '운영 회기', content: '주 2회 20회기 운영' }, { title: '총사업비', content: '16,100,000원' }] }]
    },
    projectBlueprint: {
      applicationType: '재학대예방형', otherApplicationTypes: ['아동보호형'],
      officialConflicts: [{ field: '인원', officialValue: '70명 이상', userValue: '15명' }],
      items: [{ section: '핵심 대상', status: '확정', value: '학대피해아동' }, { section: '예산 구조', status: '확인 필요', value: '[확인 필요]' }, { section: '세부 목표', status: '설계안', proposedOnly: true }],
      unresolvedSections: [{ sectionKey: 'budget', from: ['예산 구조'] }], rule: '규칙'
    }
  };
  const context = partContext(payload);
  const text = JSON.stringify(context);
  // 공고 원문 전체와 과거 실적 전체는 다시 넣지 않는다.
  assert.ok(text.length < 6_000, `경량 문맥이 너무 큽니다: ${text.length}`);
  assert.doesNotMatch(text, /공공공공/);
  assert.doesNotMatch(text, /20회기/);
  assert.doesNotMatch(text, /16,100,000/);
  // 반드시 유지할 기준은 남긴다.
  assert.equal(context.fixedBasis.applicationType, '재학대예방형');
  assert.deepEqual(context.fixedBasis.excludedApplicationTypes, ['아동보호형']);
  assert.equal(context.fixedBasis.baselineValues.length, 1);
  assert.ok(context.officialEvidence.length > 0 && context.officialEvidence.every(item => item.evidence && item.location));
  assert.equal(context.officialConflicts.length, 1);
  assert.equal(context.thisProject.confirmedValues.length, 1);
  assert.deepEqual(context.thisProject.unresolved, ['예산 구조']);
  assert.deepEqual(context.thisProject.proposedOnly, ['세부 목표']);
  assert.equal(context.thisProject.projectSpecificValues[0].thisProjectValue, '학대피해아동 15명, 보호자 15명');
  assert.ok(context.applicantConfirmed.length > 0);
  assert.deepEqual(context.applicantNeedsVerification, ['전문인력']);
  // 현재 항목과 관련된 근거만 골라 담는다.
  const budgetContext = partContext({ ...payload, group: { id: 'g2', title: '예산', sectionKeys: ['budget'] } });
  assert.ok(budgetContext.fixedBasis.claimEvidencePlan.some(item => /예산/.test(JSON.stringify(item))));
});

test('마스터 단계에서 자기점검 실패는 경고이고 다른 신청유형 설계만 막는다', () => {
  const keys = ['necessity', 'purpose', 'goals', 'target', 'programs', 'schedule', 'roles', 'budget', 'indicators', 'outcomes'];
  const masterLogic = { problem: '학대피해아동 가족기능 약화', coreStrategy: '가정방문 사례관리', baselineValues: { 대상: '학대피해아동 15명', 회기: '아동 12회기' }, outputOutcomeMeasurementLinks: [{}], evaluationResponsePlan: [{}], claimEvidencePlan: [{ claim: '대상', evidence: '신청유형 재학대예방형 / 아동보호형 - 요보호아동' }] };
  const master = {
    sponsorIntent: { evidence: ['공고 원문에 재학대예방형과 아동보호형이 함께 적혀 있다'] },
    projectDesign: { projectName: '재학대예방형 가족기능 강화사업', target: '학대피해아동과 보호자' },
    masterLogic, evidenceMap: [{ id: 'e1' }],
    qualityCheck: { noticeAlignment: false, singleSubprogramOnly: false, logicConsistency: true, budgetConsistency: true, measurableOutcomes: true },
    sectionPlan: [{ id: 'a', title: '배경과 목적', sectionKeys: keys.slice(0, 5) }, { id: 'b', title: '수행과 성과', sectionKeys: keys.slice(5) }]
  };
  const payload = { projectBlueprint: { applicationType: '재학대예방형', otherApplicationTypes: ['아동보호형'], officialConflicts: [{ field: '인원', officialValue: '70명 이상', userValue: '15명' }] } };
  // 자기점검 false 2건이 있어도 설계를 폐기하지 않는다. 근거 인용에 다른 유형명이 있는 것도 혼입이 아니다.
  assert.equal(validateMasterResult(master, payload), '');
  const state = masterReviewState(master, payload);
  assert.equal(state.masterStatus, 'NEEDS_REVIEW');
  assert.equal(state.submissionReady, false);
  assert.deepEqual(state.warnings.map(item => item.check), ['noticeAlignment', 'singleSubprogramOnly']);
  assert.equal(state.officialConflicts[0].type, 'OFFICIAL_REQUIREMENT_CONFLICT');

  // 설계값(대상·프로그램·기준값)이 다른 유형으로 채워진 경우만 구조적 실패다.
  const wrong = { ...master, projectDesign: { projectName: '아동보호형 사업', target: '요보호아동' }, masterLogic: { ...masterLogic, baselineValues: { 대상: '아동보호형 요보호아동 30명' } } };
  assert.match(validateMasterResult(wrong, payload), /다른 유형/);
  assert.match(mixedApplicationType(wrong, payload), /아동보호형/);
  assert.equal(mixedApplicationType(master, payload), '');

  // 경고도 충돌도 없으면 MASTER_READY지만 제출 가능으로 올리지 않는다.
  const clean = masterReviewState({ ...master, qualityCheck: { noticeAlignment: true, singleSubprogramOnly: true, logicConsistency: true, budgetConsistency: true, measurableOutcomes: true } }, { projectBlueprint: { applicationType: '재학대예방형', otherApplicationTypes: ['아동보호형'] } });
  assert.equal(clean.masterStatus, 'MASTER_READY');
  assert.equal(clean.submissionReady, false);
});

test('마스터 설계는 문제부터 성과측정까지 논리사슬과 평가·근거 계획을 고정한다', () => {
  const apiSource = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(apiSource, /outputOutcomeMeasurementLinks/);
  assert.match(apiSource, /evaluationResponsePlan/);
  assert.match(apiSource, /claimEvidencePlan/);
  assert.match(apiSource, /baselineValues/);
  assert.match(apiSource, /문제→원인→대상→전략→실행→산출→변화→성과측정/);
  assert.match(apiSource, /\[확인 필요\]/);
  assert.match(appSource, /선정 논리와 평가기준 대응/);
  assert.match(appSource, /주장별 공식 자료 근거/);
});

test('분할 생성은 이전 원고와 마스터를 기준으로 신청서 항목을 일관되게 이어 쓴다', () => {
  const apiSource = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /previousSections/);
  assert.doesNotMatch(apiSource, /<PREVIOUS_COMPLETED_SECTIONS>/);
  assert.match(apiSource, /<CONTINUITY_SUMMARY>/);
  assert.match(apiSource, /<RELEVANT_PREVIOUS_SECTIONS>/);
  assert.match(apiSource, /누가·언제·어디서·누구에게·무엇을·몇 회·어떻게/);
  assert.match(apiSource, /noUnnecessaryRepetition/);
  assert.match(apiSource, /numericConsistent/);
  assert.match(apiSource, /applicationStructureAligned/);
  assert.match(apiSource, /\[확인 필요\]를 유지/);
});

test('장문 분할 생성은 전체 이전 원문 대신 압축 요약과 의존 항목만 전달한다', () => {
  const apiSource = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /SECTION_DEPENDENCIES/);
  assert.match(appSource, /content: String\(section\.content \|\| ''\)\.slice\(0, 3000\)/);
  assert.match(appSource, /continuitySummary: state\.stagedGeneration\.continuitySummary/);
  assert.match(apiSource, /continuitySummary\) > 20_000/);
  assert.match(apiSource, /relevantSections\) > 40_000/);
  assert.match(apiSource, /원문 문단을 복사하지 말고 항목당 짧은 문장/);
});

test('완성 단계는 공식 목차 순서로 조립하고 누락·중복·마스터 기준값을 검증한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function assembleProposal(startedAt = Date.now())');
  const end = source.indexOf('async function archiveCurrentProposal', start);
  const assemblySource = source.slice(start, end);
  assert.match(assemblySource, /groups\.flatMap/);
  assert.match(assemblySource, /assemblyStructuralIssues/);
  assert.match(assemblySource, /공식 목차의 계획서 항목이 누락되거나 중복/);
  assert.match(assemblySource, /validateFinalAssembly/);
  assert.match(assemblySource, /마스터 기준값/);
  assert.match(assemblySource, /존재하지 않는 공식 근거 ID/);
  assert.match(assemblySource, /분할 원문 보존·새 사실 추가 없음/);
  assert.match(assemblySource, /replace\(\/\\r\\n\?\/g, '\\n'\)\.trim\(\)/);
  assert.doesNotMatch(assemblySource, /fetch\(|draftWithAI|masterWithAI/);
  assert.match(source, /assemblyCheckView\(\)/);
  assert.match(source, /archiveCurrentProposal\('complete'\)/);
  assert.match(source, /'stagedGeneration', 'assemblyCheck', 'manualSources'/);
});

test('자료보관함은 동일 공고를 중복 저장하지 않고 내용이 바뀐 공고만 갱신한다', async () => {
  const rows = new Map();
  const db = { prepare(sql) { return { values: [], bind(...values) { this.values = values; return this; }, async first() { return rows.get(this.values[0]) || null; }, async run() { const [sourceKey, source, sourceLabel, listSn, dstbBsnsCode, title, deadline, applicationPeriod, summary, eligibility, supportDetails, supportLimit, contentHash] = this.values; rows.set(sourceKey, { sourceKey, source, sourceLabel, listSn, dstbBsnsCode, title, deadline, applicationPeriod, summary, eligibility, supportDetails, supportLimit, content_hash: contentHash }); return { success: true }; } }; } };
  const notice = { source: 'central', sourceLabel: '중앙회', listSn: '1', dstbBsnsCode: '2026001', title: '아동 지원사업', deadline: '2026-12-31', summary: '공식 요약' };
  assert.deepEqual(await syncNotices(db, [notice]), { inserted: 1, updated: 0, unchanged: 0 });
  assert.deepEqual(await syncNotices(db, [notice]), { inserted: 0, updated: 0, unchanged: 1 });
  assert.deepEqual(await syncNotices(db, [{ ...notice, summary: '변경된 공식 요약' }]), { inserted: 0, updated: 1, unchanged: 0 });
});

test('자료보관함 API는 D1 미연결 상태와 전용 저장·검색 흐름을 명확히 처리한다', async () => {
  const response = await handleArchiveRequest({ data: FULL_ACCESS, env: {}, request: new Request('https://example.test/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'searchNotices' }) }) });
  assert.equal(response.status, 503);
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const config = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(appSource, /id="find-matching-notices"/);
  assert.match(appSource, /id="list-archived-proposals"/);
  assert.match(appSource, /data-open-archived-proposal/);
  assert.match(appSource, /archiveCurrentProposal\('master'\)/);
  assert.match(appSource, /archiveCurrentProposal\('parts'\)/);
  assert.match(appSource, /archiveCurrentProposal\('complete'\)/);
  assert.match(appSource, /archiveCurrentProposal\('review'\)/);
  assert.match(config, /binding = "ARCHIVE_DB"/);
});

test('공고 보관함 검색은 날짜·기관·핵심어와 상세 원문·세부사업 및 연결 계획서를 지원한다', () => {
  const serverSource = fs.readFileSync(new URL('../functions/api/archive.js', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(serverSource, /notice_json LIKE \?/);
  assert.match(serverSource, /linked_proposal_count/);
  assert.match(serverSource, /linked_proposal_id/);
  assert.match(serverSource, /deadline >= \?/);
  assert.match(serverSource, /deadline <= \?/);
  assert.match(appSource, /loadRecentArchive\(\)/);
  assert.match(appSource, /data-archive-view/);
  assert.match(appSource, /data-archive-use/);
  assert.match(appSource, /data-archive-step/);
});

test('자료보관함 복구키로 새 브라우저에서도 동일한 D1 소유 자료에 접근한다', () => {
  const clientSource = fs.readFileSync(new URL('../src/archive.js', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const serverSource = fs.readFileSync(new URL('../functions/api/archive.js', import.meta.url), 'utf8');
  assert.match(clientSource, /export function getArchiveRecoveryKey/);
  assert.match(clientSource, /export function useArchiveRecoveryKey/);
  assert.match(clientSource, /localStorage\.setItem\(ARCHIVE_KEY_NAME, normalized\)/);
  assert.match(appSource, /id="copy-archive-key"/);
  assert.match(appSource, /id="apply-archive-key"/);
  assert.match(appSource, /비밀번호 관리도구/);
  assert.match(serverSource, /crypto\.subtle\.digest\('SHA-256'/);
  assert.doesNotMatch(serverSource, /INSERT[^;]+archive.key/is);
});

test('앱은 공고문 입력에서 시작하고 사용자 확정 회사 정보만 생성에 사용한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /step: 0,/);
  assert.match(source, /return buildApplicantOrganization\(selectedApplicant\(\), state\.projectValues\)/);
  const applicantSource = fs.readFileSync(new URL('../src/applicants.js', import.meta.url), 'utf8');
  assert.match(applicantSource, /confirmedFacts: confirmedItems\(snapshot\)/);
  assert.doesNotMatch(source, /profileForPrompt|organizationProfile/);
  assert.match(source, /delete saved\.manualCompanyFacts/);
  assert.match(source, /addEventListener\('click', confirmCompanyFactDraft\)/);
});

test('공모사업 목록은 중앙회와 광주지회 진행 중 공고만 조회한다', async () => {
  const calls = [];
  // 포털은 진행 중 공고가 없는 정상 상태로 두고 누리집 공지사항 수집만 본다.
  const fetcher = officialFetcher({
    onCall: url => calls.push(url),
    portalList: () => portalListResponse([]),
    boardList: params => {
      const branch = params.pBhfCode === '001' ? '중앙' : '광주';
      return boardListResponse([
        { listSn: params.pBhfCode === '001' ? '111' : '222', sj: `${branch} 2027년 배분사업 공모`, rgsde: '2099-07-01' },
        { listSn: '900', sj: `${branch} 직원 채용 공고`, rgsde: '2099-07-02' },
        { listSn: '901', sj: `${branch} 2026년 공모사업 선정결과 발표`, rgsde: '2099-07-03' }
      ], 343);
    },
    boardPost: () => boardPostResponse({
      sj: '2027년 배분사업 공모', rgsde: '2099-07-01', files: ['신청서.hwp'],
      cn: '<p>사업목적: 아동 지원</p><p>신청대상: 사회복지기관</p><p>지원내용: 상담 프로그램 운영</p><p>접수기간 : 2099. 8. 1. ~ 2099. 8. 14.</p>'
    })
  });
  const response = await handleNoticeRequest(noticeRequest({ action: 'list' }), fetcher);
  const result = await response.json();
  // 채용·선정결과는 공모가 아니므로 상세를 읽지 않는다. 포털 목록 2회 + 게시판 목록 2회 + 상세 2회.
  assert.equal(calls.length, 6);
  assert.equal(calls.filter(url => url.includes('/bbs/selectPostList.do')).length, 2);
  assert.equal(calls.filter(url => url.includes('/bbs/selectPostInfo.do')).length, 2);
  assert.deepEqual(result.notices.map(item => item.sourceLabel).sort(), ['광주지회', '중앙회']);
  assert.deepEqual(result.notices.map(item => item.deadline), ['2099-08-14', '2099-08-14']);
  assert.ok(result.notices.every(item => item.summary.length <= 300));
  assert.ok(result.notices.every(item => item.summarySource === 'official-detail'));
  assert.deepEqual(result.notices.map(item => item.eligibility), ['사회복지기관', '사회복지기관']);
  // 원문 주소를 채워 둔다. 보관 공고에서 공식 페이지로 되돌아갈 수 있어야 한다.
  assert.match(result.notices[0].sourceUrl, /\/bbs\/1000\/initPostDetail\.do\?listSn=\d+$/);
  assert.deepEqual(result.sources.map(source => source.status), ['ok', 'ok', 'ok', 'ok']);
  assert.equal(result.syncable, true);
});

test('공고 가져오기가 성공하면 공고 확인 단계로 자동 이동한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  // 가져온 공고가 있을 때만 확인 단계로 넘어간다. 0건이면 이 화면에 결과만 알린다.
  assert.match(source, /const patch = \{ busy: '', noticeResults: notices, noticeSources: result\.sources \|\| \[\]/);
  assert.match(source, /if \(notices\.length\) navigateToStep\(1, patch\); else setState\(patch\);/);
});

test('모든 AI 작업은 단일 타이머로 경과시간을 표시하고 background 시작시간을 복구한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const message of ['계획서 전체 검증 작업을 시작하는 중', '선택한 문제의 수정안만 작성하는 중', '사업계획서를 심사자 관점에서 검토하는 중', '기관 요구사항과 평가 기준을 분석하는 중', '선택한 항목을 근거 범위 안에서 재작성하는 중', '공고문을 분석하고 마스터 설계를 작성하는 중', '전체 계획서 작성 중']) assert.match(source, new RegExp(`setAiBusy\\('${message}`));
  assert.match(source, /data-ai-elapsed data-started-at/);
  assert.match(source, /data-ai-elapsed[^>]+style="display:block">경과시간 00초/);
  assert.match(source, /경과시간 00초/);
  assert.match(source, /startedAt: busyStartedAt \|\| Date\.now\(\)/);
  assert.match(source, /aiTaskLabel\(\(Date\.now\(\) - startedAt\) \/ 1000\)/);
  assert.match(source, /clearInterval\(busyTimer\)/);
  assert.match(source, /setInterval\(update, 1000\)/);
});

test('공식 상세 원문만 사용해 300자 이내 핵심 요약을 만든다', () => {
  const summary = buildOfficialSummary({
    applicationPeriod: '2026-08-01 ~ 2026-08-14', performancePeriod: '2027-01-01 ~ 2027-12-31', supportLimit: '기관당 3천만원',
    overview: '사업목적: 취약계층 아동의 가족기능 강화\n신청대상: 광주 소재 사회복지기관\n지원내용: 가족상담 및 회복 프로그램\n연락처: 000-0000\n첨부파일: 신청서.hwp'
  });
  assert.equal(summary.eligibility, '광주 소재 사회복지기관');
  assert.equal(summary.supportDetails, '가족상담 및 회복 프로그램');
  assert.equal(summary.applicationPeriod, '2026-08-01 ~ 2026-08-14');
  assert.equal(summary.supportLimit, '기관당 3천만원');
  assert.ok(summary.summary.length <= 300);
  assert.doesNotMatch(summary.summary, /연락처|첨부파일/);
});

test('번호가 붙은 공식 개요에서 실제 지원내용과 신청유형을 요약한다', () => {
  const summary = buildOfficialSummary({
    applicationPeriod: '2026-07-20 ~ 2026-08-14', performancePeriod: '2027-01 ~ 2027-12', supportLimit: '1개소당 140,000,000원',
    overview: '1. 주요사업내용\n○ 홈케어플래너 파견과 가족 맞춤형 서비스 제공\n○ 전문심리치료기관 연계 심리정서 회복 프로그램\n\n2. 사업기간 : 2027. 1. ~ 2027. 12.\n\n3. 신청유형\n○ 재학대예방형: 아동보호전문기관\n○ 아동보호형: 사회복지관 등\n\n4. 예산규모 : 총 21억원 이내'
  });
  assert.match(summary.supportDetails, /홈케어플래너 파견/);
  assert.match(summary.eligibility, /아동보호전문기관/);
  assert.match(summary.summary, /홈케어플래너 파견/);
  assert.ok(summary.summary.length <= 300);
});

test('목록 카드는 없는 상세 항목에 확인 필요 문구를 반복하지 않는다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /item\.eligibility \|\| '공식 상세 확인 필요'/);
  assert.doesNotMatch(source, /item\.supportDetails \|\| '공식 상세 확인 필요'/);
  assert.match(source, /item\.eligibility \? `<small[^>]*>/);
  assert.match(source, /item\.supportDetails \? `<small[^>]*>/);
});

test('일부 상세 조회 실패에도 목록을 유지하고 상세 확인 안내를 표시한다', async () => {
  // 출처별로 동시 요청을 세 개까지만 보낸다. 공식 사이트 한 곳에 몰아치지 않기 위해서다.
  const activeDetails = new Map();
  let maximumDetails = 0;
  const today = new Date().toISOString().slice(0, 10);
  const fetcher = officialFetcher({
    portalList: () => portalListResponse([]),
    boardList: params => boardListResponse([
      { listSn: `${params.pBhfCode}01`, sj: `${params.pBhfCode} 배분사업 공모 1`, rgsde: today },
      { listSn: `${params.pBhfCode}02`, sj: `${params.pBhfCode} 배분사업 공모 2`, rgsde: today }
    ]),
    boardPost: async (params, url) => {
      const host = url.host;
      activeDetails.set(host, (activeDetails.get(host) || 0) + 1);
      maximumDetails = Math.max(maximumDetails, activeDetails.get(host));
      await new Promise(resolve => setTimeout(resolve, 5));
      activeDetails.set(host, activeDetails.get(host) - 1);
      if (params.listSn === '00101') throw new Error('detail failed');
      return boardPostResponse({ sj: '진행 공고', rgsde: today, cn: '<p>지원내용: 공식 지원 내용</p><p>접수기간 : 2099. 12. 31.</p>' });
    }
  });
  const response = await handleNoticeRequest(noticeRequest({ action: 'list' }), fetcher);
  const result = await response.json();
  assert.equal(result.notices.length, 4);
  // 상세를 못 읽은 글도 목록에서 사라지지 않는다. 확인 필요로만 남는다.
  const broken = result.notices.find(item => item.references[0].listSn === '00101');
  assert.equal(broken.summary, '상세 공고문 확인 필요');
  assert.equal(broken.deadlineKnown, false);
  assert.equal(broken.stage, '마감일 확인 필요');
  assert.ok(maximumDetails <= 3);
});

test('복수 공고의 번호가 붙은 세부사업 3개를 서로 섞지 않고 분리한다', () => {
  const overview = `안내 공통문\n1. 취약계층 아동·청소년 가족기능 강화사업\n가족 상담과 회복 지원\n2. 경계선 지능 아동 사회적응력 향상사업\n느린학습자 사회성 지원\n3. 저소득 아동·청소년 환경개선 지원사업\n주거 환경 개선 지원`;
  const result = splitSubprojects(overview);
  assert.deepEqual(result.map(item => item.title), ['취약계층 아동·청소년 가족기능 강화사업', '경계선 지능 아동 사회적응력 향상사업', '저소득 아동·청소년 환경개선 지원사업']);
  assert.match(result[1].content, /느린학습자 사회성 지원/);
  assert.doesNotMatch(result[1].content, /가족 상담|주거 환경/);
});

test('단일 사업과 일반 번호 목차는 세부사업 선택 대상으로 만들지 않는다', () => {
  assert.deepEqual(splitSubprojects('1. 단일 아동 지원사업\n아동 지원 내용'), []);
  assert.deepEqual(splitSubprojects('1. 사업명: 신청사업\n2. 사업개념: 자유주제\n3. 사업내용: 복지 지원'), []);
});

test('채용·행사·설문·교육 신청 공지는 공고 목록에서 제외한다', () => {
  assert.equal(isBusinessNotice('계약직 직원 채용 공고'), false);
  assert.equal(isBusinessNotice('30주년 감사음악회 참석 신청 안내'), false);
  assert.equal(isBusinessNotice('복지기관 만족도 설문 안내'), false);
  assert.equal(isBusinessNotice('담당자 교육 참가신청'), false);
  assert.equal(isBusinessNotice('2027년 전국단위 신청사업 공고'), true);
});

test('선택한 공모사업 상세와 첨부 메타데이터를 반환한다', async () => {
  const fetcher = async url => {
    assert.match(url, /mobileMainBsnsDetail\.do\?dstbBsnsCode=20260700600081&appnDocNo=/);
    return new Response(`<table><tr><th>사업명</th><td>광주 지원사업 공고</td></tr><tr><th>사업수행기간</th><td>2027-01-01 ~ 2027-12-31</td></tr><tr><th>공모기간</th><td>2026-07-27 09:00 ~ 2026-08-14 18:00</td></tr><tr><th>지원한도(원)</th><td>30,000,000</td></tr><tr><th>개요</th><td>광주 지역 복지기관 지원</td></tr></table><a href="#" onclick="fn_fileDownload('01','20260700600081','1','1')">공고문.hwp</a>`, { status: 200 });
  };
  const response = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'detail', references: [{ source: 'gwangju', listSn: '20260700600081', kind: 'proposal' }], supplementalReferences: [] }) }), fetcher);
  const result = await response.json();
  assert.equal(result.notice.title, '광주 지원사업 공고');
  assert.match(result.notice.parts[0].bodyHtml, /사업수행기간/);
  assert.match(result.notice.parts[0].bodyHtml, /광주 지역 복지기관 지원/);
  assert.deepEqual(result.notice.parts.map(part => part.sourceLabel), ['광주지회']);
  assert.deepEqual(result.notice.attachments, [{ name: '공고문.hwp', fileType: 'HWP', fileSeCode: '01', dstbBsnsCode: '20260700600081', sn: '1', fileSn: '1', sourceLabel: '광주지회' }]);
});

test('공식 첨부파일을 공개 토큰으로 중계하고 원본 이름을 유지한다', async () => {
  const attachment = { name: '공식 신청서.HWP', fileSeCode: '01', dstbBsnsCode: '20260700600081', sn: '1', fileSn: '2' };
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('mobileMainBsnsDetail.do')) return new Response(`<a onclick="fn_fileDownload('01','20260700600081','1','2')">공식 신청서.HWP</a>`, { headers: { 'Set-Cookie': 'JSESSIONID=test; Path=/' } });
    if (url.endsWith('/file/downloadToken.do')) return new Response(JSON.stringify({ token: 'public-token' }), { headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/file/acceptingBusiness.fileDownloadNew.do')) return new Response(new Uint8Array([72, 87, 80]), { headers: { 'Content-Type': 'application/octet-stream' } });
    throw new Error('unexpected request');
  };
  const response = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'downloadAttachment', attachment }) }), fetcher);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /%EA%B3%B5%EC%8B%9D%20%EC%8B%A0%EC%B2%AD%EC%84%9C\.HWP/);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [72, 87, 80]);
  assert.equal(calls.length, 3);
  assert.match(calls[1].options.body, /type=APPLY/);
  assert.match(calls[2].options.body, /token=public-token/);
});

test('공식 첨부파일 형식을 구분한다', () => {
  assert.deepEqual(['a.pdf', 'a.docx', 'a.txt', 'a.hwp', 'a.hwpx', 'a.zip', 'a.exe'].map(classifyAttachment), ['PDF', 'DOCX', 'TXT', 'HWP', 'HWPX', 'ZIP', 'UNSUPPORTED']);
});

test('동일 공고는 통합하고 출처를 모두 표시한다', async () => {
  const items = [
    { source: 'central', sourceLabel: '중앙회', listSn: '101', title: '[공고] 2027년 지원사업', registeredAt: '2026-08-01' },
    { source: 'gwangju', sourceLabel: '광주지회', listSn: '202', title: '2027년 지원사업', registeredAt: '2026-08-01' }
  ];
  const detail = reference => ({ ...items.find(item => item.source === reference.source), bodyHtml: '<p>신청기간 8월 1일, 지원대상 사회복지기관 공통 내용</p>', attachments: [{ name: '공고.pdf', serverName: 'same.pdf', path: '/same/' }] });
  const result = await mergeNoticeCandidates(items, detail);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceLabel, '중앙회·광주지회');
  assert.equal(result[0].references.length, 2);
});

test('지역 조건이나 첨부가 다르면 별도 공고로 유지하고 광주 공고에 중앙회 보충 참조를 연결한다', async () => {
  const items = [
    { source: 'central', sourceLabel: '중앙회', listSn: '101', title: '2027년 지원사업', registeredAt: '2026-08-01' },
    { source: 'gwangju', sourceLabel: '광주지회', listSn: '202', title: '2027년 지원사업', registeredAt: '2026-08-01' }
  ];
  const detail = reference => reference.source === 'central'
    ? { ...items[0], bodyHtml: '<p>지원대상 전국 사회복지기관</p>', attachments: [{ name: '중앙.pdf', serverName: 'c.pdf', path: '/c/' }] }
    : { ...items[1], bodyHtml: '<p>지원대상 광주 소재 사회복지기관</p>', attachments: [{ name: '광주.pdf', serverName: 'g.pdf', path: '/g/' }] };
  const result = await mergeNoticeCandidates(items, detail);
  assert.equal(result.length, 2);
  const gwangju = result.find(item => item.sourceLabel === '광주지회');
  assert.deepEqual(gwangju.supplementalReferences, [{ source: 'central', listSn: '101' }]);
});

test('조건이 같아도 본문이 완전히 같지 않으면 별도 공고로 유지한다', async () => {
  const items = [
    { source: 'central', sourceLabel: '중앙회', listSn: '111', title: '2027년 동일 제목 사업', registeredAt: '2026-08-01' },
    { source: 'gwangju', sourceLabel: '광주지회', listSn: '222', title: '[공고] 2027년 동일 제목 사업', registeredAt: '2026-08-01' }
  ];
  const detail = reference => ({ ...items.find(item => item.source === reference.source), bodyHtml: reference.source === 'central' ? '<p>지원대상 복지기관. 공통 본문.</p>' : '<p>지원대상 복지기관. 공통 본문. 광주 안내 문장.</p>', attachments: [] });
  const result = await mergeNoticeCandidates(items, detail);
  assert.equal(result.length, 2);
});

test('공식 상세 URL의 누락 공고를 추가하고 동일 listSn은 중복 처리한다', async () => {
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://gwangju.chest.or.kr/bbs/selectPostInfo.do');
    assert.match(options.body, /listSn=303/);
    return new Response(JSON.stringify({ dataInfo: { postInfo: { sj: '광주 누락 공고', rgsde: '2026-08-02', cn: '<p>광주 대상</p>' }, fileListInfo: [] } }), { status: 200 });
  };
  const imported = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'importUrl', url: 'https://gwangju.chest.or.kr/bbs/1000/initPostDetail.do?listSn=303', existingNotices: [] }) }), fetcher);
  const importedResult = await imported.json();
  assert.equal(importedResult.duplicate, false);
  assert.equal(importedResult.notice.sourceLabel, '광주지회');

  const duplicate = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'importUrl', url: 'https://gwangju.chest.or.kr/bbs/1000/initPostDetail.do?listSn=303', existingNotices: [importedResult.notice] }) }), () => { throw new Error('중복 공고는 다시 조회하지 않아야 함'); });
  assert.equal((await duplicate.json()).duplicate, true);
});

test('고정된 두 공식 도메인 이외의 누락 공고 URL은 거부한다', async () => {
  const response = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'importUrl', url: 'https://example.com/bbs/1000/initPostDetail.do?listSn=1', existingNotices: [] }) }), () => { throw new Error('호출되지 않아야 함'); });
  assert.equal(response.status, 400);
});

test('공고 선택 결과는 기존 제목과 원문 입력으로 전달된다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /state\.project = \{ \.\.\.state\.project, type: 'chest', title,/);
  assert.match(source, /state\.sourceText = `\$\{title\}/);
  assert.match(source, /fetchNoticeDetail\(selected\)/);
  assert.match(source, /\$\{part\.sourceLabel\} 우선 조건/);
  assert.match(source, /\$\{part\.sourceLabel\} 보충 자료/);
  assert.match(source, /중앙회 공식 사이트/);
  assert.match(source, /광주지회 공식 사이트/);
  assert.match(source, /누락 공고 가져오기/);
  assert.match(source, /importNoticeUrl\(url, state\.noticeResults\)/);
  assert.match(source, /state\.project\.type = 'chest'/);
  assert.match(source, /data-remove-notice/);
  assert.match(source, /removeOfficialNotice/);
  assert.match(source, /data-notice-check/);
  assert.match(source, /removeSelectedNotices/);
  assert.match(source, /notice\.subprojects\?\.length > 1/);
  assert.match(source, /data-select-subproject/);
  assert.match(source, /applyNoticeSelection\(pending\.notice, subproject\)/);
  assert.match(source, /navigateToStep\(2/);
  assert.match(source, /개요:\\n\$\{subproject\.content\}/);
  assert.match(source, /id="selected-notice-detail"/);
  assert.match(source, /detailText: bodyText/);
  assert.match(source, /scrollIntoView\(\{ behavior: 'smooth'/);
  assert.match(source, /선택한 공고 상세/);
  assert.match(source, /data-view-notice/);
  assert.match(source, /data-notice-panel="summary"/);
  assert.match(source, /data-notice-panel="overview"/);
  assert.match(source, /slice\(0, 200\)/);
  assert.match(source, /notice-card-preview/);
  assert.match(source, /padding:7px 11px;font-size:12px/);
  assert.match(source, /panel\.style\.display = 'none'/);
  assert.match(source, /content\.style\.display = willOpen \? 'block' : 'none'/);
  assert.match(source, /계획서 작성/);
  assert.match(source, /아직 계획서 작성 대상으로 선택하지 않았습니다/);
  assert.match(source, /선택 완료 · 다음 단계/);
});

test('공고 개별·다중 삭제는 쓰레기통으로 이동하고 복원·영구 삭제할 수 있다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /noticeTrash: \[\]/);
  assert.match(source, /noticeTrash: \[\.\.\.state\.noticeTrash, \{ \.\.\.removed/);
  assert.match(source, /선택한 공고 \$\{selected\.size\}건을 쓰레기통으로 이동/);
  assert.match(source, /data-restore-notice/);
  assert.match(source, /function restoreNotice/);
  assert.match(source, /data-delete-notice-forever/);
  assert.match(source, /function deleteNoticeForever/);
});

test('한국어 인쇄 문서에 계획서 10개 항목의 실제 내용을 모두 포함한다', () => {
  const titles = ['사업 필요성', '사업 목적', '사업 목표', '지원 대상', '사업 내용', '추진 일정', '수행 인력', '예산 계획', '성과지표', '기대효과'];
  const html = buildPrintDocument({ title: '한글 검토 계획서' }, titles.map((title, index) => ({ title, content: `${title} 본문 ${index + 1}`, status: '검토 필요' })));
  titles.forEach(title => assert.match(html, new RegExp(`${title}.*${title} 본문`, 's')));
  assert.equal((html.match(/<section>/g) || []).length, 10);
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<meta charset="UTF-8">/);
  assert.match(html, /"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif/);
  assert.match(html, /@page \{ size: A4 portrait/);
  assert.match(html, /break-inside: avoid-page/);
  assert.match(html, /button, nav, aside, details, summary/);
});

test('DOCX는 공식 양식이 아닌 검토용으로 표시한다', () => {
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const exportSource = fs.readFileSync(new URL('../src/export.js', import.meta.url), 'utf8');
  assert.match(appSource, /검토용 DOCX/);
  assert.match(appSource, /공식 신청서 양식이 아닌 검토본/);
  // 기본은 검토용이고, 서식대로 받은 판은 이름을 달리해 앞서 받은 파일을 덮어쓰지 않는다.
  assert.match(exportSource, /suffix = '검토용'/);
  assert.match(exportSource, /_\$\{suffix\}\.docx/);
  assert.match(appSource, /suffix: '서식대로'/);
});

test('PDF 버튼은 브라우저 인쇄 저장 방식으로 표시한다', () => {
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const exportSource = fs.readFileSync(new URL('../src/export.js', import.meta.url), 'utf8');
  assert.match(appSource, /PDF 인쇄·저장/);
  assert.match(exportSource, /document\.fonts\?\.ready/);
  assert.match(exportSource, /printWindow\.print\(\)/);
  assert.doesNotMatch(exportSource, /jspdf|html2canvas|pdf\.html/);
});

test('HWP 안내와 공고문 추출 상태를 명확히 표시한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /공식 한글 양식 파일/);
  assert.match(source, /한글 프로그램에서 PDF로 저장한 뒤 다시 업로드/);
  assert.match(source, /공고문 반영 초안/);
  assert.match(source, /안내 페이지 기반 임시 초안/);
  assert.match(source, /공고문 추출 실패/);
  assert.match(source, /\['PDF', 'DOCX', 'TXT'\]/);
});

test('핵심 사업계획 엔진 결과는 근거·단일 세부사업·질문 수를 검증한다', () => {
  const result = {
    sponsorIntent: { evidence: ['공식 공고 근거'] },
    projectDesign: { projectName: '아동 회복 지원사업' },
    sections: Array.from({ length: 10 }, (_, index) => ({ id: `s-${index + 1}`, title: `${index + 1}. 항목`, content: '공식 근거와 연결된 설계 내용', citations: ['e-1'], status: '검토 필요' })),
    missingInformation: ['실제 참여 가능 인원은 몇 명입니까?'],
    evidenceMap: [{ id: 'e-1', claim: '지원 대상', evidence: '공식 원문', location: '공고문' }],
    qualityCheck: { noticeAlignment: true, singleSubprogramOnly: true, logicConsistency: true, budgetConsistency: true, measurableOutcomes: true }
  };
  assert.equal(validateEngineResult(result), '');
  assert.match(validateEngineResult({ ...result, missingInformation: Array(6).fill('질문') }), /최대 5개/);
  assert.match(validateEngineResult({ ...result, sections: result.sections.map((section, index) => index ? section : { ...section, content: '짧음' }) }), /본문이 비어 있는/);
  // 요청한 신청유형이 전혀 없고 다른 유형으로만 작성된 경우는 구조적 실패다.
  const wrongType = { ...result, sections: result.sections.map(section => ({ ...section, content: '아동보호형 요보호아동을 대상으로 하는 설계 내용' })) };
  assert.match(validateEngineResult(wrongType, { projectBlueprint: { applicationType: '재학대예방형', otherApplicationTypes: ['아동보호형'] } }), /다른 유형/);
  assert.equal(validateEngineResult(result, { projectBlueprint: { applicationType: '재학대예방형', otherApplicationTypes: ['아동보호형'] } }), '');
});

test('응답이 잘린 경우와 형식 오류를 구분한다', () => {
  // 끝까지 생성되지 않은 응답은 잘림 사유를 그대로 알린다.
  const truncated = incompleteFailure({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } });
  assert.equal(truncated.failureStage, 'output-incomplete');
  assert.equal(truncated.reason, 'max_output_tokens');
  assert.match(truncated.error, /최대 출력 길이에서 끊겼습니다/);
  assert.match(truncated.error, /자동 재시도하지 않았습니다/);
  const filtered = incompleteFailure({ status: 'incomplete', incomplete_details: { reason: 'content_filter' } });
  assert.equal(filtered.reason, 'content_filter');
  assert.equal(incompleteFailure({ status: 'incomplete' }).reason, 'unknown');
  // 정상 완료된 응답은 잘림으로 보지 않는다.
  assert.equal(incompleteFailure({ status: 'completed' }), null);
  assert.equal(incompleteFailure({}), null);
  // 응답 본문·원문을 오류에 담지 않는다.
  assert.deepEqual(Object.keys(truncated).sort(), ['error', 'failureStage', 'reason']);
  const source = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  assert.match(source, /const incomplete = incompleteFailure\(raw\);/);
  assert.match(source, /failureStage: 'output-parse'/);
});

test('초안 단계에서는 [확인 필요]와 자기점검 실패로 초안을 폐기하지 않는다', () => {
  const base = {
    sponsorIntent: { evidence: ['공식 공고 근거'] },
    projectDesign: { projectName: '아동 회복 지원사업' },
    sections: Array.from({ length: 10 }, (_, index) => ({ id: `s-${index + 1}`, title: `${index + 1}. 항목`, content: '공식 근거와 연결된 설계 내용', citations: ['e-1'], status: '검토 필요' })),
    missingInformation: ['실제 참여 가능 인원은 몇 명입니까?'],
    evidenceMap: [{ id: 'e-1', claim: '지원 대상', evidence: '공식 원문', location: '공고문' }],
    qualityCheck: { noticeAlignment: true, singleSubprogramOnly: false, logicConsistency: true, budgetConsistency: true, measurableOutcomes: true }
  };
  const withOpen = { ...base, sections: base.sections.map((section, index) => index ? section : { ...section, content: `${section.content} 총 사업비는 [확인 필요]로 남긴다.` }) };
  // 초안 생성 실패가 아니다.
  assert.equal(validateEngineResult(withOpen), '');
  const state = draftReviewState(withOpen);
  assert.equal(state.draftStatus, 'NEEDS_REVIEW');
  assert.equal(state.submissionReady, false);
  assert.equal(state.unresolvedItems.length, 1);
  assert.equal(state.unresolvedItems[0].marks, 1);
  assert.deepEqual(state.warnings.map(item => item.check), ['singleSubprogramOnly']);

  // 설계도에서 미확정인 항목은 AI가 '확인 필요'로 표시하지 않아도 같은 기준으로 집계한다.
  const withBlueprint = draftReviewState(withOpen, { projectBlueprint: { unresolvedSections: [{ sectionKey: 'goals', from: ['성과목표'] }] } });
  const goals = withBlueprint.unresolvedItems.find(item => item.sectionId === 's-3');
  assert.ok(goals, JSON.stringify(withBlueprint.unresolvedItems));
  assert.deepEqual(goals.fromBlueprint, ['성과목표']);
  assert.equal(withBlueprint.unresolvedItems.length, 2);
  assert.equal(withBlueprint.draftStatus, 'NEEDS_REVIEW');

  // 공고 기준 충돌만 있어도 제출 준비 완료로 올리지 않는다.
  const conflicted = draftReviewState({ ...base, qualityCheck: { ...base.qualityCheck, singleSubprogramOnly: true } }, { projectBlueprint: { officialConflicts: [{ field: '인원', officialValue: '70명 이상', userValue: '15명' }] } });
  assert.equal(conflicted.draftStatus, 'NEEDS_REVIEW');
  assert.equal(conflicted.submissionReady, false);
  assert.equal(conflicted.officialConflicts[0].type, 'OFFICIAL_REQUIREMENT_CONFLICT');

  // 경고도 미확정도 없으면 NEEDS_REVIEW가 아니지만 제출 가능으로 표시하지 않는다.
  const clean = draftReviewState({ ...base, qualityCheck: { ...base.qualityCheck, singleSubprogramOnly: true } });
  assert.equal(clean.draftStatus, 'DRAFT_READY');
  assert.equal(clean.submissionReady, false);
  assert.equal(clean.warnings.length, 0);
});

test('AI 실패 시 가짜 로컬 완성본을 만들지 않고 정밀 설계 불가 상태를 표시한다', () => {
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const serverSource = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /localDraft/);
  assert.match(appSource, /state\.sections = \[\]/);
  assert.match(appSource, /AI 정밀 사업설계를 실행할 수 없음/);
  assert.match(appSource, /missingInformation = .*slice\(0, 5\)/);
  assert.match(appSource, /selectedSubprogram/);
  assert.match(serverSource, /minItems: 3, maxItems: 5/);
  assert.match(serverSource, /목표값·측정도구·시기·담당/);
  assert.match(serverSource, /sections\.citations에는 evidenceMap의 id만 사용/);
});

test('직접 추가 자료는 출처별 구조와 추출 상태를 보존한다', () => {
  const sources = normalizeManualSources([
    { id: 'pdf-1', fileName: '공고문.pdf', sourceType: '공고 공문', extractedText: '공식 공고문 본문', extractionStatus: 'success', extractionError: '' },
    { id: 'docx-1', fileName: '신청서.docx', sourceType: '공모신청서', extractedText: '작성 질문과 요구사항', extractionStatus: 'success', extractionError: '' },
    { id: 'hwp-1', fileName: '사업계획서.hwp', sourceType: '사업계획서 서식', extractedText: '', extractionStatus: 'unsupported', extractionError: 'PDF 변환 필요' }
  ]);
  assert.equal(sources.length, 3);
  assert.deepEqual(Object.keys(sources[0]), ['id', 'fileName', 'sourceType', 'extractedText', 'extractionStatus', 'extractionError']);
  assert.equal(sources[1].sourceType, '공모신청서');
  assert.equal(sources[2].fileName, '사업계획서.hwp');
  assert.equal(sources[2].extractionStatus, 'unsupported');
});

test('직접 자료 UI는 다중 추가·유형 변경·삭제·미리보기를 제공한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /accept="\.pdf,\.docx,\.txt,\.hwp,\.hwpx" multiple/);
  assert.match(source, /data-manual-source-type/);
  assert.match(source, /data-remove-manual-source/);
  assert.match(source, /텍스트 미리보기 없음/);
  // 보내기 전에 서식 원문을 규격 요약으로 줄인다. 자른 사실은 화면에 적는다.
  assert.match(source, /const trimmed = trimManualSources\(state\.manualSources, currentFormSpec\(\)\);/);
  assert.match(source, /manualSources: trimmed\.sources\.map/);
  assert.match(source, /function trimNoticeView\(\) \{/);
  assert.match(source, /extractionStatus === 'success'/);
});

test('생성 API는 직접 자료 우선순위와 충돌을 출처별로 처리한다', () => {
  const source = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  assert.match(source, /<MANUAL_SOURCES>/);
  assert.match(source, /공모신청서·사업계획서 서식의 질문과 작성항목/);
  assert.match(source, /파일명과 sourceType을 evidenceMap\.location에 보존/);
  assert.match(source, /각 출처를 evidenceMap에 모두 기록하고 missingInformation 질문에 포함/);
  assert.match(source, /선택된 세부사업 하나만/);
});

test('주요 작업 화면은 브라우저 이탈 없는 10단계 앱 내부 이동 기록을 사용한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /const NAVIGATION_LIMIT = 10/);
  assert.match(source, /sessionStorage\.getItem\(NAVIGATION_KEY\)/);
  assert.match(source, /sessionStorage\.setItem\(NAVIGATION_KEY/);
  assert.match(source, /backStack: validLocations/);
  assert.match(source, /forwardStack: validLocations/);
  assert.match(source, /return stack\.slice\(-NAVIGATION_LIMIT\)/);
  assert.match(source, /navigationHistory\.forwardStack = \[\]/);
  assert.match(source, /if \(!sameLocation\(stack\.at\(-1\), location\)\)/);
  assert.doesNotMatch(source, /window\.history\.(?:back|forward|go)/);
});

test('뒤로·홈·앞으로 버튼은 모든 6단계 공통 셸에 표시되고 작성 상태를 삭제하지 않는다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /aria-label="앱 작업 화면 이동"/);
  assert.match(source, /← 뒤로/);
  assert.match(source, /⌂ 홈/);
  assert.match(source, /앞으로 →/);
  assert.match(source, /document\.querySelector\('#workflow-back'\)/);
  // ⌂ 홈은 작업 화면이 아니라 홈 대시보드로 이동한다.
  assert.match(source, /querySelector\('#workflow-home'\)\?\.addEventListener\('click', \(\) => setState\(\{ activeTool: 'home'/);
  assert.match(source, /document\.querySelector\('#workflow-forward'\)/);
  assert.doesNotMatch(source, /function navigateToStep[\s\S]*?structuredClone\(state\)/);
  assert.match(source, /class="workflow-header"/);
  assert.match(source, /id="business-type"/);
  assert.match(source, /class="workflow-steps"/);
  assert.match(source, /aria-current="step"/);
});

test('사업 유형과 6단계 작업 탭은 sticky 상단 내비게이션에 배치된다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<aside class="sidebar">/);
  assert.match(source, /<option value="\$\{id\}"/);
  assert.match(source, /document\.querySelector\('#business-type'\)/);
  assert.match(styles, /\.workflow-header\{position:sticky;top:0/);
  assert.match(styles, /\.workflow-steps\{[^}]*overflow-x:auto/);
});

test('완료 체크는 방문 순서가 아니라 단계별 필수 데이터로 판단한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /function isStepComplete\(index\)/);
  assert.match(source, /state\.noticeResults\.length \|\| state\.sourceText\.trim\(\)\.length >= 30/);
  assert.match(source, /state\.selectedNotice/);
  assert.match(source, /state\.sections\.length === 10/);
  assert.doesNotMatch(source, /i < state\.step \? '✓'/);
  assert.doesNotMatch(source, /<div class="type-grid">\$\{TYPES\.map/);
  assert.match(source, /class="history-button"/);
  assert.match(source, /const STEPS = \['공고 준비', '공고 분석', '신청기관 준비', '사업 설계', '계획서 작성', '검토·제출'\]/);
});

test('사용자 자유입력은 경량 문맥에 실리되 근거 순위 아래에 둔다', () => {
  const apiSource = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  const context = partContext({
    group: { id: 'g1', title: '사업 필요성', sectionKeys: ['necessity'] },
    master: { masterLogic: {}, sponsorIntent: {} },
    organization: {},
    narrative: '토요일 오전에 운영하고 보호자 상담을 함께 넣어 주세요.',
    answers: [{ question: '운영 요일은?', answer: '토요일 오전' }]
  });
  assert.match(context.userNarrative, /토요일 오전/);
  assert.equal(context.userAnswers.length, 1);
  // 길이는 제한하고, 우선순위 규칙을 프롬프트에 명시한다.
  assert.ok(partContext({ narrative: 'x'.repeat(9000) }).userNarrative.length <= 4000);
  assert.match(apiSource, /근거 순위는 공식자료 → 이번 사업 확정값 → 기관 확인정보 → 사용자 입력 → 제안 순이며/);
  assert.match(apiSource, /사용자 입력만으로 사실·수치를 확정하지 않는다/);
});

test('확정값 반영은 한 번의 finalize 호출로 관련 문단만 고친다', () => {
  const apiSource = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  // 새 작업은 허용 목록과 출력 상한에 함께 등록한다.
  assert.match(apiSource, /const ACTIONS = \['analyze', 'master', 'draftPart', 'draft', 'fullProposal', 'preciseReview', 'patchSections', 'rewrite', 'finalize', CORE_PROPOSAL_ACTION, DIAGNOSIS_ACTION];/);
  assert.match(apiSource, /rewrite: 4_000, finalize: 9_000/);
  assert.match(apiSource, /name: 'proposal_finalize', schema: FINALIZE_SCHEMA/);
  // 계획서를 새로 쓰지 않고 값이 필요한 문단만 돌려준다.
  assert.match(apiSource, /계획서를 새로 쓰지 마라\. 값이 필요한 문단만 sections에 담아 최대 8개까지 반환하고/);
  // 큰 요청은 엣지에서 끊긴다. 확정값이 들어갈 문단만 보낸다.
  assert.match(appSource, /const candidates = state\.sections\.filter\(section => targetIds\.has\(section\.id\)\);/);
  assert.match(appSource, /function revisionScopeText\(issue\)/);
  assert.match(apiSource, /제출서류 준비 상태는 계획서 본문에 넣지 말고 notApplied에/);
  assert.match(apiSource, /근거 우선순위는 1\) 공식 공고·요강·평가기준 2\) 사용자 확정값 3\) 신청기관 확인정보 4\) 현재 계획서 문장 5\) 제안 순이다/);
  // 화면 입력칸을 자동으로 모으고, 개별 확정 버튼을 필수로 요구하지 않는다.
  assert.match(appSource, /function collectDecisionValues\(\)/);
  assert.ok(appSource.includes("document.querySelectorAll('[data-decision-input]')"));
  assert.match(appSource, /async function buildFinalVersion\(\)/);
  assert.ok(appSource.includes('const before = structuredClone(state.sections);'));
  // 실패하면 기존 계획서를 되돌리고 새 버전을 만들지 않는다.
  assert.match(appSource, /확정값 반영에 실패했습니다\. 기존 계획서는 그대로입니다\./);
  assert.match(appSource, /finalize: \{ busy: '확정값 반영 중', done: '확정값 반영 최종본 완료'/);
});
