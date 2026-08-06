export async function extractFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: 파일은 20MB 이하여야 합니다.`);
  if (extension === 'txt') return { name: file.name, type: 'TXT', text: await file.text(), pages: 1 };
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
  throw new Error(`${file.name}: PDF, DOCX, TXT만 지원합니다.`);
}

export async function extractFiles(files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i += 1) {
    onProgress?.(`${files[i].name} 읽는 중 (${i + 1}/${files.length})`);
    results.push(await extractFile(files[i]));
  }
  return results;
}
