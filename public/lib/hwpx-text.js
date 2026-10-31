// HWPX(OWPML)와 ZIP을 외부 라이브러리 없이 읽는다. 화면(public)과 명령줄(src/files.js)이 함께 쓴다.
// 못 읽는 형식에는 언제나 같은 말로 변환을 안내한다.
export const HWP_CONVERT_GUIDE = 'HWPX·DOCX·PDF로 변환 후 다시 올려 주세요.';
const HWP_GUIDE = `한글 HWP 파일을 읽지 못했습니다. ${HWP_CONVERT_GUIDE}`;
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 HWPX 압축 해제를 지원하지 않습니다. PDF 또는 DOCX로 저장해 올려 주세요.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// 항목 이름의 글자표. 플래그 0x800이 켜져 있으면 UTF-8이고, 꺼져 있으면 만든 프로그램의 기본 글자표다.
// 윈도에서 만든 한글 이름 ZIP은 대개 CP949이고 비트가 꺼져 있다 —
// 실제 공고 첨부에서 플래그가 `0x0000`이라 이름이 통째로 깨졌다(24-01에서 실측).
// EUC-KR은 ASCII와 같은 자리를 쓰므로 영문 이름은 어느 쪽으로 읽어도 같다.
export function decodeZipName(bytes, flag) {
  if (flag & 0x800) return new TextDecoder().decode(bytes);
  // 이 글자표를 모르는 곳에서는 예전처럼 UTF-8로 읽는다. 이름 때문에 파일을 통째로 못 열면 안 된다.
  try { return new TextDecoder('euc-kr').decode(bytes); } catch { return new TextDecoder().decode(bytes); }
}

// ZIP central directory만 읽어 필요한 항목을 꺼낸다. 전체 ZIP 라이브러리를 추가하지 않는다.
//
// 바이트로 꺼낸다(23-29). 예전에는 글자로 풀어 돌려주기만 해서 두 자리가 함께 막혀 있었다 —
// ZIP 안의 HWP 같은 **이진 파일을 못 꺼냈고**(23-24), 원본을 풀어 고친 뒤 **다시 묶지도 못했다**(23-28).
// 다시 묶으려면 안 바꾸는 항목까지 바이트 그대로 들고 있어야 하므로, 무엇을 꺼낼지 고르지 않으면
// 전부 돌려준다. 글자로 읽던 자리(HWPX·DOCX)는 아래 readZipEntries가 그대로 감싼다.
export async function readZipFiles(buffer, wanted = () => true) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66_000); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { end = index; break; }
  }
  if (end < 0) throw new Error('ZIP 구조를 찾지 못했습니다.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = [];
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    // ZIP은 이름을 어떤 글자표로 담았는지 플래그 한 비트로만 말한다.
    const flag = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decodeZipName(bytes.subarray(offset + 46, offset + 46 + nameLength), flag);
    if (wanted(name)) entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const results = [];
  for (const entry of entries) {
    if (view.getUint32(entry.localOffset, true) !== 0x04034b50) continue;
    const start = entry.localOffset + 30 + view.getUint16(entry.localOffset + 26, true) + view.getUint16(entry.localOffset + 28, true);
    const raw = bytes.subarray(start, start + entry.compressedSize);
    if (entry.method !== 0 && entry.method !== 8) throw new Error('지원하지 않는 ZIP 압축 방식입니다.');
    results.push({ name: entry.name, bytes: entry.method === 0 ? raw.slice() : await inflateRaw(raw) });
  }
  return results;
}

// 글자로 읽는 자리는 이 갈래를 쓴다. 하는 일이 예전과 같다.
export async function readZipEntries(buffer, wanted) {
  const decoder = new TextDecoder();
  return (await readZipFiles(buffer, wanted)).map(entry => ({ name: entry.name, text: decoder.decode(entry.bytes) }));
}

// ZIP 안에서 읽어 볼 만한 것만 고른다. 폴더 표시와 맥에서 붙는 껍데기는 뺀다.
const ZIP_SKIP = /(^|\/)(__MACOSX\/|\.)/;
export function zipEntryNames(entries) {
  return entries.filter(entry => !entry.name.endsWith('/') && !ZIP_SKIP.test(entry.name)).map(entry => entry.name);
}

function decodeXmlText(value) {
  // 원문 텍스트 안의 &lt;는 아직 문자참조이므로, 남은 태그만 제거한 뒤 문자참조를 되돌린다.
  return String(value).replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// OWPML 본문에서 문단·표 구분만 유지하고 텍스트를 뽑는다. 문장을 새로 만들거나 요약하지 않는다.
// HWPX에서도 같은 것을 뽑는다 — 칸이 하나뿐인 맨 바깥 표가 안내 박스다.
// 표 안의 표는 세지 않으려고 `<hp:tbl>` 안에 또 `<hp:tbl>`이 있으면 건너뛴다.
export function hwpxGuideBoxes(xml) {
  const boxes = [];
  for (const table of String(xml).match(/<hp:tbl[\s>][\s\S]*?<\/hp:tbl>/g) || []) {
    if ((table.match(/<hp:tbl[\s>]/g) || []).length !== 1) continue;
    if ((table.match(/<hp:tc[\s>]/g) || []).length !== 1) continue;
    const text = hwpxSectionText(table).replace(/\s+/g, ' ').trim();
    if (text) boxes.push(text);
  }
  return boxes;
}

export function hwpxSectionText(xml) {
  const pattern = /<(?:\w+:)?t(?=[\s>])[^>]*>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?lineBreak\b[^>]*\/?>|<(?:\w+:)?tab\b[^>]*\/?>|<(?:\w+:)?tbl(?=[\s>])[^>]*>|<\/(?:\w+:)?tbl>|<\/(?:\w+:)?p>|<\/(?:\w+:)?tc>|<\/(?:\w+:)?tr>/g;
  let text = '';
  let tableDepth = 0;
  for (const match of String(xml || '').matchAll(pattern)) {
    const token = match[0];
    if (match[1] !== undefined) { text += decodeXmlText(match[1]); continue; }
    if (/lineBreak/.test(token)) { text += '\n'; continue; }
    if (/tab\b/.test(token)) { text += '\t'; continue; }
    if (/<(?:\w+:)?tbl/.test(token)) { tableDepth += 1; continue; }
    if (/<\/(?:\w+:)?tbl>/.test(token)) { tableDepth = Math.max(0, tableDepth - 1); text += '\n'; continue; }
    if (/<\/(?:\w+:)?tc>/.test(token)) { text += '\t'; continue; }
    if (/<\/(?:\w+:)?tr>/.test(token)) { text += '\n'; continue; }
    // 표 안의 문단 끝은 칸 구분자가 대신하므로 줄을 나누지 않는다.
    text += tableDepth ? ' ' : '\n';
  }
  return text.replace(/ +\t/g, '\t').replace(/\t +/g, '\t').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function hwpxSections(buffer) {
  if (new TextDecoder().decode(new Uint8Array(buffer).subarray(0, 2)) !== 'PK') throw new Error(`HWPX 형식이 아닙니다. ${HWP_CONVERT_GUIDE}`);
  const sections = (await readZipEntries(buffer, name => /^Contents\/section\d+\.xml$/i.test(name)))
    .sort((left, right) => Number(left.name.match(/\d+/)[0]) - Number(right.name.match(/\d+/)[0]));
  if (!sections.length) throw new Error('HWPX 본문(Contents/section0.xml)을 찾지 못했습니다.');
  return sections.map(section => section.text);
}

export async function extractHwpxText(buffer) {
  if (new TextDecoder().decode(new Uint8Array(buffer).subarray(0, 2)) !== 'PK') throw new Error(`HWPX 형식이 아닙니다. ${HWP_GUIDE}`);
  const sections = (await readZipEntries(buffer, name => /^Contents\/section\d+\.xml$/i.test(name)))
    .sort((left, right) => Number(left.name.match(/\d+/)[0]) - Number(right.name.match(/\d+/)[0]));
  if (!sections.length) throw new Error('HWPX 본문(Contents/section0.xml)을 찾지 못했습니다.');
  return sections.map(section => hwpxSectionText(section.text)).filter(Boolean).join('\n\n');
}
