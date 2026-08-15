import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ARCHIVE_PAGE_SIZES, ARCHIVE_PAGE_SIZE_LABEL, ARCHIVE_STATUSES, applicantLabel, archiveField, archiveTableRows, deadlineInfo, noticeSourceUrl, noticeStatus, shortDate, stageStatus } from '../src/archive-table.js';

const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const notices = [
  { archiveNoticeKey: 'central:1', source: 'central', sourceLabel: '중앙회', title: '아동 정서지원 사업', summary: '지역아동센터 아동 정서지원', deadline: '2026-08-14', archivedAt: '2026-08-09T01:00:00.000Z', dstbBsnsCode: '20260700100022' },
  { archiveNoticeKey: 'gwangju:2', source: 'gwangju', sourceLabel: '광주지회', title: '어르신 돌봄 지원', summary: '노인 돌봄', deadline: '2026-07-01', archivedAt: '2026-06-01T01:00:00.000Z' },
  { archiveNoticeKey: 'gwangju:3', source: 'gwangju', sourceLabel: '광주지회', title: '장애인 자립생활 지원', summary: '장애인 자립', deadline: '', archivedAt: '2026-08-01T01:00:00.000Z' }
];
const applicants = [{ id: 'a1', name: '마인드스토리' }, { id: 'a2', name: '수완지역아동센터' }, { id: 'a3', name: 'B기관' }];

test('수집일·마감일은 YYMMDD로 표시하고 마감일에는 D-day를 붙인다', () => {
  assert.equal(shortDate('2026-08-09T01:00:00.000Z'), '260809');
  assert.equal(shortDate(''), '');
  assert.equal(deadlineInfo(notices[0], '2026-08-09').text, '260814 · D-5');
  assert.equal(deadlineInfo({ deadline: '2026-08-09' }, '2026-08-09').text, '260809 · D-day');
  const closed = deadlineInfo(notices[1], '2026-08-09');
  assert.equal(closed.text, '260701 · 마감');
  assert.equal(closed.closed, true);
  assert.equal(deadlineInfo({}, '2026-08-09').text, '기간 미표기');
});

test('분야는 공고 표현으로만 분류하고 근거가 없으면 기타로 둔다', () => {
  assert.equal(archiveField(notices[0]), '아동·청소년');
  assert.equal(archiveField(notices[1]), '노인');
  assert.equal(archiveField(notices[2]), '장애인');
  assert.equal(archiveField({ title: '식별할 수 없는 공고' }), '기타');
});

test('상태는 사용자가 지정한 값을 먼저 쓰고 없으면 저장 단계·마감으로 정한다', () => {
  assert.equal(noticeStatus(notices[0], { status: '보류' }, '2026-08-09'), '보류');
  assert.equal(noticeStatus({ ...notices[0], linkedProposalStage: 'complete' }, {}, '2026-08-09'), '제출준비');
  assert.equal(noticeStatus(notices[1], {}, '2026-08-09'), '마감');
  assert.equal(noticeStatus(notices[2], {}, '2026-08-09'), '신규');
  assert.equal(stageStatus('revision-v2'), '수정중');
  assert.equal(stageStatus('coaching-v1'), '검토중');
  assert.ok(ARCHIVE_STATUSES.includes('제출준비'));
});

test('원문 버튼은 공식 공고 주소로만 연결한다', () => {
  assert.match(noticeSourceUrl(notices[0]), /^https:\/\/proposal\.chest\.or\.kr\/mobile\/mobileMainBsnsDetail\.do\?dstbBsnsCode=20260700100022/);
  assert.equal(noticeSourceUrl(notices[1]), 'https://gwangju.chest.or.kr/bbs/1000/initPostList.do');
  assert.equal(noticeSourceUrl({ source: 'central' }), 'https://chest.or.kr/bbs/1000/initPostList.do');
});

test('신청기관은 여러 곳을 연결하고 두 곳부터 외 N곳으로 줄여 표시한다', () => {
  assert.equal(applicantLabel([], applicants), '');
  assert.equal(applicantLabel(['a1'], applicants), '마인드스토리');
  assert.equal(applicantLabel(['a1', 'a2', 'a3'], applicants), '마인드스토리 외 2곳');
});

test('검색·필터·정렬·페이지는 보관 원본을 바꾸지 않고 목록만 좁힌다', () => {
  const base = { applicants, today: '2026-08-09', links: { 'central:1': { applicantIds: ['a1', 'a2'] } } };
  const all = archiveTableRows(notices, base);
  assert.equal(all.total, 3);
  assert.deepEqual(all.rows.map(row => row.key), ['central:1', 'gwangju:3', 'gwangju:2']);
  assert.equal(all.rows[0].applicantText, '마인드스토리 외 1곳');

  assert.deepEqual(archiveTableRows(notices, { ...base, query: '아동' }).rows.map(row => row.key), ['central:1']);
  assert.deepEqual(archiveTableRows(notices, { ...base, filters: { institution: '광주지회' } }).rows.map(row => row.key), ['gwangju:3', 'gwangju:2']);
  assert.deepEqual(archiveTableRows(notices, { ...base, filters: { applicant: '미연결' } }).rows.map(row => row.key), ['gwangju:3', 'gwangju:2']);
  assert.deepEqual(archiveTableRows(notices, { ...base, filters: { applicant: 'a2' } }).rows.map(row => row.key), ['central:1']);
  assert.deepEqual(archiveTableRows(notices, { ...base, filters: { deadline: '마감' } }).rows.map(row => row.key), ['gwangju:2']);
  assert.deepEqual(archiveTableRows(notices, { ...base, filters: { deadline: '7일이내' } }).rows.map(row => row.key), ['central:1']);
  assert.deepEqual(archiveTableRows(notices, { ...base, sortKey: 'deadline', sortDir: 'asc' }).rows.map(row => row.key), ['gwangju:3', 'gwangju:2', 'central:1']);

  const paged = archiveTableRows(notices, { ...base, pageSize: 5, page: 2 });
  assert.equal(paged.page, 1);
  assert.equal(paged.pageSize, 5);
  const second = archiveTableRows(notices, { ...base, pageSize: 5, page: 1, hidden: ['central:1'] });
  assert.equal(second.total, 2);
  assert.equal(second.matched, 2);
  assert.equal(second.from, 1);
  assert.equal(second.to, 2);
});

test('자료보관함 표는 기존 상태 키만 새로 저장하고 보관 원본을 지우지 않는다', () => {
  assert.match(appSource, /archiveNoticeLinks: \{\}, archiveHiddenNotices: \[\]/);
  assert.match(appSource, /restored\.archiveNoticeLinks = saved\.archiveNoticeLinks/);
  assert.doesNotMatch(appSource, /deleteArchivedNotice|deleteArchivedProposal/);
});

test('마감 상태를 진행중·마감임박·마감·확인 필요로 갈라 본다', () => {
  const stage = (deadline, today) => deadlineInfo(deadline ? { deadline } : {}, today).stage;
  assert.equal(stage('2026-08-20', '2026-08-09'), '진행중');
  assert.equal(stage('2026-08-16', '2026-08-09'), '마감임박');
  assert.equal(stage('2026-08-09', '2026-08-09'), '마감임박');
  assert.equal(stage('2026-08-08', '2026-08-09'), '마감');
  assert.equal(stage('', '2026-08-09'), '마감일 확인 필요');
});

test('마감임박과 마감일 확인 필요를 따로 골라 볼 수 있다', () => {
  const rows = [
    { source: 'central', listSn: '1', title: '진행 공고', deadline: '2026-09-30', collectedAt: '2026-08-01' },
    { source: 'central', listSn: '2', title: '임박 공고', deadline: '2026-08-12', collectedAt: '2026-08-01' },
    { source: 'central', listSn: '3', title: '기간 미표기 공고', collectedAt: '2026-08-01' }
  ];
  const pick = deadline => archiveTableRows(rows, { links: {}, applicants: [], today: '2026-08-09', hidden: [], query: '', filters: { deadline }, sortKey: 'title', sortDir: 'asc', page: 1, pageSize: 20 }).rows.map(row => row.title);
  assert.deepEqual(pick('마감임박'), ['임박 공고']);
  // 예전 이름으로 저장된 필터도 그대로 동작한다.
  assert.deepEqual(pick('7일이내'), ['임박 공고']);
  assert.deepEqual(pick('마감일 확인 필요'), ['기간 미표기 공고']);
  assert.deepEqual(pick('진행중'), ['임박 공고', '진행 공고']);
});

test('전체 보기는 쪽을 나누지 않고 모두 보여 준다', () => {
  const notices = Array.from({ length: 47 }, (_, index) => ({
    archiveNoticeKey: `k${index}`, title: `공고 ${index}`, sourceLabel: '중앙회', deadline: '2026-12-31', archivedAt: '2026-08-01'
  }));
  const paged = archiveTableRows(notices, { pageSize: 20, page: 1 });
  assert.equal(paged.rows.length, 20);
  assert.ok(paged.pageCount > 1);
  // 0은 전체다. 한 쪽에 전부 담고 쪽 번호도 1쪽으로 둔다.
  const all = archiveTableRows(notices, { pageSize: 0, page: 3 });
  assert.equal(all.rows.length, 47);
  assert.equal(all.pageCount, 1);
  assert.equal(all.page, 1);
  assert.equal(all.from, 1);
  assert.equal(all.to, 47);
  assert.ok(ARCHIVE_PAGE_SIZES.includes(0));
  assert.equal(ARCHIVE_PAGE_SIZE_LABEL(0), '전체');
  assert.equal(ARCHIVE_PAGE_SIZE_LABEL(20), '20개');
  // 비어 있을 때도 셈이 어긋나지 않는다.
  assert.equal(archiveTableRows([], { pageSize: 0 }).from, 0);
});

test('전체 보기 단추는 걸어 둔 조건도 함께 푼다', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /id="archive-show-all">전체 보기<\/button>/);
  assert.match(app, /query: '', filters: structuredClone\(initial\.archiveTable\.filters\), page: 1, pageSize: 0/);
  // 서버가 잘라 준 경우를 감추지 않는다.
  assert.match(app, /최근 500건만 불러왔습니다/);
  const api = fs.readFileSync(new URL('../functions/api/archive.js', import.meta.url), 'utf8');
  assert.match(api, /export const NOTICE_LIMIT = 500;/);
});
