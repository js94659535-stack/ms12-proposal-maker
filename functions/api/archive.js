const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const MAX_NOTICE_BATCH = 100;
const MAX_PROPOSAL_BYTES = 700_000;
const MAX_APPLICANT_BYTES = 300_000;
const APPLICANT_STATUSES = ['확인됨', '확인 필요', '오래된 정보'];

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if (!context.env.ARCHIVE_DB) return json({ error: '자료보관함 데이터베이스가 연결되지 않았습니다.' }, 503);
  if (!(context.request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }
  try {
    if (body.action === 'syncNotices') return json(await syncNotices(context.env.ARCHIVE_DB, body.notices));
    if (body.action === 'searchNotices') return json({ notices: await searchNotices(context.env.ARCHIVE_DB, body.filters, await owner(context.request)) });
    const ownerHash = await owner(context.request);
    if (!ownerHash) return json({ error: '자료보관함 식별키가 없습니다.' }, 401);
    if (body.action === 'saveProposal') return json(await saveProposal(context.env.ARCHIVE_DB, ownerHash, body.proposal));
    if (body.action === 'listProposals') return json({ proposals: await listProposals(context.env.ARCHIVE_DB, ownerHash) });
    if (body.action === 'getProposal') return json({ proposal: await getProposal(context.env.ARCHIVE_DB, ownerHash, body.id) });
    if (body.action === 'saveApplicant') return json(await saveApplicant(context.env.ARCHIVE_DB, ownerHash, body.applicant));
    if (body.action === 'listApplicants') return json({ applicants: await listApplicants(context.env.ARCHIVE_DB, ownerHash) });
    if (body.action === 'deleteApplicant') return json(await deleteApplicant(context.env.ARCHIVE_DB, ownerHash, body.id));
    return json({ error: '지원하지 않는 자료보관함 작업입니다.' }, 400);
  } catch (error) {
    return json({ error: '자료보관함 처리 중 오류가 발생했습니다.' }, 500);
  }
}

export async function syncNotices(db, values) {
  const notices = Array.isArray(values) ? values.slice(0, MAX_NOTICE_BATCH) : [];
  const result = { inserted: 0, updated: 0, unchanged: 0 };
  for (const notice of notices) {
    const normalized = normalizeNotice(notice);
    if (!normalized) continue;
    const existing = await db.prepare('SELECT content_hash FROM archived_notices WHERE source_key = ?').bind(normalized.sourceKey).first();
    if (existing?.content_hash === normalized.contentHash) { result.unchanged += 1; continue; }
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO archived_notices (source_key, source, source_label, list_sn, dstb_bsns_code, title, deadline, application_period, summary, eligibility, support_details, support_limit, content_hash, notice_json, first_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET source=excluded.source, source_label=excluded.source_label, list_sn=excluded.list_sn, dstb_bsns_code=excluded.dstb_bsns_code, title=excluded.title, deadline=excluded.deadline, application_period=excluded.application_period, summary=excluded.summary, eligibility=excluded.eligibility, support_details=excluded.support_details, support_limit=excluded.support_limit, content_hash=excluded.content_hash, notice_json=excluded.notice_json, updated_at=excluded.updated_at`)
      .bind(normalized.sourceKey, normalized.source, normalized.sourceLabel, normalized.listSn, normalized.dstbBsnsCode, normalized.title, normalized.deadline, normalized.applicationPeriod, normalized.summary, normalized.eligibility, normalized.supportDetails, normalized.supportLimit, normalized.contentHash, normalized.noticeJson, now, now).run();
    if (existing) result.updated += 1; else result.inserted += 1;
  }
  return result;
}

export async function searchNotices(db, filters = {}, ownerHash = '') {
  const clauses = [];
  const bindings = [];
  const institution = clean(filters.institution, 100);
  const keyword = clean(filters.keyword, 100);
  const from = date(filters.from);
  const to = date(filters.to);
  if (institution) { clauses.push('(source_label LIKE ? OR source LIKE ?)'); bindings.push(`%${institution}%`, `%${institution}%`); }
  if (keyword) { clauses.push('(title LIKE ? OR summary LIKE ? OR eligibility LIKE ? OR support_details LIKE ? OR notice_json LIKE ?)'); bindings.push(...Array(5).fill(`%${keyword}%`)); }
  if (from) { clauses.push("(deadline = '' OR deadline >= ?)"); bindings.push(from); }
  if (to) { clauses.push("(deadline = '' OR deadline <= ?)"); bindings.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.prepare(`SELECT n.notice_json, n.source_key, n.first_seen_at, n.updated_at,
    (SELECT COUNT(*) FROM archived_proposals p WHERE p.notice_key = n.source_key AND p.owner_hash = ?) AS linked_proposal_count,
    (SELECT p.id FROM archived_proposals p WHERE p.notice_key = n.source_key AND p.owner_hash = ? ORDER BY p.updated_at DESC LIMIT 1) AS linked_proposal_id
    FROM archived_notices n ${where.replaceAll(/\b(source_label|source|title|summary|eligibility|support_details|deadline|notice_json)\b/g, 'n.$1')} ORDER BY n.updated_at DESC, n.deadline DESC LIMIT 100`).bind(ownerHash, ownerHash, ...bindings).all();
  return (rows.results || []).map(row => ({ ...safeJson(row.notice_json), archiveNoticeKey: row.source_key, archivedAt: row.first_seen_at, archiveUpdatedAt: row.updated_at, linkedProposalCount: Number(row.linked_proposal_count || 0), linkedProposalId: row.linked_proposal_id || '' }));
}

export async function saveProposal(db, ownerHash, value) {
  if (!value || typeof value !== 'object') throw new Error('invalid proposal');
  const id = clean(value.id, 80);
  const title = clean(value.title, 300);
  const stage = clean(value.stage, 40);
  const snapshot = JSON.stringify(value.snapshot || {});
  if (!id || !title || !stage || new TextEncoder().encode(snapshot).byteLength > MAX_PROPOSAL_BYTES) throw new Error('invalid proposal');
  const existing = await db.prepare('SELECT created_at FROM archived_proposals WHERE id = ? AND owner_hash = ?').bind(id, ownerHash).first();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO archived_proposals (id, owner_hash, notice_key, title, stage, proposal_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, stage=excluded.stage, notice_key=excluded.notice_key, proposal_json=excluded.proposal_json, updated_at=excluded.updated_at WHERE archived_proposals.owner_hash=excluded.owner_hash`)
    .bind(id, ownerHash, clean(value.noticeKey, 180), title, stage, snapshot, existing?.created_at || now, now).run();
  return { id, updatedAt: now };
}

export async function listProposals(db, ownerHash) {
  const rows = await db.prepare('SELECT id, notice_key, title, stage, created_at, updated_at FROM archived_proposals WHERE owner_hash = ? ORDER BY updated_at DESC LIMIT 100').bind(ownerHash).all();
  return (rows.results || []).map(row => ({ id: row.id, noticeKey: row.notice_key, title: row.title, stage: row.stage, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function getProposal(db, ownerHash, id) {
  const row = await db.prepare('SELECT id, notice_key, title, stage, proposal_json, created_at, updated_at FROM archived_proposals WHERE id = ? AND owner_hash = ?').bind(clean(id, 80), ownerHash).first();
  return row ? { id: row.id, noticeKey: row.notice_key, title: row.title, stage: row.stage, snapshot: safeJson(row.proposal_json), createdAt: row.created_at, updatedAt: row.updated_at } : null;
}

// 「신청기관 정보」는 계획서와 같은 소유자 키(owner_hash) 기준으로 보관한다.
export function normalizeApplicantRecord(value) {
  if (!value || typeof value !== 'object') return null;
  const id = clean(value.id, 80);
  const name = clean(value.name, 120);
  if (!id || !name) return null;
  const items = (Array.isArray(value.items) ? value.items : []).slice(0, 300).map((item, index) => ({
    id: clean(item?.id, 80) || `item-${index + 1}`,
    area: clean(item?.area, 40) || 'basic',
    label: clean(item?.label, 120),
    value: clean(item?.value, 2000),
    status: APPLICANT_STATUSES.includes(item?.status) ? item.status : '확인 필요',
    source: clean(item?.source, 300),
    asOf: clean(item?.asOf, 40),
    history: (Array.isArray(item?.history) ? item.history : []).slice(-20).map(entry => ({
      value: clean(entry?.value, 2000), status: APPLICANT_STATUSES.includes(entry?.status) ? entry.status : '확인 필요',
      source: clean(entry?.source, 300), asOf: clean(entry?.asOf, 40), recordedAt: clean(entry?.recordedAt, 40)
    })),
    updatedAt: clean(item?.updatedAt, 40)
  }));
  return {
    id, name, note: clean(value.note, 500), items,
    confirmedCount: items.filter(item => item.status === '확인됨').length,
    unverifiedCount: items.filter(item => item.status !== '확인됨').length,
    createdAt: clean(value.createdAt, 40), updatedAt: clean(value.updatedAt, 40)
  };
}

export async function saveApplicant(db, ownerHash, value) {
  const applicant = normalizeApplicantRecord(value);
  if (!applicant) throw new Error('invalid applicant');
  const payload = JSON.stringify(applicant);
  if (new TextEncoder().encode(payload).byteLength > MAX_APPLICANT_BYTES) throw new Error('invalid applicant');
  const existing = await db.prepare('SELECT created_at FROM applicant_organizations WHERE id = ? AND owner_hash = ?').bind(applicant.id, ownerHash).first();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO applicant_organizations (id, owner_hash, name, note, confirmed_count, unverified_count, applicant_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, note=excluded.note, confirmed_count=excluded.confirmed_count, unverified_count=excluded.unverified_count, applicant_json=excluded.applicant_json, updated_at=excluded.updated_at WHERE applicant_organizations.owner_hash=excluded.owner_hash`)
    .bind(applicant.id, ownerHash, applicant.name, applicant.note, applicant.confirmedCount, applicant.unverifiedCount, payload, existing?.created_at || now, now).run();
  return { id: applicant.id, updatedAt: now };
}

export async function listApplicants(db, ownerHash) {
  const rows = await db.prepare('SELECT applicant_json, created_at, updated_at FROM applicant_organizations WHERE owner_hash = ? ORDER BY updated_at DESC LIMIT 100').bind(ownerHash).all();
  return (rows.results || []).map(row => ({ ...safeJson(row.applicant_json), createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function deleteApplicant(db, ownerHash, id) {
  const key = clean(id, 80);
  if (!key) throw new Error('invalid applicant');
  await db.prepare('DELETE FROM applicant_organizations WHERE id = ? AND owner_hash = ?').bind(key, ownerHash).run();
  return { id: key, deleted: true };
}

function normalizeNotice(value) {
  if (!value || typeof value !== 'object') return null;
  const source = clean(value.source || value.references?.[0]?.source, 40);
  const listSn = clean(value.listSn || value.references?.[0]?.listSn, 80);
  const dstbBsnsCode = clean(value.dstbBsnsCode, 80);
  const title = clean(value.title, 500);
  if (!source || !(listSn || dstbBsnsCode) || !title) return null;
  const sourceKey = `${source}:${dstbBsnsCode || listSn}`;
  const noticeJson = JSON.stringify(value);
  return { sourceKey, source, sourceLabel: clean(value.sourceLabel, 100), listSn, dstbBsnsCode, title, deadline: date(value.deadline), applicationPeriod: clean(value.applicationPeriod, 200), summary: clean(value.summary, 2000), eligibility: clean(value.eligibility, 2000), supportDetails: clean(value.supportDetails, 4000), supportLimit: clean(value.supportLimit, 500), noticeJson, contentHash: simpleHash(noticeJson) };
}

async function owner(request) {
  const key = request.headers.get('x-archive-key') || '';
  if (!/^[a-f0-9-]{32,64}$/i.test(key)) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
function simpleHash(value) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619); return (hash >>> 0).toString(16).padStart(8, '0'); }
function safeJson(value) { try { return JSON.parse(value); } catch { return {}; } }
function clean(value, max) { return String(value || '').trim().slice(0, max); }
function date(value) { const match = String(value || '').match(/\d{4}-\d{2}-\d{2}/); return match?.[0] || ''; }
function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } }); }
