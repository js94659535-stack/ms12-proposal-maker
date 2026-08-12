import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { extractHwpxText, hwpxSectionText } from '../src/files.js';

// 실제 한/글 없이 OWPML 구조와 같은 ZIP을 만들어 검증한다.
const SECTION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
<hp:p><hp:run><hp:t>QA 외부 사업계획서</hp:t></hp:run></hp:p>
<hp:p><hp:run><hp:t>사업 대상: 지역 중학생 30명</hp:t><hp:lineBreak/><hp:t>선정기준 &amp; 모집방법 확인 필요</hp:t></hp:run></hp:p>
<hp:p><hp:run><hp:tab/><hp:t>예산 30,000,000원</hp:t></hp:run></hp:p>
<hp:tbl><hp:tr><hp:tc><hp:p><hp:run><hp:t>회기</hp:t></hp:run></hp:p></hp:tc><hp:tc><hp:p><hp:run><hp:t>20회</hp:t></hp:run></hp:p></hp:tc></hp:tr></hp:tbl>
</hs:sec>`;

function zipBuffer(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content, store] of files) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(content);
    const data = store ? raw : zlib.deflateRawSync(raw);
    const local = Buffer.alloc(30 + nameBytes.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    Buffer.from(nameBytes).copy(local, 30);
    Buffer.from(data).copy(local, 30 + nameBytes.length);
    locals.push(local);
    const entry = Buffer.alloc(46 + nameBytes.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(store ? 0 : 8, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    Buffer.from(nameBytes).copy(entry, 46);
    central.push(entry);
    offset += local.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, directory, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

test('HWPX 본문 XML에서 문단·줄바꿈·표 구분을 유지해 텍스트를 뽑는다', () => {
  const text = hwpxSectionText(SECTION_XML);
  assert.match(text, /^QA 외부 사업계획서/);
  assert.match(text, /사업 대상: 지역 중학생 30명\n선정기준 & 모집방법 확인 필요/);
  assert.match(text, /\t예산 30,000,000원/);
  assert.match(text, /회기\t/);
  assert.match(text, /20회/);
  // 표기만 옮기고 없는 문장을 만들지 않는다.
  assert.equal(text.includes('<hp:'), false);
  assert.equal(hwpxSectionText(''), '');
  // 실제 문서의 텍스트 안에는 강조·필드 같은 태그가 섞여 들어온다.
  assert.equal(hwpxSectionText('<hp:p><hp:run><hp:t>확정 인원 <hp:markpenBegin/>30명<hp:markpenEnd/> 유지</hp:t></hp:run></hp:p>'), '확정 인원 30명 유지');
  assert.equal(hwpxSectionText('<hp:p><hp:run><hp:t>조건 &lt;별표1&gt; 확인</hp:t></hp:run></hp:p>'), '조건 <별표1> 확인');
});

test('HWPX ZIP에서 section 순서대로 본문을 읽는다', async () => {
  const buffer = zipBuffer([
    ['mimetype', 'application/hwp+zip', true],
    ['Contents/section1.xml', SECTION_XML.replace('QA 외부 사업계획서', 'QA 두 번째 구역'), false],
    ['Contents/section0.xml', SECTION_XML, false],
    ['Contents/header.xml', '<hh:head/>', false]
  ]);
  const text = await extractHwpxText(buffer);
  assert.ok(text.indexOf('QA 외부 사업계획서') < text.indexOf('QA 두 번째 구역'));
  assert.match(text, /20회/);

  // 본문이 없는 ZIP과 HWP 바이너리는 안내 오류로 처리한다.
  await assert.rejects(() => extractHwpxText(zipBuffer([['mimetype', 'application/hwp+zip', true]])), /Contents\/section0\.xml/);
  const hwpBinary = new TextEncoder().encode('\xd0\xcf\x11\xe0HWP Document File').buffer;
  await assert.rejects(() => extractHwpxText(hwpBinary), /HWPX 형식이 아닙니다/);
});

test('업로드 화면과 안내 문구에 HWPX가 연결된다', () => {
  const filesSource = fs.readFileSync(new URL('../src/files.js', import.meta.url), 'utf8');
  assert.match(filesSource, /extension === 'hwp'/);
  // 구형 HWP도 실제로 읽는다. 못 읽을 때만 변환을 안내한다.
  assert.match(filesSource, /extractHwpText/);
  assert.match(filesSource, /HWP_CONVERT_GUIDE/);
  const hwpSource = fs.readFileSync(new URL('../src/hwp.js', import.meta.url), 'utf8');
  assert.match(hwpSource, /HWPX·DOCX·PDF로 변환 후 다시 올려 주세요/);
  assert.doesNotMatch(filesSource, /jszip|pako|fflate/i);

  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal((appSource.match(/accept="\.pdf,\.docx,\.txt,\.hwpx,\.hwp"/g) || []).length, 4);
  assert.match(appSource, /PDF·DOCX·TXT·HWPX·HWP 불러오기/);
  assert.doesNotMatch(appSource, /accept="\.pdf,\.docx,\.txt"/);
});
