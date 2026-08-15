// 공식 통계 근거 후보(KOSIS). 실제 KOSIS는 부르지 않는다. 가짜 응답만 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CALLS, TOPICS, lookup, onRequest as statsRoute } from '../functions/api/stats.js';
import { MAX_OBJ_LEVELS, NOT_FOUND_MESSAGE, NO_KEY_MESSAGE, cacheKey, dataUrl, kosisError, maskKey, needsMoreLevels, normalizeRow, pickTables, rowsForRegion, statHtmlLink } from '../server/kosis.js';

const KEY = 'test-key-must-never-appear';

const SEARCH = [
  { ORG_ID: '101', TBL_ID: 'DT_1B04005N', TBL_NM: '행정구역(시군구)별/5세별 주민등록인구', STAT_NM: '주민등록인구현황', ORG_NM: '행정안전부' },
  { ORG_ID: '101', TBL_ID: 'DT_OTHER', TBL_NM: '전국 사업체조사', STAT_NM: '전국사업체조사', ORG_NM: '통계청' }
];
const META = [
  { OBJ_ITM_ID: '29200', OBJ_ITM_NM: '광주광역시 광산구' },
  { OBJ_ITM_ID: '29110', OBJ_ITM_NM: '광주광역시 동구' }
];
const DATA = [
  { ORG_ID: '101', TBL_ID: 'DT_1B04005N', TBL_NM: '행정구역(시군구)별/5세별 주민등록인구', PRD_DE: '2025', ITM_NM: '10~19세', C1: '29200', C1_NM: '광주광역시 광산구', DT: '46,231', UNIT_NM: '명' },
  { ORG_ID: '101', TBL_ID: 'DT_1B04005N', TBL_NM: '행정구역(시군구)별/5세별 주민등록인구', PRD_DE: '2025', ITM_NM: '총인구', C1_NM: '광주광역시 광산구', DT: '390,000', UNIT_NM: '명' }
];

// 부른 주소를 순서대로 돌려주는 가짜 KOSIS.
function fakeKosis(steps) {
  const seen = [];
  const fetcher = async address => {
    seen.push(address);
    const step = steps[seen.length - 1];
    if (!step) throw new Error(`예상보다 많이 불렀다: ${address}`);
    return { ok: true, json: async () => step };
  };
  return { fetcher, seen };
}

test('검색한 표에서 이 지역 줄만 골라 온다', async () => {
  const { fetcher, seen } = fakeKosis([SEARCH, DATA]);
  const result = await lookup(KEY, { region: '광산구', topic: TOPICS.children, fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.calls, 2);
  assert.equal(result.region, '광주광역시 광산구');
  const first = result.candidates[0];
  // 통계표명·작성기관·조사명·지역·기준연도·값·단위·출처 링크가 모두 있어야 후보다.
  assert.equal(first.tableName, '행정구역(시군구)별/5세별 주민등록인구');
  assert.equal(first.organization, '행정안전부');
  assert.equal(first.survey, '주민등록인구현황');
  assert.equal(first.itemName, '10~19세');
  assert.equal(first.period, '2025');
  assert.equal(first.value, 46231);
  assert.equal(first.unit, '명');
  assert.equal(first.link, statHtmlLink('101', 'DT_1B04005N'));
  assert.ok(result.fetchedAt);
  // 조사 목적에 맞는 항목이 앞에 온다. 총인구가 아동·청소년보다 앞서지 않는다.
  assert.equal(result.candidates[1].itemName, '총인구');
  // 관계없는 통계표는 애초에 열지 않는다.
  assert.ok(!seen.some(address => address.includes('DT_OTHER')));
});

test('없는 지역은 다른 지역 값으로 대신하지 않는다', async () => {
  const { fetcher } = fakeKosis([SEARCH, DATA]);
  const result = await lookup(KEY, { region: '없는구', topic: TOPICS.children, fetcher });
  assert.equal(result.ok, false);
  assert.equal(result.message, NOT_FOUND_MESSAGE);
  assert.ok(result.tried.some(item => item.reason === 'region'));
  // 이름이 정확히 맞는 줄만 고른다. 「광산」으로는 광산구 값을 가져오지 않는다.
  assert.equal(rowsForRegion(DATA, '광산').length, 0);
  assert.equal(rowsForRegion(DATA, '광산구').length, 2);
  assert.equal(rowsForRegion(DATA, '광주광역시 광산구').length, 2);
});

test('분류 겹수가 모자라면 겹수를 늘려 다시 묻는다', async () => {
  // KOSIS는 표마다 분류 겹수가 다르고, 모자라면 (objL)이라고만 알려 준다.
  const short = { err: '20', errMsg: '필수요청변수값이 누락되었습니다. (objL)' };
  const { fetcher, seen } = fakeKosis([SEARCH, short, DATA]);
  const result = await lookup(KEY, { region: '광산구', topic: TOPICS.children, fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.calls, 3);
  assert.ok(seen[1].includes('objL1=ALL') && !seen[1].includes('objL2'));
  assert.ok(seen[2].includes('objL1=ALL') && seen[2].includes('objL2=ALL'));
  assert.equal(needsMoreLevels('필수요청변수값이 누락되었습니다. (objL)'), true);
  assert.equal(needsMoreLevels('유효하지 않은 인증KEY입니다.'), false);
  assert.ok(dataUrl('k', { orgId: '101', tblId: 'T', levels: 9 }).includes(`objL${MAX_OBJ_LEVELS}=ALL`));
});

test('겹수를 늘려도 안 되면 조르지 않고 멈춘다', async () => {
  const short = { err: '20', errMsg: '필수요청변수값이 누락되었습니다. (objL)' };
  const { fetcher } = fakeKosis([SEARCH, short, short, short, short, short, short, short]);
  const result = await lookup(KEY, { region: '광산구', topic: TOPICS.children, fetcher });
  assert.equal(result.ok, false);
  assert.ok(result.calls <= MAX_CALLS);
});

test('결과가 없으면 찾지 못했다고 답한다', async () => {
  const { fetcher } = fakeKosis([[]]);
  const empty = await lookup(KEY, { region: '광산구', topic: TOPICS.children, fetcher });
  assert.equal(empty.ok, false);
  assert.equal(empty.message, NOT_FOUND_MESSAGE);
  assert.equal(empty.calls, 1);
});

test('지역·연도·단위가 불분명한 값은 후보로 쓰지 않는다', async () => {
  const broken = [
    { TBL_NM: '표', PRD_DE: '2025', C1_NM: '광주광역시 광산구', DT: '100' },                    // 단위 없음
    { TBL_NM: '표', PRD_DE: '', C1_NM: '광주광역시 광산구', DT: '100', UNIT_NM: '명' },          // 연도 없음
    { TBL_NM: '표', PRD_DE: '2025', C1_NM: '', DT: '100', UNIT_NM: '명' },                      // 지역 없음
    { TBL_NM: '표', PRD_DE: '2025', C1_NM: '광주광역시 광산구', DT: '-', UNIT_NM: '명' }         // 값 없음
  ];
  for (const row of broken) assert.equal(normalizeRow(row, { orgId: '101', tblId: 'T' }).ok, false);
  const { fetcher } = fakeKosis([SEARCH, [broken[0], broken[1], broken[3]]]);
  const result = await lookup(KEY, { region: '광산구', topic: TOPICS.children, fetcher });
  assert.equal(result.ok, false);
  assert.ok(result.tried.some(item => item.reason === 'incomplete'));
  // 기준연도는 월 단위 표기에서도 연도만 읽는다.
  assert.equal(normalizeRow({ TBL_NM: '표', PRD_DE: '202506', C1_NM: '광산구', DT: '1', UNIT_NM: '명' }, {}).candidate.period, '2025');
});

test('인증키는 응답·오류 어디에도 나오지 않는다', async () => {
  // KOSIS는 오류도 200으로 준다. 그 문구에 주소가 실려 있어도 키는 가린다.
  const failure = { err: '11', errMsg: `유효하지 않은 인증KEY입니다. apiKey=${KEY}` };
  const { fetcher } = fakeKosis([failure]);
  const result = await lookup(KEY, { region: '광산구', topic: TOPICS.children, fetcher });
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(KEY));
  assert.match(result.message, /apiKey=\*\*\*/);
  assert.equal(maskKey(`https://kosis.kr/openapi/x?method=getList&apiKey=${KEY}&orgId=101`), 'https://kosis.kr/openapi/x?method=getList&apiKey=***&orgId=101');
  // 캐시 열쇠에도 키를 넣지 않는다.
  assert.equal(cacheKey('kosis-lookup', { region: '광산구', topic: 'children' }), 'kosis-lookup:region=광산구&topic=children');
  assert.ok(!cacheKey('kosis-lookup', { region: '광산구', topic: 'children' }).includes(KEY));
  assert.equal(kosisError([]), null);
  // 성공한 결과에도 키가 섞여 나가지 않는다.
  const good = fakeKosis([SEARCH, DATA]);
  const ok = await lookup(KEY, { region: '광산구', topic: TOPICS.children, fetcher: good.fetcher });
  assert.ok(!JSON.stringify(ok).includes(KEY));
});

test('찾는 말과 맞는 통계표만 연다', () => {
  assert.deepEqual(pickTables(SEARCH, { keywords: ['연령', '인구'] }).map(row => row.tblId), ['DT_1B04005N']);
  assert.ok(MAX_CALLS <= 8);
});

// ---------- 경로 ----------

function fakeCache() {
  const store = new Map();
  const db = {
    prepare(sql) {
      const text = sql.replace(/\s+/g, ' ').trim();
      let args = [];
      const api = {
        bind(...values) { args = values; return api; },
        async first() {
          if (/^SELECT payload, fetched_at FROM stat_lookup_cache/.test(text)) return store.get(args[0]) || null;
          return null;
        },
        async run() {
          if (/^INSERT INTO stat_lookup_cache/.test(text)) store.set(args[0], { payload: args[1], fetched_at: args[3], hits: 0 });
          if (/^UPDATE stat_lookup_cache SET hits/.test(text)) { const row = store.get(args[0]); if (row) row.hits += 1; }
          return { meta: { changes: 1 } };
        }
      };
      return api;
    }
  };
  return { db, store };
}

const post = (body, { env = {}, user = { id: 'u1' } } = {}) => statsRoute({
  request: new Request('https://pro.ms12.org/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  env, data: { session: user ? { user } : null }
});

test('인증키가 없으면 아무 곳에도 요청하지 않는다', async () => {
  const { db } = fakeCache();
  let called = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { called += 1; throw new Error('불러서는 안 된다'); };
  try {
    const response = await post({ action: 'lookup', region: '광산구', topic: 'children' }, { env: { ARCHIVE_DB: db } });
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.reason, 'missing-secret');
    assert.equal(body.message, NO_KEY_MESSAGE);
    assert.equal(body.calls, 0);
    assert.equal(called, 0, '키가 없으면 호출 자체가 없다');
  } finally { globalThis.fetch = original; }
});

test('같은 조회는 캐시로 답하고 다시 부르지 않는다', async () => {
  const { db, store } = fakeCache();
  const saved = { ok: true, region: '광주광역시 광산구', candidates: [{ tableName: '표', value: 1, unit: '명', period: '2025' }], calls: 3 };
  store.set(cacheKey('kosis-lookup', { region: '광산구', topic: 'children' }), { payload: JSON.stringify(saved), fetched_at: '2026-08-15T00:00:00.000Z' });
  let called = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { called += 1; throw new Error('캐시가 있으면 부르지 않는다'); };
  try {
    const response = await post({ action: 'lookup', region: '광산구', topic: 'children' }, { env: { ARCHIVE_DB: db, KOSIS_API_KEY: KEY } });
    const body = await response.json();
    assert.equal(body.reused, true);
    assert.equal(body.calls, 0);
    assert.equal(body.fetchedAt, '2026-08-15T00:00:00.000Z');
    assert.equal(called, 0);
  } finally { globalThis.fetch = original; }
});

test('로그인하지 않으면 조회할 수 없고, 정한 주제만 조회한다', async () => {
  const { db } = fakeCache();
  assert.equal((await post({ action: 'lookup', region: '광산구' }, { env: { ARCHIVE_DB: db }, user: null })).status, 401);
  assert.equal((await post({ action: 'other' }, { env: { ARCHIVE_DB: db } })).status, 400);
  assert.equal((await post({ action: 'lookup', region: '광산구', topic: 'anything' }, { env: { ARCHIVE_DB: db } })).status, 400);
  assert.equal((await post({ action: 'lookup', region: '' }, { env: { ARCHIVE_DB: db } })).status, 400);
});

test('화면은 후보로만 보여 주고 계획서에 자동으로 넣지 않는다', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../src/stats-api.js', import.meta.url), 'utf8');
  // 화면은 키를 알지도 보내지도 않는다.
  assert.doesNotMatch(client, /apiKey|KOSIS_API_KEY/);
  assert.match(app, /후보입니다\. 계획서에 자동으로 넣지 않습니다/);
  // 표시 항목을 하나도 빠뜨리지 않는다.
  const view = app.slice(app.indexOf('function statCandidateView()'), app.indexOf('// 통계 근거 출처.'));
  for (const field of ['row.tableName', 'row.survey', 'row.organization', 'row.region', 'row.period', 'row.value', 'row.unit', 'row.link', 'row.tblId', 'result.fetchedAt']) {
    assert.ok(view.includes(field), field);
  }
  assert.match(view, /조사명 미표기/);
  assert.match(view, /적합한 공식 통계를 찾지 못했습니다/);
  // 계획서 생성 경로는 이 결과를 쓰지 않는다. 조회 결과는 화면에만 머문다.
  const run = app.slice(app.indexOf('async function runCoreProposal()'), app.indexOf('function coreResultView('));
  assert.ok(!run.includes('statLookup'), '핵심제안서 생성이 통계 조회 결과를 보내지 않는다');
});
