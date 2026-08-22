// 기관이 준 서류 원본을 보관하고, 돌려주고, 지운다.
//
// 예전에는 첨부 원본을 브라우저 메모리에만 두고 저장하지 않았다. 개인정보를 서버에 남기지 않으려는
// 뜻이었는데, 거래처 기록은 대행업의 신뢰다 — 받은 서류를 돌려줄 수 없으면 고객관리를 못 하는 것으로
// 보인다. 그래서 보관하되 지우는 길과 볼 수 있는 사람을 함께 정했다(docs/file-storage-r2.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeApplicantSource, normalizeApplicant } from '../src/applicants.js';
import { normalizeApplicantRecord } from '../functions/api/archive.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const endpoint = fs.readFileSync(new URL('../functions/api/org-files.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/archive.js', import.meta.url), 'utf8');
const wrangler = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

const withFile = { id: 'src-1', kind: '기타 기관자료', name: '2026 사업자등록증', asOf: '2026-08', file: { key: 'owner/org-1/src-1', name: '등록증.pdf', size: 214321, type: 'application/pdf', uploadedAt: '2026-08-22T00:00:00.000Z', uploadedBy: 'a@b.c' } };

test('자료 줄에 보관한 서류를 매단다', () => {
  const source = makeApplicantSource(withFile);
  assert.equal(source.file.name, '등록증.pdf');
  assert.equal(source.file.size, 214321);
  // 파일이 없으면 없다고 적는다. 빈 껍데기를 만들지 않는다.
  assert.equal(makeApplicantSource({ name: '홈페이지' }).file, null);
  // 보관키가 없는 파일 기록은 파일이 아니다.
  assert.equal(makeApplicantSource({ name: 'x', file: { name: '이름만' } }).file, null);
});

test('서류 목록과 동의 시각이 서버에 남는다', () => {
  // 지금까지 기관자료 목록은 브라우저에만 있었다. 파일을 매달려면 서버가 그 줄을 알아야 한다.
  const record = normalizeApplicantRecord({ id: 'org-1', name: 'QA 기관', items: [], sources: [withFile], filesConsentAt: '2026-08-22T00:00:00.000Z' });
  assert.equal(record.sources.length, 1);
  assert.equal(record.sources[0].file.key, 'owner/org-1/src-1');
  assert.equal(record.filesConsentAt, '2026-08-22T00:00:00.000Z');
  // 실적표의 「프로그램 내용」도 함께 남는다. 예전에는 저장할 때 사라졌다.
  const kept = normalizeApplicantRecord({ id: 'org-1', name: 'QA', items: [{ id: 'i1', area: 'performance', label: '2026년 사업실적', value: '기관 사업', detail: '대상: 학생' }] });
  assert.equal(kept.items[0].detail, '대상: 학생');
});

test('파일은 기관에 매달고 그 기관을 볼 수 있는 사람만 본다', () => {
  // 새 규칙을 만들지 않는다. 기관정보를 여는 것과 같은 질문을 한 번 더 한다.
  assert.match(endpoint, /SELECT id FROM applicant_organizations WHERE id = \? AND owner_hash = \?/);
  assert.match(endpoint, /if \(!await canOpen\(env\.ARCHIVE_DB, ownerHash, applicantId\)\) return json\(\{ error: '이 기관의 서류를 열 권한이 없습니다\.' \}, 403\)/);
  // 보관 자리는 기관·자료별로 나뉜다.
  assert.match(endpoint, /const keyOf = \(ownerHash, applicantId, sourceId\) => `\$\{ownerHash\}\/\$\{applicantId\}\/\$\{sourceId\}`/);
  // 무엇을·언제·누가 받았는지 파일 자체에도 적어 둔다.
  assert.match(endpoint, /customMetadata: \{ name, applicantId, uploadedAt, uploadedBy \}/);
  // 20MB까지만 받는다.
  assert.match(endpoint, /const MAX_FILE_BYTES = 20 \* 1024 \* 1024;/);
});

test('올리고 열고 지우는 길이 모두 있다', () => {
  assert.match(client, /export async function uploadOrgFile\(applicantId, sourceId, file\)/);
  assert.match(client, /export async function openOrgFile\(applicantId, sourceId\)/);
  assert.match(client, /export async function deleteOrgFile\(applicantId, sourceId\)/);
  // 화면에도 셋이 다 있다.
  assert.match(app, /data-open-source-file="\$\{escapeHtml\(source\.id\)\}">서류 열기<\/button>/);
  assert.match(app, /data-drop-source-file="\$\{escapeHtml\(source\.id\)\}">서류 지우기<\/button>/);
  assert.match(app, /data-source-file="\$\{escapeHtml\(source\.id\)\}"/);
  // 자료 줄을 지우면 매달린 파일도 함께 지운다.
  assert.match(app, /if \(\(applicant\.sources \|\| \[\]\)\.find\(item => item\.id === id\)\?\.file\) void deleteOrgFile\(applicant\.id, id\)/);
});

test('처음 한 번 동의를 받고, 지우는 길을 함께 알린다', () => {
  const view = app.slice(app.indexOf('function applicantSourcesView(applicant)'), app.indexOf('function addApplicantSource()'));
  assert.match(view, /applicant\.filesConsentAt \? '' :/);
  assert.match(view, /기관이 준 서류 원본을 보관할 수 있습니다/);
  assert.match(view, /언제든 지울 수 있습니다/);
  // 즉시 삭제로 정했다(22-32). 유예를 두면 「지웠는데 남아 있다」가 되어 더 위험하다.
  assert.match(view, /지운 파일은 되돌릴 수 없습니다/);
  assert.match(app, /이 서류를 지웁니다\. 되돌릴 수 없습니다\./);
  assert.match(view, /id="consent-org-files"/);
  // 동의 전에는 올리지 않는다.
  assert.match(app, /if \(!applicant\.filesConsentAt\) return setState\(\{ error: '서류 보관을 먼저 켜 주세요/);
});

test('무엇을 언제 받았는지는 파일을 지운 뒤에도 남는다', () => {
  const view = app.slice(app.indexOf('function applicantSourcesView(applicant)'), app.indexOf('function addApplicantSource()'));
  assert.match(view, /보관한 서류 · \$\{escapeHtml\(source\.file\.name\)\} · \$\{fileSizeLabel\(source\.file\.size\)\}/);
  assert.match(app, /notice: '보관한 서류를 지웠습니다\. 무엇을 언제 받았는지는 자료 줄에 남습니다\.'/);
});

test('바뀐 약속을 코드에 적어 둔다', () => {
  assert.match(app, /거래처 기록은 대행업의 신뢰이고/);
  assert.match(app, /기관이 준 서류는 R2에 보관하며/);
  assert.match(wrangler, /binding = "ORG_FILES"/);
  assert.match(wrangler, /받은 서류를 돌려줄 수 없으면 고객관리를 못 하는/);
});
