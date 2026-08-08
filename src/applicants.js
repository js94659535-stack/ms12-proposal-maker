// 「신청기관 정보」 도메인 규칙. DOM에 의존하지 않으므로 브라우저와 node --test에서 동일하게 사용한다.
export const APPLICANT_STATUSES = ['확인됨', '확인 필요', '오래된 정보'];
export const CONFIRMED_STATUS = '확인됨';

export const APPLICANT_AREAS = [
  { key: 'basic', title: '기관 기본정보', hint: '기관명·설립연도·소재지·대표자·연락처' },
  { key: 'legal', title: '법적 유형·신청자격', hint: '법인 유형·고유번호·등록증·공모 신청자격 충족 여부' },
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

export const ORGANIZATION_RULE = 'confirmedFacts에 있는 신청기관 정보만 확정된 기관 사실로 사용한다. needsVerification 항목은 값을 전달하지 않았으므로 사실처럼 쓰지 말고 필요하면 [확인 필요]로 표시한다. projectSpecificValues.thisProjectValue는 이번 사업에서만 사용하는 설계값이며 신청기관 원본(applicantOriginalValue)을 대체하거나 수정하지 않는다. pastProjectRecords는 지난 사업의 기록이므로 수행 실적과 역량의 근거로만 인용하고, 그 안의 인원·회기·기간·예산을 이번 사업의 값으로 옮겨 적지 않는다.';
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
    // asOf는 이 정보의 기준시점이다. 비어 있으면 기준시점 확인이 필요하다는 뜻이며 파일 업로드 날짜로 대신하지 않는다.
    asOf: text(value.asOf, 40),
    history: (Array.isArray(value.history) ? value.history : []).slice(-20).map(entry => ({
      value: text(entry?.value, 2000), status: APPLICANT_STATUSES.includes(entry?.status) ? entry.status : '확인 필요',
      source: text(entry?.source, 300), asOf: text(entry?.asOf, 40), recordedAt: text(entry?.recordedAt, 40)
    })),
    updatedAt: text(value.updatedAt, 40) || new Date().toISOString()
  };
  // 저장된 기존 항목도 다시 읽을 때 의미가 정해진다. 값은 삭제하지 않는다.
  return { ...base, scope: classifyItemScope({ ...base, scope: value.scope }) };
}

// 기관의 현재 상태와 사업별 기록을 나눠서 본다.
export function splitApplicantProfile(applicant) {
  const items = (applicant?.items || []).map(item => ({ ...item, scope: classifyItemScope(item) }));
  const profile = items.filter(item => item.scope === 'profile');
  const historyItems = items.filter(item => item.scope === 'history');
  const projects = new Map();
  for (const item of historyItems) {
    const key = projectKeyOf(item);
    const bucket = projects.get(key.key) || { year: key.year, source: item.source, name: key.name, items: [] };
    bucket.items.push(item);
    if (!bucket.year && key.year) bucket.year = key.year;
    projects.set(key.key, bucket);
  }
  return {
    profile,
    history: historyItems,
    projects: [...projects.values()].sort((left, right) => String(right.year).localeCompare(String(left.year)))
  };
}

export function normalizeApplicant(value = {}) {
  const now = new Date().toISOString();
  return {
    id: text(value.id, 80) || uniqueId('applicant'),
    name: text(value.name, 120) || '이름 없는 신청기관',
    note: text(value.note, 500),
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

export function buildApplicantOrganization(applicant, projectValues = []) {
  if (!applicant) return { applicantId: '', organization: '신청기관 미선택', confirmedFacts: [], needsVerification: [], projectSpecificValues: [], rule: NO_APPLICANT_RULE };
  const snapshot = structuredClone(applicant);
  const split = splitApplicantProfile(snapshot);
  const isProfile = item => split.profile.some(entry => entry.id === item.id);
  return {
    applicantId: snapshot.id,
    organization: snapshot.name,
    // 확정 사실로 쓸 수 있는 것은 기관의 현재 프로필뿐이다.
    confirmedFacts: confirmedItems(snapshot).filter(isProfile).map(item => ({ id: item.id, category: areaTitle(item.area), title: item.label, content: item.value, source: item.source, asOf: item.asOf || '', status: CONFIRMED_STATUS, confirmedByUser: true })),
    needsVerification: unverifiedItems(snapshot).filter(isProfile).map(item => ({ id: item.id, category: areaTitle(item.area), title: item.label, status: item.status })),
    // 지난 사업 기록은 실적·근거로만 제안하고 이번 사업 값으로 옮기지 않는다.
    pastProjectRecords: split.projects.map(project => ({
      year: project.year || '연도 확인 필요',
      source: project.source,
      records: project.items.map(item => ({ category: areaTitle(item.area), title: item.label, content: item.status === CONFIRMED_STATUS ? item.value : '', status: item.status, asOf: item.asOf || '' }))
    })),
    projectSpecificValues: normalizeProjectValues(projectValues, snapshot),
    rule: ORGANIZATION_RULE
  };
}

function tokens(value) {
  return [...new Set(String(value || '').replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/).filter(token => token.length > 1))];
}
function matchItems(text_, items) {
  const keys = tokens(text_);
  return items.filter(item => {
    const haystack = `${item.label} ${item.value} ${areaTitle(item.area)}`;
    return keys.some(token => haystack.includes(token));
  });
}

// 공고 요구사항과 신청기관 정보를 비교해 네 갈래로 구분한다.
export function compareNoticeWithApplicant(requirements, applicant) {
  const items = applicant?.items || [];
  const result = { applicantId: applicant?.id || '', applicantName: applicant?.name || '', confirmedStrengths: [], needsEvidence: [], missingFromApplicant: [], decideInThisProject: [] };
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
    if (confirmed.length && !(eligibility && confirmed.every(item => !item.source))) {
      result.confirmedStrengths.push({ ...entry, action: '확인된 기관 정보를 근거로 사용한다.' });
      continue;
    }
    if (matched.length) {
      result.needsEvidence.push({ ...entry, action: eligibility ? '신청자격 근거자료를 확인한 뒤 확인됨으로 변경한다.' : '오래되었거나 확인되지 않은 정보이므로 증빙 확인이 필요하다.' });
      continue;
    }
    if (PROJECT_DECISION_PATTERN.test(label)) {
      result.decideInThisProject.push({ ...entry, action: '기관 원본이 아니라 이번 사업 설계에서 새로 결정한다.' });
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
export function migrateCompanyFactsToApplicant(companyFacts, name = '마인드스토리') {
  const items = (Array.isArray(companyFacts) ? companyFacts : [])
    .filter(fact => fact?.confirmedByUser === true && String(fact.content || '').trim())
    .map(fact => makeApplicantItem({ id: fact.id, area: LEGACY_AREA_BY_CATEGORY[fact.category] || 'basic', label: fact.title || '확정 정보', value: fact.content, status: CONFIRMED_STATUS, source: '이전 버전에서 담당자가 확정한 정보', updatedAt: fact.confirmedAt }));
  return normalizeApplicant({ name, note: '이전 버전의 확정 회사 정보에서 옮겨온 신청기관입니다.', items });
}
