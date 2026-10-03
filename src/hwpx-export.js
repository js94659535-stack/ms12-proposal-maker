// 한글 파일로 내보내기(HWPX).
//
// 왜 HWPX인가.
//  - .hwp(5.0)는 CFB 컨테이너 안에 압축된 이진 레코드 스트림이다. 브라우저에서 만들어도
//    한글이 열지 못할 위험이 커서 쓰지 않는다. 읽기는 이미 src/hwp-text.js가 한다.
//  - .hwpx는 OWPML(KS X 6101) ZIP + XML이다. 한글 2014 이상에서 열고 그대로 편집한다.
//
// 이 파일이 만드는 것은 「본문이 담긴 문서」다. 공고 기관이 준 서식 파일 자체를 채우는 것이 아니다.
// 서식 규격(항목·글자수·표)은 form-spec이 읽어 작성 단계에서 지키고, 여기서는 결과를 옮겨 담는다.
import { zipBytes } from './submission-zip.js';

const MIME = 'application/hwp+zip';
const encoder = new TextEncoder();
const bytes = value => encoder.encode(value);

// XML에 그대로 넣을 수 없는 글자를 바꾼다. 본문에 <, &가 들어오면 파일이 깨진다.
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // 제어문자는 XML 1.0이 허용하지 않는다. 줄바꿈·탭만 남기고 나머지는 지운다.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

// 문단 하나. charPrIDRef 0은 본문, 1은 제목이다.
function paragraph(text, { style = 0, char = 0, para } = {}) {
  const value = String(text ?? '').trim();
  return `<hp:p id="0" paraPrIDRef="${para ?? style}" styleIDRef="${style}" pageBreak="0" columnBreak="0" merged="0">`
    + `<hp:run charPrIDRef="${char}">${value ? `<hp:t>${escapeXml(value)}</hp:t>` : '<hp:t/>'}</hp:run>`
    + '</hp:p>';
}


// 진짜 표. 열 너비는 글 길이에 비례해 나누고, 머리 줄은 굵게 한다(header:false면 첫 줄도 보통 칸).
// treatAsChar="0"(자리 차지 표)로 둔다: 글자처럼 취급하는 표는 남은 쪽에 안 들어가면 통째로 다음 쪽으로 밀려 앞 쪽이 크게 비었다(10-19 한글 실측). borderFill 2번(실선)을 header.xml에 정의해 둔다.
const TABLE_WIDTH = 42000;
let tableCounter = 0;
function cellXml(text, { col, row, width, head }) {
  const value = String(text ?? '').trim();
  const run = `<hp:run charPrIDRef="${head ? 2 : 0}">${value ? `<hp:t>${escapeXml(value)}</hp:t>` : '<hp:t/>'}</hp:run>`;
  return '<hp:tc name="" header="' + (head ? 1 : 0) + '" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2">'
    + '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
    + `<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${run}</hp:p>`
    + '</hp:subList>'
    + `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/>`
    + `<hp:cellSz width="${width}" height="2000"/><hp:cellMargin left="283" right="283" top="141" bottom="141"/>`
    + '</hp:tc>';
}
export function realTable(rows, { header = true } = {}) {
  const grid = (rows || []).map(row => (Array.isArray(row) ? row : [row]));
  if (!grid.length) return '';
  const cols = Math.max(...grid.map(row => row.length));
  // 열 너비: 먼저 각 열의 가장 긴 낱말이 한 줄에 들어갈 만큼(최소 너비)을 주고, 남는 너비를 글 길이에 비례해 나눈다.
  // 글자 폭은 한글 2, 그 밖 1로 잰다. 최소 너비가 없으면 「운영 기간」 같은 짧은 열 머리가 글자 단위로 세로로 접힌다(10-19 한글 실측).
  const display = text => [...String(text ?? '')].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  const longestWord = text => Math.max(0, ...String(text ?? '').split(/[\s/·()]+/).map(display));
  const need = Array.from({ length: cols }, (_, c) => Math.min(16, Math.max(2, ...grid.map(row => longestWord(row[c])))));
  const minW = need.map(n => n * 560 + 900);
  const weight = Array.from({ length: cols }, (_, c) => Math.min(44, Math.max(6, ...grid.map(row => display(row[c])))));
  const extra = Math.max(0, TABLE_WIDTH - minW.reduce((a, b) => a + b, 0));
  const totalWeight = weight.reduce((a, b) => a + b, 0);
  let widths = minW.map((w, c) => Math.floor(w + extra * weight[c] / totalWeight));
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum > TABLE_WIDTH) widths = widths.map(w => Math.floor(w * TABLE_WIDTH / sum));
  widths[cols - 1] += TABLE_WIDTH - widths.reduce((a, b) => a + b, 0);
  const trs = grid.map((row, r) => '<hp:tr>' + Array.from({ length: cols }, (_, c) => cellXml(row[c], { col: c, row: r, width: widths[c], head: header && r === 0 })).join('') + '</hp:tr>').join('');
  tableCounter += 1;
  const tbl = `<hp:tbl id="${tableCounter}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="${header ? 1 : 0}" rowCnt="${grid.length}" colCnt="${cols}" cellSpacing="0" borderFillIDRef="2" noAdjust="0">`
    + `<hp:sz width="${TABLE_WIDTH}" widthRelTo="ABSOLUTE" height="2000" heightRelTo="ABSOLUTE" protect="0"/>`
    + '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
    + '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="283" right="283" top="141" bottom="141"/>'
    + trs + '</hp:tbl>';
  return `<hp:p id="0" paraPrIDRef="2" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${tbl}</hp:run></hp:p>`;
}

// 표는 칸을 전각 공백으로 맞춰 문단으로 적는다.
// 한글이 열지 못하는 표 구조를 만들어 파일 전체를 못 열게 하는 것보다, 내용이 남는 쪽을 고른다.
// 표 서식 그대로가 필요하면 DOCX·PDF를 쓴다. 화면에도 그렇게 적어 둔다.
function tableParagraphs(table) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!rows.length) return '';
  const head = table.title ? paragraph(`[표] ${table.title}`, { style: 1, char: 1 }) : '';
  const lines = rows.map(row => (Array.isArray(row) ? row : [row]).map(cell => String(cell ?? '').trim()).join('　|　'));
  return head + lines.map(line => paragraph(line)).join('');
}

export function buildSectionXml({ project = {}, sections = [], tables = [] } = {}) {
  const title = project.title || '사업계획서';
  const head = [
    paragraph(title, { style: 1, char: 1 }),
    project.issuer ? paragraph(`공모기관: ${project.issuer}`) : '',
    project.deadline ? paragraph(`접수 마감: ${project.deadline}`) : '',
    paragraph('')
  ].join('');

  const body = sections.map(section => {
    const heading = paragraph(section.title || '', { style: 1, char: 1 });
    if (Array.isArray(section.blocks)) {
      const blocks = section.blocks.map((block, at) => (block.rows ? realTable(block.rows, { header: block.header !== false }) + paragraph('') : paragraph(block.text, section.blocks[at + 1]?.rows ? { para: 3 } : {}))).join('');
      return heading + (blocks || paragraph('')) + paragraph('');
    }
    const lines = String(section.content || '').split(/\n+/).filter(line => line.trim());
    return heading + (lines.length ? lines.map(line => paragraph(line)).join('') : paragraph('')) + paragraph('');
  }).join('');

  const tableBlocks = (tables || []).map(tableParagraphs).join('');

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">'
    + head + body + tableBlocks
    + '</hs:sec>';
}

// 글꼴·문단모양·글자모양을 최소로 둔다. 본문(0)과 제목(1) 두 벌이면 된다.
function headerXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4" secCnt="1">'
    + '<hh:refList>'
    + '<hh:fontfaces itemCnt="1"><hh:fontface lang="HANGUL" fontCnt="1">'
    + '<hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="0" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="0" xHeight="0"/></hh:font>'
    + '</hh:fontface></hh:fontfaces>'
    + '<hh:borderFills itemCnt="2">'
    + '<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
    + '<hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>'
    + '<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
    + '<hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>'
    + '</hh:borderFills>'
    + '<hh:charProperties itemCnt="3">'
    + '<hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">'
    + '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
    + '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
    + '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
    + '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
    + '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
    + '</hh:charPr>'
    + '<hh:charPr id="1" height="1400" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:bold/>'
    + '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
    + '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
    + '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
    + '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
    + '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
    + '</hh:charPr>'
    + '<hh:charPr id="2" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:bold/>'
    + '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
    + '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
    + '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
    + '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
    + '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
    + '</hh:charPr>'
    + '</hh:charProperties>'
    + '<hh:paraProperties itemCnt="4">'
    + '<hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">'
    + '<hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>'
    + '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
    + '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>'
    + '<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>'
    + '</hh:paraPr>'
    + '<hh:paraPr id="1" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">'
    + '<hh:align horizontal="LEFT" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>'
    + '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="1" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
    + '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="400" unit="HWPUNIT"/><hc:next value="200" unit="HWPUNIT"/></hh:margin>'
    + '<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>'
    + '</hh:paraPr>'
    + '<hh:paraPr id="2" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="0" suppressLineNumbers="0" checked="0">'
    + '<hh:align horizontal="LEFT" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>'
    + '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
    + '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>'
    + '<hh:lineSpacing type="PERCENT" value="100" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>'
    + '</hh:paraPr>'
    + '<hh:paraPr id="3" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">'
    + '<hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>'
    + '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="1" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
    + '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>'
    + '<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>'
    + '</hh:paraPr>'
    + '</hh:paraProperties>'
    + '<hh:styles itemCnt="2">'
    + '<hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>'
    + '<hh:style id="1" type="PARA" name="개요 1" engName="Outline 1" paraPrIDRef="1" charPrIDRef="1" nextStyleIDRef="0" langID="1042" lockForm="0"/>'
    + '</hh:styles>'
    + '</hh:refList>'
    + '</hh:head>';
}

function contentHpf(title) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id="">'
    + `<opf:metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(title)}</dc:title>`
    + '<dc:language>ko</dc:language></opf:metadata>'
    + '<opf:manifest>'
    + '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>'
    + '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>'
    + '</opf:manifest>'
    + '<opf:spine><opf:itemref idref="section0" linear="yes"/></opf:spine>'
    + '</opf:package>';
}

const CONTAINER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">'
  + '<ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles>'
  + '</ocf:container>';

const MANIFEST = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + '<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" odf:version="1.2">'
  + '<odf:file-entry odf:full-path="/" odf:media-type="application/hwp+zip"/>'
  + '<odf:file-entry odf:full-path="Contents/content.hpf" odf:media-type="application/xml"/>'
  + '<odf:file-entry odf:full-path="Contents/header.xml" odf:media-type="application/xml"/>'
  + '<odf:file-entry odf:full-path="Contents/section0.xml" odf:media-type="application/xml"/>'
  + '<odf:file-entry odf:full-path="settings.xml" odf:media-type="application/xml"/>'
  + '</odf:manifest>';

const SETTINGS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>';

const VERSION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  + '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="0" micro="5" buildNumber="0" os="1" xmlVersion="1.4" application="MS12 사업계획서 작성 도우미" appVersion="1.0"/>';

// 미리보기 글. 한글이 파일 목록에서 첫 줄을 보여 준다.
function previewText({ project = {}, sections = [] } = {}) {
  const lines = [project.title || '사업계획서', ...sections.slice(0, 3).map(section => String(section.content || '').slice(0, 200))];
  return lines.join('\n').slice(0, 1000);
}

// 파일 순서가 중요하다. mimetype이 맨 앞에 있어야 한글이 종류를 알아본다.
export function buildHwpxFiles(payload = {}, generatedAt = '') {
  const title = payload.project?.title || '사업계획서';
  return [
    { name: 'mimetype', bytes: bytes(MIME) },
    { name: 'version.xml', bytes: bytes(VERSION) },
    { name: 'META-INF/container.xml', bytes: bytes(CONTAINER) },
    { name: 'META-INF/manifest.xml', bytes: bytes(MANIFEST) },
    { name: 'Contents/content.hpf', bytes: bytes(contentHpf(title)) },
    { name: 'Contents/header.xml', bytes: bytes(headerXml()) },
    { name: 'Contents/section0.xml', bytes: bytes(buildSectionXml(payload)) },
    { name: 'Preview/PrvText.txt', bytes: bytes(previewText(payload)) },
    { name: 'settings.xml', bytes: bytes(SETTINGS) }
  ];
}

export function buildHwpxBlob(payload = {}, generatedAt = new Date().toISOString()) {
  const zipped = zipBytes(buildHwpxFiles(payload, generatedAt), generatedAt);
  return new Blob([zipped], { type: MIME });
}
