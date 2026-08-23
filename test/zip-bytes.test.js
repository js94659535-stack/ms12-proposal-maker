// ZIP을 바이트로 꺼낸다 (23-29).
//
// 실제로 났던 일: 항목을 글자로 풀어 돌려주기만 해서 두 자리가 함께 막혀 있었다 —
// ZIP 안의 HWP 같은 **이진 파일을 못 꺼냈고**(23-24), 원본을 풀어 고친 뒤 **다시 묶지도 못했다**(23-28).
// 게다가 `EXTRACTABLE_ATTACHMENTS`에 'ZIP'이 있어 「내용 추출」은 눌리는데,
// 파일을 다 내려받은 **뒤에** 「지원하지 않는 형식」으로 거부당했다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REASON, extractFile, readZipFiles, zipEntryNames } from '../src/files.js';
import { zipBytes } from '../src/submission-zip.js';

const source = fs.readFileSync(new URL('../src/files.js', import.meta.url), 'utf8').split('\r\n').join('\n');
const bytesOf = value => new TextEncoder().encode(value);
// 글자가 아닌 것. 0x00~0xff를 그대로 담아 디코딩되면 깨지는 값을 쓴다.
const BINARY = new Uint8Array(Array.from({ length: 256 }, (_, index) => index));
const AT = '2026-08-24T00:00:00.000Z';
const HWPX = [
  { name: 'mimetype', bytes: bytesOf('application/hwp+zip') },
  { name: 'version.xml', bytes: bytesOf('<version/>') },
  { name: 'Contents/section0.xml', bytes: bytesOf('<hp:p><hp:t>사업 목적</hp:t></hp:p>') },
  { name: 'BinData/image1.bin', bytes: BINARY }
];

test('★ 이진 파일이 바이트 그대로 나온다', async () => {
  const zipped = zipBytes(HWPX, AT);
  const entries = await readZipFiles(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength));
  const image = entries.find(entry => entry.name === 'BinData/image1.bin');
  assert.ok(image, '이진 항목을 못 찾았다');
  assert.ok(image.bytes instanceof Uint8Array, '바이트가 아니라 다른 것이 왔다');
  assert.deepEqual([...image.bytes], [...BINARY]);
});

test('고르지 않으면 모든 항목을 돌려준다', async () => {
  // 다시 묶으려면 안 바꾸는 항목까지 들고 있어야 한다.
  const zipped = zipBytes(HWPX, AT);
  const all = await readZipFiles(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength));
  assert.deepEqual(all.map(entry => entry.name), HWPX.map(entry => entry.name));
  // 고르면 그것만 온다. 글자로 읽던 자리가 쓰는 길이다.
  const one = await readZipFiles(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength), name => name === 'version.xml');
  assert.deepEqual(one.map(entry => entry.name), ['version.xml']);
});

test('★ 풀었다가 그대로 다시 묶으면 원본과 같다', async () => {
  // mimetype이 맨 앞이고 STORE(무압축)이라 순서와 바이트가 그대로 살아난다.
  const original = zipBytes(HWPX, AT);
  const entries = await readZipFiles(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength));
  assert.equal(entries[0].name, 'mimetype', 'mimetype이 맨 앞이 아니다');
  const again = zipBytes(entries.map(entry => ({ name: entry.name, bytes: entry.bytes })), AT);
  assert.deepEqual([...again], [...original]);
});

test('압축된 항목도 풀어서 바이트로 준다', async () => {
  // 다른 프로그램이 만든 ZIP은 deflate로 들어온다. 우리 zipBytes는 STORE만 쓴다.
  const raw = bytesOf('압축된 내용입니다 '.repeat(40));
  const packed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const zipped = handMadeZip('deflated.txt', raw, packed);
  const entries = await readZipFiles(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength));
  assert.deepEqual([...entries[0].bytes], [...raw]);
});

test('폴더 표시와 맥 껍데기는 목록에서 뺀다', () => {
  const names = zipEntryNames([
    { name: '서식/' }, { name: '서식/신청서.hwp' }, { name: '__MACOSX/._신청서.hwp' }, { name: '.DS_Store' }, { name: '안내.pdf' }
  ]);
  assert.deepEqual(names, ['서식/신청서.hwp', '안내.pdf']);
});

// ---------- 첨부를 눌렀을 때 ----------

test('★ ZIP 첨부를 읽으면 안의 목록이 나온다', async () => {
  const zipped = zipBytes([
    { name: '1. 사업계획서 양식.txt', bytes: bytesOf('사업 목적을 적어 주세요.') },
    { name: '2. 작성가이드.txt', bytes: bytesOf('작성 요령입니다.') },
    { name: '__MACOSX/._1. 사업계획서 양식.txt', bytes: BINARY }
  ], AT);
  const read = await extractFile(new File([zipped], '2027년 배분신청서 표준양식 및 작성가이드 등.zip'));
  assert.equal(read.type, 'ZIP');
  assert.equal(read.extracted, true);
  // 목록이 먼저 나온다. 무엇이 들었는지 사용자가 본다.
  assert.deepEqual(read.entries, ['1. 사업계획서 양식.txt', '2. 작성가이드.txt']);
  assert.match(read.text, /안에 든 파일 2개/);
  assert.match(read.text, /· 1\. 사업계획서 양식\.txt/);
  // 읽을 수 있는 것은 그 자리에서 읽어 본문으로 잇는다.
  assert.match(read.text, /사업 목적을 적어 주세요\./);
  assert.match(read.text, /작성 요령입니다\./);
});

test('안을 하나도 못 읽으면 읽은 척하지 않는다', async () => {
  const zipped = zipBytes([{ name: '알 수 없는 것.xyz', bytes: bytesOf('내용') }], AT);
  await assert.rejects(
    () => extractFile(new File([zipped], '첨부.zip')),
    error => /안에 든 1개를 읽지 못했습니다/.test(error.message) && /알 수 없는 것\.xyz/.test(error.message)
  );
});

test('ZIP 안의 ZIP은 한 겹까지만 푼다', async () => {
  const inner = zipBytes([{ name: '속.txt', bytes: bytesOf('속 내용') }], AT);
  const outer = zipBytes([{ name: '겉.zip', bytes: inner }], AT);
  await assert.rejects(() => extractFile(new File([outer], '겉.zip')), /한 겹까지만/);
});

test('글자로 읽던 자리는 그대로다', () => {
  // HWPX·DOCX는 예전처럼 text를 받는다. 바이트 갈래를 감싸기만 했다.
  assert.match(source, /async function readZipEntries\(buffer, wanted\) \{\n\s*const decoder = new TextDecoder\(\);\n\s*return \(await readZipFiles\(buffer, wanted\)\)\.map\(entry => \(\{ name: entry\.name, text: decoder\.decode\(entry\.bytes\) \}\)\);/);
  assert.match(source, /readZipEntries\(buffer, name => \/\^Contents\\\/section\\d\+\\\.xml\$\/i\.test\(name\)\)/);
  assert.match(source, /readZipEntries\(buffer, name => name === 'word\/document\.xml'\)/);
  // 지원 형식 안내는 그대로 둔다 — ZIP은 첨부로만 들어오고 올리기 목록에는 넣지 않았다.
  assert.match(source, /export const SUPPORTED = Object\.freeze\(\['pdf', 'docx', 'txt', 'hwpx', 'hwp'\]\);/);
  assert.ok(REASON.unsupported.includes('지원하지 않는 형식'));
});

// 손으로 만든 ZIP 한 항목. deflate로 넣어 다른 프로그램이 만든 파일을 흉내 낸다.
function handMadeZip(name, raw, packed) {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const crc = crc32(raw);
  const local = new Uint8Array(30 + nameBytes.length + packed.length);
  const view = new DataView(local.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 8, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, packed.length, true);
  view.setUint32(22, raw.length, true);
  view.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(packed, 30 + nameBytes.length);
  const central = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(8, 0x0800, true);
  centralView.setUint16(10, 8, true);
  centralView.setUint32(16, crc, true);
  centralView.setUint32(20, packed.length, true);
  centralView.setUint32(24, raw.length, true);
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
