const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const SOURCES = Object.freeze({
  central: { label: '중앙회', origin: 'https://chest.or.kr', branchCode: '001' },
  gwangju: { label: '광주지회', origin: 'https://gwangju.chest.or.kr', branchCode: '006' }
});

export function onRequest(context) {
  return handleNoticeRequest(context.request);
}

export async function handleNoticeRequest(request, fetcher = fetch) {
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }
  if (body.action === 'list') return listNotices(fetcher);
  if (body.action === 'detail') return noticeDetail(fetcher, body.references, body.supplementalReferences);
  if (body.action === 'importUrl') return importNoticeUrl(fetcher, body.url, body.existingNotices);
  return json({ error: '지원하지 않는 작업입니다.' }, 400);
}

async function importNoticeUrl(fetcher, rawUrl, existingNotices = []) {
  try {
    const reference = await resolveOfficialReference(fetcher, rawUrl);
    const existing = Array.isArray(existingNotices) ? existingNotices.slice(0, 30).filter(item => validReferences(item?.references)) : [];
    const directMatch = existing.findIndex(item => item.references.some(value => value.source === reference.source && value.listSn === reference.listSn));
    if (directMatch >= 0) return json({ duplicate: true, existingIndex: directMatch });

    const detail = await loadNotice(fetcher, reference);
    const candidates = existing.map((item, index) => ({ item, index })).filter(value => normalizeTitle(value.item.title) === normalizeTitle(detail.title));
    for (const candidate of candidates) {
      const compared = await loadNotice(fetcher, candidate.item.references[0]);
      if (sameNotice(detail, compared)) {
        return json({ duplicate: true, existingIndex: candidate.index, reference, sourceLabel: SOURCES[reference.source].label });
      }
    }

    const notice = toDisplayNotice({ ...detail, source: reference.source, listSn: reference.listSn });
    if (reference.source === 'gwangju') {
      notice.supplementalReferences = candidates.flatMap(value => value.item.references.filter(item => item.source === 'central'));
    }
    return json({ duplicate: false, notice });
  } catch (error) {
    return json({ error: error?.message === 'invalid official url' ? '중앙회 또는 광주지회 상세 URL을 확인해 주세요.' : '누락 공고를 불러오지 못했습니다.' }, 400);
  }
}

async function resolveOfficialReference(fetcher, rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '').trim()); } catch { throw new Error('invalid official url'); }
  const source = url.hostname === 'chest.or.kr' || url.hostname === 'www.chest.or.kr' ? 'central' : url.hostname === 'gwangju.chest.or.kr' ? 'gwangju' : null;
  if (!source || url.protocol !== 'https:') throw new Error('invalid official url');
  if (url.pathname === '/lnk.do') {
    const response = await fetcher(url.href, { method: 'GET', redirect: 'follow' });
    if (!response.ok) throw new Error('official link failed');
    url = new URL(response.url);
  }
  const listSn = url.searchParams.get('listSn');
  if (!url.pathname.endsWith('/bbs/1000/initPostDetail.do') || !/^\d{1,12}$/.test(String(listSn || ''))) throw new Error('invalid official url');
  return { source, listSn };
}

async function listNotices(fetcher) {
  try {
    const groups = await Promise.all(Object.entries(SOURCES).map(async ([source, config]) => {
      const data = await requestOfficial(fetcher, config, '/bbs/selectPostList.do', {
        pBbsSn: '1000', pBhfCode: config.branchCode, pageCount: '12', currPageNo: '1', pSj: ''
      });
      return (data.listInfo || []).map(item => ({
        source, sourceLabel: config.label, listSn: String(item.listSn), title: String(item.sj || ''), registeredAt: String(item.rgsde || '')
      }));
    }));
    const notices = await mergeNoticeCandidates(groups.flat(), reference => loadNotice(fetcher, reference));
    return json({ notices });
  } catch { return json({ error: '공식 공고 목록을 불러오지 못했습니다.' }, 502); }
}

async function noticeDetail(fetcher, references, supplementalReferences = []) {
  if (!validReferences(references) || !validReferences(supplementalReferences, true)) return json({ error: '공고 식별자가 올바르지 않습니다.' }, 400);
  try {
    const requested = uniqueReferences([...references, ...supplementalReferences]);
    const parts = await Promise.all(requested.map(reference => loadNotice(fetcher, reference)));
    parts.sort((a, b) => sourcePriority(a.source) - sourcePriority(b.source));
    const primary = parts[0];
    return json({ notice: {
      sourceLabels: [...new Set(references.map(reference => SOURCES[reference.source].label))], references,
      title: primary.title, registeredAt: primary.registeredAt, parts,
      attachments: parts.flatMap(part => part.attachments.map(file => ({ ...file, sourceLabel: part.sourceLabel })))
    } });
  } catch { return json({ error: '공식 공고 상세 내용을 불러오지 못했습니다.' }, 502); }
}

async function loadNotice(fetcher, reference) {
  const config = SOURCES[reference.source];
  const data = await requestOfficial(fetcher, config, '/bbs/selectPostInfo.do', {
    pBbsSn: '1000', pBhfCode: config.branchCode, pageCount: '12', currPageNo: '1', listSn: String(reference.listSn), hideFlpth: 'Y'
  });
  const info = data.dataInfo?.postInfo;
  if (!info) throw new Error('notice missing');
  return {
    source: reference.source, sourceLabel: config.label, listSn: String(reference.listSn), title: String(info.sj || ''),
    registeredAt: String(info.rgsde || ''), bodyHtml: String(info.cn || ''),
    attachments: (data.dataInfo?.fileListInfo || []).map(file => ({
      name: String(file.orginlFileNm || ''), serverName: String(file.serverFileNm || ''), path: String(file.flpth || '')
    }))
  };
}

export async function mergeNoticeCandidates(items, loadDetail) {
  const titleGroups = new Map();
  for (const item of items) {
    const key = normalizeTitle(item.title);
    titleGroups.set(key, [...(titleGroups.get(key) || []), item]);
  }
  const merged = [];
  for (const group of titleGroups.values()) {
    if (group.length === 1 || new Set(group.map(item => item.source)).size === 1) {
      merged.push(...group.map(item => toDisplayNotice(item)));
      continue;
    }
    const detailed = await Promise.all(group.map(async item => ({ item, detail: await loadDetail({ source: item.source, listSn: item.listSn }) })));
    const buckets = [];
    for (const candidate of detailed) {
      const bucket = buckets.find(existing => sameNotice(existing[0].detail, candidate.detail));
      if (bucket) bucket.push(candidate); else buckets.push([candidate]);
    }
    for (const bucket of buckets) {
      const display = toDisplayNotice(bucket[0].item, bucket.map(value => ({ source: value.item.source, listSn: value.item.listSn })));
      if (display.references.some(reference => reference.source === 'gwangju')) {
        display.supplementalReferences = group.filter(item => item.source === 'central' && !display.references.some(reference => reference.source === item.source && reference.listSn === item.listSn)).map(item => ({ source: item.source, listSn: item.listSn }));
      }
      merged.push(display);
    }
  }
  return merged;
}

function toDisplayNotice(item, references = [{ source: item.source, listSn: item.listSn }]) {
  const sourceLabels = [...new Set(references.map(reference => SOURCES[reference.source].label))];
  return { title: item.title, registeredAt: item.registeredAt, listSn: references.map(reference => reference.listSn).join(' · '), sourceLabel: sourceLabels.join('·'), sourceLabels, references, supplementalReferences: [] };
}

function sameNotice(left, right) {
  return left.registeredAt === right.registeredAt && conditionSignature(left.bodyHtml) === conditionSignature(right.bodyHtml)
    && attachmentSignature(left.attachments) === attachmentSignature(right.attachments) && plainText(left.bodyHtml) === plainText(right.bodyHtml);
}

function normalizeTitle(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/\[[^\]]*\]|\([^)]*(?:마감|지원한도)[^)]*\)/g, '').replace(/[^가-힣a-z0-9]/g, ''); }
function plainText(html) { return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }
function conditionSignature(html) { return plainText(html).split(/[.!?。]|\n/).filter(line => /접수|신청기간|마감|지원대상|신청대상|광주|지역|소재/.test(line)).map(line => line.replace(/\s/g, '')).sort().join('|'); }
function attachmentSignature(files = []) { return files.map(file => `${file.name}|${file.serverName}|${file.path}`).sort().join('|'); }
function validReferences(references, emptyAllowed = false) { return Array.isArray(references) && (emptyAllowed || references.length > 0) && references.length <= 2 && references.every(reference => SOURCES[reference?.source] && /^\d{1,12}$/.test(String(reference.listSn || ''))); }
function uniqueReferences(references) { return references.filter((reference, index) => references.findIndex(value => value.source === reference.source && value.listSn === reference.listSn) === index); }
function sourcePriority(source) { return source === 'gwangju' ? 0 : 1; }

async function requestOfficial(fetcher, config, path, params) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(`${config.origin}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', AJAX: 'true' },
      body: new URLSearchParams(params).toString(), signal: controller.signal
    });
    if (!response.ok) throw new Error(`official ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeoutId); }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}
