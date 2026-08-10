// 「공고 실행계약서」 — 공고가 이미 정한 조건을 문장 요약이 아니라 독립된 규칙으로 저장한다.
// 규칙 기반 로컬 처리만 하고 외부 API를 호출하지 않는다. 공고 원문에 없는 조건은 만들지 않는다.
// 모든 규칙은 공고 원문 문장(evidence)과 어느 자료의 어디였는지(location)를 함께 들고 다닌다.
import { noticeSources } from './notice-logic.js';
import { detectApplicationTypes } from './project-blueprint.js';
import { designSentencesUsing } from './blueprint-draft-check.js';

export const CONTRACT_RULE_TYPES = ['EXACT', 'MIN', 'MAX', 'CHOICE', 'REQUIRED', 'ELIGIBILITY', 'FORMAT', 'EVALUATION'];
export const CONTRACT_SEVERITIES = ['BLOCKING', 'REQUIRED', 'ADVISORY'];
export const CONTRACT_STATES = ['충족', '미확정', '불일치'];
export const SUBMISSION_STATES = ['제출 가능', '보완 필요', '제출 차단'];

// 공고가 정한 값은 사용자 결정 대상이 아니다. 이 목록의 항목은 화면에서 잠근다.
export const OFFICIAL_LOCKED = 'OFFICIAL_LOCKED';
export const USER_DECIDES = 'USER_DECIDES';

const clean = (value, max = 400) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const number = value => Number(String(value).replace(/[,\s]/g, ''));

// 공고 원문을 줄 단위로 본다. 한글 공고문은 표·글머리표 때문에 문장 부호로 끊기지 않으므로
// 줄바꿈과 글머리표(○ ● ▸ ※ - ①)를 함께 경계로 쓴다. noticeSources는 줄바꿈을 지워 여기서는 원문을 직접 읽는다.
const NOTICE_PARTS = [
  ['공고 개요', value => value.overview || value.detailText],
  ['신청 대상', value => value.eligibility],
  ['지원 내용', value => value.supportDetails],
  ['지원 한도', value => value.supportLimit],
  ['사업 기간', value => value.performancePeriod],
  ['첨부한 요강·평가기준', value => value.criteriaText],
  ['공고 제목', value => value.title]
];
// 「2027. 1. ~ 2027. 12.」처럼 숫자 뒤의 마침표는 문장 끝이 아니다. 숫자 뒤에서는 자르지 않는다.
const BULLET_SPLIT = /\n+|(?=[○●▶▸□■※])|(?<=[^\d\s][.!?。])\s+/;
function noticeLines(notice, structure) {
  if (notice) {
    return NOTICE_PARTS.flatMap(([label, pick]) => String(pick(notice) || '')
      .split(BULLET_SPLIT)
      .map(line => clean(line, 400))
      .filter(line => line.length > 1)
      .map(line => ({ source: label, line })));
  }
  return (structure?.fields || []).flatMap(field => (field.evidence || []).map(entry => ({ source: entry.source, line: clean(entry.sentence, 400) })));
}
// 「70명 이상」처럼 값만 따로 줄바꿈된 공고가 많다. 바로 앞 세 줄까지 붙여 무엇에 대한 기준인지 읽는다.
function withContext(entries) {
  return entries.map((entry, index) => ({ ...entry, context: entries.slice(Math.max(0, index - 3), index + 1).map(item => item.line).join(' ') }));
}

let ruleSeq = 0;
function rule(values) {
  ruleSeq += 1;
  return { id: `contract-${ruleSeq}`, unit: '', appliesTo: '', ...values };
}

// ---------- 기간 ----------
// 「2027. 1. ~ 2027. 12.」 「2027년 1월~12월」 「2027년 1월부터 12월까지」 「2026년 10월 1일 ~ 2027년 8월 31일」을
// 모두 같은 기간으로 읽는다. 끝 연도를 생략한 표기는 시작 연도를 물려받는다. 특정 연도를 코드에 적지 않는다.
const PERIOD_RANGE = /(20\d\d)\s*[.년]\s*(\d{1,2})\s*[.월]?(?:\s*\d{1,2}\s*[.일]?)?\s*(?:부터\s*)?[~\-–—∼]?\s*(?:부터|까지)?\s*(?:[~\-–—∼]\s*)?(?:(20\d\d)\s*[.년]\s*)?(\d{1,2})\s*[.월](?:\s*\d{1,2}\s*[.일]?)?\s*(?:까지)?/g;
function periodFrom(match) {
  return `${match[1]}.${Number(match[2])}~${match[3] || match[1]}.${Number(match[4])}`;
}
// 본문 어디에나 있을 수 있으므로 모든 기간 표기를 모은다. 첫 표기 하나로 단정하지 않는다.
export function allPeriods(value) {
  const text = String(value || '').replace(/\s+/g, ' ');
  PERIOD_RANGE.lastIndex = 0;
  return [...new Set([...text.matchAll(PERIOD_RANGE)].map(periodFrom))];
}
export function normalizePeriod(value) {
  return allPeriods(value)[0] || '';
}

// ---------- 수치 기준 ----------
const MIN_PATTERN = /(\d[\d,]*)\s*(명|회기|회|시간|개월|개소|%|퍼센트)\s*이상/g;
const MAX_PATTERN = /(\d[\d,]*)\s*(원|명|회기|회|시간|개월|개소|%|퍼센트)\s*(?:이내|이하|미만)/g;
const UNIT_CATEGORY = {
  명: { category: '참여규모', title: '핵심 참여자 규모', appliesTo: 'headcount' },
  회기: { category: '활동횟수', title: '참여자 1인당 활동 회기', appliesTo: 'sessions' },
  회: { category: '활동횟수', title: '활동 횟수', appliesTo: 'sessions' },
  시간: { category: '활동횟수', title: '활동 시간', appliesTo: 'sessions' },
  개월: { category: '사업기간', title: '사업기간', appliesTo: 'period' },
  개소: { category: '선정 규모', title: '선정 개소', appliesTo: '' },
  원: { category: '예산', title: '사업비 한도', appliesTo: 'budget' },
  '%': { category: '성과', title: '성과 기준', appliesTo: 'outcomeGoals' },
  퍼센트: { category: '성과', title: '성과 기준', appliesTo: 'outcomeGoals' }
};
// 같은 단위라도 무엇에 대한 기준인지 앞 문맥으로 좁힌다.
const CONTEXT_TITLE = [
  [/완료율|이수율|달성률/, '프로그램 완료율'],
  [/참여자|핵심\s*참여자|대상\s*인원/, '핵심 참여자 규모'],
  [/1인당|인당/, '참여자 1인당 활동 회기'],
  [/1개소당|개소당|기관당/, '1개소당 사업비 한도'],
  [/총\s*사업\s*예산|총\s*예산|총사업비/, '총 사업비 한도']
];
// 한 줄에 기준이 두 개 붙어 있는 공고가 많다("참여자 70명 이상 및 완료율 98% 이상").
// 값 바로 앞에 나온 표현을 우선해서 무엇에 대한 기준인지 정한다.
function nearestTitle(text) {
  let best = null;
  for (const [pattern, title] of CONTEXT_TITLE) {
    const global = new RegExp(pattern.source, 'g');
    for (const match of text.matchAll(global)) {
      if (!best || match.index > best.index) best = { index: match.index, title };
    }
  }
  return best?.title || '';
}
function titleFor(line, matchIndex, context, fallback) {
  // 문맥은 앞줄들 + 현재 줄이다. 값보다 뒤에 나온 표현이 제목을 가져가지 않도록 값 앞까지만 본다.
  const before = context.slice(0, Math.max(0, context.length - line.length + matchIndex));
  return nearestTitle(line.slice(0, matchIndex)) || nearestTitle(before) || fallback;
}

// 예산은 한도 성격의 문장에서만 읽는다. 단가표의 개별 금액을 사업비 상한으로 잘못 올리지 않는다.
const BUDGET_LIMIT_CONTEXT = /사업\s*예산|사업비|배분\s*금액|지원\s*한도|지원\s*금액|1개소당|개소당|기관당|총액|최대한도/;

function numericRules(entries) {
  const rules = [];
  const seen = new Set();
  for (const entry of entries) {
    for (const [pattern, ruleType] of [[MIN_PATTERN, 'MIN'], [MAX_PATTERN, 'MAX']]) {
      pattern.lastIndex = 0;
      for (const match of entry.line.matchAll(pattern)) {
        const unit = match[2] === '퍼센트' ? '%' : match[2];
        const meta = UNIT_CATEGORY[unit];
        if (!meta) continue;
        const amount = number(match[1]);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        if (unit === '원' && !BUDGET_LIMIT_CONTEXT.test(entry.context)) continue;
        // 개월은 사업기간을 말할 때만 기준으로 삼는다(제출·심사 일정의 개월 수와 섞지 않는다).
        if (unit === '개월' && !/사업\s*기간|수행\s*기간/.test(entry.context)) continue;
        const title = titleFor(entry.line, match.index, entry.context, meta.title);
        const key = `${ruleType}|${title}|${amount}|${unit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rules.push(rule({
          category: meta.category, title, ruleType, value: amount, unit,
          severity: 'BLOCKING', appliesTo: meta.appliesTo,
          source: '공식 공고', evidence: entry.line, location: entry.source
        }));
      }
    }
  }
  return rules;
}

function periodRules(entries) {
  for (const entry of entries) {
    if (!/사업\s*기간|수행\s*기간|사업기간/.test(entry.context)) continue;
    const value = normalizePeriod(entry.line);
    if (!value) continue;
    return [rule({
      category: '사업기간', title: '사업기간', ruleType: 'EXACT', value, unit: '',
      severity: 'BLOCKING', appliesTo: 'period', source: '공식 공고', evidence: entry.line, location: entry.source
    })];
  }
  return [];
}

function choiceRules(structure, entries, notice) {
  // 유형 인식은 설계도와 같은 엔진을 쓴다. 두 곳이 서로 다른 유형을 알게 두지 않는다.
  const types = detectApplicationTypes(structure, notice);
  if (types.length < 2) return [];
  const evidence = entries.find(entry => types.every(type => entry.context.includes(type.name)))?.line
    || entries.find(entry => entry.line.includes(types[0].name))?.line
    || types.map(type => type.name).join(' / ');
  return [rule({
    category: '신청유형', title: '신청유형 택1', ruleType: 'CHOICE',
    value: types.map(type => type.name), unit: '', severity: 'BLOCKING', appliesTo: 'applicationType',
    source: '공식 공고', evidence: clean(evidence, 400), location: types[0].source || '공고 원문'
  })];
}

// 공고가 요구한 핵심 수행모델. 사업내용·지원내용 줄에서만 뽑고, 공고에 실제로 있는 낱말만 핵심어로 쓴다.
const MODEL_CONTEXT = /사업\s*내용|지원\s*내용|주요\s*사업|과업|수행\s*방법/;
const MODEL_STOPWORDS = new Set(['사업', '지원', '기관', '내용', '경우', '해당', '관련', '통해', '위한', '대상', '제공', '실시', '운영', '가능', '필요', '프로그램', '참여자', '서비스', '등을', '위해']);
function modelKeyphrases(line) {
  return [...new Set(String(line).replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/)
    .map(token => token.replace(/(?:을|를|이|가|은|는|의|에|와|과|로|으로|및)$/, ''))
    .filter(token => token.length >= 3 && !MODEL_STOPWORDS.has(token) && !/^\d+$/.test(token)))]
    .sort((left, right) => right.length - left.length)
    .slice(0, 3);
}
// 수행 방식을 실제로 말하는 줄만 고른다. 표의 이어쓰기 조각("맞춤형 서비스 제공")은 모델 조건으로 올리지 않는다.
const MODEL_VERB = /파견|연계|개입|발굴|모니터링|사례회의|사후점검|초기면접|구축|체계마련/;
function modelRules(entries) {
  const rules = [];
  const claimed = new Set();
  for (const entry of entries) {
    if (!MODEL_CONTEXT.test(entry.context)) continue;
    const line = entry.line.replace(/^[○●▶▸□■\-\s]+/, '');
    if (line.length < 14 || !MODEL_VERB.test(line)) continue;
    const keyphrases = modelKeyphrases(line);
    if (!keyphrases.length) continue;
    // 같은 핵심어를 다시 조건으로 만들지 않는다(같은 모델을 여러 줄에 나눠 쓴 공고).
    if (claimed.has(keyphrases[0])) continue;
    claimed.add(keyphrases[0]);
    rules.push(rule({
      category: '사업모델', title: clean(line, 90), ruleType: 'REQUIRED', value: keyphrases, unit: '',
      severity: 'BLOCKING', appliesTo: 'programs', source: '공식 공고', evidence: entry.line, location: entry.source
    }));
    if (rules.length >= 5) break;
  }
  return rules;
}

function textRules(structure, entries) {
  const rules = [];
  const field = key => (structure?.fields || []).find(item => item.key === key);
  const add = (key, category, title, ruleType, severity) => {
    const found = field(key);
    if (found?.status !== '공식 근거 확인') return;
    const first = found.evidence[0];
    rules.push(rule({
      category, title, ruleType, value: clean(found.value, 300), unit: '', severity, appliesTo: '',
      source: '공식 공고', evidence: clean(first?.sentence || found.value, 400), location: first?.source || '공고 원문'
    }));
  };
  add('eligibility', '신청자격', '신청자격 충족', 'ELIGIBILITY', 'REQUIRED');
  add('submissionItems', '제출양식', '필수 제출서류·양식', 'FORMAT', 'REQUIRED');
  add('evaluation', '평가기준', '평가항목 대응', 'EVALUATION', 'ADVISORY');
  // 예산 편성 구조(항목·비율 제한)는 숫자 규칙과 별도로 남긴다.
  const budgetStructure = entries.find(entry => /항목별|편성|비율|이상이어야|넘을 수 없|추가 편성/.test(entry.line) && /예산|사업비|인건비|지원항목/.test(entry.line));
  if (budgetStructure) {
    rules.push(rule({
      category: '예산', title: '공고 지정 예산구조 준수', ruleType: 'REQUIRED',
      value: modelKeyphrases(budgetStructure.line), unit: '', severity: 'REQUIRED', appliesTo: 'budget',
      source: '공식 공고', evidence: budgetStructure.line, location: budgetStructure.source
    }));
  }
  return rules;
}

export function buildNoticeContract({ structure, notice } = {}) {
  ruleSeq = 0;
  const entries = withContext(noticeLines(notice, structure));
  const rules = [
    ...periodRules(entries),
    ...choiceRules(structure, entries, notice),
    ...numericRules(entries),
    ...modelRules(entries),
    ...textRules(structure, entries)
  ];
  const byCategory = {};
  for (const item of rules) byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  return {
    noticeTitle: structure?.noticeTitle || clean(notice?.title, 200),
    rules,
    byCategory,
    blockingCount: rules.filter(item => item.severity === 'BLOCKING').length,
    builtFrom: notice ? '공고 원문' : '공고 구조 분석 결과',
    rule: '공고 확정 > 이번 사업 사용자 확정 > 신청기관 확인정보 > AI 제안. 공고가 이미 정한 값은 사용자·AI가 바꿀 수 없다.'
  };
}

// ---------- 공고 확정값과 사용자 결정값의 분리 ----------
// 공고가 값을 못 박은 항목(EXACT)은 잠그고, 범위만 정한 항목(MIN/MAX)은 그 범위 안에서 사용자가 정한다.
export function contractFieldLocks(contract) {
  const locks = {};
  for (const item of contract?.rules || []) {
    if (!item.appliesTo) continue;
    const current = locks[item.appliesTo];
    if (item.ruleType === 'EXACT' || item.ruleType === 'CHOICE') {
      locks[item.appliesTo] = {
        mode: OFFICIAL_LOCKED, ruleType: item.ruleType,
        value: Array.isArray(item.value) ? item.value.join(' / ') : String(item.value),
        options: Array.isArray(item.value) ? item.value : [],
        note: item.ruleType === 'CHOICE' ? '공고의 공식 선택지 중 하나만 고를 수 있습니다.' : '공고가 확정한 값입니다. 변경할 수 없습니다.',
        evidence: item.evidence, location: item.location
      };
      continue;
    }
    if (current?.mode === OFFICIAL_LOCKED) continue;
    // 범위를 정하는 것은 MIN·MAX뿐이다. 서술형 REQUIRED 규칙은 입력칸 범위를 만들지 않는다.
    if (item.ruleType !== 'MIN' && item.ruleType !== 'MAX') continue;
    const bound = `${Number(item.value).toLocaleString()}${item.unit} ${item.ruleType === 'MIN' ? '이상' : '이하'}`;
    locks[item.appliesTo] = {
      mode: USER_DECIDES, ruleType: item.ruleType, value: '', bound,
      note: `공고 허용 범위: ${bound}. 이 범위 안에서 이번 사업 값을 정합니다.`,
      evidence: item.evidence, location: item.location
    };
  }
  return locks;
}

// ---------- 공고 기준 불일치 (어느 쪽? 을 묻지 않는다) ----------
const VALUE_UNITS = /(\d[\d,]*)\s*(명|회기|회|시간|개월|개소|원|%)/g;
export function contractConflicts(contract, projectValues = []) {
  const conflicts = [];
  const add = item => { if (!conflicts.some(entry => entry.key === item.key)) conflicts.push(item); };
  for (const value of projectValues) {
    const key = value?.blueprintKey || value?.key;
    if (!key || !value.value) continue;
    for (const item of (contract?.rules || []).filter(entry => entry.appliesTo === key)) {
      if (item.ruleType === 'EXACT') {
        const found = normalizePeriod(value.value);
        if (!found || found === item.value) continue;
        add(conflict(item, value, found, `공고가 확정한 ${item.title} ${item.value}로 맞춰야 합니다.`));
        continue;
      }
      if (item.ruleType !== 'MIN' && item.ruleType !== 'MAX') continue;
      VALUE_UNITS.lastIndex = 0;
      for (const match of String(value.value).matchAll(VALUE_UNITS)) {
        if (match[2] !== item.unit) continue;
        const amount = number(match[1]);
        const violates = item.ruleType === 'MIN' ? amount < item.value : amount > item.value;
        if (!violates) continue;
        const bound = `${Number(item.value).toLocaleString()}${item.unit} ${item.ruleType === 'MIN' ? '이상' : '이하'}`;
        add(conflict(item, value, match[0], `${bound}으로 사업설계를 조정해야 합니다.`));
      }
    }
  }
  return conflicts;
}
function conflict(item, value, found, instruction) {
  const officialValue = item.ruleType === 'EXACT' ? String(item.value)
    : `${Number(item.value).toLocaleString()}${item.unit} ${item.ruleType === 'MIN' ? '이상' : '이하'}`;
  return {
    key: `${item.id}|${found}`,
    type: 'NOTICE_CONTRACT_CONFLICT',
    ruleId: item.id, ruleType: item.ruleType, severity: item.severity,
    field: value.label || value.blueprintKey || value.key,
    officialValue, userValue: `${found} (${clean(value.value, 120)})`,
    officialEvidence: { source: item.location, sentence: item.evidence },
    // 공고 BLOCKING 조건은 선택 대상이 아니다. 무엇을 고를지 묻지 않고 무엇을 맞춰야 하는지 알린다.
    instruction,
    resolution: '공고 기준으로 조정 필요',
    unadjustable: '이 공고에 제출할 수 없음'
  };
}

// ---------- 기관이 공고의 핵심모델을 수행할 수 있는가 ----------
// 기관 정보를 공고에 억지로 맞추지 않는다. 수행 근거가 없으면 그 사실을 그대로 보여 준다.
export function contractCapabilityCheck(contract, applicant) {
  const required = (contract?.rules || []).filter(item => item.ruleType === 'REQUIRED' && item.severity === 'BLOCKING');
  if (!required.length) return null;
  const confirmed = (applicant?.items || []).filter(entry => entry.status === '확인됨');
  const haystack = confirmed.map(entry => `${entry.label} ${entry.value}`).join(' ');
  const items = required.map(item => {
    const keyphrases = Array.isArray(item.value) ? item.value : [];
    const hit = keyphrases.filter(phrase => haystack.includes(phrase));
    return {
      ruleId: item.id, title: item.title,
      state: hit.length ? '수행 근거 있음' : '수행 근거 없음',
      evidence: hit.length ? confirmed.filter(entry => hit.some(phrase => `${entry.label} ${entry.value}`.includes(phrase))).map(entry => entry.label).slice(0, 3) : [],
      keyphrases
    };
  });
  const missing = items.filter(entry => entry.state === '수행 근거 없음');
  return {
    items, missing,
    status: !missing.length ? '수행 가능' : missing.length === items.length ? '적합성 부족' : '확인 필요',
    note: missing.length === items.length
      ? '공고의 핵심 수행모델을 수행할 수 있다는 기관 근거가 하나도 없습니다. 이 상태로 일반 프로그램을 만들지 않습니다.'
      : missing.length ? '일부 핵심모델은 기관 근거가 아직 없습니다. 확인 후 설계에 반영하세요.' : '핵심 수행모델을 뒷받침할 기관 근거가 있습니다.'
  };
}

// ---------- 제출 적합성 게이트 ----------
function proposalText(sections) {
  return (sections || []).map(section => `${section.title || ''}\n${section.content || section.body || ''}`).join('\n\n');
}
// 계획서 10개 항목의 표준 순서. 기준마다 관련 항목을 먼저 보고, 없으면 전체 본문을 본다.
const SECTION_ORDER = ['necessity', 'purpose', 'goals', 'target', 'programs', 'schedule', 'roles', 'budget', 'indicators', 'outcomes'];
const SCOPE_SECTIONS = { budget: ['budget'], headcount: ['target', 'goals'], sessions: ['programs', 'schedule'], outcomeGoals: ['indicators', 'goals'], period: ['schedule'] };
function scopedText(sections, appliesTo) {
  const keys = SCOPE_SECTIONS[appliesTo];
  const list = sections || [];
  if (!keys || !list.length) return '';
  const picked = keys.map(key => {
    const byId = list.find(section => section.id === key);
    const index = SECTION_ORDER.indexOf(key);
    const found = byId || (list.length === SECTION_ORDER.length && index >= 0 ? list[index] : null);
    return found ? `${found.title || ''}\n${found.content || found.body || ''}` : '';
  }).filter(Boolean);
  return picked.join('\n\n');
}
// 「총사업비 140,000,000원」처럼 이 사업의 총액을 밝힌 문장이 있으면 그 값으로 상한을 본다.
const TOTAL_BUDGET = /(?:총\s*사업비|총사업비|사업비\s*총액|총\s*예산|총액|합계|신청\s*금액|신청액)[^\n]{0,40}?(\d[\d,]{5,})\s*원/g;
function totalBudgetNumbers(text) {
  TOTAL_BUDGET.lastIndex = 0;
  return [...String(text || '').matchAll(TOTAL_BUDGET)].map(match => number(match[1])).filter(Number.isFinite);
}
function numbersIn(text, unit) {
  const escaped = unit === '%' ? '%' : unit;
  return [...text.matchAll(new RegExp(`(\\d[\\d,]*)\\s*${escaped}`, 'g'))].map(match => number(match[1])).filter(Number.isFinite);
}
function result(item, state, detail, found = '') {
  return { ruleId: item.id, category: item.category, title: item.title, ruleType: item.ruleType, severity: item.severity, state, detail, found, official: officialLabel(item), evidence: item.evidence, location: item.location };
}
function officialLabel(item) {
  if (item.ruleType === 'EXACT') return String(item.value);
  if (item.ruleType === 'CHOICE') return (item.value || []).join(' / ');
  if (item.ruleType === 'MIN') return `${Number(item.value).toLocaleString()}${item.unit} 이상`;
  if (item.ruleType === 'MAX') return `${Number(item.value).toLocaleString()}${item.unit} 이하`;
  return Array.isArray(item.value) ? item.value.join(' · ') : clean(item.value, 120);
}

export function checkProposalAgainstContract({ contract, sections, projectValues = [], blueprint } = {}) {
  const rules = contract?.rules || [];
  const text = proposalText(sections);
  const selectedType = blueprint?.applicationTypes?.selected || '';
  const results = rules.map(item => {
    if (item.ruleType === 'EXACT') {
      // 계획서에는 과거 실적 기간도 함께 적힌다. 표기가 하나라도 공고 기간과 같으면 충족으로 본다.
      const found = allPeriods(scopedText(sections, item.appliesTo) || text);
      const all = found.length ? found : allPeriods(text);
      if (!all.length) return result(item, '미확정', `계획서에서 ${item.title}을 찾지 못했습니다.`);
      return all.includes(item.value)
        ? result(item, '충족', `계획서 ${item.title} ${item.value}`, item.value)
        : result(item, '불일치', `공고 ${item.value} · 계획서 ${all.join(' / ')}`, all[0]);
    }
    if (item.ruleType === 'CHOICE') {
      const options = item.value || [];
      const chosen = options.find(option => option === selectedType) || options.find(option => text.includes(option)) || '';
      if (!chosen) return result(item, '미확정', `공식 선택지(${options.join(' / ')}) 중 어느 유형인지 계획서에서 확인되지 않습니다.`);
      // 공고가 「계획서상 택1」을 요구하므로 고른 유형은 계획서 본문에 드러나야 한다.
      if (!text.includes(chosen)) return result(item, '불일치', `${chosen}을 골랐지만 계획서 본문에 신청유형을 밝히지 않았습니다.`, chosen);
      // 혼입 판정은 초안 점검과 같은 기준을 쓴다. 근거 인용·유형 비교 문장은 혼입이 아니다.
      const mixed = options.filter(option => option !== chosen && designSentencesUsing(sections, { name: option }, chosen).length > 0);
      return mixed.length
        ? result(item, '불일치', `${chosen}을 골랐는데 ${mixed.join(' · ')} 내용이 섞였습니다.`, chosen)
        : result(item, '충족', `${chosen} 선택`, chosen);
    }
    if (item.ruleType === 'MIN' || item.ruleType === 'MAX') {
      // 그 기준이 걸린 항목(예산이면 예산 항목)을 먼저 본다. 기관 연간예산 같은 다른 자리의 숫자와 섞지 않는다.
      const scoped = scopedText(sections, item.appliesTo);
      const inScope = scoped ? numbersIn(scoped, item.unit) : [];
      // 사업비 상한은 이 사업의 총액과 비교한다. 같은 항목에 인용된 기관 연간예산과 섞지 않는다.
      const totals = item.unit === '원' ? totalBudgetNumbers(scoped || text) : [];
      const found = totals.length ? totals : inScope.length ? inScope : numbersIn(text, item.unit);
      if (!found.length) return result(item, '미확정', `계획서에서 ${item.unit} 단위 값을 찾지 못했습니다.`);
      // MIN은 계획서가 제시한 가장 큰 값, MAX는 가장 큰 값으로 판단한다(가장 불리한 값 기준).
      const compare = Math.max(...found);
      const ok = item.ruleType === 'MIN' ? compare >= item.value : compare <= item.value;
      return ok
        ? result(item, '충족', `계획서 최대 ${compare.toLocaleString()}${item.unit}`, `${compare}${item.unit}`)
        : result(item, '불일치', `공고 ${officialLabel(item)} · 계획서 ${compare.toLocaleString()}${item.unit}`, `${compare}${item.unit}`);
    }
    if (item.ruleType === 'REQUIRED') {
      const keyphrases = Array.isArray(item.value) ? item.value : modelKeyphrases(item.value);
      const hit = keyphrases.filter(phrase => text.includes(phrase));
      return hit.length
        ? result(item, '충족', `핵심어 ${hit.join(' · ')} 반영`, hit.join(' · '))
        : result(item, '불일치', `공고가 요구한 핵심 요소가 계획서에 없습니다: ${keyphrases.join(' · ')}`);
    }
    // ELIGIBILITY / FORMAT / EVALUATION 은 사람이 확인한다. 자동으로 충족 처리하지 않는다.
    return result(item, '미확정', '제출 전 사람이 직접 확인해야 하는 항목입니다.');
  });

  const counts = Object.fromEntries(CONTRACT_STATES.map(state => [state, results.filter(item => item.state === state).length]));
  // BLOCKING 규칙은 충족 외에는 모두 제출을 막는다. 미확정도 제출 가능으로 넘기지 않는다.
  const blocking = results.filter(item => item.severity === 'BLOCKING' && item.state !== '충족');
  const required = results.filter(item => item.severity === 'REQUIRED' && item.state !== '충족');
  const status = blocking.length ? '제출 차단' : required.length ? '보완 필요' : '제출 가능';
  return {
    status, counts, results, blocking, required,
    total: results.length,
    submissionReady: status === '제출 가능',
    reasons: blocking.map(item => `${item.title}: ${item.detail}`)
  };
}
