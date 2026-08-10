import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appendProposalVersion, findVersionById, normalizeProposalVersions, resolveSavedVersion } from '../src/coaching-handoff.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const V1_SECTIONS = [
  { id: 'necessity', title: '1. 사업 필요성', content: '지역 학대피해아동 가정의 돌봄 공백이 확인된다.', status: '확정', citations: [] },
  { id: 'budget', title: '8. 예산', content: '총사업비 129,500,000원.', status: '확정', citations: [] }
];
const V1_TABLES = [{ id: 't1', kind: '예산표', title: '예산 산출 내역', columns: ['항목', '금액'], rows: [['인건비', '41,000,000']], note: '' }];
const V2_SECTIONS = V1_SECTIONS.map((section, index) => (index === 1 ? { ...section, content: '총사업비 129,500,000원. 산출근거: 지역관리자 1명×12개월.' } : section));
const V2_TABLES = [{ ...V1_TABLES[0], rows: [['인건비', '41,000,000'], ['관리운영비', '5,000,000']] }];

test('버전은 본문과 표를 함께 저장하고 고유 식별자를 가진다', () => {
  let versions = appendProposalVersion([], { sections: V1_SECTIONS, tables: V1_TABLES, label: 'V1 완성본', savedAt: '2026-08-10T01:00:00.000Z' });
  versions = appendProposalVersion(versions, { sections: V2_SECTIONS, tables: V2_TABLES, label: '정밀 검증 1차 부분 수정', source: '정밀 검증', reason: '1개 항목 수정', savedAt: '2026-08-10T02:00:00.000Z' });
  assert.equal(versions.length, 2);
  assert.equal(versions[0].tables.length, 1);
  assert.equal(versions[1].tables[0].rows.length, 2);
  assert.notEqual(versions[0].versionId, versions[1].versionId);
  assert.match(versions[0].versionId, /^v1-/);
  assert.equal(versions[1].reason, '1개 항목 수정');
  // 저장 시점의 근거·판정을 버전에 붙인다.
  const withContext = appendProposalVersion([], {
    sections: V1_SECTIONS, label: 'V1', savedAt: '2026-08-10T03:00:00.000Z',
    context: { designApproval: { approvedAt: '2026-08-10T00:00:00.000Z', approvedBy: '운영자' }, preciseReview: { round: 2, summary: { blocking: 0 }, fingerprint: 'abc-123' }, gateStatus: '보완 필요' }
  });
  assert.equal(withContext[0].context.preciseReview.fingerprint, 'abc-123');
  assert.equal(withContext[0].context.gateStatus, '보완 필요');
  // 저장된 본문은 원본과 끊어져 있다(나중에 화면에서 고쳐도 버전이 바뀌지 않는다).
  V1_SECTIONS[0].content = '바깥에서 바꿈';
  assert.equal(versions[0].sections[0].content, '지역 학대피해아동 가정의 돌봄 공백이 확인된다.');
  V1_SECTIONS[0].content = '지역 학대피해아동 가정의 돌봄 공백이 확인된다.';
});

test('재실행 뒤에도 저장된 버전이 바이트 단위로 같다', () => {
  let versions = appendProposalVersion([], { sections: V1_SECTIONS, tables: V1_TABLES, label: 'V1 완성본', savedAt: '2026-08-10T01:00:00.000Z' });
  versions = appendProposalVersion(versions, { sections: V2_SECTIONS, tables: V2_TABLES, label: 'V2 부분 수정', savedAt: '2026-08-10T02:00:00.000Z' });
  // 저장 → 직렬화 → 새로고침(역직렬화) → 정규화
  const restored = normalizeProposalVersions(JSON.parse(JSON.stringify(versions)));
  assert.equal(JSON.stringify(restored), JSON.stringify(versions), '저장 전후가 완전히 같다');
  const v2 = findVersionById(restored, versions[1].versionId);
  assert.equal(JSON.stringify(v2.sections), JSON.stringify(V2_SECTIONS));
  assert.equal(JSON.stringify(v2.tables), JSON.stringify(V2_TABLES));
  // V1과 V2가 섞이지 않는다.
  const v1 = findVersionById(restored, versions[0].versionId);
  assert.notEqual(JSON.stringify(v1.sections), JSON.stringify(v2.sections));
  assert.equal(v1.tables[0].rows.length, 1);
  assert.equal(v2.tables[0].rows.length, 2);
});

test('저장되지 않았거나 식별자가 잘못되면 출력하지 않는다', () => {
  const versions = appendProposalVersion([], { sections: V1_SECTIONS, tables: V1_TABLES, label: 'V1', savedAt: '2026-08-10T01:00:00.000Z' });
  assert.equal(resolveSavedVersion(versions, versions[0].versionId).version.version, 1);
  // 저장된 버전이 없을 때
  assert.match(resolveSavedVersion([], 'v1-x').reason, /저장된 계획서 버전이 없습니다/);
  // 어느 버전인지 정해지지 않았을 때 — 조용히 V1로 대체하지 않는다.
  const noPick = resolveSavedVersion(versions, '');
  assert.equal(noPick.version, null);
  assert.match(noPick.reason, /어느 버전을 쓸지 정해지지 않았습니다/);
  // 없는 식별자일 때 — 조용히 V1로 대체하지 않는다.
  const wrong = resolveSavedVersion(versions, 'v9-없는버전');
  assert.equal(wrong.version, null);
  assert.match(wrong.reason, /저장된 버전을 찾지 못했습니다/);
  // 본문이 빈 버전도 출력하지 않는다.
  const empty = appendProposalVersion([], { sections: [], label: '빈 버전', savedAt: '2026-08-10T01:00:00.000Z' });
  assert.match(resolveSavedVersion(empty, empty[0].versionId).reason, /저장된 본문이 없습니다/);
});

test('예전에 저장한 버전도 값을 잃지 않고 열린다', () => {
  // 식별자·표·context가 없던 시절의 기록
  const legacy = [
    { version: 1, label: '최초 작성', source: '계획서 쓰기', savedAt: '2026-05-01T00:00:00.000Z', verdict: '', originalText: '', sections: V1_SECTIONS },
    { version: 2, label: '수정본 v2', savedAt: '', sections: V2_SECTIONS }
  ];
  const restored = normalizeProposalVersions(legacy);
  assert.equal(restored.length, 2);
  assert.ok(restored[0].versionId && restored[1].versionId);
  assert.notEqual(restored[0].versionId, restored[1].versionId);
  assert.deepEqual(restored[0].tables, [], '표가 없던 기록은 빈 배열로 채운다');
  assert.equal(restored[0].context, null);
  // 본문은 그대로 남는다.
  assert.equal(JSON.stringify(restored[0].sections), JSON.stringify(V1_SECTIONS));
  assert.equal(resolveSavedVersion(restored, restored[1].versionId).version.label, '수정본 v2');
});

test('앱은 저장한 버전을 명시하고 그 버전만 출력한다', () => {
  // 저장은 한 곳에서만 하고 저장 직후 현재 버전을 기록한다.
  assert.match(app, /function recordProposalVersion\(patch = \{\}, \{ reset = false \} = \{\}\)/);
  assert.match(app, /tables: state\.proposalTables \|\| \[\], context: versionContext\(\), \.\.\.rest/);
  assert.match(app, /state\.currentVersionId = state\.proposalVersions\[state\.proposalVersions\.length - 1\]\.versionId;/);
  assert.equal((app.match(/= appendProposalVersion\(/g) || []).length, 1, '버전 저장 경로는 하나뿐이다');
  // 승인 설계안·정밀검증 지문·게이트 판정을 버전에 붙인다.
  assert.match(app, /function versionContext\(\)/);
  assert.match(app, /designApproval: design\.approvedAt \?/);
  assert.match(app, /preciseReview: review\?\.summary \? \{ round: review\.round, summary: review\.summary, fingerprint: review\.fingerprint \|\| ''/);
  assert.match(app, /gateStatus: currentSubmissionGate\(\)\?\.status \|\| ''/);
  // 출력은 화면 작업본이 아니라 저장된 버전을 쓴다.
  assert.match(app, /const \{ version, reason \} = selectedSavedVersion\(\);\s*\n\s*if \(!version\) return setState\(\{ error: reason \}\);/);
  assert.match(app, /if \(unsavedChanges\(\)\) return setState\(\{ error: `화면 내용이 저장된 V\$\{version\.version\}과 달라 출력하지 않았습니다/);
  assert.match(app, /exportDocx\(state\.project, version\.sections, options\)/);
  assert.match(app, /tables: version\.tables \|\| \[\]/);
  // 버전을 골라 열 수 있고, 열면 화면 작업본도 그 버전으로 맞춘다.
  assert.match(app, /function selectProposalVersion\(versionId\)/);
  assert.match(app, /sections: structuredClone\(found\.sections\), proposalTables: structuredClone\(found\.tables \|\| \[\]\)/);
  assert.match(app, /data-open-version=/);
  // 예전 저장분은 정규화해서 열고, 현재 버전이 없으면 가장 최근 버전으로 시작한다.
  assert.match(app, /restored\.proposalVersions = normalizeProposalVersions\(saved\.proposalVersions\);/);
  assert.match(app, /if \(!restored\.currentVersionId && restored\.proposalVersions\.length\) restored\.currentVersionId = restored\.proposalVersions\[restored\.proposalVersions\.length - 1\]\.versionId;/);
  // 보관 스냅샷에도 현재 버전 식별자를 함께 담는다(새 저장소를 만들지 않는다).
  assert.match(app, /'submissionIncluded', 'currentVersionId'\]/);
  assert.doesNotMatch(app, /action: 'saveVersion'/);
});

test('버전 저장·복원·출력에 AI 호출이 없다', () => {
  const engine = fs.readFileSync(new URL('../src/coaching-handoff.js', import.meta.url), 'utf8');
  for (const source of [engine]) {
    assert.doesNotMatch(source, /fetch\(|WithAI\(/);
  }
  // 출력 경로에도 AI 호출이 없다.
  const exportFn = app.slice(app.indexOf('function exportFinalPackage(kind)'), app.indexOf('function toggleAttachment'));
  assert.doesNotMatch(exportFn, /WithAI\(|fetch\(/);
  const selectFn = app.slice(app.indexOf('function selectProposalVersion(versionId)'), app.indexOf('// 화면 작업본이 저장된 버전과 다르면'));
  assert.doesNotMatch(selectFn, /WithAI\(|fetch\(/);
});
