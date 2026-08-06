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
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const printable = document.createElement('article');
  printable.style.cssText = 'position:absolute;left:0;top:0;z-index:-1;width:760px;padding:48px;background:white;color:#17202f;font-family:Pretendard,Noto Sans KR,sans-serif;line-height:1.75;';
  printable.innerHTML = buildPdfHtml(project, sections);
  document.body.appendChild(printable);
  try {
    await document.fonts?.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (!printable.innerText.trim() || printable.scrollHeight < 100) throw new Error('PDF로 출력할 내용이 없습니다.');
    await pdf.html(printable, { x: 15, y: 15, width: 180, windowWidth: 760, autoPaging: 'text', html2canvas: { scale: 0.8, useCORS: false } });
    const bytes = pdf.output('arraybuffer');
    validatePdfOutput(bytes, pdf.getNumberOfPages(), printable.innerText.trim().length);
    download(new Blob([bytes], { type: 'application/pdf' }), `${safeName(project.title)}.pdf`);
  } finally {
    printable.remove();
  }
}

export function buildPdfHtml(project, sections) {
  return `<h1>${escapeHtml(project.title || '사업계획서')}</h1>${sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2>${section.content.split('\n').map(line => `<p>${escapeHtml(line) || '&nbsp;'}</p>`).join('')}<small>검토 상태: ${escapeHtml(section.status)}</small></section>`).join('')}`;
}

export function validatePdfOutput(bytes, pageCount, textLength) {
  if (pageCount < 1 || textLength < 20 || bytes.byteLength < 10_000) {
    throw new Error('PDF 내용이 비어 있거나 정상적으로 렌더링되지 않았습니다.');
  }
}

export function printDocument() { window.print(); }

function safeName(value = '사업계획서') { return value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
