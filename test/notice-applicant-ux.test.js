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
  assert.match(appSource, /setAiBusy\('자료보관함에서 과거 공고를 검색하는 중'/);
  assert.match(appSource, /function elapsedLabel\(\)/);
  assert.match(appSource, /공고 \$\{notices\.length\}건을 불러왔습니다\$\{elapsed\}/);
  // 기존 AI 작업 경과시간 표시를 그대로 재사용한다.
  assert.match(appSource, /data-ai-elapsed data-started-at="\$\{busyStartedAt\}"/);
  assert.doesNotMatch(appSource, /busy: '중앙회와 광주지회 공고를 불러오는 중/);
});

test('과거 공고는 자료보관함에서 찾고 임시 목록과 구분해 표시한다', () => {
  assert.match(appSource, /<summary><b>자료보관함<\/b> · 보관된 공고와 저장한 계획서 다시 열기<\/summary>/);
  assert.match(appSource, /자료보관함\(D1\)에 보관된 공고 \$\{state\.archiveNotices\.length\}건/);
  assert.match(appSource, /보관함 · \$\{escapeHtml\(item\.sourceLabel\)\}/);
  assert.match(appSource, /이번에 가져온 공고 \$\{state\.noticeResults\.length\}건 · 임시 목록/);
  assert.match(appSource, /지금 가져온 목록은 이 화면에서만 쓰는 임시 목록/);
  // 기존 검색·열기 경로를 그대로 사용하고 새 API를 만들지 않는다.
  assert.match(appSource, /id="search-archive"/);
  assert.match(appSource, /data-use-archived-notice/);
});
