import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applySafeCandidates, applyUpdateCandidate, buildUpdateCandidates, extractApplicantCandidates } from '../src/applicant-extract.js';
import { CONFIRMED_STATUS, areaItems, itemsBySource, normalizeApplicant, upsertApplicant } from '../src/applicants.js';
import { proposalTextFromSnapshot } from '../src/coaching-handoff.js';
import { listApplicants, saveApplicant } from '../functions/api/archive.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
const PAST_SECTIONS = [
  { id: 'necessity', title: '1. 사업 필요성', content: '작성일: 2024-02-10\n기관명: QA 신청기관 A\nQA 지역 청소년의 학습 결손이 확인된다.', status: '확정', citations: [] },
  { id: 'roles', title: '7. 운영 인력 및 역할', content: '상근 인력 4명이 사업을 전담하고 청소년상담사 2급 2명이 프로그램을 운영한다.\n담당자 홍길동 010-1234-5678 (hong@example.com)', status: '확정', citations: [] },
  { id: 'programs', title: '5. 세부 프로그램', content: '프로그램은 주 1회 총 20회기로 운영한다. 상담실 3실을 활용한다.\nQA 협력학교와 업무협약을 체결했다.', status: '확정', citations: [] },
  { id: 'budget', title: '8. 예산 계획', content: '총사업비는 25,000,000원이며 자부담 2,000,000원을 편성했다.', status: '확정', citations: [] },
  { id: 'indicators', title: '9. 성과지표 및 평가', content: '사전·사후 검사와 만족도 조사로 측정한다. 출석률 88%를 달성했다.', status: '확정', citations: [] },
  { id: 'outcomes', title: '10. 기대효과', content: '2024년 지역아동 학습지원 사업\n2023년 청소년 진로탐색 사업', status: '확정', citations: [] }
];

function archivedProposal() {
  return { id: 'archived-1', title: 'QA 2024 학습지원 사업계획서', stage: 'complete', snapshot: { sections: PAST_SECTIONS } };
}

function applicantA() {
  return normalizeApplicant({
    id: 'applicant-a', name: 'QA 신청기관 A',
    items: [
      { id: 'a-basic', area: 'basic', label: '기관명', value: 'QA 신청기관 A', status: CONFIRMED_STATUS, source: 'QA 등기부등본', asOf: '2026' },
      { id: 'a-staff', area: 'staff', label: '상근 인력', value: '6명', status: CONFIRMED_STATUS, source: 'QA 2026 인사기록', asOf: '2026' },
      { id: 'a-performance', area: 'performance', label: '2023년 사업실적', value: '청소년 진로탐색 사업', status: CONFIRMED_STATUS, source: 'QA 2023 결과보고서', asOf: '2023' }
    ]
  });
}

function harvest(base) {
  const text = proposalTextFromSnapshot(archivedProposal().snapshot);
  return buildUpdateCandidates(base, extractApplicantCandidates(text, { documentName: 'QA 2024 학습지원 사업계획서', includeNarrative: true, sourceLabel: '자료보관함 계획서' }));
}
function pick(review, label) { return review.candidates.find(candidate => candidate.label === label); }

function applicantDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        values: [], bind(...values) { this.values = values; return this; },
        async first() { return sql.includes('SELECT created_at') ? rows.get(`${this.values[1]}:${this.values[0]}`) || null : null; },
        async all() { return { results: [...rows.values()].filter(row => row.owner_hash === this.values[0]) }; },
        async run() {
          const [id, ownerHash, name, note, confirmedCount, unverifiedCount, applicantJson, createdAt, updatedAt] = this.values;
          rows.set(`${ownerHash}:${id}`, { id, owner_hash: ownerHash, name, note, confirmed_count: confirmedCount, unverified_count: unverifiedCount, applicant_json: applicantJson, created_at: createdAt, updated_at: updatedAt });
          return { success: true };
        }
      };
    }
  };
}

test('보관된 과거 계획서 한 건에서 영역별 기관 정보 후보를 만든다', () => {
  const text = proposalTextFromSnapshot(archivedProposal().snapshot);
  assert.ok(text.includes('상근 인력 4명'));
  assert.equal(proposalTextFromSnapshot({ coaching: { text: 'QA 코칭 본문' } }), 'QA 코칭 본문');
  assert.equal(proposalTextFromSnapshot({}), '');

  const review = harvest(applicantA());
  const byArea = review.candidates.reduce((areas, candidate) => ({ ...areas, [candidate.area]: [...(areas[candidate.area] || []), candidate.label] }), {});
  for (const area of ['basic', 'staff', 'programs', 'facilities', 'partners', 'budget', 'measurement', 'performance']) {
    assert.ok(byArea[area]?.length, `${area} 후보가 없습니다`);
  }
  // 연도·기준시점·문서명·근거문장을 함께 남긴다.
  const performance = pick(review, '2024년 사업실적');
  assert.equal(performance.asOf, '2024');
  assert.match(performance.source, /QA 2024 학습지원 사업계획서\(자료보관함 계획서\)에서 추출/);
  assert.ok(performance.excerpt.includes('2024년 지역아동 학습지원 사업'));
  assert.equal(pick(review, '총사업비').asOf, '2024-02');
  assert.equal(review.documentAsOf, '2024-02');

  // 개인정보는 수집하지 않는다.
  const serialized = JSON.stringify(review);
  for (const personal of ['010-1234-5678', 'hong@example.com', '홍길동']) assert.equal(serialized.includes(personal), false);
});

test('과거 값이 현재값을 덮어쓰지 않고 중복 없이 근거만 늘어난다', () => {
  const base = applicantA();
  const review = harvest(base);

  // 2026년 확인값과 다른 2024년 인력 수는 확인 대상으로만 남는다.
  const staff = pick(review, '상근 인력');
  assert.equal(staff.kind, '이전 시점 정보');
  const afterStaff = applyUpdateCandidate(base, staff).items.find(item => item.id === 'a-staff');
  assert.equal(afterStaff.value, '6명');
  assert.equal(afterStaff.status, CONFIRMED_STATUS);
  assert.deepEqual(afterStaff.history.map(entry => entry.value), ['4명']);

  // 이미 있는 2023년 실적은 새로 만들지 않고 근거만 추가한다.
  assert.equal(pick(review, '2023년 사업실적').kind, '동일');
  const afterSame = applyUpdateCandidate(base, pick(review, '2023년 사업실적'));
  assert.equal(afterSame.items.filter(item => item.label === '2023년 사업실적').length, 1);
  assert.match(afterSame.items.find(item => item.id === 'a-performance').source, /QA 2023 결과보고서 \/ QA 2024 학습지원 사업계획서/);

  // 새 연도 실적은 누적된다.
  const { applicant: updated, applied } = applySafeCandidates(base, review.candidates);
  assert.ok(applied >= 2);
  assert.deepEqual(areaItems(updated, 'performance').filter(item => item.label.endsWith('사업실적')).map(item => item.label), ['2024년 사업실적', '2023년 사업실적']);
  assert.equal(updated.items.find(item => item.id === 'a-staff').value, '6명');

  // 같은 계획서를 다시 반영해도 중복 항목이 생기지 않는다.
  const second = applySafeCandidates(updated, harvest(updated).candidates).applicant;
  assert.equal(second.items.filter(item => item.label === '2024년 사업실적').length, 1);
  assert.equal(second.items.length, updated.items.length);
});

test('반영 결과는 선택한 기관에만 저장되고 다시 조회해도 남는다', async () => {
  const db = applicantDb();
  const base = applicantA();
  const other = normalizeApplicant({ id: 'applicant-b', name: 'QA 신청기관 B', items: [{ id: 'b-1', area: 'basic', label: '기관명', value: 'QA 신청기관 B', status: CONFIRMED_STATUS, source: 'QA B 등기부등본' }] });
  const updated = applySafeCandidates(base, harvest(base).candidates).applicant;

  let applicants = upsertApplicant([other], updated);
  for (const applicant of applicants) await saveApplicant(db, 'owner-1', applicant);
  await saveApplicant(db, 'owner-2', normalizeApplicant({ id: 'applicant-c', name: '다른 사용자 기관' }));

  const restored = await listApplicants(db, 'owner-1');
  const restoredA = restored.find(item => item.id === 'applicant-a');
  const restoredB = restored.find(item => item.id === 'applicant-b');
  assert.equal(restored.length, 2);
  assert.ok(restoredA.items.some(item => item.label === '2024년 사업실적' && item.status === '확인 필요'));
  assert.ok(restoredA.items.find(item => item.id === 'a-staff').history.length >= 0);
  assert.match(restoredA.items.find(item => item.label === '2024년 사업실적').source, /자료보관함 계획서/);
  assert.equal(restoredA.items.find(item => item.label === '2024년 사업실적').asOf, '2024');
  // 다른 기관·다른 사용자 자료와 섞이지 않는다.
  assert.equal(restoredB.items.length, 1);
  assert.equal(JSON.stringify(restoredB).includes('2024년 사업실적'), false);
  assert.equal((await listApplicants(db, 'owner-2')).length, 1);
});

test('신청기관 화면에서 출처·연도·상태를 확인할 수 있다', () => {
  const updated = applySafeCandidates(applicantA(), harvest(applicantA()).candidates).applicant;
  const groups = itemsBySource(updated);
  assert.ok(groups.some(group => /QA 2024 학습지원 사업계획서/.test(group.source)));
  assert.ok(groups.every(group => group.items.length && group.confirmed + group.outdated === group.items.length));
  // 사업실적은 연도가 늦은 것부터 본다.
  const years = areaItems(updated, 'performance').map(item => Number(`${item.asOf} ${item.label}`.match(/(19|20)\d{2}/)[0]));
  assert.deepEqual(years, [...years].sort((left, right) => right - left));
  assert.equal(years.at(-1), 2023);

  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /id="load-applicant-archive"/);
  assert.match(appSource, /data-applicant-archive/);
  assert.match(appSource, /function harvestApplicantFromArchive\(id\)/);
  assert.match(appSource, /function applicantSourceView\(applicant\)/);
  assert.match(appSource, /const items = areaItems\(applicant, area\.key\);/);
});
