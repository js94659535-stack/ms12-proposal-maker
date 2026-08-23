// 사업 설계 화면(4단계)에도 「다음 할 일」 띠가 있다 (23-04).
//
// 23-02에서 이 화면에는 판정 자체가 없음을 확인했고(갈래 c), 23-03에서 띠 그리는 코드를
// stepBar()·bindNextStepBar() 하나로 모아 두었다. 여기서는 판정만 더해 셋째 띠를 붙인다.
//
// 판정을 새로 계산하지 않는다. 어려운 대목은 buildBlueprint()가 이미 readiness 세 갈래로 냈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DESIGN_STEP_KEYS, nextDesignStep } from '../src/design-next-step.js';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');

// 설계도가 있는 상태를 만든다. 실제 buildBlueprint()가 내는 모양 그대로다.
const plan = (extra = {}) => ({
  verdict: '초안 작성 가능 — 제출 전 3개 항목 확인 필요',
  readiness: 'DRAFT_READY',
  canDraft: true,
  applicationTypes: { options: [{ name: '기초형' }, { name: '심화형' }], selected: '기초형', blocked: false },
  byStatus: { CONFIRMED: 4, SUPPORTED: 2, PROPOSED: 1, NEEDS_CONFIRMATION: 6 },
  submissionChecklist: [{}, {}, {}],
  verdictReasons: ['핵심 설계 항목이 확정되지 않았습니다(초안에는 [확인 필요]로 남습니다): 예산 구조'],
  ...extra
});
const ready = { hasNotice: true, hasStructure: true, hasApplicant: true };

test('여덟 갈래가 정해진 차례로 하나씩 답한다', () => {
  assert.deepEqual([...DESIGN_STEP_KEYS], ['subproject', 'notice', 'analyze', 'applicant', 'conflict', 'type', 'design', 'draft']);

  assert.equal(nextDesignStep({ subprojectCount: 2 }).key, 'subproject');
  assert.equal(nextDesignStep({}).key, 'notice');
  assert.equal(nextDesignStep({ hasNotice: true }).key, 'analyze');
  assert.equal(nextDesignStep({ hasNotice: true, hasStructure: true }).key, 'applicant');
  assert.equal(nextDesignStep({ ...ready, conflictCount: 2, blueprint: plan() }).key, 'conflict');
  assert.equal(nextDesignStep({ ...ready, blueprint: plan({ applicationTypes: { options: [{ name: '기초형' }, { name: '심화형' }], selected: '', blocked: true } }) }).key, 'type');
  assert.equal(nextDesignStep({ ...ready, blueprint: plan({ readiness: 'DESIGN_INCOMPLETE' }) }).key, 'design');
  assert.equal(nextDesignStep({ ...ready, blueprint: plan() }).key, 'draft');
});

test('앞의 것이 먼저다', () => {
  // 세부사업을 고르지 않았으면 나머지를 물어도 소용없다 — 어느 사업의 설계인지 정해지지 않았다.
  assert.equal(nextDesignStep({ ...ready, subprojectCount: 3, conflictCount: 5, blueprint: plan() }).key, 'subproject');
  // 공고가 없으면 분석도 기관도 뜻이 없다.
  assert.equal(nextDesignStep({ hasStructure: true, hasApplicant: true, blueprint: plan() }).key, 'notice');
  // 공고 기준과 어긋난 값은 설계 이야기보다 앞이다 — 고르는 항목이 아니라 맞춰야 하는 값이다.
  assert.equal(nextDesignStep({ ...ready, conflictCount: 1, blueprint: plan({ readiness: 'DESIGN_INCOMPLETE' }) }).key, 'conflict');
});

test('★ 설계도가 없는데 설계 갈래를 묻지 않는다', () => {
  // 5~8은 currentBlueprint()가 값을 내야 판정된다. 그 함수는 공고 구조와 신청기관이
  // 둘 다 있어야 값을 내므로 3·4가 반드시 앞이다. 차례가 어긋나면 없는 값을 읽게 된다.
  for (const state of [
    { hasNotice: true, hasStructure: false, hasApplicant: false },
    { hasNotice: true, hasStructure: true, hasApplicant: false },
    { hasNotice: true, hasStructure: false, hasApplicant: true }
  ]) {
    const step = nextDesignStep({ ...state, blueprint: null, conflictCount: 0 });
    assert.ok(['analyze', 'applicant'].includes(step.key), `설계도 없이 ${step.key}를 물었다`);
  }
  // 부르는 쪽이 차례를 어겨 설계도 없이 여기까지 와도 터지지 않고 앞 갈래로 답한다.
  const broken = nextDesignStep({ ...ready, blueprint: null });
  assert.equal(broken.key, 'analyze');
  assert.equal(broken.done, false);
});

test('어느 상태에서도 띠가 반드시 무엇인가를 가리킨다', () => {
  // 여덟 갈래에 빈 곳이 있으면 띠 없는 화면이 다시 생긴다.
  // canDraft = !blocked 이므로 blocked를 걷어내면 canDraft는 참이고, DESIGN_INCOMPLETE를
  // 걷어내면 남는 것은 DRAFT_READY와 SUBMISSION_READY뿐이라 마지막 갈래가 받는다.
  for (const subprojectCount of [0, 2]) {
    for (const hasNotice of [false, true]) {
      for (const hasStructure of [false, true]) {
        for (const hasApplicant of [false, true]) {
          for (const conflictCount of [0, 3]) {
            for (const blocked of [false, true]) {
              for (const readiness of ['DESIGN_INCOMPLETE', 'DRAFT_READY', 'SUBMISSION_READY']) {
                const blueprint = hasStructure && hasApplicant
                  ? plan({ readiness, canDraft: !blocked, applicationTypes: { options: [{ name: '가' }, { name: '나' }], selected: blocked ? '' : '가', blocked } })
                  : null;
                const step = nextDesignStep({ subprojectCount, hasNotice, hasStructure, hasApplicant, conflictCount, blueprint });
                assert.ok(DESIGN_STEP_KEYS.includes(step.key), `모르는 갈래: ${step.key}`);
                assert.ok(String(step.message || '').trim(), '할 말이 없는 갈래가 있다');
                assert.ok(String(step.actionLabel || '').trim(), '누를 것이 없는 갈래가 있다');
              }
            }
          }
        }
      }
    }
  }
});

test('설계가 덜 됐다는 말이 「막혔다」로 읽히지 않는다', () => {
  // 대원칙 ①. 초안은 지금도 만들어지고 미정인 값은 [확인 필요]로 남는다.
  const step = nextDesignStep({ ...ready, blueprint: plan({ readiness: 'DESIGN_INCOMPLETE' }) });
  assert.match(step.message, /지금 초안을 만들어도 됩니다/);
  assert.match(step.message, /\[확인 필요\]로 남습니다/);
  assert.equal(step.done, false);
  // 몇 개가 남았는지는 설계도가 센 값을 그대로 쓴다.
  assert.match(step.message, /확인이 필요한 설계 항목이 6개 남았습니다/);
  // 갈색 「초안 작성」은 그대로 둔다 — 초록은 설계도로, 갈색은 초안으로 간다.
  assert.equal(step.actionLabel, '설계도에서 답하기');
});

test('다 됐을 때만 done이다', () => {
  assert.equal(nextDesignStep({ ...ready, blueprint: plan({ readiness: 'SUBMISSION_READY' }) }).done, true);
  assert.equal(nextDesignStep({ ...ready, blueprint: plan({ readiness: 'DRAFT_READY' }) }).done, false);
  assert.equal(nextDesignStep({ ...ready, blueprint: plan({ readiness: 'DESIGN_INCOMPLETE' }) }).done, false);
});

test('한 줄 판정을 쓰고 긴 문장 묶음은 쓰지 않는다', () => {
  // verdictReasons는 설계도 패널에 펼쳐 보이려고 만든 여러 문장이라 띠에 넣으면 문단이 된다.
  // 같은 판정에서 나온 한 줄 요약이 verdict이고, 긴 문장은 바로 아래 설계도 카드에 이미 있다.
  const long = '가'.repeat(300);
  const step = nextDesignStep({ ...ready, blueprint: plan({ applicationTypes: { options: [{ name: '기초형' }], selected: '', blocked: true }, verdict: '신청유형 선택 필요 — 기초형 / 심화형 중 하나를 먼저 고르세요', verdictReasons: [long] }) });
  assert.equal(step.message, '신청유형 선택 필요 — 기초형 / 심화형 중 하나를 먼저 고르세요');
  assert.doesNotMatch(step.message, /가{50}/);
  // 어느 갈래도 띠 한 줄을 넘기지 않는다.
  for (const readiness of ['DESIGN_INCOMPLETE', 'DRAFT_READY', 'SUBMISSION_READY']) {
    const one = nextDesignStep({ ...ready, blueprint: plan({ readiness, verdictReasons: [long, long] }) });
    assert.ok(one.message.length < 140, `띠 문구가 ${one.message.length}자다: ${one.message.slice(0, 40)}…`);
  }
});

// ---------- 화면 ----------

test('띠는 제목 줄 바로 아래 하나뿐이고 23-03의 함수를 쓴다', () => {
  const view = app.slice(app.indexOf('function businessSelectView()'), app.indexOf('function applicantStatusTag('));
  assert.match(view, /\[샘플\] 완성 설계도 보기'\)\}<\/div><\/div>\$\{designNextStepBar\(\)\}/);
  const bar = app.slice(app.indexOf('function designNextStepBar()'), app.indexOf('function businessSelectView()'));
  // 띠 HTML을 새로 적지 않는다. 23-03에서 모아 둔 것을 부른다.
  assert.match(bar, /return stepBar\(step, \{/);
  assert.doesNotMatch(bar, /class="next-step-bar/);
  assert.match(bar, /id: 'design-step-bar',/);
  assert.match(bar, /actionId: 'design-step-action',/);
  assert.match(bar, /data: \{ 'design-key': step\.key \}/);
  // 판정은 한 곳에서 온다.
  const judge = app.slice(app.indexOf('function designStepInfo()'), app.indexOf('function designNextStepBar()'));
  assert.match(judge, /return nextDesignStep\(\{/);
  assert.doesNotMatch(judge, /if \(/);
});

test('설계도는 판정 앞에서 한 번만 만든다', () => {
  // currentBlueprint()가 null이면 판정이 앞 갈래로 답한다. 화면이 미리 따지지 않는다.
  const judge = app.slice(app.indexOf('function designStepInfo()'), app.indexOf('function designNextStepBar()'));
  assert.match(judge, /const blueprint = currentBlueprint\(\);/);
  assert.match(judge, /hasStructure: Boolean\(state\.noticeLogic\?\.structure\),/);
  assert.match(judge, /hasApplicant: Boolean\(selectedApplicant\(\)\),/);
  assert.match(judge, /conflictCount: currentOfficialConflicts\(\)\.length,/);
});

test('갈래마다 데려가는 곳이 있다', () => {
  const handler = app.slice(app.indexOf("bindNextStepBar('design-step-action'"), app.indexOf("bindNextStepBar('pick-step-action'"));
  // 이 화면에서 할 수 없는 일은 앞 단계로 돌려보낸다.
  assert.match(handler, /if \(key === 'notice' \|\| key === 'analyze'\) return \{ act: \(\) => navigateToStep\(1,/);
  assert.match(handler, /if \(key === 'applicant'\) return \{ act: \(\) => navigateToStep\(2,/);
  // 나머지 다섯은 이 화면 안의 자리로 데려간다.
  for (const [key, anchor] of [['subproject', '#subproject-choice'], ['conflict', '#notice-contract-locks'], ['type', '#blueprint-type'], ['design', '#project-blueprint'], ['draft', '#blueprint-draft']]) {
    assert.ok(handler.includes(`${key}: '${anchor}'`), `${key}가 데려갈 자리가 없다`);
  }
  // 그 자리들이 화면에 실제로 있다. 없는 곳으로 데려가면 아무 일도 일어나지 않는다.
  assert.match(app, /<div class="card" id="subproject-choice" tabindex="-1">/);
  assert.match(app, /<div class="card" id="notice-contract-locks">/);
  assert.match(app, /<div class="card-title" id="blueprint-type" tabindex="-1"/);
  assert.match(app, /<div class="card" id="project-blueprint">/);
  assert.match(app, /id="blueprint-draft"/);
});

test('스크롤 도우미가 세 화면의 띠를 모두 본다', () => {
  // 23-03에서는 기관정보 화면의 판정만 읽고 있었다. 이제 그려진 띠에게 묻는다.
  const scroll = app.slice(app.indexOf('function scrollToNextStep()'), app.indexOf('// 소개 화면에는 폼이 없다'));
  assert.match(scroll, /querySelector\('#next-step-action, #pick-step-action, #design-step-action'\)/);
  assert.doesNotMatch(scroll, /orgStepInfo\(\)/);
  // 띠로는 데려가지 않는다 — 띠는 이미 화면 맨 위라 제자리걸음이다.
  assert.match(scroll, /const target = document\.querySelector\('\.go-target'\) \|\| document\.querySelector\('\.go-place'\);/);
});
