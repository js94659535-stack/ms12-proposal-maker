// 초안(마크다운)이 한글에서 A4 몇 쪽이 되는지 어림한다(10-07).
//
// 셈의 바탕은 한글 2020에서 잰 값이다(tools/page-measure.ps1, reports/10-07-pages/measure-*.json):
//   15pt 휴먼명조, 줄 간격 160%, A4 세로, 한글 공장 기본 여백(왼30·오른30·위20·아래15·머리말15·꼬리말15mm)
//   → 한 줄에 한글 28자, 한 쪽에 27줄 = 한 쪽 한글 756자(빈틈없이 채웠을 때).
//   계산으로도 맞는다: 본문 폭 150mm ÷ 15pt 한 글자 5.29mm = 28.3자, 본문 높이 232mm ÷ 줄 높이(15pt×1.6) 8.47mm = 27.4줄.
// 공고(RFP)는 글머리별 서체·크기만 정하고 여백·줄 간격은 정하지 않았다. 그래서 여백·줄 간격은 한글 기본값으로 둔다(LAYOUT를 바꾸면 셈이 바뀐다).
//
// 쪽 수는 「글자 수 ÷ 756」이 아니라 줄 수로 센다. 문단마다 줄 끝이 남고, 소제목·빈 줄·표가 줄을 먹기 때문이다.
//   문단 한 개 = ceil(글자 폭 합 ÷ 한 줄 폭)줄. 한글·한자·전각 기호는 폭 1, 숫자·영문·띄어쓰기는 잰 값의 비율.
//   소제목(#)은 16pt라 한 줄에 덜 들어가고 줄 높이도 16/15.
//   표는 칸 폭을 똑같이 나눈 것으로 보고, 한 줄의 높이 = 가장 긴 칸의 줄 수 + 칸 여백(0.3줄). 표는 한글에서 재지 않은 어림이다.

export const LAYOUT = {
  basis: '한글 2020 실측: 15pt 휴먼명조, 줄 간격 160%, A4 세로, 한글 기본 여백(30/30/20/15/15/15mm)',
  perLine: 28, // 한 줄에 들어가는 한글 글자 수(실측)
  linesPerPage: 27, // 한 쪽 줄 수(실측)
  digitWidth: 28 / 56, // 숫자·영문 한 글자 폭(한글 = 1). 실측: 숫자 56자/줄
  spaceWidth: 0.5, // 띄어쓰기 폭. 실측 「가가가 」 문장이 한 줄 31칸은 들어가고 33칸은 안 들어감 → 0.375~0.57 사이, 반각 0.5
  headingPt: 16,
  bodyPt: 15,
  tableCellPad: 1, // 칸 하나의 좌우 여백(한글 1자 폭)
  tableRowPad: 0.3 // 표 한 줄의 위아래 여백(줄 단위)
};

const NARROW = /[\x20-\x7e]/;
export function widthOf(text, layout = LAYOUT) {
  let width = 0;
  for (const ch of String(text)) {
    if (ch === ' ') width += layout.spaceWidth;
    else if (NARROW.test(ch)) width += layout.digitWidth;
    else width += 1;
  }
  return width;
}

const linesFor = (width, capacity) => Math.max(1, Math.ceil(width / capacity - 1e-9));

// 마크다운 → 한글 문서에 들어갈 문단(꾸밈 표시는 지운다). 표는 칸으로 나눠 둔다.
export function toBlocks(markdown) {
  const blocks = [];
  let table = null;
  for (const raw of String(markdown).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\*\*/g, '').replace(/`/g, '');
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      if (cells.every(cell => /^:?-{2,}:?$/.test(cell))) continue; // 머리 구분 줄
      if (!table) blocks.push(table = { type: 'table', rows: [] });
      table.rows.push(cells);
      continue;
    }
    table = null;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
    else if (!line.trim()) blocks.push({ type: 'blank' });
    else blocks.push({ type: 'para', text: line.replace(/\s+$/, '') });
  }
  // 앞뒤와 겹친 빈 줄은 하나로
  return blocks.filter((block, index) => !(block.type === 'blank' && (index === 0 || blocks[index - 1].type === 'blank')));
}

export function linesOf(block, layout = LAYOUT) {
  if (block.type === 'blank') return 1;
  if (block.type === 'para') return linesFor(widthOf(block.text, layout), layout.perLine);
  if (block.type === 'heading') {
    const ratio = layout.headingPt / layout.bodyPt;
    return linesFor(widthOf(block.text, layout), layout.perLine / ratio) * ratio;
  }
  const columns = Math.max(...block.rows.map(row => row.length));
  const capacity = Math.max(1, layout.perLine / columns - layout.tableCellPad);
  return block.rows.reduce((acc, row) => acc + Math.max(...row.map(cell => linesFor(widthOf(cell, layout), capacity))) + layout.tableRowPad, 0);
}

// 절(### 소제목)마다 줄 수·쪽 수. 첫 ### 앞(장 제목 등)은 「앞머리」로 따로 센다.
export function estimatePages(markdown, layout = LAYOUT) {
  const parts = [{ heading: null, lines: 0, chars: 0 }];
  for (const block of toBlocks(markdown)) {
    if (block.type === 'heading' && block.level === 3) parts.push({ heading: block.text, lines: 0, chars: 0 });
    const part = parts.at(-1);
    part.lines += linesOf(block, layout);
    part.chars += [...(block.text ?? (block.rows || []).flat().join(''))].filter(ch => ch.trim()).length;
  }
  const pagesOf = lines => Math.round((lines / layout.linesPerPage) * 100) / 100;
  const lines = parts.reduce((acc, part) => acc + part.lines, 0);
  return {
    layout: layout.basis,
    lines: Math.round(lines * 10) / 10,
    pages: pagesOf(lines),
    chars: parts.reduce((acc, part) => acc + part.chars, 0),
    parts: parts.filter(part => part.heading || part.lines).map(part => ({ ...part, lines: Math.round(part.lines * 10) / 10, pages: pagesOf(part.lines) }))
  };
}

// 한글 실측(tools/page-measure.ps1 -Text)에 넣을 글: 한 줄 = 한 문단. 표는 칸을 「 · 」로 이어 한 문단으로 둔다(표 높이는 실측하지 않음).
export function toMeasureText(markdown) {
  return toBlocks(markdown).map(block => block.type === 'blank' ? '' : block.type === 'table' ? block.rows.map(row => row.join(' · ')).join('\n') : block.text).join('\n');
}
