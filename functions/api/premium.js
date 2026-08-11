// 프리미엄회원(정식 수주회원) 전용. 읽기만 한다.
// 다른 회원의 기관정보·계획서, 관리자 내부 검토내용, 감사기록, 수집 설정에는 이 경로로 닿을 수 없다.
import { NEED_PREMIUM, PREMIUM_ADMIN_LABEL, PREMIUM_LABEL, SHOWCASE_LIMIT, contractState, publicShowcase } from '../../server/premium.js';
import {
  DEADLINE_LABELS, MODE_LABELS, RANK_LABELS, SEARCH_LIMIT, deadlineState, facetsOf,
  parseQuery, passesFilters, publicNotice, scoreNotice, searchMode, withDerived
} from '../../server/notice-search.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
// 마감일을 확인하지 못한 공고. 공개 검색의 「모집 중」 판정은 그대로 두고 이력 화면에서만 따로 가른다.
const UNKNOWN_STATE = 'unknown';
const STATE_LABELS = { ...DEADLINE_LABELS, [UNKNOWN_STATE]: '마감일 확인 필요' };

export async function onRequest(context) {
  const { request, env, data } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  }
  const user = data.session?.user;
  if (!user?.id) return json({ error: '로그인이 필요합니다.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }

  const contract = await loadContract(env.ARCHIVE_DB, user.id);
  const state = contractState(contract);
  const staff = ['admin', 'operator'].includes(user.role);
  // 계약이 끝났어도 화면은 열어 둔다. 새 전문 작업만 막는다.
  if (!staff && !state.premium) return json({ error: NEED_PREMIUM, needsPremium: true }, 403);

  if (body.action === 'status') return json(statusPayload(user, contract, state, staff), 200);
  if (body.action === 'showcase') return json({ proposals: await listShowcase(env.ARCHIVE_DB) }, 200);
  if (body.action === 'noticeHistory') return json(await noticeHistory(env.ARCHIVE_DB, body), 200);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

function statusPayload(user, contract, state, staff) {
  return {
    premium: staff ? true : state.premium,
    memberLabel: PREMIUM_LABEL, adminLabel: PREMIUM_ADMIN_LABEL,
    // 본인의 계약과 작업 진행상태만 본다. 다른 회원의 계약은 이 경로로 나가지 않는다.
    contract: contract ? {
      status: state.status, statusLabel: state.label, startedOn: contract.startedOn, endsOn: contract.endsOn,
      progress: contract.progress, progressNote: contract.progressNote, contractName: contract.contractName,
      canStartWork: state.canStartWork, readOnly: state.readOnly, updatedAt: contract.updatedAt
    } : null,
    viewingAsStaff: staff && !state.premium
  };
}

async function loadContract(db, userId) {
  const row = await db.prepare(`SELECT user_id, status, started_on, ends_on, progress, progress_note, contract_name, updated_at
    FROM premium_contracts WHERE user_id = ?`).bind(String(userId || '')).first();
  if (!row) return null;
  return {
    userId: row.user_id, status: row.status, startedOn: row.started_on || '', endsOn: row.ends_on || '',
    progress: row.progress || '접수', progressNote: row.progress_note || '', contractName: row.contract_name || '',
    updatedAt: row.updated_at || ''
  };
}

// 관리자가 공개로 승인한 사본만, 정해진 편수까지만 내보낸다.
// 회원 계획서 표(archived_proposals)는 이 경로에서 읽지 않는다.
async function listShowcase(db) {
  const rows = await db.prepare(`SELECT id, title, field, purpose, audience, structure, outcome_design, body, sort_order
    FROM showcase_proposals WHERE is_public = 1 ORDER BY sort_order, created_at LIMIT ?`).bind(SHOWCASE_LIMIT).all();
  return (rows?.results || []).map(publicShowcase);
}

// 수집 이력 검색. 읽기 전용이며 공개 여부·수집 설정을 바꾸지 않는다.
async function noticeHistory(db, body) {
  const rows = (await db.prepare(`SELECT source_key, source, source_label, list_sn, title, deadline, application_period,
    summary, eligibility, support_limit, region, audience, field, source_url, first_seen_at, last_checked_at, updated_at
    FROM archived_notices WHERE is_public = 1`).all())?.results || [];
  const now = new Date();
  const terms = parseQuery(body.query);
  const mode = searchMode(body.mode);
  const filters = body.filters && typeof body.filters === 'object' ? body.filters : {};
  const wantedState = String(filters.state || '');

  const derived = rows.map(withDerived);
  const hits = [];
  for (const row of derived) {
    const state = historyState(row.deadline, now);
    // 상태 거르기는 「마감일 확인 필요」까지 갈라 보므로 공개 검색 규칙과 따로 계산한다.
    if (wantedState && state !== wantedState) continue;
    if (!passesFilters(row, { ...filters, state: '' }, now)) continue;
    const scored = scoreNotice(row, terms, mode, now);
    if (!scored) continue;
    hits.push({ row, scored, state });
  }
  hits.sort((left, right) => right.scored.rank - left.scored.rank || right.scored.score - left.scored.score
    || String(left.row.deadline || '9999').localeCompare(String(right.row.deadline || '9999')));

  return {
    mode, modeLabel: MODE_LABELS[mode], query: terms.join(' '),
    total: hits.length, limit: SEARCH_LIMIT,
    stateLabels: STATE_LABELS,
    facets: facetsOf(derived, now),
    notices: hits.slice(0, SEARCH_LIMIT).map(hit => historyNotice(hit.row, hit.state, hit.scored.rank, now))
  };
}

export function historyState(deadline, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deadline || '').slice(0, 10))) return UNKNOWN_STATE;
  return deadlineState(deadline, now);
}

// 수집 출처·최초 수집일·마지막 확인일까지 더해 준다.
// 공개 여부·중복 판정·내용 해시는 관리자 화면 값이라 넣지 않는다.
function historyNotice(row, state, rank, now) {
  return {
    ...publicNotice(row, now, rank),
    state, stateLabel: STATE_LABELS[state] || state,
    matchedBy: RANK_LABELS[rank] || '',
    source: String(row.source || ''),
    collectedAt: String(row.first_seen_at || ''),
    lastCheckedAt: String(row.last_checked_at || row.updated_at || '')
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
