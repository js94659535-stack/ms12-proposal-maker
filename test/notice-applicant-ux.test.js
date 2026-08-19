import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NO_APPLICANT_RULE, buildApplicantOrganization } from '../src/applicants.js';

const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('신청기관이 없어도 계획서 작성을 막지 않고 확인되지 않은 사실은 만들지 않는다', () => {
  const organization = buildApplicantOrganization(null, []);
  assert.equal(organization.organization, '신청기관 미선택');
  assert.deepEqual(organization.confirmedFacts, []);
  assert.equal(organization.rule, NO_APPLICANT_RULE);
  assert.match(organization.rule, /\[확인 필요\]/);
  assert.match(organization.rule, /만들지 말고/);

  // 신청기관 없이 다음 단계로 진행하는 경로가 화면에 있다.
  assert.match(appSource, /id="skip-applicant"/);
  assert.match(appSource, /#skip-applicant'\)\?\.addEventListener\('click', \(\) => navigateToStep\(3, \{ applicantSkipped: true/);
  assert.match(appSource, /if \(index === 2\) return Boolean\(selectedApplicant\(\) \|\| state\.applicantSkipped\);/);
  assert.match(appSource, /신청기관 선택은 필수가 아닙니다/);
  // 작성 요청에는 항상 현재 선택 상태 그대로 전달한다.
  assert.match(appSource, /organization: organizationForGeneration\(\)/);
});

test('공고 불러오기는 기존 경과시간 표시를 사용하고 완료·실패 시간을 남긴다', () => {
  assert.match(appSource, /setAiBusy\('공고를 불러오는 중'/);
  assert.match(appSource, /setAiBusy\('공고 상세 내용을 불러오는 중'/);
  assert.match(appSource, /setAiBusy\('선택한 공고 본문을 불러오는 중'/);
  assert.match(appSource, /setAiBusy\('공고보관함에서 과거 공고를 검색하는 중'/);
  assert.match(appSource, /function elapsedLabel\(\)/);
  assert.match(appSource, /공고 \$\{notices\.length\}건을 불러왔습니다\$\{elapsed\}/);
  // 기존 AI 작업 경과시간 표시를 그대로 재사용한다.
  assert.match(appSource, /data-ai-elapsed data-started-at="\$\{busyStartedAt\}"/);
  assert.doesNotMatch(appSource, /busy: '중앙회와 광주지회 공고를 불러오는 중/);
});

test('과거 공고는 공고보관함에서 찾고 임시 목록과 구분해 표시한다', () => {
  // 큰 표라서 기본은 접는다. 검색·맞춤 공고 확인이 끝나 이 자리로 데려온 때만 펼친다.
  assert.match(appSource, /id="archive-box" \$\{archiveOpen \? 'open' : ''\}>/);
  assert.match(appSource, /const archiveOpen = state\.aiResult\?\.anchor === '#archive-box';/);
  // 접혀 있어도 몇 건인지는 보인다. 숫자가 없으면 열어 볼 이유를 알 수 없다.
  // 접힌 줄도 「카드 제목 + 오른쪽 버튼」 모양이다. 세 줄이 같은 모양이라야 「이 중 하나」가 사실이 된다.
  assert.match(appSource, /<summary class="card-title row-summary"><div><h3>공고보관함/);
  assert.match(appSource, /<span class="button secondary">공고 검색<\/span><\/summary>/);
  // 계획서 건수는 여기서 세지 않는다. 계획서보관함은 다른 묶음으로 옮겼다.
  assert.doesNotMatch(appSource, /계획서 \$\{proposals\.length\}건/);
  // 설명은 <small>에서 카드 제목 줄의 <span>으로 옮겼다. 문구는 그대로 남긴다.
  assert.match(appSource, /<span>가져온 공고는 자동 보관됩니다\./);
  // 계획서보관함은 공고가 아니라 계획서다. 「어떤 공고로 시작할까」에 답하는 물건이 아니라
  // 이미 시작한 것을 이어 쓰는 곳이라, 고르는 자리에서 떼어 맨 아래로 옮기고 접었다.
  // 홈 화면에 같은 자료·같은 버튼(data-open-archived-proposal)의 「계속 작업」이 이미 있다.
  assert.match(appSource, /id="proposal-box"><summary><b>계획서보관함<\/b>/);
  assert.doesNotMatch(appSource, /id="proposal-box" open/);
  assert.match(appSource, /function pastRecordsView\(\) \{/);
  // 옮겨도 여는 방법은 그대로다. 처리기를 건드리지 않았다.
  assert.match(appSource, /data-open-archived-proposal="\$\{escapeHtml\(item\.id\)\}"/);
  // 보관량이 많아도 빠르게 찾도록 표·검색·필터·페이지 구조로 보여 준다.
  assert.match(appSource, /class="archive-table"/);
  assert.match(appSource, /id="archive-query"/);
  assert.match(appSource, /archiveSelectField\('공모기관', 'institution'/);
  assert.match(appSource, /archiveSortButton\('deadline', '마감일', table\)/);
  assert.match(appSource, /data-archive-filter="\$\{name\}"/);
  assert.match(appSource, /id="archive-page-size"/);
  assert.match(appSource, /이번에 가져온 공고 \$\{state\.noticeResults\.length\}건 · 임시 목록/);
  assert.match(appSource, /<b>이 화면에서만 쓰는 임시 목록<\/b>이라 새로고침하면 사라집니다/);
  // 기존 검색·열기 경로를 그대로 사용하고 새 API를 만들지 않는다.
  assert.match(appSource, /id="search-archive"/);
  assert.match(appSource, /data-archive-use/);
});

test('공고보관함 표는 복수 기관 매칭·작업 단계 이동·목록 삭제를 지원한다', () => {
  // 한 공고에 여러 신청기관을 연결하되 기관별 계획서 작업은 따로 유지한다.
  assert.match(appSource, /data-archive-applicant="\$\{escapeHtml\(row\.key\)\}"/);
  assert.match(appSource, /'\+ 기관 매칭'/);
  assert.match(appSource, /기관별 계획서 작업은 각각 따로 유지됩니다/);
  // 작업 이동은 행 우클릭(모바일은 길게 누르기) 메뉴에서만 하고 기존 단계 이동 함수를 그대로 쓴다.
  assert.match(appSource, /function startArchiveWork\(key, step, applicantId = ''\)/);
  assert.match(appSource, /navigateToStep\(step, patch\)/);
  assert.match(appSource, /const ARCHIVE_WORK_STEPS = \[/);
  assert.match(appSource, /row\.oncontextmenu = event => \{ event\.preventDefault\(\); openArchiveMenu\(/);
  assert.match(appSource, /row\.ontouchstart = event =>/);
  assert.match(appSource, /openArchiveMenu\(row\.dataset\.archiveRow, touch\.clientX, touch\.clientY\)/);
  assert.match(appSource, /원문 바로가기 ↗/);
  assert.match(appSource, /current \? '현재 단계' : done \? '✓' : ''/);
  // 표에서 작업하기·원문 열은 만들지 않는다.
  assert.match(appSource, /<th>상태<\/th><th>신청기관<\/th><th>삭제<\/th>/);
  assert.doesNotMatch(appSource, /archiveWorkMenu|작업하기 ▼/);
  // 삭제는 보관 원본과 계획서를 지우지 않고 이 기기 목록에서만 숨긴다.
  assert.match(appSource, /function hideArchivedNotices\(keys\)/);
  assert.match(appSource, /보관 원본과 연결된 계획서는 지워지지 않습니다/);
  assert.match(appSource, /id="archive-delete-selected"/);
  assert.match(appSource, /id="archive-select-page"/);
});
