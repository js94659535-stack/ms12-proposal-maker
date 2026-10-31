// HWPX(OWPML)는 XML을 담은 ZIP이고, 구형 HWP는 CFB 컨테이너다.
// 둘 다 외부 변환 서비스 없이 브라우저 안에서 읽는다. 읽지 못하면 읽은 척하지 않는다.
import { extractHwpDocument } from '../public/lib/hwp-text.js';
import { HWP_CONVERT_GUIDE, decodeZipName, readZipFiles, readZipEntries, zipEntryNames, hwpxGuideBoxes, hwpxSectionText, hwpxSections, extractHwpxText } from '../public/lib/hwpx-text.js';
export { HWP_CONVERT_GUIDE, decodeZipName, readZipFiles, zipEntryNames, hwpxGuideBoxes, hwpxSectionText, hwpxSections, extractHwpxText };

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
    return { name: file.name, type: 'HWP', size, text: result.text, pages: null, tables: result.tables, guides: result.guides || [], extracted: true };
  }

  if (extension === 'hwpx') {
    const buffer = await file.arrayBuffer();
    let text = '';
    let tables = 0;
    let guides = [];
    try {
      const sections = await hwpxSections(buffer);
      text = sections.map(section => hwpxSectionText(section)).filter(Boolean).join('\n\n');
      tables = sections.reduce((sum, section) => sum + countXmlTables(section, 'tbl'), 0);
      guides = sections.flatMap(section => hwpxGuideBoxes(section));
    } catch (error) {
      throw new Error(`${file.name}: ${error?.message || REASON.damaged}`);
    }
    if (!text.trim()) throw new Error(`${file.name}: ${REASON.scanned} ${HWP_CONVERT_GUIDE}`);
    return { name: file.name, type: 'HWPX', size, text, pages: null, tables, guides, extracted: true };
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
