// 파일 첨부. 실제 공식 첨부파일(HWP)과 직접 만든 표본으로 확인한다.
// 읽지 못한 것을 읽은 척하지 않는 것이 핵심이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { countSectionTables, extractHwpDocument, extractHwpText, parseSectionRecords } from '../src/hwp-text.js';
import { hwpxSectionText } from '../src/files.js';
import { FAILED_MESSAGE, STALE_MESSAGE, looksLikeAssetFailure, shouldReload } from '../src/module-loader.js';

const SAMPLE = path.join(process.env.TEMP || '/tmp', 'ms12-files', 'official.hwp');
const hasSample = fs.existsSync(SAMPLE);
const sampleBuffer = () => {
  const buffer = fs.readFileSync(SAMPLE);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
};

// ---------- 구형 HWP ----------

test('실제 공고문 HWP에서 본문과 표를 읽는다', { skip: hasSample ? false : '시험용 공식 HWP 파일이 없습니다' }, async () => {
  const result = await extractHwpDocument(sampleBuffer());
  // 사랑의열매 공식 공고문 첨부. 본문이 실제로 나온다.
  assert.ok(result.text.length > 3000, `본문 ${result.text.length}자`);
  assert.match(result.text, /공모/);
  assert.ok(result.tables > 0, `표 ${result.tables}개`);
  // 제어문자가 글자로 새어 나오지 않는다. 예전에는 주소 끝에 한자가 붙었다.
  assert.doesNotMatch(result.text, /[一-鿿]/);
  assert.match(result.text, /proposal\.chest\.or\.kr\)/);
});

test('HWP가 아닌 파일은 형식이 아니라고 말한다', async () => {
  const notHwp = new TextEncoder().encode('x'.repeat(600)).buffer;
  await assert.rejects(() => extractHwpText(notHwp), /형식이 아닙니다/);
});

test('표는 개체 식별자로 센다', { skip: hasSample ? false : '시험용 공식 HWP 파일이 없습니다' }, async () => {
  const result = await extractHwpDocument(sampleBuffer());
  // HWPTAG_TABLE(76)이 없는 문서에서도 tbl 식별자로 표를 찾는다.
  assert.ok(result.tables > 0, `표 ${result.tables}개`);
  assert.equal(typeof countSectionTables, 'function');
  assert.equal(typeof parseSectionRecords, 'function');
});

// ---------- HWPX ----------

test('HWPX 본문에서 문단과 표 칸을 구분해 읽는다', () => {
  const xml = '<hp:p><hp:t>사업명</hp:t></hp:p><hp:tbl><hp:tr><hp:tc><hp:p><hp:t>구분</hp:t></hp:p></hp:tc>'
    + '<hp:tc><hp:p><hp:t>금액</hp:t></hp:p></hp:tc></hp:tr><hp:tr><hp:tc><hp:p><hp:t>인건비</hp:t></hp:p></hp:tc>'
    + '<hp:tc><hp:p><hp:t>3000000</hp:t></hp:p></hp:tc></hp:tr></hp:tbl>';
  const text = hwpxSectionText(xml);
  assert.match(text, /사업명/);
  // 표는 칸을 탭으로, 줄을 줄바꿈으로 남긴다.
  assert.match(text, /구분\t금액/);
  assert.match(text, /인건비\t3000000/);
});

// ---------- 자산 갱신 충돌 ----------

test('자산을 못 받은 오류를 알아본다', () => {
  for (const message of [
    'Failed to fetch dynamically imported module: https://pro.ms12.org/assets/pdf-B72nsZT-.js',
    'Expected a JavaScript module script but the server responded with a MIME type of text/html',
    'Loading chunk 12 failed'
  ]) {
    assert.equal(looksLikeAssetFailure(new Error(message)), true, message.slice(0, 40));
  }
  // 다른 오류까지 새로고침으로 몰지 않는다.
  assert.equal(looksLikeAssetFailure(new Error('암호가 걸린 문서입니다.')), false);
});

test('자동 새로고침은 한 번만 한다', () => {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value)
  };
  const error = new Error('Failed to fetch dynamically imported module: /assets/pdf-x.js');
  const now = 1_000_000;
  assert.equal(shouldReload(error, now), true);
  store.set('ms12_asset_reload', String(now));
  // 방금 새로고침했으면 다시 하지 않는다. 무한 새로고침을 막는다.
  assert.equal(shouldReload(error, now + 5_000), false);
  // 시간이 충분히 지나면 다시 시도할 수 있다.
  assert.equal(shouldReload(error, now + 120_000), true);
  delete globalThis.sessionStorage;
});

test('안내 문구는 캐시를 지우라고 떠넘기지 않는다', () => {
  assert.match(STALE_MESSAGE, /자동으로 새로고침/);
  assert.doesNotMatch(STALE_MESSAGE, /캐시/);
  assert.match(FAILED_MESSAGE, /새로고침/);
  assert.doesNotMatch(FAILED_MESSAGE, /캐시를 (지우|삭제)/);
});

test('없는 자산이 HTML로 내려오지 않도록 404 문서를 둔다', () => {
  const page = fs.readFileSync(new URL('../public/404.html', import.meta.url), 'utf8');
  // Pages는 출력 폴더에 404.html이 있으면 없는 주소에 404를 준다.
  assert.match(page, /<title>[^<]*찾을 수 없는/);
  assert.match(page, /\/assets\//);
});

// ---------- 지원 형식과 실패 안내 ----------

test('지원 형식과 실패 사유가 구분되어 있다', async () => {
  const { ACCEPT, REASON, SUPPORTED } = await import('../src/files.js');
  assert.deepEqual([...SUPPORTED], ['pdf', 'docx', 'txt', 'hwpx', 'hwp']);
  assert.equal(ACCEPT, '.pdf,.docx,.txt,.hwpx,.hwp');
  // 빈 문서·암호·손상·스캔을 각각 다르게 말한다.
  const messages = [REASON.empty, REASON.encrypted, REASON.damaged, REASON.scanned];
  assert.equal(new Set(messages).size, 4);
  assert.match(REASON.empty, /빈 문서/);
  assert.match(REASON.encrypted, /암호/);
  assert.match(REASON.damaged, /손상/);
  assert.match(REASON.scanned, /스캔/);
});

test('파서는 동적 import 실패를 그냥 던지지 않는다', () => {
  const source = fs.readFileSync(new URL('../src/files.js', import.meta.url), 'utf8');
  // PDF·DOCX 파서는 배포 갱신에 걸릴 수 있어 감싼 로더로 부른다.
  assert.match(source, /loadModule\(\(\) => import\('pdfjs-dist'\), 'PDF 읽기'\)/);
  assert.match(source, /loadModule\(\(\) => import\('mammoth\/mammoth\.browser'\), 'DOCX 읽기'\)/);
});
