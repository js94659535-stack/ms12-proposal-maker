import { analyzeWithAI, draftPartWithAI, draftWithAI, masterWithAI, rewriteWithAI } from './api.js';
import { extractFile, extractFiles } from './files.js';
import { localAnalyze } from './fallback.js';
import { exportDocx, exportPdf, printDocument } from './export.js';
import { fetchNoticeDetail, fetchNoticeList, importNoticeUrl, noticeBodyText } from './notices.js';
import { deleteArchivedApplicant, getArchivedProposal, getArchiveRecoveryKey, listArchivedApplicants, listArchivedProposals, saveArchivedApplicant, saveArchivedProposal, searchArchivedNotices, syncArchivedNotices, useArchiveRecoveryKey } from './archive.js';
import { ASOF_UNKNOWN, applySafeCandidates, applyUpdateCandidate, buildUpdateCandidates, extractApplicantCandidates } from './applicant-extract.js';
import { REFERENCE_TYPES, assessReferences, makeReference, projectContext, referenceNotices, referencePayload } from './reference-materials.js';
import { analyzeProposalStructure, buildStructuralRevision, reviewProposalStructure } from './proposal-structure.js';
import { applyRepairPlans, buildRepairPlans, repairPlanSummary } from './repair-plan.js';
import { analyzeNoticeStructure, buildSelectionLogic, noticeLogicSummary, selectionRequirements } from './notice-logic.js';
import { bundleSummary, expandBundle, mergeBundleStructures } from './notice-bundle.js';
import { matchApplicantToNotice } from './fit-matching.js';
import { buildBlueprint } from './project-blueprint.js';
import { BLUEPRINT_SECTION_MAP, UNRESOLVED_MARK, annotateDraftSections, checkDraftAgainstBlueprint, officialRequirementConflicts } from './blueprint-draft-check.js';
import { EXTERNAL_SOURCE, appendProposalVersion, applySectionRevision, buildCoachingHandoff, buildExternalWorkingCopy, coachingVerdict, compareCoachingRounds, findProposalVersion, handoffItemsForSection, proposalTextFromSections, proposalTextFromSnapshot, revisionInstruction, verifyLockedValues } from './coaching-handoff.js';
import { splitApplicantProfile } from './applicants.js';
import { ARCHIVE_PAGE_SIZES, ARCHIVE_STATUSES, archiveTableRows, shortDate } from './archive-table.js';
import { SAMPLE_MARK, SAMPLE_NOTE, SAMPLE_NOTICE, SAMPLE_NOTICE_KEY, SAMPLE_STAGES, SAMPLE_STAGE_BY_STEP, buildSampleProject } from './sample-project.js';
import { SAMPLE_REAL_COACHING } from './sample-coaching-run.js';
import { APPLICANT_AREAS, APPLICANT_STATUSES, CONFIRMED_STATUS, applicantAreaSummary, areaItems, areaTitle, itemsBySource, buildApplicantOrganization, compareNoticeWithApplicant, confirmedItems, findApplicant, makeApplicantItem, migrateCompanyFactsToApplicant, normalizeApplicant, planApplicantQuestions, upsertApplicant } from './applicants.js';

const TYPES = [
  ['chest', '사랑의열매', '복지·지원사업'], ['family', '가족센터', '가족지원사업'],
  ['edu', '학교·교육청', '교육기관'], ['g2b', '나라장터·학교장터', '공공조달'],
  ['general', '일반 창업·아이디어', '일반 사업']
];
// 업무 흐름 6단계. 라벨만 정리하고 단계 번호·연결 로직은 그대로 둔다.
const STEPS = ['공고 준비', '공고 분석', '신청기관 준비', '사업 설계', '계획서 작성', '검토·제출'];
// 홈 화면에 보여 주는 업무 흐름 6단계 요약(단계 번호는 작업 화면과 같다).
const ARCHIVE_WORK_STEPS = [
  { step: 0, label: '공고 준비' },
  { step: 1, label: '공고 분석' },
  { step: 2, label: '신청기관 연결' },
  { step: 3, label: '사업 설계' },
  { step: 4, label: '계획서 작성' },
  { step: 5, label: '검증·코칭' },
  { step: 5, label: '제출본 확인' }
];
const HOME_FLOW = [
  { no: '01', title: '공고 준비', desc: '공고 업로드 · 요구사항 확인', step: 0, covers: [0, 1], items: ['공고 조회·업로드', '선정 논리 구조화', '첨부 자료묶음 분석'] },
  { no: '02', title: '신청기관 준비', desc: '기관정보 · 실적 · 적합성', step: 2, covers: [2], items: ['확인된 기관정보 관리', '과거 실적 정리', '공고 적합성 매칭'] },
  { no: '03', title: '사업 설계', desc: '대상 · 프로그램 · 예산 · 성과', step: 3, covers: [3], items: ['신청유형 선택', '설계도 한 장 확정', '확인 필요 항목 입력'] },
  { no: '04', title: '계획서 작성', desc: '근거 기반 V1 작성', step: 4, covers: [4], items: ['마스터 설계', '항목별 초안 생성', '근거·인용 연결'] },
  { no: '05', title: '검토·수정', desc: 'AI 코칭 · V2 · 사용자 결정', step: 5, covers: [5], items: ['평가기준 검증', '수정계획 분류', '사용자 확정 반영'] },
  { no: '06', title: '제출·보관', desc: '최종본 · DOCX/PDF · 자료보관', step: 5, covers: [], items: ['제출 전 확인 목록', 'DOCX·PDF 출력', '자료보관함 저장'] }
];
const STEP_GUIDE = [
  { title: '공고 준비', icon: '①', desc: '공고를 가져오거나 공고문·양식을 올립니다.', items: ['기관 공고 조회', '공고문·신청서 업로드', '자료보관함 불러오기'] },
  { title: '공고 분석', icon: '②', desc: '선정 논리와 필수 요건을 원문 근거로 구조화합니다.', items: ['선정 논리 11항목', '첨부 자료묶음 분석', '평가·배점 확인'] },
  { title: '신청기관 준비', icon: '③', desc: '확인된 기관 정보만 이번 사업에 사용합니다.', items: ['기관 프로필 관리', '과거 실적 정리', '적합성 매칭'] },
  { title: '사업 설계', icon: '④', desc: '신청유형을 고르고 한 장의 설계도를 확정합니다.', items: ['신청유형 선택', '설계도 15항목', '확인 필요 입력'] },
  { title: '계획서 작성', icon: '⑤', desc: '설계도를 기준으로 초안을 만들고 근거를 연결합니다.', items: ['마스터 설계', '항목별 분할 생성', '근거·인용 유지'] },
  { title: '검토·제출', icon: '⑥', desc: '검증·수정 후 제출본을 만들고 보관합니다.', items: ['검증·코칭', '수정계획·버전 관리', 'DOCX·PDF 출력', '자료보관함 저장'] }
];
const SOURCE_TYPES = ['공고 공문', '세부 공고문', '공모신청서', '사업계획서 서식', '예산 편성 기준', '심사·평가기준', '기타 안내자료'];
const NAVIGATION_KEY = 'ms12_workflow_navigation_v1';
const NAVIGATION_LIMIT = 10;
const initial = {
  step: 0, activeTool: 'home', homeSeen: false, project: { type: 'g2b', title: '', issuer: '', deadline: '' }, sourceText: '', files: [],
  coaching: { title: '', text: '', validatedText: '', criteriaText: '', officialEvaluationProvided: false, sourceProposalId: '', sourceNoticeKey: '', seriesId: '', currentArchiveId: '', result: null, workItems: [], pendingJob: null, version: 0, references: [], referenceType: REFERENCE_TYPES[0], referenceDraft: '', referenceNameDraft: '' },
  applicants: [], selectedApplicantId: '', applicantEditingId: '', applicantNameDraft: '', applicantItemDrafts: {}, projectValues: [], projectValueDraft: { label: '', value: '', applicantItemId: '' }, applicantComparison: null, applicantResolvedQuestions: [], applicantDocDraft: '', applicantExtraction: null, coachingApplicantId: '',
  revisionPlan: null, draftReview: null, proposalVersions: [], coachingSelection: [], applicantSkipped: false, noticeLogic: null,
  analysis: null, sponsorIntent: null, projectDesign: null, missingInformation: [], evidenceMap: [], qualityCheck: null, designAnswers: {}, designUnavailable: false, stagedGeneration: { phase: 'idle', master: null, parts: [], completedGroupIds: [], continuitySummary: null }, assemblyCheck: null, archiveProposalId: '', archiveNotices: [], archiveProposals: [], archiveFilters: { institution: '', from: '', to: '', keyword: '' }, archiveTable: { query: '', sortKey: 'collectedAt', sortDir: 'desc', page: 1, pageSize: 20, selected: [], expandedKey: '', applicantPickerKey: '', filters: { collected: '', institution: '', field: '', status: '', applicant: '', deadline: '' } }, archiveNoticeLinks: {}, archiveHiddenNotices: [], sampleStage: '', sampleReturn: '', aiResult: null, archiveKeyDraft: '', manualSources: [], manualSourceType: SOURCE_TYPES[0], manualSourceName: '', manualSourceText: '', matches: [], answers: [], sections: [], reviewResult: null, reviewOriginalDraft: null, reviewFingerprint: '', reviewBusy: false, companyFacts: [], companyFactDraft: '', noticeResults: [], noticeTrash: [], selectedNoticeIndexes: [], noticePreview: null, pendingNoticeChoice: null, noticeUrlDraft: '', selectedNotice: null, busy: '', notice: '', error: '', aiMode: ''
};
let state = loadState();
let navigationHistory = loadNavigationHistory();
const app = document.querySelector('#app');
let busyStartedAt = 0;
let busyTimer = null;
let archiveLoaded = false;
let homeArchiveLoaded = false;
let coachingPollActive = false;
// 길게 누르기로 연 메뉴가 같은 동작의 click 때문에 바로 닫히지 않게 한다.
let archiveMenuOpenedAt = 0;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('ms12_project_v3') || '{}');
    // 이전 버전의 자유입력 회사 정보는 사용자 확인 기록이 없으므로 확정 정보로 승격하지 않는다.
    delete saved.manualCompanyFacts;
    const stagedGeneration = saved.stagedGeneration && typeof saved.stagedGeneration === 'object'
      ? { ...structuredClone(initial.stagedGeneration), ...saved.stagedGeneration, parts: Array.isArray(saved.stagedGeneration.parts) ? saved.stagedGeneration.parts : [], completedGroupIds: Array.isArray(saved.stagedGeneration.completedGroupIds) ? saved.stagedGeneration.completedGroupIds : [] }
      : structuredClone(initial.stagedGeneration);
    const restored = { ...structuredClone(initial), ...saved, coaching: { ...structuredClone(initial.coaching), ...(saved.coaching || {}) }, stagedGeneration, step: Math.max(0, Math.min(STEPS.length - 1, Number(saved.step) || 0)), companyFactDraft: '', archiveKeyDraft: '', noticeResults: [], archiveNotices: [], archiveProposals: [], selectedNoticeIndexes: [], noticePreview: null, pendingNoticeChoice: null, noticeUrlDraft: '', busy: '', error: '', applicantItemDrafts: {}, applicantNameDraft: '', projectValueDraft: { label: '', value: '', applicantItemId: '' }, applicantDocDraft: '', applicantExtraction: null, coachingSelection: [] };
    // 자료보관함 목록의 선택·펼침 상태는 다시 열 때 초기화하고, 기관 매칭·숨김 기록만 유지한다.
    restored.archiveTable = { ...structuredClone(initial.archiveTable), ...(saved.archiveTable || {}), filters: { ...structuredClone(initial.archiveTable.filters), ...((saved.archiveTable || {}).filters || {}) }, selected: [], expandedKey: '', applicantPickerKey: '', page: 1 };
    restored.archiveNoticeLinks = saved.archiveNoticeLinks && typeof saved.archiveNoticeLinks === 'object' ? saved.archiveNoticeLinks : {};
    restored.archiveHiddenNotices = Array.isArray(saved.archiveHiddenNotices) ? saved.archiveHiddenNotices : [];
    // [샘플] 보기는 임시 화면이므로 다시 열 때 내 작업 화면으로 돌아온다.
    if (restored.activeTool === 'sample') restored.activeTool = restored.sampleReturn || 'workflow';
    if (restored.activeTool !== 'sample') { restored.sampleStage = ''; restored.sampleReturn = ''; }
    restored.aiResult = null;
    // 이전 버전에서 저장된 화면 상태 때문에 새 홈이 가려지지 않게 한 번은 홈을 먼저 보여 준다. 작업 데이터는 그대로 둔다.
    if (!saved.homeSeen) { restored.activeTool = 'home'; restored.homeSeen = true; }
    return withMigratedApplicants(restored);
  }
  catch { return structuredClone(initial); }
}
// 이전 버전의 확정 회사 정보는 등록된 신청기관이 하나도 없을 때만 신청기관 한 곳으로 옮긴다.
function withMigratedApplicants(value) {
  const applicants = (Array.isArray(value.applicants) ? value.applicants : []).map(normalizeApplicant);
  if (!applicants.length && (value.companyFacts || []).some(fact => fact?.confirmedByUser === true)) applicants.push(migrateCompanyFactsToApplicant(value.companyFacts));
  const selectedApplicantId = applicants.some(item => item.id === value.selectedApplicantId) ? value.selectedApplicantId : '';
  return { ...value, applicants, selectedApplicantId, projectValues: Array.isArray(value.projectValues) ? value.projectValues : [] };
}
function saveState() {
  const safe = { ...state, companyFactDraft: '', archiveKeyDraft: '', noticeResults: [], archiveNotices: [], archiveProposals: [], noticeUrlDraft: '', busy: '', error: '', applicantItemDrafts: {}, applicantNameDraft: '', applicantComparison: null, applicantDocDraft: '', applicantExtraction: null, files: state.files.map(({ text, ...meta }) => meta) };
  // 참고자료처럼 큰 원문이 들어오면 브라우저 저장 한도를 넘을 수 있다. 저장 실패가 화면을 멈추지 않게 한다.
  try { localStorage.setItem('ms12_project_v3', JSON.stringify(safe)); }
  catch { console.warn('브라우저 자동 저장 용량을 초과해 이번 상태는 저장하지 못했습니다.'); }
}
function loadNavigationHistory() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(NAVIGATION_KEY) || '{}');
    return { backStack: validLocations(saved.backStack), forwardStack: validLocations(saved.forwardStack) };
  } catch { return { backStack: [], forwardStack: [] }; }
}
function validLocations(values) {
  return Array.isArray(values) ? values.filter(value => Number.isInteger(value?.step) && value.step >= 0 && value.step < STEPS.length).slice(-NAVIGATION_LIMIT) : [];
}
function currentLocation(step = state.step) {
  return { step, view: state.pendingNoticeChoice ? 'subprogram-selection' : 'workflow-step', selectedNoticeId: state.selectedNotice?.references?.[0]?.listSn || '', selectedSubprogramId: state.selectedNotice?.selectedSubproject || '' };
}
function sameLocation(left, right) {
  return left?.step === right?.step && left?.view === right?.view && left?.selectedNoticeId === right?.selectedNoticeId && left?.selectedSubprogramId === right?.selectedSubprogramId;
}
function limitedPush(stack, location) {
  if (!sameLocation(stack.at(-1), location)) stack.push(location);
  return stack.slice(-NAVIGATION_LIMIT);
}
function saveNavigationHistory() {
  try { sessionStorage.setItem(NAVIGATION_KEY, JSON.stringify(navigationHistory)); } catch { /* 현재 탭에서 저장할 수 없으면 메모리 기록만 유지한다. */ }
}
function applyWorkflowLocation(location, patch = {}) {
  state = { ...state, ...patch, step: location.step };
  saveState(); render();
}
function navigateToStep(step, patch = {}) {
  const target = currentLocation(Math.max(0, Math.min(STEPS.length - 1, Number(step))));
  const current = currentLocation();
  if (sameLocation(current, target)) return setState(patch);
  navigationHistory.backStack = limitedPush(navigationHistory.backStack, current);
  navigationHistory.forwardStack = [];
  saveNavigationHistory(); applyWorkflowLocation(target, patch);
}
function navigateBack() {
  const target = navigationHistory.backStack.pop();
  if (!target) return;
  navigationHistory.forwardStack = limitedPush(navigationHistory.forwardStack, currentLocation());
  saveNavigationHistory(); applyWorkflowLocation(target);
}
function navigateForward() {
  const target = navigationHistory.forwardStack.pop();
  if (!target) return;
  navigationHistory.backStack = limitedPush(navigationHistory.backStack, currentLocation());
  saveNavigationHistory(); applyWorkflowLocation(target);
}
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function nl(value = '') { return escapeHtml(value).replace(/\n/g, '<br>'); }
function setState(patch) {
  if (Object.hasOwn(patch, 'busy')) {
    if (!patch.busy) {
      const result = closeAiTask(patch);
      if (result) patch = { ...patch, aiResult: result };
      busyStartedAt = 0;
    }
  }
  state = { ...state, ...patch }; saveState(); render();
}
function setAiBusy(message, patch = {}, taskId = '') {
  busyStartedAt = Date.now();
  aiTask = taskId && AI_TASKS[taskId] ? { id: taskId, startedAt: busyStartedAt, location: aiTaskLocation() } : null;
  setState({ ...patch, busy: message, aiResult: null });
}
// AI·API 작업의 진행시간과 완료 후 결과 위치. 작업 로직은 그대로 두고 표시와 이동만 담당한다.
// step이 null이면 현재 화면 안에서 결과 영역으로만 이동한다. tool은 별도 화면(검증·코칭 등)을 뜻한다.
const AI_TASKS = {
  noticeList: { busy: '공고 목록 불러오는 중', done: '공고 목록 불러오기 완료', step: 1, anchor: '#result-logic', retry: 'fetch-notices' },
  noticeDetail: { busy: '공고 상세 불러오는 중', done: '공고 상세 불러오기 완료', step: 1, anchor: '#notice-preview' },
  noticeSelect: { busy: '공고 본문 분석 중', done: '공고 본문 분석 완료', step: 1, anchor: '#result-logic' },
  noticeImport: { busy: '누락 공고 확인 중', done: '누락 공고 확인 완료', step: 1, anchor: '#result-logic' },
  archiveSearch: { busy: '자료보관함 검색 중', done: '자료보관함 검색 완료', step: null, anchor: '#archive-box', retry: 'search-archive' },
  archiveMatch: { busy: '맞춤 공고 확인 중', done: '맞춤 공고 확인 완료', step: null, anchor: '#archive-box', retry: 'find-matching-notices' },
  archiveProposals: { busy: '저장한 계획서 불러오는 중', done: '저장한 계획서 불러오기 완료', step: null, anchor: '#archive-box', retry: 'list-archived-proposals' },
  analyze: { busy: '공고 구조 분석 중', done: '공고 분석 완료', step: 3, anchor: '#result-analysis', retry: 'analyze' },
  master: { busy: 'Master 생성 중', done: 'Master 생성 완료', step: 4, anchor: '#result-master', retry: 'generate-master' },
  parts: { busy: '계획서 분할 작성 중', done: '계획서 항목 작성 완료', step: 4, anchor: '#result-master', retry: 'generate-parts' },
  rewrite: { busy: '선택 항목 재작성 중', done: '선택 항목 재작성 완료', step: null, anchor: '#result-pipeline' },
  review: { busy: '심사 관점 검토 중', done: '심사 검토 완료', step: 5, anchor: '#result-draft-check', retry: 'proposal-review' },
  coaching: { busy: '검증·코칭 중', done: '검증 완료', tool: 'coaching', anchor: '#result-coaching', retry: 'start-coaching' },
  coachingRevision: { busy: '수정안 생성 중', done: '수정안 생성 완료', tool: 'coaching', anchor: '#result-repair' },
  coachingApply: { busy: '수정 반영 중', done: '수정본 생성 완료', tool: 'coaching', anchor: '#result-repair' },
  coachingLoad: { busy: '보관 계획서 불러오는 중', done: '보관 계획서 불러오기 완료', tool: 'coaching', anchor: '#result-coaching' },
  coachingFile: { busy: '계획서 파일 읽는 중', done: '계획서 파일 읽기 완료', tool: 'coaching', anchor: '#result-coaching' },
  applicantScan: { busy: '기관 정보 찾는 중', done: '기관 정보 확인 완료', step: null, anchor: '#result-analysis' },
  repairV2: { busy: '수정본 생성 중', done: '수정본 생성 완료', step: 4, anchor: '#result-pipeline' },
  assemble: { busy: '계획서 결합 중', done: '계획서 초안 작성 완료', step: 4, anchor: '#result-pipeline', retry: 'assemble-proposal' }
};
let aiTask = null;
let pendingAiMove = null;
function aiTaskLabel(seconds) {
  const value = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
function markAiDone(taskId, patch = {}) {
  aiTask = AI_TASKS[taskId] ? { id: taskId, startedAt: Date.now(), location: aiTaskLocation() } : null;
  setState({ ...patch, busy: '' });
}
function aiTaskLocation() {
  return `${state.activeTool}:${state.step}`;
}
// busy가 끝나는 순간을 한 곳에서 잡아 완료·실패를 만든다. 개별 작업 코드는 고치지 않는다.
function closeAiTask(patch) {
  const task = aiTask;
  aiTask = null;
  if (!task) return null;
  const config = AI_TASKS[task.id];
  if (!config) return null;
  const seconds = (Date.now() - task.startedAt) / 1000;
  const failed = Boolean(patch.error);
  const result = { id: task.id, kind: failed ? 'fail' : 'done', label: failed ? `${config.busy.replace(/ 중$/, '')} 실패` : config.done, time: aiTaskLabel(seconds), anchor: config.anchor, step: Number.isInteger(config.step) ? config.step : null, tool: config.tool || '', retry: config.retry || '', sameView: task.location === aiTaskLocation() };
  if (!failed) pendingAiMove = result;
  return result;
}
// 완료 직후 결과 위치로 옮긴다. 사용자가 다른 화면으로 옮겨 갔으면 옮기지 않고 알림만 남긴다.
function runPendingAiMove() {
  const move = pendingAiMove;
  if (!move) return;
  pendingAiMove = null;
  if (!move.sameView) return;
  const focus = () => {
    const target = document.querySelector(move.anchor);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.add('result-flash');
    setTimeout(() => target.classList.remove('result-flash'), 1800);
  };
  const needsStep = Number.isInteger(move.step) && (state.step !== move.step || state.activeTool !== 'workflow');
  const needsTool = move.tool && state.activeTool !== move.tool;
  if (needsStep) { navigateToStep(move.step, { activeTool: 'workflow' }); setTimeout(focus, 60); return; }
  if (needsTool) { setState({ activeTool: move.tool }); setTimeout(focus, 60); return; }
  setTimeout(focus, 30);
}
function showAiResultLocation() {
  const result = state.aiResult;
  if (!result) return;
  pendingAiMove = { ...result, sameView: true };
  setState({ aiResult: { ...result, seen: true } });
}
function aiResultBanner() {
  const result = state.aiResult;
  if (!result) return '';
  const failed = result.kind === 'fail';
  return `<div class="ai-result ${failed ? 'fail' : 'done'}"><span>${failed ? '!' : '✓'}</span><strong>${escapeHtml(result.label)}</strong><em>${escapeHtml(result.time)}</em>
    <div>${failed ? (result.retry ? `<button class="button secondary" data-ai-retry="${escapeHtml(result.retry)}">다시 시도</button>` : '') : '<button class="button secondary" id="ai-result-go">결과 보기</button>'}<button class="ai-result-close" id="ai-result-close" aria-label="알림 닫기">×</button></div></div>`;
}

// 진행 중 표시를 끝낼 때 최종 경과시간을 완료·실패 메시지에 함께 남긴다.
function elapsedLabel() { return busyStartedAt ? ` · ${Math.max(0, Math.round((Date.now() - busyStartedAt) / 1000))}초` : ''; }
function typeName() { return TYPES.find(([id]) => id === state.project.type)?.[1] || '사업'; }
function isStepComplete(index) {
  if (index === 0) return Boolean(state.noticeResults.length || state.sourceText.trim().length >= 30 || state.manualSources.some(item => item.extractionStatus === 'success'));
  if (index === 1) return Boolean(state.noticePreview || state.selectedNotice || (state.sourceText.trim().length >= 30 && !state.noticeResults.length));
  if (index === 2) return Boolean(selectedApplicant() || state.applicantSkipped);
  if (index === 3) return Boolean(state.selectedNotice || (state.sourceText.trim().length >= 30 && !state.noticeResults.length));
  if (index === 4) return state.sections.length === 10;
  if (index === 5) return Boolean(state.sections.length === 10 && state.reviewResult);
  return false;
}
function selectedApplicant() { return findApplicant(state.applicants, state.selectedApplicantId); }
function organizationForGeneration() {
  return buildApplicantOrganization(selectedApplicant(), state.projectValues);
}

function shell(content) {
  // 홈은 작업용 단계 내비게이션 없이 자체 화면으로만 보여 준다.
  if (state.activeTool === 'home') return `<div class="layout home-layout"><main class="main">${aiResultBanner()}${state.notice ? `<div class="alert success">${escapeHtml(state.notice)}</div>` : ''}${state.error ? `<div class="alert danger">${escapeHtml(state.error)}</div>` : ''}${content}${state.busy ? `<div class="busy"><div class="loader"></div><strong>${escapeHtml(state.busy)}</strong></div>` : ''}</main></div>`;
  return `
    <div class="layout">
      <main class="main">
        <header class="workflow-header">
          <div class="workflow-brand"><div class="brand"><span class="brand-mark">계</span><div><strong>사업계획서 작성 도우미</strong><small>공고 분석부터 제출본까지</small></div></div><span class="save-state">● 자동 저장 중</span></div>
          <div class="workflow-row"><label class="type-select-label" for="business-type">사업 유형<select id="business-type">${TYPES.map(([id, name]) => `<option value="${id}" ${state.project.type === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label><nav class="workflow-steps" aria-label="작성 단계">${STEPS.map((name, i) => { const complete = isStepComplete(i); return `<button data-step="${i}" class="workflow-step ${state.activeTool === 'workflow' && state.step === i ? 'active' : ''} ${complete ? 'done' : ''}" ${state.activeTool === 'workflow' && state.step === i ? 'aria-current="step"' : ''}><span>${complete ? '✓' : i + 1}</span>${name}</button>`; }).join('')}</nav><button class="history-button" id="open-archive-box">자료보관함</button><button class="history-button" id="open-applicants" aria-pressed="${state.activeTool === 'applicants'}">신청기관 정보</button><button class="history-button" id="open-coaching" aria-pressed="${state.activeTool === 'coaching'}">계획서 검증·코칭</button><nav class="workflow-history" aria-label="앱 작업 화면 이동"><button class="history-button" id="workflow-back" aria-label="직전 작업 화면으로 뒤로 가기" ${navigationHistory.backStack.length ? '' : 'disabled'}>← 뒤로</button><button class="history-button" id="workflow-home" aria-label="홈 화면으로 가기">⌂ 홈 화면</button><button class="history-button" id="workflow-forward" aria-label="다음 작업 화면으로 앞으로 가기" ${navigationHistory.forwardStack.length ? '' : 'disabled'}>앞으로 →</button></nav></div>
        </header>
        ${aiResultBanner()}
        ${state.notice ? `<div class="alert success">${escapeHtml(state.notice)}</div>` : ''}
        ${state.error ? `<div class="alert danger">${escapeHtml(state.error)}</div>` : ''}
        <section class="workspace">${content}</section>
        ${state.busy ? `<div class="busy"><div class="loader"></div><strong>${escapeHtml(state.busy)}</strong><small>창을 닫지 마세요.${busyStartedAt ? `<span data-ai-elapsed data-started-at="${busyStartedAt}" style="display:block">경과시간 00:00</span>` : ''}</small></div>` : ''}
      </main>
    </div>`;
}

function footer({ next = true, back = true, nextLabel = '다음 단계', nextId = 'next' } = {}) {
  return `<div class="actions">${back && state.step > 0 ? '<button class="button secondary" id="back">이전</button>' : '<span></span>'}${next ? `<button class="button primary" id="${nextId}">${nextLabel} →</button>` : ''}</div>`;
}

// 홈 대시보드. 작업 화면과 분리된 별도 화면이며 기존 상태·단계 이동만 재사용한다.
function homeView() {
  const writing = state.sections.length > 0;
  const versions = (state.proposalVersions || []).length;
  const currentStep = STEPS[state.step] || STEPS[0];
  const conflicts = currentOfficialConflicts();
  const marks = state.sections.reduce((sum, section) => sum + (String(section.content).match(/\[확인 필요[^\]]*\]/g) || []).length, 0);
  const readiness = writing ? (conflicts.length || marks ? `제출 전 확인 ${conflicts.length + (marks ? 1 : 0)}건` : '제출 검토 가능') : '';
  const saved = (state.archiveProposals || []).slice(0, 4);
  const recentCards = [
    ...(writing ? [`<article class="home-card work"><div class="home-work-top"><span class="home-badge">작성 중</span><span class="home-when">자동 저장됨</span></div>
      <h3>${escapeHtml(String(state.project.title || '제목 미정').slice(0, 44))}</h3>
      <p>${escapeHtml(String(state.project.issuer || state.selectedNotice?.title || '공고 정보 미지정').slice(0, 52))}</p>
      <dl><div><dt>현재 단계</dt><dd>${escapeHtml(currentStep)}</dd></div><div><dt>버전</dt><dd>${versions ? `V${versions}` : 'V1 작성 중'}</dd></div><div><dt>제출 준비</dt><dd>${escapeHtml(readiness)}</dd></div></dl>
      <button class="button primary" data-home-continue="1">계속 작업</button></article>`] : []),
    ...saved.map(item => `<article class="home-card work"><div class="home-work-top"><span class="home-badge quiet">${escapeHtml(archiveStageLabel(item.stage))}</span><span class="home-when">${escapeHtml(String(item.updatedAt || item.createdAt || '').slice(0, 10))}</span></div>
      <h3>${escapeHtml(String(item.title || '제목 없음').slice(0, 44))}</h3>
      <p>${escapeHtml(String(item.institution || item.noticeTitle || '보관된 계획서').slice(0, 52))}</p>
      <dl><div><dt>보관 단계</dt><dd>${escapeHtml(archiveStageLabel(item.stage))}</dd></div><div><dt>저장일</dt><dd>${escapeHtml(String(item.createdAt || '').slice(0, 10) || '-')}</dd></div><div><dt>제출 준비</dt><dd>열어서 확인</dd></div></dl>
      <button class="button secondary" data-open-archived-proposal="${escapeHtml(item.id)}">계속 작업</button></article>`)
  ].join('');
  return `
    <div class="home">
      <header class="home-header">
        <div class="home-brand"><strong>사업계획서 작성 도우미</strong><span>공고 분석부터 제출본까지</span></div>
        <nav class="home-nav"><button class="button ghost" id="workflow-back" aria-label="뒤로 가기">← 뒤로</button><button class="button ghost" disabled aria-current="page">⌂ 홈 화면</button><button class="button ghost" id="workflow-forward" aria-label="앞으로 가기">앞으로 →</button><button class="button ghost" data-home-scroll="home-product">제품소개</button><button class="button ghost" data-home-scroll="home-flow">이용방법</button><button class="button ghost" data-home-scroll="home-features">주요기능</button><button class="button ghost" data-home-archive="1">자료보관함</button><button class="button primary" data-home-start="1">무료로 시작하기</button></nav>
      </header>

      <section class="home-hero" id="home-product">
        <div class="home-hero-bg" aria-hidden="true"><span></span><span></span></div>
        <div class="home-hero-inner">
          <span class="home-eyebrow">공모사업 계획서 작성·검증 플랫폼</span>
          <h1>공고 한 건에서<br><em>제출본</em>까지</h1>
          <p class="home-lead">공고를 분석해 선정 논리를 세우고, 기관 정보와 연결해 설계·작성·검증·제출까지 한 흐름으로 진행합니다.</p>
          <div class="home-actions"><button class="button primary" data-home-start="1">새 사업계획서 시작</button><button class="button secondary" data-home-continue="1" ${writing ? '' : 'disabled'}>작성 중인 계획서 계속하기</button><button class="button ghost" data-open-sample="notice">[샘플] 예시 먼저 보기</button></div>
          <div class="home-hero-stats">
            <div><b>6단계</b><span>공고 준비 → 제출·보관</span></div>
            <div><b>11항목</b><span>공고 선정 논리 구조화</span></div>
            <div><b>V1·V2·V3</b><span>버전을 덮어쓰지 않고 보존</span></div>
          </div>
        </div>
        <div class="home-startbox">
          <div class="home-startbox-head"><span class="home-dot"></span><p class="home-startbox-title">공고문을 올리거나 사업 내용을 입력하면 첫 단계부터 안내합니다</p></div>
          <div class="home-startbox-actions"><button class="button primary" data-home-upload="1">공고문 업로드</button><button class="button secondary" data-home-manual="1">직접 입력</button><button class="button ghost" data-home-archive="1">보관함에서 열기</button></div>
          <p class="home-startbox-note">PDF · DOCX · TXT · HWPX를 읽습니다. 파일은 분석을 요청할 때만 전송되고 화면 상태는 이 브라우저에 저장됩니다.</p>
        </div>
        <button class="home-scroll-cue" data-home-scroll="home-flow" aria-label="아래로 이동">여섯 단계 살펴보기 ↓</button>
      </section>

      <section class="home-section home-deck-section" id="home-flow">
        <div class="home-head"><h2>업무 흐름 6단계</h2><p>좌우로 넘겨 단계별로 무엇을 만드는지 확인하고, 바로 그 화면으로 들어갈 수 있습니다.</p></div>
        <div class="home-deck" data-deck>
          <div class="home-deck-track" data-deck-track>${HOME_FLOW.map(step => { const active = writing && step.covers.includes(state.step); return `<article class="home-step ${active ? 'current' : ''}"><span class="home-step-no">${step.no}</span><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.desc)}</p><ul>${step.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>${active ? '<span class="home-step-state">진행 중</span>' : ''}<button class="button ghost" data-home-step="${step.step}">이 단계 열기</button></article>`; }).join('')}</div>
          <div class="home-deck-nav"><button class="home-deck-arrow" data-deck-prev aria-label="이전 단계">←</button><div class="home-deck-dots">${HOME_FLOW.map((step, index) => `<button class="home-deck-dot ${index === 0 ? 'active' : ''}" data-deck-go="${index}" aria-label="${escapeHtml(step.title)}"></button>`).join('')}</div><button class="home-deck-arrow" data-deck-next aria-label="다음 단계">→</button></div>
        </div>
      </section>

      <section class="home-section" id="home-features">
        <div class="home-head"><h2>주요 기능</h2><p>공모사업 작성에 필요한 과정을 한 곳에서 관리합니다.</p></div>
        <div class="home-grid four">
          <article class="home-card"><h3>공고 분석</h3><p>공고문·첨부 자료에서 목적·자격·필수내용·평가·성과 요구를 원문 근거와 함께 정리합니다.</p></article>
          <article class="home-card"><h3>기관정보 관리</h3><p>기관별 확인된 정보와 과거 실적을 나눠 보관하고 사업마다 다시 씁니다.</p></article>
          <article class="home-card"><h3>사업 설계도</h3><p>신청유형·대상·프로그램·예산·성과를 한 장으로 정리하고 미확정 항목을 추적합니다.</p></article>
          <article class="home-card"><h3>계획서 작성</h3><p>설계도를 기준으로 신청서 항목별 초안을 만들고 근거를 연결합니다.</p></article>
          <article class="home-card"><h3>검증·코칭</h3><p>평가기준으로 문제를 찾아 위치·근거·수정 방향을 함께 제시합니다.</p></article>
          <article class="home-card"><h3>수정계획과 버전</h3><p>수정 가능한 것만 반영하고 V1·V2·V3를 각각 보존합니다.</p></article>
          <article class="home-card"><h3>제출본 출력</h3><p>검토본을 DOCX·PDF로 출력합니다.</p></article>
          <article class="home-card"><h3>자료보관함</h3><p>공고와 계획서를 보관하고 언제든 이어서 작업합니다.</p></article>
        </div>
      </section>

      <section class="home-section">
        <div class="home-head"><h2>서비스 화면</h2><p>실제 작업 화면에서 이렇게 진행됩니다.</p></div>
        <div class="home-grid three">
          <article class="home-shot"><span>공고 분석</span><h3>선정 논리 11항목</h3><p>목적·자격·필수 사업내용·평가·성과 요구를 공고 원문 문장과 함께 확인합니다.</p><button class="button ghost" data-home-step="1">화면 열기</button></article>
          <article class="home-shot"><span>사업 설계</span><h3>설계도 한 장</h3><p>확정·근거 있음·설계안·확인 필요를 구분해 보여 주고 값을 바로 확정합니다.</p><button class="button ghost" data-home-step="3">화면 열기</button></article>
          <article class="home-shot"><span>검토·수정</span><h3>검증과 버전</h3><p>문제·근거·수정 상태와 V1·V2 비교를 한 화면에서 확인합니다.</p><button class="button ghost" data-home-step="5">화면 열기</button></article>
        </div>
      </section>

      <section class="home-section">
        <div class="home-head"><h2>핵심 가치</h2><p>확인되지 않은 기관 사실은 만들지 않고, 확인이 필요한 내용은 사용자에게 남깁니다.</p></div>
        <div class="home-grid four">
          <article class="home-card"><h3>공고 근거 기반 작성</h3><p>모든 문장을 공고 원문 문장과 출처에 연결합니다.</p></article>
          <article class="home-card"><h3>기관정보 재사용</h3><p>확인된 기관 정보를 사업마다 다시 입력하지 않습니다.</p></article>
          <article class="home-card"><h3>AI 검증·수정</h3><p>평가기준으로 문제를 찾고 수정 방향을 함께 제시합니다.</p></article>
          <article class="home-card"><h3>버전 보존</h3><p>V1·V2·V3를 덮어쓰지 않고 각각 남깁니다.</p></article>
        </div>
      </section>

      <section class="home-section">
        <div class="home-head"><h2>작성 원칙</h2></div>
        <div class="home-trust">
          <span><b>근거 추적</b>원문 문장·출처 연결</span>
          <span><b>확인 필요 관리</b>모르는 값은 [확인 필요]</span>
          <span><b>자동 저장</b>작업 중 상태 보존</span>
          <span><b>버전 보존</b>이전 버전 유지</span>
          <span><b>제출본 출력</b>DOCX·PDF 검토본</span>
        </div>
      </section>
      <section class="home-section" id="home-recent">
        <div class="home-head"><h2>최근 작업</h2><p>저장된 실제 작업만 표시합니다.</p></div>
        ${recentCards ? `<div class="home-grid">${recentCards}</div>` : `<div class="home-empty"><p>아직 작성 중인 계획서가 없습니다.</p><button class="button primary" data-home-start="1">새 사업계획서 시작</button></div>`}
      </section>

      <section class="home-final">
        <h2>공고 하나로 시작해 제출본까지 완성하세요</h2>
        <p>지금 공고문을 올리거나 사업 내용을 입력하면 첫 단계부터 안내합니다.</p>
        <div class="home-actions"><button class="button primary" data-home-start="1">무료로 시작하기</button><button class="button secondary" data-open-sample="notice">[샘플] 예시 프로젝트 보기</button><button class="button ghost" data-home-archive="1">자료보관함 보기</button></div>
      </section>

      <footer class="home-footer"><span>사업계획서 작성 도우미</span><div><button class="button ghost" data-home-start="1">새 계획서</button><button class="button ghost" data-home-archive="1">자료보관함</button><button class="button ghost" data-open-applicants="1">신청기관 정보</button></div></footer>
    </div>
`;
}

function noticeListView() {
  if (!state.noticeResults.length) return '<p class="muted">버튼을 누를 때만 접수 마감일이 남은 공모사업을 조회합니다.</p>';
  const cards = state.noticeResults.map((item, index) => {
    const summary = String(item.summary || '상세 공고문 확인 필요').slice(0, 200);
    return `<article class="requirement"><label><input type="checkbox" data-notice-check="${index}" ${state.selectedNoticeIndexes.includes(index) ? 'checked' : ''}> 삭제할 항목 선택</label><div><span class="tag">${escapeHtml(item.sourceLabel)}</span><strong>${escapeHtml(item.title)}</strong></div><p class="muted notice-card-preview" style="margin:10px 0 0;line-height:1.65">${escapeHtml(summary)}</p><div class="actions" style="justify-content:flex-start;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="button secondary" style="padding:7px 11px;font-size:12px" data-notice-panel="summary" data-notice-index="${index}" aria-expanded="false">일반</button><button class="button secondary" style="padding:7px 11px;font-size:12px" data-notice-panel="overview" data-notice-index="${index}" aria-expanded="false">개요</button><button class="button secondary" style="padding:7px 11px;font-size:12px" data-view-notice="${index}">자세히 보기</button><button class="button primary" style="padding:7px 11px;font-size:12px" data-select-notice="${index}">계획서 작성</button><button class="button secondary" style="padding:7px 11px;font-size:12px" data-remove-notice="${index}">삭제</button></div><div data-notice-content="summary-${index}" style="display:block;margin-top:12px;padding:12px 14px;background:#faf6f0;border-radius:9px" hidden><b>사업내용 요약</b><p class="muted">${escapeHtml(summary)}</p></div><div data-notice-content="overview-${index}" style="display:block;margin-top:12px;padding:12px 14px;background:#faf6f0;border-radius:9px" hidden><small style="display:block;margin:5px 0"><b>주관 기관</b> ${escapeHtml(item.sourceLabel)}</small>${item.applicationPeriod ? `<small style="display:block;margin:5px 0"><b>신청 기간</b> ${escapeHtml(item.applicationPeriod)}</small>` : ''}${item.eligibility ? `<small style="display:block;margin:5px 0"><b>신청 대상</b> ${escapeHtml(item.eligibility)}</small>` : ''}${item.supportDetails ? `<small style="display:block;margin:5px 0"><b>지원 내용</b> ${escapeHtml(item.supportDetails)}</small>` : ''}${item.supportLimit ? `<small style="display:block;margin:5px 0"><b>지원 규모·한도</b> ${escapeHtml(item.supportLimit)}</small>` : ''}<small style="display:block;margin:5px 0"><b>마감일</b> ${escapeHtml(item.deadline)} · <b>dstbBsnsCode</b> ${escapeHtml(item.dstbBsnsCode)}</small></div></article>`;
  }).join('').replaceAll('>계획서 작성</button>', '>이 공고로 진행</button>');
  return `<div class="actions"><button class="button secondary" id="remove-selected-notices" ${state.selectedNoticeIndexes.length ? '' : 'disabled'}>선택 항목을 쓰레기통으로 (${state.selectedNoticeIndexes.length})</button></div><div class="requirement-list">${cards}</div>`;
}

// 두 번째 화면(공고 준비)의 머리말. 홈에서 넘어온 흐름을 그대로 잇고 진입 경로 세 가지를 먼저 보여 준다.
function stageHero({ eyebrow, title, lead, actions = '', routes = [] }) {
  return `<section class="stage-hero">
    <div class="stage-hero-text"><span class="home-eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(lead)}</p>${actions ? `<div class="home-actions">${actions}</div>` : ''}</div>
    ${routes.length ? `<div class="home-deck stage-routes" data-deck><div class="home-deck-track" data-deck-track>${routes.map((route, index) => `<article class="stage-route"><span class="stage-route-no">${String(index + 1).padStart(2, '0')}</span><h3>${escapeHtml(route.title)}</h3><p>${escapeHtml(route.desc)}</p><button class="button ${index === 0 ? 'primary' : 'secondary'}" data-route="${escapeHtml(route.action)}">${escapeHtml(route.label)}</button></article>`).join('')}</div>
      <div class="home-deck-nav"><button class="home-deck-arrow" data-deck-prev aria-label="이전">←</button><div class="home-deck-dots">${routes.map((route, index) => `<button class="home-deck-dot ${index === 0 ? 'active' : ''}" data-deck-go="${index}" aria-label="${escapeHtml(route.title)}"></button>`).join('')}</div><button class="home-deck-arrow" data-deck-next aria-label="다음">→</button></div></div>` : ''}
  </section>`;
}
function noticeImportView() {
  return `${stageHero({ eyebrow: '1단계 · 공고 준비', title: '어떤 공고로 시작할까요?', lead: '공식 공고를 가져오거나 가지고 있는 공고문을 올리면 다음 단계부터 자동으로 이어집니다. 파일은 분석을 요청할 때만 전송됩니다.', actions: sampleButton('notice', '[샘플] 공고 먼저 보기'), routes: [{ title: '공식 공고 가져오기', desc: '사랑의열매 중앙회·광주지회 진행 중 공고를 조회해 목록으로 가져옵니다.', label: '공고 조회', action: 'fetch' }, { title: '공고문·신청서 업로드', desc: 'PDF·DOCX·TXT·HWPX 파일을 읽어 분석 자료로 씁니다.', label: '파일 선택', action: 'upload' }, { title: '보관함에서 다시 열기', desc: '전에 가져온 공고와 저장한 계획서를 검색해 이어서 작업합니다.', label: '자료보관함 열기', action: 'archive' }] })}
    <div class="card"><div class="card-title"><div><h3>기관 공고 가져오기</h3><span>사랑의열매 중앙회 · 광주지회</span></div><button class="button primary" id="fetch-notices">공고 가져오기</button></div><p class="muted">${state.noticeResults.length ? `진행 중 공고 ${state.noticeResults.length}건을 가져왔습니다.` : '버튼을 누를 때만 공식 공모사업을 조회합니다.'}<br><b>지금 가져온 목록은 이 화면에서만 쓰는 임시 목록</b>이며 새로고침하면 사라집니다. 과거에 가져온 공고는 아래 <b>「자료보관함」</b>에서 검색해 다시 열 수 있습니다.</p>${state.noticeResults.length ? '<div class="actions"><span></span><button class="button primary" data-step="1">가져온 공고 확인 →</button></div>' : ''}</div>
    <div class="source-grid"><div class="card"><div class="card-title"><h3>공고문·신청서 업로드</h3><span>PDF · DOCX · TXT · HWPX</span></div><label class="dropzone" for="source-files"><strong>파일을 선택하거나 여기에 놓으세요</strong><small>스캔 PDF는 OCR이 필요할 수 있습니다.</small><input id="source-files" type="file" accept=".pdf,.docx,.txt,.hwpx" multiple></label><div class="file-list">${state.files.length ? state.files.map((f, i) => `<div class="file-item"><span class="file-badge">${escapeHtml(f.type)}</span><div><strong>${escapeHtml(f.name)}</strong><small>${Number(f.characters || 0).toLocaleString()}자</small></div><button data-remove-file="${i}" aria-label="파일 제거">×</button></div>`).join('') : '<p class="empty-inline">업로드한 파일이 없습니다.</p>'}</div></div>
    <div class="card"><div class="card-title"><h3>공고문 직접 붙여넣기</h3><span id="char-count">${state.sourceText.length.toLocaleString()}자</span></div><textarea id="source-text" class="source-text" placeholder="기관 공고문 또는 신청서 원문을 붙여넣으세요.">${escapeHtml(state.sourceText)}</textarea></div></div>
    ${manualSourcesView()}
    <details class="card org-details"><summary>누락 공고 URL과 공식 사이트</summary><div class="actions"><a class="button secondary" href="https://chest.or.kr/bbs/1000/initPostList.do" target="_blank" rel="noopener noreferrer">중앙회 공식 사이트</a><a class="button secondary" href="https://gwangju.chest.or.kr/bbs/1000/initPostList.do" target="_blank" rel="noopener noreferrer">광주지회 공식 사이트</a></div><div class="field"><label for="missing-notice-url">누락 공고 가져오기</label><input id="missing-notice-url" type="url" value="${escapeHtml(state.noticeUrlDraft)}"><button class="button secondary" id="import-notice-url">목록에 추가</button></div></details>
    ${archiveView()}
    ${footer({ back: false, nextLabel: state.noticeResults.length ? '공고 확인' : '직접 자료로 계획서 작성', nextId: state.noticeResults.length ? 'next' : 'analyze' })}`;
}

// 자료보관함. 보관량이 많아도 빠르게 찾도록 「표 + 검색 + 필터」 목록으로 보여 준다.
// 공고 수집·계획서 작성 로직은 그대로 두고 화면과 선택 상태만 다룬다.
function archiveTableState() {
  return { ...structuredClone(initial.archiveTable), ...(state.archiveTable || {}), filters: { ...structuredClone(initial.archiveTable.filters), ...((state.archiveTable || {}).filters || {}) } };
}
function archiveLinks() { return state.archiveNoticeLinks || {}; }
function archiveLinkOf(key) { return archiveLinks()[key] || {}; }
function setArchiveLink(key, patch, notice = '') {
  const links = { ...archiveLinks(), [key]: { ...archiveLinkOf(key), ...patch } };
  setState({ archiveNoticeLinks: links, notice, error: '' });
}
function setArchiveTable(patch, extra = {}) {
  setState({ archiveTable: { ...archiveTableState(), ...patch }, ...extra });
}
// 보관 공고에 저장된 계획서 단계를 붙여 상태 열의 근거로 쓴다.
function archiveNoticesWithStage() {
  const proposals = state.archiveProposals || [];
  // [샘플] 프로젝트는 운영 D1에 저장하지 않고 목록에서만 함께 보여 준다.
  return [SAMPLE_NOTICE, ...(state.archiveNotices || [])].map(item => {
    const linked = proposals.find(proposal => proposal.noticeKey === item.archiveNoticeKey);
    return linked ? { ...item, linkedProposalStage: linked.stage } : item;
  });
}
function archiveTableData() {
  const table = archiveTableState();
  return archiveTableRows(archiveNoticesWithStage(), {
    links: archiveLinks(), applicants: state.applicants || [], today: todayIso(), hidden: state.archiveHiddenNotices || [],
    query: table.query, filters: table.filters, sortKey: table.sortKey, sortDir: table.sortDir, page: table.page, pageSize: table.pageSize
  });
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function archiveSortButton(key, label, table) {
  const active = table.sortKey === key;
  return `<button class="archive-sort ${active ? 'active' : ''}" data-archive-sort="${key}">${escapeHtml(label)}<i>${active ? (table.sortDir === 'asc' ? '▲' : '▼') : '▼'}</i></button>`;
}
function archiveSelectField(label, name, value, options, labelOf = option => option) {
  return `<label class="archive-filter"><span>${escapeHtml(label)}</span><select data-archive-filter="${name}"><option value="">전체</option>${options.map(option => `<option value="${escapeHtml(option)}" ${value === option ? 'selected' : ''}>${escapeHtml(labelOf(option))}</option>`).join('')}</select></label>`;
}
// 행 우클릭(모바일은 길게 누르기) 메뉴. 현재 진행 중인 공고면 단계 진행 표시를 붙인다.
function archiveProgressStep(row) {
  if (state.selectedNotice && archiveNoticeKey(state.selectedNotice) === row.key) return state.step;
  const stage = String(row.notice?.linkedProposalStage || '');
  if (!stage) return -1;
  if (stage.startsWith('coaching-') || stage.startsWith('revision-') || stage === 'review' || stage === 'complete') return 5;
  return 4;
}
function archiveDetailRow(row) {
  const notice = row.notice || {};
  const cells = [['사업개요', notice.summary], ['지원대상', notice.eligibility], ['지원규모', notice.supportLimit || notice.supportDetails], ['주요조건', notice.applicationPeriod]];
  return `<tr class="archive-detail"><td colspan="9"><div class="archive-detail-grid">${cells.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><p>${escapeHtml(String(value || '공고 원문에서 확인이 필요합니다.').slice(0, 600))}</p></div>`).join('')}</div>
    <div class="actions"><span>보관 원본은 그대로 두고 이번 작업 목록에만 엽니다.</span><div><button class="button secondary" data-archive-view="${escapeHtml(row.key)}">공고 상세 불러오기</button><button class="button primary" data-archive-use="${escapeHtml(row.key)}">공고 확인 목록에 열기</button></div></div></td></tr>`;
}
function archiveApplicantRow(row) {
  const applicants = state.applicants || [];
  return `<tr class="archive-detail"><td colspan="9"><div class="archive-picker"><b>신청기관 매칭</b><span class="muted">한 공고에 여러 기관을 연결할 수 있고, 기관별 계획서 작업은 각각 별도로 유지됩니다.</span>
    ${applicants.length ? applicants.map(item => `<label><input type="checkbox" data-archive-applicant="${escapeHtml(row.key)}" value="${escapeHtml(item.id)}" ${row.applicantIds.includes(item.id) ? 'checked' : ''}> ${escapeHtml(item.name)}</label>`).join('') : '<span class="muted">등록된 신청기관이 없습니다. 「신청기관 정보」에서 먼저 등록하세요.</span>'}
    <button class="button secondary" data-archive-applicant-close="${escapeHtml(row.key)}">닫기</button></div></td></tr>`;
}
function archiveTableRow(row, table) {
  const selected = (table.selected || []).includes(row.key);
  return `<tr class="${selected ? 'selected' : ''}" data-archive-row="${escapeHtml(row.key)}">
    <td class="archive-check"><input type="checkbox" data-archive-select="${escapeHtml(row.key)}" ${selected ? 'checked' : ''} aria-label="행 선택"></td>
    <td class="archive-num">${escapeHtml(shortDate(row.collectedAt) || '-')}</td>
    <td class="archive-quiet">${escapeHtml(row.institution)}</td>
    <td class="archive-quiet">${escapeHtml(row.field)}</td>
    <td class="archive-title"><button class="archive-name" data-archive-detail="${escapeHtml(row.key)}" title="${escapeHtml(row.summary)}">${escapeHtml(row.title.slice(0, 80))}</button>${row.isSample ? '<small class="archive-tag">보기 전용 예시</small>' : ''}</td>
    <td class="archive-num ${row.deadline.closed ? 'closed' : ''}">${escapeHtml(row.deadline.text)}</td>
    <td class="archive-tight"><span class="archive-status-wrap"><select class="archive-status" data-archive-status="${escapeHtml(row.key)}">${ARCHIVE_STATUSES.map(status => `<option value="${escapeHtml(status)}" ${row.status === status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select></span></td>
    <td>${row.isSample ? `<span class="archive-quiet">${escapeHtml(row.applicantText)}</span>` : `<button class="archive-action" data-archive-applicant-open="${escapeHtml(row.key)}">${row.applicantText ? escapeHtml(row.applicantText) : '+ 기관 매칭'}</button>`}</td>
    <td class="archive-tight"><button class="archive-action danger" data-archive-remove="${escapeHtml(row.key)}" title="목록에서 삭제" aria-label="목록에서 삭제">삭제</button></td>
  </tr>${table.expandedKey === row.key ? archiveDetailRow(row) : ''}${table.applicantPickerKey === row.key ? archiveApplicantRow(row) : ''}`;
}
function archiveView() {
  const filters = state.archiveFilters || initial.archiveFilters;
  const table = archiveTableState();
  const data = archiveTableData();
  const proposals = state.archiveProposals || [];
  const selected = (table.selected || []).filter(key => data.rows.some(row => row.key === key) || (state.archiveNotices || []).some(item => item.archiveNoticeKey === key));
  const linkedCount = Object.values(archiveLinks()).filter(link => (link.applicantIds || []).length).length;
  const pageKeys = data.rows.map(row => row.key);
  const allChecked = pageKeys.length > 0 && pageKeys.every(key => selected.includes(key));
  return `<details class="card org-details" id="archive-box" open><summary><b>자료보관함</b> · 보관 공고 목록과 저장한 계획서</summary>
    <p class="muted">한 번 가져온 공고는 자동으로 보관됩니다. 검색·필터로 찾고 「작업하기」에서 원하는 단계로 바로 이동하세요.</p>
    <div class="summary-grid"><div><span>보관 공고</span><strong>${data.total}건</strong><small>기관 ${data.institutions.length}곳</small></div>
      <div><span>검색 결과</span><strong>${data.matched}건</strong><small>${data.matched ? `${data.from}–${data.to}번 표시` : '조건에 맞는 공고 없음'}</small></div>
      <div><span>신청기관 연결</span><strong>${linkedCount}건</strong><small>공고당 여러 기관 연결 가능</small></div>
      <div><span>저장한 계획서</span><strong>${proposals.length}건</strong><small>작업하기에서 이어서 작성</small></div></div>
    <div class="archive-toolbar"><input id="archive-query" value="${escapeHtml(table.query)}" placeholder="사업명·기관명·키워드 검색 후 Enter">
      <button class="button secondary" id="archive-apply-query">목록 검색</button>
      <button class="button secondary" id="search-archive">보관함 다시 불러오기</button>
      <button class="button primary" id="find-matching-notices">맞춤 공고 찾기</button>
      <button class="button secondary" id="list-archived-proposals">계획서 보관함</button></div>
    <div class="archive-filters">
      ${archiveSelectField('수집일', 'collected', table.filters.collected, data.collectedDates, shortDate)}
      ${archiveSelectField('공모기관', 'institution', table.filters.institution, data.institutions)}
      ${archiveSelectField('분야', 'field', table.filters.field, data.fields)}
      ${archiveSelectField('상태', 'status', table.filters.status, ARCHIVE_STATUSES)}
      <label class="archive-filter"><span>신청기관</span><select data-archive-filter="applicant"><option value="">전체</option><option value="미연결" ${table.filters.applicant === '미연결' ? 'selected' : ''}>미연결</option>${(state.applicants || []).map(item => `<option value="${escapeHtml(item.id)}" ${table.filters.applicant === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>
      ${archiveSelectField('마감일', 'deadline', table.filters.deadline, ['진행중', '7일이내', '마감'])}
      <button class="button secondary" id="archive-reset-filters">필터 초기화</button></div>
    <div class="archive-bulk"><span>${selected.length ? `선택 ${selected.length}건` : '행 선택 후 일괄 삭제할 수 있습니다.'}</span><button class="button secondary" id="archive-delete-selected" ${selected.length ? '' : 'disabled'}>선택 삭제</button></div>
    ${data.total ? `<div class="archive-table-wrap"><table class="archive-table"><thead><tr>
      <th class="archive-check"><input type="checkbox" id="archive-select-page" ${allChecked ? 'checked' : ''} aria-label="현재 페이지 전체 선택"></th>
      <th>${archiveSortButton('collectedAt', '수집일', table)}</th>
      <th>${archiveSortButton('institution', '공모기관', table)}</th>
      <th>${archiveSortButton('field', '분야', table)}</th>
      <th>${archiveSortButton('title', '사업명', table)}</th>
      <th>${archiveSortButton('deadline', '마감일', table)}</th>
      <th>상태</th><th>신청기관</th><th>삭제</th>
    </tr></thead><tbody>${data.rows.map(row => archiveTableRow(row, { ...table, selected })).join('') || '<tr><td colspan="9" class="muted">조건에 맞는 공고가 없습니다. 필터를 초기화해 보세요.</td></tr>'}</tbody></table></div>
    <div class="archive-pager"><span>총 ${data.matched}건 중 ${data.from}–${data.to} · ${data.page}/${data.pageCount}쪽</span>
      <label>페이지당 <select id="archive-page-size">${ARCHIVE_PAGE_SIZES.map(size => `<option value="${size}" ${data.pageSize === size ? 'selected' : ''}>${size}개</option>`).join('')}</select></label>
      <button class="button secondary" data-archive-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>이전</button>
      <button class="button secondary" data-archive-page="${data.page + 1}" ${data.page >= data.pageCount ? 'disabled' : ''}>다음</button></div>` : '<p class="muted">보관된 공고가 없습니다. 공고를 한 번 가져오면 자동으로 보관됩니다.</p>'}
    ${(state.archiveHiddenNotices || []).length ? `<div class="archive-bulk"><span>목록에서 숨긴 공고 ${(state.archiveHiddenNotices || []).length}건 (보관 원본과 연결된 계획서는 남아 있습니다)</span><button class="button secondary" id="archive-restore-hidden">숨긴 공고 되돌리기</button></div>` : ''}
    ${proposals.length ? `<details><summary>저장한 계획서 ${proposals.length}건</summary><div class="requirement-list">${proposals.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(archiveStageLabel(item.stage))}</span><div><strong>${escapeHtml(item.title)}</strong><small class="muted">저장 ${escapeHtml(String(item.createdAt || '').slice(0, 10))} · 수정 ${escapeHtml(String(item.updatedAt || '').slice(0, 10))}</small></div></div><button class="button primary" data-open-archived-proposal="${escapeHtml(item.id)}">이어서 수정</button></article>`).join('')}</div></details>` : '<p class="muted">저장한 계획서가 없습니다. 작성 화면의 「자료보관함에 저장」을 누르면 여기에 쌓입니다.</p>'}
    <details><summary>서버 검색 조건 · 다른 기기에서 같은 보관함 사용</summary>
      <div class="two-col"><div class="field"><label for="archive-institution">기관</label><input id="archive-institution" value="${escapeHtml(filters.institution)}" placeholder="예: 광주지회"></div><div class="field"><label for="archive-keyword">키워드</label><input id="archive-keyword" value="${escapeHtml(filters.keyword)}" placeholder="예: 아동, 가족기능"></div></div>
      <div class="two-col"><div class="field"><label for="archive-from">마감일 시작</label><input id="archive-from" type="date" value="${escapeHtml(filters.from)}"></div><div class="field"><label for="archive-to">마감일 종료</label><input id="archive-to" type="date" value="${escapeHtml(filters.to)}"></div></div>
      <p class="muted">현재 복구키를 비밀번호 관리도구 등 안전한 장소에 보관하세요. 새 기기에서 같은 키를 입력하면 기존 계획서 보관함에 연결됩니다. 복구키를 잃으면 서버에서도 복원할 수 없습니다.</p>
      <div class="actions"><button class="button secondary" id="copy-archive-key">현재 복구키 복사</button></div>
      <div class="field"><label for="archive-recovery-key">기존 보관함 복구키</label><input id="archive-recovery-key" type="password" autocomplete="off" value="${escapeHtml(state.archiveKeyDraft)}" placeholder="다른 기기에서 보관한 복구키 붙여넣기"><button class="button primary" id="apply-archive-key">이 기기에 기존 보관함 연결</button></div></details></details>`;
}


function archiveStageLabel(stage) { if (String(stage).startsWith('revision-v')) return `코칭 반영 수정본 ${String(stage).replace('revision-', '')}`; return String(stage).startsWith('coaching-v') ? `검증·코칭 ${String(stage).replace('coaching-', '')}` : ({ master: '마스터 설계', parts: '분할 생성', complete: '완성본', review: '검토본' })[stage] || stage; }

// 공고에서 「선정 논리」만 구조화한다. 공고 저장·계획서 기능은 건드리지 않는다.
function noticeLogicSource() {
  const notice = state.noticePreview || state.selectedNotice || state.noticeResults[0];
  if (!notice) return null;
  const criteriaText = [state.sourceText, ...state.manualSources.filter(item => ['세부 공고문', '심사·평가기준', '예산 편성 기준'].includes(item.sourceType) && item.extractionStatus === 'success').map(item => item.extractedText)].filter(Boolean).join('\n\n');
  return { ...notice, overview: notice.overview || notice.detailText || notice.summary || '', criteriaText };
}

function selectionLogicView() {
  const notice = noticeLogicSource();
  if (!notice) return '';
  const analysis = state.noticeLogic;
  const header = `<div class="card" id="result-logic" tabindex="-1"><div class="card-title"><div><h3>선정 논리 구조화</h3><span>공고·요강·평가기준에서 확인되는 내용만 정리합니다. 없는 기준은 만들지 않습니다.</span></div><button class="button secondary" id="analyze-notice-logic">공고 본문만 분석</button><button class="button primary" id="analyze-notice-bundle">첨부까지 완전 분석</button></div>`;
  if (!analysis) return `${header}<p class="muted">AI 호출 없이 공고 원문에서 목적·자격·필수내용·평가배점·성과 요구를 구조화합니다.</p></div>`;
  const { structure, logic, requirements, summary } = analysis;
  return `${header}
    <div class="summary-grid"><div><span>읽은 공고 자료</span><strong>${structure.totalChars.toLocaleString()}자</strong><small>${escapeHtml(structure.sources.map(source => source.label).join(' · '))}</small></div>
    <div><span>공식 근거 확인 항목</span><strong>${summary.confirmedFields}/${structure.fields.length}</strong><small>확인 필요 ${structure.fields.length - summary.confirmedFields}개</small></div>
    <div><span>배점</span><strong>${escapeHtml(logic.scoring.mode)}</strong><small>${escapeHtml(logic.scoring.items.map(item => `${item.criterion} ${item.points}점`).join(' · ') || '공식 평가표 없음 · 점수 임의 생성 안 함')}</small></div>
    <div><span>선정 요건</span><strong>${requirements.length}개</strong><small>공식 근거 ${summary.officialRequirements} · 확인 필요 ${summary.checkRequirements}</small></div></div>
    ${analysis.files ? `<details open><summary>공고 자료묶음 ${analysis.files.length}건 · 읽음 ${analysis.summary.bundle.read} · 변환 필요 ${analysis.summary.bundle.conversionNeeded} · 미지원 ${analysis.summary.bundle.unsupported}</summary><div class="cap-grid">${analysis.files.map(file => `<div><span>${escapeHtml(file.role)} · ${escapeHtml(file.status)}</span><strong>${escapeHtml(String(file.name).split(" > ").pop())}</strong><small>${file.chars ? file.chars.toLocaleString() + "자" : escapeHtml(file.error || "")}</small></div>`).join("")}</div>${analysis.conflicts?.length ? `<p><b>자료 간 충돌</b> ${analysis.conflicts.map(item => `${escapeHtml(item.field)} · ${escapeHtml(item.label)}: ${escapeHtml(item.values.join(" vs "))}`).join(" / ")}</p>` : ""}</details>` : ""}
    ${structure.unreadAttachments.length ? `<div class="alert warning"><strong>읽지 못한 자료</strong><p>${escapeHtml(structure.unreadAttachments.join(' / '))} — 이 안의 조건은 읽지 못했습니다. 파일을 직접 자료로 추가하면 함께 분석합니다.</p></div>` : ''}
    <details open><summary>이 공고에서 선정되려면 무엇을 증명해야 하는가 (${requirements.length}개)</summary><div class="requirement-list">${requirements.map((item, index) => `<article class="requirement"><div><span class="status ${item.basis === '공식 근거' ? '충족' : '확인-필요'}">${escapeHtml(item.basis)}</span><div><strong>${index + 1}. ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.prove)}</small></div></div>${item.evidence.length ? `<details><summary>공고 근거</summary>${item.evidence.map(evidence => `<blockquote>[${escapeHtml(evidence.source)}] ${escapeHtml(evidence.sentence)}</blockquote>`).join('')}</details>` : ''}</article>`).join('')}</div></details>
    <details open><summary>선정 논리 흐름</summary><div class="cap-grid">${logic.chain.map(item => `<div><span>${escapeHtml(item.step)}</span><strong>${escapeHtml(item.basis)}</strong><small>${escapeHtml(String(item.content).slice(0, 120))}</small></div>`).join('')}</div>${logic.brokenLinks.length ? `<p class="muted">끊긴 고리: ${escapeHtml(logic.brokenLinks.join(' · '))} — 공고 원문·요강을 추가하면 채울 수 있습니다.</p>` : ''}</details>
    <details><summary>항목별 구조화 ${structure.fields.length}개</summary><div class="requirement-list">${structure.fields.map(field => `<article class="requirement"><div><span class="status ${field.status === '공식 근거 확인' ? '충족' : '확인-필요'}">${escapeHtml(field.status)}</span><strong>${escapeHtml(field.title)}</strong></div>${field.evidence.map(evidence => `<blockquote>[${escapeHtml(evidence.source)}] ${escapeHtml(evidence.sentence)}</blockquote>`).join('') || '<p class="muted">공고에서 확인되지 않았습니다. 추론으로 채우지 않습니다.</p>'}</article>`).join('')}</div></details></div>`;
}

function noticeConfirmView() {
  return `<div class="page-heading"><div><h2>공고 내용을 확인하세요</h2><p>공식 상세 원문에서 추출한 요약·대상·기간·지원내용을 확인합니다.</p></div><div class="actions">${sampleButton('analysis', '[샘플] 공고 분석 보기')}</div></div>
    <div class="card"><div class="card-title"><div><h3>이번에 가져온 공고 ${state.noticeResults.length}건 · 임시 목록</h3><span>300자 이내 공식 원문 요약 · 새로고침하면 사라지며, 보관은 자료보관함(D1)에 별도로 저장됩니다</span></div><button class="button secondary" data-step="0">공고 더 가져오기</button></div>${noticeListView()}</div>
    ${selectionLogicView()}
    ${noticeTrashView()}${noticePreviewView()}
    ${!state.noticeResults.length ? '<div class="empty-state"><div>⌕</div><h2>가져온 공고가 없습니다</h2><button class="button primary" data-step="0">공고 가져오기로 이동</button></div>' : ''}`;
}

// 사업 설계도. 엔진(project-blueprint.js)의 결과만 그려 주고 화면에서 다시 계산하지 않는다.
const BLUEPRINT_STATUS_LABEL = { CONFIRMED: '확정', SUPPORTED: '근거 있음', PROPOSED: '설계안', NEEDS_CONFIRMATION: '확인 필요' };
const BLUEPRINT_STATUS_CLASS = { CONFIRMED: '충족', SUPPORTED: '부분-충족', PROPOSED: '검토-필요', NEEDS_CONFIRMATION: '확인-필요' };
// 설계도 항목에서 사용자가 바로 값을 넣을 수 있는 자리. 값은 이번 사업 값(projectSpecificValues)으로만 저장한다.
const BLUEPRINT_INPUTS = {
  summary: [['name', '사업명']],
  target: [['target', '대상']],
  programs: [['programs', '핵심 프로그램']],
  programDetails: [['headcount', '인원'], ['sessions', '회기'], ['staff', '담당 인력']],
  delivery: [['staff', '수행인력']],
  partners: [['partners', '협력기관']],
  budget: [['budget', '예산']],
  outcomeGoals: [['outcomeGoals', '성과목표']],
  indicators: [['indicators', '성과지표']]
};
const BLUEPRINT_CARD_KEYS = ['summary', 'problem', 'target', 'purpose', 'objectives', 'programs', 'programDetails', 'delivery', 'strengths', 'partners', 'budget', 'outcomeGoals', 'indicators'];

// 설계도에 넣는 이번 사업 값. 신청기관 원본은 읽기만 한다.
function blueprintProjectValues() {
  return (state.projectValues || []).filter(item => item.blueprintKey).map(item => ({ key: item.blueprintKey, value: item.value, source: '사용자 확정' }));
}
function blueprintValueOf(key) { return (state.projectValues || []).find(item => item.blueprintKey === key)?.value || ''; }
// 설계도 미확정 항목 → 계획서 항목 자리. 화면 표시와 서버 집계가 같은 기준을 쓰게 한다.
function unresolvedSectionsOf(blueprint) {
  const grouped = new Map();
  for (const item of (blueprint?.items || []).filter(entry => entry.status === 'NEEDS_CONFIRMATION' && BLUEPRINT_SECTION_MAP[entry.key])) {
    const key = BLUEPRINT_SECTION_MAP[item.key];
    grouped.set(key, [...(grouped.get(key) || []), item.title]);
  }
  return [...grouped.entries()].map(([sectionKey, from]) => ({ sectionKey, from }));
}
// 공고의 최소·최대 기준과 사용자가 확정한 이번 사업 값의 충돌만 뽑는다.
function currentOfficialConflicts() {
  return officialRequirementConflicts(state.noticeLogic?.structure, (state.projectValues || []).filter(item => item.blueprintKey));
}
function currentBlueprint() {
  const structure = state.noticeLogic?.structure;
  const applicant = selectedApplicant();
  if (!structure || !applicant) return null;
  return buildBlueprint({ structure, applicant, fitResult: matchApplicantToNotice(structure, applicant), projectValues: blueprintProjectValues() });
}

function blueprintTypeView(blueprint) {
  const { options, selected, blocked } = blueprint.applicationTypes;
  if (!options.length) return '';
  return `<div class="card-title" style="margin-top:6px"><div><h4 style="margin:0">신청유형</h4><span>${blocked ? '유형에 따라 대상·사업내용·요건이 다릅니다. 먼저 하나를 고르세요.' : '선택한 유형의 조건만 설계에 반영했습니다. 다른 유형 조건은 제외됩니다.'}</span></div></div>
    <div class="requirement-list">${options.map(option => `<article class="requirement"><div><span class="status ${selected === option.name ? '충족' : '확인-필요'}">${selected === option.name ? '선택함' : '선택 가능'}</span><div><strong>${escapeHtml(option.name)}</strong><small>${escapeHtml(option.description || '공고에 설명 문장이 없습니다.')}</small></div></div><button class="button ${selected === option.name ? 'secondary' : 'primary'}" data-blueprint-type="${escapeHtml(option.name)}">${selected === option.name ? '선택됨' : '이 유형으로 설계'}</button></article>`).join('')}</div>`;
}

function blueprintItemCard(item) {
  const inputs = BLUEPRINT_INPUTS[item.key] || [];
  const needsInput = item.status === 'NEEDS_CONFIRMATION' || item.status === 'PROPOSED';
  return `<article class="requirement"><div><span class="status ${BLUEPRINT_STATUS_CLASS[item.status]}">${BLUEPRINT_STATUS_LABEL[item.status]}</span><div><strong>${escapeHtml(item.title)}${item.status === 'PROPOSED' ? ' <span class="tag">설계안 · 확정 아님</span>' : ''}</strong>
    <small>${item.value ? nl(String(item.value).slice(0, 400)) : '<b>[확인 필요]</b> 값을 만들지 않았습니다.'}</small>
    ${item.basis ? `<small class="muted">${escapeHtml(item.basis)}</small>` : ''}</div></div>
    ${item.evidence?.length ? `<details><summary>근거 ${item.evidence.length}건</summary>${item.evidence.map(evidence => `<blockquote>[${escapeHtml(String(evidence.source).split(' > ').pop())}] ${escapeHtml(evidence.sentence)}</blockquote>`).join('')}</details>` : ''}
    ${needsInput && inputs.length ? `<div class="two-col" style="margin:10px 0 0 64px">${inputs.map(([key, label]) => `<div class="field" style="margin:0"><label for="bp-${key}">${escapeHtml(label)}</label><input id="bp-${key}" data-blueprint-input="${key}" value="${escapeHtml(blueprintValueOf(key))}" placeholder="확인된 값만 입력하세요. 모르면 비워 두세요."></div>`).join('')}<div class="field" style="margin:0"><label>&nbsp;</label><button class="button secondary" data-blueprint-save="${escapeHtml(item.key)}">이번 사업 값으로 저장</button></div></div>` : ''}
    ${item.question && !inputs.length ? `<p class="muted" style="margin:8px 0 0 64px">${escapeHtml(item.question)}</p>` : ''}</article>`;
}

function blueprintView() {
  if (!state.selectedNotice && !state.noticePreview) return '';
  const structure = state.noticeLogic?.structure;
  const applicant = selectedApplicant();
  if (!structure || !applicant) {
    return `<div class="card" id="project-blueprint"><div class="card-title"><div><h3>사업 설계도</h3><span>계획서 초안 전에 이번 사업 설계를 한 장으로 정리합니다.</span></div>${structure ? '' : '<button class="button primary" data-step="1">공고 선정 논리 분석</button>'}</div>
      <p class="muted">${structure ? '' : '먼저 「공고 확인」 단계에서 선정 논리를 분석하세요. '}${applicant ? '' : '이번 사업의 신청기관을 선택하면 설계도를 만듭니다.'}</p>
      ${applicant ? '' : '<button class="button secondary" data-step="2">신청기관 선택으로 이동</button>'}</div>`;
  }
  const blueprint = currentBlueprint();
  const cards = BLUEPRINT_CARD_KEYS.map(key => blueprint.items.find(item => item.key === key)).filter(Boolean);
  const design = blueprint.items.filter(item => !['requirementLinks', 'openItems'].includes(item.key));
  const coreTitles = new Set(design.filter(item => item.status === 'NEEDS_CONFIRMATION').map(item => item.title));
  const coreQuestions = blueprint.openQuestions.filter(entry => coreTitles.has(entry.section)).slice(0, 7);
  const restQuestions = blueprint.openQuestions.filter(entry => !coreQuestions.includes(entry));
  const noticeChecks = blueprint.submissionChecklist.filter(entry => entry.kind === '공고 요건');
  const draftHint = !blueprint.canDraft
    ? '<span class="status 확인-필요">신청유형을 먼저 선택하세요</span>'
    : blueprint.readiness === 'SUBMISSION_READY'
      ? '<span class="status 충족">제출 문서 확정 단계로 진행 가능</span>'
      : `<span class="status 부분-충족">제출 전 확인이 필요한 항목이 있습니다 · ${blueprint.submissionChecklist.length}개</span>`;
  return `<div class="card" id="project-blueprint"><div class="card-title"><div><h3>사업 설계도</h3><span>공고 값·기관 값·이번 사업 값을 섞지 않습니다. 확정하지 않은 값은 [확인 필요]로 남깁니다.</span></div>
      <button class="button primary" id="blueprint-draft" ${blueprint.canDraft ? '' : 'disabled'}>초안 작성</button></div>
    <p class="muted">${escapeHtml(blueprint.verdict)} · 신청기관 ${escapeHtml(blueprint.applicantName)}</p>
    <div style="margin-bottom:12px">${draftHint}</div>
    ${blueprintTypeView(blueprint)}
    <div class="summary-grid" style="margin-top:16px"><div><span>확정</span><strong>${blueprint.byStatus.CONFIRMED}</strong><small>공고·사용자 확정 값</small></div>
    <div><span>근거 있음</span><strong>${blueprint.byStatus.SUPPORTED}</strong><small>확인된 기관 정보·관련 실적</small></div>
    <div><span>설계안</span><strong>${blueprint.byStatus.PROPOSED}</strong><small>확정 전 · 사실로 쓰지 않음</small></div>
    <div><span>확인 필요</span><strong>${blueprint.byStatus.NEEDS_CONFIRMATION}</strong><small>사용자 확인 전까지 [확인 필요]</small></div></div>
    ${coreQuestions.length ? `<div class="alert warning"><strong>필수 확인 ${coreQuestions.length}개</strong>${coreQuestions.map(entry => `<p>· [${escapeHtml(entry.section)}] ${escapeHtml(entry.question)}</p>`).join('')}</div>` : ''}
    <div class="requirement-list">${cards.map(blueprintItemCard).join('')}</div>
    <details><summary>공고 선정요건 점검 ${noticeChecks.length}개 · 남은 질문 ${restQuestions.length}개</summary>
      <div class="requirement-list">${blueprint.requirementLinks.map(link => `<article class="requirement"><div><span class="status ${link.covered ? (link.hasApplicantEvidence ? '충족' : '부분-충족') : '확인-필요'}">${link.covered ? (link.hasApplicantEvidence ? '대응+근거' : '설계 대응') : '미대응'}</span><div><strong>${escapeHtml(link.requirement)}</strong><small>${escapeHtml(link.sections.map(section => `${section.title}(${BLUEPRINT_STATUS_LABEL[section.status]})`).join(' · ') || '설계 항목이 아니라 제출 준비 단계에서 확인')}</small>${link.gap ? `<small class="muted">${escapeHtml(link.gap)}</small>` : ''}</div></div></article>`).join('')}</div>
      ${restQuestions.length ? `<div class="questions" style="margin-top:12px">${restQuestions.map(entry => `<p class="muted">· [${escapeHtml(entry.section)}] ${escapeHtml(entry.question)}</p>`).join('')}</div>` : ''}
    </details>
    <details><summary>설계 논리 점검 (문제 → 대상 → 프로그램 → 예산 → 성과)</summary><div class="cap-grid">${blueprint.logic.map(link => `<div><span>${escapeHtml(link.state)}</span><strong>${escapeHtml(link.link)}</strong><small>${escapeHtml(link.reason)}</small></div>`).join('')}</div></details>
    <p class="muted">${escapeHtml(blueprint.rule)}</p></div>`;
}

function businessSelectView() {
  const choice = state.pendingNoticeChoice ? `<div class="card"><div class="card-title"><div><h3>작성할 세부사업을 선택하세요</h3><span>선택한 사업 내용만 계획서에 반영됩니다.</span></div></div><div class="requirement-list">${state.pendingNoticeChoice.subprojects.map((item, index) => `<article class="requirement"><div><span class="tag">${escapeHtml(item.id)}</span><strong>${escapeHtml(item.title)}</strong></div><button class="button primary" data-select-subproject="${index}">이 사업 선택</button></article>`).join('')}</div></div>` : '';
  return `<div class="page-heading"><div><h2>작성할 사업을 확정하세요</h2><p>복수 세부사업일 때만 한 사업을 선택합니다. 아래 사업 설계도를 확인한 뒤 초안 작성으로 넘어갑니다.</p></div><div class="actions">${sampleButton('blueprint', '[샘플] 완성 설계도 보기')}</div></div>${choice}${selectedNoticeDetailView()}${blueprintView()}${attachmentView()}${!state.pendingNoticeChoice && !state.selectedNotice ? '<div class="empty-state"><div>◉</div><h2>선택한 공고가 없습니다</h2><button class="button primary" data-step="1">공고 확인으로 이동</button></div>' : ''}`;
}

function applicantStatusTag(status) { return `<span class="status ${status === CONFIRMED_STATUS ? '충족' : status === '오래된 정보' ? '부분-충족' : '확인-필요'}">${escapeHtml(status)}</span>`; }
function statusOptions(selected) { return APPLICANT_STATUSES.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join(''); }

function applicantsToolView() {
  const editing = findApplicant(state.applicants, state.applicantEditingId);
  return `<div class="page-heading"><div><h2>신청기관 정보</h2><p>이번 사업을 신청하는 기관의 정보를 등록·수정합니다. 공고 분석 정보와는 분리해 보관하며, 확인된 정보만 계획서 작성에 전달합니다.</p><div class="actions">${sampleButton('applicant', '[샘플] 기관 보기')}</div></div><button class="button secondary" id="close-applicants">작성 흐름으로 돌아가기</button></div>
    <div class="card"><div class="card-title"><div><h3>등록된 신청기관 ${state.applicants.length}곳</h3><span>마인드스토리도 등록기관 중 하나로만 취급합니다.</span></div><div><button class="button secondary" id="load-applicants">보관함에서 불러오기</button></div></div>
    <div class="two-col"><div class="field"><label for="applicant-name-draft">새 신청기관명</label><input id="applicant-name-draft" value="${escapeHtml(state.applicantNameDraft)}" placeholder="예: 사단법인 ○○센터"></div><div class="field"><label>&nbsp;</label><button class="button primary" id="add-applicant">신청기관 추가</button></div></div>
    ${state.applicants.length ? `<div class="requirement-list">${state.applicants.map(applicant => {
      const confirmed = applicant.items.filter(item => item.status === CONFIRMED_STATUS).length;
      return `<article class="requirement"><div><span class="tag">${applicant.id === state.selectedApplicantId ? '이번 사업 신청기관' : '등록기관'}</span><div><strong>${escapeHtml(applicant.name)}</strong><small>확인됨 ${confirmed}건 · 확인 필요·오래된 정보 ${applicant.items.length - confirmed}건 · 최근 수정 ${escapeHtml(String(applicant.updatedAt).slice(0, 10))}</small></div></div><div class="actions" style="margin:0;gap:8px"><button class="button secondary" data-edit-applicant="${escapeHtml(applicant.id)}">${state.applicantEditingId === applicant.id ? '수정 닫기' : '정보 수정'}</button><button class="button secondary" data-select-applicant="${escapeHtml(applicant.id)}">이번 사업 신청기관으로 선택</button><button class="button secondary" data-delete-applicant="${escapeHtml(applicant.id)}">삭제</button></div></article>`;
    }).join('')}</div>` : '<p class="muted">등록된 신청기관이 없습니다. 기관명을 입력하고 추가하세요.</p>'}</div>
    ${editing ? applicantDocumentView(editing) : ''}
    ${editing ? applicantEditorView(editing) : ''}`;
}

// 기존 기관 문서에서 정보를 뽑아 ‘업데이트 후보’로만 만든다. 사용자가 반영을 눌러야 기관 정보가 바뀐다.
function applicantDocumentView(applicant) {
  const review = state.applicantExtraction?.applicantId === applicant.id ? state.applicantExtraction : null;
  return `<div class="card"><div class="card-title"><div><h3>기관 문서에서 정보 추출</h3><span>사업계획서·결과보고서·기관소개서를 넣으면 기관정보 업데이트 후보를 만듭니다. 기존 정보는 자동으로 덮어쓰지 않습니다.</span></div></div>
    <div class="field"><label for="applicant-doc-file">기관 문서 파일 (PDF·DOCX·TXT·HWPX)</label><input type="file" id="applicant-doc-file" accept=".pdf,.docx,.txt,.hwpx"><small class="muted">HWP는 한/글에서 HWPX·PDF·DOCX로 저장한 뒤 올려 주세요.</small></div>
    <div class="field"><label for="applicant-doc-text">또는 문서 내용 붙여넣기</label><textarea id="applicant-doc-text" style="min-height:110px" placeholder="예) 기관명: 사단법인 ○○센터 / 상근 인력: 5명 / 2025년 청소년 마음건강 지원사업">${escapeHtml(state.applicantDocDraft)}</textarea></div>
    <div class="actions" style="margin:0"><span class="muted">${escapeHtml(review ? `${review.documentName || '붙여넣은 문서'} · 문서 기준시점 ${review.documentAsOf || ASOF_UNKNOWN}` : '외부 AI 호출 없이 규칙 기반으로 추출합니다.')}</span><button class="button primary" id="extract-applicant-doc">업데이트 후보 만들기</button></div>
    <div class="actions" style="margin-top:14px"><span class="muted">자료보관함에 저장된 과거 사업계획서는 다시 업로드하지 않고 바로 사용할 수 있습니다.</span><button class="button secondary" id="load-applicant-archive">보관함 계획서 목록</button></div>
    ${state.archiveProposals.length ? `<div class="requirement-list">${state.archiveProposals.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(archiveStageLabel(item.stage))}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(new Date(item.updatedAt).toLocaleDateString('ko-KR'))} 저장</small></div></div><button class="button secondary" data-applicant-archive="${escapeHtml(item.id)}">이 계획서에서 기관 정보 추출</button></article>`).join('')}</div>` : ''}
    ${review ? candidateReviewView(review) : ''}</div>`;
}

// 두 화면(신청기관 정보·검증 결과)이 같은 후보 목록 UI를 쓴다.
function candidateReviewView(review) {
  const kindTag = { 신규: 'status 확인-필요', '누적 추가': 'status 확인-필요', 동일: 'status 충족', '변경 가능성': 'status 부분-충족', 충돌: 'status 미충족', '이전 시점 정보': 'status 부분-충족' };
  return `<div class="actions" style="margin-top:12px"><strong>업데이트 후보 ${review.candidates.length}건</strong><button class="button secondary" id="apply-safe-candidates">신규·누적·근거 추가만 일괄 반영</button></div>
    ${review.candidates.length ? `<div class="requirement-list">${review.candidates.map(candidate => `<article class="requirement"><div><span class="${kindTag[candidate.kind] || 'tag'}">${escapeHtml(candidate.kind)}</span><div><strong>${escapeHtml(areaTitle(candidate.area))} · ${escapeHtml(candidate.label)}</strong>
      <small>새 정보: ${escapeHtml(candidate.value)}</small>
      <small>기존 정보: ${escapeHtml(candidate.existingItemId ? `${candidate.existingValue} (${candidate.existingStatus})` : '기관 정보에 없음')}</small>
      <small>기준시점: ${escapeHtml(candidate.asOf || ASOF_UNKNOWN)} · ${escapeHtml(candidate.action)}</small>
      ${candidate.excerpt ? `<small>문서 근거: ${escapeHtml(candidate.excerpt)}</small>` : ''}</div></div>
      <div class="actions" style="margin:0;gap:8px"><button class="button secondary" data-apply-candidate="${escapeHtml(candidate.id)}">${candidate.kind === '동일' ? '근거 추가' : '반영'}</button><button class="button secondary" data-ignore-candidate="${escapeHtml(candidate.id)}">무시</button></div></article>`).join('')}</div>`
    : '<p class="muted">문서에서 기관 정보 후보를 찾지 못했습니다. 항목을 직접 등록하세요.</p>'}`;
}

// 검증·코칭에 넣은 계획서를 신청기관 정보 보강에도 재사용한다. 추가 AI 호출은 하지 않는다.
function coachingApplicantView() {
  if (!state.coaching.text.trim()) return '';
  const targetId = state.applicants.some(item => item.id === state.coachingApplicantId) ? state.coachingApplicantId : state.selectedApplicantId;
  const applicant = findApplicant(state.applicants, targetId);
  const review = applicant && state.applicantExtraction?.applicantId === applicant.id ? state.applicantExtraction : null;
  return `<div class="card"><div class="card-title"><div><h3>이 계획서로 신청기관 정보 보강</h3><span>검증한 계획서에서 기관 사실만 규칙 기반으로 뽑습니다. 추가 AI 호출 없이 동작하며 개인 신상정보는 수집하지 않습니다.</span></div></div>
    ${state.applicants.length ? `<div class="two-col"><div class="field"><label for="coaching-applicant-target">반영할 신청기관</label><select id="coaching-applicant-target">${state.applicants.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === targetId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field"><label>&nbsp;</label><button class="button primary" id="harvest-coaching-applicant">계획서에서 기관 정보 추출</button></div></div>
    <p class="muted">과거 문서의 인력·주소·협력기관은 현재값으로 자동 변경하지 않습니다. 사업실적은 연도별로 누적하고, 기존과 다른 값은 이력·확인 대상으로만 남깁니다.</p>
    ${review ? candidateReviewView(review) : ''}` : '<p class="muted">등록된 신청기관이 없습니다. 상단 「신청기관 정보」에서 기관을 먼저 등록하세요.</p>'}</div>`;
}

// 현재 기관 프로필과 사업·실적 이력을 나눠 본다. 같은 항목 구조만 사용한다.
function applicantScopeView(applicant) {
  const split = splitApplicantProfile(applicant);
  if (!split.profile.length && !split.history.length) return '';
  const line = item => `<div><span>${escapeHtml(areaTitle(item.area))} · ${escapeHtml(item.status)}</span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(String(item.value).slice(0, 60))} · 기준시점 ${escapeHtml(item.asOf || ASOF_UNKNOWN)}${(item.history || []).length ? ` · 이력 ${item.history.length}건` : ''}</small></div>`;
  return `<details class="card org-details" open><summary>현재 기관 프로필 ${split.profile.length}건 · 사업·실적 이력 ${split.history.length}건(사업 ${split.projects.length}건)</summary>
    <p class="muted">현재 프로필의 ‘확인됨’ 정보만 계획서 작성·검증에 사실로 사용합니다. 사업·실적 이력은 수행 실적 근거로만 인용하며, 지난 사업의 인원·회기·기간·예산을 이번 사업 값으로 옮기지 않습니다.</p>
    <h4>현재 기관 프로필</h4><div class="cap-grid">${split.profile.map(line).join('') || '<div><span>없음</span><strong>등록된 현재 정보 없음</strong><small>기관명·대표자·인력·시설 등을 등록하세요</small></div>'}</div>
    <h4>사업·실적 이력</h4>${split.projects.length ? split.projects.map(project => `<div><b>${escapeHtml(project.year || '연도 확인 필요')}</b> · 출처 ${escapeHtml(String(project.source).slice(0, 60) || '미기록')}<div class="cap-grid">${project.items.map(line).join('')}</div></div>`).join('') : '<p class="muted">등록된 사업 기록이 없습니다.</p>'}</details>`;
}

// 어떤 문서에서 어떤 정보가 들어왔는지 확인한다. 기존 source·asOf·history 구조만 사용한다.
function applicantSourceView(applicant) {
  const groups = itemsBySource(applicant);
  if (!groups.length) return '';
  const performance = areaItems(applicant, 'performance');
  return `<details class="card org-details"><summary>출처별 정보 ${groups.length}곳 · 사업실적 ${performance.length}건</summary>
    <p class="muted">확인됨은 계획서 작성에 그대로 사용하고, 확인 필요·오래된 정보는 값이 전달되지 않습니다.</p>
    <div class="requirement-list">${groups.map(group => `<article class="requirement"><div><span class="tag">확인됨 ${group.confirmed} · 확인 필요 ${group.outdated}</span><div><strong>${escapeHtml(group.source)}</strong><small>${escapeHtml(group.items.map(item => `${areaTitle(item.area)}·${item.label}${item.asOf ? `(${item.asOf})` : ''}`).join(' / '))}</small></div></div></article>`).join('')}</div>
    ${performance.length ? `<h4>사업실적 연도순</h4><div class="cap-grid">${performance.map(item => `<div><span>${escapeHtml(item.asOf || (item.label.match(/(19|20)\d{2}/)?.[0] || ASOF_UNKNOWN))}</span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.status)}${(item.history || []).length ? ` · 이전 기록 ${item.history.length}건` : ''}</small></div>`).join('')}</div>` : ''}</details>`;
}

function applicantEditorView(applicant) {
  return `<div class="card" id="applicant-editor" tabindex="-1"><div class="card-title"><div><h3>${escapeHtml(applicant.name)} 정보 편집</h3><span>각 항목은 확인됨 / 확인 필요 / 오래된 정보로 구분합니다.</span></div><button class="button secondary" id="save-applicant">이 기관 정보 저장</button></div>
    <div class="field"><label for="applicant-name">기관명</label><input id="applicant-name" value="${escapeHtml(applicant.name)}"></div>
    <div class="field"><label for="applicant-note">기관 메모</label><input id="applicant-note" value="${escapeHtml(applicant.note)}" placeholder="예: 2026년 기준 정보"></div>
    ${applicantScopeView(applicant)}
    ${applicantSourceView(applicant)}
    ${APPLICANT_AREAS.map(area => {
      const items = areaItems(applicant, area.key);
      const draft = state.applicantItemDrafts[area.key] || { label: '', value: '', status: '확인 필요', source: '' };
      return `<details class="card org-details" ${items.length ? 'open' : ''}><summary>${escapeHtml(area.title)} · ${items.length}건</summary><p class="muted">${escapeHtml(area.hint)}</p>
        ${items.length ? `<div class="requirement-list">${items.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(item.label || '항목명 없음')}</span>${applicantStatusTag(item.status)}</div>
          <div class="two-col"><div class="field"><label for="label-${escapeHtml(item.id)}">항목명</label><input id="label-${escapeHtml(item.id)}" data-applicant-field="${escapeHtml(item.id)}|label" value="${escapeHtml(item.label)}"></div><div class="field"><label for="status-${escapeHtml(item.id)}">상태</label><select id="status-${escapeHtml(item.id)}" data-applicant-status="${escapeHtml(item.id)}">${statusOptions(item.status)}</select></div></div>
          <div class="field"><label for="value-${escapeHtml(item.id)}">내용</label><textarea id="value-${escapeHtml(item.id)}" data-applicant-field="${escapeHtml(item.id)}|value" style="min-height:70px">${escapeHtml(item.value)}</textarea></div>
          <div class="two-col"><div class="field"><label for="source-${escapeHtml(item.id)}">근거자료·출처</label><input id="source-${escapeHtml(item.id)}" data-applicant-field="${escapeHtml(item.id)}|source" value="${escapeHtml(item.source)}" placeholder="예: 2025 법인등기부등본"></div>
          <div class="field"><label for="asof-${escapeHtml(item.id)}">정보 기준시점</label><input id="asof-${escapeHtml(item.id)}" data-applicant-field="${escapeHtml(item.id)}|asOf" value="${escapeHtml(item.asOf || '')}" placeholder="${escapeHtml(ASOF_UNKNOWN)} (예: 2026 또는 2026-03)"></div></div>
          ${(item.history || []).length ? `<details><summary>이전 기록 ${item.history.length}건</summary><div class="cap-grid">${item.history.map(entry => `<div><span>${escapeHtml(entry.asOf || ASOF_UNKNOWN)}</span><strong>${escapeHtml(entry.value)}</strong><small>${escapeHtml(entry.source || '출처 없음')}</small></div>`).join('')}</div></details>` : ''}
          <div class="actions" style="margin:0"><span></span><button class="button secondary" data-remove-applicant-item="${escapeHtml(item.id)}">항목 삭제</button></div></article>`).join('')}</div>` : '<p class="muted">등록한 항목이 없습니다.</p>'}
        <div class="two-col"><div class="field"><label for="draft-label-${area.key}">새 항목명</label><input id="draft-label-${area.key}" data-applicant-draft="${area.key}|label" value="${escapeHtml(draft.label)}"></div><div class="field"><label for="draft-status-${area.key}">상태</label><select id="draft-status-${area.key}" data-applicant-draft="${area.key}|status">${statusOptions(draft.status)}</select></div></div>
        <div class="field"><label for="draft-value-${area.key}">새 항목 내용</label><textarea id="draft-value-${area.key}" data-applicant-draft="${area.key}|value" style="min-height:70px">${escapeHtml(draft.value)}</textarea></div>
        <div class="field"><label for="draft-source-${area.key}">근거자료·출처</label><input id="draft-source-${area.key}" data-applicant-draft="${area.key}|source" value="${escapeHtml(draft.source)}"></div>
        <div class="actions" style="margin:0"><span></span><button class="button primary" data-add-applicant-item="${area.key}">${escapeHtml(area.title)} 항목 추가</button></div></details>`;
    }).join('')}</div>`;
}

function comparisonRequirements() {
  if (state.analysis?.requirements?.length) return state.analysis.requirements;
  const sourceText = [state.selectedNotice?.detailText || state.sourceText, ...state.manualSources.filter(item => item.extractionStatus === 'success').map(item => item.extractedText)].filter(Boolean).join('\n\n');
  if (sourceText.trim().length < 30) return [];
  return localAnalyze({ sourceText, projectType: typeName(), title: state.project.title }).requirements;
}

function applicantSelectView() {
  const applicant = selectedApplicant();
  return `<div class="page-heading"><div><h2>이번 사업의 신청기관을 선택하세요</h2><p>선택한 기관의 ‘확인됨’ 정보만 마스터 설계와 계획서 작성 요청에 전달합니다.</p></div><div class="actions">${sampleButton('applicant', '[샘플] 기관 보기')}${sampleButton('fit', '[샘플] 적합성 보기')}</div><button class="button secondary" data-open-applicants="1">신청기관 정보 관리</button></div>
    ${applicant ? '' : `<div class="alert warning"><strong>신청기관 선택은 필수가 아닙니다</strong><p>신청기관을 선택하지 않거나 기관 정보가 부족해도 계획서 작성을 진행할 수 있습니다. 확인되지 않은 기관 사실은 AI가 만들지 않고 계획서에 <b>[확인 필요]</b>로 남습니다.</p><div class="actions" style="margin:0"><span></span><button class="button primary" id="skip-applicant">신청기관 없이 계획서 작성 계속 →</button></div></div>`}
    <div class="card"><div class="card-title"><div><h3>등록된 신청기관 ${state.applicants.length}곳</h3><span>공고 정보와 분리해 보관한 기관 정보입니다.</span></div><button class="button secondary" id="load-applicants">보관함에서 불러오기</button></div>
    ${state.applicants.length ? `<div class="requirement-list">${state.applicants.map(item => {
      const confirmed = item.items.filter(value => value.status === CONFIRMED_STATUS).length;
      return `<article class="requirement"><div><span class="tag ${item.id === state.selectedApplicantId ? '' : 'mandatory'}">${item.id === state.selectedApplicantId ? '선택됨' : '미선택'}</span><div><strong>${escapeHtml(item.name)}</strong><small>확인됨 ${confirmed}건 · 확인 필요·오래된 정보 ${item.items.length - confirmed}건</small></div></div><button class="button ${item.id === state.selectedApplicantId ? 'secondary' : 'primary'}" data-select-applicant="${escapeHtml(item.id)}">${item.id === state.selectedApplicantId ? '다시 불러오기' : '이 기관으로 신청'}</button></article>`;
    }).join('')}</div>` : '<div class="empty-state"><div>▣</div><h2>등록된 신청기관이 없습니다</h2><p>기관을 등록하면 확인된 기관 정보를 계획서에 사용할 수 있습니다. 등록하지 않아도 작성은 진행됩니다.</p><button class="button primary" data-open-applicants="1">신청기관 정보 등록</button></div>'}</div>
    ${applicant ? applicantLoadedView(applicant) : ''}
    ${applicant ? applicantFitView(applicant) : ''}
    ${applicant ? projectValuesView(applicant) : ''}
    ${applicant ? applicantQuestionsView(applicant) : ''}
    ${footer({ nextLabel: '사업 선택' })}`;
}

function applicantLoadedView(applicant) {
  const confirmed = confirmedItems(applicant);
  return `<div class="card"><div class="card-title"><div><h3>불러온 신청기관 정보 · ${escapeHtml(applicant.name)}</h3><span>확인된 정보만 계획서 작성에 전달됩니다.</span></div></div>
    <div class="summary-grid">${applicantAreaSummary(applicant).map(area => `<div><span>${escapeHtml(area.title)}</span><strong>${area.confirmed}건 확인됨</strong><small>확인 필요·오래된 정보 ${area.needsCheck}건</small></div>`).join('')}</div>
    <details open><summary>계획서 작성에 전달할 확인된 정보 ${confirmed.length}건</summary><div class="cap-grid">${confirmed.length ? confirmed.map(item => `<div><span>${escapeHtml(areaTitle(item.area))}</span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.value)}</small></div>`).join('') : '<p class="muted">확인됨으로 표시된 정보가 없습니다. 기관 사실은 [확인 필요]로만 처리됩니다.</p>'}</div></details>
    <details><summary>전달하지 않는 확인 필요·오래된 정보 ${applicant.items.length - confirmed.length}건</summary><p class="muted">아래 항목은 항목명만 표시하며 내용은 계획서 작성 요청에 포함하지 않습니다.</p><div class="cap-grid">${applicant.items.filter(item => item.status !== CONFIRMED_STATUS).map(item => `<div><span>${escapeHtml(areaTitle(item.area))}</span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.status)}</small></div>`).join('') || '<p class="muted">없음</p>'}</div></details></div>`;
}

function applicantFitView(applicant) {
  const requirements = comparisonRequirements();
  const comparison = compareNoticeWithApplicant(requirements, applicant);
  state.applicantComparison = comparison;
  if (!requirements.length) return '<div class="card"><h3>공고 × 신청기관 비교</h3><p class="muted">비교할 공고 원문이 아직 없습니다. 공고를 선택하거나 원문을 추가하세요.</p></div>';
  const groups = [
    ['확인된 강점', comparison.confirmedStrengths, '충족'],
    ['신청자격 또는 근거 확인이 필요한 사항', comparison.needsEvidence, '부분-충족'],
    ['기관정보에 없는 사항', comparison.missingFromApplicant, '부족'],
    ['이번 사업에서 새로 결정해야 할 사항', comparison.decideInThisProject, '확인-필요']
  ];
  return `<div class="card"><div class="card-title"><div><h3>공고 × 신청기관 비교</h3><span>AI 호출 없이 공고 원문과 등록 정보만으로 구분합니다.</span></div></div>
    <div class="match-summary">${groups.map(([name, items, status]) => `<div><span class="status ${status}">${escapeHtml(name)}</span><strong>${items.length}</strong></div>`).join('')}</div>
    ${groups.map(([name, items, status]) => `<details ${items.length ? 'open' : ''}><summary>${escapeHtml(name)} ${items.length}건</summary><div class="requirement-list">${items.length ? items.map(item => `<article class="requirement"><div><span class="status ${status}">${escapeHtml(name)}</span><div><strong>${escapeHtml(item.requirement)}</strong><small>${escapeHtml(item.location || '공고 원문')} · ${escapeHtml(item.action)}</small></div></div>${item.matchedItems.length ? `<p class="muted">연결된 기관 정보: ${escapeHtml(item.matchedItems.map(value => `${value.label}(${value.status})`).join(', '))}</p>` : ''}</article>`).join('') : '<p class="muted">해당 항목이 없습니다.</p>'}</div></details>`).join('')}</div>`;
}

function projectValuesView(applicant) {
  const draft = state.projectValueDraft;
  return `<div class="card"><div class="card-title"><div><h3>이번 사업 전용 값</h3><span>기관 원본은 그대로 두고 이번 계획서에만 사용할 값을 지정합니다.</span></div></div>
    <p class="muted">예: 기관 보유 프로그램 12회 → 이번 공모 설계 16회. 이번 사업 값을 지정해도 신청기관 원본 정보는 변경되지 않습니다.</p>
    <div class="two-col"><div class="field"><label for="project-value-item">연결할 기관 정보</label><select id="project-value-item"><option value="">기관 정보와 연결하지 않음</option>${applicant.items.map(item => `<option value="${escapeHtml(item.id)}" ${draft.applicantItemId === item.id ? 'selected' : ''}>${escapeHtml(`${areaTitle(item.area)} · ${item.label}`)}</option>`).join('')}</select></div>
    <div class="field"><label for="project-value-label">항목명</label><input id="project-value-label" value="${escapeHtml(draft.label)}" placeholder="예: 프로그램 회기"></div></div>
    <div class="field"><label for="project-value-value">이번 사업 값</label><input id="project-value-value" value="${escapeHtml(draft.value)}" placeholder="예: 16회"></div>
    <div class="actions" style="margin:0"><span></span><button class="button primary" id="add-project-value">이번 사업 값 추가</button></div>
    ${state.projectValues.length ? `<div class="requirement-list">${state.projectValues.map(item => { const source = applicant.items.find(value => value.id === item.applicantItemId); return `<article class="requirement"><div><span class="tag">이번 사업</span><div><strong>${escapeHtml(item.label)}: ${escapeHtml(item.value)}</strong><small>신청기관 원본: ${escapeHtml(source ? `${source.label} = ${source.value}` : '기관 정보에 없음')} (변경되지 않음)</small></div></div><button class="button secondary" data-remove-project-value="${escapeHtml(item.id)}">삭제</button></article>`; }).join('')}</div>` : '<p class="muted">지정한 이번 사업 값이 없습니다.</p>'}</div>`;
}

function applicantQuestionsView(applicant) {
  const questions = state.missingInformation.length ? state.missingInformation : comparisonRequirements().filter(item => item.mandatory).slice(0, 5).map(item => `“${String(item.requirement).slice(0, 70)}” 요건을 충족하는 신청기관 정보를 확인해 주세요.`);
  const plan = planApplicantQuestions(questions, applicant);
  return `<div class="card"><div class="card-title"><div><h3>부족한 정보만 확인</h3><span>신청기관 정보에서 이미 확인되는 내용은 다시 묻지 않습니다.</span></div></div>
    ${plan.resolved.length ? `<details open><summary>신청기관 정보로 이미 확인된 질문 ${plan.resolved.length}건 · 다시 묻지 않음</summary><div class="requirement-list">${plan.resolved.map(item => `<article class="requirement"><div><span class="tag">확인됨</span><div><strong>${escapeHtml(item.question)}</strong><small>${escapeHtml(item.answer)}</small></div></div></article>`).join('')}</div></details>` : ''}
    ${plan.ask.length ? plan.ask.slice(0, 5).map((question, index) => `<div class="field"><label>${escapeHtml(question)}</label><textarea data-applicant-answer="${index}" data-question="${escapeHtml(question)}">${escapeHtml(state.designAnswers[question] || '')}</textarea></div>`).join('') : '<p class="muted">신청기관 정보만으로 현재 확인이 필요한 질문이 없습니다.</p>'}</div>`;
}


function noticeTrashView() {
  if (!state.noticeTrash.length) return '';
  return `<details class="card org-details"><summary>쓰레기통 ${state.noticeTrash.length}건</summary><div class="requirement-list">${state.noticeTrash.map((item, index) => `<article class="requirement"><div><span class="tag">${escapeHtml(item.sourceLabel)}</span><strong>${escapeHtml(item.title)}</strong></div><span><button class="button secondary" data-restore-notice="${index}">복원</button><button class="button secondary" data-delete-notice-forever="${index}">영구 삭제</button></span></article>`).join('')}</div></details>`;
}

function noticePreviewView() {
  const notice = state.noticePreview;
  if (!notice) return '';
  const primary = notice.parts?.[0] || {};
  const detailText = notice.parts?.map(part => `[${part.sourceLabel}]\n${noticeBodyText(part.bodyHtml)}`).join('\n\n') || '';
  return `<div class="card" id="notice-preview" tabindex="-1"><div class="card-title"><div><h3>공고 자세히 보기</h3><span>아직 계획서 작성 대상으로 선택하지 않았습니다.</span></div><button class="button primary" id="choose-preview-notice">이 공고 선택</button></div><h4>${escapeHtml(notice.title)}</h4><div class="summary-grid"><div><span>신청 기간</span><strong>${escapeHtml(primary.applicationPeriod || '')}</strong></div><div><span>사업 기간</span><strong>${escapeHtml(primary.performancePeriod || '')}</strong></div><div><span>지원 규모·한도</span><strong>${escapeHtml(primary.supportLimit || '')}</strong></div><div><span>첨부파일</span><strong>${notice.attachments?.length || 0}개</strong></div></div><details open><summary>공식 상세 원문</summary><blockquote>${nl(detailText)}</blockquote></details></div>`;
}

function selectedNoticeDetailView() {
  const notice = state.selectedNotice;
  if (!notice?.detailText) return '';
  return `<div class="card" id="selected-notice-detail" tabindex="-1"><div class="card-title"><div><h3>선택한 공고 상세</h3><span>${escapeHtml(notice.sourceLabels?.join(' · ') || '')}</span></div><button class="button primary" id="proceed-selected-notice">선택 완료 · 다음 단계</button></div><h4>${escapeHtml(notice.title)}</h4><div class="summary-grid"><div><span>신청 기간</span><strong>${escapeHtml(notice.applicationPeriod || '공식 원문에 별도 표기 없음')}</strong></div><div><span>사업 기간</span><strong>${escapeHtml(notice.performancePeriod || '공식 원문에 별도 표기 없음')}</strong></div><div><span>지원 규모·한도</span><strong>${escapeHtml(notice.supportLimit || '공식 원문에 별도 표기 없음')}</strong></div><div><span>첨부파일</span><strong>${notice.attachments?.length || 0}개</strong></div></div><details open><summary>공식 상세 원문</summary><blockquote>${nl(notice.detailText)}</blockquote></details></div>`;
}

function sourceTypeOptions(selected) { return SOURCE_TYPES.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join(''); }

function manualSourcesView() {
  return `<div class="card"><div class="card-title"><div><h3>직접 자료 추가</h3><span>PDF · DOCX · TXT / HWP·HWPX는 PDF 변환 안내</span></div></div>
    <div class="two-col"><div class="field"><label for="manual-source-type">기본 자료 유형</label><select id="manual-source-type">${sourceTypeOptions(state.manualSourceType)}</select><label class="dropzone" for="manual-source-files"><strong>여러 파일을 선택하세요</strong><small>자료별 유형은 추가 후 변경할 수 있습니다.</small><input id="manual-source-files" type="file" accept=".pdf,.docx,.txt,.hwp,.hwpx" multiple></label></div>
    <div><div class="field"><label for="manual-source-name">붙여넣기 자료명</label><input id="manual-source-name" value="${escapeHtml(state.manualSourceName)}" placeholder="예: 2027년 신청서 작성항목"><label for="manual-source-text">원문 직접 붙여넣기</label><textarea id="manual-source-text" class="source-text" placeholder="공문·신청서·예산기준·심사기준 원문을 붙여넣으세요.">${escapeHtml(state.manualSourceText)}</textarea></div><button class="button secondary" id="add-manual-text">붙여넣기 자료 추가</button></div></div>
    ${state.manualSources.length ? `<div class="requirement-list">${state.manualSources.map((item, index) => `<article class="requirement"><div><span class="tag ${item.extractionStatus === 'success' ? '' : 'mandatory'}">${item.extractionStatus === 'success' ? '추출 성공' : '추출 불가'}</span><div><strong>${escapeHtml(item.fileName)}</strong><select data-manual-source-type="${index}">${sourceTypeOptions(item.sourceType)}</select><small>${Number(item.extractedText?.length || 0).toLocaleString()}자${item.extractionError ? ` · ${escapeHtml(item.extractionError)}` : ''}</small><p class="muted">${escapeHtml((item.extractedText || '').slice(0, 180) || '텍스트 미리보기 없음')}</p></div></div><button class="button secondary" data-remove-manual-source="${index}">삭제</button></article>`).join('')}</div>` : '<p class="muted">직접 추가한 자료가 없습니다.</p>'}</div>`;
}

function attachmentView() {
  const attachments = state.selectedNotice?.attachments || [];
  if (!attachments.length) return '';
  return `<div class="card"><div class="card-title"><div><h3>공식 첨부파일</h3><span>${state.selectedNotice.officialTextExtracted ? '공고문 텍스트 반영 완료' : '안내 페이지 내용만 반영됨'}</span></div></div><div class="requirement-list">${attachments.map((file, index) => {
    const type = attachmentType(file.name, file.fileType);
    const supported = ['PDF', 'DOCX', 'TXT'].includes(type);
    const hwp = ['HWP', 'HWPX'].includes(type);
    return `<article class="requirement"><div><span class="tag">${escapeHtml(type)}</span><strong>${escapeHtml(file.name)}</strong>${hwp ? '<small>공식 한글 양식 파일 · 한글 프로그램에서 PDF로 저장한 뒤 다시 업로드하면 공고문 내용을 분석할 수 있습니다.</small>' : type === 'ZIP' ? '<small>ZIP 내부 자동 해제는 지원하지 않습니다.</small>' : type === 'UNSUPPORTED' ? '<small>지원하지 않는 파일 형식입니다.</small>' : ''}</div><span><button class="button secondary" data-download-attachment="${index}">원본 다운로드</button>${supported ? `<button class="button primary" data-extract-attachment="${index}">내용 추출</button>` : ''}</span></article>`;
  }).join('')}</div></div>`;
}

export function attachmentType(name, provided = '') {
  if (['PDF', 'DOCX', 'TXT', 'HWP', 'HWPX', 'ZIP', 'UNSUPPORTED'].includes(provided)) return provided;
  const extension = String(name || '').split('.').pop()?.toLowerCase();
  return ({ pdf: 'PDF', docx: 'DOCX', txt: 'TXT', hwp: 'HWP', hwpx: 'HWPX', zip: 'ZIP' })[extension] || 'UNSUPPORTED';
}

function analysisView() {
  const a = state.analysis;
  if (!a) return `<div class="empty-state"><div>⌕</div><h2>분석 결과가 없습니다</h2><p>기관 원문 단계에서 분석을 시작해 주세요.</p><button class="button primary" data-step="1">원문 입력으로 이동</button></div>`;
  return `<div class="page-heading"><div><h2>요구사항 분석 결과</h2><p>AI 분석은 보조 도구입니다. 원문 근거를 열어보고 확정하세요.</p></div><span class="mode ${a.mode === 'ai' ? 'ai' : ''}">${a.mode === 'ai' ? 'AI 구조 분석' : '로컬 규칙 분석'}</span></div>
    <div class="summary-grid"><div><span>발주기관</span><strong>${escapeHtml(a.project.issuer)}</strong></div><div><span>제출 마감</span><strong>${escapeHtml(a.project.deadline)}</strong></div><div><span>예산</span><strong>${escapeHtml(a.project.budget)}</strong></div><div><span>요구사항</span><strong>${a.requirements.length}개</strong></div></div>
    ${a.warnings?.length ? `<div class="alert warning"><strong>검토 경고</strong>${a.warnings.map(v => `<p>${escapeHtml(v)}</p>`).join('')}</div>` : ''}
    <div class="card table-card" id="result-analysis" tabindex="-1"><div class="card-title"><h3>필수 조건과 요구사항</h3><span>근거 추적 포함</span></div><div class="requirement-list">${a.requirements.map(r => `<article class="requirement"><div><span class="tag ${r.mandatory ? 'mandatory' : ''}">${r.mandatory ? '필수' : r.category}</span><strong>${escapeHtml(r.requirement)}</strong></div><details><summary>원문 근거 보기 · ${escapeHtml(r.location || '위치 확인 필요')}</summary><blockquote>${escapeHtml(r.evidence || '근거 문장 확인 필요')}</blockquote></details></article>`).join('')}</div></div>
    <div class="three-col"><div class="card mini"><h3>평가 기준</h3>${listOrEmpty(a.evaluationCriteria)}</div><div class="card mini"><h3>제출 항목</h3>${listOrEmpty(a.submissionItems)}</div><div class="card mini"><h3>확인 질문</h3><p class="metric">${a.questions?.length || 0}<small>건</small></p></div></div>${footer()}`;
}

function listOrEmpty(items = []) { return items.length ? `<ul>${items.map(v => `<li>${escapeHtml(typeof v === 'string' ? v : v.name || v.criterion)}</li>`).join('')}</ul>` : '<p class="muted">원문에서 확인되지 않음</p>'; }
function buildMatches() {
  const caps = confirmedItems(selectedApplicant()).map(item => ({ title: item.label, content: item.value, category: areaTitle(item.area) }));
  return state.analysis.requirements.map(r => {
    const tokens = r.requirement.replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/).filter(v => v.length > 1);
    const found = caps.filter(c => tokens.some(t => `${c.title} ${c.content} ${c.category}`.includes(t))).slice(0, 3);
    return { requirementId: r.id, requirement: r.requirement, evidence: r.location, capability: found.map(v => v.title).join(', ') || '사용자 확정 대응 정보 없음', status: found.length ? '부분 충족' : '확인 필요', action: found.length ? '증빙과 적용 범위 확인' : '담당자 확정 또는 증빙 필요' };
  });
}

function matchView() {
  const matches = state.matches.length ? state.matches : buildMatches();
  const counts = ['충족', '부분 충족', '확인 필요', '부족'].map(s => [s, matches.filter(v => v.status === s).length]);
  return `<div class="page-heading"><div><h2>기관 요구와 우리 역량 비교</h2><p>사용자가 확정 저장한 회사 정보만 연결했습니다. 실적·인력·예산은 확정 전까지 사용하지 않습니다.</p></div></div>
    <div class="match-summary">${counts.map(([name, count]) => `<div><span class="status ${name.replace(' ', '-')}">${name}</span><strong>${count}</strong></div>`).join('')}</div>
    <div class="card table-card"><div class="responsive-table"><table><thead><tr><th>기관 요구사항</th><th>마인드스토리 정보</th><th>판정</th><th>후속 조치</th></tr></thead><tbody>${matches.map(m => `<tr><td><strong>${escapeHtml(m.requirement)}</strong><small>${escapeHtml(m.evidence)}</small></td><td>${escapeHtml(m.capability)}</td><td><span class="status ${m.status.replace(' ', '-')}">${m.status}</span></td><td>${escapeHtml(m.action)}</td></tr>`).join('')}</tbody></table></div></div>
    <details class="card org-details"><summary>사용자 확정 회사 정보 ${state.companyFacts.length}건 보기</summary><div class="cap-grid">${state.companyFacts.length ? state.companyFacts.map(c => `<div><span>${escapeHtml(c.category)}</span><strong>${escapeHtml(c.title)}</strong><small>${escapeHtml(c.content)}</small></div>`).join('') : '<p class="muted">확정 저장된 회사 정보가 없습니다.</p>'}</div></details>${footer()}`;
}

function questionsView() {
  const questions = state.answers.length ? state.answers : (state.analysis?.questions || []);
  return `<div class="page-heading"><div><h2>확인이 필요한 정보</h2><p>답을 모르면 비워 두세요. 문서에는 사실을 만들지 않고 ‘확인 필요’로 표시합니다.</p></div><span class="progress-text">${questions.filter(q => q.answer).length} / ${questions.length} 답변</span></div>
    <div class="questions">${questions.length ? questions.map((q, i) => `<div class="card question"><div><span>${q.required ? '필수 확인' : '권장 확인'}</span><strong>${escapeHtml(q.question)}</strong></div><textarea data-answer="${i}" placeholder="확인된 사실과 증빙만 입력하세요. 모르면 비워 두세요.">${escapeHtml(q.answer || '')}</textarea></div>`).join('') : '<div class="empty-state"><div>✓</div><h2>추가 질문이 없습니다</h2><p>그래도 인력·실적·예산 증빙은 최종 제출 전에 확인하세요.</p></div>'}</div>${footer({ nextLabel: '사업계획서 초안 생성', nextId: 'draft' })}`;
}

function documentView() {
  const strategy = strategyView();
  const questions = designQuestionsView();
  if (!state.sections.length) return `${strategy}${questions}${stagedGenerationView()}${state.designUnavailable ? `<div class="empty-state"><div>▤</div><h2>AI 정밀 사업설계를 실행할 수 없음</h2><p>공고 자료 분석은 완료되었지만 AI 정밀 사업설계를 실행하지 못했습니다. 아래에는 공식 원문에서 직접 추출한 사실만 표시합니다.</p>${directFactsView()}</div>` : ''}`;
  const completionMode = state.step === STEPS.length - 1;
  const toolbarActions = completionMode
    ? `${sampleButton('final', '[샘플] 완성본 보기')}<button class="button secondary" id="save-proposal-archive">자료보관함에 저장</button><button class="button secondary" id="proposal-review">${state.reviewResult ? '명시적으로 재검토' : '심사 검토·고도화'}</button><button class="button secondary" id="print">인쇄</button><button class="button secondary" id="pdf">PDF 인쇄·저장</button><button class="button primary" id="docx">검토용 DOCX</button>`
    : `${sampleButton('draftV1', '[샘플] V1 보기')}<button class="button secondary" id="save-proposal-archive">자료보관함에 저장</button><button class="button primary" id="go-to-review">검토·완성으로 이동 →</button>`;
  return `${strategy}${questions}${proposalPipelineView()}${decisionCenterView()}${draftBlueprintCheckView()}${assemblyCheckView()}<div class="document-toolbar"><div><h2>${escapeHtml(state.project.title || '사업계획서 검토본')}</h2><p><span class="mode">신청기관 ${escapeHtml(selectedApplicant()?.name || '미선택')}</span> ${(state.proposalVersions || [])[0]?.source === EXTERNAL_SOURCE ? '<span class="mode">외부 계획서 작업본 · 원본 보존</span> ' : ''}<span class="mode">${state.selectedNotice?.officialTextExtracted ? '공고문 반영 초안' : '안내 페이지 기반 임시 초안'}</span> <span class="mode ${state.aiMode === 'ai' ? 'ai' : ''}">${state.aiMode === 'ai' ? 'AI 정밀 사업설계' : '로컬 사실 추출'}</span> ${completionMode ? '심사 검토와 출력 전 최종 편집을 진행하세요. DOCX는 공식 신청서 양식이 아닌 검토본입니다.' : '필요한 질문을 확인하고 초안을 편집하세요.'}</p></div><div>${toolbarActions}</div></div>
    ${completionMode ? finalSubmissionView() : ''}
    ${completionMode ? proposalReviewView() : ''}
    ${revisionPlanView()}
    <div class="editor-layout"><aside class="outline">${state.sections.map((s, i) => `<a href="#section-${i}"><span>${i + 1}</span>${escapeHtml(s.title.replace(/^\d+[.)]?\s*/, ''))}</a>`).join('')}</aside><div class="paper">${state.sections.map((s, i) => `<section id="section-${i}" class="doc-section"><div class="section-head"><input data-section-title="${i}" value="${escapeHtml(s.title)}"><span class="status ${s.status?.replace(' ', '-')}">${escapeHtml(s.status || '검토 필요')}</span></div><textarea data-section-content="${i}">${escapeHtml(s.content)}</textarea><div class="section-meta"><span>근거 ${s.citations?.length || 0}개</span><span><button data-confirm-fact="${i}">회사 정보로 확정 저장</button><button data-rewrite="${i}">이 항목 재작성</button></span></div>${sectionCoachingView(s)}${s.citations?.length ? `<details><summary>반영한 원문 근거</summary>${s.citations.map(id => { const r = (state.analysis?.requirements || []).find(v => v.id === id); return r ? `<blockquote>${escapeHtml(r.evidence)} <small>${escapeHtml(r.location)}</small></blockquote>` : ''; }).join('')}</details>` : ''}</section>`).join('')}</div></div>`;
}

// 검증·코칭에서 전달받은 수정 요청. 실제 재작성은 「계획서 쓰기」에서 한다.
function revisionPlanView() {
  // 예전 버전에서 저장된 수정 요청이 남아 있어도 화면 전체가 멈추지 않게 한다.
  const raw = state.revisionPlan;
  const plan = raw?.items && raw.verdict ? raw : null;
  const versions = state.proposalVersions || [];
  if (!plan && !versions.length) return '';
  const versionList = versions.length ? `<details ${plan ? '' : 'open'}><summary>저장된 계획서 버전 ${versions.length}개</summary><div class="requirement-list">${versions.map(item => `<article class="requirement"><div><span class="tag">V${item.version}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(String(item.savedAt).slice(0, 16).replace('T', ' '))} · ${escapeHtml(item.source)}${item.verdict ? ` · ${escapeHtml(item.verdict)}` : ''}</small></div></div><button class="button secondary" data-restore-version="${item.version}">이 버전 내용으로 되돌리기</button>${item.originalText ? `<details><summary>업로드 원문 보기 (수정되지 않음)</summary><blockquote style="max-height:240px;overflow:auto;white-space:pre-wrap">${escapeHtml(item.originalText)}</blockquote></details>` : ''}</article>`).join('')}</div></details>` : '';
  if (!plan) return `<div class="card"><div class="card-title"><div><h3>계획서 버전</h3><span>수정해도 이전 버전은 지우지 않습니다.</span></div></div>${versionList}</div>`;
  return `<div class="card"><div class="card-title"><div><h3>검증·코칭 v${plan.fromVersion} 수정 요청 ${plan.items.length}건</h3><span>내부 판정 ${escapeHtml(plan.verdict.verdict)} · 전달받은 위치만 수정합니다.</span></div><div><button class="button secondary" id="discard-revision-plan">수정 요청 닫기</button><button class="button secondary" id="save-revision-version">수정본 버전 저장</button><button class="button primary" id="send-revision-to-coaching">다시 검증하기</button></div></div>
    <p class="muted">${escapeHtml(plan.writerRule)}</p>
    ${plan.lockedValues.length ? `<p><b>변경 금지 확정값</b> ${escapeHtml(plan.lockedValues.join(' · '))}</p>` : ''}
    ${plan.verdict.needsConfirmation.length ? `<p><b>사용자 확인 필요</b> ${escapeHtml(plan.verdict.needsConfirmation.join(' · '))}</p>` : ''}
    <div class="requirement-list">${plan.items.map(item => `<article class="requirement"><div><span class="tag mandatory">${escapeHtml(item.priority)}</span><div><strong>${escapeHtml(item.location)}</strong><small>${escapeHtml(item.problem)} · 대상 항목 ${escapeHtml(item.sectionId ? sectionTitleById(item.sectionId) : '자동 연결 실패 · 직접 선택')}</small></div><span class="status ${item.status === '수정 완료' ? '충족' : '확인-필요'}">${escapeHtml(item.status)}</span></div>
      <p><b>문제가 되는 이유</b> ${escapeHtml(item.reason)}</p><p><b>개선 방향</b> ${escapeHtml(item.direction)}</p>
      ${item.evidence.length ? `<details><summary>근거 ${item.evidence.length}건</summary>${item.evidence.map(ref => `<blockquote><b>${escapeHtml(ref.sourceName)}</b> ${escapeHtml(ref.pageOrSection)}<br>${escapeHtml(ref.excerpt)}</blockquote>`).join('')}</details>` : '<p class="muted">확인된 근거가 없어 사실을 새로 만들 수 없습니다. [확인 필요]로 남기세요.</p>'}
      ${item.confirmation ? `<p><b>확인 필요</b> ${escapeHtml(item.confirmation)}</p>` : ''}
      ${item.lockedValues.length ? `<p><b>이 위치에서 유지할 값</b> ${escapeHtml(item.lockedValues.join(' · '))}</p>` : ''}
      <div class="actions" style="margin:0;gap:8px"><span>${escapeHtml(item.example ? `참고 예시: ${item.example.slice(0, 120)}` : '')}</span><span><select data-revision-section="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.location)} 대상 항목"><option value="">대상 항목 선택</option>${state.sections.map(section => `<option value="${escapeHtml(section.id)}" ${section.id === item.sectionId ? 'selected' : ''}>${escapeHtml(section.title)}</option>`).join('')}</select><button class="button secondary" data-revision-rewrite="${escapeHtml(item.id)}" ${item.sectionId ? '' : 'disabled'}>이 항목 AI 수정</button><button class="button secondary" data-revision-done="${escapeHtml(item.id)}">수정 완료 표시</button></span></div></article>`).join('')}</div>
    ${versionList}</div>`;
}

function sectionTitleById(id) { return state.sections.find(section => section.id === id)?.title || id; }

function sectionCoachingView(section) {
  const items = handoffItemsForSection(state.revisionPlan, section);
  if (!items.length) return '';
  return `<details open class="org-details"><summary>검증·코칭 수정 요청 ${items.length}건</summary>${items.map(item => `<blockquote><b>${escapeHtml(item.priority)} · ${escapeHtml(item.problem)}</b><br>이유: ${escapeHtml(item.reason)}<br>개선 방향: ${escapeHtml(item.direction)}${item.lockedValues.length ? `<br>유지할 값: ${escapeHtml(item.lockedValues.join(' · '))}` : ''}</blockquote>`).join('')}</details>`;
}

// 남은 사용자 결정 항목을 한 화면에 모은다. 사용자가 확정한 값만 이번 사업 값으로 저장한다.
const DECISION_FIELDS = [
  { key: 'headcount', label: '참여인원 확정', hint: '공고 기준과 현재 설계값이 다르면 이번 사업의 확정 인원을 적어 주세요.', conflictField: '인원' },
  { key: 'sessions', label: '회기 확정', hint: '초기면접·사례회의·사후점검을 포함한 1인당 회기를 적어 주세요.', conflictField: '회기' },
  { key: 'staff', label: '기관 자격·수행인력', hint: '개입 자격 증빙과 담당 인력(자격·인원·전담 여부)을 적어 주세요.', blueprintKey: 'delivery' },
  { key: 'partners', label: '협력체계', hint: '협력기관명과 협약·연계 상태를 적어 주세요.', blueprintKey: 'partners' },
  { key: 'regionalNeed', label: '지역 필요성 근거', hint: '지역 사례 규모·욕구·서비스 공백을 보여 주는 통계나 조사 출처를 적어 주세요.', blueprintKey: 'problem' },
  { key: 'outcomeGoals', label: '성과목표 수치', hint: '대상 수·변화 정도 등 목표치를 적어 주세요.', blueprintKey: 'outcomeGoals' },
  { key: 'indicators', label: '성과지표·측정도구', hint: '사용할 척도명과 측정 시점을 적어 주세요.', blueprintKey: 'indicators' },
  { key: 'budget', label: '예산 총액·산출근거', hint: '총 사업비와 항목별 수량×단가×횟수를 적어 주세요.', blueprintKey: 'budget' },
  { key: 'submissionDocs', label: '제출서류 준비', hint: '신청기관현황·점검표·증빙서류 준비 상태를 적어 주세요.' }
];

function decisionCenterView() {
  if (!state.sections.length) return '';
  const blueprint = currentBlueprint();
  const conflicts = currentOfficialConflicts();
  const plans = currentRepairPlans().filter(plan => plan.repairLevel === 'USER_CONFIRMATION');
  const openTitles = new Set((blueprint?.items || []).filter(item => item.status === 'NEEDS_CONFIRMATION').map(item => item.key));
  const rows = DECISION_FIELDS.map(field => {
    const value = blueprintValueOf(field.key);
    const conflict = conflicts.find(item => item.field === field.conflictField);
    const open = conflict || (field.blueprintKey ? openTitles.has(field.blueprintKey) : !value);
    return { ...field, value, conflict, open: Boolean(open) && !value };
  });
  const remaining = rows.filter(row => row.open).length + plans.filter(plan => !String(state.coaching.repairAnswers?.[plan.id] || '').trim()).length;
  return `<div class="card" id="decision-center"><div class="card-title"><div><h3>남은 사용자 결정 ${remaining}건</h3><span>여기서 확정한 값만 계획서에 반영합니다. 확정 전에는 어떤 값도 자동으로 바꾸지 않습니다.</span></div><button class="button primary" id="build-final-version" ${remaining === rows.filter(row => row.open || row.value).length ? '' : ''}>확정값 반영해 최종본 만들기</button></div>
    <div class="requirement-list">${rows.map(row => `<article class="requirement"><div><span class="status ${row.value ? '충족' : row.conflict ? '부족' : '확인-필요'}">${row.value ? '확정됨' : row.conflict ? '공식요건 충돌' : '확인 필요'}</span><div><strong>${escapeHtml(row.label)}</strong>
      ${row.conflict ? `<small>공고 ${escapeHtml(row.conflict.officialValue)} vs 현재 ${escapeHtml(row.conflict.userValue)} — 어느 쪽으로 확정할지 정해 주세요.</small><small class="muted">공고 근거: ${escapeHtml(String(row.conflict.officialEvidence.sentence).slice(0, 120))}</small>` : `<small>${escapeHtml(row.hint)}</small>`}
      ${row.value ? `<small class="muted">현재 확정값: ${escapeHtml(row.value)}</small>` : ''}</div></div>
      <div class="two-col" style="margin:10px 0 0 64px"><div class="field" style="margin:0"><label for="decision-${row.key}">확정값 입력</label><input id="decision-${row.key}" data-decision-input="${row.key}" value="${escapeHtml(row.value)}" placeholder="확인된 사실만 입력하세요. 모르면 비워 두세요."></div><div class="field" style="margin:0"><label>&nbsp;</label><button class="button secondary" data-decision-save="${row.key}">이 값으로 확정</button></div></div></article>`).join('')}</div>
    ${plans.length ? `<details><summary>검증에서 확인을 요청한 수정 ${plans.length}건</summary><p class="muted">아래 수정계획 카드에서 값을 입력하면 해당 문단만 수정합니다. 입력 전에는 수정하지 않습니다.</p></details>` : ''}</div>`;
}

// 사용자가 확정한 값만 반영한 최종본을 새 버전으로 만든다. 이전 버전은 그대로 남는다.
function buildFinalVersion() {
  const confirmed = (state.projectValues || []).filter(item => item.blueprintKey && DECISION_FIELDS.some(field => field.key === item.blueprintKey));
  const answers = Object.fromEntries(Object.entries(state.coaching.repairAnswers || {}).filter(([, value]) => String(value).trim()));
  if (!confirmed.length && !Object.keys(answers).length) return setState({ error: '확정된 값이 없습니다. 남은 결정 항목에 값을 입력한 뒤 다시 시도해 주세요.' });
  const plans = currentRepairPlans();
  const run = applyRepairPlans(state.sections, plans, { confirmations: answers });
  const confirmedBlock = confirmed.map(item => `${item.label}: ${item.value}`).join('\n');
  const sections = run.sections.map(section => section.id === 'goals' && confirmedBlock
    ? { ...section, content: `${section.content}\n\n[확정 사항]\n${confirmedBlock}` }
    : section);
  state.sections = sections;
  state.proposalVersions = appendProposalVersion(state.proposalVersions || [], { sections, label: '사용자 확정 반영 최종본', source: '사용자 확정' });
  const version = state.proposalVersions[state.proposalVersions.length - 1].version;
  setState({
    sections, proposalVersions: state.proposalVersions,
    notice: `확정값 ${confirmed.length}건${run.applied.length ? ` · 수정계획 ${run.applied.length}건` : ''}을 반영해 V${version}을 만들었습니다. 확인 필요 ${run.questions.length}건은 그대로 두었습니다. 이전 버전은 보존됩니다.`,
    error: ''
  });
  void archiveCurrentProposal(`final-v${version}`).catch(() => {});
}

// 최종 제출본 보기. 제출 가능 여부는 남은 확인 항목으로만 판단하고 임의로 올리지 않는다.
function finalSubmissionView() {
  if (!state.sections.length) return '';
  const conflicts = currentOfficialConflicts();
  const pending = currentRepairPlans().filter(plan => plan.repairLevel === 'USER_CONFIRMATION');
  const marks = state.sections.reduce((sum, section) => sum + (String(section.content).match(/\[확인 필요[^\]]*\]/g) || []).length, 0);
  const ready = conflicts.length === 0 && pending.length === 0 && marks === 0;
  return `<div class="card" id="final-submission"><div class="card-title"><div><h3>최종 제출본</h3><span>제출 가능 여부는 남은 확인 항목으로 판단합니다. 임의로 제출 가능으로 올리지 않습니다.</span></div><strong>${ready ? '제출 검토 가능' : '제출 전 확인 필요'}</strong></div>
    <div class="summary-grid"><div><span>공식요건 충돌</span><strong>${conflicts.length}건</strong><small>확정 전 제출 불가</small></div>
    <div><span>확인 요청 수정</span><strong>${pending.length}건</strong><small>사용자 입력 대기</small></div>
    <div><span>[확인 필요] 표기</span><strong>${marks}곳</strong><small>본문에 남은 자리</small></div>
    <div><span>버전</span><strong>V${(state.proposalVersions || []).length || 1}</strong><small>이전 버전 보존</small></div></div>
    <p class="muted">${ready ? '남은 확인 항목이 없습니다. 출력물은 검토본이며 공식 신청서 양식이 아닙니다.' : '남은 항목이 있어도 검토본 출력은 가능합니다. 제출 전에 위 항목을 확정하세요.'}</p>
    <div class="actions"><span></span><div><button class="button secondary" id="final-print">인쇄</button><button class="button secondary" id="final-pdf">PDF 인쇄·저장</button><button class="button primary" id="final-docx">검토용 DOCX</button></div></div></div>`;
}

// V1 → 검증 → 수정계획 → V2 → 재검증 진행 상태. 새 메뉴 없이 작성 화면 안에서 단계만 구분해 보여준다.
function proposalPipelineView() {
  if (!state.sections.length) return '';
  const versions = state.proposalVersions || [];
  const baseline = versions.find(item => item.version === 1) || null;
  const latest = versions.length ? versions[0] : null;
  const plans = currentRepairPlans();
  const summary = plans.length ? repairPlanSummary(plans) : null;
  const pending = plans.filter(plan => plan.repairLevel === 'USER_CONFIRMATION');
  const unresolved = state.draftReview?.unresolvedItems?.length || 0;
  const conflicts = currentOfficialConflicts();
  const step = (name, done, detail) => `<div><span>${escapeHtml(name)}</span><strong>${done ? '완료' : '대기'}</strong><small>${escapeHtml(detail)}</small></div>`;
  return `<div class="card" id="result-pipeline" tabindex="-1"><div class="card-title"><div><h3>계획서 진행 상태</h3><span>V1 원문은 보존하고 수정본은 새 버전으로만 쌓습니다.</span></div><strong>${escapeHtml(state.coaching.result ? coachingVerdict(state.coaching.result).verdict : '검증 전')}</strong></div>
    <div class="summary-grid">
    ${step('V1 초안', state.sections.length === 10, baseline ? `${baseline.label} · ${String(baseline.savedAt).slice(0, 10)}` : '현재 작성본')}
    ${step('검증 결과', Boolean(state.coaching.result), state.coaching.result ? `문제 ${(state.coaching.result.issues || []).length}건 · v${state.coaching.version}` : '검증·코칭 미실행')}
    ${step('수정계획', plans.length > 0, summary ? `자동 ${summary.byLevel.AUTO || 0} · 근거확인 ${summary.byLevel.EVIDENCE_BASED || 0} · 사용자확인 ${summary.byLevel.USER_CONFIRMATION || 0}` : '검증 후 생성')}
    ${step('V2 수정본', versions.some(item => item.version > 1), latest && latest.version > 1 ? `최신 V${latest.version} · ${escapeHtml(latest.label)}` : '아직 없음')}
    </div>
    ${plans.length ? `<details open><summary>수정 상태 ${plans.length}건 — 수정됨 / 근거로 보강됨 / 사용자 확인 필요 / 자료 부족 / 공식요건 충돌</summary><div class="requirement-list">${plans.map(plan => {
      const conflict = plan.conflictingValues?.length >= 2;
      const label = conflict ? '공식요건 충돌' : plan.repairLevel === 'AUTO' ? '수정됨' : plan.repairLevel === 'EVIDENCE_BASED' ? (plan.proposedRevision ? '근거로 보강됨' : '아직 자료 부족') : '사용자 확인 필요';
      const tone = label === '수정됨' ? '충족' : label === '근거로 보강됨' ? '부분-충족' : label === '공식요건 충돌' ? '부족' : '확인-필요';
      return `<article class="requirement"><div><span class="status ${tone}">${label}</span><div><strong>${escapeHtml(plan.issueTypeLabel)} · ${escapeHtml((plan.targetSection || []).map(item => item.title || item.id).join(', ') || '위치 확인 필요')}</strong><small>${escapeHtml(String(plan.problem).slice(0, 160))}</small>${plan.confirmationQuestion ? `<small class="muted">확인 질문: ${escapeHtml(plan.confirmationQuestion)}</small>` : ''}</div></div></article>`;
    }).join('')}</div></details>` : ''}
    <div class="alert ${pending.length || conflicts.length || unresolved ? 'warning' : 'success'}"><strong>남은 확인 필요</strong>
      <p>사용자 확인 필요 수정 ${pending.length}건 · 공고 기준 충돌 ${conflicts.length}건 · [확인 필요] 항목 ${unresolved}개 — 확인 전에는 제출 준비 완료로 올리지 않습니다.</p>
      ${conflicts.map(item => `<p>· ${escapeHtml(item.field)}: 공고 ${escapeHtml(item.officialValue)} vs 확정 ${escapeHtml(item.userValue)}</p>`).join('')}
      ${pending.slice(0, 3).map(plan => `<p>· ${escapeHtml(plan.issueTypeLabel)}: ${escapeHtml(plan.confirmationQuestion || plan.problem)}</p>`).join('')}</div>
    ${versions.length ? `<details><summary>버전 ${versions.length}개 · V1과 이후 수정본 비교</summary><div class="requirement-list">${versions.map(item => `<article class="requirement"><div><span class="tag">V${item.version}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(String(item.savedAt).slice(0, 16).replace('T', ' '))}${item.verdict ? ` · ${escapeHtml(item.verdict)}` : ''}</small></div></div></article>`).join('')}</div></details>` : ''}</div>`;
}

// V1 초안이 설계도를 따랐는지 자동 점검한다. V1 원문은 바꾸지 않는다.
function draftBlueprintCheckView() {
  if (!state.sections.length) return '';
  const blueprint = currentBlueprint();
  if (!blueprint) return '';
  const conflicts = currentOfficialConflicts();
  const report = checkDraftAgainstBlueprint({ blueprint, sections: state.sections, applicant: selectedApplicant(), conflicts });
  const stateClass = { PASS: '충족', 주의: '부분-충족', FAIL: '부족' };
  const draftState = state.draftReview || null;
  const annotated = annotateDraftSections({ blueprint, sections: state.sections });
  const unresolvedSections = annotated.filter(section => section.unresolved);
  return `<div class="card" id="result-draft-check" tabindex="-1"><div class="card-title"><div><h3>설계도 대비 V1 자동 점검</h3><span>V1 원문은 그대로 두고 설계도와 비교만 합니다. 점수를 만들지 않습니다.</span></div><strong>${escapeHtml(report.verdict)}</strong></div>
    <div class="summary-grid"><div><span>신청유형</span><strong>${escapeHtml(report.applicationType || '구분 없음')}</strong><small>선택한 유형만 사용</small></div>
    <div><span>통과</span><strong>${report.byState.PASS}</strong><small>설계도와 일치</small></div>
    <div><span>보완 확인</span><strong>${report.byState['주의']}</strong><small>사람이 확인 필요</small></div>
    <div><span>위반</span><strong>${report.byState.FAIL}</strong><small>설계도와 어긋남</small></div></div>
    ${draftState ? `<div class="alert ${draftState.submissionReady ? 'success' : 'warning'}"><strong>초안 상태 ${escapeHtml(draftState.draftStatus)} · 제출 가능 ${draftState.submissionReady ? '예' : '아니오'}</strong><p>${escapeHtml(draftState.note || '')}</p>
      ${draftState.warnings?.length ? `<p>모델 자기점검 경고: ${escapeHtml(draftState.warnings.map(item => item.label).join(' · '))} — 초안은 유지하고 사람이 확인합니다.</p>` : ''}
      ${draftState.unresolvedItems?.length ? `<p>[확인 필요] 남은 항목 ${draftState.unresolvedItems.length}개: ${escapeHtml(draftState.unresolvedItems.map(item => `${item.section}(${item.marks})`).join(' · '))}</p>` : ''}</div>` : ''}
    ${conflicts.length ? `<div class="alert danger"><strong>공고 기준과 이번 사업 확정값 충돌 ${conflicts.length}건 · OFFICIAL_REQUIREMENT_CONFLICT</strong><p>어느 쪽도 자동으로 고치지 않았습니다. 확정 전에는 제출 준비 완료로 올리지 않습니다.</p>
      ${conflicts.map(item => `<p>· <b>${escapeHtml(item.field)}</b> — 공고 <b>${escapeHtml(item.officialValue)}</b> / 확정값 <b>${escapeHtml(item.userValue)}</b><br><small>공고 근거 [${escapeHtml(String(item.officialEvidence.source).split(' > ').pop())}] “${escapeHtml(item.officialEvidence.sentence)}”</small><br><small>확인 질문: ${escapeHtml(item.question)}</small></p>`).join('')}</div>` : ''}
    ${unresolvedSections.length ? `<details open><summary>[확인 필요] 표시 ${unresolvedSections.length}개 항목 · 설계도 미확정 ${unresolvedSectionsOf(blueprint).length}자리${draftState?.unresolvedItems ? ` · 서버 집계 ${draftState.unresolvedItems.length}개` : ''} — AI 원본은 그대로 두고 상태만 붙였습니다</summary><div class="requirement-list">${unresolvedSections.map(section => `<article class="requirement"><div><span class="status 확인-필요">[확인 필요]</span><div><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.unresolvedFrom.length ? `설계도 미확정: ${section.unresolvedFrom.join(' · ')}` : (section.markedInText ? '본문에 [확인 필요] 표기' : '항목 상태: 확인 필요'))}</small></div></div></article>`).join('')}</div></details>` : ''}
    <div class="requirement-list">${report.checks.map(item => `<article class="requirement"><div><span class="status ${stateClass[item.state]}">${escapeHtml(item.state)}</span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.detail)}</small></div></div></article>`).join('')}</div></div>`;
}

function assemblyCheckView() {
  const check = state.assemblyCheck;
  if (!check) return '';
  return check.valid
    ? '<div class="alert success"><strong>완성 조립 검증 통과</strong><p>공식 목차 순서, 분할 누락·중복, 근거 연결과 마스터 기준값을 확인했습니다.</p></div>'
    : `<div class="alert warning"><strong>완성 조립 확인 필요</strong><p>사실을 자동 보정하지 않았습니다. 다음 검토 단계에서 아래 항목을 확인하세요.</p>${check.issues.map(issue => `<p>· ${escapeHtml(issue)}</p>`).join('')}</div>`;
}

function stagedGenerationView() {
  const staged = state.stagedGeneration || initial.stagedGeneration;
  const master = staged.master;
  if (!master) return state.designUnavailable ? '' : '<div class="empty-state"><div>▤</div><h2>마스터 설계가 없습니다</h2><p>사업을 선택하면 전체 구조를 먼저 설계합니다.</p><button class="button primary" data-step="3">사업 선택으로 이동</button></div>';
  const groups = master.sectionPlan || [];
  const logic = master.masterLogic || {};
  const completed = new Set(staged.completedGroupIds || []);
  const progress = groups.length ? Math.round((completed.size / groups.length) * 100) : 0;
  const waitingForAnswers = (state.missingInformation || []).some(question => !String(state.designAnswers[question] || '').trim());
  return `<div class="card" id="result-master" tabindex="-1"><div class="card-title"><div><h3>계획서 생성 3단계</h3><span>마스터 설계 → 분할 생성 → 완성</span></div><span class="tag ${staged.phase === 'parts-ready' ? 'mandatory' : ''}">${staged.phase === 'master-ready' ? '마스터 설계 완료' : staged.phase === 'parts-ready' ? '분할 생성 완료' : '분할 생성 중'}</span></div>
    <div class="summary-grid"><div><span>사업명</span><strong>${escapeHtml(master.projectDesign?.projectName || state.project.title)}</strong></div><div><span>대상·인원</span><strong>${escapeHtml([master.projectDesign?.target, master.projectDesign?.participantCount].filter(Boolean).join(' · '))}</strong></div><div><span>사업기간</span><strong>${escapeHtml(master.projectDesign?.projectPeriod || '')}</strong></div><div><span>분할 기준</span><strong>신청서 항목·목차 ${groups.length}개 묶음</strong></div></div>
    <details open><summary>마스터 논리사슬과 선정 대응</summary><div class="summary-grid"><div><span>문제와 필요성</span><strong>${escapeHtml(logic.problem || '')}</strong></div><div><span>대상 선정 근거</span><strong>${escapeHtml(logic.targetRationale || '')}</strong></div><div><span>핵심 전략</span><strong>${escapeHtml(logic.coreStrategy || '')}</strong></div><div><span>차별성</span><strong>${escapeHtml(logic.differentiation || '')}</strong></div></div><p class="muted">문제 → ${(logic.causes || []).map(escapeHtml).join(' · ')} → 대상 → 전략 → ${(logic.executionMethods || []).map(escapeHtml).join(' · ')} → 산출 → 변화 → 성과측정</p><div class="three-col"><div><h4>기준값</h4>${listOrEmpty((logic.baselineValues || []).map(item => `${item.item}: ${item.value}`))}</div><div><h4>산출·성과·측정 연결</h4>${listOrEmpty((logic.outputOutcomeMeasurementLinks || []).map(item => `${item.output} → ${item.outcomeGoal} → ${item.indicator}`))}</div><div><h4>평가기준 대응</h4>${listOrEmpty((logic.evaluationResponsePlan || []).map(item => `${item.criterion}: ${item.response}`))}</div></div><details><summary>주장별 공식 자료 근거</summary>${(logic.claimEvidencePlan || []).map(item => `<blockquote><strong>${escapeHtml(item.claim)}</strong><br>${escapeHtml(item.evidence)} <small>${escapeHtml(item.location)}</small></blockquote>`).join('')}</details></details>
    <details open><summary>확정된 마스터 구조 보기</summary><div class="requirement-list">${groups.map((group, index) => `<article class="requirement"><div><span class="tag">${index + 1}</span><div><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml((group.sectionKeys || []).map(sectionTitle).join(' · '))}</small></div></div><span class="status ${completed.has(group.id) ? '충족' : '확인-필요'}">${completed.has(group.id) ? '완료' : '대기'}</span><button class="button ${completed.has(group.id) ? 'secondary' : 'primary'}" data-generate-part="${escapeHtml(group.id)}" ${state.busy || waitingForAnswers ? 'disabled' : ''}>${completed.has(group.id) ? '이 항목만 다시 생성' : '이 항목만 AI 생성'}</button></article>`).join('')}</div></details>
    <div class="field"><label>분할 생성 진행률 ${completed.size} / ${groups.length}</label><progress value="${completed.size}" max="${Math.max(groups.length, 1)}" style="width:100%">${progress}%</progress></div>
    <div class="actions"><span>${waitingForAnswers ? '필수 확인 질문에 답한 뒤 마스터 설계를 다시 확정하세요.' : staged.phase === 'parts-ready' ? '모든 항목이 동일한 마스터 설계를 기준으로 작성되었습니다.' : '사용자가 시작해야 분할 생성을 실행합니다.'}</span>${staged.phase === 'master-ready' || staged.phase === 'parts-generating' ? `<button class="button primary" id="generate-parts" ${waitingForAnswers ? 'disabled' : ''}>분할 생성</button>` : ''}${staged.phase === 'parts-ready' ? '<button class="button primary" id="assemble-proposal">계획서 완성하기</button>' : ''}</div></div>`;
}

const SECTION_TITLES = { necessity: '사업 필요성', purpose: '목적', goals: '목표', target: '대상', programs: '세부 프로그램', schedule: '추진 일정', roles: '운영 인력·역할', budget: '예산', indicators: '성과지표', outcomes: '기대효과' };
function sectionTitle(key) { return SECTION_TITLES[key] || key; }

function proposalReviewView() {
  const review = state.reviewResult;
  if (!review) return '';
  const original = state.reviewOriginalDraft || [];
  const structureLabels = { noticeAndEvaluationFit: '공고 목적·평가기준', needDifferentiationFeasibility: '필요성·차별성·실행가능성', baselineConsistency: '대상·인원·기간·회기·역할·예산·성과지표', applicationQuestionCoverage: '신청서 질문 누락', crossSectionLogicAndDuplication: '항목 간 논리 충돌·중복', unsupportedClaims: '근거 없는 주장' };
  return `<div class="card"><div class="card-title"><div><h3>심사 검토 결과 · ${Number(review.overallScore).toFixed(0)}점</h3><span>전체 구조를 먼저 검토하고 문제가 있는 항목만 보완합니다. 보완안은 자동 적용되지 않습니다.</span></div><div><button class="button secondary" id="restore-review-draft">검토 전 초안 복원</button><button class="button primary" id="apply-all-review">전체 보완안 적용</button></div></div><p>${escapeHtml(review.overallJudgment)}</p>
    <details open><summary>전체 구조 검토</summary><div class="summary-grid">${Object.entries(structureLabels).map(([key, label]) => { const check = review.structureReview?.[key]; return `<div><span>${label}</span><strong>${escapeHtml(check?.status || '확인 필요')}</strong><small>${escapeHtml((check?.findings || []).join(' · ') || '문제 없음')}</small></div>`; }).join('')}</div></details>
    <div class="summary-grid">${review.criteria.map(item => `<div><span>${escapeHtml(item.label)}</span><strong>${Number(item.score).toFixed(0)}점</strong><small>${escapeHtml(item.judgment)}</small></div>`).join('')}</div>
    ${review.criticalIssues.length ? `<div class="alert warning"><strong>치명적 누락과 불일치</strong>${review.criticalIssues.map(item => `<p>${escapeHtml(item.message)} · ${escapeHtml(item.affectedSections.join(', '))}</p>`).join('')}</div>` : ''}
    ${review.missingQuestions.length ? `<div class="alert warning"><strong>확인이 필요한 질문</strong>${review.missingQuestions.map(item => `<p>${escapeHtml(item.question)} — ${escapeHtml(item.reason)}</p>`).join('')}</div>` : ''}
    <div class="requirement-list">${review.revisedSections.length ? review.revisedSections.map((item, index) => { const before = original.find(section => section.id === item.sectionKey || section.title === item.title)?.content || ''; return `<article class="requirement"><div><span class="tag mandatory">보완 필요</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.reason)}</small></div></div><details open><summary>기존 내용</summary><blockquote>${escapeHtml(before)}</blockquote></details><details open><summary>보완안${item.requiresConfirmation ? ' · 근거 확인 필요' : ''}</summary><blockquote>${escapeHtml(item.afterText)}</blockquote></details><button class="button primary" data-apply-review="${index}">보완안 적용</button></article>`; }).join('') : '<p class="muted">보완이 필요한 항목이 없습니다.</p>'}</div></div>`;
}

function strategyView() {
  const intent = state.sponsorIntent;
  const design = state.projectDesign;
  if (!intent && !design) return '';
  return `<div class="card"><div class="card-title"><div><h3>공모기관 의도와 선정전략</h3><span>공식 원문 근거 기반</span></div></div><div class="summary-grid"><div><span>해결하려는 핵심 문제</span><strong>${escapeHtml(intent?.coreProblem || '공식 원문에서 직접 확인되지 않음')}</strong></div><div><span>기대하는 변화</span><strong>${escapeHtml(intent?.expectedChange || '공식 원문에서 직접 확인되지 않음')}</strong></div><div><span>평가자가 중요하게 볼 요소</span><strong>${escapeHtml((intent?.selectionLogic || []).join(' · ') || '공식 원문에서 직접 확인되지 않음')}</strong></div><div><span>제안 사업 핵심전략</span><strong>${escapeHtml(design?.oneSentenceStrategy || 'AI 정밀 설계 미실행')}</strong></div></div>${intent?.evidence?.length ? `<details><summary>공식 원문 근거 ${intent.evidence.length}건</summary>${intent.evidence.map(value => `<blockquote>${escapeHtml(value)}</blockquote>`).join('')}</details>` : ''}</div>`;
}

function designQuestionsView() {
  if (!state.missingInformation.length) return '';
  return `<div class="card"><div class="card-title"><div><h3>사업설계에 필요한 추가 답변</h3><span>최대 5개 · 답변 후 다시 생성</span></div></div>${state.missingInformation.slice(0, 5).map((question, index) => `<div class="field"><label>${escapeHtml(question)}</label><textarea data-design-answer="${index}">${escapeHtml(state.designAnswers[question] || '')}</textarea></div>`).join('')}<div class="actions"><span>공식 자료에 없는 핵심 정보만 질문합니다.</span><button class="button primary" id="regenerate-design">답변 반영해 다시 생성</button></div></div>`;
}

function directFactsView() {
  const requirements = state.analysis?.requirements || [];
  return requirements.length ? `<div class="requirement-list">${requirements.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(item.category)}</span><strong>${escapeHtml(item.requirement)}</strong></div><blockquote>${escapeHtml(item.evidence)}</blockquote></article>`).join('')}</div>` : '<p>공식 원문에서 구조화할 사실을 찾지 못했습니다.</p>';
}

function render() {
  const views = [noticeImportView, noticeConfirmView, applicantSelectView, businessSelectView, documentView, documentView];
  const tools = { home: homeView, coaching: coachingView, applicants: applicantsToolView, sample: sampleView };
  app.innerHTML = shell((tools[state.activeTool] || views[state.step] || views[0])()); bind(); startBusyElapsedTimer(); runPendingAiMove();
}

// [샘플] 프로젝트 보기. 별도 화면에서만 열리며 사용자의 실제 작업 상태는 읽지도 바꾸지도 않는다.
let sampleCache = null;
function sampleProject() {
  if (!sampleCache) sampleCache = buildSampleProject();
  return sampleCache;
}
function openSample(stageId, from = state.activeTool) {
  const stage = SAMPLE_STAGES.some(item => item.id === stageId) ? stageId : SAMPLE_STAGES[0].id;
  setState({ activeTool: 'sample', sampleStage: stage, sampleReturn: from === 'sample' ? state.sampleReturn : from, notice: '', error: '' });
}
function closeSample() {
  setState({ activeTool: state.sampleReturn === 'sample' ? 'workflow' : state.sampleReturn || 'workflow', sampleStage: '', notice: '' });
}
function sampleButton(stageId, label = '샘플 보기') {
  return `<button class="button secondary" data-open-sample="${stageId}">${escapeHtml(label)}</button>`;
}
function sampleList(items) {
  return `<div class="requirement-list">${items.map(([title, value]) => `<article class="requirement"><div><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(String(value || '').slice(0, 600))}</small></div></div></article>`).join('')}</div>`;
}
function sampleSections(sections, note) {
  return `${note ? `<p class="muted">${escapeHtml(note)}</p>` : ''}<div class="requirement-list">${sections.map(item => `<article class="requirement"><div><div><strong>${escapeHtml(item.title)}</strong><small style="white-space:pre-wrap">${escapeHtml(item.content)}</small></div></div><span class="status ${String(item.content).includes(UNRESOLVED_MARK) ? '확인-필요' : '충족'}">${String(item.content).includes(UNRESOLVED_MARK) ? '확인 필요 포함' : '작성됨'}</span></article>`).join('')}</div>`;
}
// 운영 API로 실제 실행한 검증 기록을 보여 준다. 화면에서 다시 호출하지 않는다.
function sampleRealCoaching(run) {
  return `<h4>실제 AI 검증 실행 기록 · ${escapeHtml(run.label)} (${escapeHtml(run.runAt)})</h4>
    <p class="muted">판정 ${escapeHtml(run.overallStatus)} · 지적 ${run.issues.length}건 · 평가항목 대조 ${run.evaluationMatrix.length}개</p>
    <p class="muted">${escapeHtml(run.summary)}</p>
    ${sampleList(run.evaluationMatrix.map(entry => [`${entry.criterion} ${entry.officialPoints} · ${entry.status}`, `${entry.requirement}\n확인 위치: ${(entry.proposalLocations || []).join(' · ')}`]))}
    ${sampleList(run.issues.map(issue => [`${issue.category} · ${issue.priority} · ${issue.location}`, `${issue.reason}\n수정 방향: ${issue.direction}${issue.requiresConfirmation ? '\n※ 사용자 확인이 필요한 항목입니다.' : ''}`]))}`;
}
function sampleStageBody(stageId) {
  const sample = sampleProject();
  if (stageId === 'notice') {
    const notice = sample.notice;
    return sampleList([
      ['공모기관(가상)', notice.sourceLabel], ['사업명', notice.title], ['접수기간', notice.applicationPeriod],
      ['마감일', notice.deadline], ['사업기간', notice.performancePeriod], ['지원규모', notice.supportLimit],
      ['신청자격', notice.eligibility], ['지원내용', notice.supportDetails], ['공고 본문', notice.overview], ['평가기준', notice.criteriaText]
    ]);
  }
  if (stageId === 'analysis') {
    return `<p class="muted">공고 원문에서 항목별로 뽑은 결과입니다. 근거 문장이 함께 남습니다. 평가 배점 ${sample.structure.evaluationScores.length}개 · 선정요건 ${sample.requirements.length}개.</p>
      ${sampleList(sample.structure.fields.map(field => [`${field.title} · ${field.status}`, field.value || '공고에 없음']))}
      <h4>선정요건 ${sample.requirements.length}개</h4>${sampleList(sample.requirements.map(item => [item.title, item.prove || item.evidence?.[0]?.sentence || '']))}`;
  }
  if (stageId === 'applicant') {
    return `<p class="muted">가상 신청기관 ${sample.applicants.length}곳입니다. 확인된 정보와 확인 필요 정보를 나눠 보관합니다.</p>
      ${sample.applicants.map(applicant => `<h4>${escapeHtml(applicant.name)}</h4>${sampleList(applicant.items.map(item => [`${areaTitle(item.area)} · ${item.label} (${item.status})`, item.value || '확인 필요 — 값 없음']))}`).join('')}`;
  }
  if (stageId === 'fit') {
    return `<p class="muted">판정: ${escapeHtml(sample.fitResult.verdict)} · 요건 대조 ${sample.fitResult.matches.length}건. 두 번째 기관도 같은 방식으로 대조합니다(복수 기관 매칭).</p>
      ${sampleList(sample.fitResult.matches.map(match => [`${match.requirement} · ${match.state}`, match.applicantEvidence || match.gap || match.noticeAsked || '']))}
      <h4>과거 실적 관련성</h4>${sampleList(sample.fitResult.recordRelevance.map(record => [`${record.label} · ${record.level}`, record.value || '']))}
      <h4>두 번째 기관 · ${escapeHtml(sample.partner.name)}</h4><p class="muted">판정: ${escapeHtml(sample.partnerFit.verdict)} — 같은 공고라도 기관별로 계획서 작업은 따로 유지됩니다.</p>`;
  }
  if (stageId === 'blueprint') {
    return `<p class="muted">${escapeHtml(sample.blueprint.verdict)} · 신청유형 ${escapeHtml(sample.blueprint.applicationTypes.selected || '미선택')} · 준비 상태 ${escapeHtml(sample.blueprint.readiness)}</p>
      ${sampleList(sample.blueprint.items.map(item => [`${item.title} · ${item.status}`, item.value || item.basis || '']))}
      <h4>제출 전 확인 목록 ${sample.blueprint.submissionChecklist.length}건</h4>${sampleList(sample.blueprint.submissionChecklist.map(entry => [`${entry.item} · ${entry.kind}`, entry.why]))}`;
  }
  if (stageId === 'master') {
    return `<p class="muted">계획서를 ${sample.master.sectionPlan.length}개 묶음으로 나눠 씁니다. 분할 생성은 이 묶음 단위로 진행합니다.</p>
      ${sampleList(sample.master.sectionPlan.map(group => [group.title, group.sectionKeys.join(' · ')]))}
      <h4>작성 규칙</h4><p class="muted">${escapeHtml(sample.master.masterLogic.writingRule)}</p>`;
  }
  if (stageId === 'draftV1') return sampleSections(sample.sectionsV1, `설계도 값만 사용한 첫 초안입니다. 확인되지 않은 값은 ${UNRESOLVED_MARK}로 남습니다.`);
  if (stageId === 'coachingV1') {
    return `<p class="muted">판정: ${escapeHtml(sample.coachingV1.verdict)} — ${escapeHtml(sample.coachingV1.summary)}</p>
      ${sampleList(sample.coachingV1.issues.map(issue => [`${issue.title} · ${issue.location}`, `문제: ${issue.problem}\n근거: ${issue.evidence}\n수정 방향: ${issue.suggestion}`]))}
      <h4>설계도 대비 자동 점검</h4><p class="muted">${escapeHtml(sample.draftReviewV1.verdict)} · PASS ${sample.draftReviewV1.byState.PASS} / 주의 ${sample.draftReviewV1.byState['주의']} / FAIL ${sample.draftReviewV1.byState.FAIL}</p>
      ${sampleRealCoaching(SAMPLE_REAL_COACHING.v1)}`;
  }
  if (stageId === 'repair') {
    return `<p class="muted">문제 ${sample.repairPlans.length}건을 수정 단계로 나눴습니다. 사용자 확인이 필요한 항목은 답을 받기 전에는 본문을 고치지 않습니다.</p>
      ${sampleList(sample.repairPlans.map(plan => [`${plan.issueTypeLabel} · ${plan.repairLevel}`, `대상: ${plan.targetSection.map(target => target.title).join(' · ')}\n근거: ${plan.sourceOfTruth?.level || ''}\n수정안: ${plan.proposedRevision}`]))}`;
  }
  if (stageId === 'draftV2') return sampleSections(sample.sectionsV2, `근거가 있는 수정 ${sample.repairResult.applied.length}건만 반영한 V2입니다. 사용자 확인 항목은 아직 그대로입니다.`);
  if (stageId === 'decisions') {
    return `<p class="muted">확인이 필요했던 값을 사용자가 확정한 기록입니다. 확정 전에는 본문에 사실로 쓰지 않습니다.</p>
      ${sampleList(sample.decisions.map(entry => [entry.question, entry.answer]))}`;
  }
  if (stageId === 'final') return sampleSections(sample.sectionsFinal, '사용자 결정까지 반영한 제출 후보 본문입니다.');
  if (stageId === 'recheck') {
    return `<p class="muted">판정: ${escapeHtml(sample.coachingV2.verdict)} — ${escapeHtml(sample.coachingV2.summary)}</p>
      ${sampleList([['해결된 문제', (sample.comparison.resolved || []).join(' · ') || '없음'], ['남은 문제', (sample.comparison.remaining || []).join(' · ') || '없음'], ['새로 생긴 문제', (sample.comparison.added || []).join(' · ') || '없음']])}
      <h4>최종 자동 점검</h4><p class="muted">${escapeHtml(sample.draftReviewFinal.verdict)} · PASS ${sample.draftReviewFinal.byState.PASS} / 주의 ${sample.draftReviewFinal.byState['주의']} / FAIL ${sample.draftReviewFinal.byState.FAIL}</p>
      ${sampleRealCoaching(SAMPLE_REAL_COACHING.v2)}
      <h4>AI가 만든 문항 수정안 (실제 실행 기록)</h4>${sampleList([['수정 위치', SAMPLE_REAL_COACHING.revision.sectionLocation], ['원문', SAMPLE_REAL_COACHING.revision.originalExcerpt], ['수정안', SAMPLE_REAL_COACHING.revision.revisedText], ['설명', SAMPLE_REAL_COACHING.revision.explanation]])}`;
  }
  const marks = sample.sectionsFinal.reduce((sum, item) => sum + (String(item.content).match(/\[확인 필요[^\]]*\]/g) || []).length, 0);
  return `<p class="muted">버전 ${sample.versions.length}개가 모두 보존됩니다. 제출 전 확인이 남은 표기는 ${marks}곳입니다.</p>
    ${sampleList(sample.versions.map(version => [`V${version.version} · ${version.label}`, `${version.source} · 항목 ${version.sections.length}개`]))}
    <h4>제출 전 확인 목록</h4>${sampleList(sample.blueprint.submissionChecklist.map(entry => [entry.item, entry.why]))}`;
}
function sampleView() {
  const current = SAMPLE_STAGES.find(stage => stage.id === state.sampleStage) || SAMPLE_STAGES[0];
  return `<div class="page-heading"><div><h2>${escapeHtml(SAMPLE_MARK)} 예시 프로젝트 · ${escapeHtml(current.no)} ${escapeHtml(current.title)}</h2><p>${escapeHtml(current.desc)}</p></div><div class="actions"><button class="button primary" id="close-sample">내 작업으로 돌아가기</button></div></div>
    <div class="alert warning"><strong>${escapeHtml(SAMPLE_MARK)} 가상 예시입니다</strong><p>${escapeHtml(SAMPLE_NOTE)} 이 화면은 보기 전용이며 현재 작성 중인 계획서에 아무것도 덮어쓰지 않습니다.</p></div>
    <div class="card"><h3>단계 목차 ${SAMPLE_STAGES.length}개</h3><div class="sample-index">${SAMPLE_STAGES.map(stage => `<button class="sample-chip ${stage.id === current.id ? 'active' : ''}" data-open-sample="${stage.id}"><b>${escapeHtml(stage.no)}</b>${escapeHtml(stage.title)}<small>${escapeHtml(stage.screen)}</small></button>`).join('')}</div></div>
    <div class="card"><div class="card-title"><div><h3>${escapeHtml(SAMPLE_MARK)} ${escapeHtml(current.no)} ${escapeHtml(current.title)}</h3><span>${escapeHtml(current.desc)}</span></div></div>${sampleStageBody(current.id)}</div>`;
}

function coachingView() {
  const coaching = state.coaching || initial.coaching;
  const result = coaching.result;
  return `<div class="page-heading"><div class="actions" style="justify-content:flex-end">${sampleButton('coachingV1', '[샘플] 검증 예시 보기')}</div><div><h2>계획서 검증·코칭</h2><p>내부·외부 계획서를 전체 구조부터 검토하고 문제가 있는 위치만 구체적으로 코칭합니다.</p></div><button class="button secondary" id="close-coaching">작성 흐름으로 돌아가기</button></div>
    <div class="card"><div class="two-col"><div class="field"><label for="coaching-title">계획서명</label><input id="coaching-title" value="${escapeHtml(coaching.title)}" placeholder="검증할 계획서명"></div><div class="field"><label for="coaching-file">PDF·DOCX·TXT·HWPX 불러오기</label><input id="coaching-file" type="file" accept=".pdf,.docx,.txt,.hwpx"><small class="muted">HWP(한글 바이너리)는 직접 읽을 수 없습니다. 한/글에서 [다른 이름으로 저장] → HWPX·PDF·DOCX로 저장해 올려 주세요.</small></div></div>
    <label class="dropzone" id="coaching-dropzone" for="coaching-file"><strong>평가받을 사업계획서를 여기에 끌어다 놓으세요</strong><small>클릭 선택과 같은 방식으로 처리합니다 · PDF · DOCX · TXT · HWPX</small></label>
    <div class="field"><label for="coaching-text">계획서 원문</label><textarea id="coaching-text" class="source-text" placeholder="직원이 작성한 계획서를 붙여넣거나 파일을 업로드하세요.">${escapeHtml(coaching.text)}</textarea></div>
    <div class="field"><label for="coaching-criteria">연결할 공고·신청서·공식 평가기준</label><textarea id="coaching-criteria" class="source-text" placeholder="평가표가 있으면 최우선 기준으로 사용합니다.">${escapeHtml(coaching.criteriaText)}</textarea><label><input id="coaching-official-evaluation" type="checkbox" ${coaching.officialEvaluationProvided ? 'checked' : ''}> 입력 자료에 공식 평가표가 포함되어 있음</label></div>
    <div class="actions"><div><button class="button secondary" id="coach-current-proposal" ${state.sections.length ? '' : 'disabled'}>현재 계획서 불러오기</button><button class="button secondary" id="coach-list-archive">자료보관함 계획서</button></div><button class="button primary" id="run-coaching" ${coaching.pendingJob ? 'disabled' : ''}>${coaching.pendingJob ? '검증 중' : result ? '수정본 다시 검증' : '검증·코칭 실행'}</button></div><small>전체 검증은 OpenAI background mode로 실행됩니다. store=false이지만 polling을 위해 응답 데이터가 약 10분간 일시 저장될 수 있습니다.</small></div>
    ${proposalStructureView()}
    ${coachingReferenceView(coaching)}
    ${coaching.pendingJob ? `<div class="alert warning"><strong>검증 중 · ${escapeHtml(coaching.pendingJob.status || 'queued')}</strong><p>작업 ID ${escapeHtml(coaching.pendingJob.id)} · polling ${Number(coaching.pendingJob.pollCount || 0)}회</p><p>새로고침 후에도 같은 탭에서 작업을 이어 확인합니다.<span data-ai-elapsed data-started-at="${Number(coaching.pendingJob.startedAt || Date.now())}" style="display:block">경과시간 00초</span></p></div>` : ''}
    ${state.archiveProposals.length ? `<div class="card"><h3>자료보관함에서 불러오기</h3><div class="requirement-list">${state.archiveProposals.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(archiveStageLabel(item.stage))}</span><strong>${escapeHtml(item.title)}</strong></div><button class="button secondary" data-coach-archive="${escapeHtml(item.id)}">${String(item.stage).startsWith('coaching-v') ? '이 버전으로 돌아가기' : '검증 대상으로 불러오기'}</button></article>`).join('')}</div></div>` : ''}
    ${result ? coachingResultView(result) : ''}
    ${result ? repairPlanView() : ''}
    ${result ? coachingApplicantView() : ''}`;
}

// 계획서 원문을 항목별로 구조화하고 심사 관점으로 분석한다. AI 호출 없이 로컬 규칙만 사용한다.
function proposalStructureView() {
  const analysis = state.coaching.structure;
  const hasText = state.coaching.text.trim().length >= 30;
  const statusTag = { 확인됨: 'status 충족', '확인 필요': 'status 확인-필요', 없음: 'status 미충족' };
  const priorityTag = { '최우선 경고': 'status 미충족', '주요 개선': 'status 부분-충족', '일반 개선': 'status 확인-필요' };
  const header = `<div class="card"><div class="card-title"><div><h3>계획서 원문 구조 분석</h3><span>업로드한 원문을 항목별로 정리하고 심사 관점 문제를 찾습니다. 없는 항목은 만들지 않고 「없음」·[확인 필요]로 둡니다.</span></div><button class="button primary" id="analyze-proposal-structure" ${hasText ? '' : 'disabled'}>원문 구조 분석</button></div>`;
  if (!analysis) return `${header}<p class="muted">${hasText ? '분석 버튼을 누르면 AI 호출 없이 원문을 구조화합니다.' : '검증할 계획서 원문을 먼저 넣어 주세요.'}</p></div>`;
  const { structure, review } = analysis;
  const confirmed = structure.fields.filter(field => field.status === '확인됨').length;
  return `${header}
    <div class="summary-grid"><div><span>읽은 원문</span><strong>${structure.quality.totalChars.toLocaleString()}자</strong><small>${structure.quality.lineCount}줄 · 문단 ${structure.quality.sectionCount}개</small></div>
    <div><span>인식한 제목</span><strong>${structure.quality.headingCount}개</strong><small>한 줄 평균 ${structure.quality.averageLineChars}자</small></div>
    <div><span>구조화된 항목</span><strong>${confirmed}/${structure.fields.length}</strong><small>확인 필요·없음 ${structure.fields.length - confirmed}개</small></div>
    <div><span>확인된 문제</span><strong>${review.findings.length}건</strong><small>최우선 ${review.findings.filter(item => item.priority === '최우선 경고').length}건</small></div></div>
    ${structure.quality.warnings.length ? `<div class="alert warning"><strong>추출 상태 확인</strong>${structure.quality.warnings.map(warning => `<p>${escapeHtml(warning)}</p>`).join('')}</div>` : ''}
    <details open><summary>항목별 구조화 결과</summary><div class="requirement-list">${structure.fields.map(field => `<article class="requirement"><div><span class="${statusTag[field.status]}">${escapeHtml(field.status)}</span><div><strong>${escapeHtml(field.title)}</strong><small>위치: ${escapeHtml(field.location)}</small></div></div>
      <p class="muted">${escapeHtml(field.value ? field.value.slice(0, 200) : '문서에서 찾지 못했습니다.')}</p>
      ${field.evidence ? `<blockquote>${escapeHtml(field.evidence)}</blockquote>` : ''}</article>`).join('')}</div></details>
    <details open><summary>논리 연결 검사 · 필요성 → 대상 → 프로그램 → 예산 → 성과목표 → 성과지표</summary><div class="cap-grid">${review.chain.map(link => `<div><span>${escapeHtml(link.from)} → ${escapeHtml(link.to)}</span><strong>${link.linked ? '연결됨' : '끊김'}</strong><small>${escapeHtml(link.reason)}</small></div>`).join('')}</div>
    ${review.conflicts.length ? `<p><b>수치 충돌</b> ${review.conflicts.map(item => `${escapeHtml(item.label)}: ${escapeHtml(item.values.join(' / '))}`).join(' · ')}</p>` : '<p class="muted">확인된 수치 충돌이 없습니다.</p>'}</details>
    <div class="actions"><span>검증된 문제만 작성 엔진으로 넘겨 수정본을 만듭니다. 문제 없는 문단은 다시 쓰지 않습니다.</span><span><button class="button secondary" id="select-all-structure">주요 문제 전체 선택</button><button class="button primary" id="apply-structure-revision">선택 문제로 수정본(V2) 만들기</button></span></div>
    <div class="requirement-list">${review.findings.map(item => `<article class="requirement"><div><span class="${priorityTag[item.priority]}">${escapeHtml(item.priority)}</span><div><strong><label><input type="checkbox" data-structure-select="${escapeHtml(item.id)}" ${(state.coaching.structureSelection || []).includes(item.id) ? 'checked' : ''}> ${escapeHtml(item.category)}</label></strong><small>위치: ${escapeHtml(item.location)}</small></div></div>
      <p><b>현재 내용</b> ${escapeHtml(item.current)}</p>
      <p><b>문제점</b> ${escapeHtml(item.problem)}</p>
      <p><b>심사에서 불리한 이유</b> ${escapeHtml(item.whyRisky)}</p>
      <p><b>근거</b> ${escapeHtml(item.basis)}</p>
      <p><b>보완 방향</b> ${escapeHtml(item.direction)}</p>
      <details open><summary>수정 문장(자동 적용되지 않음)</summary><blockquote>${escapeHtml(item.suggestion)}</blockquote></details>
      ${item.evidenceRefs.length ? `<details><summary>원문 근거</summary><blockquote>${escapeHtml(item.evidenceRefs[0].excerpt)}</blockquote></details>` : '<p class="muted">원문에서 직접 확인되는 근거가 없어 [확인 필요]로 남깁니다.</p>'}</article>`).join('')}</div></div>`;
}

// 검증 문제를 수정계획으로 구조화한다. V2는 이 수정계획을 통해서만 만든다.
function currentRepairPlans() {
  const issues = state.coaching.result?.issues || [];
  if (!issues.length) return [];
  const sections = state.sections.length ? state.sections : (state.coaching.structure?.structure.sections || []);
  const organization = organizationForGeneration();
  return buildRepairPlans(issues, {
    sections,
    references: referencePayload(state.coaching.references || [], coachingContext()).references,
    projectValues: state.projectValues || [],
    confirmedFacts: organization.confirmedFacts || []
  });
}

function repairPlanView() {
  const plans = currentRepairPlans();
  if (!plans.length) return '';
  const summary = repairPlanSummary(plans);
  const levelTag = { AUTO: 'status 충족', EVIDENCE_BASED: 'status 부분-충족', USER_CONFIRMATION: 'status 확인-필요' };
  return `<div class="card" id="result-repair" tabindex="-1"><div class="card-title"><div><h3>수정계획 ${plans.length}건</h3><span>문제를 수정 유형과 수정 가능성으로 나눕니다. AI가 확정값을 임의로 고르지 않습니다.</span></div><button class="button primary" id="apply-repair-plans">수정계획으로 수정본(V2) 만들기</button></div>
    <div class="summary-grid"><div><span>바로 수정(AUTO)</span><strong>${summary.byLevel.AUTO || 0}건</strong><small>사실을 바꾸지 않는 표현·구조</small></div>
    <div><span>근거 확인 후(EVIDENCE_BASED)</span><strong>${summary.byLevel.EVIDENCE_BASED || 0}건</strong><small>공고·기관정보·원문 근거 필요</small></div>
    <div><span>사용자 확인 필요</span><strong>${summary.byLevel.USER_CONFIRMATION || 0}건</strong><small>어느 값이 맞는지 판단 불가</small></div>
    <div><span>수정 유형</span><strong>${Object.keys(summary.byType).length}종</strong><small>${escapeHtml(Object.entries(summary.byType).map(([type, count]) => `${type} ${count}`).join(' · '))}</small></div></div>
    <div class="requirement-list">${plans.map(plan => {
      const answer = state.coaching.repairAnswers?.[plan.id] || '';
      const after = plan.repairLevel === 'USER_CONFIRMATION' && !answer ? '' : String(plan.proposedRevision).replace(/\[확인 필요[^\]]*\]/g, answer || '[확인 필요]');
      return `<article class="requirement"><div><span class="${levelTag[plan.repairLevel]}">${escapeHtml(plan.repairLevel)}</span><div><strong>${escapeHtml(plan.issueTypeLabel)} · ${escapeHtml(plan.issueType)}</strong><small>대상: ${escapeHtml(plan.targetSection.map(target => target.title).join(' + ') || '자동 연결 실패 · 직접 지정 필요')}</small></div><span class="status ${plan.autoFixable ? '충족' : '확인-필요'}">${plan.autoFixable ? '자동 수정 가능' : '자동 수정 불가'}</span></div>
      <p><b>문제</b> ${escapeHtml(plan.problem)}</p>
      <p><b>수정 방법</b> ${escapeHtml(plan.repairMethod)}</p>
      <p><b>사용할 근거</b> ${escapeHtml(plan.sourceOfTruth.level)} · ${escapeHtml(plan.sourceOfTruth.detail)}${plan.evidence.length ? ` · 원문 근거 ${plan.evidence.length}건` : ' · 원문 근거 없음'}</p>
      ${plan.evidence.length ? `<details><summary>근거 문장</summary>${plan.evidence.map(item => `<blockquote>${escapeHtml(item.excerpt)}<br><small>${escapeHtml(item.location)}</small></blockquote>`).join('')}</details>` : ''}
      ${plan.calculation?.hasFormula ? `<p><b>계산 확인</b> 입력값 ${escapeHtml(plan.calculation.operands.join(' × '))} → 산출 ${escapeHtml(String(plan.calculation.computed ?? '-'))} · 문서 기재 ${escapeHtml(plan.calculation.stated.join(' / ') || '없음')} · ${plan.calculation.ambiguous ? '어느 입력값이 맞는지 확인 필요' : '입력값 확정'}</p>` : ''}
      ${plan.lockedValues.length ? `<p><b>유지할 확정값</b> ${escapeHtml(plan.lockedValues.slice(0, 8).join(' · '))}</p>` : ''}
      ${plan.repairLevel === 'USER_CONFIRMATION' ? `<div class="alert warning"><strong>확인이 필요합니다</strong><p>${escapeHtml(plan.confirmationQuestion)}</p><div class="field"><label for="answer-${escapeHtml(plan.id)}">확인값 입력</label><input id="answer-${escapeHtml(plan.id)}" data-repair-answer="${escapeHtml(plan.id)}" value="${escapeHtml(answer)}" placeholder="예: 전담 5명(조직도 8명 중 5명 참여)"></div></div>` : ''}
      <div class="two-col"><details open><summary>수정 전</summary><blockquote>${escapeHtml(plan.currentContent.slice(-220) || '연결된 문단 없음')}</blockquote></details><details open><summary>수정 후</summary><blockquote>${escapeHtml(after || '확인값을 입력하기 전에는 수정하지 않습니다.')}</blockquote></details></div>
      <p class="muted">검증 규칙: ${escapeHtml(plan.verificationRule)}</p></article>`;
    }).join('')}</div></div>`;
}

function coachingContext() {
  return projectContext({ proposalText: state.coaching.text, proposalTitle: state.coaching.title || state.project.title, noticeTitle: state.selectedNotice?.title || '', noticeDeadline: state.selectedNotice?.deadline || '', today: new Date().toISOString() });
}

// 참고자료는 평가받는 계획서와 분리해 보관하고, 공식 기준으로 쓸 수 있는지 먼저 판별한다.
function coachingReferenceView(coaching) {
  const references = coaching.references || [];
  const review = assessReferences(references, coachingContext());
  const usageTag = { '공식 근거로 사용 가능': 'status 충족', '관련 있으나 참고용': 'status 부분-충족', '이번 사업과 맞지 않음': 'status 미충족', '출처/진위 확인 필요': 'status 확인-필요', '내용끼리 충돌함': 'status 미충족' };
  return `<div class="card"><div class="card-title"><div><h3>참고자료 ${references.length}건</h3><span>공고문·사업요강·평가기준·원본 등 계획서를 판단할 근거 자료입니다. 평가받는 계획서와 섞지 않습니다.</span></div></div>
    <div class="two-col"><div class="field"><label for="reference-type">자료 유형</label><select id="reference-type">${REFERENCE_TYPES.map(type => `<option value="${escapeHtml(type)}" ${coaching.referenceType === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select></div>
    <div class="field"><label for="reference-file">참고자료 파일 추가</label><input id="reference-file" type="file" accept=".pdf,.docx,.txt,.hwpx" multiple></div></div>
    <label class="dropzone" id="reference-dropzone" for="reference-file"><strong>참고자료를 여기에 끌어다 놓으세요</strong><small>선택한 자료 유형으로 여러 개를 한 번에 추가합니다</small></label>
    <div class="two-col"><div class="field"><label for="reference-name">붙여넣을 자료명</label><input id="reference-name" value="${escapeHtml(coaching.referenceNameDraft || '')}" placeholder="예: 2026년 배분사업 공고문"></div><div class="field"><label>&nbsp;</label><button class="button secondary" id="add-reference-text">붙여넣은 참고자료 추가</button></div></div>
    <div class="field"><label for="reference-text">참고자료 내용 붙여넣기</label><textarea id="reference-text" style="min-height:90px" placeholder="공고문·요강·평가기준 원문을 붙여넣으세요.">${escapeHtml(coaching.referenceDraft || '')}</textarea></div>
    ${references.length ? `<div class="requirement-list">${references.map((item, index) => {
      const assessment = review.assessments[index] || {};
      return `<article class="requirement"><div><span class="${usageTag[assessment.usage] || 'tag'}">${escapeHtml(assessment.usage || '판별 중')}</span><div><strong>${escapeHtml(item.fileName)}</strong><small>${escapeHtml(item.referenceType)} · ${item.text.length.toLocaleString()}자${assessment.years?.length ? ` · 자료 연도 ${assessment.years.join('·')}` : ''}</small></div></div>
      <p class="muted">${escapeHtml((assessment.reasons || []).join(' '))}</p>
      <div class="actions" style="margin:0;gap:8px"><select data-reference-type="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.fileName)} 자료 유형">${REFERENCE_TYPES.map(type => `<option value="${escapeHtml(type)}" ${item.referenceType === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select><button class="button secondary" data-remove-reference="${escapeHtml(item.id)}">삭제</button></div></article>`;
    }).join('')}</div>
    ${referenceWarningView(review)}` : '<p class="muted">추가한 참고자료가 없습니다. 계획서만으로도 검증할 수 있습니다.</p>'}</div>`;
}

function referenceWarningView(review) {
  const notices = referenceNotices(review, coachingContext());
  if (!notices.length) return `<p class="muted">공식 근거로 사용 가능한 자료 ${review.officialCount}건입니다.</p>`;
  return `<div class="alert warning"><strong>참고자료 판정 · 공식 근거 ${review.officialCount}건 / 확인 필요 ${review.cautionCount}건</strong>${notices.map(notice => `<p>${escapeHtml(notice)}</p>`).join('')}</div>`;
}

function coachingResultView(result) {
  const priorityOrder = { '최우선 경고': 0, '주요 개선': 1, '일반 개선': 2 };
  const issues = [...result.issues].sort((left, right) => (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9));
  const comparison = result.comparison || { previousVersion: 0, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] };
  if (state.coaching.workItems?.length !== result.issues.length) state.coaching.workItems = makeCoachingWorkItems(result);
  const workItems = state.coaching.workItems;
  const submission = coachingSubmissionDecision(result, workItems);
  return `<div class="card" id="result-coaching" tabindex="-1"><div class="card-title"><div><h3>검증·코칭 결과 · ${escapeHtml(result.overallStatus)}</h3><span>합격확률을 추정하지 않으며, 수정안은 자동 적용되지 않습니다.</span></div><div><span class="tag">${result.basis === 'official-evaluation' ? '공식 평가표 우선' : '공통 검증 기준'}</span><button class="button secondary" id="print-coaching-report">코칭 보고서 PDF 인쇄·저장</button></div></div><p>${escapeHtml(result.summary)}</p>
    ${submissionCheckView(result, submission)}
    ${(state.coaching.references || []).length ? `<details open><summary>이번 검증에 사용한 참고자료 판정 ${state.coaching.references.length}건</summary>${referenceWarningView(assessReferences(state.coaching.references, coachingContext()))}<div class="cap-grid">${assessReferences(state.coaching.references, coachingContext()).assessments.map(item => `<div><span>${escapeHtml(item.referenceType)}</span><strong>${escapeHtml(item.fileName)}</strong><small>${escapeHtml(item.usage)}</small></div>`).join('')}</div></details>` : ''}
    ${result.evaluationMatrix?.length ? `<details open><summary>평가기준 대응표</summary><div class="requirement-list">${result.evaluationMatrix.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(item.status)}</span><div><strong>${escapeHtml(item.criterion)}${item.officialPoints ? ` · ${escapeHtml(item.officialPoints)}` : ''}</strong><small>${escapeHtml(item.requirement)}</small></div></div><p><b>계획서 대응 위치</b> ${escapeHtml(item.proposalLocations.join(' · ') || '연결 위치 없음')}</p>${coachingEvidenceView(item.evidenceRefs)}</article>`).join('')}</div></details>` : ''}
    ${comparison.previousVersion ? `<details open><summary>v${comparison.previousVersion} 대비 재검증 결과</summary><div class="summary-grid"><div><span>해결된 문제</span><strong>${comparison.resolvedIssues.length}건</strong><small>${escapeHtml(comparison.resolvedIssues.join(' · ') || '없음')}</small></div><div><span>남은 문제</span><strong>${comparison.remainingIssues.length}건</strong><small>${escapeHtml(comparison.remainingIssues.join(' · ') || '없음')}</small></div><div><span>새로 생긴 문제</span><strong>${comparison.newIssues.length}건</strong><small>${escapeHtml(comparison.newIssues.join(' · ') || '없음')}</small></div><div><span>실제 개선 항목</span><strong>${comparison.improvedAreas.length}건</strong><small>${escapeHtml(comparison.improvedAreas.join(' · ') || '없음')}</small></div></div></details>` : ''}
    <h3>개선 작업판</h3><div class="actions"><span>수정이 필요한 문제를 골라 「계획서 쓰기」로 보냅니다. 검증코치는 계획서를 직접 다시 쓰지 않습니다.</span><span><button class="button secondary" id="select-all-issues">전체 선택</button><button class="button primary" id="send-issues-to-writer" ${state.sections.length ? '' : 'disabled'}>계획서 쓰기에서 수정</button></span></div>${state.sections.length ? '' : `<div class="actions"><span class="muted">작성 중인 계획서 본문이 없습니다. 업로드한 외부 계획서를 원본 그대로 두고 수정 가능한 작업본으로 전환하면 같은 왕복 흐름을 사용할 수 있습니다.</span><button class="button primary" id="adopt-external-proposal" ${state.coaching.text.trim().length >= 30 ? '' : 'disabled'}>외부 계획서를 작업본으로 전환</button></div>`}<div class="requirement-list">${issues.length ? issues.map(item => { const originalIndex = result.issues.indexOf(item); const work = workItems[originalIndex] || { status: '미수정' }; return `<article class="requirement"><div><span class="tag mandatory">${escapeHtml(item.priority)}</span><div><strong><label><input type="checkbox" data-coaching-select="${originalIndex}" ${(state.coachingSelection || []).includes(originalIndex) ? 'checked' : ''}> ${escapeHtml(item.location)}</label></strong><small>${escapeHtml(item.category)}</small></div><select data-coaching-status="${originalIndex}" aria-label="${escapeHtml(item.location)} 상태"><option ${work.status === '미수정' ? 'selected' : ''}>미수정</option><option ${work.status === '수정중' ? 'selected' : ''}>수정중</option><option ${work.status === '해결' ? 'selected' : ''}>해결</option><option ${work.status === '확인필요' ? 'selected' : ''}>확인필요</option></select></div><p><b>위험 이유</b> ${escapeHtml(item.reason)}</p><p><b>개선 방향</b> ${escapeHtml(item.direction)}</p>${coachingEvidenceView(item.evidenceRefs)}<details><summary>기존 수정 예시${item.requiresConfirmation ? ' · 확인 필요' : ''}</summary><blockquote>${escapeHtml(item.example)}</blockquote></details><div class="actions"><span>상태: ${escapeHtml(work.status)}</span><button class="button secondary" data-coaching-revise="${originalIndex}">이 문제만 AI 수정안 만들기</button></div>${work.revision ? `<div class="two-col"><details open><summary>원문</summary><blockquote>${escapeHtml(work.revision.originalExcerpt)}</blockquote></details><details open><summary>AI 수정안${work.revision.requiresConfirmation ? ' · 확인 필요' : ''}</summary><blockquote>${escapeHtml(work.revision.revisedText)}</blockquote><small>${escapeHtml(work.revision.explanation)}</small></details></div><div class="actions"><span>자동 적용되지 않습니다.</span>${work.applied ? `<button class="button secondary" data-coaching-undo="${originalIndex}">적용 되돌리기</button>` : `<button class="button primary" data-coaching-apply="${originalIndex}">수정안 적용</button>`}</div>` : ''}</article>`; }).join('') : '<p class="muted">현재 기준에서 발견된 주요 문제가 없습니다.</p>'}</div></div>`;
}

function coachingEvidenceView(refs = []) {
  const values = refs.map(ref => typeof ref === 'string' ? { sourceName: ref, verified: false } : ref);
  const verified = values.filter(ref => ref?.verified);
  if (!verified.length) return '<details><summary>근거 확인 · [확인 필요]</summary><p class="muted">입력 원문에서 직접 확인되는 근거가 없습니다.</p></details>';
  return `<details><summary>근거 바로 확인 · ${verified.length}건</summary>${verified.map(ref => `<blockquote><b>자료명</b> ${escapeHtml(ref.sourceName || '계획서 원문')}<br><b>페이지·항목</b> ${escapeHtml(ref.pageOrSection || '표시 없음')}<br><b>계획서 위치</b> ${escapeHtml(ref.proposalLocation || '표시 없음')}<br><b>관련 원문</b> ${escapeHtml(ref.excerpt)}</blockquote>`).join('')}</details>`;
}

function coachingSubmissionDecision(result, workItems) {
  const unresolved = result.issues.map((issue, index) => ({ issue, status: workItems[index]?.status || '미수정' })).filter(value => value.status !== '해결');
  const mustFix = unresolved.some(value => value.issue.priority === '최우선 경고' || value.status === '확인필요' || value.issue.requiresConfirmation) || (result.finalChecks || []).some(item => item.status === '확인필요');
  if (mustFix) return '제출 전 필수 보완';
  if (unresolved.length || (result.finalChecks || []).some(item => item.status === '보완필요')) return '주요 개선 권장';
  return '제출 검토 완료';
}

function submissionCheckView(result, decision) {
  const checks = result.finalChecks || [];
  const verdict = coachingVerdict(result, state.coaching.workItems || []);
  return `<section class="alert ${decision === '제출 검토 완료' ? 'success' : 'warning'}"><div class="card-title"><div><h3>제출 전 점검</h3><strong>${escapeHtml(decision)}</strong></div><span>합격확률·임의 점수 없음</span></div>
    <p><b>내부 판정</b> ${escapeHtml(verdict.verdict)} — ${escapeHtml(verdict.reason)}${verdict.blockingIssues.length ? ` (근거 확인된 중대 문제: ${escapeHtml(verdict.blockingIssues.join(' · '))})` : ''}</p>
    <small>내부 품질관리 판정이며 공모기관의 선정·탈락 판정이 아닙니다. 정보가 부족하다는 이유만으로 반려하지 않습니다.</small><div class="requirement-list">${checks.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(item.status)}</span><strong>${escapeHtml(item.area)}</strong></div><p>${escapeHtml(item.note)}</p>${coachingEvidenceView(item.evidenceRefs)}</article>`).join('')}</div></section>`;
}

function makeCoachingWorkItems(result) {
  return (result.issues || []).map((issue, index) => ({ id: `issue-${index + 1}`, status: issue.requiresConfirmation ? '확인필요' : '미수정', revision: null, applied: false }));
}

// 드래그앤드롭도 클릭 업로드와 같은 처리 함수를 호출한다.
function bindDropzone(selector, onFiles) {
  const zone = document.querySelector(selector);
  if (!zone) return;
  const stop = event => { event.preventDefault(); event.stopPropagation(); };
  zone.addEventListener('dragover', event => { stop(event); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', event => { stop(event); zone.classList.remove('dragover'); });
  zone.addEventListener('drop', event => {
    stop(event);
    zone.classList.remove('dragover');
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length) onFiles(files);
  });
}

function startBusyElapsedTimer() {
  clearInterval(busyTimer);
  const outputs = [...document.querySelectorAll('[data-ai-elapsed]')];
  if (!outputs.length) return;
  const update = () => outputs.forEach(output => {
    const startedAt = Number(output.dataset.startedAt || 0);
    output.textContent = `경과시간 ${aiTaskLabel((Date.now() - startedAt) / 1000)}`;
  });
  update(); busyTimer = setInterval(update, 1000);
}

function updateInputs() {
  document.querySelector('#project-title')?.addEventListener('input', e => { state.project.title = e.target.value; saveState(); });
  document.querySelector('#issuer')?.addEventListener('input', e => { state.project.issuer = e.target.value; saveState(); });
  document.querySelector('#deadline')?.addEventListener('input', e => { state.project.deadline = e.target.value; saveState(); });
  document.querySelector('#source-text')?.addEventListener('input', e => { state.sourceText = e.target.value; document.querySelector('#char-count').textContent = `${e.target.value.length.toLocaleString()}자`; saveState(); });
  document.querySelector('#company-fact-draft')?.addEventListener('input', e => { state.companyFactDraft = e.target.value; });
  document.querySelector('#missing-notice-url')?.addEventListener('input', e => { state.noticeUrlDraft = e.target.value; });
  document.querySelector('#manual-source-type')?.addEventListener('change', e => { state.manualSourceType = e.target.value; saveState(); });
  document.querySelector('#manual-source-name')?.addEventListener('input', e => { state.manualSourceName = e.target.value; saveState(); });
  document.querySelector('#manual-source-text')?.addEventListener('input', e => { state.manualSourceText = e.target.value; saveState(); });
  for (const [id, key] of [['archive-institution', 'institution'], ['archive-from', 'from'], ['archive-to', 'to'], ['archive-keyword', 'keyword']]) document.querySelector(`#${id}`)?.addEventListener('input', event => { state.archiveFilters[key] = event.target.value; saveState(); });
  document.querySelector('#archive-recovery-key')?.addEventListener('input', event => { state.archiveKeyDraft = event.target.value; });
}

function bind() {
  updateInputs();
  if (state.step === 0 && !archiveLoaded) void loadRecentArchive();
  if (state.activeTool === 'home' && !homeArchiveLoaded) void loadHomeRecent();
  document.querySelectorAll('[data-type]').forEach(el => el.onclick = () => { state.project.type = el.dataset.type; saveState(); render(); });
  document.querySelector('#business-type')?.addEventListener('change', event => { state.project.type = event.target.value; saveState(); render(); });
  document.querySelectorAll('[data-step]').forEach(el => el.onclick = () => { state.activeTool = 'workflow'; navigateToStep(Number(el.dataset.step), { notice: '', error: '' }); });
  document.querySelector('#open-archive-box')?.addEventListener('click', () => {
    state.activeTool = 'workflow';
    navigateToStep(0, { notice: '자료보관함을 열었습니다.', error: '' });
    setTimeout(() => document.querySelector('#archive-box')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  });
  document.querySelector('#open-coaching-home')?.addEventListener('click', () => setState({ activeTool: 'coaching', notice: '', error: '' }));
  document.querySelector('#open-coaching')?.addEventListener('click', () => setState({ activeTool: 'coaching', notice: '', error: '' }));
  document.querySelector('#close-coaching')?.addEventListener('click', () => setState({ activeTool: 'workflow', notice: '', error: '' }));
  document.querySelector('#open-applicants')?.addEventListener('click', () => setState({ activeTool: 'applicants', notice: '', error: '' }));
  document.querySelectorAll('[data-open-applicants]').forEach(el => el.onclick = () => setState({ activeTool: 'applicants', notice: '', error: '' }));
  document.querySelector('#close-applicants')?.addEventListener('click', () => setState({ activeTool: 'workflow', notice: '', error: '' }));
  bindApplicants();
  document.querySelector('#back')?.addEventListener('click', () => navigateToStep(state.step - 1, { notice: '', error: '' }));
  document.querySelector('#next')?.addEventListener('click', () => navigateToStep(state.step + 1, { notice: '', error: '' }));
  document.querySelector('#workflow-back')?.addEventListener('click', () => { state.activeTool = 'workflow'; navigateBack(); });
  document.querySelector('#workflow-home')?.addEventListener('click', () => setState({ activeTool: 'home', notice: '', error: '' }));
  document.querySelector('#workflow-forward')?.addEventListener('click', () => { state.activeTool = 'workflow'; navigateForward(); });
  document.querySelector('#go-to-review')?.addEventListener('click', () => navigateToStep(4));
  document.querySelector('#menu-toggle')?.addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  const fileInput = document.querySelector('#source-files');
  if (fileInput) fileInput.onchange = async e => {
    try { setState({ busy: '파일에서 텍스트를 추출하는 중...', error: '' }); const parsed = await extractFiles([...e.target.files]); state.files.push(...parsed.map(v => ({ ...v, characters: v.text.length }))); state.sourceText += parsed.map(v => `\n\n[파일: ${v.name}]\n${v.text}`).join(''); setState({ busy: '', notice: `${parsed.length}개 파일을 읽었습니다.` }); }
    catch (error) { setState({ busy: '', error: error.message }); }
  };
  const manualFiles = document.querySelector('#manual-source-files');
  if (manualFiles) manualFiles.onchange = addManualFiles;
  document.querySelector('#add-manual-text')?.addEventListener('click', addManualText);
  document.querySelectorAll('[data-manual-source-type]').forEach(el => el.onchange = () => { const item = state.manualSources[Number(el.dataset.manualSourceType)]; if (item) { item.sourceType = el.value; setState({ manualSources: [...state.manualSources] }); } });
  document.querySelectorAll('[data-remove-manual-source]').forEach(el => el.onclick = () => { state.manualSources.splice(Number(el.dataset.removeManualSource), 1); setState({ manualSources: [...state.manualSources], notice: '직접 자료를 삭제했습니다.' }); });
  document.querySelectorAll('[data-remove-file]').forEach(el => el.onclick = () => { state.files.splice(Number(el.dataset.removeFile), 1); setState({ files: state.files }); });
  document.querySelector('#fetch-notices')?.addEventListener('click', loadOfficialNotices);
  document.querySelector('#search-archive')?.addEventListener('click', searchNoticeArchive);
  document.querySelector('#find-matching-notices')?.addEventListener('click', findMatchingNotices);
  document.querySelector('#list-archived-proposals')?.addEventListener('click', loadProposalArchive);
  document.querySelector('#copy-archive-key')?.addEventListener('click', copyArchiveRecoveryKey);
  document.querySelector('#apply-archive-key')?.addEventListener('click', applyArchiveRecoveryKey);
  document.querySelectorAll('[data-use-archived-notice]').forEach(el => el.onclick = () => useArchivedNotice(Number(el.dataset.useArchivedNotice)));
  document.querySelectorAll('[data-view-archived-notice]').forEach(el => el.onclick = () => viewArchivedNotice(Number(el.dataset.viewArchivedNotice)));
  document.querySelectorAll('[data-open-archived-proposal]').forEach(el => el.onclick = () => openArchivedProposal(el.dataset.openArchivedProposal));
  // 자료보관함 목록: 검색·필터·정렬·선택·페이지 이동은 모두 화면 상태만 바꾼다.
  const archiveQuery = document.querySelector('#archive-query');
  if (archiveQuery) {
    archiveQuery.oninput = event => { state.archiveTable = { ...archiveTableState(), query: event.target.value }; saveState(); };
    archiveQuery.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); setArchiveTable({ query: event.target.value, page: 1 }); } };
  }
  document.querySelector('#archive-apply-query')?.addEventListener('click', () => setArchiveTable({ query: document.querySelector('#archive-query')?.value || '', page: 1 }));
  document.querySelectorAll('[data-archive-filter]').forEach(el => el.onchange = () => setArchiveTable({ filters: { ...archiveTableState().filters, [el.dataset.archiveFilter]: el.value }, page: 1 }));
  document.querySelector('#archive-reset-filters')?.addEventListener('click', () => setArchiveTable({ query: '', filters: structuredClone(initial.archiveTable.filters), page: 1 }));
  document.querySelectorAll('[data-archive-sort]').forEach(el => el.onclick = () => {
    const table = archiveTableState();
    const key = el.dataset.archiveSort;
    setArchiveTable({ sortKey: key, sortDir: table.sortKey === key && table.sortDir === 'desc' ? 'asc' : 'desc', page: 1 });
  });
  document.querySelector('#archive-page-size')?.addEventListener('change', event => setArchiveTable({ pageSize: Number(event.target.value), page: 1 }));
  document.querySelectorAll('[data-archive-page]').forEach(el => el.onclick = () => setArchiveTable({ page: Number(el.dataset.archivePage) }));
  document.querySelectorAll('[data-archive-select]').forEach(el => el.onchange = () => {
    const selected = new Set(archiveTableState().selected || []);
    if (el.checked) selected.add(el.dataset.archiveSelect); else selected.delete(el.dataset.archiveSelect);
    setArchiveTable({ selected: [...selected] });
  });
  document.querySelector('#archive-select-page')?.addEventListener('change', event => {
    const keys = [...document.querySelectorAll('[data-archive-select]')].map(el => el.dataset.archiveSelect);
    const selected = new Set(archiveTableState().selected || []);
    keys.forEach(key => (event.target.checked ? selected.add(key) : selected.delete(key)));
    setArchiveTable({ selected: [...selected] });
  });
  document.querySelectorAll('[data-archive-detail]').forEach(el => el.onclick = () => setArchiveTable({ expandedKey: archiveTableState().expandedKey === el.dataset.archiveDetail ? '' : el.dataset.archiveDetail }));
  document.querySelectorAll('[data-archive-status]').forEach(el => el.onchange = () => setArchiveLink(el.dataset.archiveStatus, { status: el.value }, `공고 상태를 ${el.value}(으)로 바꿨습니다.`));
  document.querySelectorAll('[data-archive-applicant-open]').forEach(el => el.onclick = () => setArchiveTable({ applicantPickerKey: archiveTableState().applicantPickerKey === el.dataset.archiveApplicantOpen ? '' : el.dataset.archiveApplicantOpen }));
  document.querySelectorAll('[data-archive-applicant-close]').forEach(el => el.onclick = () => setArchiveTable({ applicantPickerKey: '' }));
  document.querySelectorAll('[data-archive-applicant]').forEach(el => el.onchange = () => {
    const key = el.dataset.archiveApplicant;
    const current = new Set(archiveLinkOf(key).applicantIds || []);
    if (el.checked) current.add(el.value); else current.delete(el.value);
    setArchiveLink(key, { applicantIds: [...current] }, '신청기관 매칭을 저장했습니다. 기관별 계획서 작업은 각각 따로 유지됩니다.');
  });
  document.querySelectorAll('[data-archive-use]').forEach(el => el.onclick = () => useArchivedNotice(archiveIndexOfKey(el.dataset.archiveUse)));
  document.querySelectorAll('[data-archive-view]').forEach(el => el.onclick = () => viewArchivedNotice(archiveIndexOfKey(el.dataset.archiveView)));
  // 행 우클릭은 브라우저 기본 메뉴 대신 전용 메뉴를 띄운다. 모바일은 길게 누르기로 같은 메뉴를 연다.
  closeArchiveMenu();
  document.querySelectorAll('[data-archive-row]').forEach(row => {
    let pressTimer = null;
    const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };
    row.oncontextmenu = event => { event.preventDefault(); openArchiveMenu(row.dataset.archiveRow, event.clientX, event.clientY); };
    row.ontouchstart = event => {
      const touch = event.touches[0];
      pressTimer = setTimeout(() => { pressTimer = null; openArchiveMenu(row.dataset.archiveRow, touch.clientX, touch.clientY); }, 500);
    };
    row.ontouchmove = cancel;
    row.ontouchend = cancel;
    row.ontouchcancel = cancel;
  });
  document.querySelectorAll('[data-archive-remove]').forEach(el => el.onclick = () => hideArchivedNotices([el.dataset.archiveRemove]));
  document.querySelector('#archive-delete-selected')?.addEventListener('click', () => hideArchivedNotices(archiveTableState().selected || []));
  document.querySelector('#archive-restore-hidden')?.addEventListener('click', () => setState({ archiveHiddenNotices: [], notice: '숨긴 공고를 다시 목록에 표시했습니다.' }));
  // 완료 알림: 결과 보기·다시 시도·닫기. 실패는 자동으로 옮기지 않는다.
  document.querySelector('#ai-result-go')?.addEventListener('click', showAiResultLocation);
  document.querySelector('#ai-result-close')?.addEventListener('click', () => setState({ aiResult: null }));
  document.querySelectorAll('[data-ai-retry]').forEach(el => el.onclick = () => { const target = document.querySelector('#' + el.dataset.aiRetry); setState({ aiResult: null }); setTimeout(() => target?.click(), 40); });
  // [샘플] 예시 열기·닫기. 현재 작업 상태는 바꾸지 않는다.
  document.querySelectorAll('[data-open-sample]').forEach(el => el.onclick = () => openSample(el.dataset.openSample));
  document.querySelector('#close-sample')?.addEventListener('click', closeSample);
  document.querySelector('#import-notice-url')?.addEventListener('click', addMissingNotice);
  document.querySelectorAll('[data-notice-content]').forEach(panel => { panel.style.display = 'none'; });
  document.querySelectorAll('[data-notice-panel]').forEach(el => el.onclick = () => {
    const content = document.querySelector(`[data-notice-content="${el.dataset.noticePanel}-${el.dataset.noticeIndex}"]`);
    if (!content) return;
    const willOpen = content.hidden;
    document.querySelectorAll(`[data-notice-content$="-${el.dataset.noticeIndex}"]`).forEach(panel => { panel.hidden = true; panel.style.display = 'none'; });
    document.querySelectorAll(`[data-notice-panel][data-notice-index="${el.dataset.noticeIndex}"]`).forEach(button => button.setAttribute('aria-expanded', 'false'));
    content.hidden = !willOpen;
    content.style.display = willOpen ? 'block' : 'none';
    el.setAttribute('aria-expanded', String(willOpen));
  });
  document.querySelectorAll('[data-view-notice]').forEach(el => el.onclick = () => previewOfficialNotice(el.dataset.viewNotice));
  document.querySelectorAll('[data-select-notice]').forEach(el => el.onclick = () => selectOfficialNotice(el.dataset.selectNotice));
  document.querySelectorAll('[data-remove-notice]').forEach(el => el.onclick = () => removeOfficialNotice(el.dataset.removeNotice));
  document.querySelectorAll('[data-notice-check]').forEach(el => el.onchange = () => toggleNoticeSelection(el.dataset.noticeCheck, el.checked));
  document.querySelector('#analyze-notice-logic')?.addEventListener('click', analyzeNoticeSelectionLogic);
  document.querySelector('#analyze-notice-bundle')?.addEventListener('click', analyzeNoticeBundleFiles);
  document.querySelectorAll('[data-blueprint-type]').forEach(el => el.onclick = () => setBlueprintValue('applicationType', '신청유형', el.dataset.blueprintType));
  document.querySelectorAll('[data-blueprint-save]').forEach(el => el.onclick = () => saveBlueprintInputs(el.dataset.blueprintSave));
  document.querySelector('#blueprint-draft')?.addEventListener('click', createDraft);
  document.querySelector('#remove-selected-notices')?.addEventListener('click', removeSelectedNotices);
  document.querySelectorAll('[data-restore-notice]').forEach(el => el.onclick = () => restoreNotice(el.dataset.restoreNotice));
  document.querySelectorAll('[data-delete-notice-forever]').forEach(el => el.onclick = () => deleteNoticeForever(el.dataset.deleteNoticeForever));
  document.querySelector('#choose-preview-notice')?.addEventListener('click', choosePreviewNotice);
  document.querySelector('#proceed-selected-notice')?.addEventListener('click', generateCompleteProposal);
  document.querySelectorAll('[data-select-subproject]').forEach(el => el.onclick = () => selectNoticeSubproject(el.dataset.selectSubproject));
  document.querySelectorAll('[data-download-attachment]').forEach(el => el.onclick = () => handleOfficialAttachment(el.dataset.downloadAttachment, false));
  document.querySelectorAll('[data-extract-attachment]').forEach(el => el.onclick = () => handleOfficialAttachment(el.dataset.extractAttachment, true));
  const analyzeButton = document.querySelector('#analyze');
  if (analyzeButton) { analyzeButton.textContent = '사업계획서 작성 →'; analyzeButton.addEventListener('click', generateCompleteProposal); }
  document.querySelectorAll('[data-answer]').forEach(el => el.oninput = () => { const questions = state.answers.length ? state.answers : structuredClone(state.analysis.questions || []); questions[Number(el.dataset.answer)].answer = el.value; state.answers = questions; saveState(); });
  document.querySelector('#draft')?.addEventListener('click', createDraft);
  document.querySelectorAll('[data-design-answer]').forEach(el => el.oninput = () => { const question = state.missingInformation[Number(el.dataset.designAnswer)]; if (question) { state.designAnswers[question] = el.value; saveState(); } });
  document.querySelector('#regenerate-design')?.addEventListener('click', generateCompleteProposal);
  // 일괄 생성은 남은 항목 전체, 개별 생성은 해당 항목만 AI로 만든다.
  document.querySelector('#generate-parts')?.addEventListener('click', () => generateProposalParts());
  document.querySelectorAll('[data-generate-part]').forEach(el => el.onclick = () => generateProposalParts(el.dataset.generatePart));
  document.querySelector('#assemble-proposal')?.addEventListener('click', assembleProposal);
  document.querySelectorAll('[data-section-title]').forEach(el => el.oninput = () => { state.sections[Number(el.dataset.sectionTitle)].title = el.value; saveState(); });
  document.querySelectorAll('[data-section-content]').forEach(el => el.oninput = () => { state.sections[Number(el.dataset.sectionContent)].content = el.value; saveState(); });
  document.querySelectorAll('[data-rewrite]').forEach(el => el.onclick = () => rewriteSection(Number(el.dataset.rewrite)));
  document.querySelectorAll('[data-revision-section]').forEach(el => el.onchange = () => updateRevisionTarget(el.dataset.revisionSection, el.value));
  document.querySelectorAll('[data-revision-rewrite]').forEach(el => el.onclick = () => rewriteFromCoaching(el.dataset.revisionRewrite));
  document.querySelectorAll('[data-revision-done]').forEach(el => el.onclick = () => markRevisionDone(el.dataset.revisionDone));
  document.querySelectorAll('[data-restore-version]').forEach(el => el.onclick = () => restoreProposalVersion(Number(el.dataset.restoreVersion)));
  document.querySelector('#save-revision-version')?.addEventListener('click', () => saveRevisionVersion());
  document.querySelector('#send-revision-to-coaching')?.addEventListener('click', sendRevisionToCoaching);
  document.querySelector('#discard-revision-plan')?.addEventListener('click', () => setState({ revisionPlan: null, notice: '수정 요청 목록을 닫았습니다. 저장된 버전은 유지됩니다.' }));
  document.querySelectorAll('[data-confirm-fact]').forEach(el => el.onclick = () => confirmCompanyFact(Number(el.dataset.confirmFact)));
  document.querySelector('#confirm-company-fact')?.addEventListener('click', confirmCompanyFactDraft);
  document.querySelector('#save-proposal-archive')?.addEventListener('click', () => archiveCurrentProposal(undefined, true).catch(showError));
  document.querySelector('#docx')?.addEventListener('click', () => exportDocx(state.project, state.sections).catch(showError));
  document.querySelector('#pdf')?.addEventListener('click', () => exportPdf(state.project, state.sections).catch(showError));
  document.querySelector('#print')?.addEventListener('click', printDocument);
  // 최종 제출본 카드의 출력 버튼. 상단 도구모음과 같은 현재 본문을 출력한다.
  document.querySelector('#final-docx')?.addEventListener('click', () => exportDocx(state.project, state.sections).catch(showError));
  document.querySelector('#final-pdf')?.addEventListener('click', () => exportPdf(state.project, state.sections).catch(showError));
  document.querySelector('#final-print')?.addEventListener('click', printDocument);
  document.querySelector('#proposal-review')?.addEventListener('click', () => runProposalReview(Boolean(state.reviewResult)));
  document.querySelectorAll('[data-apply-review]').forEach(el => el.onclick = () => applyReviewSection(Number(el.dataset.applyReview)));
  document.querySelector('#apply-all-review')?.addEventListener('click', applyAllReviewSections);
  document.querySelector('#restore-review-draft')?.addEventListener('click', restoreReviewDraft);
  document.querySelector('#coaching-title')?.addEventListener('input', event => { state.coaching.title = event.target.value; saveState(); });
  document.querySelector('#coaching-text')?.addEventListener('input', event => { state.coaching.text = event.target.value; saveState(); });
  document.querySelector('#coaching-criteria')?.addEventListener('input', event => { state.coaching.criteriaText = event.target.value; saveState(); });
  document.querySelector('#coaching-official-evaluation')?.addEventListener('change', event => { state.coaching.officialEvaluationProvided = event.target.checked; saveState(); });
  document.querySelector('#coaching-file')?.addEventListener('change', event => loadCoachingProposalFile(event.target.files?.[0]));
  bindDropzone('#coaching-dropzone', files => loadCoachingProposalFile(files[0]));
  bindDropzone('#reference-dropzone', files => addCoachingReferenceFiles(files));
  document.querySelector('#reference-file')?.addEventListener('change', event => addCoachingReferenceFiles([...(event.target.files || [])]));
  document.querySelector('#reference-type')?.addEventListener('change', event => { state.coaching.referenceType = event.target.value; saveState(); });
  document.querySelector('#reference-name')?.addEventListener('input', event => { state.coaching.referenceNameDraft = event.target.value; saveState(); });
  document.querySelector('#reference-text')?.addEventListener('input', event => { state.coaching.referenceDraft = event.target.value; saveState(); });
  document.querySelector('#add-reference-text')?.addEventListener('click', addCoachingReferenceText);
  document.querySelectorAll('[data-reference-type]').forEach(el => el.onchange = () => updateReferenceType(el.dataset.referenceType, el.value));
  document.querySelectorAll('[data-remove-reference]').forEach(el => el.onclick = () => removeCoachingReference(el.dataset.removeReference));
  document.querySelector('#coach-current-proposal')?.addEventListener('click', coachCurrentProposal);
  document.querySelector('#coach-list-archive')?.addEventListener('click', loadCoachingArchive);
  document.querySelectorAll('[data-coach-archive]').forEach(el => el.onclick = () => loadArchivedProposalForCoaching(el.dataset.coachArchive));
  document.querySelector('#run-coaching')?.addEventListener('click', runProposalCoaching);
  document.querySelectorAll('[data-coaching-status]').forEach(el => el.onchange = () => updateCoachingStatus(Number(el.dataset.coachingStatus), el.value));
  document.querySelectorAll('[data-coaching-revise]').forEach(el => el.onclick = () => requestCoachingRevision(Number(el.dataset.coachingRevise)));
  document.querySelectorAll('[data-coaching-apply]').forEach(el => el.onclick = () => applyCoachingRevision(Number(el.dataset.coachingApply)));
  document.querySelectorAll('[data-coaching-undo]').forEach(el => el.onclick = () => undoCoachingRevision(Number(el.dataset.coachingUndo)));
  document.querySelector('#print-coaching-report')?.addEventListener('click', printCoachingReport);
  document.querySelectorAll('[data-coaching-select]').forEach(el => el.onchange = () => toggleCoachingSelection(Number(el.dataset.coachingSelect), el.checked));
  document.querySelector('#select-all-issues')?.addEventListener('click', () => setState({ coachingSelection: (state.coaching.result?.issues || []).map((_, index) => index), notice: '모든 문제를 선택했습니다.' }));
  document.querySelector('#send-issues-to-writer')?.addEventListener('click', sendIssuesToWriter);
  document.querySelector('#adopt-external-proposal')?.addEventListener('click', adoptExternalProposal);
  document.querySelector('#analyze-proposal-structure')?.addEventListener('click', analyzeProposalText);
  document.querySelector('#select-all-structure')?.addEventListener('click', () => {
    const major = (state.coaching.structure?.review.findings || []).filter(item => item.priority !== '일반 개선').map(item => item.id);
    state.coaching = { ...state.coaching, structureSelection: major };
    setState({ coaching: state.coaching, notice: `주요 문제 ${major.length}건을 선택했습니다.` });
  });
  document.querySelectorAll('[data-structure-select]').forEach(el => el.onchange = () => {
    const selection = new Set(state.coaching.structureSelection || []);
    if (el.checked) selection.add(el.dataset.structureSelect); else selection.delete(el.dataset.structureSelect);
    state.coaching = { ...state.coaching, structureSelection: [...selection] };
    saveState();
  });
  document.querySelector('#apply-structure-revision')?.addEventListener('click', applyStructureRevision);
  document.querySelectorAll('[data-repair-answer]').forEach(el => el.oninput = () => {
    state.coaching = { ...state.coaching, repairAnswers: { ...(state.coaching.repairAnswers || {}), [el.dataset.repairAnswer]: el.value } };
    saveState();
  });
  document.querySelector('#apply-repair-plans')?.addEventListener('click', applyRepairPlansToProposal);
  document.querySelectorAll('[data-decision-save]').forEach(el => el.onclick = () => {
    const key = el.dataset.decisionSave;
    const field = DECISION_FIELDS.find(item => item.key === key);
    setBlueprintValue(key, field?.label || key, document.querySelector(`[data-decision-input="${key}"]`)?.value || '');
  });
  document.querySelector('#build-final-version')?.addEventListener('click', buildFinalVersion);
  document.querySelectorAll('[data-home-start]').forEach(el => el.onclick = () => { state.activeTool = 'workflow'; navigateToStep(0, { notice: '', error: '' }); });
  document.querySelectorAll('[data-home-continue]').forEach(el => el.onclick = () => { state.activeTool = 'workflow'; navigateToStep(state.sections.length ? Math.max(state.step, 4) : 0, { notice: '', error: '' }); });
  // 자료보관함은 공고 준비 화면 안에 있으므로 이동 후 해당 카드로 바로 스크롤한다.
  document.querySelectorAll('[data-home-archive]').forEach(el => el.onclick = () => {
    state.activeTool = 'workflow';
    navigateToStep(0, { notice: '자료보관함을 열었습니다. 보관된 공고와 저장한 계획서를 여기서 다시 열 수 있습니다.', error: '' });
    setTimeout(() => document.querySelector('#archive-box')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  });
  document.querySelectorAll('[data-home-recent]').forEach(el => el.onclick = () => document.querySelector('#home-recent')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  // 진입 경로 카드는 기존 동작을 그대로 부른다. 새 흐름을 만들지 않는다.
  document.querySelectorAll('[data-route]').forEach(el => el.onclick = () => {
    if (el.dataset.route === 'fetch') return loadOfficialNotices();
    if (el.dataset.route === 'upload') return document.querySelector('#source-files')?.click();
    if (el.dataset.route === 'archive') return document.querySelector('#archive-box')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // 홈 6단계 덱: 좌우로 넘겨 보되 세로 스크롤은 그대로 둔다. 화면 상태는 바꾸지 않는다.
  document.querySelectorAll('[data-deck]').forEach(deck => {
    const track = deck.querySelector('[data-deck-track]');
    const dots = [...deck.querySelectorAll('[data-deck-dot], .home-deck-dot')];
    if (!track) return;
    const cards = [...track.children];
    const step = () => (cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth);
    const current = () => Math.round(track.scrollLeft / Math.max(1, step()));
    const goTo = index => track.scrollTo({ left: Math.max(0, Math.min(cards.length - 1, index)) * step(), behavior: 'smooth' });
    deck.querySelector('[data-deck-prev]')?.addEventListener('click', () => goTo(current() - 1));
    deck.querySelector('[data-deck-next]')?.addEventListener('click', () => goTo(current() + 1));
    dots.forEach(dot => dot.addEventListener('click', () => goTo(Number(dot.dataset.deckGo || 0))));
    track.addEventListener('scroll', () => {
      const index = current();
      dots.forEach((dot, position) => dot.classList.toggle('active', position === index));
    }, { passive: true });
  });
  document.querySelectorAll('[data-home-scroll]').forEach(el => el.onclick = () => document.querySelector(`#${el.dataset.homeScroll}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  // 대화형 시작: 공고문 업로드와 직접 입력 모두 기존 공고 준비 단계로 연결한다.
  document.querySelectorAll('[data-home-upload]').forEach(el => el.onclick = () => { state.activeTool = 'workflow'; navigateToStep(0, { notice: '공고문·신청서 파일을 업로드해 주세요. 아래 업로드 영역에 파일을 끌어다 놓아도 됩니다.', error: '' }); });
  document.querySelectorAll('[data-home-manual]').forEach(el => el.onclick = () => { state.activeTool = 'workflow'; navigateToStep(0, { notice: '공고문이 없으면 아래 직접 입력란에 사업 내용을 붙여넣어 시작할 수 있습니다.', error: '' }); });
  document.querySelectorAll('[data-home-step]').forEach(el => el.onclick = () => { state.activeTool = 'workflow'; navigateToStep(Number(el.dataset.homeStep), { notice: '', error: '' }); });
  document.querySelector('#coaching-applicant-target')?.addEventListener('change', event => setState({ coachingApplicantId: event.target.value, applicantExtraction: null }));
  document.querySelector('#harvest-coaching-applicant')?.addEventListener('click', harvestApplicantFromCoaching);
  if (state.activeTool === 'coaching' && state.coaching.pendingJob && !coachingPollActive) setTimeout(() => pollProposalCoaching(), 250);
}

function bindApplicants() {
  document.querySelector('#applicant-name-draft')?.addEventListener('input', event => { state.applicantNameDraft = event.target.value; });
  document.querySelector('#add-applicant')?.addEventListener('click', addApplicant);
  document.querySelector('#load-applicants')?.addEventListener('click', loadApplicantsFromArchive);
  document.querySelectorAll('[data-edit-applicant]').forEach(el => el.onclick = () => setState({ activeTool: 'applicants', applicantEditingId: state.applicantEditingId === el.dataset.editApplicant ? '' : el.dataset.editApplicant, notice: '', error: '' }));
  document.querySelectorAll('[data-select-applicant]').forEach(el => el.onclick = () => selectApplicantForProject(el.dataset.selectApplicant));
  // 신청기관 정보가 없어도 계획서 작성을 막지 않는다.
  document.querySelector('#skip-applicant')?.addEventListener('click', () => navigateToStep(3, { applicantSkipped: true, notice: '신청기관 없이 진행합니다. 확인되지 않은 기관 사실은 만들지 않고 [확인 필요]로 남깁니다.', error: '' }));
  document.querySelectorAll('[data-delete-applicant]').forEach(el => el.onclick = () => removeApplicant(el.dataset.deleteApplicant));
  document.querySelector('#save-applicant')?.addEventListener('click', () => persistApplicant(state.applicantEditingId, true));
  document.querySelector('#applicant-name')?.addEventListener('input', event => { updateEditingApplicant(applicant => { applicant.name = event.target.value; }); });
  document.querySelector('#applicant-note')?.addEventListener('input', event => { updateEditingApplicant(applicant => { applicant.note = event.target.value; }); });
  document.querySelectorAll('[data-applicant-field]').forEach(el => el.oninput = () => {
    const [itemId, field] = el.dataset.applicantField.split('|');
    updateEditingApplicant(applicant => { const item = applicant.items.find(value => value.id === itemId); if (item) { item[field] = el.value; item.updatedAt = new Date().toISOString(); } });
  });
  document.querySelectorAll('[data-applicant-status]').forEach(el => el.onchange = () => {
    updateEditingApplicant(applicant => { const item = applicant.items.find(value => value.id === el.dataset.applicantStatus); if (item) { item.status = el.value; item.updatedAt = new Date().toISOString(); } });
    setState({ applicants: state.applicants, notice: '항목 상태를 변경했습니다. 저장 버튼으로 보관함에도 반영하세요.' });
  });
  document.querySelectorAll('[data-remove-applicant-item]').forEach(el => el.onclick = () => {
    updateEditingApplicant(applicant => { applicant.items = applicant.items.filter(item => item.id !== el.dataset.removeApplicantItem); });
    setState({ applicants: state.applicants, notice: '항목을 삭제했습니다.' });
  });
  document.querySelectorAll('[data-applicant-draft]').forEach(el => {
    const handler = () => {
      const [areaKey, field] = el.dataset.applicantDraft.split('|');
      state.applicantItemDrafts[areaKey] = { label: '', value: '', status: '확인 필요', source: '', ...state.applicantItemDrafts[areaKey], [field]: el.value };
    };
    el.oninput = handler; el.onchange = handler;
  });
  document.querySelectorAll('[data-add-applicant-item]').forEach(el => el.onclick = () => addApplicantItem(el.dataset.addApplicantItem));
  document.querySelector('#load-applicant-archive')?.addEventListener('click', loadApplicantArchiveProposals);
  document.querySelectorAll('[data-applicant-archive]').forEach(el => el.onclick = () => harvestApplicantFromArchive(el.dataset.applicantArchive));
  document.querySelector('#applicant-doc-text')?.addEventListener('input', event => { state.applicantDocDraft = event.target.value; });
  document.querySelector('#applicant-doc-file')?.addEventListener('change', loadApplicantDocument);
  document.querySelector('#extract-applicant-doc')?.addEventListener('click', () => buildApplicantCandidates(state.applicantDocDraft, '붙여넣은 기관 문서'));
  document.querySelector('#apply-safe-candidates')?.addEventListener('click', applySafeApplicantCandidates);
  document.querySelectorAll('[data-apply-candidate]').forEach(el => el.onclick = () => applyApplicantCandidate(el.dataset.applyCandidate));
  document.querySelectorAll('[data-ignore-candidate]').forEach(el => el.onclick = () => dropApplicantCandidate(el.dataset.ignoreCandidate, '후보를 무시했습니다.'));
  document.querySelector('#project-value-label')?.addEventListener('input', event => { state.projectValueDraft.label = event.target.value; });
  document.querySelector('#project-value-value')?.addEventListener('input', event => { state.projectValueDraft.value = event.target.value; });
  document.querySelector('#project-value-item')?.addEventListener('change', event => { state.projectValueDraft.applicantItemId = event.target.value; });
  document.querySelector('#add-project-value')?.addEventListener('click', addProjectValue);
  document.querySelectorAll('[data-remove-project-value]').forEach(el => el.onclick = () => setState({ projectValues: state.projectValues.filter(item => item.id !== el.dataset.removeProjectValue), notice: '이번 사업 값을 삭제했습니다.' }));
  document.querySelectorAll('[data-applicant-answer]').forEach(el => el.oninput = () => { state.designAnswers[el.dataset.question] = el.value; saveState(); });
}

function updateEditingApplicant(mutate) {
  const applicant = findApplicant(state.applicants, state.applicantEditingId);
  if (!applicant) return null;
  const next = structuredClone(applicant);
  mutate(next);
  state.applicants = upsertApplicant(state.applicants, next);
  saveState();
  return findApplicant(state.applicants, next.id);
}

function addApplicant() {
  const name = state.applicantNameDraft.trim();
  if (!name) return setState({ error: '추가할 신청기관명을 입력해 주세요.' });
  const applicant = normalizeApplicant({ name });
  state.applicants = upsertApplicant(state.applicants, applicant);
  state.applicantNameDraft = '';
  setState({ applicants: state.applicants, applicantNameDraft: '', applicantEditingId: applicant.id, notice: `${name} 신청기관을 추가했습니다. 항목을 등록하세요.`, error: '' });
  void persistApplicant(applicant.id, false);
}

function addApplicantItem(areaKey) {
  const draft = state.applicantItemDrafts[areaKey] || {};
  if (!String(draft.label || '').trim()) return setState({ error: '추가할 항목명을 입력해 주세요.' });
  const item = makeApplicantItem({ area: areaKey, label: draft.label, value: draft.value, status: draft.status, source: draft.source });
  updateEditingApplicant(applicant => { applicant.items = [...applicant.items, item]; });
  state.applicantItemDrafts[areaKey] = { label: '', value: '', status: '확인 필요', source: '' };
  setState({ applicants: state.applicants, applicantItemDrafts: state.applicantItemDrafts, notice: `${areaTitle(areaKey)} 항목을 추가했습니다.`, error: '' });
}

async function loadApplicantDocument(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  setState({ busy: '기관 문서를 읽는 중...', error: '', notice: '' });
  try {
    const parsed = await extractFile(file);
    state.applicantDocDraft = parsed.text;
    setState({ busy: '', applicantDocDraft: parsed.text });
    buildApplicantCandidates(parsed.text, parsed.name);
  } catch (error) { setState({ busy: '', error: error.message }); }
}

// 추출 결과는 후보 목록일 뿐이며 이 단계에서 기관 정보는 바뀌지 않는다.
function buildApplicantCandidates(text, documentName) {
  const applicant = findApplicant(state.applicants, state.applicantEditingId);
  if (!applicant) return setState({ error: '정보를 추출할 신청기관을 먼저 선택해 주세요.' });
  if (String(text || '').trim().length < 20) return setState({ error: '추출할 문서 내용이 너무 짧습니다.' });
  const review = buildUpdateCandidates(applicant, extractApplicantCandidates(text, { documentName }));
  setState({ applicantExtraction: review, notice: `업데이트 후보 ${review.candidates.length}건을 만들었습니다. 반영할 항목을 확인하세요.`, error: '' });
}

// 검증·코칭에 넣은 계획서에서 신청기관 정보 후보를 만든다. 코칭 결과·본문은 바꾸지 않는다.
function harvestApplicantFromCoaching() {
  const targetId = state.applicants.some(item => item.id === state.coachingApplicantId) ? state.coachingApplicantId : state.selectedApplicantId;
  const applicant = findApplicant(state.applicants, targetId);
  if (!applicant) return setState({ error: '반영할 신청기관을 먼저 선택해 주세요.' });
  if (state.coaching.text.trim().length < 30) return setState({ error: '검증한 계획서 원문이 없습니다.' });
  const extraction = extractApplicantCandidates(state.coaching.text, { documentName: state.coaching.title || '검증한 계획서', includeNarrative: true, sourceLabel: '검증·코칭 계획서' });
  const review = buildUpdateCandidates(applicant, extraction);
  const kinds = review.candidates.reduce((counts, candidate) => ({ ...counts, [candidate.kind]: (counts[candidate.kind] || 0) + 1 }), {});
  setState({
    coachingApplicantId: applicant.id, applicantExtraction: review, error: '',
    notice: review.candidates.length
      ? `${applicant.name} 기준으로 후보 ${review.candidates.length}건을 만들었습니다. ${Object.entries(kinds).map(([kind, count]) => `${kind} ${count}건`).join(' · ')}`
      : '계획서에서 기관 정보로 쓸 사실을 찾지 못했습니다.'
  });
}

// 자료보관함에 저장된 과거 계획서를 다시 업로드하지 않고 기관 정보 보강에 사용한다.
async function loadApplicantArchiveProposals() {
  setAiBusy('자료보관함 계획서를 불러오는 중', { error: '', notice: '' }, 'coachingLoad');
  try {
    const result = await listArchivedProposals();
    setState({ busy: '', archiveProposals: result.proposals || [], notice: `보관된 계획서 ${result.proposals?.length || 0}건입니다${elapsedLabel()}. 정보를 가져올 계획서를 고르세요.` });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

async function harvestApplicantFromArchive(id) {
  const applicant = findApplicant(state.applicants, state.applicantEditingId);
  if (!applicant) return setState({ error: '정보를 보강할 신청기관을 먼저 선택해 주세요.' });
  setAiBusy('보관된 계획서에서 기관 정보를 찾는 중', { error: '', notice: '' }, 'applicantScan');
  try {
    const result = await getArchivedProposal(id);
    const proposal = result.proposal;
    const text = proposalTextFromSnapshot(proposal?.snapshot);
    if (text.trim().length < 30) return setState({ busy: '', error: '이 보관 계획서에는 사용할 본문이 없습니다.' });
    const extraction = extractApplicantCandidates(text, { documentName: proposal.title || '보관된 계획서', includeNarrative: true, sourceLabel: '자료보관함 계획서' });
    const review = buildUpdateCandidates(applicant, extraction);
    setState({ busy: '', applicantExtraction: review, notice: `${proposal.title}에서 후보 ${review.candidates.length}건을 만들었습니다${elapsedLabel()}. 반영은 ${applicant.name}에만 적용됩니다.`, error: '' });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

function dropApplicantCandidate(candidateId, message) {
  const review = state.applicantExtraction;
  if (!review) return;
  const remaining = review.candidates.filter(candidate => candidate.id !== candidateId);
  setState({ applicantExtraction: { ...review, candidates: remaining }, notice: message, error: '' });
}

function applyApplicantCandidate(candidateId) {
  const review = state.applicantExtraction;
  const candidate = review?.candidates.find(item => item.id === candidateId);
  const applicant = findApplicant(state.applicants, review?.applicantId);
  if (!candidate || !applicant) return;
  state.applicants = upsertApplicant(state.applicants, applyUpdateCandidate(applicant, candidate));
  dropApplicantCandidate(candidateId, candidate.kind === '동일'
    ? `${candidate.label}은 기존 값 그대로 두고 이 문서를 근거로 추가했습니다.`
    : `${candidate.label} 후보를 ‘확인 필요’ 상태로 반영했습니다. 확인 후 상태를 변경하고 저장하세요.`);
  void persistApplicant(applicant.id, false);
}

function applySafeApplicantCandidates() {
  const review = state.applicantExtraction;
  const applicant = findApplicant(state.applicants, review?.applicantId);
  if (!review || !applicant) return;
  const { applicant: updated, applied } = applySafeCandidates(applicant, review.candidates);
  if (!applied) return setState({ notice: '일괄 반영할 신규·누적·근거 추가 후보가 없습니다. 변경·충돌 후보는 개별 확인이 필요합니다.' });
  state.applicants = upsertApplicant(state.applicants, updated);
  const remaining = review.candidates.filter(candidate => !['신규', '누적 추가'].includes(candidate.kind) && !(candidate.kind === '동일' && candidate.existingItemId));
  setState({ applicants: state.applicants, applicantExtraction: { ...review, candidates: remaining }, notice: `후보 ${applied}건을 반영했습니다. 신규·누적은 ‘확인 필요’ 상태로 추가하고, 같은 정보는 근거만 추가했습니다.`, error: '' });
  void persistApplicant(applicant.id, false);
}

function selectApplicantForProject(id) {
  const applicant = findApplicant(state.applicants, id);
  if (!applicant) return setState({ error: '선택한 신청기관을 찾지 못했습니다.' });
  const confirmed = confirmedItems(applicant).length;
  state.activeTool = 'workflow';
  navigateToStep(2, { selectedApplicantId: applicant.id, applicantComparison: null, applicantSkipped: false, notice: `${applicant.name}의 확인된 정보 ${confirmed}건을 이번 사업에 불러왔습니다.`, error: '' });
}

function removeApplicant(id) {
  const applicant = findApplicant(state.applicants, id);
  if (!applicant) return;
  if (!window.confirm(`${applicant.name} 신청기관 정보를 삭제할까요? 이미 저장된 계획서는 삭제되지 않습니다.`)) return;
  state.applicants = state.applicants.filter(item => item.id !== id);
  setState({ applicants: state.applicants, applicantEditingId: state.applicantEditingId === id ? '' : state.applicantEditingId, selectedApplicantId: state.selectedApplicantId === id ? '' : state.selectedApplicantId, notice: '신청기관 정보를 삭제했습니다.' });
  deleteArchivedApplicant(id).catch(() => setState({ error: '보관함에서 신청기관을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.' }));
}

// 설계도에서 받은 값은 이번 사업 값으로만 저장한다. 신청기관 원본 항목은 건드리지 않는다.
function setBlueprintValue(key, label, value) {
  const text = String(value || '').trim();
  const rest = (state.projectValues || []).filter(item => item.blueprintKey !== key);
  const next = text ? [...rest, { id: `blueprint-${key}`, blueprintKey: key, label, value: text, applicantItemId: '' }] : rest;
  setState({ projectValues: next, notice: text ? `${label}을(를) 이번 사업 값으로 저장했습니다. 설계도를 다시 계산했습니다.` : `${label} 값을 지웠습니다.`, error: '' });
}
function saveBlueprintInputs(sectionKey) {
  const inputs = BLUEPRINT_INPUTS[sectionKey] || [];
  const rest = (state.projectValues || []).filter(item => !inputs.some(([key]) => item.blueprintKey === key));
  const added = [];
  for (const [key, label] of inputs) {
    const text = String(document.querySelector(`[data-blueprint-input="${key}"]`)?.value || '').trim();
    if (text) added.push({ id: `blueprint-${key}`, blueprintKey: key, label, value: text, applicantItemId: '' });
  }
  setState({ projectValues: [...rest, ...added], notice: added.length ? `이번 사업 값 ${added.length}건을 저장하고 설계도를 다시 계산했습니다. 신청기관 원본은 변경되지 않았습니다.` : '입력값이 없어 저장하지 않았습니다.', error: '' });
}

function addProjectValue() {
  const draft = state.projectValueDraft;
  const applicant = selectedApplicant();
  const source = applicant?.items.find(item => item.id === draft.applicantItemId) || null;
  const label = String(draft.label || '').trim() || source?.label || '';
  const value = String(draft.value || '').trim();
  if (!label || !value) return setState({ error: '이번 사업에 사용할 항목명과 값을 입력해 주세요.' });
  const entry = { id: `project-value-${Date.now().toString(36)}`, label, value, applicantItemId: source?.id || '' };
  state.projectValueDraft = { label: '', value: '', applicantItemId: '' };
  setState({ projectValues: [...state.projectValues, entry], projectValueDraft: state.projectValueDraft, notice: '이번 사업 전용 값을 추가했습니다. 신청기관 원본은 변경되지 않습니다.', error: '' });
}

async function persistApplicant(id, announce) {
  const applicant = findApplicant(state.applicants, id);
  if (!applicant) return;
  try {
    await saveArchivedApplicant(applicant);
    if (announce) setState({ notice: `${applicant.name} 신청기관 정보를 보관함에 저장했습니다.`, error: '' });
  } catch (error) {
    if (announce) setState({ error: `신청기관 정보를 보관함에 저장하지 못했습니다: ${error.message}` });
  }
}

async function loadApplicantsFromArchive() {
  setState({ busy: '보관된 신청기관 정보를 불러오는 중...', error: '', notice: '' });
  try {
    const result = await listArchivedApplicants();
    let applicants = state.applicants;
    for (const value of result.applicants || []) {
      const stored = normalizeApplicant(value);
      const local = findApplicant(applicants, stored.id);
      if (!local || String(local.updatedAt) <= String(stored.updatedAt)) applicants = upsertApplicant(applicants, stored);
    }
    setState({ busy: '', applicants, notice: `보관된 신청기관 ${result.applicants?.length || 0}곳을 불러왔습니다.` });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

// 클릭 선택과 드래그앤드롭이 같은 처리 경로를 쓴다.
async function loadCoachingProposalFile(file) {
  if (!file) return;
  setAiBusy('검증할 계획서 파일을 읽는 중', { error: '', notice: '' }, 'coachingFile');
  try {
    const parsed = await extractFile(file);
    state.coaching = { ...state.coaching, title: state.coaching.title || parsed.name.replace(/\.[^.]+$/, ''), text: parsed.text, result: null };
    setState({ busy: '', coaching: state.coaching, notice: `${parsed.type} 계획서를 불러왔습니다${elapsedLabel()}.` });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

// 참고자료는 계획서 본문에 합치지 않고 자료별로 따로 보관한다.
async function addCoachingReferenceFiles(files) {
  const list = [...(files || [])];
  if (!list.length) return;
  setAiBusy(`참고자료 ${list.length}건을 읽는 중`, { error: '', notice: '' });
  const added = [];
  const failed = [];
  for (const file of list) {
    try {
      const parsed = await extractFile(file);
      added.push(makeReference({ id: `reference-${Date.now().toString(36)}-${added.length}`, fileName: parsed.name, referenceType: state.coaching.referenceType, text: parsed.text }));
    } catch (error) { failed.push(error.message); }
  }
  state.coaching = { ...state.coaching, references: [...(state.coaching.references || []), ...added].slice(0, 20) };
  setState({ busy: '', coaching: state.coaching, notice: added.length ? `참고자료 ${added.length}건을 추가했습니다${elapsedLabel()}. 자료 판정 결과를 확인하세요.` : '', error: failed.join(' / ') });
}

function addCoachingReferenceText() {
  const text = String(state.coaching.referenceDraft || '').trim();
  if (text.length < 30) return setState({ error: '참고자료 내용을 30자 이상 붙여넣어 주세요.' });
  const reference = makeReference({ id: `reference-${Date.now().toString(36)}`, fileName: state.coaching.referenceNameDraft || '붙여넣은 참고자료', referenceType: state.coaching.referenceType, text });
  state.coaching = { ...state.coaching, references: [...(state.coaching.references || []), reference].slice(0, 20), referenceDraft: '', referenceNameDraft: '' };
  setState({ coaching: state.coaching, notice: `${reference.fileName}을 참고자료로 추가했습니다.`, error: '' });
}

function updateReferenceType(id, referenceType) {
  state.coaching = { ...state.coaching, references: (state.coaching.references || []).map(item => (item.id === id ? makeReference({ ...item, referenceType }) : item)) };
  setState({ coaching: state.coaching, notice: '참고자료 유형을 변경했습니다. 판정을 다시 확인하세요.', error: '' });
}

function removeCoachingReference(id) {
  state.coaching = { ...state.coaching, references: (state.coaching.references || []).filter(item => item.id !== id) };
  setState({ coaching: state.coaching, notice: '참고자료를 삭제했습니다.', error: '' });
}

function coachCurrentProposal() {
  if (!state.sections.length) return;
  const text = state.sections.map(section => `${section.title}\n${section.content}`).join('\n\n');
  const criteriaText = [state.sourceText, ...state.manualSources.filter(item => ['공모신청서', '심사·평가기준'].includes(item.sourceType)).map(item => item.extractedText)].filter(Boolean).join('\n\n');
  const officialEvaluationProvided = Boolean(state.analysis?.evaluationCriteria?.length || state.manualSources.some(item => item.sourceType === '심사·평가기준' && item.extractionStatus === 'success'));
  setState({ coaching: { ...state.coaching, title: state.project.title || '작성 계획서', text, criteriaText, officialEvaluationProvided, sourceProposalId: state.archiveProposalId || '', sourceNoticeKey: archiveNoticeKey(state.selectedNotice), seriesId: state.archiveProposalId || state.coaching.seriesId, result: null }, notice: '현재 계획서를 검증 대상으로 불러왔습니다.' });
}

async function loadCoachingArchive() {
  setState({ busy: '자료보관함 계획서를 불러오는 중...', error: '', notice: '' });
  try { const result = await listArchivedProposals(); setState({ busy: '', archiveProposals: result.proposals || [], notice: '검증할 계획서를 선택하세요.' }); }
  catch (error) { setState({ busy: '', error: error.message }); }
}

async function loadArchivedProposalForCoaching(id) {
  setState({ busy: '보관된 계획서를 검증 화면에 여는 중...', error: '', notice: '' });
  try {
    const result = await getArchivedProposal(id);
    const snapshot = result.proposal?.snapshot;
    if (!snapshot) throw new Error('보관된 계획서를 찾지 못했습니다.');
    if (result.proposal.stage?.startsWith('coaching-v') && snapshot.coaching) {
      state.coaching = { ...initial.coaching, ...snapshot.coaching, currentArchiveId: result.proposal.id };
      if (state.coaching.result && state.coaching.workItems?.length !== state.coaching.result.issues?.length) state.coaching.workItems = makeCoachingWorkItems(state.coaching.result);
    } else {
      const sections = snapshot.sections || [];
      const text = sections.map(section => `${section.title}\n${section.content}`).join('\n\n');
      const criteriaText = [snapshot.sourceText, ...(snapshot.manualSources || []).filter(item => ['공모신청서', '심사·평가기준'].includes(item.sourceType)).map(item => item.extractedText)].filter(Boolean).join('\n\n');
      const officialEvaluationProvided = Boolean(snapshot.analysis?.evaluationCriteria?.length || (snapshot.manualSources || []).some(item => item.sourceType === '심사·평가기준' && item.extractionStatus === 'success'));
      state.coaching = { ...initial.coaching, title: result.proposal.title, text, criteriaText, officialEvaluationProvided, sourceProposalId: result.proposal.id, sourceNoticeKey: result.proposal.noticeKey || '', seriesId: result.proposal.id };
    }
    setState({ busy: '', coaching: state.coaching, notice: '자료보관함 계획서를 검증 대상으로 불러왔습니다.' });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

async function runProposalCoaching() {
  if (state.coaching.text.trim().length < 30) return setState({ error: '검증할 계획서 내용을 30자 이상 입력해 주세요.' });
  if (state.coaching.pendingJob) return;
  setAiBusy('계획서 전체 검증 작업을 시작하는 중...', { error: '', notice: '' }, 'coaching');
  try {
    const response = await coachingRequest({ action: 'startCoaching', ...coachingPayload() });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(coachingFailureMessage(result, response.status));
    state.coaching.pendingJob = { id: result.jobId, status: result.status || 'queued', pollCount: 0, startedAt: busyStartedAt || Date.now(), diagnostic: result.diagnostic || null };
    setState({ busy: '', coaching: state.coaching, notice: 'background 검증 작업을 시작했습니다.' });
    void pollProposalCoaching();
  } catch (error) { setState({ busy: '', error: error.message }); }
}

function coachingPayload() {
  // 계획서(평가 대상)와 참고자료(판단 근거)를 분리해 전달하고, 자료별 사용 가능 여부를 함께 보낸다.
  return { title: state.coaching.title, proposalText: state.coaching.text, criteriaText: state.coaching.criteriaText, officialEvaluationProvided: state.coaching.officialEvaluationProvided, previousVersion: state.coaching.version || 0, previousResult: state.coaching.result, ...referencePayload(state.coaching.references || [], coachingContext()) };
}

function coachingRequest(body) {
  return fetch('/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': getArchiveRecoveryKey() }, body: JSON.stringify(body) });
}

async function pollProposalCoaching() {
  if (coachingPollActive || !state.coaching.pendingJob) return;
  coachingPollActive = true;
  const jobId = state.coaching.pendingJob.id;
  try {
    // 근거 대조에 쓰는 원문은 서버에 저장하지 않으므로 조회할 때 함께 보낸다.
    const response = await coachingRequest({ action: 'pollCoaching', jobId, proposalText: state.coaching.text, criteriaText: state.coaching.criteriaText, references: referencePayload(state.coaching.references || [], coachingContext()).references });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(coachingFailureMessage(result, response.status));
    if (!state.coaching.pendingJob || state.coaching.pendingJob.id !== jobId) return;
    state.coaching.pendingJob = { ...state.coaching.pendingJob, status: result.status, pollCount: Number(state.coaching.pendingJob.pollCount || 0) + 1, diagnostic: result.diagnostic || state.coaching.pendingJob.diagnostic };
    saveState(); render();
    if (['queued', 'in_progress'].includes(result.status)) setTimeout(() => pollProposalCoaching(), 5000);
    else if (result.status === 'completed') await completeProposalCoaching(result);
  } catch (error) {
    state.coaching.pendingJob = null;
    setState({ busy: '', coaching: state.coaching, error: error.message });
  } finally { coachingPollActive = false; }
}

async function completeProposalCoaching(result) {
  try {
    const version = Number(state.coaching.version || 0) + 1;
    const seriesId = String(state.coaching.seriesId || state.coaching.sourceProposalId || crypto.randomUUID()).slice(0, 60);
    // 재검증이면 이전 결과와 비교해 해결·남은·새 문제를 알려준다.
    const rounds = state.coaching.result ? compareCoachingRounds(state.coaching.result, result) : null;
    state.coaching = { ...state.coaching, result, workItems: makeCoachingWorkItems(result), pendingJob: null, version, seriesId, validatedText: state.coaching.text, lastComparison: rounds };
    const id = `${seriesId}-coaching-v${version}`.slice(0, 80);
    state.coaching.currentArchiveId = id;
    await saveArchivedProposal({ id, noticeKey: state.coaching.sourceNoticeKey, title: `${state.coaching.title || '외부 계획서'} · 코칭 v${version}`, stage: `coaching-v${version}`, snapshot: { coaching: structuredClone(state.coaching), parentProposalId: state.coaching.sourceProposalId || '', coachingSeriesId: seriesId } });
    setState({ busy: '', coaching: state.coaching, coachingSelection: [], notice: `검증·코칭 v${version} 결과를 자료보관함에 저장했습니다.${rounds ? ` 해결 ${rounds.resolved.length}건 · 남은 문제 ${rounds.remaining.length}건 · 새 문제 ${rounds.added.length}건` : ''}` });
  } catch (error) {
    state.coaching.pendingJob = null;
    setState({ busy: '', coaching: state.coaching, error: error.message });
  }
}

function coachingFailureMessage(result, httpStatus) {
  const diagnostic = result.diagnostic || {};
  return `${result.error || '검증·코칭 요청 실패'} · 단계 ${result.failureStage || (httpStatus === 524 ? 'proxy/timeout' : 'unknown')} · HTTP ${httpStatus} · upstream ${diagnostic.upstreamStatus || 0} · ${diagnostic.upstreamErrorType || '-'} / ${diagnostic.upstreamErrorCode || '-'} · request ${diagnostic.upstreamRequestId || '-'} · ${diagnostic.elapsedMs || 0}ms`;
}

function updateCoachingStatus(index, status) {
  if (!['미수정', '수정중', '해결', '확인필요'].includes(status) || !state.coaching.workItems[index]) return;
  state.coaching.workItems[index].status = status;
  setState({ coaching: state.coaching, notice: '개선 항목 상태를 저장했습니다.' });
  void persistCoachingWorkboard();
}

async function requestCoachingRevision(index) {
  const issue = state.coaching.result?.issues?.[index];
  if (!issue || !state.coaching.text.trim()) return;
  setAiBusy('선택한 문제의 수정안만 작성하는 중...', { error: '', notice: '' }, 'coachingRevision');
  try {
    const response = await fetch('/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': getArchiveRecoveryKey() }, body: JSON.stringify({ action: 'reviseIssue', title: state.coaching.title, proposalText: state.coaching.text, criteriaText: state.coaching.criteriaText, issue }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `항목 수정안 요청 실패 (${response.status})`);
    state.coaching.workItems[index] = { ...state.coaching.workItems[index], status: result.requiresConfirmation ? '확인필요' : '수정중', revision: result, applied: false };
    setState({ busy: '', coaching: state.coaching, notice: '선택한 문제의 AI 수정안을 만들었습니다. 비교 후 적용하세요.' });
    void persistCoachingWorkboard();
  } catch (error) { setState({ busy: '', error: error.message }); }
}

function applyCoachingRevision(index) {
  const work = state.coaching.workItems[index];
  const revision = work?.revision;
  if (!revision || work.applied) return;
  const occurrenceCount = state.coaching.text.split(revision.originalExcerpt).length - 1;
  if (occurrenceCount !== 1) return setState({ error: '수정할 원문 위치를 하나로 특정하지 못했습니다. 원문을 확인한 뒤 다시 수정안을 요청하세요.' });
  state.coaching.text = state.coaching.text.replace(revision.originalExcerpt, revision.revisedText);
  state.coaching.workItems[index] = { ...work, applied: true, status: revision.requiresConfirmation ? '확인필요' : '해결' };
  setState({ coaching: state.coaching, notice: '선택한 수정안을 적용했습니다. 필요하면 되돌릴 수 있습니다.' });
  void persistCoachingWorkboard();
}

function undoCoachingRevision(index) {
  const work = state.coaching.workItems[index];
  const revision = work?.revision;
  if (!revision || !work.applied) return;
  const occurrenceCount = state.coaching.text.split(revision.revisedText).length - 1;
  if (occurrenceCount !== 1) return setState({ error: '적용된 수정 위치를 하나로 특정하지 못해 자동으로 되돌릴 수 없습니다.' });
  state.coaching.text = state.coaching.text.replace(revision.revisedText, revision.originalExcerpt);
  state.coaching.workItems[index] = { ...work, applied: false, status: '수정중' };
  setState({ coaching: state.coaching, notice: '수정안 적용을 되돌렸습니다.' });
  void persistCoachingWorkboard();
}

function toggleCoachingSelection(index, checked) {
  const selection = new Set(state.coachingSelection || []);
  if (checked) selection.add(index); else selection.delete(index);
  state.coachingSelection = [...selection].sort((left, right) => left - right);
  saveState();
}

// 공고 본문 + 첨부파일을 하나의 자료묶음으로 읽어 선정 논리를 다시 완성한다. AI 호출 없음.
async function analyzeNoticeBundleFiles() {
  const notice = noticeLogicSource();
  if (!notice) return setState({ error: '분석할 공고를 먼저 선택해 주세요.' });
  const attachments = (notice.attachments || []).filter(item => item?.dstbBsnsCode);
  if (!attachments.length) return setState({ error: '이 공고에는 내려받을 첨부파일이 없습니다.' });
  setAiBusy(`공고 첨부 ${attachments.length}건을 읽는 중`, { error: '', notice: '' });
  try {
    const downloaded = [];
    for (const attachment of attachments) {
      const response = await fetch('/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'downloadAttachment', attachment }) });
      if (!response.ok) { downloaded.push({ name: attachment.name, error: `내려받지 못했습니다 (${response.status})` }); continue; }
      downloaded.push({ name: attachment.name, bytes: new Uint8Array(await response.arrayBuffer()) });
    }
    // PDF·DOCX는 기존 추출 기능을 그대로 사용한다.
    const files = await expandBundle(downloaded, {
      extractText: async ({ name, buffer, extension }) => {
        if (!['pdf', 'docx', 'txt', 'hwpx'].includes(extension)) return '';
        const parsed = await extractFile(new File([buffer], name));
        return parsed.text;
      }
    });
    const base = analyzeNoticeStructure(notice);
    const { structure, conflicts } = mergeBundleStructures(base, files);
    const logic = buildSelectionLogic(structure);
    const requirements = selectionRequirements(structure);
    const summary = { ...noticeLogicSummary(structure, logic, requirements), bundle: bundleSummary(files, conflicts) };
    setState({
      busy: '', noticeLogic: { structure, logic, requirements, summary, files, conflicts },
      notice: `자료묶음 ${files.length}건 중 ${summary.bundle.read}건을 읽었습니다${elapsedLabel()}. 공식 근거 확인 ${summary.confirmedFields}/${structure.fields.length} · 확정 선정요건 ${summary.officialRequirements}개${summary.bundle.conversionNeeded ? ` · 변환 필요 ${summary.bundle.conversionNeeded}건` : ''}`,
      error: ''
    });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

// 공고에서 선정 논리를 구조화한다. AI 호출 없이 공고 원문만 사용한다.
function analyzeNoticeSelectionLogic() {
  const notice = noticeLogicSource();
  if (!notice) return setState({ error: '분석할 공고를 먼저 선택해 주세요.' });
  const structure = analyzeNoticeStructure(notice);
  if (!structure.totalChars) return setState({ error: '공고에서 읽을 원문이 없습니다. 공고문을 직접 자료로 추가해 주세요.' });
  const logic = buildSelectionLogic(structure);
  const requirements = selectionRequirements(structure);
  setState({
    noticeLogic: { structure, logic, requirements, summary: noticeLogicSummary(structure, logic, requirements) },
    notice: `선정 논리를 정리했습니다. 공식 근거 확인 ${structure.fields.filter(field => field.status === '공식 근거 확인').length}개 · 선정 요건 ${requirements.length}개 · ${logic.scoring.mode}`,
    error: ''
  });
}

// 원문을 항목별로 구조화하고 심사 관점 문제를 찾는다. AI 호출 없음.
function analyzeProposalText() {
  if (state.coaching.text.trim().length < 30) return setState({ error: '분석할 계획서 원문을 먼저 넣어 주세요.' });
  const structure = analyzeProposalStructure(state.coaching.text, { documentName: state.coaching.title || '검증 대상 계획서' });
  const review = reviewProposalStructure(structure);
  // 원문은 coaching.text에 이미 있으므로 저장 상태에는 중복해 담지 않는다.
  state.coaching = { ...state.coaching, structure: { structure: { ...structure, originalText: '' }, review }, structureSelection: [] };
  setState({ coaching: state.coaching, notice: `${review.summary} · 원문 ${structure.quality.totalChars.toLocaleString()}자를 그대로 보존했습니다.`, error: '' });
}

// 검증된 문제만 작성 본문에 반영해 수정본(V2)을 만든다. 원본 버전은 그대로 남는다.
function applyStructureRevision() {
  const analysis = state.coaching.structure;
  if (!analysis) return setState({ error: '먼저 원문 구조 분석을 실행해 주세요.' });
  const selected = analysis.review.findings.filter(item => (state.coaching.structureSelection || []).includes(item.id));
  const findings = selected.length ? selected : analysis.review.findings.filter(item => item.priority !== '일반 개선');
  if (!findings.length) return setState({ error: '반영할 문제를 선택해 주세요.' });

  // 작성 본문이 없으면 원문을 작업본으로 만들고 원본을 V1으로 보존한다.
  if (!state.sections.length) {
    // 구조 분석이 나눈 문단을 그대로 작업본으로 쓰면 문제별 위치가 맞는다.
    state.sections = structuredClone(analysis.structure.sections);
    state.proposalVersions = appendProposalVersion([], { sections: state.sections, label: '외부 원본', source: EXTERNAL_SOURCE, originalText: state.coaching.text });
    if (!state.project.title) state.project.title = state.coaching.title || '검증 대상 계획서';
  } else if (!(state.proposalVersions || []).length) {
    state.proposalVersions = appendProposalVersion([], { sections: state.sections, label: '수정 전 원본' });
  }

  const revision = buildStructuralRevision(state.sections, findings);
  if (!revision.changedSectionIds.length) return setState({ error: '수정할 위치를 찾지 못했습니다. 대상 항목을 직접 지정해 주세요.' });
  state.sections = revision.sections;
  state.proposalVersions = appendProposalVersion(state.proposalVersions, { sections: state.sections, label: '구조 분석 반영 수정본', source: '계획서 검증·코칭' });
  const version = state.proposalVersions[state.proposalVersions.length - 1].version;
  state.revisionPlan = buildCoachingHandoff({ coaching: { ...state.coaching, result: { issues: findings } }, sections: state.sections, selectedIndexes: null });
  state.activeTool = 'workflow';
  navigateToStep(4, {
    sections: state.sections, proposalVersions: state.proposalVersions, revisionPlan: state.revisionPlan, project: state.project,
    notice: `문제 ${findings.length}건을 반영해 수정본 V${version}을 만들었습니다. 수정한 항목 ${revision.changedSectionIds.length}개 외에는 원문 그대로입니다.${revision.unassigned.length ? ` 위치를 찾지 못한 ${revision.unassigned.length}건은 수정 요청 목록에서 직접 지정하세요.` : ''}`,
    error: ''
  });
  markAiDone('repairV2');
  void archiveCurrentProposal(`revision-v${version}`).catch(() => {});
}

// V2는 수정계획을 통해서만 만든다. 확인이 필요한 문제는 답을 받기 전까지 본문을 바꾸지 않는다.
function applyRepairPlansToProposal() {
  const plans = currentRepairPlans();
  if (!plans.length) return setState({ error: '수정계획으로 만들 검증 문제가 없습니다.' });
  if (!state.sections.length) {
    const source = state.coaching.structure?.structure.sections;
    if (!source?.length) return setState({ error: '먼저 「원문 구조 분석」을 실행해 작업본을 준비해 주세요.' });
    state.sections = structuredClone(source);
    state.proposalVersions = appendProposalVersion([], { sections: state.sections, label: '외부 원본', source: EXTERNAL_SOURCE, originalText: state.coaching.text });
    if (!state.project.title) state.project.title = state.coaching.title || '검증 대상 계획서';
  } else if (!(state.proposalVersions || []).length) {
    state.proposalVersions = appendProposalVersion([], { sections: state.sections, label: '수정 전 원본' });
  }

  const answers = Object.fromEntries(Object.entries(state.coaching.repairAnswers || {}).filter(([, value]) => String(value).trim()));
  const run = applyRepairPlans(state.sections, plans, { confirmations: answers });
  if (!run.applied.length) {
    return setState({ coaching: state.coaching, error: '', notice: `수정한 문단이 없습니다. 확인 필요 ${run.questions.length}건에 답을 입력하면 해당 문제만 수정합니다.${run.blocked.length ? ` 근거 부족으로 보류한 문제 ${run.blocked.length}건이 있습니다.` : ''}` });
  }
  state.sections = run.sections;
  state.proposalVersions = appendProposalVersion(state.proposalVersions, { sections: state.sections, label: '수정계획 반영 수정본', source: '계획서 검증·코칭' });
  const version = state.proposalVersions[state.proposalVersions.length - 1].version;
  state.revisionPlan = buildCoachingHandoff({ coaching: { ...state.coaching, result: { issues: state.coaching.result.issues } }, sections: state.sections, selectedIndexes: null });
  state.activeTool = 'workflow';
  navigateToStep(4, {
    sections: state.sections, proposalVersions: state.proposalVersions, revisionPlan: state.revisionPlan, project: state.project, coaching: state.coaching,
    notice: `수정계획 ${run.applied.length}건을 반영해 V${version}을 만들었습니다. 확인 필요 ${run.questions.length}건 · 근거 부족 보류 ${run.blocked.length}건은 그대로 두었습니다.`,
    error: ''
  });
  void archiveCurrentProposal(`revision-v${version}`).catch(() => {});
}

// 외부에서 가져온 계획서는 원본을 그대로 두고 수정 가능한 작업본만 새로 만든다.
function adoptExternalProposal() {
  if (state.sections.length) return setState({ error: '이미 작성 중인 계획서 본문이 있습니다. 기존 본문을 덮어쓰지 않습니다.' });
  if (state.coaching.text.trim().length < 30) return setState({ error: '작업본으로 전환할 계획서 원문이 부족합니다.' });
  const working = buildExternalWorkingCopy(state.coaching);
  state.sections = working.sections;
  state.proposalVersions = working.versions;
  if (!state.project.title) state.project.title = working.title;
  setState({ sections: state.sections, proposalVersions: state.proposalVersions, project: state.project, notice: `외부 계획서를 ${working.sections.length}개 항목의 작업본으로 전환했습니다. 원본은 V1 「외부 원본」으로 보존됩니다.`, error: '' });
}

// 검증·코칭 → 계획서 쓰기. 문제 목록만 전달하고 본문은 여기서 바꾸지 않는다.
function sendIssuesToWriter() {
  const result = state.coaching.result;
  if (!result?.issues?.length) return setState({ error: '전달할 검증 결과가 없습니다.' });
  if (!state.sections.length) return setState({ error: '수정할 계획서 본문이 없습니다. 작성 흐름에서 계획서를 먼저 준비하세요.' });
  const plan = buildCoachingHandoff({ coaching: state.coaching, sections: state.sections, selectedIndexes: state.coachingSelection });
  if (!plan.items.length) return setState({ error: '전달할 문제를 선택해 주세요.' });
  // 수정 전 원본을 먼저 버전으로 남긴다.
  if (!(state.proposalVersions || []).length) state.proposalVersions = appendProposalVersion([], { sections: state.sections, label: '최초 작성', source: '계획서 쓰기', verdict: plan.verdict.verdict });
  state.activeTool = 'workflow';
  navigateToStep(4, { revisionPlan: plan, proposalVersions: state.proposalVersions, coachingSelection: [], notice: `검증·코칭 문제 ${plan.items.length}건을 계획서 쓰기로 전달했습니다. 전달된 위치만 수정하세요.`, error: '' });
}

function updateRevisionPlanItem(itemId, mutate) {
  if (!state.revisionPlan) return;
  const items = state.revisionPlan.items.map(item => (item.id === itemId ? { ...item, ...mutate(item) } : item));
  state.revisionPlan = { ...state.revisionPlan, items };
}

function updateRevisionTarget(itemId, sectionId) {
  updateRevisionPlanItem(itemId, () => ({ sectionId }));
  setState({ revisionPlan: state.revisionPlan, notice: '수정할 계획서 항목을 지정했습니다.' });
}

function markRevisionDone(itemId) {
  updateRevisionPlanItem(itemId, item => ({ status: item.status === '수정 완료' ? '전달됨' : '수정 완료' }));
  setState({ revisionPlan: state.revisionPlan, notice: '수정 요청 상태를 변경했습니다.' });
}

// 공고 분석이 없는 외부 계획서 작업본에서는 검증에서 실제로 확인된 근거만 재작성 근거로 전달한다. 없는 사실을 만들지 않는다.
function analysisForRewrite(item = null) {
  if (state.analysis) return state.analysis;
  const evidence = item?.evidence || (state.revisionPlan?.items || []).flatMap(value => value.evidence || []);
  return {
    mode: 'external-working-copy',
    project: { type: state.project.type, title: state.project.title || state.coaching.title || '외부 계획서', issuer: '확인 필요', deadline: '확인 필요', budget: '확인 필요' },
    requirements: evidence.slice(0, 20).map((ref, index) => ({ id: `coaching-evidence-${index + 1}`, category: '검증 근거', requirement: ref.proposalLocation || item?.location || '검증 대상 위치', mandatory: false, evidence: ref.excerpt, location: ref.sourceName || '검증 대상 계획서', confidence: '중간' })),
    evaluationCriteria: [], submissionItems: [],
    warnings: ['외부 계획서 작업본이며 공고 분석 결과가 없습니다. 확인되지 않은 사실을 새로 만들지 않습니다.'],
    questions: []
  };
}

// 전달받은 항목 하나만 기존 재작성 엔진으로 고친다. 확정값이 바뀌면 적용하지 않는다.
async function rewriteFromCoaching(itemId) {
  const item = state.revisionPlan?.items.find(value => value.id === itemId);
  const index = state.sections.findIndex(section => section.id === item?.sectionId);
  if (!item || index < 0) return setState({ error: '수정할 계획서 항목을 먼저 지정해 주세요.' });
  const before = state.sections[index].content;
  setAiBusy('전달받은 코칭 내용으로 해당 항목만 수정하는 중...', { error: '', notice: '' }, 'coachingApply');
  try {
    const result = await rewriteWithAI({ section: state.sections[index], instruction: revisionInstruction([item]), analysis: analysisForRewrite(item), organization: organizationForGeneration() });
    const after = result.section?.content || '';
    const locked = verifyLockedValues(before, after, item.lockedValues.length ? item.lockedValues : null);
    if (!locked.ok) return setState({ busy: '', error: `확정값이 변경되어 수정안을 적용하지 않았습니다: ${[...locked.removed, ...locked.added].join(' · ')}` });
    state.sections = applySectionRevision(state.sections, item.sectionId, after, result.section?.status || '검토 필요');
    updateRevisionPlanItem(itemId, () => ({ status: '수정 완료' }));
    setState({ busy: '', sections: state.sections, revisionPlan: state.revisionPlan, notice: `${sectionTitleById(item.sectionId)} 항목을 수정했습니다. 확정값은 그대로 유지했습니다.` });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

// 수정본을 새 버전으로 저장한다. 이전 버전은 지우지 않는다.
function saveRevisionVersion(announce = true) {
  if (!state.sections.length) return null;
  const plan = state.revisionPlan;
  const baseline = (state.proposalVersions || [])[0];
  const check = baseline ? verifyLockedValues(baseline.sections.map(section => section.content).join('\n'), state.sections.map(section => section.content).join('\n'), plan?.lockedValues || null) : { ok: true, removed: [], added: [] };
  const label = plan ? `검증·코칭 v${plan.fromVersion} 반영 수정본` : '수정본';
  state.proposalVersions = appendProposalVersion(state.proposalVersions, { sections: state.sections, label, source: '계획서 쓰기', verdict: plan?.verdict.verdict || '' });
  const version = state.proposalVersions[state.proposalVersions.length - 1].version;
  if (announce) setState({ proposalVersions: state.proposalVersions, notice: `수정본 V${version}을 저장했습니다. 이전 버전은 그대로 보존됩니다.${check.ok ? '' : ` 확인 필요: 확정값 변경 ${[...check.removed, ...check.added].join(' · ')}`}`, error: '' });
  void archiveCurrentProposal(`revision-v${version}`).catch(() => {});
  return version;
}

function restoreProposalVersion(version) {
  const saved = findProposalVersion(state.proposalVersions, version);
  if (!saved) return;
  // 되돌리기 전 현재 본문도 버전으로 남겨 이전 문서를 잃지 않는다.
  const current = JSON.stringify(state.sections);
  if (!(state.proposalVersions || []).some(item => JSON.stringify(item.sections) === current)) {
    state.proposalVersions = appendProposalVersion(state.proposalVersions, { sections: state.sections, label: '되돌리기 전 작업본', source: '계획서 쓰기' });
  }
  state.sections = structuredClone(saved.sections);
  setState({ sections: state.sections, proposalVersions: state.proposalVersions, notice: `V${version} ${saved.label} 내용으로 되돌렸습니다. 저장된 버전은 모두 유지됩니다.`, error: '' });
}

// 계획서 쓰기 → 검증·코칭. 이전 결과와 버전을 유지해 재검증에서 해결·잔존·신규를 비교한다.
function sendRevisionToCoaching() {
  if (!state.sections.length) return setState({ error: '재검증할 계획서 본문이 없습니다.' });
  const version = saveRevisionVersion(false);
  const text = proposalTextFromSections(state.sections);
  state.coaching = { ...state.coaching, text, title: state.coaching.title || state.project.title || '수정본', sourceProposalId: state.archiveProposalId || state.coaching.sourceProposalId, seriesId: state.coaching.seriesId || state.archiveProposalId || '' };
  setState({ activeTool: 'coaching', coaching: state.coaching, proposalVersions: state.proposalVersions, sections: state.sections, notice: `수정본 V${version}을 재검증 대상으로 보냈습니다. 「수정본 다시 검증」을 실행하면 v${state.coaching.version} 결과와 비교합니다.`, error: '' });
}

async function persistCoachingWorkboard() {
  const id = state.coaching.currentArchiveId;
  if (!id) return;
  try {
    await saveArchivedProposal({ id, noticeKey: state.coaching.sourceNoticeKey, title: `${state.coaching.title || '외부 계획서'} · 코칭 v${state.coaching.version}`, stage: `coaching-v${state.coaching.version}`, snapshot: { coaching: structuredClone(state.coaching), parentProposalId: state.coaching.sourceProposalId || '', coachingSeriesId: state.coaching.seriesId } });
  } catch (error) { setState({ error: `개선 작업판을 자료보관함에 저장하지 못했습니다: ${error.message}` }); }
}

function printCoachingReport() {
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) return setState({ error: '코칭 보고서 인쇄 창을 열지 못했습니다. 팝업 허용 후 다시 시도하세요.' });
  const result = state.coaching.result;
  const submission = coachingSubmissionDecision(result, state.coaching.workItems);
  const grouped = priority => result.issues.filter(issue => issue.priority === priority);
  const confirmed = state.coaching.workItems.map((item, index) => ({ item, issue: result.issues[index] })).filter(value => value.item.status === '확인필요' || value.item.revision?.requiresConfirmation).map(value => `${value.issue?.location}: ${value.item.revision?.explanation || value.issue?.reason}`);
  const changes = state.coaching.workItems.map((item, index) => ({ item, issue: result.issues[index] })).filter(value => value.item.applied).map(value => `${value.issue?.location}: 수정안 적용`);
  const remaining = state.coaching.workItems.map((item, index) => ({ item, issue: result.issues[index] })).filter(value => value.item.status !== '해결').map(value => `${value.issue?.location}: ${value.item.status}`);
  const issueHtml = values => values.map(item => `<li><strong>${escapeHtml(item.location)}</strong> — ${escapeHtml(item.reason)}<br>${escapeHtml(item.direction)}</li>`).join('') || '<li>없음</li>';
  const listHtml = values => values.map(value => `<li>${escapeHtml(value)}</li>`).join('') || '<li>없음</li>';
  const matrixHtml = result.evaluationMatrix.map(item => `<tr><td>${escapeHtml(item.criterion)}</td><td>${escapeHtml(item.officialPoints)}</td><td>${escapeHtml(item.requirement)}</td><td>${escapeHtml(item.proposalLocations.join(' · '))}</td><td>${escapeHtml(item.status)}</td></tr>`).join('');
  const finalCheckHtml = (result.finalChecks || []).map(item => `<tr><td>${escapeHtml(item.area)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.note)}</td></tr>`).join('');
  reportWindow.document.write(`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>${escapeHtml(state.coaching.title)} 코칭 보고서</title><style>@page{size:A4 portrait;margin:16mm}body{font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:#33261d;line-height:1.6}h1{font-size:24px}h2{font-size:18px;border-bottom:1px solid #ddd0bd;padding-bottom:6px}section{break-inside:avoid-page;margin:18px 0}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ddd0bd;padding:6px;vertical-align:top}li{margin:5px 0}</style></head><body><h1>계획서 검증·코칭 보고서</h1><p><b>계획서명</b> ${escapeHtml(state.coaching.title)}<br><b>검증 버전</b> v${state.coaching.version}<br><b>검증 기준</b> ${result.basis === 'official-evaluation' ? '공식 평가기준 우선' : '공통 검증 기준'}<br><b>제출 전 판단</b> ${escapeHtml(submission)}</p><section><h2>제출 전 점검</h2><table><thead><tr><th>점검 항목</th><th>상태</th><th>판단</th></tr></thead><tbody>${finalCheckHtml}</tbody></table></section><section><h2>적용한 공식 평가기준·대응표</h2><table><thead><tr><th>평가항목</th><th>배점</th><th>요구내용</th><th>대응 위치</th><th>상태</th></tr></thead><tbody>${matrixHtml}</tbody></table></section><section><h2>최우선 위험</h2><ul>${issueHtml(grouped('최우선 경고'))}</ul></section><section><h2>주요 개선사항</h2><ul>${issueHtml(grouped('주요 개선'))}</ul></section><section><h2>일반 개선사항</h2><ul>${issueHtml(grouped('일반 개선'))}</ul></section><section><h2>[확인 필요] 목록</h2><ul>${listHtml(confirmed)}</ul></section><section><h2>수정 전후 개선내역</h2><ul>${listHtml([...(result.comparison?.improvedAreas || []), ...changes])}</ul></section><section><h2>남아 있는 문제</h2><ul>${listHtml(remaining)}</ul></section><section><h2>다음 수정 우선순위</h2><ol>${listHtml(remaining.slice(0, 5))}</ol></section><script>document.fonts?.ready.then(()=>window.print());<\/script></body></html>`);
  reportWindow.document.close();
}

async function runProposalReview(force = false) {
  if (state.reviewBusy || state.sections.length !== 10) return;
  const payload = reviewPayload();
  const fingerprint = await sha256Text(JSON.stringify(payload));
  if (!force && state.reviewResult && state.reviewFingerprint === fingerprint) return setState({ notice: '같은 초안의 기존 심사 결과를 표시합니다.' });
  state.reviewOriginalDraft = structuredClone(state.sections);
  state.reviewBusy = true;
  setAiBusy('사업계획서를 심사자 관점에서 검토하는 중...', { error: '', notice: '' }, 'review');
  try {
    const response = await fetch('/api/proposal-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `심사 요청 실패 (${response.status})`);
    if (!validReviewClientResult(result)) throw new Error('심사 결과 필수 항목이 올바르지 않습니다.');
    state.reviewResult = result;
    state.reviewFingerprint = fingerprint;
    setState({ busy: '', reviewBusy: false, notice: '심사 결과를 확인하고 필요한 보완안만 적용하세요.' });
    void archiveCurrentProposal('review').catch(() => {});
  } catch (error) {
    setState({ busy: '', reviewBusy: false, error: error.message });
  }
}

function reviewPayload() {
  const applicantOrganization = organizationForGeneration();
  return {
    selectedNotice: state.selectedNotice, selectedSubprogram: state.selectedNotice?.selectedSubproject || state.project.title,
    officialDetailText: state.sourceText, manualSources: state.manualSources, applicationQuestions: state.analysis?.questions || [],
    evaluationCriteria: state.analysis?.evaluationCriteria || [], budgetCriteria: state.manualSources.filter(item => item.sourceType === '예산 편성 기준'),
    sponsorIntent: state.sponsorIntent, projectDesign: state.projectDesign, masterDesign: state.stagedGeneration?.master, assemblyCheck: state.assemblyCheck, evidenceMap: state.evidenceMap,
    applicantOrganization, confirmedOrganizationFacts: applicantOrganization.confirmedFacts, sections: state.sections
  };
}

function validReviewClientResult(result) {
  return result && result.structureReview && Array.isArray(result.structureReview.affectedSectionKeys) && Array.isArray(result.criteria) && result.criteria.length === 8 && Array.isArray(result.revisedSections) && result.revisedSections.every(item => result.structureReview.affectedSectionKeys.includes(item.sectionKey)) && Array.isArray(result.missingQuestions) && result.missingQuestions.length <= 5;
}

function applyReviewSection(index) {
  const revision = state.reviewResult?.revisedSections?.[index];
  if (!revision) return;
  const sectionIndex = state.sections.findIndex(section => section.id === revision.sectionKey || section.title === revision.title);
  if (sectionIndex < 0) return setState({ error: '보완안을 적용할 계획서 항목을 찾지 못했습니다.' });
  state.sections[sectionIndex] = { ...state.sections[sectionIndex], content: revision.afterText, status: revision.requiresConfirmation ? '확인 필요' : '검토 필요' };
  setState({ sections: [...state.sections], notice: `${revision.title} 보완안을 적용했습니다.` });
}

function applyAllReviewSections() {
  (state.reviewResult?.revisedSections || []).forEach((_, index) => {
    const revision = state.reviewResult.revisedSections[index];
    const sectionIndex = state.sections.findIndex(section => section.id === revision.sectionKey || section.title === revision.title);
    if (sectionIndex >= 0) state.sections[sectionIndex] = { ...state.sections[sectionIndex], content: revision.afterText, status: revision.requiresConfirmation ? '확인 필요' : '검토 필요' };
  });
  setState({ sections: [...state.sections], notice: '보완안이 있는 항목만 적용했습니다.' });
}

function restoreReviewDraft() {
  if (!Array.isArray(state.reviewOriginalDraft) || state.reviewOriginalDraft.length !== 10) return setState({ error: '복원할 검토 전 초안이 없습니다.' });
  setState({ sections: structuredClone(state.reviewOriginalDraft), notice: '검토 실행 전 초안으로 복원했습니다.' });
}

async function sha256Text(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function addManualFiles(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  setState({ busy: `직접 자료 ${files.length}개를 읽는 중...`, error: '', notice: '' });
  const additions = [];
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    // HWPX는 직접 읽고, 바이너리 HWP만 변환 안내로 남긴다.
    if (extension === 'hwp') {
      additions.push(manualSourceRecord(file.name, state.manualSourceType, '', 'unsupported', '한/글에서 HWPX·PDF·DOCX로 저장한 뒤 다시 업로드해 주세요.'));
      continue;
    }
    try {
      const parsed = await extractFile(file);
      additions.push(manualSourceRecord(file.name, state.manualSourceType, parsed.text, 'success', ''));
    } catch (error) {
      additions.push(manualSourceRecord(file.name, state.manualSourceType, '', 'failed', error.message));
    }
  }
  setState({ busy: '', manualSources: [...state.manualSources, ...additions], notice: `직접 자료 ${additions.length}개를 추가했습니다.` });
}

function addManualText() {
  const text = state.manualSourceText.trim();
  if (text.length < 10) return setState({ error: '붙여넣을 자료 원문을 10자 이상 입력해 주세요.' });
  const name = state.manualSourceName.trim() || `붙여넣기 자료 ${state.manualSources.length + 1}`;
  const item = manualSourceRecord(name, state.manualSourceType, text, 'success', '');
  state.manualSourceName = ''; state.manualSourceText = '';
  setState({ manualSources: [...state.manualSources, item], manualSourceName: '', manualSourceText: '', notice: '붙여넣기 자료를 추가했습니다.' });
}

function manualSourceRecord(fileName, sourceType, extractedText, extractionStatus, extractionError) {
  return { id: globalThis.crypto?.randomUUID?.() || `source-${Date.now()}-${Math.random().toString(16).slice(2)}`, fileName, sourceType, extractedText, extractionStatus, extractionError };
}

async function loadOfficialNotices() {
  state.project.type = 'chest';
  setAiBusy('공고를 불러오는 중', { error: '', notice: '' }, 'noticeList');
  try {
    const result = await fetchNoticeList();
    const notices = result.notices || [];
    let archiveMessage = '';
    try { const archived = await syncArchivedNotices(notices); archiveMessage = ` 보관함 신규 ${archived.inserted}건·변경 ${archived.updated}건·동일 ${archived.unchanged}건입니다.`; }
    catch { archiveMessage = ' 공고 목록은 표시하지만 자료보관함 저장에는 실패했습니다.'; }
    const elapsed = elapsedLabel();
    navigateToStep(1, { busy: '', noticeResults: notices, selectedNoticeIndexes: [], pendingNoticeChoice: null, notice: `공고 ${notices.length}건을 불러왔습니다${elapsed}.${archiveMessage}` });
  } catch (error) { setState({ busy: '', error: `${error.message}${elapsedLabel()}` }); }
}

async function searchNoticeArchive() {
  setAiBusy('자료보관함에서 과거 공고를 검색하는 중', { error: '', notice: '' }, 'archiveSearch');
  try {
    const result = await searchArchivedNotices(state.archiveFilters);
    setState({ busy: '', archiveNotices: result.notices || [], notice: `자료보관함(D1)에 보관된 공고 ${result.notices?.length || 0}건을 찾았습니다${elapsedLabel()}.` });
  } catch (error) { setState({ busy: '', error: `${error.message}${elapsedLabel()}` }); }
}

async function loadHomeRecent() {
  homeArchiveLoaded = true;
  // 홈 최근 작업은 실제 보관 데이터만 보여 준다. 실패해도 화면을 막지 않는다.
  try { const result = await listArchivedProposals(); setState({ archiveProposals: result.proposals || [] }); }
  catch { /* 보관함 조회 실패는 홈 표시만 비운다. */ }
}

async function loadRecentArchive() {
  archiveLoaded = true;
  // 목록의 상태 열은 저장된 계획서 단계를 근거로 하므로 계획서 목록도 함께 가져온다.
  try { const result = await searchArchivedNotices({}); setState({ archiveNotices: result.notices || [] }); }
  catch { /* 자료보관함 장애가 기존 첫 화면을 막지 않게 한다. */ }
  try { const saved = await listArchivedProposals(); setState({ archiveProposals: saved.proposals || [] }); }
  catch { /* 계획서 목록 조회 실패는 상태 표시만 비운다. */ }
}

function archiveIndexOfKey(key) {
  return (state.archiveNotices || []).findIndex(item => item.archiveNoticeKey === key);
}
// 보관 목록 행 우클릭 메뉴. 화면 상태를 다시 그리지 않고 메뉴 요소만 띄웠다 지운다.
function closeArchiveMenu() {
  document.querySelector('#archive-context-menu')?.remove();
}
function openArchiveMenu(key, x, y) {
  closeArchiveMenu();
  const row = archiveTableData().rows.find(item => item.key === key);
  if (!row) return;
  const progress = archiveProgressStep(row);
  const menu = document.createElement('div');
  menu.id = 'archive-context-menu';
  menu.className = 'archive-menu';
  menu.innerHTML = `<p class="archive-menu-title">${escapeHtml(row.title.slice(0, 40))}</p>
    <a class="archive-menu-item" href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noopener noreferrer">원문 바로가기 ↗</a>
    <hr>
    ${ARCHIVE_WORK_STEPS.map((item, index) => {
      const done = progress >= 0 && item.step < progress;
      const current = progress >= 0 && item.step === progress;
      return `<button class="archive-menu-item ${current ? 'current' : ''}" data-archive-step="${index}">${escapeHtml(item.label)}<span>${current ? '현재 단계' : done ? '✓' : ''}</span></button>`;
    }).join('')}`;
  document.body.append(menu);
  archiveMenuOpenedAt = Date.now();
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - box.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - box.height - 8))}px`;
  menu.querySelectorAll('[data-archive-step]').forEach(el => el.onclick = () => {
    const target = ARCHIVE_WORK_STEPS[Number(el.dataset.archiveStep)];
    closeArchiveMenu();
    // 연결된 신청기관이 한 곳이면 그 기관을 선택한 채로 이동하고, 여러 곳이면 현재 선택을 그대로 둔다.
    startArchiveWork(key, target.step, row.applicantIds.length === 1 ? row.applicantIds[0] : '');
  });
  menu.querySelector('a')?.addEventListener('click', closeArchiveMenu);
}
// 「작업하기」는 기존 단계 이동을 그대로 쓴다. 기관을 지정하면 그 기관을 선택한 상태로 이동한다.
function startArchiveWork(key, step, applicantId = '') {
  // [샘플] 공고는 실제 작업 상태를 바꾸지 않고 그 단계의 샘플 결과만 연다.
  if (key === SAMPLE_NOTICE_KEY) return openSample(SAMPLE_STAGE_BY_STEP[step] || 'notice', 'workflow');
  const index = archiveIndexOfKey(key);
  const notice = state.archiveNotices[index];
  if (!notice) return setState({ error: '보관된 공고를 찾지 못했습니다. 보관함을 다시 불러와 주세요.' });
  const existing = state.noticeResults.findIndex(item => archiveNoticeKey(item) === archiveNoticeKey(notice));
  const noticeResults = existing >= 0 ? state.noticeResults : [...state.noticeResults, notice];
  const patch = { noticeResults, activeTool: 'workflow', notice: `보관 공고를 「${STEPS[step] || STEPS[0]}」 단계에서 이어서 작업합니다.` };
  if (applicantId && (state.applicants || []).some(item => item.id === applicantId)) patch.selectedApplicantId = applicantId;
  navigateToStep(step, patch);
}
// 보관 공고 원본과 연결된 계획서는 지우지 않고 이 기기 목록에서만 숨긴다.
function hideArchivedNotices(keys) {
  const targets = [...new Set((keys || []).filter(Boolean))];
  if (!targets.length) return;
  if (!window.confirm(`선택한 공고 ${targets.length}건을 목록에서 삭제할까요? 보관 원본과 연결된 계획서는 지워지지 않습니다.`)) return;
  const hidden = [...new Set([...(state.archiveHiddenNotices || []), ...targets])];
  const table = archiveTableState();
  setState({ archiveHiddenNotices: hidden, archiveTable: { ...table, selected: [], expandedKey: '', applicantPickerKey: '', page: 1 }, notice: `공고 ${targets.length}건을 목록에서 삭제했습니다.`, error: '' });
}

async function copyArchiveRecoveryKey() {
  try {
    await navigator.clipboard.writeText(getArchiveRecoveryKey());
    setState({ notice: '자료보관함 복구키를 복사했습니다. 안전한 비밀번호 관리도구에 보관하세요.', error: '' });
  } catch { setState({ error: '복구키를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.' }); }
}

async function applyArchiveRecoveryKey() {
  const value = state.archiveKeyDraft.trim();
  if (!value) return setState({ error: '기존 보관함 복구키를 입력해 주세요.' });
  if (!window.confirm('이 기기의 자료보관함 연결을 입력한 복구키로 변경할까요? 현재 D1 자료는 삭제되지 않습니다.')) return;
  try {
    useArchiveRecoveryKey(value);
    archiveLoaded = true;
    state.archiveProposalId = '';
    state.archiveKeyDraft = '';
    setState({ busy: '기존 자료보관함을 연결하는 중...', archiveNotices: [], archiveProposals: [], error: '', notice: '' });
    const [noticeResult, proposalResult] = await Promise.all([searchArchivedNotices({}), listArchivedProposals()]);
    setState({ busy: '', archiveNotices: noticeResult.notices || [], archiveProposals: proposalResult.proposals || [], notice: '기존 자료보관함을 이 기기에 연결했습니다.' });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

async function findMatchingNotices() {
  state.project.type = 'chest';
  setAiBusy('공식 공고를 갱신하고 맞춤 조건을 확인하는 중', { error: '', notice: '' }, 'archiveMatch');
  try {
    const result = await fetchNoticeList();
    const archived = await syncArchivedNotices(result.notices || []);
    const found = await searchArchivedNotices(state.archiveFilters);
    setState({ busy: '', archiveNotices: found.notices || [], notice: `맞춤 공고 ${found.notices?.length || 0}건 · 신규 ${archived.inserted}건 · 변경 ${archived.updated}건입니다${elapsedLabel()}.` });
  } catch (error) { setState({ busy: '', error: `${error.message}${elapsedLabel()}` }); }
}

function useArchivedNotice(index) {
  const notice = state.archiveNotices[index];
  if (!notice) return;
  const existing = state.noticeResults.findIndex(item => archiveNoticeKey(item) === archiveNoticeKey(notice));
  const noticeResults = existing >= 0 ? state.noticeResults : [...state.noticeResults, notice];
  navigateToStep(1, { noticeResults, notice: '자료보관함(D1)에 보관된 공고를 이번 작업 임시 목록에 열었습니다. 보관함 원본은 그대로 남습니다.' });
}

async function viewArchivedNotice(index) {
  const notice = state.archiveNotices[index];
  if (!notice) return;
  let noticeIndex = state.noticeResults.findIndex(item => archiveNoticeKey(item) === archiveNoticeKey(notice));
  if (noticeIndex < 0) { state.noticeResults = [...state.noticeResults, notice]; noticeIndex = state.noticeResults.length - 1; }
  navigateToStep(1, { noticeResults: state.noticeResults, notice: '보관된 공고의 상세 내용을 확인합니다.' });
  await previewOfficialNotice(noticeIndex);
}

async function loadProposalArchive() {
  setAiBusy('저장된 계획서를 불러오는 중', { error: '', notice: '' }, 'archiveProposals');
  try { const result = await listArchivedProposals(); setState({ busy: '', archiveProposals: result.proposals || [], notice: `저장된 계획서 ${result.proposals?.length || 0}건을 불러왔습니다.` }); }
  catch (error) { setState({ busy: '', error: error.message }); }
}

async function openArchivedProposal(id) {
  setState({ busy: '저장된 계획서를 여는 중...', error: '', notice: '' });
  try {
    const result = await getArchivedProposal(id);
    if (!result.proposal?.snapshot) throw new Error('저장된 계획서를 찾지 못했습니다.');
    const snapshot = result.proposal.snapshot;
    if (result.proposal.stage?.startsWith('coaching-v') && snapshot.coaching) {
      state.coaching = { ...initial.coaching, ...snapshot.coaching, currentArchiveId: result.proposal.id };
      if (state.coaching.result && state.coaching.workItems?.length !== state.coaching.result.issues?.length) state.coaching.workItems = makeCoachingWorkItems(state.coaching.result);
      return setState({ activeTool: 'coaching', busy: '', notice: '보관된 검증·코칭 버전을 열었습니다.' });
    }
    const applicants = snapshot.applicantSnapshot && !findApplicant(state.applicants, snapshot.applicantSnapshot.id) ? upsertApplicant(state.applicants, snapshot.applicantSnapshot) : state.applicants;
    state = { ...state, ...snapshot, applicants, archiveProposalId: result.proposal.id, archiveNotices: state.archiveNotices, archiveProposals: state.archiveProposals, noticeResults: state.noticeResults, busy: '', error: '' };
    navigateToStep(result.proposal.stage === 'review' ? 5 : 4, { notice: '보관된 계획서를 열었습니다. 이어서 수정할 수 있습니다.' });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

function archiveNoticeKey(notice) { return `${notice?.source || notice?.references?.[0]?.source || ''}:${notice?.dstbBsnsCode || notice?.listSn || notice?.references?.[0]?.listSn || ''}`; }

function removeOfficialNotice(value) {
  const index = Number(value);
  if (!Number.isInteger(index) || !state.noticeResults[index]) return;
  const [removed] = state.noticeResults.splice(index, 1);
  setState({ noticeResults: [...state.noticeResults], noticeTrash: [...state.noticeTrash, { ...removed, trashedAt: new Date().toISOString() }].slice(-50), selectedNoticeIndexes: [], notice: '공고를 쓰레기통으로 이동했습니다.' });
}

function toggleNoticeSelection(value, checked) {
  const index = Number(value);
  if (!Number.isInteger(index) || !state.noticeResults[index]) return;
  const selected = new Set(state.selectedNoticeIndexes);
  checked ? selected.add(index) : selected.delete(index);
  setState({ selectedNoticeIndexes: [...selected].sort((a, b) => a - b) });
}

function removeSelectedNotices() {
  const selected = new Set(state.selectedNoticeIndexes);
  if (!selected.size) return;
  const removed = state.noticeResults.filter((_, index) => selected.has(index)).map(item => ({ ...item, trashedAt: new Date().toISOString() }));
  const noticeResults = state.noticeResults.filter((_, index) => !selected.has(index));
  setState({ noticeResults, noticeTrash: [...state.noticeTrash, ...removed].slice(-50), selectedNoticeIndexes: [], notice: `선택한 공고 ${selected.size}건을 쓰레기통으로 이동했습니다.` });
}

function restoreNotice(value) {
  const index = Number(value);
  if (!Number.isInteger(index) || !state.noticeTrash[index]) return;
  const [restored] = state.noticeTrash.splice(index, 1);
  const { trashedAt, ...notice } = restored;
  setState({ noticeTrash: [...state.noticeTrash], noticeResults: [...state.noticeResults, notice], notice: '공고를 목록으로 복원했습니다.' });
}

function deleteNoticeForever(value) {
  const index = Number(value);
  if (!Number.isInteger(index) || !state.noticeTrash[index]) return;
  state.noticeTrash.splice(index, 1);
  setState({ noticeTrash: [...state.noticeTrash], notice: '공고를 영구 삭제했습니다.' });
}

async function previewOfficialNotice(value) {
  const selected = state.noticeResults[Number(value)];
  if (!selected) return setState({ error: '확인할 공고를 찾지 못했습니다.' });
  setAiBusy('공고 상세 내용을 불러오는 중', { error: '', notice: '' }, 'noticeDetail');
  try {
    const { notice } = await fetchNoticeDetail(selected);
    void syncArchivedNotices([{ ...selected, ...notice }]).catch(() => {});
    setState({ busy: '', noticePreview: notice, pendingNoticeChoice: null });
    requestAnimationFrame(() => document.querySelector('#notice-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  } catch (error) { setState({ busy: '', error: error.message }); }
}

function choosePreviewNotice() {
  const notice = state.noticePreview;
  if (!notice) return;
  if (notice.subprojects?.length > 1) return navigateToStep(2, { noticePreview: null, pendingNoticeChoice: { notice, subprojects: notice.subprojects }, notice: '신청기관을 선택한 뒤 사업 선택 단계에서 세부사업을 확정해 주세요.' });
  state.noticePreview = null;
  applyNoticeSelection(notice);
  navigateToStep(2);
}

async function selectOfficialNotice(value) {
  const selected = state.noticeResults[Number(value)];
  if (!selected) return setState({ error: '선택한 공고를 찾지 못했습니다.' });
  setAiBusy('선택한 공고 본문을 불러오는 중', { pendingNoticeChoice: null, error: '', notice: '' }, 'noticeSelect');
  try {
    const { notice } = await fetchNoticeDetail(selected);
    void syncArchivedNotices([{ ...selected, ...notice }]).catch(() => {});
    if (notice.subprojects?.length > 1) return navigateToStep(2, { busy: '', pendingNoticeChoice: { notice, subprojects: notice.subprojects }, notice: '신청기관을 선택한 뒤 사업 선택 단계에서 세부사업을 확정해 주세요.' });
    applyNoticeSelection(notice);
    navigateToStep(2);
  } catch (error) { setState({ busy: '', error: error.message }); }
}

function selectNoticeSubproject(value) {
  const pending = state.pendingNoticeChoice;
  const subproject = pending?.subprojects[Number(value)];
  if (!pending || !subproject) return setState({ error: '선택한 세부사업을 찾지 못했습니다.' });
  applyNoticeSelection(pending.notice, subproject);
}

function applyNoticeSelection(notice, subproject = null) {
  const primary = notice.parts[0];
  const title = subproject?.title || notice.title;
  const bodyText = subproject
    ? `[${primary.sourceLabel} 우선 조건 · dstbBsnsCode ${primary.listSn}]\n사업명: ${title}\n사업수행기간: ${primary.performancePeriod}\n공모기간: ${primary.applicationPeriod}\n지원한도: ${primary.supportLimit}\n개요:\n${subproject.content}`
    : notice.parts.map((part, index) => `[${index === 0 ? `${part.sourceLabel} 우선 조건` : `${part.sourceLabel} 보충 자료`} · dstbBsnsCode ${part.listSn}]\n${noticeBodyText(part.bodyHtml)}`).join('\n\n');
  state.project = { ...state.project, type: 'chest', title, issuer: notice.sourceLabels.includes('광주지회') ? '광주사회복지공동모금회' : '사회복지공동모금회' };
  state.archiveProposalId = '';
  state.sourceText = `${title}\n\n${bodyText}`;
  state.selectedNotice = { title, selectedSubproject: subproject?.title || '', registeredAt: notice.registeredAt, references: notice.references, sourceLabels: notice.sourceLabels, attachments: notice.attachments, applicationPeriod: primary.applicationPeriod, performancePeriod: primary.performancePeriod, supportLimit: primary.supportLimit, detailText: bodyText, officialTextExtracted: false, extractedAttachmentKeys: [] };
  setState({ busy: '', pendingNoticeChoice: null, notice: '선택한 공고 본문을 사업계획서 입력으로 가져왔습니다.' });
  requestAnimationFrame(() => document.querySelector('#selected-notice-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function handleOfficialAttachment(value, extract) {
  const attachment = state.selectedNotice?.attachments?.[Number(value)];
  if (!attachment) return setState({ error: '선택한 첨부파일을 찾지 못했습니다.' });
  const type = attachmentType(attachment.name, attachment.fileType);
  if (extract && !['PDF', 'DOCX', 'TXT'].includes(type)) return setState({ error: `${type} 파일은 내용을 추출할 수 없습니다. 원본을 내려받아 확인해 주세요.` });
  setState({ busy: extract ? '공식 공고문 내용을 추출하는 중...' : '공식 첨부파일을 내려받는 중...', error: '', notice: '' });
  try {
    const response = await fetch('/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'downloadAttachment', attachment }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || '첨부파일 다운로드 실패'); }
    const blob = await response.blob();
    if (!extract) { downloadOriginal(blob, attachment.name); return setState({ busy: '', notice: `${attachment.name} 원본을 내려받았습니다.` }); }
    const key = `${attachment.dstbBsnsCode}:${attachment.fileSeCode}:${attachment.sn}:${attachment.fileSn}`;
    if (state.selectedNotice.extractedAttachmentKeys.includes(key)) return setState({ busy: '', notice: '이미 반영한 공식 첨부파일입니다.' });
    const parsed = await extractFile(new File([blob], attachment.name, { type: blob.type }));
    const relevantText = relevantAttachmentText(parsed.text, state.selectedNotice.selectedSubproject);
    state.sourceText = `${state.sourceText}\n\n[공식 첨부: ${attachment.name}]\n${relevantText}`;
    state.selectedNotice = { ...state.selectedNotice, officialTextExtracted: true, extractedAttachmentKeys: [...state.selectedNotice.extractedAttachmentKeys, key] };
    setState({ busy: '', sourceText: state.sourceText, selectedNotice: state.selectedNotice, notice: '공식 공고문 텍스트를 생성 입력에 반영했습니다.' });
  } catch (error) { setState({ busy: '', error: `${extract ? '공고문 추출 실패' : '첨부파일 다운로드 실패'}: ${error.message}` }); }
}

function relevantAttachmentText(text, selectedSubproject) {
  const cleaned = String(text || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!selectedSubproject) return cleaned;
  const start = cleaned.indexOf(selectedSubproject);
  if (start < 0) throw new Error('선택한 세부사업 구간을 첨부 공고문에서 찾지 못했습니다.');
  const tail = cleaned.slice(start);
  const next = tail.slice(selectedSubproject.length).search(/\n\s*\d{1,2}[.)]\s*[^\n]{2,100}사업(?:\s*공고)?\s*(?:\n|$)/);
  return next < 0 ? tail : tail.slice(0, selectedSubproject.length + next).trim();
}

function downloadOriginal(blob, name) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function addMissingNotice() {
  const url = state.noticeUrlDraft.trim();
  if (!url) return setState({ error: '공식 상세 URL을 입력해 주세요.' });
  setAiBusy('누락 공고를 확인하는 중', { error: '', notice: '' }, 'noticeImport');
  try {
    const result = await importNoticeUrl(url, state.noticeResults);
    if (result.duplicate) {
      const item = state.noticeResults[result.existingIndex];
      if (item && result.reference && !item.references.some(reference => reference.source === result.reference.source && reference.listSn === result.reference.listSn)) {
        item.references.push(result.reference);
        item.sourceLabels = [...new Set([...item.sourceLabels, result.sourceLabel])];
        item.sourceLabel = item.sourceLabels.join('·');
        item.listSn = item.references.map(reference => reference.listSn).join(' · ');
      }
      state.noticeUrlDraft = '';
      return setState({ busy: '', noticeResults: [...state.noticeResults], notice: '이미 목록에 있는 동일 공고입니다.' });
    }
    state.noticeUrlDraft = '';
    setState({ busy: '', noticeResults: [...state.noticeResults, result.notice], notice: '누락 공고를 목록에 추가했습니다.' });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

async function analyze() {
  if (state.sourceText.trim().length < 30) return setState({ error: '분석할 원문을 30자 이상 입력해 주세요.' });
  setAiBusy('기관 요구사항과 평가 기준을 분석하는 중...', { error: '', notice: '' }, 'analyze');
  if (state.sourceText.length > 180000) return setState({ error: 'AI 분석 원문은 180,000자 이하여야 합니다. 파일을 나누거나 불필요한 내용을 줄여 주세요.' });
  const payload = { sourceText: state.sourceText, projectType: typeName(), project: state.project, organization: organizationForGeneration() };
  try { const result = await analyzeWithAI(payload); state.analysis = result.analysis; state.aiMode = 'ai'; }
  catch (error) { state.analysis = localAnalyze({ sourceText: state.sourceText, projectType: typeName(), title: state.project.title }); state.aiMode = 'local'; state.notice = `서버 AI를 사용할 수 없어 로컬 분석으로 계속합니다: ${error.message}`; }
  state.analysis.project = { ...state.project, ...state.analysis.project }; state.project = { ...state.project, ...state.analysis.project }; state.answers = state.analysis.questions || []; state.matches = buildMatches(); navigateToStep(2, { busy: '' });
}

async function createDraft() {
  await generateCompleteProposal();
}

async function rewriteSection(index) {
  const instruction = window.prompt('어떻게 수정할까요? 사실이나 수치를 새로 만들도록 요청할 수 없습니다.', '더 명확하고 간결하게 작성');
  if (!instruction) return;
  setAiBusy('선택한 항목을 근거 범위 안에서 재작성하는 중...', { error: '' }, 'rewrite');
  try { const result = await rewriteWithAI({ section: state.sections[index], instruction, analysis: analysisForRewrite(), organization: organizationForGeneration() }); state.sections[index] = result.section; setState({ busy: '', notice: '항목을 재작성했습니다.' }); }
  catch (error) { setState({ busy: '', error: error.message }); }
}
function showError(error) { setState({ error: error.message }); }

async function generateCompleteProposal() {
  const manualLength = state.manualSources.filter(value => value.extractionStatus === 'success').reduce((sum, value) => sum + value.extractedText.length, 0);
  if (state.sourceText.trim().length + manualLength < 30) return setState({ error: '사업계획서를 작성할 공식 또는 직접 자료를 30자 이상 입력해 주세요.' });
  if (state.sourceText.length > 180000 || state.sourceText.length + manualLength > 220000) return setState({ error: '생성 입력 자료가 허용 길이를 초과했습니다. 자료를 나누거나 불필요한 내용을 줄여 주세요.' });
  setAiBusy('공고문을 분석하고 마스터 설계를 작성하는 중...', { error: '', notice: '', sections: [], assemblyCheck: null, stagedGeneration: structuredClone(initial.stagedGeneration) }, 'master');
  const completePayload = generationPayload();
  try {
    const result = await masterWithAI(completePayload);
    state.sponsorIntent = result.sponsorIntent;
    state.projectDesign = result.projectDesign;
    state.missingInformation = applyApplicantAnswers((result.missingInformation || []).slice(0, 5));
    state.evidenceMap = result.evidenceMap || [];
    state.qualityCheck = result.qualityCheck;
    state.analysis = engineAnalysis(result);
    state.sections = [];
    state.stagedGeneration = { phase: 'master-ready', master: result, parts: [], completedGroupIds: [], continuitySummary: null };
    state.aiMode = 'ai';
    state.designUnavailable = false;
    state.project = { ...state.project, title: result.projectDesign.projectName || state.project.title };
    void archiveCurrentProposal('master').catch(() => {});
  } catch (error) {
    const localSource = [state.sourceText, ...state.manualSources.filter(value => value.extractionStatus === 'success').map(value => `[${value.sourceType}: ${value.fileName}]\n${value.extractedText}`)].filter(Boolean).join('\n\n');
    state.analysis = localAnalyze({ sourceText: localSource, projectType: typeName(), title: state.project.title });
    state.sponsorIntent = localSponsorIntent(state.analysis);
    state.projectDesign = null;
    state.missingInformation = applyApplicantAnswers((state.analysis.questions || []).slice(0, 5).map(value => value.question));
    state.evidenceMap = state.analysis.requirements.map(value => ({ id: value.id, claim: value.requirement, evidence: value.evidence, location: value.location }));
    state.qualityCheck = null;
    state.sections = [];
    state.stagedGeneration = structuredClone(initial.stagedGeneration);
    state.aiMode = 'local';
    state.designUnavailable = true;
    state.notice = `공고 자료 분석은 완료되었지만 AI 정밀 사업설계를 실행하지 못했습니다. ${error.message}`;
  }
  state.answers = state.analysis.questions || [];
  state.matches = buildMatches();
  navigateToStep(4, { busy: '' });
}

function generationPayload() {
  return { sourceText: state.sourceText, manualSources: state.manualSources.map(({ id, fileName, sourceType, extractedText, extractionStatus, extractionError }) => ({ id, fileName, sourceType, extractedText, extractionStatus, extractionError })), projectType: typeName(), project: state.project, selectedSubprogram: state.selectedNotice?.selectedSubproject || state.selectedNotice?.title || state.project.title, organization: organizationForGeneration(), userAnswers: state.designAnswers, projectBlueprint: blueprintHandoff() };
}

// 분할 생성은 master가 확정한 기준만 다시 쓴다. 공고 원문·직접자료를 매 분할마다 다시 보내지 않는다.
function partPayload() {
  const { sourceText, manualSources, ...rest } = generationPayload();
  return rest;
}

// 설계도를 초안 작성으로 넘긴다. 확정값은 그대로, 설계안은 설계안으로, 미확정은 [확인 필요]로만 넘긴다.
function blueprintHandoff() {
  const blueprint = currentBlueprint();
  if (!blueprint) return null;
  return {
    applicationType: blueprint.applicationTypes.selected || '[확인 필요]',
    // 선택하지 않은 유형 이름도 함께 넘겨, 다른 유형으로 작성되면 서버가 구조적 실패로 잡을 수 있게 한다.
    otherApplicationTypes: blueprint.applicationTypes.options.filter(option => option.name !== blueprint.applicationTypes.selected).map(option => option.name),
    readiness: blueprint.readiness,
    // 공고 기준과 이번 사업 확정값의 충돌. 어느 쪽도 고치지 않고 함께 넘긴다.
    officialConflicts: currentOfficialConflicts(),
    // 설계도에서 미확정인 항목이 계획서 어느 자리에 해당하는지. 미해결 집계를 같은 기준으로 맞춘다.
    unresolvedSections: unresolvedSectionsOf(blueprint),
    items: blueprint.items.filter(item => !['requirementLinks', 'openItems'].includes(item.key)).map(item => ({
      section: item.title,
      status: BLUEPRINT_STATUS_LABEL[item.status],
      value: item.status === 'NEEDS_CONFIRMATION' ? '[확인 필요]' : item.value,
      basis: item.basis,
      proposedOnly: item.status === 'PROPOSED'
    })),
    openQuestions: blueprint.openQuestions.map(entry => entry.question),
    submissionChecklist: blueprint.submissionChecklist.map(entry => `${entry.item} (${entry.kind})`),
    rule: blueprint.rule
  };
}

// 신청기관의 확인된 정보로 답할 수 있는 질문은 답변으로 채우고 사용자에게 다시 묻지 않는다.
function applyApplicantAnswers(questions) {
  const plan = planApplicantQuestions(questions, selectedApplicant());
  for (const item of plan.resolved) if (!String(state.designAnswers[item.question] || '').trim()) state.designAnswers[item.question] = `신청기관 정보에서 확인됨 · ${item.answer}`;
  state.applicantResolvedQuestions = plan.resolved;
  return plan.ask;
}

async function generateProposalParts(onlyGroupId = '') {
  const staged = state.stagedGeneration;
  const all = staged?.master?.sectionPlan || [];
  // 개별 생성이면 해당 항목만, 일괄이면 남은 항목 전체를 만든다.
  const groups = onlyGroupId ? all.filter(group => group.id === onlyGroupId) : all;
  if (!groups.length) return setState({ error: '분할 생성할 신청서 항목 구조가 없습니다.' });
  const completed = new Set((staged.completedGroupIds || []).filter(id => id !== onlyGroupId));
  state.stagedGeneration.phase = 'parts-generating';
  setAiBusy('신청서 항목별 계획서를 분할 생성하는 중...', { stagedGeneration: state.stagedGeneration, error: '', notice: '' }, 'parts');
  try {
    for (const group of groups) {
      if (completed.has(group.id)) continue;
      const relevantSections = relevantPreviousSections(group, state.stagedGeneration.parts);
      const result = await draftPartWithAI({ ...partPayload(), analysis: state.analysis, master: staged.master, group, continuitySummary: state.stagedGeneration.continuitySummary, relevantSections });
      state.stagedGeneration.parts = [...state.stagedGeneration.parts.filter(part => part.groupId !== group.id), { groupId: group.id, sections: result.sections }];
      state.stagedGeneration.continuitySummary = result.continuitySummary;
      completed.add(group.id);
      state.stagedGeneration.completedGroupIds = [...completed];
      state.stagedGeneration.phase = completed.size === all.length ? 'parts-ready' : 'parts-generating';
      setState({ stagedGeneration: state.stagedGeneration, busy: completed.size === all.length ? '' : `신청서 항목별 계획서를 분할 생성하는 중... (${completed.size}/${groups.length})` });
    }
    setState({ busy: '', stagedGeneration: state.stagedGeneration, notice: onlyGroupId ? `이 항목을 생성했습니다. 남은 항목 ${all.length - completed.size}개는 개별 또는 일괄로 생성할 수 있습니다.` : '분할 생성이 완료되었습니다. 내용을 하나의 계획서로 완성해 주세요.' });
    void archiveCurrentProposal('parts').catch(() => {});
  } catch (error) {
    state.stagedGeneration.phase = 'parts-generating';
    setState({ busy: '', stagedGeneration: state.stagedGeneration, error: `분할 생성이 중단되었습니다. 완료된 항목은 보존됩니다. ${error.message}` });
  }
}

const SECTION_DEPENDENCIES = { necessity: [], purpose: ['necessity'], goals: ['purpose'], target: ['necessity', 'goals'], programs: ['goals', 'target'], schedule: ['programs'], roles: ['programs', 'schedule'], budget: ['programs', 'roles'], indicators: ['goals', 'programs'], outcomes: ['goals', 'indicators'] };
function relevantPreviousSections(group, parts) {
  const needed = new Set((group.sectionKeys || []).flatMap(key => SECTION_DEPENDENCIES[key] || []));
  return (parts || []).flatMap(part => part.sections || []).filter(section => needed.has(section.id)).map(section => ({ id: section.id, title: section.title, content: String(section.content || '').slice(0, 3000), citations: section.citations || [] }));
}

function assembleProposal() {
  const staged = state.stagedGeneration;
  const groups = staged?.master?.sectionPlan || [];
  const allSections = (staged.parts || []).flatMap(part => part.sections || []);
  const sectionsById = new Map(allSections.map(section => [section.id, section]));
  const orderedEntries = groups.flatMap(group => (group.sectionKeys || []).map(key => ({ key, groupTitle: group.title })));
  const orderedKeys = orderedEntries.map(entry => entry.key);
  const structuralIssues = assemblyStructuralIssues(groups, staged.parts || [], orderedKeys, allSections);
  if (structuralIssues.some(issue => issue.startsWith('조립 불가:'))) return setState({ error: structuralIssues.join(' ') });
  const sections = orderedEntries.map((entry, index) => {
    const source = sectionsById.get(entry.key);
    return { ...source, title: `${index + 1}. ${entry.groupTitle} · ${String(source.title || sectionTitle(entry.key)).replace(/^\d+[.)]?\s*/, '')}`, content: String(source.content || '').replace(/\r\n?/g, '\n').trim() };
  });
  const assemblyCheck = validateFinalAssembly(staged.master, sections, structuralIssues, state.evidenceMap || []);
  state.stagedGeneration.phase = 'complete';
  state.sections = sections;
  state.assemblyCheck = assemblyCheck;
  state.reviewResult = null;
  state.reviewOriginalDraft = null;
  state.reviewFingerprint = '';
  markAiDone('assemble', { stagedGeneration: state.stagedGeneration, sections: state.sections, assemblyCheck, notice: assemblyCheck.valid ? '분할 항목을 공식 신청서 순서의 하나의 사업계획서로 완성했습니다.' : '계획서를 조립했지만 확인할 불일치가 있습니다. 사실을 자동 보정하지 않았습니다.', error: '' });
  void archiveCurrentProposal('complete').catch(() => {});
}

function assemblyStructuralIssues(groups, parts, orderedKeys, sections) {
  const issues = [];
  const groupIds = groups.map(group => group.id);
  const partIds = parts.map(part => part.groupId);
  const sectionIds = sections.map(section => section.id);
  if (new Set(groupIds).size !== groupIds.length) issues.push('조립 불가: 공식 목차 분할 ID가 중복되었습니다.');
  if (groups.some(group => !partIds.includes(group.id))) issues.push('조립 불가: 생성되지 않은 공식 목차 분할이 있습니다.');
  if (new Set(partIds).size !== partIds.length) issues.push('조립 불가: 같은 분할 결과가 중복되었습니다.');
  if (orderedKeys.length !== 10 || new Set(orderedKeys).size !== 10) issues.push('조립 불가: 공식 목차의 계획서 항목이 누락되거나 중복되었습니다.');
  if (sections.length !== orderedKeys.length || new Set(sectionIds).size !== sectionIds.length || orderedKeys.some(key => !sectionIds.includes(key))) issues.push('조립 불가: 생성 섹션이 공식 목차와 일치하지 않습니다.');
  return issues;
}

function validateFinalAssembly(master, sections, initialIssues = [], evidenceMap = []) {
  const issues = [...initialIssues];
  const documentText = sections.map(section => section.content).join('\n');
  const evidenceIds = new Set(evidenceMap.map(item => item.id));
  for (const section of sections) if ((section.citations || []).some(id => !evidenceIds.has(id))) issues.push(`${section.title}: 존재하지 않는 공식 근거 ID가 연결되어 있습니다.`);
  for (const baseline of master?.masterLogic?.baselineValues || []) {
    const value = String(baseline.value || '').trim();
    if (value && !value.includes('[확인 필요]') && !compactText(documentText).includes(compactText(value))) issues.push(`마스터 기준값 '${baseline.item}: ${value}'이 최종본에서 확인되지 않습니다.`);
  }
  return { valid: issues.length === 0, issues: [...new Set(issues)], checkedAt: new Date().toISOString(), sourcePolicy: '분할 원문 보존·새 사실 추가 없음' };
}
function compactText(value) { return String(value || '').replace(/[\s,·:~～-]/g, '').toLowerCase(); }

async function archiveCurrentProposal(forcedStage, announce = false) {
  if (!state.project.title && !state.selectedNotice?.title) throw new Error('저장할 계획서 제목이 없습니다.');
  const id = state.archiveProposalId || globalThis.crypto?.randomUUID?.() || `proposal-${Date.now()}`;
  state.archiveProposalId = id;
  saveState();
  const stage = forcedStage || (state.reviewResult ? 'review' : state.sections.length ? 'complete' : state.stagedGeneration?.phase === 'parts-ready' ? 'parts' : 'master');
  const fields = ['project', 'sourceText', 'analysis', 'sponsorIntent', 'projectDesign', 'missingInformation', 'evidenceMap', 'qualityCheck', 'designAnswers', 'designUnavailable', 'stagedGeneration', 'assemblyCheck', 'manualSources', 'matches', 'answers', 'sections', 'reviewResult', 'reviewOriginalDraft', 'reviewFingerprint', 'companyFacts', 'selectedNotice', 'aiMode', 'selectedApplicantId', 'projectValues', 'applicantResolvedQuestions', 'proposalVersions', 'revisionPlan', 'noticeLogic', 'draftReview'];
  // 계획서에는 사용 시점의 신청기관 사본만 남기고, 신청기관 원본은 별도 보관 항목으로만 수정한다.
  const snapshot = { ...Object.fromEntries(fields.map(key => [key, structuredClone(state[key])])), applicantSnapshot: selectedApplicant() ? structuredClone(selectedApplicant()) : null };
  const result = await saveArchivedProposal({ id, noticeKey: archiveNoticeKey(state.selectedNotice), title: state.project.title || state.selectedNotice?.title, stage, snapshot });
  state.archiveProposalId = result.id;
  if (announce) setState({ notice: `${archiveStageLabel(stage)}을 자료보관함에 저장했습니다.`, error: '' });
  return result;
}

function engineAnalysis(result) {
  const requirements = (result.evidenceMap || []).map((item, index) => ({ id: item.id || `evidence-${index + 1}`, category: '공모 근거', requirement: item.claim, mandatory: false, evidence: item.evidence, location: item.location, confidence: '높음' }));
  return { mode: 'ai', project: { ...state.project, title: result.projectDesign.projectName, budget: result.projectDesign.budgetStructure.join(' · ') }, requirements, evaluationCriteria: result.sponsorIntent.selectionLogic, submissionItems: [], warnings: [], questions: (state.missingInformation || []).slice(0, 5).map((question, index) => ({ id: `design-q-${index + 1}`, question, required: true, answer: state.designAnswers[question] || '' })) };
}

function localSponsorIntent(analysis) {
  const facts = analysis.requirements;
  const first = category => facts.find(value => value.category === category)?.evidence || '';
  return { coreProblem: first('대상') || facts[0]?.evidence || '', policyPurpose: first('운영'), requiredTarget: first('대상'), expectedChange: first('평가'), selectionLogic: analysis.evaluationCriteria || [], mandatoryConditions: facts.filter(value => value.mandatory).map(value => value.requirement), budgetRestrictions: facts.filter(value => value.category === '예산').map(value => value.requirement), evidence: facts.map(value => value.evidence).filter(Boolean) };
}

// 계획서 본문을 신청기관 정보로 올릴 때는 기존 항목을 덮어쓰지 않고 새 항목으로만 추가한다.
function confirmCompanyFact(index) {
  const section = state.sections[index];
  const applicant = selectedApplicant();
  if (!applicant) return setState({ error: '먼저 이번 사업의 신청기관을 선택해 주세요.' });
  if (!window.confirm(`이 내용이 ${applicant.name}의 실제 기관 정보임을 확인했습니까? 확인되지 않은 AI 문구는 저장하지 마세요.`)) return;
  const item = makeApplicantItem({ area: applicantAreaForTitle(section.title), label: section.title.replace(/^\d+[.)]?\s*/, ''), value: section.content, status: CONFIRMED_STATUS, source: `${state.project.title || '이번 사업'} 계획서에서 담당자 확인` });
  const next = structuredClone(applicant);
  next.items = [...next.items, item];
  state.applicants = upsertApplicant(state.applicants, next);
  setState({ applicants: state.applicants, notice: `${applicant.name} 신청기관 정보에 새 항목으로 추가했습니다. 기존 항목은 변경되지 않았습니다.` });
  void persistApplicant(applicant.id, false);
}

function confirmCompanyFactDraft() {
  const content = state.companyFactDraft.trim();
  const applicant = selectedApplicant();
  if (!applicant) return setState({ error: '먼저 이번 사업의 신청기관을 선택해 주세요.' });
  if (!content) return setState({ error: '확정할 신청기관 정보를 입력해 주세요.' });
  if (!window.confirm(`입력한 내용이 ${applicant.name}의 실제 기관 정보임을 확인했습니까?`)) return;
  const next = structuredClone(applicant);
  next.items = [...next.items, makeApplicantItem({ area: 'basic', label: '담당자 확정 정보', value: content, status: CONFIRMED_STATUS, source: '담당자 직접 입력' })];
  state.applicants = upsertApplicant(state.applicants, next);
  state.companyFactDraft = '';
  setState({ applicants: state.applicants, companyFactDraft: '', notice: `${applicant.name} 신청기관 정보에 추가했습니다.`, error: '' });
  void persistApplicant(applicant.id, false);
}

function applicantAreaForTitle(title) {
  if (/인력|조직|담당|역할/.test(title)) return 'staff';
  if (/실적|경험|성과/.test(title)) return 'performance';
  if (/예산|사업비|수익/.test(title)) return 'budget';
  if (/프로그램|내용/.test(title)) return 'programs';
  if (/지역|장소|시설/.test(title)) return 'facilities';
  if (/협력|협약/.test(title)) return 'partners';
  return 'basic';
}
// 보관 목록 우클릭 메뉴는 다른 곳을 누르거나 화면이 움직이면 닫는다.
document.addEventListener('click', event => { if (Date.now() - archiveMenuOpenedAt < 400) return; if (!(event.target instanceof Element) || !event.target.closest('#archive-context-menu')) closeArchiveMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeArchiveMenu(); });
window.addEventListener('scroll', closeArchiveMenu, true);
window.addEventListener('resize', closeArchiveMenu);
render();
