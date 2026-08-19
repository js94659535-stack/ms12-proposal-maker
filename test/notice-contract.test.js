import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeNoticeStructure } from '../src/notice-logic.js';
import { buildBlueprint, detectApplicationTypes, typesFromNoticeLines } from '../src/project-blueprint.js';
import {
  CONTRACT_RULE_TYPES, CONTRACT_SEVERITIES, OFFICIAL_LOCKED, USER_DECIDES, allPeriods,
  buildNoticeContract, checkProposalAgainstContract, contractCapabilityCheck, contractConflicts, contractFieldLocks, normalizePeriod
} from '../src/notice-contract.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
// GOLD REGRESSION — 실제 공고 원문을 그대로 fixture로 둔다. 정답 수치를 코드에 직접 적지 않는다.
const noticeText = fs.readFileSync(new URL('./fixtures/notice-chest-2027-gold.txt', import.meta.url), 'utf8');
const badFinal = JSON.parse(fs.readFileSync(new URL('./fixtures/case1-bad-final.json', import.meta.url), 'utf8'));
const notice = { title: '2027년 복권기금 취약계층 아동·청소년 가족기능강화사업', overview: noticeText };
const structure = analyzeNoticeStructure(notice);
const contract = buildNoticeContract({ structure, notice });
const ruleFor = (ruleType, match) => contract.rules.find(item => item.ruleType === ruleType && (match instanceof RegExp ? match.test(item.title) : String(item.value).includes(match)));

test('공고 실행계약서는 조건을 독립된 규칙으로 저장하고 근거를 함께 남긴다', () => {
  assert.deepEqual(CONTRACT_RULE_TYPES, ['EXACT', 'MIN', 'MAX', 'CHOICE', 'REQUIRED', 'ELIGIBILITY', 'FORMAT', 'EVALUATION']);
  assert.deepEqual(CONTRACT_SEVERITIES, ['BLOCKING', 'REQUIRED', 'ADVISORY']);
  assert.ok(contract.rules.length >= 10, `규칙 ${contract.rules.length}개`);
  for (const item of contract.rules) {
    for (const key of ['id', 'category', 'title', 'ruleType', 'value', 'severity', 'appliesTo', 'source', 'evidence', 'location']) {
      assert.ok(key in item, `${item.title} 에 ${key} 없음`);
    }
    // 근거 문장은 반드시 공고 원문에 있어야 한다. 만들어 낸 조건을 허용하지 않는다.
    const evidence = String(item.evidence).replace(/\s+/g, ' ').trim().slice(0, 40);
    assert.ok(noticeText.replace(/\s+/g, ' ').includes(evidence), `공고에 없는 근거: ${evidence}`);
  }
});

test('CASE 1 공고의 BLOCKING 규칙을 공고 원문 그대로 뽑는다', () => {
  const period = ruleFor('EXACT', '2027');
  assert.equal(period.value, '2027.1~2027.12');
  assert.equal(period.severity, 'BLOCKING');

  const choice = contract.rules.find(item => item.ruleType === 'CHOICE');
  assert.deepEqual(choice.value, ['재학대예방형', '아동보호형']);
  assert.equal(choice.severity, 'BLOCKING');

  const headcount = contract.rules.find(item => item.ruleType === 'MIN' && item.unit === '명');
  assert.equal(headcount.value, 70);
  const completion = contract.rules.find(item => item.ruleType === 'MIN' && item.unit === '%');
  assert.equal(completion.value, 98);
  const sessions = contract.rules.find(item => item.ruleType === 'MIN' && item.unit === '회기');
  assert.equal(sessions.value, 13);
  const budget = contract.rules.find(item => item.ruleType === 'MAX' && item.value === 140_000_000);
  assert.equal(budget.unit, '원');
  assert.equal(budget.appliesTo, 'budget');

  // 핵심 수행모델도 규칙이다. 일반 프로그램으로 대체할 수 없다.
  const model = contract.rules.filter(item => item.ruleType === 'REQUIRED' && item.category === '사업모델');
  assert.ok(model.length >= 2, `사업모델 규칙 ${model.length}개`);
  assert.ok(model.some(item => (item.value || []).includes('홈케어플래너')), '홈케어플래너 파견 모델이 계약조건에 없음');
});

test('공고가 정한 값은 잠그고 범위만 정한 값은 사용자가 정한다', () => {
  const locks = contractFieldLocks(contract);
  assert.equal(locks.applicationType.mode, OFFICIAL_LOCKED);
  assert.equal(locks.applicationType.options.length, 2);
  assert.equal(locks.period.mode, OFFICIAL_LOCKED);
  assert.equal(locks.period.value, '2027.1~2027.12');
  // 70명 이상은 잠그는 값이 아니라 사용자가 그 범위 안에서 정하는 값이다.
  assert.equal(locks.headcount.mode, USER_DECIDES);
  assert.match(locks.headcount.bound, /70명 이상/);
  assert.equal(locks.sessions.mode, USER_DECIDES);
  assert.match(locks.budget.bound, /140,000,000원 이하/);
});

test('공고와 충돌하는 값은 어느 쪽인지 묻지 않고 조정 대상으로 알린다', () => {
  const conflicts = contractConflicts(contract, [
    { blueprintKey: 'headcount', label: '인원', value: '아동 18명, 보호자 18명' },
    { blueprintKey: 'period', label: '기간', value: '2026년 10월 ~ 2027년 8월' },
    { blueprintKey: 'sessions', label: '회기', value: '1인당 총 10회기' },
    { blueprintKey: 'sessions', label: '회기2', value: '1인당 총 15회기' }
  ]);
  const headcount = conflicts.find(item => item.field === '인원');
  assert.match(headcount.instruction, /70명 이상으로 사업설계를 조정/);
  assert.equal(headcount.resolution, '공고 기준으로 조정 필요');
  assert.equal(headcount.unadjustable, '이 공고에 제출할 수 없음');
  assert.ok(!('question' in headcount), '공고 강제조건을 선택 질문으로 만들지 않는다');
  assert.match(conflicts.find(item => item.field === '기간').instruction, /2027\.1~2027\.12로 맞춰야/);
  // 13회기 이상이므로 15회기는 충돌이 아니다.
  assert.ok(!conflicts.some(item => item.field === '회기2'), '허용 범위 안의 값은 충돌이 아니다');
  assert.ok(conflicts.some(item => item.field === '회기'), '10회기는 충돌이어야 한다');
});

test('기존 잘못된 CASE 1 최종본은 제출 차단되고 이유가 모두 잡힌다', () => {
  const gate = checkProposalAgainstContract({ contract, sections: badFinal.sections });
  assert.equal(gate.status, '제출 차단');
  assert.equal(gate.submissionReady, false);
  assert.ok(gate.blocking.length >= 5, `차단 사유 ${gate.blocking.length}건`);
  const reasons = gate.blocking.map(item => `${item.category}|${item.title}|${item.detail}`).join('\n');
  assert.match(reasons, /사업기간/, '기간 불일치를 잡지 못했다');
  assert.match(reasons, /참여규모/, '참여규모 미달을 잡지 못했다');
  assert.match(reasons, /홈케어플래너/, '핵심 사업모델 누락을 잡지 못했다');
  assert.match(reasons, /신청유형/, '신청유형 미확정을 잡지 못했다');
  // 공고가 지정한 예산 편성구조 미준수는 보완 필요(REQUIRED) 등급으로 잡힌다. 총액 한도는 넘지 않았다.
  const unmet = gate.results.filter(item => item.state !== '충족').map(item => `${item.category}|${item.title}`).join('\n');
  assert.match(unmet, /예산\|공고 지정 예산구조 준수/, '공고 예산구조 불일치를 잡지 못했다');
});

test('공고 기준을 지킨 계획서만 제출 가능이 된다', () => {
  const good = [
    { id: 'necessity', title: '1. 사업 필요성', content: '재학대예방형으로 신청한다. 아동보호전문기관 사례관리 가정을 대상으로 한다.' },
    { id: 'purpose', title: '2. 목적', content: '아동학대의 수준까지 이르지 않았으나 예방이 필요한 가정 발굴 및 개입을 수행한다.' },
    { id: 'goals', title: '3. 목표', content: '핵심 참여자 72명 이상 참여, 프로그램 완료율 98% 이상 달성.' },
    { id: 'target', title: '4. 대상', content: '피해아동 36명, 보호자 36명 등 핵심 참여자 72명.' },
    { id: 'programs', title: '5. 프로그램', content: '홈케어플래너(가정관리사) 파견을 통한 모니터링 체계마련과 가족구성원 맞춤형 서비스. 전문심리치료기관 및 전문인력 연계.' },
    { id: 'schedule', title: '6. 일정', content: '사업기간 2027. 1. ~ 2027. 12. 참여자 1인당 14회기 진행.' },
    { id: 'roles', title: '7. 수행체계', content: '지역관리자 1명과 홈케어플래너 4명이 초기면접, 통합사례회의, 사후점검을 수행한다.' },
    { id: 'budget', title: '8. 예산', content: '총사업비 139,500,000원. 인건비 41,000,000원, 홈케어플래너 파견프로그램 80,500,000원.' },
    { id: 'indicators', title: '9. 성과지표', content: '완료율 98% 이상, 아동학대 위험수준 척도 사전·사후 측정.' },
    { id: 'outcomes', title: '10. 기대효과', content: '재학대 감소와 가족기능 회복.' }
  ];
  const gate = checkProposalAgainstContract({ contract, sections: good, blueprint: { applicationTypes: { selected: '재학대예방형' } } });
  assert.equal(gate.blocking.length, 0, `남은 차단: ${gate.blocking.map(item => item.title).join(' / ')}`);
  assert.ok(gate.submissionReady || gate.status === '보완 필요', gate.status);
});

test('기관이 핵심 수행모델을 수행할 수 있는지 따로 본다', () => {
  const none = contractCapabilityCheck(contract, { items: [{ label: '상시 프로그램', value: '방과후 학습지원, 급식지원', status: '확인됨' }] });
  assert.equal(none.status, '적합성 부족');
  assert.match(none.note, /일반 프로그램을 만들지 않습니다/);
  const some = contractCapabilityCheck(contract, { items: [{ label: '수행 경험', value: '홈케어플래너 파견 사업 3년 수행', status: '확인됨' }] });
  assert.notEqual(some.status, '적합성 부족');
});

test('기간 표기는 표기법이 달라도 같은 값으로 비교한다', () => {
  // 같은 기간을 가리키는 표기는 모두 같은 값이 되어야 한다(특정 연도를 코드에 적지 않는다).
  for (const written of ['2027. 1. ~ 2027. 12. (12개월)', '2027년 1월~12월', '2027년 1월부터 12월까지', '사업기간은 2027년 1월부터 12월까지이며, 다음 일정에 따라 추진한다.']) {
    assert.equal(normalizePeriod(written), '2027.1~2027.12', written);
  }
  assert.equal(normalizePeriod('2026년 10월 1일 ~ 2027년 8월 31일'), '2026.10~2027.8');
  assert.equal(normalizePeriod('기간 미정'), '');
  // 본문에 여러 기간이 적혀도 모두 모은다(과거 실적 기간 때문에 공고 기간을 놓치지 않는다).
  const many = allPeriods('2025년 3월부터 12월까지 수행했다. 이번 사업기간은 2027. 1. ~ 2027. 12. 이다.');
  assert.ok(many.includes('2027.1~2027.12'), many.join(' / '));
  assert.ok(many.includes('2025.3~2025.12'), many.join(' / '));
});

test('제목과 글머리표로 나뉜 공고에서도 신청유형을 읽는다', () => {
  // 「신청자격 및 유형 (계획서상 택1)」 → 다음 줄들의 ○ 재학대예방형 / ○ 아동보호형
  const types = detectApplicationTypes(structure, notice);
  assert.deepEqual(types.map(item => item.name), ['재학대예방형', '아동보호형']);
  // 원문 줄만으로도 같은 결과여야 한다.
  assert.deepEqual(typesFromNoticeLines(notice).map(item => item.name), ['재학대예방형', '아동보호형']);
  // 유형 구분이 없는 공고에서 「~형」을 억지로 만들지 않는다.
  const plain = analyzeNoticeStructure({ title: '일반 공모', overview: '사업 목적: 지역 돌봄 강화\n지원 내용: 프로그램 운영\n사업 기간: 2027. 1. ~ 2027. 12.' });
  assert.deepEqual(detectApplicationTypes(plain, { overview: '사업 목적: 지역 돌봄 강화' }), []);
});

test('설계도가 읽은 신청유형과 실행계약서의 선택지가 같다', () => {
  const choice = contract.rules.find(item => item.ruleType === 'CHOICE');
  assert.deepEqual(choice.value, detectApplicationTypes(structure, notice).map(item => item.name));
  // 사용자가 고른 값이 설계도에 그대로 반영된다.
  const blueprint = buildBlueprint({
    structure, notice, applicant: { name: '테스트 기관', items: [] }, fitResult: null,
    projectValues: [{ key: 'applicationType', value: '재학대예방형', source: '사용자 확정' }]
  });
  assert.equal(blueprint.applicationTypes.selected, '재학대예방형');
  assert.equal(blueprint.applicationTypes.blocked, false);
  assert.deepEqual(blueprint.applicationTypes.options.map(item => item.name), ['재학대예방형', '아동보호형']);
});

test('CHOICE는 공고가 선택지를, 사용자가 선택을 정한다', () => {
  // 계약서는 선택지만 정한다. 어느 것을 고를지는 이번 사업 확정값이 정하고, 그 결과를 작성 엔진에 함께 보낸다.
  assert.match(app, /const chosenType = resolvedApplicationTypes\(currentBlueprint\(\)\)\.selected;/);
  assert.match(app, /item\.ruleType === 'CHOICE' \? \(chosenType \|\| '선택 필요'\)/);
  assert.match(app, /options: item\.value \|\| \[\], selected: chosenType, selectedBy: chosenType \? '이번 사업 사용자 확정값' : ''/);
  assert.match(server, /CHOICE는 공고가 선택지\(options\)만 정하고, 그중 무엇을 고를지는 이번 사업 사용자 확정값\(selected\)이 정한다/);
  assert.match(server, /selected가 있으면 그 유형이 이번 사업의 신청유형이며 이를 공고와의 충돌로 보지 않는다/);

  // 다른 유형을 인용·비교한 문장은 혼입이 아니다(초안 점검과 같은 기준).
  const cite = [
    { id: 'necessity', title: '1. 사업 필요성', content: '재학대예방형으로 신청한다. 공고의 아동보호형은 예방 대상이라 이번 사업과 구분된다.' },
    { id: 'programs', title: '5. 프로그램', content: '홈케어플래너(가정관리사) 파견을 통한 모니터링 체계마련. 전문심리치료기관 및 전문인력 연계. 아동학대 예방이 필요한 가정 발굴 및 개입.' },
    { id: 'schedule', title: '6. 일정', content: '사업기간 2027년 1월부터 12월까지, 1인당 14회기.' },
    { id: 'target', title: '4. 대상', content: '핵심 참여자 72명.' },
    { id: 'budget', title: '8. 예산', content: '총사업비 139,500,000원.' },
    { id: 'indicators', title: '9. 성과지표', content: '완료율 98% 이상.' }
  ];
  const choice = checkProposalAgainstContract({ contract, sections: cite, blueprint: { applicationTypes: { selected: '재학대예방형' } } })
    .results.find(item => item.ruleType === 'CHOICE');
  assert.equal(choice.state, '충족', choice.detail);

  // 다른 유형으로 설계한 문장은 혼입으로 잡는다.
  const mix = [...cite, { id: 'roles', title: '7. 수행체계', content: '아동보호형 대상 요보호아동을 발굴해 양육코칭을 제공한다.' }];
  const mixed = checkProposalAgainstContract({ contract, sections: mix, blueprint: { applicationTypes: { selected: '재학대예방형' } } })
    .results.find(item => item.ruleType === 'CHOICE');
  assert.equal(mixed.state, '불일치', mixed.detail);
});

test('선택한 신청유형이 작성 payload와 게이트에 같은 값으로 간다', () => {
  // 작성 payload: 설계도가 읽은 값을 쓰고, 못 읽었을 때만 계약서 CHOICE로 보완한다.
  assert.match(app, /function resolvedApplicationTypes\(blueprint\)/);
  assert.match(app, /if \(options\.length >= 2\) return \{ options, selected: blueprint\.applicationTypes\.selected \|\| '' \};/);
  assert.match(app, /const choice = \(currentNoticeContract\(\)\?\.rules \|\| \[\]\)\.find\(item => item\.ruleType === 'CHOICE'\);/);
  assert.match(app, /applicationType: types\.selected \|\| '\[확인 필요\]'/);
  assert.match(app, /otherApplicationTypes: types\.options\.filter\(name => name !== types\.selected\)/);
  // 게이트도 같은 값을 본다.
  assert.match(app, /게이트도 작성 payload와 같은 신청유형 값을 본다[\s\S]{0,400}selected: types\.selected/);
  // 설계도는 공고 원문까지 받아 유형을 읽는다.
  assert.match(app, /buildBlueprint\(\{ structure, applicant, fitResult: matchApplicantToNotice\(structure, applicant\), projectValues: blueprintProjectValues\(\), notice: noticeSourceOrPasted\(\) \}\)/);
});

test('앱과 작성 엔진이 실행계약서를 최상위 기준으로 사용한다', () => {
  // 공고 분석 결과 안에 계약서를 함께 저장한다(새 저장소·D1 migration 없음).
  assert.match(app, /contract: buildNoticeContract\(\{ structure, notice \}\)/);
  assert.doesNotMatch(app, /action: 'saveNoticeContract'/);
  assert.match(app, /function currentNoticeContract\(\)/);
  assert.match(app, /function currentSubmissionGate\(\)/);
  // 충돌은 계약서 기준으로 판단한다.
  assert.match(app, /if \(contract\?\.rules\?\.length\) return contractConflicts\(contract, values\);/);
  // BLOCKING이 남으면 최종본 승인을 막는다.
  assert.match(app, /if \(gate\?\.blocking\.length\) \{[\s\S]{0,200}최종본으로 승인할 수 없습니다/);
  // 재설계 경로는 기존 버전을 지우지 않는다.
  assert.match(app, /async function redesignToContract\(\)/);
  assert.match(app, /label: '공고 기준 재설계'/);
  assert.doesNotMatch(app, /proposalVersions = \[\]/);
  // 작성 엔진에 계약서를 직접 넘긴다.
  assert.match(app, /noticeContract: contractHandoff\(\)/);
  assert.match(server, /<NOTICE_CONTRACT>/);
  // 태그는 경계 표시라 그대로 두고, 문장에서는 자료가 이미 쓰는 「공고 실행계약서」로 부른다.
  // 「최상위 NOTICE_CONTRACT는 …」이 계획서 화면에 그대로 인쇄된 일이 있었다.
  assert.match(server, /위 공고 실행계약서는 공고가 이미 정한 조건이며 이번 작성의 최상위 기준이다/);
  assert.match(server, /우선순위: 1\) 공고 실행계약서 2\) 이번 사업 사용자 확정값 3\) 신청기관 확인정보 4\) 사용자 자유입력 5\) AI 제안/);
  assert.match(server, /noticeContract: payload\.noticeContract \|\| null/);
});
