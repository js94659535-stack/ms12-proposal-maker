// 「이 공고를 어떻게 써야 하는가」. 총론의 주안점·접근법·주의점과 각론의 작성법을 만든다.
//
// 근거 규칙은 셋이다. 어기면 이 도구를 쓸 이유가 없다.
//  1. 공고 원문에서 뽑은 것은 그 문장을 함께 보여 준다.
//  2. 보관함의 지난 공고와 견준 것은 어느 공고와 견줬는지 밝힌다.
//  3. 원문에도 지난 공고에도 없는 통상적인 이야기는 [일반 정보]를 붙인다. 우리 조사 결과인 척하지 않는다.
//
// 없는 내용을 지어내지 않는다. 뽑을 것이 없으면 그 자리는 비우고 「공고에서 확인되지 않음」이라고 적는다.

import { noticeSources } from './notice-logic.js';

export const GENERAL_MARK = '[일반 정보]';

const clean = (value, max = 220) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const sentences = value => String(value || '').split(/(?<=[.!?。])\s+|\n+/).map(item => item.trim()).filter(item => item.length > 6);

// 공고가 힘준 곳. 「중점·우선·반드시」 같은 말이 붙은 문장만 가져온다.
const EMPHASIS = /중점|우선|반드시|필수|중요|권장|우대|가점|특히/;
const CAUTION = /제외|배제|감점|반려|불가|미충족|결격|취소|불이익|제한/;

export function emphasisPoints(notice, limit = 3) {
  const found = [];
  for (const source of noticeSources(notice || {})) {
    for (const line of sentences(source.text)) {
      if (!EMPHASIS.test(line)) continue;
      found.push({ sentence: clean(line), source: source.label });
      if (found.length >= limit) return found;
    }
  }
  return found;
}

export function cautionPoints(notice, limit = 3) {
  const found = [];
  for (const source of noticeSources(notice || {})) {
    for (const line of sentences(source.text)) {
      if (!CAUTION.test(line)) continue;
      found.push({ sentence: clean(line), source: source.label });
      if (found.length >= limit) return found;
    }
  }
  return found;
}

// 접근법. 공고가 확인해 준 것만 근거로 「무엇부터 쓸지」를 정한다.
export function writingApproach(structure) {
  const field = key => (structure.fields || []).find(item => item.key === key);
  const has = key => field(key)?.status === '공식 근거 확인';
  const steps = [];
  if (has('problem')) {
    steps.push({ text: '공고가 말한 문제를 우리 지역·우리 이용자의 사실로 다시 적고 시작합니다. 일반론으로 여는 계획서는 어느 기관이 써도 같아집니다.', basis: '공고 원문', source: field('problem').evidence?.[0]?.source || '' });
  }
  if (has('target')) {
    steps.push({ text: `공고 대상(${clean(field('target').value, 60)})과 우리 이용자가 같은 사람임을 숫자로 보입니다.`, basis: '공고 원문', source: field('target').evidence?.[0]?.source || '' });
  }
  if (has('requiredContent')) {
    steps.push({ text: '공고가 요구한 사업내용을 우리 프로그램 이름으로 하나씩 대응시킵니다. 빠진 것이 있으면 그 자리가 감점입니다.', basis: '공고 원문', source: field('requiredContent').evidence?.[0]?.source || '' });
  }
  if (structure.hasOfficialScoring) {
    steps.push({ text: '배점이 큰 항목에 분량과 근거를 더 씁니다. 배점 없는 항목에 공들이면 점수가 오르지 않습니다.', basis: '공고 원문', source: structure.evaluationScores?.[0]?.source || '' });
  }
  if (has('periodBudget')) {
    steps.push({ text: '예산은 공고가 정한 한도 안에서 산출근거와 함께 적습니다. 총액만 적은 예산은 반려 사유가 됩니다.', basis: '공고 원문', source: field('periodBudget').evidence?.[0]?.source || '' });
  }
  return steps;
}

// 같은 기관의 지난 공고와 견준다. 보관함에 있는 것만 본다. 없으면 없다고 답한다.
export function comparePastNotices(notice = {}, archive = [], limit = 2) {
  const label = String(notice.sourceLabel || '').trim();
  const key = String(notice.archiveNoticeKey || '');
  if (!label) return { found: [], note: '' };
  const past = (Array.isArray(archive) ? archive : [])
    .filter(item => String(item.sourceLabel || '') === label && String(item.archiveNoticeKey || '') !== key)
    .slice(0, limit);
  if (!past.length) {
    return { found: [], note: `${label}의 지난 공고가 보관함에 없어 견주지 못했습니다. 공고가 쌓이면 달라진 점을 짚어 드립니다.` };
  }
  const rows = past.map(item => ({
    title: clean(item.title, 60),
    deadline: item.deadline || '',
    supportLimit: clean(item.supportLimit, 40),
    eligibility: clean(item.eligibility, 60)
  }));
  return { found: rows, note: `${label}의 지난 공고 ${rows.length}건과 견줬습니다. 아래 값이 이번 공고와 다르면 조건이 바뀐 것입니다.` };
}

// 통상적인 이야기. 우리 조사 결과가 아니므로 표시를 붙인다.
// 공고에서 확인된 것이 적을 때만 보탠다. 원문에 답이 있으면 일반론을 앞세우지 않는다.
export function generalNotes(structure) {
  const confirmed = (structure.fields || []).filter(field => field.status === '공식 근거 확인').length;
  if (confirmed >= 5) return [];
  return [
    `${GENERAL_MARK} 심사에서는 대체로 「왜 이 기관이어야 하는가」와 「끝난 뒤 무엇이 남는가」를 봅니다. 우리 기관만 쓸 수 있는 사실(이용자 수, 지난 실적, 협력관계)을 앞에 두세요.`,
    `${GENERAL_MARK} 숫자 없는 문장은 심사자가 확인할 수 없습니다. 대상 인원·회기·시간·예산은 근거와 함께 적는 편이 낫습니다.`,
    `${GENERAL_MARK} 위 두 줄은 공고 원문이나 지난 공고에서 확인한 내용이 아니라 통상적인 이야기입니다. 이번 공고의 요강을 올리면 원문 근거로 바꿔 드립니다.`
  ];
}
