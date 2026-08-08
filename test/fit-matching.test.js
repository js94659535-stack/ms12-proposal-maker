import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIT_VERDICTS, MATCH_STATES, fitVerdict, matchApplicantToNotice } from '../src/fit-matching.js';
import { CONFIRMED_STATUS, normalizeApplicant } from '../src/applicants.js';
import { analyzeNoticeStructure } from '../src/notice-logic.js';

// 실제 OpenAI 호출 없이 고정 fixture만 사용한다.
const NOTICE = analyzeNoticeStructure({
  title: 'QA 아동 가족기능 강화사업 공고',
  overview: `사업목적 : 아동의 건강한 성장발달과 가족기능 회복.
신청자격 : 사회복지법인 또는 지역아동센터 등 비영리 사회복지시설.
주요사업내용 : 아동 심리정서 회복 프로그램과 보호자 상담을 운영한다.
대상 : 지역 아동과 보호자.
사업기간 : 2027. 1. ~ 2027. 12. 사업예산 총 100,000,000원 이내 (1개소당 10,000,000원 이내)
성과지표 : 사전·사후 검사 결과를 결과 보고에 포함한다.
제출 서류 : 사업계획서와 예산내역서를 제출하여야 한다.
다음에 해당하는 곳은 제외 : 보조금 부정수급 기관.`
});

function applicant(items, name = 'QA 기관') {
  return normalizeApplicant({ id: 'fit-a', name, items });
}

test('선정요건별로 다섯 가지 상태로 분류한다', () => {
  const result = matchApplicantToNotice(NOTICE, applicant([
    { id: 'i1', area: 'legal', label: '법인 유형', value: '사회복지법인 지역아동센터', status: CONFIRMED_STATUS, source: '법인등기부등본', asOf: '2026' },
    { id: 'i2', area: 'performance', label: '2024년 사업실적', value: '아동 심리정서 회복 프로그램 운영', status: CONFIRMED_STATUS, source: '2024 결과보고서', asOf: '2024' },
    { id: 'i3', area: 'measurement', label: '성과측정 경험', value: '사전·사후 검사', status: '확인 필요', source: '2024 계획서', asOf: '2024' }
  ]));
  assert.ok(result.matches.every(match => MATCH_STATES.includes(match.state)));
  assert.equal(result.matches.find(match => match.key === 'eligibility').state, 'MATCHED');
  assert.equal(result.matches.find(match => match.key === 'requiredContent').state, 'PARTIAL');
  assert.equal(result.matches.find(match => match.key === 'outcomes').state, 'CONFIRMATION_REQUIRED');
  assert.equal(result.matches.find(match => match.key === 'submissionItems').state, 'MISSING');

  // 항목마다 근거·이유·강조·질문을 갖춘다.
  for (const match of result.matches) {
    assert.ok(match.requirement && match.reason && match.emphasis);
    if (match.state !== 'MATCHED') assert.ok(match.question, `${match.requirement} 질문 없음`);
    if (match.state === 'MATCHED') assert.ok(match.applicantEvidence[0].source);
  }
  // 확인되지 않은 정보의 값은 전달하지 않는다.
  const unconfirmed = result.matches.find(match => match.state === 'CONFIRMATION_REQUIRED');
  assert.equal(unconfirmed.applicantEvidence[0].value, '');
});

test('공고가 명시적으로 배제할 때만 충돌로 표시한다', () => {
  const forProfit = [{ id: 'i1', area: 'basic', label: '기관명', value: '(주)QA컴퍼니', status: CONFIRMED_STATUS, source: '법인등기부등본', asOf: '2026' }];

  // 공고가 영리법인을 명시적으로 배제한 경우 → CONFLICT
  const strict = analyzeNoticeStructure({ title: 'QA 공고', overview: '신청자격 : 비영리법인에 한함. 영리법인은 신청 불가. 사업내용 : 아동 심리정서 회복 프로그램.' });
  const strictResult = matchApplicantToNotice(strict, applicant(forProfit, '(주)QA컴퍼니'));
  const strictEligibility = strictResult.matches.find(match => match.key === 'eligibility');
  assert.equal(strictEligibility.state, 'CONFLICT');
  assert.match(strictEligibility.reason, /명시적으로 배제/);
  assert.equal(strictResult.verdict, '신청 적합성 낮음');

  // 능력·역할만 요구하는 문장 → 법인명만으로 충돌 처리하지 않는다.
  const capacity = analyzeNoticeStructure({ title: 'QA 공고', overview: '신청자격 : 학대피해아동에게 개입이 가능한 기관. 사업내용 : 아동 심리정서 회복 프로그램.' });
  const capacityResult = matchApplicantToNotice(capacity, applicant(forProfit, '(주)QA컴퍼니'));
  const capacityEligibility = capacityResult.matches.find(match => match.key === 'eligibility');
  assert.notEqual(capacityEligibility.state, 'CONFLICT');
  assert.ok(['MISSING', 'CONFIRMATION_REQUIRED'].includes(capacityEligibility.state));
  assert.notEqual(capacityResult.verdict, '신청 적합성 낮음');
});

test('기관 명칭만으로 신청자격을 MATCHED로 만들지 않는다', () => {
  const notice = analyzeNoticeStructure({ title: 'QA 공고', overview: '신청자격 : 아동보호전문기관에서 사례관리 중인 학대피해아동에게 개입이 가능한 기관.' });
  // 이름만 지역아동센터일 뿐 자격 문장과 겹치는 근거가 없다.
  const nameOnly = matchApplicantToNotice(notice, applicant([
    { id: 'i1', area: 'basic', label: '기관명', value: 'QA 지역아동센터', status: CONFIRMED_STATUS, source: '등기부', asOf: '2026' }
  ], 'QA 지역아동센터'));
  assert.notEqual(nameOnly.matches.find(match => match.key === 'eligibility').state, 'MATCHED');

  // 자격 문장과 실제로 겹치는 근거가 있으면 MATCHED가 된다.
  const withEvidence = matchApplicantToNotice(notice, applicant([
    { id: 'i1', area: 'legal', label: '기관 유형', value: '아동보호전문기관 사례관리 연계 지정시설', status: CONFIRMED_STATUS, source: '지정서', asOf: '2026' }
  ]));
  assert.equal(withEvidence.matches.find(match => match.key === 'eligibility').state, 'MATCHED');
});

test('과거 실적을 DIRECT / RELATED / GENERAL로 나누고 일반 실적은 대상 근거로 쓰지 않는다', () => {
  const result = matchApplicantToNotice(NOTICE, applicant([
    { id: 'i1', area: 'performance', label: '2024년 사업실적', value: '청년 일경험 인턴 지원사업 운영', status: CONFIRMED_STATUS, source: '2024 결과보고서', asOf: '2024' },
    { id: 'i2', area: 'performance', label: '2023년 사업실적', value: '아동 심리정서 회복 프로그램과 보호자 상담 운영', status: CONFIRMED_STATUS, source: '2023 결과보고서', asOf: '2023' }
  ]));
  const levels = Object.fromEntries(result.recordRelevance.map(item => [item.label, item.level]));
  assert.equal(levels['2023년 사업실적'], 'DIRECT');
  assert.ok(['GENERAL', 'RELATED'].includes(levels['2024년 사업실적']));

  const target = result.matches.find(match => match.key === 'target');
  assert.ok(target.applicantEvidence.every(item => item.relevance !== 'GENERAL'), '일반 실적이 대상 근거로 쓰였습니다');

  // 일반 실적만 있는 기관은 대상 적합성이 MATCHED가 되지 않는다.
  const generalOnly = matchApplicantToNotice(NOTICE, applicant([
    { id: 'g1', area: 'performance', label: '2024년 사업실적', value: '청년 일경험 인턴 지원사업 운영', status: CONFIRMED_STATUS, source: '결과보고서', asOf: '2024' }
  ]));
  assert.notEqual(generalOnly.matches.find(match => match.key === 'requiredContent').state, 'MATCHED');
});

test('DIRECT는 핵심 요소가 실제로 겹칠 때만 부여한다', () => {
  const result = matchApplicantToNotice(NOTICE, applicant([
    // 예산·회기·인력 같은 운영 기록은 주제와 무관한 일반 역량이다.
    { id: 'r1', area: 'performance', label: '총사업비', value: '아동 프로그램 총사업비 50,000,000원', status: CONFIRMED_STATUS, source: '결산서', asOf: '2024' },
    // 흔한 분야 낱말만 겹치면 직접 실적이 아니다.
    { id: 'r2', area: 'performance', label: '2019년 사업실적', value: '다문화가정 아동 대상 진로교육 사업', status: CONFIRMED_STATUS, source: '결과보고서', asOf: '2019' },
    // 대상·사업내용이 함께 겹쳐야 DIRECT.
    { id: 'r3', area: 'performance', label: '2023년 사업실적', value: '아동 심리정서 회복 프로그램과 보호자 상담 운영', status: CONFIRMED_STATUS, source: '결과보고서', asOf: '2023' }
  ]));
  const levels = Object.fromEntries(result.recordRelevance.map(item => [item.label, item.level]));
  assert.equal(levels['총사업비'], 'GENERAL');
  assert.equal(levels['2019년 사업실적'], 'RELATED');
  assert.equal(levels['2023년 사업실적'], 'DIRECT');
});

test('점수를 만들지 않고 네 단계 결론만 낸다', () => {
  const strong = matchApplicantToNotice(NOTICE, applicant([
    { id: 'i1', area: 'legal', label: '법인 유형', value: '사회복지법인 지역아동센터', status: CONFIRMED_STATUS, source: '등기부', asOf: '2026' },
    { id: 'i2', area: 'programs', label: '보유 프로그램', value: '아동 심리정서 회복 프로그램과 보호자 상담', status: CONFIRMED_STATUS, source: '운영일지', asOf: '2026' },
    { id: 'i3', area: 'facilities', label: '운영 시설', value: '아동 상담실 3실', status: CONFIRMED_STATUS, source: '임대차계약서', asOf: '2026' },
    { id: 'i4', area: 'budget', label: '연간 예산', value: '연간 100,000,000원 집행', status: CONFIRMED_STATUS, source: '결산서', asOf: '2026' },
    { id: 'i5', area: 'measurement', label: '성과측정 경험', value: '사전·사후 검사와 결과 보고', status: CONFIRMED_STATUS, source: '결과보고서', asOf: '2026' },
    { id: 'i6', area: 'references', label: '제출 서류', value: '사업계획서·예산내역서 양식 보유', status: CONFIRMED_STATUS, source: '내부 문서', asOf: '2026' },
    { id: 'i7', area: 'partners', label: '협력기관', value: '지역 아동보호전문기관 협약', status: CONFIRMED_STATUS, source: '협약서', asOf: '2026' }
  ]));
  assert.ok(FIT_VERDICTS.includes(strong.verdict));
  assert.equal(strong.verdict, '적합성이 높음');
  // 어떤 결론에도 점수나 확률을 만들지 않는다.
  const serialized = JSON.stringify(strong);
  assert.equal(/\d+\s*점|\d+\s*%\s*확률|선정확률/.test(serialized), false);
  assert.ok(strong.verdictReasons.length > 0);
  assert.match(strong.rule, /이번 사업의 값으로 옮기지 않는다/);

  const empty = matchApplicantToNotice(NOTICE, applicant([]));
  assert.equal(empty.verdict, '보완 후 검토');
  assert.equal(empty.byState.MISSING, NOTICE.fields.length);
  assert.deepEqual(fitVerdict([]).verdict, '보완 후 검토');
});

test('과거 사업 수치를 이번 사업 값으로 옮기지 않는다', () => {
  const result = matchApplicantToNotice(NOTICE, applicant([
    { id: 'i1', area: 'performance', label: '2024년 사업실적', value: '참여아동 50명 20회기 예산 30,000,000원', status: CONFIRMED_STATUS, source: '2024 결과보고서', asOf: '2024' }
  ]));
  const budget = result.matches.find(match => match.key === 'periodBudget');
  assert.equal(budget.state, 'PARTIAL');
  assert.match(budget.reason, /과거 사업 기록/);
  // 과거 수치는 실적 근거로만 남고 이번 사업 값으로 제안되지 않는다.
  assert.equal(result.emphasis.every(item => !/이번 사업.*50명|이번 사업.*20회기/.test(JSON.stringify(item))), true);
  assert.ok(result.matches.every(match => !/이번 사업 인원 50명/.test(match.emphasis)));
});

test('적합성 매칭은 외부 호출 없이 동작한다', () => {
  const source = fs.readFileSync(new URL('../src/fit-matching.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|openai/i);
});
