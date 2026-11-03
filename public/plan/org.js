// 기관 서랍(11-26) — 기관 자료를 한 번 올리면 다음 공고부터는 고르기만 한다.
//   - 열쇠는 ms12-org:<기관 이름>. 공고별 저장(ms12-plan:해시, saved.js)과 섞지 않는다 — 공고 칸을 지워도 서랍은 남는다.
//   - 담는 것은 올린 파일에서 읽어 낸 글(파일 이름·글). 원본 파일은 담지 않는다.
//   - 묻지 않고 저장하지 않는다 — 남의 기관을 대행할 때 서랍이 뒤섞이면 안 된다(화면이 이름을 묻는다).
//   - 브라우저 데이터를 지우면 서랍이 사라진다. 그래서 서랍 전부를 파일 하나로 내보내고 되살린다.
//     서랍마다 마지막으로 내보낸 때(exportedAt)를 적어, 내보낸 뒤 바뀐 서랍이 있으면 화면이 「내보내 두세요」라고 말한다.
// 화면에 매이지 않은 함수만 둔다 — 시험이 node에서 부른다. 저장소가 막히면 던지지 않고 까닭을 돌려준다(saved.js와 같은 결).

export const ORG_PREFIX = 'ms12-org:';
export const ORG_VERSION = 1;
const ORG_KIND = 'ms12-org-drawers';

export const orgName = name => String(name ?? '').replace(/\s+/g, ' ').trim();
export const orgKey = name => `${ORG_PREFIX}${orgName(name)}`;

const fail = error => ({ ok: false, reason: String(error?.name || error?.message || error) });
const cleanFacts = facts => (facts || []).filter(fact => fact && typeof fact.text === 'string').map(fact => ({ source: String(fact.source || ''), text: fact.text }));

// 서랍 목록(이름 순) — { name, savedAt, exportedAt, files, chars }
export function listOrgs(storage) {
  try {
    if (!storage) return [];
    const orgs = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(ORG_PREFIX)) continue;
      const org = readOrg(storage, key.slice(ORG_PREFIX.length));
      if (org.ok && org.org) orgs.push({ name: org.org.name, savedAt: org.org.savedAt, exportedAt: org.org.exportedAt || null, files: org.org.facts.length, chars: org.org.facts.reduce((sum, fact) => sum + fact.text.length, 0) });
    }
    return orgs.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  } catch {
    return [];
  }
}

export function readOrg(storage, name) {
  try {
    const raw = storage?.getItem(orgKey(name));
    if (!raw) return { ok: true, org: null };
    const data = JSON.parse(raw);
    return { ok: true, org: { name: orgName(data.name || name), facts: cleanFacts(data.facts), savedAt: data.savedAt || null, exportedAt: data.exportedAt || null } };
  } catch (error) {
    return fail(error);
  }
}

// 서랍에 넣는다. 이름이 비면 넣지 않는다. 같은 이름이 있으면 덮는다 — 덮을지는 화면이 먼저 묻는다(exists로 알 수 있다).
export function writeOrg(storage, name, facts, { now = new Date(), exportedAt = null } = {}) {
  const clean = orgName(name);
  if (!clean) return { ok: false, reason: '기관 이름이 비었습니다' };
  if (!storage) return { ok: false, reason: '이 브라우저는 저장소를 주지 않습니다' };
  const org = { kind: 'ms12-org', version: ORG_VERSION, name: clean, facts: cleanFacts(facts), savedAt: now.toISOString(), exportedAt };
  try {
    storage.setItem(orgKey(clean), JSON.stringify(org));
    return { ok: true, name: clean, savedAt: org.savedAt };
  } catch (error) {
    return fail(error);
  }
}

export const orgExists = (storage, name) => Boolean(readOrg(storage, name).org);

// 내보낸 뒤 바뀐(또는 한 번도 내보내지 않은) 서랍 이름들 — 화면의 「내보내 두세요」.
export const unexported = orgs => orgs.filter(org => !org.exportedAt || (org.savedAt && org.savedAt > org.exportedAt)).map(org => org.name);

// 서랍 전부를 파일 하나로. 내보낸 때를 서랍마다 적는다(그 뒤 고치면 다시 「내보내 두세요」).
export function exportOrgs(storage, now = new Date()) {
  const at = now.toISOString();
  const orgs = listOrgs(storage).map(item => readOrg(storage, item.name).org).filter(Boolean);
  for (const org of orgs) {
    try { storage.setItem(orgKey(org.name), JSON.stringify({ kind: 'ms12-org', version: ORG_VERSION, ...org, exportedAt: at })); } catch { /* 적지 못해도 파일은 만든다 */ }
  }
  return JSON.stringify({ kind: ORG_KIND, version: ORG_VERSION, exportedAt: at, orgs: orgs.map(org => ({ name: org.name, savedAt: org.savedAt, facts: org.facts })) }, null, 2);
}

// 내보낸 파일을 읽는다(아직 넣지 않는다). 이미 있는 이름은 clash에 — 덮을지는 사람이 정한다.
export function readOrgsFile(text, storage) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'JSON이 아닙니다' }; }
  if (data?.kind !== ORG_KIND || !Array.isArray(data.orgs)) return { ok: false, reason: '「내 자료 내보내기」로 만든 파일이 아닙니다' };
  const orgs = data.orgs.map(org => ({ name: orgName(org?.name), savedAt: org?.savedAt || null, facts: cleanFacts(org?.facts) })).filter(org => org.name);
  return { ok: true, orgs, exportedAt: data.exportedAt || null, clash: orgs.filter(org => orgExists(storage, org.name)).map(org => org.name) };
}

// 파일의 서랍을 넣는다. skip에 든 이름은 건너뛴다. 넣은 서랍은 그 파일에 이미 있으니 내보낸 것으로 친다.
export function restoreOrgs(storage, orgs, { skip = [], exportedAt = null } = {}) {
  const written = [];
  const failed = [];
  for (const org of orgs) {
    if (skip.includes(org.name)) continue;
    const savedAt = org.savedAt ? new Date(org.savedAt) : new Date();
    const result = writeOrg(storage, org.name, org.facts, { now: savedAt, exportedAt: exportedAt || savedAt.toISOString() });
    (result.ok ? written : failed).push(result.ok ? org.name : `${org.name}: ${result.reason}`);
  }
  return { written, failed };
}

// 목록에 보이는 날짜 「2026-11-03」(이 브라우저의 시간대)
export function orgDate(iso) {
  if (!iso) return '';
  const at = new Date(iso);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}
