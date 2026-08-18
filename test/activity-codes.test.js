// 오류 코드 분류. 세 갈래로 나누고, 원문은 여전히 나가지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ORIGINS, errorCode, withOrigin } from '../src/activity.js';
import { normalizeActivity } from '../server/activity.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('아직 하지 않은 일은 실패로 세지 않는다', () => {
  assert.equal(errorCode('요청 사업명을 적어 주세요.'), 'guide:input');
  assert.equal(errorCode('수정할 항목을 하나 이상 선택해 주세요.'), 'guide:choose');
  assert.equal(errorCode('공고문을 30자 이상 붙여넣어 주세요.'), 'guide:too-short');
  assert.equal(errorCode('먼저 계획서를 만들어 주세요.'), 'guide:order');
  assert.equal(errorCode('주소는 http 또는 https로 시작해야 합니다.'), 'guide:format');
});

test('앞 단계가 없는 것과 진짜 실패를 가른다', () => {
  // 순서 문제
  assert.equal(errorCode('검증할 계획서가 없습니다.'), 'blocked:no-proposal');
  assert.equal(errorCode('선택한 신청기관을 찾지 못했습니다.'), 'blocked:not-found');
  assert.equal(errorCode('확정된 값이 없습니다.'), 'blocked:missing');
  // 진짜 실패
  assert.equal(errorCode('신청기관 정보를 삭제하지 못했습니다.'), 'fail:delete');
  assert.equal(errorCode('PDF를 만들지 못했습니다.'), 'fail:export');
  assert.equal(errorCode('요청을 처리하지 못했습니다.'), 'fail:apply');
  // 「없습니다」로 끝나는 말이 실패를 삼키지 않는지 확인한다.
  assert.match(errorCode('보관함에 저장하지 못했습니다.'), /^fail:/);
});

test('바깥 원인은 그대로 구분된다', () => {
  assert.equal(errorCode('서버 요청 실패 (502)'), 'server:502');
  assert.equal(errorCode('네트워크에 연결할 수 없습니다.'), 'net:offline');
  assert.match(errorCode('OpenAI 요청 시간이 초과되었습니다.'), /^ai:timeout$/);
  assert.equal(errorCode(''), 'unknown');
});

test('자리는 미리 정한 목록에서만 붙는다', () => {
  assert.equal(withOrigin('fail:export', 'export-review'), 'fail:export:export-review');
  // 목록에 없는 값은 버린다. 사용자 입력이 넘어와도 새어 나가지 않는다.
  assert.equal(withOrigin('fail:export', '홍길동'), 'fail:export');
  assert.equal(withOrigin('fail:export', 'user@example.com'), 'fail:export');
  assert.equal(withOrigin('fail:export', ''), 'fail:export');
  // 붙였을 때 40자를 넘기면 자리를 버리고 코드만 남긴다. 서버 형식을 깨뜨리지 않기 위해서다.
  const longCode = 'blocked:no-proposal-and-then-some-more';
  assert.equal(longCode.length <= 40, true, '시험용 코드부터 40자 안이어야 한다');
  assert.equal(withOrigin(longCode, 'export-review'), longCode);
  // 붙일 여유가 있으면 붙는다.
  assert.equal(withOrigin('fail:save', 'archive-save'), 'fail:save:archive-save');
});

test('붙인 코드는 서버의 형식 검사를 그대로 지난다', () => {
  // 서버는 소문자·숫자와 : _ - 만 40자까지 받는다. 이 벽은 낮추지 않았다.
  for (const origin of ORIGINS) {
    const code = withOrigin('fail:apply', origin);
    const kept = normalizeActivity({ kind: 'error', step: 3, code }).code;
    assert.equal(kept, code, `${code} 가 서버에서 unknown으로 떨어진다`);
  }
  // 한글이 섞이면 서버가 막는다. 마지막 벽이 살아 있는지 본다.
  assert.equal(normalizeActivity({ kind: 'error', step: 1, code: '계획서가 없습니다' }).code, 'unknown');
});

test('화면 문구 대부분이 분류된다', () => {
  const found = new Set();
  for (const m of app.matchAll(/error:\s*'([^']{4,200})'/g)) found.add(m[1]);
  for (const m of app.matchAll(/error:\s*`([^`]{4,200})`/g)) found.add(m[1].replace(/\$\{[^}]*\}/g, '○'));
  const texts = [...found];
  assert.ok(texts.length > 100, `문구를 못 모았다: ${texts.length}`);
  const unknown = texts.filter(text => errorCode(text) === 'unknown');
  const ratio = unknown.length / texts.length;
  // 고치기 전에는 87%가 unknown이었다. 30% 아래로 유지한다.
  assert.ok(ratio < 0.30, `unknown 비율이 너무 높다: ${Math.round(ratio * 100)}%`);
});

test('자리는 선택 항목이라 안 넘겨도 지금처럼 동작한다', () => {
  assert.match(app, /reportError\(state\.step, patch\.error, patch\.errorFrom \|\| ''\)/);
  // 중요한 자리에는 붙여 두었다.
  assert.ok((app.match(/errorFrom: '/g) || []).length >= 3);
  for (const origin of (app.match(/errorFrom: '([a-z-]+)'/g) || []).map(m => m.slice(12, -1))) {
    assert.ok(ORIGINS.has(origin), `목록에 없는 자리 이름: ${origin}`);
  }
});
