// 공개 소개 화면. 로그인하지 않은 사람이 처음 보는 화면이므로 서버를 부르지 않고 저장된 작업도 읽지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// 소개 화면 본문만 잘라 낸다. 뒤에 붙는 로그인 화면과 섞이지 않게 한다.
const landing = app.slice(app.indexOf('function landingView()'), app.indexOf('// 로그인과 회원가입을 한 화면에서'));

test('로그아웃 상태의 첫 화면은 로그인 창이 아니라 서비스 소개다', () => {
  assert.ok(landing.length > 1000, '소개 화면 본문을 찾지 못했다');
  // 전할 말이 없으면 소개, 있으면 로그인 화면. 작업 화면은 어느 쪽에서도 그려지지 않는다.
  assert.match(app, /function showAuthForm\(\) \{ return auth\.view === 'auth' \|\| Boolean\(auth\.error\) \|\| Boolean\(auth\.notice\); \}/);
  assert.match(app, /if \(auth\.status !== 'signedIn' && showAuthForm\(\)\) \{ app\.innerHTML = loginView\(\); bindLogin\(\); return; \}/);
  assert.match(app, /if \(auth\.status !== 'signedIn'\) \{ app\.innerHTML = landingView\(\); bindLanding\(\); return; \}/);
  // 기본값이 소개 화면이고, 공급자가 돌려보낸 주소일 때만 곧바로 로그인 화면으로 간다.
  assert.match(app, /view: readOAuthCallback\(\) \? 'auth' : 'landing'/);
  // 소개 화면은 작업 화면 목록에 들어가지 않는다. 로그인 뒤 화면 배치는 그대로다.
  assert.doesNotMatch(app, /landing: landingView/);
});

test('시작하기·로그인 버튼이 기존 로그인·회원가입 화면으로 이어진다', () => {
  assert.ok(landing.includes('data-landing="signup"'), 'data-landing="signup"');
  assert.ok(landing.includes('data-landing="login"'), 'data-landing="login"');
  assert.ok(landing.includes('무료로 시작하기') && landing.includes('로그인'));
  assert.match(app, /el\.dataset\.landing === 'signup' \? 'signup' : 'login'/);
  // 로그인 화면에서 소개로 되돌아올 수 있다.
  assert.ok(app.includes('id="back-to-landing"'));
  assert.match(app, /querySelector\('#back-to-landing'\)\?\.addEventListener\('click', \(\) => setAuth\(\{ view: 'landing'/);
});

test('소개 화면에 핵심 가치·이용 흐름·주요 기능·이용 대상·보안 안내가 모두 있다', () => {
  for (const label of ['핵심 가치', '이용 흐름', '주요 기능', '이용 대상', '보안·승인 안내', '관리자 승인']) {
    assert.ok(landing.includes(label), label);
  }
  for (const id of ['landing-value', 'landing-flow', 'landing-features', 'landing-audience', 'landing-security']) {
    assert.ok(landing.includes(`id="${id}"`), id);
  }
  // 이용 흐름과 공모 유형은 이미 있는 자료를 그대로 쓴다.
  assert.match(landing, /HOME_FLOW\.map/);
  assert.match(landing, /TYPES\.map/);
  // 구역 이동 버튼이 실제 구역 id와 연결된다.
  assert.match(app, /querySelectorAll\('\[data-landing-scroll\]'\)[\s\S]{0,200}scrollIntoView/);
});

test('소개 화면은 서버를 부르지 않고 저장된 작업도 읽지 않는다', () => {
  // 로그인해야 열리는 API를 부르면 로그아웃 방문자에게 401만 쌓인다.
  assert.doesNotMatch(landing, /await |fetch\(|accountProfile|listAccounts|operatorOverview|listArchived|startSocial|data-social|loadHomeRecent|loadRecentArchive/);
  // 공용 컴퓨터에서 앞사람의 사업명이 남지 않도록 저장된 작업 상태를 참조하지 않는다.
  assert.doesNotMatch(landing, /\bstate\./);
  // 소개 화면 분기는 로그인 상태용 바인더(bind)를 부르지 않는다. bind는 보관함을 불러온다.
  assert.doesNotMatch(app, /app\.innerHTML = landingView\(\); bind\(\)/);
  assert.match(app, /function bindLanding\(\) \{/);
});

test('승인 대기·로그아웃·소셜 로그인 흐름은 소개 화면 때문에 끊기지 않는다', () => {
  // 승인 대기 계정은 지금처럼 가입 정보 입력 화면을 본다.
  assert.match(app, /if \(pendingAccount\(\)\) \{ app\.innerHTML = pendingView\(\); bindLogin\(\); return; \}/);
  // 로그아웃·세션 만료는 소개가 아니라 로그인 화면으로 되돌리고 사유를 그 자리에서 보여 준다.
  assert.match(app, /function signOutLocally\(message = ''\) \{[^\n]*view: 'auth'/);
  assert.match(app, /if \(String\(error\?\.message \|\| ''\)\.includes\(UNAUTHORIZED\)\) return signOutLocally/);
  // 공급자 콜백은 세션 조회보다 먼저 처리된다.
  assert.ok(app.indexOf('const callback = readOAuthCallback();') < app.indexOf('const result = await currentUser()'));
  // 소셜 실패 문구는 auth.error로 들어가므로 showAuthForm()이 로그인 화면을 강제한다.
  assert.match(app, /error: '소셜 로그인을 마치지 못했습니다\. 다시 시도해 주세요\.'/);
});

test('소개 화면은 이미 있는 스타일만 쓰고 새 화면 분류를 만들지 않는다', () => {
  for (const rule of ['.landing{', '.landing-hero{', '.landing-cta{', '.landing-grid{', '.landing-card{', '.landing-step{', '.landing-footer{', '.home-header{']) {
    assert.ok(css.includes(rule), rule);
  }
  // 홈 화면 버튼을 재사용하지 않는다. 로그아웃 상태에서 눌러 봐야 갈 곳이 없다.
  assert.doesNotMatch(landing, /data-home-|data-deck|data-step=/);
});

test('공개 주소의 제목과 설명이 내부 도구가 아니라 서비스로 적혀 있다', () => {
  assert.match(page, /<title>MS12 사업계획서 작성 도우미/);
  assert.doesNotMatch(page, /내부 도구|워크벤치/);
  assert.match(page, /<meta name="description" content="공고 분석부터/);
});
