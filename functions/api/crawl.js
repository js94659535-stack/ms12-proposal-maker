// 공고 수집 결과 읽기(10-42). 하루 두 번(한국시간 08:00·18:00) 도는 수집 Worker(ms12-notice-collector)가 D1에 쌓아 둔
// 공고를 보여 준다. 읽기만 한다 — 쓰기·삭제 경로는 이 파일에 없다. AI 호출 없음.
// 공개 공고의 제목·기간·요약·원문 주소만 돌려주고, 첨부 원문·내부 검색 열은 돌려주지 않는다.
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600' };
const LIMIT = 200;

const GROUP_LABELS = { chest: '사랑의열매', kihf: '가족센터', edu: '교육청', g2b: '나라장터', babo: '바보의나눔', busrugy: '부스러기사랑나눔회' };

export function kstToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
export function daysLeft(deadline, today = kstToday()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline || '')) return null;
  return Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
const safeJson = text => { try { return JSON.parse(text); } catch { return {}; } };
const httpUrl = value => (/^https:\/\//.test(String(value || '')) ? String(value) : '');

export function shapeNotice(row, today = kstToday()) {
  const json = safeJson(row.notice_json);
  return {
    group: row.source_group || 'chest',
    groupLabel: GROUP_LABELS[row.source_group || 'chest'] || row.source_label || '',
    source: row.source_label || '',
    title: row.title,
    deadline: row.deadline || '',
    daysLeft: daysLeft(row.deadline, today),
    period: row.application_period || '',
    summary: row.summary || '',
    supportLimit: row.support_limit || '',
    url: httpUrl(json.sourceUrl) || httpUrl(row.source_url),
    updatedAt: row.updated_at
  };
}

export function shapeRun(run) {
  if (!run) return null;
  const channels = (safeJson(run.sources_json) || []);
  return {
    startedAt: run.started_at,
    status: run.status,
    collected: run.collected,
    inserted: run.inserted,
    updated: run.updated,
    failureCode: run.failure_code || '',
    channels: (Array.isArray(channels) ? channels : []).map(c => ({ label: c.label || c.source || '', status: c.status || '', reason: c.reason || c.code || '', listed: c.listed ?? 0, collected: c.collected ?? 0 }))
  };
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return new Response(JSON.stringify({ error: 'GET 요청만 허용됩니다.' }), { status: 405, headers: { ...HEADERS, Allow: 'GET', 'Cache-Control': 'no-store' } });
  const db = context.env?.ARCHIVE_DB;
  if (!db) return new Response(JSON.stringify({ error: '수집 자료 저장소가 연결되어 있지 않습니다.' }), { status: 503, headers: { ...HEADERS, 'Cache-Control': 'no-store' } });
  try {
    const rows = await db.prepare(`SELECT source_label, source_group, title, deadline, application_period, summary, support_limit, notice_json, source_url, updated_at
      FROM archived_notices WHERE is_public = 1 AND duplicate_of = '' ORDER BY updated_at DESC LIMIT ${LIMIT}`).all();
    const run = await db.prepare('SELECT started_at, status, collected, inserted, updated, failure_code, sources_json FROM notice_collection_runs ORDER BY started_at DESC LIMIT 1').first();
    const state = await db.prepare('SELECT last_success_at, consecutive_failures FROM notice_collection_state WHERE id = 1').first();
    const today = kstToday();
    const items = (rows.results || []).map(row => shapeNotice(row, today));
    // 마감이 열린 것(가까운 순) → 마감 모름 → 마감된 것(최근 순)
    const rank = item => (item.daysLeft === null ? 1 : item.daysLeft >= 0 ? 0 : 2);
    items.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.daysLeft - a.daysLeft : (a.daysLeft ?? 0) - (b.daysLeft ?? 0)));
    return new Response(JSON.stringify({ items, run: shapeRun(run), lastSuccessAt: state?.last_success_at || '', consecutiveFailures: state?.consecutive_failures || 0, today }), { headers: HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: '수집 결과를 읽지 못했습니다.' }), { status: 502, headers: { ...HEADERS, 'Cache-Control': 'no-store' } });
  }
}
