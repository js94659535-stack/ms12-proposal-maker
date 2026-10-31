import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRfp, readEvaluation, readConstraints, checkPlan, parseWon, splitPoints } from '../public/rfp/rfp-read.js';

const fixture = name => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
// 통일부 「2027년 남북통합문화센터 민간위탁(다. 북한이탈주민 심리·언어 지원 프로그램 운영)」 제안요청서 본문(담당자 연락처만 지움)
const unification = fixture('rfp-unification-2027.txt');
// 삼성꿈장학재단 2027 배움터 공모요강(PDF) + 맞춤형 신청서 양식(HWP)
const baeumteo = `${fixture('rfp-baeumteo-2027-yogang.txt')}\n\n${fixture('rfp-baeumteo-2027-form.txt')}`;

test('금액 글자를 원 단위로 읽는다', () => {
  assert.equal(parseWon('504백만원'), 504_000_000);
  assert.equal(parseWon('252,000천원'), 252_000_000);
  assert.equal(parseWon('1억 5천만 원'), 150_000_000);
  assert.equal(parseWon('2천 5백만 원'), 25_000_000);
  assert.equal(parseWon('1만 5천원'), 15_000);
  assert.equal(parseWon('60,000원'), 60_000);
  assert.equal(parseWon('5천만 원'), 50_000_000);
});

test('평가내용을 큰 줄과 작은 줄로 나눈다', () => {
  assert.deepEqual(splitPoints('✤ 홍보 및 활성화 방안   - 가 확산   - 나 효과'), [{ point: '홍보 및 활성화 방안', details: ['가 확산', '나 효과'] }]);
});

test('통일부 RFP: 평가표에서 정성 7항목 70점이 목차로 나온다', () => {
  const { evaluation, outline, fallback } = readRfp(unification);
  assert.equal(evaluation.found, true);
  assert.equal(evaluation.total, 80);
  assert.deepEqual(evaluation.groups.map(group => [group.name, group.score]), [['객관적평가', 10], ['정성적평가', 70]]);
  assert.ok(evaluation.checks.every(check => check.ok), JSON.stringify(evaluation.checks));
  assert.equal(fallback, null);
  assert.equal(outline.total, 70);
  assert.deepEqual(outline.sections.map(section => [section.title, section.score]), [
    ['사업 이해도', 10], ['기획구성', 10], ['신규 프로그램', 10], ['세부추진계획', 10],
    ['지역협력계획', 10], ['안전관리 등 비상대책수립', 10], ['홍보방안', 10]
  ]);
  // 요약표와 상세표의 이름이 다르면 상세표 이름을 쓰고 요약표 이름은 별칭으로 남긴다.
  assert.deepEqual(outline.sections[5].aliases, ['비상대책수립']);
  // 정량(서식으로 내는) 항목은 목차에서 빠진다.
  assert.deepEqual(outline.leftOut.map(item => item.name), ['수행실적', '경영상태']);
  // 평가내용이 절마다 쓸 거리로 붙는다.
  assert.deepEqual(outline.sections[0].writeWhat.map(point => point.point), ['효과적인 사업 추진 전략', '프로그램의 중장기 발전 방안 제시']);
  assert.deepEqual(outline.sections[0].writeWhat[0].details, ['사업운영 계획수립(비전, 목표, 연도별 추진방향 등)']);
  assert.deepEqual(outline.sections[2].writeWhat.map(point => point.point), ['신규 교류·체험·활동·행사 프로그램 편성', '프로그램의 다양성, 균형성']);
});

test('통일부 RFP: 금액·기간·장기계속·쪽수·인건비 한도를 글자에서 읽는다', () => {
  const c = readConstraints(unification);
  const total = c.amounts.find(amount => amount.label === '위탁금액(총액)');
  assert.equal(total.won, 504_000_000);
  assert.equal(total.vatIncluded, true);
  assert.deepEqual(c.derived.map(item => [item.kind, item.won]), [['estimated-price', 458_181_818]]);
  assert.match(c.derived[0].basis, /계산값/);
  assert.deepEqual(c.longTerm.installments.map(item => [item.label, item.won, item.period]), [
    ['장기계속 1차', 252_000_000, ['2027-01-01', '2027-12-31']],
    ['장기계속 2차', 252_000_000, ['2028-01-01', '2028-12-31']]
  ]);
  assert.equal(c.longTerm.years, 2);
  assert.ok(c.checks.every(check => check.ok));
  assert.deepEqual(c.periods.map(period => [period.from, period.to, period.years]), [['2027-01-01', '2028-12-31', 2]]);
  const labor = c.ratioCaps.find(cap => cap.terms.includes('인건비'));
  assert.equal(labor.maxPercent, 30);
  assert.equal(labor.of, '위탁사업비 총액');
  assert.match(labor.article, /^제16조/);
  const report = c.pageCaps.find(cap => cap.subject === '제안서(본보고서)');
  assert.equal(report.maxPages, 30);
  assert.equal(c.pageCaps.find(cap => cap.subject === '제안서(PPT보고서)').maxPages, 20);
  assert.equal(c.prohibitions.length, 1);
});

test('통일부 RFP: 인건비·쪽수를 어기거나 금액을 적으면 검사에서 걸린다', () => {
  const c = readConstraints(unification);
  const over = checkPlan(c, { budget: { total: 252_000_000, lines: [{ name: '인건비', won: 90_000_000 }, { name: '사업비', won: 162_000_000 }] }, pages: { '본보고서': 31 } });
  assert.ok(over.some(result => result.level === 'fail' && /인건비 30%/.test(result.what)), JSON.stringify(over));
  assert.ok(over.some(result => result.level === 'fail' && /본보고서\) 30쪽/.test(result.what)));
  const fine = checkPlan(c, { budget: { total: 252_000_000, lines: [{ name: '인건비', won: 75_000_000 }, { name: '사업비', won: 177_000_000 }] }, pages: { '본보고서': 30 } });
  assert.ok(fine.every(result => result.level === 'pass'), JSON.stringify(fine));
  // 이 RFP는 제안서에 금액을 적지 말라고 한다 — 지어낸 금액이든 맞는 금액이든 걸린다.
  const text = checkPlan(c, { text: '연간 3억 원을 들여 상담실을 운영한다.' });
  assert.deepEqual(text.map(result => result.level), ['fail']);
});

test('배움터: 배점 있는 평가표가 없으면 목차를 만들지 않고 양식 기반으로 물러난다', () => {
  const { evaluation, outline, fallback, constraints } = readRfp(baeumteo);
  assert.equal(evaluation.found, false);
  assert.match(evaluation.reason, /배점/);
  assert.equal(outline, null);
  assert.equal(fallback.to, '양식 기반');
  // 같은 코드로 배움터의 예산 한도도 읽힌다.
  const ops = constraints.ratioCaps.find(cap => cap.what === '운영비+인건비');
  assert.equal(ops.maxPercent, 25);
  assert.equal(ops.of, '신청예산');
  assert.ok(constraints.ratioCaps.some(cap => cap.maxPercent === 15 && /체험/.test(cap.what)));
  assert.ok(constraints.amountCaps.some(cap => cap.per === '시간당' && cap.maxWon === 60_000));
  assert.ok(constraints.amountCaps.some(cap => cap.what === '지원금액' && cap.maxWon === 50_000_000 && !cap.conditional));
  assert.ok(constraints.amountCaps.some(cap => cap.maxWon === 150_000_000 && cap.conditional));
  assert.equal(constraints.prohibitions.length, 0);
});

test('배움터: 운영비+인건비 25% 한도를 넘으면 걸리고, 유형마다 다른 지원금액은 확인으로 남긴다', () => {
  const { constraints } = readRfp(baeumteo);
  const results = checkPlan(constraints, { budget: { total: 40_000_000, lines: [{ name: '운영비', won: 4_000_000 }, { name: '인건비', won: 7_000_000 }, { name: '강사비', won: 29_000_000 }] } });
  assert.ok(results.some(result => result.level === 'fail' && /운영비\+인건비 25%/.test(result.what)), JSON.stringify(results));
  const support = results.find(result => /^지원금액/.test(result.what));
  assert.equal(support.level, 'warn');
  assert.match(support.what, /한도가 여럿/);
});

test('평가표 읽기는 공고 글자 밖의 이름·숫자를 쓰지 않는다', () => {
  // 같은 모양의 다른 평가표를 넣으면 그 이름과 배점이 그대로 나온다.
  const text = [
    '평가항목\t평가내용\t배점',
    '현장 이해\t✤ 대상자 분석   - 지역 통계\t15',
    '운영 체계\t✤ 인력 배치\t25',
    '\t계\t40',
    ''
  ].join('\n');
  const evaluation = readEvaluation(text);
  assert.deepEqual(evaluation.items.map(item => [item.name, item.score]), [['현장 이해', 15], ['운영 체계', 25]]);
  const { outline } = readRfp(text);
  assert.deepEqual(outline.sections.map(section => section.title), ['현장 이해', '운영 체계']);
  assert.equal(outline.total, 40);
});
