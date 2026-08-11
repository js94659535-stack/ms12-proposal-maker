// 공고 수집. 배분신청 포털이 닫힌 뒤 공식 게시판 API로 옮긴 경로와 실패 판정을 고정한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleNoticeRequest } from '../functions/api/notices.js';
import {
  FAILURE, NOTICE_BOARDS, SOURCES, STAGE, detailUrl, extractPeriod, isCollectible, isNoticeCandidate,
  noticeStage, parseDates, summarizeCollection, validListPayload
} from '../server/notice-collect.js';
import { boardListResponse, boardPostResponse, noticeRequest, officialErrorPage, officialFetcher, portalDetailResponse, portalListResponse } from './fixtures/official-board.js';

const collector = fs.readFileSync(new URL('../functions/api/notices.js', import.meta.url), 'utf8');
const today = new Date().toISOString().slice(0, 10);
const PORTAL_FIELDS = {
  사업명: '2027년 배분사업 공모', 사업수행기간: '2027-01-01 ~ 2027-12-31', 공모기간: '2099-08-01 ~ 2099-08-14',
  '지원한도(원)': '30,000,000원', 개요: '사업목적: 아동 지원<br>신청대상: 사회복지기관<br>지원내용: 상담 프로그램 운영'
};
const openPortal = () => portalListResponse([{ listSn: '20990800100001', branchCode: '001', title: '2027년 배분사업 공모', deadline: '2099.08.14' }]);

test('공식 도메인 두 곳만 수집 대상이고 게시판은 허용 목록으로만 연다', () => {
  assert.deepEqual(Object.keys(SOURCES), ['central', 'gwangju']);
  assert.equal(SOURCES.central.origin, 'https://chest.or.kr');
  assert.equal(SOURCES.gwangju.origin, 'https://gwangju.chest.or.kr');
  assert.deepEqual([...NOTICE_BOARDS], ['1000']);
  assert.equal(detailUrl('https://chest.or.kr', '1000', '27293'), 'https://chest.or.kr/bbs/1000/initPostDetail.do?listSn=27293');
  // 공식 도메인 밖으로는 요청하지 않는다.
  assert.doesNotMatch(collector, /https:\/\/(?!chest\.or\.kr|gwangju\.chest\.or\.kr|proposal\.chest\.or\.kr)[a-z]/);
});

test('배분신청 포털에는 Referer를 붙인다. 없으면 오류 화면이 200으로 돌아온다', () => {
  // 2026년 8월 수집이 멈춘 진짜 원인. 이 머리말이 빠지면 다시 조용히 0건이 된다.
  assert.match(collector, /const PROPOSAL_HEADERS = Object\.freeze\(\{\s*\n\s*Referer: `\$\{PROPOSAL_ORIGIN\}\/`/);
  assert.match(collector, /headers: \{ \.\.\.PROPOSAL_HEADERS \}/);
  assert.match(collector, /if \(isOfficialErrorPage\(html\)\) throw new Error\('proposal error page'\)/);
});

test('오류페이지를 HTTP 200으로 받아도 빈 공고 성공으로 처리하지 않는다', async () => {
  // 실제 상황: proposal.chest.or.kr의 모든 경로가 오류 화면을 200으로 돌려주고 있었다.
  const response = await handleNoticeRequest(noticeRequest({ action: 'list' }), async () => officialErrorPage());
  assert.equal(response.status, 502);
  const result = await response.json();
  assert.equal(result.error, FAILURE.shape);
  assert.equal(result.collectFailed, true);
  // 출처 두 곳 × 통로 두 개가 모두 실패로 잡힌다.
  assert.equal(result.sources.length, 4);
  assert.ok(result.sources.every(source => source.status === 'failed' && source.reason === FAILURE.shape));
  assert.equal(result.notices, undefined);
});

test('목록 모양이 바뀌면 수집 실패로 알리고 0건이라고 말하지 않는다', async () => {
  const cases = [
    ['listInfo 없음', { pageInfo: { totalCount: '10' } }],
    ['listInfo가 배열이 아님', { listInfo: {}, pageInfo: { totalCount: '10' } }],
    ['총 건수 없음', { listInfo: [] }],
    ['항목 모양이 다름', { listInfo: [{ title: '제목만 있음' }], pageInfo: { totalCount: '1' } }]
  ];
  for (const [label, payload] of cases) {
    const checked = validListPayload(payload);
    assert.equal(checked.ok, false, label);
    assert.equal(checked.reason, FAILURE.shape, label);
  }
  assert.equal(validListPayload({ listInfo: [], pageInfo: { totalCount: '0' } }).ok, true);
});

test('한 통로가 막혀도 나머지 통로 수집은 계속하고 보관함에는 반영하지 않는다', async () => {
  // 포털이 오류 화면을 주고 누리집 공지사항만 살아 있는 상황.
  const fetcher = officialFetcher({
    boardList: () => boardListResponse([{ listSn: '11', sj: '2027년 배분사업 공모', rgsde: today }]),
    boardPost: () => boardPostResponse({ sj: '2027년 배분사업 공모', rgsde: today, cn: '<p>접수기간 : 2099. 12. 31.</p>' })
  });
  const response = await handleNoticeRequest(noticeRequest({ action: 'list' }), fetcher);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.notices.length, 2);
  assert.equal(result.partial, true);
  assert.equal(result.healthy, false);
  // 목록이 온전히 확인되지 않았으므로 보관함 반영은 막는다.
  assert.equal(result.syncable, false);
  const failed = result.sources.filter(source => source.status === 'failed');
  assert.deepEqual(failed.map(source => source.channel), ['proposal', 'proposal']);
  assert.deepEqual(failed.map(source => source.label), ['중앙회 배분신청 포털', '광주지회 배분신청 포털']);
  assert.ok(failed.every(source => source.reason === FAILURE.shape));
});

test('진행 중 공고가 정말 0건인 경우와 장애를 구분한다', async () => {
  const fetcher = officialFetcher({
    // 목록 틀은 정상이고 마감이 지난 공고만 남은 상태.
    portalList: url => portalListResponse([{ listSn: '20200800100001', branchCode: url.searchParams.get('bhfCode'), title: '지난 공모', deadline: '2020.01.01' }]),
    boardList: () => boardListResponse([{ listSn: '1', sj: '직원 채용 공고', rgsde: today }])
  });
  const response = await handleNoticeRequest(noticeRequest({ action: 'list' }), fetcher);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.notices, []);
  assert.equal(result.empty, true);
  assert.equal(result.healthy, true);
  assert.equal(result.collectFailed, undefined);
  // 0건이면 보관함을 건드리지 않는다.
  assert.equal(result.syncable, false);
  assert.ok(result.sources.every(source => source.status === 'ok' && source.collected === 0));
});

test('두 통로에 같은 공고가 걸리면 정리된 포털 쪽 하나만 남긴다', async () => {
  const fetcher = officialFetcher({
    portalList: url => (url.searchParams.get('bhfCode') === '001' ? openPortal() : portalListResponse([])),
    portalDetail: () => portalDetailResponse(PORTAL_FIELDS),
    boardList: params => (params.pBhfCode === '001'
      ? boardListResponse([{ listSn: '11', sj: '2027년 배분사업 공모', rgsde: today }])
      : boardListResponse([])),
    boardPost: () => boardPostResponse({ sj: '2027년 배분사업 공모', rgsde: today, cn: '<p>접수기간 : 2099. 12. 31.</p>' })
  });
  const result = await (await handleNoticeRequest(noticeRequest({ action: 'list' }), fetcher)).json();
  assert.equal(result.notices.length, 1);
  assert.equal(result.notices[0].channel, 'proposal');
  // 포털 자료라 공모기간과 지원한도가 함께 온다.
  assert.equal(result.notices[0].deadline, '2099-08-14');
  assert.equal(result.notices[0].supportLimit, '30,000,000원');
  assert.match(result.notices[0].sourceUrl, /proposal\.chest\.or\.kr\/mobile\/mobileMainBsnsDetail\.do/);
  assert.equal(result.healthy, true);
  assert.equal(result.syncable, true);
});

test('공모 글만 상세를 읽고 채용·선정결과는 거른다', () => {
  for (const title of ['2027년 배분사업 공모', '○○지원사업 신청 접수 안내', '아동복지 지원사업 공모']) {
    assert.equal(isNoticeCandidate(title), true, title);
  }
  for (const title of ['직원 채용 공고', '2026년 공모사업 선정결과 발표', '심사 결과 안내', '자원봉사자 모집', '입찰 공고', '', '회의 결과']) {
    assert.equal(isNoticeCandidate(title), false, title);
  }
  // 기존 제외 규칙도 그대로 적용한다.
  assert.equal(isNoticeCandidate('교육 참가 신청 모집', value => !/교육.{0,20}(?:신청|모집)/.test(value)), false);
});

test('본문에서 접수기간과 마감일을 읽고 못 읽으면 확인 필요로 둔다', () => {
  const labeled = extractPeriod('사업 안내\n접수기간 : 2026. 8. 1.(금) ~ 2026. 8. 22.(금) 18:00\n문의처 062-000-0000');
  assert.equal(labeled.deadline, '2026-08-22');
  assert.equal(labeled.deadlineSource, 'labeled');
  assert.match(labeled.applicationPeriod, /접수기간/);

  assert.equal(extractPeriod('신청기간: 2026-09-01 ~ 2026-09-30').deadline, '2026-09-30');
  assert.equal(extractPeriod('제출 기한은 2026년 10월 5일까지입니다.').deadline, '2026-10-05');
  // 이름표가 없으면 본문의 마지막 날짜를 쓰되 근거를 구분해 둔다.
  const body = extractPeriod('행사는 2026.03.02에 열립니다. 서류는 2026.03.20에 마감합니다.');
  assert.equal(body.deadline, '2026-03-20');
  assert.equal(body.deadlineSource, 'body');
  assert.deepEqual(extractPeriod('날짜가 없는 안내문'), { applicationPeriod: '', deadline: '', deadlineSource: '' });
  // 말이 되지 않는 날짜는 버린다.
  assert.deepEqual(parseDates('1999.01.01 / 2101.01.01 / 2026.13.01 / 2026.02.30 를 지나 2026.02.28').map(found => found.value), ['2026-02-28']);
});

test('진행 상태는 마감 D-day로 정하고 마감일이 없으면 확인 필요로 남긴다', () => {
  assert.deepEqual(noticeStage('2026-08-20', '2026-08-11'), { stage: STAGE.open, daysLeft: 9 });
  assert.deepEqual(noticeStage('2026-08-18', '2026-08-11'), { stage: STAGE.closingSoon, daysLeft: 7 });
  assert.deepEqual(noticeStage('2026-08-11', '2026-08-11'), { stage: STAGE.closingSoon, daysLeft: 0 });
  assert.deepEqual(noticeStage('2026-08-10', '2026-08-11'), { stage: STAGE.closed, daysLeft: -1 });
  assert.deepEqual(noticeStage('', '2026-08-11'), { stage: STAGE.unknown, daysLeft: null });

  // 마감일을 못 읽은 글은 최근 것만 남긴다.
  assert.equal(isCollectible({ deadline: '', registeredAt: '2026-08-01' }, '2026-08-11'), true);
  assert.equal(isCollectible({ deadline: '', registeredAt: '2026-01-01' }, '2026-08-11'), false);
  assert.equal(isCollectible({ deadline: '2026-08-10', registeredAt: '2026-08-01' }, '2026-08-11'), false);
  assert.equal(isCollectible({ deadline: '2026-08-11', registeredAt: '2026-01-01' }, '2026-08-11'), true);
});

test('수집 요약이 전부 실패·일부 실패·정상 0건을 갈라낸다', () => {
  const ok = { status: 'ok', label: '중앙회' };
  const bad = { status: 'failed', label: '광주지회' };
  assert.deepEqual(summarizeCollection([ok, ok], [{}]), { healthy: true, partial: false, allFailed: false, empty: false, syncable: true, failedLabels: [] });
  assert.deepEqual(summarizeCollection([ok, ok], []), { healthy: true, partial: false, allFailed: false, empty: true, syncable: false, failedLabels: [] });
  assert.deepEqual(summarizeCollection([ok, bad], [{}]), { healthy: false, partial: true, allFailed: false, empty: false, syncable: false, failedLabels: ['광주지회'] });
  assert.deepEqual(summarizeCollection([bad, bad], []), { healthy: false, partial: false, allFailed: true, empty: false, syncable: false, failedLabels: ['광주지회', '광주지회'] });
});

test('수집 실패는 보관 공고를 지우거나 덮어쓰지 않는다', () => {
  const archive = fs.readFileSync(new URL('../functions/api/archive.js', import.meta.url), 'utf8');
  // 보관함 동기화는 넣기·갱신만 한다. 목록에 없다고 지우지 않는다.
  assert.doesNotMatch(archive, /DELETE FROM archived_notices/);
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(result\.syncable\) \{/);
  assert.match(app, /일부 출처를 확인하지 못해 공고보관함에는 반영하지 않았습니다/);
});

test('화면 안내는 진행 중 공고 없음과 연결 방식 변경을 다르게 말한다', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /현재 진행 중인 공고가 없습니다/);
  assert.equal(FAILURE.shape, '공식 사이트 연결 방식이 변경되어 공고를 가져오지 못했습니다.');
  assert.match(app, /공고를 가져오지 못했습니다\. \$\{failedLabels\[0\]\.reason\}/);
});

test('누락 공고 URL 추가는 공식 상세 주소만 받고 같은 식별자로 중복을 막는다', async () => {
  const fetcher = async () => boardPostResponse({ sj: '2027년 배분사업 공모', rgsde: today, cn: '<p>접수기간 : 2099. 12. 31.</p>' });
  const added = await handleNoticeRequest(noticeRequest({ action: 'importUrl', url: 'https://gwangju.chest.or.kr/bbs/1000/initPostDetail.do?listSn=303', existingNotices: [] }), fetcher);
  const result = await added.json();
  assert.equal(result.duplicate, false);
  assert.equal(result.notice.deadline, '2099-12-31');
  assert.equal(result.notice.sourceUrl, 'https://gwangju.chest.or.kr/bbs/1000/initPostDetail.do?listSn=303');
  // 같은 글을 다시 넣으면 원본을 다시 부르지 않고 중복으로 답한다.
  const again = await handleNoticeRequest(noticeRequest({ action: 'importUrl', url: 'https://gwangju.chest.or.kr/bbs/1000/initPostDetail.do?listSn=303', existingNotices: [result.notice] }), () => { throw new Error('다시 조회하면 안 된다'); });
  assert.equal((await again.json()).duplicate, true);
  // 공식 도메인이 아니면 통신도 하지 않는다.
  const other = await handleNoticeRequest(noticeRequest({ action: 'importUrl', url: 'https://example.com/bbs/1000/initPostDetail.do?listSn=1', existingNotices: [] }), () => { throw new Error('호출되면 안 된다'); });
  assert.equal(other.status, 400);
});
