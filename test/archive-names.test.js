// 보관함 이름은 한 곳에서만 나온다.
//
// 실제로 났던 일: 같은 보관함이 여섯 이름으로 불렸다. 「계획서보관함에서 불러오기」라고 적힌
// 버튼이 실제로는 기관을 불러왔고, 계획서 목록을 가져오는 같은 일에 「계획서보관함 목록」·
// 「계획서 다시 불러오기」·「계획서보관함 계획서」 세 이름이 붙어 있었다.
//
// 규칙은 둘이다. 보관함은 담는 것으로 부르고(공고·계획서·기관), 하는 일은 열기·불러오기·저장 셋뿐이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOX, loadFrom, openBox, saveTo } from '../src/archive-names.js';

const app = fs.readFileSync('src/app.js', 'utf8');

test('보관함은 담는 것으로 부르고 하는 일은 셋뿐이다', () => {
  assert.equal(loadFrom('org'), '기관보관함에서 불러오기');
  assert.equal(loadFrom('proposal'), '계획서보관함에서 불러오기');
  assert.equal(openBox('notice'), '공고보관함 열기');
  assert.equal(saveTo('proposal'), '계획서보관함에 저장');
});

test('기관을 불러오는 버튼은 기관보관함이라고 적는다', () => {
  // 계획서보관함에서 기관이 나온다고 적혀 있으면 무엇이 담기는지 알 수 없다.
  assert.ok(app.includes(`id="load-applicants">\${loadFrom('org')}</button>`));
  assert.ok(!app.includes('id="load-applicants">계획서보관함에서 불러오기'));
});

test('버튼 이름에 보관함 이름을 직접 적지 않는다', () => {
  const labels = [...app.matchAll(/<button[^>]*>([^<]*보관함[^<]*)<\/button>/g)].map(match => match[1]);
  assert.deepEqual(labels, [], `이름을 직접 적은 버튼이 남아 있다: ${labels.join(' / ')}`);
});

test('같은 일에 붙었던 옛 이름은 남아 있지 않다', () => {
  for (const stale of ['계획서보관함 목록', '계획서보관함 계획서', '계획서 다시 불러오기', '공고보관함 다시 불러오기', '공고보관함에서 열기']) {
    assert.ok(!app.includes(stale), `${stale}가 아직 남아 있다`);
  }
});

test('계획서 목록을 가져오는 입구는 계획서보관함 안에만 있다', () => {
  // 전에는 공고 검색 줄에도 같은 버튼이 있었다. 거기서 누르면 결과가 접힌 칸으로 들어가 보이지 않았다.
  assert.equal((app.match(/id="list-archived-proposals"/g) || []).length, 1);
  assert.ok(!app.includes('list-archived-proposals-2'));
  const box = app.slice(app.indexOf('id="proposal-box"'));
  assert.ok(box.slice(0, 2000).includes(`id="list-archived-proposals">\${loadFrom('proposal')}`));
});

test('화면에 없는 것을 붙잡는 처리기는 두지 않는다', () => {
  // #draft·data-use-archived-notice·data-view-archived-notice는 화면에서 사라진 지 오래인데
  // 처리기만 남아 있었다. 같은 함수를 부르는 입구가 둘로 보이던 까닭이다.
  for (const dead of ["querySelector('#draft')", 'data-use-archived-notice', 'data-view-archived-notice']) {
    assert.ok(!app.includes(dead), `${dead} 처리기가 남아 있다`);
  }
});
