import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ASOF_UNKNOWN, applySafeCandidates, applyUpdateCandidate, buildUpdateCandidates, documentAsOf, extractApplicantCandidates } from '../src/applicant-extract.js';
import { CONFIRMED_STATUS, normalizeApplicant } from '../src/applicants.js';
import { normalizeApplicantRecord } from '../functions/api/archive.js';

// 실제 OpenAI 호출 없이 고정 문서 fixture만 사용한다.
const RECENT_DOCUMENT = `QA 기관소개서
작성일: 2026-03-10
기관명: QA 신청기관 A
법인 유형: 사단법인
상근 인력: 5명
보유 자격: 청소년상담사 2급 2명
2025년 청소년 마음건강 지원사업
이 문단은 기관 정보를 담고 있지 않은 일반 설명 문장입니다.`;

const OLD_DOCUMENT = `QA 2023 결과보고서
작성일: 2023-05-01
시설: 상담실 2실`;

function applicant() {
  return normalizeApplicant({
    id: 'applicant-a', name: 'QA 신청기관 A',
    items: [
      { id: 'a-basic', area: 'basic', label: '기관명', value: 'QA 신청기관 A', status: CONFIRMED_STATUS, source: 'QA 등기부등본' },
      { id: 'a-legal', area: 'legal', label: '법인 유형', value: '사회복지법인', status: CONFIRMED_STATUS, source: 'QA 법인등기부등본', asOf: '2025' },
      { id: 'a-staff', area: 'staff', label: '상근 인력', value: '3명', status: '확인 필요', source: '', asOf: '2024' },
      { id: 'a-facilities', area: 'facilities', label: '운영 시설', value: '상담실 3실', status: CONFIRMED_STATUS, source: 'QA 임대차계약서', asOf: '2026' },
      { id: 'a-performance', area: 'performance', label: '2019년 사업실적', value: 'QA 2019 위탁사업', status: '오래된 정보', source: '', asOf: '2019' }
    ]
  });
}
function review(doc, base = applicant()) { return buildUpdateCandidates(base, extractApplicantCandidates(doc, { documentName: 'QA문서.txt' })); }
function pick(result, label) { return result.candidates.find(candidate => candidate.label === label); }

test('기관 문서에서 항목과 기준시점을 추출하고 알 수 없으면 확인 필요로 남긴다', () => {
  const extraction = extractApplicantCandidates(RECENT_DOCUMENT, { documentName: 'QA문서.txt' });
  assert.equal(extraction.documentAsOf, '2026-03');
  assert.deepEqual(extraction.candidates.map(item => item.label).sort(), ['2025년 사업실적', '기관명', '법인 유형', '보유 자격', '상근 인력'].sort());
  assert.equal(pick(extraction, '상근 인력').value, '5명');
  assert.equal(pick(extraction, '상근 인력').asOf, '2026-03');
  assert.equal(pick(extraction, '2025년 사업실적').area, 'performance');
  assert.equal(pick(extraction, '2025년 사업실적').asOf, '2025');
  assert.match(pick(extraction, '기관명').source, /QA문서\.txt/);

  // 문서에 기준시점이 없으면 업로드 날짜를 기준시점으로 삼지 않는다.
  const undated = extractApplicantCandidates('기관명: QA 무날짜 기관\n상근 인력: 2명', {});
  assert.equal(documentAsOf('기관명: QA 무날짜 기관'), '');
  assert.equal(undated.candidates[0].asOf, '');
  assert.equal(undated.candidates[0].asOfStatus, ASOF_UNKNOWN);
});

test('추출 결과는 신규·동일·변경·충돌·누적으로만 분류하고 기관 정보를 바꾸지 않는다', () => {
  const base = applicant();
  const result = review(RECENT_DOCUMENT, base);
  assert.equal(pick(result, '기관명').kind, '동일');
  assert.equal(pick(result, '법인 유형').kind, '충돌');
  assert.equal(pick(result, '상근 인력').kind, '변경 가능성');
  assert.equal(pick(result, '보유 자격').kind, '신규');
  assert.equal(pick(result, '2025년 사업실적').kind, '누적 추가');
  assert.equal(pick(result, '법인 유형').existingValue, '사회복지법인');
  // 후보를 만드는 것만으로는 기관 원본이 변하지 않는다.
  assert.deepEqual(base.items.map(item => `${item.id}:${item.value}:${item.status}`), applicant().items.map(item => `${item.id}:${item.value}:${item.status}`));

  const older = review(OLD_DOCUMENT, base);
  assert.equal(pick(older, '운영 시설').kind, '이전 시점 정보');
});

test('반영은 사용자가 고른 후보만 적용하고 기존 값은 이력으로 남긴다', () => {
  const base = applicant();
  const result = review(RECENT_DOCUMENT, base);

  const added = applyUpdateCandidate(base, pick(result, '보유 자격'));
  const newItem = added.items.find(item => item.label === '보유 자격');
  assert.equal(newItem.status, '확인 필요');
  assert.equal(newItem.asOf, '2026-03');
  assert.match(newItem.source, /QA문서\.txt/);

  // 사업실적은 누적 정보이므로 기존 실적을 지우지 않는다.
  const cumulative = applyUpdateCandidate(base, pick(result, '2025년 사업실적'));
  assert.equal(cumulative.items.filter(item => item.area === 'performance').length, 2);
  assert.ok(cumulative.items.find(item => item.id === 'a-performance'));

  // 충돌 항목은 확인 후 반영하되 기존 확인값을 이력으로 보관하고 상태는 확인 필요로 내린다.
  const conflicted = applyUpdateCandidate(base, pick(result, '법인 유형')).items.find(item => item.id === 'a-legal');
  assert.equal(conflicted.value, '사단법인');
  assert.equal(conflicted.status, '확인 필요');
  assert.deepEqual(conflicted.history.map(entry => entry.value), ['사회복지법인']);

  // 동일 후보는 값·상태를 바꾸지 않고 근거만 덧붙인다.
  const same = applyUpdateCandidate(base, pick(result, '기관명')).items.find(item => item.id === 'a-basic');
  assert.equal(same.value, 'QA 신청기관 A');
  assert.equal(same.status, CONFIRMED_STATUS);
  assert.match(same.source, /^QA 등기부등본 \/ QA문서\.txt에서 추출/);
  assert.deepEqual(same.history, []);

  // 이전 시점 문서는 현재 값을 바꾸지 않고 이력만 추가한다.
  const older = applyUpdateCandidate(base, pick(review(OLD_DOCUMENT, base), '운영 시설')).items.find(item => item.id === 'a-facilities');
  assert.equal(older.value, '상담실 3실');
  assert.equal(older.status, CONFIRMED_STATUS);
  assert.deepEqual(older.history.map(entry => entry.value), ['상담실 2실']);
});

test('일괄 반영은 기존 값을 바꾸지 않는 신규·누적·근거 추가 후보만 처리한다', () => {
  const base = applicant();
  const result = review(RECENT_DOCUMENT, base);
  const { applicant: updated, applied } = applySafeCandidates(base, result.candidates);
  assert.equal(applied, 3);
  assert.equal(updated.items.find(item => item.id === 'a-legal').value, '사회복지법인');
  assert.equal(updated.items.find(item => item.id === 'a-staff').value, '3명');
  // 동일 후보는 값을 유지한 채 근거만 늘어난다.
  assert.equal(updated.items.find(item => item.id === 'a-basic').value, 'QA 신청기관 A');
  assert.match(updated.items.find(item => item.id === 'a-basic').source, /QA문서\.txt에서 추출/);
  assert.equal(updated.items.filter(item => item.status === '확인 필요' && item.label === '보유 자격').length, 1);
});

test('기준시점과 이력은 저장 형식과 화면 흐름에 연결된다', () => {
  const record = normalizeApplicantRecord({
    id: 'applicant-a', name: 'QA 신청기관 A',
    items: [{ id: 'a-legal', area: 'legal', label: '법인 유형', value: '사단법인', status: '확인 필요', asOf: '2026-03', history: [{ value: '사회복지법인', status: '확인됨', source: 'QA 법인등기부등본', asOf: '2025', recordedAt: '2026-03-10T00:00:00.000Z' }] }]
  });
  assert.equal(record.items[0].asOf, '2026-03');
  assert.deepEqual(record.items[0].history.map(entry => entry.value), ['사회복지법인']);

  const extractSource = fs.readFileSync(new URL('../src/applicant-extract.js', import.meta.url), 'utf8');
  assert.doesNotMatch(extractSource, /fetch\(|openai/i);

  const appSource = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /applicantDocumentView\(editing\)/);
  assert.match(appSource, /data-apply-candidate/);
  assert.match(appSource, /apply-safe-candidates/);
});

// ---------- 실제 문서 모양 여섯 가지 ----------
//
// 예전 시험 자료는 전부 「라벨: 값」 한 줄 형식이었다. 그래서 시험은 다 통과하는데 실제 문서는
// 여섯 중 다섯이 0건이었다. 공공 서식은 라벨 글자 사이가 벌어지고(「대 표 자 :」), 괄호가 붙고
// (「법인명(단체명) :」), PDF 표는 여러 칸이 공백 두 칸으로 붙어 한 줄로 나온다.
// 아래 여섯은 그 모양 그대로다. 자간·괄호·표 칸·서술문이 모두 들어 있다.

const REAL_DOCUMENTS = {
  '고유번호증(전자발급)': `고 유 번 호 증
고유번호 : 123-82-56789
법인명(단체명) : 사단법인 햇살복지재단
대 표 자 : 홍길동
소 재 지 : 서울특별시 관악구 신림로 123, 2층
단체유형 : 비영리법인
발급일 : 2024-03-11`,
  '고유번호증(표 칸)': `고유번호증
고유번호   123-82-56789   법인명   사단법인 햇살복지재단
대표자   홍길동   개업연월일   2011-04-02
소재지   서울특별시 관악구 신림로 123, 2층`,
  '기관 연혁': `햇살복지재단 연혁
2011년 4월  사단법인 설립 인가(서울특별시)
2014년  지역아동센터 위탁 운영 시작
2023년  청소년 마음건강 지원사업 위탁 운영
2024년  경계선 지능아동 사회적응 지원사업 수행
현재 상근 직원 7명과 비상근 강사 4명이 근무하고 있으며, 사회복지사 5명을 두고 있다.
상담실 2실과 집단상담실 1실을 갖추고 있고, 서울시립대학교와 업무협약을 체결하였다.`,
  '기관소개서': `1. 기관 개요
사단법인 햇살복지재단은 2011년 설립되어 관악구 일대 아동·청소년을 지원해 왔습니다.
2. 인력 현황
상근 인력 7명, 비상근 강사 4명이며 사회복지사 5명, 청소년지도사 2명이 있습니다.
3. 시설
상담실 2실, 교육실 1실을 운영합니다.
4. 성과
2024년 만족도 조사 결과 만족도 92.4% 였으며 사전·사후 검사를 실시하였습니다.`,
  '결산서': `2025년도 세입세출 결산서
총 사업비   182,400,000 원
자부담   12,000,000 원`,
  '신청서 서식': `사업계획서
기 관 명   햇살지역아동센터   고유번호   123-82-56789
대 표 자   홍길동   설립일   2011-04-02
상근인력   7명   보유자격   사회복지사 5명
주요실적   2024년 경계선 지능아동 사회적응 지원사업`
};

function labelsOf(text) {
  return extractApplicantCandidates(text, { documentName: 'QA 실제문서' }).candidates.map(item => `${item.label}=${item.value}`);
}

test('실제 문서 여섯 가지에서 모두 기관 정보를 읽는다', () => {
  for (const [name, text] of Object.entries(REAL_DOCUMENTS)) {
    assert.ok(labelsOf(text).length > 0, `${name}에서 한 건도 뽑지 못했습니다`);
  }
});

test('자간이 벌어지거나 괄호가 붙은 라벨도 읽는다', () => {
  const labels = labelsOf(REAL_DOCUMENTS['고유번호증(전자발급)']);
  // 「법인명(단체명) :」의 괄호와 「대 표 자 :」·「소 재 지 :」의 자간을 넘어야 한다.
  assert.ok(labels.includes('기관명=사단법인 햇살복지재단'), labels.join(' / '));
  assert.ok(labels.includes('대표자=홍길동'), labels.join(' / '));
  assert.ok(labels.includes('소재지=서울특별시 관악구 신림로 123, 2층'), labels.join(' / '));
  assert.ok(labels.includes('고유번호=123-82-56789'));
});

test('표 칸으로 나뉜 서식에서 세 글자 이름도 값으로 읽는다', () => {
  for (const key of ['고유번호증(표 칸)', '신청서 서식']) {
    const labels = labelsOf(REAL_DOCUMENTS[key]);
    assert.ok(labels.includes('대표자=홍길동'), `${key}: ${labels.join(' / ')}`);
  }
  const form = labelsOf(REAL_DOCUMENTS['신청서 서식']);
  assert.ok(form.includes('기관명=햇살지역아동센터'), form.join(' / '));
  assert.ok(form.includes('상근 인력=7명'));
  assert.ok(form.includes('보유 자격=사회복지사 5명'));
});

test('연혁·소개서 같은 서술문에서 인력·시설·협약·실적을 읽는다', () => {
  const history = labelsOf(REAL_DOCUMENTS['기관 연혁']);
  assert.ok(history.includes('상근 인력=7명'), history.join(' / '));
  assert.ok(history.includes('보유 자격=사회복지사 5명'));
  assert.ok(history.includes('협력기관=서울시립대학교'));
  assert.ok(history.some(label => /^20\d{2}년 사업실적=/.test(label)), history.join(' / '));

  const intro = labelsOf(REAL_DOCUMENTS['기관소개서']);
  assert.ok(intro.includes('운영 시설=상담실 2실'), intro.join(' / '));
  assert.ok(intro.some(label => label.startsWith('성과측정 경험=')), intro.join(' / '));

  const budget = labelsOf(REAL_DOCUMENTS['결산서']);
  assert.ok(budget.some(label => label.startsWith('총사업비=182,400,000')), budget.join(' / '));
  assert.ok(budget.some(label => label.startsWith('자부담=12,000,000')));
});

test('연락처가 섞인 줄은 연락처만 지우고 나머지는 살린다', () => {
  const result = extractApplicantCandidates('기관명: 햇살복지재단   연락처: 02-000-0000\n상근 직원 7명이며 문의는 010-1234-5678 입니다', { documentName: 'QA 섞인문서' });
  const labels = result.candidates.map(item => `${item.label}=${item.value}`);
  // 예전에는 이 줄이 통째로 버려져 기관명까지 사라졌다.
  assert.ok(labels.includes('기관명=햇살복지재단'), labels.join(' / '));
  assert.ok(labels.includes('상근 인력=7명'), labels.join(' / '));
  // 그래도 연락처 자체는 값에도 근거 문장에도 남기지 않는다.
  const serialized = JSON.stringify(result);
  for (const personal of ['02-000-0000', '010-1234-5678', '연락처']) {
    assert.equal(serialized.includes(personal), false, `${personal}이 수집되었습니다`);
  }
});

test('사람 정보뿐인 값은 후보로 만들지 않는다', () => {
  const result = extractApplicantCandidates('담당자 홍길동 010-1234-5678 (hong@example.com)\n대표자 : 010-1234-5678', { documentName: 'QA 개인정보' });
  const serialized = JSON.stringify(result);
  for (const personal of ['010-1234-5678', 'hong@example.com', '홍길동']) {
    assert.equal(serialized.includes(personal), false, `${personal}이 수집되었습니다`);
  }
});

// ---------- 실적표 한 행 ----------
// 실제 기관 연혁(2017~2026, 99행)의 표 모양 그대로다. 칸은 탭, 행은 줄바꿈이며
// 연도 칸은 한 해의 여러 줄을 세로로 합쳐 그 해 첫 줄에만 있다.
const HISTORY_TABLE_TEXT = [
  '㈜ 마인드스토리 기관 프로그램 구성',
  '번호\t추진사업\t사업 내용',
  '1\t학교로 찾아가는 상담 프로그램\t대상: 학생, 교직원 내용: 심리검사 및 해석',
  '2\t위탁사업\t광주시교육청 학교폭력 가해자 특별교육 제공 기관',
  '㈜ 마인드스토리 기관 교육 및 활동 프로그램',
  '연도\t번호\t진행기관\t프로그램명\t프로그램 내용',
  '2017\t1\t송원대학교, 조선대학교\t취창업 청년 캠프\t진로역량에 맞는 취창업 지원 프로그램',
  '2\t광주광역시교육청\t특수교육치료지원서비스 제공\t개별상담',
  '3\t마인드스토리\t진로 학습 상담사 양성\t진로 학습 상담사 양성 및 실습',
  '2025\t1\t장성 중학교\t학교폭력 예방교육\t미술을 통한 학교폭력 예방교육',
  '2\t정읍 애육원\t내안의 강점으로 여는 진로여행\t진로탐색  집단 프로그램',
  '3\t동명청년창작\t-\t초기상담이해, 상담사례분석'
].join('\n');

const historyCandidates = () => extractApplicantCandidates(HISTORY_TABLE_TEXT, { documentName: 'QA 기관 연혁' }).candidates;

test('실적표는 끝말이 아니라 연도·발주기관·사업명으로 읽는다', () => {
  const performance = historyCandidates().filter(item => item.area === 'performance');
  // 표에 있는 여섯 행이 모두 실적이 된다.
  assert.equal(performance.length, 6);
  const values = performance.map(item => item.value);
  assert.ok(values.includes('송원대학교, 조선대학교 취창업 청년 캠프'), values.join(' / '));
  // 「…사업」「…프로그램」으로 끝나지 않아도 실적이다. 예전에는 이런 행이 통째로 떨어졌다.
  assert.ok(values.includes('광주광역시교육청 특수교육치료지원서비스 제공'), values.join(' / '));
  assert.ok(values.includes('장성 중학교 학교폭력 예방교육'), values.join(' / '));
  assert.ok(values.includes('정읍 애육원 내안의 강점으로 여는 진로여행'), values.join(' / '));
});

test('세로로 합쳐진 연도 칸은 번호가 이어지는 동안만 다음 행이 물려받는다', () => {
  const performance = historyCandidates().filter(item => item.area === 'performance');
  const of = value => performance.find(item => item.value.startsWith(value));
  assert.equal(of('광주광역시교육청').asOf, '2017');
  assert.equal(of('광주광역시교육청').label, '2017년 사업실적');
  assert.equal(of('마인드스토리').asOf, '2017');
  // 새 연도 칸이 나오면 그때부터 그 연도다.
  assert.equal(of('장성 중학교').asOf, '2025');
  assert.equal(of('정읍 애육원').asOf, '2025');
});

test('실적표 앞의 다른 표는 실적이 되지 않는다', () => {
  const values = historyCandidates().map(item => item.value);
  // 「기관 프로그램 구성」 표는 연도 칸이 없다. 번호만 있다고 실적으로 만들지 않는다.
  assert.ok(!values.some(value => value.includes('학교로 찾아가는 상담 프로그램')), values.join(' / '));
  assert.ok(!values.some(value => value.includes('위탁사업')), values.join(' / '));
  // 표 머리글도 값이 아니다.
  assert.ok(!values.some(value => value.includes('진행기관')), values.join(' / '));
});

test('사업명 칸이 비어 있으면 다음 칸을 사업명으로 읽는다', () => {
  const values = historyCandidates().map(item => item.value);
  assert.ok(values.includes('동명청년창작 초기상담이해, 상담사례분석'), values.join(' / '));
});

test('띄어 쓴 날짜와 서명 줄은 실적이 아니다', () => {
  // 실제 배분신청서 마지막 장이다. 예전 규칙에서는 「2026년 사업실적 = 기관대표자 : 장석복」이 나왔다.
  const text = ['2026년   7월   6일', '기관대표자 :   장석복   (직인)'].join('\n');
  const candidates = extractApplicantCandidates(text, { documentName: 'QA 배분신청서' }).candidates;
  assert.deepEqual(candidates.filter(item => item.area === 'performance'), []);
});

test('서술형 문서에는 표 규칙이 실적을 더 만들지 않는다', () => {
  const text = ['2000년 광주 독서문화연구원으로 시작해 26년간 이름과 사업을 여덟 번 넓혀 왔습니다.',
    '2017년 법인 전환 이후 10년간 99건의 교육·상담 사업을 수행했습니다.'].join('\n');
  const performance = extractApplicantCandidates(text, { documentName: 'QA 소개서' }).candidates.filter(item => item.area === 'performance');
  // 칸이 나뉘지 않은 줄은 표 행이 아니다. 서술문 규칙이 잡던 두 건 그대로다.
  assert.equal(performance.length, 2);
});
