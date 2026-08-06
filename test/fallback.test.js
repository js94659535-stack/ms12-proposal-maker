import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { localAnalyze, localDraft } from '../src/fallback.js';
import { onRequest } from '../functions/api/proposal.js';
import { handleNoticeRequest, isBusinessNotice, mergeNoticeCandidates } from '../functions/api/notices.js';

test('규칙 분석은 원문 근거를 보존한다', () => {
  const sourceText = '제출 마감은 2026년 9월 1일이다. 상담사 3명 이상을 필수 배치해야 한다. 평가 배점은 사업수행 50점이다.';
  const result = localAnalyze({ sourceText, projectType: '나라장터', title: '테스트 사업' });
  assert.ok(result.requirements.length >= 3);
  assert.ok(result.requirements.some(item => item.evidence.includes('상담사 3명')));
  assert.equal(result.mode, 'local');
});

test('로컬 초안은 확인되지 않은 기관 사실을 확인 필요로 둔다', () => {
  const analysis = localAnalyze({ sourceText: '제출 서류와 사업 운영 계획을 작성해야 한다.', projectType: '일반', title: '테스트' });
  const result = localDraft({ analysis, answers: [], organization: { capabilities: [{ name: '확인된 프로그램', status: '공개 확인' }] } });
  assert.ok(result.sections.length >= 6);
  assert.ok(result.sections.some(section => section.status === '확인 필요'));
});

test('확정 회사 정보만 있어도 로컬 완성 초안을 생성한다', () => {
  const analysis = localAnalyze({ sourceText: '집단상담 운영 계획과 결과보고서를 제출해야 한다.', projectType: '공공조달', title: '테스트' });
  const result = localDraft({ analysis, answers: [], organization: { confirmedFacts: [{ title: '운영 지역', content: '광주 지역 운영 가능', confirmedByUser: true }] } });
  assert.equal(result.sections.length, 10);
});

test('서버 API는 키가 없으면 외부 호출 전에 중단한다', async () => {
  const response = await onRequest({ env: {}, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' } }) });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /OPENAI_API_KEY/);
});

test('서버 API는 모델 환경변수가 없으면 외부 호출 전에 중단한다', async () => {
  const response = await onRequest({ env: { OPENAI_API_KEY: 'test-only' }, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' } }) });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /OPENAI_MODEL/);
});

test('서버 API는 POST와 application/json만 허용한다', async () => {
  const getResponse = await onRequest({ env: {}, request: new Request('https://example.test/api/proposal') });
  assert.equal(getResponse.status, 405);
  const mediaResponse = await onRequest({ env: {}, request: new Request('https://example.test/api/proposal', { method: 'POST', body: 'text' }) });
  assert.equal(mediaResponse.status, 415);
});

test('서버 API는 실제 본문 바이트와 원문 길이를 제한한다', async () => {
  const env = { OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'test-model' };
  const largeBody = JSON.stringify({ action: 'analyze', payload: { sourceText: '가'.repeat(300000) } });
  const bodyResponse = await onRequest({ env, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: largeBody }) });
  assert.equal(bodyResponse.status, 413);
  const longSource = JSON.stringify({ action: 'analyze', payload: { sourceText: 'a'.repeat(180001), organization: {} } });
  const sourceResponse = await onRequest({ env, request: new Request('https://example.test/api/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: longSource }) });
  assert.equal(sourceResponse.status, 400);
  assert.match(await sourceResponse.text(), /180,000/);
});

test('서버 함수에는 OpenAI 외부 호출이 한 곳뿐이고 재시도 루프나 민감 로그가 없다', () => {
  const source = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  assert.equal((source.match(/fetch\('https:\/\/api\.openai\.com\/v1\/responses'/g) || []).length, 1);
  assert.doesNotMatch(source, /\bconsole\.(?:log|info|debug|warn|error)\b/);
  assert.doesNotMatch(source, /\bretry\b|while\s*\(/i);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /max_output_tokens: LIMITS\.outputTokens\[body\.action\]/);
});

test('앱은 공고문 입력에서 시작하고 사용자 확정 회사 정보만 생성에 사용한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /step: 1,/);
  assert.match(source, /confirmedFacts: state\.companyFacts\.filter\(item => item\.confirmedByUser === true\)/);
  assert.doesNotMatch(source, /profileForPrompt|organizationProfile/);
  assert.match(source, /delete saved\.manualCompanyFacts/);
  assert.match(source, /addEventListener\('click', confirmCompanyFactDraft\)/);
});

test('공고 목록은 중앙회와 광주지회 고정 소스만 조회한다', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: options.body });
    const source = url.includes('gwangju.') ? '광주 공고' : '중앙 공고';
    return new Response(JSON.stringify({ listInfo: [{ listSn: source === '중앙 공고' ? 101 : 202, sj: source, rgsde: '2026-08-01' }] }), { status: 200 });
  };
  const response = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) }), fetcher);
  const result = await response.json();
  assert.deepEqual(result.notices.map(item => item.sourceLabel), ['중앙회', '광주지회']);
  assert.deepEqual(result.notices.map(item => item.listSn), ['101', '202']);
  assert.equal(calls.length, 2);
  assert.match(calls[0].body, /pBhfCode=001/);
  assert.match(calls[1].body, /pBhfCode=006/);
});

test('채용·행사·설문·교육 신청 공지는 공고 목록에서 제외한다', () => {
  assert.equal(isBusinessNotice('계약직 직원 채용 공고'), false);
  assert.equal(isBusinessNotice('30주년 감사음악회 참석 신청 안내'), false);
  assert.equal(isBusinessNotice('복지기관 만족도 설문 안내'), false);
  assert.equal(isBusinessNotice('담당자 교육 참가신청'), false);
  assert.equal(isBusinessNotice('2027년 전국단위 신청사업 공고'), true);
});

test('선택한 광주지회 공고 상세과 첨부 메타데이터를 우선 반환한다', async () => {
  const fetcher = async (url, options) => {
    const gwangju = url.includes('gwangju.');
    assert.match(options.body, new RegExp(`listSn=${gwangju ? 202 : 101}`));
    return new Response(JSON.stringify({ dataInfo: { postInfo: { sj: gwangju ? '광주 지원사업 공고' : '중앙 지원사업 공고', rgsde: '2026-08-01', cn: `<p>${gwangju ? '광주 우선 조건' : '중앙 보충 내용'}</p>` }, fileListInfo: gwangju ? [{ orginlFileNm: '공고문.pdf', serverFileNm: 'saved.pdf', flpth: '/notice/' }] : [] } }), { status: 200 });
  };
  const response = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'detail', references: [{ source: 'gwangju', listSn: '202' }], supplementalReferences: [{ source: 'central', listSn: '101' }] }) }), fetcher);
  const result = await response.json();
  assert.equal(result.notice.title, '광주 지원사업 공고');
  assert.equal(result.notice.parts[0].bodyHtml, '<p>광주 우선 조건</p>');
  assert.deepEqual(result.notice.parts.map(part => part.sourceLabel), ['광주지회', '중앙회']);
  assert.deepEqual(result.notice.attachments, [{ name: '공고문.pdf', serverName: 'saved.pdf', path: '/notice/', sourceLabel: '광주지회' }]);
});

test('동일 공고는 통합하고 출처를 모두 표시한다', async () => {
  const items = [
    { source: 'central', sourceLabel: '중앙회', listSn: '101', title: '[공고] 2027년 지원사업', registeredAt: '2026-08-01' },
    { source: 'gwangju', sourceLabel: '광주지회', listSn: '202', title: '2027년 지원사업', registeredAt: '2026-08-01' }
  ];
  const detail = reference => ({ ...items.find(item => item.source === reference.source), bodyHtml: '<p>신청기간 8월 1일, 지원대상 사회복지기관 공통 내용</p>', attachments: [{ name: '공고.pdf', serverName: 'same.pdf', path: '/same/' }] });
  const result = await mergeNoticeCandidates(items, detail);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceLabel, '중앙회·광주지회');
  assert.equal(result[0].references.length, 2);
});

test('지역 조건이나 첨부가 다르면 별도 공고로 유지하고 광주 공고에 중앙회 보충 참조를 연결한다', async () => {
  const items = [
    { source: 'central', sourceLabel: '중앙회', listSn: '101', title: '2027년 지원사업', registeredAt: '2026-08-01' },
    { source: 'gwangju', sourceLabel: '광주지회', listSn: '202', title: '2027년 지원사업', registeredAt: '2026-08-01' }
  ];
  const detail = reference => reference.source === 'central'
    ? { ...items[0], bodyHtml: '<p>지원대상 전국 사회복지기관</p>', attachments: [{ name: '중앙.pdf', serverName: 'c.pdf', path: '/c/' }] }
    : { ...items[1], bodyHtml: '<p>지원대상 광주 소재 사회복지기관</p>', attachments: [{ name: '광주.pdf', serverName: 'g.pdf', path: '/g/' }] };
  const result = await mergeNoticeCandidates(items, detail);
  assert.equal(result.length, 2);
  const gwangju = result.find(item => item.sourceLabel === '광주지회');
  assert.deepEqual(gwangju.supplementalReferences, [{ source: 'central', listSn: '101' }]);
});

test('조건이 같아도 본문이 완전히 같지 않으면 별도 공고로 유지한다', async () => {
  const items = [
    { source: 'central', sourceLabel: '중앙회', listSn: '111', title: '2027년 동일 제목 사업', registeredAt: '2026-08-01' },
    { source: 'gwangju', sourceLabel: '광주지회', listSn: '222', title: '[공고] 2027년 동일 제목 사업', registeredAt: '2026-08-01' }
  ];
  const detail = reference => ({ ...items.find(item => item.source === reference.source), bodyHtml: reference.source === 'central' ? '<p>지원대상 복지기관. 공통 본문.</p>' : '<p>지원대상 복지기관. 공통 본문. 광주 안내 문장.</p>', attachments: [] });
  const result = await mergeNoticeCandidates(items, detail);
  assert.equal(result.length, 2);
});

test('공식 상세 URL의 누락 공고를 추가하고 동일 listSn은 중복 처리한다', async () => {
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://gwangju.chest.or.kr/bbs/selectPostInfo.do');
    assert.match(options.body, /listSn=303/);
    return new Response(JSON.stringify({ dataInfo: { postInfo: { sj: '광주 누락 공고', rgsde: '2026-08-02', cn: '<p>광주 대상</p>' }, fileListInfo: [] } }), { status: 200 });
  };
  const imported = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'importUrl', url: 'https://gwangju.chest.or.kr/bbs/1000/initPostDetail.do?listSn=303', existingNotices: [] }) }), fetcher);
  const importedResult = await imported.json();
  assert.equal(importedResult.duplicate, false);
  assert.equal(importedResult.notice.sourceLabel, '광주지회');

  const duplicate = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'importUrl', url: 'https://gwangju.chest.or.kr/bbs/1000/initPostDetail.do?listSn=303', existingNotices: [importedResult.notice] }) }), () => { throw new Error('중복 공고는 다시 조회하지 않아야 함'); });
  assert.equal((await duplicate.json()).duplicate, true);
});

test('고정된 두 공식 도메인 이외의 누락 공고 URL은 거부한다', async () => {
  const response = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'importUrl', url: 'https://example.com/bbs/1000/initPostDetail.do?listSn=1', existingNotices: [] }) }), () => { throw new Error('호출되지 않아야 함'); });
  assert.equal(response.status, 400);
});

test('공고 선택 결과는 기존 제목과 원문 입력으로 전달된다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /state\.project = \{ \.\.\.state\.project, type: 'chest', title: notice\.title/);
  assert.match(source, /state\.sourceText = `\$\{notice\.title\}/);
  assert.match(source, /fetchNoticeDetail\(selected\)/);
  assert.match(source, /\$\{part\.sourceLabel\} 우선 조건/);
  assert.match(source, /\$\{part\.sourceLabel\} 보충 자료/);
  assert.match(source, /중앙회 공식 사이트/);
  assert.match(source, /광주지회 공식 사이트/);
  assert.match(source, /누락 공고 가져오기/);
  assert.match(source, /importNoticeUrl\(url, state\.noticeResults\)/);
  assert.match(source, /state\.project\.type = 'chest'/);
  assert.match(source, /data-remove-notice/);
  assert.match(source, /removeOfficialNotice/);
});
