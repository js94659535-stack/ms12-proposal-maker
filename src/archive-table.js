// 자료보관함 목록(표) 규칙. 검색·필터·정렬·페이지 계산만 담당하며 공고 수집·계획서 로직은 건드리지 않는다.
export const ARCHIVE_STATUSES = ['신규', '검토중', '작성중', '수정중', '제출준비', '완료', '보류', '마감'];
// 0은 「전체」다. 모아 둔 것을 한눈에 훑고 싶을 때 쪽 나눔을 끈다.
export const ARCHIVE_PAGE_SIZES = [5, 10, 20, 50, 100, 0];
export const ARCHIVE_PAGE_SIZE_LABEL = size => (Number(size) === 0 ? '전체' : `${size}개`);
export const ARCHIVE_SORT_KEYS = ['collectedAt', 'institution', 'field', 'title', 'deadline'];
export const ARCHIVE_FIELD_UNKNOWN = '기타';

// 분야는 공고 제목·요약의 표현으로만 분류한다. 새 정보를 만들지 않는다.
const FIELD_RULES = [
  ['아동·청소년', /아동|청소년|학생|보육|지역아동센터|드림스타트|학교밖/],
  ['노인', /노인|고령|어르신|치매|경로/],
  ['장애인', /장애인|장애아|발달장애|자립생활/],
  ['가족·여성', /가족|가정|여성|한부모|다문화|부모/],
  ['복지·돌봄', /돌봄|복지관|사례관리|취약계층|저소득|기초생활/],
  ['보건·정신건강', /정신건강|자살|중독|보건|의료|재활치료|심리/],
  ['자립·일자리', /자립|일자리|취업|창업|직업|자활/],
  ['지역사회', /마을|지역사회|공동체|주민/],
  ['교육·문화', /교육|문화|예술|체육|프로그램 운영비|캠프/],
  ['환경·안전', /환경|기후|재난|안전|주거환경/]
];

export function archiveField(notice) {
  const text = `${notice?.title || ''} ${notice?.summary || ''} ${notice?.eligibility || ''}`;
  for (const [field, pattern] of FIELD_RULES) if (pattern.test(text)) return field;
  return ARCHIVE_FIELD_UNKNOWN;
}

export function archiveInstitution(notice) {
  return String(notice?.sourceLabel || notice?.source || '').trim() || '기관 미표기';
}

export function archiveDateValue(value) {
  const match = String(value || '').match(/(\d{4})[-.\/](\d{2})[-.\/](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

// 화면에는 YYMMDD 6자리로만 표시한다.
export function shortDate(value) {
  const iso = archiveDateValue(value);
  return iso ? iso.slice(2).replaceAll('-', '') : '';
}

export function archiveCollectedAt(notice) {
  return archiveDateValue(notice?.archivedAt || notice?.archiveUpdatedAt || '');
}

export function archiveDeadline(notice) {
  return archiveDateValue(notice?.deadline || notice?.applicationPeriod?.split('~').pop());
}

// 마감이 이만큼 남았으면 임박으로 본다. 서버 수집 판정(server/notice-collect.js)과 같은 기준이다.
export const CLOSING_SOON_DAYS = 7;

export function deadlineInfo(notice, today) {
  const iso = archiveDeadline(notice);
  // 마감일을 확인하지 못한 공고는 「진행 중」도 「마감」도 아니다. 따로 찾을 수 있게 상태를 따로 둔다.
  if (!iso) return { iso: '', text: '기간 미표기', dday: null, closed: false, stage: '마감일 확인 필요' };
  const days = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${archiveDateValue(today) || iso}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { iso, text: `${shortDate(iso)} · 마감`, dday: days, closed: true, stage: '마감' };
  const stage = days <= CLOSING_SOON_DAYS ? '마감임박' : '진행중';
  return { iso, text: `${shortDate(iso)} · ${days === 0 ? 'D-day' : `D-${days}`}`, dday: days, closed: false, stage };
}

// 계획서 저장 단계에서 상태를 유추한다. 사용자가 지정한 상태가 있으면 그것이 우선이다.
export function stageStatus(stage) {
  const value = String(stage || '');
  if (!value) return '';
  if (value.startsWith('revision-')) return '수정중';
  if (value.startsWith('coaching-')) return '검토중';
  return ({ master: '작성중', parts: '작성중', complete: '제출준비', review: '검토중' })[value] || '작성중';
}

export function noticeStatus(notice, link = {}, today = '') {
  const saved = String(link.status || '').trim();
  if (ARCHIVE_STATUSES.includes(saved)) return saved;
  // [샘플] 프로젝트는 미리 끝까지 진행해 둔 예시이므로 그 상태를 그대로 보여 준다.
  if (ARCHIVE_STATUSES.includes(String(notice?.sampleStatus || ''))) return notice.sampleStatus;
  const derived = stageStatus(notice?.linkedProposalStage);
  if (derived) return derived;
  if (deadlineInfo(notice, today).closed) return '마감';
  return notice?.linkedProposalCount ? '작성중' : '신규';
}

// 원문 바로가기 주소. 수집할 때 실제로 열어 본 주소가 있으면 그것이 정답이다.
// 이것을 버리고 주소를 지어내면 부스러기사랑나눔회 공고를 눌러도 사랑의열매 게시판이 열린다.
// 사랑의열매 게시판 주소는 사랑의열매 공고에만 쓴다. 다른 출처에 붙이면 엉뚱한 기관으로 데려간다.
const CHEST_SOURCES = ['central', 'gwangju', 'chest', 'sample'];
export function noticeSourceUrl(notice) {
  const reference = notice?.references?.[0] || {};
  const source = String(notice?.source || reference.source || '');
  const code = String(notice?.dstbBsnsCode || '').trim();
  if (code) return `https://proposal.chest.or.kr/mobile/mobileMainBsnsDetail.do?dstbBsnsCode=${encodeURIComponent(code)}&appnDocNo=`;
  const stored = String(notice?.sourceUrl || '').trim();
  if (/^https?:\/\//i.test(stored)) return stored;
  if (!source || CHEST_SOURCES.includes(source)) {
    return `${source === 'gwangju' ? 'https://gwangju.chest.or.kr' : 'https://chest.or.kr'}/bbs/1000/initPostList.do`;
  }
  // 주소를 모르면 없는 대로 둔다. 아무 기관 게시판이나 열어 주지 않는다.
  return '';
}

export function applicantLabel(ids = [], applicants = []) {
  const names = ids.map(id => applicants.find(item => item.id === id)?.name).filter(Boolean);
  if (!names.length) return '';
  return names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}곳`;
}

export function archiveNoticeSummary(notice, limit = 250) {
  const text = [notice?.summary, notice?.supportDetails, notice?.eligibility].map(value => String(value || '').trim()).filter(Boolean).join(' / ');
  return text.length > limit ? `${text.slice(0, limit)}…` : text || '요약 정보 없음';
}

export function archiveRow(notice, options = {}) {
  const { links = {}, applicants = [], today = '' } = options;
  const key = String(notice?.archiveNoticeKey || '');
  const link = links[key] || {};
  const deadline = deadlineInfo(notice, today);
  return {
    key,
    notice,
    isSample: Boolean(notice?.isSample),
    collectedAt: archiveCollectedAt(notice),
    institution: archiveInstitution(notice),
    field: archiveField(notice),
    title: String(notice?.title || '제목 없음'),
    deadline,
    status: noticeStatus(notice, link, today),
    applicantIds: Array.isArray(link.applicantIds) ? link.applicantIds : [],
    applicantText: notice?.sampleApplicantText || applicantLabel(Array.isArray(link.applicantIds) ? link.applicantIds : [], applicants),
    sourceUrl: noticeSourceUrl(notice),
    summary: archiveNoticeSummary(notice)
  };
}

// 찾는 자리. 제목만 뒤지면 「아동」으로 지원대상에 적힌 공고를 놓친다.
// 공고번호·마감일·상태까지 넣어 「20260700100031」이나 「마감임박」으로도 찾게 한다.
// 관심 낱말. 눈여겨보는 주제를 적어 두면 그 공고에 표시가 붙고 모아 볼 수 있다.
// 낱말은 사람이 정한다. 우리가 짐작해서 넣거나 빼지 않는다.
export const DEFAULT_WATCH = Object.freeze(['디지털 문해력', '디지털 리터러시', 'AI', '인공지능']);

// 이 공고가 어떤 관심 낱말에 걸리는지. 걸린 낱말을 그대로 돌려준다.
export function watchHits(row, keywords = []) {
  const text = searchText(row);
  return keywords
    .map(word => String(word || '').trim())
    .filter(word => word && text.includes(word.toLowerCase()));
}

export function searchText(row) {
  const notice = row?.notice || {};
  return [
    row?.title, row?.institution, row?.field, row?.applicantText, row?.status,
    row?.deadline?.label, row?.collectedAt,
    notice.summary, notice.eligibility, notice.supportDetails, notice.supportLimit,
    notice.applicationPeriod, notice.noticeNo, notice.dstbBsnsCode, notice.sourceLabel
  ].filter(Boolean).join(' ').toLowerCase();
}

// 적은 낱말이 모두 들어 있어야 한다. 낱말을 늘릴수록 좁아진다.
function matchesQuery(row, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = searchText(row);
  return words.every(word => text.includes(word));
}

function matchesFilters(row, filters = {}) {
  if (filters.collected && row.collectedAt !== filters.collected) return false;
  if (filters.institution && row.institution !== filters.institution) return false;
  if (filters.field && row.field !== filters.field) return false;
  if (filters.status && row.status !== filters.status) return false;
  if (filters.applicant === '미연결' && row.applicantIds.length) return false;
  if (filters.applicant && filters.applicant !== '미연결' && !row.applicantIds.includes(filters.applicant)) return false;
  if (filters.deadline === '진행중' && (row.deadline.closed || row.deadline.dday === null)) return false;
  if (filters.deadline === '마감' && !row.deadline.closed) return false;
  // 마감임박은 예전 이름(7일이내)도 그대로 받는다. 저장된 필터가 깨지지 않게 한다.
  if (['7일이내', '마감임박'].includes(filters.deadline) && row.deadline.stage !== '마감임박') return false;
  // 마감일을 확인하지 못한 공고만 따로 모아 본다.
  if (filters.deadline === '마감일 확인 필요' && row.deadline.stage !== '마감일 확인 필요') return false;
  return true;
}

function sortValue(row, key) {
  if (key === 'collectedAt') return row.collectedAt;
  if (key === 'deadline') return row.deadline.iso;
  if (key === 'institution') return row.institution;
  if (key === 'field') return row.field;
  return row.title;
}

export function archiveTableRows(notices = [], options = {}) {
  const { hidden = [], sortKey = 'collectedAt', sortDir = 'desc', page = 1, pageSize = 20, query = '', filters = {}, scope = 'all' } = options;
  const hiddenKeys = new Set(hidden);
  // 마감된 공고는 따로 본다. 지우지 않는다. 지난 공고의 서식과 조건은 다음 해에 다시 쓴다.
  const inScope = row => (scope === 'closed' ? row.deadline.closed : scope === 'open' ? !row.deadline.closed : true);
  // 관심 낱말만 보기. 낱말을 적어 두지 않았으면 걸러 내지 않는다.
  const { watch = [], watchOnly = false } = options;
  const inWatch = row => !watchOnly || !watch.length || watchHits(row, watch).length > 0;
  const all = notices.map(notice => archiveRow(notice, options)).filter(row => !hiddenKeys.has(row.key)).filter(inScope).filter(inWatch);
  const key = ARCHIVE_SORT_KEYS.includes(sortKey) ? sortKey : 'collectedAt';
  const direction = sortDir === 'asc' ? 1 : -1;
  const filtered = all.filter(row => matchesQuery(row, String(query).trim()) && matchesFilters(row, filters))
    .sort((left, right) => String(sortValue(left, key)).localeCompare(String(sortValue(right, key)), 'ko') * direction);
  const size = ARCHIVE_PAGE_SIZES.includes(Number(pageSize)) ? Number(pageSize) : 20;
  // 「전체」는 쪽을 나누지 않는다. 한 쪽에 전부 담고 쪽 번호도 1쪽으로 둔다.
  const showAll = size === 0;
  const pageCount = showAll ? 1 : Math.max(1, Math.ceil(filtered.length / size));
  const current = showAll ? 1 : Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = showAll ? 0 : (current - 1) * size;
  return {
    rows: showAll ? filtered : filtered.slice(start, start + size),
    total: all.length,
    matched: filtered.length,
    page: current,
    pageCount,
    pageSize: size,
    from: filtered.length ? start + 1 : 0,
    to: showAll ? filtered.length : Math.min(start + size, filtered.length),
    institutions: [...new Set(all.map(row => row.institution))].sort((a, b) => a.localeCompare(b, 'ko')),
    fields: [...new Set(all.map(row => row.field))].sort((a, b) => a.localeCompare(b, 'ko')),
    collectedDates: [...new Set(all.map(row => row.collectedAt).filter(Boolean))].sort().reverse()
  };
}
