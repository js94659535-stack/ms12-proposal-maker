// 배움터 계획서 결과의 내려받기(10-41): 화면에 단추가 있고, 화면이 쓰는 방식 그대로 한글(HWPX) 파일이 만들어진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildHwpxBlob } from '../public/baeumteo/lib/hwpx-export.js';
import { planSections } from '../public/baeumteo/blocks.js';
import { careerBody, careerGuide } from '../public/baeumteo/career-final.js';

const html = fs.readFileSync(new URL('../public/baeumteo/index.html', import.meta.url), 'utf8');

test('각 사업 카드와 완성된 가상 사업계획서에 내려받기 단추가 있다', () => {
  assert.ok(html.includes('data-dl="hwpx"') && html.includes('data-dl="txt"'));
  assert.ok(html.includes('data-fin="hwpx"') && html.includes('data-fin="txt"'));
  assert.ok(html.includes("from './lib/hwpx-export.js?v=1017'"));
  assert.ok(html.includes('완성된 가상 사업계획서'));
});

test('화면과 같은 방식으로 만든 HWPX는 한글 형식의 zip이고 본문이 들어 있다', async () => {
  for (const text of [careerBody({}), careerGuide({})]) {
    const blob = buildHwpxBlob({ project: { title: '시험', issuer: '재단', deadline: '2026-11-11' }, sections: planSections(text) });
    assert.equal(blob.type, 'application/hwp+zip');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
    assert.ok(bytes.length > 8000, `크기 ${bytes.length}`);
  }
});
