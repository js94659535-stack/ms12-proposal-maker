// 공고 수집 규칙. 통신은 하지 않고 판정·해석만 담당해 시험할 수 있게 둔다.
//
// 배경: 2026년 8월 기준 배분신청 포털(proposal.chest.or.kr)의 모든 .do 경로가
// 「찾으시는 페이지가 없습니다」 오류 화면을 HTTP 200으로 돌려준다. 예전 수집 경로
// (/mobile/mobileMainBsnsList.do)는 그래서 조용히 0건이 됐다. 지금 살아 있는 공식
// 통로는 각 모금회 누리집의 게시판 API(/bbs/selectPostList.do · /bbs/selectPostInfo.do)뿐이라
// 그쪽으로 옮긴다. 두 API는 「누락 공고 URL 추가」가 이미 쓰던 것과 같은 식별자(listSn)를 쓴다.

// 공식 도메인만 대상으로 한다. 여기 없는 주소는 수집하지 않는다.
export const SOURCES = Object.freeze({
  central: Object.freeze({ label: '중앙회', origin: 'https://chest.or.kr', branchCode: '001', organization: '사회복지공동모금회' }),
  gwangju: Object.freeze({ label: '광주지회', origin: 'https://gwangju.chest.or.kr', branchCode: '006', organization: '사회복지공동모금회' })
});

// 공모가 실리는 게시판. 확인 결과 중앙회·광주지회 모두 1000(공지사항)만 최신이다.
// 1004(지원안내)는 2023~2024년에서 갱신이 멈춰 있어 넣지 않는다.
export const NOTICE_BOARDS = Object.freeze(['1000']);

// 마감일을 못 읽은 글은 최근 것만 진행 중으로 본다. 오래된 글까지 끌어오지 않기 위해서다.
export const UNKNOWN_DEADLINE_DAYS = 60;
// 마감이 이만큼 남았으면 임박으로 본다.
export const CLOSING_SOON_DAYS = 7;

export const STAGE = Object.freeze({
  open: '진행중', closingSoon: '마감임박', closed: '마감', unknown: '마감일 확인 필요'
});

export const FAILURE = Object.freeze({
  http: '공식 사이트가 목록을 돌려주지 않았습니다.',
  shape: '공식 사이트 연결 방식이 변경되어 공고를 가져오지 못했습니다.',
  network: '공식 사이트에 연결하지 못했습니다.'
});

const POSITIVE = /공모|배분\s*사업|지원\s*사업|사업\s*신청|신청\s*접수|접수\s*안내|모집/;
const NEGATIVE = /채용|초빙|합격|선정\s*(?:결과|기관|내역)|결과\s*발표|심사\s*결과|낙찰|계약\s*체결|입찰|자원봉사자\s*모집|후원자\s*모집/;

// 공모로 볼 만한 제목인지. 기존 isBusinessNotice의 제외 규칙을 그대로 쓰고 긍정 조건을 더한다.
export function isNoticeCandidate(title, isBusiness = () => true) {
  const value = String(title || '').normalize('NFKC');
  if (!value.trim()) return false;
  if (NEGATIVE.test(value)) return false;
  if (!POSITIVE.test(value)) return false;
  return isBusiness(value);
}

// 목록 응답이 진짜 목록인지 본다. 오류 화면을 0건 성공으로 넘기지 않기 위한 관문이다.
export function validListPayload(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: FAILURE.shape, rows: [], total: 0 };
  const rows = payload.listInfo;
  if (!Array.isArray(rows)) return { ok: false, reason: FAILURE.shape, rows: [], total: 0 };
  const total = Number(payload.pageInfo?.totalCount);
  if (!Number.isFinite(total)) return { ok: false, reason: FAILURE.shape, rows: [], total: 0 };
  // 글이 있다고 하면서 항목 모양이 다르면 파서가 깨진 것이다.
  if (rows.length && !rows.every(row => row && typeof row === 'object' && String(row.listSn || '').trim() && String(row.sj || '').trim())) {
    return { ok: false, reason: FAILURE.shape, rows: [], total };
  }
  return { ok: true, reason: '', rows, total };
}

const DATE_PATTERNS = [
  /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/g,
  /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g
];

// 본문에서 날짜만 뽑아 YYYY-MM-DD로 맞춘다. 말이 되지 않는 연도는 버린다.
export function parseDates(text) {
  const found = [];
  for (const pattern of DATE_PATTERNS) {
    for (const match of String(text || '').matchAll(new RegExp(pattern.source, 'g'))) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) continue;
      // 달력에 없는 날(2월 30일 등)은 오타이거나 날짜가 아니다.
      const stamp = new Date(Date.UTC(year, month - 1, day));
      if (stamp.getUTCMonth() !== month - 1 || stamp.getUTCDate() !== day) continue;
      found.push({ index: match.index, value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` });
    }
  }
  return found.sort((left, right) => left.index - right.index);
}

// 「접수기간」처럼 뜻이 분명한 이름표를 먼저 찾고, 없으면 밋밋한 「기간:」도 본다.
const STRICT_LABEL = /(?:접수|신청|공모|제출|응모|모집)\s*(?:기간|기한|마감|일정)/;
const LOOSE_LABEL = /기간\s*[:：]|까지\s*(?:접수|신청|제출)/;
const RANGE_MARK = /[~〜–—]/;

// 「2026. 3. 25.(수) ~ 4. 24.(금)」처럼 끝 날짜에 연도를 빼먹는 서식이 흔하다.
// 시작 날짜의 연도를 물려주고, 달이 거꾸로 가면 다음 해로 본다.
function rangeEnd(line, start) {
  const tail = line.slice(start.index);
  const match = tail.match(new RegExp(`${RANGE_MARK.source}\\s*(\\d{1,2})\\s*[.\\-/월]\\s*(\\d{1,2})`));
  if (!match) return '';
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const [startYear, startMonth] = start.value.split('-').map(Number);
  const year = month < startMonth ? startYear + 1 : startYear;
  const stamp = new Date(Date.UTC(year, month - 1, day));
  if (stamp.getUTCMonth() !== month - 1 || stamp.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function deadlineOfLine(line) {
  const dates = parseDates(line);
  if (!dates.length) return '';
  const last = dates.at(-1);
  return rangeEnd(line, last) || last.value;
}

// registeredAt을 함께 주면 「올린 날짜를 마감일로 착각하는」 실수를 막는다.
// 게시판 상세에는 올린 날짜만 적혀 있는 글이 많다. 그 날짜를 마감일로 삼으면 오늘 올라온 공고가 마감으로 보인다.
export function extractPeriod(text, { registeredAt = '' } = {}) {
  const lines = String(text || '').split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const label of [STRICT_LABEL, LOOSE_LABEL]) {
    for (const line of lines) {
      if (!label.test(line)) continue;
      const deadline = deadlineOfLine(line);
      if (!deadline) continue;
      return { applicationPeriod: line.slice(0, 200), deadline, deadlineSource: 'labeled' };
    }
  }
  // 이름표가 없으면 본문에서 가장 늦은 날짜를 마감일 후보로 본다. 근거가 약한 것은 표시해 둔다.
  const all = parseDates(lines.join('\n'));
  if (!all.length) return { applicationPeriod: '', deadline: '', deadlineSource: '' };
  const latest = all.map(found => found.value).sort().at(-1);
  // 본문에서 찾은 가장 늦은 날짜가 올린 날짜보다 뒤가 아니면 마감일이 아니다. 모른다고 둔다.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(registeredAt || '')) && latest <= registeredAt) {
    return { applicationPeriod: '', deadline: '', deadlineSource: '' };
  }
  return { applicationPeriod: '', deadline: latest, deadlineSource: 'body' };
}

export function todayInSeoul(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function daysBetween(from, to) {
  const left = Date.parse(`${from}T00:00:00Z`);
  const right = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.round((right - left) / 86400000);
}

// 진행 상태를 한 곳에서 정한다. 화면·보관함·검색이 같은 기준을 쓰게 하기 위해서다.
export function noticeStage(deadline, today = todayInSeoul()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deadline || ''))) return { stage: STAGE.unknown, daysLeft: null };
  const daysLeft = daysBetween(today, deadline);
  if (daysLeft === null) return { stage: STAGE.unknown, daysLeft: null };
  if (daysLeft < 0) return { stage: STAGE.closed, daysLeft };
  if (daysLeft <= CLOSING_SOON_DAYS) return { stage: STAGE.closingSoon, daysLeft };
  return { stage: STAGE.open, daysLeft };
}

// 목록에 남길 글인지. 마감일을 못 읽었으면 최근 글만 남긴다.
export function isCollectible({ deadline, registeredAt }, today = todayInSeoul()) {
  const { stage } = noticeStage(deadline, today);
  if (stage === STAGE.closed) return false;
  if (stage !== STAGE.unknown) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(registeredAt || ''))) return false;
  const age = daysBetween(registeredAt, today);
  return age !== null && age >= 0 && age <= UNKNOWN_DEADLINE_DAYS;
}

export function detailUrl(origin, bbsSn, listSn) {
  return `${origin}/bbs/${encodeURIComponent(bbsSn)}/initPostDetail.do?listSn=${encodeURIComponent(listSn)}`;
}

// 출처별 결과를 모아 「전부 실패 / 일부 실패 / 정상이지만 0건」을 구분한다.
// 이 판정 하나로 화면 문구와 보관함 반영 여부가 갈린다.
export function summarizeCollection(sources, notices) {
  const failed = sources.filter(source => source.status !== 'ok');
  const healthy = sources.filter(source => source.status === 'ok');
  return {
    healthy: failed.length === 0,
    partial: failed.length > 0 && healthy.length > 0,
    allFailed: healthy.length === 0,
    empty: failed.length === 0 && notices.length === 0,
    // 실패가 하나도 없고 목록을 실제로 받아왔을 때만 보관함에 반영한다.
    syncable: failed.length === 0 && notices.length > 0,
    failedLabels: failed.map(source => source.label)
  };
}
