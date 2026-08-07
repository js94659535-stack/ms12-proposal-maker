const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const SOURCES = Object.freeze({
  central: { label: '중앙회', origin: 'https://chest.or.kr', branchCode: '001' },
  gwangju: { label: '광주지회', origin: 'https://gwangju.chest.or.kr', branchCode: '006' }
});
const PROPOSAL_ORIGIN = 'https://proposal.chest.or.kr';

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
  if (body.action === 'downloadAttachment') return downloadProposalAttachment(fetcher, body.attachment);
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
      const html = await requestProposalHtml(fetcher, '/mobile/mobileMainBsnsList.do', { bhfCode: config.branchCode, page: '1' });
      return parseProposalList(html, source).filter(item => isOpenDeadline(item.deadline));
    }));
    const detailCache = new Map();
    const notices = await mapWithConcurrency(groups.flat(), 3, async item => {
      const reference = { source: item.source, listSn: item.listSn, appnDocNo: item.appnDocNo, kind: 'proposal' };
      const display = toDisplayNotice(item, [reference]);
      const key = `${item.source}:${item.listSn}`;
      try {
        if (!detailCache.has(key)) detailCache.set(key, loadProposalNotice(fetcher, reference));
        return { ...display, ...buildOfficialSummary(await detailCache.get(key)) };
      } catch {
        return { ...display, ...emptyOfficialSummary() };
      }
    });
    return json({ notices });
  } catch { return json({ error: '공식 공고 목록을 불러오지 못했습니다.' }, 502); }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function buildOfficialSummary(detail) {
  const overview = cleanSummaryText(detail?.overview || '');
  const eligibility = extractSummaryField(overview, ['신청대상', '지원대상', '사업대상', '대상']);
  const supportDetails = extractSummaryField(overview, ['지원내용', '사업내용', '주요내용', '필수 사업내용']);
  const purpose = extractSummaryField(overview, ['사업목적', '목적', '추진목적']);
  const applicationPeriod = cleanSummaryText(detail?.applicationPeriod || '');
  const performancePeriod = cleanSummaryText(detail?.performancePeriod || '');
  const supportLimit = cleanSummaryText(detail?.supportLimit || '');
  const facts = [purpose, eligibility, supportDetails, performancePeriod && `사업기간 ${performancePeriod}`, supportLimit && `지원한도 ${supportLimit}`]
    .filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
  const summary = truncateSummary(facts.join(' · ') || overview || '상세 공고문 확인 필요');
  return { summary, eligibility, supportDetails, supportLimit, applicationPeriod, summarySource: 'official-detail' };
}

function emptyOfficialSummary() {
  return { summary: '상세 공고문 확인 필요', eligibility: '', supportDetails: '', supportLimit: '', applicationPeriod: '', summarySource: 'official-detail' };
}

function extractSummaryField(text, labels) {
  const labelPattern = labels.map(escapeRegExp).join('|');
  const match = String(text || '').match(new RegExp(`(?:^|\\n|[·|])\\s*(?:${labelPattern})\\s*[:：-]?\\s*([^\\n·|]+)`, 'i'));
  return cleanSummaryText(match?.[1] || '');
}

function cleanSummaryText(value) {
  return String(value || '').replace(/첨부파일\s*[:：]?[^\n]*/gi, ' ').replace(/(?:문의|연락처)\s*[:：]?[^\n]*/gi, ' ')
    .replace(/copyright[^\n]*/gi, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function truncateSummary(value) {
  const text = cleanSummaryText(value);
  return text.length <= 300 ? text : `${text.slice(0, 297).trimEnd()}...`;
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function isOpenDeadline(deadline, now = new Date()) {
  const normalized = String(deadline || '').replace(/\./g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return normalized >= today;
}

export function parseProposalList(html, source) {
  const config = SOURCES[source];
  if (!config) return [];
  return [...String(html || '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].flatMap(match => {
    const block = match[1];
    const detail = block.match(/fn_goDetail\('([^']+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/i);
    const title = block.match(/class=["'][^"']*gallery-tit[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    const deadline = block.match(/(\d{4}\.\d{2}\.\d{2})/);
    if (!detail || !title || !deadline || detail[2] !== config.branchCode) return [];
    return [{
      source, sourceLabel: config.label, listSn: detail[1], dstbBsnsCode: detail[1], appnDocNo: detail[3],
      title: plainText(title[1]), deadline: deadline[1].replace(/\./g, '-'), registeredAt: deadline[1].replace(/\./g, '-')
    }];
  });
}

export function isBusinessNotice(title) {
  const value = String(title || '').normalize('NFKC');
  return !/채용|합격자\s*발표|초빙|행사|음악회|설명회|설문|수강|교육.{0,20}(?:신청|모집)|(?:참가|참석)\s*신청/.test(value);
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
      subprojects: primary.subprojects || [],
      attachments: parts.flatMap(part => part.attachments.map(file => ({ ...file, sourceLabel: part.sourceLabel })))
    } });
  } catch { return json({ error: '공식 공고 상세 내용을 불러오지 못했습니다.' }, 502); }
}

async function loadNotice(fetcher, reference) {
  if (reference.kind === 'proposal') return loadProposalNotice(fetcher, reference);
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

async function loadProposalNotice(fetcher, reference) {
  const config = SOURCES[reference.source];
  const html = await requestProposalHtml(fetcher, '/mobile/mobileMainBsnsDetail.do', {
    dstbBsnsCode: String(reference.listSn), appnDocNo: String(reference.appnDocNo || '')
  });
  const fields = Object.fromEntries([...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map(match => {
      const name = plainText(match[1]);
      return [name, name === '개요' ? structuredText(match[2]) : plainText(match[2])];
    }));
  if (!fields['사업명']) throw new Error('notice missing');
  const selectedFields = ['사업명', '사업수행기간', '공모기간', '지원한도(원)', '개요'];
  const bodyHtml = selectedFields.filter(name => fields[name]).map(name => `<h3>${escapeMarkup(name)}</h3><p>${escapeMarkup(fields[name])}</p>`).join('');
  const attachments = [...html.matchAll(/fn_fileDownload\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\)[^>]*>([\s\S]*?)<\/a>/gi)].map(match => ({
    name: structuredText(match[5]), fileType: classifyAttachment(match[5]), fileSeCode: match[1], dstbBsnsCode: match[2], sn: match[3], fileSn: match[4]
  }));
  return {
    source: reference.source, sourceLabel: config.label, listSn: String(reference.listSn), title: fields['사업명'],
    registeredAt: fields['공모기간'] || '', deadline: extractDeadline(fields['공모기간']), bodyHtml, attachments,
    businessName: fields['사업명'], performancePeriod: fields['사업수행기간'] || '', applicationPeriod: fields['공모기간'] || '',
    supportLimit: fields['지원한도(원)'] || '', overview: fields['개요'] || '', subprojects: splitSubprojects(fields['개요'])
  };
}

export function classifyAttachment(name) {
  const extension = String(name || '').trim().split('.').pop()?.toLowerCase();
  return ({ pdf: 'PDF', docx: 'DOCX', txt: 'TXT', hwp: 'HWP', hwpx: 'HWPX', zip: 'ZIP' })[extension] || 'UNSUPPORTED';
}

async function downloadProposalAttachment(fetcher, attachment) {
  if (!validAttachment(attachment)) return json({ error: '첨부파일 정보가 올바르지 않습니다.' }, 400);
  try {
    const detailUrl = new URL('/mobile/mobileMainBsnsDetail.do', PROPOSAL_ORIGIN);
    detailUrl.searchParams.set('dstbBsnsCode', attachment.dstbBsnsCode);
    detailUrl.searchParams.set('appnDocNo', '');
    const detailResponse = await fetcher(detailUrl.href, { method: 'GET' });
    if (!detailResponse.ok) throw new Error('detail failed');
    const detailHtml = await detailResponse.text();
    const officialFiles = [...detailHtml.matchAll(/fn_fileDownload\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\)[^>]*>([\s\S]*?)<\/a>/gi)].map(match => ({
      fileSeCode: match[1], dstbBsnsCode: match[2], sn: match[3], fileSn: match[4], name: structuredText(match[5])
    }));
    const official = officialFiles.find(file => ['fileSeCode', 'dstbBsnsCode', 'sn', 'fileSn'].every(key => file[key] === attachment[key]));
    if (!official) return json({ error: '공식 상세 페이지에서 첨부파일을 확인할 수 없습니다.' }, 404);

    const cookie = (detailResponse.headers.get('set-cookie') || '').split(';', 1)[0];
    const tokenResponse = await fetcher(`${PROPOSAL_ORIGIN}/file/downloadToken.do`, {
      method: 'POST', headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: detailUrl.href,
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: new URLSearchParams({ type: 'APPLY', fileSeCode: official.fileSeCode, dstbBsnsCode: official.dstbBsnsCode, sn: official.sn, fileSn: official.fileSn }).toString()
    });
    if (!tokenResponse.ok) throw new Error('token failed');
    const token = (await tokenResponse.json()).token;
    if (!token) throw new Error('token missing');
    const fileResponse = await fetcher(`${PROPOSAL_ORIGIN}/file/acceptingBusiness.fileDownloadNew.do`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: detailUrl.href, ...(cookie ? { Cookie: cookie } : {}) },
      body: new URLSearchParams({ token }).toString()
    });
    if (!fileResponse.ok || !fileResponse.body) throw new Error('download failed');
    const encodedName = encodeURIComponent(official.name).replace(/'/g, '%27');
    return new Response(fileResponse.body, { status: 200, headers: {
      'Content-Type': fileResponse.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
    } });
  } catch { return json({ error: '공식 첨부파일을 내려받지 못했습니다.' }, 502); }
}

function validAttachment(value) {
  return value && ['fileSeCode', 'dstbBsnsCode', 'sn', 'fileSn'].every(key => /^[A-Za-z0-9_-]{1,24}$/.test(String(value[key] || '')));
}

export function splitSubprojects(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const headings = [...text.matchAll(/^\s*(\d{1,2})[.)]\s*(.+?)\s*$/gm)]
    .filter(match => /사업(?:\s*공고)?$/.test(match[2]) && !/^(?:사업명|사업개념|사업내용|사업기간)\s*[:：]/.test(match[2]));
  if (headings.length < 2) return [];
  return headings.map((heading, index) => ({
    id: heading[1], title: heading[2].replace(/\s*공고$/, '').trim(),
    content: text.slice(heading.index, headings[index + 1]?.index ?? text.length).trim()
  }));
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
  return { title: item.title, registeredAt: item.registeredAt, deadline: item.deadline || '', dstbBsnsCode: item.dstbBsnsCode || '', listSn: references.map(reference => reference.listSn).join(' · '), sourceLabel: sourceLabels.join('·'), sourceLabels, references, supplementalReferences: [] };
}

function sameNotice(left, right) {
  return left.registeredAt === right.registeredAt && conditionSignature(left.bodyHtml) === conditionSignature(right.bodyHtml)
    && attachmentSignature(left.attachments) === attachmentSignature(right.attachments) && plainText(left.bodyHtml) === plainText(right.bodyHtml);
}

function normalizeTitle(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/\[[^\]]*\]|\([^)]*(?:마감|지원한도)[^)]*\)/g, '').replace(/[^가-힣a-z0-9]/g, ''); }
function plainText(html) { return String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }
function structuredText(html) { return String(html || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&#39;/g, "'").replace(/&amp;/gi, '&').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
function conditionSignature(html) { return plainText(html).split(/[.!?。]|\n/).filter(line => /접수|신청기간|마감|지원대상|신청대상|광주|지역|소재/.test(line)).map(line => line.replace(/\s/g, '')).sort().join('|'); }
function attachmentSignature(files = []) { return files.map(file => `${file.name}|${file.serverName}|${file.path}`).sort().join('|'); }
function validReferences(references, emptyAllowed = false) { return Array.isArray(references) && (emptyAllowed || references.length > 0) && references.length <= 2 && references.every(reference => SOURCES[reference?.source] && /^\d{1,20}$/.test(String(reference.listSn || ''))); }
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

async function requestProposalHtml(fetcher, path, params) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = new URL(path, PROPOSAL_ORIGIN);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetcher(url.href, { method: 'GET', signal: controller.signal });
    if (!response.ok) throw new Error(`proposal ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timeoutId); }
}

function extractDeadline(value) {
  const dates = String(value || '').match(/\d{4}[-.]\d{2}[-.]\d{2}/g) || [];
  return dates.at(-1)?.replace(/\./g, '-') || '';
}

function escapeMarkup(value) {
  return String(value || '').replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character]));
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}
