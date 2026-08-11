// 공모정보 검색. 로그인하지 않아도 열리는 유일한 자료 경로다.
// 이미 D1에 모아 둔 archived_notices만 읽는다. AI도 외부 API도 부르지 않고 새로 수집하지도 않는다.
// 회원 계획서(archived_proposals)·기관 자료(applicant_organizations)·계정 자료는 이 파일에서 읽지 않는다.
// 공고 본문 원문(notice_json)은 SELECT에 넣지 않으므로 검색 범위에도 응답에도 들어가지 않는다.
import { MODE_LABELS, RANK, SEARCH_LIMIT, facetsOf, parseQuery, passesFilters, publicNotice, rankNotice, scoreNotice, searchMode, withDerived } from '../../server/notice-search.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
// 한 번에 읽는 자료 수. 현재 수집 규모(수십 건)보다 넉넉히 크게 잡아 두고, 순위는 서버가 매긴다.
const SCAN_LIMIT = 400;
const SIGNUP_NOTICE = '상세 적합성 분석과 맞춤 사업설계는 회원가입 후 이용할 수 있습니다.';
// 원문 본문을 뺀 공개 열만 읽는다.
const COLUMNS = `source_key, source, source_label, list_sn, title, deadline, application_period,
  summary, eligibility, support_limit, region, audience, field, source_url`;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  }
  if (!env.ARCHIVE_DB) return json({ error: '공모정보 데이터베이스가 연결되지 않았습니다.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }

  if (body.action === 'searchNotices') return searchNotices(env.ARCHIVE_DB, body);
  if (body.action === 'noticeDetail') return noticeDetail(env.ARCHIVE_DB, body.key);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

async function searchNotices(db, body) {
  const terms = parseQuery(body.query);
  const mode = searchMode(body.mode);
  const filters = body.filters && typeof body.filters === 'object' ? body.filters : {};
  const now = new Date();
  const rows = (await publicRows(db)).map(withDerived);

  const hits = [];
  for (const row of rows) {
    const rank = rankNotice(row, terms, mode);
    if (rank === RANK.none) continue;
    hits.push({ row, rank, score: scoreNotice(row, terms, mode, now) });
  }
  const filtered = hits.filter(item => passesFilters(item.row, filters, now));
  // 등급이 순위를 먼저 정한다. 광역검색이어도 제목에 걸린 결과가 요약만 걸린 결과보다 항상 위다.
  filtered.sort((a, b) => b.score - a.score || String(a.row.deadline || '9999').localeCompare(String(b.row.deadline || '9999')));

  return json({
    mode, modeLabel: MODE_LABELS[mode], query: terms.join(' '),
    notices: filtered.slice(0, SEARCH_LIMIT).map(item => publicNotice(item.row, now, item.rank)),
    total: filtered.length,
    // 무엇을 더 좁힐 수 있는지 보이게 필터 후보는 검색어까지만 반영한 결과에서 센다.
    facets: facetsOf(hits.map(item => item.row), now),
    limit: SEARCH_LIMIT, signupNotice: SIGNUP_NOTICE
  }, 200);
}

async function noticeDetail(db, key) {
  const row = await db.prepare(`SELECT ${COLUMNS}, support_details FROM archived_notices WHERE source_key = ? AND is_public = 1`)
    .bind(String(key || '').slice(0, 180)).first();
  if (!row) return json({ error: '공개된 공모정보를 찾지 못했습니다.' }, 404);
  const notice = publicNotice(withDerived(row));
  // 지원내용은 요약 수준으로만 덧붙인다. 공고 본문 원문은 내보내지 않고 출처로 안내한다.
  return json({ notice: { ...notice, supportDetails: String(row.support_details || '').trim().slice(0, 1500) }, signupNotice: SIGNUP_NOTICE }, 200);
}

// 공개로 표시된 자료만 읽는다. 마감이 아직 남은 것부터 가져와 상한에 걸려도 쓸모 있는 쪽이 남게 한다.
async function publicRows(db) {
  const rows = await db.prepare(`SELECT ${COLUMNS} FROM archived_notices WHERE is_public = 1
    ORDER BY (deadline = '') ASC, deadline DESC LIMIT ${SCAN_LIMIT}`).all();
  return rows?.results || [];
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
