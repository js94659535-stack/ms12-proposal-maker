// HWPX(조사용 사본)의 표 구조를 한글(COM)이 세는 순서 그대로 낸다(10-36).
// 한글은 안쪽 표도 문서 순서(앞 순서 깊이 우선)로 센다 → 번호가 한글 쪽 get_into_nth_table(n)의 n 과 같다(실측으로 확인).
// 칸 순서는 한글의 TableRightCell 로 한 칸씩 가는 순서(읽는 순서)와 같다(실측).
// 사용: node tools/hwpx-tables.mjs <section0.xml>  → JSON { tables: [...], outside: [표 밖 문단 글자...] }
import fs from 'node:fs';

const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function readTables(xml) {
  const tables = [];
  const outside = [];
  const tableStack = []; // 열린 표
  const cellStack = [];  // 열린 칸 (표마다 하나)
  const re = /<hp:tbl [^>]*>|<\/hp:tbl>|<hp:tc[ >]|<\/hp:tc>|<hp:cellAddr [^>]*\/>|<hp:cellSpan [^>]*\/>|<hp:t>([^<]*)<\/hp:t>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const tag = m[0];
    if (tag.startsWith('<hp:tbl ')) {
      const t = { index: tables.length, depth: tableStack.length, rows: Number(/rowCnt="(\d+)"/.exec(tag)?.[1]), cols: Number(/colCnt="(\d+)"/.exec(tag)?.[1]), parent: tableStack.length ? tableStack.at(-1).index : null, cells: [] };
      tables.push(t);
      tableStack.push(t);
    } else if (tag === '</hp:tbl>') {
      tableStack.pop();
    } else if (tag.startsWith('<hp:tc')) {
      const cell = { k: tableStack.at(-1).cells.length, row: null, col: null, colSpan: 1, rowSpan: 1, text: '' };
      tableStack.at(-1).cells.push(cell);
      cellStack.push(cell);
    } else if (tag === '</hp:tc>') {
      cellStack.pop();
    } else if (tag.startsWith('<hp:cellAddr')) {
      const cell = cellStack.at(-1);
      cell.col = Number(/colAddr="(\d+)"/.exec(tag)[1]);
      cell.row = Number(/rowAddr="(\d+)"/.exec(tag)[1]);
    } else if (tag.startsWith('<hp:cellSpan')) {
      const cell = cellStack.at(-1);
      cell.colSpan = Number(/colSpan="(\d+)"/.exec(tag)[1]);
      cell.rowSpan = Number(/rowSpan="(\d+)"/.exec(tag)[1]);
    } else if (tag.startsWith('<hp:t>')) {
      const text = unesc(m[1]);
      if (cellStack.length) cellStack.at(-1).text += text;
      else outside.push(text);
    }
  }
  for (const t of tables) for (const c of t.cells) c.text = c.text.replace(/\s+/g, ' ').trim();
  return { tables, outside };
}

if (process.argv[1] && process.argv[1].endsWith('hwpx-tables.mjs')) {
  console.log(JSON.stringify(readTables(fs.readFileSync(process.argv[2], 'utf8'))));
}
