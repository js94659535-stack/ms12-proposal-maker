// 관리자 포털 · 계획서 포털. 한 계정으로 두 화면을 오가고, 회원 계정을 따로 만들지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
// 포털 관련 코드만 잘라 낸다.
const block = app.slice(app.indexOf('// ---------- 관리자 포털 · 계획서 포털 ----------'), app.indexOf('async function checkSession()'));

test('로그인한 관리자·운영관리자는 어느 포털로 갈지 먼저 고른다', () => {
  assert.ok(block.length > 800, '포털 코드를 찾지 못했다');
  assert.match(app, /function isStaff\(\) \{ return isAdmin\(\) \|\| isOperator\(\); \}/);
  // 고르기 전에는 작업 화면도 관리 화면도 그리지 않는다.
  assert.match(app, /if \(isStaff\(\) && !state\.portal\) \{ app\.innerHTML = portalChoiceView\(\); bindPortalChoice\(\); return; \}/);
  // 고른 값은 작업 상태와 함께 저장되어 새로고침해도 남는다.
  assert.match(app, /step: 0, activeTool: 'home', homeSeen: false, portal: ''/);
  assert.match(app, /restored\.portal = \['admin', 'proposal'\]\.includes\(saved\.portal\) \? saved\.portal : '';/);
  // 회원은 이 화면을 보지 않는다. 포털은 관리자·운영관리자에게만 있다.
  assert.match(block, /if \(!isStaff\(\)\) return '';/);
});

test('두 포털이 각각 무엇을 하는지 고르는 화면에 적혀 있다', () => {
  for (const label of ['계획서 포털', '관리자 포털', '회원이 보는 화면 그대로', '관리자 입장에서 회원과 서비스를 관리']) {
    assert.ok(block.includes(label), label);
  }
  // 회원 계정을 따로 만들지 않는다는 점을 화면에서 밝힌다.
  assert.ok(block.includes('회원 계정을 따로 만들 필요가 없습니다'));
  assert.ok(block.includes('data-portal="proposal"') && block.includes('data-portal="admin"'));
});

test('계획서 포털에서는 회원과 같은 화면을 쓰고 관리 화면은 열리지 않는다', () => {
  // 관리 화면 위치가 저장되어 있어도 계획서 포털에서는 홈으로 되돌린다.
  assert.match(app, /if \(isStaff\(\) && state\.portal === 'proposal' && \['admin', 'operator'\]\.includes\(state\.activeTool\)\) state\.activeTool = 'home';/);
  // 계획서 포털에서는 관리·운영 진입점 대신 되돌아가는 단추 하나만 보인다.
  assert.match(block, /if \(!inAdminPortal\(\)\) return `<button class="\$\{cls\}" data-portal="admin">관리자 포털<\/button>`;/);
  // 관리자 포털에서만 관리·운영 진입점과 계획서 포털 단추가 함께 나온다.
  assert.match(block, /data-portal-open="operator"/);
  assert.match(block, /data-portal-open="admin"/);
  assert.match(block, /data-portal="proposal">계획서 포털</);
});

test('두 포털을 오가는 단추가 작업 화면과 홈 양쪽에 있다', () => {
  // 작업 화면 헤더와 홈 내비게이션 모두 같은 함수로 그린다.
  assert.match(app, /\$\{portalLinks\(\)\}<button class="history-button" id="sign-out">/);
  assert.match(app, /\$\{portalLinks\('button ghost'\)\}/);
  // 관리·운영 화면의 「계획서 포털로」도 같은 전환을 쓴다.
  assert.match(app, /querySelector\('#close-admin'\)\?\.addEventListener\('click', \(\) => openPortal\('proposal'\)\)/);
  assert.match(app, /querySelector\('#close-operator'\)\?\.addEventListener\('click', \(\) => openPortal\('proposal'\)\)/);
  assert.match(app, /querySelectorAll\('\[data-portal\]'\)\.forEach\(el => el\.onclick = \(\) => openPortal\(el\.dataset\.portal\)\)/);
  // 관리자 포털을 고르면 역할에 맞는 화면이 열린다.
  assert.match(block, /return isAdmin\(\) \? openAdmin\(\) : openOperator\(\);/);
  // 알 수 없는 값은 받지 않는다.
  assert.match(block, /if \(!PORTALS\.includes\(portal\)\) return;/);
});

test('포털이 기존 권한 차단을 대신하지 않는다', () => {
  // 역할 가드는 그대로다. 화면 전환은 서버 차단과 별개다.
  assert.match(app, /if \(state\.activeTool === 'admin' && !isAdmin\(\)\) state\.activeTool = 'home';/);
  assert.match(app, /if \(state\.activeTool === 'operator' && !isOperator\(\)\) state\.activeTool = 'home';/);
  // 승인 대기·무료 체험 회원 흐름이 포털보다 먼저 걸린다.
  assert.ok(app.indexOf('if (pendingAccount())') < app.indexOf('if (isStaff() && !state.portal)'));
  assert.ok(app.indexOf('if (isStaff() && !state.portal)') < app.indexOf('if (trialAccount())'));
});
