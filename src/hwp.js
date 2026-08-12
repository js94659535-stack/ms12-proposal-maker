// 구형 HWP(한글 5.0 바이너리) 본문 읽기.
//
// HWP 5.0은 CFB(복합 파일) 컨테이너다. 안에 FileHeader와 BodyText/SectionN 스트림이 있고,
// 스트림은 보통 zlib(raw deflate)로 눌려 있다. 본문은 레코드 목록이며 그중
// HWPTAG_PARA_TEXT(태그 67)가 UTF-16LE 글자를 담는다.
//
// 외부 변환 서비스에 파일을 보내지 않는다. 브라우저 안에서만 읽는다.
// 읽지 못하면 읽은 척하지 않고 무엇이 문제인지 말한다.

export const HWP_CONVERT_GUIDE = 'HWPX·DOCX·PDF로 변환 후 다시 올려 주세요.';

// 문단 텍스트 레코드. 이 값만 글자를 담는다.
const TAG_PARA_TEXT = 67;
// 본문 글자 사이에 섞이는 제어문자. 표·그림 같은 개체 자리를 뜻한다.
const INLINE_CONTROLS = new Set([4, 5, 6, 7, 8, 9, 19, 20]);
const EXTENDED_CONTROLS = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

function utf16(bytes) {
  return new TextDecoder('utf-16le').decode(bytes);
}

// ---------- CFB(복합 파일) 최소 판독기 ----------
// 필요한 것은 디렉터리 항목과 스트림 두 종류뿐이라 전체 규격을 다 구현하지 않는다.
export function readCompoundFile(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 512) throw new Error('파일이 너무 작아 HWP 구조를 읽을 수 없습니다.');
  const signature = [...bytes.subarray(0, 8)].map(value => value.toString(16).padStart(2, '0')).join('');
  if (signature !== 'd0cf11e0a1b11ae1') throw new Error('HWP(한글 5.0) 형식이 아닙니다.');

  const sectorShift = view.getUint16(30, true);
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << view.getUint16(32, true);
  const directoryStart = view.getUint32(48, true);
  const miniCutoff = view.getUint32(56, true);
  const miniFatStart = view.getUint32(60, true);
  const difatStart = view.getUint32(68, true);
  const difatCount = view.getUint32(72, true);

  const sectorOffset = sector => (sector + 1) * sectorSize;
  const readSector = sector => bytes.subarray(sectorOffset(sector), sectorOffset(sector) + sectorSize);

  // FAT 조각 목록(DIFAT)을 모은다. 앞 109개는 헤더 안에 있다.
  const fatSectors = [];
  for (let index = 0; index < 109; index += 1) {
    const value = view.getUint32(76 + index * 4, true);
    if (value === FREESECT) break;
    fatSectors.push(value);
  }
  let next = difatStart;
  for (let index = 0; index < difatCount && next !== ENDOFCHAIN && next !== FREESECT; index += 1) {
    const base = sectorOffset(next);
    for (let slot = 0; slot < sectorSize / 4 - 1; slot += 1) {
      const value = view.getUint32(base + slot * 4, true);
      if (value !== FREESECT) fatSectors.push(value);
    }
    next = view.getUint32(base + sectorSize - 4, true);
  }

  const fat = [];
  for (const sector of fatSectors) {
    const base = sectorOffset(sector);
    for (let slot = 0; slot < sectorSize / 4; slot += 1) fat.push(view.getUint32(base + slot * 4, true));
  }

  const chain = (start, table) => {
    const list = [];
    let sector = start;
    // 순환 구조를 만난 손상 파일에서 멈추지 못하는 일을 막는다.
    const guard = new Set();
    while (sector !== ENDOFCHAIN && sector !== FREESECT && sector < table.length && !guard.has(sector)) {
      guard.add(sector);
      list.push(sector);
      sector = table[sector];
    }
    return list;
  };

  const readChain = (start, table, reader) => {
    const parts = chain(start, table).map(reader);
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  };

  // 디렉터리 항목을 읽는다. 이름은 UTF-16LE이다.
  const directory = readChain(directoryStart, fat, readSector);
  const entries = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = new DataView(directory.buffer, directory.byteOffset + offset + 64, 2).getUint16(0, true);
    if (!nameLength) continue;
    const name = utf16(directory.subarray(offset, offset + Math.max(0, nameLength - 2)));
    const entryView = new DataView(directory.buffer, directory.byteOffset + offset, 128);
    entries.push({
      name,
      type: entryView.getUint8(66),
      start: entryView.getUint32(116, true),
      size: entryView.getUint32(120, true)
    });
  }

  const root = entries.find(entry => entry.type === 5);
  const miniFat = miniFatStart === ENDOFCHAIN ? [] : (() => {
    const raw = readChain(miniFatStart, fat, readSector);
    const table = [];
    const miniView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    for (let slot = 0; slot + 4 <= raw.length; slot += 4) table.push(miniView.getUint32(slot, true));
    return table;
  })();
  const miniStream = root && root.size > 0 ? readChain(root.start, fat, readSector) : new Uint8Array(0);
  const readMini = sector => miniStream.subarray(sector * miniSectorSize, (sector + 1) * miniSectorSize);

  const streamOf = name => {
    const entry = entries.find(item => item.name === name && item.type === 2);
    if (!entry) return null;
    const data = entry.size < miniCutoff
      ? readChain(entry.start, miniFat, readMini)
      : readChain(entry.start, fat, readSector);
    return data.subarray(0, entry.size);
  };

  return { entries, streamOf };
}

// HWP 본문은 zlib 헤더 없는 raw deflate인데, 스트림이 끝난 뒤에 채움 바이트가 붙어 있다.
// DecompressionStream은 그 잉여 바이트를 보고 오류를 낸다. 그래서 한 번에 받지 않고
// 조각으로 읽어, 오류가 나기 전까지 나온 것을 쓴다. 실제 공고문 첨부가 이 모양이다.
async function inflate(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 HWP 압축 해제를 지원하지 않습니다.');
  for (const format of ['deflate-raw', 'deflate']) {
    const chunks = [];
    try {
      const decompressor = new DecompressionStream(format);
      const writer = decompressor.writable.getWriter();
      const reader = decompressor.readable.getReader();
      const pump = (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
        } catch { /* 뒤에 붙은 채움 바이트. 여기까지 읽은 것은 온전하다 */ }
      })();
      writer.write(bytes).catch(() => {});
      writer.close().catch(() => {});
      await pump;
    } catch { /* 다음 방식으로 */ }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (!total) continue;
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
    return out;
  }
  throw new Error('본문 압축을 풀지 못했습니다.');
}

// 레코드 목록을 훑어 문단 글자만 모은다.
export function readParagraphs(section) {
  const view = new DataView(section.buffer, section.byteOffset, section.byteLength);
  const lines = [];
  let offset = 0;
  while (offset + 4 <= section.length) {
    const header = view.getUint32(offset, true);
    const tag = header & 0x3ff;
    let size = (header >> 20) & 0xfff;
    let start = offset + 4;
    // 크기가 4095면 다음 4바이트가 진짜 크기다.
    if (size === 0xfff) { size = view.getUint32(start, true); start += 4; }
    if (start + size > section.length) break;
    if (tag === TAG_PARA_TEXT) lines.push(decodeParaText(section.subarray(start, start + size)));
    offset = start + size;
  }
  return lines;
}

// 문단 한 개의 글자. UTF-16LE에 제어문자가 섞여 있다.
export function decodeParaText(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let text = '';
  let index = 0;
  while (index + 2 <= bytes.length) {
    const code = view.getUint16(index, true);
    // 확장·인라인 제어문자는 둘 다 8글자(16바이트)를 차지한다.
    // 인라인을 2바이트로 보면 뒤따르는 정보 바이트가 글자로 새어 나온다(주소 끝에 붙던 깨진 글자).
    if (EXTENDED_CONTROLS.has(code) || INLINE_CONTROLS.has(code)) { index += 16; continue; }
    if (code === 10 || code === 13) { text += '\n'; index += 2; continue; }
    if (code === 24 || code === 30 || code === 31) { text += ' '; index += 2; continue; }
    if (code === 9) { text += '\t'; index += 2; continue; }
    text += String.fromCharCode(code);
    index += 2;
  }
  return text;
}

// 표는 개체(CTRL_HEADER)로 들어 있고 개체 종류를 4바이트 식별자로 적는다.
// 실제 공고문에서는 HWPTAG_TABLE(76)이 나타나지 않고 식별자 tbl 로만 구분됐다.
const TAG_CTRL_HEADER = 71;
export function countTables(section) {
  const view = new DataView(section.buffer, section.byteOffset, section.byteLength);
  let count = 0;
  let offset = 0;
  while (offset + 4 <= section.length) {
    const header = view.getUint32(offset, true);
    const tag = header & 0x3ff;
    let size = (header >> 20) & 0xfff;
    let start = offset + 4;
    if (size === 0xfff) { size = view.getUint32(start, true); start += 4; }
    if (start + size > section.length) break;
    // 식별자는 뒤집혀 저장된다. 'tbl '가 ' lbt'로 들어 있다.
    if (tag === TAG_CTRL_HEADER && size >= 4) {
      const id = String.fromCharCode(...section.subarray(start, start + 4)).split('').reverse().join('');
      if (id === 'tbl ') count += 1;
    }
    offset = start + size;
  }
  return count;
}

export async function extractHwpText(buffer) {
  const file = readCompoundFile(buffer);
  const header = file.streamOf('FileHeader');
  if (!header || header.length < 40) throw new Error('HWP 파일 머리말을 찾지 못했습니다.');
  const flags = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(36, true);
  const compressed = (flags & 1) === 1;
  const encrypted = (flags & 2) === 2;
  if (encrypted) throw new Error(`암호가 걸린 HWP 파일입니다. 암호를 푼 뒤 ${HWP_CONVERT_GUIDE}`);

  const sections = file.entries
    .filter(entry => entry.type === 2 && /^Section\d+$/i.test(entry.name))
    .sort((left, right) => Number(left.name.match(/\d+/)[0]) - Number(right.name.match(/\d+/)[0]));
  if (!sections.length) throw new Error('HWP 본문(BodyText/Section0)을 찾지 못했습니다.');

  let text = '';
  let tables = 0;
  for (const entry of sections) {
    const raw = file.streamOf(entry.name);
    if (!raw || !raw.length) continue;
    const body = compressed ? await inflate(raw) : raw;
    text += `${readParagraphs(body).join('\n')}\n`;
    tables += countTables(body);
  }
  const cleaned = text.replace(/ /g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) throw new Error(`본문 글자를 찾지 못했습니다. 그림으로만 된 문서일 수 있습니다. ${HWP_CONVERT_GUIDE}`);
  return { text: cleaned, tables };
}
