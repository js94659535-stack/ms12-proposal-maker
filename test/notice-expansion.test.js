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
  assert.deepEqual(BUSINESS_TYPES.map(item => item.key), ['chest', 'family', 'edu', 'g2b', 'foundation', 'general']);
  // 바보의나눔은 사업 유형에 없다.
  assert.ok(!BUSINESS_TYPES.some(item => /바보/.test(item.label)));
  // 수집 출처에는 있고, 민간재단·공익법인 유형에 붙는다.
  const babo = SOURCE_GROUPS.find(group => group.key === 'babo');
  assert.equal(babo.label, '바보의나눔');
  assert.equal(babo.businessType, 'foundation');
  assert.equal(businessTypeOf('babo-notice'), 'foundation');
  assert.equal(businessTypeOf('kihf-bid'), 'family');
  assert.equal(businessTypeOf('g2b-service'), 'g2b');
  assert.deepEqual(SOURCE_GROUPS.map(group => group.key), ['chest', 'kihf', 'edu', 'g2b', 'babo']);
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
