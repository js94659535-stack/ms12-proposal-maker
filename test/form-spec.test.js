import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyFormSpecToOutline, buildFormSpec, extractAttachments, extractBudgetForm, extractFormItems, extractFormTables, formSources, mergeFormTables } from '../src/form-spec.js';
import { PROPOSAL_OUTLINE, buildDocumentPlan, buildDesignBrief } from '../src/engagement.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// 실제 공모신청서 서식을 흉내 낸 fixture. 외부 호출 없이 이 문자열만 읽는다.
const FORM_TEXT = `2027년 가족기능강화사업 사업계획서 서식

Ⅰ. 사업 개요
1. 사업 필요성 (1,000자 이내)
2. 사업 목적 (600자 이내)
3. 사업 목표 ※ 2쪽 이내
4. 사업 대상 (800자 이내)
5. 세부 프로그램 내용 (2,000자 이내)
6. 추진 일정
   □ 추진 일정 [표 1]로 작성
   시기 | 추진 내용 | 담당
7. 수행 인력 및 역할 (700자 이내)
8. 예산 계획
   □ 예산 산출 내역 [표 2] 양식에 따라 작성
   항목 | 산출근거 | 금액(원)
   ※ 직접 서비스 비용은 총사업비의 65% 이상이어야 함
   ※ 기관 인건비는 25%를 넘을 수 없음
9. 성과지표 및 측정 계획 [표 3]
   성과목표 | 지표 | 측정도구 | 측정시기
10. 기대효과 (500자 이내)

제출서류
① 신청기관현황
② 사업계획서 1부
③ 예산 산출내역서 1부
④ 최근 2년 실적표 (해당 시)
⑤ 개인정보 수집·이용 동의서`;

const SOURCES = [
  { id: 'src-1', fileName: '2027_사업계획서_서식.hwp', sourceType: '사업계획서 서식', extractionStatus: 'success', extractedText: FORM_TEXT },
  { id: 'src-2', fileName: '기관소개서.pdf', sourceType: '기타 안내자료', extractionStatus: 'success', extractedText: '우리 기관은 2015년에 설립되었습니다.' },
  { id: 'src-3', fileName: '읽지못한파일.hwp', sourceType: '공모신청서', extractionStatus: 'failed', extractedText: '' }
];

test('서식 자료만 읽고 기관자료·실패한 파일은 기준으로 쓰지 않는다', () => {
  const sources = formSources(SOURCES);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].sourceType, '사업계획서 서식');
  assert.equal(buildFormSpec([]), null, '서식이 없으면 규격표를 만들지 않는다');
  assert.equal(buildFormSpec([SOURCES[1]]), null);
});

test('서식에서 작성 항목과 분량 제한을 근거와 함께 읽는다', () => {
  const items = extractFormItems(formSources(SOURCES));
  const byName = name => items.find(item => item.name.includes(name));
  assert.equal(byName('사업 필요성').limitChars, 1000);
  assert.equal(byName('사업 목적').limitChars, 600);
  assert.equal(byName('사업 목표').limitPages, 2);
  assert.equal(byName('세부 프로그램').limitChars, 2000);
  assert.equal(byName('기대효과').limitChars, 500);
  // 제한을 못 찾은 항목은 확인 필요로 남긴다(만들어 채우지 않는다).
  assert.equal(byName('추진 일정').limitChars, 0);
  assert.equal(byName('추진 일정').status, '확인 필요');
  // 모든 항목은 근거 문장과 출처를 들고 다닌다.
  for (const item of items) {
    assert.ok(item.evidence.length > 1, item.name);
    assert.match(item.location, /사업계획서_서식\.hwp · 사업계획서 서식/);
    assert.ok(FORM_TEXT.replace(/\s+/g, ' ').includes(item.evidence.slice(0, 20)), `서식에 없는 근거: ${item.evidence}`);
  }
  // 제출서류·안내문은 작성 항목으로 올리지 않는다.
  assert.ok(!items.some(item => /제출서류|신청기관현황/.test(item.name)));
});

test('필수 표·예산 양식·첨부서류를 서식에서 읽는다', () => {
  const sources = formSources(SOURCES);
  const tables = extractFormTables(sources);
  assert.deepEqual(tables.map(item => item.kind).sort(), ['성과지표표', '예산표', '일정표']);
  assert.deepEqual(tables.find(item => item.kind === '일정표').columns, ['시기', '추진 내용', '담당']);
  assert.deepEqual(tables.find(item => item.kind === '성과지표표').columns, ['성과목표', '지표', '측정도구', '측정시기']);

  const budget = extractBudgetForm(sources);
  assert.deepEqual(budget.columns, ['항목', '산출근거', '금액(원)']);
  assert.equal(budget.status, '확인됨');
  assert.ok(budget.rules.some(rule => rule.text.includes('65% 이상')));
  assert.ok(budget.rules.some(rule => rule.text.includes('25%를 넘을 수 없음')));

  const attachments = extractAttachments(sources);
  assert.ok(attachments.length >= 5, `첨부 ${attachments.length}건`);
  assert.ok(attachments.some(item => item.name.includes('신청기관현황') && item.required));
  assert.equal(attachments.find(item => item.name.includes('실적표')).required, false, '해당 시 제출은 선택으로 본다');
});

test('규격표는 읽은 것과 못 읽은 것을 함께 남긴다', () => {
  const spec = buildFormSpec(SOURCES);
  assert.equal(spec.status, '확인됨');
  assert.ok(spec.items.length >= 8);
  assert.ok(spec.totalLimitChars > 0);
  assert.deepEqual(spec.sources.map(item => item.sourceType), ['사업계획서 서식']);
  assert.deepEqual(spec.openPoints, []);
  // 분량 제한이 없는 서식은 확인 필요로 남는다.
  const thin = buildFormSpec([{ id: 'x', fileName: '간단서식.hwp', sourceType: '공모신청서', extractionStatus: 'success', extractedText: '1. 사업 필요성\n2. 사업 목적' }]);
  assert.equal(thin.status, '확인 필요');
  assert.ok(thin.openPoints.some(item => item.includes('분량 제한')));
});

test('서식 기준이 설계안 목차와 필수 표에 반영된다', () => {
  const spec = buildFormSpec(SOURCES);
  const outline = applyFormSpecToOutline(PROPOSAL_OUTLINE, spec);
  const necessity = outline.find(item => item.key === 'necessity');
  assert.equal(necessity.targetChars, 1000);
  assert.equal(necessity.limitSource, '신청서 서식');
  assert.equal(necessity.formItem, '사업 필요성');
  // 쪽수만 있으면 환산해서 쓰되 근거를 남긴다.
  const goals = outline.find(item => item.key === 'goals');
  assert.equal(goals.limitPages, 2);
  assert.equal(goals.targetChars, 3200);
  // 서식에 없는 항목은 기본값을 그대로 둔다.
  const schedule = outline.find(item => item.key === 'schedule');
  assert.equal(schedule.limitSource, '기본값');
  assert.equal(schedule.targetChars, PROPOSAL_OUTLINE.find(item => item.key === 'schedule').targetChars);
  // 서식이 없으면 전부 기본값이다.
  assert.ok(applyFormSpecToOutline(PROPOSAL_OUTLINE, null).every(item => item.limitSource === '기본값'));

  // 같은 종류의 표는 서식 쪽을 쓴다.
  const merged = mergeFormTables([{ id: 'budget-table', kind: '예산표', title: '기본 예산표', source: '공고 실행계약서' }, { id: 'target-table', kind: '대상표', title: '참여자 구성', source: '공고 실행계약서' }], spec);
  assert.equal(merged.find(item => item.kind === '예산표').source, '신청서 서식');
  assert.equal(merged.find(item => item.kind === '대상표').source, '공고 실행계약서');
});

test('설계안과 문서 계획이 서식 규격을 함께 들고 간다', () => {
  const spec = buildFormSpec(SOURCES);
  const contract = { rules: [{ category: '예산', ruleType: 'MAX', value: 140000000, unit: '원' }, { category: '참여규모', ruleType: 'MIN', value: 70, unit: '명' }] };
  const plan = buildDocumentPlan(contract, spec);
  assert.equal(plan.limitSource, '신청서 서식');
  assert.equal(plan.formSpecStatus, '확인됨');
  assert.ok(plan.attachments.length >= 5);
  assert.ok(plan.budgetForm.columns.length === 3);
  assert.ok(plan.tables.some(item => item.kind === '예산표' && item.source === '신청서 서식'));
  assert.ok(plan.tables.some(item => item.kind === '대상표' && item.source === '공고 실행계약서'));

  const brief = buildDesignBrief({ contract, formSpec: spec });
  assert.equal(brief.formSpec.status, '확인됨');
  assert.equal(brief.formSpec.attachments, plan.attachments.length);
  assert.equal(brief.documentPlan.limitSource, '신청서 서식');
  // 서식이 없으면 설계안에 서식 정보를 만들지 않는다.
  assert.equal(buildDesignBrief({ contract }).formSpec, null);
});

// GOLD — CASE 1의 실제 신청서 서식 원문. 추출 결과를 서식 원문과 그대로 대조한다.
const REAL_FORM = fs.readFileSync(new URL('./fixtures/form-chest-2027-application.txt', import.meta.url), 'utf8');
const REAL_NOTICE = fs.readFileSync(new URL('./fixtures/notice-chest-2027-gold.txt', import.meta.url), 'utf8');
const REAL_SOURCES = [
  { id: 'r1', fileName: '2027 배분신청서 서식.hwp', sourceType: '공모신청서', extractionStatus: 'success', extractedText: REAL_FORM },
  { id: 'r2', fileName: '2027 공고문.hwp', sourceType: '세부 공고문', extractionStatus: 'success', extractedText: REAL_NOTICE }
];

test('실제 CASE 1 신청서 서식에서 작성 항목을 서식 그대로 읽는다', () => {
  const spec = buildFormSpec(REAL_SOURCES);
  const names = spec.items.map(item => item.name);
  // 서식의 계획서 작성 항목을 빠짐없이 읽는다(누락 검사).
  for (const expected of [
    '사업명', '사업내용 및 추진 전략', '사업 참여자 모집 전략', '참여 대상 및 인원', '참여자 선정 기준', '참여자 모집 방안',
    '세부 사업내용', '사업 진행 일정', '사업수행 인력', '참여자 및 수행인력 유지 및 관리 전략', '기관 연계협력 전략',
    '예산 편성', '문제 의식', '사업 계획 배경', '기존 유사사업과의 차별성', '신청기관의 강점',
    '목표 및 평가', '산출목표', '성과목표 및 평가 방법', '사업종료 후 지향점', '사업 수행으로 인한 기대 효과', '사업 결과의 활용 계획'
  ]) {
    assert.ok(names.includes(expected), `서식 항목 누락: ${expected}`);
  }
  // 신뢰성 점검표의 체크 선택지·안내 문항은 계획서 작성 항목이 아니다.
  for (const noise of ['해당없음', '해당있음', '회계부정', '인권침해', '시설장', '종사자']) {
    assert.ok(!names.some(name => name.includes(noise)), `점검표 문항을 작성 항목으로 읽음: ${noise}`);
  }
  // 표 안의 칸 이름·문장 조각을 작성 항목으로 올리지 않는다.
  for (const noise of ['대상 지역', '방문프로그램', '보완 계획', '모금회 지속가능발전목표']) {
    assert.ok(!names.includes(noise), `표 조각을 항목으로 잘못 읽음: ${noise}`);
  }
  // 공고문의 배분제외 조항은 작성 항목이 아니다.
  assert.ok(!names.some(name => /정치|영리를 주된 목적/.test(name)), '공고 조항을 작성 항목으로 읽음');
  // 모든 항목의 근거 문장이 실제 서식 원문에 있어야 한다.
  for (const item of spec.items) {
    assert.ok(REAL_FORM.replace(/\s+/g, ' ').includes(item.evidence.slice(0, 20)), `서식에 없는 근거: ${item.evidence}`);
    assert.match(item.location, /배분신청서 서식\.hwp · 공모신청서/);
  }
});

test('실제 서식에 분량 제한이 없으면 만들지 않고 확인 필요로 남긴다', () => {
  const spec = buildFormSpec(REAL_SOURCES);
  // 이 서식은 온라인 입력 양식이라 글자·쪽수 제한이 없다. 없는 기준을 지어내지 않는다.
  assert.ok(!/자\s*이내|쪽\s*이내|페이지\s*이내/.test(REAL_FORM), '서식에 분량 제한이 실제로 없다');
  assert.ok(spec.items.every(item => item.limitChars === 0 && item.limitPages === 0));
  assert.ok(spec.items.every(item => item.status === '확인 필요'));
  assert.equal(spec.status, '확인 필요');
  assert.ok(spec.openPoints.some(point => point.includes('분량 제한')));
  // 분량 기준이 없으면 목차는 기본값을 그대로 쓴다.
  const outline = applyFormSpecToOutline(PROPOSAL_OUTLINE, spec);
  assert.ok(outline.every(item => item.limitSource === '기본값'));
});

test('실제 서식의 필수 표·예산 양식·첨부서류를 원문 그대로 읽는다', () => {
  const spec = buildFormSpec(REAL_SOURCES);
  const table = kind => spec.tables.find(item => item.kind === kind);
  assert.deepEqual(spec.tables.map(item => item.kind).sort(), ['대상표', '성과지표표', '예산표', '인력표', '일정표']);
  assert.deepEqual(table('대상표').columns, ['핵심 참여자', '주변 참여자']);
  assert.deepEqual(table('인력표').columns, ['이름', '소속/직위', '사업 내 역할분장']);
  assert.deepEqual(table('성과지표표').columns, ['성과목표', '평가 도구 및 방법', '측정 시기']);
  assert.deepEqual(table('일정표').columns.slice(0, 2), ['기간', '주요내용']);
  assert.deepEqual(table('예산표').columns.slice(0, 5), ['세목', '세세목', '산출근거', '예산조달 계획', '신청금액']);

  const budget = spec.budgetForm;
  assert.equal(budget.status, '확인됨');
  assert.ok(budget.rules.some(rule => rule.text.includes('별첨3. 예산편성기준표')));
  assert.ok(budget.rules.some(rule => rule.text.includes('신청금액 세부내역')));
  // 표 칸 이름·항목 제목·심사기준 문장은 편성 기준이 아니다.
  for (const noise of ['자부담', '2. 예산 편성', '심사기준']) {
    assert.ok(!budget.rules.some(rule => rule.text.trim() === noise || rule.text.includes('심사기준 :')), `편성 기준 아님: ${noise}`);
  }
  assert.ok(budget.rules.every(rule => rule.text.replace(/\s/g, '').length >= 12));

  // 제출서류는 공고문의 ①~⑧ 목록 그대로이고 안내 문장은 섞이지 않는다.
  assert.deepEqual(spec.attachments.map(item => item.name), [
    '신청기관현황', '신뢰성 점검표', '회계관리 점검표', '개인정보수집ㆍ이용 및 제공동의서',
    '배분신청서', '사업계획서 1부', '고유번호증(또는 사업자등록증) 1부', '시설신고증 1부'
  ]);
  assert.ok(spec.attachments.every(item => item.required));
});

test('실제 서식 기준이 설계안 문서 계획에 그대로 들어간다', () => {
  const spec = buildFormSpec(REAL_SOURCES);
  const contract = { rules: [{ category: '예산', ruleType: 'MAX', value: 140000000, unit: '원' }, { category: '참여규모', ruleType: 'MIN', value: 70, unit: '명' }] };
  const plan = buildDocumentPlan(contract, spec);
  // 서식이 요구한 표 5개가 모두 서식 기준으로 들어간다(공고 기준 표는 같은 종류면 대체된다).
  assert.equal(plan.tables.filter(item => item.source === '신청서 서식').length, 5);
  assert.ok(!plan.tables.some(item => item.kind === '예산표' && item.source === '공고 실행계약서'));
  assert.equal(plan.attachments.length, 8);
  assert.equal(plan.budgetForm.status, '확인됨');
  assert.equal(plan.formSpecStatus, '확인 필요');
  // 분량 제한이 없으니 기본값 기준임을 그대로 알린다.
  assert.equal(plan.limitSource, '기본값');
});

test('규격표는 의뢰 건에 저장되고 화면에서 생성 전에 확인한다', () => {
  assert.match(app, /function currentFormSpec\(\)/);
  assert.match(app, /if \(spec\) state\.engagement\.formSpec = spec;/);
  assert.match(app, /return spec \|\| state\.engagement\.formSpec \|\| null;/);
  assert.match(app, /function formSpecView\(brief\)/);
  assert.match(app, /신청서 서식을 아직 읽지 못했습니다/);
  assert.match(app, /확인하지 못한 기준은 만들지 않고 기본값으로 작성합니다/);
  // 설계안·작성 준비 화면 모두 같은 규격표를 본다.
  assert.match(app, /formSpec: currentFormSpec\(\)/);
  assert.match(app, /buildDocumentPlan\(currentNoticeContract\(\), currentFormSpec\(\)\)/);
  // 새 저장소를 만들지 않는다(기존 의뢰 건 저장에 함께 담는다).
  assert.doesNotMatch(app, /action: 'saveFormSpec'/);
});
