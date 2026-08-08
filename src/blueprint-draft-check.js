// V1 초안이 사업 설계도를 실제로 따랐는지 자동 점검한다.
// 규칙 기반 로컬 비교만 하고 외부 API를 호출하지 않는다. V1 원문은 읽기만 하고 수정하지 않는다.
import { CONFIRMED_STATUS, splitApplicantProfile } from './applicants.js';

export const DRAFT_CHECK_STATES = ['PASS', '주의', 'FAIL'];
const QUANTITY = /\d[\d,]*\s*(?:명|인|회기|회|차시|시간|개월|주|원)/g;
const STOPWORDS = new Set(['사업', '지원', '기관', '내용', '경우', '해당', '관련', '통해', '위한', '있는', '대상', '제출', '작성', '확인', '필요', '수행', '운영', '제공']);

function textOf(sections) { return (sections || []).map(section => `${section.title || ''}\n${section.body || section.content || ''}`).join('\n\n'); }
function sectionText(sections, id) { const found = (sections || []).find(section => section.id === id); return found ? `${found.title || ''} ${found.body || found.content || ''}` : ''; }
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

export function checkDraftAgainstBlueprint({ blueprint, sections, applicant } = {}) {
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
    // 유형 이름이 직접 나오거나, 그 유형에만 있는 표현이 여러 개 나올 때만 혼입으로 본다.
    const selectedTokens = new Set(tokensOf((blueprint.applicationTypes.options.find(option => option.name === selected) || {}).description));
    const mixed = others.filter(option => draft.includes(option.name)
      || tokensOf(option.description).filter(token => token.length >= 3 && !selectedTokens.has(token) && draft.includes(token)).length >= 3);
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

  // 6. 미확정 값은 [확인 필요]
  const openItems = (blueprint.items || []).filter(item => item.status === 'NEEDS_CONFIRMATION' && !['requirementLinks', 'openItems'].includes(item.key));
  const marks = (draft.match(/\[확인 필요[^\]]*\]/g) || []).length;
  checks.push(openItems.length && !marks
    ? check('미확정 값 표기', 'FAIL', `설계도 미확정 ${openItems.length}건이 있는데 V1에 [확인 필요] 표기가 없습니다.`, openItems.map(item => item.title))
    : check('미확정 값 표기', 'PASS', `미확정 ${openItems.length}건 · V1의 [확인 필요] 표기 ${marks}곳`));

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
  const conflicts = [];
  for (const entry of confirmedValues) {
    for (const number of String(entry.value).match(QUANTITY) || []) {
      const unit = number.replace(/[\d,\s]/g, '');
      if (!unit) continue;
      const draftNumbers = [...new Set(draft.match(new RegExp(`\\d[\\d,]*\\s*${unit}`, 'g')) || [])];
      const different = draftNumbers.filter(value => value.replace(/\s/g, '') !== number.replace(/\s/g, ''));
      if (draftNumbers.length && different.length) conflicts.push(`${entry.title} 확정 ${number} vs V1 ${different.join(' / ')}`);
    }
  }
  checks.push(conflicts.length
    ? check('설계도 대비 수치 충돌', '주의', conflicts.join(' · '), conflicts)
    : check('설계도 대비 수치 충돌', 'PASS', '설계도에서 확정한 수치와 다른 값이 V1에 없습니다.'));

  const byState = Object.fromEntries(DRAFT_CHECK_STATES.map(state => [state, checks.filter(item => item.state === state).length]));
  const verdict = byState.FAIL ? '설계도 위반 있음' : byState.주의 ? '보완 확인 필요' : '설계도와 일치';
  return { checks, byState, verdict, logicLinks: links, applicationType: selected };
}
