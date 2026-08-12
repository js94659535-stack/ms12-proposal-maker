// 한 번에 수정 요청과 수정 2회 규칙.
// 핵심은 「AI가 실패한 것을 회원이 물지 않는다」와 「요청하지 않은 것은 그대로 둔다」이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUOTA, REVISION_KINDS, TOTAL_QUOTA, canRevise, consistencyTargets, diffSections,
  isNewPlanRequest, keptFacts, newUnknowns, remainingOf, revisionSlot, settleRevision
} from '../server/revision.js';

const counted = slot => ({ slot, counted: true });

test('수정 선택지는 여섯 가지다', () => {
  assert.deepEqual(REVISION_KINDS.map(item => item.key), ['add', 'direction', 'length', 'tone', 'numbers', 'free']);
  assert.equal(TOTAL_QUOTA, 2);
  assert.deepEqual(QUOTA, { direction: 1, polish: 1 });
});

test('문체·분량은 다듬기, 나머지는 방향 수정으로 센다', () => {
  assert.equal(revisionSlot('tone'), 'polish');
  assert.equal(revisionSlot('length'), 'polish');
  for (const kind of ['add', 'direction', 'numbers', 'free']) assert.equal(revisionSlot(kind), 'direction');
});

test('두 번까지 쓰고 그다음은 이유와 대안을 알려 준다', () => {
  assert.equal(canRevise({ kind: 'direction', history: [] }).allowed, true);
  const afterOne = [counted('direction')];
  // 방향을 이미 썼으면 다듬기 칸으로 넘어간다.
  const second = canRevise({ kind: 'direction', history: afterOne });
  assert.equal(second.allowed, true);
  assert.equal(second.slot, 'polish');
  // 두 번 다 쓰면 막되, 직접 편집은 계속할 수 있다고 말한다.
  const third = canRevise({ kind: 'tone', history: [counted('direction'), counted('polish')] });
  assert.equal(third.allowed, false);
  assert.equal(third.reason, 'quota');
  assert.match(third.message, /직접 편집은 계속할 수 있고/);
  assert.equal(third.action, '직접 편집하기');
  assert.deepEqual(remainingOf([counted('direction')]), { direction: 0, polish: 1, total: 1 });
});

test('AI가 실패하거나 결과가 없으면 횟수를 깎지 않는다', () => {
  assert.equal(settleRevision({ ok: false }).counted, false);
  assert.equal(settleRevision({ ok: true, changedSections: 0 }).counted, false);
  // 결과가 나와도 저장되지 않았으면 깎지 않는다.
  assert.equal(settleRevision({ ok: true, changedSections: 3, saved: false }).counted, false);
  // 시스템 복구·오탈자·직접 편집도 깎지 않는다.
  for (const reason of ['recovery', 'typo', 'manual']) {
    const result = settleRevision({ ok: true, changedSections: 2, saved: true, freeReason: reason });
    assert.equal(result.counted, false, reason);
    assert.ok(result.note.length > 0);
  }
  // 제대로 만들어져 저장됐을 때만 깎는다.
  assert.equal(settleRevision({ ok: true, changedSections: 2, saved: true }).counted, true);
});

test('실패가 이어져도 남은 횟수가 줄지 않는다', () => {
  const history = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const gate = canRevise({ kind: 'direction', history });
    assert.equal(gate.allowed, true, `${attempt}번째 시도`);
    history.push(settleRevision({ slot: gate.slot, ok: false }));
  }
  assert.deepEqual(remainingOf(history), { direction: 1, polish: 1, total: 2 });
});

test('전부 바꾸는 요청은 수정이 아니라 새 계획서로 안내한다', () => {
  assert.equal(isNewPlanRequest({ text: '처음부터 다시 써 주세요' }), true);
  assert.equal(isNewPlanRequest({ text: '다른 공고로 바꿔 주세요' }), true);
  assert.equal(isNewPlanRequest({ changesNotice: true }), true);
  assert.equal(isNewPlanRequest({ kind: 'direction', text: '대상과 목적과 사업을 모두 바꾸고 싶어요' }), true);
  // 부분 수정은 그대로 받는다.
  assert.equal(isNewPlanRequest({ kind: 'direction', text: '대상을 초등 고학년으로 넓혀 주세요' }), false);
  const blocked = canRevise({ kind: 'direction', text: '처음부터 다시', history: [] });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'newPlan');
  assert.equal(blocked.action, '새 계획서 만들기');
});

test('바뀐 항목과 유지된 항목을 함께 보여 준다', () => {
  const before = [
    { id: 'a', title: '사업 필요성', content: '방과후 돌봄 공백이 있습니다.' },
    { id: 'b', title: '예산', content: '3천만원' }
  ];
  const after = [
    { id: 'a', title: '사업 필요성', content: '방과후 돌봄 공백이 있습니다. 통계로 확인했습니다.' },
    { id: 'b', title: '예산', content: '3천만원' }
  ];
  const diff = diffSections(before, after);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].title, '사업 필요성');
  // 요청하지 않은 항목은 그대로다.
  assert.deepEqual(diff.kept, ['예산']);
  assert.deepEqual(diff.removed, []);
});

test('사라진 항목과 새로 생긴 확인 필요를 잡아낸다', () => {
  const before = [{ id: 'a', title: '가', content: '내용' }, { id: 'b', title: '나', content: '내용' }];
  const after = [{ id: 'a', title: '가', content: '내용 [확인 필요: 인원]' }];
  const diff = diffSections(before, after);
  assert.deepEqual(diff.removed, ['나']);
  // 근거 없는 수치를 새로 만들지 않고 확인 필요로 남긴 것을 센다.
  assert.equal(newUnknowns(before, after), 1);
});

test('확인된 사실이 수정본에서 사라지면 알려 준다', () => {
  const facts = ['사회복지사 4명', '2025년 12회기 운영'];
  const after = [{ id: 'a', title: '수행인력', content: '사회복지사 4명이 맡습니다.' }];
  const result = keptFacts(facts, after);
  assert.deepEqual(result.kept, ['사회복지사 4명']);
  assert.deepEqual(result.lost, ['2025년 12회기 운영']);
});

test('일관성 검사 대상을 본문에서 찾는다', () => {
  const sections = [{ title: '사업내용', content: '대상 30명 · 활동 주 2회 · 일정 3~12월 · 인력 2명 · 예산 3천만원 · 성과지표 만족도' }];
  assert.deepEqual(consistencyTargets(sections), ['대상', '활동', '일정', '인력', '예산', '성과지표']);
});

// ---------- 간편 작성 흐름 ----------
import { ANSWER_CHOICES, HIDDEN_EXPERT, MAX_QUESTIONS, RESULT_ACTIONS, SIMPLE_STEPS, answerValue, currentStep, viewModeFor } from '../server/simple-flow.js';

test('일반회원에게는 네 걸음만 보인다', () => {
  assert.deepEqual(SIMPLE_STEPS.map(item => item.label), ['공고 찾기', '공고 선택', '한 줄 작성 요청', '계획서 완성']);
});

test('전문 기능은 지우지 않고 접어 둔다', () => {
  for (const item of ['공고 분석과 강제조건', '사업 설계안과 승인', '사실검증과 평가자 검토']) {
    assert.ok(HIDDEN_EXPERT.includes(item), item);
  }
});

test('역할마다 기본 화면이 다르고 최고관리자만 자유롭게 오간다', () => {
  const member = viewModeFor({ role: 'customer' });
  assert.equal(member.mode, 'simple');
  assert.equal(member.canToggle, false, '일반회원은 전문가 화면으로 바꾸지 않는다');
  const admin = viewModeFor({ role: 'admin' });
  assert.equal(admin.mode, 'expert');
  assert.equal(admin.canToggle, true);
  // 최고관리자는 회원 화면으로 바로 바꿔 볼 수 있다.
  assert.equal(viewModeFor({ role: 'admin' }, 'simple').mode, 'simple');
  const operator = viewModeFor({ role: 'operator' });
  assert.equal(operator.mode, 'simple');
  assert.match(operator.reason, /허용된 범위/);
  // 일반회원이 값을 넣어도 바뀌지 않는다. 화면만이 아니라 서버가 따로 막는다.
  assert.equal(viewModeFor({ role: 'customer' }, 'expert').mode, 'simple');
});

test('지금 어느 걸음인지 실제 상태에서 읽는다', () => {
  assert.equal(currentStep({}), 'find');
  assert.equal(currentStep({ noticeChosen: true }), 'ask');
  assert.equal(currentStep({ noticeChosen: true, requestWritten: true }), 'ask');
  assert.equal(currentStep({ noticeChosen: true, requestWritten: true, sections: 8 }), 'done');
});

test('완성 뒤에는 다섯 가지만 먼저 크게 보여 준다', () => {
  assert.deepEqual(RESULT_ACTIONS.map(item => item.label),
    ['계획서 확인', '한 번에 수정 요청', '저장', 'PDF·DOCX 받기', '전문 검토 보기']);
});

test('모르면 넘어갈 수 있고 추천값도 사실로 굳히지 않는다', () => {
  assert.equal(MAX_QUESTIONS, 3);
  assert.deepEqual(ANSWER_CHOICES.map(item => item.label), ['AI 추천안 사용', '아직 모르겠어요', '나중에 확인']);
  // 추천값은 들어가되 확인 전에는 표시가 붙는다.
  const suggested = answerValue('suggest', '주 2회 12회기');
  assert.equal(suggested.value, '주 2회 12회기');
  assert.equal(suggested.confirmed, false);
  assert.match(suggested.mark, /확인 필요/);
  // 모르겠다고 하면 값을 만들지 않는다.
  assert.equal(answerValue('unknown').value, '');
  assert.equal(answerValue('later').askAgain, true);
});
