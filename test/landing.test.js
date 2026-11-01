// 홈(10-12 「둘째 안」 → 11-03): 입구는 견본 계획서, 공고 찾기 검색창은 그 다음. 흐름은 숫자 넷. 스크립트·외부 주소·로그인이 없다.
// 공짜 생성은 없다(11-03 사용자 결정) — 홈에 「써 보기」「무료 생성」 같은 입구를 두지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STEPS } from '../public/plan/workspace.js';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('홈은 검색창 하나와 메뉴 넷이고 스크립트·외부 주소가 없다(글꼴은 공통 css가 부른다)', () => {
  assert.ok(html.includes('<title>공모 사업계획서</title>'));
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  for (const page of ['/radar/', '/plan/', '/baeumteo/', '/files/']) assert.ok(hrefs.includes(page), page);
  assert.ok(hrefs.every(href => href.startsWith('/')), '모든 링크가 이 사이트 안');
  assert.match(html, /<form [^>]*action="\/radar\/" method="get"/);
  assert.equal([...html.matchAll(/<input /g)].length, 1);
  assert.match(html, /<input name="q"/);
  for (const banned of ['<script', 'http://', 'https://', 'type="password"']) assert.ok(!html.includes(banned), banned);
  assert.ok(fs.readFileSync(new URL('../public/lib/site.css', import.meta.url), 'utf8').includes('prefers-color-scheme: dark'));
  assert.ok(html.includes('name="viewport"'));
});

test('홈의 넷 단계는 작업대와 같은 이름·같은 순서다', () => {
  const shown = [...html.matchAll(/<span class="n">(\d)<\/span><b>([^<]+)<\/b>/g)].map(m => [Number(m[1]), m[2]]);
  assert.deepEqual(shown, STEPS.map((step, index) => [index + 1, step.name]));
});

test('링크가 가리키는 화면이 실제로 있다', () => {
  for (const page of ['baeumteo', 'radar', 'plan', 'files']) assert.ok(fs.existsSync(new URL(`../public/${page}/index.html`, import.meta.url)), page);
});

test('예전 공고 읽기(/rfp/)는 작업대로 넘긴다', () => {
  const old = fs.readFileSync(new URL('../public/rfp/index.html', import.meta.url), 'utf8');
  assert.match(old, /http-equiv="refresh" content="0; url=\/plan\/"/);
});

test('입구는 견본이다 — 첫 화면의 첫 버튼과 맨 앞 카드가 견본을 가리킨다(11-03)', () => {
  const hero = html.slice(html.indexOf('<div class="hero">'), html.indexOf('</div></div>', html.indexOf('<div class="hero">')));
  assert.ok(hero.indexOf('href="/baeumteo/"') > -1 && hero.indexOf('href="/baeumteo/"') < hero.indexOf('<form '), '견본 버튼이 검색창보다 앞');
  const cards = [...html.matchAll(/<a class="card[^"]*" href="([^"]+)">/g)].map(m => m[1]);
  assert.equal(cards[0], '/baeumteo/');
  assert.ok(html.includes('<a class="cta" href="/baeumteo/">'), '머리 메뉴의 버튼도 견본');
});

test('공짜 생성 입구가 없다(11-03)', () => {
  for (const banned of ['무료 생성', '무료로 써', '써 보기', '맛보기', '한 항목 무료', '먼저 한 장']) assert.ok(!html.includes(banned), banned);
});

test('값과 요금 자리가 있고, 계획서 값의 숫자는 비어 있다(값은 사람이 정한다, 11-03)', () => {
  assert.match(html, /<section class="block" id="price">/);
  assert.ok(html.includes('href="/#price"'));
  const slot = html.match(/<b class="price tbd" data-price="plan">([^<]*)<\/b>/);
  assert.ok(slot, '계획서 한 편 값 자리');
  assert.doesNotMatch(slot[1], /\d/, '숫자를 아직 넣지 않는다');
});
