// 공고 선정논리(A) · 신청기관 정보(B) · 이번 사업 정보(C)를 분리해서 한 장의 「사업 설계도」를 만든다.
// 규칙 기반 로컬 처리만 하고 외부 API를 호출하지 않는다.
// 과거 사업의 인원·회기·기간·예산을 이번 사업 값으로 옮기지 않는다. 모르는 값은 만들지 않고 NEEDS_CONFIRMATION으로 남긴다.
import { CONFIRMED_STATUS, splitApplicantProfile } from './applicants.js';
import { recordRelevance } from './fit-matching.js';

// CONFIRMED = 공식 공고 또는 사용자가 확정한 값
// SUPPORTED = 확인된 기관정보 / 관련 실적으로 뒷받침 가능
// PROPOSED = AI가 제안한 설계안, 아직 사용자 확정 전
// NEEDS_CONFIRMATION = 사용자에게 반드시 확인해야 함
export const BLUEPRINT_STATUSES = ['CONFIRMED', 'SUPPORTED', 'PROPOSED', 'NEEDS_CONFIRMATION'];

// A. 공고 선정논리에서 가져오는 입력
const NOTICE_INPUTS = [
  { key: 'purpose', title: '목적' },
  { key: 'target', title: '대상' },
  { key: 'requiredContent', title: '필수 사업내용' },
  { key: 'eligibility', title: '자격' },
  { key: 'periodBudget', title: '예산/기간' },
  { key: 'outcomes', title: '성과 요구' },
  { key: 'evaluation', title: '평가항목' },
  { key: 'submissionItems', title: '필수 제출사항' }
];

// C. 이번 사업 정보. mustConfirm 항목은 사용자가 확정하기 전에는 값을 만들지 않는다.
export const PROJECT_FIELDS = [
  { key: 'name', title: '사업명', mustConfirm: false },
  { key: 'target', title: '대상', mustConfirm: false },
  { key: 'headcount', title: '인원', mustConfirm: true },
  { key: 'period', title: '기간', mustConfirm: true },
  { key: 'sessions', title: '회기', mustConfirm: true },
  { key: 'programs', title: '핵심 프로그램', mustConfirm: false },
  { key: 'staff', title: '수행인력', mustConfirm: true },
  { key: 'partners', title: '협력기관', mustConfirm: true },
  { key: 'budget', title: '예산', mustConfirm: true },
  { key: 'outcomeGoals', title: '성과목표', mustConfirm: true },
  { key: 'indicators', title: '성과지표', mustConfirm: false }
];

// 설계도 한 장의 최소 구조
export const BLUEPRINT_SECTIONS = [
  { key: 'summary', title: '사업 한 줄 정의' },
  { key: 'problem', title: '해결하려는 문제' },
  { key: 'target', title: '핵심 대상' },
  { key: 'purpose', title: '사업 목적' },
  { key: 'objectives', title: '세부 목표' },
  { key: 'programs', title: '핵심 프로그램' },
  { key: 'programDetails', title: '프로그램별 대상/회기/담당' },
  { key: 'delivery', title: '수행체계' },
  { key: 'strengths', title: '기관 강점을 활용하는 부분' },
  { key: 'partners', title: '필요한 협력' },
  { key: 'budget', title: '예산 구조' },
  { key: 'outcomeGoals', title: '성과목표' },
  { key: 'indicators', title: '성과지표/측정방법' },
  { key: 'requirementLinks', title: '공고 선정요건과의 연결' },
  { key: 'openItems', title: '아직 결정되지 않은 사항' }
];

// 수치는 확정값이 아니면 문장에 남기지 않는다. 과거 실적 수치가 설계값으로 새어 들어오는 통로를 막는다.
const QUANTITY = /\d[\d,]*\s*(?:명|인|회기|회|차시|시간|시수|분|원|천원|만원|억원|개소|개월|주간|주|년|일|%|퍼센트)/g;
function withoutQuantities(value) { return String(value || '').replace(QUANTITY, '[확인 필요]'); }
function clean(value, max = 300) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function shorten(value, max = 90) { const text = clean(value, max + 40); return text.length > max ? `${text.slice(0, max)}…` : text; }

const STOPWORDS = new Set(['사업', '지원', '기관', '내용', '경우', '해당', '관련', '통해', '위한', '있는', '있음', '대상', '제출', '작성', '확인', '필요', '수행']);
function tokensOf(value) {
  return [...new Set(String(value || '').replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/).filter(token => token.length > 1 && !STOPWORDS.has(token) && !/^\d+$/.test(token)))];
}

// 항목마다 실제로 그 내용을 담은 문장을 고른다. 첫 문장이 늘 그 항목의 문장은 아니다.
// 문장은 모두 공고 원문에서 오고, 어느 파일의 문장인지 함께 남긴다.
const SECTION_SENTENCE = {
  purpose: { want: [/사업\s*목적/, /목적\s*[:：○]/] },
  problem: { want: [/필요성|배경/, /학대|위기|취약|결손|어려움/] },
  target: { want: [/(?:지원|사업|참여|신청)\s*대상/, /대상으로/, /참여자|수혜자|이용자/], avoid: /주요\s*사업\s*내용/ },
  eligibility: { want: [/신청\s*자격/, /신청\s*유형/, /수행\s*기관|법인/] },
  requiredContent: { want: [/주요\s*사업\s*내용|사업\s*내용/, /프로그램|과업/] },
  periodBudget: { want: [/\d[\d,]{5,}\s*원/, /사업비|지원\s*한도|배분\s*금액|지원\s*금액/, /사업\s*기간|수행\s*기간/] },
  outcomes: { want: [/성과\s*(?:지표|목표|관리)/, /사전[\s·]*사후|만족도|척도|측정\s*도구/, /결과\s*보고|사후\s*관리/] },
  evaluation: { want: [/평가\s*(?:기준|항목)|심사\s*기준/, /배점|가점/] },
  submissionItems: { want: [/제출\s*(?:서류|항목|양식)/, /구비\s*서류|첨부\s*서류/] }
};

function noticeField(structure, key) {
  const field = (structure?.fields || []).find(item => item.key === key);
  if (!field || field.status !== '공식 근거 확인') return null;
  const toHit = entry => ({ source: entry.source, sentence: clean(entry.sentence, 300) });
  const own = (field.evidence || []).map(toHit);
  // 자료묶음이 크면 항목별 첫 문장이 다른 내용일 수 있다. 같은 공고 안의 다른 문장까지 후보로 본다.
  const others = (structure.fields || []).filter(entry => entry.key !== key).flatMap(entry => (entry.evidence || []).map(toHit));
  const rule = SECTION_SENTENCE[key];
  let best = null;
  if (rule) {
    for (const pool of [own, others]) {
      const allowed = rule.avoid ? pool.filter(entry => !rule.avoid.test(entry.sentence)) : pool;
      for (const want of rule.want) {
        best = allowed.find(entry => want.test(entry.sentence));
        if (best) break;
      }
      if (best) break;
    }
  }
  best = best || own[0];
  if (!best) return null;
  return { text: best.sentence, evidence: [best], title: field.title };
}

// 공고가 쓰는 ○·□ 글머리표를 기준으로 사업내용을 나눈다. 괄호 안 열거는 쪼개지 않는다.
function bulletsOf(value, limit = 3) {
  return clean(value, 400)
    .replace(/^[^:：]{0,12}[:：]\s*/, '')
    .split(/\s*[○●□▶◦※]\s*|\s*\d+\)\s*|\n+/)
    .map(part => clean(part, 90).replace(/^[-·\s]+/, ''))
    // 「주요사업내용」 같은 머리말 자체는 사업 항목이 아니다.
    .filter(part => part.length > 5 && !/^[가-힣\s]{2,10}(?:내용|목적|대상|기준|사항|개요)$/.test(part))
    .slice(0, limit);
}

function normalizeProjectValues(values) {
  const list = Array.isArray(values)
    ? values
    : Object.entries(values || {}).map(([key, value]) => ({ key, value }));
  const map = new Map();
  for (const entry of list) {
    if (!entry?.key || !String(entry.value ?? '').trim()) continue;
    map.set(entry.key, { value: clean(entry.value, 300), source: clean(entry.source || '사용자 확정', 80) });
  }
  return map;
}

// A / B / C 세 가지 입력을 분리해서 보여준다. 서로 섞지 않는다.
export function blueprintInputs(structure, applicant, fitResult, projectValues) {
  const split = splitApplicantProfile(applicant);
  const confirmed = projectValues instanceof Map ? projectValues : normalizeProjectValues(projectValues);
  const records = { DIRECT: [], RELATED: [], GENERAL: [] };
  for (const item of split.history) {
    const relevance = recordRelevance(item, structure);
    records[relevance.level].push({ label: item.label, value: item.status === CONFIRMED_STATUS ? item.value : '', status: item.status, source: item.source, asOf: item.asOf || '', hits: relevance.hits });
  }
  return {
    notice: NOTICE_INPUTS.map(input => {
      const field = noticeField(structure, input.key);
      return { key: input.key, title: input.title, confirmed: Boolean(field), value: field ? field.text : '', evidence: field ? field.evidence : [] };
    }),
    applicant: {
      name: applicant?.name || '',
      confirmedProfile: split.profile.filter(item => item.status === CONFIRMED_STATUS).map(item => ({ area: item.area, label: item.label, value: item.value, source: item.source, asOf: item.asOf || '' })),
      unconfirmedProfile: split.profile.filter(item => item.status !== CONFIRMED_STATUS).map(item => ({ area: item.area, label: item.label, status: item.status })),
      records,
      strengths: (fitResult?.strengths || []).map(match => ({ requirement: match.requirement, state: match.state, evidence: match.applicantEvidence })),
      gaps: (fitResult?.gaps || []).map(match => ({ requirement: match.requirement, state: match.state, gap: match.gap }))
    },
    project: PROJECT_FIELDS.map(field => {
      const hit = confirmed.get(field.key);
      return {
        key: field.key,
        title: field.title,
        value: hit ? hit.value : '',
        status: hit ? 'CONFIRMED' : 'NEEDS_CONFIRMATION',
        source: hit ? hit.source : '',
        note: hit ? '' : (field.mustConfirm ? '사용자가 확정하기 전에는 값을 만들지 않는다.' : '설계안으로 제안만 하고 확정은 사용자가 한다.')
      };
    }),
    rule: '공고 값·기관 값·이번 사업 값을 섞지 않는다. 과거 실적의 인원·회기·기간·예산은 이번 사업 값으로 복사하지 않는다.'
  };
}

function item(key, status, value, options = {}) {
  const section = BLUEPRINT_SECTIONS.find(entry => entry.key === key);
  return {
    key,
    title: section?.title || key,
    status,
    value,
    basis: options.basis || '',
    evidence: options.evidence || [],
    question: status === 'NEEDS_CONFIRMATION' || status === 'PROPOSED' ? (options.question || '') : ''
  };
}

// 확인된 기관 정보 중 특정 영역의 근거를 찾는다. 없으면 만들지 않는다.
function confirmedArea(split, areas) {
  return split.profile.filter(entry => areas.includes(entry.area) && entry.status === CONFIRMED_STATUS);
}

function buildItems(structure, applicant, fitResult, confirmed) {
  const split = splitApplicantProfile(applicant);
  const name = applicant?.name || '[신청기관 확인 필요]';
  const purpose = noticeField(structure, 'purpose');
  const problem = noticeField(structure, 'problem');
  const target = noticeField(structure, 'target');
  const content = noticeField(structure, 'requiredContent');
  const budget = noticeField(structure, 'periodBudget');
  const outcomes = noticeField(structure, 'outcomes');
  const useful = (fitResult?.recordRelevance || []).filter(record => record.level !== 'GENERAL' && record.status === CONFIRMED_STATUS);
  const items = [];

  // 1. 사업 한 줄 정의
  const nameValue = confirmed.get('name');
  if (nameValue) items.push(item('summary', 'CONFIRMED', nameValue.value, { basis: `사용자 확정 (${nameValue.source})` }));
  else if (target && content) {
    items.push(item('summary', 'PROPOSED', withoutQuantities(`${name}이(가) ${shorten(target.text, 60)} 대상으로 ${shorten(content.text, 70)}을(를) 수행하는 사업(가칭)`), {
      basis: '공고의 대상·필수 사업내용에서 도출한 설계안', evidence: [...target.evidence, ...content.evidence],
      question: '이 한 줄 정의와 사업명을 이대로 확정하시겠습니까? 확정 전에는 계획서 본문에 쓰지 않습니다.'
    }));
  } else items.push(item('summary', 'NEEDS_CONFIRMATION', '', { basis: '공고에서 대상·사업내용이 확인되지 않았습니다.', question: '이번 사업을 한 줄로 어떻게 정의하시겠습니까?' }));

  // 2. 해결하려는 문제
  if (problem) items.push(item('problem', 'CONFIRMED', problem.text, { basis: '공고 원문', evidence: problem.evidence }));
  else items.push(item('problem', 'NEEDS_CONFIRMATION', '', { basis: '공고에서 문제·필요성 문장을 찾지 못했습니다.', question: '이번 사업이 해결하려는 문제를 어떤 근거(지역 통계·사례·실태조사)로 제시하시겠습니까?' }));

  // 3. 핵심 대상
  const targetValue = confirmed.get('target');
  if (targetValue) items.push(item('target', 'CONFIRMED', targetValue.value, { basis: `사용자 확정 (${targetValue.source})` }));
  else if (target) items.push(item('target', 'CONFIRMED', target.text, { basis: '공고가 정한 대상', evidence: target.evidence }));
  else items.push(item('target', 'NEEDS_CONFIRMATION', '', { basis: '공고에서 대상이 확인되지 않았습니다.', question: '이번 사업의 핵심 대상은 누구입니까?' }));

  // 4. 사업 목적
  if (purpose) items.push(item('purpose', 'CONFIRMED', purpose.text, { basis: '공고 원문', evidence: purpose.evidence }));
  else items.push(item('purpose', 'NEEDS_CONFIRMATION', '', { basis: '공고에서 목적이 확인되지 않았습니다.', question: '이번 사업의 목적을 어떻게 잡으시겠습니까?' }));

  // 5. 세부 목표 — 공고의 필수 사업내용을 쪼갠 설계안일 뿐 확정값이 아니다.
  const objectiveSeeds = content ? bulletsOf(content.text, 3) : [];
  if (objectiveSeeds.length) {
    items.push(item('objectives', 'PROPOSED', objectiveSeeds.map(seed => withoutQuantities(`${seed} 관련 목표`)).join(' / '), {
      basis: '공고의 필수 사업내용에서 도출한 설계안', evidence: content.evidence,
      question: '세부 목표를 이 방향으로 확정하시겠습니까? 목표마다 달성 기준(수치)은 별도로 확인이 필요합니다.'
    }));
  } else items.push(item('objectives', 'NEEDS_CONFIRMATION', '', { basis: '공고 사업내용이 확인되지 않아 목표를 도출할 수 없습니다.', question: '세부 목표를 몇 개로, 어떤 기준으로 잡으시겠습니까?' }));

  // 6. 핵심 프로그램
  const programValue = confirmed.get('programs');
  const programSeeds = objectiveSeeds.slice(0, 3);
  const supportingRecords = useful.filter(record => programSeeds.some(seed => tokensOf(seed).some(token => `${record.label} ${record.value}`.includes(token))));
  if (programValue) items.push(item('programs', 'CONFIRMED', programValue.value, { basis: `사용자 확정 (${programValue.source})` }));
  else if (programSeeds.length && supportingRecords.length) {
    items.push(item('programs', 'SUPPORTED', withoutQuantities(programSeeds.join(' / ')), {
      basis: '공고 필수 사업내용 + 기관의 DIRECT/RELATED 실적으로 뒷받침 가능',
      evidence: [...(content?.evidence || []), ...supportingRecords.map(record => ({ source: record.source, sentence: `${record.label}: ${shorten(record.value, 80)}` }))],
      question: '이 프로그램 구성으로 확정하시겠습니까?'
    }));
  } else if (programSeeds.length) {
    items.push(item('programs', 'PROPOSED', withoutQuantities(programSeeds.join(' / ')), {
      basis: '공고 필수 사업내용에서 도출한 설계안. 이 프로그램을 수행한 기관 실적은 아직 확인되지 않았습니다.',
      evidence: content.evidence,
      question: '이 프로그램을 실제로 수행할 수 있습니까? 유사 프로그램 운영 실적이 있으면 신청기관 정보에 등록해 주세요.'
    }));
  } else items.push(item('programs', 'NEEDS_CONFIRMATION', '', { basis: '공고 사업내용이 확인되지 않았습니다.', question: '핵심 프로그램을 무엇으로 구성하시겠습니까?' }));

  // 7. 프로그램별 대상/회기/담당 — 회기·담당은 과거 실적에서 가져오지 않는다.
  const sessions = confirmed.get('sessions');
  const staff = confirmed.get('staff');
  const headcount = confirmed.get('headcount');
  const detailRows = (programValue ? [programValue.value] : programSeeds).map(program => ({
    program: shorten(withoutQuantities(program), 60),
    target: targetValue?.value || (target ? shorten(target.text, 50) : '[확인 필요]'),
    headcount: headcount?.value || '[확인 필요]',
    sessions: sessions?.value || '[확인 필요]',
    owner: staff?.value || '[확인 필요]'
  }));
  const detailReady = detailRows.length > 0 && sessions && staff && headcount;
  items.push(item('programDetails', detailReady ? 'CONFIRMED' : 'NEEDS_CONFIRMATION',
    detailRows.map(row => `${row.program} — 대상 ${row.target} / 인원 ${row.headcount} / 회기 ${row.sessions} / 담당 ${row.owner}`).join('\n'), {
      basis: detailReady ? '사용자 확정' : '회기·인원·담당 인력은 확정된 값이 없습니다. 과거 사업의 수치를 옮기지 않았습니다.',
      question: '프로그램별 인원·회기·담당 인력을 확정해 주시겠습니까? (과거 사업 수치를 그대로 쓰지 않습니다)'
    }));

  // 8. 수행체계
  const staffItems = confirmedArea(split, ['staff']);
  if (staff) items.push(item('delivery', 'CONFIRMED', staff.value, { basis: `사용자 확정 (${staff.source})` }));
  else if (staffItems.length) {
    items.push(item('delivery', 'SUPPORTED', staffItems.map(entry => `${entry.label}: ${shorten(entry.value, 60)}`).join(' / '), {
      basis: '확인된 기관 인력 정보로 뒷받침 가능', evidence: staffItems.map(entry => ({ source: entry.source, sentence: `${entry.label}: ${shorten(entry.value, 80)}` })),
      question: '이번 사업의 전담 인력과 역할 분담을 이 인력 기준으로 확정하시겠습니까?'
    }));
  } else items.push(item('delivery', 'NEEDS_CONFIRMATION', '', { basis: '확인된 기관 인력 정보가 없어 수행체계를 만들지 않았습니다.', question: '이번 사업을 수행할 인력(자격·경력·전담 여부)은 누구입니까? 전문인력 요건이 있다면 함께 확인이 필요합니다.' }));

  // 9. 기관 강점을 활용하는 부분
  const strengthMatches = (fitResult?.strengths || []).filter(match => (match.applicantEvidence || []).some(entry => entry.relevance !== 'GENERAL'));
  if (strengthMatches.length) {
    items.push(item('strengths', 'SUPPORTED', strengthMatches.map(match => `${match.requirement}: ${match.emphasis}`).join(' / '), {
      basis: '적합성 매칭에서 확인된 기관 근거', evidence: strengthMatches.flatMap(match => (match.applicantEvidence || []).slice(0, 1).map(entry => ({ source: entry.source, sentence: `${entry.label} (${entry.relevance || entry.scope})` })))
    }));
  } else items.push(item('strengths', 'NEEDS_CONFIRMATION', '', { basis: '이 공고의 대상·사업내용과 직접 연결되는 확인된 실적이 없습니다.', question: '공고 대상·사업방식과 같은 실적(예: 해당 대상 개입 경험)이 있습니까? 있으면 근거 문서와 함께 등록해 주세요.' }));

  // 10. 필요한 협력 — 협력기관 이름을 만들지 않는다.
  const partnerValue = confirmed.get('partners');
  const partnerItems = confirmedArea(split, ['partners']);
  if (partnerValue) items.push(item('partners', 'CONFIRMED', partnerValue.value, { basis: `사용자 확정 (${partnerValue.source})` }));
  else if (partnerItems.length) {
    items.push(item('partners', 'SUPPORTED', partnerItems.map(entry => `${entry.label}: ${shorten(entry.value, 60)}`).join(' / '), {
      basis: '확인된 협력기관 정보', evidence: partnerItems.map(entry => ({ source: entry.source, sentence: `${entry.label}: ${shorten(entry.value, 80)}` })),
      question: '이번 사업에서 이 협력기관과 어떤 역할을 나누실지 확정해 주시겠습니까?'
    }));
  } else items.push(item('partners', 'NEEDS_CONFIRMATION', '', { basis: '확인된 협력기관 정보가 없어 기관명을 만들지 않았습니다.', question: '이번 사업에 필요한 협력(연계·의뢰·자문) 기관이 있습니까? 협약 여부와 함께 알려 주세요.' }));

  // 11. 예산 구조 — 공고 한도는 공식 값이지만 이번 사업 배분은 사용자 확정 사항이다.
  const budgetValue = confirmed.get('budget');
  if (budgetValue) items.push(item('budget', 'CONFIRMED', budgetValue.value, { basis: `사용자 확정 (${budgetValue.source})`, evidence: budget?.evidence || [] }));
  else items.push(item('budget', 'NEEDS_CONFIRMATION', budget ? `공고 기준: ${shorten(budget.text, 120)} / 이번 사업 배분: [확인 필요]` : '', {
    basis: budget ? '공고의 한도만 확인되었고 이번 사업의 예산 배분은 정해지지 않았습니다.' : '공고에서 예산 기준을 찾지 못했습니다.',
    evidence: budget?.evidence || [],
    question: '이번 사업의 총 사업비와 항목별 배분(인건비·프로그램비·운영비)을 확정해 주시겠습니까? 과거 사업 예산을 그대로 쓰지 않습니다.'
  }));

  // 12. 성과목표
  const goalValue = confirmed.get('outcomeGoals');
  if (goalValue) items.push(item('outcomeGoals', 'CONFIRMED', goalValue.value, { basis: `사용자 확정 (${goalValue.source})` }));
  else items.push(item('outcomeGoals', 'NEEDS_CONFIRMATION', outcomes ? `공고 요구: ${shorten(outcomes.text, 120)} / 이번 사업 목표치: [확인 필요]` : '', {
    basis: outcomes ? '공고의 성과 요구만 확인되었고 목표 수치는 정해지지 않았습니다.' : '공고에서 성과 요구를 찾지 못했습니다.',
    evidence: outcomes?.evidence || [],
    question: '이번 사업의 성과목표(대상 수·변화 정도)를 어떤 수치로 잡으시겠습니까?'
  }));

  // 13. 성과지표/측정방법
  const indicatorValue = confirmed.get('indicators');
  const measurementItems = confirmedArea(split, ['measurement']);
  const measurementRecords = (fitResult?.recordRelevance || []).filter(record => /성과\s*측정|사전|사후|척도|검사|만족도/.test(`${record.label} ${record.value}`) && record.status === CONFIRMED_STATUS);
  if (indicatorValue) items.push(item('indicators', 'CONFIRMED', indicatorValue.value, { basis: `사용자 확정 (${indicatorValue.source})` }));
  else if (measurementItems.length || measurementRecords.length) {
    const evidence = [...measurementItems, ...measurementRecords].slice(0, 3).map(entry => ({ source: entry.source, sentence: `${entry.label}: ${shorten(entry.value, 80)}` }));
    items.push(item('indicators', 'SUPPORTED', withoutQuantities(outcomes ? `${shorten(outcomes.text, 100)} 기준의 사전·사후 측정` : '사전·사후 측정'), {
      basis: '기관의 확인된 성과측정 경험으로 방법은 뒷받침 가능하나 지표·도구·시점은 확정 전입니다.', evidence,
      question: '성과지표와 측정도구(척도명), 측정 시점을 확정해 주시겠습니까?'
    }));
  } else items.push(item('indicators', 'NEEDS_CONFIRMATION', outcomes ? `공고 요구: ${shorten(outcomes.text, 100)}` : '', {
    basis: '확인된 성과측정 경험이 없어 측정 방법을 만들지 않았습니다.', evidence: outcomes?.evidence || [],
    question: '성과를 어떤 지표와 도구로 측정하시겠습니까?'
  }));
  return items;
}

// 문제 → 대상 → 목적 → 프로그램 → 회기/인력 → 예산 → 성과목표 → 성과지표
// 앞부분은 내용이 이어지는지, 뒷부분은 규모·측정이 실제로 채워졌는지 본다.
const CHAIN = [
  { from: 'problem', to: 'target', check: 'content' },
  { from: 'target', to: 'purpose', check: 'content' },
  { from: 'purpose', to: 'programs', check: 'content' },
  { from: 'programs', to: 'programDetails', check: 'content' },
  { from: 'programDetails', to: 'budget', check: 'amount', want: /\d[\d,]{4,}\s*(?:원|천원|만원|억원)/, ask: '프로그램 규모에 맞는 총 사업비와 항목별 금액이 예산 구조에 들어가야 합니다. 금액을 확정해 주시겠습니까?' },
  { from: 'budget', to: 'outcomeGoals', check: 'amount', want: /\d/, ask: '예산 규모에 대응하는 성과목표(대상 수·변화 정도)를 수치로 확정해 주시겠습니까?' },
  { from: 'outcomeGoals', to: 'indicators', check: 'amount', want: /검사|척도|설문|조사|만족도|기록|관찰|평가/, ask: '성과목표를 무엇으로 측정할지(검사·척도·설문 등) 확정해 주시겠습니까?' }
];

// 한국어는 조사가 붙어 낱말이 그대로 겹치지 않는다. 두 글자 단위로 겹침을 본다.
function bigramsOf(value) {
  const set = new Set();
  for (const token of tokensOf(value)) {
    if (token.length === 2) { set.add(token); continue; }
    for (let index = 0; index + 2 <= token.length; index += 1) set.add(token.slice(index, index + 2));
  }
  return set;
}

export function checkBlueprintLogic(items) {
  const byKey = new Map(items.map(entry => [entry.key, entry]));
  const links = [];
  for (const step of CHAIN) {
    const from = byKey.get(step.from);
    const to = byKey.get(step.to);
    if (!from || !to) continue;
    const label = `${from.title} → ${to.title}`;
    const blocked = [from, to].filter(entry => entry.status === 'NEEDS_CONFIRMATION' || !entry.value);
    if (blocked.length) {
      links.push({ link: label, state: '설계 보완 필요', reason: `${blocked.map(entry => entry.title).join(' · ')}이(가) 아직 확정되지 않아 연결을 확인할 수 없습니다.`, question: blocked.map(entry => entry.question).filter(Boolean)[0] || `${blocked[0].title}을(를) 먼저 확정해 주시겠습니까?` });
      continue;
    }
    const proposed = [from, to].some(entry => entry.status === 'PROPOSED');
    if (step.check === 'amount') {
      if (!step.want.test(to.value)) {
        links.push({ link: label, state: '설계 보완 필요', reason: `${to.title}에 앞 항목을 뒷받침하는 규모·측정 내용이 없습니다.`, question: step.ask });
        continue;
      }
      links.push({ link: label, state: proposed ? '잠정 연결' : '연결됨', reason: `${to.title}에 규모·측정 내용이 들어 있습니다${proposed ? ' (설계안 기준이라 확정 후 다시 확인해야 합니다)' : ''}.`, question: '' });
      continue;
    }
    // 같은 공고 문장을 두 항목에 그대로 옮겨 놓은 것은 연결이 아니다.
    if (clean(from.value, 400) === clean(to.value, 400)) {
      links.push({ link: label, state: '설계 보완 필요', reason: '두 항목이 공고의 같은 문장으로 채워져 있어 서로 다른 내용으로 구분되지 않았습니다.', question: `${from.title}과(와) ${to.title}을(를) 각각 이번 사업 기준으로 구분해 주시겠습니까?` });
      continue;
    }
    const target = bigramsOf(to.value);
    const shared = [...bigramsOf(from.value)].filter(gram => target.has(gram));
    if (!shared.length) {
      links.push({ link: label, state: '설계 보완 필요', reason: '앞 항목의 내용이 뒤 항목에 이어지지 않습니다. 같은 대상·같은 내용으로 연결되는지 확인이 필요합니다.', question: `${from.title}과(와) ${to.title}이(가) 같은 대상·같은 내용을 가리키는지 확인해 주시겠습니까?` });
      continue;
    }
    links.push({ link: label, state: proposed ? '잠정 연결' : '연결됨', reason: `공통 요소: ${shared.slice(0, 4).join(' · ')}${proposed ? ' (설계안 기준이라 확정 후 다시 확인해야 합니다)' : ''}`, question: '' });
  }
  return links;
}

// 공고 선정요건 11개가 설계도의 어디로 대응되는지, 기관 근거가 있는지, 무엇이 부족한지 연결한다.
const REQUIREMENT_TO_SECTIONS = {
  purpose: ['purpose', 'summary'],
  problem: ['problem'],
  target: ['target'],
  eligibility: ['delivery'],
  requiredContent: ['programs', 'programDetails'],
  submissionItems: [],
  periodBudget: ['budget'],
  evaluation: ['strengths', 'indicators'],
  outcomes: ['outcomeGoals', 'indicators'],
  selectionFactors: ['strengths', 'partners'],
  riskFactors: []
};

export function linkRequirements(items, fitResult) {
  const byKey = new Map(items.map(entry => [entry.key, entry]));
  return (fitResult?.matches || []).map(match => {
    const sections = (REQUIREMENT_TO_SECTIONS[match.key] || []).map(key => byKey.get(key)).filter(Boolean);
    const useful = sections.filter(section => section.status !== 'NEEDS_CONFIRMATION' && section.value);
    const hasApplicantEvidence = (match.applicantEvidence || []).some(entry => entry.status === CONFIRMED_STATUS && entry.relevance !== 'GENERAL');
    return {
      requirement: match.requirement,
      key: match.key,
      fitState: match.state,
      sections: sections.map(section => ({ key: section.key, title: section.title, status: section.status })),
      covered: useful.length > 0,
      hasApplicantEvidence,
      gap: useful.length
        ? (hasApplicantEvidence ? '' : '설계로는 대응했지만 기관 근거가 아직 없습니다.')
        : (sections.length ? '설계도에서 아직 확정된 대응 항목이 없습니다.' : '설계도 항목이 아니라 제출 준비 단계에서 확인해야 합니다.'),
      question: useful.length ? '' : (sections[0]?.question || match.question || '')
    };
  });
}

const CORE_SECTIONS = ['target', 'programs', 'programDetails', 'budget', 'outcomeGoals', 'indicators'];

export function buildBlueprint({ structure, applicant, fitResult, projectValues } = {}) {
  const confirmed = normalizeProjectValues(projectValues);
  const inputs = blueprintInputs(structure, applicant, fitResult, confirmed);
  const items = buildItems(structure, applicant, fitResult, confirmed);
  const logic = checkBlueprintLogic(items);
  const requirementLinks = linkRequirements(items, fitResult);

  const covered = requirementLinks.filter(link => link.covered);
  const openItems = items.filter(entry => entry.status === 'NEEDS_CONFIRMATION');
  items.push(item('requirementLinks', covered.length === requirementLinks.length && requirementLinks.length > 0 ? 'SUPPORTED' : 'NEEDS_CONFIRMATION',
    `선정요건 ${requirementLinks.length}개 중 설계로 대응 ${covered.length}개 · 기관 근거까지 있는 항목 ${requirementLinks.filter(link => link.hasApplicantEvidence).length}개`,
    { basis: '적합성 매칭 결과와 설계도 항목을 연결한 결과', question: '대응되지 않은 선정요건을 어떻게 채우시겠습니까?' }));
  items.push(item('openItems', openItems.length ? 'NEEDS_CONFIRMATION' : 'CONFIRMED',
    openItems.length ? openItems.map(entry => entry.title).join(' / ') : '없음',
    { basis: openItems.length ? '아래 항목은 사용자 확인 전까지 계획서 본문에 쓰지 않습니다.' : '확인이 필요한 항목이 없습니다.', question: openItems.length ? '위 항목들을 확정해 주시겠습니까?' : '' }));

  const byStatus = Object.fromEntries(BLUEPRINT_STATUSES.map(status => [status, items.filter(entry => entry.status === status).length]));
  const brokenLinks = logic.filter(link => link.state === '설계 보완 필요');
  const coreOpen = items.filter(entry => CORE_SECTIONS.includes(entry.key) && entry.status === 'NEEDS_CONFIRMATION');
  const ready = brokenLinks.length === 0 && coreOpen.length === 0;
  const questions = [
    ...items.filter(entry => entry.question).map(entry => ({ section: entry.title, status: entry.status, question: entry.question })),
    ...brokenLinks.filter(link => link.question).map(link => ({ section: link.link, status: '설계 보완 필요', question: link.question }))
  ];
  const seen = new Set();
  const openQuestions = questions.filter(entry => !seen.has(entry.question) && seen.add(entry.question));

  return {
    noticeTitle: structure?.noticeTitle || '',
    applicantName: applicant?.name || '',
    inputs,
    items,
    byStatus,
    logic,
    requirementLinks,
    openQuestions,
    readyToWrite: ready,
    verdict: ready ? '계획서 본문 작성 가능' : '설계 보완 필요',
    verdictReasons: [
      ...(coreOpen.length ? [`핵심 설계 항목이 확정되지 않았습니다: ${coreOpen.map(entry => entry.title).join(' · ')}`] : []),
      ...(brokenLinks.length ? [`논리 연결이 끊어진 구간 ${brokenLinks.length}개: ${brokenLinks.map(link => link.link).join(' · ')}`] : []),
      ...(ready ? ['문제 → 대상 → 프로그램 → 성과 연결이 모두 확인되었습니다.'] : [])
    ],
    rule: 'PROPOSED 값은 사용자가 확정하기 전까지 확정 사실처럼 계획서에 쓰지 않는다. 과거 사업의 인원·회기·기간·예산은 이번 사업 값으로 복사하지 않는다. 모르는 기관 사실(전문인력·협력기관·특정 대상 개입 경험)은 만들지 않고 NEEDS_CONFIRMATION으로 남긴다.'
  };
}
