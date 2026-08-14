// 한 번에 얼마나 쓸지. 항목·순서·문구는 그대로 두고 묶음 경계만 목표 분량으로 다시 잡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROPOSAL_OUTLINE } from '../src/engagement.js';
import { SAFE_CHARS, SMALL_CHARS, balanceSummary, groupSizes, rebalanceGroups } from '../src/group-balance.js';

const outline = PROPOSAL_OUTLINE;
const plan = [
  { id: 'g1', title: '필요성과 목적', sectionKeys: ['necessity', 'purpose'] },
  { id: 'g2', title: '대상과 목표', sectionKeys: ['target', 'goals'] },
  { id: 'g3', title: '세부내용과 일정', sectionKeys: ['programs', 'schedule'] },
  { id: 'g4', title: '수행체계', sectionKeys: ['roles'] }
];

test('묶음별 목표 분량을 목차에서 그대로 읽는다', () => {
  const sizes = groupSizes(plan, outline);
  assert.equal(sizes[0].chars, 1400); // 900 + 500
  assert.equal(sizes[2].chars, 2000); // 1400 + 600
  assert.ok(sizes[0].tokens > 0);
});

test('큰 묶음은 쪼개고 항목은 하나도 잃지 않는다', () => {
  const big = [{ id: 'all', title: '전체', sectionKeys: ['necessity', 'purpose', 'goals', 'target', 'programs', 'schedule', 'roles'] }];
  const result = rebalanceGroups(big, outline, { safeChars: 2000 });
  assert.equal(result.changed, true);
  assert.ok(result.groups.length >= 3, '한 덩어리를 여러 묶음으로 나눈다');
  // 항목과 순서가 그대로다.
  assert.deepEqual(result.groups.flatMap(group => group.sectionKeys), big[0].sectionKeys);
  // 어느 묶음도 한도를 넘지 않는다(한 항목이 통째로 한도를 넘는 경우는 예외).
  for (const size of groupSizes(result.groups, outline)) {
    assert.ok(size.chars <= 2000 || size.keys.length === 1, `${size.title} ${size.chars}자`);
  }
});

test('너무 작은 묶음은 옆과 합쳐 호출 수를 줄인다', () => {
  const tiny = [
    { id: 'a', title: '목적', sectionKeys: ['purpose'] },
    { id: 'b', title: '목표', sectionKeys: ['goals'] },
    { id: 'c', title: '세부 프로그램', sectionKeys: ['programs'] }
  ];
  const result = rebalanceGroups(tiny, outline, { safeChars: 5000, smallChars: 700 });
  assert.equal(result.groups.length, 2, '작은 둘을 합치고 큰 하나는 그대로 둔다');
  assert.deepEqual(result.groups.flatMap(group => group.sectionKeys), ['purpose', 'goals', 'programs']);
});

test('작은 꼬리 묶음은 앞과 합쳐 호출을 줄인다', () => {
  // 수행체계 700자는 기준(1,200자)보다 작아 앞 묶음과 합쳐진다. 4묶음 → 3묶음, 호출 한 번이 준다.
  const result = rebalanceGroups(plan, outline);
  assert.equal(result.changed, true);
  assert.equal(result.groups.length, 3);
  assert.deepEqual(result.groups.flatMap(group => group.sectionKeys), plan.flatMap(group => group.sectionKeys));
});

test('모든 묶음이 적당한 크기면 손대지 않는다', () => {
  const even = [
    { id: 'a', title: '앞', sectionKeys: ['necessity', 'purpose'] },   // 1,400
    { id: 'b', title: '가운데', sectionKeys: ['target', 'goals'] },     // 1,300
    { id: 'c', title: '뒤', sectionKeys: ['programs'] }                 // 1,400
  ];
  const result = rebalanceGroups(even, outline);
  assert.equal(result.changed, false);
  assert.deepEqual(result.groups.map(group => group.id), even.map(group => group.id));
});

test('분할 정보가 없으면 손대지 않는다', () => {
  assert.equal(rebalanceGroups([], outline).changed, false);
  assert.equal(rebalanceGroups(null, outline).changed, false);
});

test('무엇이 달라지는지 숫자로 알려 준다', () => {
  const big = [{ id: 'all', title: '전체', sectionKeys: ['necessity', 'purpose', 'goals', 'target', 'programs', 'schedule', 'roles'] }];
  const after = rebalanceGroups(big, outline, { safeChars: 2000 }).groups;
  const summary = balanceSummary(big, after, outline);
  assert.equal(summary.before, 1);
  assert.ok(summary.after > 1);
  assert.ok(summary.maxAfter < summary.maxBefore);
  assert.ok(SAFE_CHARS > SMALL_CHARS);
});

test('설계 결과에 실제로 적용하고 무엇이 바뀌었는지 남긴다', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /const balanced = rebalanceGroups\(result\.sectionPlan, outline\);/);
  assert.match(app, /if \(balanced\.changed\) result\.sectionPlan = balanced\.groups;/);
  // 무엇이 조정됐는지 상태와 화면에 남긴다.
  assert.match(app, /balance,/);
  assert.match(app, /state\.stagedGeneration\.balance\.reason/);
});
