// 기관 문서(사업계획서·결과보고서·기관소개서 등)에서 「신청기관 정보」 업데이트 후보를 만든다.
// 규칙 기반 로컬 추출만 사용하며 외부 API를 호출하지 않는다. 후보는 사용자가 반영해야만 기관 정보에 들어간다.
import { CONFIRMED_STATUS, makeApplicantItem, normalizeApplicant } from './applicants.js';

// 사업실적은 최신값으로 덮어쓰는 정보가 아니라 누적 정보다.
export const CUMULATIVE_AREAS = ['performance'];
export const CANDIDATE_KINDS = ['신규', '동일', '변경 가능성', '충돌', '누적 추가', '이전 시점 정보'];
export const ASOF_UNKNOWN = '기준시점 확인 필요';
// 한 문서에서 만들 후보의 최대치. 실제 기관 연혁 한 건이 99행이라 예전 상한(60)에서 잘렸다.
export const MAX_CANDIDATES = 200;

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
  // 사업자등록증은 「상호(법인명)」, 고유번호증은 「법인명(단체명)」이라고 쓴다.
  { area: 'basic', label: '기관명', keys: ['기관명', '법인명', '단체명', '시설명', '신청기관명', '신청기관', '상호', '상호법인명'] },
  // 사업자등록증은 대표자를 「성명(대표자)」이라고 쓴다.
  { area: 'basic', label: '대표자', keys: ['대표자', '대표자명', '기관장', '시설장', '성명', '성명대표자'] },
  { area: 'basic', label: '설립 시기', keys: ['설립일', '설립일자', '설립연도', '설립년도', '개소일', '설립', '개업연월일'] },
  { area: 'basic', label: '소재지', keys: ['소재지', '주소', '기관주소', '사업장소재지', '본점소재지'] },
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
// 「상 호 ( 법 인 명 ) 주식회사 ○○」처럼 콜론도 칸 구분도 없이 라벨 뒤에 값이 바로 오는 줄이 있다.
// 공공 증명서가 그렇게 찍힌다. 앞에서부터 글자를 모으며 아는 라벨과 맞는지 보고, 맞으면 나머지가 값이다.
// 공백과 괄호는 라벨 글자로 세지 않는다 — 「대 표 자」와 「상호(법인명)」이 같은 라벨이다.
function headLabeled(line) {
  const raw = String(line ?? '');
  let key = '';
  let consumed = 0;
  for (const character of raw) {
    consumed += 1;
    if (/[\s()（）]/.test(character)) continue;
    key += character;
    if (key.length > 12) return null;
    const rule = LABEL_KEY_MAP.get(key);
    if (rule) {
      // 「상 호 ( 법 인 명 ) 주식회사 ○○」의 괄호 안도 라벨이다. 값에서 떼어 낸다.
      const rest = raw.slice(consumed).replace(/^\s*[（(][^)）]*[)）]\s*/, match => (LABEL_KEY_MAP.has(labelKey(match)) ? '' : match));
      return { rule, value: rest.trim() };
    }
  }
  return null;
}
const SEGMENT_SPLIT = /\t+| {2,}|(?=•)/;

// 공공 서식은 「대 표 자 :」처럼 자간이 벌어지고 「법인명(단체명) :」처럼 괄호가 붙는다.
// 콜론 앞에서만 공백·괄호를 지워 라벨 규칙에 걸리게 한다. 콜론 뒤의 값은 손대지 않는다.
function labeledLine(line) {
  const at = String(line).search(/[:：]/);
  if (at < 1) return String(line);
  return `${String(line).slice(0, at).replace(/\([^)]*\)/g, '').replace(/[\s.·]/g, '')}${String(line).slice(at)}`;
}

// 서식의 칸 제목이 값으로 들어오지 않게 거른다.
const HEADER_VALUE_PATTERN = /^[([]?\s*(?:활동\s*내용|프로그램\s*내용|주요\s*내용|수행\s*방법|산출\s*목표|세부\s*내용|구분|내용|비고|합계|계$|비율|재원|금액|단위|사업자번호|사업자등록번호|고유번호|연번|번호|해당\s*없음|없음)/;
function labelKey(value) { return String(value ?? '').replace(/[\s()·:：.]/g, ''); }
function segmentRule(segment) { return LABEL_KEY_MAP.get(labelKey(segment)) || null; }
function usableValue(segment, rule = null) {
  const value = String(segment ?? '').trim();
  if (value.length < 2 || value.length > 200 || !/[가-힣A-Za-z0-9]/.test(value)) return false;
  if (segmentRule(value) || HEADER_VALUE_PATTERN.test(value)) return false;
  // 빈 서식의 라벨 줄("법인등기번호 사업자등록번호 소재지 대표자")이나 한두 글자 칸은 값이 아니다.
  // 다만 라벨과 짝지어진 칸은 짧아도 값이다. 「대표자   홍길동」의 세 글자 이름이 여기서 떨어졌다.
  const key = labelKey(value);
  if (!rule && !/\d/.test(value) && key.length <= 3) return false;
  if ([...LABEL_KEY_MAP.keys()].filter(label => label.length > 2 && key.includes(label)).length >= 2) return false;
  // 값이 라벨 낱말만으로 되어 있으면 서식의 머리글이다. 증명서의 「주민(사업자)등록번호」 칸이 그랬다.
  if (![...LABEL_KEY_MAP.keys()].filter(label => label.length > 2).reduce((text, label) => text.split(label).join(''), key).trim()) return false;
  // 「번호」로 끝나는데 숫자가 없으면 값이 아니라 칸 이름이다. 증명서의 「주민(사업자)등록번호」가 그랬다.
  if (/번호$/.test(key) && !/\d/.test(value)) return false;
  // 예산·번호 항목은 숫자가 있어야 실제 값으로 본다.
  if ((rule?.area === 'budget' || rule?.label === '고유번호') && !/\d/.test(value)) return false;
  return true;
}

// 개인 신상정보는 기관 정보로 수집하지 않는다.
//
// 예전에는 개인정보가 섞인 줄을 통째로 버렸다. 그런데 공공 서식은 「기관명 … 연락처 02-…」처럼
// 한 줄에 같이 오는 일이 흔해서, 연락처 하나 때문에 그 줄의 기관명까지 사라졌다.
// 이제 줄은 살리고 사람 정보만 잘라 낸다. 잘라 낸 뒤 남는 것이 없으면 그때 후보로 만들지 않는다.
const PERSONAL_ID_PATTERN = /(\d{6}\s*[-–]\s*\d{7})|(01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4})|(\d{2,4}[-.\s]\d{3,4}[-.\s]\d{4})|([\w.+-]+@[\w-]+\.[\w.]+)/g;
// 이 말이 나오면 그 뒤는 사람 정보다. 값을 여기서 끊는다.
const PERSONAL_LABEL_PATTERN = /(?:생년월일|주민등록번호|휴대(?:전화|폰)|연락처|전화번호|이메일|e-?mail)/i;
export function stripPersonal(value) {
  const body = String(value ?? '');
  const at = body.search(PERSONAL_LABEL_PATTERN);
  return (at >= 0 ? body.slice(0, at) : body)
    .replace(PERSONAL_ID_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,·/|(\-]\s*$/, '')
    .trim();
}

// 실적표 한 행에서 실적을 읽는다.
//
// 끝말 규칙(「…사업」「…프로그램」으로 끝나야 실적)만으로는 실제 연혁의 절반이 떨어진다.
// 「개별상담」 「학교폭력 예방교육」 「아름다운 산책」처럼 끝말이 다른 사업명이 그만큼 많다.
// 그렇다고 낱말을 늘리면 아무 문장이나 실적이 되므로, 끝말 대신 더 강한 근거를 쓴다 —
// 표가 한 행으로 「이 해에, 이 기관과, 이 사업을」이라고 이미 말하고 있다.
// 연도와 발주기관과 사업명이 한 행에 함께 있으면 끝말과 무관하게 실적으로 본다.
//
// 연도 칸은 한 해의 여러 줄을 세로로 합쳐 그 해 첫 줄에만 있는 일이 흔하다. 그래서 앞 행의
// 연도를 이어 쓰되, 칸 수가 달라지면 다른 표로 넘어간 것이므로 잇지 않는다.
const ROW_YEAR = /^(20\d{2})\s*년?$/;
const ROW_NUMBER = /^\d{1,3}$/;
// 빈 칸 대신 적어 두는 표시. 값이 아니다.
const ROW_BLANK = /^[-–—·ㆍ]+$|^없음$/;
// 날짜 조각. 값이 아니다.
const ROW_DATE = /^\d{1,2}\s*[월일]$/;
function rowValue(value) {
  const text = String(value ?? '').trim();
  if (text.length < 2 || text.length > 60) return '';
  // 숫자·기호만 있는 칸은 기관명도 사업명도 아니다.
  if (!/[가-힣A-Za-z]/.test(text)) return '';
  // 「2026년   7월   6일」처럼 띄어 쓴 날짜는 표 행이 아니다. 실제 신청서 마지막 장이 그랬다.
  if (ROW_DATE.test(text)) return '';
  // 「기관대표자 : 장석복」처럼 콜론이 있는 칸은 라벨과 값이다. 표의 값 칸이 아니다.
  if (/[:：]/.test(text)) return '';
  if (segmentRule(text) || HEADER_VALUE_PATTERN.test(text)) return '';
  return text;
}
export function performanceRow(segments, carried = null) {
  const cells = (Array.isArray(segments) ? segments : []).map(value => String(value).trim()).filter(Boolean);
  if (cells.length < 3) return null;
  let index = 0;
  const head = cells[0].match(ROW_YEAR);
  let year = '';
  const leadNumber = ROW_NUMBER.test(cells[0]) ? Number(cells[0]) : null;
  if (head) { year = head[1]; index = 1; }
  // 연도 칸이 없는 행은 앞 행에서 이어받는다. 다만 같은 표가 이어지고 있다는 표시가 있어야 한다.
  // 번호가 하나씩 늘어나는 것이 가장 확실한 표시다. 다른 표가 시작되면 번호가 1로 돌아가 끊긴다.
  else if (carried && leadNumber !== null && carried.no !== null && leadNumber === carried.no + 1) year = carried.year;
  if (!year) return null;
  // 번호 칸은 값이 아니다.
  const numberCell = ROW_NUMBER.test(cells[index] || '') ? Number(cells[index]) : null;
  if (numberCell !== null) index += 1;
  const org = rowValue(cells[index]);
  // 사업명 칸이 「-」로 비어 있는 행이 있다. 그때는 다음 칸(내용)을 사업명으로 읽는다.
  const titleAt = ROW_BLANK.test(cells[index + 1] || '') ? index + 2 : index + 1;
  const title = rowValue(cells[titleAt]);
  if (!org || !title || org === title) return null;
  return {
    year, org, title,
    detail: cells.slice(titleAt + 1).join(' '),
    no: numberCell,
    // 연도 칸이 빠진 행도 연도 칸이 있는 것으로 세어 앞 행과 너비를 견준다.
    width: head ? cells.length : cells.length + 1
  };
}

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

// includeNarrative는 서술 규칙과 표 칸 짝짓기를 켤지 정한다. 기본값은 켬이다.
//
// 처음 이 옵션을 만들 때는 끔이 기본이었다(83242ba). 검증·코칭 화면에 서술 규칙을 붙이면서
// 「기존 문서 화면의 동작을 그대로 두려고」 붙인 기본값이었고, 오탐 때문이 아니었다.
// 그 뒤 실제 배분신청서가 표 칸("기 관 명   수완아동센터")이라 아무것도 못 읽는 것을 고쳤는데(07af1ca),
// 그 고침도 이 옵션 안에 들어갔다. 그래서 정작 사용자가 서류를 올리는 화면만 27개 규칙이 꺼진 채였다.
// 이제 기본을 켬으로 두어 새 호출자가 모르고 꺼뜨리는 일이 없게 한다.
//
// 실제 문서 여섯 가지(고유번호증 두 형태·연혁·소개서·결산서·신청서 서식)로 재니
// 후보가 2건에서 37건이 되었고 여섯 중 다섯이 0건이던 것이 모두 0건을 벗어났다.
// 기관 사실이 없는 글(공고문·일반 서술·빈 서식 라벨 줄)에서는 전·후 모두 0건이라 오탐은 늘지 않았다.
export function extractApplicantCandidates(text, { documentName = '', includeNarrative = true, sourceLabel = '' } = {}) {
  const body = String(text || '');
  const docAsOf = documentAsOf(body);
  const name = clean(documentName, 200);
  const source = name ? `${name}${sourceLabel ? `(${sourceLabel})` : ''}에서 추출` : `${sourceLabel || '업로드한 기관 문서'}에서 추출`;
  const seen = new Set();
  const candidates = [];
  const add = (area, label, rawValue, lineAsOf, rawExcerpt) => {
    if (!rawValue || candidates.length >= MAX_CANDIDATES) return;
    // 값과 근거 문장에서 사람 정보만 잘라 낸다. 잘라 내고 남는 것이 없으면 후보로 만들지 않는다.
    const value = stripPersonal(rawValue);
    const excerpt = stripPersonal(rawExcerpt);
    if (!value) return;
    const key = `${area}:${normalizeKey(label)}:${normalizeKey(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ id: `cand-${candidates.length + 1}`, area, label, value, source, asOf: lineAsOf, asOfStatus: lineAsOf ? '기준시점 확인됨' : ASOF_UNKNOWN, excerpt: clean(excerpt, 300) });
  };
  // 실적표는 앞 행의 연도를 이어 쓴다. 표를 벗어나면 곧바로 끊는다.
  let carriedRow = null;
  for (const line of body.split(/\n+/).map(value => value.trim()).filter(Boolean)) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const lineAsOf = asOfFrom(line.match(ANY_DATE_PATTERN)) || docAsOf;
    const beforeLine = candidates.length;
    // 실적표 한 행이면 그 행으로 읽는다. 끝말이 아니라 연도·발주기관·사업명이 근거다.
    const row = includeNarrative ? performanceRow(line.split(SEGMENT_SPLIT), carriedRow) : null;
    if (row) {
      carriedRow = row;
      add('performance', `${row.year}년 사업실적`, `${row.org} ${row.title}`, row.year, line);
      continue;
    }
    carriedRow = null;
    const performance = line.match(PERFORMANCE_PATTERN);
    if (performance) { add('performance', `${performance[1]}년 사업실적`, clean(performance[2], 500), performance[1], line); continue; }
    const labeled = labeledLine(line);
    const rule = LABELED_RULES.find(item => item.pattern.test(labeled));
    if (rule) { add(rule.area, rule.label, clean(labeled.match(rule.pattern)[1], 500), lineAsOf, line); continue; }
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
      const labeledSegment = labeledLine(segment);
      const labeledRule = LABELED_RULES.find(item => item.pattern.test(labeledSegment));
      if (labeledRule) { add(labeledRule.area, labeledRule.label, clean(labeledSegment.match(labeledRule.pattern)[1], 500), segmentAsOf, segment); continue; }
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
    // 마지막 수단. 아무 규칙도 읽지 못한 한 칸짜리 줄이 라벨로 시작하면 그 뒤가 값이다.
    // 공공 증명서가 「상 호 ( 법 인 명 ) 주식회사 ○○」처럼 콜론도 칸 구분도 없이 찍는다.
    // 서술문보다 뒤에 두는 이유는 「상근 직원 7명이며 문의는 …」 같은 문장을 통째로 삼키지 않기 위해서다.
    if (candidates.length !== beforeLine || segments.length > 1) continue;
    const head = headLabeled(line);
    if (head && usableValue(head.value, head.rule)) add(head.rule.area, head.rule.label, clean(head.value, 300), lineAsOf, line);
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
      // 실적은 라벨이 겹칠 수 있으므로 같은 영역에서 내용이 같은 항목이 있으면 이미 있는 실적으로 본다.
      // 다만 기준시점이 다르면 다른 해에 다시 한 다른 실적이다. 값이 같다고 합치면 연도가 하나만 남는다 —
      // 실제 연혁에서 2025년과 2026년에 각각 한 같은 사업 3건이 그렇게 한 줄로 접혔다.
      const sameRecord = (applicant?.items || []).find(item => item.area === candidate.area
        && normalizeKey(item.value) === normalizeKey(candidate.value)
        && asOfYear(item.asOf) === asOfYear(candidate.asOf));
      if (sameRecord) return { ...base, existingItemId: sameRecord.id, existingValue: sameRecord.value, existingStatus: sameRecord.status, existingAsOf: sameRecord.asOf || '', kind: '동일', action: '이미 있는 실적이므로 값은 그대로 두고 이 문서를 근거로만 추가합니다.' };
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
export const SAFE_KINDS = ['신규', '누적 추가', '동일'];
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
