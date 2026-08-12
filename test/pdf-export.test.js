import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { jsPDF } from 'jspdf';
import { PAGE, PDF_FONT, normalizeForPdf, renderProposalPdf } from '../src/pdf-export.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../src/pdf-export.js', import.meta.url), 'utf8');
const FONT = fs.readFileSync(new URL('../src/assets/noto-sans-kr-korean.ttf', import.meta.url)).toString('base64');
const SECTIONS = [
  { id: 'necessity', title: '1. 사업 필요성', content: '한들구 학대피해아동 가정의 돌봄 공백이 확인된다.\n가정 단위 개입이 필요하다.' },
  { id: 'budget', title: '8. 예산', content: '총사업비 129,500,000원이며 핵심 참여자는 72명이다.' }
];
const TABLES = [
  { kind: '예산표', title: '예산 산출 내역', columns: ['항목', '산출근거', '금액(원)'], rows: [['인건비', '지역관리자 1명×12개월', '41,000,000'], ['관리운영비', '출장·교육훈련', '5,000,000']], note: '단위: 원' },
  { kind: '대상표', title: '참여자 구성', columns: ['구분', '인원'], rows: [], note: '' }
];

function makeDoc() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('NotoSansKR.ttf', FONT);
  doc.addFont('NotoSansKR.ttf', PDF_FONT, 'normal');
  return doc;
}
async function readPdf(doc) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  // pdf.js는 넘긴 버퍼를 가져가 버린다. 검사용 사본을 따로 둔다.
  const copy = Uint8Array.from(bytes);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    pages.push((await (await pdf.getPage(index)).getTextContent()).items.map(item => item.str).join(''));
  }
  return { bytes: copy, pages, text: pages.join('') };
}

test('실제 PDF 파일이 만들어지고 한글이 텍스트로 남는다', async () => {
  const doc = renderProposalPdf(makeDoc(), { project: { title: '2027년 가족기능강화사업' }, sections: SECTIONS, tables: TABLES });
  const { bytes, pages, text } = await readPdf(doc);
  // 진짜 PDF 형식이다(HTML을 PDF처럼 주지 않는다).
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString('latin1'), '%PDF-');
  assert.ok(bytes.length > 20_000, `${bytes.length} bytes`);
  assert.ok(pages.length >= 1);
  // 한글이 깨지지 않고 검색·복사되는 텍스트로 추출된다.
  assert.match(text, /사업 필요성/);
  assert.match(text, /학대피해아동 가정의 돌봄 공백/);
  assert.match(text, /129,500,000/);
  assert.match(text, /72명/);
  // 제목·항목·표가 모두 들어간다.
  for (const section of SECTIONS) assert.ok(text.includes(section.title), section.title);
  assert.ok(text.includes('예산 산출 내역'));
  assert.ok(text.includes('지역관리자 1명×12개월'));
  // 행이 없는 표는 만들지 않는다.
  assert.ok(!text.includes('참여자 구성'));
  // 빈 쪽을 만들지 않는다.
  assert.ok(pages.every(page => page.trim().length > 0), '빈 페이지가 있다');
});

test('긴 본문과 긴 표는 다음 쪽으로 이어지고 머리행을 다시 그린다', async () => {
  const longSections = Array.from({ length: 6 }, (_, index) => ({
    id: `s${index}`, title: `${index + 1}. 긴 항목`,
    content: '한글 문장이 길게 이어지는 경우 줄바꿈과 쪽 나눔이 정상인지 확인한다. '.repeat(20)
  }));
  const longTable = {
    kind: '예산표', title: '긴 표', columns: ['구분', '내용', '금액'],
    rows: Array.from({ length: 60 }, (_, index) => [`${index + 1}행`, `내용 ${index + 1}`, `${(index + 1) * 1000}`]), note: ''
  };
  const doc = renderProposalPdf(makeDoc(), { project: { title: '긴 문서' }, sections: longSections, tables: [longTable] });
  const { pages, text } = await readPdf(doc);
  assert.ok(pages.length >= 3, `${pages.length}쪽`);
  // 표의 첫 행과 마지막 행이 모두 남는다(잘리지 않는다).
  assert.ok(text.includes('1행') && text.includes('60행'));
  // 쪽이 넘어가면 머리행을 다시 그린다.
  const headerPages = pages.filter(page => page.includes('구분') && page.includes('금액')).length;
  assert.ok(headerPages >= 2, `머리행이 있는 쪽 ${headerPages}개`);
  assert.ok(pages.every(page => page.trim().length > 0), '빈 페이지가 있다');
});

// 글꼴에 없는 글자는 그려도 빈칸만 남는다(폭은 0이 아니라 검사로 잡히지 않는다).
// 실제 글꼴이 그릴 수 있는 문자 목록을 cmap에서 직접 읽어 대조한다.
function fontCoverage() {
  const buf = fs.readFileSync(new URL('../src/assets/noto-sans-kr-korean.ttf', import.meta.url));
  let cmap = 0;
  for (let index = 0; index < buf.readUInt16BE(4); index += 1) {
    const at = 12 + index * 16;
    if (buf.toString('latin1', at, at + 4) === 'cmap') cmap = buf.readUInt32BE(at + 8);
  }
  let sub = 0;
  for (let index = 0; index < buf.readUInt16BE(cmap + 2); index += 1) {
    const at = cmap + 4 + index * 8;
    const platform = buf.readUInt16BE(at);
    const encoding = buf.readUInt16BE(at + 2);
    if (platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))) sub = cmap + buf.readUInt32BE(at + 4);
  }
  assert.equal(buf.readUInt16BE(sub), 4, 'cmap format 4를 기대한다');
  const segments = buf.readUInt16BE(sub + 6) / 2;
  const endAt = sub + 14;
  const startAt = endAt + segments * 2 + 2;
  const deltaAt = startAt + segments * 2;
  const rangeAt = deltaAt + segments * 2;
  const covered = new Set();
  for (let seg = 0; seg < segments; seg += 1) {
    const end = buf.readUInt16BE(endAt + seg * 2);
    const start = buf.readUInt16BE(startAt + seg * 2);
    const delta = buf.readInt16BE(deltaAt + seg * 2);
    const rangeOffset = buf.readUInt16BE(rangeAt + seg * 2);
    if (start === 0xFFFF) continue;
    for (let code = start; code <= end; code += 1) {
      let glyph = 0;
      if (rangeOffset === 0) glyph = (code + delta) & 0xFFFF;
      else {
        const at = rangeAt + seg * 2 + rangeOffset + (code - start) * 2;
        const found = at + 1 < buf.length ? buf.readUInt16BE(at) : 0;
        glyph = found ? (found + delta) & 0xFFFF : 0;
      }
      if (glyph) covered.add(code);
    }
  }
  return covered;
}

test('글꼴이 못 그리는 기호는 뜻이 같은 글자로 바꿔 그린다', () => {
  // 실제 공고·계획서에 나오는 전각 기호와 원문자
  assert.equal(normalizeForPdf('핵심 참여자－피해아동'), '핵심 참여자-피해아동');
  assert.equal(normalizeForPdf('2027.3.1.～2027.12.31.'), '2027.3.1.~2027.12.31.');
  assert.equal(normalizeForPdf('제출서류 ①②③⑩'), '제출서류 (1)(2)(3)(10)');
  assert.equal(normalizeForPdf('공고 Ⅰ. 사업개요 Ⅲ.'), '공고 I. 사업개요 III.');
  assert.equal(normalizeForPdf('「사업개요」 12％ ＋ 3％ ＝ 15％'), '‘사업개요’ 12% + 3% = 15%');
  assert.equal(normalizeForPdf('초기면접 → 사후점검'), '초기면접 -> 사후점검');
  // 원래 그릴 수 있던 글자는 건드리지 않는다.
  assert.equal(normalizeForPdf('완료자 수÷등록 수×100, 가·나'), '완료자 수÷등록 수×100, 가·나');
  assert.equal(normalizeForPdf('총사업비 129,500,000원 (98% 이상)'), '총사업비 129,500,000원 (98% 이상)');

  const covered = fontCoverage();
  const 기호 = '－～×÷·→←↔⇒（）：，％＋＝／￦∼〜①⑩Ⅰⅲ「」『』【】〔〕｜　！？＃＠ＡＺａｚ０９';
  const 본문 = SECTIONS.map(section => `${section.title}${section.content}`).join('')
    + TABLES.map(table => `${table.title}${table.columns.join('')}${table.rows.flat().join('')}${table.note}`).join('');
  const 남은글자 = [...new Set(normalizeForPdf(기호 + 본문))]
    .filter(char => char.charCodeAt(0) > 31 && !covered.has(char.codePointAt(0)));
  assert.deepEqual(남은글자, [], `글꼴에 없는 글자가 남았다: ${남은글자.join(' ')}`);
});

test('A4 여백과 글꼴 이름은 인쇄본과 같은 값을 쓴다', () => {
  assert.deepEqual(PAGE, { width: 210, height: 297, top: 16, right: 15, bottom: 18, left: 15 });
  assert.equal(PDF_FONT, 'NotoSansKR');
  // 재배포 가능한 글꼴만 쓰고 시스템 글꼴을 복사하지 않는다.
  assert.match(source, /Noto Sans KR\(SIL OFL 1\.1\)/);
  assert.doesNotMatch(source, /malgun|Windows\\\\Fonts|맑은 고딕/i);
  // 글꼴은 눌렀을 때만 가져오고, 못 가져오면 PDF를 만들지 않는다.
  assert.match(source, /import\('\.\/assets\/noto-sans-kr-korean\.ttf\?url'\)/);
  assert.match(source, /PDF용 한글 글꼴을 불러오지 못했습니다\. PDF를 만들지 않았습니다/);
  // 만들어진 결과가 PDF가 아니면 내려받지 않는다.
  assert.match(source, /if \(!blob \|\| blob\.size < 1000\) throw new Error\('PDF를 만들지 못했습니다/);
});

test('PDF도 선택한 저장 버전만 쓰고 인쇄창을 거치지 않는다', () => {
  // 저장된 버전의 본문·표를 그대로 넘긴다.
  assert.match(app, /exportProposalPdf\(\{\s*\n?\s*project: state\.project, sections: version\.sections, tables: version\.tables \|\| \[\]/);
  assert.match(app, /fileName: submissionFileName\(state\.project, \{ applicantName, version: version\.version, kind: 'pdf' \}\)/);
  // 저장 안 된 화면 내용·잘못된 식별자는 앞에서 막는다.
  assert.match(app, /const \{ version, reason \} = selectedSavedVersion\(\);\s*\n\s*if \(!version\) return setState\(\{ error: reason \}\);/);
  assert.match(app, /if \(unsavedChanges\(\)\) return setState/);
  // 기존 인쇄 기능은 그대로 남긴다.
  assert.match(app, /id="print"/);
  assert.match(app, /document\.querySelector\('#pdf'\)\?\.addEventListener\('click', \(\) => exportPdf\(state\.project, state\.sections\)/);
  assert.match(app, /id="package-pdf"[\s\S]{0,240}최종 PDF 내려받기/);
});
