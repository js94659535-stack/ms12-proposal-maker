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

test('사업을 고르는 목록이 있다: 진로설계는 파일이 있고 나머지 넷은 아직 없다고 솔직히 적는다', () => {
  const names = ['진로설계 프로젝트', '인문·사회 탐구 프로젝트', '문화예술 AI동화 프로젝트', '이주배경 잇다 프로젝트', '지역공동체 프로젝트'];
  const blocks = [...html.matchAll(/<details class="pj"[^>]*>([\s\S]*?)<\/details>/g)].map(m => m[1]);
  assert.equal(blocks.length, 5);
  for (const [i, name] of names.entries()) assert.ok(blocks.some(b => b.includes(name)), name);
  const career = blocks.find(b => b.includes('진로설계 프로젝트'));
  assert.ok(career.includes('career-form-virtual-example.pdf') && career.includes('career-form-virtual-example.hwp'));
  const others = blocks.filter(b => !b.includes('진로설계 프로젝트'));
  assert.equal(others.length, 4);
  for (const b of others) assert.ok(b.includes('아직 파일 없음') && !b.includes('.hwp') && b.includes('/baeumteo/'));
});
