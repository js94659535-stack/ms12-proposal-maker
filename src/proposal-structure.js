// 업로드한 사업계획서 원문을 항목별로 구조화하고, 심사 관점으로 분석해 수정본 재가공까지 연결한다.
// 규칙 기반 로컬 처리만 사용하며 외부 API를 호출하지 않는다. 없는 사실은 만들지 않고 「없음」·[확인 필요]로 남긴다.
import { matchSectionsForIssue, proposalTextFromSections, sectionsFromProposalText } from './coaching-handoff.js';

export const PROPOSAL_FIELDS = [
  { key: 'title', title: '사업명', pattern: /사업\s*명|과업\s*명|프로그램\s*명/ },
  { key: 'purpose', title: '사업 목적', pattern: /사업\s*목적|추진\s*목적|목적/ },
  { key: 'necessity', title: '사업 필요성', pattern: /필요성|추진\s*배경|문제\s*인식|현황\s*및\s*문제/ },
  { key: 'target', title: '대상 및 인원', pattern: /대상|참여자|수혜자|모집\s*인원|참여\s*인원/ },
  { key: 'programs', title: '세부 프로그램', pattern: /세부\s*프로그램|세부\s*사업|사업\s*내용|프로그램\s*구성|추진\s*방법|운영\s*방법/ },
  { key: 'schedule', title: '기간·일정·회기', pattern: /사업\s*기간|추진\s*일정|운영\s*일정|일정|회기|차시/ },
  { key: 'staff', title: '수행 인력과 역할', pattern: /수행\s*인력|운영\s*인력|담당자|역할|추진\s*체계|투입\s*인력/ },
  { key: 'capability', title: '신청기관 역량', pattern: /기관\s*소개|기관\s*현황|수행\s*역량|수행\s*실적|주요\s*실적|기관\s*역량/ },
  { key: 'partners', title: '협력기관', pattern: /협력\s*기관|협약|컨소시엄|연계\s*기관|MOU/i },
  { key: 'budget', title: '예산', pattern: /예산|사업비|산출\s*근거|소요\s*경비/ },
  { key: 'goals', title: '성과목표', pattern: /성과\s*목표|사업\s*목표|정량\s*목표|목표\s*설정/ },
  { key: 'indicators', title: '성과지표·측정방법', pattern: /성과\s*지표|측정\s*방법|측정\s*도구|평가\s*방법|산출\s*지표/ },
  { key: 'effects', title: '기대효과', pattern: /기대\s*효과|파급\s*효과|사업\s*효과/ },
  { key: 'criteria', title: '공고 요구사항·평가기준 대응', pattern: /평가\s*기준|심사\s*기준|배점|공고\s*요구|신청\s*자격|제출\s*서류|필수\s*조건/ }
];

// 필요성 → 대상 → 프로그램 → 예산 → 성과목표 → 성과지표 로 이어져야 하는 핵심 사슬.
export const LOGIC_CHAIN = ['necessity', 'target', 'programs', 'budget', 'goals', 'indicators'];

const PARTICIPANT_PATTERN = /(\d[\d,]*)\s*명/g;
const SESSION_PATTERN = /(\d[\d,]*)\s*(?:회기|차시)/g;
const MONEY_PATTERN = /([\d,]{4,})\s*원/g;

function clean(value, max = 400) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function numbers(text, pattern) {
  return [...new Set([...String(text || '').matchAll(pattern)].map(match => Number(match[1].replaceAll(',', ''))).filter(Number.isFinite))];
}
function sentences(text) {
  return String(text || '').split(/(?<=[.!?。])\s+|\n+/).map(value => value.trim()).filter(value => value.length > 1);
}

// 추출 과정에서 제목·문단이 무너졌는지 확인한다.
export function extractionQuality(text, sections) {
  const body = String(text || '');
  const lines = body.split(/\n/).map(line => line.trim()).filter(Boolean);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const averageLength = lines.length ? Math.round(body.replace(/\s/g, '').length / lines.length) : 0;
  const headings = sections.filter(section => !/외부 계획서 본문$/.test(section.title)).length;
  const warnings = [];
  if (!body.trim()) warnings.push('원문 텍스트가 비어 있습니다.');
  if (lines.length && headings <= 1) warnings.push('제목으로 인식된 줄이 거의 없습니다. PDF·HWPX 추출 과정에서 제목 구분이 무너졌을 수 있습니다.');
  if (averageLength > 400 || longest > 2_000) warnings.push('한 줄이 지나치게 깁니다. 문단 구분이 사라진 상태로 추출되었을 수 있습니다.');
  if (body.length && body.length < 500) warnings.push('원문이 매우 짧습니다. 파일 일부만 추출되었는지 확인하세요.');
  return { totalChars: body.length, lineCount: lines.length, sectionCount: sections.length, headingCount: headings, averageLineChars: averageLength, longestLineChars: longest, warnings };
}

// PDF처럼 줄바꿈이 사라진 원문은 문서 안의 번호 제목 앞에서 끊어 분석 기준점을 만든다. 글자는 지우지 않는다.
const INLINE_HEADING = /\s+(?=(?:\d{1,2}\s*[.)]|[◆■□○●▶※])\s*[가-힣]{2,20}(?:\s|:|：))/g;
function restoreParagraphs(text) {
  return String(text || '').replace(INLINE_HEADING, '\n');
}

// 키워드가 나온 자리 주변만 근거로 쓴다. 문서 첫 문장을 근거처럼 붙이지 않는다.
function evidenceWindow(text, pattern) {
  const body = String(text || '');
  const match = body.match(pattern);
  if (!match) return '';
  const index = Math.max(0, match.index - 40);
  return clean(body.slice(index, match.index + 220), 300);
}

// 원문을 보존한 채 항목별로 구조화한다. 못 찾은 항목은 만들지 않고 「없음」으로 둔다.
export function analyzeProposalStructure(text, { documentName = '' } = {}) {
  const body = String(text || '');
  let sections = sectionsFromProposalText(body, { idPrefix: 'proposal' });
  const firstQuality = extractionQuality(body, sections);
  // 제목이 살아 있지 않은 문서만 문단을 복구해 다시 나눈다.
  if (body.trim() && (firstQuality.headingCount <= 1 || firstQuality.averageLineChars > 300)) {
    const restored = sectionsFromProposalText(restoreParagraphs(body), { idPrefix: 'proposal' });
    if (restored.length > sections.length) sections = restored;
  }
  const fields = PROPOSAL_FIELDS.map(field => {
    const section = sections.find(item => field.pattern.test(item.title));
    const scope = section ? `${section.title}\n${section.content}` : '';
    const fallbackSection = section ? null : sections.find(item => field.pattern.test(item.content));
    const evidenceLine = section
      ? sentences(section.content)[0] || section.title
      : evidenceWindow(fallbackSection ? `${fallbackSection.title}\n${fallbackSection.content}` : body, field.pattern);
    const value = section ? clean(section.content || section.title, 500) : clean(evidenceLine, 500);
    // 항목 제목으로 잡히지 않고 본문에서만 언급된 경우는 확정으로 보지 않는다.
    const status = !value ? '없음' : !section || value.length < 15 || /확인\s*필요|미정|추후|해당\s*없음/.test(value) ? '확인 필요' : '확인됨';
    const source = scope || evidenceLine;
    return {
      key: field.key, title: field.title, status,
      value: value || '',
      location: section ? section.title : fallbackSection ? `${fallbackSection.title} 안의 문장` : evidenceLine ? '본문 문장' : '문서에서 찾지 못함',
      sectionId: section?.id || fallbackSection?.id || '',
      evidence: clean(evidenceLine, 300),
      participants: numbers(source, PARTICIPANT_PATTERN),
      sessions: numbers(source, SESSION_PATTERN),
      amounts: numbers(source, MONEY_PATTERN)
    };
  });
  return {
    documentName: clean(documentName, 200),
    originalText: body,
    sections,
    fields,
    quality: extractionQuality(body, sections),
    totals: {
      participants: numbers(body, PARTICIPANT_PATTERN),
      sessions: numbers(body, SESSION_PATTERN),
      amounts: numbers(body, MONEY_PATTERN)
    }
  };
}

function evidenceRef(structure, field) {
  return field.evidence
    ? [{ sourceName: structure.documentName || '계획서 원문', pageOrSection: field.location, proposalLocation: field.location, excerpt: field.evidence, verified: true }]
    : [];
}

function finding(structure, field, values) {
  return {
    id: `structure-${field.key}-${values.code}`,
    field: field.key,
    sectionId: field.sectionId || '',
    category: field.title,
    location: field.location !== '문서에서 찾지 못함' ? field.location : field.title,
    current: field.value ? clean(field.value, 200) : '문서에서 찾지 못했습니다.',
    problem: values.problem,
    whyRisky: values.whyRisky,
    basis: values.basis || '공식 평가기준 원문이 없어 공통 심사 관점으로 판단했습니다. [확인 필요: 공고·평가기준]',
    direction: values.direction,
    suggestion: values.suggestion,
    priority: values.priority,
    riskType: values.riskType,
    requiresConfirmation: values.requiresConfirmation !== false,
    evidenceRefs: evidenceRef(structure, field),
    // 기존 왕복 구조(buildCoachingHandoff)가 그대로 쓰는 형식.
    reason: `${values.problem} ${values.whyRisky}`.trim(),
    example: values.suggestion
  };
}

function fieldOf(structure, key) { return structure.fields.find(field => field.key === key); }

// 심사형 분석: 현재 내용 → 문제점 → 심사에서 불리한 이유 → 근거 → 보완 방향 → 수정 문장
export function reviewProposalStructure(structure) {
  const findings = [];
  const missingRequired = ['necessity', 'target', 'programs', 'budget', 'goals', 'indicators', 'schedule', 'staff'];
  for (const key of missingRequired) {
    const field = fieldOf(structure, key);
    if (field.status === '확인됨') continue;
    findings.push(finding(structure, field, {
      code: field.status === '없음' ? 'missing' : 'unclear',
      problem: field.status === '없음' ? `${field.title} 항목을 문서에서 찾지 못했습니다.` : `${field.title} 내용이 확인하기 어려운 상태입니다.`,
      whyRisky: '심사자는 계획서에 적힌 내용만으로 판단하므로, 항목이 비어 있으면 배점을 받을 근거가 없습니다.',
      direction: `${field.title}을(를) 별도 항목으로 두고 확인된 사실만 적습니다. 모르는 값은 만들지 말고 [확인 필요]로 남깁니다.`,
      suggestion: `${field.title}: [확인 필요: ${field.title} 확정 내용]`,
      priority: '주요 개선', riskType: 'competition'
    }));
  }

  // 논리 사슬 점검
  const chain = [];
  for (let index = 0; index < LOGIC_CHAIN.length - 1; index += 1) {
    const from = fieldOf(structure, LOGIC_CHAIN[index]);
    const to = fieldOf(structure, LOGIC_CHAIN[index + 1]);
    const linked = from.status === '확인됨' && to.status === '확인됨';
    chain.push({ from: from.title, to: to.title, linked, reason: linked ? '두 항목이 모두 작성되어 있습니다.' : `${linked ? '' : `${from.status !== '확인됨' ? from.title : to.title}이(가) 비어 있어 연결을 확인할 수 없습니다.`}` });
    if (linked) continue;
    const broken = from.status !== '확인됨' ? from : to;
    findings.push(finding(structure, broken, {
      code: `chain-${index}`,
      problem: `${from.title} → ${to.title} 연결이 끊깁니다.`,
      whyRisky: '필요성에서 성과지표까지 하나로 이어지지 않으면 사업 설계가 근거 없이 보이고 실행가능성 배점에서 불리합니다.',
      direction: `${from.title}에서 밝힌 문제가 ${to.title}까지 같은 대상·수치로 이어지도록 문장을 연결합니다.`,
      suggestion: `${from.title}에서 확인된 문제를 ${to.title}에 연결: [확인 필요: 연결 근거]`,
      priority: '주요 개선', riskType: 'competition'
    }));
  }

  // 수치 일관성: 인원·회기·예산
  const numberChecks = [
    { key: 'participants', label: '대상 인원', unit: '명', fields: ['target', 'goals'] },
    { key: 'sessions', label: '회기', unit: '회기', fields: ['programs', 'schedule'] }
  ];
  const conflicts = [];
  for (const check of numberChecks) {
    const values = [...new Set(check.fields.flatMap(key => fieldOf(structure, key)[check.key]))];
    if (values.length <= 1) continue;
    const locations = check.fields.map(key => fieldOf(structure, key).sectionId);
    // 서로 다른 위치에서 확인된 값만 실제 충돌로 본다. 같은 덩어리에서 나온 값은 확인 대상으로만 남긴다.
    const separated = locations[0] && locations[1] && locations[0] !== locations[1];
    conflicts.push({ key: check.key, label: check.label, values, confirmed: separated });
    const field = fieldOf(structure, check.fields[0]);
    findings.push(finding(structure, field, {
      code: `conflict-${check.key}`,
      problem: separated
        ? `${check.label} 수치가 항목마다 다릅니다 (${values.join(`${check.unit} / `)}${check.unit}).`
        : `${check.label} 수치가 여러 값으로 나옵니다 (${values.join(`${check.unit} / `)}${check.unit}). 같은 위치에서 확인되어 실제 충돌인지 확인이 필요합니다.`,
      whyRisky: '핵심 수치가 서로 다르면 심사에서 계획의 신뢰도를 크게 낮추고, 예산·성과 산출 근거도 함께 무너집니다.',
      basis: separated ? '계획서의 서로 다른 위치에서 다른 값이 확인되었습니다.' : '한 위치에서 여러 값이 확인되어 어떤 값이 확정값인지 문서만으로는 알 수 없습니다.',
      direction: `확정값 하나를 정하고 ${check.fields.map(key => fieldOf(structure, key).title).join('·')} 항목의 수치를 같게 맞춥니다. 확정 전에는 [확인 필요]로 둡니다.`,
      suggestion: `${check.label}: [확인 필요: ${values.join(`${check.unit} / `)}${check.unit} 중 확정값]`,
      priority: separated ? '최우선 경고' : '주요 개선',
      riskType: separated ? 'core-conflict' : 'competition',
      requiresConfirmation: !separated
    }));
  }

  const budgetField = fieldOf(structure, 'budget');
  const amounts = budgetField.amounts;
  if (amounts.length >= 3) {
    const total = Math.max(...amounts);
    const rest = amounts.reduce((sum, value) => sum + value, 0) - total;
    if (total !== rest) {
      conflicts.push({ key: 'budget', label: '예산 합계', values: [total, rest] });
      findings.push(finding(structure, budgetField, {
        code: 'conflict-budget',
        problem: `총액(${total.toLocaleString()}원)과 세부 금액 합계(${rest.toLocaleString()}원)가 맞지 않습니다.`,
        whyRisky: '예산 합계가 맞지 않으면 산출근거 배점에서 감점되고, 예산 규정 위반으로 반려될 위험도 있습니다.',
        basis: '계획서 예산 항목에서 확인된 금액만 계산했습니다.',
        direction: '총액과 세목 합계를 일치시키고, 확정되지 않은 금액은 [확인 필요]로 둡니다.',
        // 계산으로 얻은 합계는 분석에만 쓰고, 계획서 본문에는 새 금액을 적지 않는다.
        suggestion: '예산 합계 확인: [확인 필요: 총액과 세목 합계가 일치하는지 확인 후 확정 금액 기재]',
        priority: '최우선 경고', riskType: 'budget-rule', requiresConfirmation: false
      }));
    }
  }

  // 성과지표 측정방법 확인
  const indicators = fieldOf(structure, 'indicators');
  if (indicators.status === '확인됨' && !/척도|검사|설문|만족도|출석|기록|측정\s*시기|담당/.test(indicators.value)) {
    findings.push(finding(structure, indicators, {
      code: 'weak-measure',
      problem: '성과지표는 있으나 측정도구·측정시기·담당이 확인되지 않습니다.',
      whyRisky: '측정 방법이 없으면 성과를 검증할 수 없다고 판단되어 성과관리 배점에서 불리합니다.',
      direction: '지표마다 측정도구, 측정시기, 담당자를 함께 적습니다.',
      suggestion: '성과지표 측정: [확인 필요: 측정도구] / [확인 필요: 측정시기] / [확인 필요: 담당]',
      priority: '일반 개선', riskType: 'expression'
    }));
  }

  const order = { '최우선 경고': 0, '주요 개선': 1, '일반 개선': 2 };
  findings.sort((left, right) => order[left.priority] - order[right.priority]);
  return { findings, chain, conflicts, summary: `구조화된 항목 ${structure.fields.filter(field => field.status === '확인됨').length}/${structure.fields.length}개 · 확인된 문제 ${findings.length}건` };
}

// 문제가 있는 섹션만 보완 문장을 붙여 수정본을 만든다. 원본 배열과 확정 수치는 건드리지 않는다.
export function buildStructuralRevision(sections, findings) {
  const list = Array.isArray(sections) ? sections : [];
  const chosen = (Array.isArray(findings) ? findings : []).filter(item => item?.suggestion);
  const bySection = new Map();
  const unassigned = [];
  for (const item of chosen) {
    // 근거 문장이 실제로 들어 있는 문단만 수정 대상으로 삼는다. 근거가 두 곳이면 두 문단 모두 연결한다.
    const matched = matchSectionsForIssue(list, item);
    const sectionIds = matched.length ? matched : (list.length === 1 ? [list[0].id] : []);
    if (!sectionIds.length) { unassigned.push(item); continue; }
    for (const sectionId of sectionIds) bySection.set(sectionId, [...(bySection.get(sectionId) || []), item]);
  }
  const revised = list.map(section => {
    const items = bySection.get(section.id);
    if (!items?.length) return section;
    // 본문에는 보완 문장과 개선 방향만 넣는다. 계산으로 얻은 진단 수치는 분석 화면에만 남긴다.
    const block = items.map(item => `[보완안 · ${item.category}] ${item.suggestion}\n(개선 방향: ${item.direction})`).join('\n\n');
    return { ...section, content: `${section.content}\n\n${block}`.trim(), status: '확인 필요' };
  });
  return { sections: revised, changedSectionIds: [...bySection.keys()], unassigned };
}

// 작성 본문이 없을 때는 원문을 항목 단위 작업본으로 만들어 수정본을 만든다.
export function revisionFromProposalText(text, findings) {
  // 구조 분석과 같은 방식으로 문단을 나눠야 문제별 위치가 맞는다.
  const { sections } = analyzeProposalStructure(String(text || ''));
  const revision = buildStructuralRevision(sections, findings);
  return { ...revision, originalSections: sections, revisedText: proposalTextFromSections(revision.sections) };
}
