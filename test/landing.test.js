// 홈(10-12, 「둘째 안」): 입구는 공고 찾기 검색창 하나, 흐름은 숫자 넷. 스크립트·외부 주소·로그인이 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STEPS } from '../public/plan/workspace.js';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('홈은 공고 찾기 검색창 하나와 메뉴 넷이고 스크립트·외부 주소가 없다(글꼴은 공통 css가 부른다)', () => {
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
