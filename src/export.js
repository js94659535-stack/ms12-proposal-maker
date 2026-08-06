function documentText(project, sections) {
  return [project.title || '사업계획서', '', ...sections.flatMap(s => [s.title, s.content, `검토 상태: ${s.status}`, ''])].join('\n');
}

export async function exportDocx(project, sections) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
  const children = [new Paragraph({ text: project.title || '사업계획서', heading: HeadingLevel.TITLE })];
  sections.forEach(section => {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
    section.content.split('\n').forEach(line => children.push(new Paragraph({ children: [new TextRun(line)] })));
    children.push(new Paragraph({ children: [new TextRun({ text: `검토 상태: ${section.status}`, italics: true })] }));
  });
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  download(blob, `${safeName(project.title)}.docx`);
}

export async function exportPdf(project, sections) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const printable = document.createElement('article');
  printable.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;padding:48px;background:white;color:#17202f;font-family:Pretendard,Noto Sans KR,sans-serif;line-height:1.75;';
  printable.innerHTML = `<h1>${escapeHtml(project.title || '사업계획서')}</h1>${sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2>${section.content.split('\n').map(line => `<p>${escapeHtml(line) || '&nbsp;'}</p>`).join('')}<small>검토 상태: ${escapeHtml(section.status)}</small></section>`).join('')}`;
  document.body.appendChild(printable);
  try {
    await pdf.html(printable, { x: 15, y: 15, width: 180, windowWidth: 760, autoPaging: 'text', html2canvas: { scale: 0.8, useCORS: false } });
    pdf.save(`${safeName(project.title)}.pdf`);
  } finally {
    printable.remove();
  }
}

export function printDocument() { window.print(); }

function safeName(value = '사업계획서') { return value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
