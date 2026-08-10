// 한글 PDF에 넣을 폰트를 만든다. WOFF(zlib 컨테이너)를 TTF로 되돌리기만 하고 글리프는 건드리지 않는다.
// 원본: Noto Sans KR (SIL Open Font License 1.1) 한국어 서브셋. 시스템 폰트를 복사하지 않는다.
// 사용: node scripts/build-korean-font.mjs <입력.woff> <출력.ttf>
import fs from 'node:fs';
import zlib from 'node:zlib';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('사용법: node scripts/build-korean-font.mjs <입력.woff> <출력.ttf>');
  process.exit(1);
}

const woff = fs.readFileSync(input);
if (woff.toString('latin1', 0, 4) !== 'wOFF') throw new Error('WOFF 파일이 아닙니다.');
const flavor = woff.readUInt32BE(4);
const numTables = woff.readUInt16BE(12);

// WOFF 표 목록 → 각 표를 풀어 sfnt(TTF) 배치로 다시 쓴다.
const tables = [];
for (let index = 0; index < numTables; index += 1) {
  const at = 44 + index * 20;
  const tag = woff.toString('latin1', at, at + 4);
  const offset = woff.readUInt32BE(at + 4);
  const compLength = woff.readUInt32BE(at + 8);
  const origLength = woff.readUInt32BE(at + 12);
  const checksum = woff.readUInt32BE(at + 16);
  const chunk = woff.subarray(offset, offset + compLength);
  const data = compLength < origLength ? zlib.inflateSync(chunk) : chunk;
  if (data.length !== origLength) throw new Error(`${tag} 표 길이가 다릅니다: ${data.length} != ${origLength}`);
  tables.push({ tag, data, checksum });
}
tables.sort((left, right) => (left.tag < right.tag ? -1 : 1));

const entrySelector = Math.floor(Math.log2(numTables));
const searchRange = 2 ** entrySelector * 16;
const header = Buffer.alloc(12);
header.writeUInt32BE(flavor, 0);
header.writeUInt16BE(numTables, 4);
header.writeUInt16BE(searchRange, 6);
header.writeUInt16BE(entrySelector, 8);
header.writeUInt16BE(numTables * 16 - searchRange, 10);

const directory = Buffer.alloc(numTables * 16);
const body = [];
let offset = 12 + numTables * 16;
tables.forEach((table, index) => {
  const at = index * 16;
  directory.write(table.tag, at, 4, 'latin1');
  directory.writeUInt32BE(table.checksum, at + 4);
  directory.writeUInt32BE(offset, at + 8);
  directory.writeUInt32BE(table.data.length, at + 12);
  const padding = (4 - (table.data.length % 4)) % 4;
  body.push(table.data, Buffer.alloc(padding));
  offset += table.data.length + padding;
});

fs.writeFileSync(output, Buffer.concat([header, directory, ...body]));
console.log(`${output} · ${fs.statSync(output).size.toLocaleString()} bytes · 표 ${numTables}개`);
