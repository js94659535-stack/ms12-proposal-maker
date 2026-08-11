function documentText(project, sections) {
  return [project.title || '사업계획서', '', ...sections.flatMap(s => [s.title, s.content, `검토 상태: ${s.status}`, ''])].join('\n');
}

// 제출본 파일 이름. 기관명·사업명·버전을 담되 파일 시스템에서 안전한 문자만 남긴다.
export function submissionFileName(project = {}, { applicantName = '', version = 0, kind = 'docx' } = {}) {
  const parts = [applicantName, project.title || '사업계획서', version ? `V${version}` : '', '제출본'].filter(Boolean);
  return `${safeName(parts.join('_'), 120)}.${kind}`;
}

export async function exportDocx(project, sections, options = {}) {
  const { forSubmission = false, applicantName = '', version = 0 } = options;
  const blob = await buildDocxBlob(project, sections, options);
  download(blob, forSubmission ? submissionFileName(project, { applicantName, version, kind: 'docx' }) : `${safeName(project.title)}_검토용.docx`);
}

// 파일로 내려받지 않고 내용만 만든다. 제출 ZIP은 이 결과를 그대로 담는다.
export async function buildDocxBlob(project, sections, options = {}) {
  const { forSubmission = false, tables = [], pageBreaks = [] } = options;
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } = await import('docx');
  const children = [new Paragraph({ text: forSubmission ? (project.title || '사업계획서') : `${project.title || '사업계획서'} (검토용)`, heading: HeadingLevel.TITLE })];
  sections.forEach((section, index) => {
    // 목표 쪽수를 맞추려고 정해진 자리에서만 쪽을 넘긴다. 글자 크기·여백은 건드리지 않는다.
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: pageBreaks.includes(index) }));
    section.content.split('\n').forEach(line => children.push(new Paragraph({ children: [new TextRun(line)] })));
    // 「검토 상태」는 내부 표시다. 제출본에는 넣지 않는다.
    if (!forSubmission) children.push(new Paragraph({ children: [new TextRun({ text: `검토 상태: ${section.status}`, italics: true })] }));
  });
  // 예산·일정 같은 필수 표는 본문 뒤에 실제 표로 넣는다. PDF와 같은 내용·같은 순서다.
  for (const table of tables) {
    if (!(table?.rows || []).length) continue;
    children.push(new Paragraph({ text: table.title || table.kind || '표', heading: HeadingLevel.HEADING_2 }));
    const header = new TableRow({ children: (table.columns || []).map(column => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(column), bold: true })] })] })) });
    const body = (table.rows || []).map(row => new TableRow({ children: (row || []).map(cell => new TableCell({ children: [new Paragraph(String(cell ?? ''))] })) }));
    children.push(new Table({ rows: [header, ...body], width: { size: 100, type: WidthType.PERCENTAGE } }));
    if (table.note) children.push(new Paragraph({ children: [new TextRun({ text: String(table.note), italics: true })] }));
  }
  return Packer.toBlob(new Document({ sections: [{ children }] }));
}

export async function exportPdf(project, sections, options = {}) {
  if (!sections.length || !sections.some(section => section.content?.trim())) throw new Error('PDF로 출력할 내용이 없습니다.');
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제해 주세요.');
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(buildPrintDocument(project, sections, options));
  printWindow.document.close();
  await printWindow.document.fonts?.ready;
  await new Promise(resolve => printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(resolve)));
  printWindow.focus();
  printWindow.print();
}

export function buildPrintDocument(project, sections, { tables = [] } = {}) {
  // 표는 본문 뒤에 DOCX와 같은 순서로 붙인다. 표 한 칸이 페이지를 넘어 잘리지 않게 한다.
  const tableBlocks = tables.filter(table => (table?.rows || []).length).map(table => `<section class="table-block"><h2>${escapeHtml(table.title || table.kind || '표')}</h2>
    <table><thead><tr>${(table.columns || []).map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
    <tbody>${(table.rows || []).map(row => `<tr>${(row || []).map(cell => `<td>${escapeHtml(cell ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${table.note ? `<p class="table-note">${escapeHtml(table.note)}</p>` : ''}</section>`).join('');
  const body = `<h1>${escapeHtml(project.title || '사업계획서')}</h1>${sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2>${section.content.split('\n').map(line => `<p>${escapeHtml(line) || '&nbsp;'}</p>`).join('')}</section>`).join('')}${tableBlocks}`;
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>${escapeHtml(project.title || '사업계획서')}</title><style>
    @page { size: A4 portrait; margin: 16mm 15mm 18mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #17202f; font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
    body { font-size: 10.5pt; line-height: 1.7; word-break: keep-all; overflow-wrap: break-word; }
    h1 { margin: 0 0 12mm; font-size: 21pt; line-height: 1.35; }
    section { margin: 0 0 8mm; break-inside: avoid-page; page-break-inside: avoid; }
    h2 { margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 1px solid #d9dee7; font-size: 14pt; break-after: avoid-page; page-break-after: avoid; }
    p { margin: 0 0 2.5mm; white-space: pre-wrap; orphans: 3; widows: 3; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 3mm; font-size: 9.5pt; table-layout: fixed; }
    th, td { border: 1px solid #b9c0cc; padding: 1.6mm 2mm; text-align: left; vertical-align: top; word-break: break-all; overflow-wrap: anywhere; }
    th { background: #eef1f6; font-weight: 600; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .table-block { break-inside: auto; page-break-inside: auto; }
    .table-note { font-size: 9pt; color: #55607a; }
    button, nav, aside, details, summary, .section-meta, .document-toolbar { display: none !important; }
  </style></head><body>${body}</body></html>`;
}

export function printDocument() { window.print(); }

function safeName(value = '사업계획서', max = 80) { return String(value).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, max); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
export function downloadBlob(blob, name) { download(blob, name); }
function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
