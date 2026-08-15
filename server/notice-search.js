// 공모정보 검색. 이미 D1에 모아 둔 archived_notices만 읽는다.
// AI도 외부 API도 부르지 않고 새로 수집하지도 않는다.
//
// 검색 범위는 두 가지다.
//   맞춤검색(focused, 기본): 공고 제목 + 제목에 연결된 연관 키워드
//   광역검색(broad):        맞춤검색 범위 + 공고 요약 내용
// 공고 원문 전체(notice_json)는 어느 쪽에도 넣지 않는다. 읽지도 않는다.
//
// 왜 FTS5를 쓰지 않았나 (2,000행 기준 실측):
//   「기금」 LIKE 400건 / FTS5 unicode61 0건 / FTS5 trigram 0건
//   「아동」 LIKE 800건 / FTS5 unicode61 0건 / FTS5 trigram 0건
// 한국어는 「복권기금」처럼 한 낱말이 한 토큰이라 unicode61은 그 안의 「기금」을 못 찾고,
// trigram은 세 글자 미만 검색어를 받지 못한다. 두 글자 검색어가 가장 흔한 우리 자료에서는
// 두 방식 모두 결과가 0이 된다. 같은 조건에서 부분일치 검색은 0.5~1.6ms였고 현재 자료는 수십 건이므로,
// 정규화한 검색 문자열에 부분일치를 걸고 서버가 점수를 매기는 방식이 지금 구조에 맞는 최소 방식이다.

export const SEARCH_MODES = ['focused', 'broad'];
export const DEFAULT_MODE = 'focused';
export const MODE_LABELS = { focused: '맞춤검색', broad: '광역검색' };
export const SEARCH_LIMIT = 60;
export const CLOSING_DAYS = 7;
const MAX_TERMS = 6;
const MAX_TERM_LENGTH = 40;

// 순위 등급. 제목 전체 일치 → 제목 포함 → 연관 키워드 일치 → 요약 내용 일치.
export const RANK = Object.freeze({ titleExact: 4, titlePart: 3, keyword: 2, summary: 1, none: 0 });
export const RANK_LABELS = { 4: '제목 전체 일치', 3: '제목 포함', 2: '연관 키워드 일치', 1: '요약 내용 일치' };

// 대상·분야·지역을 부르는 다른 말. 제목에 있는 말과 이어 주기 위한 것이지 없는 사실을 만들지 않는다.
export const REGIONS = [
  ['전국', ['전국', '전지역']], ['서울', ['서울']], ['부산', ['부산']], ['대구', ['대구']], ['인천', ['인천']],
  ['광주', ['광주']], ['대전', ['대전']], ['울산', ['울산']], ['세종', ['세종']], ['경기', ['경기', '수원', '성남', '고양', '용인']],
  ['강원', ['강원']], ['충북', ['충북', '충청북도']], ['충남', ['충남', '충청남도']], ['전북', ['전북', '전라북도']],
  ['전남', ['전남', '전라남도']], ['경북', ['경북', '경상북도']], ['경남', ['경남', '경상남도']], ['제주', ['제주']]
];
export const AUDIENCES = [
  ['아동', ['아동', '어린이', '초등']], ['청소년', ['청소년', '중학생', '고등학생']], ['청년', ['청년', '대학생']],
  ['노인', ['노인', '어르신', '고령']], ['장애인', ['장애인', '장애아']], ['여성', ['여성', '한부모']],
  ['다문화', ['다문화', '이주배경', '외국인']], ['가족', ['가족', '가정']], ['취약계층', ['취약계층', '저소득', '기초생활']],
  ['소상공인', ['소상공인', '자영업']], ['기관·단체', ['기관', '단체', '법인', '센터']]
];
export const FIELDS = [
  ['복지', ['복지', '돌봄', '사례관리', '자립']], ['교육', ['교육', '학습', '진로', '멘토']],
  ['문화예술', ['문화', '예술', '공연', '체육']], ['보건의료', ['보건', '의료', '건강', '정신', '심리', '정서']],
  ['환경', ['환경', '기후', '탄소']], ['일자리·창업', ['일자리', '취업', '창업', '고용']],
  ['지역사회', ['지역사회', '마을', '주민']], ['디지털', ['디지털', '정보화', '인공지능', '온라인']]
];

const clean = (value, max = 4000) => String(value ?? '').trim().slice(0, max);

// 띄어쓰기·대소문자·특수문자 차이를 없앤다. 한글·영문·숫자만 남기고 낱말은 공백 하나로 나눈다.
export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+/g, ' ').trim().replace(/\s+/g, ' ');
}
// 부분검색용. 띄어쓰기까지 지워 「가족 기능」으로도 「가족기능」을 찾는다.
export const compactText = value => normalizeText(value).replace(/\s+/g, '');

// 제목에 연결된 연관 키워드. 제목 낱말 + 제목에서 확인된 지역·대상·분야 + 그 다른 이름 + 주최기관.
export function keywordsOf(row) {
  const title = normalizeText(row.title);
  const compact = compactText(row.title);
  const words = new Set(title.split(' ').filter(word => word.length > 1));
  for (const table of [REGIONS, AUDIENCES, FIELDS]) {
    for (const [label, synonyms] of table) {
      if (!synonyms.some(word => compact.includes(compactText(word)))) continue;
      words.add(normalizeText(label));
      for (const word of synonyms) words.add(normalizeText(word));
    }
  }
  for (const value of [row.source_label, row.source]) { const word = normalizeText(value); if (word) words.add(word); }
  return [...words].filter(Boolean).join(' ');
}

// 광역검색이 더 보는 부분. 공고 요약과 요약 수준 항목만 담고 원문은 담지 않는다.
export const summaryTextOf = row => normalizeText([row.summary, row.eligibility, row.support_limit, row.application_period].join(' '));

// 원문에 있는 말로만 붙인다. 없으면 빈 값으로 두고 지어내지 않는다.
function matched(table, compact) {
  return table.filter(([, words]) => words.some(word => compact.includes(compactText(word)))).map(([label]) => label);
}
export function classifyNotice(row) {
  const compact = compactText([row.title, row.summary, row.eligibility].join(' '));
  return { region: matched(REGIONS, compact).join(','), audience: matched(AUDIENCES, compact).join(','), field: matched(FIELDS, compact).join(',') };
}

// 검색 문자열은 읽을 때마다 원문에서 다시 만든다. 열에 반쯤 채워진 값이 있어도 그것을 믿지 않는다.
// 분류는 저장된 값이 있으면 그대로 쓰고 없을 때만 만든다.
export function withDerived(row) {
  const needsClass = !row.region && !row.audience && !row.field;
  const classified = needsClass ? classifyNotice(row) : { region: row.region || '', audience: row.audience || '', field: row.field || '' };
  return { ...row, ...classified, search_title: normalizeText(row.title), search_keywords: keywordsOf(row), search_summary: summaryTextOf(row) };
}

// 여러 단어를 넣으면 모두 들어간 자료만 찾는다. 낱말 수와 길이는 묶어 둔다.
export function parseQuery(value) {
  return normalizeText(value).split(' ').map(term => term.slice(0, MAX_TERM_LENGTH)).filter(Boolean).slice(0, MAX_TERMS);
}
export const searchMode = value => (SEARCH_MODES.includes(value) ? value : DEFAULT_MODE);

export function deadlineState(deadline, now = new Date()) {
  const day = String(deadline || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'open';
  const today = now.toISOString().slice(0, 10);
  if (day < today) return 'closed';
  const left = Math.round((Date.parse(`${day}T23:59:59Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return left <= CLOSING_DAYS ? 'closing' : 'open';
}
export const DEADLINE_LABELS = { open: '모집 중', closing: '마감 임박', closed: '마감' };

// 어느 등급으로 걸렸는지. 검색어가 하나라도 범위 밖이면 결과에 넣지 않는다.
export function rankNotice(row, terms, mode = DEFAULT_MODE) {
  if (!terms.length) return RANK.titlePart;
  const title = compactText(row.search_title || row.title);
  const keywords = compactText(row.search_keywords || keywordsOf(row));
  const summary = searchMode(mode) === 'broad' ? compactText(row.search_summary || summaryTextOf(row)) : '';
  const query = terms.join('');
  // 제목이 검색어와 통째로 같으면 가장 위다.
  if (title === query) return RANK.titleExact;
  let lowest = RANK.titleExact;
  for (const term of terms) {
    const hit = title.includes(term) ? RANK.titlePart
      : keywords.includes(term) ? RANK.keyword
      : summary && summary.includes(term) ? RANK.summary : RANK.none;
    if (hit === RANK.none) return RANK.none;
    lowest = Math.min(lowest, hit);
  }
  return lowest;
}

// 같은 등급 안에서의 순서. 제목에 더 많이 걸릴수록, 마감이 살아 있을수록 위로 올린다.
export function scoreNotice(row, terms, mode = DEFAULT_MODE, now = new Date()) {
  const rank = rankNotice(row, terms, mode);
  if (rank === RANK.none) return 0;
  const title = compactText(row.search_title || row.title);
  const keywords = compactText(row.search_keywords || keywordsOf(row));
  let detail = 0;
  for (const term of terms) {
    if (title.includes(term)) detail += 6;
    else if (keywords.includes(term)) detail += 3;
    else detail += 1;
  }
  if (terms.length > 1 && title.includes(terms.join(''))) detail += 5;
  const state = deadlineState(row.deadline, now);
  if (state === 'closing') detail += 2;
  if (state === 'closed') detail -= 4;
  // 등급이 순위를 먼저 정한다. 같은 등급 안에서만 세부 점수로 갈린다.
  return rank * 1000 + Math.max(detail, 0);
}

// 필터. 값이 없으면 거르지 않는다.
// 기본 검색에 나오는 적합성. notice-classify와 같은 값을 쓴다.
const SEARCHABLE_FITNESS = ['proposal', 'bid'];

export function passesFilters(row, filters = {}, now = new Date()) {
  const state = filters.state ? String(filters.state) : '';
  if (state && deadlineState(row.deadline, now) !== state) return false;
  for (const key of ['region', 'audience', 'field']) {
    const wanted = clean(filters[key], 40);
    if (wanted && !String(row[key] || '').split(',').includes(wanted)) return false;
  }
  const organizer = clean(filters.organizer, 100);
  if (organizer && !compactText(`${row.source_label} ${row.source}`).includes(compactText(organizer))) return false;
  // 사업 유형과 수집 출처. 기존 사랑의열매 자료는 값이 비어 있어 chest로 본다.
  const businessType = clean(filters.businessType, 40);
  const rowType = clean(row.business_type, 40) || 'chest';
  if (businessType && rowType !== businessType) return false;
  // 머리띠에서 고른 공고 출처·기관 범위. 여러 곳을 고르면 그 안에서만 찾는다.
  // 아무 곳도 고르지 않았으면 좁히지 않는다. 빈 화면을 주는 것보다 전부 보여 주는 편이 낫다.
  const scope = Array.isArray(filters.businessTypes) ? filters.businessTypes.map(item => clean(item, 40)).filter(Boolean) : [];
  if (scope.length && !scope.includes(rowType)) return false;
  const sourceGroup = clean(filters.sourceGroup, 40);
  if (sourceGroup && (clean(row.source_group, 40) || 'chest') !== sourceGroup) return false;
  // 기본 공모검색에는 제안·지원 가능과 입찰·위탁 참여 가능만 나온다.
  // 값이 비어 있는 기존 자료는 지금까지처럼 그대로 보여 준다.
  const fitness = clean(row.fitness, 20);
  if (fitness && !SEARCHABLE_FITNESS.includes(fitness) && filters.includeAll !== true) return false;
  return true;
}

// 비회원에게 나가는 값. 요약·지원대상·접수기간·지원금액·원문 출처만 담는다.
// 공고 본문 원문, 내부 검토자료, 회원 계획서, 기관별 분석자료는 어떤 경로로도 담지 않는다.
export function publicNotice(row, now = new Date(), rank = 0) {
  const state = deadlineState(row.deadline, now);
  return {
    key: row.source_key,
    title: clean(row.title, 300),
    organizer: clean(row.source_label, 100) || clean(row.source, 100),
    summary: clean(row.summary, 1200),
    eligibility: clean(row.eligibility, 1200),
    applicationPeriod: clean(row.application_period, 200),
    deadline: clean(row.deadline, 20),
    supportAmount: clean(row.support_limit, 200),
    region: String(row.region || '').split(',').filter(Boolean),
    audience: String(row.audience || '').split(',').filter(Boolean),
    field: String(row.field || '').split(',').filter(Boolean),
    sourceLabel: clean(row.source_label, 100) || clean(row.source, 100),
    sourceUrl: clean(row.source_url, 500),
    state, stateLabel: DEADLINE_LABELS[state],
    matchedBy: RANK_LABELS[rank] || ''
  };
}

// 관리자에게만 나가는 값. 출처 URL·수집일·최종 확인일·중복 여부·공개 여부를 함께 본다.
export function adminNotice(row, { duplicate = false, duplicateOf = '' } = {}, now = new Date()) {
  return {
    ...publicNotice(row, now),
    source: clean(row.source, 40),
    listSn: clean(row.list_sn, 80),
    collectedAt: clean(row.first_seen_at, 40),
    lastCheckedAt: clean(row.last_checked_at, 40) || clean(row.updated_at, 40),
    updatedAt: clean(row.updated_at, 40),
    contentHash: clean(row.content_hash, 40),
    isPublic: Number(row.is_public ?? 1) === 1,
    duplicate, duplicateOf: duplicateOf || clean(row.duplicate_of, 180)
  };
}

// 내용이 같거나 제목·마감일이 같은 다른 자료를 중복으로 본다.
export function findDuplicates(rows) {
  const byHash = new Map();
  const byTitle = new Map();
  const marks = new Map();
  for (const row of rows) {
    const hash = clean(row.content_hash, 40);
    const title = `${compactText(row.title)}|${clean(row.deadline, 20)}`;
    for (const [map, key] of [[byHash, hash], [byTitle, title]]) {
      if (!key) continue;
      const first = map.get(key);
      if (first && first !== row.source_key) marks.set(row.source_key, first);
      else if (!first) map.set(key, row.source_key);
    }
  }
  return marks;
}

// 목록에 붙일 필터 후보. 실제 자료에 있는 값만 센다.
export function facetsOf(rows, now = new Date()) {
  const count = (list, value) => { if (!value) return; list.set(value, (list.get(value) || 0) + 1); };
  const regions = new Map(); const audiences = new Map(); const fields = new Map(); const organizers = new Map(); const states = new Map();
  // 사업 유형과 수집 출처는 다른 축이다. 각각 센다.
  const businessTypes = new Map(); const sourceGroups = new Map();
  for (const row of rows) {
    for (const value of String(row.region || '').split(',')) count(regions, value);
    for (const value of String(row.audience || '').split(',')) count(audiences, value);
    for (const value of String(row.field || '').split(',')) count(fields, value);
    count(organizers, clean(row.source_label, 100) || clean(row.source, 100));
    count(states, deadlineState(row.deadline, now));
    // 기존 사랑의열매 자료는 값이 비어 있어 chest로 본다.
    count(businessTypes, clean(row.business_type, 40) || 'chest');
    count(sourceGroups, clean(row.source_group, 40) || 'chest');
  }
  const list = map => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, total]) => ({ value, total }));
  return {
    region: list(regions), audience: list(audiences), field: list(fields), organizer: list(organizers),
    businessType: list(businessTypes), sourceGroup: list(sourceGroups),
    state: ['open', 'closing', 'closed'].map(value => ({ value, label: DEADLINE_LABELS[value], total: states.get(value) || 0 }))
  };
}
