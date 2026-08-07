function documentText(project, sections) {
  return [project.title || '사업계획서', '', ...sections.flatMap(s => [s.title, s.content, `검토 상태: ${s.status}`, ''])].join('\n');
}

export async function exportDocx(project, sections) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
  const children = [new Paragraph({ text: `${project.title || '사업계획서'} (검토용)`, heading: HeadingLevel.TITLE })];
  sections.forEach(section => {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
    section.content.split('\n').forEach(line => children.push(new Paragraph({ children: [new TextRun(line)] })));
    children.push(new Paragraph({ children: [new TextRun({ text: `검토 상태: ${section.status}`, italics: true })] }));
  });
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  download(blob, `${safeName(project.title)}_검토용.docx`);
}

export async function exportPdf(project, sections) {
  if (!sections.length || !sections.some(section => section.content?.trim())) throw new Error('PDF로 출력할 내용이 없습니다.');
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제해 주세요.');
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(buildPrintDocument(project, sections));
  printWindow.document.close();
  await printWindow.document.fonts?.ready;
  await new Promise(resolve => printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(resolve)));
  printWindow.focus();
  printWindow.print();
}

export function buildPrintDocument(project, sections) {
  const body = `<h1>${escapeHtml(project.title || '사업계획서')}</h1>${sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2>${section.content.split('\n').map(line => `<p>${escapeHtml(line) || '&nbsp;'}</p>`).join('')}</section>`).join('')}`;
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>${escapeHtml(project.title || '사업계획서')}</title><style>
    @page { size: A4 portrait; margin: 16mm 15mm 18mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #17202f; font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
    body { font-size: 10.5pt; line-height: 1.7; word-break: keep-all; overflow-wrap: break-word; }
    h1 { margin: 0 0 12mm; font-size: 21pt; line-height: 1.35; }
    section { margin: 0 0 8mm; break-inside: avoid-page; page-break-inside: avoid; }
    h2 { margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 1px solid #d9dee7; font-size: 14pt; break-after: avoid-page; page-break-after: avoid; }
    p { margin: 0 0 2.5mm; white-space: pre-wrap; orphans: 3; widows: 3; }
    button, nav, aside, details, summary, .section-meta, .document-toolbar { display: none !important; }
  </style></head><body>${body}</body></html>`;
}

export function printDocument() { window.print(); }

function safeName(value = '사업계획서') { return value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
