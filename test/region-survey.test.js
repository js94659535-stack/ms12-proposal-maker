// 지역 조사표와 AI 지역 현황. 조사표에 있는 값만 쓰고, 없는 수치는 지어내지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { INDICATORS, INDICATOR_KINDS, derivedFigures, filledIndicators, openIndicators } from '../server/region-indicators.js';
import { REGION_BRIEF_SCHEMA, regionBriefPrompt, verifyRegionBrief } from '../server/region-brief.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
const survey = {
  region: '광주 5개 자치구',
  values: {
    childPopulation: { value: '67260', asOf: '2026-03' },
    centerCount: { value: '295', asOf: '2025-09-30' },
    centerUsers: { value: '8000' },
    centerStaff: { value: '800' }
  }
};

test('지표마다 어디서 어떻게 받는지가 적혀 있다', () => {
  assert.ok(INDICATORS.length >= 8);
  for (const item of INDICATORS) {
    assert.ok(item.key && item.label && item.why, `${item.key} 설명 없음`);
    assert.ok(item.source && item.how, `${item.key}: 출처나 받는 방법이 없다`);
    assert.ok(Object.keys(INDICATOR_KINDS).includes(item.kind), `${item.key}: 받는 방식이 정해지지 않았다`);
  }
  // 사용자가 물었던 세 자리가 모두 지표로 있다.
  const keys = INDICATORS.map(item => item.key);
  for (const key of ['centerCount', 'centerUsers', 'centerStaff', 'basicWelfareChildren', 'libraries', 'similarPrograms']) {
    assert.ok(keys.includes(key), `${key} 지표가 없다`);
  }
});

test('채운 것과 빈 것을 갈라 센다', () => {
  assert.equal(filledIndicators(survey).length, 4);
  assert.equal(openIndicators(survey).length, INDICATORS.length - 4);
  // 값이 공백뿐이면 채운 것으로 보지 않는다.
  assert.equal(filledIndicators({ values: { centerCount: { value: '   ' } } }).length, 0);
});

test('두 값이 모두 있을 때만 계산한다', () => {
  const rows = derivedFigures(survey);
  const labels = rows.map(row => row.label);
  assert.ok(labels.includes('종사자 1인당 담당 아동'));
  assert.ok(labels.includes('센터 1개소당 평균 이용 아동'));
  assert.equal(rows.find(row => row.label === '종사자 1인당 담당 아동').value, '10.0명');
  // 근거를 함께 남긴다. 어떻게 나온 수인지 계획서에 적어야 한다.
  assert.match(rows[0].basis, /÷/);
  // 한쪽만 있으면 만들지 않는다.
  assert.equal(derivedFigures({ values: { centerUsers: { value: '8000' } } }).length, 0);
});

test('프롬프트는 채운 값과 빈 값을 갈라 넘기고 규칙을 못 박는다', () => {
  const prompt = regionBriefPrompt({ region: '광주 5개 자치구', survey });
  assert.match(prompt, /<조사표에 확인된 값>/);
  assert.match(prompt, /<아직 받지 못한 값>/);
  assert.match(prompt, /67260/);
  assert.match(prompt, /그 밖의 숫자는 어떤 것도 적지 않는다/);
  assert.match(prompt, /추세·전망·비교를 지어내지 않는다/);
  // 계산된 값도 함께 넘긴다. AI가 스스로 나누게 하지 않는다.
  assert.match(prompt, /종사자 1인당 담당 아동: 10\.0명/);
});

test('조사표에 없는 수치가 문장에 들어오면 잡아낸다', () => {
  const good = { paragraphs: [{ heading: '아동 인구', text: '초등학생은 67,260명이다.', basis: ['childPopulation'] }] };
  assert.equal(verifyRegionBrief(good, survey).ok, true);
  const bad = { paragraphs: [{ heading: '아동 인구', text: '취약계층 아동은 12,345명으로 전체의 18.4%다.', basis: ['childPopulation'] }] };
  const check = verifyRegionBrief(bad, survey);
  assert.equal(check.ok, false);
  assert.match(check.reason, /조사표에 없는 수치/);
  // 있지도 않은 지표를 근거로 적어도 잡는다.
  const wrongKey = { paragraphs: [{ heading: 'ㄱ', text: '문장', basis: ['madeUpKey'] }] };
  assert.equal(verifyRegionBrief(wrongKey, survey).ok, false);
});

test('서버가 이 작업을 알고, 결과를 내보내기 전에 대조한다', () => {
  assert.match(api, /import \{ OUTPUT_TOKENS as REGION_BRIEF_TOKENS, REGION_BRIEF_ACTION, REGION_BRIEF_SCHEMA, regionBriefPrompt, verifyRegionBrief \}/);
  assert.match(api, /regionBrief: REGION_BRIEF_TOKENS/);
  assert.match(api, /if \(action === REGION_BRIEF_ACTION\)/);
  assert.match(api, /const check = verifyRegionBrief\(result, body\.payload\.regionBrief\?\.survey \|\| \{\}\)/);
  // 스키마가 근거를 함께 요구한다.
  assert.deepEqual(REGION_BRIEF_SCHEMA.required, ['paragraphs', 'openItems', 'usedIndicators']);
  assert.ok(REGION_BRIEF_SCHEMA.properties.paragraphs.items.required.includes('basis'));
});

test('조사표는 두 화면 어디서든 열리고 채운 수를 배지로 알린다', () => {
  assert.match(app, /region: \(\) => \(\{ title: '지역 조사표'/);
  assert.match(app, /item\('region', '지역 조사표', sheetBadge\(filledIndicators\(regionSurvey\(\)\)\.length/);
  assert.match(app, /data-open-sheet="region">지역 조사표\$\{sheetBadge\(filledIndicators\(regionSurvey\(\)\)\.length/);
  // 값은 입력할 때마다 저장하고, 화면을 다시 그리지 않아 커서가 튀지 않는다.
  assert.match(app, /data-region-value\]'\)\.forEach\(el => el\.addEventListener\('change'/);
  // 결과를 계획서에 넣을 때 기존 내용을 지우지 않는다.
  const apply = app.slice(app.indexOf('function applyRegionBrief()'), app.indexOf('// 지금 어디까지 왔는지'));
  assert.match(apply, /content: `\$\{item\.content\}\\n\\n\$\{text\}`/);
  assert.match(apply, /status: '확인 필요'/);
});
