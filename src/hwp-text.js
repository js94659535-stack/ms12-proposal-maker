// HWP 5.0(바이너리) 본문 텍스트만 읽는다. 외부 변환 서비스나 새 의존성 없이 표준 DecompressionStream만 사용한다.
// 암호화·배포용 문서는 읽지 않고 변환 안내 상태로 남긴다.
const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const HWP_SIGNATURE = 'HWP Document File';
const PARA_TEXT_TAG = 67; // HWPTAG_PARA_TEXT
const CTRL_HEADER_TAG = 71; // HWPTAG_CTRL_HEADER — 개체(표·그림)의 시작
const LIST_HEADER_TAG = 72; // HWPTAG_LIST_HEADER — 표에서는 칸 하나의 시작이다

// 개체 식별자는 뒤집혀 저장된다. 'tbl '가 ' lbt'로 들어 있다.
function controlId(bytes, offset) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4)).split('').reverse().join('');
}

export class HwpUnsupportedError extends Error {}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new HwpUnsupportedError('이 환경에서는 HWP 압축을 해제할 수 없습니다.');
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.length;
    }
  } catch (error) {
    // HWP 스트림은 압축 데이터 뒤에 채움 바이트가 붙는다. 이미 푼 만큼은 그대로 사용한다.
    if (!length) throw error;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

// CFB(복합 문서) 구조에서 스트림만 꺼낸다.
function readCompoundFile(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (CFB_SIGNATURE.some((value, index) => bytes[index] !== value)) throw new HwpUnsupportedError('HWP(복합 문서) 형식이 아닙니다.');
  const sectorShift = view.getUint16(30, true);
  const miniSectorShift = view.getUint16(32, true);
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;
  const fatCount = view.getUint32(44, true);
  const directoryStart = view.getUint32(48, true);
  const miniFatStart = view.getUint32(60, true);
  const difatStart = view.getUint32(68, true);
  const difatCount = view.getUint32(72, true);
  const offsetOf = sector => (sector + 1) * sectorSize;

  const fatSectors = [];
  for (let index = 0; index < Math.min(109, fatCount); index += 1) {
    const sector = view.getUint32(76 + index * 4, true);
    if (sector <= 0xfffffffa) fatSectors.push(sector);
  }
  let difatSector = difatStart;
  for (let index = 0; index < difatCount && difatSector <= 0xfffffffa; index += 1) {
    const base = offsetOf(difatSector);
    for (let entry = 0; entry < sectorSize / 4 - 1; entry += 1) {
      const sector = view.getUint32(base + entry * 4, true);
      if (sector <= 0xfffffffa) fatSectors.push(sector);
    }
    difatSector = view.getUint32(base + sectorSize - 4, true);
  }

  const fat = [];
  for (const sector of fatSectors) {
    const base = offsetOf(sector);
    for (let entry = 0; entry < sectorSize / 4; entry += 1) fat.push(view.getUint32(base + entry * 4, true));
  }
  const chain = start => {
    const sectors = [];
    let sector = start;
    while (sector <= 0xfffffffa && sectors.length < 100_000) { sectors.push(sector); sector = fat[sector] ?? 0xfffffffe; }
    return sectors;
  };
  const readChain = (start, size) => {
    const sectors = chain(start);
    const out = new Uint8Array(sectors.length * sectorSize);
    sectors.forEach((sector, index) => out.set(bytes.subarray(offsetOf(sector), offsetOf(sector) + sectorSize), index * sectorSize));
    return size ? out.subarray(0, size) : out;
  };

  // 디렉터리 엔트리
  const directory = readChain(directoryStart, 0);
  const entries = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directory[offset + 64] | (directory[offset + 65] << 8);
    if (!nameLength) continue;
    const nameBytes = directory.subarray(offset, offset + Math.max(0, nameLength - 2));
    const name = new TextDecoder('utf-16le').decode(nameBytes);
    entries.push({
      name, type: directory[offset + 66],
      start: new DataView(directory.buffer, directory.byteOffset + offset + 116, 4).getUint32(0, true),
      size: new DataView(directory.buffer, directory.byteOffset + offset + 120, 4).getUint32(0, true)
    });
  }
  const root = entries.find(entry => entry.type === 5);
  const miniStream = root && root.size ? readChain(root.start, root.size) : new Uint8Array(0);
  const miniFat = [];
  if (miniFatStart <= 0xfffffffa) {
    const raw = readChain(miniFatStart, 0);
    const miniView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    for (let entry = 0; entry * 4 + 4 <= raw.length; entry += 1) miniFat.push(miniView.getUint32(entry * 4, true));
  }
  const readMini = (start, size) => {
    const out = new Uint8Array(size);
    let sector = start;
    let written = 0;
    while (sector <= 0xfffffffa && written < size) {
      const from = sector * miniSectorSize;
      const length = Math.min(miniSectorSize, size - written);
      out.set(miniStream.subarray(from, from + length), written);
      written += length;
      sector = miniFat[sector] ?? 0xfffffffe;
    }
    return out;
  };

  const streams = new Map();
  for (const entry of entries) {
    if (entry.type !== 2 || !entry.size) continue;
    streams.set(entry.name, entry.size < 4096 ? readMini(entry.start, entry.size) : readChain(entry.start, entry.size));
  }
  return streams;
}

// 본문 레코드에서 문단 텍스트만 뽑는다. 제어문자는 줄바꿈·탭으로만 바꾼다.
//
// 표는 칸을 탭으로, 행을 줄바꿈으로 남긴다. HWPX(</tc>=탭, </tr>=줄바꿈)와 같은 결이다.
// 짐작하지 않는다 — HWP는 칸마다 LIST_HEADER를 두고 그 안에 몇째 행·몇째 칸인지 적어 둔다.
//
// 예전에는 이 구분을 버려서 표 한 칸이 한 줄이 되었다. 실제 기관 연혁(99행)에서
// 「2017」 「1」 「송원대학교, 조선대학교」 「취창업 청년 캠프」가 서로 남남인 네 줄로 흩어져
// 사업실적 규칙이 한 건도 걸리지 않았다(후보 0건). 행이 살아나면 같은 규칙이 그대로 읽는다.
export function parseSectionRecords(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  // 조각으로 모았다가 마지막에 붙인다. 칸 끝의 공백을 지울 때 앞의 글을 다시 훑지 않는다.
  const out = [];
  // 지금 열려 있는 표. 표 안의 표도 각자 행 번호를 따로 센다.
  const tables = [];
  // 칸이 끝나면 그 칸 끝의 공백을 지운다. 칸 안 문단 끝의 공백이 탭에 붙지 않게 한다.
  const closeCell = () => {
    while (out.length && !out[out.length - 1].trim()) out.pop();
    if (out.length) out[out.length - 1] = out[out.length - 1].replace(/[ \t]+$/, '');
  };
  while (offset + 4 <= bytes.length) {
    const header = view.getUint32(offset, true);
    const tag = header & 0x3ff;
    // 레코드는 자기가 몇 단계 안에 있는지 함께 적는다. 표는 이 깊이로 시작과 끝을 안다.
    const level = (header >> 10) & 0x3ff;
    let size = (header >> 20) & 0xfff;
    offset += 4;
    if (size === 0xfff) { size = view.getUint32(offset, true); offset += 4; }
    if (offset + size > bytes.length) break;
    // 표보다 얕은 레코드가 나왔다면 그 표는 끝났다.
    while (tables.length && level <= tables[tables.length - 1].level) { tables.pop(); closeCell(); out.push('\n'); }
    if (tag === CTRL_HEADER_TAG && size >= 4 && controlId(bytes, offset) === 'tbl ') {
      tables.push({ level, row: -1 });
      out.push('\n');
      offset += size;
      continue;
    }
    // 표의 칸. 행 번호가 바뀌면 줄을 바꾸고, 같은 행이면 탭으로 칸만 나눈다.
    if (tag === LIST_HEADER_TAG && size >= 12 && tables.length && level === tables[tables.length - 1].level + 1) {
      const table = tables[tables.length - 1];
      const row = view.getUint16(offset + 10, true);
      if (table.row >= 0) { closeCell(); out.push(row === table.row ? '\t' : '\n'); }
      table.row = row;
      offset += size;
      continue;
    }
    if (tag === PARA_TEXT_TAG) {
      // 표 안에서는 문단이 끝나도 줄을 바꾸지 않는다. 줄은 행이, 칸은 탭이 나눈다.
      const paragraphBreak = tables.length ? ' ' : '\n';
      let chunk = '';
      for (let index = 0; index + 1 < size; index += 2) {
        const code = view.getUint16(offset + index, true);
        if (code === 13 || code === 10) { chunk += paragraphBreak; continue; }
        if (code === 9) { chunk += '\t'; continue; }
        // 표·그림 등 확장 제어문자와 인라인 제어문자는 둘 다 16바이트를 차지한다.
        // 인라인(4~9, 19, 20)을 2바이트로만 건너뛰면 뒤따르는 정보 바이트가
        // 글자로 새어 나온다. 실제 공고문에서 주소 끝에 한자가 붙던 원인이다.
        if (code < 32) {
          if ([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23].includes(code)) { index += 14; chunk += ' '; }
          else if ([4, 5, 6, 7, 8, 9, 19, 20].includes(code)) { index += 14; }
          continue;
        }
        chunk += String.fromCharCode(code);
      }
      out.push(chunk + paragraphBreak);
    }
    offset += size;
  }
  return out.join('');
}

export async function extractHwpText(buffer) {
  const streams = readCompoundFile(buffer);
  const header = streams.get('FileHeader');
  if (!header) throw new HwpUnsupportedError('HWP 파일 헤더를 찾지 못했습니다.');
  const signature = new TextDecoder('ascii').decode(header.subarray(0, HWP_SIGNATURE.length));
  if (signature !== HWP_SIGNATURE) throw new HwpUnsupportedError('지원하지 않는 HWP 형식입니다.');
  const flags = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(36, true);
  if (flags & 0x2) throw new HwpUnsupportedError('암호가 걸린 HWP는 읽을 수 없습니다. PDF 또는 HWPX로 저장해 주세요.');
  if (flags & 0x4) throw new HwpUnsupportedError('배포용으로 보호된 HWP는 읽을 수 없습니다. PDF 또는 HWPX로 저장해 주세요.');
  const compressed = Boolean(flags & 0x1);

  const sections = [...streams.entries()]
    .filter(([name]) => /^Section\d+$/.test(name))
    .sort((left, right) => Number(left[0].replace('Section', '')) - Number(right[0].replace('Section', '')));
  if (!sections.length) throw new HwpUnsupportedError('HWP 본문(BodyText/Section)을 찾지 못했습니다.');

  const parts = [];
  for (const [, raw] of sections) {
    const bytes = compressed ? await inflateRaw(raw) : raw;
    parts.push(parseSectionRecords(bytes));
  }
  // 칸 앞뒤의 공백은 지운다. 칸 안의 문단 끝이 공백으로 남아 탭에 붙기 때문이다.
  const text = parts.join('\n\n')
    .replace(/ +\t/g, '\t').replace(/\t +/g, '\t')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 30) throw new HwpUnsupportedError('HWP에서 본문 텍스트를 찾지 못했습니다. PDF 또는 HWPX로 저장해 주세요.');
  return text;
}

// 표 개수. 표는 개체(CTRL_HEADER)로 들어 있고 종류를 4바이트 식별자로 적는다.
// 실제 공고문에서는 HWPTAG_TABLE(76)이 나타나지 않고 식별자 'tbl '로만 구분됐다.
export function countSectionTables(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let count = 0;
  while (offset + 4 <= bytes.length) {
    const header = view.getUint32(offset, true);
    const tag = header & 0x3ff;
    let size = (header >> 20) & 0xfff;
    offset += 4;
    if (size === 0xfff) { size = view.getUint32(offset, true); offset += 4; }
    if (offset + size > bytes.length) break;
    if (tag === CTRL_HEADER_TAG && size >= 4 && controlId(bytes, offset) === 'tbl ') count += 1;
    offset += size;
  }
  return count;
}

// 본문과 표 개수를 함께 돌려준다. 첨부 진단 화면이 이 값을 쓴다.
export async function extractHwpDocument(buffer) {
  const text = await extractHwpText(buffer);
  let tables = 0;
  try {
    const streams = readCompoundFile(buffer);
    const flags = new DataView(streams.get('FileHeader').buffer, streams.get('FileHeader').byteOffset, streams.get('FileHeader').byteLength).getUint32(36, true);
    for (const [name, raw] of streams.entries()) {
      if (!/^Section\d+$/.test(name)) continue;
      tables += countSectionTables(flags & 0x1 ? await inflateRaw(raw) : raw);
    }
  } catch { /* 표 수를 못 세도 본문은 그대로 쓴다 */ }
  return { text, tables };
}
