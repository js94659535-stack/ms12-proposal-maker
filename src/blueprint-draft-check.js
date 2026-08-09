// V1 초안이 사업 설계도를 실제로 따랐는지 자동 점검한다.
// 규칙 기반 로컬 비교만 하고 외부 API를 호출하지 않는다. V1 원문은 읽기만 하고 수정하지 않는다.
import { CONFIRMED_STATUS, splitApplicantProfile } from './applicants.js';

export const DRAFT_CHECK_STATES = ['PASS', '주의', 'FAIL'];
const QUANTITY = /\d[\d,]*\s*(?:명|인|회기|회|차시|시간|개월|주|원)/g;
const STOPWORDS = new Set(['사업', '지원', '기관', '내용', '경우', '해당', '관련', '통해', '위한', '있는', '대상', '제출', '작성', '확인', '필요', '수행', '운영', '제공']);

function textOf(sections) { return (sections || []).map(section => `${section.title || ''}\n${section.body || section.content || ''}`).join('\n\n'); }
// 10개 항목의 표준 순서. 생성 결과가 id 대신 번호를 쓰더라도 같은 자리를 찾는다.
const SECTION_ORDER = ['necessity', 'purpose', 'goals', 'target', 'programs', 'schedule', 'roles', 'budget', 'indicators', 'outcomes'];
function sectionText(sections, id) {
  const list = sections || [];
  const byId = list.find(section => section.id === id);
  const index = SECTION_ORDER.indexOf(id);
  const found = byId || (list.length === SECTION_ORDER.length && index >= 0 ? list[index] : null);
  return found ? `${found.title || ''} ${found.body || found.content || ''}` : '';
}
function tokensOf(value) {
  return [...new Set(String(value || '').replace(/[^가-힣A-Za-z0-9]/g, ' ').split(/\s+/).filter(token => token.length > 1 && !STOPWORDS.has(token) && !/^\d+$/.test(token)))];
}
function bigramsOf(value) {
  const set = new Set();
  for (const token of tokensOf(value)) {
    if (token.length === 2) { set.add(token); continue; }
    for (let index = 0; index + 2 <= token.length; index += 1) set.add(token.slice(index, index + 2));
  }
  return set;
}
function itemOf(blueprint, key) { return (blueprint?.items || []).find(item => item.key === key) || null; }
function check(name, state, detail, evidence = []) { return { name, state, detail, evidence }; }
// 12회기 안의 '2회'처럼 다른 수치의 일부를 같은 값으로 세지 않는다.
function containsNumber(text, number) {
  const escaped = String(number).replace(/[.*+?^${}()|[\]\\]/g, match => `\\${match}`).replace(/\s+/g, '\\s*');
  return new RegExp(`(?<![\\d,])${escaped}`).test(text);
}

// 문제 → 대상 → 프로그램 → 성과 연결을 V1 본문에서 다시 확인한다.
const CHAIN = [['necessity', '사업 필요성'], ['target', '대상'], ['programs', '세부 프로그램'], ['indicators', '성과지표']];

// 설계도 항목이 V1의 어느 계획서 항목에 해당하는지. 미확정 항목을 그 자리에서 추적하기 위한 대응표다.
export const BLUEPRINT_SECTION_MAP = {
  summary: 'purpose', problem: 'necessity', target: 'target', purpose: 'purpose', objectives: 'goals',
  programs: 'programs', programDetails: 'programs', delivery: 'roles', strengths: 'roles', partners: 'roles',
  budget: 'budget', outcomeGoals: 'goals', indicators: 'indicators'
};
export const UNRESOLVED_MARK = '[확인 필요]';

// 선택하지 않은 유형이 설계 문장으로 쓰였는지만 본다. 근거 인용·충돌 설명·유형 구분 문장은 제외한다.
const EXPLANATORY = /충돌|근거|공고|제외|해당하지|아니라|구분|비교|참고/;
const TYPE_MARKERS = { 아동보호형: ['요보호아동'] };
export function designSentencesUsing(sections, option, selected) {
  const markers = [option.name, ...(TYPE_MARKERS[option.name] || [])];
  return (sections || [])
    .flatMap(section => String(section.content || section.body || '').split(/(?<=[.!?])\s+|\n+/))
    .filter(sentence => markers.some(marker => sentence.includes(marker)))
    .filter(sentence => !sentence.includes(selected) && !EXPLANATORY.test(sentence));
}

// AI 원본 V1은 바꾸지 않는다. 표시용 사본에만 미확정 표시를 붙인다.
export function annotateDraftSections({ blueprint, sections } = {}) {
  const open = (blueprint?.items || []).filter(item => item.status === 'NEEDS_CONFIRMATION' && BLUEPRINT_SECTION_MAP[item.key]);
  const list = sections || [];
  return list.map((section, index) => {
    const key = section.id && SECTION_ORDER.includes(section.id) ? section.id : (list.length === SECTION_ORDER.length ? SECTION_ORDER[index] : section.id);
    const fromBlueprint = open.filter(item => BLUEPRINT_SECTION_MAP[item.key] === key).map(item => item.title);
    const markedInText = /\[확인 필요/.test(section.content || section.body || '');
    const unresolved = Boolean(fromBlueprint.length) || markedInText || section.status === '확인 필요';
    return {
      ...section,
      sectionKey: key,
      // 본문은 AI 원본 그대로 두고 상태만 덧붙인다.
      unresolved,
      unresolvedFrom: fromBlueprint,
      displayStatus: unresolved ? UNRESOLVED_MARK : (section.status || '확정'),
      markedInText
    };
  });
}

// 공고의 최소·최대 기준과 사용자가 확정한 이번 사업 값이 어긋나는지 본다. 어느 쪽도 자동으로 고치지 않는다.
const OFFICIAL_MIN = /(\d[\d,]*)\s*(명|회기|회|시간|개월|개소)\s*(이상)/g;
const OFFICIAL_MAX = /(\d[\d,]*)\s*(명|회기|회|시간|개월|개소|원)\s*(이내|이하)/g;
const number = value => Number(String(value).replace(/,/g, ''));
// 이번 사업 값 중 공고 기준과 같은 뜻으로 비교할 수 있는 단위만 본다.
const COMPARABLE_UNITS = { headcount: ['명'], sessions: ['회기', '회'], period: ['개월'], budget: ['원'] };
// 근거 문장은 기준 표현이 보이는 부분을 잘라서 보여준다.
function evidenceWindow(sentence, phrase) {
  const index = sentence.indexOf(phrase);
  if (index < 0) return sentence.slice(0, 220);
  const start = Math.max(0, index - 60);
  return `${start ? '…' : ''}${sentence.slice(start, index + phrase.length + 80)}`;
}

export function officialRequirementConflicts(structure, projectValues = []) {
  const sentences = (structure?.fields || []).flatMap(field => (field.evidence || []).map(entry => ({ source: entry.source, sentence: String(entry.sentence || '').replace(/\s+/g, ' ') })));
  const rules = [];
  for (const entry of sentences) {
    for (const pattern of [OFFICIAL_MIN, OFFICIAL_MAX]) {
      pattern.lastIndex = 0;
      for (const match of entry.sentence.matchAll(pattern)) {
        rules.push({ amount: number(match[1]), unit: match[2], bound: match[3], phrase: match[0], sentence: entry.sentence, source: entry.source });
      }
    }
  }
  const conflicts = [];
  for (const value of projectValues) {
    if (!value?.value) continue;
    // 같은 단위라도 뜻이 다른 값(참여자 수 vs 인력 수)은 비교하지 않는다.
    const allowed = COMPARABLE_UNITS[value.blueprintKey || value.key] || [];
    if (!allowed.length) continue;
    for (const match of String(value.value).matchAll(/(\d[\d,]*)\s*(명|회기|회|시간|개월|개소)/g)) {
      const userAmount = number(match[1]);
      const unit = match[2];
      if (!allowed.includes(unit)) continue;
      for (const rule of rules.filter(item => item.unit === unit)) {
        const violatesMin = rule.bound === '이상' && userAmount < rule.amount;
        const violatesMax = (rule.bound === '이내' || rule.bound === '이하') && userAmount > rule.amount;
        if (!violatesMin && !violatesMax) continue;
        const key = `${value.label || value.key}|${rule.amount}${unit}${rule.bound}|${userAmount}${unit}`;
        if (conflicts.some(item => item.key === key)) continue;
        conflicts.push({
          key,
          type: 'OFFICIAL_REQUIREMENT_CONFLICT',
          field: value.label || value.key,
          officialValue: `${rule.amount.toLocaleString()}${unit} ${rule.bound}`,
          userValue: `${match[0]} (${value.value})`,
          officialEvidence: { source: rule.source, sentence: evidenceWindow(rule.sentence, rule.phrase) },
          question: `공고는 ${rule.amount.toLocaleString()}${unit} ${rule.bound}을 요구하는데 이번 사업 확정값은 ${match[0]}입니다. 어느 쪽으로 확정하시겠습니까? (공고 기준에 맞춰 ${value.label || value.key}을 조정하거나, 조정이 불가능한 사유를 확인해야 합니다.)`
        });
      }
    }
  }
  return conflicts;
}

export function checkDraftAgainstBlueprint({ blueprint, sections, applicant, structure, projectValues = [], conflicts: givenConflicts } = {}) {
  const checks = [];
  if (!blueprint || !(sections || []).length) return { checks: [check('점검 가능 여부', 'FAIL', '설계도 또는 V1 초안이 없어 점검할 수 없습니다.')], byState: { PASS: 0, 주의: 0, FAIL: 1 }, verdict: '점검 불가' };
  const draft = textOf(sections);
  const split = splitApplicantProfile(applicant || { items: [] });

  // 1. 선택한 신청유형만 사용
  const selected = blueprint.applicationTypes?.selected || '';
  const others = (blueprint.applicationTypes?.options || []).filter(option => option.name !== selected);
  if (!blueprint.applicationTypes?.options?.length) checks.push(check('신청유형', 'PASS', '공고에 신청유형 구분이 없습니다.'));
  else if (!selected) checks.push(check('신청유형', 'FAIL', '신청유형을 고르지 않은 채 작성했습니다.'));
  else {
    // 선택하지 않은 유형의 대상조건·사업내용이 설계 문장으로 들어간 경우만 혼입으로 본다.
    // 공식 근거 인용·충돌 설명·유형 구분을 위한 언급은 혼입이 아니다(서버 mixedTypeInSections와 같은 기준).
    const mixed = others.filter(option => designSentencesUsing(sections, option, selected).length > 0);
    checks.push(mixed.length
      ? check('다른 신청유형 혼입', 'FAIL', `선택하지 않은 유형 내용이 섞였습니다: ${mixed.map(option => option.name).join(' · ')}`, mixed.map(option => option.name))
      : check('신청유형', 'PASS', `${selected}만 사용했습니다.`));
  }

  // 2. 공고 필수 사업내용 반영
  const required = itemOf(blueprint, 'programs');
  const requiredTokens = tokensOf(required?.value).filter(token => token.length >= 2).slice(0, 12);
  const missingRequired = requiredTokens.filter(token => !draft.includes(token));
  checks.push(requiredTokens.length && missingRequired.length > requiredTokens.length / 2
    ? check('공고 필수 사업내용', 'FAIL', `설계도의 사업내용 핵심어 ${missingRequired.length}/${requiredTokens.length}개가 V1에 없습니다.`, missingRequired.slice(0, 6))
    : check('공고 필수 사업내용', 'PASS', `핵심어 ${requiredTokens.length - missingRequired.length}/${requiredTokens.length}개가 V1에 반영되었습니다.`));

  // 3. 사용자가 확정한 이번 사업 값 보존
  const confirmedValues = (blueprint.inputs?.project || []).filter(entry => entry.status === 'CONFIRMED' && entry.value);
  const lostValues = confirmedValues.filter(entry => !tokensOf(entry.value).some(token => draft.includes(token)) && !String(entry.value).match(QUANTITY)?.some(number => containsNumber(draft, number)));
  checks.push(lostValues.length
    ? check('사용자 확정값 보존', '주의', `확정값 ${lostValues.length}건이 V1에서 확인되지 않습니다: ${lostValues.map(entry => entry.title).join(' · ')}`, lostValues.map(entry => `${entry.title}=${entry.value}`))
    : check('사용자 확정값 보존', 'PASS', `확정값 ${confirmedValues.length}건이 V1에 남아 있습니다.`));

  // 4. 기관의 확인된 정보만 사용 (확인 필요 정보를 사실처럼 쓰지 않음)
  const unverifiedUsed = split.profile.filter(item => item.status !== CONFIRMED_STATUS && String(item.value).length > 4 && draft.includes(String(item.value)));
  checks.push(unverifiedUsed.length
    ? check('확인되지 않은 기관정보 사용', 'FAIL', `확인 필요 상태 기관정보가 사실처럼 쓰였습니다: ${unverifiedUsed.map(item => item.label).join(' · ')}`, unverifiedUsed.map(item => item.label))
    : check('기관 확인정보만 사용', 'PASS', `확인 필요 기관정보가 V1에 사실로 쓰이지 않았습니다.`));

  // 5. 설계안(PROPOSED)이 확정 사실로 둔갑하지 않음 — 설계안 항목의 수치가 V1에서 확정 수치로 나타나면 문제
  const proposedNumbers = (blueprint.items || [])
    .filter(item => item.status === 'PROPOSED')
    .flatMap(item => (String(item.value).match(QUANTITY) || []).map(number => ({ item: item.title, number })))
    .filter(entry => containsNumber(draft, entry.number));
  checks.push(proposedNumbers.length
    ? check('설계안의 사실 둔갑', 'FAIL', `설계안 수치가 V1에서 확정값처럼 쓰였습니다: ${proposedNumbers.map(entry => `${entry.item} ${entry.number}`).join(' · ')}`, proposedNumbers.map(entry => entry.number))
    : check('설계안 처리', 'PASS', '설계안이 확정 수치로 바뀌지 않았습니다.'));

  // 6. 미확정 값은 [확인 필요] — 본문 표기 또는 구조화 단계의 표시로 추적 가능해야 한다.
  const openItems = (blueprint.items || []).filter(item => item.status === 'NEEDS_CONFIRMATION' && !['requirementLinks', 'openItems'].includes(item.key));
  const marks = (draft.match(/\[확인 필요[^\]]*\]/g) || []).length;
  const annotated = annotateDraftSections({ blueprint, sections });
  const markedSections = annotated.filter(section => section.unresolved);
  const trackedTitles = new Set(annotated.flatMap(section => section.unresolvedFrom));
  // 초안에 그 항목 자체가 있는데도 표시되지 않은 경우만 실패로 본다.
  const presentKeys = new Set(annotated.map(section => section.sectionKey));
  const untracked = openItems.filter(item => BLUEPRINT_SECTION_MAP[item.key] && presentKeys.has(BLUEPRINT_SECTION_MAP[item.key]) && !trackedTitles.has(item.title));
  checks.push(openItems.length && untracked.length
    ? check('미확정 값 표기', 'FAIL', `설계도 미확정 ${untracked.length}건이 V1 어느 항목에도 표시되지 않았습니다.`, untracked.map(item => item.title))
    : check('미확정 값 표기', 'PASS', `미확정 ${openItems.length}건 · [확인 필요] 표시 항목 ${markedSections.length}개 (본문 표기 ${marks}곳 · 구조화 표시 ${markedSections.length - annotated.filter(section => section.markedInText).length}개)`));

  // 7. 과거 사업 수치 유입
  const pastNumbers = [...new Set(split.history.flatMap(item => String(item.value).match(QUANTITY) || []))];
  const leaked = pastNumbers.filter(number => containsNumber(draft, number));
  checks.push(leaked.length
    ? check('과거 사업 수치 유입', 'FAIL', `과거 사업의 수치가 V1에 그대로 들어왔습니다: ${leaked.join(' · ')}`, leaked)
    : check('과거 사업 수치 유입', 'PASS', `과거 수치 ${pastNumbers.length}건이 이번 사업 값으로 옮겨지지 않았습니다.`));

  // 8. 문제 → 대상 → 프로그램 → 성과 논리 연결
  const links = [];
  for (let index = 0; index < CHAIN.length - 1; index += 1) {
    const [fromId, fromTitle] = CHAIN[index];
    const [toId, toTitle] = CHAIN[index + 1];
    const from = sectionText(sections, fromId);
    const to = sectionText(sections, toId);
    if (!from || !to) { links.push({ link: `${fromTitle} → ${toTitle}`, state: '확인 불가', shared: [] }); continue; }
    const target = bigramsOf(to);
    const shared = [...bigramsOf(from)].filter(gram => target.has(gram));
    links.push({ link: `${fromTitle} → ${toTitle}`, state: shared.length ? '연결됨' : '끊김', shared: shared.slice(0, 4) });
  }
  const broken = links.filter(link => link.state !== '연결됨');
  checks.push(broken.length
    ? check('논리 연결', '주의', `연결이 약한 구간: ${broken.map(link => link.link).join(' · ')}`, links.map(link => `${link.link}=${link.state}`))
    : check('논리 연결', 'PASS', links.map(link => `${link.link} 연결됨`).join(' · ')));

  // 9. 설계도와 V1의 핵심 수치 충돌
  const valueConflicts = [];
  for (const entry of confirmedValues) {
    for (const value of String(entry.value).match(QUANTITY) || []) {
      const unit = value.replace(/[\d,\s]/g, '');
      if (!unit) continue;
      const draftNumbers = [...new Set(draft.match(new RegExp(`\\d[\\d,]*\\s*${unit}`, 'g')) || [])];
      const different = draftNumbers.filter(item => item.replace(/\s/g, '') !== value.replace(/\s/g, ''));
      if (draftNumbers.length && different.length) valueConflicts.push(`${entry.title} 확정 ${value} vs V1 ${different.join(' / ')}`);
    }
  }
  checks.push(valueConflicts.length
    ? check('설계도 대비 수치 충돌', '주의', valueConflicts.join(' · '), valueConflicts)
    : check('설계도 대비 수치 충돌', 'PASS', '설계도에서 확정한 수치와 다른 값이 V1에 없습니다.'));

  // 10. 공고 공식 기준과 사용자 확정값 충돌 — 어느 쪽도 고치지 않고 별도 상태로만 남긴다.
  const officialConflicts = givenConflicts || officialRequirementConflicts(structure, projectValues);
  if (officialConflicts.length) {
    checks.push(check('공식요건 충돌', '주의', `공고 기준과 이번 사업 확정값이 어긋납니다(OFFICIAL_REQUIREMENT_CONFLICT ${officialConflicts.length}건). 자동으로 고치지 않았습니다.`, officialConflicts.map(item => `${item.field}: 공고 ${item.officialValue} vs 확정 ${item.userValue}`)));
  } else {
    checks.push(check('공식요건 충돌', 'PASS', '공고 기준과 이번 사업 확정값이 어긋나지 않습니다.'));
  }

  const byState = Object.fromEntries(DRAFT_CHECK_STATES.map(state => [state, checks.filter(item => item.state === state).length]));
  const verdict = byState.FAIL ? '설계도 위반 있음' : (byState.주의 || officialConflicts.length) ? '보완 확인 필요' : '설계도와 일치';
  return { checks, byState, verdict, logicLinks: links, applicationType: selected, officialConflicts, annotatedSections: annotated };
}
