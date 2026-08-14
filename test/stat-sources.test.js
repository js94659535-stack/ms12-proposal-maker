// 통계 근거 출처. 인증키가 오기 전까지는 아무 곳에도 부르지 않고, 꺼져 있다는 사실을 그대로 보여 준다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAT_ORIGINS, STAT_SOURCES, statCitation, statOriginAllowed, statRunnable, statSourceState } from '../server/stat-sources.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('확인한 출처만 켤 수 있고, 인증키가 없으면 부르지 않는다', () => {
  const kosis = STAT_SOURCES.find(source => source.id === 'kosis-table');
  const sgis = STAT_SOURCES.find(source => source.id === 'sgis-population');
  // 경로를 확인하지 못한 곳은 추측한 주소로 부르지 않는다.
  assert.equal(sgis.verified, false);
  assert.equal(statRunnable(sgis, { secrets: { SGIS_CONSUMER_KEY: 'x' } }).reason, 'not-connected');
  // 경로는 살아 있지만 키가 없으면 그대로 멈춘다.
  assert.equal(statRunnable(kosis, {}).reason, 'missing-secret');
  assert.equal(statRunnable(kosis, { secrets: { KOSIS_API_KEY: 'x' } }).ok, true);
  // 목록에 없는 곳은 아예 부르지 않는다.
  assert.equal(statRunnable({ id: 'somewhere', verified: true }, { secrets: {} }).reason, 'unknown');
  assert.equal(statOriginAllowed('https://example.com/data'), false);
  assert.equal(statOriginAllowed('https://kosis.kr/openapi/x'), true);
  assert.ok(STAT_ORIGINS.every(origin => origin.startsWith('https://')));
});

test('인증키의 값도 등록 여부도 화면으로 내보내지 않는다', () => {
  const rows = statSourceState();
  const flat = JSON.stringify(rows);
  for (const source of STAT_SOURCES) assert.ok(!flat.includes(`"${source.needsSecret}":`), source.needsSecret);
  // 상태는 「키 미등록」 또는 「경로 확인 필요」 둘 중 하나로만 나간다.
  assert.deepEqual([...new Set(rows.map(row => row.blocked))].sort(), ['missing-secret', 'not-connected']);
  // 무엇을 주는 출처인지 사람 말로 함께 알려 준다. 키를 넣을 자리도 적어 둔다.
  assert.ok(rows.every(row => row.gives && row.note));
  assert.match(JSON.stringify(rows), /Cloudflare Secret KOSIS_API_KEY/);
});

test('통계로 채워지는 것과 채워지지 않는 것을 구분해 적는다', () => {
  // 통계표는 우리 기관 이용자 수를 알려 주지 않는다. 그것은 계속 [확인 필요]다.
  const source = fs.readFileSync(new URL('../server/stat-sources.js', import.meta.url), 'utf8');
  assert.match(source, /우리 기관 이용자 수·실적·만족도는 통계표에 없다/);
  assert.match(app, /우리 기관의 이용자 수·실적·만족도는 통계표에 없으므로 여기서 채워지지 않습니다/);
  // 관리자 상태판에 미연동으로 보인다.
  assert.match(app, /function statSourcePanel\(\) \{/);
  assert.match(app, /\$\{sourcePanel\(\{ readOnly \}\)\}\n    \$\{statSourcePanel\(\)\}/);
});

test('출처 표기는 기준연도까지 함께 적는다', () => {
  // 연도 없는 수치는 근거가 아니다.
  assert.equal(statCitation({ table: '주민등록인구현황', organization: '통계청 KOSIS', period: '2025' }), '주민등록인구현황, 통계청 KOSIS, 2025 기준');
  assert.equal(statCitation({ table: '주민등록인구현황' }), '주민등록인구현황');
  assert.equal(statCitation({}), '');
});
