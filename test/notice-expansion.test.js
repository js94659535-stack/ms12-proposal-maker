// 수집 출처 확대. 분류·중복 통합·마감 판정·실패 시 자료 보존을 고정한다.
// 통신은 하지 않는다. 실제 응답에서 뜬 모양만 옮겨 와 해석기에 먹인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FITNESS, classifyNotice, classifyTitle, searchable } from '../server/notice-classify.js';
import { ALLOWED_ORIGINS, BUSINESS_TYPES, SOURCES, SOURCE_GROUPS, allowedOrigin, businessTypeOf, runnable } from '../server/notice-sources.js';
import { baboCategoryHint, isSchoolNotice, parseBaboList, parseG2bPayload, parseKihfList } from '../server/source-parsers.js';
import { mergeAcrossSources, sameNotice } from '../server/notice-dedupe.js';
import { bodyTextOf, collectExtraSources } from '../server/extra-collect.js';

// 실제 응답에서 옮겨 온 최소 형태.
const KIHF_LIST = `<table class="list"><tbody>
<tr><td class="none">604</td><td class="text-left"><a href="view.do?article_seq=1115930">[입찰공고] 2026년 ○○ 운영 용역</a></td><td><img src="/images/board/add_file.png" alt="첨부파일"></td><td class="none">2026-08-10</td></tr>
<tr><td class="none">603</td><td class="text-left"><a href="view.do?article_seq=1115916">[사전규격공고] 2026년 ○○ 용역</a></td><td></td><td class="none">2026-07-31</td></tr>
</tbody></table>`;
const BABO_LIST = `<div class="li_board">
<ul class="li_body notice_body"><li class="tit"><a href="?category=x"><em>공고</em></a><a class="list_text_title _fade" href="/notice/?bmode=view&idx=172953530&t=board">2026년 ○○지원사업 신청안내</a></li><li class="date">2026-08-08</li></ul>
<ul class="li_body"><li class="tit"><a href="?category=y"><em>결과</em></a><a class="list_text_title" href="/notice/?bmode=view&idx=172811066&t=board">2026년 상반기 선정결과 안내</a></li><li class="date">2026-08-01</li></ul>
</div>`;
const G2B_OK = {
  response: {
    header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
    body: {
      totalCount: 2,
      items: [
        { bidNtceNo: '20260812001', bidNtceOrd: '00', bidNtceNm: '학생 정서행동 상담 프로그램 운영 용역', ntceInsttNm: '광주광역시교육청', dminsttNm: '광주○○중학교', bidNtceDt: '2026-08-12 10:00:00', bidClseDt: '2026-08-25 18:00:00', bidNtceDtlUrl: 'https://www.g2b.go.kr/x', presmptPrce: '30000000' },
        { bidNtceNo: '20260812002', bidNtceOrd: '00', bidNtceNm: '책상 및 의자 구매', ntceInsttNm: '광주광역시교육청', dminsttNm: '광주○○초등학교', bidNtceDt: '2026-08-12 10:00:00', bidClseDt: '2026-08-20 18:00:00', bidNtceDtlUrl: 'https://www.g2b.go.kr/y', presmptPrce: '5000000' }
      ]
    }
  }
};

// ---------- 해석기 ----------

test('건강가정진흥원 목록을 읽고 오류 화면은 성공으로 넘기지 않는다', () => {
  const parsed = parseKihfList(KIHF_LIST);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].listSn, '1115930');
  assert.equal(parsed.rows[0].registeredAt, '2026-08-10');
  assert.equal(parsed.rows[0].hasAttachment, true);
  // 오류 화면·구조 변경은 실패다. 0건 성공이 아니다.
  for (const bad of ['<html><body>찾으시는 페이지가 없습니다</body></html>', '<table class="list"><tbody></tbody></table>', '']) {
    assert.equal(parseKihfList(bad).ok, false);
  }
});

test('바보의나눔 목록을 읽고 게시판 분류를 그대로 가져온다', () => {
  const parsed = parseBaboList(BABO_LIST);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].listSn, '172953530');
  assert.equal(parsed.rows[0].category, '공고');
  assert.equal(baboCategoryHint('공고'), 'notice');
  assert.equal(baboCategoryHint('결과'), 'result');
  assert.equal(baboCategoryHint('신청양식'), 'form');
  assert.equal(parseBaboList('<html>오류</html>').ok, false);
});

test('나라장터 응답을 읽고 인증키 오류를 실패로 구분한다', () => {
  const parsed = parseG2bPayload(G2B_OK);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].noticeNo, '20260812001');
  assert.equal(parsed.rows[0].deadline, '2026-08-25');
  // 인증키가 없거나 서비스가 죽으면 실패로 남는다. 0건 성공이 아니다.
  const fault = parseG2bPayload({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnAuthMsg: '등록되지 않은 서비스키' } } });
  assert.equal(fault.ok, false);
  assert.match(fault.reason, /등록되지 않은 서비스키/);
  assert.equal(parseG2bPayload({ response: { header: { resultCode: '99', resultMsg: '오류' } } }).ok, false);
});

test('나라장터에서는 학교·교육청 발주의 교육·상담 용역만 고른다', () => {
  const rows = parseG2bPayload(G2B_OK).rows;
  assert.equal(isSchoolNotice(rows[0]), true, '정서행동 상담 용역');
  assert.equal(isSchoolNotice(rows[1]), false, '책상·의자 구매는 물품이다');
  assert.equal(isSchoolNotice({ organization: '○○시청', title: '교육 프로그램 운영' }), false, '학교 발주가 아니다');
});

// ---------- 분류 ----------

test('제목만으로는 제안 가능을 확정하지 않는다', () => {
  const head = classifyTitle('2026년 아동 돌봄 지원사업 공모');
  assert.equal(head.fitness, FITNESS.proposal);
  // 본문을 읽지 못했으면 확정하지 않는다.
  const noBody = classifyNotice({ title: '2026년 아동 돌봄 지원사업 공모' });
  assert.equal(noBody.fitness, FITNESS.unknown);
  assert.match(noBody.reason, /상세 본문을 읽지 못해/);
  // 신청자격이 확인되면 확정한다.
  const withBody = classifyNotice({ title: '2026년 아동 돌봄 지원사업 공모', body: '신청자격: 광주 지역 비영리 법인' });
  assert.equal(withBody.fitness, FITNESS.proposal);
  assert.equal(withBody.confirmed, true);
});

test('채용·선정결과·물품·참여자 모집은 기본 검색에서 빠진다', () => {
  const cases = [
    ['2026년 사무직원 채용 공고', FITNESS.hiring],
    ['2026년 상반기 배분사업 선정결과 발표', FITNESS.result],
    ['사무용 책상 물품구매 입찰공고', FITNESS.goods],
    ['가족센터 프로그램 참여자 모집', FITNESS.participant],
    ['2026년 지원사업 설명회 개최 안내', FITNESS.briefing],
    ['○○사업 사전규격공고', FITNESS.briefing]
  ];
  for (const [title, expected] of cases) {
    assert.equal(classifyTitle(title).fitness, expected, title);
    assert.equal(searchable(expected), false, title);
  }
  assert.equal(searchable(FITNESS.proposal), true);
  assert.equal(searchable(FITNESS.bid), true);
});

test('본문에 다른 글 제목이 섞여 있어도 공고를 선정결과로 바꾸지 않는다', () => {
  // 게시판 상세 페이지에는 다른 글 목록이 함께 실린다. 그것 때문에 잘못 분류하던 문제.
  const verdict = classifyNotice({
    title: '[공고] 2026년 여성가장 긴급지원사업 신청안내',
    body: '신청대상: 저소득 여성가장 가구\n제출서류: 신청서\n이전글 2026년 상반기 선정결과 안내'
  });
  assert.notEqual(verdict.fitness, FITNESS.result);
});

test('입찰이라도 용역·운영 성격을 확인하지 못하면 확정하지 않는다', () => {
  const vague = classifyNotice({ title: '○○ 입찰공고', body: '자세한 내용은 첨부파일 참조. 신청자격 별도 안내.', sourceKind: 'bid-board' });
  assert.equal(vague.fitness, FITNESS.unknown);
  const service = classifyNotice({ title: '○○ 프로그램 운영 용역 입찰공고', body: '신청자격: 비영리법인. 용역 수행 기관 모집.', sourceKind: 'bid-board' });
  assert.equal(service.fitness, FITNESS.bid);
});

test('본문 추출은 글이 시작하는 자리부터 읽는다', () => {
  const html = '<div class="header">다른 글 선정결과 안내</div><div class="view_tit">진짜 제목</div><p>신청자격: 비영리법인</p>';
  const whole = bodyTextOf(html);
  const fromTitle = bodyTextOf(html, 'view_tit');
  assert.ok(whole.includes('선정결과'));
  assert.ok(!fromTitle.includes('선정결과'), '머리말은 읽지 않는다');
  assert.ok(fromTitle.includes('신청자격'));
});

// ---------- 사업 유형과 수집 출처 ----------

test('사업 유형과 수집 출처는 다른 축이고 바보의나눔은 출처다', () => {
  assert.deepEqual(BUSINESS_TYPES.map(item => item.key), ['chest', 'family', 'edu', 'g2b', 'foundation', 'general', 'busrugy']);
  // 바보의나눔은 사업 유형에 없다.
  assert.ok(!BUSINESS_TYPES.some(item => /바보/.test(item.label)));
  // 수집 출처에는 있고, 민간재단·공익법인 유형에 붙는다.
  const babo = SOURCE_GROUPS.find(group => group.key === 'babo');
  assert.equal(babo.label, '바보의나눔');
  assert.equal(babo.businessType, 'foundation');
  assert.equal(businessTypeOf('babo-notice'), 'foundation');
  assert.equal(businessTypeOf('kihf-bid'), 'family');
  assert.equal(businessTypeOf('g2b-service'), 'g2b');
  assert.deepEqual(SOURCE_GROUPS.map(group => group.key), ['chest', 'kihf', 'edu', 'g2b', 'babo', 'busrugy']);
  // 부스러기사랑나눔회는 아임웹 게시판이라 바보의나눔 수집기를 그대로 쓴다. 자기 유형으로 붙는다.
  assert.equal(businessTypeOf('busrugy-notice'), 'busrugy');
});

test('허용된 공식 도메인 밖으로는 요청하지 않는다', () => {
  for (const origin of ALLOWED_ORIGINS) assert.match(origin, /^https:\/\//);
  assert.equal(allowedOrigin('https://www.kihf.or.kr/web/x'), true);
  assert.equal(allowedOrigin('https://babo.or.kr/notice'), true);
  assert.equal(allowedOrigin('https://apis.data.go.kr/1230000/x'), true);
  assert.equal(allowedOrigin('https://example.com/'), false);
  assert.equal(allowedOrigin('https://school.example.kr/'), false, '개별 학교 홈페이지는 대상이 아니다');
});

test('연결하지 못한 출처와 인증키 없는 출처는 돌리지 않는다', () => {
  const g2b = SOURCES.find(source => source.id === 'g2b-service');
  assert.equal(runnable(g2b, { secrets: {} }).reason, 'missing-secret');
  assert.equal(runnable(g2b, { secrets: { G2B_SERVICE_KEY: 'x' } }).ok, true);
  for (const id of ['edu-gwangju', 'edu-jeonnam']) {
    const source = SOURCES.find(item => item.id === id);
    assert.equal(source.verified, false);
    assert.equal(runnable(source, {}).reason, 'not-connected');
    assert.ok(source.note.length > 10, '왜 미연동인지 적혀 있다');
  }
  // 관리자가 끄면 돌지 않는다.
  const kihf = SOURCES.find(source => source.id === 'kihf-notice');
  assert.equal(runnable(kihf, { settings: { 'kihf-notice': false } }).reason, 'disabled');
  assert.equal(runnable(kihf, {}).ok, true);
});

// ---------- 중복 통합 ----------

test('공고번호가 같으면 하나로 묶고 출처 링크는 모두 남긴다', () => {
  const merged = mergeAcrossSources([
    { sourceId: 'edu-jeonnam', sourceLabel: '전남교육청', noticeNo: '20260812001', title: '학생 상담 프로그램 운영 용역', organization: '전라남도교육청', sourceUrl: 'https://www.jge.go.kr/a', deadline: '' },
    { sourceId: 'g2b-service', sourceLabel: '나라장터', noticeNo: '20260812001', title: '학생 상담 프로그램 운영 용역(재공고)', organization: '전라남도교육청', sourceUrl: 'https://www.g2b.go.kr/b', deadline: '2026-08-25' }
  ]);
  assert.equal(merged.notices.length, 1);
  assert.equal(merged.merged, 1);
  // 마감일을 아는 쪽이 대표가 된다.
  assert.equal(merged.notices[0].deadline, '2026-08-25');
  // 확인된 링크는 둘 다 남는다.
  assert.equal(merged.notices[0].sourceLinks.length, 2);
  assert.deepEqual(merged.notices[0].mergedFrom.sort(), ['edu-jeonnam', 'g2b-service']);
});

test('제목이 같아도 기관이나 회차가 다르면 묶지 않는다', () => {
  const base = { title: '2026년 돌봄 지원사업 공모', organization: '가나재단', deadline: '2026-09-01' };
  assert.equal(sameNotice(base, { ...base }).same, true);
  assert.equal(sameNotice(base, { ...base, organization: '다라재단' }).same, false);
  assert.equal(sameNotice(base, { ...base, deadline: '2026-10-01' }).same, false);
  // 「재공고」·「[공고]」 같은 꾸밈말은 떼고 본다.
  assert.equal(sameNotice(base, { ...base, title: '[공고] 2026년 돌봄 지원사업 공모(재공고)' }).same, true);
});

// ---------- 출처 독립성과 자료 보존 ----------

test('한 출처가 죽어도 다른 출처는 계속 모은다', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.includes('kihf')) throw new Error('http 503');
    if (url.includes('babo.or.kr/notice/?bmode=view')) return new Response('<div class="view_tit">제목</div>신청자격: 비영리법인', { status: 200 });
    if (url.includes('babo.or.kr/notice')) return new Response(BABO_LIST, { status: 200 });
    throw new Error('unexpected');
  };
  const result = await collectExtraSources(fetcher, { settings: {}, secrets: {} });
  const byId = Object.fromEntries(result.sources.map(status => [status.source, status]));
  assert.equal(byId['kihf-notice'].status, 'failed');
  assert.equal(byId['kihf-bid'].status, 'failed');
  assert.equal(byId['babo-notice'].status, 'ok', '한 곳이 죽어도 다른 곳은 돈다');
  // 인증키가 없는 나라장터는 실패가 아니라 건너뛴 것이다.
  assert.equal(byId['g2b-service'].status, 'skipped');
  assert.equal(byId['g2b-service'].reason, 'missing-secret');
  // 허용 도메인 밖으로는 한 번도 나가지 않는다.
  for (const url of calls) assert.equal(allowedOrigin(url), true, url);
});

test('전부 실패하면 공고를 하나도 내놓지 않는다', async () => {
  const fetcher = async () => new Response('오류 화면', { status: 200 });
  const result = await collectExtraSources(fetcher, { settings: {}, secrets: {} });
  assert.equal(result.notices.length, 0);
  const failed = result.sources.filter(status => status.status === 'failed');
  assert.ok(failed.length >= 3, '오류 화면을 성공으로 적지 않는다');
  // 보관함에 넘길 것이 없으니 기존 자료는 그대로 남는다(반영 판정은 notice-run이 한다).
});

test('마이그레이션은 열과 표를 더하기만 한다', () => {
  const sql = fs.readFileSync(new URL('../migrations/0014_notice_sources.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS notice_source_settings/);
  assert.match(sql, /ALTER TABLE archived_notices ADD COLUMN source_id TEXT NOT NULL DEFAULT ''/);
  assert.match(sql, /ALTER TABLE archived_notices ADD COLUMN fitness TEXT NOT NULL DEFAULT ''/);
  for (const destructive of ['DROP ', 'DELETE ', 'UPDATE archived_notices SET']) assert.ok(!sql.includes(destructive), destructive);
});

test('출처 설정 변경은 최고관리자만 한다', async () => {
  const { BLOCKED_ACTIONS } = await import('../server/operator-scope.js');
  assert.equal(BLOCKED_ACTIONS.get('setNoticeSource'), '수집 출처 사용·중지');
  const admin = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');
  assert.match(admin, /if \(body\.action === 'setNoticeSource'\)/);
});

test('자동수집은 AI를 부르지 않고 개별 학교를 훑지 않는다', () => {
  for (const file of ['extra-collect.js', 'source-parsers.js', 'notice-classify.js', 'notice-sources.js']) {
    const source = fs.readFileSync(new URL(`../server/${file}`, import.meta.url), 'utf8');
    for (const forbidden of ['openai', 'OPENAI', 'callModel', 'gpt-']) assert.ok(!source.includes(forbidden), `${file}: ${forbidden}`);
  }
  const collect = fs.readFileSync(new URL('../server/extra-collect.js', import.meta.url), 'utf8');
  // 요청 사이에 간격을 둔다.
  assert.match(collect, /REQUEST_GAP_MS/);
  assert.match(collect, /allowedOrigin\(url\)/);
});

test('돌리지 않은 출처는 실패로 세지 않는다', async () => {
  const { decideRun, RUN_STATUS } = await import('../server/notice-run.js');
  const ok = { source: 'kihf-notice', status: 'ok', listed: 30, candidates: 5, collected: 2 };
  const skipped = { source: 'g2b-service', status: 'skipped', reason: 'missing-secret' };
  const notConnected = { source: 'edu-gwangju', status: 'skipped', reason: 'not-connected' };

  const decision = decideRun({ sources: [ok, skipped, notConnected], collected: 2, baseline: 2 });
  // 인증키가 없어 돌리지 않은 것은 실패가 아니다. 정상 성공으로 남아야 한다.
  assert.equal(decision.status, RUN_STATUS.ok);
  assert.equal(decision.failureCode, '');
  assert.equal(decision.healthy, true);
  assert.equal(decision.skippedSources, 2);
  // 기록에는 건너뛴 이유를 그대로 남긴다.
  const g2b = decision.sources.find(item => item.source === 'g2b-service');
  assert.equal(g2b.status, 'skipped');
  assert.equal(g2b.code, 'missing-secret');
  // 실제로 돈 출처가 모두 실패하면 그때는 실패다.
  const allFailed = decideRun({ sources: [{ ...ok, status: 'failed', reason: '연결 실패' }, skipped], collected: 0 });
  assert.equal(allFailed.status, RUN_STATUS.failed);
});

test('실행할 때마다 시작 출처를 옮긴다', async () => {
  const { rotate } = await import('../server/extra-collect.js');
  const rows = ['a', 'b', 'c', 'd'];
  const twelveHours = 12 * 60 * 60 * 1000;
  const first = rotate(rows, new Date(0));
  const second = rotate(rows, new Date(twelveHours));
  const third = rotate(rows, new Date(2 * twelveHours));
  // 목록은 그대로고 시작점만 한 칸씩 옮긴다. 뒤쪽 출처도 앞자리에 선다.
  assert.equal(first.length, rows.length);
  assert.deepEqual([...first].sort(), [...rows].sort());
  assert.notDeepEqual(first, second);
  assert.deepEqual(second, ['b', 'c', 'd', 'a']);
  assert.deepEqual(third, ['c', 'd', 'a', 'b']);
  assert.deepEqual(rotate(['only'], new Date(0)), ['only']);
});

test('상세 열기 예산을 출처끼리 나눠 쓴다', async () => {
  const { makeBudget, DETAIL_BUDGET } = await import('../server/extra-collect.js');
  const budget = makeBudget(3);
  assert.equal(budget.take(), true);
  assert.equal(budget.take(), true);
  assert.equal(budget.take(), true);
  // 다 쓰면 더 열지 않는다. 앞 출처가 다 먹으면 뒤 출처는 목록조차 못 연다.
  assert.equal(budget.take(), false);
  assert.equal(budget.spent, 3);
  assert.ok(DETAIL_BUDGET >= 12 && DETAIL_BUDGET <= 40, '한 번 실행에서 여는 상세 총량');
  const source = await import('node:fs').then(fs => fs.readFileSync(new URL('../server/extra-collect.js', import.meta.url), 'utf8'));
  // 예산을 다 써서 못 연 글은 숨기지 않고 센다.
  assert.match(source, /status\.detailSkipped = \(status\.detailSkipped \|\| 0\) \+ 1/);
});

test('진행 중 공고가 없는 지회를 고장으로 적지 않는다', async () => {
  const fs = await import('node:fs');
  const api = fs.readFileSync(new URL('../functions/api/notices.js', import.meta.url), 'utf8');
  // 화면 맨 아래 함수 정의까지 세면 공고 0건인 지회가 실패로 남는다. 실제 글만 센다.
  assert.ok(api.includes("fn_goDetail\\(\\s*'"), '실제 글만 센다');
});

test('같은 업체 게시판은 건너뛰지 않고 사이를 넉넉히 띄운다', async () => {
  const { SOURCES } = await import('../server/notice-sources.js');
  const imweb = SOURCES.filter(source => source.platform === 'imweb').map(source => source.id);
  // 바보의나눔과 부스러기사랑나눔회는 같은 업체(아임웹) 게시판이다. 잇달아 열면 429로 막힌다.
  assert.deepEqual(imweb.sort(), ['babo-notice', 'busrugy-notice']);
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../server/extra-collect.js', import.meta.url), 'utf8');
  // 건너뛰면 그 기관 공고를 하루 한 번밖에 못 본다. 쉬었다 열되 둘 다 연다.
  assert.match(source, /const SAME_PLATFORM_GAP_MS = 6_000;/);
  assert.match(source, /source\.platform && platformsUsed\.has\(source\.platform\) \? SAME_PLATFORM_GAP_MS : SOURCE_GAP_MS/);
  assert.match(source, /if \(source\.platform\) platformsUsed\.add\(source\.platform\);/);
  assert.ok(!source.includes("reason: 'platform-turn'"), '건너뛰지 않는다');
});

test('기관을 부르는 모집은 우리가 낼 공모다', async () => {
  const { classifyTitle } = await import('../server/notice-classify.js');
  // 부스러기사랑나눔회 게시판에서 이런 공고들이 「알 수 없음」으로 버려졌다.
  assert.equal(classifyTitle('[모집] 취약계층 아동 디지털 리터러시 및 문해력 교육사업 참여기관 모집').fitness, 'proposal');
  assert.equal(classifyTitle('2026 서울랜드 티켓배분 사업 참여기관 모집 안내').fitness, 'proposal');
  assert.equal(classifyTitle('수행기관 모집 공고').fitness, 'proposal');
  // 개인을 부르는 것은 그대로 참여자 모집이다.
  assert.equal(classifyTitle('2026 컬리너리 아카데미 사업 참여자 모집').fitness, 'participant');
  // 위원 모집도 기관·개인이 신청해서 맡는 일이다. 공모로 본다.
  assert.equal(classifyTitle('용역업체 선정을 위한 평가위원 모집').fitness, 'proposal');
  assert.equal(classifyTitle('심사위원 위촉 공모').fitness, 'proposal');
  // 사람을 뽑는 채용은 그대로 채용이다.
  assert.equal(classifyTitle('보육사 채용 공고').fitness, 'hiring');
});

test('「…사업 신청안내」는 설명회가 아니라 공고다', async () => {
  const { classifyTitle } = await import('../server/notice-classify.js');
  // 바보의나눔은 실제 공고 제목에 「신청안내」를 쓴다. 설명회로 접으면 공고를 통째로 놓친다.
  assert.equal(classifyTitle('[공고] 2027년 공모배분사업 신청안내').fitness, 'proposal');
  assert.equal(classifyTitle('[공고] 2026년 여성가장 긴급지원사업 신청안내').fitness, 'proposal');
  // 설명회라고 적힌 것은 그대로 설명회다.
  assert.equal(classifyTitle('[안내] 2027년 공모배분사업 설명회').fitness, 'briefing');
  assert.equal(classifyTitle('2027년 공모배분 사업설명회 영상 및 자료').fitness, 'briefing');
  // 공모·지원사업이라는 말이 없으면 그냥 안내다.
  assert.equal(classifyTitle('신청안내 서식 다운로드').fitness, 'briefing');
});

test('상세 본문을 읽을 때 표시용 코드를 먼저 걷어 낸다', async () => {
  const { bodyTextOf } = await import('../server/extra-collect.js');
  // 게시판 상세에는 <style> 안에 같은 이름의 규칙이 먼저 나온다. 그 자리부터 읽으면 CSS를 본문으로 읽는다.
  const html = `<style>.view_tit{color:#212121}</style><div class="view_tit">2027년 공모배분사업</div><p>신청자격: 비영리 법인·단체</p>`;
  const body = bodyTextOf(html, 'view_tit');
  assert.ok(body.includes('신청자격'), '본문을 읽는다');
  assert.ok(!body.includes('color'), 'CSS를 읽지 않는다');
});

test('올린 날짜를 마감일로 삼지 않는다', async () => {
  const { extractPeriod, isCollectible } = await import('../server/notice-collect.js');
  // 상세에 올린 날짜만 적힌 글이 많다. 그 날짜를 마감으로 보면 오늘 올라온 공고가 마감으로 보인다.
  const body = '지원공지 2026-08-08\n2026년 여성가장 긴급지원사업을 안내합니다.';
  assert.equal(extractPeriod(body, { registeredAt: '2026-08-08' }).deadline, '');
  // 올린 날짜보다 뒤의 날짜는 마감일 후보로 그대로 쓴다.
  assert.equal(extractPeriod('접수 마감 2026-09-30', { registeredAt: '2026-08-08' }).deadline, '2026-09-30');
  // 마감일을 모르면 최근에 올라온 글은 수집한다. 마감으로 접지 않는다.
  assert.equal(isCollectible({ deadline: '', registeredAt: '2026-08-08' }, '2026-08-16'), true);
});

test('분석 총론이 각론 앞에 온다', async () => {
  const { analyzeNoticeStructure, buildSelectionLogic, noticeOverview, selectionRequirements } = await import('../src/notice-logic.js');
  const notice = {
    title: '취약계층 아동 디지털 리터러시 교육사업 참여기관 모집',
    overview: '신청대상: 지역아동센터\n사업기간: 2026-10-01 ~ 2026-12-31\n지원한도: 3,000,000원',
    criteriaText: ''
  };
  const structure = analyzeNoticeStructure(notice);
  const logic = buildSelectionLogic(structure);
  const requirements = selectionRequirements(structure);
  const overview = noticeOverview(structure, logic, requirements);
  // 확인된 것과 확인해야 할 것을 숫자로 먼저 말한다.
  assert.equal(overview.confirmedCount + overview.openCount, requirements.length);
  assert.match(overview.headline, /선정 요건 \d+가지/);
  // 지금 할 일을 이름으로 짚는다.
  assert.ok(overview.next.length > 0);
  // 배점이 없으면 지어내지 않는다고 말한다.
  assert.match(overview.scoring, /배점을 지어내지 않고|공식 배점이 있습니다/);
  // 화면은 총론을 각론 위에 둔다.
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const at = app.indexOf('분석 총론');
  const detail = app.indexOf('각론 · 이 공고에서 선정되려면');
  assert.ok(at > 0 && detail > at, '총론이 각론보다 앞');
});

test('분석에서 멈추지 않고 다음 걸음을 짚어 준다', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /function nextStepBar\(overview\) \{/);
  // 갈래를 늘어놓지 않고 한 걸음만 권한다.
  assert.match(app, /공고문·신청서 서식 올리기/);
  assert.match(app, /신청기관 고르기/);
  assert.match(app, /사업 설계도 만들기/);
  // 왜 그 걸음인지 함께 적는다.
  assert.match(app, /요강·서식을 올리면 확인 필요 항목이 채워집니다/);
  // 눌러서 그 단계로 간다.
  assert.match(app, /data-next-step="\$\{step\.go\}"/);
  assert.match(app, /querySelectorAll\('\[data-next-step\]'\)/);
  // 총론 안에 붙는다. 분석 끝자락이 아니라 눈에 띄는 자리다.
  const overviewBlock = app.slice(app.indexOf('<h4>분석 총론</h4>'), app.indexOf('각론 · 이 공고에서 선정되려면'));
  assert.ok(overviewBlock.includes('${nextStepBar(overview)}'), '총론 안에 다음 단계가 붙는다');
});
