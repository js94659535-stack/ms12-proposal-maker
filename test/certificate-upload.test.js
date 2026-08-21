// 사업자등록증을 올리는 자리와, 등록증이 쓰는 말을 읽는 규칙.
//
// 실제로 났던 일: 연혁으로 실적 96건은 채웠는데 기관명·유형·주소·대표자·고유번호가 비어 있었고,
// 등록증을 올리라고 말하는 자리가 화면 어디에도 없었다. 문서 추출 카드는 맨 아래에 있고
// 설명에는 「사업계획서·결과보고서·기관소개서」만 적혀 있었다.
//
// 그리고 읽는 쪽도 막혀 있었다. 「기관명·법인명」과 「대표자」는 읽는데 등록증이 쓰는
// 「상호」·「성명」이 규칙에 없었다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractApplicantCandidates } from '../src/applicant-extract.js';
import { pageText } from '../src/files.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// 홈택스 사업자등록증명원의 실제 모양이다. 콜론도 칸 구분도 없이 라벨 뒤에 값이 바로 온다.
const CERTIFICATE = [
  '사 업 자 등 록 증 명 ( 법인사업자 )',
  '상 호 ( 법 인 명 ) 주식회사 엑스텐비',
  '성 명 ( 대 표 자 ) 채주연',
  '사업자등록번호 257-87-02167',
  '사업장 소재지 전라남도 광양시 중마중앙로 7, 3층 303호',
  '개업연월일 2019-03-04'
].join('\n');

test('등록증이 쓰는 말을 읽는다', () => {
  const found = extractApplicantCandidates(CERTIFICATE, { documentName: 'QA 사업자등록증' }).candidates;
  const map = new Map(found.map(item => [item.label, item.value]));
  assert.equal(map.get('기관명'), '주식회사 엑스텐비');
  assert.equal(map.get('대표자'), '채주연');
  assert.equal(map.get('고유번호'), '257-87-02167');
  assert.equal(map.get('소재지'), '전라남도 광양시 중마중앙로 7, 3층 303호');
  assert.equal(map.get('설립 시기'), '2019-03-04');
});

test('칸 이름을 값으로 읽지 않는다', () => {
  // 증명서 표 머리글이다. 「성명(법인명)」 뒤에 오는 것은 값이 아니라 다음 칸 이름이다.
  const found = extractApplicantCandidates('성명(법인명) 주민(사업자)등록번호', { documentName: 'QA 머리글' }).candidates;
  assert.deepEqual(found, []);
});

test('칸이 나뉜 줄과 서술문은 예전 규칙이 읽는다', () => {
  // 표 칸으로 나뉜 줄은 칸끼리 짝지어야 한다. 라벨 뒤를 통째로 삼키면 옆 칸까지 값이 된다.
  const table = extractApplicantCandidates('고유번호   123-82-56789   법인명   사단법인 햇살복지재단', { documentName: 'QA 표' }).candidates;
  const map = new Map(table.map(item => [item.label, item.value]));
  assert.equal(map.get('고유번호'), '123-82-56789');
  assert.equal(map.get('기관명'), '사단법인 햇살복지재단');
  // 문장은 서술 규칙이 먼저 읽는다. 통째로 삼키지 않는다.
  const prose = extractApplicantCandidates('상근 직원 7명이며 문의는 담당자에게 하십시오', { documentName: 'QA 문장' }).candidates;
  assert.equal(prose.find(item => item.label === '상근 인력')?.value, '7명');
});

test('PDF 한 쪽을 줄과 칸으로 되돌린다', () => {
  // pdf.js가 주는 조각을 공백 하나로 이어 붙이면 한 쪽이 한 줄이 되어 라벨과 값이 붙는다.
  const items = [
    { str: '상 호', transform: [10, 0, 0, 10, 50, 700], width: 30, hasEOL: false },
    { str: '주식회사 엑스텐비', transform: [10, 0, 0, 10, 200, 700], width: 90, hasEOL: true },
    { str: '대표자', transform: [10, 0, 0, 10, 50, 680], width: 30, hasEOL: false },
    { str: '채주연', transform: [10, 0, 0, 10, 200, 680], width: 30, hasEOL: true }
  ];
  const text = pageText(items);
  assert.equal(text, '상 호\t주식회사 엑스텐비\n대표자\t채주연');
  // 붙어 있는 조각은 그대로 이어 붙인다.
  assert.equal(pageText([
    { str: '광양', transform: [10, 0, 0, 10, 50, 700], width: 20, hasEOL: false },
    { str: '시', transform: [10, 0, 0, 10, 70, 700], width: 10, hasEOL: true }
  ]), '광양시');
});

test('기본정보 카드에서 손으로 적기 전에 올리는 자리가 먼저 보인다', () => {
  const view = app.slice(app.indexOf('function applicantBasicView(applicant, who'), app.indexOf('function applicantCandidateView('));
  const drop = view.indexOf('id="applicant-cert-drop"');
  const firstField = view.indexOf('id="applicant-name"');
  assert.ok(drop > 0 && drop < firstField, '올리는 자리가 입력칸보다 앞에 있어야 합니다');
  assert.match(view, /사업자등록증·고유번호증을 올리면 자동으로 채워집니다/);
  assert.match(view, /기관명 · 기관 유형 · 주소 · 대표자 · 고유번호/);
  // 추출은 기존 경로를 그대로 쓴다. 새로 만들지 않는다.
  assert.match(app, /document\.querySelector\('#applicant-cert-file'\)\?\.addEventListener\('change', loadApplicantDocument\);/);
  assert.match(app, /bindDropzone\('#applicant-cert-drop', files => void loadApplicantDocumentFile\(files\[0\]\)\);/);
});

test('문서 추출 카드도 등록증을 말한다', () => {
  const view = app.slice(app.indexOf('function applicantDocumentView(applicant)'), app.indexOf('function candidateReviewView(review)'));
  assert.match(view, /연혁·사업계획서·등록증을 올리면 자동으로 채워집니다/);
  assert.match(view, /사업자등록증 · 고유번호증 · 결산서/);
  assert.match(view, /채워지는 것 — 기관명 · 대표자 · 주소 · 고유번호 · 연간 예산/);
});
