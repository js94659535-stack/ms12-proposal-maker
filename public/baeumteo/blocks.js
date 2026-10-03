// 계획서 글을 한글 문서의 쪽·표로 나눈다(10-18). `|`로 칸을 나눈 연속 줄은 진짜 표가 되고, 나머지는 문단이다.
// 서식 제목(<서식 N>)이 나올 때마다 새 구역을 연다.
export function planSections(text) {
  const lines = String(text).split('\n');
  const sections = [];
  let current = { title: '표지와 안내', blocks: [] };
  let table = null;
  const flush = () => { if (table) { current.blocks.push({ rows: table }); table = null; } };
  for (const line of lines) {
    if (/^<서식 \d>/.test(line)) { flush(); sections.push(current); current = { title: line.trim(), blocks: [] }; continue; }
    const cells = line.split(' | ');
    if (cells.length >= 3) { (table ||= []).push(cells.map(cell => cell.trim())); continue; }
    flush();
    if (line.trim()) current.blocks.push({ text: line });
  }
  flush();
  sections.push(current);
  return sections.filter(section => section.blocks.length);
}
