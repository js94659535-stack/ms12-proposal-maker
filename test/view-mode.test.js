// 역할별 기본 화면과 간편·전문 전환. 화면만 바뀌고 작성 내용은 그대로 남는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { viewModeFor } from '../server/simple-flow.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('일반회원의 기본 화면은 홈 자리에서도 간편 작성이다', () => {
  assert.match(app, /function showSimpleHome\(\) \{ return viewMode\(\) === 'simple' && !state\.expertDetail && \['', 'home'\]\.includes\(state\.activeTool\); \}/);
  assert.match(app, /if \(showSimpleHome\(\)\) \{ app\.innerHTML = shell\(simpleWriteView\(\)\); bind\(\); bindSimple\(\); fitAutoGrow\(\); void loadAiJobs\(\); void resumeDesignJob\(\); return; \}/);
  // 간편 화면에서도 머리띠(보관함·계정·포털 이동)가 사라지지 않는다.
  assert.match(app, /if \(state\.activeTool === 'home' && !showSimpleHome\(\)\) return/);
});

test('최고관리자의 기본 화면은 관리자 랜딩이고 회원 화면으로 바뀌지 않는다', () => {
  // 관리자 포털 홈 판정이 간편 화면 판정보다 먼저 걸린다.
  assert.ok(app.indexOf("if (inAdminPortal() && state.activeTool === 'home')") < app.indexOf('if (showSimpleHome())'));
  assert.equal(viewModeFor({ role: 'admin' }).mode, 'expert');
});

test('지금 어느 화면을 보고 있는지 화면 위에 적는다', () => {
  assert.match(app, /function viewModeBadge\(\) \{/);
  assert.match(app, /const label = simple \? '회원 화면\(간편\)' : '전문가 상세';/);
  // 머리띠 아래 한 곳에서만 그린다. 두 번 그리면 같은 줄이 겹쳐 보인다.
  assert.match(app, /\$\{viewModeBadge\(\)\}\s*\n\s*\$\{aiResultBanner\(\)\}/);
  assert.equal((app.match(/\$\{viewModeBadge\(\)\}/g) || []).length, 1);
});

test('전환해도 고른 공고·기관·작성 중인 계획서·단계가 남는다', () => {
  // 전환 처리기는 화면 값만 바꾼다. sections·selectedNotice·selectedApplicantId·step을 건드리지 않는다.
  const handlers = [
    app.match(/document\.querySelector\('#toggle-view'\)[^\n]*\n/)?.[0] || '',
    app.match(/document\.querySelector\('#back-to-simple'\)[^\n]*\n/)?.[0] || '',
    app.match(/document\.querySelector\('#open-expert-detail'\)[^\n]*\n/)?.[0] || '',
    app.match(/document\.querySelector\('#simple-view'\)[^\n]*\n/)?.[0] || ''
  ].join('');
  assert.ok(handlers.length > 400, '전환 처리기를 찾지 못했다');
  for (const forbidden of ['sections:', 'selectedNotice:', 'selectedApplicantId:', 'revisions:', 'stagedGeneration:']) {
    assert.ok(!handlers.includes(forbidden), forbidden + ' 를 전환에서 바꾸면 안 된다');
  }
  // 「계획서 확인」은 viewMode를 억지로 바꾸지 않고 상세 보기로 들어간다.
  assert.match(app, /#simple-view'\)\?\.addEventListener\('click', \(\) => setState\(\{ expertDetail: true, activeTool: '', step: 4/);
  assert.doesNotMatch(app, /#simple-view'\)[^\n]*viewMode: 'expert'/);
});

test('보기 전환 단추를 두 번 걸지 않는다', () => {
  // 같은 단추에 처리기를 두 번 걸면 서로 되돌려 아무 일도 일어나지 않는다.
  const bound = app.match(/querySelector\('#toggle-view'\)\?\.addEventListener/g) || [];
  assert.equal(bound.length, 1, '#toggle-view 처리기는 한 곳에서만 건다');
  const detail = app.match(/querySelector\('#open-expert-detail'\)\?\.addEventListener/g) || [];
  assert.equal(detail.length, 1);
});

test('작성 과정 자세히 보기는 계획서가 나오기 전에도 열린다', () => {
  // 공고를 고른 뒤부터 분석·설계·근거를 볼 수 있어야 한다. 완성 뒤에만 열면 과정을 확인할 수 없다.
  assert.match(app, /\$\{chosen \? expertDetails\(\) : ''\}/);
  assert.match(app, /function expertDetails\(\) \{[\s\S]{0,400}strategyView\(\)[\s\S]{0,200}designQuestionsView\(\)[\s\S]{0,200}stagedGenerationView\(\)/);
});

test('같은 단추를 다시 눌러도 AI를 두 번 부르지 않는다', () => {
  assert.match(app, /function aiBusy\(what = '이미 만들고 있습니다'\) \{\s*\n\s*if \(!state\.busy\) return false;/);
  for (const name of ['runSimpleGeneration', 'runRevision', 'generateCompleteProposal', 'generateProposalParts']) {
    assert.match(app, new RegExp(`async function ${name}\\(\\) \\{\\s*\\n\\s*if \\(aiBusy`), name);
  }
  // 막을 때도 무슨 일이 벌어지고 있는지 알려 준다. 조용히 삼키지 않는다.
  assert.match(app, /setState\(\{ notice: `\$\{what\}\. 끝나면 결과가 화면에 나옵니다\.`, error: '' \}\);/);
});

test('설계만 만들고 멈추지 않고 본문까지 이어서 만든다', () => {
  assert.match(app, /if \(state\.stagedGeneration\?\.master && !state\.sections\.length\) await generateProposalParts\(\);/);
});

test('공고 찾기는 기존 공고 준비 화면을 열고 고르면 간편 화면으로 돌아온다', () => {
  // 간편 화면만 다시 그리면 눌러도 아무 일이 없다. 기존 단계 화면을 실제로 연다.
  assert.match(app, /#simple-find'\)\?\.addEventListener\('click', \(\) => setState\(\{ expertDetail: true, activeTool: '', step: 0/);
  assert.match(app, /#simple-change-notice'\)\?\.addEventListener\('click', \(\) => setState\(\{ expertDetail: true, activeTool: '', step: 0/);
  // 공고를 고르면 제자리로 돌아온다. 고른 공고와 본문은 그대로다.
  assert.match(app, /setState\(\{ busy: '', pendingNoticeChoice: null, expertDetail: false, activeTool: '', notice: '선택한 공고 본문을/);
  // 보관함에서 연 목록도 실제로 보인다. 열어 둔 보관함 화면을 닫아야 보인다.
  assert.match(app, /navigateToStep\(1, \{ noticeResults, expertDetail: true, activeTool: '',/);
  assert.match(app, /navigateToStep\(1, \{ noticeResults: state\.noticeResults, activeTool: '', expertDetail: true,/);
});

test('검증·코칭 입력칸은 빈칸이면 세 줄, 내용만큼만 늘어난다', () => {
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  // 빈칸이 화면을 차지하지 않는다.
  assert.match(css, /\.source-text\.auto-grow\{[\s\S]*?min-height:calc\(3 \* 1\.7em \+ 26px\)/);
  // 최대 높이를 넘으면 칸 안에서만 스크롤한다. 화면이 가로로 넘치지 않는다.
  assert.match(css, /max-height:min\(45vh, 480px\)/);
  assert.match(css, /overflow-x:hidden/);
  // 손잡이로 끌면 자동 높이와 어긋난다.
  assert.match(css, /\.source-text\.auto-grow\{[\s\S]*?resize:none/);
  // 긴 한글 문장이 가로로 넘치거나 글자 단위로 쪼개지지 않는다.
  assert.match(css, /word-break:keep-all/);
  assert.match(css, /@media\(max-width:420px\)\{\s*\.source-text\.auto-grow\{min-height:calc\(2 \* 1\.7em \+ 22px\)\}/);

  // 두 입력칸에만 붙는다.
  assert.match(app, /<textarea id="coaching-text" class="source-text auto-grow" rows="3"/);
  assert.match(app, /<textarea id="coaching-criteria" class="source-text auto-grow" rows="3"/);
  // 줄였다가 다시 재야 지운 뒤에도 줄어든다.
  assert.match(app, /el\.style\.height = 'auto';/);
  assert.match(app, /const next = Math\.min\(el\.scrollHeight, limit\);/);
  // 파일 불러오기·복원도 화면을 다시 그리므로 같은 자리에서 다시 잰다.
  assert.match(app, /function fitAutoGrow\(\) \{/);
  assert.match(app, /el\.addEventListener\('input', \(\) => fitTextarea\(el\)\);/);
});

test('확정은 마지막에 한 번이고 항목마다 누르지 않는다', () => {
  // 초안 작성을 설계 승인으로 막지 않는다.
  const engagement = fs.readFileSync(new URL('../server/../src/engagement.js', import.meta.url), 'utf8');
  assert.match(engagement, /초안 작성은 막지 않는다/);
  assert.doesNotMatch(engagement, /allowed: false, reason: '사업 설계 승인 후에/);
  // 결과 화면에 최종확정이 하나 있다.
  assert.match(app, /function finalConfirmView\(\) \{/);
  assert.match(app, /id="run-final-confirm"/);
  assert.equal((app.match(/id="run-final-confirm"/g) || []).length, 1);
  // 한 번 누르면 요청·검토·승인을 함께 기록한다. 확인 절차 자체를 없애지 않았다.
  const handler = app.slice(app.indexOf("#run-final-confirm'"), app.indexOf("#undo-final-confirm'"));
  for (const step of ['requestDesignReview();', 'startDesignReview();', 'approveDesign({ silent: true });']) {
    assert.ok(handler.includes(step), step);
  }
  // 확정해도 되돌릴 수 있다.
  assert.match(app, /id="undo-final-confirm"/);
  // 확인 필요가 남아 있어도 막지 않고 무엇이 남는지 알려 준다.
  assert.match(app, /그대로 확정하면 \[확인 필요\] 표시가 제출본에 남습니다/);
});

test('초안을 만들 때 설계 기록을 늘 남긴다', () => {
  // 게이트를 열었다고 설계 기록까지 없애면 본문 작성이 「승인된 설계안을 찾지 못했습니다」로 멈춘다.
  assert.match(app, /if \(!state\.engagement\?\.design\?\.approvedAt\) \{\s*\n\s*requestDesignReview\(\);\s*\n\s*startDesignReview\(\);/);
  // 사용자가 누를 필요는 없다. 화면에는 확정 단추가 마지막에 하나뿐이다.
  assert.match(app, /approveDesign\(\{ silent: true \}\);/);
});

test('쓰는 동안 끝난 묶음을 바로 보여 준다', () => {
  // 7분을 빈 화면으로 기다리지 않는다. 안에서는 이미 묶음마다 결과가 나오고 있었다.
  assert.match(app, /function sectionsSoFar\(\) \{/);
  assert.match(app, /state\.sections = sectionsSoFar\(\);/);
  // 아직 안 끝난 항목은 자리를 만들지 않는다. 빈 항목을 지어내지 않는다.
  assert.match(app, /groups\.filter\(group => done\.has\(group\.id\)\)/);
  // 진행 표시에 남은 묶음과 지금까지 항목 수를 함께 적는다.
  assert.match(app, /묶음 · 지금까지 \$\{state\.sections\.length\}항목/);
  // 쓰는 중에도, 묶음이 남아 있어도 완성으로 보지 않는다. 결과 단추를 미리 열지 않는다.
  assert.match(app, /const progress = writingState\(state\.stagedGeneration, \{ busy: state\.busy, sections: state\.sections\.length \}\);/);
  assert.match(app, /const done = step === 'done' && !writing && !progress\.partial;/);
  // 설계가 먼저 끝나면 본문 전에도 방향을 확인할 수 있다.
  assert.match(app, /function designSoFarView\(\) \{/);
  assert.match(app, /\['한 문장 전략', design\.oneSentenceStrategy\]/);
  assert.match(app, /function writingProgressView\(\) \{/);
});
