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

export function extractApplicantCandidates(text, { documentName = '' } = {}) {
  const body = String(text || '');
  const docAsOf = documentAsOf(body);
  const source = clean(documentName, 200) ? `${clean(documentName, 200)}에서 추출` : '업로드한 기관 문서에서 추출';
  const seen = new Set();
  const candidates = [];
  for (const line of body.split(/\n+/).map(value => value.trim()).filter(Boolean)) {
    if (candidates.length >= 60) break;
    const performance = line.match(PERFORMANCE_PATTERN);
    const rule = performance ? null : LABELED_RULES.find(item => item.pattern.test(line));
    if (!performance && !rule) continue;
    const area = performance ? 'performance' : rule.area;
    const label = performance ? `${performance[1]}년 사업실적` : rule.label;
    const value = clean(performance ? performance[2] : line.match(rule.pattern)[1], 500);
    if (!value) continue;
    const key = `${area}:${normalizeKey(label)}:${normalizeKey(value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lineAsOf = performance ? performance[1] : asOfFrom(line.match(ANY_DATE_PATTERN)) || docAsOf;
    candidates.push({
      id: `cand-${candidates.length + 1}`,
      area, label, value, source,
      asOf: lineAsOf,
      asOfStatus: lineAsOf ? '기준시점 확인됨' : ASOF_UNKNOWN
    });
  }
  return { documentName: clean(documentName, 200), documentAsOf: docAsOf, candidates };
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
      if (existing && normalizeKey(existing.value) === normalizeKey(candidate.value)) return { ...base, kind: '동일', action: '기존 실적과 같은 내용이므로 추가하지 않습니다.' };
      return { ...base, kind: '누적 추가', action: '사업실적은 누적 정보이므로 기존 기록을 두고 새 항목으로 추가합니다.' };
    }
    if (!existing) return { ...base, kind: '신규', action: '기관 정보에 없는 항목이므로 ‘확인 필요’ 상태로 추가합니다.' };
    if (normalizeKey(existing.value) === normalizeKey(candidate.value)) return { ...base, kind: '동일', action: '기존 정보와 같으므로 변경하지 않습니다.' };
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
  if (!candidate || candidate.kind === '동일') return base;
  const now = new Date().toISOString();
  const source = candidate.asOf ? `${candidate.source} (기준시점 ${candidate.asOf})` : `${candidate.source} (${ASOF_UNKNOWN})`;
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

// 신규·누적처럼 기존 값을 바꾸지 않는 후보만 한 번에 반영한다. 충돌·변경은 개별 확인이 필요하다.
export function applySafeCandidates(applicant, candidates) {
  const safe = (Array.isArray(candidates) ? candidates : []).filter(candidate => candidate.kind === '신규' || candidate.kind === '누적 추가');
  return { applicant: safe.reduce((current, candidate) => applyUpdateCandidate(current, candidate), normalizeApplicant(applicant)), applied: safe.length };
}
