// 공식 통계 근거 후보 조회(KOSIS). 찾아서 보여 주기만 한다. 계획서에 자동으로 넣지 않는다.
//
// 규칙
// - 인증키가 없으면 아무 곳에도 요청하지 않는다. 키는 응답·오류·기록 어디에도 싣지 않는다.
// - 같은 조회는 캐시로 답한다. 같은 값을 두 번 받아 오려고 KOSIS를 다시 부르지 않는다.
// - 지역·기준연도·단위가 분명하지 않은 값은 후보로 삼지 않는다.
// - 찾지 못하면 비슷한 값으로 대신하지 않고 찾지 못했다고 답한다.
import {
  NOT_FOUND_MESSAGE, NO_KEY_MESSAGE, cacheKey, chooseCandidates, dataUrl,
  findRegionCode, kosisError, maskKey, metaUrl, pickTables, rowsForRegion, searchUrl
} from '../../server/kosis.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
// 한 번 조회에 KOSIS를 부르는 최대 횟수. 표를 못 찾아도 여기서 멈춘다.
export const MAX_CALLS = 8;
const TIMEOUT_MS = 15_000;

// 무엇을 찾을지. 화면이 아무 말이나 보내도 여기 있는 것만 조회한다.
export const TOPICS = Object.freeze({
  children: {
    label: '아동·청소년 인구',
    searchNm: '연령별 인구',
    tableKeywords: ['연령', '인구'],
    itemKeywords: ['0~9세', '10~19세', '0-9세', '10-19세', '아동', '청소년', '연령']
  }
});

export async function onRequest(context) {
  const { request, env, data } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  const user = data.session?.user;
  if (!user?.id) return json({ error: '로그인이 필요합니다.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }
  if (body.action !== 'lookup') return json({ error: '지원하지 않는 작업입니다.' }, 400);

  const topic = TOPICS[String(body.topic || 'children')];
  const region = String(body.region || '').trim().slice(0, 40);
  if (!topic) return json({ error: '조회할 수 있는 통계 주제가 아닙니다.' }, 400);
  if (!region) return json({ error: '지역을 적어 주세요.' }, 400);

  const key = cacheKey('kosis-lookup', { region, topic: body.topic || 'children' });
  const cached = await readCache(env.ARCHIVE_DB, key);
  if (cached) return json({ ...cached, reused: true, calls: 0 });

  // 키가 없으면 여기서 끝난다. 요청을 만들지도 않는다.
  if (!env.KOSIS_API_KEY) return json({ ok: false, reason: 'missing-secret', message: NO_KEY_MESSAGE, calls: 0, reused: false }, 200);

  const result = await lookup(env.KOSIS_API_KEY, { region, topic });
  if (result.ok) await writeCache(env.ARCHIVE_DB, key, result, result.calls);
  return json({ ...result, reused: false });
}

// 검색 → 지역코드 → 값. 부른 횟수를 세어 함께 돌려준다.
export async function lookup(apiKey, { region, topic, fetcher = fetch }) {
  let calls = 0;
  const tried = [];
  const call = async address => {
    calls += 1;
    return getJson(address, fetcher);
  };

  const search = await call(searchUrl(apiKey, { searchNm: topic.searchNm }));
  if (search.error) return { ok: false, reason: 'upstream', message: search.error.message, calls, tried };
  const tables = pickTables(search.payload, { keywords: topic.tableKeywords });
  if (!tables.length) return { ok: false, reason: 'not-found', message: NOT_FOUND_MESSAGE, calls, tried };

  for (const table of tables) {
    if (calls + 2 > MAX_CALLS) break;
    const meta = await call(metaUrl(apiKey, { orgId: table.orgId, tblId: table.tblId, type: 'OBJ' }));
    // 코드표를 못 읽으면 전체를 받아 이름으로 고른다. 이름이 맞는 줄만 쓰므로 다른 지역이 섞이지 않는다.
    const code = meta.error ? null : findRegionCode(meta.payload, region);
    if (meta.error) tried.push({ tblId: table.tblId, reason: 'meta', detail: meta.error.message });
    else if (!code) { tried.push({ tblId: table.tblId, reason: 'region' }); continue; }

    const rows = await call(dataUrl(apiKey, { orgId: table.orgId, tblId: table.tblId, objL1: code ? code.code : 'ALL' }));
    if (rows.error) { tried.push({ tblId: table.tblId, reason: 'data', detail: rows.error.message }); continue; }
    const picked = code ? rows.payload : rowsForRegion(rows.payload, region);
    if (!picked.length) { tried.push({ tblId: table.tblId, reason: 'region' }); continue; }
    const candidates = chooseCandidates(picked, {
      orgId: table.orgId, tblId: table.tblId, survey: table.survey, org: table.org, regionName: code ? code.label : ''
    }, { keywords: topic.itemKeywords });
    if (!candidates.length) { tried.push({ tblId: table.tblId, reason: 'incomplete' }); continue; }

    return {
      ok: true, calls, tried,
      topic: topic.label, region: code ? code.label : (candidates[0]?.region || region),
      fetchedAt: new Date().toISOString(),
      candidates
    };
  }
  return { ok: false, reason: 'not-found', message: NOT_FOUND_MESSAGE, calls, tried };
}

async function getJson(address, fetcher) {
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
  try { return { ...JSON.parse(row.payload), fetchedAt: row.fetched_at }; } catch { return null; }
}

async function writeCache(db, key, result, calls) {
  if (!db) return;
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO stat_lookup_cache (cache_key, payload, source, calls, fetched_at, hits)
    VALUES (?, ?, 'kosis', ?, ?, 0)
    ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, calls = excluded.calls, fetched_at = excluded.fetched_at`)
    .bind(key, JSON.stringify(result), Number(calls) || 0, now).run().catch(() => null);
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
