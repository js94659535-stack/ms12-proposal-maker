// HWP 5.0(바이너리) 본문 텍스트만 읽는다. 외부 변환 서비스나 새 의존성 없이 표준 DecompressionStream만 사용한다.
// 암호화·배포용 문서는 읽지 않고 변환 안내 상태로 남긴다.
const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const HWP_SIGNATURE = 'HWP Document File';
const PARA_TEXT_TAG = 67; // HWPTAG_PARA_TEXT

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
export function parseSectionRecords(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let text = '';
  while (offset + 4 <= bytes.length) {
    const header = view.getUint32(offset, true);
    const tag = header & 0x3ff;
    let size = (header >> 20) & 0xfff;
    offset += 4;
    if (size === 0xfff) { size = view.getUint32(offset, true); offset += 4; }
    if (offset + size > bytes.length) break;
    if (tag === PARA_TEXT_TAG) {
      for (let index = 0; index + 1 < size; index += 2) {
        const code = view.getUint16(offset + index, true);
        if (code === 13 || code === 10) { text += '\n'; continue; }
        if (code === 9) { text += '\t'; continue; }
        // 표·그림 등 확장 제어문자는 16바이트를 차지한다.
        if (code < 32) {
          if ([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23].includes(code)) { index += 14; text += ' '; }
          continue;
        }
        text += String.fromCharCode(code);
      }
      text += '\n';
    }
    offset += size;
  }
  return text;
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
  const text = parts.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 30) throw new HwpUnsupportedError('HWP에서 본문 텍스트를 찾지 못했습니다. PDF 또는 HWPX로 저장해 주세요.');
  return text;
}
