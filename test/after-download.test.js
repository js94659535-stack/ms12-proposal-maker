import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DOWNLOAD_COPIES, nextAfterDownload } from '../src/after-download.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
// 검토본을 받았고 남은 일이 하나도 없는 상태. 여기서 하나씩 되돌려 가며 시험한다.
const CLEAN = { copy: '검토본', format: 'PDF', openMarks: 0, blockers: 0, saved: true, reviewed: true, approved: true };
const SUBMITTED = { copy: '제출본', format: 'PDF', attachmentsMissing: 0, zipDone: true, zipStale: false };

test('무엇을 받았는지 먼저 밝힌다', () => {
  assert.deepEqual(DOWNLOAD_COPIES, ['검토본', '제출본']);
  assert.equal(nextAfterDownload({ ...CLEAN, format: 'HWPX' }).headline, 'HWPX 검토본을 내려받았습니다.');
  assert.equal(nextAfterDownload(SUBMITTED).headline, 'PDF 제출본을 내려받았습니다.');
  // 무엇을 받았는지 모르면 검토본으로 본다. 제출본이라고 앞질러 말하지 않는다.
  assert.equal(nextAfterDownload({}).copy, '검토본');
});

test('검토본: 확인 필요 표시가 남아 있으면 그것부터 채우게 한다', () => {
  const step = nextAfterDownload({ ...CLEAN, openMarks: 3, saved: false, reviewed: false });
  assert.equal(step.label, '확인 필요 3곳 채우기');
  assert.equal(step.go, 4);
  assert.equal(step.anchor, '#open-marks');
  assert.equal(step.done, false);
});

test('검토본: 검토 전이면 심사 검토로 데려간다', () => {
  const step = nextAfterDownload({ ...CLEAN, reviewed: false, saved: false });
  assert.equal(step.label, '심사 검토 받기');
  assert.equal(step.go, 5);
  assert.equal(step.anchor, '#result-pipeline');
});

test('검토본: 제출을 막는 사유가 남으면 그것을 먼저 짚는다', () => {
  const step = nextAfterDownload({ ...CLEAN, blockers: 2, saved: false });
  assert.equal(step.label, '제출 조건 맞추기');
  assert.equal(step.anchor, '#submission-package');
  assert.match(step.why, /2건/);
});

test('검토본: 보관 전이면 보관함 저장, 승인 전이면 최종본 승인', () => {
  assert.equal(nextAfterDownload({ ...CLEAN, saved: false }).label, '계획서보관함에 저장');
  assert.equal(nextAfterDownload({ ...CLEAN, saved: false }).anchor, '#result-completion');
  assert.equal(nextAfterDownload({ ...CLEAN, approved: false }).label, '최종본으로 승인');
  assert.equal(nextAfterDownload({ ...CLEAN, approved: false }).anchor, '#final-submission');
});

test('검토본은 아무리 잘 갖춰져도 제출로 끝나지 않는다', () => {
  const step = nextAfterDownload(CLEAN);
  assert.equal(step.label, '최종 제출본 내려받기');
  assert.equal(step.done, false);
  assert.match(step.why, /검토본/);
});

test('제출본: 첨부와 묶음이 남아 있으면 순서대로 권한다', () => {
  const missing = nextAfterDownload({ ...SUBMITTED, attachmentsMissing: 2, zipDone: false });
  assert.equal(missing.label, '첨부서류 연결');
  assert.match(missing.why, /2건/);
  const stale = nextAfterDownload({ ...SUBMITTED, zipStale: true });
  assert.equal(stale.label, '제출서류 다시 묶기');
  assert.equal(nextAfterDownload({ ...SUBMITTED, zipDone: false }).label, '제출서류 한 벌로 묶기');
});

test('제출본: 다 갖췄으면 앱에서 할 일이 끝났다고 말한다', () => {
  const step = nextAfterDownload(SUBMITTED);
  assert.equal(step.done, true);
  assert.equal(step.label, '공고 접수처에 제출');
  // 마감일을 모르면 마감 이야기를 지어내지 않는다.
  assert.doesNotMatch(step.why, /마감/);
  assert.match(nextAfterDownload({ ...SUBMITTED, deadline: '2026-09-30' }).why, /마감은 2026-09-30/);
});

test('앱은 받은 뒤에 다음 단계를 실제로 그리고 그 자리로 데려간다', () => {
  assert.match(app, /import \{ nextAfterDownload \} from '\.\/after-download\.js'/);
  assert.match(app, /function noteDownload\(/);
  // 만들지 못한 출력에는 다음 단계를 권하지 않는다.
  assert.match(app, /noteDownload\('제출본', kind === 'docx' \? 'DOCX' : 'PDF'\)\)\.catch\(showError\)/);
  // 화면: 기존 다음 단계 줄과 같은 방식으로 그리고 같은 처리기가 이동을 맡는다.
  assert.match(app, /function afterDownloadView\(\)/);
  assert.match(app, /id="after-download"[\s\S]{0,400}data-next-step="\$\{step\.go\}"/);
  assert.match(app, /dismiss-download-step/);
});
