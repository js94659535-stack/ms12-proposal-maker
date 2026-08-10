import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PACKAGE_STATES, buildSubmissionPackage, reviewFreshness, sectionsFingerprint } from '../src/submission-package.js';
import { buildFormSpec } from '../src/form-spec.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const SECTIONS = [
  { id: 'necessity', title: '1. 사업 필요성', content: '지역 학대피해아동 가정의 돌봄 공백이 확인된다.' },
  { id: 'budget', title: '8. 예산', content: '총사업비 139,500,000원.' }
];
const TABLES = [{ title: '예산 산출 내역', kind: '예산표', rows: [['인건비', '4명×12개월', '41,000,000']] }];
const FORM_SPEC = {
  openPoints: [],
  attachments: [
    { name: '신청기관현황', required: true, location: '공고문 · 세부 공고문' },
    { name: '사업계획서 1부', required: true, location: '공고문 · 세부 공고문' },
    { name: '최근 2년 실적표', required: false, location: '공고문 · 세부 공고문' }
  ]
};
const GATE_OK = { status: '보완 필요', blocking: [], required: [], results: [], counts: {} };
const GATE_BLOCKED = { status: '제출 차단', blocking: [{ title: '사업기간' }, { title: '신청유형 택1' }], required: [], results: [] };
const ALL_INCLUDED = ['신청기관현황', '사업계획서 1부'];
const base = extra => buildSubmissionPackage({
  sections: SECTIONS, tables: TABLES, versions: [{ version: 1, label: 'V1 완성본' }, { version: 2, label: '정밀 검증 1차 부분 수정' }],
  proposalFlow: { approvedVersion: 2, approvedAt: '2026-08-10T00:00:00.000Z' },
  gate: GATE_OK, formSpec: FORM_SPEC, included: ALL_INCLUDED, ...extra
});

test('판정은 세 가지로만 나오고 지금 버전을 기준으로 한다', () => {
  assert.deepEqual(PACKAGE_STATES, ['제출 가능', '보완 필요', '제출 차단']);
  const summary = base({});
  assert.equal(summary.status, '제출 가능');
  assert.equal(summary.canExport, true);
  assert.equal(summary.timeline.version, 2);
  assert.equal(summary.timeline.versionLabel, '정밀 검증 1차 부분 수정');
  assert.equal(summary.timeline.approvedVersion, 2);
  assert.equal(summary.timeline.gateStatus, '보완 필요');
  // 구성표: 문서 2개 + 필수 표 + 첨부 + 확인 목록
  assert.deepEqual(summary.documents.map(item => item.kind), ['DOCX', 'PDF']);
  assert.ok(summary.documents.every(item => item.ready));
  assert.equal(summary.tables[0].rows, 1);
  assert.equal(summary.attachments.length, 3);
});

test('코드 제출 게이트에 BLOCKING이 있으면 출력을 막는다', () => {
  const summary = base({ gate: GATE_BLOCKED });
  assert.equal(summary.status, '제출 차단');
  assert.equal(summary.canExport, false);
  const reason = summary.blockers.find(item => item.reason === '공고 강제조건 위반');
  assert.ok(reason, '차단 사유 없음');
  assert.match(reason.detail, /2건/);
  assert.match(reason.detail, /사업기간/);
});

test('정밀형은 최신 정밀검증까지 통과해야 출력할 수 있다', () => {
  const fingerprint = sectionsFingerprint(SECTIONS);
  // 검증을 아직 하지 않았으면 차단
  assert.ok(base({ mode: '정밀형' }).blockers.some(item => item.reason === '정밀검증 미실행'));
  // 지적이 남아 있으면 차단
  const withBlocking = base({ mode: '정밀형', preciseReview: { round: 1, fingerprint, summary: { blocking: 2, total: 4 }, at: '2026-08-10T06:00:00.000Z' } });
  assert.equal(withBlocking.status, '제출 차단');
  assert.ok(withBlocking.blockers.some(item => item.reason === '정밀검증 지적 미해결'));
  // 지적이 없으면 통과
  const clean = base({ mode: '정밀형', preciseReview: { round: 2, fingerprint, summary: { blocking: 0, total: 0 }, at: '2026-08-10T06:30:00.000Z' } });
  assert.equal(clean.status, '제출 가능');
  assert.equal(clean.review.freshness, '유효');
  // 표준형은 정밀검증 없이도 게이트만 통과하면 된다.
  assert.equal(base({ mode: '표준형' }).status, '제출 가능');
});

test('본문이 바뀌면 이전 정밀검증 PASS를 다시 쓰지 못한다', () => {
  const fingerprint = sectionsFingerprint(SECTIONS);
  const passed = { round: 1, fingerprint, summary: { blocking: 0, total: 0 }, at: '2026-08-10T06:00:00.000Z' };
  assert.equal(reviewFreshness(passed, SECTIONS), '유효');
  // 한 글자만 바뀌어도 만료된다.
  const edited = SECTIONS.map((section, index) => (index === 0 ? { ...section, content: `${section.content} 한 문장 추가.` } : section));
  assert.equal(reviewFreshness(passed, edited), '만료');
  const summary = buildSubmissionPackage({ mode: '정밀형', sections: edited, gate: GATE_OK, formSpec: FORM_SPEC, included: ALL_INCLUDED, preciseReview: passed });
  assert.equal(summary.status, '제출 차단');
  assert.ok(summary.blockers.some(item => item.reason === '정밀검증 만료'));
  // 지문이 없는 옛 기록도 다시 쓰지 않는다.
  assert.equal(reviewFreshness({ summary: { blocking: 0 } }, SECTIONS), '만료');
  assert.equal(reviewFreshness(null, SECTIONS), '없음');
});

test('필수 첨부서류가 빠지면 출력을 막고 선택 첨부는 막지 않는다', () => {
  const missing = base({ included: ['신청기관현황'] });
  assert.equal(missing.status, '제출 차단');
  const reason = missing.blockers.find(item => item.reason === '필수 첨부서류 누락');
  assert.match(reason.detail, /사업계획서 1부/);
  assert.equal(missing.attachments.find(item => item.name === '사업계획서 1부').included, false);
  // 선택 첨부를 빼도 막지 않는다.
  assert.equal(base({ included: ALL_INCLUDED }).status, '제출 가능');
  // 서식을 읽지 못했으면 막지 않되 확인하라고 알린다.
  const noForm = base({ formSpec: null, included: [] });
  assert.ok(noForm.warnings.some(item => item.reason === '첨부서류 목록 없음'));
  assert.ok(!noForm.blockers.some(item => item.reason === '필수 첨부서류 누락'));
});

test('서식 openPoints와 기관 확인 필요 사항이 최종 확인 목록에 남는다', () => {
  const summary = base({
    formSpec: { ...FORM_SPEC, openPoints: ['서식에서 항목별 분량 제한을 찾지 못했습니다.'] },
    applicant: { items: [{ label: '자부담 가능 금액', value: '미정', status: '확인 필요' }, { label: '기관 유형', value: '지역아동센터', status: '확인됨' }] },
    gate: { ...GATE_OK, results: [{ state: '미확정', title: '신청자격 충족', detail: '사람이 확인해야 합니다.' }] }
  });
  assert.equal(summary.status, '보완 필요');
  const areas = summary.checklist.map(item => item.area);
  assert.ok(areas.includes('신청서 서식'));
  assert.ok(areas.includes('신청기관 정보'));
  assert.ok(areas.includes('공고 기준'));
  // 확인된 기관 정보는 확인 목록에 올리지 않는다.
  assert.ok(!summary.checklist.some(item => item.item.includes('지역아동센터')));
  // 확인 목록이 있어도 강제조건을 지켰으면 출력은 막지 않는다.
  assert.equal(summary.canExport, true);
});

test('미확정 표시·빈 항목·시스템 값이 남으면 제출본으로 내보내지 않는다', () => {
  const withMark = base({ sections: [SECTIONS[0], { id: 'budget', title: '8. 예산', content: '총사업비 129,500,000원. 세부 산출근거 [확인 필요]' }] });
  assert.equal(withMark.status, '제출 차단');
  const reason = withMark.blockers.find(item => item.reason === '확인 필요 표시 남음');
  assert.match(reason.detail, /1곳/);
  assert.match(reason.detail, /8\. 예산/);

  assert.ok(base({ sections: [SECTIONS[0], { id: 'budget', title: '8. 예산', content: '   ' }] }).blockers.some(item => item.reason === '빈 항목'));
  assert.ok(base({ sections: [SECTIONS[0], { id: 'budget', title: '8. 예산', content: '총사업비 undefined원' }] }).blockers.some(item => item.reason === '시스템 값 노출'));
  // 깨끗한 본문은 막지 않는다.
  assert.equal(base({}).canExport, true);
});

test('서식 분량 초과는 알리되 그것만으로 막지는 않는다', () => {
  const outline = [{ key: 'necessity', title: '사업 필요성', formItem: '사업 필요성', limitChars: 10 }, { key: 'budget', title: '예산', limitChars: 0 }];
  const summary = base({ outline });
  assert.equal(summary.overLength.length, 1);
  assert.equal(summary.overLength[0].limit, 10);
  assert.ok(summary.overLength[0].chars > 10);
  assert.ok(summary.warnings.some(item => item.reason === '서식 분량 초과'));
  assert.equal(summary.canExport, true, '분량 초과만으로 막지 않는다');
  // 제한이 없으면 초과 판정을 만들지 않는다.
  assert.deepEqual(base({ outline: [{ key: 'necessity', title: '사업 필요성', limitChars: 0, limitPages: 0 }] }).overLength, []);
});

test('공고문을 붙여넣기만 해도 제출서류 목록을 읽어 필수 첨부를 잡는다', () => {
  // 목록을 못 읽으면 필수 첨부 누락을 놓친 채 제출 가능으로 보인다.
  assert.match(app, /공고문을 자료로 올리지 않고 붙여넣기만 했어도 제출서류 목록을 읽는다/);
  assert.match(app, /const pasted = state\.sourceText\.trim\(\)\.length >= 200 && !state\.manualSources\.some\(item => item\.sourceType === '세부 공고문'/);
  assert.match(app, /const spec = buildFormSpec\(\[\.\.\.state\.manualSources, \.\.\.pasted\]\);/);
  // 실제 공고문에서 필수 8건을 읽고, 하나라도 준비 전이면 차단한다.
  const notice = fs.readFileSync(new URL('./fixtures/notice-chest-2027-gold.txt', import.meta.url), 'utf8');
  const spec = buildFormSpec([{ id: 'pasted-notice', fileName: '공고문', sourceType: '세부 공고문', extractionStatus: 'success', extractedText: notice }]);
  assert.equal(spec.attachments.length, 8);
  assert.equal(spec.attachments.filter(item => item.required).length, 8);
  const blocked = buildSubmissionPackage({ sections: SECTIONS, gate: GATE_OK, formSpec: spec, included: [] });
  assert.equal(blocked.status, '제출 차단');
  assert.ok(blocked.blockers.some(item => item.reason === '필수 첨부서류 누락'));
  const ready = buildSubmissionPackage({ sections: SECTIONS, gate: GATE_OK, formSpec: spec, included: spec.attachments.map(item => item.name) });
  assert.equal(ready.canExport, true);
});

test('출력은 판정을 통과할 때만 나가고 기존 DOCX·PDF 경로를 그대로 쓴다', () => {
  assert.match(app, /function currentSubmissionPackage\(\)/);
  assert.match(app, /function submissionPackageView\(\)/);
  assert.match(app, /function exportFinalPackage\(kind\)/);
  assert.match(app, /if \(!summary\?\.canExport\) \{[\s\S]{0,300}return setState\(\{ error:/);
  // 제출본은 본문과 표를 함께, 내부 검토 표시 없이 내보낸다.
  assert.match(app, /const options = \{ forSubmission: true, tables: version\.tables \|\| \[\], applicantName, version: version\.version \};/);
  assert.match(app, /\? exportDocx\(state\.project, version\.sections, options\)/);
  // 판정을 통과해도 저장된 버전이 없거나 화면 내용이 다르면 버튼을 열지 않는다.
  assert.match(app, /id="package-docx" \$\{summary\.canExport && !exportBlock \? '' : 'disabled'\}/);
  assert.match(app, /id="package-pdf" \$\{summary\.canExport && !exportBlock \? '' : 'disabled'\}/);
  // 기존 개별 출력 버튼은 그대로 둔다.
  assert.match(app, /document\.querySelector\('#docx'\)\?\.addEventListener\('click', \(\) => exportDocx\(state\.project, state\.sections\)\.catch\(showError\)\);/);
  // 검증 결과에 어느 본문을 봤는지 지문을 남긴다.
  assert.match(app, /fingerprint: sectionsFingerprint\(state\.sections\)/);
  // 첨부 체크는 의뢰 건에 저장되고 보관 스냅샷에 함께 남는다.
  assert.match(app, /function toggleAttachment\(name\)/);
  assert.match(app, /'preciseReview', 'submissionIncluded', 'currentVersionId'\]/);
  assert.doesNotMatch(app, /action: 'saveSubmissionPackage'/);
});
