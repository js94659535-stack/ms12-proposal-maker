import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPROVAL_ROLES, DESIGN_STATES, ENGAGEMENT_PARTS, ENGAGEMENT_STAGES, ITEM_ORIGINS, PROPOSAL_OUTLINE, buildDesignBrief, buildEngagement, canGenerateProposal, designStatus, makeClient, makeDesignApproval, makeNoticeRequest, normalizeEngagement, organizationBoundary } from '../src/engagement.js';
import { ITEM_ORIGINS as APPLICANT_ORIGINS, makeApplicantItem, normalizeApplicant } from '../src/applicants.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const archive = fs.readFileSync(new URL('../functions/api/archive.js', import.meta.url), 'utf8');

const applicant = normalizeApplicant({
  id: 'org-1', name: '테스트 기관',
  items: [
    makeApplicantItem({ area: 'basic', label: '기관 유형', value: '지역아동센터', status: '확인됨', origin: '기관 확인', asOf: '2026-06' }),
    makeApplicantItem({ area: 'staff', label: '상근 인력', value: '사회복지사 2명', status: '확인 필요', origin: '고객 입력' }),
    makeApplicantItem({ area: 'performance', label: '2025년 정서지원', value: '아동 14명 대상 12회기 운영', status: '확인됨', origin: '파일 추출' })
  ]
});

test('기관자료는 어디서 왔는지 남기고 출처만으로 확인 상태를 올리지 않는다', () => {
  assert.deepEqual(ITEM_ORIGINS, ['고객 입력', '파일 추출', '운영자 수정', '기관 확인']);
  assert.deepEqual(APPLICANT_ORIGINS, ITEM_ORIGINS);
  const item = makeApplicantItem({ label: '보유 공간', value: '상담실 1실', origin: '파일 추출' });
  assert.equal(item.origin, '파일 추출');
  assert.equal(item.status, '확인 필요', '출처가 있다고 확인됨으로 올리지 않는다');
  // 목록에 없는 출처는 버린다(임의 문자열이 근거로 남지 않게).
  assert.equal(makeApplicantItem({ label: 'x', value: 'y', origin: '어디선가' }).origin, '');
  // 보관함도 같은 규칙으로 저장한다.
  assert.match(archive, /const ITEM_ORIGINS = \['고객 입력', '파일 추출', '운영자 수정', '기관 확인'\]/);
  assert.match(archive, /origin: ITEM_ORIGINS\.includes\(item\?\.origin\) \? item\.origin : ''/);
});

test('기관 영구정보와 이번 사업 값을 섞지 않고 겹치는 것만 알려 준다', () => {
  const boundary = organizationBoundary(applicant, [
    { blueprintKey: 'headcount', label: '인원', value: '아동 20명' },
    { blueprintKey: 'sessions', label: '회기', value: '아동 14명 대상 12회기 운영' }
  ]);
  assert.equal(boundary.permanent.length, 2, '기관 현재 정보');
  assert.equal(boundary.records.length, 1, '과거 실적');
  assert.equal(boundary.thisProject.length, 2);
  // 과거 실적 문장이 이번 사업 값으로 그대로 들어온 것만 혼입으로 본다.
  assert.equal(boundary.mixed.length, 1);
  assert.equal(boundary.mixed[0].from, '2025년 정서지원');
  assert.ok(!boundary.mixed.some(entry => entry.label === '인원'), '다른 값은 혼입이 아니다');
  assert.equal(boundary.confirmed, 1);
  assert.equal(boundary.unverified, 1);
  assert.equal(boundary.withoutOrigin, 0);
  // 어느 쪽도 자동으로 옮기지 않는다(원본 배열을 바꾸지 않는다).
  assert.equal(applicant.items.length, 3);
});

test('의뢰 건은 고객 담당자·요청서와 기관정보를 분리해 들고 있다', () => {
  assert.deepEqual(ENGAGEMENT_PARTS.map(item => item.key), ['client', 'applicant', 'request', 'noticeFiles', 'contract', 'design', 'proposal']);
  assert.equal(ENGAGEMENT_PARTS.find(item => item.key === 'applicant').scope, '기관 영구');
  for (const key of ['client', 'request', 'noticeFiles', 'contract', 'design', 'proposal']) {
    assert.equal(ENGAGEMENT_PARTS.find(item => item.key === key).scope, '의뢰 건', key);
  }
  const engagement = buildEngagement({
    client: { name: '김담당', position: '사무국장', contact: '010-0000-0000' },
    request: { title: '2027 가족기능강화사업', deadline: '2026-08-14' },
    applicant, projectValues: [{ blueprintKey: 'headcount', label: '인원', value: '아동 20명' }],
    noticeLogic: { structure: { totalChars: 5000 }, contract: { rules: [{}, {}], blockingCount: 2 } },
    sections: [], proposalVersions: [], proposalFlow: { rounds: [] }
  });
  assert.equal(engagement.parts.find(item => item.key === 'client').state, '준비됨');
  assert.equal(engagement.parts.find(item => item.key === 'contract').state, '준비됨');
  assert.equal(engagement.parts.find(item => item.key === 'proposal').state, '없음');
  // 고객 연락처는 기관 영구정보로 올라가지 않는다.
  assert.ok(!engagement.boundary.permanent.some(item => String(item.value).includes('010-0000-0000')));
});

test('고객 화면은 네 단계와 다음 행동 하나만 보여 준다', () => {
  assert.deepEqual(ENGAGEMENT_STAGES, ['공고 요청', '정보 확인', '설계 승인', '결과 확인']);
  const empty = buildEngagement({});
  assert.equal(empty.stage, '공고 요청');
  assert.equal(empty.customerNext.label, '공고 요청서 작성');

  const noticeOnly = buildEngagement({ request: { title: '요청' }, noticeLogic: { structure: { totalChars: 4000 } } });
  assert.equal(noticeOnly.stage, '정보 확인');

  const readyToDesign = buildEngagement({ request: { title: '요청' }, noticeLogic: { structure: { totalChars: 4000 } }, applicant, blueprint: { canDraft: false, readiness: 'DESIGN_INCOMPLETE' } });
  assert.equal(readyToDesign.stage, '설계 승인');
  assert.equal(readyToDesign.customerNext.label, '신청유형 선택');

  const written = buildEngagement({
    request: { title: '요청' }, noticeLogic: { structure: { totalChars: 4000 } }, applicant,
    sections: [{ id: 'necessity', content: '본문' }], proposalVersions: [{ version: 1 }],
    gate: { status: '제출 차단', blocking: [{ title: '사업기간' }], counts: { 충족: 9, 미확정: 3, 불일치: 1 } }
  });
  assert.equal(written.stage, '결과 확인');
  assert.equal(written.customerNext.label, '공고 기준 보완');
  // 고객 문구에 내부 엔진·단계 이름을 노출하지 않는다.
  for (const internal of ['blueprint', 'noticeContract', 'BLOCKING', 'draft-check', 'master']) {
    assert.ok(!`${written.customerNext.label} ${written.customerNext.why}`.includes(internal), internal);
  }
});

test('운영자 상세는 공고 분석·계약서·설계도·버전·게이트를 모두 본다', () => {
  const engagement = buildEngagement({
    request: { title: '요청' }, applicant,
    noticeLogic: { structure: { totalChars: 5864 }, contract: { rules: new Array(14).fill({}), blockingCount: 10 } },
    projectValues: [{ blueprintKey: 'headcount', label: '인원', value: '아동 14명 대상 12회기 운영' }],
    sections: new Array(10).fill({ content: '본문' }), proposalVersions: [{ version: 1 }, { version: 2 }],
    proposalFlow: { status: '검토중', rounds: [{ round: 1 }, { round: 2 }] },
    blueprint: { canDraft: true, readiness: 'DRAFT_READY', applicationTypes: { selected: '재학대예방형' }, submissionChecklist: [{}, {}] },
    gate: { status: '보완 필요', blocking: [], counts: { 충족: 11, 미확정: 3, 불일치: 0 } }
  });
  const operator = engagement.operator;
  assert.equal(operator.noticeAnalyzed, true);
  assert.equal(operator.contractRules, 14);
  assert.equal(operator.blockingRules, 10);
  assert.equal(operator.applicationType, '재학대예방형');
  assert.equal(operator.blueprintReadiness, 'DRAFT_READY');
  assert.equal(operator.versions, 2);
  assert.equal(operator.reviewRounds, 2);
  assert.equal(operator.gateStatus, '보완 필요');
  assert.equal(operator.gateBlocking, 0);
  // 기관 실적이 이번 사업 값으로 복사된 것은 운영자 화면에서 드러난다.
  assert.equal(operator.mixedValues, 1);
});

test('저장 값은 정규화하고 예전 저장분도 그대로 열린다', () => {
  assert.deepEqual(normalizeEngagement({}), { client: makeClient(), request: makeNoticeRequest(), design: makeDesignApproval(), formSpec: null, mode: '표준형', view: 'customer' });
  assert.equal(normalizeEngagement({ view: '이상한값' }).view, 'customer');
  assert.equal(normalizeEngagement({ view: 'operator' }).view, 'operator');
  // 예전 상태에는 engagement가 없다. 빈 값으로 채우기만 하고 기존 데이터는 건드리지 않는다.
  assert.match(app, /restored\.engagement = normalizeEngagement\(saved\.engagement \|\| \{\}\);/);
  // 보관 스냅샷에 의뢰 건을 함께 담되 저장 경로를 새로 만들지 않는다.
  assert.match(app, /'draftReview', 'projectNarrative', 'engagement', 'proposalTables', 'preciseReview', 'submissionIncluded', 'currentVersionId'\]/);
  assert.doesNotMatch(app, /action: 'saveEngagement'/);
});

const CONTRACT = {
  blockingCount: 3,
  rules: [
    { title: '사업기간', ruleType: 'EXACT', value: '2027.1~2027.12', severity: 'BLOCKING', category: '사업기간', appliesTo: 'period' },
    { title: '신청유형 택1', ruleType: 'CHOICE', value: ['재학대예방형', '아동보호형'], severity: 'BLOCKING', category: '신청유형', appliesTo: 'applicationType' },
    { title: '홈케어플래너 파견을 통한 모니터링', ruleType: 'REQUIRED', value: ['홈케어플래너', '모니터링'], severity: 'BLOCKING', category: '사업모델', appliesTo: 'programs' },
    { title: '필수 제출서류', ruleType: 'FORMAT', value: '서식 5종', severity: 'REQUIRED', category: '제출양식', appliesTo: '' }
  ]
};
const LOCKS = {
  period: { mode: 'OFFICIAL_LOCKED', value: '2027.1~2027.12' },
  headcount: { mode: 'USER_DECIDES', bound: '70명 이상' }
};

test('설계안은 강제조건·유형·핵심값·수행모델·확인사항·목차를 함께 보여 준다', () => {
  const brief = buildDesignBrief({
    contract: CONTRACT, locks: LOCKS, applicant,
    blueprint: { applicationTypes: { selected: '재학대예방형', options: [{ name: '재학대예방형' }, { name: '아동보호형' }] } },
    projectValues: [{ blueprintKey: 'headcount', label: '인원', value: '핵심 참여자 72명' }]
  });
  assert.equal(brief.blockingRules.length, 3);
  assert.equal(brief.applicationType.selected, '재학대예방형');
  assert.deepEqual(brief.applicationType.options, ['재학대예방형', '아동보호형']);
  // 공고가 정한 값은 「공고 확정」, 범위 안에서 사용자가 정한 값은 「이번 사업 확정」으로 구분한다.
  assert.equal(brief.coreValues.find(item => item.key === 'period').basis, '공고 확정');
  assert.equal(brief.coreValues.find(item => item.key === 'period').value, '2027.1~2027.12');
  assert.match(brief.coreValues.find(item => item.key === 'headcount').basis, /이번 사업 확정 \(공고 허용 70명 이상\)/);
  assert.equal(brief.coreValues.find(item => item.key === 'sessions').value, '[확인 필요]');
  assert.equal(brief.requiredModels.length, 1);
  assert.deepEqual(brief.requiredModels[0].keyphrases, ['홈케어플래너', '모니터링']);
  // 아직 확인할 사실이 남으면 승인 전에 드러난다.
  assert.ok(brief.openFacts.some(item => item.includes('상근 인력')));
  assert.ok(brief.openFacts.some(item => item.includes('회기')));
  assert.equal(brief.outline.length, 10);
  assert.deepEqual(brief.outline.map(item => item.key), PROPOSAL_OUTLINE.map(item => item.key));
  assert.ok(brief.targetTotalChars > 0);
});

test('설계 승인 전에는 전체 계획서 작성을 막고 열람은 막지 않는다', () => {
  assert.deepEqual(DESIGN_STATES, ['설계 준비 중', '확인 요청', '운영자 검토', '설계 승인', '계획서 작성 완료']);
  assert.deepEqual(APPROVAL_ROLES, ['고객', '운영자']);
  assert.equal(designStatus({}), '설계 준비 중');
  assert.equal(designStatus({ approval: { requestedAt: '2026-08-10T00:00:00.000Z', requestedBy: '고객' } }), '확인 요청');
  assert.equal(designStatus({ approval: { requestedAt: 'x', reviewStartedAt: 'y' } }), '운영자 검토');
  assert.equal(designStatus({ approval: { approvedAt: 'z', approvedBy: '운영자' } }), '설계 승인');
  assert.equal(designStatus({ approval: { approvedAt: 'z' }, sections: [{ id: 'necessity' }] }), '계획서 작성 완료');

  assert.equal(canGenerateProposal({}).allowed, false);
  assert.match(canGenerateProposal({}).reason, /설계 승인 후에 전체 계획서를 작성합니다/);
  assert.equal(canGenerateProposal({ approval: { approvedAt: 'z', approvedBy: '고객' } }).allowed, true);
  // 이미 시작한 작성의 이어쓰기와 기존 계획서 열람은 막지 않는다.
  assert.equal(canGenerateProposal({ startedParts: 2 }).allowed, true);
  assert.equal(canGenerateProposal({ sections: [{ id: 'necessity' }] }).allowed, true);
  // 목록에 없는 역할은 기록하지 않는다.
  assert.equal(makeDesignApproval({ approvedBy: '관리자' }).approvedBy, '');
  assert.equal(makeDesignApproval({ approvedBy: '운영자' }).approvedBy, '운영자');
});

test('승인 흐름과 차단이 화면에 연결된다', () => {
  assert.match(app, /function generationPermission\(\)/);
  assert.match(app, /const permission = generationPermission\(\);\s*\n\s*if \(!permission\.allowed\) return setState\(\{ error: permission\.reason \}\);/);
  assert.match(app, /id="generate-parts" \$\{generationPermission\(\)\.allowed \? '' : 'disabled'\}/);
  assert.match(app, /function requestDesignReview\(\)/);
  assert.match(app, /function startDesignReview\(\)/);
  assert.match(app, /function approveDesign\(\)/);
  assert.match(app, /function reopenDesign\(\)/);
  // 승인 시점·역할·설계 snapshot을 함께 남긴다.
  assert.match(app, /approvedAt: new Date\(\)\.toISOString\(\), approvedBy: currentRole\(\), snapshot: structuredClone\(engagement\.brief\)/);
  assert.match(app, /function currentRole\(\) \{ return state\.engagement\.view === 'operator' \? '운영자' : '고객'; \}/);
  // 승인 해제는 이미 만든 계획서를 지우지 않는다.
  assert.match(app, /이미 만든 계획서와 버전은 그대로 있습니다/);
  // 고객 요청서에서 기관을 고르고 새 기관은 이름만 받는다.
  assert.match(app, /id="engagement-applicant"/);
  assert.match(app, /data-engagement-request="applicantName"/);
  assert.match(app, /공고 원문 \$\{state\.sourceText\.trim\(\)\.length\.toLocaleString\(\)\}자/);
});

test('의뢰 건 화면은 기존 화면을 대체하지 않고 덧붙는다', () => {
  assert.match(app, /tools = \{ home: homeView, coaching: coachingView, applicants: applicantsToolView, sample: sampleView, engagement: engagementView, account: accountView, admin: adminView, operator: operatorView, premium: premiumView \}/);
  assert.ok(app.includes("['open-engagement', '의뢰 건'"), '작업 메뉴에 의뢰 건 항목이 있다');
  assert.ok(app.includes("querySelector('#open-engagement')"), '의뢰 건 처리기가 그대로 있다');
  assert.match(app, /function engagementView\(\)/);
  assert.match(app, /function engagementOperatorView\(engagement\)/);
  // 고객 화면과 운영자 화면이 갈린다.
  assert.match(app, /const operator = state\.engagement\.view === 'operator';/);
  assert.match(app, /\$\{operator \? engagementOperatorView\(engagement\) : /);
  // 요청서는 이 의뢰 건에만 저장한다.
  assert.match(app, /function saveEngagementRequest\(\)/);
  assert.match(app, /신청기관 정보는 바뀌지 않았습니다/);
  // 기존 흐름을 건드리지 않는다.
  assert.match(app, /const views = \[noticeImportView, noticeConfirmView, applicantSelectView, businessSelectView, documentView, documentView\]/);
  assert.match(app, /function currentSubmissionGate\(\)/);
});
