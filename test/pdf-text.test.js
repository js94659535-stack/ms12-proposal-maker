// PDF 줄·칸 맞춤(public/lib/pdf-text.js) — 11-21.
// 조각은 농촌 2027 지침 18쪽(붙임 5) 표 머리글을 pdf.js가 준 그대로 옮겼다. 공백 조각의 폭(1,272 · 1,192)은 실제 빈자리의 8.34배다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pageText } from '../public/lib/pdf-text.js';

const piece = (str, x, width, unit, hasEOL = false) => ({ str, width, hasEOL, transform: [unit, 0, 0, unit, x, 662.52] });
const header = [
  piece('', 72.56, 0, 11.03, true),
  piece('평가 항목', 72.56, 49.41, 11.03),
  piece(' ', 121.97, 1272, 11.03),
  piece('세부 항목 및 평가 기준', 274.53, 120.89, 11.03),
  piece(' ', 395.43, 1192, 11.03),
  piece('점수', 538.39, 22.07, 11.03)
];

test('공백 조각의 폭은 쓰지 않는다 — 앞뒤 글자 조각으로 재서 칸 사이에 탭이 나온다(11-21)', () => {
  assert.equal(pageText(header), '평가 항목 \t세부 항목 및 평가 기준 \t점수');
});

test('공백 조각의 글자는 지우지 않는다 — 탭을 빼면 예전과 같은 글자', () => {
  assert.equal(pageText(header).replace(/\t/g, ''), '평가 항목 세부 항목 및 평가 기준 점수');
});

test('공백 조각이 사이에 있고 문턱을 못 넘으면 공백을 하나 더 넣지 않는다', () => {
  // 18쪽 「▪ 평가일시」: 앞 글자 끝 74.48 → 다음 글자 79.52, 벌어짐 5.04pt(unit 9.95의 0.51배 — 공백 문턱은 넘고 탭 문턱은 못 넘음).
  const items = [piece('▪', 64.53, 9.95, 9.95), piece(' ', 74.48, 42, 9.95), piece('평가일시', 79.52, 38.34, 9.95)];
  assert.equal(pageText(items), '▪ 평가일시');
});

test('공백 조각이 없으면 전과 같다 — 벌어짐이 글자 하나쯤이면 탭, 조금이면 공백', () => {
  assert.equal(pageText([piece('가', 0, 10, 10), piece('나', 20, 10, 10)]), '가\t나');
  assert.equal(pageText([piece('가', 0, 10, 10), piece('나', 12, 10, 10)]), '가 나');
  assert.equal(pageText([piece('가', 0, 10, 10), piece('나', 10, 10, 10)]), '가나');
});
