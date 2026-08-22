import { countConfirmed, countUnconfirmed } from '../../server/applicant-count.js';
import { withDerived } from '../../server/notice-search.js';
import { NEED_FULL, hasFullAccess } from '../../server/plan.js';
import { LOCKED_NOTICE, MEMBER_READ_ONLY, membershipOf } from '../../server/membership.js';
import { loadSubscription } from '../../server/subscription.js';
import { contractState } from '../../server/premium.js';
import { claimProposals, recordAccess } from '../../server/access-store.js';
import { validateAsset } from '../../server/idea-assets.js';
import { businessTypeOf, groupOf } from '../../server/notice-sources.js';
import { workspaceOf } from '../../server/agency.js';
import { stateFor, touchActivity } from '../../server/agency-store.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const MAX_NOTICE_BATCH = 100;
const MAX_PROPOSAL_BYTES = 700_000;
const MAX_APPLICANT_BYTES = 400_000;
const APPLICANT_STATUSES = ['확인됨', '확인 필요', '오래된 정보'];
const ITEM_ORIGINS = ['고객 입력', '파일 추출', '운영자 수정', '기관 확인'];

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
    // 어느 작업공간의 자료인지 요청이 밝힌다. 값이 없으면 개인 작업공간이다.
    const workspace = workspaceOf(body.workspace);
    const sessionUser = context.data?.session?.user;
    if (workspace === 'agency') {
      // 자격이 없거나 해제·중지되었으면 대행 업무 자료는 다음 요청부터 닫힌다. 자료는 지우지 않는다.
      const agency = await stateFor(context.env.ARCHIVE_DB, sessionUser?.id || '');
      if (!agency.active) {
        return json({ error: agency.reason || '에이전트만 열 수 있는 자료입니다.', agencyBlocked: true }, 403);
      }
      await touchActivity(context.env.ARCHIVE_DB, sessionUser.id);
    }
    // 계획서 보관은 구독·프리미엄·기존 전체 이용권에서만 열린다.
    // 승인 대기 회원은 아무것도 저장하지 않고, 승인회원의 5쪽 제안서는 읽기 전용이다.
    if (body.action === 'saveProposal') {
      const refusal = await saveRefusal(context);
      if (refusal) return json(refusal.body, refusal.status);
      return json(await saveProposal(context.env.ARCHIVE_DB, ownerHash, body.proposal, context.data?.session?.user?.id || '', workspace));
    }
    if (body.action === 'claimMine') {
      const user = context.data?.session?.user;
      if (!user?.id) return json({ error: '로그인이 필요합니다.' }, 401);
      const moved = await claimProposals(context.env.ARCHIVE_DB, { userId: user.id, ownerHash, actor: user });
      const orgs = await context.env.ARCHIVE_DB.prepare("UPDATE applicant_organizations SET user_id = ?, claimed_at = ? WHERE owner_hash = ? AND user_id = ''")
        .bind(user.id, new Date().toISOString(), ownerHash).run();
      return json({ claimed: moved.claimed, applicants: Number(orgs?.meta?.changes || 0) });
    }
    // 회원이 「운영지원 목적의 원문 열람」을 이 계획서에 한해 허락하거나 거둔다. 기본은 허락하지 않음이다.
    if (body.action === 'setSupportConsent') {
      const user = context.data?.session?.user;
      if (!user?.id) return json({ error: '로그인이 필요합니다.' }, 401);
      const allow = body.consent === true;
      const changed = await context.env.ARCHIVE_DB.prepare('UPDATE archived_proposals SET support_consent = ?, support_consent_at = ? WHERE id = ? AND owner_hash = ? AND user_id = ?')
        .bind(allow ? 1 : 0, allow ? new Date().toISOString() : '', clean(body.id, 80), ownerHash, user.id).run();
      if (!Number(changed?.meta?.changes || 0)) return json({ error: '내 계정에 연결된 계획서만 바꿀 수 있습니다.' }, 404);
      await recordAccess(context.env.ARCHIVE_DB, { actor: user, action: 'share', scope: 'proposals', targetKind: 'proposal', targetId: clean(body.id, 80), targetUserId: user.id, reason: allow ? '회원이 운영지원 열람에 동의' : '회원이 동의를 거둠' });
      return json({ id: clean(body.id, 80), consent: allow });
    }
    // 내려받기 횟수만 센다. 무엇을 내려받았는지는 남기지 않는다.
    if (body.action === 'countExport') {
      await context.env.ARCHIVE_DB.prepare('UPDATE archived_proposals SET export_count = export_count + 1 WHERE id = ? AND owner_hash = ?')
        .bind(clean(body.id, 80), ownerHash).run();
      return json({ ok: true });
    }
    // 사업 아이디어·활용자산. 계획서와 같은 소유자 기준으로 보관한다.
    if (body.action === 'listAssets') return json({ assets: await listAssets(context.env.ARCHIVE_DB, ownerHash) });
    if (body.action === 'saveAsset') return saveAsset(context.env.ARCHIVE_DB, ownerHash, context.data?.session?.user?.id || '', body.asset);
    if (body.action === 'deleteAsset') return json(await deleteAsset(context.env.ARCHIVE_DB, ownerHash, body.id));
    if (body.action === 'listProposals') return json({ proposals: await listProposals(context.env.ARCHIVE_DB, ownerHash, workspace, sessionUser?.id || '') });
    if (body.action === 'getProposal') return json({ proposal: await getProposal(context.env.ARCHIVE_DB, ownerHash, body.id) });
    if (body.action === 'saveApplicant') return json(await saveApplicant(context.env.ARCHIVE_DB, ownerHash, body.applicant, sessionUser?.id || '', workspace));
    if (body.action === 'listApplicants') return json({ applicants: await listApplicants(context.env.ARCHIVE_DB, ownerHash, workspace, sessionUser?.id || '') });
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
    // 검색용 문자열과 분류를 저장할 때 함께 채운다. 읽을 때 다시 만들 필요를 줄인다.
    const indexed = noticeIndex(normalized);
    await db.prepare(`INSERT INTO archived_notices (source_key, source, source_label, list_sn, dstb_bsns_code, title, deadline, application_period, summary, eligibility, support_details, support_limit, content_hash, notice_json, first_seen_at, updated_at, region, audience, field, last_checked_at, search_title, search_keywords, search_summary, source_id, source_group, business_type, fitness, fitness_reason, notice_no, source_links)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET source=excluded.source, source_label=excluded.source_label, list_sn=excluded.list_sn, dstb_bsns_code=excluded.dstb_bsns_code, title=excluded.title, deadline=excluded.deadline, application_period=excluded.application_period, summary=excluded.summary, eligibility=excluded.eligibility, support_details=excluded.support_details, support_limit=excluded.support_limit, content_hash=excluded.content_hash, notice_json=excluded.notice_json, updated_at=excluded.updated_at, region=excluded.region, audience=excluded.audience, field=excluded.field, last_checked_at=excluded.last_checked_at, search_title=excluded.search_title, search_keywords=excluded.search_keywords, search_summary=excluded.search_summary, source_id=excluded.source_id, source_group=excluded.source_group, business_type=excluded.business_type, fitness=excluded.fitness, fitness_reason=excluded.fitness_reason, notice_no=excluded.notice_no, source_links=excluded.source_links`)
      .bind(normalized.sourceKey, normalized.source, normalized.sourceLabel, normalized.listSn, normalized.dstbBsnsCode, normalized.title, normalized.deadline, normalized.applicationPeriod, normalized.summary, normalized.eligibility, normalized.supportDetails, normalized.supportLimit, normalized.contentHash, normalized.noticeJson, now, now,
        indexed.region, indexed.audience, indexed.field, now, indexed.search_title, indexed.search_keywords, indexed.search_summary,
        normalized.sourceId, normalized.sourceGroup, normalized.businessType, normalized.fitness, normalized.fitnessReason, normalized.noticeNo, normalized.sourceLinks).run();
    if (existing) result.updated += 1; else result.inserted += 1;
  }
  return result;
}

// 한 번에 돌려주는 공고 수. 모아 둔 것이 이보다 많으면 최근 것부터 이만큼만 준다.
// 잘렸다는 사실은 화면에 알린다. 조용히 자르면 「예전 공고가 사라졌다」로 보인다.
export const NOTICE_LIMIT = 500;

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
    FROM archived_notices n ${where.replaceAll(/\b(source_label|source|title|summary|eligibility|support_details|deadline|notice_json)\b/g, 'n.$1')} ORDER BY n.updated_at DESC, n.deadline DESC LIMIT ${NOTICE_LIMIT}`).bind(ownerHash, ownerHash, ...bindings).all();
  return (rows.results || []).map(row => ({ ...safeJson(row.notice_json), archiveNoticeKey: row.source_key, archivedAt: row.first_seen_at, archiveUpdatedAt: row.updated_at, linkedProposalCount: Number(row.linked_proposal_count || 0), linkedProposalId: row.linked_proposal_id || '' }));
}

export async function saveProposal(db, ownerHash, value, userId = '', workspace = 'personal') {
  if (!value || typeof value !== 'object') throw new Error('invalid proposal');
  const id = clean(value.id, 80);
  const title = clean(value.title, 300);
  const stage = clean(value.stage, 40);
  const snapshot = JSON.stringify(value.snapshot || {});
  if (!id || !title || !stage || new TextEncoder().encode(snapshot).byteLength > MAX_PROPOSAL_BYTES) throw new Error('invalid proposal');
  const existing = await db.prepare('SELECT created_at, user_id FROM archived_proposals WHERE id = ? AND owner_hash = ?').bind(id, ownerHash).first();
  // 한 번 회원과 이어진 계획서의 주인은 바꾸지 않는다. 비어 있을 때만 채운다.
  const owner = existing?.user_id || String(userId || '');
  // 대행 업무 자료와 개인 작업공간을 갈라 둔다. 목록도 이 값으로 나뉜다.
  const space = workspace === 'agency' ? 'agency' : 'personal';
  const agencyId = space === 'agency' ? String(userId || '') : '';
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO archived_proposals (id, owner_hash, notice_key, title, stage, proposal_json, created_at, updated_at, user_id, workspace, agency_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, stage=excluded.stage, notice_key=excluded.notice_key, proposal_json=excluded.proposal_json, updated_at=excluded.updated_at, user_id=excluded.user_id WHERE archived_proposals.owner_hash=excluded.owner_hash`)
    .bind(id, ownerHash, clean(value.noticeKey, 180), title, stage, snapshot, existing?.created_at || now, now, owner, space, agencyId).run();
  return { id, updatedAt: now, userId: owner };
}

export async function listProposals(db, ownerHash, workspace = 'personal', agencyUserId = '') {
  // 개인 작업공간에는 대행 업무 자료가 섞이지 않는다. 반대도 마찬가지다.
  // 대행 업무 자료는 에이전트 계정으로 찾는다. 인계로 주인이 바뀌어도 새 에이전트이 그대로 연다.
  const rows = workspace === 'agency'
    ? await db.prepare(`SELECT id, notice_key, title, stage, created_at, updated_at FROM archived_proposals
        WHERE agency_user_id = ? AND workspace = 'agency' ORDER BY updated_at DESC LIMIT 100`).bind(String(agencyUserId || '')).all()
    : await db.prepare(`SELECT id, notice_key, title, stage, created_at, updated_at FROM archived_proposals
        WHERE owner_hash = ? AND COALESCE(workspace, 'personal') = 'personal' ORDER BY updated_at DESC LIMIT 100`).bind(ownerHash).all();
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
    // 자료 출처(고객 입력 / 파일 추출 / 운영자 수정 / 기관 확인)는 값과 함께 보관한다.
    origin: ITEM_ORIGINS.includes(item?.origin) ? item.origin : '',
    // 현재 기관 프로필(profile)과 사업·실적 이력(history) 구분. 같은 항목 구조 안에서만 쓴다.
    scope: ['profile', 'history'].includes(item?.scope) ? item.scope : '',
    asOf: clean(item?.asOf, 40),
    // 실적표의 「프로그램 내용」 칸. 값에는 기관·사업명만 넣고 내용은 여기 남긴다.
    detail: clean(item?.detail, 300),
    history: (Array.isArray(item?.history) ? item.history : []).slice(-20).map(entry => ({
      value: clean(entry?.value, 2000), status: APPLICANT_STATUSES.includes(entry?.status) ? entry.status : '확인 필요',
      source: clean(entry?.source, 300), origin: ITEM_ORIGINS.includes(entry?.origin) ? entry.origin : '', asOf: clean(entry?.asOf, 40), recordedAt: clean(entry?.recordedAt, 40)
    })),
    updatedAt: clean(item?.updatedAt, 40)
  }));
  // 기관자료 목록. 지금까지 브라우저에만 있어 다른 기기에서는 「받은 서류」가 보이지 않았다.
  // 파일을 보관하려면 그 파일이 어느 자료의 것인지 서버가 알고 있어야 한다.
  const sources = (Array.isArray(value.sources) ? value.sources : []).slice(0, 40).map((source, index) => ({
    id: clean(source?.id, 80) || `source-${index + 1}`,
    kind: clean(source?.kind, 40),
    name: clean(source?.name, 200),
    url: /^https?:\/\//i.test(String(source?.url || '')) ? clean(source.url, 500) : '',
    asOf: clean(source?.asOf, 40),
    note: clean(source?.note, 300),
    addedAt: clean(source?.addedAt, 40),
    // 보관한 파일. 원본은 R2에 있고 여기에는 무엇을·언제·누가 받았는지만 남는다.
    file: source?.file && clean(source.file.key, 200) ? {
      key: clean(source.file.key, 200),
      name: clean(source.file.name, 200),
      size: Math.max(0, Math.min(20 * 1024 * 1024, Number(source.file.size) || 0)),
      type: clean(source.file.type, 100),
      uploadedAt: clean(source.file.uploadedAt, 40),
      uploadedBy: clean(source.file.uploadedBy, 120)
    } : null
  }));
  return {
    id, name, note: clean(value.note, 500), items, sources,
    // 서류 보관에 동의한 시각. 비어 있으면 아직 동의하지 않았다는 뜻이다.
    filesConsentAt: clean(value.filesConsentAt, 40),
    // 화면과 같은 잣대로 센다(server/applicant-count.js). 두 곳이 다른 답을 내면 사용자가 먼저 안다.
    confirmedCount: countConfirmed(items),
    unverifiedCount: countUnconfirmed(items),
    createdAt: clean(value.createdAt, 40), updatedAt: clean(value.updatedAt, 40)
  };
}

export async function saveApplicant(db, ownerHash, value, userId = '', workspace = 'personal') {
  const applicant = normalizeApplicantRecord(value);
  if (!applicant) throw new Error('invalid applicant');
  const payload = JSON.stringify(applicant);
  if (new TextEncoder().encode(payload).byteLength > MAX_APPLICANT_BYTES) throw new Error('invalid applicant');
  const existing = await db.prepare('SELECT created_at FROM applicant_organizations WHERE id = ? AND owner_hash = ?').bind(applicant.id, ownerHash).first();
  // 에이전트이 등록한 고객 기관과 자기 기관을 갈라 둔다.
  const space = workspace === 'agency' ? 'agency' : 'personal';
  const agencyId = space === 'agency' ? String(userId || '') : '';
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO applicant_organizations (id, owner_hash, name, note, confirmed_count, unverified_count, applicant_json, created_at, updated_at, workspace, agency_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, note=excluded.note, confirmed_count=excluded.confirmed_count, unverified_count=excluded.unverified_count, applicant_json=excluded.applicant_json, updated_at=excluded.updated_at WHERE applicant_organizations.owner_hash=excluded.owner_hash`)
    .bind(applicant.id, ownerHash, applicant.name, applicant.note, applicant.confirmedCount, applicant.unverifiedCount, payload, existing?.created_at || now, now, space, agencyId).run();
  return { id: applicant.id, updatedAt: now };
}

export async function listApplicants(db, ownerHash, workspace = 'personal', agencyUserId = '') {
  const rows = workspace === 'agency'
    ? await db.prepare(`SELECT applicant_json, created_at, updated_at FROM applicant_organizations
        WHERE agency_user_id = ? AND workspace = 'agency' ORDER BY updated_at DESC LIMIT 100`).bind(String(agencyUserId || '')).all()
    : await db.prepare(`SELECT applicant_json, created_at, updated_at FROM applicant_organizations
        WHERE owner_hash = ? AND COALESCE(workspace, 'personal') = 'personal' ORDER BY updated_at DESC LIMIT 100`).bind(ownerHash).all();
  return (rows.results || []).map(row => ({ ...safeJson(row.applicant_json), createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function deleteApplicant(db, ownerHash, id) {
  const key = clean(id, 80);
  if (!key) throw new Error('invalid applicant');
  await db.prepare('DELETE FROM applicant_organizations WHERE id = ? AND owner_hash = ?').bind(key, ownerHash).run();
  return { id: key, deleted: true };
}

// 저장할 자료를 검색 열 이름에 맞춰 옮긴 뒤 파생값을 만든다.
function noticeIndex(normalized) {
  return withDerived({
    title: normalized.title, source: normalized.source, source_label: normalized.sourceLabel,
    summary: normalized.summary, eligibility: normalized.eligibility,
    support_limit: normalized.supportLimit, application_period: normalized.applicationPeriod
  });
}

function normalizeNotice(value) {
  if (!value || typeof value !== 'object') return null;
  const source = clean(value.source || value.references?.[0]?.source, 40);
  const listSn = clean(value.listSn || value.references?.[0]?.listSn, 80);
  const dstbBsnsCode = clean(value.dstbBsnsCode, 80);
  const title = clean(value.title, 500);
  if (!source || !(listSn || dstbBsnsCode) || !title) return null;
  // 어디서 왔는지. 기존 사랑의열매 자료는 sourceId가 없어 지금과 똑같이 다뤄진다.
  const sourceId = clean(value.sourceId, 40);
  const sourceKey = sourceId ? `${sourceId}:${listSn}` : `${source}:${dstbBsnsCode || listSn}`;
  const noticeJson = JSON.stringify(value);
  return { sourceKey, source, sourceLabel: clean(value.sourceLabel, 100), listSn, dstbBsnsCode, title,
    sourceId, sourceGroup: sourceId ? groupOf(sourceId) : 'chest', businessType: sourceId ? businessTypeOf(sourceId) : 'chest',
    fitness: clean(value.fitness, 20), fitnessReason: clean(value.fitnessReason, 200), noticeNo: clean(value.noticeNo, 60),
    // 확인된 출처 링크만 담는다. 본문·첨부 원문은 넣지 않는다.
    sourceLinks: JSON.stringify((Array.isArray(value.sourceLinks) ? value.sourceLinks : []).slice(0, 6).map(link => ({ sourceId: clean(link?.sourceId, 40), label: clean(link?.label, 60), url: clean(link?.url, 400) })).filter(link => link.url)), deadline: date(value.deadline), applicationPeriod: clean(value.applicationPeriod, 200), summary: clean(value.summary, 2000), eligibility: clean(value.eligibility, 2000), supportDetails: clean(value.supportDetails, 4000), supportLimit: clean(value.supportLimit, 500), noticeJson, contentHash: simpleHash(noticeJson) };
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
// 저장을 막을 이유가 있으면 그 이유를 돌려준다. 등급 판정은 서버에서만 한다.
async function saveRefusal(context) {
  const user = context.data?.session?.user;
  if (!user?.id) return { status: 401, body: { error: '로그인이 필요합니다.' } };
  const subscription = await loadSubscription(context.env.ARCHIVE_DB, user.id);
  const row = await context.env.ARCHIVE_DB.prepare('SELECT status, started_on, ends_on FROM premium_contracts WHERE user_id = ?').bind(user.id).first();
  const contract = row ? contractState({ status: row.status, startedOn: row.started_on || '', endsOn: row.ends_on || '' }) : null;
  const membership = membershipOf({ user, subscription, contract });
  if (membership.locked) return { status: 403, body: { error: LOCKED_NOTICE, locked: true } };
  if (membership.canSave) return null;
  // 기존 전체 이용권 회원은 그대로 저장할 수 있다.
  if (hasFullAccess(user)) return null;
  return { status: 403, body: { error: MEMBER_READ_ONLY, needsSubscription: true } };
}

function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } }); }

// ---------- 사업 아이디어·활용자산 ----------
const ASSET_COLUMNS = 'id, user_id, applicant_id, name, kind, status, problem, audience, activities, duration, resources, experience, evidence, adaptable, evidence_confirmed, created_at, updated_at';

export async function listAssets(db, ownerHash) {
  const rows = await db.prepare(`SELECT ${ASSET_COLUMNS} FROM idea_assets WHERE owner_hash = ? ORDER BY updated_at DESC LIMIT 100`).bind(ownerHash).all();
  return (rows.results || []).map(assetView);
}

async function saveAsset(db, ownerHash, userId, value) {
  const checked = validateAsset(value || {});
  if (!checked.ok) return json({ error: checked.errors.join(' ') }, 400);
  const id = clean(value?.id, 80) || crypto.randomUUID();
  const now = new Date().toISOString();
  const existing = await db.prepare('SELECT created_at FROM idea_assets WHERE id = ? AND owner_hash = ?').bind(id, ownerHash).first();
  const item = checked.value;
  await db.prepare(`INSERT INTO idea_assets (id, user_id, owner_hash, applicant_id, name, kind, status, problem, audience, activities, duration, resources, experience, evidence, adaptable, evidence_confirmed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, status=excluded.status, problem=excluded.problem, audience=excluded.audience,
      activities=excluded.activities, duration=excluded.duration, resources=excluded.resources, experience=excluded.experience, evidence=excluded.evidence,
      adaptable=excluded.adaptable, evidence_confirmed=excluded.evidence_confirmed, applicant_id=excluded.applicant_id, updated_at=excluded.updated_at
    WHERE idea_assets.owner_hash = excluded.owner_hash`)
    .bind(id, String(userId || ''), ownerHash, clean(value?.applicantId, 80), item.name, item.kind, item.status, item.problem, item.audience,
      item.activities, item.duration, item.resources, item.experience, item.evidence, item.adaptable,
      item.evidenceConfirmed ? 1 : 0, existing?.created_at || now, now).run();
  return json({ id, assets: await listAssets(db, ownerHash) });
}

async function deleteAsset(db, ownerHash, id) {
  const key = clean(id, 80);
  if (!key) throw new Error('invalid asset');
  await db.prepare('DELETE FROM idea_assets WHERE id = ? AND owner_hash = ?').bind(key, ownerHash).run();
  return { id: key, deleted: true, assets: await listAssets(db, ownerHash) };
}

function assetView(row) {
  return {
    id: row.id, userId: row.user_id || '', applicantId: row.applicant_id || '', name: row.name, kind: row.kind || '',
    status: row.status, problem: row.problem || '', audience: row.audience || '', activities: row.activities || '',
    duration: row.duration || '', resources: row.resources || '', experience: row.experience || '',
    evidence: row.evidence || '', adaptable: row.adaptable || '',
    evidenceConfirmed: Number(row.evidence_confirmed || 0) === 1,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}
