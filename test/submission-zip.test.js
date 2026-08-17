import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFormSpec } from '../src/form-spec.js';
import { MANIFEST_NAME, buildManifestText, crc32, packageStale, planSubmissionZip, safeEntryName, uniqueNames, zipBytes } from '../src/submission-zip.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const REAL_FORM = fs.readFileSync(new URL('./fixtures/form-chest-2027-application.txt', import.meta.url), 'utf8');
const REAL_NOTICE = fs.readFileSync(new URL('./fixtures/notice-chest-2027-gold.txt', import.meta.url), 'utf8');
const CASE1_SPEC = buildFormSpec([
  { id: 'r1', fileName: '2027 배분신청서 서식.hwp', sourceType: '공모신청서', extractionStatus: 'success', extractedText: REAL_FORM },
  { id: 'r2', fileName: '2027 공고문.hwp', sourceType: '세부 공고문', extractionStatus: 'success', extractedText: REAL_NOTICE }
]);
const DOCUMENTS = [
  { key: 'docx', name: '한들가족지원센터_2027년 가족기능강화사업_V2_제출본.docx', bytes: 41_000 },
  { key: 'pdf', name: '한들가족지원센터_2027년 가족기능강화사업_V2_제출본.pdf', bytes: 620_000 }
];
const BASE = {
  canExport: true, packageStatus: '제출 가능', attachments: CASE1_SPEC.attachments, documents: DOCUMENTS,
  projectTitle: '2027년 가족기능강화사업', applicantName: '한들가족지원센터',
  version: 2, versionId: 'v2-abc123', generatedAt: '2026-08-10T09:30:00.000Z'
};
// 사업계획서 1부는 생성 문서로 채우므로 파일을 올릴 필요가 없다.
function allLinks() {
  const links = {};
  for (const item of CASE1_SPEC.attachments) {
    if (/사업\s*계획서/.test(item.name)) continue;
    links[item.name] = { fileName: `${item.name}.hwp`, size: 12_000 };
  }
  return links;
}
// 압축하지 않고 담으므로 중앙 디렉터리만 읽으면 원본을 그대로 꺼낼 수 있다.
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054B50) end -= 1;
  assert.ok(end >= 0, 'EOCD를 찾지 못했다');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(at, true), 0x02014B50);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const localName = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localName + localExtra;
    files.push({ name, method, crc, size, bytes: bytes.subarray(start, start + size) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

test('CASE 1은 실제 필수 파일이 없으면 패키지를 만들지 않는다', () => {
  // 「준비 완료」 체크만 하고 파일을 연결하지 않은 상태
  const plan = planSubmissionZip({ ...BASE, links: {} });
  assert.equal(plan.ok, false);
  const missing = plan.blockers.filter(item => item.reason === '필수 첨부 파일 없음');
  assert.equal(missing.length, 7, `필수 첨부 7건이 막혀야 한다: ${missing.map(item => item.detail).join(' / ')}`);
  // 사업계획서 1부는 생성 문서로 충족하므로 차단 사유가 아니다.
  assert.ok(!missing.some(item => /사업\s*계획서/.test(item.detail)));
  assert.ok(plan.skipped.some(item => /사업\s*계획서/.test(item.name) && item.satisfied));
  // 제출 판정을 통과하지 못하면 그것만으로도 막는다.
  const blocked = planSubmissionZip({ ...BASE, canExport: false, packageStatus: '제출 차단', links: allLinks() });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.blockers.some(item => item.reason === '제출 판정 미통과'));
});

test('필수 파일을 모두 연결하면 ZIP을 만들고 다시 열어 원본과 맞출 수 있다', () => {
  const plan = planSubmissionZip({ ...BASE, links: allLinks() });
  assert.equal(plan.ok, true, plan.blockers.map(item => item.reason).join(' / '));
  assert.equal(plan.entries.length, 9, '문서 2 + 첨부 7');
  assert.match(plan.fileName, /^한들가족지원센터_2027년 가족기능강화사업_V2_제출패키지\.zip$/);

  // 실제 바이트를 담아 묶는다.
  const payload = new Map();
  const files = plan.entries.map(entry => {
    const bytes = new TextEncoder().encode(`${entry.name}::원본 내용 ${entry.bytes}`);
    payload.set(entry.name, bytes);
    return { name: entry.name, bytes };
  });
  files.push({ name: MANIFEST_NAME, bytes: new TextEncoder().encode(plan.manifest) });
  const zip = zipBytes(files, plan.meta.generatedAt);

  // 다시 열어 파일 목록·크기·원본 일치를 확인한다.
  assert.equal(String.fromCharCode(...zip.subarray(0, 2)), 'PK');
  const opened = readZip(zip);
  assert.equal(opened.length, 10);
  assert.deepEqual(opened.map(item => item.name), [...files.map(item => item.name)]);
  for (const item of opened) {
    assert.equal(item.method, 0, '압축하지 않고 원본 그대로 담는다');
    const original = item.name === MANIFEST_NAME ? new TextEncoder().encode(plan.manifest) : payload.get(item.name);
    assert.equal(item.size, original.length, item.name);
    assert.equal(item.crc, crc32(original), `${item.name} 원본이 바뀌었다`);
    assert.deepEqual(Buffer.from(item.bytes), Buffer.from(original), item.name);
  }
  // DOCX·PDF는 고른 같은 버전이고, 첨부는 첨부 폴더에 담긴다.
  const names = opened.map(item => item.name);
  assert.ok(names.filter(name => name.includes('_V2_제출본.')).length === 2);
  assert.ok(!names.some(name => name.includes('_V1_')));
  assert.equal(names.filter(name => name.startsWith('첨부/')).length, 7);
});

test('필수 첨부 하나를 빼면 즉시 막고, 빈 파일과 읽기 실패도 막는다', () => {
  const links = allLinks();
  const target = Object.keys(links).find(name => name.includes('시설신고증'));
  delete links[target];
  const removed = planSubmissionZip({ ...BASE, links });
  assert.equal(removed.ok, false);
  assert.ok(removed.blockers.some(item => item.reason === '필수 첨부 파일 없음' && item.detail.includes('시설신고증')));

  const zero = allLinks();
  zero[target] = { fileName: '시설신고증.pdf', size: 0 };
  const empty = planSubmissionZip({ ...BASE, links: zero });
  assert.equal(empty.ok, false);
  assert.ok(empty.blockers.some(item => item.reason === '빈 첨부 파일'));

  const failed = allLinks();
  failed[target] = { fileName: '시설신고증.pdf', size: 900, error: '파일을 열 수 없습니다' };
  const unreadable = planSubmissionZip({ ...BASE, links: failed });
  assert.equal(unreadable.ok, false);
  assert.ok(unreadable.blockers.some(item => item.reason === '첨부 파일 읽기 실패'));

  // 선택 첨부는 없어도 막지 않는다.
  const optional = [...CASE1_SPEC.attachments, { name: '기관 소개 자료', required: false }];
  const withOptional = planSubmissionZip({ ...BASE, attachments: optional, links: allLinks() });
  assert.equal(withOptional.ok, true);
  assert.ok(withOptional.skipped.some(item => item.name === '기관 소개 자료' && !item.required));
});

test('공고문·참고자료는 제출 첨부로 담지 않는다', () => {
  const attachments = [
    ...CASE1_SPEC.attachments,
    { name: '공고문 원문', required: true }, { name: '참고자료 모음', required: true }, { name: '서식 파일', required: true }
  ];
  const links = { ...allLinks(), '공고문 원문': { fileName: '2027 공고문.hwp', size: 88_000 }, '참고자료 모음': { fileName: '참고.zip', size: 5_000 } };
  const plan = planSubmissionZip({ ...BASE, attachments, links });
  assert.equal(plan.ok, true, plan.blockers.map(item => item.reason).join(' / '));
  assert.ok(!plan.entries.some(entry => /공고|참고|서식/.test(entry.name)), '공고문·참고자료가 묶였다');
  for (const name of ['공고문 원문', '참고자료 모음', '서식 파일']) {
    assert.ok(plan.skipped.some(item => item.name === name && item.reason.includes('참고자료')), name);
  }
});

test('제출목록은 필요한 정보만 담고 내부 자료는 담지 않는다', () => {
  const plan = planSubmissionZip({ ...BASE, links: allLinks() });
  const manifest = buildManifestText(plan);
  assert.match(manifest, /기관명: 한들가족지원센터/);
  assert.match(manifest, /사업명: 2027년 가족기능강화사업/);
  assert.match(manifest, /계획서 버전: V2/);
  assert.match(manifest, /생성일: 2026-08-10 09:30:00/);
  assert.match(manifest, /포함 파일 9건/);
  assert.match(manifest, /미포함 항목/);
  assert.match(manifest, /사업계획서 1부.*생성된 사업계획서 DOCX·PDF로 충족/);
  // 내부 검증 데이터·공고 원문·AI 응답은 넣지 않는다.
  assert.doesNotMatch(manifest, /BLOCKING|정밀검증|지문|fingerprint|공고 원문|프롬프트|AI/);
  assert.ok(!manifest.includes(REAL_NOTICE.slice(0, 40)));
});

test('버전이 바뀌면 이전 패키지를 다시 쓰지 않는다', () => {
  assert.equal(packageStale({ versionId: 'v2-abc123' }, 'v2-abc123'), false);
  assert.equal(packageStale({ versionId: 'v2-abc123' }, 'v3-def456'), true);
  assert.equal(packageStale(null, 'v2-abc123'), true);
  assert.equal(packageStale({}, 'v2-abc123'), true);
  // 저장 버전을 고르지 않으면 애초에 만들지 않는다.
  const noVersion = planSubmissionZip({ ...BASE, versionId: '', links: allLinks() });
  assert.equal(noVersion.ok, false);
  assert.ok(noVersion.blockers.some(item => item.reason === '저장 버전 없음'));
});

test('파일명 중복과 금지문자를 안전하게 처리한다', () => {
  assert.equal(safeEntryName('신뢰성 점검표/2027*최종?.hwp'), '신뢰성 점검표 2027 최종.hwp');
  assert.equal(safeEntryName('..\\..\\etc\\passwd'), '파일.etcpasswd');
  assert.equal(safeEntryName('nul.pdf'), '파일_nul.pdf');
  // 뜻이 있는 하이픈·공백은 살린다.
  assert.equal(safeEntryName('보고서-최종본 v2.pdf'), '보고서-최종본 v2.pdf');
  assert.deepEqual(uniqueNames(['a.pdf', 'a.pdf', 'A.pdf', 'b.hwp']), ['a.pdf', 'a (2).pdf', 'A (3).pdf', 'b.hwp']);

  // 서로 다른 첨부가 같은 파일명을 쓰면 덮어쓰지 않는다.
  const links = allLinks();
  for (const name of Object.keys(links)) links[name] = { fileName: '스캔.pdf', size: 3_000 };
  const plan = planSubmissionZip({ ...BASE, links });
  const names = plan.entries.filter(entry => entry.kind === '첨부').map(entry => entry.name);
  assert.equal(new Set(names).size, names.length, `이름이 겹친다: ${names.join(' / ')}`);
});

test('제출 ZIP에 AI 호출이 없고 첨부 원본을 브라우저 저장소에 넣지 않는다', () => {
  const engine = fs.readFileSync(new URL('../src/submission-zip.js', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /fetch\(|WithAI\(|localStorage/);
  // 앱은 실제 파일을 메모리에만 두고 저장하지 않는다.
  assert.match(app, /const attachmentFiles = new Map\(\);/);
  assert.match(app, /attachmentLinks: \{\}, submissionZip: null[,}]/);
  assert.doesNotMatch(app, /attachmentLinks.*base64|toBase64\(file/);
  // ZIP은 고른 저장 버전으로만 만들고, 저장 안 된 화면 내용은 막는다.
  const zipFn = app.slice(app.indexOf('async function exportSubmissionZip()'), app.indexOf('const PACKAGE_TONE'));
  assert.doesNotMatch(zipFn, /WithAI\(|fetch\(/);
  assert.match(zipFn, /const \{ version, reason \} = selectedSavedVersion\(\);\s*\n\s*if \(!version\) return setState\(\{ error: reason \}\);/);
  assert.match(zipFn, /if \(unsavedChanges\(\)\) return setState/);
  assert.match(zipFn, /buildDocxBlob\(state\.project, version\.sections, options\)/);
  assert.match(zipFn, /buildProposalPdfBlob\(\{ project: state\.project, sections: version\.sections, tables: version\.tables \|\| \[\] \}\)/);
  assert.match(zipFn, /if \(!plan\.ok\) return setState/);
  // 파일 연결·해제 경로가 화면에 있다.
  assert.match(app, /data-attachment-file=/);
  assert.match(app, /data-attachment-clear=/);
  assert.match(app, /id="package-zip"/);
});
