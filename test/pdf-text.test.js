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

// 11-23: y는 합치는 데만 쓴다. 조각은 18쪽 2-3 칸과 6쪽 각주 줄을 그대로 옮겼다.
const at = (str, x, y, width, unit, hasEOL = true) => ({ str, width, hasEOL, transform: [unit, 0, 0, unit, x, y] });

test('다른 줄인데 y가 같으면 한 줄로 합치고 사이에 탭 — 왼쪽 칸 줄을 다 준 뒤 오른쪽 칸 줄이 와도(11-23)', () => {
  const items = [at('2-3. 차량운영', 61.77, 331.2, 60.17, 10.15), at('(5점)', 61.77, 316.93, 20.72, 10.15),
    at('□ 차량 운영(5점)', 142.96, 331.2, 78.17, 10.15), at('□ 차량 미운영(2점)', 142.96, 316.93, 87.76, 10.15)];
  assert.equal(pageText(items), '2-3. 차량운영\t□ 차량 운영(5점)\n(5점)\t□ 차량 미운영(2점)');
});

test('줄 끝으로 나눈 줄은 쪼개지 않는다 — 위첨자 「*」가 5.76pt 위에 있어도 한 줄(6쪽)', () => {
  const items = [at('○ (시설비) 개소당 최대 15,200만원 지원(국비 50%, 지방비 50%)', 70, 471.68, 380, 13, false), at('*', 452, 477.44, 4, 8.3)];
  assert.equal(pageText(items).split('\n').length, 1);
});

test('y가 조금이라도 다르면 합치지 않는다 — 문턱 0pt', () => {
  const items = [at('왼쪽', 60, 300, 20, 10), at('오른쪽', 140, 300.01, 30, 10)];
  assert.equal(pageText(items), '왼쪽\n오른쪽');
});
