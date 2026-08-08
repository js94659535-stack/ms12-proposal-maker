// 기관 문서(사업계획서·결과보고서·기관소개서 등)에서 「신청기관 정보」 업데이트 후보를 만든다.
// 규칙 기반 로컬 추출만 사용하며 외부 API를 호출하지 않는다. 후보는 사용자가 반영해야만 기관 정보에 들어간다.
import { CONFIRMED_STATUS, makeApplicantItem, normalizeApplicant } from './applicants.js';

// 사업실적은 최신값으로 덮어쓰는 정보가 아니라 누적 정보다.
export const CUMULATIVE_AREAS = ['performance'];
export const CANDIDATE_KINDS = ['신규', '동일', '변경 가능성', '충돌', '누적 추가', '이전 시점 정보'];
export const ASOF_UNKNOWN = '기준시점 확인 필요';

const LABELED_RULES = [
  { area: 'basic', label: '기관명', pattern: /^(?:기관|법인|단체|센터)\s*명\s*[:：]\s*(.+)$/ },
  { area: 'basic', label: '설립 시기', pattern: /^설립\s*(?:일자|일|연도|년도)?\s*[:：]\s*(.+)$/ },
  { area: 'basic', label: '소재지', pattern: /^(?:소재지|주소)\s*[:：]\s*(.+)$/ },
  { area: 'basic', label: '대표자', pattern: /^(?:대표자|대표|기관장|시설장)\s*(?:명)?\s*[:：]\s*(.+)$/ },
  { area: 'legal', label: '법인 유형', pattern: /^(?:법인|기관|단체)\s*유형\s*[:：]\s*(.+)$/ },
  { area: 'legal', label: '고유번호', pattern: /^(?:고유번호|사업자등록번호|법인등록번호)\s*[:：]\s*(.+)$/ },
  { area: 'staff', label: '상근 인력', pattern: /^상근\s*(?:직원|인력|종사자)\s*(?:수)?\s*[:：]\s*(.+)$/ },
  { area: 'staff', label: '비상근 인력', pattern: /^(?:비상근|시간제)\s*(?:직원|인력|강사)\s*(?:수)?\s*[:：]\s*(.+)$/ },
  { area: 'staff', label: '보유 자격', pattern: /^(?:보유\s*)?(?:자격증|자격)\s*(?:현황)?\s*[:：]\s*(.+)$/ },
  { area: 'programs', label: '보유 프로그램', pattern: /^(?:보유\s*)?프로그램\s*(?:명|현황)?\s*[:：]\s*(.+)$/ },
  { area: 'facilities', label: '운영 시설', pattern: /^(?:시설|공간|운영\s*시설)\s*(?:현황)?\s*[:：]\s*(.+)$/ },
  { area: 'partners', label: '협력기관', pattern: /^(?:협력\s*기관|협약\s*기관|MOU)\s*(?:현황)?\s*[:：]\s*(.+)$/i },
  { area: 'budget', label: '연간 예산', pattern: /^(?:연간\s*예산|기관\s*예산|총\s*예산)\s*(?:규모)?\s*[:：]\s*(.+)$/ },
  { area: 'budget', label: '자부담 가능액', pattern: /^(?:자부담|자기부담)\s*(?:가능액|금액)?\s*[:：]\s*(.+)$/ },
  { area: 'measurement', label: '성과측정 방식', pattern: /^(?:성과\s*측정|평가\s*방식|사용\s*척도)\s*[:：]\s*(.+)$/ },
  { area: 'references', label: '근거자료', pattern: /^(?:증빙|근거\s*자료|첨부\s*서류)\s*[:：]\s*(.+)$/ }
];

// 사업계획서·결과보고서 같은 서술형 문서에서 계획서 작성에 실제로 쓰이는 기관 사실만 좁게 뽑는다.
const NARRATIVE_RULES = [
  { area: 'staff', label: '상근 인력', pattern: /(?:상근|전담)\s*(?:직원|인력|종사자|실무자)\s*(\d+\s*명)/ },
  { area: 'staff', label: '참여 인력', pattern: /참여\s*인력\s*수?\s*[:：]?\s*(\d+\s*명)/ },
  { area: 'staff', label: '보유 자격', pattern: /((?:사회복지사|상담사|청소년지도사|임상심리사|간호사|영양사|평생교육사)[^\n.]{0,12}?\s*\d+\s*명)/ },
  { area: 'programs', label: '운영 회기', pattern: /(?:프로그램|과정|교육|상담|시행|운영)[^\n.]{0,20}?(?:총\s*)?(\d+\s*(?:회기|회))|총\s*(\d+\s*회기)/ },
  { area: 'facilities', label: '운영 시설', pattern: /((?:상담실|교육실|강의실|치료실|집단상담실|사무실|프로그램실)\s*\d+\s*(?:실|개))/ },
  { area: 'partners', label: '협력기관', pattern: /([가-힣A-Za-z0-9()·\s]{2,30}?)(?:과|와)\s*(?:업무\s*)?(?:협약|MOU)[^\n.]{0,10}?(?:체결|맺)/i },
  { area: 'budget', label: '총사업비', pattern: /(?:총\s*사업비|총사업비|총\s*액)\s*(?:는|은)?\s*[:：]?\s*([\d,]{3,}\s*(?:천원|만원|억원|원))/ },
  { area: 'budget', label: '자부담', pattern: /자부담[^\n.]{0,10}?([\d,]{3,}\s*(?:천원|만원|억원|원)|\d+\s*%)/ },
  // 서식형 실적표는 "2024년   ○○사업   …" 형태로 줄 끝이 사업명이 아닐 수 있다. 문서 제목·신청 문구는 제외한다.
  { area: 'performance', label: '연도별 수행실적', pattern: /(20\d{2})\s*년\s+(?!.{0,40}(?:계획서|신청|공고|양식))(.{4,50}?(?:사업|프로그램|과정|용역|위탁))/ },
  { area: 'measurement', label: '성과측정 경험', pattern: /((?:사전[·\-\s]?사후\s*(?:검사|평가|조사)|만족도\s*조사|[가-힣A-Za-z]{2,20}\s*척도))/ },
  { area: 'performance', label: '주요 성과', pattern: /(출석률|만족도|재참여율|이수율)\s*(\d+(?:\.\d+)?\s*%)/ }
];

// 신청서·표 서식은 "기 관 명   수완아동센터"처럼 콜론 없이 칸으로 나뉜다. 라벨 칸과 다음 칸을 짝지어 읽는다.
const LABEL_KEY_RULES = [
  { area: 'basic', label: '기관명', keys: ['기관명', '법인명', '단체명', '시설명', '신청기관명', '신청기관'] },
  { area: 'basic', label: '대표자', keys: ['대표자', '대표자명', '기관장', '시설장'] },
  { area: 'basic', label: '설립 시기', keys: ['설립일', '설립일자', '설립연도', '설립년도', '개소일', '설립'] },
  { area: 'basic', label: '소재지', keys: ['소재지', '주소', '기관주소'] },
  { area: 'legal', label: '고유번호', keys: ['고유번호', '고유번호사업자등록번호', '사업자등록번호', '법인등록번호'] },
  { area: 'legal', label: '법인 유형', keys: ['법인유형', '기관유형', '단체유형', '시설유형', '기관구분'] },
  { area: 'staff', label: '상근 인력', keys: ['상근인력', '상근직원', '전담인력', '종사자수', '직원수', '인력현황'] },
  { area: 'staff', label: '보유 자격', keys: ['보유자격', '자격증', '자격현황', '보유자격증'] },
  { area: 'programs', label: '보유 프로그램', keys: ['프로그램명', '보유프로그램', '주요프로그램', '세부사업명'] },
  { area: 'facilities', label: '운영 시설', keys: ['시설현황', '보유시설', '운영시설', '시설규모'] },
  { area: 'partners', label: '협력기관', keys: ['협력기관', '협약기관', '컨소시엄', '수행기관'] },
  { area: 'budget', label: '총사업비', keys: ['총사업비', '총계', '사업비총액'] },
  { area: 'budget', label: '연간 예산', keys: ['연간예산', '기관예산', '총예산'] },
  { area: 'budget', label: '자부담', keys: ['자부담', '자기부담', '자부담금'] },
  { area: 'measurement', label: '성과측정 방식', keys: ['성과측정', '평가방식', '측정도구', '사용척도', '성과지표'] },
  { area: 'performance', label: '주요 사업실적', keys: ['주요실적', '사업실적', '수행실적', '최근실적'] }
];
const LABEL_KEY_MAP = new Map(LABEL_KEY_RULES.flatMap(rule => rule.keys.map(key => [key, rule])));
const SEGMENT_SPLIT = /\t+| {2,}|(?=•)/;

// 서식의 칸 제목이 값으로 들어오지 않게 거른다.
const HEADER_VALUE_PATTERN = /^[([]?\s*(?:활동\s*내용|수행\s*방법|산출\s*목표|세부\s*내용|구분|내용|비고|합계|계$|비율|재원|금액|단위|사업자번호|사업자등록번호|고유번호|연번|번호|해당\s*없음|없음)/;
function labelKey(value) { return String(value ?? '').replace(/[\s()·:：.]/g, ''); }
function segmentRule(segment) { return LABEL_KEY_MAP.get(labelKey(segment)) || null; }
function usableValue(segment, rule = null) {
  const value = String(segment ?? '').trim();
  if (value.length < 2 || value.length > 200 || !/[가-힣A-Za-z0-9]/.test(value)) return false;
  if (segmentRule(value) || HEADER_VALUE_PATTERN.test(value)) return false;
  // 빈 서식의 라벨 줄("법인등기번호 사업자등록번호 소재지 대표자")이나 한두 글자 칸은 값이 아니다.
  const key = labelKey(value);
  if (!/\d/.test(value) && key.length <= 3) return false;
  if ([...LABEL_KEY_MAP.keys()].filter(label => label.length > 2 && key.includes(label)).length >= 2) return false;
  // 예산·번호 항목은 숫자가 있어야 실제 값으로 본다.
  if ((rule?.area === 'budget' || rule?.label === '고유번호') && !/\d/.test(value)) return false;
  return true;
}

// 개인 신상정보는 기관 정보로 수집하지 않는다.
const PERSONAL_INFO_PATTERN = /(\d{6}\s*[-–]\s*\d{7})|(01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4})|(\d{2,4}[-.\s]\d{3,4}[-.\s]\d{4})|([\w.+-]+@[\w-]+\.[\w.]+)|(생년월일|주민등록번호|휴대(?:전화|폰)|연락처|이메일|e-?mail)/i;

// 라벨이 없어도 실적 줄은 연도와 함께 누적 정보로 모은다.
const PERFORMANCE_PATTERN = /^(20\d{2})\s*년?\s*[.\-·]?\s*(.{4,80}?(?:사업|프로그램|공모|위탁|용역))\s*$/;
const DOCUMENT_DATE_PATTERN = /(?:작성일|기준일|기준\s*시점|발행일|보고일)\s*[:：]?\s*(20\d{2})[.\-년\s]*(\d{1,2})?/;
const ANY_DATE_PATTERN = /(20\d{2})\s*[.\-년]\s*(\d{1,2})?/;

function clean(value, max) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function normalizeKey(value) { return String(value ?? '').replace(/\s+/g, '').toLowerCase(); }
function asOfFrom(match) {
  if (!match) return '';
  const month = match[2] ? String(Number(match[2])).padStart(2, '0') : '';
  return month ? `${match[1]}-${month}` : match[1];
}
function asOfYear(value) { const match = String(value || '').match(/20\d{2}/); return match ? Number(match[0]) : 0; }

// 문서 전체에서 기준시점을 찾는다. 업로드 날짜는 문서 정보의 기준시점이 아니므로 사용하지 않는다.
export function documentAsOf(text) {
  const body = String(text || '');
  const labeled = body.match(DOCUMENT_DATE_PATTERN);
  if (labeled) return asOfFrom(labeled);
  const head = body.split(/\n/).slice(0, 40).join('\n').match(ANY_DATE_PATTERN);
  return head ? asOfFrom(head) : '';
}

export function extractApplicantCandidates(text, { documentName = '', includeNarrative = false, sourceLabel = '' } = {}) {
  const body = String(text || '');
  const docAsOf = documentAsOf(body);
  const name = clean(documentName, 200);
  const source = name ? `${name}${sourceLabel ? `(${sourceLabel})` : ''}에서 추출` : `${sourceLabel || '업로드한 기관 문서'}에서 추출`;
  const seen = new Set();
  const candidates = [];
  const add = (area, label, value, lineAsOf, excerpt) => {
    if (!value || candidates.length >= 60) return;
    // 개인 신상정보가 섞인 문장은 기관 정보 후보로 만들지 않는다.
    if (PERSONAL_INFO_PATTERN.test(excerpt) || PERSONAL_INFO_PATTERN.test(value)) return;
    const key = `${area}:${normalizeKey(label)}:${normalizeKey(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ id: `cand-${candidates.length + 1}`, area, label, value, source, asOf: lineAsOf, asOfStatus: lineAsOf ? '기준시점 확인됨' : ASOF_UNKNOWN, excerpt: clean(excerpt, 300) });
  };
  for (const line of body.split(/\n+/).map(value => value.trim()).filter(Boolean)) {
    if (candidates.length >= 60) break;
    const lineAsOf = asOfFrom(line.match(ANY_DATE_PATTERN)) || docAsOf;
    const performance = line.match(PERFORMANCE_PATTERN);
    if (performance) { add('performance', `${performance[1]}년 사업실적`, clean(performance[2], 500), performance[1], line); continue; }
    const rule = LABELED_RULES.find(item => item.pattern.test(line));
    if (rule) { add(rule.area, rule.label, clean(line.match(rule.pattern)[1], 500), lineAsOf, line); continue; }
    if (!includeNarrative) continue;
    // 줄 전체에서 먼저 확인한다("참여 인력 수 : 5 명"처럼 칸이 나뉘면 놓치기 때문).
    for (const narrative of NARRATIVE_RULES) {
      const match = line.match(narrative.pattern);
      if (match) add(narrative.area, narrative.label, clean(match.slice(1).filter(Boolean).join(' '), 200), lineAsOf, line);
    }
    // 표·서식형 문서는 한 줄에 여러 칸이 붙어 오므로 칸 단위로도 확인한다.
    const segments = line.split(SEGMENT_SPLIT).map(value => value.trim()).filter(Boolean);
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const segmentAsOf = asOfFrom(segment.match(ANY_DATE_PATTERN)) || lineAsOf;
      const performanceSegment = segment.match(PERFORMANCE_PATTERN);
      if (performanceSegment) { add('performance', `${performanceSegment[1]}년 사업실적`, clean(performanceSegment[2], 500), performanceSegment[1], segment); continue; }
      const labeled = LABELED_RULES.find(item => item.pattern.test(segment));
      if (labeled) { add(labeled.area, labeled.label, clean(segment.match(labeled.pattern)[1], 500), segmentAsOf, segment); continue; }
      // 실적표는 "2024년 | ○○사업 | 규모"처럼 연도 칸이 따로 온다.
      const yearOnly = segment.match(/^(20\d{2})\s*년?$/);
      if (yearOnly && usableValue(segments[index + 1]) && /사업|프로그램|과정|교육|용역|위탁/.test(segments[index + 1])) {
        add('performance', `${yearOnly[1]}년 사업실적`, clean(segments[index + 1], 300), yearOnly[1], `${segment} ${segments[index + 1]} ${segments[index + 2] || ''}`);
        index += 1;
        continue;
      }
      const keyed = segments.length > 1 ? segmentRule(segment) : null;
      if (keyed && usableValue(segments[index + 1], keyed)) {
        add(keyed.area, keyed.label, clean(segments[index + 1], 300), segmentAsOf, `${segment} ${segments[index + 1]}`);
        index += 1;
        continue;
      }
      for (const narrative of NARRATIVE_RULES) {
        const match = segment.match(narrative.pattern);
        if (!match) continue;
        add(narrative.area, narrative.label, clean(match.slice(1).filter(Boolean).join(' '), 200), segmentAsOf, segment);
      }
    }
  }
  return { documentName: name, documentAsOf: docAsOf, candidates };
}

function findExistingItem(applicant, candidate) {
  const items = (applicant?.items || []).filter(item => item.area === candidate.area);
  const key = normalizeKey(candidate.label);
  if (!key) return null;
  const exact = items.find(item => normalizeKey(item.label) === key);
  if (exact) return exact;
  return items.find(item => {
    const other = normalizeKey(item.label);
    return other.length > 2 && key.length > 2 && (other.includes(key) || key.includes(other));
  }) || null;
}

// 새 정보는 바로 덮어쓰지 않고 신규 / 동일 / 변경 가능성 / 충돌 / 누적 / 이전 시점으로 분류만 한다.
export function buildUpdateCandidates(applicant, extraction) {
  const source = extraction?.candidates ? extraction : { documentName: '', documentAsOf: '', candidates: Array.isArray(extraction) ? extraction : [] };
  const candidates = source.candidates.map(candidate => {
    const existing = findExistingItem(applicant, candidate);
    const base = {
      ...candidate,
      existingItemId: existing?.id || '',
      existingValue: existing?.value || '',
      existingStatus: existing?.status || '',
      existingAsOf: existing?.asOf || ''
    };
    if (CUMULATIVE_AREAS.includes(candidate.area)) {
      if (existing && normalizeKey(existing.value) === normalizeKey(candidate.value)) return { ...base, kind: '동일', action: '이미 있는 실적이므로 값은 그대로 두고 이 문서를 근거로만 추가합니다.' };
      return { ...base, kind: '누적 추가', action: '사업실적은 누적 정보이므로 기존 기록을 두고 새 항목으로 추가합니다.' };
    }
    if (!existing) return { ...base, kind: '신규', action: '기관 정보에 없는 항목이므로 ‘확인 필요’ 상태로 추가합니다.' };
    if (normalizeKey(existing.value) === normalizeKey(candidate.value)) return { ...base, kind: '동일', action: '기존 정보와 같으므로 값·상태는 바꾸지 않고 이 문서를 근거로만 추가합니다.' };
    if (candidate.asOf && existing.asOf && asOfYear(candidate.asOf) < asOfYear(existing.asOf)) {
      return { ...base, kind: '이전 시점 정보', action: '기존 정보보다 이전 시점 문서이므로 현재 값을 바꾸지 않고 이력으로만 남깁니다.' };
    }
    if (existing.status === CONFIRMED_STATUS) return { ...base, kind: '충돌', action: '확인된 기관 정보와 다릅니다. 담당자 확인 후 반영하며 기존 값은 이력으로 보관합니다.' };
    return { ...base, kind: '변경 가능성', action: '기존 값을 이력으로 남기고 새 값을 ‘확인 필요’ 상태로 바꿉니다.' };
  });
  return {
    applicantId: applicant?.id || '',
    applicantName: applicant?.name || '',
    documentName: source.documentName || '',
    documentAsOf: source.documentAsOf || '',
    candidates
  };
}

function historyEntry(item, replacedAt) {
  return { value: item.value, status: item.status, source: item.source, asOf: item.asOf || '', recordedAt: replacedAt };
}

// 사용자가 반영을 누른 후보 한 건만 적용한다. 기존 값은 삭제하지 않고 이력으로 남긴다.
export function applyUpdateCandidate(applicant, candidate) {
  const base = normalizeApplicant(applicant);
  if (!candidate) return base;
  const now = new Date().toISOString();
  const source = candidate.asOf ? `${candidate.source} (기준시점 ${candidate.asOf})` : `${candidate.source} (${ASOF_UNKNOWN})`;
  // 같은 정보는 값·상태를 그대로 두고 근거 출처만 덧붙인다.
  if (candidate.kind === '동일') {
    if (!candidate.existingItemId) return base;
    return {
      ...base,
      items: base.items.map(item => (item.id === candidate.existingItemId && !item.source.includes(candidate.source)
        ? { ...item, source: `${item.source ? `${item.source} / ` : ''}${source}`.slice(0, 300), updatedAt: now }
        : item)),
      updatedAt: now
    };
  }
  if (candidate.kind === '신규' || candidate.kind === '누적 추가' || !candidate.existingItemId) {
    const item = makeApplicantItem({ area: candidate.area, label: candidate.label, value: candidate.value, status: '확인 필요', source, asOf: candidate.asOf, updatedAt: now });
    return { ...base, items: [...base.items, item], updatedAt: now };
  }
  const items = base.items.map(item => {
    if (item.id !== candidate.existingItemId) return item;
    if (candidate.kind === '이전 시점 정보') {
      return { ...item, history: [...(item.history || []), { value: candidate.value, status: '확인 필요', source, asOf: candidate.asOf || '', recordedAt: now }].slice(-20) };
    }
    return {
      ...item,
      value: candidate.value,
      status: '확인 필요',
      source,
      asOf: candidate.asOf || item.asOf || '',
      updatedAt: now,
      history: [...(item.history || []), historyEntry(item, now)].slice(-20)
    };
  });
  return { ...base, items, updatedAt: now };
}

// 신규·누적·근거 추가처럼 기존 값을 바꾸지 않는 후보만 한 번에 반영한다. 충돌·변경은 개별 확인이 필요하다.
const SAFE_KINDS = ['신규', '누적 추가', '동일'];
export function applySafeCandidates(applicant, candidates) {
  let current = normalizeApplicant(applicant);
  let applied = 0;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!SAFE_KINDS.includes(candidate.kind)) continue;
    // 앞 후보를 반영한 결과를 기준으로 다시 판정한다. 한 문서 안에 같은 항목이 여러 번 나와도 중복으로 쌓지 않는다.
    const recheck = buildUpdateCandidates(current, { documentName: '', documentAsOf: '', candidates: [{ ...candidate, existingItemId: '', existingValue: '', existingStatus: '', existingAsOf: '' }] }).candidates[0];
    if (!SAFE_KINDS.includes(recheck.kind) || (recheck.kind === '동일' && !recheck.existingItemId)) continue;
    current = applyUpdateCandidate(current, recheck);
    applied += 1;
  }
  return { applicant: current, applied };
}
