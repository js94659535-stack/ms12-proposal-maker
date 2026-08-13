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
function paragraph(text, { style = 0, char = 0 } = {}) {
  const value = String(text ?? '').trim();
  return `<hp:p id="0" paraPrIDRef="${style}" styleIDRef="${style}" pageBreak="0" columnBreak="0" merged="0">`
    + `<hp:run charPrIDRef="${char}">${value ? `<hp:t>${escapeXml(value)}</hp:t>` : '<hp:t/>'}</hp:run>`
    + '</hp:p>';
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
    + '<hh:charProperties itemCnt="2">'
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
    + '</hh:charProperties>'
    + '<hh:paraProperties itemCnt="2">'
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
