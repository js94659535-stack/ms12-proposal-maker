// 사랑의열매 밖의 출처를 모은다. 출처마다 따로 돌고 따로 실패한다.
// 한 곳이 죽어도 나머지는 계속 간다. AI는 부르지 않는다.
import { FAILURE, extractPeriod, isCollectible, noticeStage, todayInSeoul } from './notice-collect.js';
import { FITNESS, classifyNotice, searchable } from './notice-classify.js';
import { SOURCES, allowedOrigin, runnable, sourceById } from './notice-sources.js';
import { baboCategoryHint, cleanText, isSchoolNotice, parseBaboList, parseG2bPayload, parseKihfList } from './source-parsers.js';

// 목록에서 훑는 글 수와 상세를 열어 볼 상한. 상세는 요청이 늘어나므로 아낀다.
export const LIST_ROWS = 30;
export const DETAIL_LIMIT = 12;
// 한 번 실행에서 열 수 있는 상세의 총량. 서버가 한 요청에서 부를 수 있는 횟수에 한도가 있어,
// 앞 출처가 상세를 잔뜩 열면 뒤 출처는 목록조차 못 연다. 그래서 상세만 함께 나눠 쓴다.
export const DETAIL_BUDGET = 14;
export const makeBudget = (left = DETAIL_BUDGET) => ({ left, spent: 0, take() { if (this.left <= 0) return false; this.left -= 1; this.spent += 1; return true; } });
// 같은 곳에 잇달아 요청하지 않는다.
export // 막혔을 때 쉬는 시간. 한 번만 기다린다.
const THROTTLE_WAIT_MS = 3_000;
// 출처 사이의 간격. 같은 업체 게시판을 잇달아 열면 막힌다.
const SOURCE_GAP_MS = 1_500;
const REQUEST_GAP_MS = 300;

const UA = 'Mozilla/5.0 (compatible; MS12NoticeBot/1.0; +https://pro.ms12.org)';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(fetcher, url, { accept = 'text/html', retry = true } = {}) {
  if (!allowedOrigin(url)) throw new Error('origin not allowed');
  const headers = { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'ko-KR,ko;q=0.9' };
  const response = await fetcher(url, { headers, redirect: 'follow' });
  // 너무 자주 물으면 잠시 막는다(429·503). 한 박자 쉬고 한 번만 다시 묻는다.
  // 같은 업체가 돌리는 게시판 두 곳을 잇달아 열 때 실제로 겪었다.
  if ((response.status === 429 || response.status === 503) && retry) {
    await wait(THROTTLE_WAIT_MS);
    return request(fetcher, url, { accept, retry: false });
  }
  if (!response.ok) throw new Error(`http ${response.status}`);
  return accept.includes('json') ? response.json() : response.text();
}

// 상세 본문에서 글자만 뽑는다. 원문 전체를 저장하지 않고 판정에만 쓴다.
// marker를 주면 그 자리부터 읽는다. 게시판 상세 페이지에는 다른 글 목록이 함께 실려 있어,
// 페이지 전체를 읽으면 남의 글 제목이 이 글의 성격으로 잘못 잡힌다.
export function bodyTextOf(html, marker = '') {
  const source = String(html || '');
  const at = marker ? source.indexOf(marker) : -1;
  return plainText(at >= 0 ? source.slice(at) : source);
}

function plainText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

function baseStatus(source) {
  return {
    source: source.id, channel: source.kind, label: source.label, sourceLabel: source.label,
    organization: source.organization, status: 'ok', reason: '',
    // 상세를 못 연 글 수. 예산이 모자라 미룬 것을 「없었다」로 보이게 두지 않는다.
    listed: 0, candidates: 0, collected: 0, detailSkipped: 0, skipped: {}
  };
}

function countSkip(status, fitness) {
  status.skipped[fitness] = (status.skipped[fitness] || 0) + 1;
}

// ---------- 한국건강가정진흥원 ----------
async function collectKihf(fetcher, source, today, { budget } = {}) {
  const status = baseStatus(source);
  const listUrl = `${source.origin}${source.path}?rows=${LIST_ROWS}&cpage=1`;
  const html = await request(fetcher, listUrl);
  const parsed = parseKihfList(html);
  if (!parsed.ok) return { status: { ...status, status: 'failed', reason: parsed.reason }, notices: [] };
  status.listed = parsed.rows.length;

  // 제목으로 먼저 걸러 상세를 열 후보를 줄인다. 확정은 상세를 보고 한다.
  const candidates = parsed.rows.filter(row => {
    const head = classifyNotice({ title: row.title, sourceKind: source.id === 'kihf-bid' ? 'bid-board' : '' });
    if (searchable(head.fitness) || head.fitness === FITNESS.unknown) return true;
    countSkip(status, head.fitness);
    return false;
  }).slice(0, DETAIL_LIMIT);
  status.candidates = candidates.length;

  const notices = [];
  for (const row of candidates) {
    // 상세 예산을 다 썼다. 남은 글은 다음 실행에서 본다. 목록에 있었다는 사실은 status에 남는다.
    if (budget && !budget.take()) { status.detailSkipped = (status.detailSkipped || 0) + 1; continue; }
    await wait(REQUEST_GAP_MS);
    let body = '';
    let attachments = [];
    try {
      const detail = await request(fetcher, `${source.origin}${source.detailPath}?article_seq=${encodeURIComponent(row.listSn)}`);
      body = bodyTextOf(detail);
      // 첨부는 이름과 개수만 남긴다. 파일 원문은 저장하지 않는다.
      attachments = [...detail.matchAll(/download\.do\?uuid=[^"']*"[^>]*>([^<]{1,120})/g)]
        .map(match => ({ name: cleanText(match[1]), fileType: '' })).slice(0, 10);
    } catch { /* 한 건 실패는 출처 장애가 아니다 */ }
    const period = extractPeriod(`${row.title}\n${body}`);
    const verdict = classifyNotice({ title: row.title, body, sourceKind: source.id === 'kihf-bid' ? 'bid-board' : '' });
    if (!searchable(verdict.fitness)) { countSkip(status, verdict.fitness); continue; }
    const { stage, daysLeft } = noticeStage(period.deadline, today);
    notices.push({
      sourceId: source.id, sourceLabel: source.label, source: source.id,
      organization: source.organization, sourceLabelShort: '건강가정진흥원',
      listSn: row.listSn, title: row.title, registeredAt: row.registeredAt,
      deadline: period.deadline, applicationPeriod: period.applicationPeriod, deadlineSource: period.deadlineSource,
      deadlineKnown: Boolean(period.deadline), stage, daysLeft,
      summary: body.slice(0, 300) || '상세 공고문 확인 필요', officialTextExtracted: body.length > 0,
      attachments, fitness: verdict.fitness, fitnessReason: verdict.reason, fitnessConfirmed: verdict.confirmed,
      sourceUrl: `${source.origin}${source.detailPath}?article_seq=${encodeURIComponent(row.listSn)}`,
      references: [{ source: source.id, listSn: row.listSn, kind: 'board' }]
    });
  }
  // 마감이 지난 것은 목록에 남기지 않는다.
  const open = notices.filter(notice => isCollectible(notice, today));
  status.collected = open.length;
  return { status, notices: open };
}

// ---------- 바보의나눔 ----------
async function collectBabo(fetcher, source, today, { budget } = {}) {
  const status = baseStatus(source);
  const html = await request(fetcher, `${source.origin}${source.path}`);
  const parsed = parseBaboList(html);
  if (!parsed.ok) return { status: { ...status, status: 'failed', reason: parsed.reason }, notices: [] };
  status.listed = parsed.rows.length;

  const candidates = parsed.rows.filter(row => {
    // 게시판이 스스로 붙인 분류를 먼저 본다. 선정결과·양식은 계획서 대상이 아니다.
    const hint = baboCategoryHint(row.category);
    if (hint === 'result') { countSkip(status, FITNESS.result); return false; }
    if (hint === 'form') { countSkip(status, FITNESS.briefing); return false; }
    // 채용·공시는 계획서를 쓸 일이 아니다. 상세를 열지 않고 여기서 접는다.
    if (hint === 'hiring') { countSkip(status, FITNESS.hiring); return false; }
    const head = classifyNotice({ title: row.title });
    if (searchable(head.fitness) || head.fitness === FITNESS.unknown || hint === 'notice') return true;
    countSkip(status, head.fitness);
    return false;
  }).slice(0, DETAIL_LIMIT);
  status.candidates = candidates.length;

  const notices = [];
  for (const row of candidates) {
    if (budget && !budget.take()) { status.detailSkipped = (status.detailSkipped || 0) + 1; continue; }
    await wait(REQUEST_GAP_MS);
    let body = '';
    try {
      const detail = await request(fetcher, `${source.origin}${source.detailPath}?bmode=view&idx=${encodeURIComponent(row.listSn)}&t=board`);
      // 글 제목 자리부터 읽는다. 그 앞은 머리말이고 한참 뒤는 다른 글 목록이다.
      body = bodyTextOf(detail, 'view_tit').slice(0, 4000);
    } catch { /* 한 건 실패는 출처 장애가 아니다 */ }
    const period = extractPeriod(`${row.title}\n${body}`);
    const verdict = classifyNotice({ title: row.title, body });
    if (!searchable(verdict.fitness)) { countSkip(status, verdict.fitness); continue; }
    const { stage, daysLeft } = noticeStage(period.deadline, today);
    notices.push({
      sourceId: source.id, sourceLabel: source.label, source: source.id,
      organization: source.organization, sourceLabelShort: '바보의나눔',
      listSn: row.listSn, title: row.title, registeredAt: row.registeredAt, boardCategory: row.category,
      deadline: period.deadline, applicationPeriod: period.applicationPeriod, deadlineSource: period.deadlineSource,
      deadlineKnown: Boolean(period.deadline), stage, daysLeft,
      summary: body.slice(0, 300) || '상세 공고문 확인 필요', officialTextExtracted: body.length > 0,
      // 첨부는 링크만 센다. 파일 원문은 중복 저장하지 않는다.
      attachments: [], fitness: verdict.fitness, fitnessReason: verdict.reason, fitnessConfirmed: verdict.confirmed,
      sourceUrl: `${source.origin}${source.detailPath}?bmode=view&idx=${encodeURIComponent(row.listSn)}&t=board`,
      references: [{ source: source.id, listSn: row.listSn, kind: 'board' }]
    });
  }
  const open = notices.filter(notice => isCollectible(notice, today));
  status.collected = open.length;
  return { status, notices: open };
}

// ---------- 나라장터 (조달청 Open API) ----------
// 인증키가 없으면 여기까지 오지 않는다. 값을 만들지도, 화면을 긁지도 않는다.
async function collectG2b(fetcher, source, today, { serviceKey, days = 14, now = new Date() } = {}) {
  const status = baseStatus(source);
  const stamp = date => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}0000`;
  const from = new Date(now.getTime() - days * 86400000);
  const url = `${source.origin}${source.path}?serviceKey=${encodeURIComponent(serviceKey)}&numOfRows=100&pageNo=1&type=json`
    + `&inqryDiv=1&inqryBgnDt=${stamp(from)}&inqryEndDt=${stamp(now)}`;
  const payload = await request(fetcher, url, { accept: 'application/json' });
  const parsed = parseG2bPayload(payload);
  if (!parsed.ok) return { status: { ...status, status: 'failed', reason: parsed.reason }, notices: [] };
  status.listed = parsed.rows.length;

  const notices = [];
  for (const row of parsed.rows) {
    // 학교·교육청 발주의 교육·상담·복지 용역만 본다.
    if (!isSchoolNotice(row)) { countSkip(status, 'off-topic'); continue; }
    const verdict = classifyNotice({ title: row.title, body: `${row.organization} ${row.demandOrganization}`, sourceKind: 'bid-board' });
    if (!searchable(verdict.fitness)) { countSkip(status, verdict.fitness); continue; }
    const { stage, daysLeft } = noticeStage(row.deadline, today);
    notices.push({
      sourceId: source.id, sourceLabel: source.label, source: source.id,
      organization: row.organization || source.organization, sourceLabelShort: '나라장터',
      demandOrganization: row.demandOrganization,
      noticeNo: row.noticeNo, noticeOrder: row.noticeOrder,
      listSn: `${row.noticeNo}-${row.noticeOrder || '00'}`, title: row.title, registeredAt: row.registeredAt,
      deadline: row.deadline, applicationPeriod: '', deadlineSource: 'official',
      deadlineKnown: Boolean(row.deadline), stage, daysLeft,
      summary: [row.demandOrganization && `수요기관 ${row.demandOrganization}`, row.budget && `예산 ${row.budget}`].filter(Boolean).join(' · ') || '상세 공고문 확인 필요',
      officialTextExtracted: false, attachments: [],
      fitness: verdict.fitness, fitnessReason: verdict.reason, fitnessConfirmed: verdict.confirmed,
      sourceUrl: row.sourceUrl,
      references: [{ source: source.id, listSn: `${row.noticeNo}-${row.noticeOrder || '00'}`, kind: 'api' }]
    });
  }
  status.candidates = notices.length;
  const open = notices.filter(notice => isCollectible(notice, today));
  status.collected = open.length;
  return { status, notices: open };
}

// 아임웹 게시판은 구조가 같다. 바보의나눔에 쓰던 수집기를 부스러기사랑나눔회에도 그대로 쓴다.
const RUNNERS = { 'kihf-notice': collectKihf, 'kihf-bid': collectKihf, 'babo-notice': collectBabo, 'busrugy-notice': collectBabo, 'g2b-service': collectG2b };

// 출처를 하나씩 돌린다. 한 곳의 실패가 다른 곳을 막지 않는다.
export async function collectExtraSources(fetcher = fetch, { settings = {}, secrets = {}, now = new Date(), budget = makeBudget() } = {}) {
  const today = todayInSeoul(now);
  const sources = [];
  const notices = [];
  // 한 번에 부를 수 있는 횟수에 한도가 있다. 늘 같은 차례로 돌면 뒤쪽 출처는 영영 차례가 오지 않는다.
  // 그래서 실행할 때마다 시작 지점을 한 칸씩 옮긴다. 하루 두 번 도는 동안 모든 곳이 앞자리에 선다.
  for (const source of rotate(SOURCES, now)) {
    const gate = runnable(source, { settings, secrets });
    if (!gate.ok) {
      // 돌리지 않은 것은 실패가 아니다. 따로 표시한다.
      sources.push({ ...baseStatus(source), status: 'skipped', reason: gate.reason });
      continue;
    }
    const runner = RUNNERS[source.id];
    if (!runner) { sources.push({ ...baseStatus(source), status: 'skipped', reason: 'unknown' }); continue; }
    // 앞 출처를 막 끝낸 참이다. 숨을 한 번 돌리고 다음 곳을 연다.
    if (sources.some(item => item.status === 'ok' || item.status === 'failed')) await wait(SOURCE_GAP_MS);
    try {
      const outcome = await runner(fetcher, source, today, { serviceKey: secrets[source.needsSecret], now, budget });
      sources.push(outcome.status);
      notices.push(...outcome.notices);
    } catch (error) {
      sources.push({ ...baseStatus(source), status: 'failed', reason: failureReason(error) });
    }
  }
  return { sources, notices, detailsUsed: budget.spent };
}

// 실행할 때마다 시작 지점을 옮긴다. 순서만 돌리고 목록은 그대로 둔다.
export function rotate(list, now = new Date()) {
  const rows = Array.isArray(list) ? list : [];
  if (rows.length < 2) return rows;
  // 하루 두 번(08시·18시) 도는 것을 반 칸씩 옮기는 기준으로 삼는다.
  const half = Math.floor(now.getTime() / (12 * 60 * 60 * 1000));
  const at = ((half % rows.length) + rows.length) % rows.length;
  return [...rows.slice(at), ...rows.slice(0, at)];
}

function failureReason(error) {
  const message = String(error?.message || '');
  if (error?.name === 'SyntaxError') return FAILURE.shape;
  if (/^http \d+/.test(message)) return FAILURE.http;
  if (message === 'origin not allowed') return '허용되지 않은 주소라 요청하지 않았습니다.';
  // 한 번 실행에서 부를 수 있는 횟수를 다 쓴 경우. 출처가 죽은 것이 아니므로 그렇게 적는다.
  if (/subrequest/i.test(message)) return '이번 실행에서 부를 수 있는 횟수를 다 썼습니다. 다음 실행에서 먼저 돌립니다.';
  return FAILURE.network;
}

export { collectKihf, collectBabo, collectG2b, sourceById };
