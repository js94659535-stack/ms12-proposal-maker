// 출처별 목록 해석기. 통신은 하지 않는다. 받은 응답을 어떻게 읽는지만 담는다.
//
// 모든 해석기는 「이게 정말 목록인가」를 먼저 본다. 오류 화면을 HTTP 200으로 돌려주는 곳이 있어
// 0건 성공과 구조 변경을 구분하지 못하면 조용히 몇 주씩 비어 있게 된다.

export const PARSE_FAIL = Object.freeze({
  shape: '목록 구조가 바뀌었거나 오류 화면입니다.',
  empty: '목록 틀은 있으나 글이 없습니다.'
});

const clean = value => String(value ?? '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const dateOf = value => (String(value || '').match(/\d{4}[-.]\s?\d{1,2}[-.]\s?\d{1,2}/) || [''])[0]
  .replace(/\s/g, '').replace(/\./g, '-').replace(/-(\d)(?!\d)/g, '-0$1').replace(/^(\d{4})-(\d)-/, '$1-0$2-');

// ---------- 한국건강가정진흥원 (eGov 표 게시판) ----------
// <table class="list"> ... <tbody><tr><td>번호</td><td><a href="view.do?article_seq=..">제목</a></td><td>파일</td><td>작성일</td></tr>
export function parseKihfList(html) {
  const text = String(html || '');
  // 목록 틀이 없으면 오류 화면이다. 0건으로 넘기지 않는다.
  if (!/<table[^>]*class="[^"]*\blist\b/.test(text) || !/article_seq=/.test(text)) {
    return { ok: false, reason: PARSE_FAIL.shape, rows: [] };
  }
  const body = text.slice(text.indexOf('<tbody'), text.indexOf('</tbody>') + 8);
  const rows = [];
  for (const match of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => cell[1]);
    if (cells.length < 2) continue;
    const link = /href="[^"]*article_seq=(\d+)/.exec(match[1]);
    if (!link) continue;
    rows.push({
      listSn: link[1],
      title: clean(cells[1]),
      registeredAt: dateOf(clean(cells.at(-1))),
      hasAttachment: /add_file|첨부/.test(match[1])
    });
  }
  if (!rows.length) return { ok: false, reason: PARSE_FAIL.shape, rows: [] };
  // 제목이 비어 있는 행이 섞이면 해석기가 깨진 것이다.
  if (rows.some(row => !row.title)) return { ok: false, reason: PARSE_FAIL.shape, rows: [] };
  return { ok: true, reason: '', rows };
}

// ---------- 바보의나눔 (Imweb 게시판) ----------
// <ul class="li_body ..."> ... <em>공고</em> ... href="...idx=172953530..." ... a.list_text_title
export function parseBaboList(html) {
  const text = String(html || '');
  if (!/li_board|li_body/.test(text) || !/idx=\d+/.test(text)) {
    return { ok: false, reason: PARSE_FAIL.shape, rows: [] };
  }
  const rows = [];
  for (const chunk of text.split('<ul class="li_body').slice(1)) {
    const idx = /idx=(\d+)/.exec(chunk);
    if (!idx) continue;
    const category = clean((/<em[^>]*>([^<]{1,12})<\/em>/.exec(chunk) || [])[1] || '');
    const titleMatch = /class="list_text_title[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(chunk);
    const title = clean(titleMatch?.[1] || '');
    if (!title) continue;
    rows.push({
      listSn: idx[1], title, category,
      registeredAt: dateOf(chunk),
      hasAttachment: /icon-clip|attach|첨부/.test(chunk)
    });
  }
  if (!rows.length) return { ok: false, reason: PARSE_FAIL.shape, rows: [] };
  return { ok: true, reason: '', rows };
}

// 바보의나눔 게시판 분류를 우리 분류로 옮긴다. 게시판이 준 값을 지어내지 않는다.
export function baboCategoryHint(category) {
  const value = String(category || '');
  if (/공고/.test(value)) return 'notice';
  if (/양식|서식|자료/.test(value)) return 'form';
  if (/결과/.test(value)) return 'result';
  if (/설명회|안내|알림/.test(value)) return 'briefing';
  return '';
}

// ---------- 나라장터 (조달청 Open API, JSON) ----------
// 인증키가 없으면 여기까지 오지 않는다. 오면 응답 모양을 먼저 본다.
export function parseG2bPayload(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: PARSE_FAIL.shape, rows: [], total: 0 };
  // 키 오류·서비스 오류는 이 모양으로 온다.
  const fault = payload.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (fault) return { ok: false, reason: `조달청 응답 오류: ${fault.returnAuthMsg || fault.errMsg || '알 수 없음'}`, rows: [], total: 0 };
  const header = payload.response?.header;
  if (header && String(header.resultCode) !== '00') {
    return { ok: false, reason: `조달청 응답 오류: ${header.resultMsg || header.resultCode}`, rows: [], total: 0 };
  }
  const bodyPart = payload.response?.body;
  if (!bodyPart) return { ok: false, reason: PARSE_FAIL.shape, rows: [], total: 0 };
  const raw = bodyPart.items;
  const items = Array.isArray(raw) ? raw : Array.isArray(raw?.item) ? raw.item : raw && typeof raw === 'object' ? [raw.item].filter(Boolean).flat() : [];
  const total = Number(bodyPart.totalCount);
  if (!Number.isFinite(total)) return { ok: false, reason: PARSE_FAIL.shape, rows: [], total: 0 };
  const rows = items.filter(Boolean).map(item => ({
    // 공고번호와 차수는 중복 판정의 열쇠다.
    noticeNo: String(item.bidNtceNo || '').trim(),
    noticeOrder: String(item.bidNtceOrd || '').trim(),
    title: clean(item.bidNtceNm || ''),
    organization: clean(item.ntceInsttNm || ''),
    demandOrganization: clean(item.dminsttNm || ''),
    registeredAt: dateOf(item.bidNtceDt || ''),
    deadline: dateOf(item.bidClseDt || item.opengDt || ''),
    sourceUrl: String(item.bidNtceDtlUrl || '').trim(),
    budget: clean(item.presmptPrce || item.asignBdgtAmt || '')
  })).filter(row => row.noticeNo && row.title);
  return { ok: true, reason: '', rows, total };
}

// 학교·교육청 발주인지. 나라장터에서 이 조건으로만 걸러 낸다.
const EDU_ORG = /교육청|교육지원청|교육원|학교|유치원|교육연수원|교육복지/;
const EDU_TOPIC = /교육|상담|진로|정서|문화|복지|다문화|학부모|돌봄|방과후|심리|예술|체험/;

export function isSchoolNotice(row) {
  const org = `${row?.organization || ''} ${row?.demandOrganization || ''}`;
  const title = String(row?.title || '');
  return EDU_ORG.test(org) && EDU_TOPIC.test(title);
}

export { clean as cleanText, dateOf as toDate };
