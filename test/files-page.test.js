// 자료 내려받기 화면(10-38): 만든 파일은 사이트 안에, 재단 공식 자료는 재단 서버로 바로 연결한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/files/index.html', import.meta.url), 'utf8');
const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);

test('만든 파일 링크가 가리키는 파일이 실제로 있고 비어 있지 않다', () => {
  for (const h of hrefs.filter(x => x.startsWith('/files/') && x !== '/files/')) {
    const file = new URL(`../public${h}`, import.meta.url);
    assert.ok(fs.existsSync(file), h);
    assert.ok(fs.statSync(file).size > 100_000, `${h} 크기`);
  }
  assert.ok(hrefs.includes('/files/career-form-virtual-example.pdf') && hrefs.includes('/files/career-form-virtual-example.hwp'));
});

test('재단 자료는 재단 서버 주소로 연결하고 2027·2026 두 해가 모두 있다', () => {
  const foundation = hrefs.filter(h => h.startsWith('https://download.sdream.or.kr/'));
  assert.equal(foundation.length, 4);
  for (const year of ['2027', '2026']) assert.equal(foundation.filter(h => h.includes(`/BU/BU10/${year}/`)).length, 2, year);
  assert.ok(foundation.every(h => h.endsWith('.zip') && !h.includes(' ')));
  assert.ok(hrefs.includes('https://www.sdream.or.kr/w/web35gV'));
});

test('가상 예시본이라는 표시가 있고 제출용이라고 하지 않는다', () => {
  assert.ok(html.includes('가상') && html.includes('제출용이 아닙니다'));
  assert.ok(!html.includes('최종 제출본'));
});
