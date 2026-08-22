// 기관이 하나뿐이면 기관 고르는 칸을 한 줄로 줄인다.
//
// 「아무것도 안 써도 된다면 제거하라. 컨소시엄을 구성하게 되면 그때 나타나게 하라」.
// 기관 추가·불러오기·선택·삭제 넷은 기관이 하나뿐인 사람에게 쓸 일이 없다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requiresConsortium } from '../src/applicants.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const req = requirement => ({ id: 'r', requirement, category: '신청자격' });

test('공고가 기관 둘 이상을 요구하는지 읽는다', () => {
  // 이번 공고의 실제 문장이다.
  const must = requiresConsortium([req('2개 이상 기관의 컨소시엄 구성이 필수다')]);
  assert.equal(must.required, true);
  assert.match(must.evidence, /2개 이상 기관의 컨소시엄/);
  assert.equal(requiresConsortium([req('둘 이상의 기관이 공동으로 신청한다')]).required, true);
  // 해도 되고 안 해도 되는 말은 요구가 아니다.
  assert.equal(requiresConsortium([req('컨소시엄 구성 시 협약서를 첨부한다')]).required, false);
  assert.equal(requiresConsortium([req('금융교육과 맞춤형 금융상담을 수행해야 한다')]).required, false);
  // 실행계약서 규칙에서도 읽는다.
  assert.equal(requiresConsortium([], { rules: [{ title: '신청유형', value: '2개 이상 기관 공동수행 필수' }] }).required, true);
  // 공고가 없으면 요구도 없다.
  assert.deepEqual(requiresConsortium(), { required: false, evidence: '' });
});

test('하나뿐이고 골라 둔 기관이면 한 줄로 줄인다', () => {
  const view = app.slice(app.indexOf('function orgPickerView(who)'), app.indexOf('function applicantSourcesView('));
  assert.match(view, /const only = state\.applicants\.length === 1 \? state\.applicants\[0\] : null;/);
  assert.match(view, /only\.id === state\.selectedApplicantId && !consortium\.required && !state\.orgPickerOpen/);
  assert.match(view, /id="open-org-picker">다른 기관 쓰기<\/button>/);
  // 줄인 줄에도 몇 건이 확인됐는지는 남는다.
  assert.match(view, /확인됨 \$\{confirmed\}건 · 확인 필요/);
  // 공고가 컨소시엄을 요구하면 그 까닭을 적고 접지 않는다.
  assert.match(view, /이 공고는 기관 둘 이상을 요구합니다/);
  // 눌러서 펴는 길이 있다.
  assert.match(app, /document\.querySelector\('#open-org-picker'\)\?\.addEventListener\('click', \(\) => setState\(\{ orgPickerOpen: true/);
});

test('펼침 기억은 이번 화면에서만 산다', () => {
  // 22-19의 접기가 안 먹은 까닭이 이것이었다. 한 번 편 것이 브라우저에 저장돼 새로고침해도 펴져 있었다.
  const save = app.slice(app.indexOf('function saveState()'), app.indexOf('function loadNavigationHistory()'));
  assert.match(save, /openAddForms: \[\], openOrgFolds: \[\], openOrgGroups: \[\], closedOrgGroups: \[\], openOrgYears: \[\], quickFilledFrom: \{\}/);
  const load = app.slice(app.indexOf('const restored = {'), app.indexOf('const restored = {') + 2000);
  assert.match(load, /openAddForms: \[\], openOrgFolds: \[\], openOrgGroups: \[\], closedOrgGroups: \[\], openOrgYears: \[\], quickFilledFrom: \{\}/);
});
