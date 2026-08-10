import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPrintDocument, submissionFileName } from '../src/export.js';

const source = fs.readFileSync(new URL('../src/export.js', import.meta.url), 'utf8');
const SECTIONS = [
  { id: 'necessity', title: '1. 사업 필요성', content: '지역 학대피해아동 가정의 돌봄 공백이 확인된다.', status: '검토 필요' },
  { id: 'budget', title: '8. 예산', content: '총사업비 129,500,000원.', status: '확정' }
];
const TABLES = [
  { id: 't1', kind: '예산표', title: '예산 산출 내역', columns: ['항목', '산출근거', '금액(원)'], rows: [['인건비', '지역관리자 1명×12개월', '41,000,000']], note: '단위: 원' },
  { id: 't2', kind: '일정표', title: '추진 일정', columns: ['시기', '추진 내용'], rows: [['1월', '사업 착수']], note: '' },
  { id: 't3', kind: '대상표', title: '참여자 구성', columns: ['구분', '인원'], rows: [], note: '' }
];

test('제출본 인쇄 문서에 본문과 표가 같은 순서로 들어간다', () => {
  const html = buildPrintDocument({ title: '2027 가족기능강화사업' }, SECTIONS, { tables: TABLES });
  // 본문 항목이 먼저, 표가 뒤에 온다.
  assert.ok(html.indexOf('1. 사업 필요성') < html.indexOf('예산 산출 내역'));
  assert.equal((html.match(/<table>/g) || []).length, 2, '행이 없는 표는 만들지 않는다');
  assert.match(html, /<th>항목<\/th><th>산출근거<\/th><th>금액\(원\)<\/th>/);
  assert.match(html, /<td>지역관리자 1명×12개월<\/td>/);
  assert.match(html, /단위: 원/);
  // 표가 없으면 표 영역을 만들지 않는다(기존 출력과 같다).
  assert.doesNotMatch(buildPrintDocument({ title: 'x' }, SECTIONS), /<table>/);
});

test('인쇄 조판은 표가 페이지 밖으로 잘리지 않게 한다', () => {
  const html = buildPrintDocument({ title: 'x' }, SECTIONS, { tables: TABLES });
  assert.match(html, /@page \{ size: A4 portrait/);
  // 표 행은 페이지 경계에서 쪼개지지 않고, 머리행은 다음 쪽에도 반복된다.
  assert.match(html, /tr \{ break-inside: avoid; page-break-inside: avoid; \}/);
  assert.match(html, /thead \{ display: table-header-group; \}/);
  // 긴 셀 값이 표 밖으로 넘치지 않는다.
  assert.match(html, /table-layout: fixed/);
  assert.match(html, /word-break: break-all; overflow-wrap: anywhere/);
  // 한글 글꼴과 줄바꿈 규칙은 그대로 유지한다.
  assert.match(html, /Malgun Gothic/);
  assert.match(html, /word-break: keep-all/);
});

test('제출본에는 내부 검토 표시를 넣지 않고 검토용에는 남긴다', () => {
  // 인쇄 문서에는 원래 상태 표시가 없다.
  assert.doesNotMatch(buildPrintDocument({ title: 'x' }, SECTIONS, { tables: TABLES }), /검토 상태/);
  // DOCX는 제출본일 때만 상태 줄을 뺀다.
  assert.match(source, /if \(!forSubmission\) children\.push\(new Paragraph\(\{ children: \[new TextRun\(\{ text: `검토 상태: \$\{section\.status\}`/);
  assert.match(source, /forSubmission \? \(project\.title \|\| '사업계획서'\) : `\$\{project\.title \|\| '사업계획서'\} \(검토용\)`/);
  // DOCX에도 같은 표가 실제 표로 들어간다.
  assert.match(source, /children\.push\(new Table\(\{ rows: \[header, \.\.\.body\], width: \{ size: 100, type: WidthType\.PERCENTAGE \} \}\)\);/);
  assert.match(source, /if \(!\(table\?\.rows \|\| \[\]\)\.length\) continue;/);
});

test('제출본 파일 이름에 기관명·사업명·버전이 안전하게 들어간다', () => {
  const name = submissionFileName({ title: '2027년 가족기능강화사업' }, { applicantName: '한들가족지원센터', version: 2, kind: 'docx' });
  assert.equal(name, '한들가족지원센터_2027년 가족기능강화사업_V2_제출본.docx');
  // 파일 시스템에서 못 쓰는 문자는 지운다.
  const risky = submissionFileName({ title: 'A/B:C*D?E"F<G>H|I' }, { applicantName: '기관', version: 1, kind: 'pdf' });
  assert.ok(!/[\\/:*?"<>|]/.test(risky), risky);
  assert.match(risky, /\.pdf$/);
  // 기관명·버전이 없어도 이름을 만든다.
  assert.equal(submissionFileName({ title: '사업' }, {}), '사업_제출본.docx');
});
