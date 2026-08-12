// 간단 시작 흐름과 「막힌 버튼 대신 안내」. 회색 버튼으로 이유 없이 막지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ORG_TYPES, QUICK_FIELDS, UNKNOWN_PREFIX, followUpQuestions, quickFacts, quickToApplicantItems, readyToDraft } from '../server/quick-org.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// ---------- 간단 기관정보 ----------

test('처음에는 다섯 가지만 받는다', () => {
  assert.equal(QUICK_FIELDS.length, 5);
  assert.deepEqual(QUICK_FIELDS.map(field => field.key), ['orgName', 'orgType', 'contact', 'served', 'strength']);
  // 필수는 셋뿐이다. 강점·대상은 건너뛸 수 있다.
  assert.deepEqual(QUICK_FIELDS.filter(field => field.required).map(field => field.key), ['orgName', 'orgType', 'contact']);
  assert.ok(ORG_TYPES.includes('지역아동센터') && ORG_TYPES.includes('가족센터') && ORG_TYPES.includes('학교'));
});

test('세 가지만 적어도 초안을 시작한다', () => {
  assert.equal(readyToDraft({ orgName: '햇살센터', orgType: '지역아동센터', contact: '김담당 010-0000-0000' }).ready, true);
  const notReady = readyToDraft({ orgName: '햇살센터' });
  assert.equal(notReady.ready, false);
  // 무엇이 부족한지 이름으로 알려 준다.
  assert.deepEqual(notReady.missing, ['기관 유형', '담당자 이름과 연락처']);
});

test('적지 않은 인력·시설·실적·예산은 만들지 않고 확인 필요로 남는다', () => {
  const facts = quickFacts({ orgName: '햇살센터', orgType: '지역아동센터', contact: '김담당' });
  assert.equal(facts.orgName, '햇살센터');
  for (const key of ['staff', 'facilities', 'partners', 'performance', 'budget']) {
    assert.ok(facts[key].startsWith(UNKNOWN_PREFIX), key);
  }
  // 적지 않은 대상·강점도 지어내지 않는다.
  assert.ok(facts.served.startsWith(UNKNOWN_PREFIX));
  assert.ok(facts.strength.startsWith(UNKNOWN_PREFIX));
});

test('간단 입력은 신청기관 항목으로 옮겨지되 확인 전까지 확정되지 않는다', () => {
  const items = quickToApplicantItems({ orgName: '햇살센터', orgType: '지역아동센터', contact: '김담당', strength: '돌봄 12년' });
  assert.equal(items.length, 4);
  assert.ok(items.every(item => item.status === '확인 필요'));
  assert.ok(items.every(item => item.source === '간단 입력(회원 작성)'));
  // 적지 않은 항목은 만들지 않는다.
  assert.ok(!items.some(item => item.label === '주로 돕는 대상'));
});

test('추가 질문은 공고가 실제로 요구할 때만, 한 번에 세 개까지 묻는다', () => {
  const noticeText = '신청기관은 수행인력 현황과 최근 3년 사업실적, 자부담 예산 계획을 제출해야 합니다.';
  const asked = followUpQuestions({ noticeText, answers: {} });
  assert.equal(asked.length, 3);
  assert.deepEqual(asked.map(item => item.key).sort(), ['budget', 'performance', 'staff']);
  // 이미 답한 것은 다시 묻지 않는다.
  const again = followUpQuestions({ noticeText, answers: { staff: '사회복지사 2명' } });
  assert.ok(!again.some(item => item.key === 'staff'));
  // 공고가 요구하지 않으면 묻지 않는다.
  assert.equal(followUpQuestions({ noticeText: '자유롭게 제안해 주세요.', answers: {} }).length, 0);
});

// ---------- 막힌 버튼 대신 안내 ----------

test('처리 중이 아닌 이유로 버튼을 회색으로 막지 않는다', () => {
  // 안내 장치가 있다.
  assert.match(app, /function guard\(reason = '', goto = ''\)/);
  assert.match(app, /function explainBlocked\(reason, goto = ''\)/);
  // 누르면 실행 대신 안내로 이어진다.
  assert.match(app, /document\.querySelectorAll\('\[data-blocked\]'\)/);
  assert.match(app, /event\.stopImmediatePropagation\(\)/);
});

test('전체 계획서 작성은 눌리고, 설계 미확정이면 설계 확인으로 이어진다', () => {
  // 버튼에 disabled가 붙지 않는다.
  assert.ok(!app.includes(`id="generate-proposal" ${'${'}generationPermission().allowed ? '' : 'disabled'}`));
  assert.match(app, /id="generate-proposal" \$\{guard\(generationPermission\(\)\.allowed \? '' : generationPermission\(\)\.reason, 'design'\)\}/);
  // 설계 확인 화면으로 옮기는 길이 있다.
  assert.match(app, /design: \(\) => \{ setState\(\{ activeTool: 'engagement'/);
  // 실행 경로는 그대로 막는다. 화면만 열어 주고 생성은 하지 않는다.
  assert.match(app, /const permission = generationPermission\(\);\s*\n\s*if \(!permission\.allowed\) return setState\(\{ error: permission\.reason \}\);/);
});

test('출력과 초안 버튼도 이유를 알려 준다', () => {
  assert.match(app, /id="package-docx" \$\{guard\(exportBlock \|\|/);
  assert.match(app, /id="package-pdf" \$\{guard\(exportBlock \|\|/);
  assert.match(app, /id="blueprint-draft" \$\{guard\(blueprint\.canDraft \? '' :/);
});

test('처리 중 중복 클릭 방지는 그대로 둔다', () => {
  // busy·checking·페이지 경계는 실제로 잠근다. 이것까지 풀면 두 번 눌린다.
  assert.match(app, /\$\{auth\.busy \? 'disabled' : ''\}/);
  assert.match(app, /\$\{state\.busy \? 'disabled' : ''\}/);
});

test('설계안 확인 요청은 값이 비어 있어도 막지 않는다', () => {
  // 예전에는 여기서 거절해 공고를 고르고도 작성으로 갈 수 없었다.
  const fn = app.slice(app.indexOf('function requestDesignReview()'), app.indexOf('function startDesignReview()'));
  assert.ok(!fn.includes('아직 설계안에 담을 내용이 없습니다'), '거절 경로를 없앤다');
  assert.match(fn, /setDesignApproval\(\{ requestedAt/);
  // 비어 있는 값은 [확인 필요]로 남는다고 알려 준다.
  assert.match(fn, /\[확인 필요\]로 남습니다/);
});

test('신청기관을 찾을 때 목록을 넘긴다', () => {
  // state를 통째로 넘기면 언제나 못 찾아 「기관을 정해 주세요」가 계속 떴다.
  assert.ok(!app.includes('findApplicant(state, '), 'findApplicant에는 목록을 넘긴다');
});

test('간단 시작은 신청기관 기록을 제대로 만든다', () => {
  const fn = app.slice(app.indexOf('async function saveQuickOrg()'), app.indexOf('function applicantsToolView()'));
  // buildApplicantOrganization은 계획서에 넘길 자료를 만드는 함수라 여기 쓰면 빈 기관이 된다.
  assert.ok(!fn.includes('buildApplicantOrganization'), '기관 생성에는 normalizeApplicant를 쓴다');
  assert.match(fn, /normalizeApplicant\(\{ name: draft\.orgName, items \}\)/);
  assert.match(fn, /selectedApplicantId: applicant\.id, applicantEditingId: applicant\.id/);
});
