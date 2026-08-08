import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { ATTACHMENT_ROLES, bundleSummary, classifyAttachmentRole, expandBundle, mergeBundleStructures, readZipEntries } from '../src/notice-bundle.js';
import { analyzeNoticeStructure, buildSelectionLogic, selectionRequirements } from '../src/notice-logic.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
const NOTICE = { title: 'QA 공고', overview: '사업목적 : QA 아동 지원. 사업예산 총 100,000,000원 이내 (1개소당 10,000,000원 이내)' };

function zipOf(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(content);
    const data = zlib.deflateRawSync(raw);
    const local = Buffer.alloc(30 + nameBytes.length + data.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    Buffer.from(nameBytes).copy(local, 30); Buffer.from(data).copy(local, 30 + nameBytes.length);
    locals.push(local);
    const entry = Buffer.alloc(46 + nameBytes.length);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(8, 10); entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42);
    Buffer.from(nameBytes).copy(entry, 46);
    central.push(entry);
    offset += local.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, directory, end]);
  return new Uint8Array(all);
}

test('첨부파일을 역할별로 구분한다', () => {
  assert.equal(classifyAttachmentRole('별첨4. 표준 심사기준.hwp'), '평가표·심사기준');
  assert.equal(classifyAttachmentRole('별첨3. 예산편성기준표.hwp'), '예산편성 기준');
  assert.equal(classifyAttachmentRole('사업계획서 양식.hwp'), '신청서·계획서 양식');
  assert.equal(classifyAttachmentRole('별첨5. 목표 설정 방법 안내.hwp'), '사업 안내·요강');
  assert.equal(classifyAttachmentRole('2027년 공고문.hwp'), '공고문');
  assert.equal(classifyAttachmentRole('개인정보 동의서.txt'), '기타 참고자료');
  assert.ok(ATTACHMENT_ROLES.includes(classifyAttachmentRole('아무 파일.bin')));
});

test('ZIP을 펼쳐 내부 파일까지 묶음으로 읽고 못 읽는 파일은 상태로 남긴다', async () => {
  const zip = zipOf([
    ['안내/별첨4. 표준 심사기준.txt', '평가기준 : 사업 필요성 20점, 수행 역량 30점'],
    ['안내/별첨3. 예산편성기준표.txt', '강사비 1시간 최대 350,000원'],
    ['안내/빈 폴더/', '']
  ]);
  const entries = await readZipEntries(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
  assert.equal(entries.length, 2);

  const files = await expandBundle([
    { name: 'QA 자료.zip', bytes: zip },
    { name: '읽을 수 없는 공고문.hwp', bytes: new Uint8Array([1, 2, 3, 4]) }
  ], { extractText: async ({ buffer }) => new TextDecoder().decode(new Uint8Array(buffer)) });

  const zipRow = files.find(file => file.status === '펼침');
  const criteria = files.find(file => file.name.includes('표준 심사기준'));
  const broken = files.find(file => file.name.includes('읽을 수 없는'));
  assert.ok(zipRow);
  assert.equal(criteria.status, '읽음');
  assert.equal(criteria.role, '평가표·심사기준');
  // HWP를 읽지 못하면 변환 필요 상태로만 남기고 나머지 분석은 계속한다.
  assert.equal(broken.status, '변환 필요');
  assert.match(broken.error, /PDF 또는 HWPX 변환 필요/);
  const summary = bundleSummary(files);
  assert.equal(summary.read, 2);
  assert.equal(summary.conversionNeeded, 1);
});

test('읽힌 첨부를 합쳐 선정 논리를 다시 완성하고 근거에 파일명을 붙인다', async () => {
  const zip = zipOf([
    ['별첨4. 표준 심사기준.txt', '평가기준 : 사업 필요성 20점, 수행 역량 30점, 예산 적정성 10점'],
    ['별첨5. 안내.txt', '제출 서류 : 사업계획서와 예산내역서를 제출하여야 한다. 다음에 해당하면 심사에서 제외한다 : 보조금 부정수급 기관.']
  ]);
  const base = analyzeNoticeStructure(NOTICE);
  const beforeConfirmed = base.fields.filter(field => field.status === '공식 근거 확인').length;
  const files = await expandBundle([{ name: 'QA 자료.zip', bytes: zip }], { extractText: async ({ buffer }) => new TextDecoder().decode(new Uint8Array(buffer)) });
  const { structure, conflicts } = mergeBundleStructures(base, files);

  assert.ok(structure.fields.filter(field => field.status === '공식 근거 확인').length > beforeConfirmed);
  const submission = structure.fields.find(field => field.key === 'submissionItems');
  assert.equal(submission.status, '공식 근거 확인');
  assert.match(submission.evidence.at(-1).source, /별첨5/);
  // 평가표에서만 배점을 읽는다.
  assert.equal(structure.hasOfficialScoring, true);
  assert.deepEqual(structure.evaluationScores.map(score => score.points), [20, 30, 10]);
  assert.ok(structure.evaluationScores.every(score => /별첨4/.test(score.source)));
  const logic = buildSelectionLogic(structure);
  assert.equal(logic.scoring.mode, '공식 배점');
  const requirements = selectionRequirements(structure);
  assert.ok(requirements.filter(item => item.basis === '공식 근거').length >= 5);
  assert.deepEqual(conflicts, []);
});

test('안내문의 척도 설명을 배점으로 쓰지 않고 한도 충돌만 표시한다', async () => {
  const zip = zipOf([
    ['별첨6. 평가 방법 작성 안내.txt', '만족도는 4점 척도 또는 5점 척도로 측정한다.'],
    ['별첨1. 안내.txt', '사업예산 총 100,000,000원 이내 (1개소당 20,000,000원 이내)']
  ]);
  const files = await expandBundle([{ name: 'QA 자료.zip', bytes: zip }], { extractText: async ({ buffer }) => new TextDecoder().decode(new Uint8Array(buffer)) });
  const { structure, conflicts } = mergeBundleStructures(analyzeNoticeStructure(NOTICE), files);
  // 척도 설명은 배점이 아니다.
  assert.equal(structure.hasOfficialScoring, false);
  assert.equal(buildSelectionLogic(structure).scoring.mode, '배점 없음');
  // 같은 이름의 한도가 다르면 충돌로 남긴다(1개소당 10,000,000 vs 20,000,000).
  assert.ok(conflicts.some(item => item.label === '1개소당' && item.values.includes('10000000') && item.values.includes('20000000')));
});

test('자료묶음 분석은 외부 호출 없이 공고 화면에 연결된다', () => {
  const source = fs.readFileSync(new URL('../src/notice-bundle.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /openai/i);
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /id="analyze-notice-bundle"/);
  assert.match(appSource, /function analyzeNoticeBundleFiles\(\)/);
  assert.match(appSource, /expandBundle\(downloaded/);
});
