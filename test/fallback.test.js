import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { localAnalyze, localDraft } from '../src/fallback.js';
import { normalizeManualSources, onRequest, validateEngineResult } from '../functions/api/proposal.js';
import { buildOfficialSummary, classifyAttachment, handleNoticeRequest, isBusinessNotice, isOpenDeadline, mergeNoticeCandidates, parseProposalList, splitSubprojects } from '../functions/api/notices.js';
import { buildPrintDocument } from '../src/export.js';

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

test('공모사업 목록은 중앙회와 광주지회 진행 중 공고만 조회한다', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.includes('mobileMainBsnsDetail.do')) return new Response(`<table><tr><th>사업명</th><td>진행 공고</td></tr><tr><th>사업수행기간</th><td>2099-09-01 ~ 2099-12-31</td></tr><tr><th>공모기간</th><td>2099-08-01 ~ 2099-08-14</td></tr><tr><th>지원한도금액</th><td>30,000,000원</td></tr><tr><th>개요</th><td>사업목적: 아동 지원<br>신청대상: 사회복지기관<br>지원내용: 상담 프로그램 운영</td></tr></table>`, { status: 200 });
    const branch = new URL(url).searchParams.get('bhfCode');
    const item = (code, title, deadline) => `<li><a href="javascript:fn_goDetail('${code}','${branch}','');"><span class="gallery-type">${branch === '001' ? '중앙' : '광주'}</span><p class="gallery-tit">${title}</p><span>${deadline}</span></a></li>`;
    return new Response(`<ul>${item(branch === '001' ? '20260700100022' : '20260700600081', branch === '001' ? '중앙 공고' : '광주 공고', '2099.08.14')}${item(`${branch}000`, '마감 공고', '2000.01.01')}</ul>`, { status: 200 });
  };
  const response = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) }), fetcher);
  const result = await response.json();
  assert.deepEqual(result.notices.map(item => item.sourceLabel), ['중앙회', '광주지회']);
  assert.deepEqual(result.notices.map(item => item.dstbBsnsCode), ['20260700100022', '20260700600081']);
  assert.deepEqual(result.notices.map(item => item.deadline), ['2099-08-14', '2099-08-14']);
  assert.equal(calls.length, 4);
  assert.match(calls[0], /mobileMainBsnsList\.do\?bhfCode=001&page=1/);
  assert.match(calls[1], /mobileMainBsnsList\.do\?bhfCode=006&page=1/);
  assert.ok(result.notices.every(item => item.summary.length <= 300));
  assert.ok(result.notices.every(item => item.summarySource === 'official-detail'));
  assert.deepEqual(result.notices.map(item => item.eligibility), ['사회복지기관', '사회복지기관']);
});

test('공식 상세 원문만 사용해 300자 이내 핵심 요약을 만든다', () => {
  const summary = buildOfficialSummary({
    applicationPeriod: '2026-08-01 ~ 2026-08-14', performancePeriod: '2027-01-01 ~ 2027-12-31', supportLimit: '기관당 3천만원',
    overview: '사업목적: 취약계층 아동의 가족기능 강화\n신청대상: 광주 소재 사회복지기관\n지원내용: 가족상담 및 회복 프로그램\n연락처: 000-0000\n첨부파일: 신청서.hwp'
  });
  assert.equal(summary.eligibility, '광주 소재 사회복지기관');
  assert.equal(summary.supportDetails, '가족상담 및 회복 프로그램');
  assert.equal(summary.applicationPeriod, '2026-08-01 ~ 2026-08-14');
  assert.equal(summary.supportLimit, '기관당 3천만원');
  assert.ok(summary.summary.length <= 300);
  assert.doesNotMatch(summary.summary, /연락처|첨부파일/);
});

test('번호가 붙은 공식 개요에서 실제 지원내용과 신청유형을 요약한다', () => {
  const summary = buildOfficialSummary({
    applicationPeriod: '2026-07-20 ~ 2026-08-14', performancePeriod: '2027-01 ~ 2027-12', supportLimit: '1개소당 140,000,000원',
    overview: '1. 주요사업내용\n○ 홈케어플래너 파견과 가족 맞춤형 서비스 제공\n○ 전문심리치료기관 연계 심리정서 회복 프로그램\n\n2. 사업기간 : 2027. 1. ~ 2027. 12.\n\n3. 신청유형\n○ 재학대예방형: 아동보호전문기관\n○ 아동보호형: 사회복지관 등\n\n4. 예산규모 : 총 21억원 이내'
  });
  assert.match(summary.supportDetails, /홈케어플래너 파견/);
  assert.match(summary.eligibility, /아동보호전문기관/);
  assert.match(summary.summary, /홈케어플래너 파견/);
  assert.ok(summary.summary.length <= 300);
});

test('목록 카드는 없는 상세 항목에 확인 필요 문구를 반복하지 않는다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /item\.eligibility \|\| '공식 상세 확인 필요'/);
  assert.doesNotMatch(source, /item\.supportDetails \|\| '공식 상세 확인 필요'/);
  assert.match(source, /item\.eligibility \? `<small>/);
  assert.match(source, /item\.supportDetails \? `<small>/);
});

test('일부 상세 조회 실패에도 목록을 유지하고 상세 확인 안내를 표시한다', async () => {
  let activeDetails = 0;
  let maximumDetails = 0;
  const fetcher = async url => {
    if (url.includes('mobileMainBsnsList.do')) {
      const branch = new URL(url).searchParams.get('bhfCode');
      return new Response(`<li><a href="javascript:fn_goDetail('${branch}01','${branch}','');"><p class="gallery-tit">${branch} 공고 1</p><span>2099.12.31</span></a></li><li><a href="javascript:fn_goDetail('${branch}02','${branch}','');"><p class="gallery-tit">${branch} 공고 2</p><span>2099.12.31</span></a></li>`);
    }
    activeDetails += 1;
    maximumDetails = Math.max(maximumDetails, activeDetails);
    await new Promise(resolve => setTimeout(resolve, 5));
    activeDetails -= 1;
    if (url.includes('00101')) throw new Error('detail failed');
    return new Response(`<table><tr><th>사업명</th><td>진행 공고</td></tr><tr><th>개요</th><td>지원내용: 공식 지원 내용</td></tr></table>`);
  };
  const response = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) }), fetcher);
  const result = await response.json();
  assert.equal(result.notices.length, 4);
  assert.equal(result.notices.find(item => item.dstbBsnsCode === '00101').summary, '상세 공고문 확인 필요');
  assert.ok(maximumDetails <= 3);
});

test('마감일 당일은 포함하고 지난 마감일은 제외한다', () => {
  const now = new Date('2026-08-06T03:00:00Z');
  assert.equal(isOpenDeadline('2026-08-06', now), true);
  assert.equal(isOpenDeadline('2026-08-05', now), false);
  assert.equal(isOpenDeadline('2026-08-07', now), true);
});

test('공모사업 목록에서 제목·지회·마감일·사업번호를 추출한다', () => {
  const html = `<li><a href="javascript:fn_goDetail('20260700600081','006','');"><span class="gallery-type">광주</span><p class="gallery-tit">[광주] 2027년 신청사업</p><span>2026.08.14</span></a></li>`;
  assert.deepEqual(parseProposalList(html, 'gwangju'), [{ source: 'gwangju', sourceLabel: '광주지회', listSn: '20260700600081', dstbBsnsCode: '20260700600081', appnDocNo: '', title: '[광주] 2027년 신청사업', deadline: '2026-08-14', registeredAt: '2026-08-14' }]);
});

test('복수 공고의 번호가 붙은 세부사업 3개를 서로 섞지 않고 분리한다', () => {
  const overview = `안내 공통문\n1. 취약계층 아동·청소년 가족기능 강화사업\n가족 상담과 회복 지원\n2. 경계선 지능 아동 사회적응력 향상사업\n느린학습자 사회성 지원\n3. 저소득 아동·청소년 환경개선 지원사업\n주거 환경 개선 지원`;
  const result = splitSubprojects(overview);
  assert.deepEqual(result.map(item => item.title), ['취약계층 아동·청소년 가족기능 강화사업', '경계선 지능 아동 사회적응력 향상사업', '저소득 아동·청소년 환경개선 지원사업']);
  assert.match(result[1].content, /느린학습자 사회성 지원/);
  assert.doesNotMatch(result[1].content, /가족 상담|주거 환경/);
});

test('단일 사업과 일반 번호 목차는 세부사업 선택 대상으로 만들지 않는다', () => {
  assert.deepEqual(splitSubprojects('1. 단일 아동 지원사업\n아동 지원 내용'), []);
  assert.deepEqual(splitSubprojects('1. 사업명: 신청사업\n2. 사업개념: 자유주제\n3. 사업내용: 복지 지원'), []);
});

test('채용·행사·설문·교육 신청 공지는 공고 목록에서 제외한다', () => {
  assert.equal(isBusinessNotice('계약직 직원 채용 공고'), false);
  assert.equal(isBusinessNotice('30주년 감사음악회 참석 신청 안내'), false);
  assert.equal(isBusinessNotice('복지기관 만족도 설문 안내'), false);
  assert.equal(isBusinessNotice('담당자 교육 참가신청'), false);
  assert.equal(isBusinessNotice('2027년 전국단위 신청사업 공고'), true);
});

test('선택한 공모사업 상세와 첨부 메타데이터를 반환한다', async () => {
  const fetcher = async url => {
    assert.match(url, /mobileMainBsnsDetail\.do\?dstbBsnsCode=20260700600081&appnDocNo=/);
    return new Response(`<table><tr><th>사업명</th><td>광주 지원사업 공고</td></tr><tr><th>사업수행기간</th><td>2027-01-01 ~ 2027-12-31</td></tr><tr><th>공모기간</th><td>2026-07-27 09:00 ~ 2026-08-14 18:00</td></tr><tr><th>지원한도(원)</th><td>30,000,000</td></tr><tr><th>개요</th><td>광주 지역 복지기관 지원</td></tr></table><a href="#" onclick="fn_fileDownload('01','20260700600081','1','1')">공고문.hwp</a>`, { status: 200 });
  };
  const response = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'detail', references: [{ source: 'gwangju', listSn: '20260700600081', kind: 'proposal' }], supplementalReferences: [] }) }), fetcher);
  const result = await response.json();
  assert.equal(result.notice.title, '광주 지원사업 공고');
  assert.match(result.notice.parts[0].bodyHtml, /사업수행기간/);
  assert.match(result.notice.parts[0].bodyHtml, /광주 지역 복지기관 지원/);
  assert.deepEqual(result.notice.parts.map(part => part.sourceLabel), ['광주지회']);
  assert.deepEqual(result.notice.attachments, [{ name: '공고문.hwp', fileType: 'HWP', fileSeCode: '01', dstbBsnsCode: '20260700600081', sn: '1', fileSn: '1', sourceLabel: '광주지회' }]);
});

test('공식 첨부파일을 공개 토큰으로 중계하고 원본 이름을 유지한다', async () => {
  const attachment = { name: '공식 신청서.HWP', fileSeCode: '01', dstbBsnsCode: '20260700600081', sn: '1', fileSn: '2' };
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('mobileMainBsnsDetail.do')) return new Response(`<a onclick="fn_fileDownload('01','20260700600081','1','2')">공식 신청서.HWP</a>`, { headers: { 'Set-Cookie': 'JSESSIONID=test; Path=/' } });
    if (url.endsWith('/file/downloadToken.do')) return new Response(JSON.stringify({ token: 'public-token' }), { headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/file/acceptingBusiness.fileDownloadNew.do')) return new Response(new Uint8Array([72, 87, 80]), { headers: { 'Content-Type': 'application/octet-stream' } });
    throw new Error('unexpected request');
  };
  const response = await handleNoticeRequest(new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'downloadAttachment', attachment }) }), fetcher);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /%EA%B3%B5%EC%8B%9D%20%EC%8B%A0%EC%B2%AD%EC%84%9C\.HWP/);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [72, 87, 80]);
  assert.equal(calls.length, 3);
  assert.match(calls[1].options.body, /type=APPLY/);
  assert.match(calls[2].options.body, /token=public-token/);
});

test('공식 첨부파일 형식을 구분한다', () => {
  assert.deepEqual(['a.pdf', 'a.docx', 'a.txt', 'a.hwp', 'a.hwpx', 'a.zip', 'a.exe'].map(classifyAttachment), ['PDF', 'DOCX', 'TXT', 'HWP', 'HWPX', 'ZIP', 'UNSUPPORTED']);
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
  assert.match(source, /state\.project = \{ \.\.\.state\.project, type: 'chest', title,/);
  assert.match(source, /state\.sourceText = `\$\{title\}/);
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
  assert.match(source, /data-notice-check/);
  assert.match(source, /removeSelectedNotices/);
  assert.match(source, /notice\.subprojects\?\.length > 1/);
  assert.match(source, /data-select-subproject/);
  assert.match(source, /applyNoticeSelection\(pending\.notice, subproject\)/);
  assert.match(source, /개요:\\n\$\{subproject\.content\}/);
  assert.match(source, /id="selected-notice-detail"/);
  assert.match(source, /detailText: bodyText/);
  assert.match(source, /scrollIntoView\(\{ behavior: 'smooth'/);
  assert.match(source, /선택한 공고 상세/);
  assert.match(source, /data-view-notice/);
  assert.match(source, /data-notice-panel="summary"/);
  assert.match(source, /data-notice-panel="overview"/);
  assert.match(source, /slice\(0, 200\)/);
  assert.match(source, /계획서 작성/);
  assert.match(source, /아직 계획서 작성 대상으로 선택하지 않았습니다/);
  assert.match(source, /선택 완료 · 다음 단계/);
});

test('공고 개별·다중 삭제는 쓰레기통으로 이동하고 복원·영구 삭제할 수 있다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /noticeTrash: \[\]/);
  assert.match(source, /noticeTrash: \[\.\.\.state\.noticeTrash, \{ \.\.\.removed/);
  assert.match(source, /선택한 공고 \$\{selected\.size\}건을 쓰레기통으로 이동/);
  assert.match(source, /data-restore-notice/);
  assert.match(source, /function restoreNotice/);
  assert.match(source, /data-delete-notice-forever/);
  assert.match(source, /function deleteNoticeForever/);
});

test('한국어 인쇄 문서에 계획서 10개 항목의 실제 내용을 모두 포함한다', () => {
  const titles = ['사업 필요성', '사업 목적', '사업 목표', '지원 대상', '사업 내용', '추진 일정', '수행 인력', '예산 계획', '성과지표', '기대효과'];
  const html = buildPrintDocument({ title: '한글 검토 계획서' }, titles.map((title, index) => ({ title, content: `${title} 본문 ${index + 1}`, status: '검토 필요' })));
  titles.forEach(title => assert.match(html, new RegExp(`${title}.*${title} 본문`, 's')));
  assert.equal((html.match(/<section>/g) || []).length, 10);
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<meta charset="UTF-8">/);
  assert.match(html, /"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif/);
  assert.match(html, /@page \{ size: A4 portrait/);
  assert.match(html, /break-inside: avoid-page/);
  assert.match(html, /button, nav, aside, details, summary/);
});

test('DOCX는 공식 양식이 아닌 검토용으로 표시한다', () => {
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const exportSource = fs.readFileSync(new URL('../src/export.js', import.meta.url), 'utf8');
  assert.match(appSource, /검토용 DOCX/);
  assert.match(appSource, /공식 신청서 양식이 아닌 검토본/);
  assert.match(exportSource, /_검토용\.docx/);
});

test('PDF 버튼은 브라우저 인쇄 저장 방식으로 표시한다', () => {
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const exportSource = fs.readFileSync(new URL('../src/export.js', import.meta.url), 'utf8');
  assert.match(appSource, /PDF 인쇄·저장/);
  assert.match(exportSource, /document\.fonts\?\.ready/);
  assert.match(exportSource, /printWindow\.print\(\)/);
  assert.doesNotMatch(exportSource, /jspdf|html2canvas|pdf\.html/);
});

test('HWP 안내와 공고문 추출 상태를 명확히 표시한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /공식 한글 양식 파일/);
  assert.match(source, /한글 프로그램에서 PDF로 저장한 뒤 다시 업로드/);
  assert.match(source, /공고문 반영 초안/);
  assert.match(source, /안내 페이지 기반 임시 초안/);
  assert.match(source, /공고문 추출 실패/);
  assert.match(source, /\['PDF', 'DOCX', 'TXT'\]/);
});

test('핵심 사업계획 엔진 결과는 근거·단일 세부사업·질문 수를 검증한다', () => {
  const result = {
    sponsorIntent: { evidence: ['공식 공고 근거'] },
    projectDesign: { projectName: '아동 회복 지원사업' },
    sections: Array.from({ length: 10 }, (_, index) => ({ id: `s-${index + 1}`, title: `${index + 1}. 항목`, content: '공식 근거와 연결된 설계 내용', citations: ['e-1'], status: '검토 필요' })),
    missingInformation: ['실제 참여 가능 인원은 몇 명입니까?'],
    evidenceMap: [{ id: 'e-1', claim: '지원 대상', evidence: '공식 원문', location: '공고문' }],
    qualityCheck: { noticeAlignment: true, singleSubprogramOnly: true, logicConsistency: true, budgetConsistency: true, measurableOutcomes: true }
  };
  assert.equal(validateEngineResult(result), '');
  assert.match(validateEngineResult({ ...result, missingInformation: Array(6).fill('질문') }), /최대 5개/);
  assert.match(validateEngineResult({ ...result, sections: result.sections.map((section, index) => index ? section : { ...section, content: '[확인 필요]' }) }), /가짜 완성 문구/);
  assert.match(validateEngineResult({ ...result, qualityCheck: { ...result.qualityCheck, singleSubprogramOnly: false } }), /단일 세부사업/);
});

test('AI 실패 시 가짜 로컬 완성본을 만들지 않고 정밀 설계 불가 상태를 표시한다', () => {
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const serverSource = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /localDraft/);
  assert.match(appSource, /state\.sections = \[\]/);
  assert.match(appSource, /AI 정밀 사업설계를 실행할 수 없음/);
  assert.match(appSource, /missingInformation = .*slice\(0, 5\)/);
  assert.match(appSource, /selectedSubprogram/);
  assert.match(serverSource, /minItems: 3, maxItems: 5/);
  assert.match(serverSource, /목표값·측정도구·시기·담당/);
  assert.match(serverSource, /sections\.citations에는 evidenceMap의 id만 사용/);
});

test('직접 추가 자료는 출처별 구조와 추출 상태를 보존한다', () => {
  const sources = normalizeManualSources([
    { id: 'pdf-1', fileName: '공고문.pdf', sourceType: '공고 공문', extractedText: '공식 공고문 본문', extractionStatus: 'success', extractionError: '' },
    { id: 'docx-1', fileName: '신청서.docx', sourceType: '공모신청서', extractedText: '작성 질문과 요구사항', extractionStatus: 'success', extractionError: '' },
    { id: 'hwp-1', fileName: '사업계획서.hwp', sourceType: '사업계획서 서식', extractedText: '', extractionStatus: 'unsupported', extractionError: 'PDF 변환 필요' }
  ]);
  assert.equal(sources.length, 3);
  assert.deepEqual(Object.keys(sources[0]), ['id', 'fileName', 'sourceType', 'extractedText', 'extractionStatus', 'extractionError']);
  assert.equal(sources[1].sourceType, '공모신청서');
  assert.equal(sources[2].fileName, '사업계획서.hwp');
  assert.equal(sources[2].extractionStatus, 'unsupported');
});

test('직접 자료 UI는 다중 추가·유형 변경·삭제·미리보기를 제공한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /accept="\.pdf,\.docx,\.txt,\.hwp,\.hwpx" multiple/);
  assert.match(source, /data-manual-source-type/);
  assert.match(source, /data-remove-manual-source/);
  assert.match(source, /텍스트 미리보기 없음/);
  assert.match(source, /manualSources: state\.manualSources\.map/);
  assert.match(source, /extractionStatus === 'success'/);
});

test('생성 API는 직접 자료 우선순위와 충돌을 출처별로 처리한다', () => {
  const source = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  assert.match(source, /<MANUAL_SOURCES>/);
  assert.match(source, /공모신청서·사업계획서 서식의 질문과 작성항목/);
  assert.match(source, /파일명과 sourceType을 evidenceMap\.location에 보존/);
  assert.match(source, /각 출처를 evidenceMap에 모두 기록하고 missingInformation 질문에 포함/);
  assert.match(source, /선택된 세부사업 하나만/);
});

test('주요 작업 화면은 브라우저 이탈 없는 10단계 앱 내부 이동 기록을 사용한다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /const NAVIGATION_LIMIT = 10/);
  assert.match(source, /sessionStorage\.getItem\(NAVIGATION_KEY\)/);
  assert.match(source, /sessionStorage\.setItem\(NAVIGATION_KEY/);
  assert.match(source, /backStack: validLocations/);
  assert.match(source, /forwardStack: validLocations/);
  assert.match(source, /return stack\.slice\(-NAVIGATION_LIMIT\)/);
  assert.match(source, /navigationHistory\.forwardStack = \[\]/);
  assert.match(source, /if \(!sameLocation\(stack\.at\(-1\), location\)\)/);
  assert.doesNotMatch(source, /window\.history\.(?:back|forward|go)/);
});

test('뒤로·홈·앞으로 버튼은 모든 6단계 공통 셸에 표시되고 작성 상태를 삭제하지 않는다', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /aria-label="앱 작업 화면 이동"/);
  assert.match(source, /← 뒤로 가기/);
  assert.match(source, /⌂ 홈으로 가기/);
  assert.match(source, /앞으로 가기 →/);
  assert.match(source, /document\.querySelector\('#workflow-back'\)/);
  assert.match(source, /navigateToStep\(0\)/);
  assert.match(source, /document\.querySelector\('#workflow-forward'\)/);
  assert.doesNotMatch(source, /function navigateToStep[\s\S]*?structuredClone\(state\)/);
  assert.match(source, /display:flex;flex-wrap:wrap/);
  assert.match(source, /position:sticky;top:0;z-index:15/);
});
