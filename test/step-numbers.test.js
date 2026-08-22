// 단계 번호는 한 곳에서만 매긴다(22-46).
//
// 실제로 났던 일: 홈 카드는 「공고 준비」와 「공고 분석」을 한 장에 묶어 놓고 01·02…를 붙였고,
// 상단 띠는 STEPS 여섯을 그대로 1~6으로 매겼다. 그래서 같은 「신청기관 준비」가 홈에서는 02,
// 상단 띠에서는 3이 됐다.
//
// 묶는 방식이 서로 다르므로 번호를 맞추려면 둘 중 하나를 다시 짜야 한다. 그래서 홈에서 번호를 뺐다.
// 순서는 카드가 놓인 자리로 보인다. 번호를 매기는 곳은 상단 띠 하나뿐이다.
//
// 「단계」라는 말도 대단원에만 쓴다. 중단원까지 「1단계 기본정보」라고 부르니 「2단계 화면? 뭐지?」가 됐다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/app.js', 'utf8');

test('홈 카드에는 번호가 없다', () => {
  assert.ok(!app.includes('${escapeHtml(step.no)}'), '이용 흐름 카드에 번호가 남아 있다');
  assert.ok(!app.includes('${step.no}'), '업무 흐름 카드에 번호가 남아 있다');
  assert.ok(!app.includes('step.no'), '번호로 판정하는 자리가 남아 있다');
  assert.ok(!app.includes('업무 흐름 6단계'), '홈이 단계 수를 말하고 있다');
});

test('번호를 매기는 곳은 상단 띠 하나다', () => {
  // STEPS 차례 그대로 1부터 매긴다. 여기만 숫자를 쓴다.
  assert.match(app, /const label = onStep \? `현재 단계: \$\{state\.step \+ 1\}\. \$\{STEPS\[state\.step\]\}`/);
  assert.match(app, /<span>\$\{complete \? '✓' : index \+ 1\}<\/span>/);
});

test('중단원에서는 「단계」라고 하지 않는다', () => {
  for (const stale of ['1단계 기본정보', '2단계 상세정보', '2단계 · ${escapeHtml(result.title']) {
    assert.ok(!app.includes(stale), `${stale}가 남아 있다`);
  }
  assert.match(app, /<b>기본정보 · \$\{escapeHtml\(applicant\.name\)\}<\/b>/);
  assert.match(app, /<b>상세정보 <span class="muted">\(선택\)<\/span><\/b>/);
});

test('대단원을 가리키는 「1단계 · 공고 준비」는 상단 띠와 같은 번호다', () => {
  // 이것은 남긴다. STEPS의 첫 자리이고 상단 띠도 1로 매긴다.
  assert.match(app, /eyebrow: '1단계 · 공고 준비'/);
  assert.equal(app.indexOf('공고 준비'), app.indexOf('공고 준비'));
});
