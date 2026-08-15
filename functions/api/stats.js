// 공식 통계 근거 후보 조회(KOSIS). 찾아서 보여 주기만 한다. 계획서에 자동으로 넣지 않는다.
//
// 규칙
// - 확인된 표 하나(DT_1B04006)만 부른다. 한 번 조회에 상류 호출은 1회다. 표를 추측하며 연달아 부르지 않는다.
// - 인증키가 없으면 아무 곳에도 요청하지 않는다. 키는 응답·오류·기록 어디에도 싣지 않는다.
// - 같은 조회는 캐시로 답한다. 같은 값을 두 번 받아 오려고 KOSIS를 다시 부르지 않는다.
// - 지원하는 지역이 아니면 조회하지 않고 지원 범위를 그대로 알려 준다.
// - 대상 연령을 모르면 더하지 않는다. 0~19세를 「아동·청소년」이라 부르지 않는다.
import {
  AGE_REQUIRED_MESSAGE, NOT_FOUND_MESSAGE, NO_KEY_MESSAGE, SUPPORTED_REGION_TEXT, TABLE,
  cacheKey, candidatesFor, dataUrl, kosisError, maskKey, resolveRegion, sumRange
} from '../../server/kosis.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
// 한 번 조회에 KOSIS를 부르는 최대 횟수. 확인된 표 하나만 부르므로 1이다.
export const MAX_CALLS = 1;
const TIMEOUT_MS = 15_000;
const MAX_AGE = 120;
// 화면에 늘어놓는 줄 수. 나머지는 KOSIS 원자료 링크로 본다.
const SHOW_ROWS = 8;

// 적지 않으면 null(합산하지 않음), 잘못 적으면 undefined(조회하지 않음).
const ageOrNull = value => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= MAX_AGE ? number : undefined;
};

export async function onRequest(context) {
  const { request, env, data } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  const user = data.session?.user;
  if (!user?.id) return json({ error: '로그인이 필요합니다.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }
  if (body.action !== 'lookup') return json({ error: '지원하지 않는 작업입니다.' }, 400);

  const found = resolveRegion(body.region);
  if (!found.ok) {
    const message = found.reason === 'ambiguous'
      ? `「${String(body.region ?? '').trim()}」은(는) 여러 시에 있는 이름입니다. 「광주광역시 ${found.region.short}」처럼 적어 주세요.`
      : found.reason === 'empty' ? '지역을 적어 주세요.' : SUPPORTED_REGION_TEXT;
    return json({ ok: false, reason: found.reason, message, supported: SUPPORTED_REGION_TEXT, calls: 0, reused: false }, 200);
  }
  const region = found.region;

  // 대상 연령. 적지 않으면 더하지 않고 물어본다. 잘못 적으면 조회하지 않는다.
  const startAge = ageOrNull(body.startAge);
  const endAge = ageOrNull(body.endAge);
  if (startAge === undefined || endAge === undefined) return json({ error: `대상 연령은 0~${MAX_AGE} 사이 정수로 적어 주세요.` }, 400);
  if (startAge !== null && endAge !== null && endAge < startAge) return json({ error: '대상 연령의 시작이 끝보다 큽니다.' }, 400);

  // 나이 범위는 받아 온 자료를 나누는 기준일 뿐이다. 캐시는 지역과 표로만 나눈다.
  const key = cacheKey('kosis-rows', { region: region.code, tblId: TABLE.tblId });
  const cached = await readCache(env.ARCHIVE_DB, key);
  const fresh = cached ? null : await fetchRows(env, region);
  if (fresh?.blocked) return json(fresh.blocked, 200);
  if (fresh?.error) return json({ ok: false, reason: 'upstream', message: fresh.error.message, calls: fresh.calls, reused: false }, 200);

  const rows = cached ? cached.rows : fresh.rows;
  const fetchedAt = cached ? cached.fetchedAt : new Date().toISOString();
  const calls = cached ? 0 : fresh.calls;
  if (!cached) await writeCache(env.ARCHIVE_DB, key, { rows, fetchedAt }, calls);

  // 합계는 나이별 원자료 전부를 보고 만든다. 화면에 늘어놓는 줄만 앞에서 잘라 보여 준다.
  const all = candidatesFor(rows, region, { startAge, endAge, limit: 1_000 });
  if (!all.length) return json({ ok: false, reason: 'not-found', message: NOT_FOUND_MESSAGE, calls, reused: Boolean(cached) }, 200);
  const candidates = all.slice(0, SHOW_ROWS);

  const summary = sumRange(all, { startAge, endAge });
  return json({
    ok: true, calls, reused: Boolean(cached),
    region: region.full, regionCode: region.code,
    table: { tblId: TABLE.tblId, tableName: TABLE.tableName, survey: TABLE.survey, organization: TABLE.organization },
    supported: SUPPORTED_REGION_TEXT, fetchedAt,
    summary: summary.ok ? summary : null,
    // 더하지 못한 이유도 그대로 돌려준다. 화면이 「왜 합계가 없는지」를 말할 수 있어야 한다.
    summaryNotice: summary.ok ? '' : (summary.message || AGE_REQUIRED_MESSAGE),
    candidates
  });
}

// 확인된 표 하나를 한 번 부른다. 실패해도 다른 표로 넘어가지 않는다.
async function fetchRows(env, region) {
  if (!env.KOSIS_API_KEY) return { blocked: { ok: false, reason: 'missing-secret', message: NO_KEY_MESSAGE, calls: 0, reused: false } };
  const result = await getJson(dataUrl(env.KOSIS_API_KEY, { region }));
  if (result.error) return { error: result.error, calls: MAX_CALLS };
  return { rows: result.payload, calls: MAX_CALLS };
}

async function getJson(address, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(address, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return { error: { code: String(response.status), message: `통계 서버가 ${response.status}로 응답했습니다.` } };
    const payload = await response.json();
    const failure = kosisError(payload);
    if (failure) return { error: failure };
    return { payload };
  } catch (error) {
    // 오류 문구에 주소가 실려 있어도 키는 가린다.
    return { error: { code: 'network', message: maskKey(error?.message || '통계 서버에 연결하지 못했습니다.') } };
  } finally { clearTimeout(timer); }
}

async function readCache(db, key) {
  if (!db) return null;
  const row = await db.prepare('SELECT payload, fetched_at FROM stat_lookup_cache WHERE cache_key = ?').bind(key).first().catch(() => null);
  if (!row?.payload) return null;
  await db.prepare('UPDATE stat_lookup_cache SET hits = hits + 1 WHERE cache_key = ?').bind(key).run().catch(() => null);
  try {
    const saved = JSON.parse(row.payload);
    return Array.isArray(saved?.rows) ? { rows: saved.rows, fetchedAt: row.fetched_at } : null;
  } catch { return null; }
}

async function writeCache(db, key, value, calls) {
  if (!db) return;
  await db.prepare(`INSERT INTO stat_lookup_cache (cache_key, payload, source, calls, fetched_at, hits)
    VALUES (?, ?, 'kosis', ?, ?, 0)
    ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, calls = excluded.calls, fetched_at = excluded.fetched_at`)
    .bind(key, JSON.stringify(value), Number(calls) || 0, value.fetchedAt).run().catch(() => null);
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
