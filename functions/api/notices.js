import {
  FAILURE, NOTICE_BOARDS, SOURCES, STAGE, detailUrl, extractPeriod, isCollectible, isNoticeCandidate,
  noticeStage, summarizeCollection, todayInSeoul, validListPayload
} from '../../server/notice-collect.js';
import { allowedOrigin } from '../../server/notice-sources.js';

const STAGE_UNKNOWN = STAGE.unknown;
// 첨부를 받아 올 때 쓰는 이름. 이 파일에는 사랑의열매 밖의 주소를 적어 두지 않는다.
const ATTACHMENT_UA = 'Mozilla/5.0 (compatible; MS12NoticeBot/1.0)';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const PROPOSAL_ORIGIN = 'https://proposal.chest.or.kr';
// 게시판 한 장에서 훑는 글 수. 공모는 최근 글에 몰려 있어 한 장이면 충분하다.
const LIST_PAGE_SIZE = 60;
// 상세를 읽어 볼 후보 상한. 게시판이 통째로 공모로 채워져도 요청이 폭주하지 않게 한다.
const DETAIL_LIMIT = 25;

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

    // 목록 수집과 같은 방식으로 기간·요약·원문 주소를 채운다. 두 경로의 결과 모양을 맞춘다.
    const overview = structuredText(detail.bodyHtml);
    const period = extractPeriod(`${detail.title}\n${overview}`);
    const { stage, daysLeft } = noticeStage(period.deadline);
    const notice = {
      ...toDisplayNotice({ ...detail, source: reference.source, listSn: reference.listSn, deadline: period.deadline }),
      ...buildOfficialSummary({ overview, applicationPeriod: period.applicationPeriod }),
      applicationPeriod: period.applicationPeriod,
      deadline: period.deadline, deadlineKnown: Boolean(period.deadline), deadlineSource: period.deadlineSource,
      stage, daysLeft,
      sourceUrl: detailUrl(SOURCES[reference.source].origin, reference.bbsSn || '1000', reference.listSn),
      attachments: detail.attachments.map(file => attachmentRecord(file, classifyAttachment(file.name))),
      officialTextExtracted: overview.length > 0
    };
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
  return { source, listSn, bbsSn: '1000', kind: 'board' };
}

// 통로마다 따로 수집한다. 한 곳이 화면을 바꿔도 다른 곳 수집은 멈추지 않는다.
// 1차는 배분신청 포털(공모기간·지원한도까지 정리된 곳), 2차는 각 모금회 누리집 공지사항이다.
const CHANNELS = Object.freeze([
  Object.freeze({ id: 'proposal', label: '배분신청 포털', collect: collectPortal }),
  Object.freeze({ id: 'board', label: '누리집 공지사항', collect: collectBoard })
]);

// 공식 출처를 훑어 공고 목록을 만든다. 화면 요청과 자동수집이 같은 이 함수를 쓴다.
// 여기서는 저장하지 않는다. 저장은 부르는 쪽이 정한다.
export async function collectNotices(fetcher = fetch) {
  const today = todayInSeoul();
  const jobs = [];
  for (const [source, config] of Object.entries(SOURCES)) {
    for (const channel of CHANNELS) jobs.push(runChannel(fetcher, channel, source, config, today));
  }
  const outcomes = await Promise.all(jobs);
  const sources = outcomes.map(outcome => outcome.status);
  const notices = dedupeNotices(outcomes.flatMap(outcome => outcome.notices)).sort(byDeadlineThenDate);
  return { notices, sources, summary: summarizeCollection(sources, notices), collectedAt: new Date().toISOString() };
}

async function listNotices(fetcher) {
  const { notices, sources, summary, collectedAt } = await collectNotices(fetcher);
  // 전부 실패한 것을 「공고 0건」으로 넘기지 않는다. 화면이 다른 문구를 쓸 수 있게 오류로 돌려준다.
  if (summary.allFailed) return json({ error: FAILURE.shape, collectFailed: true, sources }, 502);
  return json({ notices, sources, collectedAt, ...summary });
}

function byDeadlineThenDate(left, right) {
  const leftKey = left.deadline || '9999-99-99';
  const rightKey = right.deadline || '9999-99-99';
  if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
  return String(right.registeredAt || '').localeCompare(String(left.registeredAt || ''));
}

// 같은 공고가 두 통로에 걸리면 하나만 남긴다. 공모기간·지원한도까지 정리된 포털 쪽을 우선한다.
// 글마다 식별자가 달라도 같은 공고일 수 있어, 같은 기관 안에서 제목이 같으면 겹친 것으로 본다.
function dedupeNotices(notices) {
  const byIdentity = new Map();
  for (const notice of notices) {
    const key = `${notice.references[0].source}:${notice.channel}:${notice.references[0].listSn}`;
    if (!byIdentity.has(key)) byIdentity.set(key, notice);
  }
  const unique = [...byIdentity.values()];
  const portalTitles = new Set(unique.filter(notice => notice.channel === 'proposal')
    .map(notice => `${notice.references[0].source}:${normalizeTitle(notice.title)}`));
  return unique.filter(notice => notice.channel === 'proposal'
    || !portalTitles.has(`${notice.references[0].source}:${normalizeTitle(notice.title)}`));
}

async function runChannel(fetcher, channel, source, config, today) {
  const status = {
    source, channel: channel.id, label: `${config.label} ${channel.label}`, sourceLabel: config.label,
    organization: config.organization, status: 'ok', reason: '', listed: 0, candidates: 0, collected: 0
  };
  try {
    return await channel.collect(fetcher, { status, source, config, today });
  } catch (error) {
    return { status: { ...status, status: 'failed', reason: failureReason(error) }, notices: [] };
  }
}

// 배분신청 포털. 사업명·공모기간·지원한도·개요·첨부가 정리되어 있어 1차 출처로 둔다.
async function collectPortal(fetcher, { status, source, config, today }) {
  const html = await requestProposalHtml(fetcher, '/mobile/mobileMainBsnsList.do', { bhfCode: config.branchCode, page: '1' });
  // 목록 화면인지 먼저 본다. 화면 뼈대가 없으면 구조가 바뀐 것이라 0건 성공으로 넘기지 않는다.
  // 뼈대는 있는데 항목이 없는 것은 「진행 중 공고 없음」이라는 정상 상태다.
  if (!/mobileMainBsnsList|bhfCode/.test(html)) return { status: { ...status, status: 'failed', reason: FAILURE.shape }, notices: [] };
  // 목록에 실제로 실린 글만 센다. 화면 맨 아래 함수 정의(fn_goDetail(_bsnsCode, …))까지 세면
  // 공고가 하나도 없는 지회에서 「항목은 있는데 못 읽었다」로 오해해 실패로 적는다. 광주지회가 그랬다.
  const markers = (html.match(/fn_goDetail\(\s*'/g) || []).length;
  const items = parseProposalList(html, source);
  // 항목 표시는 있는데 하나도 못 읽으면 파서가 깨진 것이다.
  if (markers && !items.length) return { status: { ...status, status: 'failed', reason: FAILURE.shape, listed: markers }, notices: [] };
  status.listed = markers;
  status.candidates = items.length;
  const open = items.filter(item => noticeStage(item.deadline, today).stage !== STAGE.closed);
  const detailCache = new Map();
  const notices = await mapWithConcurrency(open, 3, async item => {
    const reference = { source: item.source, listSn: item.listSn, appnDocNo: item.appnDocNo, kind: 'proposal' };
    const display = toDisplayNotice(item, [reference]);
    const { stage, daysLeft } = noticeStage(item.deadline, today);
    const base = {
      ...display, channel: 'proposal', stage, daysLeft, deadlineKnown: true, deadlineSource: 'official',
      sourceUrl: portalDetailUrl(item), officialTextExtracted: false
    };
    const key = `${item.source}:${item.listSn}`;
    try {
      if (!detailCache.has(key)) detailCache.set(key, loadProposalNotice(fetcher, reference));
      const detail = await detailCache.get(key);
      return {
        ...base, ...buildOfficialSummary(detail), officialTextExtracted: Boolean(detail.overview),
        attachments: detail.attachments.map(file => attachmentRecord(file, file.fileType))
      };
    } catch {
      // 상세 한 건이 막힌 것은 통로 장애가 아니다. 목록에는 남긴다.
      return { ...base, ...emptyOfficialSummary(), attachments: [] };
    }
  });
  return { status: { ...status, collected: notices.length }, notices };
}

function portalDetailUrl(item) {
  const url = new URL('/mobile/mobileMainBsnsDetail.do', PROPOSAL_ORIGIN);
  url.searchParams.set('dstbBsnsCode', String(item.listSn));
  url.searchParams.set('appnDocNo', String(item.appnDocNo || ''));
  return url.href;
}

// 각 모금회 누리집 공지사항. 포털에 없는 지회 공고와 안내가 여기에 올라온다.
async function collectBoard(fetcher, { status, source, config, today }) {
  const rows = [];
  for (const bbsSn of NOTICE_BOARDS) {
    let payload;
    try {
      payload = await requestOfficial(fetcher, config, '/bbs/selectPostList.do', {
        pBbsSn: bbsSn, pBhfCode: config.branchCode, pageCount: String(LIST_PAGE_SIZE), currPageNo: '1'
      });
    } catch (error) {
      return { status: { ...status, status: 'failed', reason: failureReason(error) }, notices: [] };
    }
    const checked = validListPayload(payload);
    // 오류 화면이나 모양이 바뀐 응답은 여기서 걸러 「수집 실패」로 만든다.
    if (!checked.ok) return { status: { ...status, status: 'failed', reason: checked.reason }, notices: [] };
    status.listed += checked.rows.length;
    rows.push(...checked.rows.map(row => ({ ...row, bbsSn })));
  }
  const candidates = rows.filter(row => isNoticeCandidate(row.sj, isBusinessNotice)).slice(0, DETAIL_LIMIT);
  status.candidates = candidates.length;
  const built = await mapWithConcurrency(candidates, 3, async row => {
    // 글 하나를 못 읽는 것은 출처 장애가 아니다. 목록에는 남기고 상세만 확인 필요로 둔다.
    try { return await buildBoardNotice(fetcher, source, config, row, today); } catch { return partialBoardNotice(source, config, row); }
  });
  const notices = built.filter(Boolean).filter(notice => isCollectible(notice, today));
  status.collected = notices.length;
  return { status, notices };
}

function failureReason(error) {
  if (error?.name === 'SyntaxError') return FAILURE.shape;
  if (String(error?.message || '') === 'proposal error page') return FAILURE.shape;
  if (/^proposal d+/.test(String(error?.message || ''))) return FAILURE.http;
  if (/^official \d+/.test(String(error?.message || ''))) return FAILURE.http;
  return FAILURE.network;
}

// 상세를 못 읽었을 때. 목록에서 확인한 것만 채우고 나머지는 확인 필요로 둔다.
function partialBoardNotice(source, config, row) {
  const reference = { source, listSn: String(row.listSn), bbsSn: String(row.bbsSn), kind: 'board' };
  const registeredAt = String(row.rgsde || '');
  return {
    ...toDisplayNotice({ source, listSn: String(row.listSn), title: String(row.sj || ''), registeredAt, deadline: '' }, [reference]),
    ...emptyOfficialSummary(), channel: 'board',
    deadline: '', deadlineKnown: false, deadlineSource: '', stage: STAGE_UNKNOWN, daysLeft: null, registeredAt,
    sourceUrl: detailUrl(config.origin, row.bbsSn, row.listSn), attachments: [], officialTextExtracted: false
  };
}

async function buildBoardNotice(fetcher, source, config, row, today) {
  const reference = { source, listSn: String(row.listSn), bbsSn: String(row.bbsSn), kind: 'board' };
  const detail = await loadNotice(fetcher, reference);
  const overview = structuredText(detail.bodyHtml);
  const period = extractPeriod(`${detail.title}\n${overview}`);
  const registeredAt = String(row.rgsde || detail.registeredAt || '');
  const { stage, daysLeft } = noticeStage(period.deadline, today);
  const display = toDisplayNotice({ source, listSn: String(row.listSn), title: detail.title, registeredAt, deadline: period.deadline }, [reference]);
  return {
    ...display,
    ...buildOfficialSummary({ overview, applicationPeriod: period.applicationPeriod }),
    channel: 'board', applicationPeriod: period.applicationPeriod,
    deadline: period.deadline, deadlineKnown: Boolean(period.deadline), deadlineSource: period.deadlineSource,
    stage, daysLeft, registeredAt,
    sourceUrl: detailUrl(config.origin, row.bbsSn, row.listSn),
    attachments: detail.attachments.map(file => attachmentRecord(file, classifyAttachment(file.name))),
    officialTextExtracted: overview.length > 0
  };
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
  const eligibility = extractSummaryField(overview, ['신청대상', '지원대상', '사업대상', '대상']) || extractOverviewSection(overview, ['신청유형', '신청대상', '지원대상', '사업대상'], 150);
  const supportDetails = extractSummaryField(overview, ['지원내용', '사업내용', '주요내용', '필수 사업내용']) || extractOverviewSection(overview, ['주요사업내용', '사업내용', '지원내용'], 170);
  const purpose = extractSummaryField(overview, ['사업목적', '목적', '추진목적']);
  const applicationPeriod = cleanSummaryText(detail?.applicationPeriod || '');
  const performancePeriod = cleanSummaryText(detail?.performancePeriod || '');
  const supportLimit = cleanSummaryText(detail?.supportLimit || '');
  const facts = [purpose, eligibility, supportDetails, performancePeriod && `사업기간 ${performancePeriod}`, supportLimit && `지원한도 ${supportLimit}`]
    .filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
  const summary = truncateSummary(facts.join(' · ') || overview || '상세 공고문 확인 필요');
  return { summary, eligibility, supportDetails, supportLimit, applicationPeriod, summarySource: 'official-detail' };
}

function extractOverviewSection(text, headings, limit) {
  const headingPattern = headings.map(escapeRegExp).join('|');
  const match = String(text || '').match(new RegExp(`(?:^|\\n)\\s*\\d{1,2}[.)]?\\s*(?:${headingPattern})\\s*[:：]?\\s*([\\s\\S]*?)(?=\\n\\s*\\d{1,2}[.)]?\\s*[^\\n]{1,40}(?:\\n|:|：)|$)`, 'i'));
  const value = cleanSummaryText(match?.[1] || '').replace(/(?:^|\n)\s*[○●□■※-]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return value.length <= limit ? value : `${value.slice(0, limit - 3).trimEnd()}...`;
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

// 배분신청 포털 목록 파서. 이 화면이 공식 공모의 1차 출처다.
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
  const bbsSn = NOTICE_BOARDS.includes(String(reference.bbsSn)) ? String(reference.bbsSn) : '1000';
  const data = await requestOfficial(fetcher, config, '/bbs/selectPostInfo.do', {
    pBbsSn: bbsSn, pBhfCode: config.branchCode, pageCount: '12', currPageNo: '1', listSn: String(reference.listSn), hideFlpth: 'Y'
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

// 예전 배분신청 포털에서 가져온 보관 공고를 다시 열 때만 쓴다.
// 그 포털은 모든 경로가 오류 화면을 돌려주는 상태라 대개 실패한다. 보관된 내용은 그대로 남는다.
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

// 첨부 기록 하나. 이름과 종류만 남기면 **다시 내려받을 수 없다**(23-26).
// downloadProposalAttachment()는 url이나 fileSeCode·dstbBsnsCode·sn·fileSn이 있어야 하고,
// 없으면 validAttachment()가 400으로 막는다. 상세 페이지를 다시 읽어도 마감 뒤에는 페이지가 내려가
// 손잡이를 다시 뽑을 수 없다 — 보관함에 들어간 뒤에는 되돌릴 방법이 없다.
// 종류(fileType)는 부르는 쪽이 정하던 대로 그대로 받는다. 여기서는 손잡이만 얹는다.
export const ATTACHMENT_HANDLE = Object.freeze(['url', 'fileSeCode', 'dstbBsnsCode', 'sn', 'fileSn']);
export function attachmentRecord(file, fileType) {
  const handle = ATTACHMENT_HANDLE.filter(key => file?.[key]).map(key => [key, file[key]]);
  return { name: file?.name, fileType, ...Object.fromEntries(handle) };
}

export function classifyAttachment(name) {
  const extension = String(name || '').trim().split('.').pop()?.toLowerCase();
  return ({ pdf: 'PDF', docx: 'DOCX', txt: 'TXT', hwp: 'HWP', hwpx: 'HWPX', zip: 'ZIP' })[extension] || 'UNSUPPORTED';
}

// 수집기가 주소까지 남긴 첨부(공고문·신청서식)는 그 주소로 바로 가져온다.
// 아무 주소나 열지 않는다. 수집 허용 출처만 연다.
async function downloadLinkedAttachment(fetcher, attachment) {
  const url = String(attachment?.url || '').trim();
  if (!/^https:\/\//i.test(url) || !allowedOrigin(url)) return json({ error: '허용되지 않은 출처의 첨부파일입니다.' }, 400);
  try {
    const response = await fetcher(url, { method: 'GET', headers: { 'User-Agent': ATTACHMENT_UA, Accept: '*/*' }, redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error('download failed');
    const name = String(attachment.name || '첨부파일').slice(0, 120);
    const encodedName = encodeURIComponent(name).replace(/'/g, '%27');
    return new Response(response.body, { status: 200, headers: {
      'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
    } });
  } catch { return json({ error: '첨부파일을 내려받지 못했습니다.' }, 502); }
}

async function downloadProposalAttachment(fetcher, attachment) {
  if (attachment?.url) return downloadLinkedAttachment(fetcher, attachment);
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
// 게시판 본문은 한글 문서를 붙여 넣은 것이라 <style>·<script>·<title>이 함께 들어온다.
// 그 안의 글자를 본문으로 착각하면 기간·대상 추출이 통째로 어긋난다.
function structuredText(html) { return String(html || '').replace(/<(style|script|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&#39;/g, "'").replace(/&amp;/gi, '&').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
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

// 배분신청 포털은 Referer가 없는 요청에 「찾으시는 페이지가 없습니다」 화면을 HTTP 200으로 돌려준다.
// 2026년 8월에 수집이 조용히 0건이 된 원인이 이것이었다. 자기 사이트 주소를 Referer로 붙여 준다.
const PROPOSAL_HEADERS = Object.freeze({
  Referer: `${PROPOSAL_ORIGIN}/`,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9'
});

async function requestProposalHtml(fetcher, path, params) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = new URL(path, PROPOSAL_ORIGIN);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetcher(url.href, { method: 'GET', headers: { ...PROPOSAL_HEADERS }, signal: controller.signal });
    if (!response.ok) throw new Error(`proposal ${response.status}`);
    const html = await response.text();
    // 오류 화면을 빈 목록으로 오해하지 않도록 여기서 걸러 낸다.
    if (isOfficialErrorPage(html)) throw new Error('proposal error page');
    return html;
  } finally { clearTimeout(timeoutId); }
}

// 공식 오류 화면. 「찾으시는 <span>페이지가 없습니다</span>」처럼 태그가 끼어 있어 통째로 찾지 못한다.
export function isOfficialErrorPage(html) {
  const text = String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return /페이지가없습니다|오류페이지/.test(text);
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
