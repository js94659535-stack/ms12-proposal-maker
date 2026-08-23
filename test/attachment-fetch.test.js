// 첨부 내려받기와 ZIP 이름 (24-02).
//
// 실제로 났던 일 둘.
//  ① `downloadProposalAttachment()`가 상세 페이지를 **맨몸 GET**으로 다시 불렀다. 같은 주소가
//     헤더 없이는 3,056자 오류 화면(`fn_fileDownload` 0개), `PROPOSAL_HEADERS`와 함께는
//     11,838자 정상 화면(2개)이었다. 손잡이 대조가 언제나 실패해 **어떤 첨부든 404**였다(24-01 실측).
//  ② 공고 첨부 ZIP이 이름을 **CP949**로 담고 UTF-8 표시 비트를 꺼 둔다(실측 플래그 `0x0000`).
//     늘 UTF-8로 읽으면 한글 이름이 통째로 깨진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNoticeRequest } from '../functions/api/notices.js';
import { decodeZipName, readZipFiles } from '../src/files.js';

const ATTACHMENT = { name: '서식.zip', fileType: 'ZIP', fileSeCode: '02', dstbBsnsCode: '20260800100057', sn: '1', fileSn: '2' };
const REAL_PAGE = `<a href="#" onclick="fn_fileDownload('01','20260800100057','1','1')">공고문.hwp</a>`
  + `<a href="#" onclick="fn_fileDownload('02','20260800100057','1','2')">서식.zip</a>`;
const ERROR_PAGE = '<div class="error-area"><p class="error-title">찾으시는 페이지가 없습니다</p></div>';

// 실제 서버처럼 군다 — 헤더를 갖춰 부른 요청에만 진짜 화면을 준다.
function siteFetcher(seen) {
  return async (url, options = {}) => {
    const headers = options.headers || {};
    if (String(url).includes('mobileMainBsnsDetail.do')) {
      const dressed = Boolean(headers.Referer && headers.Accept && headers['Accept-Language']);
      seen.push({ dressed, headers });
      return new Response(dressed ? REAL_PAGE : ERROR_PAGE, { headers: { 'Set-Cookie': 'JSESSIONID=t; Path=/' } });
    }
    if (String(url).endsWith('/file/downloadToken.do')) return new Response(JSON.stringify({ token: 'tk' }), { headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith('/file/acceptingBusiness.fileDownloadNew.do')) return new Response(new Uint8Array([80, 75, 3, 4]), { headers: { 'Content-Type': 'application/zip' } });
    throw new Error(`unexpected ${url}`);
  };
}
const download = fetcher => handleNoticeRequest(new Request('https://local.test/api/notices', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'downloadAttachment', attachment: ATTACHMENT })
}), fetcher);

test('★ 상세를 수집기와 같은 헤더로 부른다', async () => {
  const seen = [];
  const response = await download(siteFetcher(seen));
  assert.equal(response.status, 200, '헤더를 갖췄는데도 못 받았다');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].dressed, true, '맨몸 GET으로 불렀다');
  for (const key of ['Referer', 'Accept', 'Accept-Language']) assert.ok(seen[0].headers[key], `${key}가 없다`);
});

test('헤더를 안 붙이면 손잡이를 못 찾는다 — 이것이 404의 정체였다', async () => {
  // 헤더를 떼어 내고 부르면 오류 화면이 오고, 대조에서 걸려 404가 된다.
  const bare = async (url, options = {}) => siteFetcher([])(url, { ...options, headers: {} });
  const response = await download(bare);
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /공식 상세 페이지에서 첨부파일을 확인할 수 없습니다/);
});

// ---------- ZIP 이름 ----------

// EUC-KR로 담긴 「가나다.txt」. 만든 프로그램이 UTF-8 비트를 켜지 않은 경우다.
const CP949_NAME = new Uint8Array([0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9, 0x2e, 0x74, 0x78, 0x74]);
const UTF8_NAME = new TextEncoder().encode('가나다.txt');

test('★ 비트가 꺼져 있으면 CP949로 읽는다', () => {
  assert.equal(decodeZipName(CP949_NAME, 0x0000), '가나다.txt');
  // 켜져 있으면 지금대로 UTF-8이다.
  assert.equal(decodeZipName(UTF8_NAME, 0x0800), '가나다.txt');
  // 영문 이름은 어느 쪽으로 읽어도 같다. EUC-KR이 ASCII와 같은 자리를 쓴다.
  const ascii = new TextEncoder().encode('form.hwp');
  assert.equal(decodeZipName(ascii, 0x0000), 'form.hwp');
  assert.equal(decodeZipName(ascii, 0x0800), 'form.hwp');
});

test('★ 두 가지 ZIP을 실제로 풀어 이름을 본다', async () => {
  for (const [label, nameBytes, flag] of [['CP949 · 비트 꺼짐', CP949_NAME, 0x0000], ['UTF-8 · 비트 켜짐', UTF8_NAME, 0x0800]]) {
    const zipped = oneEntryZip(nameBytes, flag, new TextEncoder().encode('내용'));
    const entries = await readZipFiles(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength));
    assert.equal(entries.length, 1, label);
    assert.equal(entries[0].name, '가나다.txt', `${label}에서 이름이 깨졌다 — ${entries[0].name}`);
  }
});

test('고를 때도 제대로 읽은 이름으로 본다', async () => {
  // 이름이 깨진 채로 고르면 찾는 것을 영영 못 찾는다.
  const zipped = oneEntryZip(CP949_NAME, 0x0000, new TextEncoder().encode('내용'));
  const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
  assert.equal((await readZipFiles(buffer, name => name === '가나다.txt')).length, 1);
  assert.equal((await readZipFiles(buffer, name => name.endsWith('.txt'))).length, 1);
});

// 항목 하나짜리 ZIP. 이름 바이트와 플래그를 그대로 넣는다(STORE).
function oneEntryZip(nameBytes, flag, data) {
  const crc = crc32(data);
  const local = new Uint8Array(30 + nameBytes.length + data.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(6, flag, true);
  localView.setUint16(8, 0, true);
  localView.setUint32(14, crc, true);
  localView.setUint32(18, data.length, true);
  localView.setUint32(22, data.length, true);
  localView.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(data, 30 + nameBytes.length);
  const central = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(8, flag, true);
  centralView.setUint16(10, 0, true);
  centralView.setUint32(16, crc, true);
  centralView.setUint32(20, data.length, true);
  centralView.setUint32(24, data.length, true);
  centralView.setUint16(28, nameBytes.length, true);
  centralView.setUint32(42, 0, true);
  central.set(nameBytes, 46);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return out;
}
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
