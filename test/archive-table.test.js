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

test('검색칸에 브라우저가 계정 정보를 채우지 못하게 한다', () => {
  // 자동완성이 검색칸에 이메일을 넣어 보관 공고 26건이 0건으로 보였다.
  for (const id of ['archive-query', 'premium-history-query', 'admin-notice-query', 'operator-search', 'notice-query']) {
    const at = appSource.indexOf(`id="${id}"`);
    assert.ok(at > 0, id);
    assert.ok(appSource.slice(at, at + 160).includes('autocomplete="off"'), id);
  }
  // 왜 0건인지 화면이 말한다. 검색어 탓인 줄 모르면 자료가 사라진 줄 안다.
  assert.match(appSource, /검색어 「\$\{escapeHtml\(table\.query\)\}」에 맞는 공고가 없습니다\. 보관 공고는 \$\{data\.total\}건 있습니다/);
});

test('공고보관함은 처음부터 모두 보여 준다', () => {
  // 보관함은 모아 둔 것을 보러 오는 곳이다. 스무 건씩 끊어 보여 줄 이유가 없다.
  assert.match(appSource, /archiveTable: \{ query: '', sortKey: 'collectedAt', sortDir: 'desc', page: 1, pageSize: 0,/);
  // 「전체 보기」는 눈에 띄어야 한다.
  assert.match(appSource, /<button class="button primary" id="archive-show-all">전체 보기<\/button>/);
  // 저장해 둔 검색어를 다음 방문에 다시 채우지 않는다. 자동완성 값이 남아 목록을 가렸다.
  assert.match(appSource, /restored\.archiveTable\.query = '';/);
});

test('보관함 검색은 치는 동안 걸러 주고 찾는 자리를 넓게 본다', async () => {
  const { searchText } = await import('../src/archive-table.js');
  const notices = [
    { archiveNoticeKey: 'a', title: '아동 정서지원 사업', sourceLabel: '중앙회', deadline: '2026-12-31',
      notice: { eligibility: '초등학생' }, eligibility: '초등학생', dstbBsnsCode: '20260700100031' },
    { archiveNoticeKey: 'b', title: '어르신 급식 지원', sourceLabel: '광주지회', deadline: '2026-12-31' }
  ];
  // 제목으로 찾는다.
  assert.equal(archiveTableRows(notices, { query: '아동' }).matched, 1);
  // 기관으로도 찾는다.
  assert.equal(archiveTableRows(notices, { query: '광주지회' }).matched, 1);
  // 낱말을 늘리면 좁아진다.
  assert.equal(archiveTableRows(notices, { query: '아동 없는말' }).matched, 0);
  // 비우면 모두 나온다.
  assert.equal(archiveTableRows(notices, { query: '' }).matched, 2);
  // 지원대상·공고번호까지 찾는 자리에 넣는다. 제목만 뒤지면 놓친다.
  const row = archiveTableRows(notices, {}).rows.find(item => item.key === 'a');
  const text = searchText(row);
  assert.ok(text.includes('아동'));
  assert.ok(text.includes('중앙회'));

  // 화면: 치는 동안 바로 걸러 주고, 지우는 단추와 결과 안내가 함께 있다.
  assert.match(appSource, /archiveQuery\.oninput = event => \{/);
  // 한글 조합 중에는 다시 그리지 않는다. 「검색」이 ㄱ ㅓ ㅁ 으로 흩어졌다.
  assert.match(appSource, /if \(event\.isComposing\) return;/);
  assert.match(appSource, /addEventListener\('compositionend', event => applyQuery\(event\.target\.value\)\)/);
  // 표 안쪽만 갈아 끼운다. 입력칸을 새로 만들면 조합이 끊긴다.
  assert.match(appSource, /function redrawArchiveRows\(\) \{/);
  assert.match(appSource, /function bindArchiveRows\(\) \{/);
  assert.match(appSource, /id="archive-clear-query"/);
  assert.match(appSource, /검색어 「\$\{escapeHtml\(table\.query\)\}」 · 보관 공고 \$\{data\.total\}건 가운데 \$\{data\.matched\}건이 맞습니다/);
});

test('검색칸이 눈에 보인다', () => {
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  // 테두리가 바탕과 같은 색이라 칸이 있는 줄도 몰랐다.
  assert.match(css, /\.archive-toolbar input\{[^}]*border:1px solid #b9ac9e/);
  assert.match(css, /\.archive-toolbar input\{[^}]*background:#fff url/);
  assert.match(css, /\.archive-toolbar input:focus\{[^}]*box-shadow/);
  // 무엇을 하는 칸인지 이름을 붙인다.
  assert.match(appSource, /<label class="archive-search-label" for="archive-query">보관 공고 검색<\/label>/);
});

test('보관함 목록은 저장해 두고 들어올 때마다 다시 받지 않는다', () => {
  // 나갔다 들어올 때마다 서버를 불러 기다리게 했다. 저장해 두고 뒤에서 조용히 새로 고친다.
  assert.match(appSource, /archiveNotices: \(state\.archiveNotices \|\| \[\]\)\.slice\(0, CACHED_NOTICES\)/);
  assert.match(appSource, /const CACHED_NOTICES = 120;/);
  // 받아 온 것이 앞서 보여 준 것과 같으면 다시 그리지 않는다. 깜빡이지 않는다.
  assert.match(appSource, /if \(!same\(notices, state\.archiveNotices \|\| \[\]\)\) setState\(\{ archiveNotices: notices \}\)/);
  // 열 때 이미 있으면 기다리게 하지 않는다.
  assert.match(appSource, /if \(!archiveLoaded\) void loadRecentArchive\(\);/);
});

test('마감된 공고는 따로 모아 두고 지우지 않는다', () => {
  const today = '2026-08-16';
  const notices = [
    { archiveNoticeKey: 'live', title: '진행 공고', sourceLabel: '중앙회', deadline: '2026-12-31' },
    { archiveNoticeKey: 'done', title: '지난 공고', sourceLabel: '중앙회', deadline: '2026-01-31' }
  ];
  // 진행 중 상자에는 마감이 섞이지 않는다.
  const open = archiveTableRows(notices, { today, scope: 'open' });
  assert.deepEqual(open.rows.map(row => row.key), ['live']);
  // 마감 상자에는 마감만 담긴다. 자료는 그대로 있다.
  const closed = archiveTableRows(notices, { today, scope: 'closed' });
  assert.deepEqual(closed.rows.map(row => row.key), ['done']);
  // 갈래를 정하지 않으면 예전처럼 모두 나온다.
  assert.equal(archiveTableRows(notices, { today }).total, 2);

  // 화면: 마감된 공고함이 따로 있고, 몇 건인지 위 상자에도 적는다.
  assert.match(appSource, /function closedArchiveView\(\)/);
  assert.match(appSource, /id="closed-archive-box"/);
  assert.match(appSource, /\['마감된 공고', archiveTableData\('closed'\)\.total, '아래 「마감된 공고함」에 보관'\]/);
  assert.match(appSource, /마감된 공고로는 새 계획서를 시작하지 않습니다/);
  // 지우는 문장이 없다.
  assert.ok(!/DELETE FROM archived_notices/i.test(appSource));
});

test('마감된 공고는 최고관리자만 지우고, 계획서가 걸린 것은 남긴다', async () => {
  const api = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');
  // 관리자 경로 전체가 이미 admin만 통과한다. 그 안에 삭제를 둔다.
  assert.match(api, /if \(body\.action === 'deleteNotices'\) return deleteNotices\(env\.ARCHIVE_DB, actor, body\);/);
  // 계획서가 걸린 공고는 지우지 않는다. 계획서가 근거를 잃는다.
  assert.match(api, /SELECT DISTINCT notice_key FROM archived_proposals WHERE notice_key IN/);
  assert.match(api, /const removable = rows\.filter\(row => !blocked\.has\(String\(row\.source_key\)\)\)/);
  assert.match(api, /고른 공고에는 저장된 계획서가 걸려 있어 지우지 않았습니다/);
  // 무엇을 지웠는지 남긴다.
  assert.match(api, /action: 'notice\.delete'/);
  // 한 번에 너무 많이 지우지 않는다.
  assert.match(api, /\.slice\(0, 200\)/);

  // 화면: 체크칸과 삭제 단추는 최고관리자에게만.
  assert.match(appSource, /data-closed-select="\$\{escapeHtml\(row\.key\)\}"/);
  assert.match(appSource, /id="closed-delete-selected"/);
  assert.match(appSource, /\$\{isAdmin\(\) \? `<div class="archive-bulk">/);
  // 되돌릴 수 없다는 것을 먼저 알린다.
  assert.match(appSource, /영구 삭제할까요\? 되돌릴 수 없습니다/);
});

test('관심 항목을 적어 두면 그 공고에 표시가 붙는다', async () => {
  const { DEFAULT_WATCH, watchHits } = await import('../src/archive-table.js');
  const notices = [
    { archiveNoticeKey: 'a', title: '아동 디지털 리터러시 교육사업 참여기관 모집', sourceLabel: '부스러기', deadline: '2026-08-21' },
    { archiveNoticeKey: 'b', title: '어르신 급식 지원', sourceLabel: '중앙회', deadline: '2026-08-30' }
  ];
  const rows = archiveTableRows(notices, { today: '2026-08-16' }).rows;
  const hit = rows.find(row => row.key === 'a');
  assert.deepEqual(watchHits(hit, ['디지털 리터러시']), ['디지털 리터러시']);
  assert.deepEqual(watchHits(rows.find(row => row.key === 'b'), ['디지털 리터러시']), []);
  // 처음 쓰는 사람에게 줄 기본 낱말.
  assert.ok(DEFAULT_WATCH.includes('디지털 리터러시') && DEFAULT_WATCH.includes('AI'));

  // 관심 항목만 보기.
  const only = archiveTableRows(notices, { today: '2026-08-16', watch: ['디지털'], watchOnly: true });
  assert.deepEqual(only.rows.map(row => row.key), ['a']);
  // 낱말을 하나도 적지 않았으면 걸러 내지 않는다.
  assert.equal(archiveTableRows(notices, { today: '2026-08-16', watch: [], watchOnly: true }).total, 2);

  // 화면: 낱말을 넣고 빼고, 걸린 공고에 「관심」 표시가 붙는다.
  assert.match(appSource, /id="watch-add"/);
  assert.match(appSource, /data-watch-remove="\$\{escapeHtml\(word\)\}"/);
  assert.match(appSource, /id="watch-only"/);
  assert.match(appSource, /watchHits\(row, watchWords\(\)\)\.length \? `<span class="status 충족 watch-mark"/);
});
