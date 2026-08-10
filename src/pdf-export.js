// 저장된 버전 하나로 실제 .pdf 파일을 만든다. 브라우저 인쇄창을 쓰지 않는다.
// 한글은 재배포 가능한 Noto Sans KR(SIL OFL 1.1) 한국어 서브셋을 넣어 검색·복사되는 텍스트로 남긴다.
export const PDF_FONT = 'NotoSansKR';
// A4 세로. 여백은 인쇄용 CSS와 같은 값을 쓴다.
export const PAGE = { width: 210, height: 297, top: 16, right: 15, bottom: 18, left: 15 };
const SIZE = { title: 17, heading: 13, body: 10.5, table: 9, note: 8.5 };
const LINE = { title: 8.5, heading: 6.4, body: 5.2, table: 4.4 };

const contentWidth = () => PAGE.width - PAGE.left - PAGE.right;

// 한국어 서브셋에 없는 글자는 그리면 소리 없이 사라진다(빈칸만 남는다).
// 뜻이 같은 글자로 바꿔 두어 「①」이나 「－」가 통째로 없어지지 않게 한다.
const GLYPH_MAP = new Map(Object.entries({
  '　': ' ', '→': '->', '←': '<-', '↔': '<->', '⇒': '=>',
  '∼': '~', '〜': '~', '￦': '\\', '￥': '\\',
  '「': '‘', '」': '’', '『': '“', '』': '”',
  '【': '[', '】': ']', '〔': '(', '〕': ')'
}));
const CIRCLED = '①'; // ① … ⑳
// 공고문에 흔한 로마 숫자(Ⅰ. 사업개요)도 서브셋에 없다.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export function normalizeForPdf(value) {
  let text = String(value ?? '').replace(/\r\n?/g, '\n');
  text = text.replace(/[①-⑳]/g, char => `(${char.codePointAt(0) - CIRCLED.codePointAt(0) + 1})`);
  text = text.replace(/[Ⅰ-Ⅻ]/g, char => ROMAN[char.codePointAt(0) - 'Ⅰ'.codePointAt(0)] || char);
  text = text.replace(/[ⅰ-ⅻ]/g, char => (ROMAN[char.codePointAt(0) - 'ⅰ'.codePointAt(0)] || char).toLowerCase());
  // 전각 ASCII(！ ~ ～)는 같은 자리의 반각으로 바꾼다.
  text = text.replace(/[！-～]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
  return text.replace(/[　←→↔⇒∼〜￥￦「-』【】〔〕]/g, char => GLYPH_MAP.get(char) ?? char);
}
const clean = value => normalizeForPdf(value);

// 본문·표를 한 번에 그린다. 글꼴이 등록된 jsPDF 문서를 받아 쓰므로 브라우저와 검증에서 같은 경로를 탄다.
export function renderProposalPdf(doc, { project = {}, sections = [], tables = [] } = {}) {
  const bottom = PAGE.height - PAGE.bottom;
  let y = PAGE.top;
  const newPage = () => { doc.addPage(); y = PAGE.top; };
  // 남은 높이가 부족하면 쪽을 넘긴다. 빈 쪽을 만들지 않도록 맨 위에서는 넘기지 않는다.
  const need = height => { if (y > PAGE.top && y + height > bottom) newPage(); };
  const write = (text, { size, lineHeight, gap = 0 }) => {
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(clean(text), contentWidth())) {
      need(lineHeight);
      doc.text(line, PAGE.left, y + lineHeight * 0.75);
      y += lineHeight;
    }
    y += gap;
  };

  doc.setFont(PDF_FONT, 'normal');
  write(project.title || '사업계획서', { size: SIZE.title, lineHeight: LINE.title, gap: 4 });

  for (const section of sections) {
    // 제목만 쪽 끝에 남지 않게 본문 한 줄까지 함께 들어갈 자리를 본다.
    need(LINE.heading + LINE.body);
    write(section.title || '', { size: SIZE.heading, lineHeight: LINE.heading, gap: 1.2 });
    write(section.content || '', { size: SIZE.body, lineHeight: LINE.body, gap: 3.5 });
  }

  for (const table of tables) {
    const rows = (table?.rows || []).filter(row => (row || []).length);
    if (!rows.length) continue;
    need(LINE.heading + LINE.table * 2);
    write(table.title || table.kind || '표', { size: SIZE.heading, lineHeight: LINE.heading, gap: 1.2 });
    y = drawTable(doc, table, rows, y, { newPage, bottom });
    if (table.note) write(table.note, { size: SIZE.note, lineHeight: LINE.table, gap: 3 });
    else y += 3;
  }
  return doc;
}

// 표 한 개. 행은 쪼개지 않고, 쪽을 넘기면 머리행을 다시 그린다.
function drawTable(doc, table, rows, startY, { newPage, bottom }) {
  const columns = (table.columns || []).length ? table.columns : rows[0].map((_, index) => `열 ${index + 1}`);
  const width = contentWidth() / columns.length;
  const padding = 1.4;
  let y = startY;
  doc.setFontSize(SIZE.table);

  const cellLines = cells => columns.map((_, index) => doc.splitTextToSize(clean(cells[index] ?? ''), width - padding * 2));
  const rowHeight = lines => Math.max(...lines.map(item => item.length)) * LINE.table + padding * 2;
  const drawRow = (cells, height, lines) => {
    columns.forEach((_, index) => {
      const x = PAGE.left + width * index;
      doc.rect(x, y, width, height);
      lines[index].forEach((line, order) => doc.text(line, x + padding, y + padding + LINE.table * (order + 0.75)));
    });
    y += height;
  };
  const header = () => {
    const lines = cellLines(columns);
    const height = rowHeight(lines);
    if (y + height > bottom) { newPage(); y = PAGE.top; }
    drawRow(columns, height, lines);
  };

  header();
  for (const row of rows) {
    const lines = cellLines(row);
    const height = rowHeight(lines);
    // 행이 쪽 경계에 걸리면 통째로 다음 쪽으로 넘기고 머리행을 다시 그린다.
    if (y + height > bottom) { newPage(); y = PAGE.top; header(); }
    drawRow(row, height, lines);
  }
  return y + 2;
}

// 브라우저에서 실제 파일을 내려받는다. 글꼴은 눌렀을 때만 가져온다.
export async function exportProposalPdf({ project, sections, tables = [], fileName }) {
  const blob = await buildProposalPdfBlob({ project, sections, tables });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 파일로 내려받지 않고 내용만 만든다. 제출 ZIP은 이 결과를 그대로 담는다.
export async function buildProposalPdfBlob({ project, sections, tables = [] }) {
  if (!sections.length) throw new Error('PDF로 출력할 내용이 없습니다.');
  const [{ jsPDF }, fontUrl] = await Promise.all([
    import('jspdf'),
    import('./assets/noto-sans-kr-korean.ttf?url').then(module => module.default)
  ]);
  const response = await fetch(fontUrl);
  if (!response.ok) throw new Error('PDF용 한글 글꼴을 불러오지 못했습니다. PDF를 만들지 않았습니다.');
  const base64 = toBase64(new Uint8Array(await response.arrayBuffer()));
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('NotoSansKR.ttf', base64);
  doc.addFont('NotoSansKR.ttf', PDF_FONT, 'normal');
  renderProposalPdf(doc, { project, sections, tables });
  const blob = doc.output('blob');
  // 만들어진 결과가 PDF가 아니면 내려받지 않는다(HTML을 PDF처럼 주지 않는다).
  if (!blob || blob.size < 1000) throw new Error('PDF를 만들지 못했습니다. 파일을 내려받지 않았습니다.');
  return blob;
}

function toBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}
