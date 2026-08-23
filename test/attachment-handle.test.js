// 첨부 손잡이를 버리지 않는다 (23-26).
//
// 실제로 났던 일: 수집기는 `fileSeCode`·`dstbBsnsCode`·`sn`·`fileSn`을 제대로 뽑는데,
// 그 뒤 세 자리가 `{ name, fileType }`만 남기고 버렸다. 그러면 「내용 추출」을 눌러도
// `downloadProposalAttachment()`가 `validAttachment()`에서 **400으로 막는다.**
// 보관함에 들어간 뒤에는 되돌릴 방법이 없고, 마감 뒤에는 공고 페이지가 내려가
// 손잡이를 다시 뽑을 수도 없다(23-24에서 실제로 그렇게 됐다).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ATTACHMENT_HANDLE, attachmentRecord, handleNoticeRequest } from '../functions/api/notices.js';

const source = fs.readFileSync(new URL('../functions/api/notices.js', import.meta.url), 'utf8').split('\r\n').join('\n');
const post = (body, fetcher) => handleNoticeRequest(
  new Request('https://example.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), fetcher);

test('손잡이를 그대로 넘긴다', () => {
  const parsed = { name: '서식.zip', fileType: 'ZIP', fileSeCode: '01', dstbBsnsCode: '20260600100128', sn: '1', fileSn: '2' };
  assert.deepEqual(attachmentRecord(parsed, 'ZIP'), parsed);
  // 종류는 부르는 쪽이 정한 값을 쓴다. 여기서 다시 셈하지 않는다.
  assert.equal(attachmentRecord(parsed, 'HWP').fileType, 'HWP');
  // 주소로 받은 첨부는 주소가 손잡이다.
  assert.deepEqual(attachmentRecord({ name: '공고문.hwp', url: 'https://example.test/a.hwp' }, 'HWP'),
    { name: '공고문.hwp', fileType: 'HWP', url: 'https://example.test/a.hwp' });
  // 없는 손잡이를 빈 값으로 지어내지 않는다.
  assert.deepEqual(attachmentRecord({ name: '이름뿐.zip' }, 'ZIP'), { name: '이름뿐.zip', fileType: 'ZIP' });
  assert.deepEqual([...ATTACHMENT_HANDLE], ['url', 'fileSeCode', 'dstbBsnsCode', 'sn', 'fileSn']);
});

test('세 자리가 모두 그 함수를 지난다', () => {
  // 하나라도 빠지면 그 길로 들어온 공고만 조용히 손잡이를 잃는다.
  assert.equal([...source.matchAll(/attachments: detail\.attachments\.map\(file => attachmentRecord\(/g)].length, 3);
  assert.ok(!/attachments\.map\(file => \(\{ name: file\.name, fileType/.test(source), '아직 이름과 종류만 남기는 자리가 있다');
});

// ---------- 실제로 한 바퀴 돌려 본다 ----------

const DETAIL = `<table><tr><th>사업명</th><td>표준양식 시험 공고</td></tr><tr><th>사업수행기간</th><td>2027-01-01 ~ 2027-12-31</td></tr><tr><th>공모기간</th><td>2026-07-01 09:00 ~ 2026-08-21 18:00</td></tr><tr><th>지원한도(원)</th><td>30,000,000</td></tr><tr><th>개요</th><td>시험용 개요</td></tr></table>`
  + `<a href="#" onclick="fn_fileDownload('01','20260600100128','1','1')">1. 공모사업 공고문.hwp</a>`
  + `<a href="#" onclick="fn_fileDownload('01','20260600100128','1','2')">2. 2027년 배분신청서 표준양식 및 작성가이드 등.zip</a>`;

test('★ 수집한 공고의 첨부에 손잡이가 남는다', async () => {
  const fetcher = async () => new Response(DETAIL, { status: 200 });
  const response = await post({ action: 'detail', references: [{ source: 'gwangju', listSn: '20260600100128', kind: 'proposal' }], supplementalReferences: [] }, fetcher);
  const { notice } = await response.json();
  const zip = notice.attachments.find(file => file.fileType === 'ZIP');
  assert.ok(zip, 'ZIP 첨부를 못 찾았다');
  for (const key of ['fileSeCode', 'dstbBsnsCode', 'sn', 'fileSn']) assert.ok(zip[key], `${key}가 없다`);
  assert.equal(zip.dstbBsnsCode, '20260600100128');
});

test('★ 남은 손잡이로 실제로 내려받는 데까지 간다', async () => {
  // 손잡이가 없으면 여기서 400으로 막힌다. 23-24의 그 자리다.
  const fetcher = async (url, options = {}) => {
    if (String(url).includes('mobileMainBsnsDetail.do')) return new Response(DETAIL, { headers: { 'Set-Cookie': 'JSESSIONID=t; Path=/' } });
    if (String(url).endsWith('/file/downloadToken.do')) return new Response(JSON.stringify({ token: 'tk' }), { headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith('/file/acceptingBusiness.fileDownloadNew.do')) return new Response(new Uint8Array([80, 75, 3, 4]), { headers: { 'Content-Type': 'application/zip' } });
    throw new Error(`unexpected ${url} ${options.method || ''}`);
  };
  const listed = await post({ action: 'detail', references: [{ source: 'gwangju', listSn: '20260600100128', kind: 'proposal' }], supplementalReferences: [] }, fetcher);
  const zip = (await listed.json()).notice.attachments.find(file => file.fileType === 'ZIP');
  const got = await post({ action: 'downloadAttachment', attachment: zip }, fetcher);
  assert.equal(got.status, 200, '손잡이가 있는데도 내려받지 못했다');
  assert.match(got.headers.get('content-disposition') || '', /attachment; filename\*/);
});

test('이름만 있는 첨부는 여전히 400으로 막힌다', async () => {
  // 옛 보관 기록(35건)이 그렇다. 손대지 않기로 했으므로 동작이 바뀌면 안 된다.
  const got = await post({ action: 'downloadAttachment', attachment: { name: '서식.zip', fileType: 'ZIP' } }, async () => { throw new Error('불러선 안 된다'); });
  assert.equal(got.status, 400);
});
