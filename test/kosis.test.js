// 공식 통계 근거 후보(KOSIS). 실제 KOSIS는 부르지 않는다. 가짜 응답만 쓴다.
//
// 여기서 지키는 것은 「숫자가 맞는가」가 아니라 「그 숫자를 바르게 부르는가」다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAX_CALLS, onRequest as statsRoute } from '../functions/api/stats.js';
import {
  AGE_REQUIRED_MESSAGE, NO_KEY_MESSAGE, REGIONS, SUPPORTED_REGION_TEXT, TABLE,
  ageOf, cacheKey, candidatesFor, dataUrl, kosisError, maskKey, normalizeRow, periodLabel, resolveRegion, rowMatchesRegion, statHtmlLink, sumRange
} from '../server/kosis.js';

const KEY = 'test-key-must-never-appear';
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const GWANGSAN = REGIONS.find(item => item.short === '광산구');

// 실제 응답과 같은 모양. 지역코드·지역명·연령·항목·단위가 함께 온다.
const row = (age, value, extra = {}) => ({
  ORG_ID: '101', TBL_ID: 'DT_1B04006', TBL_NM: '행정구역(시군구)별/1세별 주민등록인구',
  PRD_DE: '2025', ITM_NM: '총인구수', C1: '29200', C1_NM: '광산구', C2_NM: `${age}세`,
  DT: String(value), UNIT_NM: '명', ...extra
});
const AGES = Array.from({ length: 20 }, (_, age) => row(age, 100 + age));
const AGE_SUM = AGES.reduce((sum, item) => sum + Number(item.DT), 0);
const DATA = [
  { ...row(0, 387604), C2_NM: '계' },
  ...AGES,
  { ...row(5, 999), ITM_NM: '남자인구수' }
];

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

function fakeCache() {
  const store = new Map();
  const db = {
    prepare(sql) {
      const text = sql.replace(/\s+/g, ' ').trim();
      let args = [];
      const api = {
        bind(...values) { args = values; return api; },
        async first() { return /^SELECT payload, fetched_at FROM stat_lookup_cache/.test(text) ? (store.get(args[0]) || null) : null; },
        async run() {
          if (/^INSERT INTO stat_lookup_cache/.test(text)) store.set(args[0], { payload: args[1], fetched_at: args[3], hits: 0 });
          if (/^UPDATE stat_lookup_cache SET hits/.test(text)) { const found = store.get(args[0]); if (found) found.hits += 1; }
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

// 가짜 KOSIS를 전역 fetch에 끼운다. 부른 주소를 함께 센다.
function withFetch(steps, run) {
  const original = globalThis.fetch;
  const { fetcher, seen } = fakeKosis(steps);
  globalThis.fetch = fetcher;
  return run(seen).finally(() => { globalThis.fetch = original; });
}

// ---------- 지역 ----------

test('지역은 상위 행정구역까지 적고, 이름만으로 애매하면 받지 않는다', () => {
  assert.equal(resolveRegion('광산구').region.full, '광주광역시 광산구');
  assert.equal(resolveRegion('광주광역시 광산구').region.code, '29200');
  assert.equal(resolveRegion('29200').region.full, '광주광역시 광산구');
  // 「동구」는 광주에도 부산에도 대구에도 있다. 어느 동구인지 적어야 받는다.
  const east = resolveRegion('동구');
  assert.equal(east.ok, false);
  assert.equal(east.reason, 'ambiguous');
  assert.equal(resolveRegion('광주광역시 동구').region.code, '29110');
  // 지원하지 않는 지역은 지원 범위를 그대로 알려 준다.
  assert.equal(resolveRegion('서울특별시 강남구').reason, 'unsupported');
  assert.equal(resolveRegion('').reason, 'empty');
  assert.match(SUPPORTED_REGION_TEXT, /광주광역시와 5개 자치구\(동구·서구·남구·북구·광산구\)만 조회할 수 있습니다/);
});

test('코드와 이름이 모두 맞아야 그 줄을 쓴다', () => {
  assert.equal(rowMatchesRegion({ C1: '29200', C1_NM: '광산구' }, GWANGSAN), true);
  assert.equal(rowMatchesRegion({ C1: '29200', C1_NM: '광주광역시 광산구' }, GWANGSAN), true);
  // 코드는 맞는데 이름이 다른 줄은 쓰지 않는다. 그 반대도 마찬가지다.
  assert.equal(rowMatchesRegion({ C1: '29200', C1_NM: '북구' }, GWANGSAN), false);
  assert.equal(rowMatchesRegion({ C1: '29170', C1_NM: '광산구' }, GWANGSAN), false);
  assert.equal(rowMatchesRegion({ C1_NM: '광산구' }, GWANGSAN), true);
  assert.equal(rowMatchesRegion({}, GWANGSAN), false);
  // 후보에도 상위 행정구역까지 적는다.
  const made = candidatesFor([row(7, 3900)], GWANGSAN);
  assert.equal(made[0].region, '광주광역시 광산구');
  assert.equal(made[0].regionCode, '29200');
});

// ---------- 기준시점 ----------

test('기준시점은 연·월로 적고, 월을 모르면 모른다고 적는다', () => {
  // 주민등록인구 연간 자료는 그해 12월 말 기준이다. 표에 적어 둔 기준을 그대로 쓴다.
  assert.equal(periodLabel('2025', TABLE.periodBasis), '2025년 12월 말 기준');
  assert.equal(periodLabel('202506', TABLE.periodBasis), '2025년 6월 기준');
  // 기준을 모르는 표는 지어내지 않는다.
  assert.equal(periodLabel('2025', ''), '2025년 기준(월 미표기)');
  assert.equal(periodLabel(''), '');
  assert.equal(candidatesFor([row(7, 3900)], GWANGSAN)[0].periodLabel, '2025년 12월 말 기준');
});

// ---------- 합산 ----------

test('대상 연령이 없으면 더하지 않고 물어본다', () => {
  const made = candidatesFor(DATA, GWANGSAN, { limit: 100 });
  const none = sumRange(made, {});
  assert.equal(none.ok, false);
  assert.equal(none.reason, 'age-required');
  assert.equal(none.message, AGE_REQUIRED_MESSAGE);
  assert.match(AGE_REQUIRED_MESSAGE, /임의로 「아동·청소년」이라고 부르지 않습니다/);
});

test('대상 연령이 있으면 그 범위만 더하고, 범위를 이름에 그대로 적는다', () => {
  const made = candidatesFor(DATA, GWANGSAN, { limit: 100 });
  const summed = sumRange(made, { startAge: 0, endAge: 19 });
  assert.equal(summed.ok, true);
  // 이름이 「아동·청소년」이 아니라 실제 합산 범위다.
  assert.equal(summed.label, '0~19세 주민등록인구');
  assert.doesNotMatch(summed.label, /아동|청소년/);
  // 시작·종료 나이, 행 수, 합산식을 보존한다.
  assert.equal(summed.startAge, 0);
  assert.equal(summed.endAge, 19);
  assert.equal(summed.rowCount, 20);
  assert.deepEqual(summed.ages, Array.from({ length: 20 }, (_, age) => age));
  assert.match(summed.formula, /0세 \+ 1세 \+ 2세 \+ … \+ 19세 = 20개 행 합계/);
  assert.equal(summed.value, AGE_SUM);
  assert.equal(summed.periodLabel, '2025년 12월 말 기준');
  assert.equal(summed.region, '광주광역시 광산구');
  assert.equal(summed.derived, true);
  assert.match(summed.note, /KOSIS가 그대로 발표한 숫자가 아닙니다/);

  // 좁은 범위도 그 범위만 더한다.
  const narrow = sumRange(made, { startAge: 7, endAge: 12 });
  assert.equal(narrow.label, '7~12세 주민등록인구');
  assert.equal(narrow.rowCount, 6);
  assert.equal(narrow.value, [7, 8, 9, 10, 11, 12].reduce((sum, age) => sum + 100 + age, 0));
});

test('겹치거나 빠지거나 섞인 자료는 더하지 않는다', () => {
  const made = candidatesFor(DATA, GWANGSAN, { limit: 100 });
  // 「계」와 남자인구수는 더하지 않는다. 넣으면 두 번 세게 된다.
  assert.equal(sumRange(made, { startAge: 0, endAge: 19 }).value, AGE_SUM);
  // 같은 나이가 같은 값으로 두 번 와도 한 번만 센다.
  const twice = candidatesFor([...DATA, row(5, 105)], GWANGSAN, { limit: 200 });
  assert.equal(sumRange(twice, { startAge: 0, endAge: 19 }).value, AGE_SUM);
  // 같은 나이가 다른 값으로 오면 더하지 않는다.
  const conflict = candidatesFor([...DATA, row(5, 777)], GWANGSAN, { limit: 200 });
  assert.equal(sumRange(conflict, { startAge: 0, endAge: 19 }).reason, 'conflict');
  // 범위 안에 빠진 나이가 있으면 더하지 않는다. 일부만 더한 값은 그 범위의 인구가 아니다.
  const missing = sumRange(made, { startAge: 0, endAge: 25 });
  assert.equal(missing.reason, 'incomplete');
  assert.match(missing.message, /20세, 21세/);
  // 기준시점이 섞이면 더하지 않는다.
  const mixed = candidatesFor([...AGES.slice(0, 3), { ...row(3, 103), PRD_DE: '2024' }], GWANGSAN, { limit: 100 });
  assert.equal(sumRange(mixed, { startAge: 0, endAge: 3 }).reason, 'mixed');
  // 「계」·「100세 이상」은 나이 하나가 아니다.
  assert.equal(ageOf('계'), null);
  assert.equal(ageOf('100세 이상'), null);
  assert.equal(ageOf('7세'), 7);
  assert.equal(sumRange([], { startAge: 0, endAge: 5 }).reason, 'no-rows');
  assert.equal(sumRange([], { startAge: 5, endAge: 1 }).reason, 'age-invalid');
});

// ---------- 호출 ----------

test('확인된 표 하나만 한 번 부른다', async () => {
  assert.equal(MAX_CALLS, 1);
  assert.equal(TABLE.tblId, 'DT_1B04006');
  const address = dataUrl(KEY, { region: GWANGSAN });
  // 지역은 코드로 좁히고 연령만 전부 받는다. 넓게 물으면 셀 수 초과로 거절당한다.
  assert.ok(address.includes('objL1=29200') && address.includes('objL2=ALL') && !address.includes('objL3'));
  assert.ok(address.includes('tblId=DT_1B04006'));
  const { db } = fakeCache();
  await withFetch([DATA], async seen => {
    const body = await (await post({ action: 'lookup', region: '광산구', startAge: 0, endAge: 19 }, { env: { ARCHIVE_DB: db, KOSIS_API_KEY: KEY } })).json();
    assert.equal(body.ok, true);
    assert.equal(body.calls, 1);
    assert.equal(seen.length, 1, '표를 추측하며 연달아 부르지 않는다');
    assert.equal(body.region, '광주광역시 광산구');
    assert.equal(body.summary.label, '0~19세 주민등록인구');
    assert.equal(body.table.tblId, 'DT_1B04006');
  });
  // 같은 지역을 다시 조회하면 부르지 않는다. 나이 범위만 달라져도 마찬가지다.
  await withFetch([], async seen => {
    const body = await (await post({ action: 'lookup', region: '광산구', startAge: 7, endAge: 12 }, { env: { ARCHIVE_DB: db, KOSIS_API_KEY: KEY } })).json();
    assert.equal(body.reused, true);
    assert.equal(body.calls, 0);
    assert.equal(body.summary.label, '7~12세 주민등록인구');
    assert.equal(seen.length, 0);
  });
});

test('지원하지 않는 지역과 애매한 이름은 조회하지 않는다', async () => {
  const { db } = fakeCache();
  await withFetch([], async seen => {
    const outside = await (await post({ action: 'lookup', region: '서울특별시 강남구' }, { env: { ARCHIVE_DB: db, KOSIS_API_KEY: KEY } })).json();
    assert.equal(outside.ok, false);
    assert.equal(outside.reason, 'unsupported');
    assert.equal(outside.message, SUPPORTED_REGION_TEXT);
    const ambiguous = await (await post({ action: 'lookup', region: '동구' }, { env: { ARCHIVE_DB: db, KOSIS_API_KEY: KEY } })).json();
    assert.equal(ambiguous.reason, 'ambiguous');
    assert.match(ambiguous.message, /광주광역시 동구/);
    assert.equal(seen.length, 0, '지원 밖 지역은 KOSIS를 부르지 않는다');
  });
});

test('대상 연령이 없으면 원자료만 보여 주고 합계를 만들지 않는다', async () => {
  const { db } = fakeCache();
  await withFetch([DATA], async () => {
    const body = await (await post({ action: 'lookup', region: '광산구' }, { env: { ARCHIVE_DB: db, KOSIS_API_KEY: KEY } })).json();
    assert.equal(body.ok, true);
    assert.equal(body.summary, null);
    assert.equal(body.summaryNotice, AGE_REQUIRED_MESSAGE);
    assert.ok(body.candidates.length);
  });
  // 나이를 잘못 적으면 조회하지 않는다.
  assert.equal((await post({ action: 'lookup', region: '광산구', startAge: 'abc' }, { env: { ARCHIVE_DB: db } })).status, 400);
  assert.equal((await post({ action: 'lookup', region: '광산구', startAge: 10, endAge: 3 }, { env: { ARCHIVE_DB: db } })).status, 400);
});

test('인증키가 없으면 아무 곳에도 요청하지 않고, 키는 어디에도 나오지 않는다', async () => {
  const { db } = fakeCache();
  await withFetch([], async seen => {
    const body = await (await post({ action: 'lookup', region: '광산구', startAge: 0, endAge: 19 }, { env: { ARCHIVE_DB: db } })).json();
    assert.equal(body.reason, 'missing-secret');
    assert.equal(body.message, NO_KEY_MESSAGE);
    assert.equal(seen.length, 0);
  });
  // KOSIS는 오류도 200으로 준다. 그 문구에 주소가 실려 있어도 키는 가린다.
  const { db: other } = fakeCache();
  await withFetch([{ err: '11', errMsg: `유효하지 않은 인증KEY입니다. apiKey=${KEY}` }], async () => {
    const body = await (await post({ action: 'lookup', region: '광산구' }, { env: { ARCHIVE_DB: other, KOSIS_API_KEY: KEY } })).json();
    assert.equal(body.reason, 'upstream');
    assert.ok(!JSON.stringify(body).includes(KEY));
    assert.match(body.message, /apiKey=\*\*\*/);
  });
  assert.equal(maskKey(`https://kosis.kr/x?apiKey=${KEY}&orgId=101`), 'https://kosis.kr/x?apiKey=***&orgId=101');
  assert.ok(!cacheKey('kosis-rows', { region: '29200', tblId: 'DT_1B04006' }).includes(KEY));
  assert.equal(kosisError([]), null);
});

test('로그인하지 않으면 조회할 수 없다', async () => {
  const { db } = fakeCache();
  assert.equal((await post({ action: 'lookup', region: '광산구' }, { env: { ARCHIVE_DB: db }, user: null })).status, 401);
  assert.equal((await post({ action: 'other' }, { env: { ARCHIVE_DB: db } })).status, 400);
});

test('값·기준시점·단위가 빠진 줄은 후보로 쓰지 않는다', () => {
  const broken = [
    { ...row(1, 100), UNIT_NM: '' },
    { ...row(2, 100), PRD_DE: '' },
    { ...row(3, 0), DT: '-' }
  ];
  for (const item of broken) assert.equal(normalizeRow(item, { region: GWANGSAN }).ok, false);
  assert.equal(candidatesFor(broken, GWANGSAN).length, 0);
  assert.equal(normalizeRow(row(4, 104), { region: GWANGSAN }).candidate.link, statHtmlLink('101', 'DT_1B04006'));
});

// ---------- 화면 ----------

test('화면은 합산 범위와 기준시점을 그대로 적고, 계획서에 넣지 않는다', () => {
  assert.match(app, /후보입니다\. 계획서에 자동으로 넣지 않습니다/);
  const view = app.slice(app.indexOf('function statCandidateView()'), app.indexOf('// 통계 근거 출처.'));
  // 합산 범위·행 수·합산식·기준시점을 화면에 적는다.
  assert.match(view, /합산 범위 \$\{summary\.startAge\}~\$\{summary\.endAge\}세 · 원자료 \$\{summary\.rowCount\}행/);
  assert.match(view, /escapeHtml\(summary\.formula\)/);
  assert.match(view, /escapeHtml\(summary\.periodLabel\)/);
  assert.match(view, /escapeHtml\(row\.periodLabel\)/);
  assert.match(view, /우리가 더한 값/);
  // 합계를 만들지 못한 이유를 화면이 말한다.
  assert.match(view, /합계를 만들지 않았습니다/);
  // 우리가 「아동·청소년」이라는 이름을 붙이지 않는다.
  assert.doesNotMatch(view, /아동·청소년/);
  // 지원 범위와 대상 연령 입력을 화면에 둔다.
  assert.match(app, /escapeHtml\(SUPPORTED_REGION_TEXT\)/);
  assert.match(app, /id="stat-age-start"/);
  assert.match(app, /id="stat-age-end"/);
  // 계획서 생성은 이 결과를 보내지 않는다.
  const run = app.slice(app.indexOf('async function runCoreProposal()'), app.indexOf('function coreResultView('));
  assert.ok(!run.includes('statLookup'));
});
