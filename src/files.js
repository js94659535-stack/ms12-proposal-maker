// HWPX(OWPML)는 XML을 담은 ZIP이므로 외부 변환 서비스 없이 브라우저·Node 공통 DecompressionStream만으로 본문을 읽는다.
const HWP_GUIDE = '한글 HWP(바이너리) 파일은 브라우저에서 직접 읽을 수 없습니다. 한/글에서 [다른 이름으로 저장] → HWPX 또는 PDF·DOCX로 저장한 뒤 다시 올려 주세요.';

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 HWPX 압축 해제를 지원하지 않습니다. PDF 또는 DOCX로 저장해 올려 주세요.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ZIP central directory만 읽어 필요한 항목을 꺼낸다. 전체 ZIP 라이브러리를 추가하지 않는다.
async function readZipEntries(buffer, wanted) {
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
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (wanted(name)) entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const results = [];
  for (const entry of entries) {
    if (view.getUint32(entry.localOffset, true) !== 0x04034b50) continue;
    const start = entry.localOffset + 30 + view.getUint16(entry.localOffset + 26, true) + view.getUint16(entry.localOffset + 28, true);
    const raw = bytes.subarray(start, start + entry.compressedSize);
    if (entry.method !== 0 && entry.method !== 8) throw new Error('지원하지 않는 ZIP 압축 방식입니다.');
    results.push({ name: entry.name, text: decoder.decode(entry.method === 0 ? raw : await inflateRaw(raw)) });
  }
  return results;
}

function decodeXmlText(value) {
  // 원문 텍스트 안의 &lt;는 아직 문자참조이므로, 남은 태그만 제거한 뒤 문자참조를 되돌린다.
  return String(value).replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// OWPML 본문에서 문단·표 구분만 유지하고 텍스트를 뽑는다. 문장을 새로 만들거나 요약하지 않는다.
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

export async function extractHwpxText(buffer) {
  if (new TextDecoder().decode(new Uint8Array(buffer).subarray(0, 2)) !== 'PK') throw new Error(`HWPX 형식이 아닙니다. ${HWP_GUIDE}`);
  const sections = (await readZipEntries(buffer, name => /^Contents\/section\d+\.xml$/i.test(name)))
    .sort((left, right) => Number(left.name.match(/\d+/)[0]) - Number(right.name.match(/\d+/)[0]));
  if (!sections.length) throw new Error('HWPX 본문(Contents/section0.xml)을 찾지 못했습니다.');
  return sections.map(section => hwpxSectionText(section.text)).filter(Boolean).join('\n\n');
}

export async function extractFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: 파일은 20MB 이하여야 합니다.`);
  if (extension === 'txt') return { name: file.name, type: 'TXT', text: await file.text(), pages: 1 };
  if (extension === 'hwp') throw new Error(`${file.name}: ${HWP_GUIDE}`);
  if (extension === 'hwpx') {
    const text = await extractHwpxText(await file.arrayBuffer());
    if (!text.trim()) throw new Error(`${file.name}: HWPX에서 본문 텍스트를 찾지 못했습니다. 표·이미지만 있는 문서라면 PDF로 저장해 올려 주세요.`);
    return { name: file.name, type: 'HWPX', text, pages: null };
  }
  if (extension === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { name: file.name, type: 'DOCX', text: result.value, pages: null, warnings: result.messages.map(v => v.message) };
  }
  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      pages.push(`[${pageNo}쪽]\n${content.items.map(item => item.str).join(' ')}`);
    }
    return { name: file.name, type: 'PDF', text: pages.join('\n\n'), pages: pdf.numPages };
  }
  throw new Error(`${file.name}: PDF, DOCX, TXT, HWPX만 지원합니다. HWP는 한/글에서 HWPX·PDF·DOCX로 저장해 올려 주세요.`);
}

export async function extractFiles(files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i += 1) {
    onProgress?.(`${files[i].name} 읽는 중 (${i + 1}/${files.length})`);
    results.push(await extractFile(files[i]));
  }
  return results;
}
