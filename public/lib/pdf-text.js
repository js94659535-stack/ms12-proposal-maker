// PDF 글자를 줄·칸으로 되돌리는 규칙 — 한 곳(11-18).
// 화면(/plan/)과 Node 도구(src/files.js)가 같이 쓴다. 두 벌이면 같은 공고를 도구와 화면에서 읽은 결과가 갈라진다.
// pdf.js는 부르는 쪽이 문서를 열어 넘긴다 — 화면은 빌드가 /lib/vendor/로 복사한 판, Node는 node_modules의 legacy 판(둘 다 6.2.108).

// PDF 한 쪽의 글자 조각을 줄과 칸으로 되돌린다.
//
// 조각을 공백 하나로 이어 붙이면 한 쪽이 한 줄이 되고, 서식의 라벨과 값이 한 덩어리로 붙는다.
// 실제 사업자등록증명원에서 「상 호 ( 법 인 명 ) 주식회사 ○○」가 다른 칸의 글자들과 이어져
// 기관명·대표자·소재지를 한 건도 읽지 못했다. HWP 표에서 행을 되살린 것과 같은 결이다.
//
// 줄은 pdf.js가 알려 주는 줄 끝(hasEOL)으로 나누고, 칸은 조각 사이가 글자 하나쯤 벌어졌는지로 본다.
// 위치는 pdf.js가 주는 값을 그대로 쓴다 — 짐작하지 않는다.
//
// 공백(" ") 조각의 폭은 쓰지 않는다(11-21). 농촌 2027 지침에서 그 폭이 실제 빈자리의 8.34배(43쪽 915개)라
// 앞 조각 끝이 다음 글자보다 오른쪽에 잡혀 벌어짐이 음수가 되고 탭이 하나도 안 나왔다(11-20). 배수로 나누지 않는다 —
// 그건 그 글꼴의 사정이다. 벌어짐은 앞뒤 글자 조각의 x와 폭으로만 잰다. 공백 조각의 글자는 그대로 둔다.
// 공백 조각이 사이에 있으면 그 공백이 이미 띄어 쓰므로 탭(문턱을 넘을 때)만 더한다 — 공백을 하나 더 넣지 않는다.
//
// 표의 한 행(11-23): pdf.js는 칸마다 줄 끝을 붙여, 왼쪽 칸 줄을 다 준 뒤 오른쪽 칸 줄을 준다(농촌 2027 지침 18쪽).
// y는 줄을 나누는 데 쓰지 않고 합치는 데만 쓴다 — 줄 끝으로 나눈 줄은 그대로 두고, 서로 다른 줄인데 y가 같으면
// 한 줄로 합치며 사이에 탭을 넣는다(왼쪽 칸부터). 합친 줄은 그 행이 처음 나온 자리에 둔다.
//   문턱 0pt — y가 정확히 같을 때만. 18쪽 같은 행의 칸끼리 20쌍 모두 0pt였고, ±1pt로 넓히면 43쪽 1,288→1,244로
//   합치면 안 될 것까지 합쳐진다(11-22).
//   한 줄에 y가 여럿이면(43쪽 93줄) 그 줄의 y는 글자 수가 가장 많은 높이 — 위첨자 「*」(9줄)·제목 번호 「Ⅰ」(6줄)처럼
//   글자 적은 조각만 다른 높이에 있다. 첫 조각으로 잡으면 「Ⅰ」 한 글자가 대표가 되고 43쪽 1,200줄로 더 합친다(글자 수로는 1,202).
const blank = item => item.str.trim() === '';
function rowY(pieces) {
  if (!pieces.length) return null;
  const chars = new Map();
  for (const piece of pieces) chars.set(piece.transform?.[5] ?? 0, (chars.get(piece.transform?.[5] ?? 0) || 0) + piece.str.trim().length);
  let best = null;
  for (const [y, count] of chars) if (best === null || count > best[1]) best = [y, count]; // 같으면 먼저 나온 높이
  return best[0];
}
export function pageText(items = []) {
  const lines = [];
  let line = '';
  let pieces = [];
  let previousEnd = null;
  let spaced = false;
  const end = () => { lines.push({ text: line, pieces }); line = ''; pieces = []; previousEnd = null; spaced = false; };
  for (const item of items) {
    if (!item.str) {
      if (item.hasEOL) end();
      continue;
    }
    if (blank(item)) {
      line += item.str;
      spaced = true;
      if (item.hasEOL) end();
      continue;
    }
    const left = item.transform?.[4] ?? 0;
    const unit = Math.abs(item.transform?.[0] ?? 10) || 10;
    if (previousEnd !== null) {
      const gap = left - previousEnd;
      line += gap > unit * 0.9 ? '\t' : !spaced && gap > unit * 0.15 ? ' ' : '';
    }
    line += item.str;
    pieces.push(item);
    previousEnd = left + (item.width ?? 0);
    spaced = false;
    if (item.hasEOL) end();
  }
  if (line) end();
  // 같은 y의 줄을 한 행으로. y가 없는 줄(빈 줄·공백뿐인 줄)은 제자리에 그대로.
  const rows = [];
  const byY = new Map();
  for (const entry of lines) {
    const y = rowY(entry.pieces);
    if (y === null) { rows.push([entry]); continue; }
    if (byY.has(y)) byY.get(y).push(entry);
    else { const row = [entry]; byY.set(y, row); rows.push(row); }
  }
  const leftOf = entry => entry.pieces[0]?.transform?.[4] ?? 0;
  // 칸 끝의 공백은 지운다 — 합치기 전에도 줄 끝 공백은 지워졌다(아래 replace).
  const rowText = row => row.length === 1 ? row[0].text : [...row].sort((a, b) => leftOf(a) - leftOf(b)).map(entry => entry.text.replace(/[ \t]+$/, '')).join('\t');
  return rows.map(rowText).join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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
