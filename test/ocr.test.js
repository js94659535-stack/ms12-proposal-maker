// 사진·스캔본에서 글자를 읽는다(22-51).
//
// 실측(2026-08-22, 실제 사업자등록증):
//   · 모델이 이미지를 받는다 — 스캔본에서 등록번호·법인명·대표자·개업연월일·소재지를 그대로 읽었다.
//   · 글자 0자인 스캔 PDF도 쪽을 그려 보내면 같은 값이 나온다.
//   · 1600px·JPEG80이면 본문 382KB로 요청 상한(750KB) 안에 들어온다.
//
// 관공서 서식은 제목의 자간을 벌려 찍어서(「법 인 명」) 그대로 두면 라벨로 찾지 못한다.
// 붙여 놓으면 글자가 있는 PDF와 같은 네 칸이 후보로 올라온다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OCR_MAX_IMAGES, OCR_TOO_MANY, OCR_WIDTH, checkImages, isImageType, tightenSpacedLabels } from '../server/ocr.js';
import { extractApplicantCandidates } from '../src/applicant-extract.js';

const TAB = String.fromCharCode(9);

test('형식은 확장자가 아니라 MIME으로 가린다', () => {
  // 붙여넣은 그림은 이름이 image.png이거나 아예 없다. 확장자로는 가릴 수 없다.
  assert.ok(isImageType('image/png'));
  assert.ok(isImageType('image/jpeg; charset=binary'));
  assert.ok(!isImageType('application/pdf'));
  assert.ok(!isImageType(''));
});

test('사진은 한 번에 세 장까지다', () => {
  assert.equal(OCR_MAX_IMAGES, 3);
  const one = 'data:image/jpeg;base64,AAAA';
  assert.equal(checkImages([one]).ok, true);
  assert.equal(checkImages([one, one, one]).ok, true);
  const many = checkImages([one, one, one, one]);
  assert.equal(many.ok, false);
  assert.equal(many.error, OCR_TOO_MANY);
  assert.match(OCR_TOO_MANY, /PDF로 묶어 올려 주세요/);
});

test('이미지가 아니거나 너무 크면 부르기 전에 막는다', () => {
  assert.equal(checkImages([]).ok, false);
  assert.equal(checkImages(['data:application/pdf;base64,AAAA']).ok, false);
  assert.equal(checkImages([`data:image/png;base64,${'A'.repeat(1_000_000)}`]).ok, false);
});

test('폭은 1600px으로 고정한다', () => {
  // 실측에서 원본과 같은 값을 다 읽었고 본문도 상한 안에 들어왔다.
  assert.equal(OCR_WIDTH, 1600);
});

test('자간을 벌려 찍은 제목을 붙이면 네 칸이 후보가 된다', () => {
  const raw = [
    '등록번호 : 504-88-01964',
    '법 인 명 ( 단 체 명 ) : (주)마인드스토리',
    '대 표 자 : 박종석',
    `개업연월일: 2021 년 08 월 26 일${TAB}법인등록번호: 200111-0629027`,
    '사업장 소재지: 광주광역시 광산구 임방울대로 356, 404호(수완동)',
    '2023 년 10 월 10 일',
    '광산세무서장'
  ].join('\n');
  const tight = tightenSpacedLabels(raw);
  assert.match(tight, /법인명\(단체명\)/);
  assert.match(tight, /2021년 08월 26일/);
  // 한 줄에 라벨이 둘이면 줄을 나눈다. 붙어 있으면 뒤엣것을 통째로 버린다.
  assert.match(tight, /^법인등록번호: 200111-0629027$/m);
  const found = extractApplicantCandidates(tight, { documentName: '사업자등록증' });
  const labels = found.candidates.map(item => item.label);
  for (const want of ['기관명', '대표자', '설립 시기', '소재지']) assert.ok(labels.includes(want), `${want}가 후보에 없다`);
});

test('붙이는 것은 내용을 바꾸지 않는다', () => {
  // 값 쪽의 띄어쓰기는 건드리지 않는다. 주소는 그대로 남아야 한다.
  const tight = tightenSpacedLabels('사업장 소재지: 광주광역시 광산구 임방울대로 356, 404호(수완동)');
  assert.match(tight, /광주광역시 광산구 임방울대로 356, 404호\(수완동\)/);
});
