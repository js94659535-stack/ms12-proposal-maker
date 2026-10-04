// 랜딩 페이지(10-35): 가장 단순하게 — 제목, 한 줄 설명, 링크 둘. 외부 스크립트·로그인·입력칸이 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('랜딩 페이지는 제목과 두 링크뿐이고 스크립트·입력칸이 없다', () => {
  assert.match(html, /<title>공모 사업계획서</title>/);
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]), ['/baeumteo/', '/radar/']);
  assert.ok(!/<script|<input|<form|https?:///.test(html));
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /name="viewport"/);
});

test('링크가 가리키는 화면이 실제로 있다', () => {
  for (const page of ['baeumteo', 'radar']) assert.ok(fs.existsSync(new URL(`../public/${page}/index.html`, import.meta.url)), page);
});
