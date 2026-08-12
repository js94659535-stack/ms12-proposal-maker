// 역할별 기본 화면과 간편·전문 전환. 화면만 바뀌고 작성 내용은 그대로 남는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { viewModeFor } from '../server/simple-flow.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('일반회원의 기본 화면은 홈 자리에서도 간편 작성이다', () => {
  assert.match(app, /function showSimpleHome\(\) \{ return viewMode\(\) === 'simple' && !state\.expertDetail && \['', 'home'\]\.includes\(state\.activeTool\); \}/);
  assert.match(app, /if \(showSimpleHome\(\)\) \{ app\.innerHTML = shell\(simpleWriteView\(\)\); bind\(\); bindSimple\(\); return; \}/);
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
  // 작업 화면과 간편 화면 양쪽에 같은 표시가 붙는다.
  assert.match(app, /\$\{viewModeBadge\(\)\}\s*\n\s*\$\{aiResultBanner\(\)\}/);
  assert.match(app, /return `\$\{viewModeBadge\(\)\}<div class="page-heading"><div><h2>간편 계획서 작성<\/h2>/);
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
