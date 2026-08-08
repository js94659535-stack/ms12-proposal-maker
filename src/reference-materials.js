// 검증·코칭에 넣는 참고자료를 계획서와 분리해 관리하고, 공식 기준으로 쓸 수 있는지 먼저 판별한다.
// 규칙 기반 로컬 판정만 사용하며 외부 API를 호출하지 않는다. 확인할 수 없으면 가짜로 단정하지 않는다.
export const REFERENCE_TYPES = ['공고문', '사업요강', '평가기준', '계획서 원본', '기타 참고자료'];
export const OFFICIAL_TYPES = ['공고문', '사업요강', '평가기준'];
export const USAGES = ['공식 근거로 사용 가능', '관련 있으나 참고용', '이번 사업과 맞지 않음', '출처/진위 확인 필요', '내용끼리 충돌함'];
export const REFERENCE_RULE = 'proposalText가 평가 대상 계획서다. references는 판단 근거 자료이며 각 자료의 usage를 반드시 지킨다. usage가 "공식 근거로 사용 가능"인 자료만 공식 기준·평가표로 사용한다. 그 밖의 자료는 공식 기준처럼 적용하지 말고 참고로만 사용하며 관련 판단은 확인필요로 둔다. 참고자료가 서로 충돌하거나 계획서와 맞지 않으면 어떤 자료를 어떤 이유로 참고용으로만 사용했는지 summary에 밝힌다.';

const ISSUER_PATTERN = /(재단|협회|공단|진흥원|センター|센터|시청|도청|교육청|구청|군청|시\s|도\s|부\s|청\s|위원회|공동모금회|사회복지|법인|기관)/;
const YEAR_PATTERN = /(20\d{2})\s*년?(?:도)?/g;
const KEY_VALUE_RULES = [
  { key: '총사업비·지원한도', pattern: /(?:총\s*사업비|지원\s*한도|지원금)\s*[:：]?\s*([\d,]+\s*(?:원|만원|억원))/ },
  { key: '사업기간', pattern: /사업\s*기간\s*[:：]?\s*(20\d{2}[.\-년\s]*\d{0,2}[^\n]{0,30})/ },
  { key: '신청마감', pattern: /(?:신청\s*마감|접수\s*마감|공모\s*기간)\s*[:：]?\s*([^\n]{4,40})/ }
];

function clean(value, max = 300) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function tokens(value) {
  return [...new Set(String(value || '').replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/).filter(token => token.length > 1))];
}
export function referenceYears(text) {
  return [...new Set([...String(text || '').matchAll(YEAR_PATTERN)].map(match => Number(match[1])))].sort();
}
function keyValues(text) {
  return KEY_VALUE_RULES.map(rule => ({ key: rule.key, value: clean(String(text || '').match(rule.pattern)?.[1] || '', 60) })).filter(item => item.value);
}

export function makeReference(value = {}, index = 0) {
  return {
    id: String(value.id || `reference-${index + 1}`).slice(0, 60),
    fileName: clean(value.fileName, 200) || '붙여넣은 참고자료',
    referenceType: REFERENCE_TYPES.includes(value.referenceType) ? value.referenceType : '기타 참고자료',
    text: String(value.text || '').slice(0, 60_000),
    addedAt: clean(value.addedAt, 40) || new Date().toISOString()
  };
}

// 이번 사업 기준값. 계획서와 선택 공고에서만 뽑고 참고자료로 덮어쓰지 않는다.
export function projectContext({ proposalText = '', proposalTitle = '', noticeTitle = '', noticeDeadline = '', today = '' } = {}) {
  const years = referenceYears(`${noticeDeadline} ${noticeTitle} ${proposalTitle} ${String(proposalText).slice(0, 4000)}`);
  const todayYear = Number(String(today || '').slice(0, 4)) || 0;
  return {
    year: years.at(-1) || todayYear || 0,
    titleTokens: tokens(`${noticeTitle} ${proposalTitle}`),
    proposalTokens: tokens(String(proposalText).slice(0, 6000))
  };
}

// 자료 한 건을 다섯 갈래로 판별한다. 확인할 수 없으면 '출처/진위 확인 필요'로 남긴다.
export function assessReference(reference, context = {}) {
  const item = makeReference(reference);
  const text = item.text;
  const years = referenceYears(`${item.fileName} ${text.slice(0, 4000)}`);
  const official = OFFICIAL_TYPES.includes(item.referenceType);
  const projectYear = Number(context.year || 0);
  const hasIssuer = ISSUER_PATTERN.test(text.slice(0, 4000)) || ISSUER_PATTERN.test(item.fileName);
  // 연도 같은 숫자 토큰은 사업명 일치 근거로 쓰지 않고, 한 단어만 겹치는 경우도 일치로 보지 않는다.
  const overlapTokens = tokens(`${item.fileName} ${text.slice(0, 4000)}`).filter(token => (context.titleTokens || []).includes(token) && !/^\d+$/.test(token));
  const overlap = overlapTokens.length >= 2 ? overlapTokens : [];
  const reasons = [];
  const base = { id: item.id, fileName: item.fileName, referenceType: item.referenceType, years, matchedTitleTokens: overlap.slice(0, 5), keyValues: keyValues(text) };

  if (text.trim().length < 30) return { ...base, usage: '출처/진위 확인 필요', reasons: ['자료 본문이 너무 짧아 내용을 확인할 수 없습니다.'] };
  if (!years.length || !hasIssuer) {
    if (!years.length) reasons.push('자료에서 연도를 확인할 수 없습니다.');
    if (!hasIssuer) reasons.push('발행기관·출처 표기를 확인할 수 없습니다.');
    return { ...base, usage: '출처/진위 확인 필요', reasons: [...reasons, '가짜로 단정하지 않으며, 공식 기준으로는 사용하지 않습니다.'] };
  }
  const sameYear = !projectYear || years.includes(projectYear);
  if (!sameYear) reasons.push(`자료 연도(${years.join('·')})가 이번 사업 연도(${projectYear})와 다릅니다.`);
  if (official && !sameYear && !overlap.length) {
    return { ...base, usage: '이번 사업과 맞지 않음', reasons: [...reasons, '사업명·기관명도 이번 공모와 일치하지 않아 다른 사업 자료로 보입니다.'] };
  }
  if (!official) return { ...base, usage: '관련 있으나 참고용', reasons: [`${item.referenceType}은 공식 기준 자료가 아니므로 참고로만 사용합니다.`, ...reasons] };
  if (!sameYear) return { ...base, usage: '관련 있으나 참고용', reasons: [...reasons, '현재 공모의 공식 기준으로 확인되지 않아 참고용으로만 사용합니다.'] };
  if (!overlap.length) return { ...base, usage: '관련 있으나 참고용', reasons: ['사업명·기관명이 이번 공모와 일치하는지 확인되지 않았습니다.'] };
  return { ...base, usage: '공식 근거로 사용 가능', reasons: [`${item.referenceType}의 연도와 사업명이 이번 공모와 일치합니다.`] };
}

// 공식 근거로 판정된 자료끼리 핵심 값이 어긋나면 충돌로 표시하고 둘 다 확인 대상으로 낮춘다.
export function assessReferences(references, context = {}) {
  const assessments = (Array.isArray(references) ? references : []).map(reference => assessReference(reference, context));
  const conflicts = [];
  const official = assessments.filter(item => item.usage === '공식 근거로 사용 가능');
  for (const rule of KEY_VALUE_RULES) {
    const values = official.map(item => ({ item, value: item.keyValues.find(entry => entry.key === rule.key)?.value })).filter(entry => entry.value);
    const distinct = [...new Set(values.map(entry => entry.value.replace(/\s/g, '')))];
    if (values.length > 1 && distinct.length > 1) {
      conflicts.push({ key: rule.key, files: values.map(entry => `${entry.item.fileName}: ${entry.value}`) });
      for (const entry of values) {
        entry.item.usage = '내용끼리 충돌함';
        entry.item.reasons = [...entry.item.reasons, `${rule.key} 값이 다른 참고자료와 충돌합니다. 공식 기준으로 확정하지 않습니다.`];
      }
    }
  }
  return {
    assessments,
    conflicts,
    officialCount: assessments.filter(item => item.usage === '공식 근거로 사용 가능').length,
    cautionCount: assessments.filter(item => item.usage !== '공식 근거로 사용 가능').length
  };
}

// 검증 요청에 넣을 형태. 계획서 본문과 섞지 않고 자료별로 구분해 전달한다.
export function referencePayload(references, context = {}) {
  const review = assessReferences(references, context);
  const list = (Array.isArray(references) ? references : []).map(reference => makeReference(reference));
  // 검증 요청 크기 제한을 넘지 않도록 전체 참고자료 본문 길이를 제한한다.
  let budget = 200_000;
  return {
    references: list.map((item, index) => {
      const assessment = review.assessments[index] || {};
      const text = item.text.slice(0, Math.max(0, budget));
      budget -= text.length;
      return { id: item.id, fileName: item.fileName, referenceType: item.referenceType, usage: assessment.usage || '출처/진위 확인 필요', reasons: assessment.reasons || [], text, truncated: text.length < item.text.length };
    }),
    referenceConflicts: review.conflicts,
    referenceRule: REFERENCE_RULE
  };
}

// 사용자에게 그대로 보여줄 안내 문장.
export function referenceNotices(review, context = {}) {
  const year = Number(context.year || 0);
  return [
    ...review.assessments.filter(item => item.usage === '관련 있으나 참고용' && item.years.length && year && !item.years.includes(year))
      .map(item => `첨부한 ${item.years.join('·')}년 ${item.referenceType}(${item.fileName})은 현재 ${year}년 공모의 공식 기준으로 확인되지 않아 참고용으로만 사용했습니다.`),
    ...review.assessments.filter(item => item.usage === '이번 사업과 맞지 않음')
      .map(item => `${item.fileName}은 이번 사업과 대상·연도·사업명이 맞지 않아 공식 기준으로 사용하지 않았습니다.`),
    ...review.assessments.filter(item => item.usage === '출처/진위 확인 필요')
      .map(item => `${item.fileName}은 출처·진위를 확인할 수 없어 공식 기준으로 사용하지 않았습니다. 가짜로 단정하지는 않았습니다.`),
    ...review.conflicts.map(conflict => `${conflict.key} 값이 참고자료 간에 충돌합니다(${conflict.files.join(' / ')}). 확인 전에는 공식 기준으로 사용하지 않았습니다.`)
  ];
}
