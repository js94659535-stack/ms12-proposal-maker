// HWPX(OWPML)는 XML을 담은 ZIP이고, 구형 HWP는 CFB 컨테이너다.
// 둘 다 외부 변환 서비스 없이 브라우저 안에서 읽는다. 읽지 못하면 읽은 척하지 않는다.
import { extractHwpDocument } from './hwp-text.js';

// 못 읽는 형식에는 언제나 같은 말로 변환을 안내한다.
export const HWP_CONVERT_GUIDE = 'HWPX·DOCX·PDF로 변환 후 다시 올려 주세요.';
import { loadModule } from './module-loader.js';
import { isImageType } from '../server/ocr.js';

const HWP_GUIDE = `한글 HWP 파일을 읽지 못했습니다. ${HWP_CONVERT_GUIDE}`;
// 지원 형식. 화면 안내와 input accept가 이 목록을 함께 쓴다.
export const SUPPORTED = Object.freeze(['pdf', 'docx', 'txt', 'hwpx', 'hwp']);
// 사진도 받는다(22-51). 사업자등록증을 찍어 올리는 것이 가장 흔한 길이다.
// 확장자가 아니라 MIME으로 가린다 — 붙여넣은 그림은 이름이 image.png라 확장자가 없을 수도 있다.
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const ACCEPT = `${SUPPORTED.map(item => `.${item}`).join(',')},${IMAGE_ACCEPT}`;

// 왜 못 읽었는지 갈라서 알려 준다. 원인을 뭉뚱그리면 사용자가 할 수 있는 일이 없다.
export const REASON = Object.freeze({
  empty: '빈 문서입니다. 내용이 있는 파일인지 확인해 주세요.',
  encrypted: '암호가 걸린 문서입니다. 암호를 푼 뒤 다시 올려 주세요.',
  damaged: '파일이 손상되었거나 형식과 내용이 다릅니다.',
  scanned: '글자가 없는 스캔 문서로 보입니다. 글자를 인식한 PDF나 원본 문서로 올려 주세요.',
  noImageReader: '사진에서 글자를 읽는 길이 이 화면에는 아직 없습니다. 파일로 올려 주세요.',
  unsupported: `지원하지 않는 형식입니다. ${HWP_CONVERT_GUIDE}`
});

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
async function readZipEntries(buffer, wanted) {
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

// 표 개수를 센다. HWPX·DOCX는 태그를, HWP는 개체 식별자를 본다.
function countXmlTables(xml, tag) {
  return (String(xml || '').match(new RegExp(`<(?:\\w+:)?${tag}(?=[\\s>])`, 'g')) || []).length;
}

// PDF 한 쪽의 글자 조각을 줄과 칸으로 되돌린다.
//
// 조각을 공백 하나로 이어 붙이면 한 쪽이 한 줄이 되고, 서식의 라벨과 값이 한 덩어리로 붙는다.
// 실제 사업자등록증명원에서 「상 호 ( 법 인 명 ) 주식회사 ○○」가 다른 칸의 글자들과 이어져
// 기관명·대표자·소재지를 한 건도 읽지 못했다. HWP 표에서 행을 되살린 것과 같은 결이다.
//
// 줄은 pdf.js가 알려 주는 줄 끝(hasEOL)으로 나누고, 칸은 조각 사이가 글자 하나쯤 벌어졌는지로 본다.
// 위치는 pdf.js가 주는 값을 그대로 쓴다 — 짐작하지 않는다.
export function pageText(items = []) {
  const lines = [];
  let line = '';
  let previousEnd = null;
  for (const item of items) {
    if (!item.str) {
      if (item.hasEOL) { lines.push(line); line = ''; previousEnd = null; }
      continue;
    }
    const left = item.transform?.[4] ?? 0;
    const unit = Math.abs(item.transform?.[0] ?? 10) || 10;
    if (previousEnd !== null) {
      const gap = left - previousEnd;
      line += gap > unit * 0.9 ? '\t' : gap > unit * 0.15 ? ' ' : '';
    }
    line += item.str;
    previousEnd = left + (item.width ?? 0);
    if (item.hasEOL) { lines.push(line); line = ''; previousEnd = null; }
  }
  if (line) lines.push(line);
  return lines.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractFile(file, options = {}) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const size = file.size;
  if (size > 20 * 1024 * 1024) throw new Error(`${file.name}: 파일은 20MB 이하여야 합니다.`);
  if (size === 0) throw new Error(`${file.name}: ${REASON.empty}`);

  // 사진은 형식을 MIME으로 가린다. 붙여넣은 그림은 이름이 image.png이거나 이름이 없다.
  if (isImageType(file.type)) {
    if (!options.readImages) throw new Error(`${file.name}: ${REASON.noImageReader}`);
    return options.readImages([file], { from: '사진', name: file.name, size });
  }

  if (extension === 'txt') {
    const text = await file.text();
    if (!text.trim()) throw new Error(`${file.name}: ${REASON.empty}`);
    return { name: file.name, type: 'TXT', size, text, pages: 1, tables: 0, extracted: true };
  }

  if (extension === 'hwp') {
    let result;
    try {
      result = await extractHwpDocument(await file.arrayBuffer());
    } catch (error) {
      // 원인을 그대로 전한다. 못 읽은 것을 읽은 것처럼 만들지 않는다.
      throw new Error(`${file.name}: ${error?.message || HWP_GUIDE}`);
    }
    return { name: file.name, type: 'HWP', size, text: result.text, pages: null, tables: result.tables, extracted: true };
  }

  if (extension === 'hwpx') {
    const buffer = await file.arrayBuffer();
    let text = '';
    let tables = 0;
    try {
      const sections = await hwpxSections(buffer);
      text = sections.map(section => hwpxSectionText(section)).filter(Boolean).join('\n\n');
      tables = sections.reduce((sum, section) => sum + countXmlTables(section, 'tbl'), 0);
    } catch (error) {
      throw new Error(`${file.name}: ${error?.message || REASON.damaged}`);
    }
    if (!text.trim()) throw new Error(`${file.name}: ${REASON.scanned} ${HWP_CONVERT_GUIDE}`);
    return { name: file.name, type: 'HWPX', size, text, pages: null, tables, extracted: true };
  }

  if (extension === 'docx') {
    const mammoth = await loadModule(() => import('mammoth/mammoth.browser'), 'DOCX 읽기');
    const buffer = await file.arrayBuffer();
    let result;
    try {
      result = await mammoth.extractRawText({ arrayBuffer: buffer });
    } catch (error) {
      throw new Error(`${file.name}: ${/password|encrypt/i.test(String(error?.message)) ? REASON.encrypted : REASON.damaged}`);
    }
    if (!String(result.value || '').trim()) throw new Error(`${file.name}: ${REASON.empty}`);
    // 표 개수는 원본 XML에서 센다. mammoth는 표를 글자로만 돌려준다.
    let tables = 0;
    try { tables = countXmlTables((await readZipEntries(buffer, name => name === 'word/document.xml'))[0]?.text || '', 'tbl'); } catch { /* 표 수는 못 세도 본문은 쓴다 */ }
    return { name: file.name, type: 'DOCX', size, text: result.value, pages: null, tables, extracted: true, warnings: result.messages.map(v => v.message) };
  }

  if (extension === 'pdf') {
    const pdfjs = await loadModule(() => import('pdfjs-dist'), 'PDF 읽기');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    let pdf;
    try {
      pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    } catch (error) {
      const message = String(error?.name || error?.message || '');
      if (/Password/i.test(message)) throw new Error(`${file.name}: ${REASON.encrypted}`);
      throw new Error(`${file.name}: ${REASON.damaged}`);
    }
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      pages.push(`[${pageNo}쪽]\n${pageText(content.items)}`);
    }
    const text = pages.join('\n\n');
    // 쪽은 있는데 글자가 거의 없으면 스캔본이다. 전에는 여기서 돌려보냈고, 이제 이 자리가 사진 읽기로 가는 문이다.
    if (text.replace(/\[\d+쪽\]/g, '').trim().length < 20) {
      if (!options.readImages) throw new Error(`${file.name}: ${REASON.scanned}`);
      return options.readImages(file, { from: 'PDF', name: file.name, size, pages: pdf.numPages });
    }
    return { name: file.name, type: 'PDF', size, text, pages: pdf.numPages, tables: 0, extracted: true };
  }

  // ZIP은 첨부로 자주 온다 — 공고 한 건에 서식 여러 개가 묶여 있다(23-24의 그 파일).
  // 예전에는 여기까지 와서 「지원하지 않는 형식」으로 돌아갔다. 버튼은 눌리는데 뒤에서 거부하니
  // 사용자는 파일을 다 내려받은 뒤에야, 그것도 까닭 없이 막혔다.
  if (extension === 'zip') {
    if (options.zipDepth >= 1) throw new Error(`${file.name}: ZIP 안의 ZIP은 한 겹까지만 풉니다.`);
    let entries;
    try {
      entries = await readZipFiles(await file.arrayBuffer());
    } catch (error) {
      throw new Error(`${file.name}: ${error?.message || REASON.damaged}`);
    }
    const names = zipEntryNames(entries);
    if (!names.length) throw new Error(`${file.name}: ${REASON.empty}`);
    const inner = [];
    const skipped = [];
    for (const entry of entries) {
      if (!names.includes(entry.name)) continue;
      const short = entry.name.split('/').pop();
      // 안의 파일을 같은 길로 다시 읽는다. 읽는 규칙을 두 벌 두지 않는다.
      try {
        const read = await extractFile(new File([entry.bytes], short), { ...options, zipDepth: (options.zipDepth || 0) + 1 });
        inner.push({ name: short, text: read.text, tables: read.tables || 0 });
      } catch (error) {
        skipped.push(`${short} — ${String(error?.message || '').replace(`${short}: `, '')}`);
      }
    }
    // 읽은 것이 하나도 없으면 읽은 척하지 않는다. 무엇이 들었는지는 알려 준다.
    if (!inner.length) throw new Error(`${file.name}: 안에 든 ${names.length}개를 읽지 못했습니다. ${skipped.join(' / ')}`);
    const head = `[ZIP: ${file.name}] 안에 든 파일 ${names.length}개\n${names.map(one => `· ${one}`).join('\n')}`;
    const body = inner.map(one => `\n\n[${one.name}]\n${one.text}`).join('');
    const tail = skipped.length ? `\n\n[읽지 못한 파일 ${skipped.length}개]\n${skipped.map(one => `· ${one}`).join('\n')}` : '';
    return { name: file.name, type: 'ZIP', size, text: `${head}${body}${tail}`, pages: null, tables: inner.reduce((sum, one) => sum + one.tables, 0), extracted: true, entries: names };
  }

  throw new Error(`${file.name}: ${REASON.unsupported} 지원 형식은 PDF·DOCX·TXT·HWPX·HWP입니다.`);
}

export async function extractFiles(files, onProgress, options = {}) {
  const results = [];
  for (let i = 0; i < files.length; i += 1) {
    onProgress?.(`${files[i].name} 읽는 중 (${i + 1}/${files.length})`);
    results.push(await extractFile(files[i], options));
  }
  return results;
}
