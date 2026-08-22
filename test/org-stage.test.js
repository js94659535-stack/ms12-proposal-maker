// 기관정보 기본·상세 2단계. 간단하게 시작할 자유와 더 좋은 계획서를 만들 선택권을 함께 둔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BASIC_AREAS, DETAIL_GROUPS, DETAIL_INTRO, basicStatus, detailProgress, draftFromApplicant, reusableCount } from '../src/org-stage.js';
import { APPLICANT_AREAS, mergeApplicantItems, makeApplicantItem } from '../src/applicants.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const 기관 = {
  name: '햇살지역아동센터',
  items: [
    makeApplicantItem({ area: 'basic', label: '기관 유형', value: '지역아동센터', status: '확인됨' }),
    makeApplicantItem({ area: 'basic', label: '담당자', value: '김담당 010-0000-0000', status: '확인 필요' }),
    makeApplicantItem({ area: 'staff', label: '사회복지사', value: '2명', status: '확인됨' }),
    makeApplicantItem({ area: 'references', label: '결과보고서', value: '2025 결과보고서', status: '확인 필요' })
  ]
};

test('상세정보는 여덟 구역이고 기본정보와 겹치지 않는다', () => {
  assert.deepEqual(DETAIL_GROUPS.map(group => group.key),
    ['clients', 'staff', 'performance', 'facilities', 'programs', 'partners', 'measurement', 'budget']);
  assert.deepEqual(DETAIL_GROUPS.map(group => group.title),
    ['이용자', '인력', '실적', '시설', '프로그램', '협력기관', '성과자료', '예산정보']);
  // 저장 영역을 하나도 빠뜨리지 않는다. 기존 자료가 화면에서 사라지면 안 된다.
  const covered = [...BASIC_AREAS, ...DETAIL_GROUPS.flatMap(group => group.areas)];
  assert.deepEqual([...covered].sort(), APPLICANT_AREAS.map(area => area.key).sort());
});

test('기본정보는 최소 세 가지만 있으면 계획서를 시작한다', () => {
  const empty = basicStatus(null, {});
  assert.equal(empty.ready, false);
  assert.deepEqual(empty.missing, ['기관명', '기관 유형', '담당자']);
  // 기관명은 등록된 기관 이름으로도 채워진다. 같은 것을 두 번 적게 하지 않는다.
  const status = basicStatus(기관, {});
  assert.equal(status.ready, true);
  assert.equal(status.saved, true);
  // 선택 항목이 비어 있어도 막지 않는다.
  assert.equal(status.missing.length, 0);
});

test('저장한 기본정보는 입력칸에 다시 채워진다', () => {
  const draft = draftFromApplicant(기관);
  assert.equal(draft.orgName, '햇살지역아동센터');
  assert.equal(draft.orgType, '지역아동센터');
  // 적지 않은 값은 만들지 않는다.
  assert.equal(draft.strength, undefined);
});

test('상세 구역별 건수는 실제 자료에서만 센다', () => {
  const progress = detailProgress(기관);
  const staff = progress.find(group => group.key === 'staff');
  assert.equal(staff.total, 1);
  assert.equal(staff.confirmed, 1);
  // 성과자료는 성과측정 경험과 근거자료를 함께 센다.
  assert.equal(progress.find(group => group.key === 'measurement').total, 1);
  // 비어 있는 구역은 0으로 남는다. 빈 상세정보를 지어내지 않는다.
  assert.equal(progress.find(group => group.key === 'budget').total, 0);
  assert.equal(reusableCount(기관), 2);
});

test('같은 기본정보를 다시 저장해도 줄이 늘거나 확인 상태가 내려가지 않는다', () => {
  const incoming = [
    makeApplicantItem({ area: 'basic', label: '기관 유형', value: '지역아동센터', status: '확인 필요' }),
    makeApplicantItem({ area: 'basic', label: '담당자', value: '박담당 010-1111-1111', status: '확인 필요' })
  ];
  const merged = mergeApplicantItems(기관.items, incoming);
  assert.equal(merged.length, 기관.items.length, '같은 항목이 두 줄이 되지 않는다');
  // 값이 같으면 확인됨을 유지한다.
  assert.equal(merged.find(item => item.label === '기관 유형').status, '확인됨');
  // 값이 달라지면 이전 값을 이력으로 남기고 바꾼다. 지우지 않는다.
  const contact = merged.find(item => item.label === '담당자');
  assert.equal(contact.value, '박담당 010-1111-1111');
  assert.equal(contact.history.at(-1).value, '김담당 010-0000-0000');
});

// ---------- 화면 ----------

test('기관정보 페이지를 새로 만들지 않고 한 곳을 두 단계로 나눈다', () => {
  // 기존 페이지 함수 이름과 진입점은 그대로다.
  assert.match(app, /applicants: applicantsToolView/);
  assert.match(app, /function applicantBasicView\(applicant, who = '신청기관'\)/);
  assert.match(app, /function applicantDetailView\(applicant\)/);
  // 한 페이지 안에서 기본정보 → 후보 → 상세정보 순으로 나온다.
  const view = app.slice(app.indexOf('function applicantsToolView()'), app.indexOf('function applicantBasicView('));
  assert.ok(view.indexOf('applicantBasicView(editing') < view.indexOf('applicantDetailView(editing'));
  assert.match(view, /applicantCandidateView\(editing\)/);
});

test('기본정보만 저장하고 바로 계획서 작성으로 갈 수 있다', () => {
  // 기본정보는 적는 대로 저장된다(22-34). 「저장」 버튼은 없앴고 남은 것은 작성으로 가는 길뿐이다.
  assert.doesNotMatch(app, /id="save-basic-info"/);
  assert.match(app, /적는 대로 저장됩니다/);
  assert.match(app, /function queueQuickOrgSave\(delay = 2500\)/);
  assert.match(app, /id="basic-to-writing"/);
  const fn = app.slice(app.indexOf('async function saveBasicInfo('), app.indexOf('// 기관정보 화면.'));
  // 상세정보가 비어 있다고 막지 않는다.
  assert.ok(!/detailProgress|상세정보를 먼저/.test(fn));
  assert.match(fn, /activeTool: '', expertDetail: false/);
});

test('상세정보 안내 문구를 그대로 띄우고 구역을 한 번에 펼치지 않는다', () => {
  assert.equal(DETAIL_INTRO, '인력·사업실적·시설·보유 프로그램 등의 상세정보를 등록하면 AI가 기관의 실제 역량을 계획서에 반영할 수 있습니다. 반복 입력과 [확인 필요]가 줄어들며, 한 번 확인한 정보는 다음 계획서에서도 다시 사용할 수 있습니다.');
  assert.match(app, /<p>\$\{DETAIL_INTRO\}<\/p>/);
  // 자료가 있는 묶음은 펼치고 빈 묶음은 접는다. 96건이 들어왔는데 접혀 있으면 들어간 줄 모른다.
  assert.match(app, /const open = \(state\.closedOrgGroups \|\| \[\]\)\.includes\(group\.key\)/);
  assert.match(app, /\(\(state\.openOrgGroups \|\| \[\]\)\.includes\(group\.key\) \|\| group\.total > 0\)/);
  assert.match(app, /data-detail-group="\$\{group\.key\}" \$\{open \? 'open' : ''\}/);
  // 「모두 펼치기」는 뺐다(22-13). 무엇을 펼칠지는 자료가 정한다.
  assert.doesNotMatch(app, /id="open-all-details"/);
  assert.match(app, /id="close-all-details"/);
});

test('상세정보를 고치면 보관자료에도 저장한다', () => {
  // 이 브라우저에만 남으면 다음 계획서에서 다시 쓰지 못한다.
  assert.match(app, /function queueApplicantSave\(delay = 1500\) \{/);
  assert.match(app, /void persistApplicant\(focusedApplicantId\(\), false\);/);
  const add = app.slice(app.indexOf('function addApplicantItem('), app.indexOf('async function loadApplicantDocument('));
  assert.match(add, /persistApplicant\(focusedApplicantId\(\), false\)/);
  // 「이 기관 정보 저장」은 뺐다(22-13). 고칠 때마다 이미 저장하고 있어 같은 일을 두 번 시키지 않는다.
  assert.doesNotMatch(app, /id="save-applicant"/);
});

test('첫 화면 안내 배너는 기존 기관정보 페이지로 연결한다', () => {
  const panel = app.slice(app.indexOf('function simpleOrgPanel()'), app.indexOf('function simpleQuestionsPanel()'));
  assert.match(panel, /기관정보를 한 번 등록해 두면 계획서마다 다시 적지 않습니다/);
  assert.match(panel, /data-open-applicants="1"/);
  // 새 페이지가 아니라 기존 기관정보 도구를 연다.
  assert.match(app, /\[data-open-applicants\]'\)\.forEach\(el => el\.onclick = \(\) => setState\(\{ activeTool: 'applicants'/);
});

test('에이전트는 지금 고른 고객기관의 기관정보를 관리한다', () => {
  // 열어 둔 기관이 없으면 이번 사업 신청기관을 그대로 관리한다. 다른 회원 자료가 섞이지 않는다.
  assert.match(app, /function focusedApplicantId\(\) \{/);
  assert.match(app, /const editing = findApplicant\(state\.applicants, state\.applicantEditingId\) \|\| findApplicant\(state\.applicants, state\.selectedApplicantId\);/);
  assert.match(app, /const who = clients \? '고객 기관' : '신청기관';/);
});

test('기본정보도 적는 대로 저장된다', () => {
  // 화면 위에 「자동 저장 중」이라 적어 두고 기본정보만 버튼을 눌러야 남는 것은 거짓말이었다.
  const save = app.slice(app.indexOf('async function autoSaveQuickOrg()'), app.indexOf('async function saveQuickOrg()'));
  // 기관이 없으면 저장할 곳이 없다. 그때는 기관을 먼저 만든다.
  assert.match(save, /if \(!applicant\) return;/);
  // 값이 그대로면 저장하지 않는다. 같은 값으로 이력을 늘리지 않는다.
  assert.match(save, /if \(JSON\.stringify\(next\.items\) === JSON\.stringify\(applicant\.items\) && next\.name === applicant\.name\) return;/);
  // 서버 보관까지 간다. 브라우저에만 남기지 않는다.
  assert.match(save, /await saveArchivedApplicant\(next\)/);
  // 타이핑 중간값이 이력에 쌓이지 않게 조금 기다린다.
  assert.match(app, /queueQuickOrgSave\(\);/);
  assert.match(app, /quickSaveTimer = setTimeout\(\(\) => \{ quickSaveTimer = null; void autoSaveQuickOrg\(\); \}, delay\);/);
});
