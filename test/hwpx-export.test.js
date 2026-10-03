// 한글 파일(HWPX) 내보내기. 만든 파일을 다시 열어 구조와 본문을 확인한다.
//
// 여기서 확인하는 것: ZIP 구조, mimetype 위치, XML 적격성, 본문·표가 실제로 들어갔는지.
// 여기서 확인하지 못하는 것: 한글 프로그램이 실제로 여는지. 그건 사람이 열어 봐야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { buildHwpxFiles, buildSectionXml, escapeXml } from '../src/hwpx-export.js';
import { zipBytes } from '../src/submission-zip.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const decoder = new TextDecoder();

const SAMPLE = {
  project: { title: '2027년 아동·청소년 가족기능 강화사업', issuer: '사랑의열매', deadline: '2026-09-30' },
  sections: [
    { title: '1. 사업의 필요성', content: '방과후 돌봄이 끊긴 아동이 늘고 있습니다.\n대상 규모는 [확인 필요]입니다.' },
    { title: '2. 사업 목표', content: '주 2회 학습·정서 프로그램을 운영합니다.' }
  ],
  tables: [{ title: '연간 예산', rows: [['항목', '금액'], ['인건비', '12,000,000']] }]
};

// 저장(store) 방식으로만 담은 ZIP을 되읽는다. 압축을 쓰면 여기서도 풀어 준다.
function unzip(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const files = new Map();
  const order = [];
  for (let offset = 0; offset + 4 <= buffer.length;) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(buffer.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressed);
    files.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
    order.push(name);
    offset = dataStart + compressed;
  }
  return { files, order };
}

// 아주 단순한 적격성 확인. 여는 태그와 닫는 태그가 짝이 맞는지 본다.
function xmlBalanced(text) {
  const stack = [];
  for (const match of text.matchAll(/<\/?([A-Za-z][\w:.-]*)\b[^>]*?(\/?)>/g)) {
    if (match[0].startsWith('<?')) continue;
    if (match[2] === '/') continue;
    if (match[0].startsWith('</')) {
      if (stack.pop() !== match[1]) return false;
    } else stack.push(match[1]);
  }
  return stack.length === 0;
}

test('만든 한글 파일을 다시 열면 규격대로 담겨 있다', () => {
  const packed = Buffer.from(zipBytes(buildHwpxFiles(SAMPLE), '2026-08-13T00:00:00.000Z'));
  const { files, order } = unzip(packed);
  // mimetype이 맨 앞에 있어야 파일 종류를 알아본다.
  assert.equal(order[0], 'mimetype');
  assert.equal(decoder.decode(files.get('mimetype')), 'application/hwp+zip');
  for (const name of ['version.xml', 'META-INF/container.xml', 'META-INF/manifest.xml',
    'Contents/content.hpf', 'Contents/header.xml', 'Contents/section0.xml', 'settings.xml']) {
    assert.ok(files.has(name), name);
  }
  // 담긴 XML은 모두 짝이 맞아야 한다. 하나만 어긋나도 한글이 열지 못한다.
  for (const [name, data] of files) {
    if (!name.endsWith('.xml') && !name.endsWith('.hpf')) continue;
    const text = data.toString('utf8');
    assert.match(text, /^<\?xml version="1\.0" encoding="UTF-8"/, name);
    assert.ok(xmlBalanced(text), `${name} 태그가 어긋난다`);
  }
  // 목록(manifest)이 실제 담긴 파일을 가리킨다.
  const manifest = files.get('META-INF/manifest.xml').toString('utf8');
  for (const name of ['Contents/content.hpf', 'Contents/header.xml', 'Contents/section0.xml', 'settings.xml']) {
    assert.ok(manifest.includes(name), `목록에 ${name}이 없다`);
  }
});

test('본문·제목·표가 그대로 들어간다', () => {
  const xml = buildSectionXml(SAMPLE);
  assert.ok(xml.includes('2027년 아동·청소년 가족기능 강화사업'));
  assert.ok(xml.includes('1. 사업의 필요성'));
  assert.ok(xml.includes('방과후 돌봄이 끊긴 아동이 늘고 있습니다.'));
  // 확인되지 않은 값 표시를 지우지 않는다.
  assert.ok(xml.includes('[확인 필요]'));
  // 표는 칸을 나눈 글줄로 들어간다.
  assert.ok(xml.includes('[표] 연간 예산'));
  assert.ok(xml.includes('인건비'));
  assert.ok(xml.includes('12,000,000'));
  // 줄바꿈은 문단으로 나뉜다.
  const paragraphs = xml.match(/<hp:p /g) || [];
  assert.ok(paragraphs.length >= 8, `문단 ${paragraphs.length}개`);
});

test('본문에 든 특수문자가 파일을 깨뜨리지 않는다', () => {
  assert.equal(escapeXml('<표> & "인용" \'값\''), '&lt;표&gt; &amp; &quot;인용&quot; &apos;값&apos;');
  const xml = buildSectionXml({
    project: { title: 'A & B <시험>' },
    sections: [{ title: '1 <항목>', content: '값이 100 > 50 이고 "확인" 필요' }]
  });
  assert.ok(xmlBalanced(xml), '특수문자 때문에 태그가 어긋났다');
  assert.ok(!xml.includes('<시험>'));
  assert.ok(xml.includes('&lt;시험&gt;'));
});

test('화면에 한글 파일 받기 단추가 있고 표 안내를 함께 적는다', () => {
  // 「받기」 패널에서 형식으로 고른다.
  assert.match(app, /format\('review-hwpx', '한글\(HWPX\)', '한글 2014 이상에서 열립니다\.'\)/);
  assert.match(app, /if \(id === 'review-hwpx'\) return downloadProposalHwpx\(\);/);
  // 부분 결과는 내보내지 않는다. 완성된 뒤에만 실제로 만든다.
  assert.match(app, /#final-hwpx-top'\)\?\.addEventListener\('click', \(\) => \{ if \(!refusePartial\(\)\) downloadProposalHwpx\(\); \}\);/);
  // 계획서가 없으면 만들지 않는다.
  assert.match(app, /if \(!state\.sections\.length\) return setState\(\{ error: '먼저 계획서를 만들어 주세요\.' \}\);/);
  // 표 서식이 그대로 필요하면 DOCX를 쓰라고 그 자리에서 알려 준다.
  assert.match(app, /표 서식이 그대로 필요하면 DOCX를 쓰세요/);
});

// ---------- 진짜 표 (10-18) ----------
import { realTable } from '../src/hwpx-export.js';
import { planSections } from '../public/baeumteo/blocks.js';

test('realTable은 행·열 수와 테두리 정의가 맞는 hp:tbl을 만들고 글자를 이스케이프한다', () => {
  const xml = realTable([['구분', '금액'], ['A & B', '<1,000>'], ['C', '2,000']]);
  assert.match(xml, /<hp:tbl [^>]*rowCnt="3" colCnt="2"/);
  assert.equal((xml.match(/<hp:tr>/g) || []).length, 3);
  assert.equal((xml.match(/<hp:tc /g) || []).length, 6);
  assert.ok(xml.includes('A &amp; B') && xml.includes('&lt;1,000&gt;'));
  const widths = [...xml.matchAll(/<hp:cellSz width="(\d+)"/g)].map(m => Number(m[1]));
  assert.equal(widths[0] + widths[1], 42000, '열 너비 합이 표 너비');
  assert.match(xml, /borderFillIDRef="2"/);
  assert.equal(realTable([]), '');
});

test('header.xml은 표가 쓰는 borderFill 2번과 줄 간격 100% 문단(2번)을 정의한다', () => {
  const header = new TextDecoder().decode(buildHwpxFiles({ project: { title: 't' }, sections: [] }).find(file => file.name === 'Contents/header.xml').bytes);
  assert.match(header, /<hh:borderFill id="2"/);
  assert.match(header, /<hh:paraPr id="2"[\s\S]*?value="100"/);
  assert.match(header, /<hh:paraProperties itemCnt="3">/);
});

test('section.blocks는 문단과 표를 순서대로 낸다', () => {
  const xml = buildSectionXml({ project: { title: 't' }, sections: [{ title: '제목', blocks: [{ text: '앞 문단' }, { rows: [['가', '나'], ['1', '2']] }, { text: '뒤 문단' }] }] });
  assert.ok(xml.indexOf('앞 문단') < xml.indexOf('<hp:tbl') && xml.indexOf('<hp:tbl') < xml.indexOf('뒤 문단'));
});

test('planSections는 | 로 나뉜 연속 줄을 표로, 서식 제목마다 구역을 나눈다', () => {
  const sections = planSections(['표지', '<서식 3> 계획서', '문단', '가 | 나 | 다', '1 | 2 | 3', '끝 문단', '<서식 5> 예산서', '구분 | 항목 | 금액', 'a | b | c'].join('\n'));
  assert.deepEqual(sections.map(s => s.title), ['표지와 안내', '<서식 3> 계획서', '<서식 5> 예산서']);
  assert.deepEqual(sections[1].blocks.map(b => (b.rows ? `표${b.rows.length}` : '문단')), ['문단', '표2', '문단']);
  assert.equal(sections[2].blocks[0].rows[0].length, 3);
});
