// 열한 칸을 공고 기준으로 다시 세운다(22-43).
//
// 앞으로 올리는 것은 근거가 있는 칸뿐이다. 짐작으로 올리면 「이 공고가 요구합니다」라는 말을
// 믿을 수 없게 된다. 나머지는 값이 있는 칸 · 빈 칸 순서다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { groupAreas } from '../src/org-area-order.js';
import { APPLICANT_AREAS } from '../src/applicants.js';

const summary = counts => APPLICANT_AREAS.map(area => ({
  ...area, total: counts[area.key] || 0, confirmed: counts[area.key] || 0, needsCheck: 0
}));

test('공고가 컨소시엄을 요구하면 협력기관이 앞으로 온다', () => {
  const grouped = groupAreas(summary({ performance: 96 }), {
    consortium: { required: true, evidence: '2개 이상 기관이 컨소시엄을 구성해야 한다' },
    performanceMatches: 12
  });
  // 순서는 열한 칸의 본래 차례를 지킨다. 실적이 협력기관보다 앞이다.
  assert.deepEqual(grouped.required.map(area => area.key), ['performance', 'partners']);
  const partners = grouped.required.find(area => area.key === 'partners');
  assert.match(partners.why, /컨소시엄이 필수인데 비었습니다/);
  assert.match(partners.why, /2개 이상 기관/);
  // 실적은 겹치는 건수가 근거다.
  assert.match(grouped.required.find(area => area.key === 'performance').why, /겹치는 실적 12건/);
});

test('근거가 없으면 앞으로 올리지 않는다', () => {
  const grouped = groupAreas(summary({ performance: 96, staff: 3 }), { consortium: { required: false, evidence: '' }, performanceMatches: 0 });
  assert.deepEqual(grouped.required, []);
  // 값이 있는 칸이 먼저, 빈 칸은 뒤로.
  assert.deepEqual(grouped.filled.map(area => area.key), ['staff', 'performance']);
  assert.equal(grouped.empty.length, APPLICANT_AREAS.length - 2);
  assert.ok(grouped.empty.every(area => !area.total));
});

test('공고를 아직 고르지 않아도 화면이 선다', () => {
  const grouped = groupAreas(summary({}), {});
  assert.deepEqual(grouped.required, []);
  assert.deepEqual(grouped.filled, []);
  assert.equal(grouped.empty.length, APPLICANT_AREAS.length);
});

test('화면이 세 묶음으로 그린다', () => {
  const app = fs.readFileSync('src/app.js', 'utf8');
  const view = app.slice(app.indexOf('function areaGroupsView(applicant, summary)'), app.indexOf('// 앞 항목들을 묶은 문장으로 보이면'));
  assert.match(view, /이 공고가 요구하는 것 · \$\{grouped\.required\.length\}칸/);
  assert.match(view, /아직 빈 칸 \$\{grouped\.empty\.length\}칸/);
  // 근거는 컨소시엄 판정과 겹치는 실적 건수 둘뿐이다.
  assert.match(view, /requiresConsortium\(requirements, currentNoticeContract\(\)\)/);
  assert.match(view, /performanceMatches/);
  // 빈 칸은 이름만 한 줄로 접힌다.
  assert.match(view, /grouped\.empty\.map\(area => area\.title\)\.join\(' · '\)/);
  // 열한 칸을 통째로 늘어놓던 옛 줄은 없다.
  assert.ok(!app.includes('${area.confirmed}건 확인됨'));
});
