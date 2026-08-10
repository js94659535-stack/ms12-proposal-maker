import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEMAND_AREAS, EVIDENCE_BASIS, approvedDemandEvidence, buildDemandEvidence } from '../src/demand-evidence.js';
import { analyzeNoticeStructure } from '../src/notice-logic.js';
import { makeApplicantItem, normalizeApplicant } from '../src/applicants.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
// GOLD — CASE 1의 실제 공고 원문으로 수요근거표를 만든다.
const NOTICE = fs.readFileSync(new URL('./fixtures/notice-chest-2027-gold.txt', import.meta.url), 'utf8');
const STRUCTURE = analyzeNoticeStructure({ title: '2027년 복권기금 취약계층 아동·청소년 가족기능강화사업', overview: NOTICE });
const APPLICANT = normalizeApplicant({
  id: 'org-1', name: '한들가족지원센터',
  items: [
    makeApplicantItem({ area: 'staff', label: '홈케어플래너 운영 경험', value: '가정방문 사례관리 인력 4명 보유', status: '확인됨', origin: '기관 확인' }),
    makeApplicantItem({ area: 'partners', label: '협력 실적', value: '전문심리치료기관 2곳과 연계 협약', status: '확인됨', origin: '파일 추출' }),
    makeApplicantItem({ area: 'basic', label: '지역 아동 수요', value: '한들구 학대피해아동 120명 추정', status: '확인 필요', origin: '고객 입력' })
  ]
});

test('근거는 네 가지 출처로만 구분하고 공고 유형에 맞는 항목을 쓴다', () => {
  assert.deepEqual(EVIDENCE_BASIS, ['공고 근거', '기관 확인 사실', '업로드 자료', '확인 필요']);
  const common = buildDemandEvidence({ structure: STRUCTURE, applicant: APPLICANT, projectType: 'chest' });
  assert.deepEqual(common.rows.map(row => row.key), ['policy', 'region', 'target', 'service', 'capacity']);
  // 교육 공고는 학습 여건이, 일반·조달 공고는 시장 여건이 추가된다.
  assert.ok(buildDemandEvidence({ structure: STRUCTURE, projectType: 'edu' }).rows.some(row => row.key === 'learning'));
  assert.ok(buildDemandEvidence({ structure: STRUCTURE, projectType: 'general' }).rows.some(row => row.key === 'market'));
  assert.ok(!common.rows.some(row => row.key === 'learning'), '복지 공고에 교육 항목을 넣지 않는다');
  assert.ok(DEMAND_AREAS.every(area => area.types.length));
});

test('실제 CASE 1 자료로 수요근거표를 만들고 모든 확정 근거에 출처가 있다', () => {
  const demand = buildDemandEvidence({ structure: STRUCTURE, applicant: APPLICANT, projectType: 'chest' });
  assert.ok(demand.confirmed.length >= 3, `확정 ${demand.confirmed.length}개`);
  for (const row of demand.confirmed) {
    assert.ok(row.items.length, `${row.title} 근거 없음`);
    for (const item of row.items) {
      assert.ok(item.text.length > 5 && item.location.length > 1, `${row.title} 출처 없음`);
      // 공고 근거는 실제 공고 원문에 있어야 한다.
      if (row.basis === '공고 근거') assert.ok(NOTICE.replace(/\s+/g, ' ').includes(item.text.slice(0, 25)), `공고에 없는 근거: ${item.text}`);
    }
  }
  // 대상자 수요는 공고 원문에서 확인된다.
  const target = demand.rows.find(row => row.key === 'target');
  assert.equal(target.basis, '공고 근거');
  assert.equal(target.status, '확정');
  // 기관 자원은 확인된 기관 사실에서 온다.
  const capacity = demand.rows.find(row => row.key === 'capacity');
  assert.ok(['공고 근거', '기관 확인 사실'].includes(capacity.basis));
});

test('확인되지 않은 기관정보와 출처 없는 수치는 사실로 쓰지 않는다', () => {
  const demand = buildDemandEvidence({ structure: null, applicant: APPLICANT, projectType: 'chest' });
  const dumped = JSON.stringify(demand);
  // 확인 필요 상태인 「학대피해아동 120명 추정」은 근거로 올라가지 않는다.
  assert.ok(!dumped.includes('120명'), '확인되지 않은 수치가 근거로 올라감');
  // 근거가 없으면 만들지 않고 확인 필요로 남기고 질문을 만든다.
  const empty = buildDemandEvidence({ projectType: 'chest' });
  assert.equal(empty.status, '확인 필요');
  assert.equal(empty.confirmed.length, 0);
  assert.equal(empty.open.length, empty.rows.length);
  assert.ok(empty.openPoints.every(point => point.includes('뒷받침할 근거가 없습니다')));
  assert.ok(empty.questions.every(question => question.includes('출처를 함께 알려 주세요')));
  assert.ok(empty.rows.every(row => row.items.length === 0 && row.basis === '확인 필요'));
});

test('업로드 자료는 읽기에 성공한 것만 근거로 쓰고 출처 파일을 남긴다', () => {
  const sources = [
    { id: 'u1', fileName: '한들구 아동실태조사.pdf', sourceType: '기타 안내자료', extractionStatus: 'success', extractedText: '한들구 지역 내 보호가 필요한 아동은 2025년 기준 84가구로 조사되었다.' },
    { id: 'u2', fileName: '읽지못한자료.hwp', sourceType: '기타 안내자료', extractionStatus: 'failed', extractedText: '' }
  ];
  const demand = buildDemandEvidence({ manualSources: sources, projectType: 'chest' });
  const region = demand.rows.find(row => row.key === 'region');
  assert.equal(region.basis, '업로드 자료');
  assert.equal(region.items[0].file, '한들구 아동실태조사.pdf');
  assert.match(region.items[0].location, /한들구 아동실태조사\.pdf · 기타 안내자료/);
  // 수치가 있는 문장은 표시해 두고 출처와 함께만 쓴다.
  assert.equal(region.items[0].hasFigure, true);
  assert.ok(!JSON.stringify(demand).includes('읽지못한자료'), '읽지 못한 파일을 근거로 쓰지 않는다');
});

test('승인된 근거만 설계안 payload에 들어가고 부족한 것은 질문으로 넘어간다', () => {
  const demand = buildDemandEvidence({ structure: STRUCTURE, applicant: APPLICANT, projectType: 'chest' });
  const payload = approvedDemandEvidence(demand);
  assert.equal(payload.evidence.length, demand.confirmed.length);
  assert.ok(payload.evidence.every(row => row.items.every(item => item.location)));
  // 확인 필요 항목은 근거가 아니라 질문으로만 간다.
  const names = payload.evidence.map(row => row.area);
  for (const row of demand.open) assert.ok(!names.includes(row.title), `확인 필요 항목이 근거로 감: ${row.title}`);
  assert.ok(payload.openQuestions.length <= 5);
  assert.equal(approvedDemandEvidence(null), null);
});

test('수요근거는 화면과 설계안 호출에 연결된다', () => {
  assert.match(app, /function currentDemandEvidence\(\)/);
  assert.match(app, /function demandEvidenceView\(\)/);
  assert.match(app, /demandEvidence: approvedDemandEvidence\(currentDemandEvidence\(\)\)/);
  assert.match(app, /근거 없이 지역 문제나 수요 수치를 만들지 않습니다/);
  // 새 저장소·새 관리화면을 만들지 않는다(기존 설계안 화면 안에 붙인다).
  assert.doesNotMatch(app, /action: 'saveDemandEvidence'/);
  assert.match(app, /\$\{formSpecView\(brief\)\}\s*\n\s*\$\{demandEvidenceView\(\)\}/);
});
