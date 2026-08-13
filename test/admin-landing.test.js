// 관리자 랜딩. 최고관리자가 관리자 포털에서 먼저 보는 화면이다.
// 소개 글은 공개 랜딩과 한 곳에서 관리하고, 운영 현황 숫자는 실제 자료에서만 센다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ADMIN_SHORTCUTS, adminOverview } from '../server/admin-overview.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const region = (from, to) => app.slice(app.indexOf(from), app.indexOf(to));
const view = region('// ---------- 관리자 랜딩 ----------', 'function landingView()');

test('소개 콘텐츠는 공개용과 관리자용이 한 곳에서 나온다', () => {
  // 공개 랜딩도 관리자 랜딩도 같은 함수를 부른다. 문구를 따로 베껴 두지 않는다.
  assert.match(app, /function introSections\(\{ forAdmin = false \} = \{\}\) \{/);
  assert.match(region('function landingView()', '// ---------- 공모정보 검색 ----------'), /\$\{introSections\(\)\}/);
  assert.match(view, /\$\{introSections\(\{ forAdmin: true \}\)\}/);
  // 요구된 소개 구역이 공통 함수 안에 모두 있다.
  const intro = region('function introSections(', '// ---------- 관리자 랜딩 ----------');
  for (const id of ['landing-value', 'landing-flow', 'landing-features', 'landing-audience', 'landing-security']) {
    assert.ok(intro.includes(`id="${id}"`), id);
  }
  assert.match(intro, /HOME_FLOW\.map/, '전체 이용 흐름 여섯 단계');
});

test('제품소개·이용방법·주요기능 메뉴가 실제 구역으로 이동한다', () => {
  assert.match(view, /\['landing-value', '제품소개'\], \['landing-flow', '이용방법'\], \['landing-features', '주요기능'\]/);
  assert.match(view, /data-landing-scroll="\$\{id\}"/);
  assert.match(view, /querySelectorAll\('\[data-landing-scroll\]'\)[\s\S]{0,220}scrollIntoView/);
});

test('운영 바로가기는 아홉 가지이고 모두 있는 화면으로 이어진다', () => {
  const keys = ADMIN_SHORTCUTS.map(item => item.key);
  assert.deepEqual(keys, ['pending', 'agency', 'notices', 'collection', 'drafts', 'unchecked', 'usage', 'members', 'assistant']);
  // 없는 화면을 새로 만들지 않고 이미 있는 관리 화면의 갈래를 연다.
  for (const item of ADMIN_SHORTCUTS) {
    assert.ok(['admin', 'coaching'].includes(item.tool), item.key);
    if (item.tool === 'admin') assert.ok(['accounts', 'agency', 'notices', 'collection', 'access', 'usage'].includes(item.tab), item.key);
  }
  assert.match(app, /function openAdmin\(tab = 'accounts'\) \{/);
  assert.match(view, /openAdmin\(item\.tab \|\| 'accounts'\)/);
});

test('알 수 없는 수치를 만들어 표시하지 않는다', () => {
  // 아직 못 읽었으면 「읽는 중」, 실패하면 「확인 못 함」이라고 적는다. 0으로 채우지 않는다.
  assert.match(view, /'확인 못 함' : '읽는 중'/);
  assert.match(view, /setAuth\(\{ adminOverviewError:/);
  assert.doesNotMatch(view, /\|\| 0\}건/);
});

test('운영 현황은 실제 표에서 세고 비밀값을 담지 않는다', async () => {
  const asked = [];
  const db = {
    prepare(sql) {
      asked.push(sql.replace(/\s+/g, ' ').trim());
      const row = { n: 3, tokens: 1200, cost: 4500, last_run_status: 'ok', last_success_at: '2026-08-12T09:00:00Z', consecutive_failures: 0 };
      const statement = { bind: () => statement, first: async () => row };
      return statement;
    }
  };
  const result = await adminOverview(db);
  const cards = new Map(result.cards.map(card => [card.key, card]));
  assert.equal(cards.get('pending').value, 3);
  assert.equal(cards.get('collection').text, '정상');
  assert.match(cards.get('agency').note, /대행회원 3명 · 등록 고객 3곳/);
  // 회원 원문·비밀값은 어떤 질의에도 없다.
  const all = asked.join(' | ');
  for (const forbidden of ['password', 'hash', 'salt', 'session', 'recovery', 'token_secret']) {
    assert.ok(!all.toLowerCase().includes(forbidden), forbidden);
  }
  // 실제 운영 표만 읽는다.
  assert.ok(all.includes('FROM users'), 'users');
  assert.ok(all.includes('FROM archived_notices'), 'archived_notices');
  assert.ok(all.includes('FROM ai_usage_events'), 'ai_usage_events');
});

test('일반회원·대행회원에게는 관리자 랜딩과 운영현황이 열리지 않는다', () => {
  // 화면: 관리자 포털에 들어간 운영 계정만 이 화면을 그린다.
  assert.match(app, /if \(inAdminPortal\(\) && state\.activeTool === 'home'\)/);
  assert.match(app, /function inAdminPortal\(\) \{ return isStaff\(\) && state\.portal === 'admin'; \}/);
  // 서버: 운영 현황은 /api/admin에 있고 그 경로는 최고관리자만 통과한다.
  assert.match(api, /if \(body\.action === 'overview'\) return json\(await adminOverview\(env\.ARCHIVE_DB\), 200\);/);
  assert.ok(api.indexOf("actor.role !== 'admin'") < api.indexOf("body.action === 'overview'"), '역할 확인이 먼저다');
});

test('카드를 크게 늘어놓지 않고 화면 크기에 맞춰 접는다', () => {
  assert.match(css, /\.admin-shortcuts\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(190px,1fr\)\)/);
  assert.match(css, /@media\(max-width:420px\)\{\s*\.admin-shortcuts\{grid-template-columns:1fr 1fr/);
  // 한글이 글자 단위로 쪼개지지 않게 한다.
  assert.match(css, /\.admin-shortcut\{[^}]*word-break:keep-all/);
});
