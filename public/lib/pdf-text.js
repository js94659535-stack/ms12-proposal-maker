// PDF 글자를 줄·칸으로 되돌리는 규칙 — 한 곳(11-18).
// 화면(/plan/)과 Node 도구(src/files.js)가 같이 쓴다. 두 벌이면 같은 공고를 도구와 화면에서 읽은 결과가 갈라진다.
// pdf.js는 부르는 쪽이 문서를 열어 넘긴다 — 화면은 CDN 고정 판, Node는 node_modules의 판(둘 다 6.2.108).

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

// 문서 전체: 쪽마다 「[N쪽]」을 머리에 두고 빈 줄로 잇는다.
export async function pdfDocumentText(pdf) {
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(`[${pageNo}쪽]\n${pageText(content.items)}`);
  }
  return pages.join('\n\n');
}
