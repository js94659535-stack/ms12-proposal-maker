// 검증 결과 총론·각론. 같은 문제를 세 번 만들지 않고, 총론에 점수를 지어내지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TOP_ISSUE_LIMIT, buildOverview, detailPanels, issueKey, mergeReviewIssues } from '../server/review-digest.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

// 같은 문제(대상 인원 불일치)가 세 영역에 각각 적혀 온 검증 결과.
const RESULT = {
  basis: 'common-criteria',
  overallStatus: '보완 필요',
  summary: '확정값이 서로 어긋납니다.',
  checkedAreas: ['대상·인원', '사업기간', '예산', '성과지표'],
  issues: [
    {
      category: '대상 인원 불일치', priority: '최우선 경고', riskType: 'core-conflict',
      location: '2. 사업 목표', reason: '목표는 30명, 활동은 45명입니다.', direction: '한 숫자로 맞추세요.',
      example: '목표·활동·예산의 인원을 30명으로 통일합니다.',
      evidenceRefs: [{ sourceName: '계획서', excerpt: '연 30명에게 제공', verified: true }],
      requiresConfirmation: false
    },
    {
      category: '사업연도 충돌', priority: '최우선 경고', riskType: 'submission',
      location: '표지', reason: '표지는 2026년, 본문은 2027년입니다.', direction: '공고 연도로 맞추세요.',
      example: '2027년으로 통일합니다.', evidenceRefs: [], requiresConfirmation: true
    },
    {
      category: '원문 미완결', priority: '주요 개선', riskType: 'evidence',
      location: '4. 추진 일정', reason: '문장이 끝나지 않았습니다.', direction: '문장을 완결하세요.',
      example: '“…운영한다.”로 끝맺습니다.', evidenceRefs: [], requiresConfirmation: false
    }
  ],
  finalChecks: [
    { area: '대상·인원', status: '보완필요', detail: '목표와 활동의 인원이 다릅니다.', action: '한 숫자로 맞추세요.', evidenceRefs: [] },
    { area: '사업기간', status: '충족', detail: '', action: '', evidenceRefs: [] },
    { area: '예산 합계·예산규정', status: '충족', detail: '', action: '', evidenceRefs: [] }
  ],
  evaluationMatrix: [
    { criterion: '대상 인원 불일치', officialPoints: '', requirement: '대상 인원이 일관돼야 합니다.', proposalLocations: ['2. 사업 목표'], status: '부족', gap: '숫자를 맞추세요.', evidenceRefs: [] },
    { criterion: '성과지표', officialPoints: '20점', requirement: '측정도구를 적어야 합니다.', proposalLocations: ['5. 성과'], status: '충족', gap: '', evidenceRefs: [] }
  ],
  comparison: { previousVersion: 0, resolvedIssues: [], remainingIssues: [], newIssues: [], improvedAreas: [] }
};

test('같은 문제를 세 영역에서 따로 만들지 않는다', () => {
  const merged = mergeReviewIssues(RESULT, []);
  // 들어온 판정은 8건(문제 3 + 점검 3 + 평가 2), 합친 뒤에는 문제 4건이다.
  assert.equal(merged.before, 8);
  assert.equal(merged.after, 3);
  assert.equal(merged.removed, 5);
  const names = merged.issues.map(item => item.name);
  assert.equal(names.filter(name => name.includes('대상')).length, 1, '대상 인원 문제가 하나로 합쳐지지 않았다');
});

test('합칠 때 근거와 평가기준을 버리지 않는다', () => {
  const merged = mergeReviewIssues(RESULT, []);
  const people = merged.issues.find(item => item.name.includes('대상 인원'));
  assert.ok(people.from.includes('개선 작업판'), people.from.join(','));
  assert.ok(people.from.includes('제출 전 필수 점검'), people.from.join(','));
  assert.ok(people.from.includes('평가기준 대응표'), people.from.join(','));
  assert.equal(people.evidence.length, 1);
  assert.equal(people.evidence[0].excerpt, '연 30명에게 제공');
  assert.equal(people.priority, '최우선 경고');
  assert.ok(people.risk, '위험 이유가 비었다');
  assert.ok(people.howTo, '수정 방법이 비었다');
});

test('이미 손댄 상태는 다시 그려도 이어진다', () => {
  const merged = mergeReviewIssues(RESULT, [{ status: '해결' }, { status: '확인필요' }, { status: '미수정' }]);
  const people = merged.issues.find(item => item.name.includes('대상 인원'));
  assert.equal(people.status, '해결');
});

test('이름과 위치가 조금 달라도 같은 문제로 본다', () => {
  assert.equal(issueKey('대상 인원 불일치', '2. 사업 목표'), issueKey('대상인원 불일치!', '2 사업 목표'));
  assert.notEqual(issueKey('대상 인원 불일치', '2. 사업 목표'), issueKey('예산 초과', '3. 예산'));
});

test('총론은 잘된 점부터 적고 점수를 지어내지 않는다', () => {
  const merged = mergeReviewIssues(RESULT, []);
  const overview = buildOverview({ result: RESULT, issues: merged.issues, references: [], sectionCount: 10 });
  assert.ok(overview.strengths.length >= 1);
  assert.match(overview.strengths[0], /검증할 수 있었습니다|충족/);
  // 합격확률·점수는 만들지 않는다.
  const dump = JSON.stringify({ ...overview, verdict: { ...overview.verdict, note: '' } });
  assert.ok(!/합격\s*확률|당선\s*확률|\d+\s*점\s*예상|점수\s*:/.test(dump), dump.slice(0, 120));
  assert.match(overview.verdict.note, /합격 확률을 계산하지 않습니다/);
});

test('공식 평가기준이 없다는 한계를 총론에 적는다', () => {
  const merged = mergeReviewIssues(RESULT, []);
  const overview = buildOverview({ result: RESULT, issues: merged.issues, references: [], sectionCount: 10 });
  assert.equal(overview.scope.officialProvided, false);
  assert.match(overview.scope.basisLabel, /공식 평가표 없음/);
  assert.ok(overview.unconfirmed.some(line => /공식 평가표/.test(line)), overview.unconfirmed.join(' | '));
  assert.match(overview.coverage.limit, /배점 대비 충족도는 판정하지 못했습니다/);
});

test('핵심 문제는 다섯 건까지 중요도 순으로 보여 준다', () => {
  const merged = mergeReviewIssues(RESULT, []);
  const overview = buildOverview({ result: RESULT, issues: merged.issues, references: [], sectionCount: 10 });
  assert.ok(overview.top.length <= TOP_ISSUE_LIMIT);
  assert.equal(overview.top[0].priority, '최우선 경고');
  const names = overview.top.map(item => item.name).join(' | ');
  for (const expected of ['대상 인원 불일치', '사업연도 충돌', '원문 미완결']) {
    assert.ok(names.includes(expected), `${expected}가 핵심 문제에 없다: ${names}`);
  }
  assert.match(overview.order[0], /최우선 경고 2건을 먼저 고칩니다/);
  assert.equal(overview.next, '우선 문제부터 수정하기');
});

test('각론은 여섯 영역이고 제목에 건수가 붙는다', () => {
  const merged = mergeReviewIssues(RESULT, []);
  const panels = detailPanels({ result: RESULT, issues: merged.issues, references: [] });
  assert.deepEqual(panels.map(item => item.key), ['checks', 'sections', 'matrix', 'references', 'evidence', 'work']);
  assert.equal(panels.find(item => item.key === 'checks').count, 1);
  assert.equal(panels.find(item => item.key === 'matrix').count, 1);
  assert.equal(panels.find(item => item.key === 'work').count, 3);
});

test('화면은 총론을 먼저 그리고 각론은 눌러야 편다', () => {
  assert.match(app, /function coachingOverviewView\(/);
  assert.match(app, /id="coaching-fix-first"/);
  assert.match(app, /id="coaching-detail-toggle"/);
  // 각론은 상태가 켜졌을 때만 그린다.
  assert.match(app, /state\.reviewDetail \? coachingDetailView\(/);
  // 각론을 폈는지는 저장하지 않는다. 다음에 들어와도 총론부터 본다.
  assert.match(app, /const safe = \{ \.\.\.state, reviewDetail: false, reviewPanels: \[\], reviewFocus: false,/);
  // 펼치기·접기는 화면 값만 바꾼다. AI를 다시 부르지 않는다.
  const handler = app.match(/#coaching-detail-toggle'\)[^\n]*\n/)?.[0] || '';
  assert.ok(handler.includes('setState'), handler);
  for (const forbidden of ['runCoaching', 'preciseReviewWithAI', 'coachingWithAI', 'await ']) {
    assert.ok(!handler.includes(forbidden), `펼치기에서 ${forbidden}를 부르면 안 된다`);
  }
});

test('검증이 끝나면 종합소견서가 화면 맨 위에 온다', () => {
  const view = app.slice(app.indexOf('function coachingView() {'), app.indexOf('function proposalStructureView'));
  // 결과가 있으면 총론이 입력칸보다 먼저 그려진다. 스크롤해야 판정을 보는 일이 없게 한다.
  assert.ok(view.indexOf('coachingResultView(result)') < view.indexOf('id="coaching-inputs"'), '총론이 입력칸보다 뒤에 있다');
  // 입력칸은 사라지지 않는다. 다시 검증하려면 펴서 그대로 쓴다.
  assert.match(view, /계획서·기준 다시 넣기/);
  assert.match(view, /\$\{result \? `<details class="card" id="coaching-inputs">/);
  assert.match(view, /: inputBlock\}/, '결과가 없으면 입력칸이 그대로 열려 있어야 한다');
  // 수정계획·신청기관 반영도 각론과 함께 열고 닫는다.
  assert.match(view, /result && state\.reviewDetail \? repairPlanView\(\) : ''/);
});
