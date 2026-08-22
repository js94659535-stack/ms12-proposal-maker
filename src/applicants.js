// 「신청기관 정보」 도메인 규칙. DOM에 의존하지 않으므로 브라우저와 node --test에서 동일하게 사용한다.
export const APPLICANT_STATUSES = ['확인됨', '확인 필요', '오래된 정보'];
// 기관자료가 어디서 왔는지. 값과 함께 남기고 출처만으로 확인 상태를 올리지 않는다.
export const ITEM_ORIGINS = ['고객 입력', '파일 추출', '운영자 수정', '기관 확인'];
export const CONFIRMED_STATUS = '확인됨';

export const APPLICANT_AREAS = [
  { key: 'basic', title: '기관 기본정보', hint: '기관명·설립연도·소재지·대표자·연락처' },
  { key: 'legal', title: '법적 유형·신청자격', hint: '법인 유형·고유번호·등록증·공모 신청자격 충족 여부' },
  { key: 'clients', title: '이용자·대상', hint: '이용 인원·연령대·이용 방식' },
  { key: 'staff', title: '수행인력', hint: '상근·비상근 인원, 자격증, 담당 역할' },
  { key: 'programs', title: '보유 프로그램·사업역량', hint: '프로그램명·대상·회기·운영 방식' },
  { key: 'performance', title: '주요 사업실적·성과', hint: '연도·사업명·규모·성과' },
  { key: 'facilities', title: '시설·운영자원', hint: '공간·장비·차량·운영 지역' },
  { key: 'partners', title: '협력기관', hint: '기관명·협약 여부·역할' },
  { key: 'budget', title: '예산 관련 기본정보', hint: '연간 예산 규모·자부담 가능액·회계 처리' },
  { key: 'measurement', title: '성과측정 경험', hint: '사용한 척도·측정 시기·평가 방식' },
  { key: 'references', title: '근거자료·출처', hint: '증빙 문서명·발급일·확인 위치' }
];

const AREA_KEYS = APPLICANT_AREAS.map(area => area.key);
const ELIGIBILITY_PATTERN = /(자격|법인|등록|인가|허가|신청 ?대상|결격|의무|증빙|서류)/;
const PROJECT_DECISION_PATTERN = /(회기|횟수|일정|기간|예산|사업비|목표|지표|인원|모집|배치|산출|성과)/;

export const ORGANIZATION_RULE = 'confirmedFacts에 있는 신청기관 정보만 확정된 기관 사실로 사용한다. needsVerification 항목은 값을 전달하지 않았으므로 사실처럼 쓰지 말고 필요하면 [확인 필요]로 표시한다. projectSpecificValues.thisProjectValue는 이번 사업에서만 사용하는 설계값이며 신청기관 원본(applicantOriginalValue)을 대체하거나 수정하지 않는다. pastProjectRecords는 지난 사업의 기록이므로 수행 실적과 역량의 근거로만 인용하고, 그 안의 인원·회기·기간·예산을 이번 사업의 값으로 옮겨 적지 않는다. otherPastProjects는 이번 공고와 관련이 적어 펼치지 않은 실적의 건수다. 건수만 인용할 수 있고 그 안의 사업명·기관명을 지어내지 않는다.';
export const NO_APPLICANT_RULE = '이번 사업의 신청기관이 선택되지 않았다. 기관 인력·실적·자격·예산·시설을 만들지 말고 필요한 위치에 [확인 필요]를 유지한다.';

function text(value, max) { return String(value ?? '').trim().slice(0, max); }
function uniqueId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  return `${prefix}-${random}`.slice(0, 80);
}
export function areaTitle(key) { return APPLICANT_AREAS.find(area => area.key === key)?.title || key; }

// 같은 항목 구조 안에서 「현재 기관 프로필」과 「사업·실적 이력」의 의미만 구분한다. 새 저장소를 만들지 않는다.
export const ITEM_SCOPES = ['profile', 'history'];
const HISTORY_AREAS = ['performance'];
// 특정 사업에 딸린 수치는 기관의 현재 상태가 아니라 그 사업의 이력이다.
const PROJECT_VALUE_PATTERN = /(총\s*사업비|사업비|예산\s*규모|지원\s*금액|참여\s*인원|모집\s*인원|대상\s*인원|회기|차시|사업\s*기간|수행\s*기간|투입\s*인력|참여\s*인력|성과\s*지표|성과\s*측정|만족도|출석률)/;
const PROJECT_SOURCE_PATTERN = /(사업계획서|신청서|배분신청|결과보고서|운영계획서|정산)/;

export function classifyItemScope(item) {
  if (ITEM_SCOPES.includes(item?.scope)) return item.scope;
  if (HISTORY_AREAS.includes(item?.area)) return 'history';
  const label = `${item?.label || ''} ${item?.value || ''}`;
  if (PROJECT_VALUE_PATTERN.test(label) && PROJECT_SOURCE_PATTERN.test(String(item?.source || ''))) return 'history';
  return 'profile';
}

// 이력 항목이 어느 사업의 기록인지. 라벨·근거·기준시점에서만 읽고 새로 만들지 않는다.
export function projectKeyOf(item) {
  const year = String(`${item?.asOf || ''} ${item?.label || ''} ${item?.value || ''}`.match(/(19|20)\d{2}/)?.[0] || '');
  const name = String(item?.value || item?.label || '').replace(/^\d{4}\s*년?\s*/, '').trim().slice(0, 60);
  return { year, name, key: `${year || '연도 확인 필요'}::${item?.source || ''}` };
}

export function makeApplicantItem(value = {}) {
  const base = {
    id: text(value.id, 80) || uniqueId('item'),
    area: AREA_KEYS.includes(value.area) ? value.area : 'basic',
    label: text(value.label, 120),
    value: text(value.value, 2000),
    status: APPLICANT_STATUSES.includes(value.status) ? value.status : '확인 필요',
    source: text(value.source, 300),
    // origin은 이 값이 어디서 왔는지다(고객 입력 / 파일 추출 / 운영자 수정 / 기관 확인).
    // 비어 있으면 「출처 미기록」이며 확인 상태를 자동으로 올리지 않는다.
    origin: ITEM_ORIGINS.includes(value.origin) ? value.origin : '',
    // asOf는 이 정보의 기준시점이다. 비어 있으면 기준시점 확인이 필요하다는 뜻이며 파일 업로드 날짜로 대신하지 않는다.
    asOf: text(value.asOf, 40),
    // 실적표의 「프로그램 내용」 칸. 값에는 기관·사업명만 넣고 내용은 여기 남긴다 —
    // 값을 길게 만들지 않으면서 「누구를 도왔는지」를 나중에 셀 수 있다.
    detail: text(value.detail, 300),
    history: (Array.isArray(value.history) ? value.history : []).slice(-20).map(entry => ({
      value: text(entry?.value, 2000), status: APPLICANT_STATUSES.includes(entry?.status) ? entry.status : '확인 필요',
      source: text(entry?.source, 300), origin: ITEM_ORIGINS.includes(entry?.origin) ? entry.origin : '', asOf: text(entry?.asOf, 40), recordedAt: text(entry?.recordedAt, 40)
    })),
    updatedAt: text(value.updatedAt, 40) || new Date().toISOString()
  };
  // 저장된 기존 항목도 다시 읽을 때 의미가 정해진다. 값은 삭제하지 않는다.
  return { ...base, scope: classifyItemScope({ ...base, scope: value.scope }) };
}

// 기관의 현재 상태와 사업별 기록을 나눠서 본다.
// 이력 항목을 사업 단위로 묶는다. 전체를 볼 때와 공고 관련만 볼 때가 같은 방식으로 묶여야 한다.
export function groupProjects(historyItems = []) {
  const projects = new Map();
  for (const item of historyItems) {
    const key = projectKeyOf(item);
    const bucket = projects.get(key.key) || { year: key.year, source: item.source, name: key.name, items: [] };
    bucket.items.push(item);
    if (!bucket.year && key.year) bucket.year = key.year;
    projects.set(key.key, bucket);
  }
  return [...projects.values()].sort((left, right) => String(right.year).localeCompare(String(left.year)));
}

export function splitApplicantProfile(applicant) {
  const items = (applicant?.items || []).map(item => ({ ...item, scope: classifyItemScope(item) }));
  const profile = items.filter(item => item.scope === 'profile');
  const historyItems = items.filter(item => item.scope === 'history');
  return { profile, history: historyItems, projects: groupProjects(historyItems) };
}

export const SOURCE_KINDS = ['홈페이지', '블로그', '기관소개서·브로슈어', '과거 사업계획서', '결과보고서', '기타 기관자료'];
// 기관자료 목록. 자료 자체를 확정 정보로 쓰지 않고 어디서 온 정보인지 남기기 위한 기록이다.
export function makeApplicantSource(value = {}) {
  return {
    id: text(value.id, 80) || uniqueId('source'),
    kind: SOURCE_KINDS.includes(value.kind) ? value.kind : SOURCE_KINDS[5],
    name: text(value.name, 200),
    url: /^https?:\/\//i.test(String(value.url || '')) ? text(value.url, 500) : '',
    asOf: text(value.asOf, 40),
    note: text(value.note, 300),
    addedAt: text(value.addedAt, 40) || new Date().toISOString(),
    // 보관한 서류 원본. 무엇을·언제·누가 받았는지는 파일을 지운 뒤에도 이 자료 줄에 남는다.
    file: value.file && text(value.file.key, 200) ? {
      key: text(value.file.key, 200),
      name: text(value.file.name, 200),
      size: Math.max(0, Number(value.file.size) || 0),
      type: text(value.file.type, 100),
      uploadedAt: text(value.file.uploadedAt, 40),
      uploadedBy: text(value.file.uploadedBy, 120)
    } : null
  };
}
export function normalizeApplicant(value = {}) {
  const now = new Date().toISOString();
  return {
    id: text(value.id, 80) || uniqueId('applicant'),
    name: text(value.name, 120) || '이름 없는 신청기관',
    note: text(value.note, 500),
    sources: (Array.isArray(value.sources) ? value.sources : []).slice(0, 40).map(makeApplicantSource),
    // 서류 보관에 동의한 시각. 처음 한 번만 묻고 그 뒤로는 묻지 않는다.
    filesConsentAt: text(value.filesConsentAt, 40),
    items: (Array.isArray(value.items) ? value.items : []).slice(0, 300).map(makeApplicantItem),
    createdAt: text(value.createdAt, 40) || now,
    updatedAt: text(value.updatedAt, 40) || now
  };
}

export function upsertApplicant(applicants, applicant) {
  const normalized = { ...normalizeApplicant(applicant), updatedAt: new Date().toISOString() };
  const list = Array.isArray(applicants) ? applicants : [];
  const index = list.findIndex(item => item.id === normalized.id);
  return index < 0 ? [...list, normalized] : list.map((item, position) => (position === index ? normalized : item));
}

// 같은 항목을 다시 저장할 때 줄을 하나 더 만들지 않는다.
// 값이 같으면 손대지 않아 이미 「확인됨」인 항목이 다시 「확인 필요」로 내려가지 않고,
// 값이 달라졌을 때만 이전 값을 이력에 남기고 바꾼다. 지우지 않는다.
export function mergeApplicantItems(existing = [], incoming = []) {
  const list = (Array.isArray(existing) ? existing : []).map(item => ({ ...item }));
  const index = new Map(list.map((item, position) => [`${item.area}:${item.label}`, position]));
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const key = `${item.area}:${item.label}`;
    const at = index.get(key);
    if (at === undefined) { index.set(key, list.length); list.push(item); continue; }
    const current = list[at];
    if (text(current.value, 2000) === text(item.value, 2000)) continue;
    list[at] = {
      ...current, value: item.value, status: item.status, source: item.source || current.source, origin: item.origin || current.origin,
      history: [...(current.history || []), { value: current.value, status: current.status, source: current.source, origin: current.origin, asOf: current.asOf, recordedAt: new Date().toISOString() }].slice(-20),
      updatedAt: new Date().toISOString()
    };
  }
  return list;
}

export function findApplicant(applicants, id) {
  return (Array.isArray(applicants) ? applicants : []).find(item => item.id === id) || null;
}

export function confirmedItems(applicant) {
  return (applicant?.items || []).filter(item => item.status === CONFIRMED_STATUS && item.value.trim());
}
export function unverifiedItems(applicant) {
  return (applicant?.items || []).filter(item => item.status !== CONFIRMED_STATUS);
}
export function applicantAreaSummary(applicant) {
  return APPLICANT_AREAS.map(area => {
    const items = (applicant?.items || []).filter(item => item.area === area.key);
    return { ...area, total: items.length, confirmed: items.filter(item => item.status === CONFIRMED_STATUS).length, needsCheck: items.filter(item => item.status !== CONFIRMED_STATUS).length };
  });
}

function itemYear(item) {
  const match = `${item?.asOf || ''} ${item?.label || ''}`.match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : 0;
}

// 사업실적은 연도가 늦은 것부터 보고, 나머지 영역은 등록 순서를 유지한다.
export function areaItems(applicant, areaKey) {
  const items = (applicant?.items || []).filter(item => item.area === areaKey);
  if (areaKey !== 'performance') return items;
  return [...items].sort((left, right) => itemYear(right) - itemYear(left));
}

// 어떤 문서에서 어떤 정보가 들어왔는지 출처별로 묶어 본다. source·asOf·history 구조를 그대로 사용한다.
export function itemsBySource(applicant) {
  const groups = new Map();
  for (const item of applicant?.items || []) {
    const source = item.source.trim() || '출처 미기록';
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push({ id: item.id, area: item.area, label: item.label, status: item.status, asOf: item.asOf || '', historyCount: (item.history || []).length });
  }
  return [...groups.entries()]
    .map(([source, items]) => ({ source, items, confirmed: items.filter(item => item.status === CONFIRMED_STATUS).length, outdated: items.filter(item => item.status !== CONFIRMED_STATUS).length }))
    .sort((left, right) => right.items.length - left.items.length);
}

// 이번 사업 전용 값. 신청기관 원본 항목은 읽기만 하고 절대 덮어쓰지 않는다.
export function normalizeProjectValues(values, applicant) {
  return (Array.isArray(values) ? values : []).slice(0, 60).map(value => {
    const source = (applicant?.items || []).find(item => item.id === value.applicantItemId) || null;
    return {
      id: text(value.id, 80) || uniqueId('project-value'),
      label: text(value.label, 120) || source?.label || '이번 사업 값',
      thisProjectValue: text(value.value ?? value.thisProjectValue, 500),
      applicantItemId: source?.id || '',
      applicantOriginalValue: source ? source.value : '기관 정보에 없음',
      appliesToThisProposalOnly: true
    };
  });
}

// requirements를 주면 공고와 낱말이 겹치는 실적만 펼친다. 나머지는 건수만 알린다.
//
// 왜. 실제 기관 연혁 한 건이 실적 96건이 되면서 호출마다 기관 자료가 508자에서 9,953자로 늘었다.
// 계획서는 묶음마다 다시 부르므로 그만큼 매번 실린다. 실적을 버리는 것이 아니라, 이번 공고와
// 상관없는 것을 펼치지 않고 「그 외 몇 건」으로만 알린다. 겹침 판정은 비교 화면과 같은 규칙이다.
// 한 영역의 「확인 필요·오래된 정보」를 한 번에 확인됨으로 올린다.
//
// 왜 필요한가. 연혁 한 건에서 실적 99건이 들어오는데 상태는 항목마다 골라야 해서 99번을 눌러야 했다.
// 그때까지 그 값들은 계획서로 전달되지 않는다 — 비용만 들고 값어치는 0인 상태로 남는다.
//
// 위험한 쪽이 맞다. 확인됨은 「기관이 사실이라고 보증한다」는 뜻이고, 그 순간부터 AI가 그대로 쓴다.
// 그래서 무엇이 바뀌었는지 돌려주어 한 번에 되돌릴 수 있게 한다. 화면은 누르기 전에 무엇을
// 보증하는 것인지 밝힌다.
export function confirmAreaItems(applicant, areaKey) {
  const base = normalizeApplicant(applicant);
  const now = new Date().toISOString();
  const changed = [];
  const items = base.items.map(item => {
    if (item.area !== areaKey || item.status === CONFIRMED_STATUS) return item;
    changed.push({ id: item.id, status: item.status });
    return { ...item, status: CONFIRMED_STATUS, updatedAt: now };
  });
  return { applicant: changed.length ? { ...base, items, updatedAt: now } : base, changed };
}

// 방금 올린 것만 되돌린다. 그 사이에 사람이 손대 다른 상태가 된 항목은 건드리지 않는다.
export function restoreItemStatuses(applicant, changed = []) {
  const base = normalizeApplicant(applicant);
  const previous = new Map((Array.isArray(changed) ? changed : []).map(entry => [entry.id, entry.status]));
  const now = new Date().toISOString();
  let restored = 0;
  const items = base.items.map(item => {
    if (!previous.has(item.id) || item.status !== CONFIRMED_STATUS) return item;
    restored += 1;
    return { ...item, status: previous.get(item.id), updatedAt: now };
  });
  return { applicant: restored ? { ...base, items, updatedAt: now } : base, restored };
}

export function buildApplicantOrganization(applicant, projectValues = [], { requirements = [], noticeTitle = '' } = {}) {
  if (!applicant) return { applicantId: '', organization: '신청기관 미선택', confirmedFacts: [], needsVerification: [], projectSpecificValues: [], rule: NO_APPLICANT_RULE };
  const snapshot = structuredClone(applicant);
  const split = splitApplicantProfile(snapshot);
  const isProfile = item => split.profile.some(entry => entry.id === item.id);
  // 공고명은 가장 강한 단서다. 요구사항과 함께 고르는 근거로 쓴다.
  const criteria = [String(noticeTitle || '').trim(), ...requirements].filter(Boolean);
  // 고르는 것은 실적이 많을 때만이다. 상한보다 적으면 이미 작아서 줄일 이유가 없고,
  // 몇 건 없는 기관에서 골라 내면 있는 실적마저 안 보이게 된다.
  const selecting = criteria.length > 0 && split.history.length > RELATED_LIMIT;
  // 공고 정보가 아직 없으면(분석 전) 예전처럼 전부 싣는다. 임의로 줄이지 않는다.
  const related = selecting ? relatedItems(split.history, criteria) : split.history;
  const shownProjects = selecting ? groupProjects(related) : split.projects;
  const omitted = split.history.filter(item => !related.some(entry => entry.id === item.id));
  const omittedYears = [...new Set(omitted.map(item => String(item.asOf || '').match(/(19|20)\d{2}/)?.[0] || '연도 확인 필요'))].sort();
  return {
    applicantId: snapshot.id,
    organization: snapshot.name,
    // 확정 사실로 쓸 수 있는 것은 기관의 현재 프로필뿐이다.
    confirmedFacts: confirmedItems(snapshot).filter(isProfile).map(item => ({ id: item.id, category: areaTitle(item.area), title: item.label, content: item.value, source: item.source, asOf: item.asOf || '', status: CONFIRMED_STATUS, confirmedByUser: true })),
    needsVerification: unverifiedItems(snapshot).filter(isProfile).map(item => ({ id: item.id, category: areaTitle(item.area), title: item.label, status: item.status })),
    // 지난 사업 기록은 실적·근거로만 제안하고 이번 사업 값으로 옮기지 않는다.
    pastProjectRecords: shownProjects.map(project => ({
      year: project.year || '연도 확인 필요',
      source: project.source,
      records: project.items.map(item => ({ category: areaTitle(item.area), title: item.label, content: item.status === CONFIRMED_STATUS ? item.value : '', status: item.status, asOf: item.asOf || '' }))
    })),
    // 펼치지 않은 실적. 없다고 말하지 않고 몇 건이 더 있는지 밝힌다.
    otherPastProjects: omitted.length
      ? { count: omitted.length, years: omittedYears, note: '이번 공고 요구와 낱말이 겹치지 않아 건수만 알린다. 없는 실적이 아니라 펼치지 않은 실적이다.' }
      : null,
    projectSpecificValues: normalizeProjectValues(projectValues, snapshot),
    rule: ORGANIZATION_RULE
  };
}

function tokens(value) {
  return [...new Set(String(value || '').replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/).filter(token => token.length > 1))];
}
// 낱말이 하나라도 겹치면 연결하던 것을 그만둔다.
//
// 실제로 났던 일: 「진행상황에 따라 사업 시작 시점 등 기간이 조정될 수 있다」에 실적 99건이
// 통째로 붙었다. 항목명이 「2017년 사업실적」이라 「사업」 한 낱말로 전부 걸렸고,
// 「신청기간은 2026년 7월 1일부터…」에는 2026년 실적 30건이 붙었다. 조항과 아무 상관이 없다.
//
// 그래서 계획서에 실을 실적을 고를 때 쓰는 규칙(relatedItems)을 여기서도 그대로 쓴다 —
// 항목 셋 중 하나를 넘게 가리키는 낱말은 근거가 못 되고, 드문 낱말은 하나로 충분하며
// 어중간하면 둘 이상 겹쳐야 한다. 판정을 두 곳에서 따로 만들면 또 어긋난다.
function matchItems(text_, items) {
  return relatedItems(items, [text_], { limit: 0 });
}

// 공고 요구사항과 신청기관 정보를 비교해 네 갈래로 구분한다.
// 공고가 이미 값을 정해 둔 요구사항인지. 정했으면 기관이 등록할 것이 아니다.
//
// 예전에는 「기관정보에 없음」이 「알 수 없으면 여기」인 쓰레기통이라, 공고 마감일·예산 한도가
// 거기로 가고 안내가 「등록하거나 담당자에게 확인한다」고 했다. 따르면 공고 값이 기관정보에
// 박히고 다음 계획서에 「확인된 기관 사실」로 재사용된다.
//
// 낱말 목록을 늘려 잡지 않는다. 그것도 또 다른 쓰레기통이 된다.
// 판정 근거는 공고 실행계약서(noticeContract)가 실제로 뽑아 둔 규칙뿐이다.
//
// EXACT·MIN·MAX만 본다. CHOICE는 공고가 선택지만 주고 고르는 것은 이번 사업이며,
// REQUIRED는 공고가 요구한 수행모델이라 기관이 설계로 답할 것이다.
const CONTRACT_FIXED_TYPES = ['EXACT', 'MIN', 'MAX'];
const CONTRACT_SOURCE = /(NOTICE_CONTRACT|공고 실행계약)/;
// 출처가 공고면 그 문장은 기관이 등록할 자료가 아니다. 실행계약서도 공고에서 나온 것이다.
const NOTICE_SOURCE = /(공고|OFFICIAL_NOTICE_TEXT|NOTICE_CONTRACT)/;

// 규칙이 이미 가진 appliesTo 로 어느 항목을 말하는지 알아본다. 제목 일치만으로는
// 「신청기간」·「사업수행기간」이 「사업기간」 규칙을 가리키는 것을 놓친다.
// 낱말 목록이 아니라 appliesTo 값마다 이름 하나다. 여기 없는 키를 더해도 아무 일도 하지 않는다.
// appliesTo 값은 notice-contract.js 가 정한다 — 시험이 두 파일의 키가 같은지 지킨다.
export const APPLIES_TO_WORD = Object.freeze({
  period: '기간', budget: '예산', headcount: '인원', sessions: '회기',
  outcomeGoals: '성과', programs: '프로그램', applicationType: '신청유형'
});

// 문장이 무엇을 하는 말인지는 어미가 말한다. 세 형태만 본다.
// 늘리기 시작하면 또 다른 쓰레기통이 된다 — 걸리지 않으면 갈래를 바꾸지 않고 그대로 둔다.
const STATEMENT_FORMS = [
  { form: '결정', pattern: /(선택한다|정한다)\.?$/ },
  { form: '요구', pattern: /(해야 한다|하여야 한다)\.?$/ },
  { form: '사실', pattern: /(이다|까지다|된다)\.?$/ }
];
export function statementForm(sentence) {
  const value = String(sentence ?? '').replace(/\s+/g, ' ').trim();
  for (const entry of STATEMENT_FORMS) if (entry.pattern.test(value)) return entry.form;
  return '';
}

export function contractFixedRule(requirement, contract) {
  const rules = (contract?.rules || []).filter(rule => CONTRACT_FIXED_TYPES.includes(rule?.ruleType));
  if (!rules.length) return null;
  const label = text(requirement?.requirement);
  const where = text(requirement?.location);
  // 출처가 실행계약서면 그 자체로 공고가 정한 값이다.
  const fromContract = CONTRACT_SOURCE.test(where);
  const matched = rules.find(rule => {
    const title = text(rule?.title);
    const value = text(rule?.value);
    if (title.length >= 2 && label.includes(title)) return true;
    // 공고가 정한 값이 문장에 그대로 적혀 있으면 그 값을 가리키는 것이다.
    if (value.length >= 4 && label.includes(value)) return true;
    // 제목이 달라도 같은 항목을 말하면 알아본다. 「신청기간」→기간→period.
    const word = APPLIES_TO_WORD[text(rule?.appliesTo)];
    return Boolean(word) && label.includes(word);
  });
  if (matched) return matched;
  // 출처만 실행계약서인 경우. 공고가 정한 조건인 것은 맞지만 어느 규칙인지는 모른다.
  // 아무 규칙이나 붙이면 「신청 마감」에 「사업기간」 값이 달리는 사고가 난다.
  return fromContract ? { id: '', title: '', value: '', unit: '', ruleType: '', fromSourceOnly: true } : null;
}

// 이 공고가 기관 둘 이상을 요구하는가.
//
// 기관이 하나뿐인 사람에게 「기관 추가」·「선택」·「삭제」는 쓸 일이 없어 감춘다. 다만 공고가
// 컨소시엄을 요구하면 그때는 반드시 필요하므로 감추지 않는다. 판정은 공고 요구 문장과
// 실행계약서 규칙에서만 읽는다 — 없는 조건을 만들지 않는다.
const CONSORTIUM_WORD = /컨소시엄|공동\s*(?:수행|신청|운영|사업)|협업\s*기관/;
const CONSORTIUM_MUST = /필수|해야\s*한다|하여야|구성한다|이상/;
const MULTI_ORG = /\d+\s*개\s*이상\s*(?:의\s*)?기관|둘\s*이상\s*(?:의\s*)?기관|기관\s*\d+\s*곳\s*이상/;
export function requiresConsortium(requirements = [], contract = null) {
  const texts = [
    ...(Array.isArray(requirements) ? requirements : []).map(item => `${item?.requirement ?? item ?? ''} ${item?.category ?? ''}`),
    ...((contract?.rules || []).map(rule => `${rule?.title ?? ''} ${rule?.value ?? ''} ${rule?.unit ?? ''}`))
  ].map(value => String(value).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const hit = texts.find(text => MULTI_ORG.test(text) || (CONSORTIUM_WORD.test(text) && CONSORTIUM_MUST.test(text)));
  return hit ? { required: true, evidence: hit.slice(0, 120) } : { required: false, evidence: '' };
}

// 공고 요구와 낱말이 겹치는 항목만 고른다. 겹침 판정은 비교 화면과 같은 낱말 나누기를 쓴다.
// 버리는 것이 아니라 펼치지 않는 것이다 — 나머지는 건수를 세어 함께 보낸다.
//
// 그냥 「낱말 하나라도 겹치면」으로 하면 아무것도 걸러지지 않는다. 실제 공고문으로 재 보니
// 실적 99건이 99건 그대로 남았다. 공고 요구 문장에는 「사업」·「프로그램」·「지원」처럼
// 실적 대부분에 들어 있는 낱말이 늘 섞여 있기 때문이다.
// 그래서 실적 셋 중 하나를 넘게 가리키는 낱말은 고르는 근거에서 뺀다. 그 낱말로는 가려낼 수 없다.
const GENERIC_RATIO = 0.3;
// 그래도 「상담」·「교육」처럼 어중간하게 흔한 낱말 하나로는 관계를 말할 수 없다.
// 실적 열 건에 하나꼴로만 나오는 드문 낱말은 그 하나로 충분하고(2점),
// 그보다 흔하면 두 낱말 이상 겹쳐야 관련으로 본다(1점씩, 2점부터 펼침).
const RARE_RATIO = 0.1;
const RELATED_SCORE = 2;
// 한 번에 펼칠 실적의 최대 건수. 공고와 다 겹쳐도 호출 자료가 무한정 커지지 않게 한다.
export const RELATED_LIMIT = 30;
export function relatedMatches(items = [], requirements = [], { limit = RELATED_LIMIT } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  // 실적은 항목명이 「2017년 사업실적」이라 아무것도 가려내지 못한다. 값과 내용만 본다.
  // 나머지 항목은 항목명이 뜻을 가지므로(기관명·상근 인력) 함께 본다.
  const haystacks = new Map(list.map(item => [item.id, item.area === 'performance'
    ? `${item.value} ${item.detail || ''}`
    : `${item.label} ${item.value} ${item.detail || ''} ${areaTitle(item.area)}`]));
  const scores = new Map();
  const words = new Map();
  const used = new Set();
  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    const label = typeof requirement === 'string' ? requirement : `${requirement?.requirement || ''} ${requirement?.category || ''}`;
    for (const token of tokens(label)) {
      if (used.has(token)) continue;
      used.add(token);
      const hits = list.filter(item => haystacks.get(item.id).includes(token));
      // 한두 항목만 가리키는 낱말은 흔한 낱말이 아니다. 항목이 서너 개뿐인 기관에서 비율만 보면
      // 「상근」 한 낱말이 33%가 되어 흔한 낱말로 걸러진다.
      if (!hits.length || hits.length > Math.max(2, list.length * GENERIC_RATIO)) continue;
      // 항목이 몇 개뿐인 기관에서는 비율이 뜻을 잃는다. 한 항목만 가리키는 낱말은 언제나 드문 낱말이다.
      const weight = hits.length <= Math.max(1, list.length * RARE_RATIO) ? RELATED_SCORE : 1;
      for (const item of hits) {
        scores.set(item.id, (scores.get(item.id) || 0) + weight);
        words.set(item.id, [...(words.get(item.id) || []), token]);
      }
    }
  }
  // 겹치는 낱말이 많은 것부터, 같으면 최근 것부터 펼친다.
  const ranked = list.filter(item => (scores.get(item.id) || 0) >= RELATED_SCORE)
    .sort((left, right) => (scores.get(right.id) - scores.get(left.id)) || String(right.asOf || '').localeCompare(String(left.asOf || '')));
  const chosen = limit > 0 ? ranked.slice(0, limit) : ranked;
  // 무엇 때문에 걸렸는지 함께 돌려준다. 「예방」 하나로 걸린 것을 분야가 맞는 실적으로 읽지 않게 한다.
  return chosen.map(item => ({ item, words: [...new Set(words.get(item.id) || [])], score: scores.get(item.id) || 0 }));
}

export function relatedItems(items = [], requirements = [], options = {}) {
  return relatedMatches(items, requirements, options).map(entry => entry.item);
}

export function compareNoticeWithApplicant(requirements, applicant, contract = null) {
  const items = applicant?.items || [];
  const result = { applicantId: applicant?.id || '', applicantName: applicant?.name || '', confirmedStrengths: [], needsEvidence: [], missingFromApplicant: [], fixedByNotice: [], decideInThisProject: [], answerInProposal: [] };
  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    const label = String(requirement?.requirement || '');
    const matched = matchItems(`${label} ${requirement?.category || ''}`, items);
    const confirmed = matched.filter(item => item.status === CONFIRMED_STATUS);
    const eligibility = ELIGIBILITY_PATTERN.test(`${label} ${requirement?.category || ''}`);
    const entry = {
      requirementId: requirement?.id || '',
      requirement: label,
      location: requirement?.location || '',
      mandatory: Boolean(requirement?.mandatory),
      matchedItems: matched.map(item => ({ id: item.id, label: item.label, status: item.status, area: areaTitle(item.area), source: item.source }))
    };
    // 갈래는 출처와 어미가 정한다. 실행계약서가 규칙을 뽑아냈는지에 매달리지 않는다 —
    // 계약서가 비어 있어도 공고 원문에 적힌 사실은 여전히 공고가 정한 조건이다.
    const form = statementForm(label);
    const fromNotice = NOTICE_SOURCE.test(String(requirement?.location || ''));
    // 「~해야 한다」는 공고가 값을 준 것이 아니라 기관이 채우라고 요구한 것이다.
    // 이것을 공고 조건으로 옮기면 기관이 답할 일이 화면에서 사라진다.
    if (form !== '요구') {
      // 어느 규칙인지 알면 값까지 붙이고, 몰라도 갈래는 준다.
      const fixed = contractFixedRule(requirement, contract);
      if (fixed || (form === '사실' && fromNotice)) {
        result.fixedByNotice.push({
          ...entry,
          noticeValue: fixed && !fixed.fromSourceOnly ? `${text(fixed.title)}: ${text(fixed.value)}${text(fixed.unit)}`.trim() : '',
          action: '공고가 정한 조건입니다. 기관정보에 등록하지 말고 그대로 지키세요.'
        });
        continue;
      }
    }
    if (confirmed.length && !(eligibility && confirmed.every(item => !item.source))) {
      result.confirmedStrengths.push({ ...entry, action: '확인된 기관 정보를 근거로 사용한다.' });
      continue;
    }
    if (matched.length) {
      result.needsEvidence.push({ ...entry, action: eligibility ? '신청자격 근거자료를 확인한 뒤 확인됨으로 변경한다.' : '오래되었거나 확인되지 않은 정보이므로 증빙 확인이 필요하다.' });
      continue;
    }
    // 「~선택한다」·「~정한다」는 공고가 고르라고 남겨 둔 것이다. 이번 사업이 정한다.
    if (form === '결정' || PROJECT_DECISION_PATTERN.test(label)) {
      result.decideInThisProject.push({ ...entry, action: '기관 원본이 아니라 이번 사업 설계에서 새로 결정한다.' });
      continue;
    }
    // 「~해야 한다」는 기관 프로필에 적어 둘 값이 아니라 이번 계획서 본문에서 답할 일이다.
    //
    // 실제로 났던 일: 「금융취약군을 선제적으로 발굴해야 한다」·「생활안정 지원을 수행해야 한다」가
    // 「기관정보에 없는 사항 · 등록하거나 담당자에게 확인한다」로 떨어졌다. 등록할 수 있는 값이
    // 하나도 아니다. 마지막 칸이 쓰레기통이어서 갈 곳 없는 요구가 전부 거기로 모였다.
    //
    // 기관정보로 남기는 것은 「기관이 갖추고 있어야 하는 것」뿐이다 — 자격·법인·등록·인가·허가·
    // 신청대상·결격·증빙·서류. 그 판정은 이미 있는 ELIGIBILITY_PATTERN이 한다. 낱말을 늘리지 않는다.
    if (form === '요구' && !eligibility) {
      result.answerInProposal.push({ ...entry, action: '기관정보가 아니라 계획서 본문에서 답할 내용입니다.' });
      continue;
    }
    result.missingFromApplicant.push({ ...entry, action: '신청기관 정보에 없는 항목이므로 등록하거나 담당자에게 확인한다.' });
  }
  return result;
}

// missingInformation 질문 중 신청기관의 확인된 정보로 이미 답할 수 있는 질문은 다시 묻지 않는다.
export function planApplicantQuestions(questions, applicant) {
  const confirmed = confirmedItems(applicant);
  const plan = { ask: [], resolved: [] };
  for (const question of Array.isArray(questions) ? questions : []) {
    const label = String(question || '');
    const matched = matchItems(label, confirmed);
    if (matched.length) plan.resolved.push({ question: label, answer: matched.map(item => `${item.label}: ${item.value}`).join(' / '), items: matched.map(item => ({ id: item.id, label: item.label })) });
    else plan.ask.push(label);
  }
  return plan;
}

// 향후 기존 사업계획서·기관소개서·결과보고서에서 만든 후보를 등록하기 위한 확장 지점.
// 후보는 항상 '확인 필요'로만 들어가고 기존 확정 항목을 덮어쓰지 않는다.
export function addCandidateItems(applicant, candidates) {
  const base = normalizeApplicant(applicant);
  const existing = new Set(base.items.map(item => `${item.area}:${item.label}`));
  const additions = (Array.isArray(candidates) ? candidates : [])
    .map(candidate => makeApplicantItem({ ...candidate, status: '확인 필요' }))
    .filter(item => item.label && !existing.has(`${item.area}:${item.label}`));
  return { ...base, items: [...base.items, ...additions], updatedAt: new Date().toISOString() };
}

const LEGACY_AREA_BY_CATEGORY = { 인력: 'staff', 실적: 'performance', 예산: 'budget', 프로그램: 'programs', 지역: 'facilities', 운영조건: 'basic', '사용자 확정': 'basic' };

// 이전 버전의 확정 회사 정보(companyFacts)를 신청기관 한 곳으로 옮긴다.
export function migrateCompanyFactsToApplicant(companyFacts, name = '내 기관') {
  const items = (Array.isArray(companyFacts) ? companyFacts : [])
    .filter(fact => fact?.confirmedByUser === true && String(fact.content || '').trim())
    .map(fact => makeApplicantItem({ id: fact.id, area: LEGACY_AREA_BY_CATEGORY[fact.category] || 'basic', label: fact.title || '확정 정보', value: fact.content, status: CONFIRMED_STATUS, source: '이전 버전에서 담당자가 확정한 정보', updatedAt: fact.confirmedAt }));
  return normalizeApplicant({ name, note: '이전 버전의 확정 회사 정보에서 옮겨온 신청기관입니다.', items });
}
