import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readPlan, readToc, readPriority, readFormat, writingUnits } from '../public/rfp/rfp-plan.js';
import { readRfp } from '../public/rfp/rfp-read.js';
import { userContent, checkDraft } from '../src/proposal-draft.js';

const fixture = name => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const unification = fixture('rfp-unification-2027.txt');
const baeumteo = `${fixture('rfp-baeumteo-2027-yogang.txt')}\n\n${fixture('rfp-baeumteo-2027-form.txt')}`;
const { plan, toc, constraints } = readPlan(unification);
const byKey = key => plan.sections.find(section => section.key === key);

test('통일부 RFP: 목차표에서 장·절과 작성내용·쪽수를 읽는다', () => {
  assert.equal(plan.from, '목차표');
  assert.deepEqual(toc.front.map(row => [row.title, row.pages.pages]), [['표지', 1], ['목차', 1]]);
  assert.deepEqual(toc.chapters.map(chapter => [chapter.mark, chapter.title]), [
    ['Ⅰ', '개요'], ['Ⅱ', '사업운영계획'], ['Ⅲ', '지역협력 추진방안'], ['Ⅳ', '비상대책수립'], ['Ⅴ', '홍보방안']
  ]);
  assert.deepEqual(plan.sections.map(section => section.key), ['Ⅰ.1', 'Ⅰ.2', 'Ⅰ.3', 'Ⅰ.4', 'Ⅱ.1', 'Ⅱ.2', 'Ⅱ.3', 'Ⅲ.1', 'Ⅲ.2', 'Ⅳ.1', 'Ⅳ.2', 'Ⅴ']);
  assert.equal(byKey('Ⅱ.2').title, '프로그램 운영 계획');
  assert.deepEqual(byKey('Ⅱ.2').writeWhat, [{ point: '사업 취지와 목적에 맞게 공간별 프로그램 운영계획 제시', details: ['과정내용, 운영인력, 운영일정, 홍보 등 세부내용 포함'] }]);
  assert.equal(byKey('Ⅲ.1').writeWhat.length, 3);
  // 장 쪽수(Ⅰ 4쪽 이내, Ⅱ 자유분량)와 절 쪽수(Ⅱ.3 2쪽 …)
  assert.deepEqual(toc.chapters[0].pages, { pages: 4, max: true });
  assert.deepEqual(toc.chapters[1].pages, { free: true });
  assert.deepEqual(byKey('Ⅱ.3').pages, { value: 2, max: false, basis: '목차표' });
  assert.deepEqual(byKey('Ⅴ').pages, { value: 3, max: true, basis: '목차표' });
});

test('통일부 RFP: 자유분량 = 본보고서 30쪽 - 정해진 18쪽 = 12쪽', () => {
  assert.equal(plan.pages.total, 30);
  assert.equal(plan.pages.totalFrom, '제안서(본보고서)');
  assert.equal(plan.pages.front, 2);
  assert.equal(plan.pages.fixed, 18);
  assert.equal(plan.pages.free, 12);
  // 공고가 나누는 법을 말하지 않으므로 똑같이 나눈다: 자유분량 12쪽 → Ⅱ.1·Ⅱ.2 6쪽씩, Ⅰ장 4쪽 → 1쪽씩.
  assert.equal(byKey('Ⅱ.1').pages.value, 6);
  assert.equal(byKey('Ⅱ.2').pages.value, 6);
  assert.match(byKey('Ⅱ.2').pages.basis, /30쪽 - 정해진 18쪽 = 12쪽을 절 2개에 똑같이 나눔/);
  assert.deepEqual(['Ⅰ.1', 'Ⅰ.2', 'Ⅰ.3', 'Ⅰ.4'].map(key => byKey(key).pages.value), [1, 1, 1, 1]);
  assert.equal(plan.sections.reduce((acc, section) => acc + section.pages.value, 0) + plan.pages.front, 30);
});

test('통일부 RFP: 괄호 안 열거를 쪼개 보아 Ⅰ.1 비전·Ⅰ.2 목표에 사업 이해도가 붙는다', () => {
  // 「사업운영 계획수립(비전, 목표, 연도별 추진방향 등)」 — 10-06 첫 보고에서 Ⅰ.1·Ⅰ.2가 0점이었다.
  const of = (key, item) => byKey(key).scoring.filter(entry => entry.item === item);
  assert.ok(of('Ⅰ.1', '사업 이해도').some(entry => /— 비전$/.test(entry.point)), JSON.stringify(byKey('Ⅰ.1').scoring));
  assert.ok(of('Ⅰ.2', '사업 이해도').some(entry => /— 목표$/.test(entry.point)));
  assert.ok(of('Ⅰ.3', '사업 이해도').some(entry => /— 연도별 추진방향$/.test(entry.point)));
  assert.ok(byKey('Ⅰ.1').score > 0 && byKey('Ⅰ.2').score > 0);
  // 사업 이해도 10점이 Ⅰ장 안에 모두 있다.
  const understanding = plan.sections.flatMap(section => section.scoring.filter(entry => entry.item === '사업 이해도').map(entry => [section.key, entry.share]));
  assert.ok(understanding.every(([key]) => key.startsWith('Ⅰ.')), JSON.stringify(understanding));
  assert.ok(Math.abs(understanding.reduce((acc, [, share]) => acc + share, 0) - 10) < 0.01);
});

test('통일부 RFP: 평가표 배점이 절에 붙고, 70점이 어디로 갔는지 남김없이 보인다', () => {
  const items = section => [...new Set(byKey(section).scoring.map(entry => entry.item))];
  assert.deepEqual(items('Ⅰ.4'), ['사업 이해도', '기획구성']);
  assert.deepEqual(items('Ⅱ.1'), ['세부추진계획']);
  assert.ok(items('Ⅱ.2').includes('신규 프로그램') && items('Ⅱ.2').includes('세부추진계획'));
  assert.ok(items('Ⅲ.2').includes('지역협력계획') && items('Ⅲ.2').includes('세부추진계획'));
  assert.deepEqual(items('Ⅴ'), ['홍보방안']);
  // 절에 붙은 것 + 전체에 걸친 것 = 70점.
  assert.equal(plan.scoreCheck.total, 70);
  assert.equal(plan.scoreCheck.ok, true);
  assert.ok(Math.abs(plan.scoreCheck.sections + plan.scoreCheck.crossCutting - 70) < 0.02, JSON.stringify(plan.scoreCheck));
  assert.deepEqual(plan.crossCutting.map(entry => [entry.item, entry.point, entry.share]), [['기획구성', '제안요청서와 부합성과 종합 추진일정의 합리성', 3.33]]);
  // 두 절이 비슷하게 맞으면 둘 다 붙이고 확인 표시를 남긴다.
  assert.ok(byKey('Ⅱ.2').scoring.some(entry => entry.item === '신규 프로그램' && !entry.confident));
});

test('사람이 정한 연결(project.json attach)이 글자 비교보다 먼저다', () => {
  const decided = readPlan(unification, { attach: { '신규 프로그램': { main: 'Ⅱ.2', also: ['Ⅲ.1'] } } }).plan;
  const at = key => decided.sections.find(section => section.key === key).scoring.filter(entry => entry.item === '신규 프로그램');
  assert.equal(at('Ⅱ.2').reduce((acc, entry) => acc + entry.share, 0), 10);
  assert.ok(at('Ⅱ.2').every(entry => entry.role === '본진' && entry.by === '사람'));
  assert.ok(at('Ⅲ.1').length && at('Ⅲ.1').every(entry => entry.role === '부차' && entry.share === 0));
  assert.equal(decided.scoreCheck.ok, true);
  // 「항목|줄 일부」로 한 줄만 정할 수도 있다.
  const one = readPlan(unification, { attach: { '기획구성|설문': { main: 'Ⅱ.3' } } }).plan;
  const planning = one.sections.find(section => section.key === 'Ⅱ.3').scoring;
  assert.deepEqual(planning.map(entry => [entry.item, entry.point, Number(entry.share.toFixed(2))]), [['기획구성', '프로그램운영 수요조사 및 설문을 반영한 콘텐츠 개발', 3.33]]);
});

test('통일부 RFP: 동점 우선순위는 순서만 읽어 표시하고 분량 계산에 쓰지 않는다', () => {
  assert.deepEqual(plan.priority.order.map(entry => [entry.item, entry.rank]), [['신규 프로그램', 1], ['기획구성', 2], ['세부추진계획', 3]]);
  assert.ok(plan.priority.order.every(entry => !('multiplier' in entry)));
  assert.match(plan.priority.quote, /항목순으로 높은 점수를 얻은 자를 우선순위자로 한다/);
  assert.ok(plan.sections.every(section => !('weight' in section)));
  assert.deepEqual(byKey('Ⅱ.2').priority.map(entry => entry.rank), [1, 2, 3]);
  assert.deepEqual(byKey('Ⅴ').priority, []);
  // AI에게는 말로 시킨다.
  const unit = writingUnits(plan).find(entry => entry.key === 'Ⅱ');
  const request = userContent({ rfpText: unification, facts: [], project: {}, section: unit, constraints, plan })[1].text;
  assert.match(request, /동점 시 1순위로 보는 항목\(신규 프로그램\)이 붙어 있다/);
});

test('통일부 RFP: 서체·규격 문단을 출력 규칙으로 읽는다', () => {
  const format = plan.format;
  assert.equal(format.paper, 'A4');
  assert.equal(format.orientation, '세로');
  assert.equal(format.fileFormat, 'hwp');
  assert.equal(format.pageNumber, '하단 중앙');
  assert.match(format.cover, /백색표지.*쪽 번호 없음/);
  assert.deepEqual(format.styles.map(style => [style.marker, style.size, style.font]), [
    ['I.', 16, '휴먼고딕'], ['1.', 16, '휴먼명조'], ['o', 15, '휴먼명조'], ['-', 15, '휴먼명조'], ['․', 15, '휴먼명조'], ['※', 13, '중고딕']
  ]);
});

test('배움터: 목차표도 배점 있는 평가표도 없으면 같은 코드로 양식 기반으로 물러난다', () => {
  const result = readPlan(baeumteo);
  assert.equal(readToc(baeumteo), null);
  assert.equal(result.plan, null);
  assert.equal(result.fallback.to, '양식 기반');
  assert.equal(readPriority(baeumteo, []), null);
  // 예산 한도는 그대로 읽힌다.
  assert.ok(result.constraints.ratioCaps.some(cap => cap.what === '운영비+인건비' && cap.maxPercent === 25));
});

test('목차표가 없고 평가표만 있으면 평가표를 목차로 쓴다(10-05의 길)', () => {
  const text = ['평가항목\t평가내용\t배점', '현장 이해\t✤ 대상자 분석\t15', '운영 체계\t✤ 인력 배치\t25', '\t계\t40', ''].join('\n');
  const result = readPlan(text);
  assert.equal(result.plan.from, '평가표');
  assert.deepEqual(result.plan.sections.map(section => [section.title, section.score]), [['현장 이해', 15], ['운영 체계', 25]]);
  assert.equal(readFormat(text), null);
});

test('같은 모양의 다른 목차표·우선순위 문장이면 그 이름과 숫자가 나온다(코드에 적힌 이름 없음)', () => {
  const text = [
    '평가항목\t평가내용\t배점',
    '현장 이해\t✤ 대상자 분석\t20',
    '운영 체계\t✤ 인력 배치와 교육\t20',
    '\t계\t40',
    '',
    '합산점수가 동일한 경우에는 평가항목 중 1. 운영 체계 2. 현장 이해 항목순으로 높은 점수를 얻은 자를 우선한다.',
    '',
    '○ 계획서 : 10쪽 이내',
    '',
    '목차\t작성내용\t비고',
    'Ⅰ. 현장\to 대상자 분석 방안\tA4 3page 이내',
    'Ⅱ. 운영\t\t자유분량',
    ' 1. 인력\to 인력 배치와 교육 계획',
    ''
  ].join('\n');
  const result = readPlan(text);
  assert.equal(result.plan.from, '목차표');
  assert.deepEqual(result.plan.sections.map(section => [section.key, section.title]), [['Ⅰ', '현장'], ['Ⅱ.1', '인력']]);
  assert.deepEqual(result.plan.priority.order.map(entry => [entry.item, entry.rank]), [['운영 체계', 1], ['현장 이해', 2]]);
  assert.equal(result.plan.pages.free, 7);
  assert.equal(result.plan.sections[1].pages.value, 7);
});

test('장 단위 작성지시가 프롬프트와 검사에 쓰인다', () => {
  const units = writingUnits(plan);
  assert.deepEqual(units.map(unit => unit.key), ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']);
  const one = units[0];
  assert.equal(one.title, 'Ⅰ. 개요');
  assert.equal(one.pages, 4);
  assert.ok(one.items.includes('사업 이해도'));
  const request = userContent({ rfpText: unification, facts: [], project: {}, section: one, constraints, plan })[1].text;
  for (const part of one.parts) assert.ok(request.includes(`### ${part.key} ${part.title}`), part.key);
  assert.match(request, /\[사업 이해도\] 효과적인 사업 추진 전략/);
  assert.match(request, /신규 프로그램 → 기획구성 → 세부추진계획/);
  assert.match(request, /「o」 15pt 휴먼명조/);
  const draft = ['## Ⅰ. 개요', '### Ⅰ.1 사업 비전', '내용', '### Ⅰ.2 사업 목표', '[확인 필요: 목표]', '### Ⅰ.3 사업 수행전략', '내용'].join('\n');
  const results = checkDraft(draft, { constraints, section: one, sources: [unification], project: {} });
  assert.deepEqual(results.filter(result => result.level === 'fail').map(result => result.what), ['절 「Ⅰ.4 제안의 특장점」 소제목']);
});

test('readRfp(10-05)의 결과는 그대로 남는다', () => {
  assert.equal(readRfp(unification).outline.total, 70);
});
