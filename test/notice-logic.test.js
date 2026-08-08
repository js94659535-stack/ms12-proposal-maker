import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NOTICE_FIELDS, analyzeNoticeStructure, buildSelectionLogic, extractEvaluationScores, noticeLogicSummary, noticeSources, selectionRequirements } from '../src/notice-logic.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
const FULL_NOTICE = {
  title: 'QA 2027년 청소년 학습회복 지원사업 공고',
  overview: `사업목적 : 지역 청소년의 기초학습 결손 문제를 해소한다.
신청자격 : 비영리법인 또는 사회복지시설로 최근 3년 이상 유사사업 수행기관에 한한다.
주요사업내용 : 학습코칭과 보호자 교육을 필수로 운영해야 한다.
제출 서류 : 사업계획서, 예산내역서, 법인등기부등본을 제출하여야 한다.
사업기간 : 2027.03.01 ~ 2027.12.31. 지원한도 : 1개소당 30,000,000원 이내, 자부담 10% 이상.
성과지표 : 참여 청소년 출석률과 사전·사후 검사 결과를 결과 보고에 포함한다.
우대사항 : 지역 학교와 협약을 맺은 기관을 우선 선정한다.
다음에 해당하면 심사에서 제외한다 : 최근 3년 내 보조금 부정수급 기관.`,
  criteriaText: '평가기준 : 사업 필요성 20점, 사업 내용의 구체성 30점, 수행 역량 25점, 예산 적정성 15점, 성과관리 10점',
  eligibility: '비영리법인 또는 사회복지시설',
  supportLimit: '1개소당 30,000,000원',
  applicationPeriod: '2027-01-05 09:00 ~ 2027-01-30 18:00',
  attachments: [{ name: 'QA 공고문.hwp' }]
};

// 첨부에만 기준이 있는 얇은 공고
const THIN_NOTICE = { title: 'QA 얇은 공고', overview: '자세한 내용은 첨부된 공고문을 참고 부탁드립니다.', attachments: [{ name: 'QA 요강.hwp' }] };

test('공고 항목을 원문 근거와 함께 구조화하고 없는 항목은 만들지 않는다', () => {
  const structure = analyzeNoticeStructure(FULL_NOTICE);
  assert.equal(structure.fields.length, NOTICE_FIELDS.length);
  const confirmed = structure.fields.filter(field => field.status === '공식 근거 확인');
  for (const key of ['purpose', 'eligibility', 'requiredContent', 'submissionItems', 'periodBudget', 'outcomes', 'selectionFactors', 'riskFactors', 'evaluation']) {
    assert.ok(confirmed.some(field => field.key === key), `${key} 근거 없음`);
  }
  // 모든 근거는 실제 공고 자료의 문장이어야 한다.
  const sources = noticeSources(FULL_NOTICE);
  for (const field of confirmed) {
    for (const item of field.evidence) {
      assert.ok(sources.some(source => source.label === item.source && source.text.includes(item.sentence.slice(0, 20))), `근거 불일치: ${item.sentence}`);
    }
  }

  const thin = analyzeNoticeStructure(THIN_NOTICE);
  const missing = thin.fields.filter(field => field.status !== '공식 근거 확인').map(field => field.key);
  for (const key of ['purpose', 'eligibility', 'evaluation', 'outcomes', 'riskFactors']) assert.ok(missing.includes(key), `${key}를 만들어냈습니다`);
  assert.deepEqual(thin.unreadAttachments, ['QA 요강.hwp']);
  assert.equal(thin.hasOfficialScoring, false);
});

test('평가표가 있으면 배점을 쓰고 없으면 점수를 만들지 않는다', () => {
  const scores = extractEvaluationScores(noticeSources(FULL_NOTICE));
  assert.deepEqual(scores.map(score => score.points), [20, 30, 25, 15, 10]);
  assert.ok(scores.every(score => score.source === '첨부한 요강·평가기준'));

  const withScores = buildSelectionLogic(analyzeNoticeStructure(FULL_NOTICE));
  assert.equal(withScores.scoring.mode, '공식 배점');
  assert.equal(withScores.scoring.items.length, 5);

  const withoutScores = buildSelectionLogic(analyzeNoticeStructure(THIN_NOTICE));
  assert.equal(withoutScores.scoring.mode, '배점 없음');
  assert.deepEqual(withoutScores.scoring.items, []);
  assert.match(withoutScores.scoring.note, /점수로 만들지 않습니다/);
});

test('선정 논리는 문제→방식→역량→증거→보여줄 내용 순서로 이어진다', () => {
  const logic = buildSelectionLogic(analyzeNoticeStructure(FULL_NOTICE));
  assert.deepEqual(logic.chain.map(item => item.step), ['공모기관이 해결하려는 문제', '원하는 사업 방식', '원하는 신청기관 역량', '심사에서 확인할 증거', '계획서가 반드시 보여줘야 할 내용']);
  assert.ok(logic.chain.every(item => item.basis === '공고 원문'));
  assert.deepEqual(logic.brokenLinks, []);

  // 근거가 없는 고리는 [확인 필요]로 남고 끊긴 고리로 보고된다.
  const thinLogic = buildSelectionLogic(analyzeNoticeStructure(THIN_NOTICE));
  assert.ok(thinLogic.brokenLinks.length >= 3);
  assert.ok(thinLogic.chain.filter(item => item.basis !== '공고 원문').every(item => /\[확인 필요/.test(item.content)));
});

test('선정 요건을 5~10개로 보여주고 근거 유무를 구분한다', () => {
  const structure = analyzeNoticeStructure(FULL_NOTICE);
  const requirements = selectionRequirements(structure);
  assert.ok(requirements.length >= 5 && requirements.length <= 10, `${requirements.length}개`);
  assert.equal(requirements[0].title.startsWith('공식 평가항목 대응'), true);
  assert.ok(requirements.every(item => ['공식 근거', '확인 필요'].includes(item.basis)));
  assert.ok(requirements.filter(item => item.basis === '공식 근거').every(item => item.evidence.length > 0));

  const thinRequirements = selectionRequirements(analyzeNoticeStructure(THIN_NOTICE));
  assert.ok(thinRequirements.length >= 5);
  assert.ok(thinRequirements.every(item => item.basis === '확인 필요'));
  assert.ok(thinRequirements.every(item => /확인 필요/.test(item.prove)));

  const summary = noticeLogicSummary(structure, buildSelectionLogic(structure), requirements);
  assert.equal(summary.scoringMode, '공식 배점');
  assert.ok(summary.officialRequirements > 0);
  assert.deepEqual(summary.unreadAttachments, ['QA 공고문.hwp']);
});

test('선정 논리는 외부 호출 없이 공고 확인 화면에 연결된다', () => {
  const source = fs.readFileSync(new URL('../src/notice-logic.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|openai/i);
  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /function selectionLogicView\(\)/);
  assert.match(appSource, /id="analyze-notice-logic"/);
  assert.match(appSource, /analyzeNoticeStructure\(/);
});
