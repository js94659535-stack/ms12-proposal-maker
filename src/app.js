import { analyzeWithAI, coreProposalWithAI, diagnoseWithAI, draftPartWithAI, draftWithAI, finalizeWithAI, fullProposalWithAI, masterWithAI, patchSectionsWithAI, preciseReviewWithAI, proposalJobs, rewriteWithAI, setUsageProposalId } from './api.js';
import { EXAMPLE_NOTE, EXAMPLE_POINTS, EXAMPLE_SECTIONS, EXAMPLE_SUMMARY, EXAMPLE_TITLE } from './example-plan.js';
import { extractFile, extractFiles } from './files.js';
import { localAnalyze } from './fallback.js';
import { buildDocxBlob, downloadBlob, exportDocx, exportPdf, printDocument, submissionFileName } from './export.js';
import { buildProposalPdfBlob, exportProposalPdf } from './pdf-export.js';
import { buildHwpxBlob } from './hwpx-export.js';
import { fillFormLayout, fillSummary } from './form-fill.js';
import { classifyDocument, intakeSummary, markDuplicates } from './doc-classify.js';
import { trimManualSources } from './payload-trim.js';
import { applyOpenMarks, collectOpenMarks, openMarkTotal } from './open-marks.js';
import { MANIFEST_NAME, packageStale, planSubmissionZip, zipBytes } from './submission-zip.js';
import { agencyMe, acknowledgePrivacyNotice, UNAUTHORIZED, accountProfile, clearOAuthCallback, currentUser, finishSocial, login, logout, readOAuthCallback, recoverPassword, saveAccountProfile, saveMemberInfo, signup as signupEmail, startSocial } from './auth.js';
import { premiumNoticeHistory, premiumShowcase, premiumStatus } from './premium.js';
import { mySubscriptionRequest, submitSubscriptionRequest } from './auth.js';
import { adminSubscriptionRequests, adminDecideSubscription, adminAgencyList, adminAgencyTransfer, adminAgencyTransferPreview, adminSetAgency, adminOverviewCounts, adminSetNoticeSource, adminAccessOverview, adminAssignProposal, adminMemberUsage, adminProposalContent, adminRevokeGrant, adminSaveGrant, adminNoticeCollection, adminRunNoticeCollection, adminUsageReport, approveAccount, deleteShowcase, setAccountSubscription, transferSocialIdentity, disableAccount, listAccounts, listCollectedNotices, listShowcase, removeAccount, saveShowcase, setAccountPlan, setAccountPremium, setAccountRole, setNoticePublic, setShowcaseOrder, setShowcasePublic } from './admin.js';
import { fetchMembershipPlans, publicNoticeDetail, searchPublicNotices } from './notice-search.js';
import { operatorAgencyList, operatorNoticeCollection, operatorApprove, operatorDisable, operatorEndSessions, operatorIssueRecoveryCode, operatorOverview, operatorReactivate, operatorSetContractProgress, operatorUnlockLogin, operatorUsageReport, operatorUserDetail } from './operator.js';
import { codeLabel, statusLabel, warningLabel } from '../server/notice-run.js';
import { ABILITIES, SCOPES } from '../server/permissions.js';
import { BUSINESS_TYPES, SOURCE_GROUPS } from '../server/notice-sources.js';
import { FITNESS_LABELS } from '../server/notice-classify.js';
import { ORG_TYPES, QUICK_FIELDS, followUpQuestions, quickToApplicantItems, readyToDraft } from '../server/quick-org.js';
import { ANSWER_CHOICES, HIDDEN_EXPERT, MAX_QUESTIONS as SIMPLE_MAX_QUESTIONS, RESULT_ACTIONS, SIMPLE_STEPS, answerValue, currentStep as simpleStep, viewModeFor } from '../server/simple-flow.js';
import { ASSIGNABLE_ROLES, ROLE_DUTY, canHoldClients, roleLabel } from '../server/roles.js';
import { PASSWORD_MIN, validateSignup } from '../server/signup.js';
import { MEMBER_STEPS, PREMIUM_STEP_NOTE } from '../server/membership.js';
import { BILLING_NOTE, validateRequest } from '../server/subscription-request.js';
import { ADMIN_SHORTCUTS } from '../server/admin-overview.js';
import { AGENCY_STATUS_LABEL, DEFAULT_LIMITS, LIMIT_FIELDS, remainingFor } from '../server/agency.js';
import { buildOverview, detailPanels, mergeReviewIssues } from '../server/review-digest.js';
import { REVISION_KINDS, canRevise, diffSections, keptFacts, newUnknowns, remainingOf, revisionSlot, settleRevision } from '../server/revision.js';
import { mergeProfileIntoApplicant } from '../server/org-profile.js';
import { ASSET_KINDS, ASSET_STATUS, STATUS_LABELS as ASSET_STATUS_LABELS, assetSentence, suggestAssets, validateAsset } from '../server/idea-assets.js';
import { MAX_QUESTIONS, UNKNOWN, checkNumbers, intakeState } from '../server/proposal-intake.js';
import { reportError, reportStep, resetActivityDedupe } from './activity.js';
import { fetchNoticeDetail, fetchNoticeList, importNoticeUrl, noticeBodyText } from './notices.js';
import { setArchiveWorkspace, claimMyArchive, deleteIdeaAsset, listIdeaAssets, saveIdeaAsset, deleteArchivedApplicant, getArchivedProposal, getArchiveRecoveryKey, listArchivedApplicants, listArchivedProposals, saveArchivedApplicant, saveArchivedProposal, searchArchivedNotices, syncArchivedNotices, useArchiveRecoveryKey } from './archive.js';
import { ASOF_UNKNOWN, applySafeCandidates, applyUpdateCandidate, buildUpdateCandidates, extractApplicantCandidates } from './applicant-extract.js';
import { REFERENCE_TYPES, assessReferences, makeReference, projectContext, referenceNotices, referencePayload } from './reference-materials.js';
import { analyzeProposalStructure, buildStructuralRevision, reviewProposalStructure } from './proposal-structure.js';
import { applyRepairPlans, buildRepairPlans, repairPlanSummary } from './repair-plan.js';
import { analyzeNoticeStructure, buildSelectionLogic, noticeLogicSummary, selectionRequirements } from './notice-logic.js';
import { bundleSummary, expandBundle, mergeBundleStructures } from './notice-bundle.js';
import { matchApplicantToNotice } from './fit-matching.js';
import { buildDesignQuestions, reusableAnswerCandidates } from './design-questions.js';
import { buildBlueprint } from './project-blueprint.js';
import { BLUEPRINT_SECTION_MAP, UNRESOLVED_MARK, annotateDraftSections, checkDraftAgainstBlueprint, officialRequirementConflicts } from './blueprint-draft-check.js';
import { OFFICIAL_LOCKED, buildNoticeContract, checkProposalAgainstContract, contractCapabilityCheck, contractConflicts, contractFieldLocks } from './notice-contract.js';
import { buildFormSpec } from './form-spec.js';
import { approvedDemandEvidence, buildDemandEvidence } from './demand-evidence.js';
import { PROPOSAL_MODES, applyPatchedSections, buildReviewBasis, normalizeReviewIssues, reviewBasisReadiness, reviewSummary, sectionsToPatch, verifyUntouched } from './precise-review.js';
import { buildSubmissionPackage, sectionsFingerprint } from './submission-package.js';
import { ENGAGEMENT_STAGES, PROPOSAL_OUTLINE, buildDocumentPlan, buildEngagement, canGenerateProposal, designSnapshotStale, designStatus, makeClient, makeDesignApproval, makeNoticeRequest, normalizeEngagement } from './engagement.js';
import { EXTERNAL_SOURCE, appendProposalVersion, findVersionById, normalizeProposalVersions, resolveSavedVersion, applySectionRevision, buildCoachingHandoff, buildExternalWorkingCopy, coachingVerdict, compareCoachingRounds, findProposalVersion, handoffItemsForSection, matchSectionsForIssue, proposalTextFromSections, proposalTextFromSnapshot, revisionInstruction, sectionsFromProposalText, verifyLockedValues } from './coaching-handoff.js';
import { splitApplicantProfile } from './applicants.js';
import { ARCHIVE_PAGE_SIZES, ARCHIVE_STATUSES, archiveTableRows, shortDate } from './archive-table.js';
import { SAMPLE_MARK, SAMPLE_NOTE, SAMPLE_NOTICE, SAMPLE_NOTICE_KEY, SAMPLE_STAGES, SAMPLE_STAGE_BY_STEP, buildSampleProject } from './sample-project.js';
import { SAMPLE_REAL_COACHING } from './sample-coaching-run.js';
import { SOURCE_KINDS, makeApplicantSource, APPLICANT_AREAS, APPLICANT_STATUSES, CONFIRMED_STATUS, applicantAreaSummary, areaItems, areaTitle, itemsBySource, buildApplicantOrganization, compareNoticeWithApplicant, confirmedItems, findApplicant, makeApplicantItem, mergeApplicantItems, migrateCompanyFactsToApplicant, normalizeApplicant, planApplicantQuestions, upsertApplicant } from './applicants.js';
import { BASIC_AREAS, DETAIL_GROUPS, DETAIL_INTRO, basicStatus, detailProgress, draftFromApplicant, reusableCount } from './org-stage.js';
import { partialBlockReason, recordTiming, remainingGroups, timelineRows, writingState } from './writing-progress.js';
import { gapCoverSection, gapReport } from './gap-report.js';
import { balanceSummary, rebalanceGroups } from './group-balance.js';

const TYPES = [
  ['chest', '사랑의열매', '복지·지원사업'], ['family', '가족센터', '가족지원사업'],
  ['edu', '학교·교육청', '교육기관'], ['g2b', '나라장터·학교장터', '공공조달'],
  ['foundation', '민간재단·공익법인', '민간 배분사업'],
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
  { no: '06', title: '제출·보관', desc: '최종본 · DOCX/PDF · 계획서보관함', step: 5, covers: [], items: ['제출 전 확인 목록', 'DOCX·PDF 출력', '계획서보관함 저장'] }
];
const STEP_GUIDE = [
  { title: '공고 준비', icon: '①', desc: '공고를 가져오거나 공고문·양식을 올립니다.', items: ['기관 공고 조회', '공고문·신청서 업로드', '공고보관함 불러오기'] },
  { title: '공고 분석', icon: '②', desc: '선정 논리와 필수 요건을 원문 근거로 구조화합니다.', items: ['선정 논리 11항목', '첨부 자료묶음 분석', '평가·배점 확인'] },
  { title: '신청기관 준비', icon: '③', desc: '확인된 기관 정보만 이번 사업에 사용합니다.', items: ['기관 프로필 관리', '과거 실적 정리', '적합성 매칭'] },
  { title: '사업 설계', icon: '④', desc: '신청유형을 고르고 한 장의 설계도를 확정합니다.', items: ['신청유형 선택', '설계도 15항목', '확인 필요 입력'] },
  { title: '계획서 작성', icon: '⑤', desc: '설계도를 기준으로 초안을 만들고 근거를 연결합니다.', items: ['마스터 설계', '항목별 분할 생성', '근거·인용 유지'] },
  { title: '검토·제출', icon: '⑥', desc: '검증·수정 후 제출본을 만들고 보관합니다.', items: ['검증·코칭', '수정계획·버전 관리', 'DOCX·PDF 출력', '계획서보관함 저장'] }
];
const SOURCE_TYPES = ['공고 공문', '세부 공고문', '공모신청서', '사업계획서 서식', '예산 편성 기준', '심사·평가기준', '기타 안내자료'];
const NAVIGATION_KEY = 'ms12_workflow_navigation_v1';
const NAVIGATION_LIMIT = 10;
const initial = {
  step: 0, activeTool: 'home', homeSeen: false, portal: '', project: { type: 'g2b', title: '', issuer: '', deadline: '' }, sourceText: '', files: [],
  coaching: { title: '', text: '', validatedText: '', criteriaText: '', officialEvaluationProvided: false, sourceProposalId: '', sourceNoticeKey: '', seriesId: '', currentArchiveId: '', result: null, workItems: [], pendingJob: null, version: 0, references: [], referenceType: REFERENCE_TYPES[0], referenceDraft: '', referenceNameDraft: '' },
  // 사업 아이디어·활용자산과 제안서 작성정보. 계획서 원문과 따로 둔다.
  ideaAssets: [], ideaAssetsLoaded: false, assetDraft: null, intakeAnswers: {},
  // 간단 시작 입력과 뒤이은 확인 질문. 계획서 원문과 따로 둔다.
  quickOrg: {}, quickAnswers: {},
  // 간편·전문가 화면 전환과 한 번에 수정 요청. 계획서 원문과 따로 둔다.
  viewMode: '', expertDetail: false, workspace: 'personal', markDraft: {}, markOpen: false,
  // 검증 결과 화면. 총론을 먼저 보고 각론은 눌렀을 때만 편다.
  reviewDetail: false, reviewPanels: [], reviewFocus: false, reviseOpen: false, reviseDraft: null, revisions: [], revisionBackup: null,
  // 상세정보에서 지금 펼쳐 둔 구역. 모든 구역을 한 번에 열지 않는다.
  openOrgGroups: [],
  // 배경으로 돌린 설계 작업번호. 새로고침·시간초과 뒤에도 같은 결과를 받아 다시 과금하지 않는다.
  designJobs: {},
  // 이 계획서에 남아 있는 AI 작업 기록. 다시 만들기 전에 먼저 보여 준다.
  aiJobs: { list: [], loadedFor: '' },
  applicants: [], selectedApplicantId: '', applicantEditingId: '', applicantNameDraft: '', applicantItemDrafts: {}, projectValues: [], projectValueDraft: { label: '', value: '', applicantItemId: '' }, applicantComparison: null, applicantResolvedQuestions: [], applicantDocDraft: '', applicantExtraction: null, coachingApplicantId: '', applicantSourceDraft: { kind: '홈페이지', name: '', url: '', asOf: '' },
  revisionPlan: null, draftReview: null, projectNarrative: '',
  // 서버가 붙여 준 근거 검증·평가자 검토. 화면은 판정하지 않고 그대로 보여 준다.
  serverGuard: null, serverEvidence: null, evaluatorReview: null, proposalVersions: [], proposalFlow: { status: '', baselineVersion: 0, reviewTarget: null, rounds: [], requests: [], requestOpen: false, requestText: '', requestScope: [], openVersion: 0, compareVersion: 0, approvedVersion: 0, approvedAt: '' }, coachingSelection: [], applicantSkipped: false, noticeLogic: null, redesignForContract: false,
  // 「사업계획서 의뢰 건」 한 건의 고객 담당자와 공고 요청서. 기관 영구정보와 섞지 않는다.
  engagement: { client: makeClient(), request: makeNoticeRequest(), design: makeDesignApproval(), view: 'customer', mode: '표준형' }, proposalTables: [], preciseReview: null, submissionIncluded: [], currentVersionId: '', attachmentLinks: {}, submissionZip: null,
  analysis: null, sponsorIntent: null, projectDesign: null, missingInformation: [], evidenceMap: [], qualityCheck: null, designAnswers: {}, designUnavailable: false, stagedGeneration: { phase: 'idle', master: null, parts: [], completedGroupIds: [], continuitySummary: null, timeline: [], calls: {}, stoppedAt: '', failedGroupId: '' }, assemblyCheck: null, archiveProposalId: '', archiveNotices: [], archiveProposals: [], archiveFilters: { institution: '', from: '', to: '', keyword: '' }, archiveTable: { query: '', sortKey: 'collectedAt', sortDir: 'desc', page: 1, pageSize: 20, selected: [], expandedKey: '', applicantPickerKey: '', filters: { collected: '', institution: '', field: '', status: '', applicant: '', deadline: '' } }, archiveNoticeLinks: {}, archiveHiddenNotices: [], archiveOpenProposal: '', sampleStage: '', sampleReturn: '', aiResult: null, archiveKeyDraft: '', manualSources: [], manualSourceType: SOURCE_TYPES[0], manualSourceName: '', manualSourceText: '', matches: [], answers: [], sections: [], reviewResult: null, reviewOriginalDraft: null, reviewFingerprint: '', reviewBusy: false, companyFacts: [], companyFactDraft: '', noticeResults: [], noticeSources: [], noticeTrash: [], selectedNoticeIndexes: [], noticePreview: null, pendingNoticeChoice: null, noticeUrlDraft: '', selectedNotice: null, busy: '', notice: '', error: '', aiMode: ''
};
let state = loadState();
let navigationHistory = loadNavigationHistory();
const app = document.querySelector('#app');
let busyStartedAt = 0;
// 이번 AI 호출에서 무엇을 줄여 보냈는지. 화면에 그대로 알린다.
let lastTrimNotes = [];
let busyTimer = null;
let archiveLoaded = false;
let homeArchiveLoaded = false;
let coachingPollActive = false;
// 길게 누르기로 연 메뉴가 같은 동작의 click 때문에 바로 닫히지 않게 한다.
let archiveMenuOpenedAt = 0;
// 연결한 첨부 원본. 브라우저 메모리에만 두고 localStorage에 base64로 저장하지 않는다.
const attachmentFiles = new Map();
// 로그인 상태. 세션 쿠키가 진짜 근거이고 이 값은 화면 표시용이다. localStorage에 저장하지 않는다.
let auth = {
  status: 'checking', user: null, mode: 'login',
  // 로그아웃 상태의 첫 화면. 처음 온 사람은 로그인 창이 아니라 서비스 소개를 본다.
  // 공급자가 돌려보낸 주소면 소개를 거치지 않고 곧바로 로그인 화면에서 마무리한다.
  view: readOAuthCallback() ? 'auth' : 'landing',
  emailDraft: '', passwordDraft: '', confirmDraft: '', codeDraft: '', error: '', notice: '', busy: false,
  identities: [], profileDraft: { name: '', phone: '', orgName: '', isContact: null, agreeTerms: false, agreePrivacy: false },
  // 관리자 화면 자료. 로그인 상태와 함께만 살아 있고 localStorage에 저장하지 않는다.
  accounts: [], accountsLoaded: false, confirmDelete: '', adminTab: 'accounts', agency: emptyAgency(), notices: emptyAdminNotices(), usage: emptyUsage(),
  // 정식 수주계약 편집과 공개용 우수 제안서. 화면에만 두고 저장하지 않는다.
  premiumDraft: {}, showcase: null, showcaseDraft: {}, showcaseEditing: '', progressDraft: {}, subscriptionDraft: {}, transferNotice: '',
  // 운영관리자 화면 자료. 발급한 복구코드는 화면에만 잠시 두고 저장하지 않는다.
  operator: emptyOperator(),
  subRequest: emptySubscriptionRequest(),
  subRequests: { loaded: false, list: [] },
  // 핵심제안서 화면. 입력과 결과는 화면에만 두고 브라우저 저장소에 넣지 않는다.
  core: { draft: emptyCoreDraft(), result: null },
  // 공모정보 검색 화면. 로그인 없이도 쓰며 이미 모아 둔 자료만 읽는다.
  search: emptySearch(),
  // 내 정보 수정. 저장 전 입력은 memberDraft에만 두고 저장 후 서버 값으로 다시 읽는다.
  memberProfile: {}, memberDraft: {}, memberOpen: false, profileUpdatedAt: '', profileReviewNeeded: false,
  access: null,
  // 회원등급·이용현황과 공개 상품표. 서버가 준 값만 쓴다.
  membership: null, plans: null, contract: null, lockedNotice: '',
  // 선정 가능성 진단서 화면. 입력과 결과는 화면에만 두고 저장하지 않는다.
  diagnosis: null,
  // 수주회원 화면 자료. 로그인 상태와 함께만 살아 있고 저장하지 않는다.
  premium: null
};
// 검색 기본값은 결과 정확도가 높은 맞춤검색이다.
function emptySearch() {
  return { mode: 'focused', queryDraft: '', query: '', loaded: false, busy: false, notices: [], total: 0, facets: null, filters: {}, selected: '', detail: null, signupNotice: '', scopeLabel: '', locked: '', needsSignup: false, needsApproval: false };
}
// 결제 기능이 아직 없다. 전체 이용권이 없는 사람에게는 이 문구로만 안내한다.
const CONTACT_LABEL = '이용권 문의';
const NEED_FULL_NOTICE = `전체 이용권이 있어야 쓸 수 있는 기능입니다. ${CONTACT_LABEL}로 연락해 주세요.`;
// 전체 기능을 쓸 수 있는 사람. 실제 차단은 서버가 하고 화면은 그 결과를 따른다.
function hasFullAccess() {
  const user = auth.user;
  if (!user) return false;
  return user.role === 'admin' || user.role === 'operator' || user.plan === 'full';
}
// 수주회원(수주계약 체결). 화면 표시용이고 실제 차단은 /api/premium이 다시 확인한다.
 function isPremium() { return auth.status === 'signedIn' && (Boolean(auth.user?.premium) || isStaff()); }
// 승인은 받았지만 전체 이용권이 없는 회원. 핵심제안서 화면만 쓴다.
function trialAccount() { return auth.status === 'signedIn' && auth.user?.status === 'active' && !hasFullAccess(); }
// 발급된 복구코드(issued)는 이 객체 안에서만 살고 localStorage·sessionStorage에 절대 넣지 않는다.
// 구독 신청서 화면 상태. 로그인 상태와 함께만 살아 있고 저장하지 않는다.
function emptySubscriptionRequest() {
  return { open: false, loaded: false, mine: null, draft: { orgName: '', contactName: '', phone: '', purpose: '', wantedStart: '', monthlyPlans: '', noticeAck: false } };
}

function emptyOperator() {
  return { loaded: false, users: [], audit: [], notIntegrated: [], query: '', queryDraft: '', selected: '', detail: null, issued: null, tab: 'users', confirmEnd: '' };
}

function setAuth(patch) { auth = { ...auth, ...patch }; render(); }
function setOperator(patch) { setAuth({ operator: { ...auth.operator, ...patch } }); }
// 로그아웃하거나 세션이 끊기면 소개 화면이 아니라 로그인 화면으로 되돌린다. 전할 말을 그 자리에서 보여 주기 위해서다.
function signOutLocally(message = '') { resetActivityDedupe(); setAuth({ status: 'anonymous', user: null, mode: 'login', view: 'auth', passwordDraft: '', confirmDraft: '', codeDraft: '', identities: [], accounts: [], accountsLoaded: false, operator: emptyOperator(), error: message, notice: '', busy: false }); }
// 로그아웃 상태에서 소개 대신 로그인 화면을 보여야 하는 때. 전할 말이 있으면 소개 화면에 묻히지 않게 반드시 로그인 화면에 띄운다.
function showAuthForm() { return auth.view === 'auth' || Boolean(auth.error) || Boolean(auth.notice); }
// 승인 전 계정은 가입 절차 화면만 본다.
// 화면 분기는 역할과 승인 상태를 함께 본다.
//   admin·operator + active   → 포털 선택
//   누구든 status=중지        → 이용 중지 화면(작업 API는 서버가 막는다)
//   customer + pending        → 가입정보·승인 대기
//   customer + active         → 회원등급에 맞는 화면
// 활성이 아닌 관리자·운영관리자도 작업 화면으로 들어가지 못한다.
function suspendedAccount() { return auth.status === 'signedIn' && auth.user?.status === 'disabled'; }
function inactiveStaff() {
  return auth.status === 'signedIn' && ['admin', 'operator'].includes(auth.user?.role) && auth.user?.status !== 'active';
}
// 승인 대기 화면은 고객 계정만 본다. 운영 계정은 고객 승인 절차의 대상이 아니다.
function pendingAccount() {
  return auth.status === 'signedIn' && auth.user?.role === 'customer' && auth.user?.status === 'pending';
}
// 관리자 화면을 열 수 있는 사람. 실제 차단은 서버가 하고 화면은 그 결과를 따른다.
function isAdmin() { return auth.status === 'signedIn' && auth.user?.role === 'admin' && auth.user?.status === 'active'; }
// 운영관리자 화면을 열 수 있는 사람. 관리자도 같은 화면을 쓸 수 있다.
function isOperator() { return auth.status === 'signedIn' && (auth.user?.role === 'operator' || auth.user?.role === 'admin') && auth.user?.status === 'active'; }
// ---------- 관리자 포털 · 계획서 포털 ----------
// 관리자·운영관리자는 계정을 따로 만들지 않고 한 계정으로 두 포털을 오간다.
// 계획서 포털에서는 회원과 똑같은 화면으로 직접 작업하고, 관리자 포털에서는 회원·이용권·공모정보를 관리한다.
const PORTALS = ['admin', 'proposal'];
function isStaff() { return isAdmin() || isOperator(); }
function inAdminPortal() { return isStaff() && state.portal === 'admin'; }
// 계획서 포털에서는 관리 진입점을 숨기고 되돌아가는 단추 하나만 남긴다. 회원이 보는 화면과 같게 하려는 것이다.
function portalLinks(cls = 'history-button') {
  if (!isStaff()) return premiumLink(cls);
  // 계획서 포털에서는 회원 화면과 전문가 화면을 즉시 오간다.
  // 화면만 바뀔 뿐 서버의 분석·검증·권한 차단은 그대로 돈다.
  const viewToggle = !inAdminPortal() && canToggleView()
    ? `<button class="${cls}" id="toggle-view">${viewMode() === 'simple' ? '전문가 상세 보기' : '회원 화면으로 보기'}</button>`
    : '';
  if (!inAdminPortal()) return `${viewToggle}<button class="${cls}" data-portal="admin">관리자 포털</button>`;
  return `${isOperator() ? `<button class="${cls}" data-portal-open="operator" aria-pressed="${state.activeTool === 'operator'}">운영관리자</button>` : ''}${isAdmin() ? `<button class="${cls}" data-portal-open="admin" aria-pressed="${state.activeTool === 'admin'}">관리자</button>` : ''}<button class="${cls}" data-portal="proposal">계획서 포털</button>`;
}
// 수주회원 전용 진입점. 계약이 있는 사람에게만 보인다.
function premiumLink(cls = 'history-button') {
  const diagnosis = auth.membership?.canDiagnosis ? `<button class="${cls}" id="open-diagnosis" aria-pressed="${state.activeTool === 'diagnosis'}">선정 가능성 진단서</button>` : '';
  if (!isPremium()) return diagnosis;
  return diagnosis + `<button class="${cls}" id="open-premium" aria-pressed="${state.activeTool === 'premium'}">수주회원 👑</button>`;
}
function openPortal(portal) {
  if (!PORTALS.includes(portal)) return;
  state.portal = portal;
  if (portal !== 'admin') return setState({ activeTool: 'home', notice: '', error: '' });
  // 최고관리자는 관리자 랜딩을 먼저 본다. 운영관리자는 허용된 운영 화면으로 바로 들어간다.
  if (isAdmin()) return setState({ activeTool: 'home', notice: '', error: '' });
  return openOperator();
}

// 로그인 직후 어디로 들어갈지 고른다. 한 번 고르면 기억하고 언제든 위쪽 단추로 바꾼다.
function portalChoiceView() {
  return `<div class="layout home-layout"><main class="main"><div class="home">
    <header class="home-header">
      <div class="home-brand"><strong>사업계획서 작성 도우미</strong><span>${escapeHtml(accountEmail())} · ${escapeHtml(ROLE_LABELS[auth.user?.role] || auth.user?.role || '')}${ROLE_DUTY[auth.user?.role] ? ` · ${escapeHtml(ROLE_DUTY[auth.user?.role])}` : ''}</span></div>
      <nav class="home-nav"><button class="button ghost" id="sign-out">로그아웃</button></nav>
    </header>
    <section class="landing">
      <div class="landing-hero">
        <p class="landing-eyebrow">포털 선택</p>
        <h1>어느 쪽으로 들어가시겠어요?</h1>
        <p class="landing-lead">같은 계정으로 두 포털을 오갑니다. 회원 계정을 따로 만들 필요가 없습니다. 들어간 뒤에도 위쪽 단추로 언제든 바꿀 수 있습니다.</p>
      </div>
      <div class="landing-section">
        <div class="landing-grid">
          <article class="landing-card"><header><span class="landing-step">1</span><h3>계획서 포털</h3></header>
            <p>회원이 보는 화면 그대로 들어가 직접 계획서를 작성합니다. 공고 분석부터 검증·제출본까지 회원과 같은 흐름으로 진행합니다.</p>
            <ul><li>공고 가져오기·분석</li><li>신청기관 정보와 사업 설계</li><li>계획서 작성·검증·출력</li></ul>
            <button class="button primary" data-portal="proposal">계획서 포털로 들어가기</button></article>
          <article class="landing-card"><header><span class="landing-step">2</span><h3>관리자 포털</h3></header>
            <p>관리자 입장에서 회원과 서비스를 관리합니다. 회원이 보는 작업 화면은 열리지 않습니다.</p>
            <ul><li>회원 승인·중지·역할</li><li>이용권 부여·회수와 AI 사용량·비용</li><li>공모정보 공개 관리${isAdmin() ? '' : ' (조회)'}</li></ul>
            <button class="button primary" data-portal="admin">관리자 포털로 들어가기</button></article>
        </div>
      </div>
      <footer class="landing-footer"><span>한 계정으로 두 포털을 씁니다 · 회원 계정을 따로 만들지 않습니다</span><div></div></footer>
    </section>
  </div></main></div>`;
}
function bindPortalChoice() {
  document.querySelectorAll('[data-portal]').forEach(el => el.onclick = () => openPortal(el.dataset.portal));
  document.querySelector('#sign-out')?.addEventListener('click', () => void submitLogout());
}

async function checkSession() {
  // 공급자가 돌려보낸 주소면 먼저 마무리한다.
  const callback = readOAuthCallback();
  if (callback) {
    clearOAuthCallback();
    if (callback.error || !callback.code || !callback.state) return setAuth({ status: 'anonymous', user: null, error: '소셜 로그인을 마치지 못했습니다. 다시 시도해 주세요.' });
    setAuth({ status: 'checking', error: '' });
    const done = await finishSocial(callback.provider, callback.code, callback.state).catch(() => ({ ok: false }));
    if (done.ok && done.signedIn) return applySignedIn(done.user, done.created ? '가입이 접수되었습니다. 아래 정보를 입력해 주세요.' : '');
    if (done.ok && done.linked) { await loadAccount(); return setAuth({ notice: done.alreadyLinked ? '이미 연결된 계정입니다.' : '소셜 계정을 연결했습니다.' }); }
    return setAuth({ status: 'anonymous', user: null, error: done.error || '소셜 로그인을 마치지 못했습니다.' });
  }
  const result = await currentUser().catch(() => ({ ok: false }));
  if (result.ok && result.user) return applySignedIn(result.user);
  setAuth({ status: 'anonymous', user: null, passwordDraft: '' });
}
function applySignedIn(user, notice = '') {
  // 에이전트이면 자기 자격과 남은 편수를 함께 읽는다. 남의 자격은 읽지 않는다.
  if (user?.role === 'agency') setTimeout(() => void loadAgencyMe(), 0);
  // 계정이 바뀌면 진행 기록의 중복 걸러내기를 처음부터 다시 센다.
  resetActivityDedupe();
  setAuth({ status: 'signedIn', user, error: '', notice, passwordDraft: '', emailDraft: '', codeDraft: '' });
  void loadAccount();
}
async function loadAccount() {
  const result = await accountProfile().catch(() => ({ ok: false }));
  if (!result.ok) return;
  const saved = result.profile || {};
  setAuth({
    identities: result.identities || [],
    user: { ...auth.user, ...result.user },
    memberProfile: result.memberProfile || {},
    membership: result.membership || null,
    plans: result.plans || auth.plans,
    contract: result.contract || null,
    profileUpdatedAt: result.profileUpdatedAt || '',
    profileReviewNeeded: Boolean(result.profileReviewNeeded),
    profileDraft: {
      name: auth.profileDraft.name || result.user?.name || '', phone: auth.profileDraft.phone || saved.phone || '',
      orgName: auth.profileDraft.orgName || saved.orgName || '', isContact: auth.profileDraft.isContact ?? (saved.consentedAt ? saved.isContact : null),
      agreeTerms: auth.profileDraft.agreeTerms, agreePrivacy: auth.profileDraft.agreePrivacy
    }
  });
}
// 소셜 가입·연결 시작. 설정값이 없으면 그대로 사유를 보여 준다.
async function beginSocial(provider, mode) {
  setAuth({ busy: true, error: '', notice: '' });
  const result = await startSocial(provider, mode).catch(() => ({ ok: false }));
  if (!result.ok || !result.authorizeUrl) return setAuth({ busy: false, error: result.error || '소셜 로그인을 시작하지 못했습니다.' });
  window.location.assign(result.authorizeUrl);
}
async function submitProfile() {
  if (auth.busy) return;
  setAuth({ busy: true, error: '', notice: '' });
  const result = await saveAccountProfile(auth.profileDraft).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '정보를 저장하지 못했습니다.' });
  setAuth({ busy: false, notice: '가입 정보를 저장했습니다. 관리자 승인 후 이용할 수 있습니다.' });
  await loadAccount();
}
// 소셜 계정 행의 email은 내부 식별용이다. 사람에게는 연결된 소셜 이메일을 보여 준다.
function accountEmail() {
  const social = auth.identities.find(item => item.email)?.email;
  const own = String(auth.user?.email || '');
  return social || (own.endsWith('@social.ms12.invalid') ? '소셜 계정' : own);
}
const SOCIAL_BUTTONS = [['google', 'Google'], ['kakao', '카카오']];
function socialButtons(mode) {
  return SOCIAL_BUTTONS.map(([provider, label]) =>
    `<button class="button secondary" data-social="${provider}" data-social-mode="${mode}" ${auth.busy ? 'disabled' : ''}>${label}${mode === 'link' ? ' 계정 연결' : '로 시작하기'}</button>`).join('');
}
// 이용이 중지되었거나 아직 활성이 아닌 계정이 보는 화면. 작업 화면은 열리지 않는다.
function blockedView() {
  const suspended = suspendedAccount();
  const role = { admin: '관리자', operator: '운영관리자', customer: '회원' }[auth.user?.role] || '회원';
  return `<div class="layout home-layout"><main class="main"><div class="card" style="max-width:520px;margin:8vh auto">
    <div class="card-title"><div><h3>${suspended ? '이용이 중지된 계정입니다' : '아직 이용할 수 없는 계정입니다'}</h3>
      <span>${escapeHtml(accountEmail())} · ${escapeHtml(role)}</span></div>
      <span class="status 확인-필요">${suspended ? '이용 중지' : '승인 대기'}</span></div>
    <p class="muted">${suspended
      ? '관리자가 이 계정의 이용을 중지했습니다. 작업 화면과 자료는 열리지 않습니다. 관리자에게 문의해 주세요.'
      : '이 계정은 아직 활성 상태가 아닙니다. 관리자가 상태를 확인한 뒤에 열립니다.'}</p>
    <p class="muted">이 상태에서는 계획서 작성·공모정보 검색·자료 조회가 모두 잠깁니다. 서버도 같은 기준으로 막습니다.</p>
    <div class="actions"><span class="muted"></span><button class="button secondary" id="sign-out" type="button">로그아웃</button></div>
  </div></main></div>`;
}
// 승인 전 계정이 채우는 최소 정보.
function pendingView() {
  const draft = auth.profileDraft;
  const done = Boolean(auth.user?.profileCompleted);
  return `<div class="layout home-layout"><main class="main"><div class="card" style="max-width:520px;margin:6vh auto">
    <div class="card-title"><div><h3>가입 정보 입력</h3><span>${escapeHtml(accountEmail())} · 관리자 승인 후 이용할 수 있습니다.</span></div><span class="status 확인-필요">승인 대기</span></div>
    ${auth.error ? `<div class="alert danger"><strong>${escapeHtml(auth.error)}</strong></div>` : ''}
    ${auth.notice ? `<div class="alert success"><strong>${escapeHtml(auth.notice)}</strong></div>` : ''}
    ${done ? '<div class="alert success"><strong>정보를 모두 받았습니다</strong><p>관리자가 승인하면 작업 화면이 열립니다.</p></div>' : ''}
    <form id="profile-form">
      <div class="field"><label for="profile-name">표시 이름</label><input id="profile-name" value="${escapeHtml(draft.name)}"></div>
      <div class="field"><label for="profile-phone">연락처</label><input id="profile-phone" inputmode="tel" placeholder="010-0000-0000" value="${escapeHtml(draft.phone)}"></div>
      <div class="field"><label for="profile-org">기관명</label><input id="profile-org" value="${escapeHtml(draft.orgName)}"></div>
      <div class="field"><label for="profile-contact">담당자 여부</label><select id="profile-contact">
        <option value="" ${draft.isContact === null ? 'selected' : ''}>선택해 주세요</option>
        <option value="yes" ${draft.isContact === true ? 'selected' : ''}>기관의 사업 담당자입니다</option>
        <option value="no" ${draft.isContact === false ? 'selected' : ''}>담당자가 아닙니다</option></select></div>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="agree-terms" ${draft.agreeTerms ? 'checked' : ''}>이용약관에 동의합니다 (${CONSENT_TERMS})</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="agree-privacy" ${draft.agreePrivacy ? 'checked' : ''}>개인정보 수집·이용에 동의합니다 (${CONSENT_PRIVACY})</label>
      <div class="actions"><button class="button secondary" id="sign-out" type="button">로그아웃</button><button class="button primary" id="profile-submit" type="submit" ${auth.busy ? 'disabled' : ''}>${auth.busy ? '저장 중…' : '제출'}</button></div>
    </form>
    ${lockedFeatureList()}
    ${memberProfileForm()}
    ${accountLinkPanel()}</div></main></div>`;
}
const CONSENT_TERMS = '2026-08-10';
const CONSENT_PRIVACY = '2026-08-10';
// 소셜 로그인이 만든 별도 계정의 연결을 관리자 계정으로 가져온다.
// 이메일이 같다는 이유만으로 옮기지 않는다. 서버가 방금 로그인한 관리자 세션인지, 옮겨 올 계정이 비어 있는지 다시 본다.
function identityTransferPanel() {
  if (!isAdmin()) return '';
  return `<details class="card org-details" id="identity-transfer">
    <summary><b>소셜 로그인 연결 가져오기</b> <small>구글·카카오로 들어갔더니 승인 대기 화면이 나올 때</small></summary>
    <p class="muted">소셜 로그인은 이메일이 같아도 관리자 계정에 붙지 않고 새 고객 계정을 만듭니다. 관리자 비밀번호로 방금 로그인한 상태에서 아래를 누르면 그 연결을 이 관리자 계정으로 가져옵니다. 옮겨 올 계정에 기관정보·구독·계약이 있으면 옮기지 않고 알려 드립니다.</p>
    <div class="actions"><span class="muted">${escapeHtml(auth.transferNotice || '')}</span>
      <div>${SOCIAL_BUTTONS.map(([provider, label]) => `<button class="button secondary" data-transfer-identity="${provider}" ${auth.busy ? 'disabled' : ''}>${escapeHtml(label)} 연결 가져오기</button>`).join('')}</div></div>
  </details>`;
}

async function runIdentityTransfer(provider) {
  setAuth({ busy: true, error: '', notice: '', transferNotice: '' });
  const result = await transferSocialIdentity(provider).catch(() => ({ ok: false }));
  if (!result.ok) {
    return setAuth({ busy: false, error: result.error || '연결을 옮기지 못했습니다.', transferNotice: result.conflict ? '옮겨 올 계정에 자료가 있어 그대로 두었습니다.' : '' });
  }
  setAuth({ busy: false, notice: result.alreadyLinked ? '이미 이 관리자 계정에 연결되어 있습니다.' : '소셜 연결을 관리자 계정으로 가져왔습니다. 다음부터는 소셜 로그인으로도 관리자로 들어옵니다.', transferNotice: '' });
}


// ---------- 개인정보 처리 안내 ----------
// 안내 문구가 바뀌어도 기존 계정을 자동 동의로 만들지 않는다. 동의한 판만 계정에 남는다.
const PRIVACY_NOTICE_VERSION = '2026-08-12';
function privacyNoticePanel() {
  const agreed = auth.user?.privacyNoticeVersion === PRIVACY_NOTICE_VERSION;
  return `<details class="card org-details" id="privacy-notice" ${agreed ? '' : 'open'}>
    <summary><b>개인정보·업무자료 열람 안내</b> ${agreed ? `<small>${escapeHtml(PRIVACY_NOTICE_VERSION)}판에 동의함</small>` : '<small class="muted">아직 확인하지 않은 안내가 있습니다</small>'}</summary>
    <p class="muted">서비스 운영·품질관리·수주지원을 위해 <b>최고관리자</b>는 이 서비스에 저장된 업무자료를 열람할 수 있습니다. 계획서 원문은 프리미엄 계약이 있거나 회원이 그 계획서에 지원 열람을 허락한 경우에만 열리며, 열람할 때마다 실행자·대상·시각이 기록됩니다.</p>
    <p class="muted"><b>운영관리자</b>는 최고관리자가 지정한 회원·자료·기간에 한해서만 열람합니다. 지정이 없으면 아무것도 보이지 않습니다.</p>
    <p class="muted">비밀번호와 그 해시, 세션키, 소셜 로그인 토큰, 복구코드 원문은 <b>최고관리자에게도 표시되지 않습니다.</b></p>
    <div class="actions"><span class="muted">${agreed ? '이 안내에 동의하셨습니다.' : '동의하지 않아도 기존 기능은 그대로 쓸 수 있습니다. 확인만 남깁니다.'}</span>
      ${agreed ? '' : `<button class="button primary" id="privacy-agree" ${auth.busy ? 'disabled' : ''}>안내를 확인했습니다</button>`}</div>
  </details>`;
}

// ---------- 복구키로 보관하던 자료를 내 계정에 연결 ----------
// 관리자가 짐작해서 붙이지 않는다. 복구키를 가진 회원이 직접 누를 때만 붙는다.
function archiveClaimPanel() {
  return `<details class="card org-details" id="archive-claim">
    <summary><b>이 브라우저의 보관자료를 내 계정에 연결</b> <small>복구키로 보관하던 계획서·신청기관 자료</small></summary>
    <p class="muted">지금까지 계획서는 브라우저 복구키로만 보관됐습니다. 아래를 누르면 <b>이 브라우저의 복구키로 보관된 자료</b>만 내 계정에 연결됩니다. 이메일이나 기관명이 비슷하다는 이유로 자동 연결되는 일은 없습니다. 복구키는 그대로 복구수단으로 남습니다.</p>
    <div class="actions"><span class="muted">${escapeHtml(auth.claimNotice || '')}</span>
      <button class="button secondary" id="claim-archive" ${auth.busy ? 'disabled' : ''}>내 계정에 연결</button></div>
  </details>`;
}

async function agreePrivacyNotice() {
  setAuth({ busy: true, error: '', notice: '' });
  const result = await acknowledgePrivacyNotice(PRIVACY_NOTICE_VERSION).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '동의를 저장하지 못했습니다.' });
  setAuth({ busy: false, notice: '안내 확인을 저장했습니다.', user: { ...auth.user, privacyNoticeVersion: PRIVACY_NOTICE_VERSION } });
}

async function claimArchiveToAccount() {
  setAuth({ busy: true, error: '', notice: '', claimNotice: '' });
  const result = await claimMyArchive().catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '연결하지 못했습니다.' });
  setAuth({
    busy: false,
    notice: result.claimed || result.applicants
      ? `계획서 ${result.claimed || 0}건, 신청기관 자료 ${result.applicants || 0}건을 내 계정에 연결했습니다.`
      : '이 브라우저에 연결할 자료가 없습니다.',
    claimNotice: ''
  });
}

// 로그인한 사람의 계정 설정 화면.
function accountView() {
  return `<div class="card"><div class="card-title"><div><h3>계정 설정</h3><span>${escapeHtml(accountEmail())} · ${escapeHtml(auth.user?.role || '')}${auth.user?.premium ? ` · ${escapeHtml(auth.user.premiumLabel || '수주회원')}(${escapeHtml(auth.user.premiumStatusLabel || '')})` : ''}</span></div><span class="status 충족">${escapeHtml(auth.user?.status || '')}</span></div>
    ${auth.error ? `<div class="alert danger"><strong>${escapeHtml(auth.error)}</strong></div>` : ''}
    ${auth.notice ? `<div class="alert success"><strong>${escapeHtml(auth.notice)}</strong></div>` : ''}
    ${membershipStatusPanel()}
    ${identityTransferPanel()}
    ${memberProfileForm()}
    ${archiveClaimPanel()}
    ${privacyNoticePanel()}
    ${accountLinkPanel()}</div>`;
}
// 로그인한 사람이 두 번째 소셜 계정을 연결하는 곳.
function accountLinkPanel() {
  const linked = new Set(auth.identities.map(item => item.provider));
  return `<details ${linked.size ? '' : 'open'}><summary>연결된 소셜 계정 ${auth.identities.length}개</summary>
    <div class="requirement-list">${auth.identities.map(item => `<article class="requirement"><div><span class="status 충족">${escapeHtml(item.label)}</span><div><strong>${escapeHtml(item.email || '이메일 없음')}</strong><small class="muted">${escapeHtml(String(item.linkedAt).slice(0, 10))} 연결</small></div></div></article>`).join('') || '<p class="muted">아직 연결된 소셜 계정이 없습니다.</p>'}</div>
    <div class="actions"><span class="muted">같은 계정에 Google과 카카오를 함께 연결할 수 있습니다.</span><div>${SOCIAL_BUTTONS.filter(([provider]) => !linked.has(provider)).map(([provider, label]) => `<button class="button secondary" data-social="${provider}" data-social-mode="link" ${auth.busy ? 'disabled' : ''}>${label} 계정 연결</button>`).join('') || '<span class="muted">두 공급자가 모두 연결되어 있습니다.</span>'}</div></div></details>`;
}
// ---------- 근거 확인·확인 필요 항목·평가자 검토 ----------
// 서버가 붙여 준 검증 결과를 그대로 보여 준다. 화면이 따로 판정하지 않는다.
const EVIDENCE_KIND_LABELS = { official: '공식 근거', organization: '기관 확인정보', analysis: '분석 결과', proposal: '제안 아이디어' };
const GUARD_KIND_LABELS = {
  amount: '금액', budget: '예산', quota: '건수', headcount: '인원', staff: '인력', facility: '시설',
  achievement: '실적', partner: '협력기관', statistic: '통계', satisfaction: '만족도', survey: '조사',
  period: '기간', law: '법령', research: '연구', quote: '인용'
};

// 근거 없이 들어온 값 목록. 무엇을 확인해야 하는지 그대로 보여 준다.
function guardPanel(guard) {
  if (!guard) return '';
  const claims = guard.claims || [];
  const repetition = guard.repetition || null;
  if (!claims.length && !guard.injectionCount && !repetition?.padded) {
    return '<div class="alert success"><strong>확인이 필요한 값이 발견되지 않았습니다.</strong><p>자료에 없는 숫자·기관·법령이 본문에 들어오지 않았습니다.</p></div>';
  }
  return `<details class="card org-details" id="guard-panel" open>
    <summary><b>확인 필요 항목 ${claims.length}건</b> <small>자료에 없는 값에는 본문에 표시를 붙였습니다</small></summary>
    ${guard.injectionCount ? `<div class="alert warning"><strong>업로드한 자료 안의 명령형 문장 ${guard.injectionCount}건을 자료로만 처리했습니다.</strong><p>문서에 적힌 지시는 시스템 명령으로 실행하지 않습니다.</p></div>` : ''}
    ${repetition?.padded ? `<div class="alert warning"><strong>같은 문장이 ${repetition.repeatedCount}번 반복됩니다.</strong><p>분량을 채우기 위한 반복인지 확인해 주세요.</p></div>` : ''}
    ${claims.length ? `<div class="requirement-list">${claims.map(claim => `<article class="requirement"><div>
      <div><strong>${escapeHtml(claim.value)}</strong> <span class="status 확인-필요">${escapeHtml(GUARD_KIND_LABELS[claim.kind] || claim.kind)}</span> <span class="muted">${escapeHtml(claim.mark || '')}</span></div>
      ${claim.sectionTitle ? `<small class="muted">${escapeHtml(claim.sectionTitle)}</small>` : ''}
      <small class="muted">${escapeHtml(claim.context || '')}</small>
    </div></article>`).join('')}</div>` : ''}
    <p class="muted">확인한 값은 「내 정보 수정」이나 공고문에서 근거를 채운 뒤 다시 만들어 주세요. 서버는 확인되지 않은 값을 확정 사실로 저장하지 않습니다.</p>
  </details>`;
}

// 문장의 근거를 확인하는 표. 네 종류로 갈라 보여 준다.
function evidencePanel(evidence) {
  if (!evidence?.counts) return '';
  const counts = evidence.counts;
  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  if (!total) return '';
  return `<details class="card org-details" id="evidence-panel">
    <summary><b>근거 확인</b> <small>공식 근거 · 기관 확인정보 · 분석 결과 · 제안 아이디어</small></summary>
    <div class="stat-badges">${Object.entries(EVIDENCE_KIND_LABELS).map(([key, label]) => `<span class="stat-badge"><strong>${Number(counts[key] || 0)}</strong><span>${escapeHtml(label)}</span></span>`).join('')}
      <span class="stat-badge"><strong>${evidence.assertable || 0}</strong><span>확인된 사실</span></span>
      <span class="stat-badge"><strong>${evidence.needsCheck || 0}</strong><span>확인 필요</span></span></div>
    <p class="muted">분석 결과와 제안 아이디어는 확인된 사실로 표시하지 않습니다. 확정하려면 담당자가 근거를 확인해야 합니다.</p>
  </details>`;
}

// 평가자 관점 검토. 점수 하나가 아니라 고칠 항목으로 보여 준다.
const REVIEW_TONE = { '치명적 문제': '미충족', '중요 보완': '확인-필요', '권장 개선': '충족' };
function evaluatorPanel(review) {
  if (!review?.findings) return '';
  const groups = ['치명적 문제', '중요 보완', '권장 개선'];
  return `<details class="card org-details" id="evaluator-panel" ${review.submitReady ? '' : 'open'}>
    <summary><b>평가자 관점 검토</b> <small>${escapeHtml(review.verdict || '')}</small></summary>
    <div class="stat-badges">${groups.map(level => `<span class="stat-badge"><strong>${Number(review.counts?.[level] || 0)}</strong><span>${escapeHtml(level)}</span></span>`).join('')}
      <span class="stat-badge"><strong>${review.submitReady ? '○' : '×'}</strong><span>제출 준비</span></span></div>
    ${groups.map(level => {
      const items = review.findings.filter(item => item.severity === level);
      if (!items.length) return '';
      return `<h4>${escapeHtml(level)} ${items.length}건</h4><div class="requirement-list">${items.map(item => `<article class="requirement"><div>
        <div><strong>${escapeHtml(item.area)}</strong> <span class="status ${REVIEW_TONE[level]}">${escapeHtml(level)}</span></div>
        <small class="muted">${escapeHtml(item.finding || item.message || '')}</small>
        <small class="muted">→ ${escapeHtml(item.action || '')}</small>
      </div></article>`).join('')}</div>`;
    }).join('')}
    ${review.finalChecks?.length ? `<h4>제출 전 마지막 확인</h4><ul>${review.finalChecks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    ${review.submitReady ? '' : '<p class="muted">치명적 문제가 남아 있어 제출 준비 완료로 표시하지 않습니다.</p>'}
  </details>`;
}

// ---------- 선정 가능성 진단서 ----------
// 구독회원 기능. 계획서를 쓰지 않고 지원 여부 판단에 필요한 것만 정리한다.
function emptyDiagnosis() {
  return { noticeTitle: '', noticeText: '', organizationText: '', result: null, guard: null, busy: false, error: '', remaining: null };
}
function diagnosisState() { return auth.diagnosis || emptyDiagnosis(); }
function setDiagnosis(patch, extra = {}) { setAuth({ diagnosis: { ...diagnosisState(), ...patch }, ...extra }); }

const JUDGEMENT_TONE = { '지원 권장': '충족', '조건부 지원': '확인-필요', '지원 보류': '확인-필요', '지원 비권장': '미충족' };
const REQUIREMENT_TONE = { 충족: '충족', '부분 충족': '확인-필요', 미충족: '미충족', '확인 필요': '확인-필요' };

function diagnosisView() {
  const view = diagnosisState();
  const info = auth.membership;
  const left = info?.subscription?.remaining?.diagnosis ?? 0;
  const allowed = Boolean(info?.canDiagnosis);
  return `<div class="card">
    <div class="card-title"><div><h3>선정 가능성 진단서</h3><span>공고 요구와 우리 기관 사실을 맞대어 지원 여부를 판단합니다.</span></div>
      <span class="status ${allowed ? '충족' : '확인-필요'}">${allowed ? `남은 ${left}편` : '구독 필요'}</span></div>
    ${auth.error ? `<div class="alert danger"><strong>${escapeHtml(auth.error)}</strong></div>` : ''}
    ${!allowed ? `<div class="alert warning"><strong>${escapeHtml(membershipPlansState()?.pricing?.applyLabel || '월간 구독 신청')} 후에 열립니다.</strong><p>${escapeHtml(membershipPlansState()?.pricing?.billingNote || '')}</p></div>` : ''}
    <div class="field"><label for="diagnosis-title">공고명(선택)</label><input id="diagnosis-title" value="${escapeHtml(view.noticeTitle)}" ${allowed ? '' : 'disabled'}></div>
    <div class="two-col">
      <div class="field"><label for="diagnosis-notice">공고 내용</label><textarea id="diagnosis-notice" class="source-text" placeholder="공고문에서 지원 대상·요건·평가기준 부분을 붙여넣으세요." ${allowed ? '' : 'disabled'}>${escapeHtml(view.noticeText)}</textarea></div>
      <div class="field"><label for="diagnosis-org">신청기관 정보</label><textarea id="diagnosis-org" class="source-text" placeholder="기관 소개·인력·실적·시설을 붙여넣으세요. 「내 정보 수정」에 저장한 값이 있으면 자동으로 채워집니다." ${allowed ? '' : 'disabled'}>${escapeHtml(view.organizationText || memberFactsText())}</textarea></div>
    </div>
    <div class="actions"><span class="muted">확인되지 않은 내용은 지어내지 않고 「확인 필요」로 남깁니다. 성공한 진단서만 1편 차감됩니다.</span>
      <div><button class="button secondary" id="close-diagnosis">계획서 포털로</button>
      <button class="button primary" id="run-diagnosis" ${allowed && !view.busy ? '' : 'disabled'}>${view.busy ? '진단하는 중…' : '진단서 만들기'}</button></div></div>
    ${view.result ? diagnosisResultView(view.result) : ''}
  </div>`;
}

function diagnosisResultView(result) {
  const block = (title, body) => `<h4>${escapeHtml(title)}</h4>${body}`;
  const list = items => `<div class="requirement-list">${items}</div>`;
  return `<div class="card" id="diagnosis-result">
    <div class="card-title"><div><h3>진단 결과</h3><span>적합도 ${result.fitScore}점</span></div>
      <span class="status ${JUDGEMENT_TONE[result.judgement] || '확인-필요'}">${escapeHtml(result.judgement)}</span></div>
    <p class="muted">${escapeHtml(result.fitSummary)}</p>
    ${block('공모기관 요구', list(result.requirements.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.requirement)}</strong> <span class="status ${REQUIREMENT_TONE[item.status] || '확인-필요'}">${escapeHtml(item.status)}</span></div>
      <small class="muted">${escapeHtml(item.evidence)}</small></div></article>`).join('')))}
    ${result.strengths.length ? block('기관 강점', list(result.strengths.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.point)}</strong></div><small class="muted">연결 요구: ${escapeHtml(item.linkedRequirement)}</small></div></article>`).join(''))) : ''}
    ${result.risks.length ? block('탈락 위험', list(result.risks.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.risk)}</strong> <span class="status ${item.severity === '높음' ? '미충족' : '확인-필요'}">${escapeHtml(item.severity)}</span></div>
      <small class="muted">대응: ${escapeHtml(item.mitigation)}</small></div></article>`).join(''))) : ''}
    ${result.missingEvidence.length ? block('부족 증빙', list(result.missingEvidence.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.item)}</strong></div><small class="muted">${escapeHtml(item.why)}</small></div></article>`).join(''))) : ''}
    ${result.questions.length ? block('확인 질문', `<ul>${result.questions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`) : ''}
    ${result.qualificationBlock?.blocked ? `<div class="alert warning"><strong>필수 자격 확인이 먼저입니다.</strong><p>${escapeHtml(result.qualificationBlock.items.join(' · '))}</p></div>` : ''}
    ${block('지원 판단', `<p>${escapeHtml(result.judgementReason)}</p>`)}
    ${guardPanel(diagnosisState().guard)}
  </div>`;
}

function bindDiagnosis() {
  const field = (selector, key) => {
    const el = document.querySelector(selector);
    if (el) el.oninput = () => { auth.diagnosis = { ...diagnosisState(), [key]: el.value }; };
  };
  field('#diagnosis-title', 'noticeTitle');
  field('#diagnosis-notice', 'noticeText');
  field('#diagnosis-org', 'organizationText');
  document.querySelector('#close-diagnosis')?.addEventListener('click', () => setState({ activeTool: 'home', notice: '', error: '' }));
  document.querySelector('#run-diagnosis')?.addEventListener('click', runDiagnosis);
}

async function runDiagnosis() {
  const view = diagnosisState();
  const organizationText = view.organizationText || memberFactsText();
  setDiagnosis({ busy: true }, { error: '', notice: '' });
  try {
    const result = await diagnoseWithAI({ noticeTitle: view.noticeTitle, noticeText: view.noticeText, organizationText });
    setDiagnosis({ busy: false, result: result.diagnosis, guard: result.guard || null, remaining: result.remaining, organizationText });
    // 남은 편수는 서버가 준 값으로 다시 맞춘다.
    if (result.remaining && auth.membership?.subscription) {
      setAuth({ membership: { ...auth.membership, subscription: { ...auth.membership.subscription, remaining: result.remaining } } });
    }
  } catch (error) {
    setDiagnosis({ busy: false }, { error: error.message });
  }
}

// ---------- 회원 안내 ----------
// 랜딩·로그인·계정 설정이 같은 상품표를 쓴다. 가격과 편수가 화면마다 달라지지 않게 서버에서 한 번만 읽는다.
let membershipPlansLoaded = false;
// 상품표 모양을 갖춘 응답만 쓴다. 다른 응답이 섞여 들어와도 화면이 깨지지 않게 한다.
function membershipPlansState() {
  const plans = auth.plans;
  return plans?.pricing && Array.isArray(plans.tiers) ? plans : null;
}

async function loadMembershipPlans() {
  if (membershipPlansLoaded) return;
  membershipPlansLoaded = true;
  const plans = await fetchMembershipPlans().catch(() => null);
  if (plans?.pricing && Array.isArray(plans.tiers)) setAuth({ plans });
}

// 회원 안내는 카드 넷을 나란히 두지 않고 가로 비교표로 보여 준다.
// 좁은 화면에서 칸이 눌리면 한글이 한 글자씩 끊기므로, 표는 자기 상자 안에서만 좌우로 움직인다.
const COMPARE_COLUMNS = [
  // legacy(전체 이용권)는 구독 없이도 편집·저장·출력이 열리는 등급이다. 지금 쓰는 회원 대부분이 여기다.
  // 표에 없으면 본인 권한과 다른 칸이 「지금 내 등급」으로 강조된다.
  ['pending', '승인 대기'], ['member', '승인회원'], ['legacy', '일반회원'], ['subscriber', '구독회원'], ['premium', '수주회원 👑']
];
// 편수·쪽수·가격은 서버 상품표에서 가져온다. 화면에 숫자를 따로 적어 두지 않는다.
// 공개 우수 제안서 편수도 서버 값을 따른다.
function showcaseLimit(plans) { return plans?.showcaseLimit || 5; }
function compareRows(plans) {
  const quota = plans?.quotas?.subscriber || {};
  const core = quota.coreProposal ? `월 ${quota.coreProposal}편` : '월 정해진 편수';
  const pages = quota.maxPages ? `편당 최대 ${quota.maxPages}쪽` : '편당 정해진 쪽수';
  const diagnosis = quota.diagnosis ? `월 ${quota.diagnosis}편` : '월 정해진 편수';
  const price = plans?.pricing?.priceLabel || '구독 신청';
  const freePages = plans?.quotas?.member?.maxPages;
  // 계정당 1회는 주기마다 새로 주어지지 않는다. 「평생 1회」라고 적어야 오해가 없다.
  const freeCore = freePages ? `${freePages}쪽 · 계정당 평생 1회 읽기` : '계정당 평생 1회 읽기';
  return [
    ['승인 상태', { pending: '관리자 승인 대기', member: '승인 완료', legacy: '승인 완료', subscriber: '승인 완료', premium: '정식 수주계약 회원' }],
    ['기관정보', {
      pending: '기관정보 입력·수정', member: '기관정보 관리 · 전체 계획서 작성은 구독 후 활용',
      legacy: '기관정보 관리 · 계획서마다 다시 씀', subscriber: '기관정보 관리 · 계획서마다 다시 씀', premium: '기관정보 관리 · 계획서마다 다시 씀'
    }],
    ['핵심제안서', { pending: '기능 이름만 확인', member: freeCore, legacy: `${core} · ${pages}`, subscriber: `${core} · ${pages}`, premium: '구독회원과 같음' }],
    ['선정 가능성 진단', { pending: '잠금', member: '잠금', legacy: diagnosis, subscriber: diagnosis, premium: diagnosis }],
    ['편집·저장·출력', { pending: '잠금', member: '잠금', legacy: '생성·편집·저장·DOCX·PDF', subscriber: '생성·편집·저장·DOCX·PDF', premium: '생성·편집·저장·DOCX·PDF' }],
    ['공모정보 검색', {
      pending: '메뉴만 보임 · 결과 잠금', member: '현재 모집 중인 공개 공고', legacy: '현재 모집 중인 공개 공고',
      subscriber: '현재 모집 중인 공개 공고', premium: '마감 공고를 포함한 전체 공개 수집 이력'
    }],
    ['전문 전체 계획서', { pending: '잠금', member: '잠금', legacy: '전체 계획서 작성·검증·출력', subscriber: '포함되지 않음', premium: '계약한 전문 전체 사업계획서 작성·검토·수행' }],
    ['이용방법', {
      pending: '실제 자료·AI 생성 잠금', member: '가입 후 관리자 승인', legacy: '관리자가 부여한 전체 이용권 · 결제 없음',
      subscriber: price, premium: `우수 사업제안서 ${showcaseLimit(plans)}편 · 계약 문의`
    }]
  ];
}
// 지금 로그인한 사람의 등급. 강조할 열을 정한다.
function currentTierColumn() {
  const tier = auth.membership?.tier;
  return COMPARE_COLUMNS.some(([id]) => id === tier) ? tier : '';
}

// 일곱 단계의 열림·활동 범위. 화면마다 따로 적지 않고 서버 표 하나를 그대로 그린다.
function memberStepsView() {
  const mine = auth.membership?.tier;
  const role = auth.user?.role;
  const isMine = step => step.key === mine || (step.axis === '역할' && step.key === role);
  return `<div class="requirement-list" id="member-steps">${MEMBER_STEPS.map((step, index) => `<article class="requirement ${isMine(step) ? 'current' : ''}">
    <div><span class="tag">${index + 1}</span><div>
      <strong>${escapeHtml(step.label)}</strong> <span class="muted">${escapeHtml(step.axis)}</span>${isMine(step) ? ' <span class="status 충족">지금 나</span>' : ''}
      <small>열리는 것 · ${escapeHtml(step.open)}</small>
      <small>하는 일 · ${escapeHtml(step.act)}</small>
      <small class="muted">${escapeHtml(step.next)}</small>
    </div></div></article>`).join('')}
    <p class="muted">${escapeHtml(PREMIUM_STEP_NOTE)}</p></div>`;
}

function membershipGuideView({ compact = false } = {}) {
  const plans = membershipPlansState();
  const current = currentTierColumn();
  return `<section class="home-section" id="membership-guide">
    <div class="home-head"><h2>회원 안내</h2><p>${escapeHtml(plans?.pricing?.billingNote || '정기결제는 아직 연결되지 않았습니다. 신청하시면 관리자가 확인 후 열어 드립니다.')}</p></div>
    <div class="compare-scroll" tabindex="0" role="region" aria-label="회원등급 비교표">
      <table class="compare-table">
        <thead><tr><th scope="col" class="compare-head">구분</th>
          ${COMPARE_COLUMNS.map(([id, label]) => `<th scope="col" class="${current === id ? 'compare-current' : ''}">${escapeHtml(label)}${current === id ? '<small>지금 내 등급</small>' : ''}</th>`).join('')}
        </tr></thead>
        <tbody>${compareRows(plans).map(([label, values]) => `<tr><th scope="row" class="compare-head">${escapeHtml(label)}</th>
          ${COMPARE_COLUMNS.map(([id]) => `<td class="${current === id ? 'compare-current' : ''}">${escapeHtml(values[id] || '-')}</td>`).join('')}
        </tr>`).join('')}</tbody>
      </table>
    </div>
    ${memberStepsView()}
    ${compact ? '' : '<p class="muted">운영자·관리자는 고객 회원등급이 아니라 역할입니다. 위 단계표에 함께 적어 두었습니다.</p>'}
  </section>`;
}

// ---------- 계정 설정 이용현황 ----------
function membershipStatusPanel() {
  const info = auth.membership;
  if (!info) return '';
  const subscription = info.subscription || { status: 'none', statusLabel: '구독 없음', remaining: { coreProposal: 0, diagnosis: 0 } };
  const badges = [
    ['승인 상태', info.approvalLabel],
    ['회원등급', info.legacyFull ? `${info.label}(기존 전체 이용권)` : info.label],
    [`무료 ${info.freePages}쪽 제안서`, info.freeUsed ? '사용함' : '사용 전'],
    ['남은 핵심제안서', `${subscription.remaining.coreProposal}편`],
    ['남은 진단서', `${subscription.remaining.diagnosis}편`],
    ['다음 갱신일', subscription.renewsOn || '해당 없음'],
    ['월간 구독', subscription.statusLabel],
    ['수주계약', auth.user?.premium ? `${auth.user.premiumStatusLabel || ''}${auth.contract?.progress ? ` · ${auth.contract.progress}` : ''}` : '없음']
  ];
  const can = [
    ['핵심제안서 생성', info.canCoreProposal],
    ['선정 가능성 진단서', info.canDiagnosis],
    ['편집·재작성', info.canEdit],
    ['저장·DOCX·PDF 출력', info.canExport],
    ['계약 전문 전체 계획서', info.canExpertWork]
  ];
  return `<details class="card org-details" id="membership-status" open><summary><b>내 이용현황</b> <small>회원등급과 남은 이용량</small></summary>
    <div class="stat-badges">${badges.map(([label, value]) => `<span class="stat-badge" title="${escapeHtml(`${label} ${value}`)}"><strong>·</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(String(value))}</small></span>`).join('')}</div>
    <div class="stat-badges">${can.map(([label, ok]) => `<span class="stat-badge"><strong>${ok ? '○' : '×'}</strong><span>${escapeHtml(label)}</span></span>`).join('')}</div>
    ${info.tier === 'member' ? `<p class="muted">${escapeHtml(MEMBER_READ_ONLY_NOTE)}</p>` : ''}
    ${info.tier === 'member' || info.tier === 'pending' ? `<div class="actions"><span class="muted">${escapeHtml(membershipPlansState()?.pricing?.billingNote || '')}</span><button class="button primary" id="apply-subscription">${escapeHtml(membershipPlansState()?.pricing?.applyLabel || '월간 구독 신청')}</button></div>` : ''}
    ${subscriptionRequestView()}
    ${membershipGuideView({ compact: true })}
  </details>`;
}
// 구독 신청서. 결제가 아니라 신청이다. 관리자가 확인한 뒤에 열린다.
function subscriptionRequestView() {
  const view = auth.subRequest || emptySubscriptionRequest();
  const mine = view.mine;
  if (mine && mine.status === 'pending') {
    return `<div class="alert" id="sub-request"><strong>구독 신청서를 접수했습니다 · 검토 중</strong>
      <p>${escapeHtml(mine.orgName)} · ${escapeHtml(mine.contactName)} · 신청일 ${escapeHtml(String(mine.createdAt).slice(0, 10))}</p>
      <p class="muted">${escapeHtml(BILLING_NOTE)}</p></div>`;
  }
  if (mine && mine.status === 'rejected') {
    return `<div class="alert warning" id="sub-request"><strong>지난 신청은 열리지 않았습니다</strong>
      <p>${escapeHtml(mine.decisionNote || '사유가 적혀 있지 않습니다.')}</p>
      <div class="actions"><span class="muted">고쳐서 다시 신청할 수 있습니다.</span>
        <button class="button primary" id="open-sub-request">구독 신청서 다시 쓰기</button></div></div>`;
  }
  if (!view.open) return '';
  const draft = view.draft;
  const field = (key, label, placeholder = '', type = 'text') => `<div class="field">
    <label for="sub-${key}">${escapeHtml(label)}</label>
    <input id="sub-${key}" type="${type}" data-sub-field="${key}" value="${escapeHtml(draft[key] || '')}" placeholder="${escapeHtml(placeholder)}"></div>`;
  return `<div class="card" id="sub-request"><div class="card-title"><div><h3>구독 신청서</h3>
      <span>적어 주시면 관리자가 확인하고 열어 드립니다. 결제는 아직 연결되어 있지 않습니다.</span></div></div>
    <div class="two-col">${field('orgName', '기관명', '예: 사단법인 ○○센터')}${field('contactName', '담당자 이름', '예: 김담당')}</div>
    <div class="two-col">${field('phone', '연락처', '010-0000-0000')}${field('wantedStart', '희망 시작일 (선택)', '2027-01-05', 'date')}</div>
    <div class="two-col">${field('monthlyPlans', '월 예상 사용 편수 (선택)', '예: 2편')}<div class="field"><label>&nbsp;</label><span class="muted">편수는 참고용입니다. 실제 편수는 상품표를 따릅니다.</span></div></div>
    <div class="field"><label for="sub-purpose">무엇에 쓰실지</label>
      <textarea id="sub-purpose" data-sub-field="purpose" class="source-text" style="min-height:70px" placeholder="예: 매달 복지 공모사업 2건을 직접 작성하려고 합니다.">${escapeHtml(draft.purpose || '')}</textarea></div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sub-ack" ${draft.noticeAck ? 'checked' : ''}>
      <span>${escapeHtml(BILLING_NOTE)} 이 내용을 확인했습니다.</span></label>
    <div class="actions"><span class="muted">결제수단은 받지 않습니다. 카드번호를 적는 칸은 없습니다.</span>
      <div><button class="button secondary" id="cancel-sub-request">닫기</button>
        <button class="button primary" id="send-sub-request" ${auth.busy ? 'disabled' : ''}>신청서 보내기</button></div></div>
  </div>`;
}

const MEMBER_READ_ONLY_NOTE = '승인회원의 핵심제안서는 읽기 전용입니다. 편집·재작성·저장·DOCX·PDF·ZIP 출력은 월간 구독 신청 후에 열립니다.';

// ---------- 승인 대기 잠금 ----------
// 이름만 보여 주고 아무 요청도 보내지 않는다. 누르면 잠금 안내만 뜬다.
const LOCKED_FEATURES = [
  ['공고 준비·공고 분석', '공식 공고 가져오기와 공고문 분석'],
  ['신청기관 정보', '기관정보 등록과 공고 적합성 비교'],
  ['핵심제안서', '개인화된 5쪽 제안서 만들기'],
  ['선정 가능성 진단서', '적합도와 탈락 위험 확인'],
  ['전체 사업계획서', '설계·작성·검증·제출본'],
  ['공고보관함·계획서보관함', '보관한 공고와 계획서 열기']
];

function lockedFeatureList() {
  return `<div class="card"><div class="card-title"><div><h3>이용할 수 있는 기능</h3><span>승인 후 열립니다</span></div>
      <span class="status 확인-필요">승인 대기</span></div>
    <p class="muted">지금은 기능 이름만 보실 수 있습니다. 누르셔도 자료를 불러오거나 AI를 부르지 않습니다.</p>
    <div class="requirement-list">${LOCKED_FEATURES.map(([name, detail]) => `<article class="requirement"><div>
      <div><strong>${escapeHtml(name)}</strong> <span class="status 확인-필요">잠김</span></div>
      <small class="muted">${escapeHtml(detail)}</small>
    </div><button class="button secondary" data-locked-feature="${escapeHtml(name)}">열어 보기</button></article>`).join('')}</div>
    ${auth.lockedNotice ? `<div class="alert warning"><strong>${escapeHtml(auth.lockedNotice)}</strong></div>` : ''}
    <p class="muted">본인·기관정보는 지금도 입력하고 고칠 수 있습니다. 아래 「내 정보 수정」을 이용해 주세요.</p>
  </div>`;
}

function bindMembership() {
  document.querySelectorAll('[data-locked-feature]').forEach(el => el.onclick = () => {
    // 잠금 안내만 띄운다. 서버를 부르지 않는다.
    setAuth({ lockedNotice: `${el.dataset.lockedFeature}은(는) 관리자 승인 후에 열립니다. 승인 전에는 자료를 불러오지 않습니다.` });
  });
  // 구독 신청서. 문구만 띄우지 않고 실제로 적어 보낼 자리를 연다.
  document.querySelector('#apply-subscription')?.addEventListener('click', () => openSubscriptionRequest());
  document.querySelector('#open-sub-request')?.addEventListener('click', () => openSubscriptionRequest());
  document.querySelector('#cancel-sub-request')?.addEventListener('click', () => setAuth({ subRequest: { ...(auth.subRequest || emptySubscriptionRequest()), open: false } }));
  document.querySelectorAll('[data-sub-field]').forEach(el => el.oninput = () => {
    const view = auth.subRequest || emptySubscriptionRequest();
    view.draft = { ...view.draft, [el.dataset.subField]: el.value };
    auth.subRequest = view;
  });
  document.querySelector('#sub-ack')?.addEventListener('change', event => {
    const view = auth.subRequest || emptySubscriptionRequest();
    view.draft = { ...view.draft, noticeAck: event.target.checked };
    auth.subRequest = view;
  });
  document.querySelector('#send-sub-request')?.addEventListener('click', () => void sendSubscriptionRequest());
  document.querySelectorAll('[data-open-membership]').forEach(el => el.onclick = () => {
    document.querySelector('#membership-guide')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---------- 내 정보 수정 (모든 회원) ----------
// 승인 대기·승인·수주 회원 모두 자기 정보를 직접 고친다.
// 역할·승인·이용권·수주계약 상태·사용량은 이 폼에 없다. 서버도 그 항목은 받지 않는다.
const MEMBER_FIELDS = [
  ['name', '담당자 이름', 'input'], ['phone', '연락처', 'input'], ['orgName', '기관명', 'input'],
  ['orgType', '기관 유형', 'input'], ['orgAddress', '기관 주소', 'input'], ['orgIntro', '기관 소개', 'area'],
  ['staff', '보유 인력', 'area'], ['facilities', '시설과 장비', 'area'], ['programs', '주요 프로그램', 'area'],
  ['achievements', '사업 실적', 'area'], ['partners', '협력기관', 'area'],
  ['reuseNote', '계획서 작성에 재사용할 기관정보', 'area']
];
const LOCKED_NOTE = '역할·승인 상태·이용권·수주계약 상태·사용량·감사기록은 본인이 바꿀 수 없습니다. 로그인 이메일도 확인 절차가 준비되기 전까지는 바꿀 수 없습니다.';

function memberProfileValue(key) {
  const draft = auth.memberDraft || {};
  if (draft[key] !== undefined) return draft[key];
  return (auth.memberProfile || {})[key] || '';
}

function memberProfileForm() {
  const changed = MEMBER_FIELDS.some(([key]) => memberProfileValue(key) !== ((auth.memberProfile || {})[key] || ''));
  return `<details class="card org-details" id="member-profile" ${auth.memberOpen ? 'open' : ''}>
    <summary><b>내 정보 수정</b> <small>담당자·기관정보를 직접 고칩니다. 계획서 작성에 다시 씁니다.</small></summary>
    ${auth.profileUpdatedAt ? `<p class="muted">마지막 변경 ${escapeHtml(String(auth.profileUpdatedAt).slice(0, 16).replace('T', ' '))}${auth.profileReviewNeeded ? ' · 관리자 확인 요청 중' : ''}</p>` : ''}
    <div class="two-col">${MEMBER_FIELDS.map(([key, label, kind]) => `<div class="field"><label for="member-${key}">${escapeHtml(label)}</label>${
      kind === 'area'
        ? `<textarea id="member-${key}" class="source-text" data-member-field="${key}" rows="3">${escapeHtml(memberProfileValue(key))}</textarea>`
        : `<input id="member-${key}" data-member-field="${key}" value="${escapeHtml(memberProfileValue(key))}">`
    }</div>`).join('')}</div>
    <p class="muted">${escapeHtml(LOCKED_NOTE)}</p>
    <div class="actions"><span class="muted">${changed ? '저장하지 않은 변경이 있습니다.' : '변경 내용이 없습니다.'}</span>
      <div><button class="button secondary" id="member-reset" ${auth.busy ? 'disabled' : ''}>되돌리기</button>
      <button class="button primary" id="member-save" ${auth.busy || !changed ? 'disabled' : ''}>내 정보 저장</button></div></div>
    <p class="muted">저장하면 이후 만드는 진단서·핵심제안서·전체 계획서가 이 정보를 씁니다. <b>이미 저장된 계획서는 자동으로 바뀌지 않습니다.</b> 기존 계획서에 반영하려면 그 계획서에서 다시 반영해 주세요.</p>
  </details>`;
}

function bindMemberProfile() {
  document.querySelectorAll('[data-member-field]').forEach(el => el.oninput = () => {
    auth.memberDraft = { ...(auth.memberDraft || {}), [el.dataset.memberField]: el.value };
  });
  document.querySelector('#privacy-agree')?.addEventListener('click', () => void agreePrivacyNotice());
  document.querySelector('#claim-archive')?.addEventListener('click', () => void claimArchiveToAccount());
  document.querySelector('#member-reset')?.addEventListener('click', () => setAuth({ memberDraft: {}, memberOpen: true, notice: '', error: '' }));
  document.querySelector('#member-save')?.addEventListener('click', saveMemberProfile);
  document.querySelectorAll('[data-transfer-identity]').forEach(el => el.onclick = () => void runIdentityTransfer(el.dataset.transferIdentity));
  document.querySelector('#member-profile')?.addEventListener('toggle', event => { auth.memberOpen = event.target.open; });
}

async function saveMemberProfile() {
  const value = Object.fromEntries(MEMBER_FIELDS.map(([key]) => [key, memberProfileValue(key)]));
  setAuth({ busy: true, error: '', notice: '' });
  const result = await saveMemberInfo(value).catch(error => ({ ok: false, error: error.message }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '내 정보를 저장하지 못했습니다.', memberOpen: true });
  await loadAccount();
  setAuth({
    busy: false, memberDraft: {}, memberOpen: true,
    notice: result.changed?.length ? `내 정보를 저장했습니다. 변경 항목: ${result.changed.join('·')}` : '바뀐 항목이 없습니다.'
  });
}

// 신청서를 연다. 이미 낸 것이 있으면 그 상태를 먼저 읽는다.
async function openSubscriptionRequest() {
  const view = auth.subRequest || emptySubscriptionRequest();
  const profile = auth.memberProfile || {};
  setAuth({ subRequest: { ...view, open: true, draft: {
    ...view.draft,
    orgName: view.draft.orgName || profile.orgName || auth.user?.orgName || '',
    contactName: view.draft.contactName || profile.name || auth.user?.name || '',
    phone: view.draft.phone || profile.phone || auth.user?.phone || ''
  } }, notice: '', error: '' });
  if (view.loaded) return;
  const result = await mySubscriptionRequest().catch(() => null);
  if (result) setAuth({ subRequest: { ...(auth.subRequest || view), loaded: true, mine: result.request || null } });
}

async function sendSubscriptionRequest() {
  const view = auth.subRequest || emptySubscriptionRequest();
  // 화면과 서버가 같은 규칙을 본다. 못 낼 신청서를 보내 400을 받게 두지 않는다.
  const checked = validateRequest(view.draft);
  if (!checked.ok) return setAuth({ error: checked.errors.join(' '), notice: '' });
  setAuth({ busy: true, error: '', notice: '' });
  const result = await submitSubscriptionRequest(view.draft).catch(() => ({ error: '신청서를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.' }));
  if (result?.error) return setAuth({ busy: false, error: result.error });
  setAuth({ busy: false, subRequest: { ...view, open: false, loaded: true, mine: result.request || null },
    notice: '구독 신청서를 보냈습니다. 관리자가 확인한 뒤 열어 드립니다.' });
}

// ---------- 수주회원(왕관) 화면 ----------
const PREMIUM_TABS = [['showcase', '우수 사업제안서'], ['history', '공고 수집 이력'], ['contract', '내 계약·진행상태']];
const HISTORY_STATES = [['', '전체'], ['open', '모집 중'], ['closing', '마감 임박'], ['closed', '마감'], ['unknown', '마감일 확인 필요']];

function emptyPremium() {
  return { loaded: false, status: null, showcase: [], openShowcase: '', history: null, tab: 'showcase', query: '', mode: 'focused', filters: {} };
}

function premiumState() { return auth.premium || emptyPremium(); }
function setPremium(patch, extra = {}) { setAuth({ premium: { ...premiumState(), ...patch }, ...extra }); }

function premiumView() {
  const view = premiumState();
  const contract = view.status?.contract || null;
  return `<div class="card">
    <div class="card-title"><div><h3>수주회원 👑</h3><span>계약한 전체 공모사업계획서 작업공간과 전용 자료</span></div>
      <span class="status ${contract?.canStartWork ? '충족' : '확인-필요'}">${escapeHtml(contract?.statusLabel || (view.status?.premium ? '계약 확인 중' : '계약 없음'))}</span></div>
    ${auth.error ? `<div class="alert danger"><strong>${escapeHtml(auth.error)}</strong></div>` : ''}
    ${auth.notice ? `<div class="alert success"><strong>${escapeHtml(auth.notice)}</strong></div>` : ''}
    ${contract && !contract.canStartWork ? '<div class="alert warning"><strong>계약이 진행 중이 아닙니다.</strong><p>이미 전달된 결과물은 그대로 보실 수 있지만 새로운 전문 작업은 시작할 수 없습니다.</p></div>' : ''}
    <div class="actions"><div>${PREMIUM_TABS.map(([id, label]) => `<button class="button ${view.tab === id ? 'primary' : 'secondary'}" data-premium-tab="${id}">${escapeHtml(label)}</button>`).join('')}</div>
      <button class="button secondary" id="close-premium">계획서 포털로</button></div>
    ${view.tab === 'showcase' ? premiumShowcasePanel(view) : ''}
    ${view.tab === 'history' ? premiumHistoryPanel(view) : ''}
    ${view.tab === 'contract' ? premiumContractPanel(contract) : ''}
  </div>`;
}

function premiumShowcasePanel(view) {
  if (!view.showcase.length) return '<p class="muted">공개된 우수 사업제안서가 아직 없습니다. 관리자가 공개로 승인한 제안서만 여기에 올라옵니다.</p>';
  return `<p class="muted">관리자가 공개용으로 승인한 사본 ${view.showcase.length}편입니다. 실제 고객의 계획서 원본과 개인정보는 담겨 있지 않으며 화면에서만 볼 수 있습니다.</p>
    <div class="requirement-list">${view.showcase.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.title)}</strong> <span class="status 충족">${escapeHtml(item.field)}</span></div>
      <small class="muted">${escapeHtml([item.purpose, item.audience].filter(Boolean).join(' · ')) || '요약 없음'}</small>
      ${view.openShowcase === item.id ? `<div class="showcase-body">
        ${[['제안 목적', item.purpose], ['대상', item.audience], ['핵심 사업구조', item.structure], ['성과설계 방식', item.outcomeDesign], ['공개 가능한 범위의 본문', item.body]]
          .filter(([, value]) => value).map(([label, value]) => `<h4>${escapeHtml(label)}</h4><p>${escapeHtml(value).replace(/\n/g, '<br>')}</p>`).join('')}
        <p class="muted">원본 파일 내려받기는 제공하지 않습니다.</p></div>` : ''}
      </div><button class="button secondary" data-showcase-open="${escapeHtml(item.id)}">${view.openShowcase === item.id ? '접기' : '열람'}</button></article>`).join('')}</div>`;
}

function premiumHistoryPanel(view) {
  const history = view.history;
  return `<div class="archive-toolbar">
      <input id="premium-history-query" value="${escapeHtml(view.query)}" placeholder="사업명·기관명·키워드 검색 후 Enter">
      <button class="button ${view.mode === 'focused' ? 'primary' : 'secondary'}" data-premium-mode="focused">맞춤검색</button>
      <button class="button ${view.mode === 'broad' ? 'primary' : 'secondary'}" data-premium-mode="broad">광역검색</button>
      <button class="button secondary" id="premium-history-search" ${auth.busy ? 'disabled' : ''}>이력 검색</button></div>
    <div class="archive-filters">
      <label class="archive-filter"><span>진행 상태</span><select data-premium-filter="state">${HISTORY_STATES.map(([value, label]) => `<option value="${value}" ${view.filters.state === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
      ${['region', 'audience', 'field'].map(key => `<label class="archive-filter"><span>${escapeHtml({ region: '지역', audience: '대상', field: '분야' }[key])}</span><select data-premium-filter="${key}"><option value="">전체</option>${(history?.facets?.[key] || []).map(item => `<option value="${escapeHtml(item.value)}" ${view.filters[key] === item.value ? 'selected' : ''}>${escapeHtml(item.value)} (${item.count})</option>`).join('')}</select></label>`).join('')}
      <label class="archive-filter"><span>수집 출처</span><input data-premium-filter="organizer" value="${escapeHtml(view.filters.organizer || '')}" placeholder="예: 광주지회"></label>
    </div>
    ${history ? `<p class="muted">${escapeHtml(history.modeLabel)} · ${history.total}건${history.total > history.notices.length ? ` (앞 ${history.notices.length}건 표시)` : ''}. 읽기 전용이며 공개 여부나 수집 설정은 바꿀 수 없습니다.</p>
      <div class="requirement-list">${history.notices.map(item => `<article class="requirement"><div>
        <div><strong>${escapeHtml(item.title)}</strong> <span class="status ${item.state === 'closed' ? '확인-필요' : '충족'}">${escapeHtml(item.stateLabel)}</span></div>
        <small class="muted">${escapeHtml([item.organizer, item.applicationPeriod || item.deadline, item.supportAmount].filter(Boolean).join(' · '))}</small>
        <small class="muted">수집 출처 ${escapeHtml(item.sourceLabel || item.source)} · 최초 수집 ${escapeHtml(String(item.collectedAt).slice(0, 10))} · 마지막 확인 ${escapeHtml(String(item.lastCheckedAt).slice(0, 10))}${item.matchedBy ? ` · ${escapeHtml(item.matchedBy)}` : ''}</small>
        <p class="muted">${escapeHtml(item.summary || '요약 없음')}</p>
        ${item.sourceUrl ? `<small><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">원문 출처</a></small>` : ''}
      </div></article>`).join('') || '<p class="muted">조건에 맞는 공고가 없습니다.</p>'}</div>`
    : '<p class="muted">검색어 없이 「이력 검색」을 누르면 최근 수집분부터 보여 줍니다.</p>'}`;
}

function premiumContractPanel(contract) {
  if (!contract) return '<p class="muted">등록된 계약이 없습니다. 계약 문의로 연락해 주세요.</p>';
  const rows = [
    ['계약명', contract.contractName || '미입력'], ['계약 상태', contract.statusLabel],
    ['시작일', contract.startedOn || '미입력'], ['종료일', contract.endsOn || '미입력'],
    ['작업 진행상태', contract.progress], ['진행 메모', contract.progressNote || '없음'],
    ['새 전문 작업', contract.canStartWork ? '시작할 수 있습니다' : '계약 기간이 아니어서 시작할 수 없습니다']
  ];
  return `<div class="stat-badges">${rows.slice(0, 4).map(([label, value]) => `<span class="stat-badge"><strong>·</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(value)}</small></span>`).join('')}</div>
    <div class="requirement-list">${rows.map(([label, value]) => `<article class="requirement"><div><strong>${escapeHtml(label)}</strong><small class="muted">${escapeHtml(value)}</small></div></article>`).join('')}</div>
    <p class="muted">진행상태는 마인드스토리 담당자가 갱신합니다. 계약이 끝나도 이미 전달된 결과물은 계속 보실 수 있습니다.</p>`;
}

function bindPremium() {
  document.querySelectorAll('[data-premium-tab]').forEach(el => el.onclick = () => {
    const tab = el.dataset.premiumTab;
    setPremium({ tab });
    if (tab === 'history' && !premiumState().history) void runPremiumHistory();
  });
  document.querySelectorAll('[data-showcase-open]').forEach(el => el.onclick = () => {
    setPremium({ openShowcase: premiumState().openShowcase === el.dataset.showcaseOpen ? '' : el.dataset.showcaseOpen });
  });
  document.querySelectorAll('[data-premium-mode]').forEach(el => el.onclick = () => { setPremium({ mode: el.dataset.premiumMode }); void runPremiumHistory(); });
  document.querySelectorAll('[data-premium-filter]').forEach(el => {
    const apply = () => { setPremium({ filters: { ...premiumState().filters, [el.dataset.premiumFilter]: el.value } }); void runPremiumHistory(); };
    if (el.tagName === 'SELECT') el.onchange = apply; else el.onchange = apply;
  });
  const query = document.querySelector('#premium-history-query');
  if (query) {
    query.oninput = () => { auth.premium = { ...premiumState(), query: query.value }; };
    query.onkeydown = event => { if (event.key === 'Enter') void runPremiumHistory(); };
  }
  document.querySelector('#premium-history-search')?.addEventListener('click', () => void runPremiumHistory());
  document.querySelector('#close-premium')?.addEventListener('click', () => setState({ activeTool: 'home', notice: '', error: '' }));
}

async function loadPremium() {
  const view = premiumState();
  if (view.loaded) return;
  setPremium({ loaded: true });
  const status = await premiumStatus().catch(() => null);
  const showcase = await premiumShowcase().catch(() => ({ proposals: [] }));
  setPremium({ status, showcase: showcase.proposals || [] });
}

async function runPremiumHistory() {
  const view = premiumState();
  setAuth({ busy: true, error: '' });
  try {
    const history = await premiumNoticeHistory(view.query, view.mode, view.filters);
    setPremium({ history }, { busy: false });
  } catch (error) { setAuth({ busy: false, error: error.message }); }
}

// ---------- 관리자 화면 ----------
const ROLE_LABELS = { admin: roleLabel('admin'), operator: roleLabel('operator'), agency: roleLabel('agency'), customer: roleLabel('customer') };
const STATUS_LABELS = { active: '이용 중', pending: '승인 대기', disabled: '중지' };
const ADMIN_DONE = {
  approve: '계정을 승인했습니다. 이제 작업 화면을 쓸 수 있습니다.', disable: '계정 사용을 중지하고 로그인 상태를 해제했습니다.',
  delete: '계정과 연결된 소셜 계정을 지웠습니다.',
  operator: '운영관리자로 지정했습니다. 쓰던 세션을 끊었으니 다시 로그인해야 합니다.',
  customer: '운영관리자 권한을 해제했습니다. 쓰던 세션을 끊었으니 다시 로그인해야 합니다.',
  full: '전체 이용권을 부여했습니다. 다시 로그인하지 않아도 곧바로 반영됩니다.',
  trial: '전체 이용권을 회수했습니다. 이 계정은 핵심제안서 무료 생성 화면만 쓰게 됩니다.'
};
const PLAN_LABELS = { full: '전체 이용권', trial: '무료 체험' };

function openAdmin(tab = 'accounts') {
  auth = { ...auth, error: '', notice: '', confirmDelete: '', adminTab: tab, notices: emptyAdminNotices(), collection: emptyCollection(), access: emptyAccess() };
  setState({ activeTool: 'admin', notice: '', error: '' });
  void loadAccounts();
}
// 관리자 공모정보 관리 자료. 공개 여부와 상관없이 모아 둔 자료 전체를 본다.
function emptyAdminNotices() { return { loaded: false, list: [], total: 0, collected: 0, hidden: 0, duplicates: 0, query: '', queryDraft: '' }; }
// 공고 자동수집 상태판. 관리자와 운영관리자가 같은 자료를 본다.
function emptyCollection() { return { loaded: false, state: null, runs: [], archive: null, sources: [], searchable: false, collectHealthy: false }; }
async function loadCollection() {
  const call = isAdmin() ? adminNoticeCollection : operatorNoticeCollection;
  const result = await call().catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ error: result.error || '자동수집 상태를 불러오지 못했습니다.', collection: { ...collectionState(), loaded: true } });
  setAuth({ collection: { loaded: true, state: result.state, runs: result.runs || [], archive: result.archive, sources: result.sources || [], searchable: Boolean(result.searchable), collectHealthy: Boolean(result.collectHealthy) } });
}
// 수동 재수집은 관리자만. 이미 돌고 있으면 서버가 409로 막는다.
async function runCollectionNow() {
  if (auth.busy || !isAdmin()) return;
  setAuth({ busy: true, error: '', notice: '' });
  const result = await adminRunNoticeCollection().catch(() => ({ ok: false }));
  if (!result.ok) {
    return setAuth({
      busy: false, error: result.error || '재수집을 실행하지 못했습니다.',
      collection: result.state ? { loaded: true, state: result.state, runs: result.runs || [], archive: result.archive, searchable: Boolean(result.searchable), collectHealthy: Boolean(result.collectHealthy) } : collectionState()
    });
  }
  const run = result.run || {};
  setAuth({
    busy: false,
    notice: `재수집 ${statusLabel(run.status)} · 발급 ${run.collected || 0}건 · 신규 ${run.inserted || 0}건 · 갱신 ${run.updated || 0}건`,
    collection: { loaded: true, state: result.state, runs: result.runs || [], archive: result.archive, sources: result.sources || [], searchable: Boolean(result.searchable), collectHealthy: Boolean(result.collectHealthy) }
  });
}
const collectionState = () => auth.collection || emptyCollection();
const runStamp = value => (value ? String(value).slice(0, 16).replace('T', ' ') : '기록 없음');


// 수집 출처 제어. 사업 유형과 다른 축이라 따로 보여 준다.
// 미연동 출처는 왜 못 켜는지 함께 적는다. 켜 두면 매번 실패로 쌓이기 때문이다.
const SOURCE_BLOCK_LABELS = {
  'not-connected': '미연동 · 공식 경로 확인 필요', disabled: '중지함', 'missing-secret': '인증키 미등록', unknown: '알 수 없음'
};
async function toggleNoticeSource(sourceId, enabled) {
  if (auth.busy) return;
  setAuth({ busy: true, error: '', notice: '' });
  const result = await adminSetNoticeSource(sourceId, enabled).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '출처 설정을 바꾸지 못했습니다.' });
  setAuth({
    busy: false, notice: enabled ? '이 출처를 다음 수집부터 사용합니다.' : '이 출처를 중지했습니다. 기존 공고는 그대로 남습니다.',
    collection: { loaded: true, state: result.state, runs: result.runs || [], archive: result.archive, sources: result.sources || [], searchable: Boolean(result.searchable), collectHealthy: Boolean(result.collectHealthy) }
  });
}

function sourcePanel({ readOnly = false } = {}) {
  const list = collectionState().sources || [];
  if (!list.length) return '';
  const last = (collectionState().runs || [])[0];
  const statusOf = id => (last?.sources || []).find(item => item.source === id);
  return `<h4>수집 출처 ${list.length}곳</h4>
    <p class="muted">사업 유형(${BUSINESS_TYPES.map(type => escapeHtml(type.label)).join(' · ')})과 별개로 관리합니다. 한 곳이 멈춰도 나머지는 계속 모읍니다.</p>
    <div class="requirement-list">${SOURCE_GROUPS.map(group => {
      const members = list.filter(item => item.group === group.key);
      if (!members.length) return '';
      return `<article class="requirement"><div>
        <div><strong>${escapeHtml(group.label)}</strong> <span class="tag">${escapeHtml(BUSINESS_TYPES.find(type => type.key === group.businessType)?.label || '')}</span></div>
        ${members.map(item => {
          const run = statusOf(item.id);
          const skips = Object.entries(run?.skipped || {}).map(([key, count]) => `${FITNESS_LABELS[key] || key} ${count}`).join(', ');
          return `<div style="margin-top:6px">
            <div><span class="status ${item.blocked ? '확인-필요' : run?.status === 'failed' ? '부족' : '충족'}">${item.blocked ? escapeHtml(SOURCE_BLOCK_LABELS[item.blocked] || item.blocked) : run?.status === 'failed' ? '실패' : '사용 중'}</span> ${escapeHtml(item.label)}</div>
            <small class="muted">${escapeHtml(`${item.kind === 'open-api' ? '공식 API' : item.kind === 'blocked' ? '연결 안 됨' : '공식 게시판'} · ${item.origin}`)}</small>
            ${run ? `<small class="muted">최근 실행: 조회 ${run.listed} · 후보 ${run.candidates} · 발급 ${run.collected}${skips ? ` · 제외 [${escapeHtml(skips)}]` : ''}${run.reason ? ` · ${escapeHtml(run.reason)}` : ''}</small>` : ''}
            ${item.note ? `<small class="muted">${escapeHtml(item.note)}</small>` : ''}
            ${readOnly || item.blocked === 'not-connected' ? '' : `<button class="button secondary" data-source-toggle="${escapeHtml(item.id)}" data-source-next="${item.enabled ? '' : '1'}" ${auth.busy ? 'disabled' : ''}>${item.enabled ? '중지' : '사용'}</button>`}
          </div>`;
        }).join('')}
      </div></article>`;
    }).join('')}</div>
    ${readOnly ? '<p class="muted">출처 사용·중지는 최고관리자만 바꿉니다.</p>' : ''}`;
}

// 상태판. 「공고 검색이 되는 것」과 「최신 공고가 들어오는 것」을 따로 보여 준다.
function collectionPanel({ readOnly = false } = {}) {
  const view = collectionState();
  const state = view.state;
  const archive = view.archive;
  const last = view.runs[0];
  if (!view.loaded) return '<div class="card-title" style="margin-top:18px"><div><h4>공고 자동수집</h4><span>상태를 불러오는 중입니다.</span></div></div>';
  const failing = Number(state?.consecutiveFailures || 0);
  const warning = last?.warning || '';
  return `<div class="card-title" style="margin-top:18px"><div><h4>공고 자동수집</h4>
      <span>한국시간 08:00·18:00 자동 실행 · 사랑의열매 중앙회·광주지회 공식 출처만 조회합니다.</span></div>
      <span class="status ${view.collectHealthy ? '충족' : failing ? '부족' : '확인-필요'}">${view.collectHealthy ? '정상' : failing ? `연속 실패 ${failing}회` : '확인 필요'}</span></div>
    ${failing ? `<div class="alert danger"><strong>자동수집이 ${failing}회 연속 실패했습니다.</strong><p>실패 코드 ${escapeHtml(state.lastFailureCode || '')}${codeLabel(state?.lastFailureCode) ? ` · ${escapeHtml(codeLabel(state.lastFailureCode))}` : ''}. 기존 공모정보는 지우지 않고 그대로 두었습니다.</p></div>` : ''}
    ${warning ? `<div class="alert warning"><strong>${warning === 'drop' ? '수집량 급감' : '수집 0건'}</strong><p>${escapeHtml(warningLabel(warning))}</p></div>` : ''}
    <div class="stat-badges">
      <span class="stat-badge" title="자동·수동을 가리지 않은 마지막 실행 시각"><strong>${runStamp(state?.lastRunAt)}</strong><span>마지막 실행</span></span>
      <span class="stat-badge" title="일부 실패·0건은 성공으로 세지 않습니다"><strong>${runStamp(state?.lastSuccessAt)}</strong><span>마지막 정상 성공</span></span>
      <span class="stat-badge" title="검색 자료에 새 공고가 마지막으로 들어온 날"><strong>${runStamp(archive?.lastNewNoticeAt)}</strong><span>마지막 신규 유입</span></span>
      <span class="stat-badge" title="검색 가능한 공모정보 수. 수집 성공과는 별개 상태입니다"><strong>${archive?.total ?? 0}</strong><span>검색 자료</span></span>
    </div>
    ${last ? `<div class="summary-grid">
      <div><span>마지막 실행 상태</span><strong>${escapeHtml(statusLabel(last.status))}${last.trigger === 'manual' ? ' (수동)' : ''}</strong></div>
      <div><span>조회 / 발급</span><strong>${last.listed} / ${last.collected}건</strong></div>
      <div><span>신규 / 갱신</span><strong>${last.inserted} / ${last.updated}건</strong></div>
      <div><span>보관함 반영</span><strong>${last.synced ? '반영함' : '반영 안 함'}</strong></div>
    </div>
    <div class="requirement-list">${(last.sources || []).map(source => `<article class="requirement"><div>
      <div><strong>${escapeHtml(source.label)}</strong> <span class="status ${source.status === 'ok' ? '충족' : '부족'}">${source.status === 'ok' ? '성공' : `실패 ${escapeHtml(source.code)}`}</span></div>
      <small class="muted">${escapeHtml(`조회 ${source.listed}건 · 공모 후보 ${source.candidates}건 · 발급 ${source.collected}건${source.status === 'ok' ? '' : ` · ${codeLabel(source.code)}`}`)}</small>
    </div></article>`).join('')}</div>` : '<p class="muted">아직 실행 기록이 없습니다.</p>'}
    ${sourcePanel({ readOnly })}
    <h4>최근 실행</h4>
    <div class="requirement-list">${view.runs.map(run => `<article class="requirement"><div>
      <div><strong>${runStamp(run.startedAt)}</strong> <span class="status ${run.status === 'ok' ? '충족' : run.status === 'failed' ? '부족' : '확인-필요'}">${escapeHtml(statusLabel(run.status))}</span> <span class="tag">${run.trigger === 'manual' ? '수동' : '자동'}</span></div>
      <small class="muted">${escapeHtml(`조회 ${run.listed} · 발급 ${run.collected} · 신규 ${run.inserted} · 갱신 ${run.updated} · 그대로 ${run.unchanged}${run.failureCode ? ` · 실패 ${run.failureCode}` : ''}${run.warning ? ` · 경고 ${run.warning}` : ''}`)}</small>
    </div></article>`).join('') || '<p class="muted">기록이 없습니다.</p>'}</div>
    <div class="actions"><span class="muted">${readOnly ? '운영관리자는 상태를 보기만 합니다. 재수집은 관리자만 실행합니다.' : '재수집은 자동 실행과 같은 잠금을 씁니다. 겹치면 실행되지 않습니다.'}</span>
      <div><button class="button secondary" id="collection-reload" ${auth.busy ? 'disabled' : ''}>상태 새로고침</button>${readOnly ? '' : `<button class="button primary" id="collection-run" ${auth.busy || state?.runningSince ? 'disabled' : ''}>${state?.runningSince ? '수집 진행 중' : '지금 재수집'}</button>`}</div></div>`;
}

async function loadAdminNotices(query = auth.notices.query) {
  const result = await listCollectedNotices(query).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ error: result.error || '공모정보를 불러오지 못했습니다.', notices: { ...auth.notices, loaded: true } });
  setAuth({ notices: { ...auth.notices, loaded: true, query, list: result.notices || [], total: result.total || 0, collected: result.collected || 0, hidden: result.hidden || 0, duplicates: result.duplicates || 0 } });
}
async function toggleNoticePublic(key, isPublic) {
  if (auth.busy) return;
  setAuth({ busy: true, error: '', notice: '' });
  const result = await setNoticePublic(key, isPublic, auth.notices.query).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '공개 여부를 바꾸지 못했습니다.' });
  setAuth({
    busy: false, notice: isPublic ? '이 공모정보를 비회원에게 공개했습니다.' : '이 공모정보를 비공개로 바꿨습니다.',
    notices: { ...auth.notices, list: result.notices || auth.notices.list, total: result.total ?? auth.notices.total, collected: result.collected ?? auth.notices.collected, hidden: result.hidden ?? auth.notices.hidden, duplicates: result.duplicates ?? auth.notices.duplicates }
  });
}


// ---------- 권한 관리 (최고관리자) ----------
// 화면에서 메뉴만 숨기지 않는다. 여기서 지정한 값을 서버가 요청마다 다시 본다.
const SCOPE_LABELS = { members: '회원·기관정보', proposals: '계획서', applicants: '신청기관 자료', assets: '사업 아이디어·활용자산', usage: 'AI 사용량·비용', contracts: '구독·계약' };
const ABILITY_LABELS = { view: '목록 열람', viewContent: '원문 열람', edit: '수정', download: '내려받기', manage: '회원관리', progress: '진행관리' };
function emptyAccess() { return { loaded: false, subjects: [], grants: [], accessLog: [], subjectId: '', draft: newGrantDraft(), usage: null }; }
function newGrantDraft() {
  return { scope: 'proposals', targetKind: 'all', targetId: '', startsOn: '', endsOn: '', note: '', abilities: { view: true, viewContent: false, edit: false, download: false, manage: false, progress: false } };
}
const accessState = () => auth.access || emptyAccess();

async function loadAccess(subjectId = accessState().subjectId) {
  const result = await adminAccessOverview(subjectId).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ error: result.error || '권한 정보를 불러오지 못했습니다.', access: { ...accessState(), loaded: true } });
  setAuth({ access: { ...accessState(), loaded: true, subjectId, subjects: result.subjects || [], grants: result.grants || [], accessLog: result.accessLog || [] } });
}
async function loadMemberUsage() {
  const result = await adminMemberUsage().catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ error: result.error || '이용현황을 불러오지 못했습니다.' });
  setAuth({ access: { ...accessState(), loaded: true, usage: result } });
}
async function submitGrant() {
  const view = accessState();
  if (auth.busy || !view.subjectId) return setAuth({ error: '권한을 줄 계정을 먼저 고르세요.' });
  setAuth({ busy: true, error: '', notice: '' });
  const result = await adminSaveGrant({ ...view.draft, subjectId: view.subjectId }).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '권한을 지정하지 못했습니다.' });
  setAuth({ busy: false, notice: '권한을 지정했습니다. 다음 요청부터 바로 적용됩니다.', access: { ...view, draft: newGrantDraft(), grants: result.grants || [], accessLog: result.accessLog || [] } });
}
async function revokeGrantNow(id) {
  if (auth.busy) return;
  setAuth({ busy: true, error: '', notice: '' });
  const result = await adminRevokeGrant(id).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '권한을 회수하지 못했습니다.' });
  setAuth({ busy: false, notice: '권한을 회수했습니다. 다음 요청부터 바로 막힙니다.', access: { ...accessState(), grants: result.grants || [], accessLog: result.accessLog || [] } });
}
async function assignProposalToMember(id) {
  const userId = String(document.querySelector(`[data-assign-user="${id}"]`)?.value || '');
  const note = String(document.querySelector(`[data-assign-note="${id}"]`)?.value || '').trim();
  if (!userId || !note) return setAuth({ error: '회원과 지정 사유를 모두 적어 주세요.' });
  setAuth({ busy: true, error: '', notice: '' });
  const result = await adminAssignProposal(id, userId, note).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '지정하지 못했습니다.' });
  setAuth({ busy: false, notice: '보관자료를 회원에게 지정했습니다.', access: { ...accessState(), usage: result } });
}


// ---------- 에이전트 관리 ----------
// 에이전트는 파는 상품이 아니다. 최고관리자가 임명하고 한도를 정하고 필요하면 거둔다.
// 요금·구독과 섞지 않는다. 여기서 바꾸는 값은 자격과 AI 한도뿐이다.
function emptyAgency() {
  return { loaded: false, list: [], defaults: DEFAULT_LIMITS, today: '', readOnly: false, editing: '', draft: null, transfer: null, preview: null };
}

async function loadAgencies() {
  const call = isAdmin() ? adminAgencyList : operatorAgencyList;
  setAuth({ busy: true, error: '' });
  try {
    const data = await call();
    setAuth({ busy: false, agency: { ...emptyAgency(), loaded: true, list: data.agencies || [], defaults: data.defaults || DEFAULT_LIMITS, today: data.today || '', readOnly: Boolean(data.readOnly) } });
  } catch (error) {
    setAuth({ busy: false, error: String(error?.message || '에이전트 목록을 읽지 못했습니다.').slice(0, 120) });
  }
}

function agencyPanel() {
  const box = auth.agency || emptyAgency();
  if (!box.loaded) return '<div class="card"><p class="muted">에이전트 현황을 읽는 중입니다.</p></div>';
  const rows = box.list.length
    ? box.list.map(agencyRow).join('')
    : '<p class="muted">아직 지정한 에이전트이 없습니다. 아래에서 일반회원을 골라 지정하세요.</p>';
  return `<div class="card" id="agency-panel">
    <div class="card-title"><div><h3>에이전트 ${box.list.length}명</h3>
      <span>최고관리자가 임명하는 자리입니다. 이용요금을 받지 않고 AI 한도로만 관리합니다.</span></div>
      ${box.readOnly ? '<span class="status 확인-필요">조회 전용</span>' : ''}</div>
    ${box.readOnly ? '<p class="muted">운영관리자는 현황만 볼 수 있습니다. 지정·해제·한도·인계는 최고관리자만 합니다.</p>' : agencyGrantForm()}
    <div class="requirement-list">${rows}</div>
  </div>`;
}

// 일반회원을 골라 에이전트로 지정한다. 회원이 스스로 신청하거나 결제해서 올라오지 않는다.
function agencyGrantForm() {
  const candidates = (auth.accounts || []).filter(item => item.role === 'customer' && item.status === 'active');
  return `<div class="two-col" style="margin:8px 0 12px">
    <div class="field"><label for="agency-pick">에이전트로 지정할 일반회원</label>
      <select id="agency-pick"><option value="">고르세요</option>${candidates.map(item =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || item.email || item.id)}</option>`).join('')}</select></div>
    <div class="field"><label for="agency-note">사유(감사기록에 남습니다)</label>
      <input id="agency-note" value="${escapeHtml(auth.agency?.draft?.note || '')}" placeholder="예: 광주지회 협력 컨설턴트"></div>
    <div class="actions"><span class="muted">지정하면 한도는 기본값으로 시작합니다.</span>
      <button class="button primary" id="agency-grant" ${auth.busy ? 'disabled' : ''}>에이전트로 지정</button></div>
  </div>`;
}

function agencyRow(item) {
  const box = auth.agency || emptyAgency();
  const editing = box.editing === item.userId;
  const left = remainingFor({ limits: item.limits }, item.usage);
  const usage = item.usage || {};
  return `<article class="requirement">
    <div><strong>${escapeHtml(item.name || item.email || item.userId)}</strong>
      <span class="status ${item.active ? '충족' : '확인-필요'}">${escapeHtml(AGENCY_STATUS_LABEL[item.status] || item.status)}</span>
      <span class="muted">고객 ${item.footprint?.clients ?? 0}곳 · 의뢰 ${item.footprint?.proposals ?? 0}건(진행 ${item.footprint?.inProgress ?? 0})</span></div>
    <small class="muted">자격 ${escapeHtml(item.startsOn || item.grantedAt?.slice(0, 10) || '지정일 미기록')} ~ ${escapeHtml(item.endsOn || '종료일 없음')}
      · 마지막 활동 ${escapeHtml(item.lastActiveAt ? item.lastActiveAt.slice(0, 16).replace('T', ' ') : '기록 없음')}</small>
    <small class="muted">이번 달 계획서 ${usage.plans ?? 0}/${item.limits.monthlyPlans}편 · 진단 ${usage.diagnoses ?? 0}/${item.limits.monthlyDiagnoses}회
      · 토큰 ${Number(usage.tokens || 0).toLocaleString('ko-KR')}/${item.limits.monthlyTokens.toLocaleString('ko-KR')}
      · 남은 편수 ${left.plans}편 · 갱신 ${escapeHtml(left.renewsOn)}</small>
    ${item.reason ? `<small class="muted">${escapeHtml(item.reason)}</small>` : ''}
    ${box.readOnly ? '' : `<div class="actions"><span></span><div>
      <button class="button secondary" data-agency-edit="${escapeHtml(item.userId)}">${editing ? '한도 접기' : '한도 변경'}</button>
      ${item.status === 'active'
        ? `<button class="button secondary" data-agency-status="paused" data-agency-id="${escapeHtml(item.userId)}">일시중지</button>`
        : item.status === 'paused'
          ? `<button class="button secondary" data-agency-status="active" data-agency-id="${escapeHtml(item.userId)}">재개</button>` : ''}
      ${item.status === 'revoked'
        ? `<button class="button secondary" data-agency-status="active" data-agency-id="${escapeHtml(item.userId)}">자격 재부여</button>`
        : `<button class="button secondary" data-agency-status="revoked" data-agency-id="${escapeHtml(item.userId)}">자격 해제</button>`}
      <button class="button secondary" data-agency-transfer="${escapeHtml(item.userId)}">자료 인계</button>
    </div></div>`}
    ${editing ? agencyLimitForm(item) : ''}
    ${box.transfer === item.userId ? agencyTransferForm(item) : ''}
  </article>`;
}

function agencyLimitForm(item) {
  const draft = auth.agency?.draft || { ...item.limits, startsOn: item.startsOn, endsOn: item.endsOn };
  return `<div class="two-col" style="margin-top:8px">
    ${LIMIT_FIELDS.map(([key, label, unit]) => `<div class="field"><label for="agency-${key}">${label} (${unit})</label>
      <input id="agency-${key}" data-agency-limit="${key}" type="number" min="1" value="${escapeHtml(String(draft[key] ?? item.limits[key]))}"></div>`).join('')}
    <div class="field"><label for="agency-startsOn">적용 시작일</label><input id="agency-startsOn" data-agency-limit="startsOn" type="date" value="${escapeHtml(draft.startsOn || '')}"></div>
    <div class="field"><label for="agency-endsOn">적용 종료일</label><input id="agency-endsOn" data-agency-limit="endsOn" type="date" value="${escapeHtml(draft.endsOn || '')}"></div>
    <div class="actions"><span class="muted">비워 두면 기본 한도를 씁니다. 무제한은 없습니다.</span>
      <button class="button primary" data-agency-save="${escapeHtml(item.userId)}" ${auth.busy ? 'disabled' : ''}>한도 저장</button></div>
  </div>`;
}

function agencyTransferForm(item) {
  const others = (auth.agency?.list || []).filter(row => row.userId !== item.userId && row.status !== 'revoked');
  const preview = auth.agency?.preview;
  return `<div class="two-col" style="margin-top:8px">
    <div class="field"><label for="agency-transfer-to">인계받을 에이전트</label>
      <select id="agency-transfer-to"><option value="">고르세요</option>${others.map(row =>
        `<option value="${escapeHtml(row.userId)}">${escapeHtml(row.name || row.email || row.userId)}</option>`).join('')}</select></div>
    <div class="field"><label for="agency-transfer-reason">사유</label><input id="agency-transfer-reason" placeholder="감사기록에 남습니다"></div>
    <div class="actions">
      <span class="muted">${preview
        ? `넘길 고객 ${preview.from?.clients ?? 0}곳 · 계획서 ${preview.from?.proposals ?? 0}건 · 진행 중 ${preview.from?.inProgress ?? 0}건`
        : '먼저 건수를 확인하세요. 자료는 지우지 않고 소유만 옮깁니다.'}</span>
      <div><button class="button secondary" data-agency-preview="${escapeHtml(item.userId)}" ${auth.busy ? 'disabled' : ''}>건수 확인</button>
      <button class="button primary" data-agency-move="${escapeHtml(item.userId)}" ${auth.busy || !preview ? 'disabled' : ''}>확인했습니다. 인계</button></div></div>
  </div>`;
}

async function runAgencyAction(patch, done) {
  setAuth({ busy: true, error: '', notice: '' });
  try {
    await adminSetAgency(patch);
    await loadAgencies();
    setAuth({ notice: done });
  } catch (error) {
    setAuth({ busy: false, error: String(error?.message || '바꾸지 못했습니다.').slice(0, 120) });
  }
}

function bindAgency() {
  document.querySelector('#agency-grant')?.addEventListener('click', () => {
    const id = document.querySelector('#agency-pick')?.value || '';
    const note = document.querySelector('#agency-note')?.value || '';
    if (!id) return setAuth({ error: '지정할 일반회원을 고르세요.' });
    void runAgencyAction({ id, status: 'active', note }, '에이전트로 지정했습니다. 다음 로그인부터 대행 화면이 열립니다.');
  });
  document.querySelectorAll('[data-agency-status]').forEach(el => el.onclick = () => {
    const status = el.dataset.agencyStatus;
    const label = { active: '자격을 다시 열었습니다.', paused: '사용을 일시중지했습니다.', revoked: '자격을 해제했습니다. 기존 자료는 보존됩니다.' }[status];
    void runAgencyAction({ id: el.dataset.agencyId, status }, label);
  });
  document.querySelectorAll('[data-agency-edit]').forEach(el => el.onclick = () => {
    const id = el.dataset.agencyEdit;
    const item = (auth.agency?.list || []).find(row => row.userId === id);
    setAuth({ agency: { ...auth.agency, editing: auth.agency?.editing === id ? '' : id, draft: item ? { ...item.limits, startsOn: item.startsOn, endsOn: item.endsOn } : null } });
  });
  document.querySelectorAll('[data-agency-limit]').forEach(el => el.onchange = () => {
    const key = el.dataset.agencyLimit;
    const value = key.endsWith('On') ? el.value : Number(el.value);
    setAuth({ agency: { ...auth.agency, draft: { ...(auth.agency?.draft || {}), [key]: value } } });
  });
  document.querySelectorAll('[data-agency-save]').forEach(el => el.onclick = () => {
    const draft = auth.agency?.draft || {};
    void runAgencyAction({
      id: el.dataset.agencySave, status: 'active',
      limits: {
        monthlyPlans: draft.monthlyPlans, revisionsPerPlan: draft.revisionsPerPlan, monthlyDiagnoses: draft.monthlyDiagnoses,
        monthlyTokens: draft.monthlyTokens, monthlyCostMicro: draft.monthlyCostMicro
      },
      startsOn: draft.startsOn || '', endsOn: draft.endsOn || ''
    }, '한도를 저장했습니다.');
  });
  document.querySelectorAll('[data-agency-transfer]').forEach(el => el.onclick = () => setAuth({
    agency: { ...auth.agency, transfer: auth.agency?.transfer === el.dataset.agencyTransfer ? '' : el.dataset.agencyTransfer, preview: null }
  }));
  document.querySelectorAll('[data-agency-preview]').forEach(el => el.onclick = () => void (async () => {
    const to = document.querySelector('#agency-transfer-to')?.value || '';
    if (!to) return setAuth({ error: '인계받을 에이전트를 고르세요.' });
    setAuth({ busy: true, error: '' });
    try {
      const preview = await adminAgencyTransferPreview(el.dataset.agencyPreview, to);
      setAuth({ busy: false, agency: { ...auth.agency, preview, transferTo: to } });
    } catch (error) { setAuth({ busy: false, error: String(error?.message || '건수를 읽지 못했습니다.').slice(0, 120) }); }
  })());
  document.querySelectorAll('[data-agency-move]').forEach(el => el.onclick = () => void (async () => {
    const to = document.querySelector('#agency-transfer-to')?.value || auth.agency?.transferTo || '';
    const reason = document.querySelector('#agency-transfer-reason')?.value || '';
    if (!to) return setAuth({ error: '인계받을 에이전트를 고르세요.' });
    setAuth({ busy: true, error: '' });
    try {
      const result = await adminAgencyTransfer(el.dataset.agencyMove, to, reason);
      await loadAgencies();
      setAuth({ notice: `고객 ${result.moved?.clients ?? 0}곳 · 계획서 ${result.moved?.proposals ?? 0}건을 인계했습니다. 이전 에이전트는 더 이상 열 수 없습니다.` });
    } catch (error) { setAuth({ busy: false, error: String(error?.message || '인계하지 못했습니다.').slice(0, 120) }); }
  })());
}

function accessPanel() {
  const view = accessState();
  if (!view.loaded) return '<div class="card-title" style="margin-top:18px"><div><h4>권한 관리</h4><span>불러오는 중입니다.</span></div></div>';
  const subject = view.subjects.find(item => item.id === view.subjectId);
  const usage = view.usage;
  return `<div class="card-title" style="margin-top:18px"><div><h4>권한 관리</h4>
      <span>권한이 지정되지 않으면 아무것도 열리지 않습니다. 최고관리자 열람권한은 이 화면으로 줄일 수 없습니다.</span></div></div>
    <div class="field"><label for="access-subject">권한을 지정할 계정</label>
      <select id="access-subject"><option value="">계정을 고르세요</option>${view.subjects.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === view.subjectId ? 'selected' : ''}>${escapeHtml(item.email)} · ${escapeHtml(item.role)} · ${escapeHtml(item.status)}</option>`).join('')}</select></div>
    ${subject ? `
    <div class="two-col">
      <div class="field"><label for="grant-scope">자료 범위</label><select id="grant-scope">${SCOPES.map(scope => `<option value="${scope}" ${view.draft.scope === scope ? 'selected' : ''}>${escapeHtml(SCOPE_LABELS[scope] || scope)}</option>`).join('')}</select></div>
      <div class="field"><label for="grant-target-kind">대상</label><select id="grant-target-kind">
        <option value="all" ${view.draft.targetKind === 'all' ? 'selected' : ''}>전체</option>
        <option value="user" ${view.draft.targetKind === 'user' ? 'selected' : ''}>지정한 회원</option>
        <option value="proposal" ${view.draft.targetKind === 'proposal' ? 'selected' : ''}>지정한 계획서</option></select></div>
    </div>
    ${view.draft.targetKind === 'all' ? '' : `<div class="field"><label for="grant-target-id">대상 식별자</label><input id="grant-target-id" value="${escapeHtml(view.draft.targetId)}" placeholder="회원 또는 계획서 식별자"></div>`}
    <div class="field"><label>허용할 동작</label><div class="stat-badges">${ABILITIES.map(ability => `<label class="stat-badge" style="gap:6px;cursor:pointer"><input type="checkbox" data-grant-ability="${ability}" ${view.draft.abilities[ability] ? 'checked' : ''}><span>${escapeHtml(ABILITY_LABELS[ability] || ability)}</span></label>`).join('')}</div>
      <small class="muted">원문 열람 없이 수정·내려받기만 줄 수는 없습니다. 서버가 거절합니다.</small></div>
    <div class="two-col">
      <div class="field"><label for="grant-starts">시작일</label><input id="grant-starts" type="date" value="${escapeHtml(view.draft.startsOn)}"></div>
      <div class="field"><label for="grant-ends">종료일</label><input id="grant-ends" type="date" value="${escapeHtml(view.draft.endsOn)}"></div>
    </div>
    <div class="field"><label for="grant-note">사유</label><input id="grant-note" value="${escapeHtml(view.draft.note)}" placeholder="어떤 업무 때문에 여는지"></div>
    <div class="actions"><span class="muted">${escapeHtml(subject.email)}에게 지정합니다.</span><button class="button primary" id="grant-save" ${auth.busy ? 'disabled' : ''}>권한 지정</button></div>` : '<p class="muted">계정을 고르면 권한을 지정할 수 있습니다.</p>'}
    <h4>지정된 권한 ${view.grants.length}건</h4>
    <div class="requirement-list">${view.grants.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(SCOPE_LABELS[item.scope] || item.scope)}</strong> <span class="tag">${escapeHtml(item.targetKind === 'all' ? '전체' : `${item.targetKind} ${item.targetId}`)}</span>${item.revokedAt ? ' <span class="status 부족">회수됨</span>' : ' <span class="status 충족">사용 중</span>'}</div>
      <small class="muted">${escapeHtml(ABILITIES.filter(ability => item.abilities[ability]).map(ability => ABILITY_LABELS[ability]).join(' · ') || '동작 없음')}</small>
      <small class="muted">${escapeHtml(`기간 ${item.startsOn || '즉시'} ~ ${item.endsOn || '무기한'} · 지정 ${String(item.grantedAt).slice(0, 16).replace('T', ' ')} · 지정자 ${item.grantedBy}${item.note ? ` · ${item.note}` : ''}`)}</small>
      ${item.revokedAt ? '' : `<div class="actions"><button class="button secondary" data-revoke-grant="${escapeHtml(item.id)}" ${auth.busy ? 'disabled' : ''}>즉시 회수</button></div>`}
    </div></article>`).join('') || '<p class="muted">지정된 권한이 없습니다. 이 상태에서는 본인 자료 외에는 아무것도 열리지 않습니다.</p>'}</div>
    <h4>회원별 이용현황</h4>
    <div class="actions"><span class="muted">계획서 원문은 이 목록에 없습니다. 편수·수정일·출력 횟수만 봅니다.</span><button class="button secondary" id="load-member-usage" ${auth.busy ? 'disabled' : ''}>이용현황 불러오기</button></div>
    ${usage ? `<div class="requirement-list">${usage.members.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.email)}</strong> <span class="tag">${escapeHtml(item.role)}</span></div>
      <small class="muted">${escapeHtml(`계획서 ${item.proposals}건 · 출력 ${item.exportCount}회 · 최근 수정 ${item.lastUpdatedAt ? String(item.lastUpdatedAt).slice(0, 10) : '없음'}`)}</small>
    </div></article>`).join('')}</div>
    <h4>회원 미지정 보관자료 ${usage.unclaimed.length}건</h4>
    <p class="muted">이메일·기관명이 비슷하다는 이유로 자동 귀속하지 않습니다. 소유 회원을 확인한 뒤 사유를 적어 지정하세요.</p>
    <div class="requirement-list">${usage.unclaimed.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.title)}</strong> <span class="tag">${escapeHtml(item.stage)}</span></div>
      <small class="muted">${escapeHtml(`식별자 ${item.id} · 최근 수정 ${String(item.updatedAt).slice(0, 10)}`)}</small>
      <div class="inline-row"><select data-assign-user="${escapeHtml(item.id)}"><option value="">회원 선택</option>${usage.members.map(member => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.email)}</option>`).join('')}</select>
        <input data-assign-note="${escapeHtml(item.id)}" placeholder="지정 사유(예: 회원이 복구키로 확인)">
        <button class="button secondary" data-assign-proposal="${escapeHtml(item.id)}" ${auth.busy ? 'disabled' : ''}>이 회원에게 지정</button></div>
    </div></article>`).join('') || '<p class="muted">회원과 연결되지 않은 보관자료가 없습니다.</p>'}</div>` : ''}
    <h4>최근 열람·권한 변경 기록</h4>
    <div class="requirement-list">${view.accessLog.slice(0, 20).map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(String(item.at).slice(0, 16).replace('T', ' '))}</strong> <span class="tag">${escapeHtml(item.action)}</span>${item.allowed ? '' : ' <span class="status 부족">거절</span>'}</div>
      <small class="muted">${escapeHtml(`실행자 ${item.actorId}(${item.actorRole}) · 대상 ${item.targetKind || '-'} ${item.targetId || ''} · 회원 ${item.targetUserId || '-'}${item.reason ? ` · ${item.reason}` : ''}`)}</small>
    </div></article>`).join('') || '<p class="muted">기록이 없습니다.</p>'}</div>`;
}

// ---------- AI 사용량·비용 ----------
// 관리자와 운영관리자가 같은 화면을 본다. 두 경로 모두 서버가 집계한 값만 그린다.
function emptyUsage() { return { loaded: false, days: 30, report: null }; }
const USAGE_PERIODS = [[7, '7일'], [30, '30일'], [90, '90일']];
// 단가를 모르면 0원이 아니라 「계산 불가」다. 0원으로 적으면 공짜로 쓴 것처럼 보인다.
const money = (value, priced = true) => (priced ? `$${Number(value || 0).toFixed(4)}` : '계산 불가');
const tokens = value => Number(value || 0).toLocaleString();

async function loadUsage(days = auth.usage.days) {
  const fetchReport = isAdmin() ? adminUsageReport : operatorUsageReport;
  const result = await fetchReport(days).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ error: result.error || '사용량을 불러오지 못했습니다.', usage: { ...auth.usage, loaded: true } });
  setAuth({ usage: { ...auth.usage, loaded: true, days, report: result } });
}

function usagePanel() {
  const view = auth.usage;
  const report = view.report;
  const rows = (list, label, key) => `<h4>${label}</h4><div class="requirement-list">${(list || []).slice(0, 12).map(item => `<article class="requirement"><div>
    <div><strong>${escapeHtml(String(item[key] || '(없음)'))}</strong> <span class="muted">${item.calls}회${item.failedCalls ? ` · 실패 ${item.failedCalls}회` : ''}</span></div>
    <small class="muted">${escapeHtml(`${money(item.costUsd, report.priced)} · 토큰 ${tokens(item.tokens)} (입력 ${tokens(item.inputTokens)} · 캐시 ${tokens(item.cachedTokens)} · 출력 ${tokens(item.outputTokens)} · 추론 ${tokens(item.reasoningTokens)}) · 평균 ${(item.averageMs / 1000).toFixed(1)}초`)}</small>
  </div></article>`).join('') || '<p class="muted">기록이 없습니다.</p>'}</div>`;
  return `<div class="card-title" style="margin-top:18px"><div><h4>AI 사용량·비용</h4><span>OpenAI 호출마다 모델·토큰·시간·성공 여부만 기록합니다. 공고문·계획서 원문·프롬프트는 저장하지 않습니다.</span></div></div>
    <div class="actions" style="justify-content:stretch;gap:8px">${USAGE_PERIODS.map(([days, label]) => `<button class="button ${view.days === days ? 'primary' : 'secondary'}" data-usage-days="${days}" ${auth.busy ? 'disabled' : ''}>${label}</button>`).join('')}</div>
    ${report ? `
    ${report.priced ? '' : '<div class="alert warning"><strong>단가가 설정되어 있지 않습니다</strong><p>토큰은 기록되지만 비용은 0으로 표시됩니다. Cloudflare 환경변수 <code>OPENAI_PRICE_INPUT_PER_MTOK</code>·<code>OPENAI_PRICE_OUTPUT_PER_MTOK</code>(1M 토큰당 USD)를 넣으면 이후 호출부터 실제 비용이 쌓입니다.</p></div>'}
    <div class="summary-grid">
      <div><span>${report.period}일 비용</span><strong>${money(report.totals.costUsd, report.priced)}</strong></div>
      <div><span>호출</span><strong>${report.totals.calls}회${report.totals.failedCalls ? ` (실패 ${report.totals.failedCalls})` : ''}</strong></div>
      <div><span>토큰</span><strong>${tokens(report.totals.tokens)}</strong></div>
      <div><span>계획서 1건 상한</span><strong>${money(report.caps.proposalCostUsd)} / ${tokens(report.caps.proposalTokens)}토큰</strong></div>
    </div>
    ${rows(report.byUser, '회원별', 'userEmail')}
    ${rows(report.byProposal, '계획서별', 'proposalId')}
    ${rows(report.byTask, '작업 종류별', 'task')}
    ${rows(report.byDay, '날짜별', 'day')}` : `<p class="muted">${view.loaded ? '기록이 없습니다.' : '불러오는 중입니다.'}</p>`}`;
}

// 관리자용 공모정보 목록. 출처 URL·수집일·최종 확인일·중복 여부·공개 여부를 함께 본다.
function adminNoticesPanel() {
  const view = auth.notices;
  return `<div class="card-title" style="margin-top:18px"><div><h4>공모정보 관리</h4><span>모아 둔 ${view.collected}건 · 비공개 ${view.hidden}건 · 중복 의심 ${view.duplicates}건</span></div></div>
    <div class="field"><label for="admin-notice-query">전체 수집자료 검색</label><input id="admin-notice-query" placeholder="제목·주최기관·요약으로 찾기" value="${escapeHtml(view.queryDraft)}"></div>
    <div class="actions"><span class="muted">${view.loaded ? `${view.total}건 표시` : '불러오는 중입니다.'} · 비회원에게는 공개로 표시된 자료만 보입니다.</span>
      <div><button class="button secondary" id="admin-notice-search" ${auth.busy ? 'disabled' : ''}>검색</button><button class="button secondary" id="admin-notice-reload" ${auth.busy ? 'disabled' : ''}>새로고침</button></div></div>
    <div class="requirement-list">${view.list.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.title)}</strong> <span class="status ${item.isPublic ? '충족' : '확인-필요'}">${item.isPublic ? '공개' : '비공개'}</span>${item.duplicate ? ' <span class="status 확인-필요">중복 의심</span>' : ''}</div>
      <small class="muted">${escapeHtml([item.organizer, `${item.stateLabel}${item.deadline ? ` ${item.deadline}` : ''}`, item.applicationPeriod || '접수기간 미기록', item.supportAmount || '지원금액 미기록'].join(' · '))}</small>
      <small class="muted">${escapeHtml(`식별자 ${item.key} · 수집일 ${String(item.collectedAt).slice(0, 10) || '기록 없음'} · 최종 확인일 ${String(item.lastCheckedAt).slice(0, 10) || '기록 없음'}`)}</small>
      <small class="muted">${escapeHtml(`출처 URL ${item.sourceUrl || '미기록'}${item.duplicate ? ` · 먼저 수집된 자료 ${item.duplicateOf}` : ''}`)}</small>
      <div class="actions"><button class="button secondary" data-notice-public="${escapeHtml(item.key)}" data-notice-next="${item.isPublic ? '' : '1'}" ${auth.busy ? 'disabled' : ''}>${item.isPublic ? '비공개로' : '공개로'}</button></div>
    </div></article>`).join('') || (view.loaded ? '<p class="muted">조건에 맞는 공모정보가 없습니다.</p>' : '')}</div>`;
}
async function loadAccounts() {
  const result = await listAccounts().catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ accountsLoaded: true, error: result.error || '계정 목록을 불러오지 못했습니다.' });
  setAuth({ accounts: result.users || [], accountsLoaded: true });
  void loadSubscriptionRequests();
}

// 구독 신청서 목록. 계정 목록과 함께 한 번 읽는다.
async function loadSubscriptionRequests() {
  const result = await adminSubscriptionRequests().catch(() => null);
  if (!result?.requests) return setAuth({ subRequests: { loaded: true, list: auth.subRequests?.list || [] } });
  setAuth({ subRequests: { loaded: true, list: result.requests } });
}

// 승인하면 서버가 실제 구독까지 연다. 거절은 사유를 함께 남긴다.
async function decideSubscriptionRequest(id, status) {
  if (auth.busy) return;
  const note = document.querySelector(`[data-sub-note="${id}"]`)?.value || '';
  if (status === 'rejected' && !note.trim()) return setAuth({ error: '거절 사유를 적어 주세요. 신청한 회원이 무엇을 고쳐야 하는지 알 수 있어야 합니다.' });
  setAuth({ busy: true, error: '', notice: '' });
  const result = await adminDecideSubscription(id, status, note).catch(() => ({ error: '처리하지 못했습니다.' }));
  if (result?.error) return setAuth({ busy: false, error: result.error });
  setAuth({ busy: false, subRequests: { loaded: true, list: result.requests || [] },
    notice: status === 'approved' ? '구독을 열었습니다. 회원 화면에서 바로 쓸 수 있습니다.' : '신청을 거절했습니다. 사유를 남겼습니다.' });
  void loadAccounts();
}
// 승인·중지·삭제. 서버가 다시 확인하므로 화면은 결과만 반영한다.
async function runAdminAction(kind, id) {
  if (auth.busy) return;
  // 삭제는 되돌릴 수 없어 같은 버튼을 한 번 더 눌러야 실행된다.
  if (kind === 'delete' && auth.confirmDelete !== id) return setAuth({ confirmDelete: id, error: '', notice: '' });
  setAuth({ busy: true, error: '', notice: '', confirmDelete: '' });
  // 운영관리자 지정·해제도 여기를 지난다. 서버는 관리자 계정과 'admin' 역할을 받지 않는다.
  const call = kind === 'operator' || kind === 'customer' ? () => setAccountRole(id, kind)
    : kind === 'full' || kind === 'trial' ? () => setAccountPlan(id, kind)
    : kind === 'approve' ? approveAccount : kind === 'disable' ? disableAccount : removeAccount;
  const result = await call(id).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '요청을 처리하지 못했습니다.' });
  setAuth({ busy: false, accounts: result.users || auth.accounts, notice: ADMIN_DONE[kind] || '' });
}

// 가입 요건을 못 갖췄으면 누르기 전에 알려 준다. 못 만들 비밀번호로 요청을 보내 400을 받게 두지 않는다.
function signupBlock() {
  const checked = validateSignup({ email: auth.emailDraft, password: auth.passwordDraft, passwordConfirm: auth.confirmDraft });
  if (checked.ok) return '';
  // 아직 아무것도 안 적었으면 잔소리하지 않는다.
  if (!String(auth.emailDraft || '').trim() && !String(auth.passwordDraft || '')) return '이메일과 비밀번호를 먼저 적어 주세요.';
  return checked.errors.join(' ');
}

// 지금 몇 자인지, 무엇이 모자란지 입력하는 동안 그대로 보여 준다.
function signupHintView() {
  const password = String(auth.passwordDraft || '');
  const short = password.length > 0 && password.length < PASSWORD_MIN;
  const reason = signupBlock();
  const ready = !reason;
  return `<p class="muted" id="signup-hint">
    <span class="status ${ready ? '충족' : '확인-필요'}">${ready ? '가입할 수 있습니다' : '아직 안 됩니다'}</span>
    ${password.length ? `비밀번호 ${password.length}자` : '비밀번호 미입력'}${short ? ` · ${PASSWORD_MIN - password.length}자 더 필요합니다` : ''}
    ${reason && !short ? ` · ${escapeHtml(reason)}` : ''}</p>`;
}

// 구독 신청서 목록. 승인하면 서버가 그 자리에서 실제 구독까지 연다.
function subscriptionRequestsPanel() {
  const view = auth.subRequests || { loaded: false, list: [] };
  const waiting = (view.list || []).filter(item => item.status === 'pending');
  const done = (view.list || []).filter(item => item.status !== 'pending');
  return `<h4>구독 신청 ${waiting.length}건${done.length ? ` <span class="muted">· 처리함 ${done.length}건</span>` : ''}</h4>
    ${view.loaded ? '' : '<p class="muted">구독 신청서를 불러오는 중입니다.</p>'}
    <div class="requirement-list">${waiting.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.orgName)}</strong> <span class="status 확인-필요">검토 중</span>
        <small>${escapeHtml(item.contactName)} · ${escapeHtml(item.phone)} · ${escapeHtml(item.userEmail)}</small>
        <small>${escapeHtml(item.purpose)}</small>
        <small class="muted">신청 ${escapeHtml(String(item.createdAt).slice(0, 10))}${item.wantedStart ? ` · 희망 시작 ${escapeHtml(item.wantedStart)}` : ''}${item.monthlyPlans ? ` · 월 ${escapeHtml(item.monthlyPlans)}` : ''}</small></div>
      <div class="field"><label for="sub-note-${escapeHtml(item.id)}">처리 메모 (거절 사유)</label>
        <input id="sub-note-${escapeHtml(item.id)}" data-sub-note="${escapeHtml(item.id)}" placeholder="거절할 때는 사유를 적어 주세요"></div>
      <div class="actions" style="margin:0"><span class="muted">승인하면 월간 구독이 바로 열립니다.</span>
        <div><button class="button primary" data-sub-approve="${escapeHtml(item.id)}" ${auth.busy ? 'disabled' : ''}>승인하고 구독 열기</button>
          <button class="button secondary" data-sub-reject="${escapeHtml(item.id)}" ${auth.busy ? 'disabled' : ''}>거절</button></div></div>
    </div></article>`).join('') || '<p class="muted">새 구독 신청이 없습니다.</p>'}</div>
    ${done.length ? `<details class="card org-details"><summary>처리한 신청 ${done.length}건</summary><div class="requirement-list">${done.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.orgName)}</strong> <span class="status ${item.status === 'approved' ? '충족' : '부족'}">${escapeHtml(item.statusLabel)}</span>
        <small>${escapeHtml(item.userEmail)} · ${escapeHtml(String(item.decidedAt).slice(0, 10))}${item.decisionNote ? ` · ${escapeHtml(item.decisionNote)}` : ''}</small></div>
    </div></article>`).join('')}</div></details>` : ''}`;
}

function adminView() {
  // 세 통으로 나눈다. 승인하면 「승인 대기」에서 「이용 중」으로, 중지하면 「이용 중지」로 실제로 옮겨진다.
  // 예전에는 이용 중과 중지를 한 통에 담아, 승인해도 중지해도 같은 자리에 남아 있는 것처럼 보였다.
  const waiting = auth.accounts.filter(item => item.status === 'pending');
  const live = auth.accounts.filter(item => item.status === 'active');
  const stopped = auth.accounts.filter(item => item.status === 'disabled');
  return `<div class="card">
    <div class="card-title"><div><h3>관리자</h3><span>가입 승인과 계정 상태를 여기서 처리합니다.</span></div><span class="status ${waiting.length ? '확인-필요' : '충족'}">승인 대기 ${waiting.length}건</span></div>
    ${auth.error ? `<div class="alert danger"><strong>${escapeHtml(auth.error)}</strong></div>` : ''}
    ${auth.notice ? `<div class="alert success"><strong>${escapeHtml(auth.notice)}</strong></div>` : ''}
    ${auth.accountsLoaded ? '' : '<p class="muted">계정 목록을 불러오는 중입니다.</p>'}
    ${subscriptionRequestsPanel()}
    <h4>승인 대기 ${waiting.length}건</h4>
    <div class="requirement-list">${waiting.map(accountRow).join('') || '<p class="muted">승인을 기다리는 계정이 없습니다.</p>'}</div>
    <h4>이용 중 ${live.length}건</h4>
    <div class="requirement-list">${live.map(accountRow).join('') || '<p class="muted">이용 중인 계정이 없습니다.</p>'}</div>
    <h4>이용 중지 ${stopped.length}건</h4>
    <div class="requirement-list">${stopped.map(accountRow).join('') || '<p class="muted">중지된 계정이 없습니다.</p>'}</div>
    <div class="actions"><span class="muted">관리자 계정과 내 계정은 이 화면에서 바꿀 수 없습니다.</span><div><button class="button secondary" id="reload-admin" ${auth.busy ? 'disabled' : ''}>목록 새로고침</button><button class="button secondary" id="open-admin-notices" ${auth.busy ? 'disabled' : ''}>${auth.adminTab === 'notices' ? '공모정보 접기' : '공모정보 관리'}</button><button class="button secondary" id="open-admin-agency" ${auth.busy ? 'disabled' : ''}>${auth.adminTab === 'agency' ? '에이전트 접기' : '에이전트 관리'}</button><button class="button secondary" id="open-admin-access" ${auth.busy ? 'disabled' : ''}>${auth.adminTab === 'access' ? '권한 관리 접기' : '권한 관리'}</button><button class="button secondary" id="open-admin-collection" ${auth.busy ? 'disabled' : ''}>${auth.adminTab === 'collection' ? '자동수집 접기' : '공고 자동수집'}</button><button class="button secondary" id="open-admin-usage" ${auth.busy ? 'disabled' : ''}>${auth.adminTab === 'usage' ? '사용량 접기' : 'AI 사용량·비용'}</button><button class="button secondary" id="open-admin-showcase" ${auth.busy ? 'disabled' : ''}>${auth.adminTab === 'showcase' ? '우수 제안서 접기' : '우수 제안서 관리'}</button><button class="button secondary" id="close-admin">계획서 포털로</button></div></div>
    ${auth.adminTab === 'notices' ? adminNoticesPanel() : ''}
    ${auth.adminTab === 'agency' ? agencyPanel() : ''}
    ${auth.adminTab === 'access' ? accessPanel() : ''}
    ${auth.adminTab === 'collection' ? collectionPanel() : ''}
    ${auth.adminTab === 'usage' ? usagePanel() : ''}
    ${auth.adminTab === 'showcase' ? showcasePanel() : ''}
  </div>`;
}

function accountRow(item) {
  const self = item.id === auth.user?.id;
  const locked = self || item.role === 'admin';
  const social = (item.identities || []).map(link => `${SOCIAL_BUTTONS.find(([provider]) => provider === link.provider)?.[1] || link.provider}${link.email ? ` (${link.email})` : ''}`).join(', ');
  const detail = [
    item.orgName || '기관명 미입력', item.phone || '연락처 미입력',
    item.email || (social ? `소셜: ${social}` : '이메일 없음'),
    `가입 ${String(item.createdAt).slice(0, 10)}`,
    item.consentedAt ? `동의 ${item.termsVersion}` : '동의 기록 없음',
    // 결제 자료는 없다. 이용권과 무료 체험 사용 여부만 실제 기록으로 보여 준다.
    `${PLAN_LABELS[item.effectivePlan] || item.effectivePlan || '무료 체험'}${item.effectivePlan === 'full' ? '' : `(${CONTACT_LABEL})`}`,
    item.trialUsed ? `무료 체험 사용 ${String(item.trialUsedAt).slice(0, 10)}` : '무료 체험 미사용'
  ].join(' · ');
  return `<article class="requirement"><div>
    <div><strong>${escapeHtml(item.name || '이름 미입력')}${item.contract ? ' 👑' : ''}</strong> <span class="status ${item.status === 'active' ? '충족' : '확인-필요'}">${escapeHtml(STATUS_LABELS[item.status] || item.status)}</span> <span class="muted">${escapeHtml(ROLE_LABELS[item.role] || item.role)}</span>${self ? ' <span class="muted">(내 계정)</span>' : ''}</div>
    <small class="muted">${escapeHtml(detail)}</small>
    <div>${premiumBadge(item)}${item.profileReviewNeeded ? ' <span class="status 확인-필요">기관정보 변경 확인 필요</span>' : ''}${item.profileUpdatedAt ? ` <span class="muted">정보 변경 ${escapeHtml(String(item.profileUpdatedAt).slice(0, 10))}</span>` : ''}</div>
    ${locked ? '' : subscriptionRow(item)}
    ${locked ? '' : premiumRow(item)}
    <div class="actions">${locked ? '<span class="muted">이 화면에서 바꿀 수 없는 계정입니다.</span>' : `
      ${item.status === 'active' ? `<button class="button secondary" data-admin-disable="${item.id}" ${auth.busy ? 'disabled' : ''}>사용 중지</button>`
    : `<button class="button primary" data-admin-approve="${item.id}" ${auth.busy ? 'disabled' : ''}>승인</button>`}
      <label class="inline-pick">역할 <select data-admin-role-id="${item.id}" ${auth.busy ? 'disabled' : ''}>${ASSIGNABLE_ROLES.map(role => `<option value="${role}" ${item.role === role ? 'selected' : ''}>${escapeHtml(roleLabel(role))}</option>`).join('')}</select></label>
      <button class="button secondary" data-admin-plan="${item.plan === 'full' ? 'trial' : 'full'}" data-admin-plan-id="${item.id}" ${auth.busy ? 'disabled' : ''}>${item.plan === 'full' ? '전체 이용권 회수' : '전체 이용권 부여'}</button>
      <button class="button secondary" data-admin-delete="${item.id}" ${auth.busy ? 'disabled' : ''}>${auth.confirmDelete === item.id ? '한 번 더 누르면 삭제' : '삭제'}</button>`}</div>
  </div></article>`;
}

// 시험용 월간 구독. 결제 연동이 없으므로 관리자가 확인한 건만 손으로 연다.
function subscriptionRow(item) {
  const current = item.subscription || { status: 'none', startedOn: '', endsOn: '', note: '' };
  const draft = (auth.subscriptionDraft || {})[item.id] || {};
  const value = key => (draft[key] !== undefined ? draft[key] : current[key] || '');
  const left = current.remaining || { coreProposal: 0, diagnosis: 0 };
  return `<details class="premium-edit"><summary>월간 구독 ${current.status === 'none' ? '부여' : '수정'} · ${escapeHtml(current.statusLabel || '구독 없음')}</summary>
    <p class="muted">남은 핵심제안서 ${left.coreProposal}편 · 남은 진단서 ${left.diagnosis}편${current.renewsOn ? ` · 다음 갱신 ${escapeHtml(current.renewsOn)}` : ''}. 결제 연동이 없어 관리자가 손으로 여는 시험용 값입니다.</p>
    <div class="two-col">
      <div class="field"><label for="sub-status-${item.id}">구독 상태</label><select id="sub-status-${item.id}" data-sub-field="status" data-sub-id="${item.id}">${[['active', '구독 중'], ['paused', '중지'], ['ended', '종료']].map(([id, label]) => `<option value="${id}" ${value('status') === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field"><label for="sub-start-${item.id}">시작일</label><input id="sub-start-${item.id}" type="date" data-sub-field="startedOn" data-sub-id="${item.id}" value="${escapeHtml(value('startedOn'))}"></div>
      <div class="field"><label for="sub-end-${item.id}">종료일(선택)</label><input id="sub-end-${item.id}" type="date" data-sub-field="endsOn" data-sub-id="${item.id}" value="${escapeHtml(value('endsOn'))}"></div>
    </div>
    <div class="actions"><span class="muted">구독은 승인 상태·역할·수주계약과 별개입니다.</span>
      <button class="button primary" data-sub-save="${item.id}" ${auth.busy ? 'disabled' : ''}>구독 저장</button></div>
  </details>`;
}

async function runSubscription(id) {
  const draft = (auth.subscriptionDraft || {})[id] || {};
  setAuth({ busy: true, error: '', notice: '' });
  const result = await setAccountSubscription(id, draft).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '구독을 저장하지 못했습니다.' });
  setAuth({ busy: false, accounts: result.users || auth.accounts, subscriptionDraft: {}, notice: '월간 구독을 저장했습니다.' });
}

// ---------- 수주회원 관리 ----------

// 부여·중지는 관리자만 한다. 운영관리자 경로에서는 서버가 언제나 거절한다.
function premiumBadge(item) {
  if (!item.contract) return '<span class="muted">수주계약 없음</span>';
  const ok = item.contract.canStartWork;
  return `<span class="status ${ok ? '충족' : '확인-필요'}">수주회원 👑 · ${escapeHtml(item.contract.statusLabel)}</span>`;
}

function premiumRow(item) {
  const contract = item.contract || { status: 'active', startedOn: '', endsOn: '', progress: '접수', progressNote: '', contractName: '' };
  const draft = (auth.premiumDraft || {})[item.id] || {};
  const value = key => (draft[key] !== undefined ? draft[key] : contract[key] || '');
  return `<details class="premium-edit"><summary>정식 수주계약 ${item.contract ? '수정' : '등록'}</summary>
    <div class="two-col">
      <div class="field"><label for="premium-name-${item.id}">계약명</label><input id="premium-name-${item.id}" data-premium-field="contractName" data-premium-id="${item.id}" value="${escapeHtml(value('contractName'))}"></div>
      <div class="field"><label for="premium-status-${item.id}">계약 상태</label><select id="premium-status-${item.id}" data-premium-field="status" data-premium-id="${item.id}">${[['active', '계약 진행 중'], ['suspended', '중지'], ['ended', '계약 종료']].map(([id, label]) => `<option value="${id}" ${value('status') === id ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field"><label for="premium-start-${item.id}">시작일</label><input id="premium-start-${item.id}" type="date" data-premium-field="startedOn" data-premium-id="${item.id}" value="${escapeHtml(value('startedOn'))}"></div>
      <div class="field"><label for="premium-end-${item.id}">종료일</label><input id="premium-end-${item.id}" type="date" data-premium-field="endsOn" data-premium-id="${item.id}" value="${escapeHtml(value('endsOn'))}"></div>
    </div>
    <div class="actions"><span class="muted">계약이 끝나도 이미 전달한 결과물은 회원이 계속 볼 수 있습니다. 새 전문 작업만 막힙니다.</span>
      <button class="button primary" data-premium-save="${item.id}" ${auth.busy ? 'disabled' : ''}>계약 저장</button></div>
  </details>`;
}

function showcasePanel() {
  const view = auth.showcase || { proposals: [], publicCount: 0, limit: 5 };
  const draft = auth.showcaseDraft || {};
  const field = (key, label, kind = 'input') => `<div class="field"><label for="showcase-${key}">${escapeHtml(label)}</label>${
    kind === 'area' ? `<textarea id="showcase-${key}" class="source-text" data-showcase-field="${key}" rows="3">${escapeHtml(draft[key] || '')}</textarea>`
      : `<input id="showcase-${key}" data-showcase-field="${key}" value="${escapeHtml(draft[key] || '')}">`}</div>`;
  return `<div class="card" id="showcase-panel"><div class="card-title"><div><h3>공개용 우수 사업제안서</h3>
      <span>관리자가 만든 사본만 공개합니다. 회원 계획서를 자동으로 옮겨 오지 않습니다.</span></div>
      <span class="status ${view.publicCount >= view.limit ? '확인-필요' : '충족'}">공개 ${view.publicCount}/${view.limit}편</span></div>
    <p class="muted">기관명·담당자·전화번호·이메일·주소·고유번호가 남아 있으면 저장되지 않습니다. 지우고 저장해 주세요. 회원 화면에서는 열람만 되고 원본 파일 내려받기는 제공하지 않습니다.</p>
    <div class="two-col">${field('title', '제목')}${field('field', '제안 분야')}</div>
    ${field('purpose', '제안 목적', 'area')}${field('audience', '대상', 'area')}
    ${field('structure', '핵심 사업구조', 'area')}${field('outcomeDesign', '성과설계 방식', 'area')}
    ${field('body', '공개 가능한 범위의 본문', 'area')}
    <div class="actions"><span class="muted">${auth.showcaseEditing ? '선택한 제안서를 고치는 중입니다.' : '새 사본을 만듭니다.'}</span>
      <div>${auth.showcaseEditing ? '<button class="button secondary" id="showcase-new">새로 만들기</button>' : ''}
      <button class="button primary" id="showcase-save" ${auth.busy ? 'disabled' : ''}>사본 저장</button></div></div>
    <div class="requirement-list">${(view.proposals || []).map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.title)}</strong> <span class="status ${item.isPublic ? '충족' : '확인-필요'}">${item.isPublic ? '공개' : '비공개'}</span> <span class="muted">${escapeHtml(item.field)}</span></div>
      <small class="muted">순서 ${item.order} · 수정 ${escapeHtml(String(item.updatedAt).slice(0, 10))}${item.identifiers?.length ? ` · 식별정보 확인 필요(${escapeHtml(item.identifiers.join('·'))})` : ''}</small>
      <div class="actions"><div>
        <button class="button secondary" data-showcase-edit="${escapeHtml(item.id)}">고치기</button>
        <button class="button secondary" data-showcase-public="${escapeHtml(item.id)}" data-showcase-next="${item.isPublic ? 'off' : 'on'}" ${auth.busy ? 'disabled' : ''}>${item.isPublic ? '비공개로' : '공개로'}</button>
        <button class="button secondary" data-showcase-up="${escapeHtml(item.id)}" ${auth.busy ? 'disabled' : ''}>위로</button>
        <button class="button secondary" data-showcase-delete="${escapeHtml(item.id)}" ${auth.busy ? 'disabled' : ''}>삭제</button>
      </div></div></div></article>`).join('') || '<p class="muted">등록된 사본이 없습니다.</p>'}</div>
  </div>`;
}

function bindShowcase() {
  document.querySelectorAll('[data-showcase-field]').forEach(el => el.oninput = () => {
    auth.showcaseDraft = { ...(auth.showcaseDraft || {}), [el.dataset.showcaseField]: el.value };
  });
  document.querySelector('#showcase-new')?.addEventListener('click', () => setAuth({ showcaseDraft: {}, showcaseEditing: '' }));
  document.querySelector('#showcase-save')?.addEventListener('click', () => void runShowcase('save'));
  document.querySelectorAll('[data-showcase-edit]').forEach(el => el.onclick = () => {
    const found = (auth.showcase?.proposals || []).find(item => item.id === el.dataset.showcaseEdit);
    if (found) setAuth({ showcaseDraft: { ...found }, showcaseEditing: found.id });
  });
  document.querySelectorAll('[data-showcase-public]').forEach(el => el.onclick = () => void runShowcase('public', el.dataset.showcasePublic, el.dataset.showcaseNext === 'on'));
  document.querySelectorAll('[data-showcase-up]').forEach(el => el.onclick = () => void runShowcase('up', el.dataset.showcaseUp));
  document.querySelectorAll('[data-showcase-delete]').forEach(el => el.onclick = () => void runShowcase('delete', el.dataset.showcaseDelete));
  document.querySelectorAll('[data-premium-field]').forEach(el => {
    const apply = () => {
      const id = el.dataset.premiumId;
      const current = (auth.premiumDraft || {})[id] || {};
      auth.premiumDraft = { ...(auth.premiumDraft || {}), [id]: { ...current, [el.dataset.premiumField]: el.value } };
    };
    el.oninput = apply; el.onchange = apply;
  });
  document.querySelectorAll('[data-premium-save]').forEach(el => el.onclick = () => void runPremiumContract(el.dataset.premiumSave));
  document.querySelectorAll('[data-sub-field]').forEach(el => {
    const apply = () => {
      const id = el.dataset.subId;
      auth.subscriptionDraft = { ...(auth.subscriptionDraft || {}), [id]: { ...((auth.subscriptionDraft || {})[id] || {}), [el.dataset.subField]: el.value } };
    };
    el.oninput = apply; el.onchange = apply;
  });
  document.querySelectorAll('[data-sub-save]').forEach(el => el.onclick = () => void runSubscription(el.dataset.subSave));
}

async function runShowcase(kind, id = '', next = false) {
  setAuth({ busy: true, error: '', notice: '' });
  const order = (auth.showcase?.proposals || []).map(item => item.id);
  const index = order.indexOf(id);
  const calls = {
    save: () => saveShowcase(auth.showcaseDraft || {}, auth.showcaseEditing || ''),
    public: () => setShowcasePublic(id, next),
    delete: () => deleteShowcase(id),
    up: () => {
      if (index <= 0) return Promise.resolve({ ok: true, ...(auth.showcase || {}) });
      const moved = [...order];
      [moved[index - 1], moved[index]] = [moved[index], moved[index - 1]];
      return setShowcaseOrder(moved);
    }
  };
  const result = await calls[kind]().catch(() => ({ ok: false, error: '요청을 처리하지 못했습니다.' }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '요청을 처리하지 못했습니다.' });
  setAuth({
    busy: false, showcase: { proposals: result.proposals || [], publicCount: result.publicCount || 0, limit: result.limit || 5 },
    showcaseDraft: kind === 'save' ? {} : auth.showcaseDraft, showcaseEditing: kind === 'save' ? '' : auth.showcaseEditing,
    notice: { save: '사본을 저장했습니다.', public: '공개 여부를 바꿨습니다.', delete: '사본을 지웠습니다.', up: '노출 순서를 바꿨습니다.' }[kind]
  });
}

async function runPremiumContract(id) {
  const contract = (auth.premiumDraft || {})[id] || {};
  setAuth({ busy: true, error: '', notice: '' });
  const result = await setAccountPremium(id, contract).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '계약을 저장하지 못했습니다.' });
  setAuth({ busy: false, accounts: result.users || auth.accounts, premiumDraft: {}, notice: '정식 수주계약을 저장했습니다.' });
}

async function loadShowcase() {
  if (auth.showcase) return;
  const result = await listShowcase().catch(() => null);
  if (result?.ok !== false) setAuth({ showcase: { proposals: result?.proposals || [], publicCount: result?.publicCount || 0, limit: result?.limit || 5 } });
}

// ---------- 운영관리자 화면 ----------
// 여기 있는 버튼은 모두 서버가 다시 확인한다. 요금·환불·역할 변경·영구 삭제는 서버에서 거절한다.
const OPERATOR_DONE = {
  approve: '계정을 승인했습니다.', disable: '계정을 중지하고 쓰던 세션을 모두 끊었습니다.',
  reactivate: '중지된 계정을 다시 열었습니다.', unlock: '로그인 잠금(계정 기준)을 해제했습니다.',
  endSessions: '이 계정의 모든 세션을 종료했습니다.'
};
const OPERATOR_CALLS = {
  approve: operatorApprove, disable: operatorDisable, reactivate: operatorReactivate,
  unlock: operatorUnlockLogin, endSessions: operatorEndSessions, recovery: operatorIssueRecoveryCode
};

function openOperator() {
  auth = { ...auth, error: '', notice: '', operator: { ...emptyOperator(), query: auth.operator.query, queryDraft: auth.operator.query } };
  setState({ activeTool: 'operator', notice: '', error: '' });
  void loadOperator();
}
async function loadOperator(query = auth.operator.query) {
  const result = await operatorOverview(query).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ operator: { ...auth.operator, loaded: true }, error: result.error || '회원 목록을 불러오지 못했습니다.' });
  setOperator({ loaded: true, users: result.users || [], audit: result.audit || [], notIntegrated: result.notIntegrated || [], query });
}
async function runOperatorAction(kind, id) {
  if (auth.busy) return;
  // 전체 세션 종료는 쓰던 사람이 바로 튕겨 나가므로 같은 버튼을 한 번 더 눌러야 실행된다.
  if (kind === 'endSessions' && auth.operator.confirmEnd !== id) return setAuth({ error: '', notice: '', operator: { ...auth.operator, confirmEnd: id } });
  setAuth({ busy: true, error: '', notice: '', operator: { ...auth.operator, confirmEnd: '', issued: null } });
  const result = await OPERATOR_CALLS[kind](id, auth.operator.query).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '요청을 처리하지 못했습니다.' });
  setAuth({
    busy: false, notice: kind === 'recovery' ? '일회용 복구코드를 발급했습니다. 아래 코드를 본인에게 직접 전달해 주세요.' : (OPERATOR_DONE[kind] || ''),
    operator: {
      ...auth.operator, users: result.users || auth.operator.users, audit: result.audit || auth.operator.audit,
      issued: result.recoveryCode ? { id, code: result.recoveryCode, expiresAt: result.recoveryExpiresAt, minutes: result.recoveryMinutes } : null
    }
  });
  // 자세히를 펼쳐 둔 계정이면 방금 남은 기록까지 다시 읽어 온다.
  if (auth.operator.selected === id) await openOperatorDetail(id, { toggle: false });
}
async function openOperatorDetail(id, { toggle = true } = {}) {
  if (toggle && auth.operator.selected === id && auth.operator.detail) return setOperator({ selected: '', detail: null });
  setOperator({ selected: id, detail: null });
  const result = await operatorUserDetail(id).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ error: result.error || '계정 정보를 불러오지 못했습니다.' });
  setOperator({ detail: { user: result.user, activity: result.activity || [], audit: result.audit || [] } });
}

const stamp = value => String(value || '').replace('T', ' ').slice(0, 16);
const OPERATOR_STATUS_ACTIONS = {
  pending: [['approve', '승인', 'primary']],
  active: [['disable', '사용 중지', 'secondary']],
  disabled: [['reactivate', '재활성화', 'primary']]
};

function operatorView() {
  const view = auth.operator;
  const waiting = view.users.filter(item => item.status === 'pending');
  const locked = view.users.filter(item => item.login?.locked);
  return `<div class="card">
    <div class="card-title"><div><h3>운영관리자</h3><span>회원 상태와 이용 흔적을 확인하고 승인·중지·잠금 해제·복구코드 발급을 처리합니다.</span></div><span class="status ${waiting.length ? '확인-필요' : '충족'}">승인 대기 ${waiting.length}건</span></div>
    ${auth.error ? `<div class="alert danger"><strong>${escapeHtml(auth.error)}</strong></div>` : ''}
    ${auth.notice ? `<div class="alert success"><strong>${escapeHtml(auth.notice)}</strong></div>` : ''}
    <div class="alert"><strong>운영관리자 권한 범위</strong><p>회원 승인·중지·재활성화, 검색, 이용 흔적 확인, 로그인 잠금 해제, 전체 세션 종료, 일회용 복구코드 발급까지 할 수 있습니다. 이용권과 무료 체험 사용 여부는 <strong>조회만</strong> 됩니다. 비밀번호 조회·직접 지정, 역할(운영관리자) 지정·해제, 이용권 부여·회수, 요금·결제정책 변경, 환불, API 키·모델·시스템 설정, 계정·자료 영구 삭제, 전체 자료 내보내기, 관리자 계정 변경은 서버에서 거절합니다.</p></div>
    ${operatorNotIntegrated(view.notIntegrated)}
    <div class="field"><label for="operator-search">회원 검색</label><input id="operator-search" placeholder="이름·이메일·기관명·연락처·계정 식별자" value="${escapeHtml(view.queryDraft)}"></div>
    <div class="actions"><span class="muted">${view.loaded ? `${view.users.length}건 표시${view.query ? ` · 검색어 「${escapeHtml(view.query)}」` : ''}${locked.length ? ` · 로그인 잠금 ${locked.length}건` : ''}` : '회원 목록을 불러오는 중입니다.'}</span>
      <div><button class="button secondary" id="operator-search-run" ${auth.busy ? 'disabled' : ''}>검색</button><button class="button secondary" id="operator-reload" ${auth.busy ? 'disabled' : ''}>새로고침</button><button class="button secondary" id="close-operator">계획서 포털로</button></div></div>
    <div class="actions" style="justify-content:stretch;gap:8px">
      <button class="button ${view.tab === 'users' ? 'primary' : 'secondary'}" data-operator-tab="users" aria-pressed="${view.tab === 'users'}">회원 ${view.users.length}</button>
      <button class="button ${view.tab === 'audit' ? 'primary' : 'secondary'}" data-operator-tab="audit" aria-pressed="${view.tab === 'audit'}">감사기록 ${view.audit.length}</button>
      <button class="button ${view.tab === 'usage' ? 'primary' : 'secondary'}" data-operator-tab="usage" aria-pressed="${view.tab === 'usage'}">AI 사용량·비용</button>
      <button class="button ${view.tab === 'collection' ? 'primary' : 'secondary'}" data-operator-tab="collection" aria-pressed="${view.tab === 'collection'}">공고 자동수집</button>
    </div>
    ${view.tab === 'collection' ? collectionPanel({ readOnly: true }) : view.tab === 'usage' ? usagePanel() : view.tab === 'audit' ? operatorAuditList(view.audit) : `<div class="requirement-list">${view.users.map(operatorRow).join('') || '<p class="muted">조건에 맞는 회원이 없습니다.</p>'}</div>`}
  </div>`;
}

// 결제·이용량처럼 실제 자료가 없는 항목은 값을 지어내지 않고 사유와 함께 「미연동」으로만 보여 준다.
function operatorNotIntegrated(items) {
  if (!items.length) return '';
  return `<details><summary>미연동 항목 ${items.length}개 (값을 만들어 보여 주지 않습니다)</summary>
    <div class="requirement-list">${items.map(item => `<article class="requirement"><div><div><strong>${escapeHtml(item.label)}</strong> <span class="status 확인-필요">미연동</span></div><small class="muted">${escapeHtml(item.reason)}</small></div></article>`).join('')}</div></details>`;
}

function operatorRow(item) {
  const view = auth.operator;
  const self = item.id === auth.user?.id;
  const guarded = self || item.role === 'admin' || item.role === 'operator';
  const contact = [item.orgName || '기관명 미입력', item.phone || '연락처 미입력', item.email || '이메일 없음', `가입 ${String(item.createdAt).slice(0, 10)}`].join(' · ');
  const usage = [
    `세션 ${item.sessions.count}개`,
    item.sessions.lastSeenAt ? `최근 활동 ${stamp(item.sessions.lastSeenAt)}` : '최근 활동 기록 없음',
    item.login.locked ? `로그인 잠금(실패 ${item.login.failures}회)` : `로그인 실패 ${item.login.failures}회`,
    item.recovery.active ? `복구코드 유효 ~${stamp(item.recovery.expiresAt)}` : item.recovery.issued ? '복구코드 없음(사용·만료됨)' : '복구코드 발급 이력 없음'
  ].join(' · ');
  const stuck = item.stuck.stepLabel
    ? `멈춘 단계 ${item.stuck.step + 1}. ${item.stuck.stepLabel}${item.stuck.lastErrorCode ? ` · 최근 오류 ${item.stuck.lastErrorCode} (${stamp(item.stuck.lastErrorAt)})` : ''}`
    : '진행 기록 없음';
  const issued = view.issued?.id === item.id ? view.issued : null;
  return `<article class="requirement"><div>
    <div><strong>${escapeHtml(item.name || '이름 미입력')}</strong> <span class="status ${item.status === 'active' ? '충족' : '확인-필요'}">${escapeHtml(STATUS_LABELS[item.status] || item.status)}</span> <span class="muted">${escapeHtml(ROLE_LABELS[item.role] || item.role)}</span>${self ? ' <span class="muted">(내 계정)</span>' : ''}</div>
    <small class="muted">${escapeHtml(contact)}</small>
    <small class="muted">${escapeHtml(usage)}</small>
    <small class="muted">${escapeHtml(stuck)}</small>
    <small class="muted">${escapeHtml(`이용권 ${PLAN_LABELS[item.plan] || item.plan || '무료 체험'}${item.plan === 'full' ? '' : `(${CONTACT_LABEL})`} · ${item.trialUsed ? `무료 체험 사용 ${stamp(item.trialUsedAt)}` : '무료 체험 미사용'} · 이용권 변경은 관리자만 할 수 있습니다`)}</small>
    <small class="muted">결제금액·결제상태·이용기간·이용량: 미연동</small>
    ${item.profileReviewNeeded ? '<div><span class="status 확인-필요">기관정보 변경 확인 필요</span></div>' : ''}
    ${item.profileUpdatedAt ? `<small class="muted">본인정보 변경 ${escapeHtml(stamp(item.profileUpdatedAt))}</small>` : ''}
    ${guarded ? '' : operatorContractRow(item)}
    <div class="actions">${guarded ? '<span class="muted">관리자·운영관리자·내 계정은 이 화면에서 바꿀 수 없습니다.</span>' : `
      ${(OPERATOR_STATUS_ACTIONS[item.status] || []).map(([kind, label, tone]) => `<button class="button ${tone}" data-operator-action="${kind}" data-operator-id="${item.id}" ${auth.busy ? 'disabled' : ''}>${label}</button>`).join('')}
      <button class="button secondary" data-operator-action="unlock" data-operator-id="${item.id}" ${auth.busy || !item.login.failures ? 'disabled' : ''}>로그인 잠금 해제</button>
      <button class="button secondary" data-operator-action="endSessions" data-operator-id="${item.id}" ${auth.busy || !item.sessions.count ? 'disabled' : ''}>${view.confirmEnd === item.id ? '한 번 더 누르면 종료' : '전체 세션 종료'}</button>
      <button class="button secondary" data-operator-action="recovery" data-operator-id="${item.id}" ${auth.busy || item.status === 'disabled' ? 'disabled' : ''}>복구코드 발급</button>`}
      <button class="button ghost" data-operator-detail="${item.id}" ${auth.busy ? 'disabled' : ''}>${view.selected === item.id ? '닫기' : '자세히'}</button></div>
    ${issued ? `<div class="alert success"><strong>일회용 복구코드 ${escapeHtml(issued.code)}</strong><p>${issued.minutes}분 동안 한 번만 쓸 수 있습니다(${escapeHtml(stamp(issued.expiresAt))}까지). 본인 확인 후 직접 전달하고, 이 화면을 벗어나면 다시 볼 수 없습니다. 새 비밀번호는 사용자가 로그인 화면의 「복구코드로 비밀번호 재설정」에서 직접 정합니다.</p></div>` : ''}
    ${view.selected === item.id ? operatorDetail() : ''}
  </div></article>`;
}

// 운영관리자는 수주 작업 진행상태만 바꾼다. 수주회원 권한 부여·해제는 서버가 거절한다.
const PROGRESS_OPTIONS = ['접수', '자료확인', '작성중', '검토중', '수정중', '전달완료', '보류'];
function operatorContractRow(item) {
  if (!item.contract) return '<small class="muted">정식 수주계약 없음 · 계약 등록은 관리자만 할 수 있습니다.</small>';
  const draft = (auth.progressDraft || {})[item.id] || {};
  const progress = draft.progress ?? item.contract.progress;
  const note = draft.progressNote ?? item.contract.progressNote;
  return `<div class="inline-row">
    <span class="status ${item.contract.canStartWork ? '충족' : '확인-필요'}">정식 수주회원 · ${escapeHtml(item.contract.statusLabel)}</span>
    <small class="muted">${escapeHtml([item.contract.contractName || '계약명 미입력', `${item.contract.startedOn || '시작일 미입력'} ~ ${item.contract.endsOn || '종료일 미입력'}`].join(' · '))}</small>
    <label for="progress-${item.id}">작업 진행상태</label>
    <select id="progress-${item.id}" data-progress-field="progress" data-progress-id="${item.id}">${PROGRESS_OPTIONS.map(step => `<option value="${step}" ${progress === step ? 'selected' : ''}>${step}</option>`).join('')}</select>
    <input data-progress-field="progressNote" data-progress-id="${item.id}" value="${escapeHtml(note)}" placeholder="진행 메모(선택)">
    <button class="button secondary" data-progress-save="${item.id}" ${auth.busy ? 'disabled' : ''}>진행상태 저장</button>
  </div>`;
}

async function runContractProgress(id) {
  const draft = (auth.progressDraft || {})[id] || {};
  const found = (auth.operator.users || []).find(item => item.id === id);
  setAuth({ busy: true, error: '', notice: '' });
  const result = await operatorSetContractProgress(id, draft.progress ?? found?.contract?.progress ?? '접수', draft.progressNote ?? found?.contract?.progressNote ?? '', auth.operator.query);
  if (!result.ok) return setAuth({ busy: false, error: result.error || '진행상태를 바꾸지 못했습니다.' });
  setAuth({ busy: false, progressDraft: {}, notice: '수주 작업 진행상태를 바꿨습니다.', operator: { ...auth.operator, users: result.users || auth.operator.users, audit: result.audit || auth.operator.audit } });
}

// 문제 확인 화면. 계획서 원문과 개인정보는 여기에 싣지 않고 단계 번호·오류 코드·시각만 보여 준다.
function operatorDetail() {
  const detail = auth.operator.detail;
  if (!detail) return '<p class="muted">계정 정보를 불러오는 중입니다.</p>';
  return `<details open><summary>진행·오류 기록과 감사기록</summary>
    <h4>최근 진행·오류 ${detail.activity.length}건</h4>
    <p class="muted">계획서 원문과 입력값은 저장하지 않습니다. 단계 번호와 오류 코드만 남습니다.</p>
    <div class="requirement-list">${detail.activity.map(event => `<article class="requirement"><div><div><span class="status ${event.kind === 'error' ? '확인-필요' : '충족'}">${event.kind === 'error' ? '오류' : '단계'}</span> <strong>${escapeHtml(event.stepLabel || '단계 정보 없음')}</strong> <span class="muted">${escapeHtml(event.code)}</span></div><small class="muted">${escapeHtml(stamp(event.at))}</small></div></article>`).join('') || '<p class="muted">아직 기록이 없습니다.</p>'}</div>
    <h4>이 계정 감사기록 ${detail.audit.length}건</h4>
    ${operatorAuditList(detail.audit)}</details>`;
}

function operatorAuditList(entries) {
  return `<div class="requirement-list">${entries.map(entry => `<article class="requirement"><div>
    <div><strong>${escapeHtml(entry.action)}</strong> <span class="status ${entry.result === 'ok' ? '충족' : '확인-필요'}">${escapeHtml(entry.result)}</span></div>
    <small class="muted">${escapeHtml(`${stamp(entry.at)} · 실행 ${entry.actorEmail || '알 수 없음'}(${entry.actorRole || '-'}) · 대상 ${entry.targetEmail || entry.targetId || '-'}`)}</small>
    ${entry.detail ? `<small class="muted">${escapeHtml(entry.detail)}</small>` : ''}
  </div></article>`).join('') || '<p class="muted">남은 기록이 없습니다.</p>'}</div>`;
}

async function submitRecovery() {
  if (auth.busy) return;
  const email = auth.emailDraft.trim();
  if (!email || !auth.codeDraft.trim() || !auth.passwordDraft) return setAuth({ error: '이메일·복구코드·새 비밀번호를 모두 입력해 주세요.' });
  setAuth({ busy: true, error: '', notice: '' });
  const result = await recoverPassword(email, auth.codeDraft, auth.passwordDraft, auth.confirmDraft).catch(() => ({ ok: false, error: '요청을 보내지 못했습니다.' }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '비밀번호를 다시 정하지 못했습니다.', passwordDraft: '', confirmDraft: '' });
  setAuth({ busy: false, mode: 'login', codeDraft: '', passwordDraft: '', confirmDraft: '', notice: '새 비밀번호를 정했습니다. 기존 로그인 상태와 남은 복구코드는 모두 해제되었습니다. 새 비밀번호로 로그인해 주세요.' });
}

async function submitLogin() {
  if (auth.busy) return;
  const email = auth.emailDraft.trim();
  if (!email || !auth.passwordDraft) return setAuth({ error: '이메일과 비밀번호를 입력해 주세요.' });
  setAuth({ busy: true, error: '' });
  const result = await login(email, auth.passwordDraft).catch(() => ({ ok: false, error: '로그인 요청을 보내지 못했습니다.' }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '로그인하지 못했습니다.', passwordDraft: '' });
  setAuth({ busy: false, error: '', emailDraft: '', passwordDraft: '', confirmDraft: '' });
  applySignedIn(result.user);
}
// 이메일 가입. 만들어지는 계정은 언제나 customer·pending이고 곧바로 가입 정보 입력 화면으로 간다.
async function submitSignup() {
  if (auth.busy) return;
  const email = auth.emailDraft.trim();
  if (!email || !auth.passwordDraft) return setAuth({ error: '이메일과 비밀번호를 입력해 주세요.' });
  setAuth({ busy: true, error: '', notice: '' });
  const result = await signupEmail(email, auth.passwordDraft, auth.confirmDraft).catch(() => ({ ok: false, error: '가입 요청을 보내지 못했습니다.' }));
  if (!result.ok) return setAuth({ busy: false, error: result.error || '가입하지 못했습니다.' });
  setAuth({ busy: false, error: '', emailDraft: '', passwordDraft: '', confirmDraft: '' });
  applySignedIn(result.user, '가입이 접수되었습니다. 아래 정보를 입력해 주세요.');
}
async function submitLogout() {
  await logout().catch(() => ({}));
  signOutLocally('로그아웃했습니다.');
}
// ---------- 공개 소개 화면 ----------
// 로그인하지 않은 사람이 가장 먼저 보는 화면. 서버를 부르지 않고 저장된 작업도 읽지 않는다.
// state를 참조하면 공용 컴퓨터에서 앞사람의 사업명이 소개 화면에 남으므로 문자열만 쓴다.
const LANDING_VALUES = [
  ['공고 근거 기반 작성', '모든 문장을 공고 원문 문장과 출처에 연결합니다. 확인되지 않은 기관 사실은 만들지 않고 [확인 필요]로 남깁니다.'],
  ['기관정보 재사용', '확인된 기관 정보와 과거 실적을 한 번 정리해 두면 사업마다 다시 입력하지 않습니다.'],
  ['AI 검증·수정', '평가기준으로 문제를 찾고 위치·근거·수정 방향을 함께 제시합니다.'],
  ['버전 보존', '수정본을 만들어도 V1·V2·V3를 덮어쓰지 않고 각각 남깁니다.']
];
const LANDING_FEATURES = [
  ['공고 분석', '공고문·첨부 자료에서 목적·자격·필수내용·평가·성과 요구를 원문 근거와 함께 정리합니다.'],
  ['기관정보 관리', '기관별 확인된 정보와 과거 실적을 나눠 보관하고 사업마다 다시 씁니다.'],
  ['사업 설계도', '신청유형·대상·프로그램·예산·성과를 한 장으로 정리하고 미확정 항목을 추적합니다.'],
  ['계획서 작성', '설계도를 기준으로 신청서 항목별 초안을 만들고 근거를 연결합니다.'],
  ['검증·코칭', '평가기준으로 문제를 찾아 위치·근거·수정 방향을 함께 제시합니다.'],
  ['수정계획과 버전', '수정 가능한 것만 반영하고 V1·V2·V3를 각각 보존합니다.'],
  ['제출본 출력', '검토본을 DOCX·PDF로 출력합니다.'],
  ['공고보관함·계획서보관함', '공고와 계획서를 보관하고 언제든 이어서 작업합니다.']
];
const LANDING_AUDIENCE = [
  ['기관 사업 담당자', '복지관·센터·비영리 기관에서 공모 신청을 직접 준비하는 담당자'],
  ['대행·컨설팅 수행자', '여러 기관의 계획서를 대신 작성하며 기관별 정보를 따로 관리해야 하는 실무자'],
  ['처음 공모에 도전하는 팀', '무엇부터 써야 할지 막막해 공고 요구사항부터 순서대로 안내받고 싶은 팀']
];
const LANDING_SECURITY = [
  ['가입 후 관리자 승인', '가입하면 먼저 가입 정보 입력 화면만 열립니다. 관리자가 승인해야 작업 화면이 열리며, 승인 전에는 서버가 작업 요청 자체를 받지 않습니다.'],
  ['비밀번호는 저장하지 않음', '비밀번호는 해시만 보관해 운영관리자도 볼 수 없습니다. 잊었을 때는 10분·1회용 복구코드를 받아 본인이 직접 새로 정합니다.'],
  ['로그인 상태는 쿠키로만', '로그인 정보는 HttpOnly·Secure 쿠키로만 오갑니다. 계정 승인·중지·복구·세션 종료 같은 운영 동작은 실행자·대상·시각이 감사기록으로 남습니다.'],
  ['원문은 요청할 때만 전송', '올린 파일과 작성 중인 내용은 분석을 요청할 때만 서버로 갑니다. 진행 상태는 이 브라우저에 보관됩니다.']
];
const LANDING_SECTIONS = [['landing-value', '핵심 가치'], ['landing-flow', '이용 흐름'], ['landing-notices', '공모정보 검색'], ['landing-features', '주요 기능'], ['membership-guide', '회원 안내'], ['landing-audience', '이용 대상'], ['landing-security', '보안·승인']];
const landingCta = extra => `<div class="landing-cta"><button class="button primary" data-landing="signup">3페이지 무료 체험</button><button class="button secondary" data-landing="login">로그인</button><button class="button secondary" data-landing-notices="1">공모정보 검색</button><button class="button secondary" data-landing-example="1">우수 계획서 예시 보기</button>${extra || ''}</div>`;
const landingCards = (items, plain = true) => items.map(([title, body]) =>
  `<article class="landing-card${plain ? ' plain' : ''}"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`).join('');

// 서비스 소개 구역. 공개 랜딩과 관리자 랜딩이 같은 내용을 쓴다.
// 한 곳에서만 고치면 두 화면이 같이 바뀐다. 따로 베껴 두지 않는다.
function introSections({ forAdmin = false } = {}) {
  return `
    <div class="landing-section" id="landing-value">
      <div class="landing-head"><h2>핵심 가치</h2><p>확인되지 않은 기관 사실은 만들지 않고, 확인이 필요한 내용은 사용자에게 남깁니다.</p></div>
      <div class="landing-grid four">${landingCards(LANDING_VALUES)}</div>
    </div>

    <div class="landing-section" id="landing-flow">
      <div class="landing-head"><h2>이용 흐름</h2><p>공고문 분석부터 사업계획서 완성까지 여섯 단계로 이어집니다.</p></div>
      <div class="landing-grid three">${HOME_FLOW.map(step => `<article class="landing-card"><header><span class="landing-step">${escapeHtml(step.no)}</span><h3>${escapeHtml(step.title)}</h3></header><p>${escapeHtml(step.desc)}</p><ul>${step.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>`).join('')}</div>
    </div>

    <div class="landing-section" id="landing-notices">
      <div class="landing-head"><h2>공모정보 검색</h2><p>회원가입 후 관리자의 승인을 받은 승인회원은 현재 모집 중인 공모정보를 검색할 수 있습니다. 수주회원은 마감 공고를 포함한 전체 수집 이력을 확인할 수 있습니다.</p></div>
      <div class="landing-grid three">
        <article class="landing-card plain"><h3>맞춤검색</h3><p>공고 제목과 제목에 연결된 연관 키워드만 찾습니다. 기본으로 켜져 있고 결과가 정확합니다.</p></article>
        <article class="landing-card plain"><h3>광역검색</h3><p>맞춤검색 범위에 공고 요약 내용까지 넓혀 찾습니다. 제목에 걸린 결과를 먼저 보여 줍니다.</p></article>
        <article class="landing-card plain"><h3>좁혀 보기</h3><p>모집 중·마감 임박·마감, 지역, 대상, 분야, 주최기관으로 걸러 볼 수 있습니다.</p></article>
      </div>
      ${forAdmin ? '<div class="landing-cta"><button class="button primary" data-admin-go="notices">공고보관함 열기</button></div>' : '<div class="landing-cta"><button class="button primary" data-landing-notices="1">공모정보 검색 열기</button></div>'}
    </div>

    <div class="landing-section" id="landing-features">
      <div class="landing-head"><h2>주요 기능</h2><p>공모사업 작성에 필요한 과정을 한 곳에서 관리합니다.</p></div>
      <div class="landing-grid four">${landingCards(LANDING_FEATURES)}</div>
    </div>

    <div class="landing-section" id="landing-audience">
      <div class="landing-head"><h2>이용 대상</h2><p>공모 신청서를 직접 쓰거나 대신 써 주는 분들을 위한 도구입니다.</p></div>
      <div class="landing-grid three">${landingCards(LANDING_AUDIENCE, false)}</div>
      <div class="landing-head" style="margin:22px 0 12px"><p>다루는 공모 유형</p></div>
      <div class="landing-grid">${TYPES.map(([, name, kind]) => `<article class="landing-card plain"><h3>${escapeHtml(name)}</h3><p>${escapeHtml(kind)} 공모를 준비하는 기관·담당자</p></article>`).join('')}</div>
    </div>

    ${membershipGuideView()}

    <div class="landing-section" id="landing-security">
      <div class="landing-head"><h2>보안·승인 안내</h2><p>실제로 구현되어 있는 내용만 적었습니다.</p></div>
      <div class="landing-grid">${landingCards(LANDING_SECURITY)}</div>
    </div>

`;
}


// ---------- 관리자 랜딩 ----------
// 최고관리자가 관리자 포털에 들어오면 먼저 보는 화면.
// 위쪽은 지금 처리할 운영 현황, 아래쪽은 공개 랜딩과 같은 서비스 소개다.
// 소개 글은 introSections() 한 곳에서 가져오므로 공개용과 따로 낡지 않는다.
const ADMIN_NAV = [['landing-value', '제품소개'], ['landing-flow', '이용방법'], ['landing-features', '주요기능'], ['landing-audience', '이용 대상'], ['landing-security', '보안·승인']];

function adminLandingView() {
  const overview = auth.adminOverview;
  const cards = new Map((overview?.cards || []).map(card => [card.key, card]));
  const badges = ADMIN_SHORTCUTS.map(item => {
    const card = cards.get(item.key);
    // 아직 못 읽었으면 숫자를 지어내지 않는다. 읽는 중이라고만 적는다.
    const value = card ? (card.value === null || card.value === undefined ? String(card.text || '') : `${Number(card.value).toLocaleString('ko-KR')}${item.unit}`)
      : (auth.adminOverviewError ? '확인 못 함' : '읽는 중');
    const note = card?.note || (auth.adminOverviewError ? auth.adminOverviewError : '');
    return `<button class="admin-shortcut" data-admin-go="${item.key}">
      <span class="admin-shortcut-label">${escapeHtml(item.label)}</span>
      <strong class="admin-shortcut-value">${escapeHtml(value)}</strong>
      <small class="admin-shortcut-note">${escapeHtml(note)}</small>
    </button>`;
  }).join('');

  return `<div class="home admin-landing">
    <header class="home-header">
      <div class="home-brand"><strong>관리자 포털</strong><span>${escapeHtml(accountEmail())} · ${escapeHtml(roleLabel(auth.user?.role))}</span></div>
      <nav class="home-nav">${ADMIN_NAV.map(([id, label]) => `<button class="button ghost" data-landing-scroll="${id}">${label}</button>`).join('')}${portalLinks('button ghost')}<button class="button ghost" id="sign-out">로그아웃</button></nav>
    </header>
    <section class="landing">
      <div class="landing-section admin-ops">
        <div class="landing-head"><h2>운영 현황</h2><p>지금 처리할 일을 건수로만 보여 줍니다. 세부 내용은 눌러서 봅니다.${overview?.at ? ` 기준 ${escapeHtml(String(overview.at).slice(0, 16).replace('T', ' '))}` : ''}</p></div>
        <div class="admin-shortcuts">${badges}</div>
        ${auth.adminOverviewError ? `<p class="muted">운영 현황을 읽지 못했습니다: ${escapeHtml(auth.adminOverviewError)}</p>` : ''}
      </div>
      <div class="landing-hero compact">
        <p class="landing-eyebrow">서비스 소개</p>
        <h1>공고 한 건에서 제출본까지,<br>근거를 남기며 씁니다</h1>
        <p class="landing-lead">회원에게 안내하는 내용과 같습니다. 공개 소개 화면과 한 곳에서 관리합니다.</p>
      </div>
      ${introSections({ forAdmin: true })}
    </section>
  </div>`;
}

// 관리자 랜딩 처리기. 바로가기와 구역 이동만 연결한다.
function bindAdminLanding() {
  document.querySelector('#sign-out')?.addEventListener('click', () => void submitLogout());
  document.querySelectorAll('[data-portal]').forEach(el => el.onclick = () => openPortal(el.dataset.portal));
  document.querySelectorAll('[data-portal-open]').forEach(el => el.onclick = () => (el.dataset.portalOpen === 'admin' ? openAdmin() : openOperator()));
  document.querySelectorAll('[data-landing-scroll]').forEach(el => el.onclick = () => document.querySelector('#' + el.dataset.landingScroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.querySelectorAll('[data-admin-go]').forEach(el => el.onclick = () => openAdminShortcut(el.dataset.adminGo));
  if (!auth.adminOverview && !auth.adminOverviewError) void loadAdminOverview();
}

// 바로가기. 없는 화면을 만들지 않고 이미 있는 관리 화면의 해당 갈래를 연다.
function openAdminShortcut(key) {
  const item = ADMIN_SHORTCUTS.find(entry => entry.key === key) || (key === 'notices' ? { tool: 'admin', tab: 'notices' } : null);
  if (!item) return;
  if (item.tool === 'coaching') return setState({ activeTool: 'coaching', notice: '관리자 도우미 화면입니다. 회원 화면과 같은 검토 도구를 씁니다.' });
  openAdmin(item.tab || 'accounts');
}

async function loadAdminOverview() {
  try {
    const data = await adminOverviewCounts();
    setAuth({ adminOverview: data, adminOverviewError: '' });
  } catch (error) {
    // 못 읽으면 못 읽었다고 적는다. 0으로 채우지 않는다.
    setAuth({ adminOverviewError: String(error?.message || '알 수 없는 오류').slice(0, 80) });
  }
}

function landingView() {
  return `<div class="layout home-layout"><main class="main"><div class="home">
    <header class="home-header">
      <div class="home-brand"><strong>사업계획서 작성 도우미</strong><span>공고 분석부터 제출본까지</span></div>
      <nav class="home-nav">${LANDING_SECTIONS.map(([id, label]) => `<button class="button ghost" data-landing-scroll="${id}">${label}</button>`).join('')}<button class="button ghost" data-landing-notices="1">공모정보 검색</button><button class="button ghost" data-landing="login">로그인</button><button class="button primary" data-landing="signup">3페이지 무료 체험</button></nav>
    </header>
    <section class="landing">
      ${auth.notice ? `<div class="alert success"><strong>${escapeHtml(auth.notice)}</strong></div>` : ''}
      <div class="landing-hero">
        <p class="landing-eyebrow">공모사업 계획서 작성·검증 도구</p>
        <h1>공고 한 건에서 제출본까지,<br>근거를 남기며 씁니다</h1>
        <p class="landing-lead">공고를 분석해 선정 논리를 세우고, 확인된 기관 정보와 이번 사업의 확정값만으로 계획서를 만듭니다. 확인되지 않은 값은 지어내지 않고 [확인 필요]로 남겨 제출 전에 정리합니다.</p>
        ${landingCta()}
        <p class="landing-note">가입 후 관리자 승인을 받으면 <strong>계정당 한 번</strong> 원하는 쪽수에 맞춘 개인 맞춤 핵심제안서를 무료로 만들어 볼 수 있습니다. 전체 계획서 작성·검증·출력은 전체 이용권 기능이며, 결제는 아직 열려 있지 않아 「${CONTACT_LABEL}」로 안내합니다. 예시 계획서는 로그인 없이 바로 볼 수 있습니다.</p>
      </div>

      ${introSections()}

      <div class="landing-section">
        <div class="landing-head"><h2>공고 하나로 시작해 제출본까지 완성하세요</h2><p>가입하고 승인받으면 공고문을 올리는 첫 단계부터 안내합니다.</p></div>
        ${landingCta()}
      </div>

      <footer class="landing-footer"><span>사업계획서 작성 도우미 · 근거 있는 계획서</span><div><button class="button secondary" data-landing-notices="1">공모정보 검색</button><button class="button secondary" data-landing="signup">3페이지 무료 체험</button><button class="button secondary" data-landing="login">로그인</button></div></footer>
    </section>
  </div></main></div>`;
}

// ---------- 공모정보 검색 ----------
// 로그인 없이 열린다. 이미 모아 둔 공고의 공개 항목만 보여 주고 AI·외부 API를 부르지 않는다.
const SEARCH_MODE_HELP = {
  focused: '공고 제목과 제목에 연결된 연관 키워드만 찾습니다. 결과가 정확합니다.',
  broad: '맞춤검색 범위에 공고 요약 내용까지 넓혀 찾습니다. 제목에 걸린 결과를 먼저 보여 줍니다.'
};
const FACET_LABELS = { state: '모집 상태', region: '지역', audience: '대상', field: '분야', organizer: '주최기관' , businessType: '사업 유형', sourceGroup: '수집 출처' };

function setSearch(patch) { setAuth({ search: { ...auth.search, ...patch } }); }
function openNoticeSearch() {
  auth = { ...auth, error: '', notice: '', view: 'notices', search: { ...emptySearch(), mode: auth.search.mode } };
  render();
  void runNoticeSearch();
}
async function runNoticeSearch(patch = {}) {
  const next = { ...auth.search, ...patch };
  setSearch({ ...patch, busy: true });
  const result = await searchPublicNotices(next.query, next.mode, next.filters).catch(() => ({ ok: false }));
  if (!result.ok) {
    // 잠긴 이유를 그대로 보여 준다. 화면을 채우려고 가짜 공고를 만들지 않는다.
    return setAuth({
      error: '',
      search: { ...auth.search, busy: false, loaded: true, notices: [], total: 0, facets: null, locked: result.error || '공모정보를 불러오지 못했습니다.', needsSignup: Boolean(result.needsSignup), needsApproval: Boolean(result.needsApproval) }
    });
  }
  setSearch({ busy: false, loaded: true, notices: result.notices || [], total: result.total || 0, facets: result.facets || null, signupNotice: result.signupNotice || '', scopeLabel: result.scopeLabel || '', locked: '', needsSignup: false, needsApproval: false, selected: '', detail: null });
}
async function openNoticeDetail(key) {
  if (auth.search.selected === key) return setSearch({ selected: '', detail: null });
  setSearch({ selected: key, detail: null });
  const result = await publicNoticeDetail(key).catch(() => ({ ok: false }));
  if (!result.ok) return setAuth({ error: result.error || '공모정보를 불러오지 못했습니다.' });
  setSearch({ detail: result.notice });
}
const activeFilters = () => Object.entries(auth.search.filters).filter(([, value]) => value);

// 지금 이 사람에게 열려 있는 검색 범위를 알린다. 결과가 막혀도 이유를 감추지 않는다.
function searchScopeNotice() {
  const view = auth.search;
  if (view.locked) {
    return `<div class="alert warning"><strong>${escapeHtml(view.locked)}</strong>${view.needsSignup ? '<p>회원가입 후 관리자의 승인을 받으면 현재 모집 중인 공모정보를 검색할 수 있습니다.</p>' : ''}${view.needsApproval ? '<p>승인 후 승인회원이 되면 열립니다.</p>' : ''}</div>`;
  }
  if (view.scopeLabel) return `<p class="muted">검색 범위: ${escapeHtml(view.scopeLabel)}</p>`;
  return '';
}
function noticeSearchView() {
  const view = auth.search;
  const signedIn = auth.status === 'signedIn';
  return `<div class="layout home-layout"><main class="main"><div class="home">
    <header class="home-header">
      <div class="home-brand"><strong>공모정보 검색</strong><span>이미 모아 둔 공모정보를 찾아봅니다</span></div>
      <nav class="home-nav">${signedIn
    ? '<button class="button primary" data-landing-back="1">← 내 화면으로</button>'
    : '<button class="button ghost" data-landing-back="1">← 서비스 소개</button><button class="button ghost" data-landing-example="1">계획서 예시</button><button class="button primary" data-landing="login">로그인</button>'}</nav>
    </header>
    <section class="landing">
      ${auth.error ? `<div class="alert danger"><strong>${escapeHtml(auth.error)}</strong></div>` : ''}
      <div class="landing-hero">
        <p class="landing-eyebrow">공모정보 검색</p>
        <h1>어떤 공모가 열려 있는지 먼저 보세요</h1>
        <p class="landing-lead">회원가입 후 관리자의 승인을 받은 승인회원은 현재 모집 중인 공모정보를 검색할 수 있습니다. 수주회원은 마감 공고를 포함한 전체 수집 이력을 확인할 수 있습니다.</p>${searchScopeNotice()}
        <div class="actions" style="justify-content:stretch;gap:8px;margin-top:18px">
          ${['focused', 'broad'].map(mode => `<button class="button ${view.mode === mode ? 'primary' : 'secondary'}" data-search-mode="${mode}" aria-pressed="${view.mode === mode}">${mode === 'focused' ? '맞춤검색' : '광역검색'}</button>`).join('')}
        </div>
        <p class="landing-note">${escapeHtml(SEARCH_MODE_HELP[view.mode])}</p>
        <div class="field" style="margin-top:14px"><label for="notice-query">검색어</label><input id="notice-query" placeholder="예: 아동 정서, 청년 창업, 복권기금" value="${escapeHtml(view.queryDraft)}"></div>
        <div class="landing-cta"><button class="button primary" id="notice-search-run" ${view.busy ? 'disabled' : ''}>${view.busy ? '찾는 중…' : '검색'}</button>${activeFilters().length ? '<button class="button secondary" id="notice-filter-reset">필터 해제</button>' : ''}</div>
      </div>
      ${noticeFacets(view)}
      <div class="landing-section">
        <div class="landing-head"><h2>검색 결과 ${view.total}건</h2><p>${view.busy ? '찾는 중입니다.' : view.query ? `「${escapeHtml(view.query)}」 · ${view.mode === 'focused' ? '맞춤검색' : '광역검색'} · 제목 일치 → 연관 키워드 → 요약 순으로 보여 줍니다.` : '검색어 없이 최근 공모부터 보여 줍니다.'}</p></div>
        <div class="landing-grid">${view.notices.map(noticeCard).join('') || (view.loaded ? '<p class="muted">조건에 맞는 공모정보가 없습니다. 광역검색으로 넓혀 보세요.</p>' : '<p class="muted">불러오는 중입니다.</p>')}</div>
        ${view.total > view.notices.length ? `<p class="muted">상위 ${view.notices.length}건만 보여 줍니다. 검색어나 필터로 좁혀 주세요.</p>` : ''}
      </div>
      ${signedIn ? '' : `<div class="landing-section">
        <div class="landing-head"><h2>더 필요하신가요</h2><p>${escapeHtml(view.signupNotice || '상세 적합성 분석과 맞춤 사업설계는 회원가입 후 이용할 수 있습니다.')}</p></div>
        ${landingCta()}
      </div>`}
      <footer class="landing-footer"><span>공개된 공모정보만 보여 줍니다 · 개인정보와 회원 자료는 포함하지 않습니다</span><div><button class="button secondary" data-landing-back="1">${signedIn ? '내 화면으로' : '서비스 소개로'}</button></div></footer>
    </section>
  </div></main></div>`;
}

// 면 이름표. 사업 유형과 수집 출처는 등록부의 말을 그대로 쓴다.
function facetLabel(key, value) {
  if (key === 'businessType') return BUSINESS_TYPES.find(item => item.key === value)?.label || value;
  if (key === 'sourceGroup') return SOURCE_GROUPS.find(item => item.key === value)?.label || value;
  return value;
}

function noticeFacets(view) {
  if (!view.facets) return '';
  // 사업 유형과 수집 출처는 서로 다른 축이다. 둘을 따로 고른다.
  const groups = ['businessType', 'sourceGroup', 'state', 'region', 'audience', 'field', 'organizer']
    .map(key => {
      const items = (view.facets[key] || []).filter(item => item.total).slice(0, 8)
        .map(item => ({ ...item, label: item.label || facetLabel(key, item.value) }));
      if (!items.length) return '';
      const current = view.filters[key] || '';
      return `<article class="landing-card plain"><h3>${FACET_LABELS[key]}</h3><div class="actions" style="flex-wrap:wrap;gap:6px;margin:0;justify-content:flex-start">
        ${items.map(item => `<button class="button ${current === item.value ? 'primary' : 'secondary'}" data-search-filter="${key}" data-search-value="${escapeHtml(item.value)}">${escapeHtml(item.label || item.value)} ${item.total}</button>`).join('')}
      </div></article>`;
    }).join('');
  if (!groups) return '';
  return `<div class="landing-section"><div class="landing-head"><h2>좁혀 보기</h2><p>모집 상태·지역·대상·분야·주최기관으로 걸러 볼 수 있습니다.</p></div><div class="landing-grid">${groups}</div></div>`;
}

function noticeCard(item) {
  const open = auth.search.selected === item.key;
  const detail = open ? auth.search.detail : null;
  const tags = [...item.region, ...item.audience, ...item.field].slice(0, 6);
  return `<article class="landing-card">
    <header><span class="status ${item.state === 'closed' ? '확인-필요' : '충족'}">${escapeHtml(item.stateLabel)}</span><h3>${escapeHtml(item.title)}</h3></header>
    <p><strong>${escapeHtml(item.organizer)}</strong>${item.matchedBy ? ` · <span class="muted">${escapeHtml(item.matchedBy)}</span>` : ''}</p>
    <ul>
      <li>접수기간: ${escapeHtml(item.applicationPeriod || '공고 확인 필요')}${item.deadline ? ` (마감 ${escapeHtml(item.deadline)})` : ''}</li>
      <li>지원금액: ${escapeHtml(item.supportAmount || '공고 확인 필요')}</li>
      <li>지원대상: ${escapeHtml((item.eligibility || '공고 확인 필요').slice(0, 120))}</li>
    </ul>
    ${tags.length ? `<p>${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join(' ')}</p>` : ''}
    ${open ? (detail ? `<div class="alert"><strong>요약</strong><p>${escapeHtml(detail.summary || '요약이 없습니다.')}</p>${detail.supportDetails ? `<p><strong>지원내용</strong> ${escapeHtml(detail.supportDetails.slice(0, 600))}</p>` : ''}<p class="muted">원문 출처: ${escapeHtml(detail.sourceLabel)}${detail.sourceUrl ? ` · ${escapeHtml(detail.sourceUrl)}` : ' (출처 주소 미기록)'}</p></div>` : '<p class="muted">불러오는 중입니다.</p>') : ''}
    <button class="button secondary" data-notice-open="${escapeHtml(item.key)}">${open ? '접기' : '자세히'}</button>
  </article>`;
}

// 로그인 없이 보는 정적 예시. 서버를 부르지 않고 example-plan.js의 문자열만 그린다.
// 개인정보와 실제 기관정보는 그 파일에 들어 있지 않다.
function exampleView() {
  return `<div class="layout home-layout"><main class="main"><div class="home">
    <header class="home-header">
      <div class="home-brand"><strong>${escapeHtml(EXAMPLE_TITLE)}</strong><span>로그인 없이 볼 수 있는 예시입니다</span></div>
      <nav class="home-nav">${auth.status === 'signedIn'
    ? '<button class="button primary" data-landing-back="1">← 내 화면으로</button>'
    : '<button class="button ghost" data-landing-back="1">← 서비스 소개</button><button class="button ghost" data-landing-notices="1">공모정보 검색</button><button class="button ghost" data-landing="login">로그인</button><button class="button primary" data-landing="signup">3페이지 무료 체험</button>'}</nav>
    </header>
    <section class="landing">
      <div class="landing-hero">
        <p class="landing-eyebrow">우수 계획서 예시</p>
        <h1>잘 쓴 계획서는 이렇게 생겼습니다</h1>
        <p class="landing-lead">${escapeHtml(EXAMPLE_SUMMARY)}</p>
        <div class="alert warning"><strong>가상의 예시입니다</strong><p>${escapeHtml(EXAMPLE_NOTE)}</p></div>
      </div>
      <div class="landing-section">
        <div class="landing-head"><h2>이 예시가 지키는 것</h2></div>
        <div class="landing-grid four">${EXAMPLE_POINTS.map(([title, body]) => `<article class="landing-card plain"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`).join('')}</div>
      </div>
      <div class="landing-section">
        <div class="landing-head"><h2>계획서 본문 ${EXAMPLE_SECTIONS.length}개 항목</h2><p>실제 작업 화면이 만드는 구조와 같은 순서입니다.</p></div>
        <div class="landing-grid">${EXAMPLE_SECTIONS.map(item => `<article class="landing-card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p><ul><li>근거: ${escapeHtml(item.evidence)}</li></ul></article>`).join('')}</div>
      </div>
      ${auth.status === 'signedIn' ? '' : `<div class="landing-section">
        <div class="landing-head"><h2>직접 만들어 보세요</h2><p>가입하고 승인을 받으면 계정당 한 번 원하는 쪽수에 맞춘 개인 맞춤 핵심제안서를 무료로 만들 수 있습니다.</p></div>
        ${landingCta()}
      </div>`}
      <footer class="landing-footer"><span>사업계획서 작성 도우미 · 근거 있는 계획서</span><div><button class="button secondary" data-landing-back="1">${auth.status === 'signedIn' ? '내 화면으로' : '서비스 소개로'}</button></div></footer>
    </section>
  </div></main></div>`;
}

// ---------- MS12 핵심제안서 ----------
// 첫 단계에서 제안자·아이디어·목적·제출처·희망 쪽수를 받고, 그 조건에 맞는 제안서를 만든다.
// 공모사업계획서(전체 계획서)와는 다른 기능이다. 사용 횟수 제한과 서버 차단은 그대로 쓴다.
const AUDIENCE_OPTIONS = [
  ['public', '관공서·공공기관', '공익성 · 정책 연계 · 실행체계 · 예산 · 성과'],
  ['company', '기업', '기대효과 · 차별성 · 비용 대비 가치 · 협력방식'],
  ['foundation', '재단·복지기관', '대상자의 필요 · 사회적 가치 · 성과 · 지속가능성'],
  ['school', '학교·교육기관', '대상 · 교육목표 · 운영과정 · 안전 · 기대효과'],
  ['internal', '내부보고', '필요성 · 효율성 · 실행 가능성 · 의사결정 요청'],
  ['other', '기타', '적으신 목적과 받는 분을 기준으로 구성']
];
const CORE_MIN_IDEA = 20;
const CORE_MIN_PAGES = 1;
const CORE_MAX_PAGES = 20;
const CORE_LOCKED = [
  ['공모사업 전체 계획서', '공고를 분석해 신청서 10개 항목과 제출용 표까지 만드는 기능'],
  ['상세 산출내역·제출용 예산표', '인건비 단가 × 수량 × 개월수까지 계산해 서식 예산표로 만드는 기능'],
  ['반복 재작성·부분 수정', '문제를 지목해 항목만 다시 쓰는 기능'],
  ['검증·코칭', '평가기준으로 문제를 찾고 수정 방향을 받는 기능'],
  ['공고보관함·계획서보관함', '공고와 계획서를 계정에 보관하고 이어서 작업하는 기능']
];
// 저장해 둔 내 기관정보를 한 덩어리 글로 만든다. 새로 만드는 문서부터 이 값을 쓴다.
// 이미 저장된 계획서는 이 값으로 다시 쓰지 않는다.
function memberFactsText() {
  const profile = auth.memberProfile || {};
  const rows = [['기관명', profile.orgName], ['기관 유형', profile.orgType], ['기관 주소', profile.orgAddress],
    ['기관 소개', profile.orgIntro], ['보유 인력', profile.staff], ['시설과 장비', profile.facilities],
    ['주요 프로그램', profile.programs], ['사업 실적', profile.achievements], ['협력기관', profile.partners],
    ['추가 참고', profile.reuseNote]].filter(([, value]) => String(value || '').trim());
  return rows.map(([label, value]) => `${label}: ${String(value).trim()}`).join('\n');
}
function emptyCoreDraft() {
  return { proposer: '', coreIdea: '', purpose: '', audienceType: 'public', recipient: '', targetPages: '3', sourceText: '' };
}
// 항목을 쪽별로 묶는다. 미리보기와 출력이 같은 쪽 나눔을 쓴다.
function corePagesOf(result) {
  const pages = new Map();
  for (const section of result.sections || []) {
    const page = Number(section.page) || 1;
    if (!pages.has(page)) pages.set(page, []);
    pages.get(page).push(section);
  }
  return [...pages.entries()].sort((a, b) => a[0] - b[0]);
}
// 쪽이 바뀌는 첫 항목의 자리. 출력에서 여기서만 쪽을 넘긴다.
function corePageBreaks(result) {
  const breaks = [];
  let current = 0;
  (result.sections || []).forEach((section, index) => {
    const page = Number(section.page) || 1;
    if (index && page > current) breaks.push(index);
    current = page;
  });
  return breaks;
}
const coreExportPayload = result => ({
  project: { title: result.title || 'MS12 핵심제안서' },
  sections: (result.sections || []).map(section => ({ id: section.id, title: section.title, content: section.content, status: '확정' })),
  tables: (result.tables || []).map(table => ({ title: table.title, columns: table.columns, rows: table.rows })),
  pageBreaks: corePageBreaks(result)
});

function coreProposalView() {
  const done = Boolean(auth.user?.trialUsed);
  const draft = auth.core.draft;
  const result = auth.core.result;
  const busy = auth.busy;
  const audience = AUDIENCE_OPTIONS.find(([key]) => key === draft.audienceType) || AUDIENCE_OPTIONS[0];
  return `<div class="layout home-layout"><main class="main"><div class="home">
    <header class="home-header">
      <div class="home-brand"><strong>MS12 핵심제안서</strong><span>${escapeHtml(accountEmail())}</span></div>
      <nav class="home-nav"><button class="button ghost" data-landing-notices="1">공모정보 검색</button><button class="button ghost" data-landing-example="1">우수 계획서 예시</button><button class="button ghost" id="sign-out">로그아웃</button></nav>
    </header>
    <section class="landing">
      ${auth.error ? `<div class="alert danger"><strong>${escapeHtml(auth.error)}</strong></div>` : ''}
      ${auth.notice ? `<div class="alert success"><strong>${escapeHtml(auth.notice)}</strong></div>` : ''}
      <div class="landing-hero">
        <p class="landing-eyebrow">무료 회원 · 계정당 1회</p>
        <h1>제안 조건을 알려 주시면 그에 맞는 제안서를 만듭니다</h1>
        <p class="landing-lead">받는 곳과 원하는 쪽수에 맞춰 항목 구성과 분량을 먼저 설계하고, 그 구성대로 본문을 씁니다. 같은 말을 늘려 쪽수를 채우지 않습니다.</p>
        <p class="landing-note">${done ? '무료 생성을 이미 사용했습니다. 아래 결과는 다시 볼 수 있지만 새로 만들 수는 없습니다.' : '한 번만 실행됩니다. 아래 내용을 채운 뒤 눌러 주세요.'}</p>
      </div>
      <div class="landing-section">
        <div class="landing-head"><h2>제안 조건</h2><p>두 가지만 적으면 됩니다. 어디에 내는지, 그리고 내가 무엇을 할 수 있고 무엇을 하려는지. 적으신 내용만 근거로 쓰고, 적지 않은 실적·인력·예산은 만들어 넣지 않습니다.</p></div>
        
        
        
        
        
        
        <h3 style="margin:10px 0 4px">1. 어디에 제안하나요</h3>
<div class="field"><label for="core-audience">제출처 유형</label><select id="core-audience" ${done || busy ? 'disabled' : ''}>${AUDIENCE_OPTIONS.map(([key, label]) => `<option value="${key}" ${draft.audienceType === key ? 'selected' : ''}>${label}</option>`).join('')}</select><small class="muted">강조점: ${escapeHtml(audience[2])}</small></div>
<div class="field"><label for="core-recipient">실제 제출기관명 (선택)</label><input id="core-recipient" placeholder="예: ○○시청 아동청소년과" value="${escapeHtml(draft.recipient)}" ${done || busy ? 'disabled' : ''}></div>
        <h3 style="margin:16px 0 4px">2. 내 여건과 하려는 일</h3>
<div class="field"><label>제안자·기관 기본정보</label>
          ${memberFactsText()
            ? `<p class="muted" style="white-space:pre-wrap;margin:0">${escapeHtml(memberFactsText())}</p><small class="muted">「내 정보」에 적어 둔 기관정보를 그대로 씁니다. 여기서 다시 적지 않습니다.</small>`
            : '<p class="muted" style="margin:0">아직 적어 둔 기관정보가 없습니다. 아래에서 한 번 적어 두면 이 제안서와 다음 문서에 계속 쓰입니다.</p>'}
          <div class="actions" style="margin:6px 0 0"><span class="muted">기관명·인력·실적을 적어 두면 [확인 필요]가 줄어듭니다.</span>
            <button class="button secondary" id="core-open-profile" type="button">${memberFactsText() ? '기관정보 고치기' : '기관정보 적기'}</button></div>
        </div>
        ${auth.memberOpen ? memberProfileForm() : ''}
<div class="field"><label for="core-idea">핵심 아이디어 <span class="status 확인-필요">필수</span></label><textarea id="core-idea" class="source-text" placeholder="무엇을, 누구에게, 어떻게 하려는지 적어 주세요.&#10;예1) 초등 4~6학년 정서지원 집단 프로그램을 주 1회 16회기로 운영합니다. 학교 상담교사 추천으로 12명을 모집하고, 회기마다 정서표현 활동과 보호자 상담을 함께 합니다.&#10;예2) 홀몸 어르신 30명에게 주 2회 반찬을 배달하며 안부를 확인하고, 이상 징후가 보이면 주민센터에 연계합니다.&#10;예3) 청년 자영업자 20팀에게 온라인 판로 교육 8회와 1:1 컨설팅 3회를 제공해 매출 회복을 돕습니다." ${done || busy ? 'disabled' : ''}>${escapeHtml(draft.coreIdea)}</textarea><small class="muted">${CORE_MIN_IDEA}자 이상 · 지금 ${draft.coreIdea.trim().length}자 · 대상·인원·횟수·방법이 들어가면 제안서가 구체해집니다. 모르는 숫자는 비워 두세요.</small></div>
        <details><summary>더 적을 것이 있으면 (선택)</summary>

<div class="field"><label for="core-pages">희망 페이지 수</label><input id="core-pages" type="number" min="${CORE_MIN_PAGES}" max="${CORE_MAX_PAGES}" step="1" value="${escapeHtml(draft.targetPages)}" ${done || busy ? 'disabled' : ''}><small class="muted">${CORE_MIN_PAGES}~${CORE_MAX_PAGES}쪽 · 쪽수에 따라 항목 수와 분량이 달라집니다</small></div>
        </details>
        <details><summary>참고 자료 붙여넣기 (선택)</summary><div class="field"><label for="core-source">공고문·안내문 등</label><textarea id="core-source" placeholder="있으면 붙여넣어 주세요. 없어도 됩니다." ${done || busy ? 'disabled' : ''}>${escapeHtml(draft.sourceText)}</textarea></div></details>
        <div class="actions"><span class="muted">${done ? '사용 완료' : `${escapeHtml(audience[1])} · ${escapeHtml(draft.targetPages || '?')}쪽`}</span><button class="button primary" id="core-run" ${done || busy ? 'disabled' : ''}>${busy ? '만드는 중…' : '핵심제안서 만들기'}</button></div>
      </div>
      ${result ? coreResultView(result) : ''}
      <div class="landing-section">
        <div class="landing-head"><h2>전체 이용권 기능</h2><p>아래 기능은 핵심제안서에 들어 있지 않습니다. 결제는 아직 열려 있지 않아 「${CONTACT_LABEL}」로 안내합니다.</p></div>
        <div class="landing-grid">${CORE_LOCKED.map(([title, body]) => `<article class="landing-card plain"><h3>${escapeHtml(title)} <span class="status 확인-필요">${CONTACT_LABEL}</span></h3><p>${escapeHtml(body)}</p></article>`).join('')}</div>
      </div>
      <div class="landing-section">${accountLinkPanel()}</div>
      <footer class="landing-footer"><span>MS12 핵심제안서 · 공모사업 전체 계획서와는 다른 기능입니다</span><div><button class="button secondary" data-landing-example="1">우수 계획서 예시</button></div></footer>
    </section>
  </div></main></div>`;
}

// 2단계 · 만들어진 제안서. 쪽별로 나눠 보여 주고 그대로 내려받게 한다.
function coreResultView(result) {
  const pages = corePagesOf(result);
  return `<div class="landing-section" id="core-result">
    <div class="landing-head"><h2>2단계 · ${escapeHtml(result.title || '핵심제안서')}</h2><p>${escapeHtml(result.audience || '')} 제출용 · 목표 ${result.targetPages}쪽 · 실제 구성 ${pages.length}쪽. 확인되지 않은 값은 [확인 필요]로 남깁니다.</p></div>
    ${result.summary ? `<div class="alert"><strong>한 줄 요약</strong><p>${escapeHtml(result.summary)}</p></div>` : ''}
    ${guardPanel(result.guard)}
    ${evidencePanel(result.evidence)}
    <div class="actions"><span class="muted">저장되지 않습니다. 필요하면 내려받아 두세요.</span><div><button class="button secondary" id="core-docx" ${auth.busy ? 'disabled' : ''}>DOCX 내려받기</button><button class="button secondary" id="core-pdf" ${auth.busy ? 'disabled' : ''}>PDF 내려받기</button></div></div>
    ${pages.map(([page, sections]) => `<article class="landing-card"><header><span class="landing-step">${page}</span><h3>${page}쪽</h3></header>
      ${sections.map(section => `<div><strong>${escapeHtml(section.title)}</strong><p style="white-space:pre-wrap">${escapeHtml(section.content)}</p><small class="muted">${section.content.length}자 / 계획 ${section.plannedChars}자</small></div>`).join('')}
    </article>`).join('')}
    ${(result.tables || []).length ? `<div class="landing-grid">${result.tables.map(table => `<article class="landing-card plain"><h3>${escapeHtml(table.title)} <span class="muted">${table.page}쪽</span></h3>
      <div class="responsive-table"><table><thead><tr>${(table.columns || []).map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
      <tbody>${(table.rows || []).map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></article>`).join('')}</div>` : ''}
    ${(result.checkNeeded || []).length ? `<div class="alert warning"><strong>확인 필요 ${result.checkNeeded.length}건</strong><ul>${result.checkNeeded.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
  </div>`;
}

async function runCoreProposal() {
  if (auth.busy || auth.user?.trialUsed) return;
  const draft = auth.core.draft;
  if (draft.coreIdea.trim().length < CORE_MIN_IDEA) return setAuth({ error: `핵심 아이디어를 ${CORE_MIN_IDEA}자 이상 적어 주세요.`, notice: '' });
  const pages = Number(draft.targetPages);
  if (!Number.isInteger(pages) || pages < CORE_MIN_PAGES || pages > CORE_MAX_PAGES) {
    return setAuth({ error: `희망 페이지 수를 ${CORE_MIN_PAGES}~${CORE_MAX_PAGES} 사이 숫자로 적어 주세요.`, notice: '' });
  }
  setAuth({ busy: true, error: '', notice: '' });
  const result = await coreProposalWithAI({
    proposer: draft.proposer.trim(), coreIdea: draft.coreIdea.trim(), purpose: draft.purpose.trim(),
    audienceType: draft.audienceType, recipient: draft.recipient.trim(), targetPages: pages, sourceText: draft.sourceText.trim()
  }).catch(error => ({ error: error?.message || '핵심제안서를 만들지 못했습니다.' }));
  if (result?.error) {
    const spent = /한 번만/.test(result.error);
    return setAuth({ busy: false, error: result.error, user: spent ? { ...auth.user, trialUsed: true } : auth.user });
  }
  setAuth({
    busy: false, notice: `핵심제안서를 만들었습니다(${result.targetPages}쪽). 무료 생성은 여기까지입니다.`,
    user: { ...auth.user, trialUsed: true }, core: { ...auth.core, result }
  });
}

// 내려받기. 목표 쪽수에 맞춰 정해진 자리에서만 쪽을 넘기고 글자 크기·여백은 줄이지 않는다.
async function downloadCoreProposal(kind) {
  const result = auth.core.result;
  if (!result || auth.busy) return;
  const payload = coreExportPayload(result);
  setAuth({ busy: true, error: '' });
  try {
    if (kind === 'pdf') await exportProposalPdf({ ...payload, fileName: `${payload.project.title}.pdf` });
    else await exportDocx(payload.project, payload.sections, { forSubmission: true, tables: payload.tables, pageBreaks: payload.pageBreaks });
    setAuth({ busy: false, notice: '내려받았습니다.' });
  } catch { setAuth({ busy: false, error: '파일을 만들지 못했습니다.' }); }
}

// 로그인과 회원가입을 한 화면에서 또렷하게 나눈다. 지금 무엇을 하는 중인지 늘 보이게 한다.
function loginView() {
  const checking = auth.status === 'checking';
  const joining = auth.mode === 'signup';
  const recovering = auth.mode === 'recover';
  const headline = checking ? '로그인 상태를 확인하는 중입니다.'
    : recovering ? '운영관리자에게 받은 일회용 복구코드로 새 비밀번호를 정합니다.'
    : joining ? '처음이시면 여기서 계정을 만드세요.' : '이미 계정이 있으면 로그인하세요.';
  return `<div class="layout home-layout"><main class="main"><div class="card" id="login-card" style="max-width:460px;margin:7vh auto">
    <div class="card-title"><div><h3>MS12 사업계획서 작성 도우미</h3><span>${headline}</span></div><button class="button secondary" id="back-to-landing" type="button">← 서비스 소개</button><button class="button secondary" type="button" data-open-membership="login">회원 안내</button></div>
    ${auth.error ? `<div class="alert danger"><strong>${escapeHtml(auth.error)}</strong></div>` : ''}
    ${auth.notice ? `<div class="alert success"><strong>${escapeHtml(auth.notice)}</strong></div>` : ''}
    <div class="actions" style="justify-content:stretch;gap:8px">
      <button class="button ${auth.mode === 'login' ? 'primary' : 'secondary'}" id="mode-login" type="button" aria-pressed="${auth.mode === 'login'}">로그인</button>
      <button class="button ${joining ? 'primary' : 'secondary'}" id="mode-signup" type="button" aria-pressed="${joining}">회원가입</button>
      <button class="button ${recovering ? 'primary' : 'secondary'}" id="mode-recover" type="button" aria-pressed="${recovering}">복구코드</button>
    </div>
    ${recovering ? recoveryForm(checking) : `
    <div class="actions" style="justify-content:stretch"><div style="display:flex;gap:8px;flex-wrap:wrap">${socialButtons('signup')}</div></div>
    <p class="muted">Google·카카오 계정이 있으면 비밀번호 없이 ${joining ? '가입' : '로그인'}할 수 있습니다. 처음이면 그대로 가입되고, 이미 가입했으면 그 계정으로 들어갑니다.</p>
    <p class="muted">— 또는 이메일로 ${joining ? '가입' : '로그인'} —</p>
    <form id="login-form" autocomplete="on">
      <div class="field"><label for="login-email">이메일</label><input id="login-email" type="email" autocomplete="${joining ? 'email' : 'username'}" placeholder="name@example.com" value="${escapeHtml(auth.emailDraft)}" ${checking ? 'disabled' : ''}></div>
      <div class="field"><label for="login-password">비밀번호</label><input id="login-password" type="password" autocomplete="${joining ? 'new-password' : 'current-password'}" value="${escapeHtml(auth.passwordDraft)}" ${checking ? 'disabled' : ''}>${joining ? '<small class="muted">6자 이상으로 정해 주세요.</small>' : ''}</div>
      ${joining ? `<div class="field"><label for="login-password-confirm">비밀번호 확인</label><input id="login-password-confirm" type="password" autocomplete="new-password" value="${escapeHtml(auth.confirmDraft)}" ${checking ? 'disabled' : ''}></div>` : ''}
      ${joining ? signupHintView() : ''}
      <div class="actions"><span class="muted">${joining ? '네이버·다음 등 어떤 이메일이든 됩니다.' : ''}</span><button class="button primary" id="login-submit" type="submit" ${checking || auth.busy ? 'disabled' : ''} >${auth.busy ? '처리 중…' : joining ? '가입 신청' : '로그인'}</button></div>
    </form>
    <p class="muted">${joining ? '가입한 뒤 관리자가 승인해야 작업 화면이 열립니다. 가입 직후에는 기관·담당자 정보를 입력하는 화면이 나옵니다.' : '비밀번호를 잊었으면 운영관리자에게 일회용 복구코드를 요청한 뒤 위의 「복구코드」를 누르세요.'}</p>`}
    ${membershipGuideView({ compact: true })}
    </div></main></div>`;
}

// 복구코드로 본인이 직접 새 비밀번호를 정한다. 운영관리자는 이 값을 보거나 정할 수 없다.
function recoveryForm(checking) {
  return `<form id="recovery-form" autocomplete="off">
    <div class="field"><label for="recovery-email">이메일</label><input id="recovery-email" type="email" autocomplete="username" placeholder="name@example.com" value="${escapeHtml(auth.emailDraft)}" ${checking ? 'disabled' : ''}></div>
    <div class="field"><label for="recovery-code">복구코드</label><input id="recovery-code" autocomplete="one-time-code" placeholder="ABCD-EFGH-JKMN" value="${escapeHtml(auth.codeDraft)}" ${checking ? 'disabled' : ''}><small class="muted">발급 후 10분 동안 한 번만 쓸 수 있습니다.</small></div>
    <div class="field"><label for="recovery-password">새 비밀번호</label><input id="recovery-password" type="password" autocomplete="new-password" value="${escapeHtml(auth.passwordDraft)}" ${checking ? 'disabled' : ''}><small class="muted">6자 이상으로 정해 주세요.</small></div>
    <div class="field"><label for="recovery-password-confirm">새 비밀번호 확인</label><input id="recovery-password-confirm" type="password" autocomplete="new-password" value="${escapeHtml(auth.confirmDraft)}" ${checking ? 'disabled' : ''}></div>
    <div class="actions"><span class="muted">정하고 나면 기존 로그인 상태와 남은 복구코드가 모두 해제됩니다.</span><button class="button primary" id="recovery-submit" type="submit" ${checking || auth.busy ? 'disabled' : ''}>${auth.busy ? '처리 중…' : '새 비밀번호 정하기'}</button></div>
  </form>
  <p class="muted">운영관리자는 비밀번호를 보거나 대신 정할 수 없습니다. 복구코드만 발급하고, 비밀번호는 본인이 이 화면에서 직접 정합니다.</p>`;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('ms12_project_v3') || '{}');
    // 이전 버전의 자유입력 회사 정보는 사용자 확인 기록이 없으므로 확정 정보로 승격하지 않는다.
    delete saved.manualCompanyFacts;
    const stagedGeneration = saved.stagedGeneration && typeof saved.stagedGeneration === 'object'
      ? { ...structuredClone(initial.stagedGeneration), ...saved.stagedGeneration, parts: Array.isArray(saved.stagedGeneration.parts) ? saved.stagedGeneration.parts : [], completedGroupIds: Array.isArray(saved.stagedGeneration.completedGroupIds) ? saved.stagedGeneration.completedGroupIds : [] }
      : structuredClone(initial.stagedGeneration);
    const restored = { ...structuredClone(initial), ...saved, coaching: { ...structuredClone(initial.coaching), ...(saved.coaching || {}) }, stagedGeneration, step: Math.max(0, Math.min(STEPS.length - 1, Number(saved.step) || 0)), companyFactDraft: '', archiveKeyDraft: '', noticeResults: [], noticeSources: [], archiveNotices: [], archiveProposals: [], selectedNoticeIndexes: [], noticePreview: null, pendingNoticeChoice: null, noticeUrlDraft: '', busy: '', error: '', applicantItemDrafts: {}, applicantNameDraft: '', projectValueDraft: { label: '', value: '', applicantItemId: '' }, applicantDocDraft: '', applicantExtraction: null, coachingSelection: [], attachmentLinks: {}, submissionZip: null };
    // 알 수 없는 포털 값이 남아 있으면 다시 고르게 한다.
    restored.portal = ['admin', 'proposal'].includes(saved.portal) ? saved.portal : '';
    // 예전에 저장한 상태에는 의뢰 건 정보가 없다. 빈 값으로 채우기만 하고 기존 데이터는 건드리지 않는다.
    restored.engagement = normalizeEngagement(saved.engagement || {});
    // 예전에 저장한 버전에는 식별자·표가 없다. 빠진 것만 채우고 값은 그대로 둔다.
    restored.proposalVersions = normalizeProposalVersions(saved.proposalVersions);
    // 어느 버전을 쓰는지 정해지지 않았으면 가장 최근 버전으로 시작한다(잘못된 식별자는 대체하지 않는다).
    if (!restored.currentVersionId && restored.proposalVersions.length) restored.currentVersionId = restored.proposalVersions[restored.proposalVersions.length - 1].versionId;
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
  // 각론을 폈는지·어디에 집중했는지는 이번 화면에서만 쓴다. 저장하면 다음에 들어와도 펼쳐진 채로 나온다.
  const safe = { ...state, reviewDetail: false, reviewPanels: [], reviewFocus: false, companyFactDraft: '', archiveKeyDraft: '', noticeResults: [], noticeSources: [], archiveNotices: [], archiveProposals: [], noticeUrlDraft: '', busy: '', error: '', applicantItemDrafts: {}, applicantNameDraft: '', applicantComparison: null, applicantDocDraft: '', applicantExtraction: null, files: state.files.map(({ text, ...meta }) => meta),
    // 첨부 원본은 브라우저 메모리에만 있다. 새로고침 뒤에 파일이 있다고 잘못 말하지 않도록 연결 기록도 저장하지 않는다.
    attachmentLinks: {}, submissionZip: null };
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
  // 단계 이동으로 끝나는 AI 작업도 완료 표시와 결과 이동을 똑같이 받는다.
  let next = patch;
  if (Object.hasOwn(patch, 'busy') && !patch.busy) {
    const result = closeAiTask(patch);
    if (result) next = { ...patch, aiResult: result };
    busyStartedAt = 0;
  }
  state = { ...state, ...next, step: location.step };
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
  // 화면이 보는 작업공간과 서버로 가는 값을 하나로 맞춘다.
  setArchiveWorkspace(inAgencyWorkspace() ? 'agency' : 'personal');
  if (Object.hasOwn(patch, 'busy')) {
    if (!patch.busy) {
      const result = closeAiTask(patch);
      if (result) patch = { ...patch, aiResult: result };
      busyStartedAt = 0;
    }
  }
  const previousStep = state.step;
  state = { ...state, ...patch }; saveState(); render();
  trackActivity(patch, previousStep);
}
// 「어느 단계에서 멈췄는지」와 오류 종류만 남긴다. 오류 문구는 보내지 않고 코드로 바꿔 보낸다.
function trackActivity(patch, previousStep) {
  if (auth.status !== 'signedIn' || auth.user?.status !== 'active') return;
  if (Number.isInteger(patch.step) && patch.step !== previousStep) void reportStep(patch.step);
  if (patch.error) void reportError(state.step, patch.error);
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
  archiveSearch: { busy: '공고보관함 검색 중', done: '공고보관함 검색 완료', step: null, anchor: '#archive-box', retry: 'search-archive' },
  archiveMatch: { busy: '맞춤 공고 확인 중', done: '맞춤 공고 확인 완료', step: null, anchor: '#archive-box', retry: 'find-matching-notices' },
  archiveProposals: { busy: '저장한 계획서 불러오는 중', done: '저장한 계획서 불러오기 완료', step: null, anchor: '#archive-box', retry: 'list-archived-proposals' },
  analyze: { busy: '공고 구조 분석 중', done: '공고 분석 완료', step: 3, anchor: '#result-analysis', retry: 'analyze' },
  master: { busy: '설계안 생성 중', done: '설계안 생성 완료', step: 4, anchor: '#result-master', retry: 'generate-master' },
  fullProposal: { busy: '전체 계획서 작성 중', done: '전체 계획서 작성 완료', step: 4, anchor: '#result-completion', retry: 'generate-proposal' },
  preciseReview: { busy: '정밀 검증 중', done: '정밀 검증 완료', step: 5, anchor: '#precise-review', retry: 'run-precise-review' },
  patchSections: { busy: '문제 구간 수정 중', done: '문제 구간 수정 완료', step: 5, anchor: '#precise-review', retry: 'apply-precise-fixes' },
  parts: { busy: '전체 계획서 작성 중', done: '전체 계획서 초안 완료', step: 4, anchor: '#result-completion', retry: 'generate-parts' },
  rewrite: { busy: '선택 항목 재작성 중', done: '선택 항목 재작성 완료', step: null, anchor: '#result-pipeline' },
  review: { busy: '심사 관점 검토 중', done: '심사 검토 완료', step: 5, anchor: '#result-draft-check', retry: 'proposal-review' },
  coaching: { busy: '검증·코칭 중', done: '검증 완료', tool: 'coaching', anchor: '#result-coaching', retry: 'start-coaching' },
  coachingRevision: { busy: '수정안 생성 중', done: '수정안 생성 완료', tool: 'coaching', anchor: '#result-repair' },
  coachingApply: { busy: '수정 반영 중', done: '수정본 생성 완료', tool: 'coaching', anchor: '#result-repair' },
  coachingLoad: { busy: '보관 계획서 불러오는 중', done: '보관 계획서 불러오기 완료', tool: 'coaching', anchor: '#result-coaching' },
  coachingFile: { busy: '계획서 파일 읽는 중', done: '계획서 파일 읽기 완료', tool: 'coaching', anchor: '#result-coaching' },
  applicantScan: { busy: '기관 정보 찾는 중', done: '기관 정보 확인 완료', step: null, anchor: '#result-analysis' },
  revisionRequest: { busy: '요청한 범위 다시 쓰는 중', done: '수정 요청 반영 완료', step: 4, anchor: '#result-completion' },
  finalize: { busy: '확정값 반영 중', done: '확정값 반영 최종본 완료', step: 4, anchor: '#result-completion', retry: 'build-final-version' },
  repairV2: { busy: '수정본 생성 중', done: '수정본 생성 완료', step: 4, anchor: '#result-pipeline' },
  assemble: { busy: '계획서 결합 중', done: '계획서 초안 작성 완료', step: 4, anchor: '#result-pipeline', retry: 'assemble-proposal' }
};
let aiTask = null;
let pendingAiMove = null;
// 걸린 시간은 초와 분으로 읽어 준다. 00:00은 시각처럼 보여 얼마나 지났는지 한눈에 들어오지 않는다.
function aiTaskLabel(seconds) {
  const value = Math.max(0, Math.round(seconds));
  if (value < 60) return `${String(value).padStart(2, '0')}초`;
  return `${Math.floor(value / 60)}분 ${String(value % 60).padStart(2, '0')}초`;
}
function markAiDoneAt(taskId, startedAt, patch = {}) { return markAiDone(taskId, patch, startedAt); }
function markAiDone(taskId, patch = {}, startedAt = Date.now()) {
  aiTask = AI_TASKS[taskId] ? { id: taskId, startedAt, location: aiTaskLocation() } : null;
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
// 끝난 뒤 알림에 붙이는 걸린 시간. 진행 중 표시와 같은 형식으로 읽어 준다.
function elapsedLabel() { return busyStartedAt ? ` · ${aiTaskLabel((Date.now() - busyStartedAt) / 1000)}` : ''; }
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

// ---------- 상단 드롭다운 ----------
// 6단계와 작업 화면 목록을 세로로 늘어놓지 않고 접어 둔다. 작업 내용이 화면 위쪽부터 보이게 하려는 것이다.
// <details>를 쓰므로 열고 닫기와 키보드 조작은 브라우저가 해 준다. 바깥 클릭·ESC·서로 닫기만 따로 붙인다.
function topMenu(id, label, body) {
  return `<details class="topmenu" data-topmenu="${id}"><summary class="history-button topmenu-summary"><span class="topmenu-label">${escapeHtml(label)}</span><span aria-hidden="true">▾</span></summary><div class="topmenu-panel" role="menu">${body}</div></details>`;
}

// 작성 단계. 닫혀 있을 때 지금 어느 단계인지 그대로 보여 준다.
function stepMenu() {
  const onStep = state.activeTool === 'workflow';
  const label = onStep ? `현재 단계: ${state.step + 1}. ${STEPS[state.step]}` : '작업 단계';
  const items = STEPS.map((name, index) => {
    const complete = isStepComplete(index);
    const current = onStep && state.step === index;
    return `<button class="topmenu-item workflow-step ${current ? 'active' : ''} ${complete ? 'done' : ''}" role="menuitem" data-step="${index}" ${current ? 'aria-current="step"' : ''}><span>${complete ? '✓' : index + 1}</span>${name}</button>`;
  }).join('');
  return topMenu('steps', label, items);
}

// 작업 화면 목록. 단추의 식별자와 처리기는 그대로 두어 권한·동작이 바뀌지 않는다.
function toolMenu() {
  const items = [
    ['open-archive-box', '공고보관함·계획서보관함', ''],
    ['open-engagement', '의뢰 건', 'engagement'],
    ['open-applicants', '신청기관 정보', 'applicants'],
    ['open-coaching', '계획서 검증·코칭', 'coaching']
  ].map(([id, label, tool]) => `<button class="topmenu-item" role="menuitem" id="${id}" ${tool ? `aria-pressed="${state.activeTool === tool}"` : ''}>${label}</button>`).join('');
  return topMenu('tools', '작업 메뉴', items);
}

// 열려 있는 상단 드롭다운을 닫는다. 하나를 열면 나머지는 닫힌다.
function closeTopMenus(except = null) {
  for (const menu of document.querySelectorAll('details.topmenu[open]')) {
    if (menu !== except) menu.open = false;
  }
}
function bindTopMenus() {
  for (const menu of document.querySelectorAll('details.topmenu')) {
    menu.addEventListener('toggle', () => { if (menu.open) closeTopMenus(menu); });
  }
}

function shell(content) {
  // 홈은 작업용 단계 내비게이션 없이 자체 화면으로만 보여 준다.
  // 다만 간편 화면은 홈 자리에 오더라도 머리띠를 그대로 둔다. 보관함·계정·포털 이동이 사라지면 안 된다.
  if (state.activeTool === 'home' && !showSimpleHome()) return `<div class="layout home-layout"><main class="main">${aiResultBanner()}${state.notice ? `<div class="alert success">${escapeHtml(state.notice)}</div>` : ''}${state.error ? `<div class="alert danger">${escapeHtml(state.error)}</div>` : ''}${content}${state.busy ? `<div class="busy"><div class="loader"></div><strong>${escapeHtml(state.busy)}</strong></div>` : ''}</main></div>`;
  return `
    <div class="layout">
      <main class="main">
        <header class="workflow-header">
          <div class="workflow-brand"><div class="brand"><span class="brand-mark">계</span><div><strong>사업계획서 작성 도우미</strong><small>공고 분석부터 제출본까지</small></div></div><span class="save-state">● 자동 저장 중</span><span class="mode">${escapeHtml(accountEmail())}</span><button class="history-button" id="open-account" aria-pressed="${state.activeTool === 'account'}">계정 설정</button>${portalLinks()}<button class="history-button" id="sign-out">로그아웃</button></div>
          <div class="workflow-row"><label class="type-select-label" for="business-type">사업 유형<select id="business-type">${TYPES.map(([id, name]) => `<option value="${id}" ${state.project.type === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label>${stepMenu()}${toolMenu()}<nav class="workflow-history" aria-label="앱 작업 화면 이동"><button class="history-button" id="workflow-back" aria-label="직전 작업 화면으로 뒤로 가기" ${navigationHistory.backStack.length ? '' : 'disabled'}>← 뒤로</button><button class="history-button" id="workflow-home" aria-label="홈 화면으로 가기">⌂ 홈</button><button class="history-button" id="workflow-forward" aria-label="다음 작업 화면으로 앞으로 가기" ${navigationHistory.forwardStack.length ? '' : 'disabled'}>앞으로 →</button></nav></div>
        </header>
        ${viewModeBadge()}
        ${aiResultBanner()}
        ${state.notice ? `<div class="alert success">${escapeHtml(state.notice)}</div>` : ''}
        ${state.error ? `<div class="alert danger">${escapeHtml(state.error)}</div>` : ''}
        <section class="workspace">${content}</section>
        ${state.busy ? `<div class="busy"><div class="loader"></div><strong>${escapeHtml(state.busy)}</strong><small>창을 닫지 마세요.${busyStartedAt ? `<span data-ai-elapsed data-started-at="${busyStartedAt}" style="display:block">경과시간 00초</span>` : ''}</small></div>` : ''}
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
        <nav class="home-nav"><button class="button ghost" id="workflow-back" aria-label="뒤로 가기" ${navigationHistory.backStack.length ? '' : 'disabled'}>← 뒤로</button><button class="button ghost" disabled aria-current="page">⌂ 홈 화면</button><button class="button ghost" id="workflow-forward" aria-label="앞으로 가기" ${navigationHistory.forwardStack.length ? '' : 'disabled'}>앞으로 →</button><button class="button ghost" data-home-scroll="home-product">제품소개</button><button class="button ghost" data-home-scroll="home-flow">이용방법</button><button class="button ghost" data-home-scroll="home-features">주요기능</button><button class="button ghost" data-home-archive="1">공고보관함·계획서보관함</button>${portalLinks('button ghost')}<button class="button primary" data-home-start="1">새 계획서 시작</button></nav>
      </header>

      <section class="home-hero">
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
          <div class="home-startbox-actions"><button class="button primary" data-home-upload="1">공고문 업로드</button><button class="button secondary" data-home-manual="1">직접 입력</button><button class="button ghost" data-home-archive="1">공고보관함에서 열기</button></div>
          <p class="home-startbox-note">PDF · DOCX · TXT · HWPX · HWP를 읽습니다. 파일은 분석을 요청할 때만 전송되고 화면 상태는 이 브라우저에 저장됩니다.</p>
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
          <article class="home-card"><h3>공고보관함·계획서보관함</h3><p>공고와 계획서를 보관하고 언제든 이어서 작업합니다.</p></article>
        </div>
      </section>

      <section class="home-section" id="home-product">
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
        <div class="home-actions"><button class="button primary" data-home-start="1">새 계획서 시작</button><button class="button secondary" data-open-sample="notice">[샘플] 예시 프로젝트 보기</button><button class="button ghost" data-home-archive="1">공고보관함·계획서보관함 보기</button></div>
      </section>

      <footer class="home-footer"><span>사업계획서 작성 도우미</span><div><button class="button ghost" data-home-start="1">새 계획서</button><button class="button ghost" data-home-archive="1">공고보관함·계획서보관함</button><button class="button ghost" data-open-applicants="1">신청기관 정보</button></div></footer>
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
// 단계 머리말. 큰 안내 카드를 늘어놓으면 정작 작업 영역이 화면 밖으로 밀린다.
// 제목·안내는 왼쪽에, 시작 경로는 오른쪽에 작은 단추로 붙여 한 덩어리로 만든다.
function stageHero({ eyebrow, title, lead, actions = '', routes = [] }) {
  return `<section class="stage-hero">
    <div class="stage-hero-text"><span class="home-eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(lead)}</p></div>
    ${routes.length || actions ? `<div class="stage-routes">${routes.map((route, index) => `<button class="stage-route ${index === 0 ? 'primary' : ''}" data-route="${escapeHtml(route.action)}" title="${escapeHtml(route.desc)}"><strong>${escapeHtml(route.label)}</strong><small>${escapeHtml(route.title)}</small></button>`).join('')}${actions}</div>` : ''}
  </section>`;
}

// 올린 파일 한 건의 결과. 파일명·형식·용량·글자 수·표 수·성공 여부를 그대로 적는다.
// 읽지 못한 파일은 목록에서 지우지 않고 이유와 함께 남긴다. 그래야 사용자가 무엇을 할지 안다.
const fileSize = bytes => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);
function fileReportRow(item, index) {
  const ok = item.extracted !== false;
  return `<div class="file-item">
    <span class="file-badge">${escapeHtml(item.type || '?')}</span>
    <div><strong>${escapeHtml(item.name)}</strong>
      <small>${escapeHtml([
        item.size ? fileSize(item.size) : '',
        ok ? `${Number(item.characters || 0).toLocaleString()}자` : '읽지 못함',
        ok && item.tables ? `표 ${item.tables}개` : '',
        ok && item.pages ? `${item.pages}쪽` : ''
      ].filter(Boolean).join(' · '))}</small>
      ${ok ? '' : `<small class="muted">${escapeHtml(item.reason || '원인을 확인하지 못했습니다.')}</small>`}
    </div>
    <span class="status ${ok ? '충족' : '부족'}">${ok ? '추출 성공' : '추출 실패'}</span>
    <button data-remove-file="${index}" aria-label="파일 제거">×</button>
  </div>`;
}

function noticeImportView() {
  return `${stageHero({ eyebrow: '1단계 · 공고 준비', title: '어떤 공고로 시작할까요?', lead: '공식 공고를 가져오거나 가지고 있는 공고문을 올리면 다음 단계부터 자동으로 이어집니다. 파일은 분석을 요청할 때만 전송됩니다.', actions: sampleButton('notice', '[샘플] 공고 먼저 보기'), routes: [{ title: '중앙회·광주지회 진행 중 공고', desc: '사랑의열매 중앙회·광주지회 진행 중 공고를 조회해 목록으로 가져옵니다.', label: '공고 조회', action: 'fetch' }, { title: 'PDF·DOCX·TXT·HWPX', desc: '공고문·신청서 파일을 읽어 분석 자료로 씁니다.', label: '파일 선택', action: 'upload' }, { title: '전에 가져온 공고 다시 열기', desc: '공고보관함에서 이어서 작업합니다.', label: '공고보관함', action: 'archive' }] })}
    <div class="dense-step">
    <div class="card"><div class="card-title"><div><h3>기관 공고 가져오기</h3><span>사랑의열매 중앙회 · 광주지회</span></div><button class="button primary" id="fetch-notices">공고 가져오기</button></div><p class="muted">${state.noticeResults.length ? `진행 중 공고 ${state.noticeResults.length}건을 가져왔습니다.` : '버튼을 누를 때만 공식 공모사업을 조회합니다.'} 가져온 목록은 <b>이 화면에서만 쓰는 임시 목록</b>이라 새로고침하면 사라지며, 과거 공고는 아래 <b>「공고보관함」</b>에서 다시 열 수 있습니다.</p>${state.noticeResults.length ? '<div class="actions"><span></span><button class="button primary" data-step="1">가져온 공고 확인 →</button></div>' : ''}</div>
    <div class="source-grid"><div class="card"><div class="card-title"><h3>공고문·신청서 업로드</h3><span>PDF · DOCX · TXT · HWPX · HWP</span></div><label class="dropzone" for="source-files"><strong>파일 선택 또는 여기에 놓기</strong><small>스캔 PDF는 OCR이 필요할 수 있습니다.</small><input id="source-files" type="file" accept=".pdf,.docx,.txt,.hwpx,.hwp" multiple></label><div class="file-list">${state.files.length ? state.files.map(fileReportRow).join('') : '<p class="empty-inline">업로드한 파일이 없습니다.</p>'}</div></div>
    <div class="card"><div class="card-title"><h3>공고문 직접 붙여넣기</h3><span id="char-count">${state.sourceText.length.toLocaleString()}자</span></div><textarea id="source-text" class="source-text" placeholder="기관 공고문 또는 신청서 원문을 붙여넣으세요.">${escapeHtml(state.sourceText)}</textarea></div></div>
    ${manualSourcesView()}
    <details class="card org-details"><summary>누락 공고 URL과 공식 사이트</summary><div class="inline-row"><label for="missing-notice-url">누락 공고 가져오기</label><input id="missing-notice-url" type="url" value="${escapeHtml(state.noticeUrlDraft)}" placeholder="공식 공고 상세 주소"><button class="button secondary" id="import-notice-url">목록에 추가</button></div><div class="inline-row"><a class="button secondary" href="https://chest.or.kr/bbs/1000/initPostList.do" target="_blank" rel="noopener noreferrer">중앙회 공식 사이트</a><a class="button secondary" href="https://gwangju.chest.or.kr/bbs/1000/initPostList.do" target="_blank" rel="noopener noreferrer">광주지회 공식 사이트</a></div></details>
    ${archiveView()}</div>
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
// 9) 계획서 보관함. 공고 목록과 구분해서 보여 주되 저장 데이터는 그대로 쓴다(중복 저장 없음).
function proposalArchiveStatus(item) {
  const stage = String(item.stage || '');
  if (stage === 'final') return '최종본';
  if (stage.startsWith('revision-')) return '수정중';
  if (stage.startsWith('coaching-')) return Number(stage.replace('coaching-v', '')) > 1 ? '재검토' : '검토중';
  if (stage === 'review') return '검토중';
  if (stage === 'complete') return '완성본·검토전';
  return '작성중';
}
function proposalArchiveView(proposals) {
  if (!proposals.length) return '<p class="muted">저장한 계획서가 없습니다. 작성 화면의 「계획서보관함에 저장」을 누르면 여기에 쌓입니다.</p>';
  const groups = proposals.reduce((map, item) => {
    const key = String(item.noticeKey || '공고 미연결');
    map.set(key, [...(map.get(key) || []), item]);
    return map;
  }, new Map());
  const noticeTitleOf = key => (state.archiveNotices || []).find(item => item.archiveNoticeKey === key)?.title || '';
  const open = state.archiveOpenProposal || '';
  return `<h4>계획서보관함 ${proposals.length}건 · 공고 ${groups.size}건</h4><div class="archive-index">${[...groups.entries()].map(([key, items], index) => {
    const latest = items[0];
    return `<details class="archive-group" ${index === 0 ? 'open' : ''}><summary>${escapeHtml(String(noticeTitleOf(key) || latest.title || '공고 미연결').slice(0, 50))} <b>${items.length}건</b></summary>
      <div class="requirement-list">${items.map(item => `<article class="requirement"><div><span class="status ${proposalStatusTone(proposalArchiveStatus(item))}">${escapeHtml(proposalArchiveStatus(item))}</span><div><strong>${escapeHtml(item.title)}</strong><small class="muted">${escapeHtml(archiveStageLabel(item.stage))} · 저장 ${escapeHtml(String(item.createdAt || '').slice(0, 10))} · 수정 ${escapeHtml(String(item.updatedAt || '').slice(0, 10))}</small></div></div>
        <div class="actions" style="margin:8px 0 0"><span></span><div><button class="button secondary" data-proposal-detail="${escapeHtml(item.id)}">${open === item.id ? '닫기' : '내용 보기'}</button><button class="button primary" data-open-archived-proposal="${escapeHtml(item.id)}">이어서 작업</button></div></div>
        ${open === item.id ? proposalArchiveDetail(item) : ''}</article>`).join('')}</div></details>`;
  }).join('')}</div>`;
}
// 계획서 하나를 열면 공고·신청기관·현재 버전·버전/검토/수정 이력을 한 자리에서 본다.
function proposalArchiveDetail(item) {
  const current = state.archiveProposalId === item.id;
  const flow = current ? proposalFlow() : null;
  const versions = current ? (state.proposalVersions || []) : [];
  const rows = [
    ['공고', (state.archiveNotices || []).find(entry => entry.archiveNoticeKey === item.noticeKey)?.title || item.noticeKey || '공고 미연결'],
    ['신청기관', current ? (selectedApplicant()?.name || '미선택') : '열어서 확인'],
    ['현재 버전', current ? `V${versions.length || 1} · ${latestProposalVersion()?.label || '작성본'}` : '열어서 확인'],
    ['버전 이력', current ? `${versions.length}개 (이전 버전 보존)` : '열어서 확인'],
    ['검토 이력', current ? `${(flow?.rounds || []).length}회` : '열어서 확인'],
    ['수정 이력', current ? `${(flow?.requests || []).length}건` : '열어서 확인'],
    ['최종본', current && flow?.approvedVersion ? `V${flow.approvedVersion} 승인` : '미승인']
  ];
  return `<div class="summary-grid" style="margin-top:10px">${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value).slice(0, 40))}</strong></div>`).join('')}</div>
    ${current ? '' : '<p class="muted">「이어서 작업」으로 열면 버전·검토·수정 이력을 모두 확인할 수 있습니다.</p>'}`;
}
function archiveView() {
  const filters = state.archiveFilters || initial.archiveFilters;
  const table = archiveTableState();
  const data = archiveTableData();
  const proposals = state.archiveProposals || [];
  const selected = (table.selected || []).filter(key => data.rows.some(row => row.key === key) || (state.archiveNotices || []).some(item => item.archiveNoticeKey === key));
  const linkedCount = Object.values(archiveLinks()).filter(link => (link.applicantIds || []).length).length;
  // 필터를 쓰고 있으면 접어 두지 않는다. 조건이 숨어 있어 결과를 오해하는 일을 막는다.
  const activeFilters = Object.values(table.filters || {}).filter(value => value).length;
  const pageKeys = data.rows.map(row => row.key);
  const allChecked = pageKeys.length > 0 && pageKeys.every(key => selected.includes(key));
  return `<details class="card org-details" id="archive-box" open><summary><b>공고보관함·계획서보관함</b> <small>가져온 공고는 자동 보관됩니다. 검색·필터로 찾아 「작업하기」에서 원하는 단계로 이동하세요.</small></summary>
    <div class="stat-badges">${[
      ['보관 공고', data.total, `기관 ${data.institutions.length}곳`],
      ['검색 결과', data.matched, data.matched ? `${data.from}–${data.to}번 표시` : '조건에 맞는 공고 없음'],
      ['신청기관 연결', linkedCount, '공고당 여러 기관 연결 가능'],
      ['저장한 계획서', proposals.length, '작업하기에서 이어서 작성']
    ].map(([label, value, detail]) => `<span class="stat-badge" title="${escapeHtml(`${label} ${value}건 · ${detail}`)}"><strong>${value}</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(detail)}</small></span>`).join('')}</div>
    <div class="archive-toolbar"><input id="archive-query" value="${escapeHtml(table.query)}" placeholder="사업명·기관명·키워드 검색 후 Enter">
      <button class="button secondary" id="archive-apply-query">목록 검색</button>
      <button class="button secondary" id="search-archive">공고보관함 다시 불러오기</button>
      <button class="button primary" id="find-matching-notices">맞춤 공고 찾기</button>
      <button class="button secondary" id="list-archived-proposals">계획서보관함</button></div>
    <details class="filter-details" ${activeFilters ? 'open' : ''}><summary>상세 필터${activeFilters ? ` · ${activeFilters}개 적용 중` : ''}</summary>
    <div class="archive-filters">
      ${archiveSelectField('수집일', 'collected', table.filters.collected, data.collectedDates, shortDate)}
      ${archiveSelectField('공모기관', 'institution', table.filters.institution, data.institutions)}
      ${archiveSelectField('분야', 'field', table.filters.field, data.fields)}
      ${archiveSelectField('상태', 'status', table.filters.status, ARCHIVE_STATUSES)}
      <label class="archive-filter"><span>신청기관</span><select data-archive-filter="applicant"><option value="">전체</option><option value="미연결" ${table.filters.applicant === '미연결' ? 'selected' : ''}>미연결</option>${(state.applicants || []).map(item => `<option value="${escapeHtml(item.id)}" ${table.filters.applicant === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>
      ${archiveSelectField('마감일', 'deadline', table.filters.deadline, ['진행중', '마감임박', '마감', '마감일 확인 필요'])}
      <button class="button secondary" id="archive-reset-filters">필터 초기화</button></div></details>
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
    ${proposalArchiveView(proposals)}
    <details><summary>서버 검색 조건 · 다른 기기에서 같은 계획서보관함 사용</summary>
      <div class="two-col"><div class="field"><label for="archive-institution">기관</label><input id="archive-institution" value="${escapeHtml(filters.institution)}" placeholder="예: 광주지회"></div><div class="field"><label for="archive-keyword">키워드</label><input id="archive-keyword" value="${escapeHtml(filters.keyword)}" placeholder="예: 아동, 가족기능"></div></div>
      <div class="two-col"><div class="field"><label for="archive-from">마감일 시작</label><input id="archive-from" type="date" value="${escapeHtml(filters.from)}"></div><div class="field"><label for="archive-to">마감일 종료</label><input id="archive-to" type="date" value="${escapeHtml(filters.to)}"></div></div>
      <p class="muted">현재 복구키를 비밀번호 관리도구 등 안전한 장소에 보관하세요. 새 기기에서 같은 키를 입력하면 기존 계획서보관함에 연결됩니다. 복구키를 잃으면 서버에서도 복원할 수 없습니다.</p>
      <div class="actions"><button class="button secondary" id="copy-archive-key">현재 복구키 복사</button></div>
      <div class="field"><label for="archive-recovery-key">기존 계획서보관함 복구키</label><input id="archive-recovery-key" type="password" autocomplete="off" value="${escapeHtml(state.archiveKeyDraft)}" placeholder="다른 기기에서 보관한 복구키 붙여넣기"><button class="button primary" id="apply-archive-key">이 기기에 기존 계획서보관함 연결</button></div></details></details>`;
}


function archiveStageLabel(stage) { if (String(stage).startsWith('revision-v')) return `코칭 반영 수정본 ${String(stage).replace('revision-', '')}`; return String(stage).startsWith('coaching-v') ? `검증·코칭 ${String(stage).replace('coaching-', '')}` : ({ master: '마스터 설계', parts: '분할 생성', complete: '완성본·검토전', review: '검토본', final: '최종본' })[stage] || stage; }

// 공고에서 「선정 논리」만 구조화한다. 공고 저장·계획서 기능은 건드리지 않는다.
function noticeLogicSource() {
  const notice = state.noticePreview || state.selectedNotice || state.noticeResults[0];
  if (!notice) return null;
  const criteriaText = [state.sourceText, ...state.manualSources.filter(item => ['세부 공고문', '심사·평가기준', '예산 편성 기준'].includes(item.sourceType) && item.extractionStatus === 'success').map(item => item.extractedText)].filter(Boolean).join('\n\n');
  return { ...notice, overview: notice.overview || notice.detailText || notice.summary || '', criteriaText };
}

// 공고를 목록에서 고르지 않고 원문만 붙여넣은 경우에도 같은 공고 자료로 취급한다.
function noticeSourceOrPasted() {
  return noticeLogicSource() || (state.sourceText.trim().length >= 200
    ? { title: state.project.title, overview: state.sourceText, criteriaText: manualCriteriaText() }
    : null);
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
    <div class="card"><div class="card-title"><div><h3>이번에 가져온 공고 ${state.noticeResults.length}건 · 임시 목록</h3><span>300자 이내 공식 원문 요약 · 새로고침하면 사라지며, 보관은 공고보관함(D1)에 별도로 저장됩니다</span></div><button class="button secondary" data-step="0">공고 더 가져오기</button></div>${noticeListView()}</div>
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
// 공고 실행계약서. 공고가 이미 정한 조건을 규칙으로 들고 있다.
function currentNoticeContract() {
  const stored = state.noticeLogic?.contract;
  if (stored?.rules?.length) return stored;
  const structure = state.noticeLogic?.structure;
  if (!structure) return null;
  // 예전에 저장한 계획서에는 계약서가 없다. 그 자리에서 다시 만들고 이후에는 저장된 값을 쓴다.
  const rebuilt = buildNoticeContract({ structure, notice: noticeSourceOrPasted() });
  if (state.noticeLogic) state.noticeLogic.contract = rebuilt;
  return rebuilt;
}
// 공고 기준과 이번 사업 값의 불일치. 어느 쪽으로 할지 묻지 않고 무엇에 맞춰야 하는지 알린다.
function currentOfficialConflicts() {
  const values = (state.projectValues || []).filter(item => item.blueprintKey);
  const contract = currentNoticeContract();
  if (contract?.rules?.length) return contractConflicts(contract, values);
  return officialRequirementConflicts(state.noticeLogic?.structure, values);
}
// 제출 적합성 게이트. 계약서와 계획서를 독립적으로 대조한다.
function currentSubmissionGate() {
  // 공고 분석을 아직 돌리지 않았어도 공고 원문이 있으면 계약서를 만들어 게이트를 판정한다.
  // 계약서가 없다고 제출 가능 여부를 조용히 비워 두지 않는다.
  if (!currentNoticeContract()?.rules?.length && state.sections.length) ensureNoticeLogic();
  const contract = currentNoticeContract();
  if (!contract?.rules?.length || !state.sections.length) return null;
  const blueprint = currentBlueprint();
  // 게이트도 작성 payload와 같은 신청유형 값을 본다.
  const types = resolvedApplicationTypes(blueprint);
  return checkProposalAgainstContract({ contract, sections: state.sections, projectValues: state.projectValues || [], blueprint: { ...blueprint, applicationTypes: { ...(blueprint?.applicationTypes || {}), selected: types.selected } } });
}
function currentBlueprint() {
  const structure = state.noticeLogic?.structure;
  const applicant = selectedApplicant();
  if (!structure || !applicant) return null;
  // 공고 원문을 함께 넘긴다. 「신청자격 및 유형」처럼 제목과 글머리표로 나뉜 공고도 유형을 읽게 한다.
  return buildBlueprint({ structure, applicant, fitResult: matchApplicantToNotice(structure, applicant), projectValues: blueprintProjectValues(), notice: noticeSourceOrPasted() });
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
      <button class="button primary" id="blueprint-draft" ${guard(blueprint.canDraft ? '' : (draftHint || '초안을 만들 자료가 아직 없습니다. 공고를 먼저 분석해 주세요.'), 'notice')}>초안 작성</button></div>
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

// 「사업계획서 의뢰 건」 한 장. 고객 화면은 4단계와 다음 행동만 보여 주고,
// 운영자 화면에서만 공고 분석·실행계약서·설계도·버전·게이트 상세를 연다.
function currentEngagement() {
  return buildEngagement({
    ...state.engagement, formSpec: currentFormSpec(), applicant: selectedApplicant(), noticeLogic: state.noticeLogic, locks: contractFieldLocks(currentNoticeContract() || { rules: [] }),
    manualSources: state.manualSources, projectValues: state.projectValues, sections: state.sections,
    proposalVersions: state.proposalVersions, proposalFlow: proposalFlow(),
    gate: currentSubmissionGate(), blueprint: currentBlueprint()
  });
}
const PART_TONE = { 준비됨: '충족', '준비 중': '부분-충족', 없음: '확인-필요' };
// 신청서 서식 규격표. 등록한 서식 자료에서 규칙으로 읽고 의뢰 건에 함께 저장한다(AI 호출 없음).
function currentFormSpec() {
  // 공고문을 자료로 올리지 않고 붙여넣기만 했어도 제출서류 목록을 읽는다.
  // 목록을 못 읽으면 필수 첨부 누락을 잡지 못한 채 제출 가능으로 보일 수 있다.
  const pasted = state.sourceText.trim().length >= 200 && !state.manualSources.some(item => item.sourceType === '세부 공고문' && item.extractionStatus === 'success')
    ? [{ id: 'pasted-notice', fileName: `${state.project.title || '공고문'} (붙여넣은 공고문)`, sourceType: '세부 공고문', extractionStatus: 'success', extractedText: state.sourceText }]
    : [];
  const spec = buildFormSpec([...state.manualSources, ...pasted]);
  // 서식 자료가 바뀌면 규격표도 다시 읽는다. 서식이 없으면 예전 규격표를 지우지 않고 그대로 둔다.
  if (spec) state.engagement.formSpec = spec;
  return spec || state.engagement.formSpec || null;
}

// ---------- 정밀 검증·부분 수정 ----------
// 정밀형에서만 쓴다. 표준형 계획서 흐름과 기존 전체 생성 구조는 그대로 둔다.
function proposalMode() { return PROPOSAL_MODES.includes(state.engagement.mode) ? state.engagement.mode : '표준형'; }
function setProposalMode(mode) {
  state.engagement = normalizeEngagement({ ...state.engagement, mode });
  setState({ engagement: state.engagement, notice: `${mode} 계획서로 진행합니다.${mode === '표준형' ? ' 정밀 검증 결과는 그대로 남습니다.' : ''}`, error: '' });
}
function preciseBasis() {
  // 공고 원문만 있고 분석을 아직 돌리지 않았어도 계약서를 만들어 기준에 넣는다.
  if (!currentNoticeContract()?.rules?.length && state.sections.length) ensureNoticeLogic();
  return buildReviewBasis({
    contract: currentNoticeContract(), formSpec: currentFormSpec(),
    designPlan: state.engagement.design?.snapshot || currentEngagement().brief,
    demand: currentDemandEvidence()
  });
}
// 1) 정밀 검증 — 운영자가 실행하며 계획서 본문은 건드리지 않는다.
async function runPreciseReview(round = 1) {
  if (proposalMode() !== '정밀형') return setState({ error: '정밀 검증은 정밀형 계획서에서만 실행합니다.' });
  if (!state.sections.length) return setState({ error: '검증할 계획서가 없습니다.' });
  // 기준이 비어 있으면 검증하지 않는다. 비교할 것이 없으면 「기준에 없다」는 지적만 돌아온다.
  const readiness = reviewBasisReadiness(preciseBasis());
  if (!readiness.ready) return setState({ error: readiness.reason });
  const before = structuredClone(state.sections);
  const startedAt = Date.now();
  setAiBusy(round > 1 ? '정밀 재검증 중' : '정밀 검증 중', { error: '', notice: '' }, 'preciseReview');
  try {
    const result = await preciseReviewWithAI({ basis: preciseBasis(), sections: state.sections, tables: state.proposalTables || [] });
    const issues = normalizeReviewIssues(result.issues, state.sections);
    // 검증만으로 본문이 바뀌지 않았음을 확인한다.
    if (JSON.stringify(before) !== JSON.stringify(state.sections)) throw new Error('검증 중 계획서 본문이 바뀌었습니다. 반영하지 않았습니다.');
    state.preciseReview = { round, issues, summary: reviewSummary(issues), fingerprint: sectionsFingerprint(state.sections), note: String(result.summary || '').slice(0, 500), at: new Date().toISOString() };
    markAiDoneAt('preciseReview', startedAt, { preciseReview: state.preciseReview, notice: `정밀 ${round > 1 ? '재' : ''}검증에서 ${issues.length}건을 확인했습니다. 본문은 바꾸지 않았습니다.`, error: '' });
  } catch (error) { setState({ busy: '', error: error.message }); }
}
// 2) 부분 수정 — 문제가 지목한 항목만 한 번의 호출로 다시 쓴다.
async function applyPreciseFixes() {
  const review = state.preciseReview;
  if (!review?.issues?.length) return setState({ error: '수정할 문제가 없습니다.' });
  const before = structuredClone(state.sections);
  const targets = sectionsToPatch(state.sections, review.issues);
  if (!targets.length) return setState({ error: '수정할 항목을 찾지 못했습니다.' });
  const startedAt = Date.now();
  setAiBusy('문제 구간만 수정하는 중', { error: '', notice: '' }, 'patchSections');
  try {
    const result = await patchSectionsWithAI({ basis: preciseBasis(), sections: targets });
    const applied = applyPatchedSections(before, result.sections, review.issues);
    const untouched = verifyUntouched(before, applied.sections, review.issues);
    // 지목되지 않은 항목이 조금이라도 바뀌면 반영하지 않는다.
    if (!untouched.ok) throw new Error(`수정 대상이 아닌 항목이 바뀌어 반영하지 않았습니다: ${untouched.broken.join(', ')}`);
    if (!applied.changed.length) throw new Error('수정된 내용이 없습니다. 계획서를 그대로 두었습니다.');
    state.sections = applied.sections;
    recordProposalVersion({
      sections: state.sections, label: `정밀 검증 ${review.round}차 부분 수정`, source: '정밀 검증',
      reason: `${applied.changed.length}개 항목 수정 · 문제 ${review.issues.length}건`
    });
    state.preciseReview = { ...review, patched: { changed: applied.changed, preserved: applied.preserved, skipped: applied.skipped, at: new Date().toISOString() } };
    const version = state.proposalVersions.length;
    markAiDoneAt('patchSections', startedAt, {
      sections: state.sections, proposalVersions: state.proposalVersions, preciseReview: state.preciseReview,
      notice: `문제 구간 ${applied.changed.length}개만 수정해 V${version}으로 저장했습니다. 나머지 ${applied.preserved.length}개 항목은 그대로입니다.`, error: ''
    });
    void archiveCurrentProposal(`precise-v${version}`).catch(() => {});
  } catch (error) { setState({ busy: '', error: error.message }); }
}

// 사업환경·수요근거표. 공고·기관 확인정보·업로드 자료에서만 모으고 출처를 함께 남긴다(AI 호출 없음).
function currentDemandEvidence() {
  return buildDemandEvidence({
    structure: state.noticeLogic?.structure, applicant: selectedApplicant(),
    manualSources: state.manualSources, projectType: state.project.type
  });
}

// 전체 계획서 작성 권한. 승인 전에는 시작하지 않지만 이미 만든 계획서·버전·보관함 열람은 막지 않는다.

// ---------- 막힌 기능은 회색으로 두지 않는다 ----------
//
// 회색 버튼은 왜 못 쓰는지 말해 주지 않는다. 그래서 처리 중일 때만 실제로 잠그고,
// 그 밖의 경우에는 누를 수 있게 둔 채 무엇이 부족한지와 어디로 가면 되는지 알린다.
// 권한이 없는 위험한 작업은 화면이 아니라 서버가 계속 막는다.

// 버튼에 붙일 속성. reason이 있으면 눌렀을 때 안내가 뜬다.
function guard(reason = '', goto = '') {
  if (!reason) return '';
  return `data-blocked="${escapeHtml(reason)}"${goto ? ` data-goto="${escapeHtml(goto)}"` : ''}`;
}

// 안내를 띄우고, 갈 곳이 있으면 그리로 옮긴다.
function explainBlocked(reason, goto = '') {
  const targets = {
    design: () => { setState({ activeTool: 'engagement', notice: reason, error: '' }); },
    applicants: () => { setState({ activeTool: 'applicants', notice: reason, error: '' }); },
    notice: () => { setState({ activeTool: '', step: 0, notice: reason, error: '' }); },
    blueprint: () => { setState({ activeTool: '', step: 3, notice: reason, error: '' }); },
    write: () => { setState({ activeTool: '', step: 4, notice: reason, error: '' }); },
    account: () => { setState({ activeTool: 'account', notice: reason, error: '' }); },
    membership: () => { setState({ activeTool: 'account', notice: reason, error: '' }); document.querySelector('#membership-guide')?.scrollIntoView({ behavior: 'smooth' }); }
  };
  const move = targets[goto];
  if (move) return move();
  setState({ notice: reason, error: '' });
}

function generationPermission() {
  return canGenerateProposal({
    approval: state.engagement.design, sections: state.sections,
    startedParts: (state.stagedGeneration?.parts || []).length
  });
}
// 설계 승인 흐름. 실제 로그인 권한이 없으므로 지금 보고 있는 화면의 역할을 그대로 기록한다.
function currentRole() { return state.engagement.view === 'operator' ? '운영자' : '고객'; }
function setDesignApproval(patch, notice) {
  state.engagement = normalizeEngagement({ ...state.engagement, design: { ...state.engagement.design, ...patch } });
  setState({ engagement: state.engagement, notice, error: '' });
  if (state.archiveProposalId) void archiveCurrentProposal().catch(() => {});
}
function requestDesignReview() {
  const engagement = currentEngagement();
  // 값이 아직 비어 있어도 막지 않는다. 예전에는 여기서 거절해서, 공고를 고르고
  // 하고 싶은 사업까지 적어 둔 사람이 설계 확인으로도 작성으로도 갈 수 없었다.
  // 비어 있는 값은 [확인 필요]로 남긴 채 진행하고, 무엇이 비었는지만 알려 준다.
  const missing = engagement.brief.coreValues.filter(item => item.value === '[확인 필요]').map(item => item.label);
  const notice = missing.length
    ? `설계안 확인을 요청했습니다. 아직 정하지 않은 ${missing.length}가지(${missing.slice(0, 3).join(' · ')}${missing.length > 3 ? ' 외' : ''})는 [확인 필요]로 남습니다.`
    : '설계안 확인을 요청했습니다.';
  setDesignApproval({ requestedAt: new Date().toISOString(), requestedBy: currentRole(), reviewStartedAt: '', approvedAt: '', approvedBy: '' }, notice);
}
function startDesignReview() {
  setDesignApproval({ reviewStartedAt: new Date().toISOString() }, '운영자 검토를 시작했습니다.');
}
// 승인 시점의 설계안을 그대로 남긴다. 이후 설계가 바뀌어도 무엇을 승인했는지 남는다.
// silent를 주면 되묻지 않는다. 간편 작성에서는 부족한 값이 있어도 멈추지 않고
// [확인 필요]로 남긴 채 진행한다. 전문가 화면에서는 예전처럼 한 번 확인한다.
function approveDesign({ silent = false } = {}) {
  const engagement = currentEngagement();
  if (!silent && engagement.brief.openFacts.length && !window.confirm(`확인이 필요한 항목 ${engagement.brief.openFacts.length}건이 남아 있습니다. 그래도 설계를 승인할까요? 확인 전 값은 계획서에 [확인 필요]로 남습니다.`)) return;
  setDesignApproval({ approvedAt: new Date().toISOString(), approvedBy: currentRole(), snapshot: structuredClone(engagement.brief) }, `${currentRole()} 역할로 사업 설계를 승인했습니다. 이제 전체 계획서를 작성할 수 있습니다.`);
}
function reopenDesign() {
  setDesignApproval({ approvedAt: '', approvedBy: '', reviewStartedAt: '' }, '설계 승인을 해제했습니다. 이미 만든 계획서와 버전은 그대로 있습니다.');
}

function setEngagementView(view) {
  state.engagement = normalizeEngagement({ ...state.engagement, view });
  setState({ engagement: state.engagement, notice: '', error: '' });
}
// 요청서는 이 의뢰 건에만 저장한다. 기관 영구정보(신청기관 정보)로 옮기지 않는다.
function saveEngagementRequest() {
  const request = state.engagement.request;
  if (!request.title.trim()) return setState({ error: '요청 사업명을 적어 주세요.' });
  state.engagement = normalizeEngagement({ ...state.engagement, request: { ...request, receivedAt: request.receivedAt || new Date().toISOString().slice(0, 10) } });
  setState({ engagement: state.engagement, notice: '공고 요청서를 이 의뢰 건에 저장했습니다. 신청기관 정보는 바뀌지 않았습니다.', error: '' });
  if (state.archiveProposalId) void archiveCurrentProposal().catch(() => {});
}
function engagementView() {
  const engagement = currentEngagement();
  const operator = state.engagement.view === 'operator';
  const next = engagement.customerNext;
  return `<div class="page-heading"><div><h2>사업계획서 의뢰 건</h2><p>이 건에 필요한 정보를 한 곳에서 봅니다. 기관에 계속 남는 정보와 이번 사업에서만 쓰는 값은 섞지 않습니다.</p></div>
      <div class="actions"><button class="button ${operator ? 'secondary' : 'primary'}" id="engagement-view-customer" aria-pressed="${!operator}">고객 화면</button><button class="button ${operator ? 'primary' : 'secondary'}" id="engagement-view-operator" aria-pressed="${operator}">운영자 상세</button></div></div>
    <div class="card" id="engagement-progress"><div class="card-title"><div><h3>진행 단계</h3><span>고객에게는 이 네 단계만 보여 줍니다.</span></div><strong>${escapeHtml(engagement.stage)}</strong></div>
      <nav class="workflow-steps" aria-label="의뢰 진행 단계">${ENGAGEMENT_STAGES.map((name, index) => `<button class="workflow-step ${index === engagement.stageIndex ? 'active' : ''} ${index < engagement.stageIndex ? 'done' : ''}" type="button" disabled><span>${index < engagement.stageIndex ? '✓' : index + 1}</span>${escapeHtml(name)}</button>`).join('')}</nav>
      <div class="alert success" id="engagement-next"><strong>다음 하실 일: ${escapeHtml(next.label)}</strong><p>${escapeHtml(next.why)}</p></div></div>
    <div class="card" id="engagement-request"><div class="card-title"><div><h3>공고 요청서 · 고객 담당자</h3><span>고객이 의뢰한 내용입니다. 기관 영구정보로 올리지 않습니다.</span></div></div>
      <div class="two-col"><div class="field"><label for="engagement-client-name">담당자 이름</label><input id="engagement-client-name" data-engagement-client="name" value="${escapeHtml(state.engagement.client.name)}"></div>
        <div class="field"><label for="engagement-client-position">직위·부서</label><input id="engagement-client-position" data-engagement-client="position" value="${escapeHtml(state.engagement.client.position)}"></div></div>
      <div class="two-col"><div class="field"><label for="engagement-client-contact">연락처</label><input id="engagement-client-contact" data-engagement-client="contact" value="${escapeHtml(state.engagement.client.contact)}" placeholder="이 건 진행에 필요한 연락처만 적습니다."></div>
        <div class="field"><label for="engagement-request-manager">담당 운영자</label><input id="engagement-request-manager" data-engagement-request="manager" value="${escapeHtml(state.engagement.request.manager)}"></div></div>
      <div class="two-col"><div class="field"><label for="engagement-request-title">요청 사업명</label><input id="engagement-request-title" data-engagement-request="title" value="${escapeHtml(state.engagement.request.title)}"></div>
        <div class="field"><label for="engagement-request-deadline">마감일</label><input id="engagement-request-deadline" data-engagement-request="deadline" value="${escapeHtml(state.engagement.request.deadline)}" placeholder="YYYY-MM-DD"></div></div>
      <div class="two-col"><div class="field"><label for="engagement-applicant">신청기관 선택</label><select id="engagement-applicant"><option value="">선택 안 함(아래에 기관명 입력)</option>${state.applicants.map(item => `<option value="${escapeHtml(item.id)}" ${state.selectedApplicantId === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="engagement-request-applicant">신규 기관명</label><input id="engagement-request-applicant" data-engagement-request="applicantName" value="${escapeHtml(state.engagement.request.applicantName)}" placeholder="아직 등록되지 않은 기관이면 이름만 적어 주세요."></div></div>
      <div class="alert"><strong>공고문·신청서식·첨부자료</strong><p>공고 원문 ${state.sourceText.trim().length.toLocaleString()}자 · 첨부 ${state.manualSources.filter(item => item.extractionStatus === 'success').length}건 읽음</p>
        <button class="button secondary" data-step="0">공고문·서식 올리기</button></div>
      <div class="field"><label for="engagement-request-ask">요청 내용</label><textarea id="engagement-request-ask" data-engagement-request="ask" placeholder="어떤 공고에 무엇을 준비해야 하는지 적어 주세요.">${escapeHtml(state.engagement.request.ask)}</textarea></div>
      <div class="actions"><span class="muted">여기 적은 내용은 이 의뢰 건에만 저장됩니다.</span><button class="button primary" id="engagement-save">요청서 저장</button></div></div>
    ${designBriefView(engagement, operator)}
    ${operator ? engagementOperatorView(engagement) : `<div class="card"><div class="card-title"><div><h3>준비 상태</h3><span>준비된 것과 아직 필요한 것만 보여 드립니다.</span></div></div>
      <div class="requirement-list">${engagement.parts.map(item => `<article class="requirement"><div><span class="status ${PART_TONE[item.state]}">${escapeHtml(item.state)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div></div></article>`).join('')}</div></div>`}`;
}

// 신청서 서식 규격표 — 계획서를 만들기 전에 서식이 정한 기준을 먼저 확인한다.
function formSpecView(brief) {
  const spec = currentFormSpec();
  const plan = brief.documentPlan;
  if (!spec) {
    return `<div class="alert warning"><strong>신청서 서식을 아직 읽지 못했습니다</strong><p>공모신청서·사업계획서 서식을 자료로 올리면 항목별 분량·필수 표·첨부서류를 서식 기준으로 맞춥니다. 지금은 기본 목차와 공고 기준으로 작성합니다.</p><button class="button secondary" data-step="0">서식 올리기</button></div>`;
  }
  return `<details class="card" id="form-spec" open><summary><strong>신청서 서식 규격표 · ${escapeHtml(spec.status)}</strong> — 작성 항목 ${spec.items.length}개 · 필수 표 ${spec.tables.length}개 · 첨부서류 ${spec.attachments.length}건</summary>
    <p class="muted">읽은 서식: ${escapeHtml(spec.sources.map(item => `${item.fileName}(${item.sourceType})`).join(' · '))}</p>
    ${spec.items.length ? `<div class="requirement-list">${spec.items.map(item => `<article class="requirement"><div><span class="status ${item.status === '확인됨' ? '충족' : '확인-필요'}">${escapeHtml(item.status)}</span><div><strong>${escapeHtml(item.name)}</strong><small>${item.limitChars ? `${item.limitChars.toLocaleString()}자 이내` : item.limitPages ? `${item.limitPages}쪽 이내` : '분량 제한 확인 필요'}</small><small class="muted">서식 근거 [${escapeHtml(item.location)}] “${escapeHtml(String(item.evidence).slice(0, 120))}”</small></div></div></article>`).join('')}</div>` : ''}
    ${plan.tables.length ? `<p>필수 표: ${plan.tables.map(table => `<b>${escapeHtml(table.title)}</b>(${escapeHtml(table.source)})`).join(' · ')}</p>` : ''}
    ${plan.budgetForm ? `<div class="alert"><strong>예산 양식 · ${escapeHtml(plan.budgetForm.status)}</strong><p>${plan.budgetForm.columns.length ? `열 구성: ${escapeHtml(plan.budgetForm.columns.join(' | '))}` : '열 구성을 서식에서 찾지 못했습니다.'}</p>${plan.budgetForm.rules.map(rule => `<p>· ${escapeHtml(rule.text)}</p>`).join('')}</div>` : ''}
    ${plan.attachments.length ? `<details><summary>첨부서류 ${plan.attachments.length}건</summary>${plan.attachments.map(item => `<p>${item.required ? '필수' : '선택'} · ${escapeHtml(item.name)}<br><small class="muted">[${escapeHtml(item.location)}]</small></p>`).join('')}</details>` : ''}
    ${spec.openPoints.length ? `<div class="alert warning"><strong>서식에서 확인하지 못한 기준 ${spec.openPoints.length}건</strong>${spec.openPoints.map(item => `<p>· ${escapeHtml(item)}</p>`).join('')}<p>확인하지 못한 기준은 만들지 않고 기본값으로 작성합니다.</p></div>` : ''}</details>`;
}

// 버전 하나를 저장한다. 본문·표를 함께 넣고, 무엇을 근거로 만들었고 어떤 판정을 받았는지 붙여 둔다.
// 저장 직후 현재 버전을 이 버전으로 명시한다(어느 버전을 쓰는지 추측하지 않는다).
function recordProposalVersion(patch = {}, { reset = false } = {}) {
  const { reset: _ignored, ...rest } = patch;
  state.proposalVersions = appendProposalVersion(reset ? [] : (state.proposalVersions || []), {
    tables: state.proposalTables || [], context: versionContext(), ...rest
  });
  state.currentVersionId = state.proposalVersions[state.proposalVersions.length - 1].versionId;
  return state.proposalVersions;
}
function versionContext() {
  const design = state.engagement?.design || {};
  const review = state.preciseReview;
  return {
    designApproval: design.approvedAt ? { approvedAt: design.approvedAt, approvedBy: design.approvedBy, snapshot: design.snapshot || null } : null,
    preciseReview: review?.summary ? { round: review.round, summary: review.summary, fingerprint: review.fingerprint || '', at: review.at || '' } : null,
    gateStatus: currentSubmissionGate()?.status || ''
  };
}
// 저장된 버전만 열고 출력한다. 잘못된 식별자는 다른 버전으로 조용히 바꾸지 않는다.
function selectedSavedVersion() {
  return resolveSavedVersion(state.proposalVersions, state.currentVersionId);
}
function selectProposalVersion(versionId) {
  const found = findVersionById(state.proposalVersions, versionId);
  if (!found) return setState({ error: `저장된 버전을 찾지 못했습니다(${versionId}).` });
  // 화면 작업본도 고른 버전으로 맞춘다. 저장된 내용과 다른 것을 출력하지 않기 위해서다.
  setState({
    currentVersionId: found.versionId, sections: structuredClone(found.sections), proposalTables: structuredClone(found.tables || []),
    notice: `V${found.version} ${found.label}을 열었습니다. 저장된 내용 그대로입니다.`, error: ''
  });
}
// 화면 작업본이 저장된 버전과 다르면 출력하지 않는다.
function unsavedChanges() {
  const { version } = selectedSavedVersion();
  if (!version) return false;
  return JSON.stringify(version.sections) !== JSON.stringify(state.sections) || JSON.stringify(version.tables || []) !== JSON.stringify(state.proposalTables || []);
}

// 제출서류 한 벌 — 지금 이 버전이 제출 가능한지 판정하고 함께 낼 것을 정리한다.
function currentSubmissionPackage() {
  if (!state.sections.length) return null;
  return buildSubmissionPackage({
    mode: proposalMode(), sections: state.sections, tables: state.proposalTables || [],
    versions: state.proposalVersions || [], proposalFlow: proposalFlow(),
    gate: currentSubmissionGate(), preciseReview: state.preciseReview,
    formSpec: currentFormSpec(), applicant: selectedApplicant(), included: state.submissionIncluded || [],
    outline: buildDocumentPlan(currentNoticeContract(), currentFormSpec()).outline
  });
}
// 판정을 통과하지 못하면 출력하지 않는다. 통과하면 기존 출력 함수를 그대로 부른다.
function exportFinalPackage(kind) {
  const summary = currentSubmissionPackage();
  if (!summary?.canExport) {
    return setState({ error: `제출 ${summary?.status || '판정'} 상태입니다. ${(summary?.blockers || []).map(item => item.reason).join(' / ') || '먼저 계획서를 작성하세요.'}` });
  }
  // 출력은 화면 작업본이 아니라 저장된 버전을 쓴다. 저장되지 않았거나 식별자가 잘못되면 내보내지 않는다.
  const { version, reason } = selectedSavedVersion();
  if (!version) return setState({ error: reason });
  if (unsavedChanges()) return setState({ error: `화면 내용이 저장된 V${version.version}과 달라 출력하지 않았습니다. 버전을 다시 열거나 수정본을 저장한 뒤 출력하세요.` });
  const applicantName = selectedApplicant()?.name || '';
  const options = { forSubmission: true, tables: version.tables || [], applicantName, version: version.version };
  // PDF는 인쇄창을 거치지 않고 실제 파일로 내려받는다. 실패하면 다른 형식으로 대신 주지 않는다.
  const run = kind === 'docx'
    ? exportDocx(state.project, version.sections, options)
    : exportProposalPdf({
      project: state.project, sections: version.sections, tables: version.tables || [],
      fileName: submissionFileName(state.project, { applicantName, version: version.version, kind: 'pdf' })
    });
  run.catch(showError);
}
function toggleAttachment(name) {
  const included = new Set(state.submissionIncluded || []);
  if (included.has(name)) included.delete(name); else included.add(name);
  setState({ submissionIncluded: [...included], notice: '', error: '' });
}

// ---------- 제출 ZIP ----------
// 필수 첨부마다 실제 파일을 연결한다. 원본은 메모리에만 두고 바꾸지 않는다.
function linkAttachmentFile(name, file) {
  if (!file) return;
  attachmentFiles.set(name, file);
  const links = { ...(state.attachmentLinks || {}), [name]: { fileName: file.name, size: file.size, at: new Date().toISOString() } };
  setState({ attachmentLinks: links, notice: `${name}에 ${file.name}을 연결했습니다.`, error: '' });
}
function unlinkAttachmentFile(name) {
  attachmentFiles.delete(name);
  const links = { ...(state.attachmentLinks || {}) };
  delete links[name];
  setState({ attachmentLinks: links, notice: `${name}의 연결을 해제했습니다.`, error: '' });
}
// 계획서 버전이 바뀌면 앞서 묶은 제출서류는 지난 판이다.
function submissionZipStale() {
  return Boolean(state.submissionZip) && packageStale(state.submissionZip, state.currentVersionId);
}
function currentZipPlan(documents = null) {
  const summary = currentSubmissionPackage();
  const { version } = selectedSavedVersion();
  return planSubmissionZip({
    canExport: Boolean(summary?.canExport) && Boolean(version) && !unsavedChanges(),
    packageStatus: summary?.status || '',
    attachments: currentFormSpec()?.attachments || [],
    links: state.attachmentLinks || {},
    documents: documents || [{ key: 'docx', name: '최종 사업계획서.docx', bytes: null }, { key: 'pdf', name: '최종 사업계획서.pdf', bytes: null }],
    projectTitle: state.project.title || '', applicantName: selectedApplicant()?.name || '',
    version: version?.version || 0, versionId: version?.versionId || '', generatedAt: new Date().toISOString()
  });
}
async function exportSubmissionZip() {
  const { version, reason } = selectedSavedVersion();
  if (!version) return setState({ error: reason });
  if (unsavedChanges()) return setState({ error: `화면 내용이 저장된 V${version.version}과 달라 제출서류를 묶지 않았습니다.` });
  const applicantName = selectedApplicant()?.name || '';
  const names = { docx: submissionFileName(state.project, { applicantName, version: version.version, kind: 'docx' }), pdf: submissionFileName(state.project, { applicantName, version: version.version, kind: 'pdf' }) };
  setState({ busy: 'zip', notice: '', error: '' });
  try {
    // 제출 문서는 지금 고른 저장 버전으로만 만든다.
    const options = { forSubmission: true, tables: version.tables || [], applicantName, version: version.version };
    const [docx, pdf] = await Promise.all([
      buildDocxBlob(state.project, version.sections, options),
      buildProposalPdfBlob({ project: state.project, sections: version.sections, tables: version.tables || [] })
    ]);
    const blobs = { docx, pdf };
    const plan = currentZipPlan([{ key: 'docx', name: names.docx, bytes: docx.size }, { key: 'pdf', name: names.pdf, bytes: pdf.size }]);
    if (!plan.ok) return setState({ busy: '', error: `제출서류를 묶지 않았습니다. ${plan.blockers.map(item => `${item.reason} — ${item.detail}`).join(' / ')}` });
    const files = [];
    for (const entry of plan.entries) {
      // 첨부 원본은 변환하지 않고 읽은 바이트를 그대로 담는다.
      const source = entry.kind === '문서' ? blobs[entry.key] : attachmentFiles.get(entry.slot);
      if (!source) throw new Error(`${entry.slot || entry.name}의 파일을 읽지 못했습니다.`);
      const bytes = new Uint8Array(await source.arrayBuffer());
      if (!bytes.length) throw new Error(`${entry.slot || entry.name}이 0바이트입니다.`);
      files.push({ name: entry.name, bytes });
    }
    files.push({ name: MANIFEST_NAME, bytes: new TextEncoder().encode(plan.manifest) });
    downloadBlob(new Blob([zipBytes(files, plan.meta.generatedAt)], { type: 'application/zip' }), plan.fileName);
    setState({
      busy: '', notice: `제출서류 ${files.length}개 파일을 묶었습니다: ${plan.fileName}`,
      submissionZip: { versionId: version.versionId, at: plan.meta.generatedAt, fileName: plan.fileName, count: files.length }
    });
  } catch (error) {
    setState({ busy: '', error: `제출서류를 묶지 못했습니다. ${error.message}` });
  }
}
const PACKAGE_TONE = { '제출 가능': 'success', '보완 필요': 'warning', '제출 차단': 'danger' };
// 파일을 연결하지 않아도 되는 항목인지 알려준다(생성 문서로 충족·참고자료).
function zipSkipReason(plan, name) {
  return plan.skipped.find(item => item.name === name && item.reason !== '선택 첨부이며 연결된 파일이 없습니다.')?.reason || '';
}
// 제출 ZIP 구성표. 무엇이 들어가고 무엇이 빠지는지 만들기 전에 보여준다.
function zipPanelView(plan) {
  const stale = submissionZipStale();
  return `<details open><summary>제출 ZIP 구성 · 포함 ${plan.entries.length + 1}건 · 미포함 ${plan.skipped.length}건</summary>
    ${plan.ok ? '' : `<div class="alert danger"><strong>아직 제출본으로 굳힐 수 없습니다</strong>${plan.blockers.map(item => `<p>✕ <b>${escapeHtml(item.reason)}</b> — ${escapeHtml(item.detail)}</p>`).join('')}</div>`}
    ${stale ? `<div class="alert warning"><strong>앞서 묶은 제출서류는 지난 판입니다</strong><p>계획서 버전이 바뀌었습니다. ${escapeHtml(state.submissionZip.fileName)}을 그대로 제출하지 말고 다시 묶으세요.</p></div>` : ''}
    ${!stale && state.submissionZip ? `<div class="alert success"><strong>마지막으로 묶은 제출서류</strong><p>${escapeHtml(state.submissionZip.fileName)} · 파일 ${state.submissionZip.count}개 · ${escapeHtml(String(state.submissionZip.at).slice(0, 16).replace('T', ' '))}</p></div>` : ''}
    <div class="requirement-list">${[...plan.entries, { kind: '제출목록', name: MANIFEST_NAME, slot: '', bytes: null }].map(entry => `<article class="requirement"><div><span class="status 충족">${escapeHtml(entry.kind)}</span><div><strong>${escapeHtml(entry.name)}</strong><small class="muted">${escapeHtml(entry.slot || entry.from || '')}</small></div></div></article>`).join('')}
      ${plan.skipped.map(item => `<article class="requirement"><div><span class="status ${item.satisfied ? '충족' : '확인-필요'}">미포함</span><div><strong>${escapeHtml(item.name)}</strong><small class="muted">${escapeHtml(item.reason)}</small></div></div></article>`).join('')}</div>
    <div class="actions"><span class="muted">공고문·참고자료와 내부 검증 자료는 담지 않습니다.</span>
      <button class="button primary" id="package-zip" ${plan.ok && state.busy !== 'zip' ? '' : 'disabled'}>${state.busy === 'zip' ? '묶는 중…' : '제출 ZIP 내려받기'}</button></div></details>`;
}
// 저장된 버전 목록. 어느 버전을 열고 출력할지 여기서 고른다.
function versionPickerView() {
  const versions = state.proposalVersions || [];
  if (!versions.length) return '<div class="alert warning"><strong>저장된 버전이 없습니다</strong><p>저장되지 않은 계획서는 출력하지 않습니다.</p></div>';
  const { version, reason } = selectedSavedVersion();
  return `<details open><summary>저장된 버전 ${versions.length}개 · 현재 <b>${version ? `V${version.version} ${escapeHtml(version.label)}` : '선택 안 됨'}</b></summary>
    ${reason ? `<div class="alert danger"><strong>출력 차단</strong><p>${escapeHtml(reason)}</p></div>` : ''}
    ${unsavedChanges() ? '<div class="alert warning"><strong>화면 내용이 저장된 버전과 다릅니다</strong><p>저장된 내용만 출력합니다. 버전을 다시 열거나 수정본을 저장하세요.</p></div>' : ''}
    <div class="requirement-list">${versions.map(item => `<article class="requirement"><div><span class="status ${item.versionId === state.currentVersionId ? '충족' : '확인-필요'}">V${item.version}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(String(item.savedAt).slice(0, 16).replace('T', ' '))} · 본문 ${(item.sections || []).length}개 · 표 ${(item.tables || []).length}개${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</small>${item.context?.preciseReview ? `<small class="muted">정밀검증 ${item.context.preciseReview.round}차 · 제출 불가 ${item.context.preciseReview.summary?.blocking ?? 0}건 · 판정 ${escapeHtml(item.context.gateStatus || '-')}</small>` : ''}</div></div>
      <button class="button secondary" data-open-version="${escapeHtml(item.versionId)}" ${item.versionId === state.currentVersionId ? 'disabled' : ''}>이 버전 열기</button></article>`).join('')}</div></details>`;
}

function openMarkCount() { return openMarkTotal(state.sections); }

function submissionPackageView() {
  const summary = currentSubmissionPackage();
  if (!summary) return '';
  const { version: savedVersion, reason: versionReason } = selectedSavedVersion();
  const exportBlock = versionReason || (unsavedChanges() ? `화면 내용이 저장된 V${savedVersion?.version}과 달라 출력할 수 없습니다.` : '');
  const zipPlan = currentZipPlan();
  return `<div class="card" id="submission-package" tabindex="-1"><div class="card-title"><div><h3>제출서류 한 벌 · ${escapeHtml(summary.status)}</h3><span>지금 버전 기준입니다. 출력은 기존 DOCX·PDF 경로를 그대로 씁니다.</span></div><span class="status ${summary.status === '제출 가능' ? '충족' : summary.status === '보완 필요' ? '부분-충족' : '부족'}">${escapeHtml(summary.status)}</span></div>
    <div class="alert ${PACKAGE_TONE[summary.status]}"><strong>${summary.blockers.length ? `출력을 막는 사유 ${summary.blockers.length}건` : summary.warnings.length ? `확인할 사항 ${summary.warnings.length}건` : '제출 조건을 모두 지켰습니다'}</strong>
      ${summary.blockers.map(item => `<p>✕ <b>${escapeHtml(item.reason)}</b> — ${escapeHtml(item.detail)}</p>`).join('')}
      ${summary.warnings.map(item => `<p>· ${escapeHtml(item.reason)} — ${escapeHtml(item.detail)}</p>`).join('')}
      ${summary.blockers.length ? `<p class="muted">막힌 것은 <b>제출본 확정</b>뿐입니다. 지금까지 쓴 내용은 아래 「검토본 받기」로 언제든 받을 수 있습니다.</p>
        <div class="actions" style="margin-top:6px"><span></span><div>
          <button class="button secondary" id="package-review-docx">검토본 DOCX 받기</button>
          <button class="button secondary" id="package-review-pdf">검토본 PDF 받기</button>
          ${openMarkCount() ? '<button class="button primary" id="package-fill-open">확인 필요 ' + openMarkCount() + '곳 채우기</button>' : ''}
        </div></div>` : ''}</div>
    <div class="summary-grid">
      <div><span>현재 버전</span><strong>${summary.timeline.version ? `V${summary.timeline.version}` : '없음'}</strong><small>${escapeHtml(summary.timeline.versionLabel || '')}</small></div>
      <div><span>최종본 승인</span><strong>${summary.timeline.approvedVersion ? `V${summary.timeline.approvedVersion}` : '미승인'}</strong><small>${escapeHtml(String(summary.timeline.approvedAt).slice(0, 10))}</small></div>
      <div><span>공고 적합성</span><strong>${escapeHtml(summary.timeline.gateStatus || '판정 전')}</strong><small>코드 대조</small></div>
      <div><span>정밀검증</span><strong>${escapeHtml(summary.review.freshness)}</strong><small>${summary.review.round ? `${summary.review.round}차 · 제출 불가 ${summary.review.blocking}건` : '미실행'}</small></div>
    </div>
    <details open><summary>제출 문서 ${summary.documents.length}개 · 필수 표 ${summary.tables.length}개</summary>
      <div class="requirement-list">${[...summary.documents, ...summary.tables.map(table => ({ name: `${table.title} (${table.kind})`, ready: table.ready, via: `${table.rows}행` }))].map(item => `<article class="requirement"><div><span class="status ${item.ready ? '충족' : '확인-필요'}">${item.ready ? '준비됨' : '준비 안 됨'}</span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.via || '')}</small></div></div></article>`).join('')}</div></details>
    ${summary.attachments.length ? `<details open><summary>첨부서류 ${summary.attachments.length}건 · 파일 연결 ${Object.keys(state.attachmentLinks || {}).length}건</summary>
      <p class="muted">「준비 완료」 표시만으로는 묶지 않습니다. 필수 첨부는 실제 파일을 연결해야 제출서류로 묶을 수 있습니다.</p>
      <div class="requirement-list">${summary.attachments.map(item => {
    const link = (state.attachmentLinks || {})[item.name];
    const auto = zipSkipReason(zipPlan, item.name);
    return `<article class="requirement"><div><span class="status ${link || auto ? '충족' : item.required ? '부족' : '확인-필요'}">${item.required ? '필수' : '선택'}</span><div><strong>${escapeHtml(item.name)}</strong><small class="muted">${escapeHtml(item.location)}</small>
        ${auto ? `<small>${escapeHtml(auto)}</small>` : link ? `<small>연결됨: ${escapeHtml(link.fileName)} · ${Math.max(1, Math.round(link.size / 1024)).toLocaleString()}KB</small>` : '<small class="muted">연결된 파일 없음</small>'}</div></div>
      <div style="display:flex;gap:8px;align-items:center">${auto ? '' : `<input type="file" data-attachment-file="${escapeHtml(item.name)}">${link ? `<button class="button secondary" data-attachment-clear="${escapeHtml(item.name)}">연결 해제</button>` : ''}`}
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-attachment="${escapeHtml(item.name)}" ${item.included ? 'checked' : ''}>준비 완료</label></div></article>`;
  }).join('')}</div></details>` : ''}
    ${zipPanelView(zipPlan)}
    ${summary.checklist.length ? `<details><summary>제출 전 확인 목록 ${summary.checklist.length}건</summary><div class="requirement-list">${summary.checklist.map(item => `<article class="requirement"><div><span class="status 확인-필요">${escapeHtml(item.status)}</span><div><strong>${escapeHtml(item.area)}</strong><small>${escapeHtml(item.item)}</small></div></div></article>`).join('')}</div></details>` : ''}
    ${versionPickerView()}
    <div class="actions"><span class="muted">${escapeHtml(summary.canExport ? (exportBlock || '제출본을 출력할 수 있습니다.') : '위 사유를 해결해야 출력할 수 있습니다.')}</span><div>
      <button class="button secondary" id="package-pdf" ${guard(exportBlock || (summary.canExport ? '' : '아직 내려받을 내용이 없습니다. 계획서를 먼저 작성해 주세요.'), exportBlock ? 'membership' : 'write')}>최종 PDF 내려받기</button>
      <button class="button primary" id="package-docx" ${guard(exportBlock || (summary.canExport ? '' : '아직 내려받을 내용이 없습니다. 계획서를 먼저 작성해 주세요.'), exportBlock ? 'membership' : 'write')}>최종 DOCX 내려받기</button></div></div></div>`;
}

// 정밀 검증 — 정밀형에서만 보이고, 운영자가 버튼으로 실행한다. 검증만으로 본문은 바뀌지 않는다.
const SEVERITY_TONE = { BLOCKING: '부족', 주의: '부분-충족', 참고: '확인-필요' };
function preciseReviewView() {
  if (!state.sections.length) return '';
  const mode = proposalMode();
  const review = state.preciseReview;
  const gate = currentSubmissionGate();
  if (mode !== '정밀형') {
    return `<details class="card" id="precise-review"><summary><strong>정밀 검증</strong> — 지금은 표준형 계획서입니다</summary>
      <p class="muted">정밀형으로 바꾸면 공고 실행계약서·서식 규격표·승인 설계안·확정 수요근거와 대조해 문제 구간만 고칠 수 있습니다. 표준형 흐름은 그대로입니다.</p>
      <button class="button secondary" id="set-precise-mode">정밀형으로 전환</button></details>`;
  }
  const summary = review?.summary || null;
  return `<div class="card" id="precise-review" tabindex="-1"><div class="card-title"><div><h3>정밀 검증 · 부분 수정</h3><span>확정된 기준과만 대조합니다. 검증으로 계획서를 바꾸지 않습니다.</span></div><span class="status ${summary ? (summary.blocking ? '부족' : summary.total ? '부분-충족' : '충족') : '확인-필요'}">${escapeHtml(summary ? summary.verdict : '검증 전')}</span></div>
    ${summary ? `<div class="summary-grid">
      <div><span>확인한 문제</span><strong>${summary.total}건</strong><small>${escapeHtml(review.round)}차 검증</small></div>
      <div><span>제출 불가</span><strong>${summary.bySeverity.BLOCKING}</strong><small>공고·설계안 위반</small></div>
      <div><span>보완 권고</span><strong>${summary.bySeverity['주의'] + summary.bySeverity['참고']}</strong><small>확인 후 판단</small></div>
      <div><span>대상 항목</span><strong>${summary.sections.length}개</strong><small>나머지는 손대지 않음</small></div></div>` : '<p class="muted">공고 강제조건·승인 설계안·서식 규격·내부 정합성·확정 수요근거 다섯 가지만 봅니다. 문장별 표현 검사는 하지 않습니다.</p>'}
    ${review?.issues?.length ? `<div class="requirement-list">${review.issues.map(issue => `<article class="requirement"><div><span class="status ${SEVERITY_TONE[issue.severity]}">${escapeHtml(issue.severity)}</span><div><strong>${escapeHtml(sectionTitleById(issue.sectionId))} · ${escapeHtml(issue.scope)} · ${escapeHtml(issue.target)}</strong><small>${escapeHtml(issue.problem)}</small><small class="muted">판단 근거: ${escapeHtml(issue.basis)}</small><small class="muted">수정 지시: ${escapeHtml(issue.instruction)}</small></div></div></article>`).join('')}</div>` : ''}
    ${review?.patched ? `<div class="alert success"><strong>수정한 항목 ${review.patched.changed.length}개 · 그대로 둔 항목 ${review.patched.preserved.length}개</strong>
      <p>수정: ${escapeHtml(review.patched.changed.map(sectionTitleById).join(' · ') || '없음')}</p>
      ${review.patched.skipped.length ? `<p>변경 없음으로 건너뜀: ${escapeHtml(review.patched.skipped.map(sectionTitleById).join(' · '))}</p>` : ''}
      <p>수정 후 제출 게이트: <b>${escapeHtml(gate?.status || '판정 전')}</b>${gate?.blocking.length ? ` · 남은 강제조건 ${gate.blocking.length}건` : ''}</p></div>` : ''}
    ${review?.note ? `<p class="muted">${escapeHtml(review.note)}</p>` : ''}
    <div class="actions"><span class="muted">자동 재시도는 하지 않습니다. 한 번씩 눌러 진행하세요.</span><div>
      <button class="button ${review ? 'secondary' : 'primary'}" id="run-precise-review">${review ? `정밀 재검증 (${review.round + 1}차)` : '정밀 검증 실행'}</button>
      ${review?.issues?.length && !review.patched ? '<button class="button primary" id="apply-precise-fixes">문제 구간만 수정</button>' : ''}
      <button class="button secondary" id="set-standard-mode">표준형으로 되돌리기</button></div></div></div>`;
}

// 사업환경·수요근거표 — 필요성을 뒷받침하는 근거를 출처와 함께 보여 준다. 출처 없는 수요는 만들지 않는다.
const BASIS_TONE = { '공고 근거': '충족', '기관 확인 사실': '충족', '업로드 자료': '부분-충족', '확인 필요': '확인-필요' };
function demandEvidenceView() {
  const demand = currentDemandEvidence();
  if (!demand?.rows?.length) return '';
  return `<details class="card" id="demand-evidence" open><summary><strong>사업환경·수요근거 · ${escapeHtml(demand.status)}</strong> — 확정 ${demand.confirmed.length}개 · 확인 필요 ${demand.open.length}개</summary>
    <p class="muted">${escapeHtml(demand.rule)}</p>
    <div class="requirement-list">${demand.rows.map(row => `<article class="requirement"><div><span class="status ${BASIS_TONE[row.basis]}">${escapeHtml(row.basis)}</span><div><strong>${escapeHtml(row.title)}</strong>
      ${row.items.length ? row.items.map(item => `<small>${item.hasFigure ? '<b>수치</b> · ' : ''}${escapeHtml(String(item.text).slice(0, 160))}</small><small class="muted">출처 [${escapeHtml(item.location)}]</small>`).join('') : `<small>${escapeHtml(row.question)}</small>`}</div></div></article>`).join('')}</div>
    ${demand.openPoints.length ? `<div class="alert warning"><strong>근거가 없는 항목 ${demand.openPoints.length}개</strong>${demand.openPoints.map(point => `<p>· ${escapeHtml(point)}</p>`).join('')}<p>근거 없이 지역 문제나 수요 수치를 만들지 않습니다. 확인되면 설계안에 반영합니다.</p></div>` : '<div class="alert success"><strong>모든 근거 항목에 출처가 있습니다</strong></div>'}</details>`;
}

// 계획서 설계안 — 승인 전에 무엇을 어떻게 쓸지 먼저 합의한다.
const DESIGN_TONE = { '설계 준비 중': '확인-필요', '확인 요청': '부분-충족', '운영자 검토': '부분-충족', '설계 승인': '충족', '계획서 작성 완료': '충족' };
function designBriefView(engagement, operator) {
  const brief = engagement.brief;
  const status = engagement.designState;
  const approval = engagement.approval;
  // 확정값이 바뀌면 승인 snapshot이 옛것이 된다. 그대로 기준으로 쓰지 않고 다시 승인받는다.
  const stale = designSnapshotStale(approval, brief);
  const actions = status === '계획서 작성 완료'
    ? (stale
      ? '<span class="muted">이번 사업 확정값이 바뀌어 승인 내용이 옛것이 되었습니다.</span><button class="button primary" id="design-approve">변경된 설계안 다시 승인</button>'
      : '<span class="muted">계획서가 작성되어 설계 단계는 끝났습니다.</span>')
    : status === '설계 승인'
      ? `<span class="muted">${escapeHtml(approval.approvedBy)} 역할로 ${escapeHtml(String(approval.approvedAt).slice(0, 16).replace('T', ' '))}에 승인</span><button class="button secondary" id="design-reopen">승인 해제</button>`
      : `${status === '설계 준비 중' ? '<button class="button primary" id="design-request">설계안 확인 요청</button>' : ''}
         ${status === '확인 요청' ? '<button class="button secondary" id="design-review">운영자 검토 시작</button>' : ''}
         ${status === '운영자 검토' ? '<button class="button primary" id="design-approve">사업 설계 승인</button>' : ''}`;
  return `<div class="card" id="design-brief"><div class="card-title"><div><h3>계획서 설계안</h3><span>승인하면 이 내용대로 계획서를 작성합니다. 승인 전에는 작성을 시작하지 않습니다.</span></div><span class="status ${DESIGN_TONE[status]}">${escapeHtml(status)}</span></div>
    <div class="summary-grid">
      <div><span>신청유형</span><strong>${escapeHtml(brief.applicationType.selected || '미선택')}</strong><small>${escapeHtml(brief.applicationType.options.join(' / ') || '공고에 유형 구분 없음')}</small></div>
      <div><span>공고 강제조건</span><strong>${brief.blockingRules.length}개</strong><small>반드시 지켜야 하는 조건</small></div>
      <div><span>핵심 수행모델</span><strong>${brief.requiredModels.length}개</strong><small>일반 프로그램으로 대체 불가</small></div>
      <div><span>확인할 사항</span><strong>${brief.openFacts.length}건</strong><small>확인 전에는 [확인 필요]로 남습니다</small></div>
    </div>
    <div class="requirement-list">${brief.coreValues.map(item => `<article class="requirement"><div><span class="status ${item.value === '[확인 필요]' ? '확인-필요' : item.basis === '공고 확정' ? '충족' : '부분-충족'}">${escapeHtml(item.basis)}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.value)}</small></div></div></article>`).join('')}</div>
    ${brief.requiredModels.length ? `<details open><summary>공고가 요구한 핵심 수행모델 ${brief.requiredModels.length}개</summary>${brief.requiredModels.map(item => `<p>· ${escapeHtml(item.title)}<br><small class="muted">반영 확인 핵심어: ${escapeHtml(item.keyphrases.join(' · '))}</small></p>`).join('')}</details>` : ''}
    ${brief.openFacts.length ? `<div class="alert warning"><strong>확인이 필요한 항목 ${brief.openFacts.length}건</strong>${brief.openFacts.slice(0, 8).map(item => `<p>· ${escapeHtml(item)}</p>`).join('')}</div>` : `<div class="alert success"><strong>확인이 필요한 항목이 없습니다</strong><p>기관 확인 사실 ${brief.confirmedFacts.length}건으로 설계했습니다.</p></div>`}
    ${formSpecView(brief)}
    ${demandEvidenceView()}
    <details><summary>계획서 목차 ${brief.outline.length}개 · 항목별 작성 방향 · 목표 분량 ${brief.targetTotalChars.toLocaleString()}자 · 기준 ${escapeHtml(brief.documentPlan.limitSource)}</summary><div class="requirement-list">${brief.outline.map((item, index) => `<article class="requirement"><div><span class="tag">${index + 1}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.direction)}</small>${item.limitSource === '신청서 서식' ? `<small class="muted">서식 항목 「${escapeHtml(item.formItem)}」 · ${item.limitChars ? `${item.limitChars.toLocaleString()}자 이내` : `${item.limitPages}쪽 이내`} · [${escapeHtml(String(item.location || ''))}]</small>` : ''}</div></div><span class="status ${item.limitSource === '신청서 서식' ? '충족' : '부분-충족'}">${item.targetChars.toLocaleString()}자</span></article>`).join('')}</div></details>
    ${operator ? `<details><summary>공고 강제조건 ${brief.blockingRules.length}개 원문 기준</summary><div class="requirement-list">${brief.blockingRules.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(item.ruleType)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.official)}</small></div></div></article>`).join('')}</div></details>` : ''}
    <div class="actions"><span class="muted">${escapeHtml(engagement.canGenerate.allowed ? '전체 계획서 작성이 가능합니다.' : engagement.canGenerate.reason)}</span><div>${actions}</div></div></div>`;
}

function engagementOperatorView(engagement) {
  const operator = engagement.operator;
  const boundary = engagement.boundary;
  return `<div class="card" id="engagement-operator"><div class="card-title"><div><h3>운영자 상세</h3><span>공고 분석·실행계약서·기관현황 근거·설계도·버전·제출 게이트</span></div><strong>${escapeHtml(operator.gateStatus || '게이트 대기')}</strong></div>
      <div class="summary-grid">
        <div><span>공고 실행계약</span><strong>${operator.contractRules}개</strong><small>강제조건 ${operator.blockingRules}개</small></div>
        <div><span>신청유형</span><strong>${escapeHtml(operator.applicationType || '미선택')}</strong><small>${escapeHtml(operator.blueprintReadiness || '설계 전')}</small></div>
        <div><span>계획서</span><strong>${operator.versions ? `V${operator.versions}` : '없음'}</strong><small>검토 ${operator.reviewRounds}회 · ${escapeHtml(operator.proposalStatus || '미시작')}</small></div>
        <div><span>제출 게이트</span><strong>${escapeHtml(operator.gateStatus || '-')}</strong><small>${operator.gateCounts ? `충족 ${operator.gateCounts['충족']} · 미확정 ${operator.gateCounts['미확정']} · 불일치 ${operator.gateCounts['불일치']}` : '계획서 작성 후 판정'}</small></div>
      </div>
      ${operator.gateBlocking ? `<div class="alert danger"><strong>제출을 막는 공고 조건 ${operator.gateBlocking}건</strong><p>계획서 작성 화면의 「공고 적합성」에서 사유와 근거를 볼 수 있습니다.</p></div>` : ''}
      ${boundary.mixed.length ? `<div class="alert danger"><strong>기관 실적이 이번 사업 값으로 그대로 들어온 항목 ${boundary.mixed.length}건</strong>${boundary.mixed.map(item => `<p>· ${escapeHtml(item.label || item.key)} = ${escapeHtml(String(item.value).slice(0, 80))} (기관 실적 「${escapeHtml(item.from)}」과 같음)</p>`).join('')}<p>자동으로 고치지 않았습니다. 이번 사업 값으로 맞는지 확인하세요.</p></div>` : `<div class="alert success"><strong>기관 영구정보와 이번 사업 값이 분리되어 있습니다</strong><p>기관 영구정보 ${boundary.permanent.length}건 · 기관 실적 ${boundary.records.length}건 · 이번 사업 확정값 ${boundary.thisProject.length}건</p></div>`}
      ${boundary.withoutOrigin ? `<div class="alert warning"><strong>출처가 기록되지 않은 기관자료 ${boundary.withoutOrigin}건</strong><p>고객 입력 / 파일 추출 / 운영자 수정 / 기관 확인 중 어디서 왔는지 기록하면 근거를 추적할 수 있습니다.</p></div>` : ''}
      <details><summary>기관 영구정보 ${boundary.permanent.length}건 · 출처·확인상태</summary><div class="requirement-list">${boundary.permanent.map(item => `<article class="requirement"><div><span class="status ${item.status === '확인됨' ? '충족' : '확인-필요'}">${escapeHtml(item.status)}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(String(item.value).slice(0, 160))}</small><small class="muted">출처 ${escapeHtml(item.origin || '미기록')}${item.asOf ? ` · 기준시점 ${escapeHtml(item.asOf)}` : ''}</small></div></div></article>`).join('') || '<p class="muted">등록된 기관 영구정보가 없습니다.</p>'}</div></details>
      <details><summary>이번 사업 확정값 ${boundary.thisProject.length}건</summary><div class="requirement-list">${boundary.thisProject.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(item.key || '값')}</span><div><strong>${escapeHtml(item.label || item.key)}</strong><small>${escapeHtml(String(item.value).slice(0, 160))}</small></div></div></article>`).join('') || '<p class="muted">이번 사업 확정값이 없습니다.</p>'}</div></details>
      <div class="actions"><span class="muted">상세 작업은 기존 화면에서 이어서 합니다.</span><div><button class="button secondary" data-step="1">공고 분석</button><button class="button secondary" data-step="3">사업 설계도</button><button class="button secondary" data-step="4">계획서 작성</button><button class="button secondary" id="engagement-open-coaching">검증·코칭</button></div></div></div>`;
}

function businessSelectView() {
  const choice = state.pendingNoticeChoice ? `<div class="card"><div class="card-title"><div><h3>작성할 세부사업을 선택하세요</h3><span>선택한 사업 내용만 계획서에 반영됩니다.</span></div></div><div class="requirement-list">${state.pendingNoticeChoice.subprojects.map((item, index) => `<article class="requirement"><div><span class="tag">${escapeHtml(item.id)}</span><strong>${escapeHtml(item.title)}</strong></div><button class="button primary" data-select-subproject="${index}">이 사업 선택</button></article>`).join('')}</div></div>` : '';
  return `<div class="page-heading"><div><h2>작성할 사업을 확정하세요</h2><p>복수 세부사업일 때만 한 사업을 선택합니다. 아래 사업 설계도를 확인한 뒤 초안 작성으로 넘어갑니다.</p></div><div class="actions">${sampleButton('blueprint', '[샘플] 완성 설계도 보기')}</div></div>${choice}${contractLockView()}${selectedNoticeDetailView()}${blueprintView()}${attachmentView()}${!state.pendingNoticeChoice && !state.selectedNotice ? '<div class="empty-state"><div>◉</div><h2>선택한 공고가 없습니다</h2><button class="button primary" data-step="1">공고 확인으로 이동</button></div>' : ''}`;
}

function applicantStatusTag(status) { return `<span class="status ${status === CONFIRMED_STATUS ? '충족' : status === '오래된 정보' ? '부분-충족' : '확인-필요'}">${escapeHtml(status)}</span>`; }
function statusOptions(selected) { return APPLICANT_STATUSES.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join(''); }


// ---------- 간단하게 시작하기 ----------
// 기관정보 10개 영역을 다 채우게 하면 계획서를 쓰기도 전에 지친다.
// 시작에 필요한 다섯 가지만 받고, 나머지는 초안을 만든 뒤 공고가 요구할 때만 묻는다.
const quickDraft = () => state.quickOrg || {};

// 초안을 만든 뒤 공고가 실제로 요구하는 것만 묻는다.

// 간단 입력을 신청기관 자료로 옮긴다. 옮긴 값은 확인 필요 상태로 들어간다.
async function saveQuickOrg() {
  // 기관정보 화면에서는 지금 열어 둔 기관에 저장한다. 작성 화면에서는 이번 사업 신청기관에 저장한다.
  const existing = findApplicant(state.applicants, state.activeTool === 'applicants' ? focusedApplicantId() : state.selectedApplicantId);
  // 이미 등록된 기관을 고치는 중이면 기관명은 그 기관의 이름이다. 다시 적게 하지 않는다.
  const draft = { ...quickDraft(), orgName: String(quickDraft().orgName || existing?.name || '').trim() };
  const check = readyToDraft(draft);
  if (!check.ready) { setState({ notice: `${check.missing.join(' · ')}를 먼저 적어 주세요.` }); return false; }
  const items = quickToApplicantItems(draft).map(item => makeApplicantItem(item));
  // 새 신청기관은 normalizeApplicant로 만든다. buildApplicantOrganization은 계획서에 넘길
  // 자료를 만드는 함수라 여기에 쓰면 항목이 사라진 빈 기관이 만들어진다.
  const applicant = existing
    ? normalizeApplicant({ ...existing, name: draft.orgName || existing.name, items: mergeApplicantItems(existing.items, items) })
    : normalizeApplicant({ name: draft.orgName, items });
  setState({
    applicants: upsertApplicant(state.applicants, applicant), selectedApplicantId: applicant.id, applicantEditingId: applicant.id,
    notice: '기관정보로 저장했습니다. 확인 필요 상태이니 내용을 보고 확인해 주세요.'
  });
  await saveArchivedApplicant(applicant).catch(() => null);
  return true;
}

// 기본정보 저장. 기관명·메모까지 함께 저장하고, 원하면 그대로 계획서 작성으로 나간다.
// 상세정보가 비어 있어도 여기서 막지 않는다.
async function saveBasicInfo({ thenWrite = false } = {}) {
  if (!await saveQuickOrg()) return;
  const id = focusedApplicantId();
  if (!id) return;
  await persistApplicant(id, false);
  if (!thenWrite) return setState({ notice: '기본정보를 저장했습니다. 상세정보는 선택이며 나중에 추가할 수 있습니다.', error: '' });
  // 상세정보를 요구하지 않고 바로 작성으로 보낸다.
  setState({ activeTool: '', expertDetail: false, notice: '기본정보를 저장했습니다. 이어서 계획서를 작성합니다.', error: '' });
}

// 기관정보 화면. 페이지를 새로 만들지 않고 이 한 곳을 기본정보 → 상세정보 두 단계로 나눈다.
function applicantsToolView() {
  // 지금 관리하는 기관은 열어 둔 기관이고, 열어 둔 것이 없으면 이번 사업 신청기관이다.
  // 에이전트는 고른 고객기관의 정보를 그대로 관리하게 된다.
  const editing = findApplicant(state.applicants, state.applicantEditingId) || findApplicant(state.applicants, state.selectedApplicantId);
  // 에이전트는 여러 고객 기관을 등록해 그 이름으로 계획서를 쓴다. 화면 이름만 바뀌고 자료 구조는 같다.
  const clients = canHoldClients(auth.user?.role);
  const who = clients ? '고객 기관' : '신청기관';
  return `<div class="page-heading"><div><h2>${who} 정보</h2><p>${clients ? '대신 계획서를 쓸 고객 기관을 등록·수정합니다' : '이번 사업을 신청하는 기관의 정보를 등록·수정합니다'}. 공고 분석 정보와는 분리해 보관하며, 확인된 정보만 계획서 작성에 전달합니다.</p><div class="actions">${sampleButton('applicant', '[샘플] 기관 보기')}</div></div><button class="button secondary" id="close-applicants">작성 흐름으로 돌아가기</button></div>
    <div class="card"><div class="card-title"><div><h3>등록된 ${who} ${state.applicants.length}곳</h3><span>마인드스토리도 등록기관 중 하나로만 취급합니다.</span></div><div><button class="button secondary" id="load-applicants">계획서보관함에서 불러오기</button></div></div>
    <div class="two-col"><div class="field"><label for="applicant-name-draft">새 ${who}명</label><input id="applicant-name-draft" value="${escapeHtml(state.applicantNameDraft)}" placeholder="예: 사단법인 ○○센터"></div><div class="field"><label>&nbsp;</label><button class="button primary" id="add-applicant">신청기관 추가</button></div></div>
    ${state.applicants.length ? `<div class="requirement-list">${state.applicants.map(applicant => {
      const confirmed = applicant.items.filter(item => item.status === CONFIRMED_STATUS).length;
      return `<article class="requirement"><div><span class="tag">${applicant.id === state.selectedApplicantId ? '이번 사업 신청기관' : '등록기관'}</span><div><strong>${escapeHtml(applicant.name)}</strong><small>확인됨 ${confirmed}건 · 확인 필요·오래된 정보 ${applicant.items.length - confirmed}건 · 최근 수정 ${escapeHtml(String(applicant.updatedAt).slice(0, 10))}</small></div></div><div class="actions" style="margin:0;gap:8px"><button class="button secondary" data-edit-applicant="${escapeHtml(applicant.id)}">${(state.applicantEditingId || state.selectedApplicantId) === applicant.id ? '관리 중' : '이 기관 관리'}</button><button class="button secondary" data-select-applicant="${escapeHtml(applicant.id)}">이번 사업 신청기관으로 선택</button><button class="button secondary" data-delete-applicant="${escapeHtml(applicant.id)}">삭제</button></div></article>`;
    }).join('')}</div>` : '<p class="muted">등록된 신청기관이 없습니다. 기관명을 입력하고 추가하세요.</p>'}</div>
    ${editing ? applicantBasicView(editing, who) : `<div class="card"><h3>1단계 기본정보</h3><p class="muted">위에서 ${who}을(를) 추가하거나 고르면 기본정보부터 입력할 수 있습니다.</p></div>`}
    ${editing ? applicantCandidateView(editing) : ''}
    ${editing ? applicantDetailView(editing) : ''}
    ${editing ? applicantSourcesView(editing) : ''}
    ${editing ? applicantDocumentView(editing) : ''}`;
}

// 1) 기관자료 목록. 자료의 종류·이름·주소·기준일만 기록하고, 내용은 기존 추출 경로로 넣는다.
function applicantSourcesView(applicant) {
  const draft = state.applicantSourceDraft || initial.applicantSourceDraft;
  const sources = applicant.sources || [];
  return `<div class="card"><div class="card-title"><div><h3>기관자료 ${sources.length}건</h3><span>홈페이지·소개서·과거 계획서 등 어디서 온 정보인지 남깁니다. 자료를 등록해도 기관 정보가 바로 바뀌지는 않습니다.</span></div></div>
    <div class="two-col"><div class="field"><label for="source-kind">자료 종류</label><select id="source-kind">${SOURCE_KINDS.map(kind => `<option ${draft.kind === kind ? 'selected' : ''}>${escapeHtml(kind)}</option>`).join('')}</select></div>
      <div class="field"><label for="source-name">자료명</label><input id="source-name" value="${escapeHtml(draft.name)}" placeholder="예: 2025 기관소개서"></div></div>
    <div class="two-col"><div class="field"><label for="source-url">주소(URL, 선택)</label><input id="source-url" type="url" value="${escapeHtml(draft.url)}" placeholder="https://"></div>
      <div class="field"><label for="source-asof">자료 기준일</label><input id="source-asof" value="${escapeHtml(draft.asOf)}" placeholder="예: 2026-03 또는 2025년 사업"></div></div>
    <div class="actions" style="margin:0"><span class="muted">URL은 기록만 합니다. 페이지 내용은 아래 「기관 문서에서 정보 추출」에 붙여넣으면 이 자료를 출처로 저장합니다.</span><button class="button secondary" id="add-applicant-source">기관자료 등록</button></div>
    ${sources.length ? `<div class="requirement-list">${sources.map(source => `<article class="requirement"><div><span class="tag">${escapeHtml(source.kind)}</span><div><strong>${escapeHtml(source.name || source.url || '이름 없는 자료')}</strong><small class="muted">${source.url ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.url.slice(0, 60))}</a> · ` : ''}기준일 ${escapeHtml(source.asOf || ASOF_UNKNOWN)}</small></div></div><button class="button secondary" data-remove-source="${escapeHtml(source.id)}">삭제</button></article>`).join('')}</div>` : '<p class="muted">등록한 기관자료가 없습니다.</p>'}</div>`;
}
function addApplicantSource() {
  const applicant = findApplicant(state.applicants, state.applicantEditingId);
  if (!applicant) return setState({ error: '기관자료를 등록할 신청기관을 먼저 선택해 주세요.' });
  const draft = state.applicantSourceDraft || initial.applicantSourceDraft;
  if (!String(draft.name).trim() && !String(draft.url).trim()) return setState({ error: '자료명이나 주소 중 하나는 입력해 주세요.' });
  if (String(draft.url).trim() && !/^https?:\/\//i.test(draft.url.trim())) return setState({ error: '주소는 http 또는 https로 시작해야 합니다.' });
  const next = { ...applicant, sources: [...(applicant.sources || []), makeApplicantSource(draft)] };
  state.applicants = upsertApplicant(state.applicants, next);
  setState({ applicants: state.applicants, applicantSourceDraft: structuredClone(initial.applicantSourceDraft), notice: '기관자료를 등록했습니다. 내용은 아래에서 추출해 확인 후 반영하세요.', error: '' });
  void persistApplicant(next.id, false);
}
function removeApplicantSource(id) {
  const applicant = findApplicant(state.applicants, state.applicantEditingId);
  if (!applicant) return;
  const next = { ...applicant, sources: (applicant.sources || []).filter(item => item.id !== id) };
  state.applicants = upsertApplicant(state.applicants, next);
  setState({ applicants: state.applicants, notice: '기관자료를 삭제했습니다. 이미 확인한 기관 정보는 그대로 남습니다.' });
  void persistApplicant(next.id, false);
}
// 기존 기관 문서에서 정보를 뽑아 ‘업데이트 후보’로만 만든다. 사용자가 반영을 눌러야 기관 정보가 바뀐다.
function applicantDocumentView(applicant) {
  const review = state.applicantExtraction?.applicantId === applicant.id ? state.applicantExtraction : null;
  return `<div class="card"><div class="card-title"><div><h3>기관 문서에서 정보 추출</h3><span>사업계획서·결과보고서·기관소개서를 넣으면 기관정보 업데이트 후보를 만듭니다. 기존 정보는 자동으로 덮어쓰지 않습니다.</span></div></div>
    <div class="field"><label for="applicant-doc-file">기관 문서 파일 (PDF·DOCX·TXT·HWPX·HWP)</label><input type="file" id="applicant-doc-file" accept=".pdf,.docx,.txt,.hwpx,.hwp"><small class="muted">한글 파일(HWPX·HWP)도 본문과 표를 읽습니다. 읽지 못하면 이유를 알려 드립니다.</small></div>
    <div class="field"><label for="applicant-doc-text">또는 문서 내용 붙여넣기</label><textarea id="applicant-doc-text" style="min-height:110px" placeholder="예) 기관명: 사단법인 ○○센터 / 상근 인력: 5명 / 2025년 청소년 마음건강 지원사업">${escapeHtml(state.applicantDocDraft)}</textarea></div>
    <div class="actions" style="margin:0"><span class="muted">${escapeHtml(review ? `${review.documentName || '붙여넣은 문서'} · 문서 기준시점 ${review.documentAsOf || ASOF_UNKNOWN}` : '외부 AI 호출 없이 규칙 기반으로 추출합니다.')}</span><button class="button primary" id="extract-applicant-doc">업데이트 후보 만들기</button></div>
    <div class="actions" style="margin-top:14px"><span class="muted">계획서보관함에 저장된 과거 사업계획서는 다시 업로드하지 않고 바로 사용할 수 있습니다.</span><button class="button secondary" id="load-applicant-archive">계획서보관함 목록</button></div>
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


// ---------- 기관정보는 한 곳에서만 받는다 ----------
// 「내 정보」에 적은 기관정보를 신청기관으로 물려준다. 물려받은 값은 반드시 확인 필요로 들어간다.
// 값이 다르면 덮어쓰지 않고 회원이 고르게 한다.
function profileBridgePanel(applicant) {
  const profile = { ...(auth.memberProfile || {}), name: auth.user?.name || '', orgName: auth.user?.orgName || '', phone: auth.user?.phone || '' };
  const merged = mergeProfileIntoApplicant(applicant, profile);
  if (!merged.added.length && !merged.conflicts.length) {
    return '<p class="muted">내 정보에 적어 둔 기관정보가 이 신청기관에 모두 반영되어 있습니다. 같은 내용을 두 번 적지 않아도 됩니다.</p>';
  }
  return `<div class="alert"><strong>내 정보에 적어 둔 기관정보를 가져올 수 있습니다</strong>
    <p>새로 넣을 항목 ${merged.added.length}건${merged.conflicts.length ? ` · 값이 다른 항목 ${merged.conflicts.length}건` : ''}. 가져온 값은 <b>확인 필요</b> 상태로 들어가며, 확인해야 계획서에 사실로 쓰입니다.</p>
    ${merged.conflicts.length ? `<div class="requirement-list">${merged.conflicts.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.label)}</strong> <span class="status 확인-필요">값이 다릅니다</span></div>
      <small class="muted">지금 신청기관: ${escapeHtml(item.current)}</small>
      <small class="muted">내 정보: ${escapeHtml(item.value)}</small>
    </div></article>`).join('')}</div>` : ''}
    <div class="actions"><span class="muted">덮어쓰지 않습니다. 새 항목으로 들어가고 회원이 고릅니다.</span>
      <button class="button primary" id="pull-profile-info" ${state.busy ? 'disabled' : ''}>내 정보에서 ${merged.added.length + merged.conflicts.length}건 가져오기</button></div></div>`;
}


// ---------- 사업 아이디어·활용자산 ----------
function emptyAssetDraft() {
  return { id: '', name: '', kind: '', status: ASSET_STATUS.candidate, problem: '', audience: '', activities: '', duration: '', resources: '', experience: '', evidence: '', adaptable: '', evidenceConfirmed: false };
}
const assetList = () => state.ideaAssets || [];
async function loadIdeaAssets() {
  const result = await listIdeaAssets().catch(() => ({ ok: false }));
  if (!result.ok) return setState({ error: result.error || '사업 아이디어를 불러오지 못했습니다.' });
  setState({ ideaAssets: result.assets || [], ideaAssetsLoaded: true });
}
async function submitIdeaAsset() {
  const draft = state.assetDraft || emptyAssetDraft();
  const checked = validateAsset(draft);
  if (!checked.ok) return setState({ error: checked.errors.join(' ') });
  setState({ busy: '사업 아이디어를 저장하는 중...', error: '', notice: '' });
  const result = await saveIdeaAsset({ ...draft, ...checked.value }).catch(() => ({ ok: false }));
  if (!result.ok) return setState({ busy: '', error: result.error || '저장하지 못했습니다.' });
  setState({ busy: '', notice: '사업 아이디어·활용자산을 저장했습니다.', ideaAssets: result.assets || assetList(), assetDraft: emptyAssetDraft() });
}
async function removeIdeaAsset(id) {
  setState({ busy: '삭제하는 중...', error: '' });
  const result = await deleteIdeaAsset(id).catch(() => ({ ok: false }));
  if (!result.ok) return setState({ busy: '', error: result.error || '삭제하지 못했습니다.' });
  setState({ busy: '', notice: '항목을 지웠습니다.', ideaAssets: result.assets || assetList() });
}

const ASSET_FIELDS = [
  ['name', '자산·아이디어 이름', 'input'], ['problem', '해결하려는 문제', 'area'], ['audience', '주요 대상', 'input'],
  ['activities', '핵심 활동', 'area'], ['duration', '운영 가능한 기간·회기', 'input'], ['resources', '필요한 인력·시설·협력자원', 'area'],
  ['experience', '실제 운영 경험·성과', 'area'], ['evidence', '근거자료', 'input'], ['adaptable', '공모에 맞게 바꿀 수 있는 범위', 'area']
];

// 「보유 프로그램·사업역량」 안에 둔다. 공고를 먼저 읽고 맞는 것만 후보로 권한다.
function ideaAssetPanel() {
  const draft = state.assetDraft || emptyAssetDraft();
  const assets = assetList();
  const notice = state.selectedNotice || {};
  const suggestion = suggestAssets({ notice, assets });
  return `<details class="card org-details" id="idea-assets" ${assets.length ? 'open' : ''}>
    <summary><b>사업 아이디어·활용자산</b>${assets.length ? ` · ${assets.length}건` : ''} <small>가진 것과 해 보려는 것을 나눠 적습니다</small></summary>
    <p class="muted">「검증된 보유자산」은 실제로 운영했고 근거가 있는 것만입니다. 아직 해 본 적 없는 것은 「제안 후보 아이디어」로 두며, 계획서에 <b>[신규 제안]</b> 표시가 붙습니다. 후보를 확정 실적처럼 쓰지 않습니다.</p>
    ${notice.title ? `<div class="alert ${suggestion.matched.length ? 'success' : 'warning'}"><strong>이번 공고에 맞는 자산</strong>
      ${suggestion.matched.length ? `<div class="requirement-list">${suggestion.matched.map(item => `<article class="requirement"><div>
        <div><strong>${escapeHtml(item.name)}</strong> <span class="status ${item.usableAsRecord ? '충족' : '확인-필요'}">${escapeHtml(item.statusLabel)}</span></div>
        <small class="muted">${escapeHtml(item.why)}${item.usableAsRecord ? '' : ' · 확정 실적으로는 쓰지 않습니다'}</small>
      </div></article>`).join('')}</div>` : `<p>${escapeHtml(suggestion.reason)}</p>`}</div>` : '<p class="muted">공고를 먼저 고르면 목적·평가기준에 맞는 자산만 후보로 골라 드립니다. 기관 자산을 모든 계획서에 자동으로 넣지 않습니다.</p>'}
    <div class="requirement-list">${assets.map(item => `<article class="requirement"><div>
      <div><strong>${escapeHtml(item.name)}</strong> <span class="status ${item.status === 'verified' ? '충족' : item.status === 'excluded' ? '부족' : '확인-필요'}">${escapeHtml(ASSET_STATUS_LABELS[item.status] || item.status)}</span>${item.kind ? ` <span class="tag">${escapeHtml(item.kind)}</span>` : ''}</div>
      <small class="muted">${escapeHtml([item.problem, item.audience, item.duration].filter(Boolean).join(' · ') || '내용 미입력')}</small>
      <small class="muted">계획서 표기: ${escapeHtml(assetSentence(item))}</small>
      <div class="inline-row"><select data-asset-status="${escapeHtml(item.id)}">${Object.values(ASSET_STATUS).map(status => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${escapeHtml(ASSET_STATUS_LABELS[status])}</option>`).join('')}</select>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-asset-confirm="${escapeHtml(item.id)}" ${item.evidenceConfirmed ? 'checked' : ''}>근거를 확인했습니다</label>
        <button class="button secondary" data-remove-asset="${escapeHtml(item.id)}">삭제</button></div>
    </div></article>`).join('') || '<p class="muted">등록한 자산·아이디어가 없습니다.</p>'}</div>
    <h4>새로 적기</h4>
    <div class="two-col">
      <div class="field"><label for="asset-kind">유형</label><select id="asset-kind"><option value="">선택</option>${ASSET_KINDS.map(kind => `<option value="${escapeHtml(kind)}" ${draft.kind === kind ? 'selected' : ''}>${escapeHtml(kind)}</option>`).join('')}</select></div>
      <div class="field"><label for="asset-status">상태</label><select id="asset-status">${Object.values(ASSET_STATUS).map(status => `<option value="${status}" ${draft.status === status ? 'selected' : ''}>${escapeHtml(ASSET_STATUS_LABELS[status])}</option>`).join('')}</select></div>
    </div>
    ${ASSET_FIELDS.map(([key, label, kind]) => `<div class="field"><label for="asset-${key}">${escapeHtml(label)}</label>${
      kind === 'area' ? `<textarea id="asset-${key}" data-asset-field="${key}" style="min-height:60px">${escapeHtml(draft[key] || '')}</textarea>`
        : `<input id="asset-${key}" data-asset-field="${key}" value="${escapeHtml(draft[key] || '')}">`
    }</div>`).join('')}
    <div class="actions"><span class="muted">검증된 보유자산으로 두려면 운영 경험과 근거를 함께 적어야 합니다.</span>
      <button class="button primary" id="asset-save" ${state.busy ? 'disabled' : ''}>자산·아이디어 저장</button></div>
  </details>`;
}

// ---------- 제안서 작성정보 (단계적 질문) ----------
// 공고문과 기관정보에서 아는 것은 다시 묻지 않고, 부족한 것만 다섯 개씩 묻는다.
function intakePanel() {
  const applicant = findApplicant(state.applicants, state.selectedApplicantId) || { items: [] };
  const view = intakeState({ answers: state.intakeAnswers || {}, notice: state.selectedNotice || {}, applicant });
  const suspicious = checkNumbers(view);
  return `<details class="card org-details" id="proposal-intake" ${view.ready ? '' : 'open'}>
    <summary><b>제안서 작성정보</b> ${view.ready ? '· 준비됨' : `· 남은 질문 ${view.ask.length + view.remaining}개`} <small>부족한 것만 ${MAX_QUESTIONS}개씩 묻습니다</small></summary>
    ${view.prefilled.length ? `<div class="alert success"><strong>이미 확인된 ${view.prefilled.length}가지는 다시 묻지 않습니다</strong>
      <p>${view.prefilled.map(item => escapeHtml(`${item.label}(${item.source})`)).join(' · ')}</p></div>` : ''}
    ${view.ask.length ? `${view.ask.map(field => `<div class="field"><label for="intake-${field.key}">${escapeHtml(field.label)}</label>
      <input id="intake-${field.key}" data-intake-field="${field.key}" value="${escapeHtml((state.intakeAnswers || {})[field.key] || '')}" placeholder="${escapeHtml(field.hint)}">
      <small class="muted">모르면 비워 두세요. 지어내지 않고 ${escapeHtml(UNKNOWN)}로 남깁니다.</small></div>`).join('')}
      <div class="actions"><span class="muted">${view.remaining ? `이 ${view.ask.length}개를 채우면 남은 ${view.remaining}개를 이어서 묻습니다.` : '이것만 채우면 됩니다.'}</span>
        <button class="button primary" id="intake-save" ${state.busy ? 'disabled' : ''}>답변 저장</button></div>`
      : '<p class="muted">필요한 작성정보를 모두 받았습니다.</p>'}
    ${suspicious.length ? `<div class="alert warning"><strong>숫자를 확인할 수 없는 항목</strong><p>${suspicious.map(item => escapeHtml(`${item.label}: ${item.value}`)).join(' · ')} — ${escapeHtml(UNKNOWN)}로 둡니다.</p></div>` : ''}
  </details>`;
}


// 내 정보에 적어 둔 기관정보를 신청기관으로 물려준다.
// 덮어쓰지 않는다. 값이 다르면 새 항목으로 넣고 회원이 확인해 고른다.
async function pullProfileIntoApplicant() {
  const applicant = findApplicant(state.applicants, state.selectedApplicantId);
  if (!applicant) return setState({ error: '먼저 신청기관을 고르세요.' });
  const profile = { ...(auth.memberProfile || {}), name: auth.user?.name || '', orgName: auth.user?.orgName || '', phone: auth.user?.phone || '' };
  const merged = mergeProfileIntoApplicant(applicant, profile);
  const additions = [...merged.added, ...merged.conflicts].map(item => makeApplicantItem({
    area: item.area, label: item.label, value: item.value,
    // 물려받은 값은 확정이 아니다. 회원이 확인해야 계획서에 사실로 쓰인다.
    status: '확인 필요', source: item.source
  }));
  if (!additions.length) return setState({ notice: '가져올 새 항목이 없습니다.' });
  const next = { ...applicant, items: [...applicant.items, ...additions] };
  setState({ applicants: upsertApplicant(state.applicants, next), notice: `내 정보에서 ${additions.length}건을 가져왔습니다. 확인 필요 상태이니 내용을 보고 확인해 주세요.` });
  await saveArchivedApplicant(next).catch(() => null);
}

// ---------- 1단계 기본정보 ----------
// 계획서를 시작하는 데 필요한 최소한만 받는다. 여기까지만 적고 바로 작성으로 갈 수 있다.
function applicantBasicView(applicant, who = '신청기관') {
  const draft = quickDraft();
  const status = basicStatus(applicant, draft);
  const reuse = reusableCount(applicant);
  return `<div class="card" id="applicant-editor" tabindex="-1">
    <div class="card-title"><div><h3>1단계 기본정보 · ${escapeHtml(applicant.name)}</h3>
      <span>계획서를 시작하는 데 필요한 것만 적습니다. 나머지는 나중에 적어도 됩니다.</span></div>
      <span class="status ${status.ready ? '충족' : '확인-필요'}">${status.ready ? (status.saved ? '저장됨' : '저장하면 시작 가능') : `${status.missing.join(' · ')} 필요`}</span></div>
    <div class="two-col">
      <div class="field"><label for="applicant-name">${escapeHtml(who)}명</label><input id="applicant-name" value="${escapeHtml(applicant.name)}"></div>
      <div class="field"><label for="applicant-note">기관 메모 <span class="muted">(선택)</span></label><input id="applicant-note" value="${escapeHtml(applicant.note)}" placeholder="예: 2026년 기준 정보"></div>
    </div>
    <div class="two-col">${QUICK_FIELDS.filter(field => field.key !== 'orgName').map(field => `<div class="field">
      <label for="quick-${field.key}">${escapeHtml(field.label)}${field.required ? '' : ' <span class="muted">(선택)</span>'}</label>
      ${field.choices
        ? `<select id="quick-${field.key}" data-quick-field="${field.key}"><option value="">고르세요</option>${ORG_TYPES.map(type => `<option value="${escapeHtml(type)}" ${draft[field.key] === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select>`
        : `<input id="quick-${field.key}" data-quick-field="${field.key}" value="${escapeHtml(draft[field.key] || '')}" placeholder="${escapeHtml(field.hint)}">`}
    </div>`).join('')}</div>
    <p class="muted">적지 않은 인력·시설·실적·예산은 만들어 넣지 않고 <b>[확인 필요]</b>로 남깁니다.${reuse ? ` 지금 이 기관에서 다음 계획서에도 다시 쓰이는 확인된 정보는 ${reuse}건입니다.` : ''}</p>
    <div class="actions"><span class="muted">${status.ready ? '이 상태로 계획서를 시작할 수 있습니다. 상세정보는 선택입니다.' : `아직 ${status.missing.join(' · ')}가 비어 있습니다.`}</span>
      <div><button class="button secondary" id="save-basic-info" ${state.busy ? 'disabled' : ''}>기본정보 저장</button>
        <button class="button primary" id="basic-to-writing" ${state.busy ? 'disabled' : ''}>저장하고 계획서 작성으로</button></div></div>
    ${BASIC_AREAS.map(key => APPLICANT_AREAS.find(area => area.key === key)).filter(Boolean).map(area => {
      const count = areaItems(applicant, area.key).length;
      return `<details class="card org-details" data-detail-group="${area.key}" ${(state.openOrgGroups || []).includes(area.key) ? 'open' : ''}>
        <summary><b>${escapeHtml(area.title)}</b> <small>등록 ${count}건 · 주소·대표자·신청자격처럼 더 적을 것이 있을 때만 펼치세요</small></summary>
        ${applicantAreaFields(applicant, area, false)}</details>`;
    }).join('')}
  </div>`;
}

// 파일·내 정보에서 뽑은 값은 후보로만 제안한다. 회원이 확인해야 저장된다.
function applicantCandidateView(applicant) {
  return `<div class="card"><div class="card-title"><div><h3>입력 후보</h3>
    <span>내 정보와 올린 문서에서 찾은 값입니다. 출처와 함께 보여 주고, 확인해야 기관정보가 됩니다.</span></div></div>
    ${profileBridgePanel(applicant)}
    ${applicantScopeView(applicant)}
    ${applicantSourceView(applicant)}</div>`;
}

// ---------- 2단계 상세정보(선택) ----------
// 구역을 한 번에 펼치지 않는다. 필요한 구역만 열어서 적는다. 비어 있어도 계획서를 막지 않는다.
function applicantDetailView(applicant) {
  const groups = detailProgress(applicant);
  const filled = groups.filter(group => group.total).length;
  return `<div class="card" id="applicant-detail">
    <div class="card-title"><div><h3>2단계 상세정보 <span class="muted">(선택)</span></h3>
      <span>여덟 구역 중 ${filled}구역에 자료가 있습니다. 지금 적지 않아도 계획서는 만들어집니다.</span></div>
      <div><button class="button secondary" id="open-all-details">모두 펼치기</button><button class="button secondary" id="close-all-details">모두 접기</button>
        <button class="button secondary" id="save-applicant">이 기관 정보 저장</button></div></div>
    <div class="alert"><strong>상세정보를 등록하면 계획서가 달라집니다</strong><p>${DETAIL_INTRO}</p></div>
    <div class="stat-badges">${groups.map(group => `<span class="stat-badge" title="${escapeHtml(group.hint)}"><strong>${group.confirmed}/${group.total}</strong><span>${escapeHtml(group.title)}</span></span>`).join('')}</div>
    ${groups.map(group => detailGroupPanel(applicant, group)).join('')}
  </div>`;
}

function detailGroupPanel(applicant, group) {
  const open = (state.openOrgGroups || []).includes(group.key);
  const areas = group.areas.map(key => APPLICANT_AREAS.find(area => area.key === key)).filter(Boolean);
  return `<details class="card org-details" data-detail-group="${group.key}" ${open ? 'open' : ''}>
    <summary><b>${escapeHtml(group.title)}</b> <small>등록 ${group.total}건 · 확인됨 ${group.confirmed}건</small></summary>
    <p class="muted">${escapeHtml(group.hint)}</p>
    ${areas.map(area => applicantAreaFields(applicant, area, areas.length > 1)).join('')}
    ${group.key === 'programs' ? ideaAssetPanel() : ''}</details>`;
}

// 한 영역의 등록 항목과 새 항목 입력칸. 저장 구조를 바꾸지 않아 기존 자료가 그대로 보인다.
function applicantAreaFields(applicant, area, showTitle) {
  const items = areaItems(applicant, area.key);
  const draft = state.applicantItemDrafts[area.key] || { label: '', value: '', status: '확인 필요', source: '' };
  return `${showTitle ? `<h4>${escapeHtml(area.title)} · ${items.length}건</h4>` : ''}
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
        <div class="actions" style="margin:0"><span></span><button class="button primary" data-add-applicant-item="${area.key}">${escapeHtml(area.title)} 항목 추가</button></div>`;
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
    <div class="card"><div class="card-title"><div><h3>등록된 신청기관 ${state.applicants.length}곳</h3><span>공고 정보와 분리해 보관한 기관 정보입니다.</span></div><button class="button secondary" id="load-applicants">계획서보관함에서 불러오기</button></div>
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
  // 보조 자료라서 기본은 접어 둔다. 이미 추가한 자료가 있으면 펼친 채로 보여 준다.
  const count = state.manualSources.length;
  return `<details class="card org-details" id="manual-sources" ${count ? 'open' : ''}><summary><b>직접 자료 추가</b>${count ? ` · ${count}건` : ''} <small>PDF · DOCX · TXT / HWPX·HWP 지원</small></summary>
    <div class="two-col"><div class="field"><label for="manual-source-type">기본 자료 유형</label><select id="manual-source-type">${sourceTypeOptions(state.manualSourceType)}</select><label class="dropzone" for="manual-source-files"><strong>여러 파일 선택</strong><small>자료별 유형은 추가 후 변경할 수 있습니다.</small><input id="manual-source-files" type="file" accept=".pdf,.docx,.txt,.hwp,.hwpx" multiple></label></div>
    <div><div class="field"><label for="manual-source-name">붙여넣기 자료명</label><input id="manual-source-name" value="${escapeHtml(state.manualSourceName)}" placeholder="예: 2027년 신청서 작성항목"><label for="manual-source-text">원문 직접 붙여넣기</label><textarea id="manual-source-text" class="source-text" placeholder="공문·신청서·예산기준·심사기준 원문을 붙여넣으세요.">${escapeHtml(state.manualSourceText)}</textarea></div><button class="button secondary" id="add-manual-text">붙여넣기 자료 추가</button></div></div>
    ${count ? `<p class="muted" id="intake-summary">${escapeHtml(intakeSummary(markDuplicates(state.manualSources)).text)}${(() => { const spec = currentFormSpec(); return spec?.items?.length ? ` · 신청서 서식 규격표: 작성 항목 ${spec.items.length}개 · 요구 표 ${spec.tables.length}개 · 첨부 ${spec.attachments.length}건` : ''; })()}</p><div class="requirement-list">${state.manualSources.map((item, index) => `<article class="requirement"><div><span class="tag ${item.extractionStatus === 'success' ? '' : 'mandatory'}">${item.extractionStatus === 'success' ? '추출 성공' : '추출 불가'}</span><div><strong>${escapeHtml(item.fileName)}</strong><select data-manual-source-type="${index}">${sourceTypeOptions(item.sourceType)}</select><small>${Number(item.extractedText?.length || 0).toLocaleString()}자${item.extractionError ? ` · ${escapeHtml(item.extractionError)}` : ''}${item.autoKind ? ` · ${item.autoConfidence === 'high' ? '자동 판정' : '자동 판정(확인 권장)'}` : ''}</small><p class="muted">${escapeHtml((item.extractedText || '').slice(0, 180) || '텍스트 미리보기 없음')}</p></div></div><button class="button secondary" data-remove-manual-source="${index}">삭제</button></article>`).join('')}</div>` : '<p class="empty-inline">직접 추가한 자료가 없습니다.</p>'}</details>`;
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


// ---------- 간편 작성 화면 ----------
//
// 일반회원에게는 네 걸음만 보인다. 공고 분석·사업 설계·사실검증은 없애지 않고
// 「작성 과정 자세히 보기」 안에 그대로 둔다. 안에서는 예전과 똑같이 돈다.
function viewMode() { return viewModeFor(auth.user, state.viewMode).mode; }
// 지금 간편 화면을 그릴 때인가. 관리자 포털은 위에서 먼저 걸러진다.
function showSimpleHome() { return viewMode() === 'simple' && !state.expertDetail && ['', 'home'].includes(state.activeTool); }
// 화면 위쪽에 지금 무엇을 보고 있는지 적는다. 회원도 관리자도 같은 자리에서 본다.
function viewModeBadge() {
  const simple = showSimpleHome();
  const label = simple ? '회원 화면(간편)' : '전문가 상세';
  const back = !simple && !canToggleView() ? '<button class="button secondary" id="back-to-simple">간편 화면으로</button>' : '';
  const toggle = canToggleView() ? `<button class="button secondary" id="toggle-view">${simple ? '전문가 상세 보기' : '회원 화면으로 보기'}</button>` : '';
  return `${agencyQuotaBar()}<div class="view-mode-bar"><span class="view-mode-tag">지금 보는 화면</span><strong>${label}</strong>${back}${toggle}</div>`;
}
function canToggleView() { return viewModeFor(auth.user, state.viewMode).canToggle; }

function simpleProgress(active) {
  return `<div class="stat-badges">${SIMPLE_STEPS.map((item, index) => {
    const done = SIMPLE_STEPS.findIndex(step => step.key === active) > index;
    return `<span class="stat-badge" title="${escapeHtml(item.hint)}"><strong>${done ? '✓' : index + 1}</strong><span>${escapeHtml(item.label)}</span></span>`;
  }).join('')}</div>`;
}

// 저장해 둔 기관을 고르거나 다섯 가지만 적는다.
function simpleOrgPanel() {
  const draft = quickDraft();
  const saved = state.applicants || [];
  const chosen = findApplicant(state.applicants, state.selectedApplicantId);
  const reuse = reusableCount(chosen);
  // 첫 화면 안내 배너. 새 화면을 만들지 않고 기존 기관정보 페이지로 보낸다.
  return `<div class="alert"><strong>기관정보를 한 번 등록해 두면 계획서마다 다시 적지 않습니다</strong>
    <p>${chosen ? `지금 «${escapeHtml(chosen.name)}»의 확인된 정보 ${reuse}건을 계획서에 다시 씁니다. ` : ''}인력·실적·시설·프로그램 같은 상세정보를 등록하면 [확인 필요]가 줄어듭니다. 기본정보만 적고 시작해도 됩니다.</p>
    <div class="actions"><span class="muted">상세정보는 선택입니다. 없어도 계획서는 만들어집니다.</span>
      <button class="button secondary" data-open-applicants="1">기관정보 등록·수정</button></div></div>
    <details class="card org-details" id="simple-org" ${chosen ? '' : 'open'}>
    <summary><b>신청기관</b> <small>${chosen ? escapeHtml(chosen.name) : '기관을 고르거나 간단히 적어 주세요'}</small></summary>
    ${saved.length ? `<div class="inline-row"><label for="simple-org-pick">저장한 기관</label>
      <select id="simple-org-pick"><option value="">고르세요</option>${saved.map(item => `<option value="${escapeHtml(item.id)}" ${state.selectedApplicantId === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div>` : ''}
    <div class="two-col">${QUICK_FIELDS.map(field => `<div class="field">
      <label for="quick-${field.key}">${escapeHtml(field.label)}${field.required ? '' : ' <span class="muted">(선택)</span>'}</label>
      ${field.choices
        ? `<select id="quick-${field.key}" data-quick-field="${field.key}"><option value="">고르세요</option>${ORG_TYPES.map(type => `<option value="${escapeHtml(type)}" ${draft[field.key] === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select>`
        : `<input id="quick-${field.key}" data-quick-field="${field.key}" value="${escapeHtml(draft[field.key] || '')}" placeholder="${escapeHtml(field.hint)}">`}
    </div>`).join('')}</div>
    <div class="actions"><span class="muted">적지 않은 인력·시설·실적·예산은 만들지 않고 [확인 필요]로 남깁니다.</span>
      <button class="button secondary" id="quick-save" ${state.busy ? 'disabled' : ''}>기관정보 저장</button></div>
  </details>`;
}

// 꼭 필요한 것만 세 개까지 묻는다. 모르면 넘길 수 있어야 작성이 멈추지 않는다.
function simpleQuestionsPanel() {
  const noticeText = [state.selectedNotice?.summary, state.selectedNotice?.eligibility, state.selectedNotice?.supportDetails, state.sourceText].filter(Boolean).join('\n');
  const asked = followUpQuestions({ noticeText, answers: state.quickAnswers || {}, limit: SIMPLE_MAX_QUESTIONS });
  if (!asked.length) return '';
  return `<div class="alert"><strong>이 공고가 요구하는 것만 ${asked.length}가지 확인합니다</strong>
    ${asked.map(item => `<div class="field"><label for="followup-${item.key}">${escapeHtml(item.ask)}</label>
      <input id="followup-${item.key}" data-followup-field="${item.key}" value="${escapeHtml((state.quickAnswers || {})[item.key] || '')}" placeholder="모르면 아래에서 고르세요">
      <div class="stat-badges">${ANSWER_CHOICES.map(choice => `<button class="button secondary" data-answer-choice="${choice.key}" data-answer-key="${item.key}" title="${escapeHtml(choice.note)}">${escapeHtml(choice.label)}</button>`).join('')}</div></div>`).join('')}
    <p class="muted">비워 두거나 「아직 모르겠어요」를 고르면 계획서에 [확인 필요]로 남습니다. 없는 실적·인력·예산을 만들지 않습니다.</p></div>`;
}

// 완성 뒤 큰 버튼 다섯 개. 막힌 것은 회색으로 두지 않고 이유를 알린다.
// 확인 필요 표시를 한 화면에서 채운다. 같은 것을 묻는 자리는 한 번에 함께 채운다.
function openMarksPanel() {
  const marks = collectOpenMarks(state.sections);
  if (!marks.length) {
    return '<div class="card"><div class="card-title"><div><h3>확인 필요 없음</h3><span>지어낸 값 없이 모두 채워졌습니다</span></div><span class="status 충족">제출본 가능</span></div></div>';
  }
  const draft = state.markDraft || {};
  return `<details class="card" id="open-marks" ${state.markOpen ? 'open' : ''}>
    <summary><b>확인이 필요한 값 ${openMarkCount()}곳</b> <small>한 화면에서 채우면 같은 자리에 모두 들어갑니다</small></summary>
    <p class="muted">AI가 기관 실적·인력·예산을 지어내지 않도록 비워 둔 자리입니다. 아는 것만 채우고 나머지는 그대로 두어도 됩니다.</p>
    <div class="requirement-list">${marks.map(item => `<article class="requirement">
      <div><strong>${escapeHtml(item.label)}</strong> <span class="muted">${item.count}곳 · ${escapeHtml(item.sections.slice(0, 3).join(' · '))}</span></div>
      <small class="muted">${escapeHtml(item.context)}</small>
      <div class="field"><input data-mark-key="${escapeHtml(item.key)}" value="${escapeHtml(draft[item.key] || '')}" placeholder="확인한 값을 적어 주세요"></div>
    </article>`).join('')}</div>
    <div class="actions"><span class="muted">비워 둔 자리는 그대로 남습니다. 빈 값으로 지우지 않습니다.</span>
      <button class="button primary" id="apply-marks" ${auth.busy ? 'disabled' : ''}>채운 값 반영</button></div>
  </details>`;
}

// 전체 최종확정. 항목마다 확정을 누르지 않고 마지막에 한 번 한다.
// 확정하면 이 판을 제출본으로 굳히고 설계 확인 기록도 함께 남긴다. 되돌릴 수 있다.
function formPreviewView() {
  const laid = currentFormLayout();
  if (!laid.ok) return `<div class="card"><p class="muted">${escapeHtml(laid.reason)}</p></div>`;
  const rows = laid.sections.map(item => `<article class="requirement">
    <div><span class="status ${item.content.startsWith('[확인 필요') ? '확인-필요' : '충족'}">${item.fromForm ? '서식 항목' : '서식 외'}</span>
      <div><strong>${escapeHtml(item.title)}</strong>
        <small>${item.limitChars ? `제한 ${item.limitChars.toLocaleString('ko-KR')}자${item.over ? ` · ${item.over}자 초과` : ''}` : '분량 제한 없음'}</small></div></div>
    <p class="muted">${escapeHtml(String(item.content).slice(0, 160))}${String(item.content).length > 160 ? '…' : ''}</p></article>`).join('');
  const tables = laid.tables.map(table => `<article class="requirement">
    <div><span class="status ${table.matched ? '충족' : '확인-필요'}">${table.fromForm ? '서식 표' : '추가 표'}</span>
      <div><strong>${escapeHtml(table.title || '표')}</strong><small>${(table.rows[0] || []).map(cell => escapeHtml(String(cell))).join(' · ')}</small></div></div>
    ${table.note ? `<p class="muted">${escapeHtml(table.note)}</p>` : ''}</article>`).join('');
  return `<details class="card" id="form-preview">
    <summary><b>원본 서식 미리보기</b> <small>${escapeHtml(fillSummary(laid))}</small></summary>
    <p class="muted">올린 신청서의 항목 이름·순서·표 칸을 그대로 씁니다. 쓰지 않은 항목은 지어내지 않고 [확인 필요]로 남깁니다.</p>
    <div class="requirement-list">${rows}</div>
    ${tables ? `<h4>표 ${laid.tables.length}개</h4><div class="requirement-list">${tables}</div>` : ''}
    <div class="actions"><span class="muted">이 배치 그대로 내려받습니다.</span>
      <button class="button primary" id="preview-form-docx">올린 서식대로 받기(DOCX)</button></div>
  </details>`;
}

// 이번 작성에서 무엇을 줄여 보냈는지 알린다. 조용히 자르면 왜 빠졌는지 알 수 없다.
function trimNoticeView() {
  if (!lastTrimNotes.length) return '';
  return `<div class="alert"><strong>보내는 자료를 줄였습니다</strong>${lastTrimNotes.map(line => `<p>· ${escapeHtml(line)}</p>`).join('')}
    <small>서식 규격(항목 이름·분량·표 칸)은 그대로 지킵니다.</small></div>`;
}

function finalConfirmView() {
  const open = openMarkCount();
  const confirmed = Boolean(state.engagement?.design?.approvedAt);
  return `<div class="card" id="final-confirm">
    <div class="card-title"><div><h3>전체 최종확정</h3>
      <span>${confirmed ? '이 판을 제출본으로 확정했습니다.' : '다 보고 나서 한 번만 누르면 됩니다. 항목마다 확정할 필요가 없습니다.'}</span></div>
      <span class="status ${confirmed ? '충족' : '확인-필요'}">${confirmed ? '확정됨' : '확정 전'}</span></div>
    ${open ? `<p class="muted">확인이 필요한 값 ${open}곳이 남아 있습니다. 그대로 확정하면 [확인 필요] 표시가 제출본에 남습니다.</p>` : ''}
    <div class="actions"><span class="muted">확정해도 계속 고칠 수 있습니다. 고치면 확정을 다시 누르면 됩니다.</span>
      <div>${confirmed ? '<button class="button secondary" id="undo-final-confirm">확정 풀기</button>' : ''}
      <button class="button primary" id="run-final-confirm" ${auth.busy ? 'disabled' : ''}>${confirmed ? '다시 확정' : '전체 최종확정'}</button></div></div>
  </div>`;
}

// 작성 중 화면. 끝난 항목을 순서대로 보여 주고, 남은 묶음이 몇 개인지 함께 적는다.
function designSoFarView() {
  const design = state.stagedGeneration?.master?.projectDesign;
  if (!design) return '';
  const rows = [
    ['사업명', design.projectName], ['한 문장 전략', design.oneSentenceStrategy], ['대상', design.target],
    ['참여 인원', design.participantCount], ['사업 기간', design.projectPeriod], ['핵심 개입', design.coreIntervention]
  ].filter(([, value]) => String(value || '').trim());
  if (!rows.length) return '';
  return `<div class="summary-grid">${rows.map(([label, value]) =>
    `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value).slice(0, 60))}</strong></div>`).join('')}</div>
    ${state.stagedGeneration?.balance ? `<p class="muted">${escapeHtml(state.stagedGeneration.balance.reason)} · 가장 큰 묶음 ${state.stagedGeneration.balance.maxAfter.toLocaleString('ko-KR')}자 (항목·순서는 그대로입니다)</p>` : ''}
    <p class="muted">설계가 먼저 나왔습니다. 방향이 다르면 지금 멈추고 한 줄 요청을 고쳐 다시 시작해도 됩니다.</p>`;
}

// 진행 기록. 무엇이 언제 나왔고 얼마나 걸렸는지 저장된 값만 적는다.
function writingTimelineView() {
  const rows = timelineRows(state.stagedGeneration?.timeline);
  if (!rows.length) return '';
  return `<div class="cap-grid">${rows.map(row => `<div><span>${escapeHtml(row.at)}</span><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.took)} 걸림</small></div>`).join('')}</div>`;
}

function writingProgressView() {
  const staged = state.stagedGeneration || {};
  const all = (staged.master?.sectionPlan || []).length;
  const done = (staged.completedGroupIds || []).length;
  return `<div class="card" id="writing-progress">
    <div class="card-title"><div><h3>지금까지 쓴 계획서</h3>
      <span>${all ? `${done} / ${all} 묶음 끝남` : '설계를 먼저 만드는 중'} · 항목 ${state.sections.length}개 · 아래로 계속 이어집니다</span></div>
      <span class="status 확인-필요">작성 중</span></div>
    <p class="muted">끝난 항목부터 바로 읽을 수 있습니다. 다 끝나면 한 편으로 다듬어 정리합니다. 창을 닫으면 결과를 받지 못합니다.</p>
    <div class="actions"><span class="muted">멈춰도 지금까지 쓴 묶음은 그대로 남습니다. 이번 묶음까지만 쓰고 멈춥니다.</span>
      <button class="button secondary" id="stop-writing">여기서 멈추기</button></div>
    ${writingTimelineView()}
    ${designSoFarView()}
    ${state.sections.map(section => `<details class="card org-details">
      <summary><b>${escapeHtml(section.title || '항목')}</b> <small>${String(section.content || '').length.toLocaleString('ko-KR')}자</small></summary>
      <p style="white-space:pre-wrap">${escapeHtml(String(section.content || '').slice(0, 1200))}${String(section.content || '').length > 1200 ? '…' : ''}</p>
    </details>`).join('')}
  </div>`;
}

// 다시 만들기 전에 먼저 보여 준다. 이미 돌고 있거나 끝난 것이 있으면 다시 결제할 필요가 없다.
function aiJobsView() {
  const list = (state.aiJobs?.list || []);
  if (!list.length) return '';
  const live = list.filter(item => item.live);
  const done = list.filter(item => item.status === 'done');
  if (!live.length && !done.length) return '';
  const label = { masterDesign: '설계 1걸음', masterPlan: '설계 2걸음', draftPart: '본문 묶음', master: '설계', fullProposal: '전체 본문' };
  return `<div class="alert" id="ai-jobs">
    <strong>이 계획서에 이미 만들어 둔 작업이 있습니다</strong>
    <p>${live.length ? `진행 중 ${live.length}건 · ` : ''}완료 ${done.length}건. 같은 내용으로 다시 만들면 새로 결제됩니다. 같은 입력이면 서버가 이전 결과를 그대로 돌려주고 AI를 부르지 않습니다.</p>
    <div class="stat-badges">${list.slice(0, 8).map(item => `<span class="stat-badge"><strong>${item.status === 'done' ? '완료' : item.live ? '진행 중' : '중단'}</strong><span>${escapeHtml(label[item.action] || item.action)}${item.reused ? ` · 재사용 ${item.reused}회` : ''}</span></span>`).join('')}</div>
  </div>`;
}

// 멈췄거나 실패해서 일부만 쓴 상태. 완성본이 아니라고 분명히 적고 이어쓰기만 연다.
function partialWritingView() {
  const staged = state.stagedGeneration || {};
  const progress = writingState(staged, { busy: state.busy, sections: state.sections.length });
  const left = remainingGroups(staged);
  const failed = left.find(group => group.id === progress.failedGroupId);
  return `<div class="card" id="partial-writing">
    <div class="card-title"><div><h3>여기까지 썼습니다 · ${progress.done} / ${progress.total} 묶음</h3>
      <span>${progress.stopped ? '멈춤' : failed ? '오류로 중단됨' : '남은 묶음 있음'} · 항목 ${state.sections.length}개는 그대로 보존됩니다</span></div>
      <span class="status 확인-필요">부분 결과</span></div>
    <p class="muted">아직 완성본이 아니어서 저장·출력·최종확정은 열지 않습니다. ${failed ? `「${escapeHtml(failed.title)}」부터` : '남은 묶음부터'} 이어서 쓰면 열립니다. 이미 끝난 묶음은 다시 쓰지 않습니다.</p>
    ${writingTimelineView()}
    <div class="requirement-list">${left.map(group => `<article class="requirement"><div><span class="tag">${group.id === progress.failedGroupId ? '실패' : '대기'}</span><div><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml((group.sectionKeys || []).map(sectionTitle).join(' · '))}</small></div></div></article>`).join('')}</div>
    <div class="actions"><span class="muted">남은 ${left.length}묶음</span>
      <button class="button primary" id="resume-writing" ${state.busy ? 'disabled' : ''}>남은 내용 이어서 작성</button></div>
    ${state.sections.map(section => `<details class="card org-details">
      <summary><b>${escapeHtml(section.title || '항목')}</b> <small>${String(section.content || '').length.toLocaleString('ko-KR')}자</small></summary>
      <p style="white-space:pre-wrap">${escapeHtml(String(section.content || '').slice(0, 1200))}${String(section.content || '').length > 1200 ? '…' : ''}</p>
    </details>`).join('')}
  </div>`;
}

// 계획서 첫머리 보완 안내. 무엇이 없어서 어디가 얇아졌는지, 채우려면 무엇이 드는지 적는다.
function gapNoticeView() {
  const report = currentGapReport();
  if (!report.total && !report.baseline.length) return '';
  const effort = report.effort;
  return `<div class="alert warning" id="gap-notice">
    <strong>기관 자료가 부족해 일부 항목이 얇습니다 — 계획서는 끝까지 만들었습니다</strong>
    <p>${escapeHtml(report.headline)}</p>
    ${report.topics.length ? `<div class="stat-badges">${report.topics.map(item => `<span class="stat-badge" title="${escapeHtml(item.sections.slice(0, 3).join(' / '))}"><strong>${item.count}곳</strong><span>${escapeHtml(item.topic)}</span></span>`).join('')}</div>` : ''}
    ${report.baseline.length ? `<p class="muted">아직 정해지지 않은 기준값: ${report.baseline.slice(0, 6).map(item => escapeHtml(item.item)).join(' · ')}</p>` : ''}
    ${report.thin.length ? `<p class="muted">자료가 없어 짧게 남은 항목: ${report.thin.slice(0, 4).map(item => `${escapeHtml(item.title)} ${item.chars.toLocaleString('ko-KR')}자`).join(' · ')}</p>` : ''}
    ${report.emptyAreas.length ? `<p class="muted">비어 있는 기관정보: ${report.emptyAreas.slice(0, 6).map(escapeHtml).join(' · ')}</p>` : ''}
    <p><b>채우는 데 드는 품</b> · 확인할 항목 ${effort.items}개 · 예상 입력 ${effort.minutes}분 · 값을 넣은 뒤 AI 재작성 ${effort.rewrites}회 · 대행 비용 ${escapeHtml(effort.cost)}</p>
    <div class="actions"><span class="muted">이 안내는 내부용입니다. 제출본 출력에는 들어가지 않습니다.</span>
      <div><button class="button primary" id="gap-fill-marks">확인 필요 항목 채우기</button>
        <button class="button secondary" data-open-applicants="1">기관정보 채우러 가기</button>
        <button class="button secondary" id="gap-ask-support">대행 작업 문의</button></div></div>
  </div>`;
}

function simpleResultActions() {
  const saved = Boolean(state.archiveProposalId);
  const left = remainingOf(state.revisions || []);
  return `<div class="actions" style="flex-wrap:wrap;gap:8px;justify-content:flex-start">
    <button class="button secondary" id="simple-view">계획서 확인</button>
    <button class="button primary" id="simple-revise" ${guard(left.total ? '' : `이 계획서의 AI 수정 2회를 모두 썼습니다. 직접 편집은 계속할 수 있습니다.`)}>한 번에 수정 요청 ${left.total ? `(${left.total}회 남음)` : '(소진)'}</button>
    <button class="button secondary" id="save-proposal-archive">저장${saved ? ' 완료' : ''}</button>
    <button class="button secondary" id="final-docx-top">DOCX 받기</button>
    <button class="button secondary" id="final-hwpx-top">한글(HWPX) 받기</button>
    ${currentFormSpec() ? '<button class="button primary" id="final-form-docx">올린 서식대로 받기(DOCX)</button>' : ''}
    <button class="button secondary" id="final-pdf-top">PDF 받기</button>
    <button class="button secondary" id="simple-expert">전문 검토 보기</button>
  </div>
  ${trimNoticeView()}
  ${currentFormSpec() ? formPreviewView() : ''}
  ${finalConfirmView()}`;
}

// 한 번에 수정 요청. 항목별로 고르게 하지 않는다.
function revisionPanel() {
  if (!state.reviseOpen) return '';
  const draft = state.reviseDraft || { kind: 'add', text: '' };
  const left = remainingOf(state.revisions || []);
  const last = (state.revisions || []).filter(item => item.diff).at(-1);
  return `<div class="card" id="revise-box">
    <div class="card-title"><div><h3>한 번에 수정 요청</h3><span>요청한 곳만 고칩니다. 확인된 사실과 요청하지 않은 내용은 그대로 둡니다.</span></div>
      <span class="status ${left.total ? '충족' : '부족'}">남은 수정 ${left.total}회</span></div>
    <div class="field"><label>무엇을 바꿀까요?</label><div class="stat-badges">${REVISION_KINDS.map(kind => `<button class="button ${draft.kind === kind.key ? 'primary' : 'secondary'}" data-revise-kind="${kind.key}" title="${escapeHtml(kind.hint)}">${escapeHtml(kind.label)}</button>`).join('')}</div></div>
    <div class="field"><label for="revise-text">어떻게 바꿀지 적어 주세요</label>
      <textarea id="revise-text" class="source-text" style="min-height:80px" placeholder="예: 대상을 초등 고학년까지 넓히고 회기를 12회로 바꿔 주세요">${escapeHtml(draft.text || '')}</textarea></div>
    <div class="actions"><span class="muted">공고·대상·목적·핵심사업을 모두 바꾸는 요청은 새 계획서로 안내합니다.</span>
      <div><button class="button secondary" id="revise-cancel">닫기</button>
        <button class="button primary" id="revise-run" ${state.busy ? 'disabled' : ''}>이대로 수정 요청</button></div></div>
    ${last ? `<div class="alert success"><strong>지난 수정 결과</strong>
      <p>바뀐 항목 ${last.diff.changed.length}개${last.diff.changed.length ? `: ${last.diff.changed.map(item => escapeHtml(item.title)).join(' · ')}` : ''}</p>
      <p>그대로 둔 항목 ${last.diff.kept.length}개${last.lostFacts?.length ? ` · <b>사라진 확인 사실 ${last.lostFacts.length}개</b>` : ''}</p>
      <p>새로 확인할 내용 ${last.newUnknowns}곳${last.counted ? '' : ` · 이번 요청은 횟수에서 빼지 않았습니다(${escapeHtml(last.note || '')})`}</p>
      <div class="actions"><span class="muted">수정 전 버전을 보관해 두었습니다.</span>
        <button class="button secondary" id="revise-undo">수정 전으로 되돌리기</button></div></div>` : ''}
  </div>`;
}

// 전문 기능은 지우지 않는다. 접어서 그대로 둔다.
function expertDetails() {
  return `<details class="card org-details" id="expert-details">
    <summary><b>작성 과정 자세히 보기</b> <small>공고 분석·설계·근거·검증은 그대로 돌아갑니다</small></summary>
    <p class="muted">간편 화면은 아래 과정을 숨길 뿐 생략하지 않습니다: ${HIDDEN_EXPERT.map(item => escapeHtml(item)).join(' · ')}.</p>
    ${strategyView()}
    ${designQuestionsView()}
    ${stagedGenerationView()}
  </details>`;
}

function simpleWriteView() {
  const chosen = Boolean(state.selectedNotice?.title || state.sourceText.trim());
  const step = simpleStep({ noticeChosen: chosen, requestWritten: Boolean(String(state.projectNarrative || '').trim()), sections: state.sections.length });
  // 아직 쓰는 중이면 완성으로 보지 않는다. 지금까지 쓴 것은 아래에서 바로 읽을 수 있다.
  const progress = writingState(state.stagedGeneration, { busy: state.busy, sections: state.sections.length });
  const writing = progress.writing;
  // 묶음이 남아 있으면 결과 화면을 열지 않는다. 부분 결과를 완성본처럼 보여 주지 않는다.
  const done = step === 'done' && !writing && !progress.partial;
  // 지금 보는 화면 표시는 머리띠 아래에 한 번만 나온다. 여기서 또 그리면 두 줄이 된다.
  return `<div class="page-heading"><div><h2>간편 계획서 작성</h2>
    <p>공고를 고르고 하고 싶은 사업을 한두 문장으로 적으면 됩니다. 분석·설계·검증은 안에서 자동으로 돌아갑니다.</p></div>
    <button class="button secondary" id="open-expert-detail">작성 과정 자세히 보기</button></div>
    ${simpleProgress(step)}
    <div class="card">
      <div class="card-title"><div><h3>1·2 공고 찾기와 선택</h3><span>${chosen ? escapeHtml(String(state.selectedNotice?.title || '붙여넣은 공고문').slice(0, 60)) : '아직 고르지 않았습니다'}</span></div>
        <span class="status ${chosen ? '충족' : '확인-필요'}">${chosen ? '선택함' : '필요'}</span></div>
      <div class="actions"><span class="muted">고르면 공고 분석을 자동으로 실행합니다.</span>
        <div><button class="button ${chosen ? 'secondary' : 'primary'}" id="simple-find">공고 찾기</button>
        ${chosen ? '<button class="button secondary" id="simple-change-notice">다른 공고로</button>' : ''}</div></div>
    </div>
    ${simpleOrgPanel()}
    <div class="card">
      <div class="card-title"><div><h3>3 하고 싶은 사업</h3><span>한두 문장이면 됩니다</span></div></div>
      <div class="field"><textarea id="simple-idea" class="source-text" style="min-height:80px" placeholder="예: 방과후 돌봄이 끊긴 초등 저학년을 위해 주 2회 학습·정서 프로그램을 하고 싶습니다.">${escapeHtml(state.projectNarrative || '')}</textarea></div>
      ${simpleQuestionsPanel()}
      <div class="actions"><span class="muted">부족한 정보가 있어도 [확인 필요]로 남기고 만듭니다.</span>
        <button class="button primary" id="simple-generate" ${guard(chosen ? '' : '먼저 공고를 고르거나 공고문을 붙여넣어 주세요.', 'notice')}>AI가 계획서 만들기</button></div>
    </div>
    ${done ? gapNoticeView() : ''}
    ${done ? `<div class="card"><div class="card-title"><div><h3>4 계획서 완성</h3><span>항목 ${state.sections.length}개</span></div>
      <span class="status 충족">완성</span></div>${simpleResultActions()}</div>` : ''}
    ${!writing ? aiJobsView() : ''}
    ${writing ? writingProgressView() : ''}
    ${!writing && progress.partial ? partialWritingView() : ''}
    ${state.sections.length && !writing && !progress.partial ? openMarksPanel() : ''}
    ${revisionPanel()}
    ${chosen ? expertDetails() : ''}`;
}

function documentView() {
  const strategy = strategyView();
  const questions = designQuestionsView();
  if (!state.sections.length) return `${strategy}${contractLockView()}${questions}${stagedGenerationView()}${state.designUnavailable ? `<div class="empty-state"><div>▤</div><h2>AI 정밀 사업설계를 실행할 수 없음</h2><p>공고 자료 분석은 완료되었지만 AI 정밀 사업설계를 실행하지 못했습니다. 아래에는 공식 원문에서 직접 추출한 사실만 표시합니다.</p>${directFactsView()}</div>` : ''}`;
  const completionMode = state.step === STEPS.length - 1;
  const toolbarActions = completionMode
    ? `${sampleButton('final', '[샘플] 완성본 보기')}<button class="button secondary" id="save-proposal-archive">계획서보관함에 저장</button><button class="button secondary" id="proposal-review">${state.reviewResult ? '명시적으로 재검토' : '심사 검토·고도화'}</button><button class="button secondary" id="print">인쇄</button><button class="button secondary" id="pdf">PDF 인쇄·저장</button><button class="button primary" id="docx">검토용 DOCX</button>`
    : `${sampleButton('draftV1', '[샘플] V1 보기')}<button class="button secondary" id="save-proposal-archive">계획서보관함에 저장</button><button class="button primary" id="go-to-review">검토·완성으로 이동 →</button>`;
  return `${strategy}${questions}${completionPanelView()}${submissionGateView()}${submissionPackageView()}${preciseReviewView()}${proposalTablesView()}${proposalPipelineView()}${decisionCenterView()}${draftBlueprintCheckView()}${assemblyCheckView()}<div class="document-toolbar"><div><h2>${escapeHtml(state.project.title || '사업계획서 검토본')}</h2><p><span class="mode">신청기관 ${escapeHtml(selectedApplicant()?.name || '미선택')}</span> ${(state.proposalVersions || [])[0]?.source === EXTERNAL_SOURCE ? '<span class="mode">외부 계획서 작업본 · 원본 보존</span> ' : ''}<span class="mode">${state.selectedNotice?.officialTextExtracted ? '공고문 반영 초안' : '안내 페이지 기반 임시 초안'}</span> <span class="mode ${state.aiMode === 'ai' ? 'ai' : ''}">${state.aiMode === 'ai' ? 'AI 정밀 사업설계' : '로컬 사실 추출'}</span> ${completionMode ? '심사 검토와 출력 전 최종 편집을 진행하세요. DOCX는 공식 신청서 양식이 아닌 검토본입니다.' : '필요한 질문을 확인하고 초안을 편집하세요.'}</p></div><div>${toolbarActions}</div></div>
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

// 공고가 이미 정한 값은 결정 대상이 아니다. 작성 전에도 잠긴 값으로 보여 주고 다시 묻지 않는다.
function contractLockView() {
  const contract = currentNoticeContract();
  if (!contract?.rules?.length) return '';
  const locks = contractFieldLocks(contract);
  const locked = Object.values(locks).filter(lock => lock.mode === OFFICIAL_LOCKED);
  const bounds = Object.values(locks).filter(lock => lock.mode !== OFFICIAL_LOCKED);
  const conflicts = currentOfficialConflicts();
  if (!locked.length && !bounds.length && !conflicts.length) return '';
  return `<div class="card" id="notice-contract-locks"><div class="card-title"><div><h3>공고 실행계약 ${contract.rules.length}개 조건</h3><span>공고가 이미 정한 값은 사용자·AI가 바꿀 수 없습니다. 범위만 정해진 값은 그 안에서 정합니다.</span></div><strong>강제조건 ${contract.blockingCount}개</strong></div>
    ${locked.length ? `<div class="alert"><strong>공고가 이미 정한 값 ${locked.length}건 — 선택 대상이 아닙니다</strong>
      ${locked.map(lock => `<p>· <b>${escapeHtml(lock.value)}</b> — ${escapeHtml(lock.note)}<br><small>공고 근거 [${escapeHtml(lock.location)}] “${escapeHtml(String(lock.evidence).slice(0, 120))}”</small></p>`).join('')}</div>` : ''}
    ${bounds.length ? `<div class="alert"><strong>공고가 허용한 범위 ${bounds.length}건 — 이 범위 안에서 이번 사업 값을 정합니다</strong>
      ${bounds.map(lock => `<p>· ${escapeHtml(lock.bound)}<br><small>공고 근거 [${escapeHtml(lock.location)}] “${escapeHtml(String(lock.evidence).slice(0, 120))}”</small></p>`).join('')}</div>` : ''}
    ${conflicts.length ? `<div class="alert danger"><strong>공고 기준 불일치 ${conflicts.length}건 — 어느 쪽으로 할지 고르는 항목이 아닙니다</strong>
      ${conflicts.map(item => `<p>· <b>${escapeHtml(item.field)}</b> — 공고 <b>${escapeHtml(item.officialValue)}</b> · 현재 ${escapeHtml(item.userValue)}<br>→ ${escapeHtml(item.instruction)}<br><small>조정할 수 없으면 ${escapeHtml(item.unadjustable)}입니다.</small></p>`).join('')}</div>` : ''}</div>`;
}

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
  const boundOf = key => {
    const lock = contractFieldLocks(currentNoticeContract() || { rules: [] })[key];
    return lock && lock.mode !== OFFICIAL_LOCKED ? lock : null;
  };
  return `${contractLockView()}<div class="card" id="decision-center"><div class="card-title"><div><h3>남은 사용자 결정 ${remaining}건</h3><span>여기서 확정한 값만 계획서에 반영합니다. 확정 전에는 어떤 값도 자동으로 바꾸지 않습니다.</span></div><button class="button primary" id="build-final-version" ${remaining === rows.filter(row => row.open || row.value).length ? '' : ''}>확정값 반영해 최종본 만들기</button></div>
    <div class="requirement-list">${rows.map(row => `<article class="requirement"><div><span class="status ${row.value ? '충족' : row.conflict ? '부족' : '확인-필요'}">${row.value ? '확정됨' : row.conflict ? '공고 기준 불일치' : '확인 필요'}</span><div><strong>${escapeHtml(row.label)}</strong>
      ${row.conflict ? `<small>공고 <b>${escapeHtml(row.conflict.officialValue)}</b> · 현재 ${escapeHtml(row.conflict.userValue)} → ${escapeHtml(row.conflict.instruction || '공고 기준으로 조정해야 합니다.')}</small><small class="muted">조정할 수 없으면 ${escapeHtml(row.conflict.unadjustable || '이 공고에 제출할 수 없음')}입니다. 공고 근거: ${escapeHtml(String(row.conflict.officialEvidence.sentence).slice(0, 120))}</small>` : `<small>${escapeHtml(row.hint)}</small>${boundOf(row.key) ? `<small class="muted">${escapeHtml(boundOf(row.key).note)}</small>` : ''}`}
      ${row.value ? `<small class="muted">현재 확정값: ${escapeHtml(row.value)}</small>` : ''}</div></div>
      <div class="two-col" style="margin:10px 0 0 64px"><div class="field" style="margin:0"><label for="decision-${row.key}">확정값 입력</label><input id="decision-${row.key}" data-decision-input="${row.key}" value="${escapeHtml(row.value)}" placeholder="확인된 사실만 입력하세요. 모르면 비워 두세요."></div><div class="field" style="margin:0"><label>&nbsp;</label><button class="button secondary" data-decision-save="${row.key}">이 값으로 확정</button></div></div></article>`).join('')}</div>
    ${plans.length ? `<details><summary>검증에서 확인을 요청한 수정 ${plans.length}건</summary><p class="muted">아래 수정계획 카드에서 값을 입력하면 해당 문단만 수정합니다. 입력 전에는 수정하지 않습니다.</p></details>` : ''}</div>`;
}

// 화면의 확정값 입력칸을 모두 모은다. 「이 값으로 확정」을 따로 누르지 않아도 된다.
function collectDecisionValues() {
  const typed = [...document.querySelectorAll('[data-decision-input]')]
    .map(el => ({ key: el.dataset.decisionInput, value: String(el.value || '').trim() }))
    .filter(entry => entry.value);
  const saved = (state.projectValues || [])
    .filter(item => item.blueprintKey && DECISION_FIELDS.some(field => field.key === item.blueprintKey))
    .map(item => ({ key: item.blueprintKey, value: String(item.value || '').trim() }))
    .filter(entry => entry.value);
  const merged = new Map(saved.map(entry => [entry.key, entry.value]));
  // 화면에 적은 값이 저장된 값보다 우선한다(사용자가 마지막에 적은 값).
  for (const entry of typed) merged.set(entry.key, entry.value);
  return [...merged.entries()].map(([key, value]) => ({
    key, value,
    label: DECISION_FIELDS.find(field => field.key === key)?.label || key,
    target: DECISION_TARGETS[key] || ''
  }));
}
// 확정값이 들어갈 자리(공식 목차 기준)를 함께 알려 준다. 값은 여기서 바꾸지 않는다.
const DECISION_TARGETS = {
  headcount: 'target, goals', sessions: 'programs, schedule', staff: 'roles', partners: 'roles, programs',
  regionalNeed: 'necessity', outcomeGoals: 'goals, outcomes', indicators: 'indicators', budget: 'budget',
  submissionDocs: '제출 확인(계획서 본문 아님)'
};
// 확정값을 현재 계획서의 해당 문단에만 반영한다. AI 호출은 1회이고 실패하면 기존 계획서를 그대로 둔다.
async function buildFinalVersion() {
  if (!state.sections.length) return setState({ error: '확정값을 반영할 계획서 본문이 없습니다.' });
  const confirmed = collectDecisionValues();
  const answers = Object.entries(state.coaching.repairAnswers || {})
    .filter(([, value]) => String(value).trim())
    .map(([id, value]) => ({ id, answer: String(value).trim() }));
  if (!confirmed.length && !answers.length) return setState({ error: '확정된 값이 없습니다. 남은 결정 항목에 값을 입력한 뒤 다시 시도해 주세요.' });
  // 입력칸에 적은 값은 이번 사업 확정값으로도 저장한다(개별 「이 값으로 확정」을 누르지 않아도 된다).
  for (const item of confirmed) setBlueprintValue(item.key, item.label, item.value, { silent: true });
  const before = structuredClone(state.sections);
  setAiBusy('확정값 반영 중', { error: '', notice: '', projectValues: state.projectValues }, 'finalize');
  try {
    const targetIds = new Set(confirmed.flatMap(item => String(item.target || '').split(',').map(part => part.trim()).filter(part => /^[a-z]+$/.test(part))));
    const candidates = state.sections.filter(section => targetIds.has(section.id));
    const sent = candidates.length ? candidates : state.sections;
    const result = await finalizeWithAI({
      sections: sent.map(section => ({ id: section.id, title: section.title, content: section.content })),
      confirmedValues: confirmed,
      answers,
      officialBasis: { requirements: (state.noticeLogic?.requirements || []).slice(0, 12), conflicts: currentOfficialConflicts() },
      organization: organizationForGeneration(),
      analysis: state.analysis || { mode: 'ai' }
    });
    const revised = new Map((result.sections || []).map(section => [section.id, section]));
    if (!revised.size) {
      state.sections = before;
      return setState({ busy: '', sections: before, error: '확정값을 반영할 문단을 찾지 못했습니다. 기존 계획서는 그대로 두었습니다.' });
    }
    const sections = state.sections.map(section => (revised.has(section.id)
      ? { ...section, content: String(revised.get(section.id).content || section.content), status: '검토 필요' }
      : section));
    state.sections = sections;
    recordProposalVersion({ sections, label: '사용자 확정 반영 최종본', source: '사용자 확정', reason: confirmed.map(item => item.label).join(' · ').slice(0, 120) });
    const version = state.proposalVersions[state.proposalVersions.length - 1].version;
    const notApplied = (result.notApplied || []).map(item => `${item.label}: ${item.reason}`);
    setState({
      busy: '', sections, proposalVersions: state.proposalVersions, projectValues: state.projectValues,
      notice: `확정값 ${confirmed.length}건을 ${revised.size}개 문단에 반영해 V${version}을 만들었습니다.${notApplied.length ? ` 본문에 넣지 않은 항목 ${notApplied.length}건: ${notApplied.join(' / ').slice(0, 160)}` : ''} 이전 버전은 보존됩니다.`,
      error: ''
    });
    void archiveCurrentProposal(`final-v${version}`).catch(() => {});
  } catch (error) {
    // 실패하면 계획서를 바꾸지 않는다.
    state.sections = before;
    setState({ busy: '', sections: before, error: `확정값 반영에 실패했습니다. 기존 계획서는 그대로입니다. ${error.message}` });
  }
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
    <div class="actions"><span>최종본으로 승인해야 상태가 「최종본」이 됩니다. 승인해도 이전 버전은 남습니다.</span><div><button class="button primary" id="approve-final-proposal" ${proposalStatus() === '최종본' ? 'disabled' : ''}>${proposalStatus() === '최종본' ? '최종본 승인됨' : '최종본으로 승인'}</button><button class="button secondary" id="open-version-history">이전 버전·검토 이력</button><button class="button secondary" id="final-print">인쇄</button><button class="button secondary" id="final-pdf">PDF 인쇄·저장</button><button class="button primary" id="final-docx">검토용 DOCX</button></div></div></div>`;
}

// V1 → 검증 → 수정계획 → V2 → 재검증 진행 상태. 새 메뉴 없이 작성 화면 안에서 단계만 구분해 보여준다.
// 작성 → 완성본 → 수정 요청 → 검토 제출 → 검토 → 수정 → 재검토 → 최종본 환류.
// 새 엔진을 만들지 않고 proposalVersions·repairPlan·coaching·자료보관함을 그대로 잇는다.
const PROPOSAL_STATES = ['작성중', '완성본·검토전', '검토중', '수정중', '재검토', '최종본'];
function proposalFlow() {
  return { ...structuredClone(initial.proposalFlow), ...(state.proposalFlow || {}) };
}
function setProposalFlow(patch, extra = {}) {
  setState({ proposalFlow: { ...proposalFlow(), ...patch }, ...extra });
}
function latestProposalVersion() {
  const versions = state.proposalVersions || [];
  return versions.length ? versions[versions.length - 1] : null;
}
function proposalStatus() {
  const flow = proposalFlow();
  if (flow.status && PROPOSAL_STATES.includes(flow.status)) return flow.status;
  return state.sections.length ? '완성본·검토전' : '작성중';
}
// 계획서 조립이 끝나면 V1 원본을 그대로 둔 채 「완성본 · 검토 전」으로 올린다.
function markProposalAssembled() {
  const flow = proposalFlow();
  if (flow.status === '최종본') return;
  setProposalFlow({ status: '완성본·검토전', baselineVersion: (state.proposalVersions || []).length || 1 });
  void archiveCurrentProposal('complete').catch(() => {});
}
function proposalStatusTone(status) {
  return status === '최종본' ? '충족' : status === '완성본·검토전' ? '부분-충족' : status === '검토중' || status === '재검토' ? '확인-필요' : '확인-필요';
}
// 1) 완성본 화면: 보기·출력과 다음 갈래(수정 요청 / 검토 제출)를 한 곳에 모은다.
function completionPanelView() {
  if (!state.sections.length) return '';
  const flow = proposalFlow();
  const versions = state.proposalVersions || [];
  const latest = latestProposalVersion();
  const status = proposalStatus();
  const target = flow.reviewTarget;
  return `<div class="card" id="result-completion" tabindex="-1"><div class="card-title"><div><h3>완성본 · 다음 단계 선택</h3><span>검토로 보내기 전에는 이 화면에서 수정 요청만 반영합니다. 이전 버전은 지우지 않습니다.</span></div><span class="status ${proposalStatusTone(status)}">${escapeHtml(status)}</span></div>
    <div class="summary-grid"><div><span>현재 버전</span><strong>V${versions.length || 1}</strong><small>${escapeHtml(latest?.label || '작성본')}</small></div>
      <div><span>보관 상태</span><strong>${escapeHtml(status)}</strong><small>${state.archiveProposalId ? '계획서보관함 저장됨' : '저장 대기'}</small></div>
      <div><span>검토 제출</span><strong>${target ? `V${target.version} · ${target.round}차` : '아직 없음'}</strong><small>${target ? '검토 대상 고정됨' : '만족하는 버전에서 보내세요'}</small></div>
      <div><span>검토 회차</span><strong>${(flow.rounds || []).length}회</strong><small>회차별 결과 보존</small></div></div>
    <div class="actions"><span>출력물은 검토본입니다.</span><div><button class="button secondary" id="open-full-proposal">전체 계획서 보기</button><button class="button secondary" id="final-docx-top">DOCX 내려받기</button><button class="button secondary" id="final-pdf-top">PDF 내려받기</button></div></div>
    <div class="actions"><span>${flow.status === '최종본' ? '최종본입니다. 수정하면 새 버전으로 쌓입니다.' : '수정 요청은 지정한 범위만 바꿉니다. 확정값·공고 근거·기관 확인정보는 바꾸지 않습니다.'}</span><div><button class="button secondary" id="open-revision-request">수정 요청</button><button class="button primary" id="send-to-review">검토·제출로 보내기</button></div></div>
    ${flow.requestOpen ? revisionRequestView() : ''}
    ${versionHistoryView()}
    ${reviewHistoryView()}</div>`;
}
// 2) 자연어 수정 요청. 범위를 고른 항목만 기존 재작성 경로로 다시 쓴다.
function revisionRequestView() {
  const flow = proposalFlow();
  const scope = flow.requestScope || [];
  return `<div class="card" style="margin-top:14px"><div class="card-title"><div><h3>수정 요청</h3><span>바꿀 범위를 고르고 요청을 적어 주세요. 고른 항목만 다시 씁니다.</span></div></div>
    <div class="field"><label for="revision-request-text">수정 요청 내용</label><textarea id="revision-request-text" class="source-text" style="height:110px" placeholder="예: 사업 필요성만 더 구체적으로 / 예산 산출 근거를 항목별로 / 5번 항목만 다시 작성">${escapeHtml(flow.requestText || '')}</textarea></div>
    <div class="requirement-list">${state.sections.map((section, index) => `<article class="requirement"><label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" data-revision-scope="${index}" ${scope.includes(index) ? 'checked' : ''}><div><strong>${escapeHtml(section.title)}</strong><small class="muted">${escapeHtml(String(section.content).slice(0, 90))}…</small></div></label></article>`).join('')}</div>
    <div class="alert warning"><strong>바꾸지 않는 것</strong><p>사용자가 확정한 값, 공고 근거 문장, 신청기관 확인정보는 유지합니다. 확인되지 않은 사실은 만들지 않고 [확인 필요]로 남깁니다.</p></div>
    <div class="actions"><span>선택 ${scope.length}개 항목</span><div><button class="button secondary" id="cancel-revision-request">닫기</button><button class="button primary" id="apply-revision-request" ${scope.length ? '' : 'disabled'}>선택 항목 수정하고 새 버전 저장</button></div></div></div>`;
}
// 3) 버전 이력: 보기·비교·복원과 그 버전이 만들어진 이유.
function versionHistoryView() {
  const versions = state.proposalVersions || [];
  if (!versions.length) return '';
  const flow = proposalFlow();
  const opened = flow.openVersion || 0;
  const compared = flow.compareVersion || 0;
  return `<details open style="margin-top:14px"><summary>버전 이력 ${versions.length}개 · 이전 버전은 지우지 않습니다</summary><div class="requirement-list">${[...versions].reverse().map(item => `<article class="requirement"><div><span class="tag">V${item.version}</span><div><strong>${escapeHtml(item.label)}</strong><small class="muted">${escapeHtml(String(item.savedAt).slice(0, 16).replace('T', ' '))} · ${escapeHtml(item.source)}${item.reason ? ` · 요청: ${escapeHtml(item.reason)}` : ''}</small></div></div>
      <div class="actions" style="margin:8px 0 0"><span></span><div><button class="button secondary" data-view-version="${item.version}">${opened === item.version ? '닫기' : '이 버전 보기'}</button><button class="button secondary" data-compare-version="${item.version}" ${item.version === 1 ? 'disabled' : ''}>${compared === item.version ? '비교 닫기' : '이전 버전과 비교'}</button><button class="button secondary" data-restore-version="${item.version}">이 버전으로 복원</button></div></div>
      ${opened === item.version ? `<div class="requirement-list">${item.sections.map(section => `<article class="requirement"><div><div><strong>${escapeHtml(section.title)}</strong><small style="white-space:pre-wrap">${escapeHtml(section.content)}</small></div></div></article>`).join('')}</div>` : ''}
      ${compared === item.version ? versionDiffView(item) : ''}</article>`).join('')}</div></details>`;
}
// 이전 버전과의 차이는 항목 단위로만 보여 준다(본문을 자동으로 바꾸지 않는다).
function versionDiffView(item) {
  const previous = findProposalVersion(state.proposalVersions, item.version - 1);
  if (!previous) return '<p class="muted">비교할 이전 버전이 없습니다.</p>';
  const rows = item.sections.map(section => {
    const before = previous.sections.find(entry => entry.id === section.id || entry.title === section.title);
    const changed = !before || String(before.content).trim() !== String(section.content).trim();
    return { title: section.title, changed, before: before?.content || '(이전 버전에 없음)', after: section.content };
  });
  const changed = rows.filter(row => row.changed);
  return `<div class="alert ${changed.length ? 'warning' : 'success'}"><strong>V${item.version - 1} → V${item.version} 변경 ${changed.length}개 항목</strong>${changed.length ? '' : '<p>본문 차이가 없습니다.</p>'}</div>
    ${changed.map(row => `<details><summary>${escapeHtml(row.title)}</summary><blockquote><b>이전</b><br>${escapeHtml(String(row.before).slice(0, 900))}</blockquote><blockquote><b>이번</b><br>${escapeHtml(String(row.after).slice(0, 900))}</blockquote></details>`).join('')}`;
}
// 5·8) 검토 회차 이력.
function reviewHistoryView() {
  const rounds = proposalFlow().rounds || [];
  if (!rounds.length) return '';
  return `<details style="margin-top:12px"><summary>검토 이력 ${rounds.length}회 · 회차별 결과를 보존합니다</summary><div class="requirement-list">${[...rounds].reverse().map(round => `<article class="requirement"><div><span class="tag">${round.round}차</span><div><strong>V${round.version} · ${escapeHtml(round.verdict || '결과 없음')}</strong><small class="muted">${escapeHtml(String(round.at).slice(0, 16).replace('T', ' '))} · 지적 ${round.issues}건 · 해결 ${round.resolved}건</small></div></div></article>`).join('')}</div></details>`;
}
function toggleRevisionScope(index, checked) {
  const scope = new Set(proposalFlow().requestScope || []);
  if (checked) scope.add(index); else scope.delete(index);
  setProposalFlow({ requestScope: [...scope].sort((left, right) => left - right) });
}
// 확정값·공고 근거가 바뀌면 그 항목은 반영하지 않는다(기존 lockedValues 검사 재사용).
function lockedProposalValues() {
  return (state.projectValues || []).map(item => String(item.value || '')).filter(Boolean).join(' ');
}
async function applyRevisionRequest() {
  const flow = proposalFlow();
  const instruction = String(flow.requestText || '').trim().slice(0, 1500);
  const scope = flow.requestScope || [];
  if (!instruction) return setState({ error: '수정 요청 내용을 적어 주세요.' });
  if (!scope.length) return setState({ error: '수정할 항목을 하나 이상 선택해 주세요.' });
  const locked = lockedProposalValues();
  const before = structuredClone(state.sections);
  setAiBusy('요청한 범위만 다시 쓰는 중', { error: '', notice: '' }, 'revisionRequest');
  const blocked = [];
  try {
    for (const index of scope) {
      const section = state.sections[index];
      if (!section) continue;
      const result = await rewriteWithAI({ section, instruction: `${instruction}\n\n반드시 지킬 것: 확정된 수치·기간·인원·예산과 공고 근거 문장, 신청기관 확인정보는 그대로 둔다. 확인되지 않은 사실은 만들지 말고 [확인 필요]로 남긴다.`, analysis: analysisForRewrite(), organization: organizationForGeneration() });
      const check = verifyLockedValues(`${section.content}\n${locked}`, `${result.section.content}\n${locked}`, null);
      if (check.removed.length) { blocked.push(`${section.title}(확정 수치 ${check.removed.join(' · ')} 변경 위험)`); continue; }
      state.sections[index] = result.section;
    }
    if (state.sections.every((section, index) => section.content === before[index]?.content)) {
      return setState({ busy: '', error: `요청을 반영하지 못했습니다. ${blocked.join(' / ') || '변경된 내용이 없습니다.'}` });
    }
    recordProposalVersion({ sections: state.sections, label: `사용자 수정 요청 반영`, source: '수정 요청', reason: instruction.slice(0, 120) });
    const version = state.proposalVersions.length;
    setProposalFlow({ status: '수정중', requestOpen: false, requestText: '', requestScope: [], requests: [...(flow.requests || []), { version, text: instruction.slice(0, 300), scope: scope.length, at: new Date().toISOString() }] },
      { sections: state.sections, proposalVersions: state.proposalVersions, busy: '', notice: `요청한 ${scope.length}개 항목을 수정해 V${version}으로 저장했습니다.${blocked.length ? ` 확정값 보호로 ${blocked.length}건은 그대로 두었습니다.` : ''}` });
    void archiveCurrentProposal(`revision-v${version}`).catch(() => {});
  } catch (error) { setState({ busy: '', error: error.message }); }
}
// 4) 검토 대상 고정 후 기존 검증·코칭 화면으로 넘긴다.
function sendVersionToReview() {
  if (!state.sections.length) return setState({ error: '검토로 보낼 계획서가 없습니다.' });
  const flow = proposalFlow();
  const version = (state.proposalVersions || []).length || 1;
  const round = (flow.rounds || []).length + 1;
  const target = { version, round, sentAt: new Date().toISOString(), sections: structuredClone(state.sections) };
  setProposalFlow({ status: round > 1 ? '재검토' : '검토중', reviewTarget: target, requestOpen: false });
  coachCurrentProposal();
  // 보낸 뒤 검증·코칭 화면으로 데려간다. 어디로 가야 할지 사용자가 찾지 않게 한다.
  setState({ activeTool: 'coaching', notice: `V${version}을 ${round}차 검토 대상으로 고정했습니다. 이 화면에서 검증을 실행하세요. 검토 중에는 이 버전을 바꾸지 않습니다.` });
}
// 검토가 끝나면 회차를 기록한다. 결과 자체는 기존 coaching 구조를 그대로 쓴다.
function recordReviewRound(result) {
  const flow = proposalFlow();
  const target = flow.reviewTarget;
  const round = (flow.rounds || []).length + 1;
  const resolved = (result?.comparison?.resolvedIssues || []).length;
  setProposalFlow({
    status: '검토중',
    rounds: [...(flow.rounds || []), { round: target?.round || round, version: target?.version || (state.proposalVersions || []).length || 1, verdict: result?.overallStatus || '', issues: (result?.issues || []).length, resolved, at: new Date().toISOString() }]
  });
}
// 10) 최종본은 사용자가 승인할 때만 만든다. 이전 버전은 그대로 둔다.
function approveFinalProposal() {
  if (!state.sections.length) return setState({ error: '최종본으로 승인할 계획서가 없습니다.' });
  // 공고의 강제조건을 어긴 계획서는 사용자가 확인해도 최종본으로 올리지 않는다.
  const gate = currentSubmissionGate();
  if (gate?.blocking.length) {
    return setState({ error: `공고 적합성 ${gate.status} — 공고 강제조건 ${gate.blocking.length}건을 지키지 못해 최종본으로 승인할 수 없습니다. ${gate.reasons.slice(0, 3).join(' / ')}` });
  }
  const conflicts = currentOfficialConflicts();
  const pending = currentRepairPlans().filter(plan => plan.repairLevel === 'USER_CONFIRMATION');
  const marks = state.sections.reduce((sum, section) => sum + (String(section.content).match(/\[확인 필요[^\]]*\]/g) || []).length, 0);
  const remaining = conflicts.length + pending.length + marks;
  if (remaining && !window.confirm(`남은 확인 항목 ${remaining}건이 있습니다. 그래도 최종본으로 승인할까요? 승인해도 이전 버전은 지워지지 않습니다.`)) return;
  const version = (state.proposalVersions || []).length || 1;
  setProposalFlow({ status: '최종본', approvedVersion: version, approvedAt: new Date().toISOString() }, { notice: `V${version}을 최종본으로 승인했습니다. 이전 버전과 검토 이력은 그대로 남습니다.` });
  void archiveCurrentProposal('final').catch(() => {});
}
// 공고 적합성 게이트 — 공고 실행계약서와 계획서를 규칙 단위로 대조한다. AI 판단이 아니라 코드 비교다.
const GATE_TONE = { '제출 가능': 'success', '보완 필요': 'warning', '제출 차단': 'danger' };
const GATE_STATE_TONE = { 충족: '충족', 미확정: '확인-필요', 불일치: '부족' };
function submissionGateView() {
  const gate = currentSubmissionGate();
  if (!gate) return '';
  const failed = gate.results.filter(item => item.state !== '충족');
  const capability = contractCapabilityCheck(currentNoticeContract(), selectedApplicant());
  return `<div class="card" id="result-submission-gate" tabindex="-1"><div class="card-title"><div><h3>공고 적합성: ${escapeHtml(gate.status)}</h3><span>공고가 정한 조건과 계획서를 규칙마다 직접 대조합니다. 문장 품질은 보지 않습니다.</span></div><strong>${escapeHtml(gate.status)}</strong></div>
    <div class="summary-grid">
      <div><span>핵심 조건</span><strong>${gate.total}개</strong><small>공고 실행계약서</small></div>
      <div><span>✓ 충족</span><strong>${gate.counts['충족']}</strong><small>계획서에서 확인됨</small></div>
      <div><span>? 미확정</span><strong>${gate.counts['미확정']}</strong><small>계획서에서 확인 안 됨</small></div>
      <div><span>✕ 불일치</span><strong>${gate.counts['불일치']}</strong><small>공고 기준과 어긋남</small></div>
    </div>
    <div class="alert ${GATE_TONE[gate.status]}"><strong>${gate.blocking.length ? `제출을 막는 조건 ${gate.blocking.length}건 — 최종본 승인과 제출 준비 완료가 잠깁니다.` : gate.required.length ? `보완할 조건 ${gate.required.length}건` : '공고의 강제조건을 모두 지켰습니다.'}</strong>
      ${gate.blocking.map(item => `<p>✕ <b>${escapeHtml(item.title)}</b><br>공고: ${escapeHtml(item.official)}<br>계획서: ${escapeHtml(item.found || '미포함')}<br><small>공고 근거 [${escapeHtml(item.location)}] “${escapeHtml(String(item.evidence).slice(0, 140))}”</small></p>`).join('')}
      ${gate.blocking.length ? '<button class="button primary" id="redesign-to-contract">공고 기준에 맞게 다시 설계</button>' : ''}</div>
    ${capability ? `<div class="alert ${capability.status === '수행 가능' ? 'success' : capability.status === '적합성 부족' ? 'danger' : 'warning'}"><strong>기관 수행 가능성: ${escapeHtml(capability.status)}</strong><p>${escapeHtml(capability.note)}</p>
      ${capability.missing.map(item => `<p>· 수행 근거 없음 — ${escapeHtml(String(item.title).slice(0, 80))} (필요 근거: ${escapeHtml(item.keyphrases.join(' · '))})</p>`).join('')}</div>` : ''}
    ${failed.length ? `<details><summary>불일치·미확정 ${failed.length}건 자세히 보기</summary><div class="requirement-list">${failed.map(item => `<article class="requirement"><div><span class="status ${GATE_STATE_TONE[item.state]}">${escapeHtml(item.state)}</span><div><strong>${escapeHtml(item.title)} · ${escapeHtml(item.category)} · ${escapeHtml(item.severity)}</strong><small>${escapeHtml(item.detail)}</small><small class="muted">공고 [${escapeHtml(item.location)}] “${escapeHtml(String(item.evidence).slice(0, 160))}”</small></div></div></article>`).join('')}</div></details>` : ''}</div>`;
}

// 제출 차단이면 계약 기준으로 다시 설계한다. V1과 이전 버전은 지우지 않고 새 버전으로만 쌓는다.
async function redesignToContract() {
  const gate = currentSubmissionGate();
  if (!gate) return setState({ error: '공고 실행계약서가 없어 재설계할 수 없습니다.' });
  const conflicts = currentOfficialConflicts();
  // 공고와 충돌하는 값만 내려놓는다. 충돌하지 않는 사용자 확정값과 신청기관 확인정보는 그대로 둔다.
  if (conflicts.length) {
    state.projectValues = (state.projectValues || []).filter(value => !conflicts.some(item => item.field === (value.label || value.blueprintKey)));
  }
  state.redesignForContract = true;
  await generateCompleteProposal();
  if (!state.stagedGeneration?.master) { state.redesignForContract = false; return; }
  await generateProposalParts();
}

// 예산표·일정표처럼 조판 가능한 부분은 본문 문장이 아니라 표 데이터로 받아 코드가 그린다.
function proposalTablesView() {
  const tables = state.proposalTables || [];
  if (!tables.length) return '';
  return `<div class="card" id="result-tables" tabindex="-1"><div class="card-title"><div><h3>계획서 표 ${tables.length}개</h3><span>본문과 따로 구조로 받아 그대로 조판합니다.</span></div></div>
    ${tables.map(table => `<details open><summary>${escapeHtml(table.title)} · ${escapeHtml(table.kind)}</summary>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${(table.columns || []).map(column => `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)">${escapeHtml(column)}</th>`).join('')}</tr></thead>
      <tbody>${(table.rows || []).map(row => `<tr>${(row || []).map(cell => `<td style="padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${table.note ? `<small class="muted">${escapeHtml(table.note)}</small>` : ''}</details>`).join('')}</div>`;
}

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
  const serverChecks = `${guardPanel(state.serverGuard)}${evidencePanel(state.serverEvidence)}${evaluatorPanel(state.evaluatorReview)}`;
  const unresolvedSections = annotated.filter(section => section.unresolved);
  return `${serverChecks}<div class="card" id="result-draft-check" tabindex="-1"><div class="card-title"><div><h3>설계도 대비 V1 자동 점검</h3><span>V1 원문은 그대로 두고 설계도와 비교만 합니다. 점수를 만들지 않습니다.</span></div><strong>${escapeHtml(report.verdict)}</strong></div>
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

// 설계안이 없을 때 보는 시작 카드. 버튼은 언제나 눌린다.
// 설계가 확정되어 있으면 곧바로 작성하고, 아니면 무엇이 필요한지 알리고 그 화면으로 데려간다.
function startWritingView() {
  const permission = generationPermission();
  const applicant = findApplicant(state.applicants, state.selectedApplicantId);
  const steps = [
    { done: Boolean(state.selectedNotice?.title || state.sourceText.trim()), label: '공고 고르기', goto: 'notice',
      reason: '먼저 공고를 고르거나 공고문을 붙여넣어 주세요. 공고 준비 화면으로 이동합니다.' },
    { done: Boolean(applicant), label: '신청기관 정하기', goto: 'applicants',
      reason: '어느 기관으로 신청할지 정해 주세요. 다섯 가지만 적으면 시작할 수 있습니다.' },
    { done: permission.allowed, label: '사업 설계 확인', goto: 'design', reason: permission.reason }
  ];
  const next = steps.find(item => !item.done);
  return `<div class="card" id="start-writing">
    <div class="card-title"><div><h3>전체 계획서 작성</h3><span>공고와 신청기관 자료를 바탕으로 AI가 초안을 만듭니다.</span></div>
      <span class="status ${permission.allowed ? '충족' : '확인-필요'}">${permission.allowed ? '작성 준비됨' : '확인 필요'}</span></div>
    <div class="stat-badges">${steps.map(item => `<span class="stat-badge"><strong>${item.done ? '✓' : '·'}</strong><span>${escapeHtml(item.label)}</span></span>`).join('')}</div>
    <p class="muted">${permission.allowed
      ? '설계가 확정되어 있습니다. 바로 작성할 수 있습니다.'
      : escapeHtml(next?.reason || permission.reason)}</p>
    <p class="muted">확인되지 않은 인력·시설·실적·예산은 만들지 않고 <b>[확인 필요]</b>로 남깁니다.</p>
    <div class="actions"><span class="muted">${next ? `다음: ${escapeHtml(next.label)}` : '모두 준비되었습니다.'}</span>
      <button class="button primary" id="generate-proposal" ${guard(permission.allowed ? '' : (next?.reason || permission.reason), next?.goto || 'design')}>AI와 함께 전체 계획서 작성</button></div>
  </div>`;
}

function stagedGenerationView() {
  const staged = state.stagedGeneration || initial.stagedGeneration;
  const master = staged.master;
  // 설계안이 아직 없으면 이 화면은 통째로 비어 있었다. 시작 버튼조차 없어서
  // 「계획서 작성」에 와 놓고도 갈 곳이 없었다. 시작 카드를 대신 보여 준다.
  if (!master) return startWritingView();
  const groups = master.sectionPlan || [];
  const logic = master.masterLogic || {};
  const completed = new Set(staged.completedGroupIds || []);
  const progress = groups.length ? Math.round((completed.size / groups.length) * 100) : 0;
  const resumed = completed.size > 0 && completed.size < groups.length;
  const done = groups.length > 0 && completed.size === groups.length;
  // 고객 화면에는 내부 분할 단위나 Master 용어를 보이지 않는다. 이어쓰기 중일 때만 남은 항목 수를 알린다.
  const documentPlan = buildDocumentPlan(currentNoticeContract(), currentFormSpec());
  return `<div class="card" id="result-master" tabindex="-1"><div class="card-title"><div><h3>계획서 작성 준비</h3><span>설계안 승인 → 전체 계획서 완성</span></div><span class="tag ${staged.phase === 'parts-ready' ? 'mandatory' : ''}">${escapeHtml(staged.phase === 'parts-ready' ? '작성 완료' : staged.phase === 'parts-generating' ? '작성 중' : '설계안 확정')}</span></div>
    <div class="summary-grid"><div><span>사업명</span><strong>${escapeHtml(master.projectDesign?.projectName || state.project.title)}</strong></div><div><span>대상·인원</span><strong>${escapeHtml([master.projectDesign?.target, master.projectDesign?.participantCount].filter(Boolean).join(' · '))}</strong></div><div><span>사업기간</span><strong>${escapeHtml(master.projectDesign?.projectPeriod || '')}</strong></div><div><span>목표 분량</span><strong>${documentPlan.targetTotalChars.toLocaleString()}자</strong><small>표 ${documentPlan.tables.length}개 포함</small></div></div>
    ${logic.coreStrategy ? `<p class="muted">${escapeHtml(logic.coreStrategy)}</p>` : ''}
    <div class="field"><label for="proposal-freeform">계획서에 반영할 내용 <span class="tag">선택</span></label>
      <textarea id="proposal-freeform" class="source-text" style="height:150px" placeholder="사업 아이디어, 꼭 넣고 싶은 내용, 운영방법, 대상, 예산, 프로그램 등을 자유롭게 적어 주세요.">${escapeHtml(state.projectNarrative || '')}</textarea>
      <small class="muted">사업 아이디어, 꼭 넣고 싶은 내용, 운영방법, 대상, 예산, 프로그램 등을 자유롭게 적어 주세요. 작성하지 않아도 공고와 신청기관 자료를 바탕으로 AI가 작성할 수 있습니다. 적은 내용은 이번 사업에만 저장되고 신청기관 정보에는 자동으로 들어가지 않습니다.</small></div>
    <details><summary>선정 논리와 평가기준 대응</summary><div class="summary-grid"><div><span>문제와 필요성</span><strong>${escapeHtml(logic.problem || '')}</strong></div><div><span>대상 선정 근거</span><strong>${escapeHtml(logic.targetRationale || '')}</strong></div><div><span>핵심 전략</span><strong>${escapeHtml(logic.coreStrategy || '')}</strong></div><div><span>차별성</span><strong>${escapeHtml(logic.differentiation || '')}</strong></div></div><p class="muted">문제 → ${(logic.causes || []).map(escapeHtml).join(' · ')} → 대상 → 전략 → ${(logic.executionMethods || []).map(escapeHtml).join(' · ')} → 산출 → 변화 → 성과측정</p><div class="three-col"><div><h4>기준값</h4>${listOrEmpty((logic.baselineValues || []).map(item => `${item.item}: ${item.value}`))}</div><div><h4>산출·성과·측정 연결</h4>${listOrEmpty((logic.outputOutcomeMeasurementLinks || []).map(item => `${item.output} → ${item.outcomeGoal} → ${item.indicator}`))}</div><div><h4>평가기준 대응</h4>${listOrEmpty((logic.evaluationResponsePlan || []).map(item => `${item.criterion}: ${item.response}`))}</div></div><details><summary>주장별 공식 자료 근거</summary>${(logic.claimEvidencePlan || []).map(item => `<blockquote><strong>${escapeHtml(item.claim)}</strong><br>${escapeHtml(item.evidence)} <small>${escapeHtml(item.location)}</small></blockquote>`).join('')}</details></details>
    <details><summary>계획서 목차 ${documentPlan.outline.length}개 · 목표 분량 ${documentPlan.targetTotalChars.toLocaleString()}자${documentPlan.tables.length ? ` · 표 ${documentPlan.tables.length}개` : ''}</summary><div class="requirement-list">${documentPlan.outline.map((item, index) => `<article class="requirement"><div><span class="tag">${index + 1}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.direction)}</small></div></div><span class="status 부분-충족">${item.targetChars.toLocaleString()}자</span></article>`).join('')}</div>
      ${documentPlan.tables.length ? `<p class="muted">코드가 조판할 표: ${escapeHtml(documentPlan.tables.map(item => item.title).join(' · '))}</p>` : ''}</details>
    ${completed.size ? `<details><summary>이어서 작성할 항목 ${groups.length - completed.size}개</summary><div class="requirement-list">${groups.map((group, index) => `<article class="requirement"><div><span class="tag">${index + 1}</span><div><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml((group.sectionKeys || []).map(sectionTitle).join(' · '))}</small></div></div><span class="status ${completed.has(group.id) ? '충족' : '확인-필요'}">${completed.has(group.id) ? '작성됨' : '대기'}</span></article>`).join('')}</div>
      <div class="field"><label>작성 진행 ${completed.size} / ${groups.length}</label><progress value="${completed.size}" max="${Math.max(groups.length, 1)}" style="width:100%">${progress}%</progress></div></details>` : ''}
    ${(() => { const permission = generationPermission(); return permission.allowed ? '' : `<div class="alert warning"><strong>설계 승인 후에 작성합니다</strong><p>${escapeHtml(permission.reason)}</p><button class="button secondary" id="open-engagement-design">설계안 보러 가기</button></div>`; })()}
    <div class="actions"><span>확인되지 않은 값은 만들지 않고 [확인 필요]로 남깁니다. 제출 가능 여부는 마지막 검토 단계에서 판단합니다.</span>${done ? '<button class="button primary" id="assemble-proposal">계획서 완성하기</button>' : resumed
      // 이미 분할 작성을 시작한 기존 계획서만 이어쓰기 경로를 쓴다. 신규 계획서는 한 번에 작성한다.
      ? `<button class="button primary" id="generate-parts" ${guard(generationPermission().allowed ? '' : generationPermission().reason, 'design')}>남은 내용 이어서 작성</button>`
      : `<button class="button primary" id="generate-proposal" ${guard(generationPermission().allowed ? '' : generationPermission().reason, 'design')}>AI와 함께 전체 계획서 작성</button>`}</div></div>`;
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

// 5~8) 공고 × 기관 확인정보 × 이번 사업 확정값을 대조해, 아직 모르는 것만 최대 5개 묻는다.
// 질문을 만들기 위해 AI를 다시 부르지 않는다(이미 만들어 둔 공고 분석·설계도 결과만 사용).
function currentDesignQuestions() {
  const logic = state.noticeLogic;
  const applicant = selectedApplicant();
  const structure = logic?.structure || null;
  const fitResult = structure && applicant ? matchApplicantToNotice(structure, applicant) : null;
  return buildDesignQuestions({
    structure, fitResult, blueprint: currentBlueprint(), applicant,
    projectValues: state.projectValues, aiQuestions: state.missingInformation || [], answers: state.designAnswers || {}
  });
}
function designQuestionsView() {
  const plan = currentDesignQuestions();
  if (!plan.questions.length && !plan.resolved.length) return '';
  const answered = plan.questions.filter(item => String(state.designAnswers[item.question] || '').trim()).length;
  const reuse = reusableAnswerCandidates(plan.questions, state.designAnswers, selectedApplicant());
  return `<div class="card" id="result-questions" tabindex="-1"><div class="card-title"><div><h3>선정 가능성을 높이기 위한 핵심 질문</h3><span>공고와 신청기관 정보에서 확인되지 않은 내용 중 사업 설계와 평가에 중요한 내용만 질문합니다.</span></div><span class="status ${plan.questions.length ? '확인-필요' : '충족'}">${plan.questions.length ? `${answered}/${plan.questions.length} 답변` : '추가 질문 없음'}</span></div>
    ${plan.resolved.length ? `<p class="muted">이미 확인된 내용 ${plan.resolved.length}건은 다시 묻지 않습니다.</p>` : ''}
    ${plan.questions.map((item, index) => `<div class="field"><label>${escapeHtml(item.question)} <span class="tag">${escapeHtml(item.kind)}</span> <span class="tag">${escapeHtml(item.reason)}</span></label><textarea data-design-answer="${index}" data-design-question="${escapeHtml(item.question)}" placeholder="확인된 사실만 적어 주세요. 모르면 비워 두면 [확인 필요]로 남습니다.">${escapeHtml(state.designAnswers[item.question] || '')}</textarea></div>`).join('')}
    ${reuse.length ? `<div class="alert warning"><strong>신청기관 정보에 추가할까요?</strong><p>아래 답변은 기관 자체 정보로 다시 쓸 수 있습니다. 누르면 「확인 필요」 상태로만 추가되고 자동으로 확정되지 않습니다.</p>
      ${reuse.map(item => `<div class="actions" style="margin:6px 0"><span>${escapeHtml(item.label)}: ${escapeHtml(item.value.slice(0, 60))}…</span><button class="button secondary" data-reuse-answer="${escapeHtml(item.questionId)}">신청기관 정보에 추가</button></div>`).join('')}</div>` : ''}
    ${plan.questions.length ? `<div class="actions"><span>답변은 이번 사업 정보로만 저장하고 기관 정보와 자동으로 섞지 않습니다.</span><button class="button primary" id="regenerate-design">답변 반영해 다시 생성</button></div>` : '<p class="muted">공고 요구와 확인된 기관 정보로 설계에 필요한 값이 모두 확인되었습니다.</p>'}</div>`;
}
// 9) 재사용할 만한 답변만 「확인 필요」 항목으로 추가한다. 확정은 사용자가 따로 한다.
function reuseAnswerToApplicant(questionId) {
  const applicant = selectedApplicant();
  if (!applicant) return setState({ error: '먼저 이번 사업의 신청기관을 선택해 주세요.' });
  const plan = currentDesignQuestions();
  const candidate = reusableAnswerCandidates(plan.questions, state.designAnswers, applicant).find(item => item.questionId === questionId);
  if (!candidate) return;
  const next = { ...applicant, items: [...applicant.items, makeApplicantItem({ area: 'programs', label: candidate.label, value: candidate.value, status: '확인 필요', source: candidate.source, asOf: '' })] };
  state.applicants = upsertApplicant(state.applicants, next);
  setState({ applicants: state.applicants, notice: '신청기관 정보에 「확인 필요」 상태로 추가했습니다. 확인해야 계획서의 확정 사실로 쓰입니다.', error: '' });
  void persistApplicant(next.id, false);
}

function directFactsView() {
  const requirements = state.analysis?.requirements || [];
  return requirements.length ? `<div class="requirement-list">${requirements.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(item.category)}</span><strong>${escapeHtml(item.requirement)}</strong></div><blockquote>${escapeHtml(item.evidence)}</blockquote></article>`).join('')}</div>` : '<p>공식 원문에서 구조화할 사실을 찾지 못했습니다.</p>';
}

function render() {
  // 지금 작업 중인 계획서를 사용량 기록에 묶는다. 값이 없으면 계정 기준으로만 남는다.
  setUsageProposalId(state.archiveProposalId || state.currentVersionId || '');
  // 로그인하기 전에는 작업 화면을 그리지 않는다. 실제 차단은 서버가 하고 화면은 그 결과를 따른다.
  // 우수 계획서 예시는 로그인 여부와 상관없이 열린다. 서버를 부르지 않는 정적 화면이다.
  if (auth.view === 'example') { app.innerHTML = exampleView(); bindLanding(); return; }
  // 공모정보 검색도 로그인 여부와 상관없이 열린다. 공개 항목만 돌려주는 경로만 부른다.
  if (auth.view === 'notices') { app.innerHTML = noticeSearchView(); bindNoticeSearch(); return; }
  if (auth.status !== 'signedIn' && showAuthForm()) { app.innerHTML = loginView(); bindLogin(); return; }
  // 로그아웃 상태의 첫 화면은 서비스 소개다. 두 버튼을 누르거나 전할 말이 생기면 위 줄에서 로그인 화면으로 바뀐다.
  if (auth.status !== 'signedIn') { app.innerHTML = landingView(); bindLanding(); return; }
  // 승인 전 계정은 가입 절차 화면만 본다. 실제 차단은 서버가 한다.
  // 중지된 계정과 활성이 아닌 운영 계정은 어떤 작업 화면도 열지 않는다.
  if (suspendedAccount() || inactiveStaff()) { app.innerHTML = blockedView(); bindLogin(); return; }
  if (pendingAccount()) { app.innerHTML = pendingView(); bindLogin(); return; }
  // 관리자·운영관리자는 어느 포털로 들어갈지 먼저 고른다. 회원 계정을 따로 만들지 않는다.
  if (isStaff() && !state.portal) { app.innerHTML = portalChoiceView(); bindPortalChoice(); return; }
  // 계획서 포털에서는 관리 화면이 열리지 않는다. 저장된 화면 위치가 남아 있어도 되돌린다.
  if (isStaff() && state.portal === 'proposal' && ['admin', 'operator'].includes(state.activeTool)) state.activeTool = 'home';
  // 관리자 포털의 홈은 관리자 랜딩이다. 계획서 포털에서 홈을 누르면 지금까지의 작성 홈이 그대로 열린다.
  if (inAdminPortal() && state.activeTool === 'home') { app.innerHTML = shell(adminLandingView()); bindAdminLanding(); return; }
  // 전체 이용권이 없는 회원은 핵심제안서 화면만 본다. 생성·차단은 서버가 한다.
  if (trialAccount()) { app.innerHTML = coreProposalView(); bindCoreProposal(); return; }
  // 간편 화면. 일반회원의 기본이고 최고관리자·운영관리자는 전환해서 본다.
  // 화면만 단순해질 뿐 분석·검증·권한 차단은 서버에서 그대로 돈다.
  // 홈도 간편 화면으로 연다. 「작성 과정 자세히 보기」로 들어가 있는 동안에만 전문 화면을 그린다.
  if (showSimpleHome()) { app.innerHTML = shell(simpleWriteView()); bind(); bindSimple(); fitAutoGrow(); void loadAiJobs(); void resumeDesignJob(); return; }
  const views = [noticeImportView, noticeConfirmView, applicantSelectView, businessSelectView, documentView, documentView];
  // 관리자 화면은 관리자에게만 열린다. 저장된 화면 위치가 남아 있어도 역할이 아니면 되돌린다.
  if (state.activeTool === 'admin' && !isAdmin()) state.activeTool = 'home';
  // 저장된 화면 위치가 남아 있어도 권한이 없으면 열리지 않는다.
  if (state.activeTool === 'operator' && !isOperator()) state.activeTool = 'home';
  if (state.activeTool === 'premium' && !isPremium()) state.activeTool = 'home';
  if (state.activeTool === 'diagnosis' && !auth.membership?.canDiagnosis) state.activeTool = 'home';
  const tools = { home: homeView, coaching: coachingView, applicants: applicantsToolView, sample: sampleView, engagement: engagementView, account: accountView, admin: adminView, operator: operatorView, premium: premiumView, diagnosis: diagnosisView };
  app.innerHTML = shell((tools[state.activeTool] || views[state.step] || views[0])()); bind(); startBusyElapsedTimer(); fitAutoGrow(); runPendingAiMove();
}
// 소개 화면에는 폼이 없다. 로그인 화면으로 넘기는 버튼과 구역 이동만 연결하고 서버는 부르지 않는다.
function bindLanding() {
  bindMembership();
  bindDiagnosis();
  if (!auth.plans) void loadMembershipPlans();
  document.querySelectorAll('[data-landing]').forEach(el => el.onclick = () => setAuth({ view: 'auth', mode: el.dataset.landing === 'signup' ? 'signup' : 'login', error: '', notice: '' }));
  document.querySelectorAll('[data-landing-scroll]').forEach(el => el.onclick = () => document.querySelector(`#${el.dataset.landingScroll}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  // 예시 보기는 로그인 여부와 무관하다. 서버를 부르지 않고 화면만 바꾼다.
  document.querySelectorAll('[data-landing-example]').forEach(el => el.onclick = () => setAuth({ view: 'example', error: '', notice: '' }));
  document.querySelectorAll('[data-landing-back]').forEach(el => el.onclick = () => setAuth({ view: 'landing', error: '', notice: '' }));
  document.querySelectorAll('[data-landing-notices]').forEach(el => el.onclick = () => openNoticeSearch());
}
// 공모정보 검색 화면. 검색·필터·자세히만 연결하고 AI 경로는 부르지 않는다.
function bindNoticeSearch() {
  bindLanding();
  document.querySelector('#notice-query')?.addEventListener('input', event => { auth.search.queryDraft = event.target.value; });
  document.querySelector('#notice-search-run')?.addEventListener('click', () => void runNoticeSearch({ query: auth.search.queryDraft.trim() }));
  document.querySelectorAll('[data-search-mode]').forEach(el => el.onclick = () => void runNoticeSearch({ mode: el.dataset.searchMode, query: auth.search.queryDraft.trim() }));
  document.querySelectorAll('[data-search-filter]').forEach(el => el.onclick = () => {
    const key = el.dataset.searchFilter;
    const value = auth.search.filters[key] === el.dataset.searchValue ? '' : el.dataset.searchValue;
    void runNoticeSearch({ filters: { ...auth.search.filters, [key]: value } });
  });
  document.querySelector('#notice-filter-reset')?.addEventListener('click', () => void runNoticeSearch({ filters: {} }));
  document.querySelectorAll('[data-notice-open]').forEach(el => el.onclick = () => void openNoticeDetail(el.dataset.noticeOpen));
}
// 핵심제안서 화면. 실행은 한 번뿐이고 나머지 기능은 서버가 막는다.
function bindCoreProposal() {
  // 기관정보는 「내 정보」 한 곳에서만 적는다. 여기서 열고 저장하면 제안서가 그대로 가져다 쓴다.
  document.querySelector('#core-open-profile')?.addEventListener('click', () => setAuth({ memberOpen: !auth.memberOpen }));
  if (auth.memberOpen) bindMemberProfile();
  const field = (id, key) => document.querySelector(id)?.addEventListener('input', event => { auth.core.draft[key] = event.target.value; });
  field('#core-proposer', 'proposer');
  field('#core-idea', 'coreIdea');
  field('#core-purpose', 'purpose');
  field('#core-recipient', 'recipient');
  field('#core-pages', 'targetPages');
  field('#core-source', 'sourceText');
  // 제출처를 바꾸면 강조점 안내가 함께 바뀌므로 다시 그린다.
  document.querySelector('#core-audience')?.addEventListener('change', event => setAuth({ core: { ...auth.core, draft: { ...auth.core.draft, audienceType: event.target.value } } }));
  document.querySelector('#core-run')?.addEventListener('click', () => void runCoreProposal());
  document.querySelector('#core-docx')?.addEventListener('click', () => void downloadCoreProposal('docx'));
  document.querySelector('#core-pdf')?.addEventListener('click', () => void downloadCoreProposal('pdf'));
  document.querySelector('#sign-out')?.addEventListener('click', () => void submitLogout());
  document.querySelectorAll('[data-landing-example]').forEach(el => el.onclick = () => setAuth({ view: 'example', error: '', notice: '' }));
  document.querySelectorAll('[data-social]').forEach(el => el.addEventListener('click', () => void beginSocial(el.dataset.social, el.dataset.socialMode)));
}
function bindLogin() {
  bindMembership();
  bindMemberProfile();
  if (!auth.plans) void loadMembershipPlans();
  document.querySelector('#back-to-landing')?.addEventListener('click', () => setAuth({ view: 'landing', error: '', notice: '' }));
  document.querySelector('#login-email')?.addEventListener('input', event => { auth.emailDraft = event.target.value; });
  // 적는 동안 안내 줄만 갈아 끼운다. 전체를 다시 그리면 입력칸에서 커서가 튄다.
  const redrawHint = () => {
    const hint = document.querySelector('#signup-hint');
    if (auth.mode === 'signup' && hint) hint.outerHTML = signupHintView();
  };
  document.querySelector('#login-password')?.addEventListener('input', event => { auth.passwordDraft = event.target.value; redrawHint(); });
  document.querySelector('#login-password-confirm')?.addEventListener('input', event => { auth.confirmDraft = event.target.value; redrawHint(); });
  document.querySelector('#mode-login')?.addEventListener('click', () => setAuth({ mode: 'login', error: '', notice: '', confirmDraft: '', codeDraft: '' }));
  document.querySelector('#mode-signup')?.addEventListener('click', () => setAuth({ mode: 'signup', error: '', notice: '', confirmDraft: '', codeDraft: '' }));
  document.querySelector('#mode-recover')?.addEventListener('click', () => setAuth({ mode: 'recover', error: '', notice: '', passwordDraft: '', confirmDraft: '', codeDraft: '' }));
  document.querySelector('#login-form')?.addEventListener('submit', event => {
    event.preventDefault();
    // 못 만들 비밀번호로 요청을 보내지 않는다. 무엇이 모자란지 그 자리에서 알려 준다.
    if (auth.mode === 'signup') {
      const reason = signupBlock();
      if (reason) return setAuth({ error: reason, notice: '' });
    }
    void (auth.mode === 'signup' ? submitSignup() : submitLogin());
  });
  document.querySelector('#recovery-email')?.addEventListener('input', event => { auth.emailDraft = event.target.value; });
  document.querySelector('#recovery-code')?.addEventListener('input', event => { auth.codeDraft = event.target.value; });
  document.querySelector('#recovery-password')?.addEventListener('input', event => { auth.passwordDraft = event.target.value; });
  document.querySelector('#recovery-password-confirm')?.addEventListener('input', event => { auth.confirmDraft = event.target.value; });
  document.querySelector('#recovery-form')?.addEventListener('submit', event => { event.preventDefault(); void submitRecovery(); });
  document.querySelectorAll('[data-social]').forEach(el => el.addEventListener('click', () => void beginSocial(el.dataset.social, el.dataset.socialMode)));
  document.querySelector('#sign-out')?.addEventListener('click', () => void submitLogout());
  const draft = patch => { auth.profileDraft = { ...auth.profileDraft, ...patch }; };
  document.querySelector('#profile-name')?.addEventListener('input', event => draft({ name: event.target.value }));
  document.querySelector('#profile-phone')?.addEventListener('input', event => draft({ phone: event.target.value }));
  document.querySelector('#profile-org')?.addEventListener('input', event => draft({ orgName: event.target.value }));
  document.querySelector('#profile-contact')?.addEventListener('change', event => draft({ isContact: event.target.value ? event.target.value === 'yes' : null }));
  document.querySelector('#agree-terms')?.addEventListener('change', event => draft({ agreeTerms: event.target.checked }));
  document.querySelector('#agree-privacy')?.addEventListener('change', event => draft({ agreePrivacy: event.target.checked }));
  document.querySelector('#profile-form')?.addEventListener('submit', event => { event.preventDefault(); void submitProfile(); });
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
  // 검증이 끝나면 종합소견서를 맨 위에 둔다. 입력칸을 지나 스크롤해야 판정을 보는 일이 없게 한다.
  // 다시 검증하려면 「계획서·기준 다시 넣기」를 펴서 같은 입력칸을 그대로 쓴다.
  const inputBlock = `    <div class="card"><div class="two-col"><div class="field"><label for="coaching-title">계획서명</label><input id="coaching-title" value="${escapeHtml(coaching.title)}" placeholder="검증할 계획서명"></div><div class="field"><label for="coaching-file">PDF·DOCX·TXT·HWPX·HWP 불러오기</label><input id="coaching-file" type="file" accept=".pdf,.docx,.txt,.hwpx,.hwp"><small class="muted">한글 파일(HWPX·HWP)도 본문과 표를 읽습니다. 그림으로만 된 문서나 암호 문서는 이유를 알려 드립니다.</small></div></div>
    <label class="dropzone" id="coaching-dropzone" for="coaching-file"><strong>평가받을 사업계획서를 여기에 끌어다 놓으세요</strong><small>클릭 선택과 같은 방식으로 처리합니다 · PDF · DOCX · TXT · HWPX · HWP</small></label>
    <div class="field"><label for="coaching-text">계획서 원문</label><textarea id="coaching-text" class="source-text auto-grow" rows="3" placeholder="직원이 작성한 계획서를 붙여넣거나 파일을 업로드하세요.">${escapeHtml(coaching.text)}</textarea></div>
    <div class="field"><label for="coaching-criteria">연결할 공고·신청서·공식 평가기준</label><textarea id="coaching-criteria" class="source-text auto-grow" rows="3" placeholder="평가표가 있으면 최우선 기준으로 사용합니다.">${escapeHtml(coaching.criteriaText)}</textarea><label><input id="coaching-official-evaluation" type="checkbox" ${coaching.officialEvaluationProvided ? 'checked' : ''}> 입력 자료에 공식 평가표가 포함되어 있음</label></div>
    <div class="actions"><div><button class="button secondary" id="coach-current-proposal" ${state.sections.length ? '' : 'disabled'}>현재 계획서 불러오기</button><button class="button secondary" id="coach-list-archive">계획서보관함 계획서</button></div><button class="button primary" id="run-coaching" ${coaching.pendingJob ? 'disabled' : ''}>${coaching.pendingJob ? '검증 중' : result ? '수정본 다시 검증' : '검증·코칭 실행'}</button></div><small>전체 검증은 OpenAI background mode로 실행됩니다. store=false이지만 polling을 위해 응답 데이터가 약 10분간 일시 저장될 수 있습니다.</small></div>`;
  return `<div class="page-heading"><div class="actions" style="justify-content:flex-end">${sampleButton('coachingV1', '[샘플] 검증 예시 보기')}</div><div><h2>계획서 검증·코칭</h2><p>내부·외부 계획서를 전체 구조부터 검토하고 문제가 있는 위치만 구체적으로 코칭합니다.</p></div><button class="button secondary" id="close-coaching">작성 흐름으로 돌아가기</button></div>
    ${result ? coachingResultView(result) : ''}
    ${result && state.reviewDetail ? repairPlanView() : ''}
    ${result && state.reviewDetail ? coachingApplicantView() : ''}
    ${result ? `<details class="card" id="coaching-inputs"><summary><b>계획서·기준 다시 넣기</b> <small>다시 검증하려면 여기서 바꿉니다</small></summary>${inputBlock}</details>` : inputBlock}
    ${proposalFlow().reviewTarget ? `<div class="alert warning"><strong>검토 대상 고정 · V${proposalFlow().reviewTarget.version} → ${proposalFlow().reviewTarget.round}차 검토 제출</strong><p>검토 중에는 이 버전을 바꾸지 않습니다. 수정은 검토 결과에서 문제별로 진행합니다.</p></div>` : ''}
    ${proposalStructureView()}
    ${coachingReferenceView(coaching)}
    ${coaching.pendingJob ? `<div class="alert warning"><strong>검증 중 · ${escapeHtml(coaching.pendingJob.status || 'queued')}</strong><p>작업 ID ${escapeHtml(coaching.pendingJob.id)} · polling ${Number(coaching.pendingJob.pollCount || 0)}회</p><p>새로고침 후에도 같은 탭에서 작업을 이어 확인합니다.<span data-ai-elapsed data-started-at="${Number(coaching.pendingJob.startedAt || Date.now())}" style="display:block">경과시간 00초</span></p></div>` : ''}
    ${state.archiveProposals.length ? `<div class="card"><h3>계획서보관함에서 불러오기</h3><div class="requirement-list">${state.archiveProposals.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(archiveStageLabel(item.stage))}</span><strong>${escapeHtml(item.title)}</strong></div><button class="button secondary" data-coach-archive="${escapeHtml(item.id)}">${String(item.stage).startsWith('coaching-v') ? '이 버전으로 돌아가기' : '검증 대상으로 불러오기'}</button></article>`).join('')}</div></div>` : ''}`;
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
    <div class="field"><label for="reference-file">참고자료 파일 추가</label><input id="reference-file" type="file" accept=".pdf,.docx,.txt,.hwpx,.hwp" multiple></div></div>
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

// 검증 결과 총론. 각론의 긴 근거를 되풀이하지 않고 전체를 한눈에 둔다.
// 점수·합격확률은 만들지 않는다. 확인한 것과 확인하지 못한 것을 나눠 적는다.
function coachingOverviewView(result, issues) {
  const view = buildOverview({
    result, issues, references: state.coaching.references || [], sectionCount: state.sections.length
  });
  const priorityTag = { '최우선 경고': '부족', '주요 개선': '확인-필요', '일반 개선': 'tag' };
  return `<section class="card" id="coaching-overview" tabindex="-1">
    <div class="card-title"><div><h3>종합소견서</h3><span>먼저 전체를 봅니다. 자세한 근거는 아래에서 펼쳐 봅니다.</span></div>
      <span class="status ${view.verdict.status === '주요 문제 없음' ? '충족' : '확인-필요'}">${escapeHtml(view.verdict.status)}</span></div>

    <div class="alert success"><strong>잘된 점</strong>${view.strengths.map(line => `<p>· ${escapeHtml(line)}</p>`).join('')}</div>

    <div class="summary-grid">
      <div><span>검증 범위</span><strong>${view.scope.areas.length}개 영역</strong><small>${escapeHtml(view.scope.areas.join(' · ') || '확인 필요')}</small></div>
      <div><span>사용한 기준</span><strong>${view.scope.officialProvided ? '공식 평가기준' : '공통 심사 기준'}</strong><small>${escapeHtml(view.scope.basisLabel)}</small></div>
      <div><span>내부 종합판정</span><strong>${escapeHtml(view.verdict.status)}</strong><small>${escapeHtml(String(view.verdict.summary).slice(0, 60))}</small></div>
      <div><span>검증 가능 범위</span><strong>계획서 ${view.scope.sectionCount}항목</strong><small>참고자료 ${view.scope.referenceCount}건${view.coverage.limit ? ' · 제한 있음' : ''}</small></div>
    </div>
    ${view.coverage.limit ? `<p class="muted">${escapeHtml(view.coverage.limit)}</p>` : ''}

    <h4>핵심 문제 ${view.top.length}건${issues.length > view.top.length ? ` (전체 ${issues.length}건 중)` : ''}</h4>
    ${view.top.length ? `<div class="requirement-list">${view.top.map(item => `<article class="requirement">
      <div><span class="status ${priorityTag[item.priority] || 'tag'}">${escapeHtml(item.priority)}</span>
        <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.locations.join(' · ') || '위치 확인 필요')}</small></div></div>
      <p class="muted">${escapeHtml(String(item.risk).slice(0, 120))}</p></article>`).join('')}</div>`
      : '<p class="muted">먼저 고쳐야 할 문제를 찾지 못했습니다.</p>'}

    ${view.order.length ? `<h4>제출 전에 먼저 할 일</h4><ol class="muted">${view.order.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ol>` : ''}

    <div class="two-col">
      <div><h4>확인된 내용</h4><ul class="muted">${(view.confirmed.length ? view.confirmed : ['아직 없습니다']).map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>
      <div><h4>확인할 수 없는 내용</h4><ul class="muted">${(view.unconfirmed.length ? view.unconfirmed : ['없습니다']).map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>
    </div>

    <p class="muted">${escapeHtml(view.verdict.note)}</p>
    <div class="actions"><span class="muted">권장 다음 행동: <b>${escapeHtml(view.next)}</b></span>
      <div><button class="button primary" id="coaching-fix-first">우선 문제부터 수정하기</button>
      <button class="button secondary" id="coaching-detail-toggle">${state.reviewDetail ? '세부 검증 결과 접기' : '세부 검증 결과 보기'}</button></div></div>
  </section>`;
}

// 검증 결과. 총론을 먼저 그리고 각론은 눌렀을 때만 편다.
// 판정·근거·수정 상태는 예전 그대로다. 접고 펴는 것으로 AI를 다시 부르지 않는다.
function coachingResultView(result) {
  const merged = mergeReviewIssues(result, state.coaching.workItems || []);
  return `${coachingOverviewView(result, merged.issues)}
    ${state.reviewDetail ? coachingDetailView(result, merged) : ''}`;
}

// 각론 한 영역. 기본은 접혀 있고 제목에 상태별 건수가 붙는다.
function detailPanel(key, label, open, inner) {
  if (!String(inner).trim()) return '';
  return `<details class="review-panel" data-review-panel="${key}"${open(key)}><summary>${escapeHtml(label(key))}</summary>${inner}</details>`;
}

// 항목별 검증 결과. 합친 검증 이슈를 목록으로만 보여 준다. 근거 원문은 아래 영역에서 본다.
function issueListView(issues) {
  if (!issues.length) return '<p class="muted">항목별로 걸린 문제가 없습니다.</p>';
  const tag = { '최우선 경고': '부족', '주요 개선': '확인-필요', '일반 개선': 'tag' };
  return `<div class="requirement-list">${issues.map(issue => `<article class="requirement">
    <div><span class="status ${tag[issue.priority] || 'tag'}">${escapeHtml(issue.priority)}</span>
      <div><strong>${escapeHtml(issue.name)}</strong><small>${escapeHtml(issue.locations.join(' · ') || '위치 확인 필요')} · ${escapeHtml(issue.status)}</small></div></div>
    <p class="muted">${escapeHtml(String(issue.risk || '').slice(0, 160))}</p>
    ${issue.criteria.length ? `<small class="muted">해당 평가기준: ${escapeHtml(issue.criteria.join(' · '))}</small>` : ''}</article>`).join('')}</div>`;
}

// 근거 원문. 합친 이슈에 모아 둔 원문을 한자리에서 본다. 같은 문장을 두 번 담지 않는다.
function evidenceListView(issues) {
  const withEvidence = issues.filter(issue => issue.evidence.length);
  if (!withEvidence.length) return '<p class="muted">입력 원문에서 직접 확인된 근거가 없습니다.</p>';
  return withEvidence.map(issue => `<div class="requirement"><div><strong>${escapeHtml(issue.name)}</strong>
    <small>${escapeHtml(issue.from.join(' · '))}</small></div>
    ${issue.evidence.map(ref => `<blockquote><b>${escapeHtml(ref.sourceName || '계획서')}</b>
      ${ref.pageOrSection ? `<small>${escapeHtml(ref.pageOrSection)}</small>` : ''}
      <p>${escapeHtml(String(ref.excerpt || '').slice(0, 300))}</p>
      <small class="muted">${ref.verified ? '원문에서 확인함' : '[확인 필요] 원문에서 확인하지 못함'}</small></blockquote>`).join('')}</div>`).join('');
}

function coachingDetailView(result, merged) {
  const panels = detailPanels({ result, issues: merged.issues, references: state.coaching.references || [] });
  const counts = Object.fromEntries(panels.map(item => [item.key, item]));
  const label = key => {
    const panel = counts[key];
    if (!panel) return '';
    // 근거는 문제보다 많을 수 있다. 「확인 32건 / 전체 22건」처럼 읽히지 않게 따로 적는다.
    if (key === 'evidence') return `${panel.title} · 근거 ${panel.count}건 / 문제 ${panel.total}건`;
    return `${panel.title} · 확인 ${panel.count}건 / 전체 ${panel.total}건`;
  };
  const open = key => ((state.reviewPanels || []).includes(key) ? ' open' : '');
  const priorityOrder = { '최우선 경고': 0, '주요 개선': 1, '일반 개선': 2 };
  const sorted = [...result.issues].sort((left, right) => (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9));
  // 「우선 문제부터 수정하기」로 들어오면 중요도가 높은 것만 먼저 보여 준다. 나머지는 버리지 않는다.
  const focused = state.reviewFocus ? sorted.filter(item => item.priority !== '일반 개선') : sorted;
  const issues = focused.length ? focused : sorted;
  const comparison = result.comparison || { previousVersion: 0, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] };
  if (state.coaching.workItems?.length !== result.issues.length) state.coaching.workItems = makeCoachingWorkItems(result);
  const workItems = state.coaching.workItems;
  const submission = coachingSubmissionDecision(result, workItems);
  return `<div class="card" id="result-coaching" tabindex="-1"><div class="card-title"><div><h3>세부 검증 결과</h3><span>같은 문제를 여러 곳에 다시 만들지 않습니다. 합치기 전 ${merged.before}건 → 합친 뒤 ${merged.after}건</span></div><div><button class="button secondary" id="coaching-expand-all">모두 펼치기</button><button class="button secondary" id="coaching-collapse-all">모두 접기</button><button class="button secondary" id="print-coaching-report">코칭 보고서 PDF 인쇄·저장</button></div></div>
    ${detailPanel('checks', label, open, submissionCheckView(result, submission))}
    ${detailPanel('sections', label, open, issueListView(merged.issues))}
    ${detailPanel('evidence', label, open, evidenceListView(merged.issues))}
    ${detailPanel('matrix', label, open, result.evaluationMatrix?.length ? `<div class="requirement-list">${result.evaluationMatrix.map(item => `<article class="requirement"><div><span class="tag">${escapeHtml(item.status)}</span><div><strong>${escapeHtml(item.criterion)}${item.officialPoints ? ` · ${escapeHtml(item.officialPoints)}` : ''}</strong><small>${escapeHtml(item.requirement)}</small></div></div><p><b>계획서 대응 위치</b> ${escapeHtml(item.proposalLocations.join(' · ') || '연결 위치 없음')}</p>${coachingEvidenceView(item.evidenceRefs)}</article>`).join('')}</div>` : '')}
    ${detailPanel('references', label, open, (state.coaching.references || []).length ? `${referenceWarningView(assessReferences(state.coaching.references, coachingContext()))}<div class="cap-grid">${assessReferences(state.coaching.references, coachingContext()).assessments.map(item => `<div><span>${escapeHtml(item.referenceType)}</span><strong>${escapeHtml(item.fileName)}</strong><small>${escapeHtml(item.usage)}</small></div>`).join('')}</div>` : '<p class="muted">추가한 참고자료가 없습니다. 계획서만으로 검증했습니다.</p>')}
    ${comparison.previousVersion ? `<details open><summary>v${comparison.previousVersion} 대비 재검증 결과</summary><div class="summary-grid"><div><span>해결된 문제</span><strong>${comparison.resolvedIssues.length}건</strong><small>${escapeHtml(comparison.resolvedIssues.join(' · ') || '없음')}</small></div><div><span>남은 문제</span><strong>${comparison.remainingIssues.length}건</strong><small>${escapeHtml(comparison.remainingIssues.join(' · ') || '없음')}</small></div><div><span>새로 생긴 문제</span><strong>${comparison.newIssues.length}건</strong><small>${escapeHtml(comparison.newIssues.join(' · ') || '없음')}</small></div><div><span>실제 개선 항목</span><strong>${comparison.improvedAreas.length}건</strong><small>${escapeHtml(comparison.improvedAreas.join(' · ') || '없음')}</small></div></div></details>` : ''}
    ${detailPanel('work', label, open, `<div class="actions"><span>수정이 필요한 문제를 골라 「계획서 쓰기」로 보냅니다. 검증코치는 계획서를 직접 다시 쓰지 않습니다.</span><span><button class="button secondary" id="select-all-issues">전체 선택</button><button class="button primary" id="send-issues-to-writer" ${state.sections.length ? '' : 'disabled'}>계획서 쓰기에서 수정</button></span></div>${state.sections.length ? '' : `<div class="actions"><span class="muted">작성 중인 계획서 본문이 없습니다. 업로드한 외부 계획서를 원본 그대로 두고 수정 가능한 작업본으로 전환하면 같은 왕복 흐름을 사용할 수 있습니다.</span><button class="button primary" id="adopt-external-proposal" ${state.coaching.text.trim().length >= 30 ? '' : 'disabled'}>외부 계획서를 작업본으로 전환</button></div>`}<div class="requirement-list">${issues.length ? issues.map(item => { const originalIndex = result.issues.indexOf(item); const work = workItems[originalIndex] || { status: '미수정' }; return `<article class="requirement"><div><span class="tag mandatory">${escapeHtml(item.priority)}</span><div><strong><label><input type="checkbox" data-coaching-select="${originalIndex}" ${(state.coachingSelection || []).includes(originalIndex) ? 'checked' : ''}> ${escapeHtml(item.location)}</label></strong><small>${escapeHtml(item.category)}</small></div><select data-coaching-status="${originalIndex}" aria-label="${escapeHtml(item.location)} 상태"><option ${work.status === '미수정' ? 'selected' : ''}>미수정</option><option ${work.status === '수정중' ? 'selected' : ''}>수정중</option><option ${work.status === '해결' ? 'selected' : ''}>해결</option><option ${work.status === '확인필요' ? 'selected' : ''}>확인필요</option><option ${work.status === '유지' ? 'selected' : ''}>유지</option></select></div><p><b>위험 이유</b> ${escapeHtml(item.reason)}</p><p><b>개선 방향</b> ${escapeHtml(item.direction)}</p>${coachingEvidenceView(item.evidenceRefs)}<details><summary>기존 수정 예시${item.requiresConfirmation ? ' · 확인 필요' : ''}</summary><blockquote>${escapeHtml(item.example)}</blockquote></details><div class="actions"><span>상태: ${escapeHtml(work.status)}</span><div><button class="button secondary" data-coaching-revise="${originalIndex}">AI에게 수정 요청</button><button class="button secondary" data-coaching-manual="${originalIndex}">직접 수정</button><button class="button secondary" data-coaching-confirm="${originalIndex}">확인정보 입력</button><button class="button secondary" data-coaching-keep="${originalIndex}">현재 유지</button></div></div>${work.revision ? `<div class="two-col"><details open><summary>원문</summary><blockquote>${escapeHtml(work.revision.originalExcerpt)}</blockquote></details><details open><summary>AI 수정안${work.revision.requiresConfirmation ? ' · 확인 필요' : ''}</summary><blockquote>${escapeHtml(work.revision.revisedText)}</blockquote><small>${escapeHtml(work.revision.explanation)}</small></details></div><div class="actions"><span>자동 적용되지 않습니다.</span>${work.applied ? `<button class="button secondary" data-coaching-undo="${originalIndex}">적용 되돌리기</button>` : `<button class="button primary" data-coaching-apply="${originalIndex}">수정안 적용</button>`}</div>` : ''}</article>`; }).join('') : '<p class="muted">현재 기준에서 발견된 주요 문제가 없습니다.</p>'}</div>`)}
  </div>`;
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

// 내용에 맞춰 세로로만 늘린다. 최대 높이를 넘으면 칸 안에서 스크롤한다.
function fitTextarea(el) {
  if (!el) return;
  const limit = Math.min(window.innerHeight * 0.45, 480);
  // 먼저 줄여야 줄어든 내용에서도 제 높이를 잰다.
  el.style.height = 'auto';
  const next = Math.min(el.scrollHeight, limit);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > limit ? 'auto' : 'hidden';
}
// 파일 불러오기·보관함 불러오기·복원도 화면을 다시 그리므로 여기서 함께 처리된다.
function fitAutoGrow() {
  document.querySelectorAll('textarea.auto-grow').forEach(el => {
    fitTextarea(el);
    if (el.dataset.autoGrow === '1') return;
    el.dataset.autoGrow = '1';
    el.addEventListener('input', () => fitTextarea(el));
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
  document.querySelector('#manual-source-type')?.addEventListener('change', e => { state.manualSourceTypeTouched = true; state.manualSourceType = e.target.value; saveState(); });
  document.querySelector('#manual-source-name')?.addEventListener('input', e => { state.manualSourceName = e.target.value; saveState(); });
  document.querySelector('#manual-source-text')?.addEventListener('input', e => { state.manualSourceText = e.target.value; saveState(); });
  for (const [id, key] of [['archive-institution', 'institution'], ['archive-from', 'from'], ['archive-to', 'to'], ['archive-keyword', 'keyword']]) document.querySelector(`#${id}`)?.addEventListener('input', event => { state.archiveFilters[key] = event.target.value; saveState(); });
  document.querySelector('#archive-recovery-key')?.addEventListener('input', event => { state.archiveKeyDraft = event.target.value; });
}

function bind() {
  updateInputs();
  bindTopMenus();
  bindMemberProfile();
  bindPremium();
  bindMembership();
  if (!auth.plans) void loadMembershipPlans();
  bindShowcase();
  if (auth.adminTab === 'showcase' && isAdmin()) void loadShowcase();
  if (state.activeTool === 'premium') void loadPremium();
  if (state.step === 0 && !archiveLoaded) void loadRecentArchive();
  if (state.activeTool === 'home' && !homeArchiveLoaded) void loadHomeRecent();
  document.querySelectorAll('[data-type]').forEach(el => el.onclick = () => { state.project.type = el.dataset.type; saveState(); render(); });
  document.querySelector('#business-type')?.addEventListener('change', event => { state.project.type = event.target.value; saveState(); render(); });
  document.querySelectorAll('[data-step]').forEach(el => el.onclick = () => { state.activeTool = 'workflow'; navigateToStep(Number(el.dataset.step), { notice: '', error: '' }); });
  document.querySelector('#toggle-view')?.addEventListener('click', () => setState({ viewMode: viewMode() === 'simple' ? 'expert' : 'simple', expertDetail: false, activeTool: '', notice: '', error: '' }));
  document.querySelector('#toggle-workspace')?.addEventListener('click', () => {
    // 작업공간을 바꾸면 보관함을 다시 읽는다. 두 공간의 자료가 한 화면에 섞이지 않게 한다.
    const next = state.workspace === 'agency' ? 'personal' : 'agency';
    setState({ workspace: next, notice: next === 'agency' ? '대행 업무 자료만 보여 줍니다.' : '개인 작업공간 자료만 보여 줍니다.', error: '' });
    void loadRecentArchive();
  });
  document.querySelector('#back-to-simple')?.addEventListener('click', () => setState({ expertDetail: false, activeTool: '', notice: '간편 화면으로 돌아왔습니다. 작성 내용은 그대로입니다.', error: '' }));
  document.querySelector('#open-expert-detail')?.addEventListener('click', () => setState({ expertDetail: true, activeTool: '', notice: '작성 과정을 펼쳤습니다. 같은 공고·기관·계획서를 그대로 봅니다.', error: '' }));
  document.querySelector('#sign-out')?.addEventListener('click', () => void submitLogout());
  document.querySelector('#open-account')?.addEventListener('click', () => setState({ activeTool: 'account', notice: '', error: '' }));
  document.querySelector('#open-premium')?.addEventListener('click', () => setState({ activeTool: 'premium', notice: '', error: '' }));
  document.querySelector('#open-diagnosis')?.addEventListener('click', () => setState({ activeTool: 'diagnosis', notice: '', error: '' }));
  document.querySelectorAll('[data-portal]').forEach(el => el.onclick = () => openPortal(el.dataset.portal));
  document.querySelectorAll('[data-portal-open]').forEach(el => el.onclick = () => (el.dataset.portalOpen === 'admin' ? openAdmin() : openOperator()));
  document.querySelector('#reload-admin')?.addEventListener('click', () => void loadAccounts());
  document.querySelectorAll('[data-sub-approve]').forEach(el => el.onclick = () => void decideSubscriptionRequest(el.dataset.subApprove, 'approved'));
  document.querySelectorAll('[data-sub-reject]').forEach(el => el.onclick = () => void decideSubscriptionRequest(el.dataset.subReject, 'rejected'));
  document.querySelector('#close-admin')?.addEventListener('click', () => openPortal('proposal'));
  document.querySelectorAll('[data-admin-approve]').forEach(el => el.onclick = () => void runAdminAction('approve', el.dataset.adminApprove));
  document.querySelectorAll('[data-admin-disable]').forEach(el => el.onclick = () => void runAdminAction('disable', el.dataset.adminDisable));
  document.querySelectorAll('[data-admin-delete]').forEach(el => el.onclick = () => void runAdminAction('delete', el.dataset.adminDelete));
  document.querySelectorAll('select[data-admin-role-id]').forEach(el => el.onchange = () => void runAdminAction(el.value, el.dataset.adminRoleId));
  document.querySelectorAll('[data-admin-plan]').forEach(el => el.onclick = () => void runAdminAction(el.dataset.adminPlan, el.dataset.adminPlanId));
  document.querySelector('#open-admin-notices')?.addEventListener('click', () => {
    const opening = auth.adminTab !== 'notices';
    setAuth({ adminTab: opening ? 'notices' : 'accounts', error: '', notice: '' });
    if (opening && !auth.notices.loaded) void loadAdminNotices();
  });
  document.querySelector('#open-admin-agency')?.addEventListener('click', () => {
    const opening = auth.adminTab !== 'agency';
    setAuth({ adminTab: opening ? 'agency' : 'accounts', error: '', notice: '' });
    if (opening && !auth.agency?.loaded) void loadAgencies();
  });
  bindAgency();
  document.querySelector('#open-admin-access')?.addEventListener('click', () => {
    const opening = auth.adminTab !== 'access';
    setAuth({ adminTab: opening ? 'access' : 'accounts', error: '', notice: '' });
    if (opening && !accessState().loaded) void loadAccess();
  });
  document.querySelector('#access-subject')?.addEventListener('change', event => void loadAccess(event.target.value));
  document.querySelector('#grant-scope')?.addEventListener('change', event => setAuth({ access: { ...accessState(), draft: { ...accessState().draft, scope: event.target.value } } }));
  document.querySelector('#grant-target-kind')?.addEventListener('change', event => setAuth({ access: { ...accessState(), draft: { ...accessState().draft, targetKind: event.target.value, targetId: '' } } }));
  document.querySelector('#grant-target-id')?.addEventListener('input', event => { accessState().draft.targetId = event.target.value; });
  document.querySelector('#grant-note')?.addEventListener('input', event => { accessState().draft.note = event.target.value; });
  document.querySelector('#grant-starts')?.addEventListener('input', event => { accessState().draft.startsOn = event.target.value; });
  document.querySelector('#grant-ends')?.addEventListener('input', event => { accessState().draft.endsOn = event.target.value; });
  document.querySelectorAll('[data-grant-ability]').forEach(el => el.onchange = () => { accessState().draft.abilities[el.dataset.grantAbility] = el.checked; });
  document.querySelector('#grant-save')?.addEventListener('click', () => void submitGrant());
  document.querySelectorAll('[data-revoke-grant]').forEach(el => el.onclick = () => void revokeGrantNow(el.dataset.revokeGrant));
  document.querySelector('#load-member-usage')?.addEventListener('click', () => void loadMemberUsage());
  document.querySelectorAll('[data-assign-proposal]').forEach(el => el.onclick = () => void assignProposalToMember(el.dataset.assignProposal));
  document.querySelector('#open-admin-collection')?.addEventListener('click', () => {
    const opening = auth.adminTab !== 'collection';
    setAuth({ adminTab: opening ? 'collection' : 'accounts', error: '', notice: '' });
    if (opening && !collectionState().loaded) void loadCollection();
  });
  document.querySelector('#collection-reload')?.addEventListener('click', () => void loadCollection());
  document.querySelector('#collection-run')?.addEventListener('click', () => void runCollectionNow());
  // 막힌 버튼은 눌리되 실행되지 않고 안내로 이어진다. 이 처리기가 다른 처리기보다 먼저 잡는다.
  document.querySelectorAll('[data-blocked]').forEach(el => el.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    explainBlocked(el.dataset.blocked, el.dataset.goto || '');
  }, true));
  document.querySelectorAll('[data-source-toggle]').forEach(el => el.onclick = () => void toggleNoticeSource(el.dataset.sourceToggle, Boolean(el.dataset.sourceNext)));
  document.querySelector('#open-admin-showcase')?.addEventListener('click', () => setAuth({ adminTab: auth.adminTab === 'showcase' ? 'accounts' : 'showcase', error: '', notice: '' }));
  document.querySelector('#open-admin-usage')?.addEventListener('click', () => {
    const opening = auth.adminTab !== 'usage';
    setAuth({ adminTab: opening ? 'usage' : 'accounts', error: '', notice: '' });
    if (opening && !auth.usage.loaded) void loadUsage();
  });
  document.querySelectorAll('[data-usage-days]').forEach(el => el.onclick = () => void loadUsage(Number(el.dataset.usageDays)));
  document.querySelector('#admin-notice-query')?.addEventListener('input', event => { auth.notices.queryDraft = event.target.value; });
  document.querySelector('#admin-notice-search')?.addEventListener('click', () => void loadAdminNotices(auth.notices.queryDraft.trim()));
  document.querySelector('#admin-notice-reload')?.addEventListener('click', () => void loadAdminNotices());
  document.querySelectorAll('[data-notice-public]').forEach(el => el.onclick = () => void toggleNoticePublic(el.dataset.noticePublic, Boolean(el.dataset.noticeNext)));
  document.querySelector('#close-operator')?.addEventListener('click', () => openPortal('proposal'));
  document.querySelector('#operator-reload')?.addEventListener('click', () => void loadOperator());
  document.querySelector('#operator-search')?.addEventListener('input', event => { auth.operator.queryDraft = event.target.value; });
  document.querySelector('#operator-search-run')?.addEventListener('click', () => void loadOperator(auth.operator.queryDraft.trim()));
  document.querySelectorAll('[data-operator-tab]').forEach(el => el.onclick = () => {
    setOperator({ tab: el.dataset.operatorTab });
    if (el.dataset.operatorTab === 'usage' && !auth.usage.loaded) void loadUsage();
    if (el.dataset.operatorTab === 'collection' && !collectionState().loaded) void loadCollection();
  });
  document.querySelectorAll('[data-operator-action]').forEach(el => el.onclick = () => void runOperatorAction(el.dataset.operatorAction, el.dataset.operatorId));
  document.querySelectorAll('[data-operator-detail]').forEach(el => el.onclick = () => void openOperatorDetail(el.dataset.operatorDetail));
  document.querySelectorAll('[data-progress-field]').forEach(el => {
    const apply = () => {
      const id = el.dataset.progressId;
      auth.progressDraft = { ...(auth.progressDraft || {}), [id]: { ...((auth.progressDraft || {})[id] || {}), [el.dataset.progressField]: el.value } };
    };
    el.oninput = apply; el.onchange = apply;
  });
  document.querySelectorAll('[data-progress-save]').forEach(el => el.onclick = () => void runContractProgress(el.dataset.progressSave));
  document.querySelectorAll('[data-social]').forEach(el => el.addEventListener('click', () => void beginSocial(el.dataset.social, el.dataset.socialMode)));
  document.querySelector('#open-archive-box')?.addEventListener('click', () => {
    state.activeTool = 'workflow';
    navigateToStep(0, { notice: '공고보관함·계획서보관함을 열었습니다.', error: '' });
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
  document.querySelector('#workflow-back')?.addEventListener('click', () => { if (!navigationHistory.backStack.length) return; state.activeTool = 'workflow'; navigateBack(); });
  document.querySelector('#workflow-home')?.addEventListener('click', () => setState({ activeTool: 'home', notice: '', error: '' }));
  document.querySelector('#workflow-forward')?.addEventListener('click', () => { if (!navigationHistory.forwardStack.length) return; state.activeTool = 'workflow'; navigateForward(); });
  document.querySelector('#go-to-review')?.addEventListener('click', () => navigateToStep(4));
  document.querySelector('#menu-toggle')?.addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  const fileInput = document.querySelector('#source-files');
  if (fileInput) fileInput.onchange = async e => {
    try {
      setState({ busy: '파일에서 텍스트를 추출하는 중...', error: '' });
      const chosen = [...e.target.files];
      const done = [];
      const failed = [];
      for (const file of chosen) {
        try {
          const parsed = await extractFile(file);
          done.push({ ...parsed, characters: parsed.text.length, extracted: true });
        } catch (error) {
          // 읽지 못한 파일도 목록에 남긴다. 무엇이 문제였는지 함께 적는다.
          failed.push({ name: file.name, type: (file.name.split('.').pop() || '').toUpperCase(), size: file.size, characters: 0, tables: 0, extracted: false, reason: String(error?.message || '').replace(`${file.name}: `, '') });
        }
      }
      state.files.push(...done, ...failed);
      state.sourceText += done.map(v => `\n\n[파일: ${v.name}]\n${v.text}`).join('');
      setState({
        busy: '',
        notice: done.length ? `${done.length}개 파일을 읽었습니다.${failed.length ? ` ${failed.length}개는 읽지 못해 이유를 표시했습니다.` : ''}` : '',
        error: done.length ? '' : failed.map(item => `${item.name}: ${item.reason}`).join(' / ')
      });
    }
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
  // 환류 작업흐름: 완성본 → 수정 요청 → 검토 제출 → 버전 이력 → 최종 승인.
  document.querySelector('#open-full-proposal')?.addEventListener('click', () => document.querySelector('#final-submission, #result-pipeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.querySelector('#final-docx-top')?.addEventListener('click', () => { if (!refusePartial()) exportDocx(state.project, reviewSections()); });
  document.querySelector('#final-hwpx-top')?.addEventListener('click', () => { if (!refusePartial()) downloadProposalHwpx(); });
  document.querySelector('#final-form-docx')?.addEventListener('click', () => { if (!refusePartial()) void downloadFormFilled(); });
  document.querySelector('#preview-form-docx')?.addEventListener('click', () => void downloadFormFilled());
  // 제출 판정에 막혀도 지금까지 쓴 내용은 검토본으로 받는다.
  document.querySelector('#package-review-docx')?.addEventListener('click', () => exportDocx(state.project, state.sections, { tables: state.proposalTables || [] }).catch(showError));
  document.querySelector('#package-review-pdf')?.addEventListener('click', () => void downloadProposalPdf());
  document.querySelector('#package-fill-open')?.addEventListener('click', () => setState({ expertDetail: true, activeTool: '', step: 4, notice: '확인 필요 표시가 남은 항목입니다. 값을 채우면 제출본이 열립니다.' }));
  document.querySelector('#final-pdf-top')?.addEventListener('click', () => { if (!refusePartial()) downloadProposalPdf(); });
  document.querySelector('#open-revision-request')?.addEventListener('click', () => setProposalFlow({ requestOpen: !proposalFlow().requestOpen }));
  document.querySelector('#cancel-revision-request')?.addEventListener('click', () => setProposalFlow({ requestOpen: false }));
  document.querySelector('#revision-request-text')?.addEventListener('input', event => { state.proposalFlow = { ...proposalFlow(), requestText: event.target.value }; saveState(); });
  document.querySelectorAll('[data-revision-scope]').forEach(el => el.onchange = () => toggleRevisionScope(Number(el.dataset.revisionScope), el.checked));
  document.querySelector('#apply-revision-request')?.addEventListener('click', applyRevisionRequest);
  document.querySelector('#send-to-review')?.addEventListener('click', sendVersionToReview);
  document.querySelector('#approve-final-proposal')?.addEventListener('click', approveFinalProposal);
  document.querySelector('#redesign-to-contract')?.addEventListener('click', () => redesignToContract().catch(showError));
  document.querySelector('#open-engagement')?.addEventListener('click', () => setState({ activeTool: 'engagement', notice: '', error: '' }));
  document.querySelector('#engagement-view-customer')?.addEventListener('click', () => setEngagementView('customer'));
  document.querySelector('#engagement-view-operator')?.addEventListener('click', () => setEngagementView('operator'));
  document.querySelector('#engagement-open-coaching')?.addEventListener('click', () => setState({ activeTool: 'coaching', notice: '', error: '' }));
  document.querySelectorAll('[data-engagement-client]').forEach(el => el.addEventListener('input', () => { state.engagement.client = makeClient({ ...state.engagement.client, [el.dataset.engagementClient]: el.value }); saveState(); }));
  document.querySelectorAll('[data-engagement-request]').forEach(el => el.addEventListener('input', () => { state.engagement.request = makeNoticeRequest({ ...state.engagement.request, [el.dataset.engagementRequest]: el.value }); saveState(); }));
  document.querySelector('#engagement-save')?.addEventListener('click', saveEngagementRequest);
  // 기관 선택은 기존 신청기관 정보를 그대로 쓴다. 여기서 기관을 새로 만들지 않는다.
  document.querySelector('#engagement-applicant')?.addEventListener('change', event => setState({ selectedApplicantId: event.target.value, notice: event.target.value ? '이 의뢰 건의 신청기관을 연결했습니다.' : '신청기관 연결을 해제했습니다.', error: '' }));
  document.querySelector('#run-precise-review')?.addEventListener('click', () => runPreciseReview((state.preciseReview?.round || 0) + 1));
  document.querySelector('#apply-precise-fixes')?.addEventListener('click', () => applyPreciseFixes());
  document.querySelector('#set-precise-mode')?.addEventListener('click', () => setProposalMode('정밀형'));
  document.querySelector('#set-standard-mode')?.addEventListener('click', () => setProposalMode('표준형'));
  document.querySelector('#design-request')?.addEventListener('click', requestDesignReview);
  document.querySelector('#design-review')?.addEventListener('click', startDesignReview);
  document.querySelector('#design-approve')?.addEventListener('click', approveDesign);
  document.querySelector('#design-reopen')?.addEventListener('click', reopenDesign);
  document.querySelector('#open-engagement-design')?.addEventListener('click', () => setState({ activeTool: 'engagement', notice: '', error: '' }));
  document.querySelector('#open-version-history')?.addEventListener('click', () => document.querySelector('#result-completion')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.querySelectorAll('[data-proposal-detail]').forEach(el => el.onclick = () => setState({ archiveOpenProposal: state.archiveOpenProposal === el.dataset.proposalDetail ? '' : el.dataset.proposalDetail }));
  document.querySelectorAll('[data-view-version]').forEach(el => el.onclick = () => setProposalFlow({ openVersion: proposalFlow().openVersion === Number(el.dataset.viewVersion) ? 0 : Number(el.dataset.viewVersion) }));
  document.querySelectorAll('[data-compare-version]').forEach(el => el.onclick = () => setProposalFlow({ compareVersion: proposalFlow().compareVersion === Number(el.dataset.compareVersion) ? 0 : Number(el.dataset.compareVersion) }));
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
  document.querySelectorAll('[data-design-answer]').forEach(el => el.oninput = () => { const question = el.dataset.designQuestion; if (question) { state.designAnswers[question] = el.value; saveState(); } });
  document.querySelectorAll('[data-reuse-answer]').forEach(el => el.onclick = () => reuseAnswerToApplicant(el.dataset.reuseAnswer));
  document.querySelector('#regenerate-design')?.addEventListener('click', generateCompleteProposal);
  // 사용자는 한 번만 누른다. 남은 항목이 있으면 그 항목부터 이어서 작성한다.
  document.querySelector('#generate-parts')?.addEventListener('click', () => generateProposalParts());
  // 멈춤과 이어쓰기. 멈춰도 끝난 묶음은 지우지 않고, 이어쓰기는 남은 묶음부터 시작한다.
  document.querySelector('#stop-writing')?.addEventListener('click', requestStopWriting);
  // 보완 안내에서 바로 채우러 간다. 새 화면을 만들지 않고 기존 자리로 보낸다.
  document.querySelector('#gap-fill-marks')?.addEventListener('click', () => setState({ markOpen: true, notice: '확인이 필요한 값을 한 화면에서 채웁니다.', error: '' }));
  document.querySelector('#gap-ask-support')?.addEventListener('click', () => setState({ notice: `대행 작업은 ${CONTACT_LABEL}로 연락해 주세요. 필요한 자료 수와 예상 시간은 위 안내에 적어 두었습니다.`, error: '' }));
  document.querySelector('#resume-writing')?.addEventListener('click', () => void generateProposalParts());
  document.querySelector('#generate-proposal')?.addEventListener('click', () => generateFullProposal());
  document.querySelector('#proposal-freeform')?.addEventListener('input', event => { state.projectNarrative = event.target.value; saveState(); });
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
  document.querySelector('#save-proposal-archive')?.addEventListener('click', () => { if (!refusePartial()) archiveCurrentProposal(undefined, true).catch(showError); });
  document.querySelector('#docx')?.addEventListener('click', () => exportDocx(state.project, state.sections).catch(showError));
  document.querySelector('#pdf')?.addEventListener('click', () => downloadProposalPdf());
  // 제출서류에서 내려받는 최종본은 판정을 통과했을 때만 나간다. 출력 방식은 기존과 같다.
  document.querySelector('#package-docx')?.addEventListener('click', () => { if (!refusePartial()) exportFinalPackage('docx'); });
  document.querySelector('#package-pdf')?.addEventListener('click', () => { if (!refusePartial()) exportFinalPackage('pdf'); });
  document.querySelectorAll('[data-open-version]').forEach(el => el.addEventListener('click', () => selectProposalVersion(el.dataset.openVersion)));
  document.querySelectorAll('[data-attachment]').forEach(el => el.addEventListener('change', () => toggleAttachment(el.dataset.attachment)));
  document.querySelectorAll('[data-attachment-file]').forEach(el => el.addEventListener('change', () => linkAttachmentFile(el.dataset.attachmentFile, el.files?.[0])));
  document.querySelectorAll('[data-attachment-clear]').forEach(el => el.addEventListener('click', () => unlinkAttachmentFile(el.dataset.attachmentClear)));
  document.querySelector('#package-zip')?.addEventListener('click', () => exportSubmissionZip());
  document.querySelector('#print')?.addEventListener('click', printDocument);
  // 최종 제출본 카드의 출력 버튼. 상단 도구모음과 같은 현재 본문을 출력한다.
  document.querySelector('#final-docx')?.addEventListener('click', () => exportDocx(state.project, state.sections).catch(showError));
  document.querySelector('#final-pdf')?.addEventListener('click', () => downloadProposalPdf());
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
  // 문제별 선택: 직접 수정 · 확인정보 입력 · 현재 유지. 전체를 다시 쓰지 않는다.
  document.querySelectorAll('[data-coaching-manual]').forEach(el => el.onclick = () => { state.coachingSelection = [Number(el.dataset.coachingManual)]; sendIssuesToWriter(); });
  document.querySelectorAll('[data-coaching-confirm]').forEach(el => el.onclick = () => { updateCoachingStatus(Number(el.dataset.coachingConfirm), '확인필요'); setTimeout(() => { const box = document.querySelector('#result-repair'); box?.scrollIntoView({ behavior: 'smooth', block: 'start' }); box?.querySelector('[data-repair-answer]')?.focus(); }, 80); });
  document.querySelectorAll('[data-coaching-keep]').forEach(el => el.onclick = () => updateCoachingStatus(Number(el.dataset.coachingKeep), '유지'));
  document.querySelectorAll('[data-coaching-revise]').forEach(el => el.onclick = () => requestCoachingRevision(Number(el.dataset.coachingRevise)));
  document.querySelectorAll('[data-coaching-apply]').forEach(el => el.onclick = () => applyCoachingRevision(Number(el.dataset.coachingApply)));
  document.querySelectorAll('[data-coaching-undo]').forEach(el => el.onclick = () => undoCoachingRevision(Number(el.dataset.coachingUndo)));
  document.querySelector('#print-coaching-report')?.addEventListener('click', printCoachingReport);
  document.querySelectorAll('[data-coaching-select]').forEach(el => el.onchange = () => toggleCoachingSelection(Number(el.dataset.coachingSelect), el.checked));
  // 총론·각론 전환. 화면 값만 바꾼다. 검증을 다시 돌리지 않고 이용 횟수도 깎지 않는다.
  document.querySelector('#coaching-detail-toggle')?.addEventListener('click', () => setState({
    reviewDetail: !state.reviewDetail, notice: '', error: ''
  }));
  // 우선 문제부터 수정하기. 각론을 열고 개선 작업판만 펴서 중요도 순으로 보여 준다.
  document.querySelector('#coaching-fix-first')?.addEventListener('click', () => setState({
    reviewDetail: true, reviewPanels: ['work'], reviewFocus: true,
    notice: '중요도가 높은 문제부터 보여 줍니다. 나머지는 「모두 펼치기」로 볼 수 있습니다.', error: ''
  }));
  document.querySelector('#coaching-expand-all')?.addEventListener('click', () => setState({ reviewPanels: ['checks', 'sections', 'evidence', 'matrix', 'references', 'work'], reviewFocus: false }));
  document.querySelector('#coaching-collapse-all')?.addEventListener('click', () => setState({ reviewPanels: [], reviewFocus: false }));
  // 어떤 영역을 폈는지 기억한다. 총론으로 갔다 와도 그대로다.
  document.querySelectorAll('[data-review-panel]').forEach(el => el.addEventListener('toggle', () => {
    const key = el.dataset.reviewPanel;
    const open = new Set(state.reviewPanels || []);
    if (el.open) open.add(key); else open.delete(key);
    state.reviewPanels = [...open];
    saveState();
  }));
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
    navigateToStep(0, { notice: '공고보관함·계획서보관함을 열었습니다. 보관된 공고와 저장한 계획서를 여기서 다시 열 수 있습니다.', error: '' });
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
  // 구역 이동. 가리키는 구역이 없으면 눌러도 아무 일이 없으므로 그 자리에서 드러나게 둔다.
  document.querySelectorAll('[data-home-scroll]').forEach(el => el.onclick = () => {
    const target = document.querySelector(`#${el.dataset.homeScroll}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
  // 기관을 열면 저장해 둔 기본정보를 입력칸에 다시 채운다. 같은 내용을 두 번 적지 않게 한다.
  document.querySelectorAll('[data-edit-applicant]').forEach(el => el.onclick = () => setState({
    activeTool: 'applicants', applicantEditingId: el.dataset.editApplicant, openOrgGroups: [],
    quickOrg: { ...quickDraft(), ...draftFromApplicant(findApplicant(state.applicants, el.dataset.editApplicant)) }, notice: '', error: ''
  }));
  // 필요한 구역만 연다. 다시 그려도 열어 둔 구역이 닫히지 않게 기억한다.
  document.querySelectorAll('[data-detail-group]').forEach(el => el.addEventListener('toggle', () => {
    const key = el.dataset.detailGroup;
    const open = new Set(state.openOrgGroups || []);
    if (el.open) open.add(key); else open.delete(key);
    state.openOrgGroups = [...open];
    saveState();
  }));
  document.querySelector('#open-all-details')?.addEventListener('click', () => setState({ openOrgGroups: [...BASIC_AREAS, ...DETAIL_GROUPS.map(group => group.key)] }));
  document.querySelector('#close-all-details')?.addEventListener('click', () => setState({ openOrgGroups: [] }));
  document.querySelector('#save-basic-info')?.addEventListener('click', () => void saveBasicInfo());
  document.querySelector('#basic-to-writing')?.addEventListener('click', () => void saveBasicInfo({ thenWrite: true }));
  document.querySelectorAll('[data-select-applicant]').forEach(el => el.onclick = () => selectApplicantForProject(el.dataset.selectApplicant));
  // 신청기관 정보가 없어도 계획서 작성을 막지 않는다.
  document.querySelector('#skip-applicant')?.addEventListener('click', () => navigateToStep(3, { applicantSkipped: true, notice: '신청기관 없이 진행합니다. 확인되지 않은 기관 사실은 만들지 않고 [확인 필요]로 남깁니다.', error: '' }));
  document.querySelectorAll('[data-delete-applicant]').forEach(el => el.onclick = () => removeApplicant(el.dataset.deleteApplicant));
  document.querySelector('#save-applicant')?.addEventListener('click', () => persistApplicant(focusedApplicantId(), true));
  document.querySelector('#applicant-name')?.addEventListener('input', event => { updateEditingApplicant(applicant => { applicant.name = event.target.value; }); });
  document.querySelector('#applicant-note')?.addEventListener('input', event => { updateEditingApplicant(applicant => { applicant.note = event.target.value; }); });
  document.querySelectorAll('[data-applicant-field]').forEach(el => el.oninput = () => {
    const [itemId, field] = el.dataset.applicantField.split('|');
    updateEditingApplicant(applicant => { const item = applicant.items.find(value => value.id === itemId); if (item) { item[field] = el.value; item.updatedAt = new Date().toISOString(); } });
    queueApplicantSave();
  });
  document.querySelectorAll('[data-applicant-status]').forEach(el => el.onchange = () => {
    updateEditingApplicant(applicant => { const item = applicant.items.find(value => value.id === el.dataset.applicantStatus); if (item) { item.status = el.value; item.updatedAt = new Date().toISOString(); } });
    queueApplicantSave();
    setState({ applicants: state.applicants, notice: '항목 상태를 변경했습니다. 이 기관 정보에 함께 저장합니다.' });
  });
  document.querySelectorAll('[data-remove-applicant-item]').forEach(el => el.onclick = () => {
    updateEditingApplicant(applicant => { applicant.items = applicant.items.filter(item => item.id !== el.dataset.removeApplicantItem); });
    queueApplicantSave();
    setState({ applicants: state.applicants, notice: '항목을 삭제했습니다.' });
  });
  // 내 정보 → 신청기관. 덮어쓰지 않고 확인 필요 항목으로 넣는다.
  document.querySelector('#pull-profile-info')?.addEventListener('click', () => void pullProfileIntoApplicant());
  // 간단 시작
  document.querySelectorAll('[data-quick-field]').forEach(el => el.oninput = () => { state.quickOrg = { ...quickDraft(), [el.dataset.quickField]: el.value }; });
  document.querySelectorAll('select[data-quick-field]').forEach(el => el.onchange = () => setState({ quickOrg: { ...quickDraft(), [el.dataset.quickField]: el.value } }));
  document.querySelector('#quick-idea')?.addEventListener('input', event => { state.quickOrg = { ...quickDraft(), idea: event.target.value }; });
  document.querySelector('#quick-pick')?.addEventListener('change', event => setState({ selectedApplicantId: event.target.value, applicantEditingId: event.target.value, quickOrg: { ...quickDraft(), ...draftFromApplicant(findApplicant(state.applicants, event.target.value)) }, notice: event.target.value ? '저장해 둔 기관정보를 씁니다.' : '' }));
  document.querySelector('#quick-save')?.addEventListener('click', () => void saveQuickOrg());
  document.querySelector('#quick-draft')?.addEventListener('click', () => void startQuickDraft());
  document.querySelectorAll('[data-followup-field]').forEach(el => el.oninput = () => { state.quickAnswers = { ...(state.quickAnswers || {}), [el.dataset.followupField]: el.value }; });
  // 아이디어 자산은 신청기관 화면을 처음 열 때 한 번만 불러온다.
  if (document.querySelector('#idea-assets') && !state.ideaAssetsLoaded) void loadIdeaAssets();
  // 사업 아이디어·활용자산
  document.querySelectorAll('[data-asset-field]').forEach(el => el.oninput = () => {
    state.assetDraft = { ...(state.assetDraft || emptyAssetDraft()), [el.dataset.assetField]: el.value };
  });
  document.querySelector('#asset-kind')?.addEventListener('change', event => { state.assetDraft = { ...(state.assetDraft || emptyAssetDraft()), kind: event.target.value }; });
  document.querySelector('#asset-status')?.addEventListener('change', event => { state.assetDraft = { ...(state.assetDraft || emptyAssetDraft()), status: event.target.value }; });
  document.querySelector('#asset-save')?.addEventListener('click', () => void submitIdeaAsset());
  document.querySelectorAll('[data-remove-asset]').forEach(el => el.onclick = () => void removeIdeaAsset(el.dataset.removeAsset));
  document.querySelectorAll('[data-asset-status]').forEach(el => el.onchange = () => {
    const found = assetList().find(item => item.id === el.dataset.assetStatus);
    if (found) void saveIdeaAsset({ ...found, status: el.value }).then(result => result.ok && setState({ ideaAssets: result.assets || assetList() }));
  });
  document.querySelectorAll('[data-asset-confirm]').forEach(el => el.onchange = () => {
    const found = assetList().find(item => item.id === el.dataset.assetConfirm);
    if (found) void saveIdeaAsset({ ...found, evidenceConfirmed: el.checked }).then(result => result.ok && setState({ ideaAssets: result.assets || assetList() }));
  });
  // 제안서 작성정보. 답을 적으면 그 항목은 다시 묻지 않는다.
  document.querySelectorAll('[data-intake-field]').forEach(el => el.oninput = () => {
    state.intakeAnswers = { ...(state.intakeAnswers || {}), [el.dataset.intakeField]: el.value };
  });
  document.querySelector('#intake-save')?.addEventListener('click', () => setState({ intakeAnswers: { ...(state.intakeAnswers || {}) }, notice: '작성정보를 저장했습니다. 남은 질문만 다시 보여 드립니다.' }));
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
  // 기관자료 등록·삭제. 자료 등록만으로 기관 정보가 바뀌지 않는다.
  for (const [id, key] of [['source-kind', 'kind'], ['source-name', 'name'], ['source-url', 'url'], ['source-asof', 'asOf']]) document.querySelector('#' + id)?.addEventListener('input', event => { state.applicantSourceDraft = { ...(state.applicantSourceDraft || initial.applicantSourceDraft), [key]: event.target.value }; saveState(); });
  document.querySelector('#source-kind')?.addEventListener('change', event => { state.applicantSourceDraft = { ...(state.applicantSourceDraft || initial.applicantSourceDraft), kind: event.target.value }; saveState(); });
  document.querySelector('#add-applicant-source')?.addEventListener('click', addApplicantSource);
  document.querySelectorAll('[data-remove-source]').forEach(el => el.onclick = () => removeApplicantSource(el.dataset.removeSource));
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

// 기관정보 화면이 지금 다루는 기관. 열어 둔 기관이 없으면 이번 사업 신청기관을 그대로 관리한다.
function focusedApplicantId() {
  return findApplicant(state.applicants, state.applicantEditingId)?.id || findApplicant(state.applicants, state.selectedApplicantId)?.id || '';
}

function updateEditingApplicant(mutate) {
  const applicant = findApplicant(state.applicants, focusedApplicantId());
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
  // 새 기관에는 앞서 열어 둔 기관의 담당자·유형이 따라오지 않는다. 기관명만 물려준다.
  setState({ applicants: state.applicants, applicantNameDraft: '', applicantEditingId: applicant.id, openOrgGroups: [], quickOrg: { orgName: applicant.name }, notice: `${name} 신청기관을 추가했습니다. 기본정보부터 적어 주세요.`, error: '' });
  void persistApplicant(applicant.id, false);
}

function addApplicantItem(areaKey) {
  const draft = state.applicantItemDrafts[areaKey] || {};
  if (!String(draft.label || '').trim()) return setState({ error: '추가할 항목명을 입력해 주세요.' });
  const item = makeApplicantItem({ area: areaKey, label: draft.label, value: draft.value, status: draft.status, source: draft.source });
  updateEditingApplicant(applicant => { applicant.items = [...applicant.items, item]; });
  state.applicantItemDrafts[areaKey] = { label: '', value: '', status: '확인 필요', source: '' };
  // 보관자료에도 바로 저장한다. 다음 계획서에서 다시 쓰려면 이 브라우저 밖에도 남아야 한다.
  void persistApplicant(focusedApplicantId(), false);
  setState({ applicants: state.applicants, applicantItemDrafts: state.applicantItemDrafts, notice: `${areaTitle(areaKey)} 항목을 추가했습니다. 기관정보에 함께 저장했습니다.`, error: '' });
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
  setAiBusy('계획서보관함 계획서를 불러오는 중', { error: '', notice: '' }, 'coachingLoad');
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
    const extraction = extractApplicantCandidates(text, { documentName: proposal.title || '보관된 계획서', includeNarrative: true, sourceLabel: '계획서보관함 계획서' });
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
  // 고른 기관의 기본정보를 입력칸에 그대로 채운다. 계획서마다 같은 것을 다시 적지 않게 한다.
  navigateToStep(2, { selectedApplicantId: applicant.id, applicantComparison: null, applicantSkipped: false, quickOrg: { ...quickDraft(), ...draftFromApplicant(applicant) }, notice: `${applicant.name}의 확인된 정보 ${confirmed}건을 이번 사업에 불러왔습니다.`, error: '' });
}

function removeApplicant(id) {
  const applicant = findApplicant(state.applicants, id);
  if (!applicant) return;
  if (!window.confirm(`${applicant.name} 신청기관 정보를 삭제할까요? 이미 저장된 계획서는 삭제되지 않습니다.`)) return;
  state.applicants = state.applicants.filter(item => item.id !== id);
  setState({ applicants: state.applicants, applicantEditingId: state.applicantEditingId === id ? '' : state.applicantEditingId, selectedApplicantId: state.selectedApplicantId === id ? '' : state.selectedApplicantId, notice: '신청기관 정보를 삭제했습니다.' });
  deleteArchivedApplicant(id).catch(() => setState({ error: '신청기관 정보를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.' }));
}

// 설계도에서 받은 값은 이번 사업 값으로만 저장한다. 신청기관 원본 항목은 건드리지 않는다.
function setBlueprintValue(key, label, value, { silent = false } = {}) {
  const text = String(value || '').trim();
  const rest = (state.projectValues || []).filter(item => item.blueprintKey !== key);
  const next = text ? [...rest, { id: `blueprint-${key}`, blueprintKey: key, label, value: text, applicantItemId: '' }] : rest;
  // 최종본 생성처럼 여러 값을 한 번에 모을 때는 화면을 다시 그리지 않는다.
  if (silent) { state.projectValues = next; saveState(); return; }
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

// 상세정보를 고치면 곧 보관자료에도 저장한다. 글자마다 보내지 않으려고 잠깐 모았다가 한 번 보낸다.
// 이것이 없으면 상세정보가 이 브라우저에만 남아 다음 계획서에서 다시 쓰지 못한다.
let applicantSaveTimer = null;
function queueApplicantSave(delay = 1500) {
  const id = focusedApplicantId();
  if (!id) return;
  if (applicantSaveTimer) clearTimeout(applicantSaveTimer);
  applicantSaveTimer = setTimeout(() => { applicantSaveTimer = null; void persistApplicant(id, false); }, delay);
}

async function persistApplicant(id, announce) {
  const applicant = findApplicant(state.applicants, id);
  if (!applicant) return;
  try {
    await saveArchivedApplicant(applicant);
    if (announce) setState({ notice: `${applicant.name} 신청기관 정보를 저장했습니다.`, error: '' });
  } catch (error) {
    if (announce) setState({ error: `신청기관 정보를 저장하지 못했습니다: ${error.message}` });
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
  setState({ busy: '계획서보관함 계획서를 불러오는 중...', error: '', notice: '' });
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
    setState({ busy: '', coaching: state.coaching, notice: '계획서보관함 계획서를 검증 대상으로 불러왔습니다.' });
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
    // busy를 유지해 검증이 끝날 때까지 같은 경과시간을 계속 보여 준다.
    setState({ busy: '계획서 검증 중', coaching: state.coaching, notice: 'background 검증 작업을 시작했습니다.' });
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
    if (['queued', 'in_progress'].includes(result.status)) state.busy = '계획서 검증 중';
    saveState(); render(); startBusyElapsedTimer();
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
    // 새 검증 결과는 총론부터 보여 준다. 지난번에 펼쳐 둔 각론을 그대로 열지 않는다.
    state.coaching = { ...state.coaching, result, workItems: makeCoachingWorkItems(result), pendingJob: null, version, seriesId, validatedText: state.coaching.text, lastComparison: rounds };
    const id = `${seriesId}-coaching-v${version}`.slice(0, 80);
    state.coaching.currentArchiveId = id;
    await saveArchivedProposal({ id, noticeKey: state.coaching.sourceNoticeKey, title: `${state.coaching.title || '외부 계획서'} · 코칭 v${version}`, stage: `coaching-v${version}`, snapshot: { coaching: structuredClone(state.coaching), parentProposalId: state.coaching.sourceProposalId || '', coachingSeriesId: seriesId } });
    // 검토 회차를 환류 이력에 기록한다. 검증 결과 구조는 그대로 둔다.
    recordReviewRound({ ...result, comparison: rounds ? { resolvedIssues: rounds.resolved } : null });
    setState({ busy: '', coaching: state.coaching, coachingSelection: [], reviewDetail: false, reviewPanels: [], reviewFocus: false, notice: `검증·코칭 v${version} 결과를 계획서보관함에 저장했습니다.${rounds ? ` 해결 ${rounds.resolved.length}건 · 남은 문제 ${rounds.remaining.length}건 · 새 문제 ${rounds.added.length}건` : ''}` });
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
  if (!['미수정', '수정중', '해결', '확인필요', '유지'].includes(status) || !state.coaching.workItems[index]) return;
  state.coaching.workItems[index].status = status;
  setState({ coaching: state.coaching, notice: '개선 항목 상태를 저장했습니다.' });
  void persistCoachingWorkboard();
}

// 수정안 요청은 문제가 가리키는 항목만 보낸다. 계획서 전체를 보내면 요청이 커져 실패한다.
function revisionScopeText(issue) {
  const full = state.coaching.text || '';
  const blocks = sectionsFromProposalText(full);
  const matched = matchSectionsForIssue(blocks, issue);
  const picked = (matched.length ? matched : blocks.filter(block => String(issue.location || '').includes(block.title))).slice(0, 2);
  const text = picked.map(block => `${block.title}\n${block.content}`).join('\n\n').trim();
  return text.length >= 40 && text.length < full.length ? text : full.slice(0, 12_000);
}
async function requestCoachingRevision(index) {
  const issue = state.coaching.result?.issues?.[index];
  if (!issue || !state.coaching.text.trim()) return;
  setAiBusy('선택한 문제의 수정안만 작성하는 중...', { error: '', notice: '' }, 'coachingRevision');
  try {
    const response = await fetch('/api/proposal-coaching', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': getArchiveRecoveryKey() }, body: JSON.stringify({ action: 'reviseIssue', title: state.coaching.title, proposalText: revisionScopeText(issue), criteriaText: state.coaching.criteriaText, issue }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `항목 수정안 요청 실패 (${response.status})`);
    state.coaching.workItems[index] = { ...state.coaching.workItems[index], status: result.requiresConfirmation ? '확인필요' : '수정중', revision: result, applied: false };
    setState({ busy: '', coaching: state.coaching, notice: '선택한 문제의 AI 수정안을 만들었습니다. 비교 후 적용하세요.' });
    void persistCoachingWorkboard();
  } catch (error) {
    // 수정안이 규칙에 걸려 실패해도 다른 길이 있다는 것을 알려 준다.
    setState({ busy: '', error: `${error.message} 「직접 수정」으로 계획서 쓰기에 보내거나 「확인정보 입력」으로 값을 채운 뒤 다시 시도할 수 있습니다.` });
  }
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
      busy: '', noticeLogic: { structure, logic, requirements, summary, files, conflicts, contract: buildNoticeContract({ structure, notice }) },
      notice: `자료묶음 ${files.length}건 중 ${summary.bundle.read}건을 읽었습니다${elapsedLabel()}. 공식 근거 확인 ${summary.confirmedFields}/${structure.fields.length} · 확정 선정요건 ${summary.officialRequirements}개${summary.bundle.conversionNeeded ? ` · 변환 필요 ${summary.bundle.conversionNeeded}건` : ''}`,
      error: ''
    });
  } catch (error) { setState({ busy: '', error: error.message }); }
}

// 공고에서 선정 논리를 구조화한다. AI 호출 없이 공고 원문만 사용한다.
function ensureNoticeLogic() {
  if (state.noticeLogic?.structure) return state.noticeLogic;
  const notice = noticeSourceOrPasted();
  if (!notice) return null;
  const structure = analyzeNoticeStructure(notice);
  if (!structure.totalChars) return null;
  const logic = buildSelectionLogic(structure);
  const requirements = selectionRequirements(structure);
  state.noticeLogic = { structure, logic, requirements, summary: noticeLogicSummary(structure, logic, requirements), contract: buildNoticeContract({ structure, notice }) };
  return state.noticeLogic;
}
function manualCriteriaText() {
  return state.manualSources
    .filter(item => ['세부 공고문', '심사·평가기준', '예산 편성 기준'].includes(item.sourceType) && item.extractionStatus === 'success')
    .map(item => item.extractedText)
    .join('\n\n');
}
function analyzeNoticeSelectionLogic() {
  const notice = noticeLogicSource();
  if (!notice) return setState({ error: '분석할 공고를 먼저 선택해 주세요.' });
  const structure = analyzeNoticeStructure(notice);
  if (!structure.totalChars) return setState({ error: '공고에서 읽을 원문이 없습니다. 공고문을 직접 자료로 추가해 주세요.' });
  const logic = buildSelectionLogic(structure);
  const requirements = selectionRequirements(structure);
  setState({
    noticeLogic: { structure, logic, requirements, summary: noticeLogicSummary(structure, logic, requirements), contract: buildNoticeContract({ structure, notice }) },
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
    recordProposalVersion({ sections: state.sections, label: '외부 원본', source: EXTERNAL_SOURCE, originalText: state.coaching.text }, { reset: true });
    if (!state.project.title) state.project.title = state.coaching.title || '검증 대상 계획서';
  } else if (!(state.proposalVersions || []).length) {
    recordProposalVersion({ sections: state.sections, label: '수정 전 원본' });
  }

  const revision = buildStructuralRevision(state.sections, findings);
  if (!revision.changedSectionIds.length) return setState({ error: '수정할 위치를 찾지 못했습니다. 대상 항목을 직접 지정해 주세요.' });
  state.sections = revision.sections;
  recordProposalVersion({ sections: state.sections, label: '구조 분석 반영 수정본', source: '계획서 검증·코칭' });
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
    recordProposalVersion({ sections: state.sections, label: '외부 원본', source: EXTERNAL_SOURCE, originalText: state.coaching.text }, { reset: true });
    if (!state.project.title) state.project.title = state.coaching.title || '검증 대상 계획서';
  } else if (!(state.proposalVersions || []).length) {
    recordProposalVersion({ sections: state.sections, label: '수정 전 원본' });
  }

  const answers = Object.fromEntries(Object.entries(state.coaching.repairAnswers || {}).filter(([, value]) => String(value).trim()));
  const run = applyRepairPlans(state.sections, plans, { confirmations: answers });
  if (!run.applied.length) {
    return setState({ coaching: state.coaching, error: '', notice: `수정한 문단이 없습니다. 확인 필요 ${run.questions.length}건에 답을 입력하면 해당 문제만 수정합니다.${run.blocked.length ? ` 근거 부족으로 보류한 문제 ${run.blocked.length}건이 있습니다.` : ''}` });
  }
  state.sections = run.sections;
  recordProposalVersion({ sections: state.sections, label: '수정계획 반영 수정본', source: '계획서 검증·코칭' });
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
  if (!(state.proposalVersions || []).length) recordProposalVersion({ sections: state.sections, label: '최초 작성', source: '계획서 쓰기', verdict: plan.verdict.verdict });
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
  recordProposalVersion({ sections: state.sections, label, source: '계획서 쓰기', verdict: plan?.verdict.verdict || '' });
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
    recordProposalVersion({ sections: state.sections, label: '되돌리기 전 작업본', source: '계획서 쓰기' });
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
  } catch (error) { setState({ error: `개선 작업판을 계획서보관함에 저장하지 못했습니다: ${error.message}` }); }
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
      // 올린 문서가 무엇인지 내용으로 정한다. 사용자가 고른 값은 그대로 두고, 애매하면 애매하다고 적는다.
      const guess = classifyDocument(file.name, parsed.text);
      const picked = state.manualSourceTypeTouched ? state.manualSourceType : guess.kind;
      const record = manualSourceRecord(file.name, picked, parsed.text, 'success', '');
      additions.push({ ...record, autoKind: guess.kind, autoConfidence: guess.confidence, autoReason: guess.reason });
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
    // 목록이 정상으로 확인된 뒤에만 보관함에 반영한다. 실패한 수집으로 보관 자료를 덮어쓰지 않는다.
    let archiveMessage = '';
    if (result.syncable) {
      try { const archived = await syncArchivedNotices(notices); archiveMessage = ` 공고보관함 신규 ${archived.inserted}건·변경 ${archived.updated}건·동일 ${archived.unchanged}건입니다.`; }
      catch { archiveMessage = ' 공고 목록은 표시하지만 공고보관함 저장에는 실패했습니다.'; }
    } else if (notices.length) {
      archiveMessage = ' 일부 출처를 확인하지 못해 공고보관함에는 반영하지 않았습니다.';
    }
    const elapsed = elapsedLabel();
    // 「진행 중 공고가 없다」와 「사이트 연결 방식이 바뀌어 못 가져왔다」를 다르게 안내한다.
    const headline = result.empty
      ? `현재 진행 중인 공고가 없습니다${elapsed}. 공식 사이트 목록은 정상으로 확인했습니다.`
      : `공고 ${notices.length}건을 불러왔습니다${elapsed}.${archiveMessage}`;
    const failedLabels = (result.sources || []).filter(source => source.status !== 'ok');
    const warning = failedLabels.length
      ? `${failedLabels.map(source => source.label).join('·')} 공고를 가져오지 못했습니다. ${failedLabels[0].reason}`
      : '';
    const patch = { busy: '', noticeResults: notices, noticeSources: result.sources || [], selectedNoticeIndexes: [], pendingNoticeChoice: null, notice: headline, error: warning };
    // 가져온 공고가 없으면 빈 확인 화면으로 넘기지 않고 이 화면에 결과만 알린다.
    if (notices.length) navigateToStep(1, patch); else setState(patch);
  } catch (error) { setState({ busy: '', error: `${error.message}${elapsedLabel()}` }); }
}

async function searchNoticeArchive() {
  setAiBusy('공고보관함에서 과거 공고를 검색하는 중', { error: '', notice: '' }, 'archiveSearch');
  try {
    const result = await searchArchivedNotices(state.archiveFilters);
    setState({ busy: '', archiveNotices: result.notices || [], notice: `공고보관함(D1)에 보관된 공고 ${result.notices?.length || 0}건을 찾았습니다${elapsedLabel()}.` });
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
  if (!notice) return setState({ error: '보관된 공고를 찾지 못했습니다. 공고보관함을 다시 불러와 주세요.' });
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
    setState({ notice: '계획서보관함 복구키를 복사했습니다. 안전한 비밀번호 관리도구에 보관하세요.', error: '' });
  } catch { setState({ error: '복구키를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.' }); }
}

async function applyArchiveRecoveryKey() {
  const value = state.archiveKeyDraft.trim();
  if (!value) return setState({ error: '기존 계획서보관함 복구키를 입력해 주세요.' });
  if (!window.confirm('이 기기의 계획서보관함 연결을 입력한 복구키로 변경할까요? 현재 D1 자료는 삭제되지 않습니다.')) return;
  try {
    useArchiveRecoveryKey(value);
    archiveLoaded = true;
    state.archiveProposalId = '';
    state.archiveKeyDraft = '';
    setState({ busy: '기존 계획서보관함을 연결하는 중...', archiveNotices: [], archiveProposals: [], error: '', notice: '' });
    const [noticeResult, proposalResult] = await Promise.all([searchArchivedNotices({}), listArchivedProposals()]);
    setState({ busy: '', archiveNotices: noticeResult.notices || [], archiveProposals: proposalResult.proposals || [], notice: '기존 계획서보관함을 이 기기에 연결했습니다.' });
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
  navigateToStep(1, { noticeResults, expertDetail: true, activeTool: '', notice: '공고보관함(D1)에 보관된 공고를 이번 작업 임시 목록에 열었습니다. 공고보관함 원본은 그대로 남습니다.' });
}

async function viewArchivedNotice(index) {
  const notice = state.archiveNotices[index];
  if (!notice) return;
  let noticeIndex = state.noticeResults.findIndex(item => archiveNoticeKey(item) === archiveNoticeKey(notice));
  if (noticeIndex < 0) { state.noticeResults = [...state.noticeResults, notice]; noticeIndex = state.noticeResults.length - 1; }
  // 보관함 화면을 닫고 실제 단계 화면으로 옮긴다. 열어 놓은 보관함이 위에 남아 있으면 아무 일도 없어 보인다.
  navigateToStep(1, { noticeResults: state.noticeResults, activeTool: '', expertDetail: true, notice: '보관된 공고의 상세 내용을 확인합니다.' });
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
  // 간편 화면을 쓰는 회원은 공고를 고른 뒤 제자리로 돌아온다. 고른 공고와 본문은 그대로 남는다.
  setState({ busy: '', pendingNoticeChoice: null, expertDetail: false, activeTool: '', notice: '선택한 공고 본문을 사업계획서 입력으로 가져왔습니다.' });
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

// PDF는 파일로 내려받는다. 인쇄 창은 팝업 차단에 걸리면 아무 일도 일어나지 않는다.
// 한글 글꼴을 넣어 만든 실제 PDF이며, 만들다 실패하면 빈 파일을 내려받지 않고 이유를 알린다.
// 올린 신청서 서식에 맞춰 내려받는다.
// 서식이 정한 항목 이름·순서·표에 우리가 쓴 내용을 넣는다. 없는 값은 지어내지 않고 [확인 필요]로 남긴다.
function currentFormLayout() {
  const spec = currentFormSpec();
  if (!spec) return { ok: false, reason: '먼저 신청서 서식 파일을 올려 주세요. 공고 준비 화면에서 올릴 수 있습니다.' };
  const plan = buildDocumentPlan(currentNoticeContract(), spec);
  return fillFormLayout({ plan, sections: state.sections, tables: state.proposalTables || [] });
}

async function downloadFormFilled() {
  if (!state.sections.length) return setState({ error: '먼저 계획서를 만들어 주세요.' });
  const laid = currentFormLayout();
  if (!laid.ok) return setState({ error: laid.reason });
  setState({ busy: '올린 서식에 맞춰 배치하는 중...', error: '', notice: '' });
  try {
    await exportDocx(state.project, laid.sections, { tables: laid.tables, suffix: '서식대로' });
    setState({ busy: '', notice: `올린 서식대로 받았습니다. ${fillSummary(laid)}` });
  } catch (error) {
    setState({ busy: '', error: `서식대로 만들지 못했습니다. ${String(error?.message || '').slice(0, 60)}` });
  }
}

// 한글 파일로 내보내기. 한글 2014 이상에서 열린다.
// 표는 칸을 나눈 글줄로 들어간다. 표 서식 그대로가 필요하면 DOCX·PDF를 쓴다.
function downloadProposalHwpx() {
  if (!state.sections.length) return setState({ error: '먼저 계획서를 만들어 주세요.' });
  try {
    const blob = buildHwpxBlob({ project: state.project, sections: reviewSections(), tables: state.proposalTables || [] });
    downloadBlob(blob, `${String(state.project.title || '사업계획서').replace(/[\/:*?"<>|]/g, ' ').trim().slice(0, 80)}_검토용.hwpx`);
    setState({ notice: '한글 파일(HWPX)을 내려받았습니다. 한글 2014 이상에서 열립니다. 표 서식이 그대로 필요하면 DOCX를 쓰세요.', error: '' });
  } catch (error) {
    setState({ error: `한글 파일을 만들지 못했습니다. ${String(error?.message || '').slice(0, 60)}` });
  }
}

async function downloadProposalPdf() {
  if (!state.sections.length) return setState({ error: 'PDF로 출력할 내용이 없습니다. 계획서를 먼저 작성해 주세요.' });
  setState({ busy: 'PDF를 만드는 중...', error: '', notice: '' });
  try {
    await exportProposalPdf({
      project: state.project, sections: reviewSections(),
      tables: state.proposalTables || [], pageBreaks: state.stagedGeneration?.pageBreaks || [],
      fileName: `${state.project.title || '사업계획서'}_검토용.pdf`
    });
    setState({ busy: '', notice: 'PDF를 내려받았습니다.' });
  } catch (error) {
    setState({ busy: '', error: String(error?.message || 'PDF를 만들지 못했습니다.') });
  }
}


// 간편 화면 처리기. 기존 처리기(bind)를 먼저 걸고 그 위에 얹는다.
// 에이전트 본인의 자격·남은 편수. 화면에 그대로 적는다.
async function loadAgencyMe() {
  if (!isAgency()) return;
  try { setAuth({ agencyMe: await agencyMe() }); }
  catch { setAuth({ agencyMe: { has: false, unavailable: true } }); }
}
function isAgency() { return auth.status === 'signedIn' && auth.user?.role === 'agency'; }
// 대행 업무 화면인지. 자격이 살아 있을 때만 켜진다.
function inAgencyWorkspace() { return isAgency() && state.workspace === 'agency' && auth.agencyMe?.active === true; }

// 남은 편수와 갱신일. 값이 없으면 「읽는 중」이라고만 적는다.
function agencyQuotaBar() {
  if (!isAgency()) return '';
  const me = auth.agencyMe;
  if (!me) return '<div class="view-mode-bar"><span class="view-mode-tag">에이전트</span><strong>한도를 읽는 중</strong></div>';
  if (!me.has) return '';
  const left = me.remaining || {};
  const label = me.active
    ? `남은 계획서 ${left.plans}편 · 남은 진단 ${left.diagnoses}회 · ${escapeHtml(left.renewsOn || '')} 갱신`
    : escapeHtml(me.reason || '대행 업무를 쓸 수 없습니다.');
  return `<div class="view-mode-bar"><span class="view-mode-tag">${state.workspace === 'agency' ? '대행 업무' : '개인 작업공간'}</span>
    <strong>${label}</strong>
    ${me.active ? `<button class="button secondary" id="toggle-workspace">${state.workspace === 'agency' ? '개인 작업공간으로' : '대행 업무로'}</button>` : ''}</div>`;
}

function bindSimple() {
  // 보기 전환과 「작성 과정 자세히 보기」는 bind()에서 한 번만 연결한다. 두 번 걸면 서로 되돌린다.
  document.querySelector('#simple-find')?.addEventListener('click', () => setState({ expertDetail: true, activeTool: '', step: 0, notice: '공고를 고르면 분석은 자동으로 합니다. 고르면 간편 화면으로 돌아옵니다.' }));
  document.querySelector('#simple-change-notice')?.addEventListener('click', () => setState({ expertDetail: true, activeTool: '', step: 0, notice: '' }));
  document.querySelector('#simple-idea')?.addEventListener('input', event => { state.projectNarrative = event.target.value; });
  // 입력이 끝나면 저장까지 한다. 저장하지 않으면 새로고침에 한 줄 요청이 사라진다.
  document.querySelector('#simple-idea')?.addEventListener('change', event => setState({ projectNarrative: event.target.value }));
  document.querySelector('#simple-org-pick')?.addEventListener('change', event => setState({
    selectedApplicantId: event.target.value, applicantEditingId: event.target.value,
    // 고른 기관의 기본정보를 입력칸에 그대로 채운다. 같은 것을 다시 적지 않게 한다.
    quickOrg: { ...quickDraft(), ...draftFromApplicant(findApplicant(state.applicants, event.target.value)) },
    notice: event.target.value ? '저장해 둔 기관정보를 씁니다.' : ''
  }));
  document.querySelector('#simple-generate')?.addEventListener('click', () => void runSimpleGeneration());
  document.querySelector('#run-final-confirm')?.addEventListener('click', () => {
    if (!state.sections.length) return setState({ error: '먼저 계획서를 만들어 주세요.' });
    const open = openMarkCount();
    // 설계 확인 절차를 없애지 않는다. 한 번 누른 것으로 요청·검토·승인을 함께 기록한다.
    requestDesignReview();
    startDesignReview();
    approveDesign({ silent: true });
    setState({
      notice: open
        ? `이 판을 제출본으로 확정했습니다. 확인 필요 ${open}곳은 표시가 남습니다.`
        : '이 판을 제출본으로 확정했습니다. 확인 필요 표시가 없습니다.',
      error: ''
    });
    if (state.archiveProposalId) void archiveCurrentProposal('final').catch(() => {});
  });
  document.querySelector('#undo-final-confirm')?.addEventListener('click', () => {
    setDesignApproval({ approvedAt: '', approvedBy: '', reviewStartedAt: '', requestedAt: '' }, '확정을 풀었습니다. 계속 고칠 수 있습니다.');
  });
  document.querySelectorAll('[data-mark-key]').forEach(el => el.onchange = () => {
    state.markDraft = { ...(state.markDraft || {}), [el.dataset.markKey]: el.value };
  });
  document.querySelector('#apply-marks')?.addEventListener('click', () => {
    const result = applyOpenMarks(state.sections, state.markDraft || {});
    if (!result.filled) return setState({ error: '채운 값이 없습니다. 아는 값을 한 곳이라도 적어 주세요.', markOpen: true });
    state.sections = result.sections;
    setState({
      sections: state.sections, markDraft: {}, markOpen: result.left > 0, error: '',
      notice: `${result.filled}곳을 채웠습니다. 남은 확인 필요 ${result.left}곳${result.left ? '' : ' · 이제 제출본을 만들 수 있습니다'}.`
    });
    if (state.archiveProposalId) void archiveCurrentProposal().catch(() => {});
  });
  document.querySelector('#simple-view')?.addEventListener('click', () => setState({ expertDetail: true, activeTool: '', step: 4, notice: '작성한 계획서를 펼쳤습니다.' }));
  document.querySelector('#simple-expert')?.addEventListener('click', () => setState({ expertDetail: true, activeTool: 'coaching', notice: '' }));
  document.querySelector('#simple-revise')?.addEventListener('click', () => setState({ reviseOpen: true, reviseDraft: state.reviseDraft || { kind: 'add', text: '' } }));
  document.querySelector('#revise-cancel')?.addEventListener('click', () => setState({ reviseOpen: false }));
  document.querySelectorAll('[data-revise-kind]').forEach(el => el.onclick = () => setState({ reviseDraft: { ...(state.reviseDraft || {}), kind: el.dataset.reviseKind } }));
  document.querySelector('#revise-text')?.addEventListener('input', event => { state.reviseDraft = { ...(state.reviseDraft || { kind: 'add' }), text: event.target.value }; });
  document.querySelector('#revise-run')?.addEventListener('click', () => void runRevision());
  document.querySelector('#revise-undo')?.addEventListener('click', () => undoRevision());
  document.querySelectorAll('[data-answer-choice]').forEach(el => el.onclick = () => {
    // 「모르겠다」를 골라도 작성은 멈추지 않는다. 값을 만들지 않고 표시만 남긴다.
    const picked = answerValue(el.dataset.answerChoice, suggestionFor(el.dataset.answerKey));
    state.quickAnswers = { ...(state.quickAnswers || {}), [el.dataset.answerKey]: picked.value || picked.mark };
    setState({ quickAnswers: state.quickAnswers, notice: picked.value ? '추천값을 넣었습니다. 확인 전에는 [확인 필요]로 표시됩니다.' : '[확인 필요]로 남겼습니다.' });
  });
}

// 추천값은 공고문에 실제로 적힌 말에서만 가져온다. 없으면 빈 값이다.
function suggestionFor(key) {
  const notice = state.selectedNotice || {};
  const map = { budget: notice.supportLimit || '', staff: '', performance: '', partners: '', facilities: '' };
  return map[key] || '';
}

// 간편 화면의 「AI가 계획서 만들기」. 안에서는 기존 절차를 그대로 밟는다.
// 지금 AI가 돌고 있으면 다시 부르지 않는다. 눌린 것은 알려 준다.
function aiBusy(what = '이미 만들고 있습니다') {
  if (!state.busy) return false;
  setState({ notice: `${what}. 끝나면 결과가 화면에 나옵니다.`, error: '' });
  return true;
}

// 진행 중이던 설계가 있으면 스스로 이어받는다. 사람이 다시 누를 필요도, 다시 결제할 일도 없다.
let resumeTried = false;
async function resumeDesignJob() {
  if (resumeTried || state.busy) return;
  const jobs = state.designJobs || {};
  if (!Object.keys(jobs).length || state.stagedGeneration?.master) return;
  resumeTried = true;
  setAiBusy('진행 중이던 설계 결과를 이어받는 중...', { error: '', notice: '' }, 'master');
  await generateCompleteProposal().catch(() => setState({ busy: '' }));
}

// 이 계획서의 AI 작업 기록을 한 번만 불러온다. AI를 부르지 않는 조회다.
async function loadAiJobs() {
  const id = state.archiveProposalId || '';
  if (!id || state.aiJobs?.loadedFor === id) return;
  state.aiJobs = { ...(state.aiJobs || {}), loadedFor: id };
  const result = await proposalJobs(id).catch(() => null);
  if (!result?.jobs) return;
  setState({ aiJobs: { list: result.jobs, loadedFor: id } });
}

async function runSimpleGeneration() {
  if (aiBusy('이미 계획서를 만들고 있습니다')) return;
  if (!state.selectedNotice?.title && !state.sourceText.trim()) {
    return setState({ error: '먼저 공고를 고르거나 공고문을 붙여넣어 주세요.' });
  }
  // 기관정보가 아직 없으면 적은 것만이라도 저장한다. 없다고 막지 않는다.
  if (!state.selectedApplicantId && readyToDraft(quickDraft()).ready) await saveQuickOrg();
  // 설계 기록은 그대로 남긴다. 사용자가 누를 필요는 없고, 뒤 단계가 승인된 설계안을 그대로 쓴다.
  // 이 기록이 없으면 본문 작성이 「승인된 설계안을 찾지 못했습니다」로 멈춘다.
  if (!state.engagement?.design?.approvedAt) {
    requestDesignReview();
    startDesignReview();
    // 간편 화면에서는 되묻지 않는다. 부족한 값은 [확인 필요]로 남는다.
    approveDesign({ silent: true });
  }
  await generateCompleteProposal();
  // 설계만 만들고 멈추면 회원 눈에는 아무 일도 안 일어난 것으로 보인다.
  // 버튼 하나로 끝나야 하므로 남은 본문까지 이어서 만든다.
  if (state.stagedGeneration?.master && !state.sections.length) await generateProposalParts();
}

// 한 번에 수정 요청. 요청한 곳만 고치고 나머지는 그대로 둔다.
async function runRevision() {
  if (aiBusy('이미 수정하고 있습니다')) return;
  const draft = state.reviseDraft || { kind: 'add', text: '' };
  const gate = canRevise({ kind: draft.kind, text: draft.text, history: state.revisions || [] });
  if (!gate.allowed) return setState({ error: `${gate.message} (${gate.action})` });
  if (!String(draft.text || '').trim()) return setState({ error: '어떻게 바꿀지 한 줄이라도 적어 주세요.' });

  const before = structuredClone(state.sections);
  const facts = confirmedFactsForRevision();
  setAiBusy('요청한 곳만 고치는 중...', { error: '', notice: '' });
  let ok = false;
  try {
    const kindLabel = REVISION_KINDS.find(item => item.key === draft.kind)?.label || '수정';
    // 기존 부분수정 경로를 그대로 쓴다. 요청과 확인된 사실을 기준에 함께 넣어
    // 요청한 곳만 고치고 확인된 사실은 건드리지 않게 한다.
    const basis = {
      ...preciseBasis(),
      revision: { kind: draft.kind, label: kindLabel, request: String(draft.text).slice(0, 1000) },
      keepFacts: facts,
      rule: '요청한 부분만 고칩니다. 요청하지 않은 항목과 확인된 사실은 그대로 둡니다. 근거 없는 수치·실적·기관은 만들지 말고 [확인 필요]로 남깁니다.'
    };
    const result = await patchSectionsWithAI({ basis, sections: state.sections });
    const patched = Array.isArray(result?.sections) ? result.sections : [];
    if (!patched.length) throw new Error('수정된 내용이 없습니다.');
    const byId = new Map(patched.map(item => [item.id, item]));
    state.sections = state.sections.map(section => (byId.has(section.id) ? { ...section, ...byId.get(section.id) } : section));
    ok = true;
  } catch (error) {
    // 실패는 회원 잘못이 아니다. 횟수를 깎지 않는다.
    const entry = settleRevision({ slot: revisionSlot(draft.kind), ok: false });
    state.revisions = [...(state.revisions || []), entry];
    return setState({ busy: '', revisions: state.revisions, error: `수정하지 못했습니다. 남은 횟수는 그대로입니다. (${String(error?.message || '').slice(0, 60)})` });
  }

  const diff = diffSections(before, state.sections);
  const saved = Boolean(state.archiveProposalId);
  const entry = {
    ...settleRevision({ slot: gate.slot, ok, saved, changedSections: diff.changed.length }),
    diff, newUnknowns: newUnknowns(before, state.sections), lostFacts: keptFacts(facts, state.sections).lost, at: new Date().toISOString()
  };
  state.revisions = [...(state.revisions || []), entry];
  state.revisionBackup = before;
  const left = remainingOf(state.revisions);
  setState({
    busy: '', revisions: state.revisions, revisionBackup: state.revisionBackup,
    notice: `바뀐 항목 ${diff.changed.length}개 · 그대로 둔 항목 ${diff.kept.length}개 · 새로 확인할 내용 ${entry.newUnknowns}곳 · 남은 수정 ${left.total}회${entry.counted ? '' : ` (이번 요청은 세지 않았습니다: ${entry.note})`}`
  });
  if (state.archiveProposalId) await archiveCurrentProposal().catch(() => {});
}

// 수정 전 버전으로 되돌린다. 되돌리기는 횟수를 다시 채우지 않는다(이미 만들어진 결과가 있었으므로).
function undoRevision() {
  if (!state.revisionBackup) return setState({ error: '되돌릴 수정 전 버전이 없습니다.' });
  state.sections = structuredClone(state.revisionBackup);
  state.revisionBackup = null;
  setState({ sections: state.sections, revisionBackup: null, notice: '수정 전 내용으로 되돌렸습니다.' });
}

// 확인된 사실 목록. 수정본이 이것을 지웠는지 확인하는 데 쓴다.
function confirmedFactsForRevision() {
  const applicant = findApplicant(state.applicants, state.selectedApplicantId);
  return (applicant?.items || []).filter(item => item.status === CONFIRMED_STATUS).map(item => item.value).filter(Boolean).slice(0, 20);
}

async function createDraft() {
  await generateCompleteProposal();
}

// 「AI가 먼저 작성하기」. 간단 입력 다섯 가지에서 곧바로 초안까지 간다.
// 기관정보를 저장하고, 하고 싶은 사업을 자유입력으로 넘긴 뒤, 사업 설계 단계로 데려간다.
// 적지 않은 인력·시설·실적·예산은 여기서도 만들지 않는다. [확인 필요]로 남는다.
async function startQuickDraft() {
  const check = readyToDraft(quickDraft());
  if (!check.ready) return setState({ notice: `${check.missing.join(' · ')}를 먼저 적어 주세요. 나머지는 나중에 물어봅니다.` });
  await saveQuickOrg();
  const idea = String(quickDraft().idea || '').trim();
  // 자유입력 칸은 사업 설계가 이미 쓰고 있다. 같은 곳에 넣어 흐름을 잇는다.
  setState({
    projectNarrative: idea ? `${idea}\n\n${state.projectNarrative || ''}`.trim() : state.projectNarrative,
    activeTool: '', step: 3,
    notice: '기관정보를 저장했습니다. 이어서 사업 설계를 확인하고 초안을 만듭니다.'
  });
}

async function rewriteSection(index) {
  const instruction = window.prompt('어떻게 수정할까요? 사실이나 수치를 새로 만들도록 요청할 수 없습니다.', '더 명확하고 간결하게 작성');
  if (!instruction) return;
  setAiBusy('선택한 항목을 근거 범위 안에서 재작성하는 중...', { error: '' }, 'rewrite');
  try { const result = await rewriteWithAI({ section: state.sections[index], instruction, analysis: analysisForRewrite(), organization: organizationForGeneration() }); state.sections[index] = result.section; setState({ busy: '', notice: '항목을 재작성했습니다.' }); }
  catch (error) { setState({ busy: '', error: error.message }); }
}
function showError(error) {
  // 세션이 끊기면 화면만 남겨 두지 않고 로그인 화면으로 되돌린다.
  if (String(error?.message || '').includes(UNAUTHORIZED)) return signOutLocally('로그인이 필요합니다. 다시 로그인해 주세요.');
  setState({ error: error.message });
}

async function generateCompleteProposal() {
  if (aiBusy('이미 계획서를 만들고 있습니다')) return;
  const manualLength = state.manualSources.filter(value => value.extractionStatus === 'success').reduce((sum, value) => sum + value.extractedText.length, 0);
  if (state.sourceText.trim().length + manualLength < 30) return setState({ error: '사업계획서를 작성할 공식 또는 직접 자료를 30자 이상 입력해 주세요.' });
  if (state.sourceText.length > 180000 || state.sourceText.length + manualLength > 220000) return setState({ error: '생성 입력 자료가 허용 길이를 초과했습니다. 자료를 나누거나 불필요한 내용을 줄여 주세요.' });
  setAiBusy('공고문을 분석하고 마스터 설계를 작성하는 중...', { error: '', notice: '', sections: [], assemblyCheck: null, stagedGeneration: structuredClone(initial.stagedGeneration) }, 'master');
  const designStartedAt = Date.now();
  ensureNoticeLogic();
  const completePayload = generationPayload();
  try {
    // 설계는 background로 돌아간다. 기다리는 동안 몇 초가 지났는지 화면에 이어서 보여 준다.
    const stepAt = {};
    const result = await masterWithAI(completePayload, (seconds, info = {}) => {
      if (!state.busy) return;
      // 오래 걸려도 잃지 않는다. 작업번호를 저장해 두었으니 창을 닫아도 다시 받을 수 있다.
      const keep = info.keepGoing ? ' · 창을 닫아도 됩니다. 다시 들어오면 이어서 받습니다' : '';
      setState({ busy: `공고문을 분석하고 마스터 설계를 작성하는 중... (${aiTaskLabel(seconds)} 경과)${keep}` });
    }, {
      // 배경으로 넘어간 걸음의 작업번호를 남긴다. 다시 눌러도 새로 만들지 않고 그 결과를 받는다.
      resume: state.designJobs || {},
      onJob: (action, job) => { state.designJobs = { ...(state.designJobs || {}), [action]: job }; saveState(); },
      onStep: step => { stepAt[step] = Date.now(); }
    });
    // 걸음이 끝났으니 이어받을 작업번호는 지운다.
    state.designJobs = {};
    state.sponsorIntent = result.sponsorIntent;
    state.projectDesign = result.projectDesign;
    state.missingInformation = applyApplicantAnswers((result.missingInformation || []).slice(0, 5));
    state.evidenceMap = result.evidenceMap || [];
    state.qualityCheck = result.qualityCheck;
    state.analysis = engineAnalysis(result);
    state.sections = [];
    // 한 번에 얼마나 쓸지 정한다. 항목·순서·문구는 그대로 두고 묶음 경계만 목표 분량으로 다시 잡는다.
    // 너무 작은 묶음은 합쳐 호출을 줄이고, 너무 큰 묶음은 쪼개 결과가 안 나오는 일을 막는다.
    const outline = buildDocumentPlan(currentNoticeContract(), currentFormSpec()).outline;
    const balanced = rebalanceGroups(result.sectionPlan, outline);
    const balance = balanced.changed
      ? { ...balanceSummary(result.sectionPlan, balanced.groups, outline), reason: balanced.reason }
      : null;
    if (balanced.changed) result.sectionPlan = balanced.groups;
    // 설계 요약이 화면에 처음 나오는 시각을 그대로 남긴다. 나중에 지어내지 않는다.
    state.stagedGeneration = {
      balance,
      phase: 'master-ready', master: result, parts: [], completedGroupIds: [], continuitySummary: null,
      timeline: [
        { kind: 'design', title: '설계 뼈대', at: new Date(stepAt.design || Date.now()).toISOString(), ms: (stepAt.design || Date.now()) - designStartedAt },
        { kind: 'design', title: '논리·목차', at: new Date().toISOString(), ms: Date.now() - (stepAt.design || designStartedAt) }
      ],
      calls: {}, stoppedAt: '', failedGroupId: ''
    };
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
    state.notice = '공고 원문에서 확인할 수 있는 내용만 정리했습니다. 아래에서 다시 시도할 수 있습니다.';
    state.designFailure = `AI 정밀 사업설계를 실행하지 못했습니다. ${error.message}`;
  }
  state.answers = state.analysis.questions || [];
  state.matches = buildMatches();
  // 실패했는데 완료로 보이지 않게 한다. 실패 표시와 다시 시도를 함께 남긴다.
  const failure = state.designFailure || '';
  state.designFailure = '';
  navigateToStep(4, { busy: '', error: failure });
}

function generationPayload() {
  // 서식 원문을 통째로 보내면 설계 호출이 Cloudflare 100초 한도를 넘겨 524로 끊긴다.
  // 서식은 이미 로컬에서 읽어 둔 규격 요약으로 바꾸고, 자른 것은 화면에 그대로 알린다.
  const trimmed = trimManualSources(state.manualSources, currentFormSpec());
  lastTrimNotes = trimmed.notes;
  return { sourceText: state.sourceText, manualSources: trimmed.sources.map(({ id, fileName, sourceType, extractedText, extractionStatus, extractionError }) => ({ id, fileName, sourceType, extractedText, extractionStatus, extractionError })), projectType: typeName(), project: state.project, selectedSubprogram: state.selectedNotice?.selectedSubproject || state.selectedNotice?.title || state.project.title, organization: organizationForGeneration(), userAnswers: state.designAnswers, projectBlueprint: blueprintHandoff(), noticeContract: contractHandoff() };
}

// 분할 생성은 master가 확정한 기준만 다시 쓴다. 공고 원문·직접자료를 매 분할마다 다시 보내지 않는다.
function partPayload() {
  const { sourceText, manualSources, ...rest } = generationPayload();
  return { ...rest, narrative: String(state.projectNarrative || '').slice(0, 4000) };
}

// 사용자가 고른 신청유형은 설계도·작성 payload·게이트에서 같은 값이어야 한다.
// 설계도가 공고에서 유형을 읽지 못한 경우에만 실행계약서의 CHOICE 규칙으로 보완한다.
function resolvedApplicationTypes(blueprint) {
  const options = (blueprint?.applicationTypes?.options || []).map(option => option.name);
  if (options.length >= 2) return { options, selected: blueprint.applicationTypes.selected || '' };
  const choice = (currentNoticeContract()?.rules || []).find(item => item.ruleType === 'CHOICE');
  if (!choice) return { options, selected: blueprint?.applicationTypes?.selected || '' };
  const chosen = String((state.projectValues || []).find(item => item.blueprintKey === 'applicationType')?.value || '');
  return { options: choice.value || [], selected: (choice.value || []).find(name => chosen.includes(name)) || '' };
}

// 공고 실행계약서를 작성 엔진의 최상위 기준으로 넘긴다. 자유입력도 이 조건을 덮을 수 없다.
function contractHandoff() {
  const contract = currentNoticeContract();
  if (!contract?.rules?.length) return null;
  // CHOICE는 공고가 선택지만 정하고 무엇을 고를지는 이번 사업 사용자 확정값이 정한다.
  // 선택 결과를 함께 보내지 않으면 작성 엔진이 선택지 자체를 공고의 지시로 오해한다.
  const chosenType = resolvedApplicationTypes(currentBlueprint()).selected;
  return {
    priority: ['공고 실행계약서', '이번 사업 사용자 확정값', '신청기관 확인정보', '사용자 자유입력', 'AI 제안'],
    rule: contract.rule,
    rules: contract.rules.map(item => ({
      id: item.id, category: item.category, title: String(item.title).slice(0, 120), ruleType: item.ruleType,
      value: item.ruleType === 'CHOICE' ? (chosenType || '선택 필요') : Array.isArray(item.value) ? item.value.join(' / ') : String(item.value),
      ...(item.ruleType === 'CHOICE' ? { options: item.value || [], selected: chosenType, selectedBy: chosenType ? '이번 사업 사용자 확정값' : '' } : {}),
      unit: item.unit, severity: item.severity, appliesTo: item.appliesTo,
      evidence: String(item.evidence).slice(0, 300), location: item.location
    })),
    conflicts: currentOfficialConflicts().map(item => ({ field: item.field, official: item.officialValue, current: item.userValue, instruction: item.instruction }))
  };
}

// 설계도를 초안 작성으로 넘긴다. 확정값은 그대로, 설계안은 설계안으로, 미확정은 [확인 필요]로만 넘긴다.
function blueprintHandoff() {
  const blueprint = currentBlueprint();
  if (!blueprint) return null;
  const types = resolvedApplicationTypes(blueprint);
  return {
    applicationType: types.selected || '[확인 필요]',
    // 선택하지 않은 유형 이름도 함께 넘겨, 다른 유형으로 작성되면 서버가 구조적 실패로 잡을 수 있게 한다.
    otherApplicationTypes: types.options.filter(name => name !== types.selected),
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

// 승인된 설계안 하나로 계획서 전체를 한 번에 만든다. 신규 계획서의 기본 경로다.
function approvedDesignPlan() {
  const engagement = currentEngagement();
  const brief = engagement.approval.snapshot || engagement.brief;
  const master = state.stagedGeneration?.master || null;
  return {
    approvedAt: engagement.approval.approvedAt, approvedBy: engagement.approval.approvedBy,
    // 승인 당시 설계안(공고 강제조건·신청유형·핵심값·수행모델·확인할 사항·목차·목표 분량·필요 표)
    ...brief,
    // 설계 단계에서 확정한 선정논리와 기준값. 없으면 넣지 않는다.
    demandEvidence: approvedDemandEvidence(currentDemandEvidence()),
    selectionLogic: master?.masterLogic || null,
    baselineValues: master?.masterLogic?.baselineValues || [],
    sectionPlan: (master?.sectionPlan || []).map(group => ({ title: group.title, sectionKeys: group.sectionKeys || [] }))
  };
}
async function generateFullProposal() {
  const permission = generationPermission();
  if (!permission.allowed) return setState({ error: permission.reason });
  const plan = approvedDesignPlan();
  if (!plan.outline?.length) return setState({ error: '승인된 설계안을 찾지 못했습니다. 「의뢰 건」 화면에서 설계를 승인해 주세요.' });
  const startedAt = Date.now();
  setAiBusy('전체 계획서 작성 중', { error: '', notice: '' }, 'fullProposal');
  try {
    const result = await fullProposalWithAI({ ...partPayload(), designPlan: plan });
    const sections = (result.sections || []).map((item, index) => ({ ...item, title: item.title || sectionTitle(item.id) || `${index + 1}번 항목` }));
    if (sections.length < 8) throw new Error('계획서 본문이 충분히 만들어지지 않았습니다. 다시 시도해 주세요.');
    state.sections = sections;
    // 서버가 붙여 준 근거 검증·평가자 검토를 그대로 담는다. 화면이 따로 판정하지 않는다.
    state.serverGuard = result.guard || null;
    state.serverEvidence = result.evidence || null;
    state.evaluatorReview = result.evaluatorReview || null;
    state.proposalTables = result.tables || [];
    state.missingInformation = (result.missingInformation || []).slice(0, 5);
    state.assemblyCheck = null;
    state.reviewResult = null;
    state.reviewOriginalDraft = null;
    state.reviewFingerprint = '';
    state.stagedGeneration = { ...state.stagedGeneration, phase: 'complete' };
    if (!(state.proposalVersions || []).length) recordProposalVersion({ sections: state.sections, label: 'V1 완성본', source: '승인 설계안 기반 작성' });
    markProposalAssembled();
    markAiDoneAt('fullProposal', startedAt, {
      sections: state.sections, proposalTables: state.proposalTables, missingInformation: state.missingInformation,
      stagedGeneration: state.stagedGeneration, proposalVersions: state.proposalVersions,
      notice: `승인된 설계안으로 계획서를 완성했습니다. 표 ${state.proposalTables.length}개를 함께 만들었습니다.`, error: ''
    });
    void archiveCurrentProposal('complete').catch(() => {});
  } catch (error) { setState({ busy: '', error: error.message }); }
}

// 확인되지 않은 값이 있어도 초안 작성은 막지 않는다. 부족한 값은 [확인 필요]로 남기고 제출 단계에서 확인한다.
// 이 경로는 이미 분할 작성을 시작한 기존 계획서의 이어쓰기 전용이다.
async function generateProposalParts() {
  if (aiBusy('이미 남은 내용을 쓰고 있습니다')) return;
  const staged = state.stagedGeneration;
  const all = staged?.master?.sectionPlan || [];
  const groups = all;
  if (!groups.length) return setState({ error: '작성할 신청서 항목 구조가 없습니다.' });
  // 설계 승인 전에는 전체 계획서 작성을 시작하지 않는다. 이미 시작한 작성의 이어쓰기와 열람은 막지 않는다.
  const permission = generationPermission();
  if (!permission.allowed) return setState({ error: permission.reason });
  const completed = new Set(staged.completedGroupIds || []);
  state.stagedGeneration.phase = 'parts-generating';
  // 새로 시작하면 앞서 눌렀던 멈춤과 실패 표시를 지운다. 끝난 묶음은 지우지 않는다.
  stopWriting = false;
  state.stagedGeneration.stoppedAt = '';
  state.stagedGeneration.failedGroupId = '';
  const startedAt = Date.now();
  setAiBusy('전체 계획서 작성 중', { stagedGeneration: state.stagedGeneration, error: '', notice: '' }, 'parts');
  try {
    for (const group of groups) {
      if (completed.has(group.id)) continue;
      // 멈춤을 누르면 지금 호출까지만 하고 다음 묶음은 시작하지 않는다.
      if (stopWriting) return stopWritingHere(completed.size, all.length);
      const relevantSections = relevantPreviousSections(group, state.stagedGeneration.parts);
      // 같은 묶음을 몇 번 불렀는지 남긴다. 멈췄다 이어 써도 두 번 부르지 않는다.
      state.stagedGeneration.calls = { ...(state.stagedGeneration.calls || {}), [group.id]: Number((state.stagedGeneration.calls || {})[group.id] || 0) + 1 };
      const groupStartedAt = Date.now();
      const result = await draftPartWithAI({ ...partPayload(), analysis: state.analysis, master: staged.master, group, continuitySummary: state.stagedGeneration.continuitySummary, relevantSections });
      state.stagedGeneration.parts = [...state.stagedGeneration.parts.filter(part => part.groupId !== group.id), { groupId: group.id, sections: result.sections }];
      state.stagedGeneration.continuitySummary = result.continuitySummary;
      completed.add(group.id);
      state.stagedGeneration.completedGroupIds = [...completed];
      state.stagedGeneration.phase = completed.size === all.length ? 'parts-ready' : 'parts-generating';
      state.stagedGeneration.timeline = recordTiming(state.stagedGeneration.timeline, {
        kind: 'group', id: group.id, title: group.title, at: new Date().toISOString(), ms: Date.now() - groupStartedAt
      });
      // 끝난 묶음을 바로 본문에 붙인다. 나머지가 끝나기를 기다리지 않는다.
      state.sections = sectionsSoFar();
      setState({
        stagedGeneration: state.stagedGeneration, sections: state.sections,
        busy: completed.size === all.length ? '' : `전체 계획서 작성 중 · ${completed.size} / ${all.length} 묶음 · 지금까지 ${state.sections.length}항목`
      });
      // 묶음마다 보관자료에도 남긴다. 새로고침하거나 다시 로그인해도 여기까지는 돌아온다.
      void archiveCurrentProposal('parts').catch(() => {});
      if (stopWriting && completed.size < all.length) return stopWritingHere(completed.size, all.length);
    }
    setState({ busy: '', stagedGeneration: state.stagedGeneration, notice: '전체 계획서 초안을 작성했습니다. 확인되지 않은 값은 [확인 필요]로 남겼습니다.' });
    // 항목이 모두 끝나면 사용자가 다시 누르지 않아도 하나의 계획서로 합친다.
    // 이어서 결합할 때는 전체 작성에 걸린 시간을 그대로 이어 보여 준다.
    if (completed.size === all.length) assembleProposal(startedAt);
    void archiveCurrentProposal('parts').catch(() => {});
  } catch (error) {
    state.stagedGeneration.phase = 'parts-generating';
    // 어디서 멈췄는지 남긴다. 이어쓰기는 이 묶음부터 시작하고 끝난 묶음은 다시 부르지 않는다.
    state.stagedGeneration.failedGroupId = groups.find(group => !completed.has(group.id))?.id || '';
    void archiveCurrentProposal('parts').catch(() => {});
    setState({ busy: '', stagedGeneration: state.stagedGeneration, error: `작성이 중단되었습니다. 완료된 ${completed.size}묶음은 그대로 있으며 「남은 내용 이어서 작성」으로 실패한 묶음부터 다시 시작합니다. ${error.message}` });
  }
}

// 멈춤. 지금 호출까지만 끝내고 다음 묶음은 시작하지 않는다. 끝난 묶음은 그대로 둔다.
let stopWriting = false;
function requestStopWriting() {
  stopWriting = true;
  setState({ notice: '이번 묶음까지만 쓰고 멈춥니다. 지금까지 쓴 내용은 그대로 남습니다.' });
}
function stopWritingHere(done, total) {
  stopWriting = false;
  state.stagedGeneration.stoppedAt = new Date().toISOString();
  state.stagedGeneration.phase = 'parts-generating';
  state.sections = sectionsSoFar();
  void archiveCurrentProposal('parts').catch(() => {});
  setState({
    busy: '', stagedGeneration: state.stagedGeneration, sections: state.sections,
    notice: `${total}묶음 중 ${done}묶음까지 쓰고 멈췄습니다. 「남은 내용 이어서 작성」을 누르면 남은 ${total - done}묶음부터 이어서 씁니다.`, error: ''
  });
}

const SECTION_DEPENDENCIES = { necessity: [], purpose: ['necessity'], goals: ['purpose'], target: ['necessity', 'goals'], programs: ['goals', 'target'], schedule: ['programs'], roles: ['programs', 'schedule'], budget: ['programs', 'roles'], indicators: ['goals', 'programs'], outcomes: ['goals', 'indicators'] };
function relevantPreviousSections(group, parts) {
  const needed = new Set((group.sectionKeys || []).flatMap(key => SECTION_DEPENDENCIES[key] || []));
  return (parts || []).flatMap(part => part.sections || []).filter(section => needed.has(section.id)).map(section => ({ id: section.id, title: section.title, content: String(section.content || '').slice(0, 3000), citations: section.citations || [] }));
}

// 지금까지 끝난 묶음만으로 본문을 만든다. 마지막 조립과 같은 순서를 쓴다.
// 아직 안 끝난 항목은 자리를 만들지 않는다. 빈 항목을 지어내지 않으려는 것이다.
function sectionsSoFar() {
  const staged = state.stagedGeneration;
  const groups = staged?.master?.sectionPlan || [];
  const done = new Set(staged?.completedGroupIds || []);
  const bySectionId = new Map((staged?.parts || []).flatMap(part => part.sections || []).map(section => [section.id, section]));
  const entries = groups.filter(group => done.has(group.id))
    .flatMap(group => (group.sectionKeys || []).map(key => ({ key, groupTitle: group.title })));
  return entries.map((entry, index) => {
    const source = bySectionId.get(entry.key);
    if (!source) return null;
    return {
      ...source,
      title: `${index + 1}. ${entry.groupTitle} · ${String(source.title || sectionTitle(entry.key)).replace(/^\d+[.)]?\s*/, '')}`
    };
  }).filter(Boolean);
}

function assembleProposal(startedAt = Date.now()) {
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
  state.stagedGeneration.timeline = recordTiming(state.stagedGeneration.timeline, { kind: 'done', title: '전체 완성', at: new Date().toISOString(), ms: Date.now() - startedAt });
  state.sections = sections;
  state.assemblyCheck = assemblyCheck;
  state.reviewResult = null;
  state.reviewOriginalDraft = null;
  state.reviewFingerprint = '';
  // 첫 완성본을 V1로 남긴다. 이후 수정·확정값 반영은 새 버전으로만 쌓인다.
  if (!(state.proposalVersions || []).length) recordProposalVersion({ sections: state.sections, label: 'V1 완성본', source: '계획서 작성' });
  else if (state.redesignForContract) {
    // 공고 기준 재설계는 기존 버전을 지우지 않고 새 버전으로만 쌓는다.
    recordProposalVersion({ sections: state.sections, label: '공고 기준 재설계', source: '공고 실행계약', reason: '공고 적합성 게이트 제출 차단 해소' });
    state.redesignForContract = false;
  }
  markAiDoneAt('assemble', startedAt, { stagedGeneration: state.stagedGeneration, sections: state.sections, proposalVersions: state.proposalVersions, assemblyCheck, notice: assemblyCheck.valid ? '분할 항목을 공식 신청서 순서의 하나의 사업계획서로 완성했습니다.' : '계획서를 조립했지만 확인할 불일치가 있습니다. 사실을 자동 보정하지 않았습니다.', error: '' });
  markProposalAssembled();
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

// 무엇이 없어서 어디가 미진한지. 값이 없다고 멈추지 않고, 끝까지 만든 뒤 앞에 붙여 알린다.
function currentGapReport() {
  const applicant = findApplicant(state.applicants, state.selectedApplicantId);
  return gapReport({ sections: state.sections, master: state.stagedGeneration?.master, orgAreas: applicant ? detailProgress(applicant) : [] });
}
// 검토본에만 보완 안내를 맨 앞에 붙인다. 제출본에는 넣지 않는다.
function reviewSections() {
  const cover = gapCoverSection(currentGapReport());
  return cover ? [{ ...cover, status: '내부 안내' }, ...state.sections] : state.sections;
}

// 부분 결과로 저장·출력을 막는 사유. 화면과 처리기가 같은 판단을 쓴다.
function partialBlock() {
  return partialBlockReason(state.stagedGeneration, { busy: state.busy, sections: state.sections.length });
}
// 저장·출력 처리기의 마지막 방어선. 어느 화면에서 눌러도 부분 결과는 나가지 않는다.
// 작성 중 자동 보관(stage 'parts')은 막지 않는다. 그것이 있어야 새로고침·재로그인에 살아남는다.
function refusePartial() {
  const reason = partialBlock();
  if (!reason) return false;
  setState({ error: reason, notice: '' });
  return true;
}

async function archiveCurrentProposal(forcedStage, announce = false) {
  if (!state.project.title && !state.selectedNotice?.title) throw new Error('저장할 계획서 제목이 없습니다.');
  const id = state.archiveProposalId || globalThis.crypto?.randomUUID?.() || `proposal-${Date.now()}`;
  state.archiveProposalId = id;
  saveState();
  const stage = forcedStage || (state.reviewResult ? 'review' : state.sections.length ? 'complete' : state.stagedGeneration?.phase === 'parts-ready' ? 'parts' : 'master');
  const fields = ['project', 'sourceText', 'analysis', 'sponsorIntent', 'projectDesign', 'missingInformation', 'evidenceMap', 'qualityCheck', 'designAnswers', 'designUnavailable', 'stagedGeneration', 'assemblyCheck', 'manualSources', 'matches', 'answers', 'sections', 'reviewResult', 'reviewOriginalDraft', 'reviewFingerprint', 'companyFacts', 'selectedNotice', 'aiMode', 'selectedApplicantId', 'projectValues', 'applicantResolvedQuestions', 'proposalVersions', 'revisionPlan', 'noticeLogic', 'draftReview', 'projectNarrative', 'engagement', 'proposalTables', 'preciseReview', 'submissionIncluded', 'currentVersionId'];
  // 계획서에는 사용 시점의 신청기관 사본만 남기고, 신청기관 원본은 별도 보관 항목으로만 수정한다.
  const snapshot = { ...Object.fromEntries(fields.map(key => [key, structuredClone(state[key])])), applicantSnapshot: selectedApplicant() ? structuredClone(selectedApplicant()) : null };
  const result = await saveArchivedProposal({ id, noticeKey: archiveNoticeKey(state.selectedNotice), title: state.project.title || state.selectedNotice?.title, stage, snapshot });
  state.archiveProposalId = result.id;
  if (announce) setState({ notice: `${archiveStageLabel(stage)}을 계획서보관함에 저장했습니다.`, error: '' });
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
// 상단 드롭다운 바깥을 누르면 닫는다. 안쪽 항목을 누르면 화면이 다시 그려지면서 함께 닫힌다.
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return closeTopMenus();
  const inside = event.target.closest('details.topmenu');
  closeTopMenus(inside);
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeArchiveMenu(); closeTopMenus(); } });
window.addEventListener('scroll', closeArchiveMenu, true);
window.addEventListener('resize', closeArchiveMenu);
render();
void checkSession();
