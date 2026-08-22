// 공고 조항에 기관 정보를 연결할 때, 낱말이 하나 겹친다고 다 붙이지 않는다.
//
// 실제로 났던 일: 「진행상황에 따라 사업 시작 시점 등 기간이 조정될 수 있다」에 실적 99건이 통째로
// 붙었다. 항목명이 「2017년 사업실적」이라 「사업」 한 낱말로 전부 걸렸고, 「신청기간은 2026년 7월
// 1일부터…」에는 2026년 실적 30건이 붙었다. 조항과 아무 상관이 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareNoticeWithApplicant, normalizeApplicant } from '../src/applicants.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
// 해마다 열 건씩, 실제 연혁과 같은 모양으로 백 건을 만든다.
const applicant = normalizeApplicant({
  id: 'org-1', name: 'QA 기관',
  items: years.flatMap(year => Array.from({ length: 10 }, (unused, index) => ({
    id: `p-${year}-${index}`, area: 'performance', label: `${year}년 사업실적`,
    value: index === 0 ? `${year} 지역아동센터 진로 학습 캠프` : `${year} ${index}초등학교 사회성 프로그램`,
    status: '확인됨', source: '연혁에서 추출', asOf: String(year)
  })))
});
const connect = requirement => {
  const result = compareNoticeWithApplicant([{ id: 'r1', requirement, category: '' }], applicant, null);
  const all = [...result.confirmedStrengths, ...result.needsEvidence, ...result.missingFromApplicant, ...result.decideInThisProject, ...result.answerInProposal, ...result.fixedByNotice];
  return all[0].matchedItems.length;
};

test('관계없는 조항에는 실적이 붙지 않는다', () => {
  // 「사업」은 실적 백 건 모두의 항목명에 있다. 그것으로는 아무것도 가려낼 수 없다.
  assert.equal(connect('진행상황에 따라 사업 시작 시점 등 기간이 조정될 수 있다'), 0);
  // 연도도 마찬가지다. 「2026년」이 그 해 실적 열 건을 부르지 않는다.
  assert.equal(connect('신청기간은 2026년 7월 1일부터 8월 21일까지다'), 0);
});

test('정말 관련 있는 조항에는 붙는다', () => {
  // 「지역아동센터」는 열 건에만 있는 드문 낱말이다.
  assert.equal(connect('지역아동센터 아동을 대상으로 한 실적이 있어야 한다'), 10);
});

test('항목명이 아니라 값으로 판정한다', () => {
  const source = fs.readFileSync(new URL('../src/applicants.js', import.meta.url), 'utf8');
  const scope = source.slice(source.indexOf('export function relatedMatches'), source.indexOf('export function relatedItems'));
  assert.match(scope, /item\.area === 'performance'\s*\?\s*`\$\{item\.value\} \$\{item\.detail \|\| ''\}`/);
  // 판정을 두 곳에서 따로 만들지 않는다.
  assert.match(source, /function matchItems\(text_, items\) \{\s*return relatedItems\(items, \[text_\], \{ limit: 0 \}\);/);
});

test('연결이 다섯을 넘으면 접어서 보여 준다', () => {
  assert.match(app, /연결된 기관 정보 \$\{item\.matchedItems\.length\}건:/);
  assert.match(app, /item\.matchedItems\.slice\(0, 5\)/);
  assert.match(app, /그 외 \$\{item\.matchedItems\.length - 5\}건/);
});
