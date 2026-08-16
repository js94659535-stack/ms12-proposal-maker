// 작성 지침. 원문에서 뽑은 것·지난 공고와 견준 것·통상적인 이야기를 갈라 놓는다.
// 없는 내용을 지어내지 않는다. 없으면 없다고 적는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GENERAL_MARK, cautionPoints, comparePastNotices, emphasisPoints, generalNotes, writingApproach } from '../src/notice-guide.js';
import { analyzeNoticeStructure } from '../src/notice-logic.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const notice = {
  title: '아동 디지털 리터러시 교육사업 참여기관 모집',
  sourceLabel: '부스러기사랑나눔회',
  archiveNoticeKey: 'now',
  overview: [
    '신청대상: 지역아동센터 등 아동 이용시설.',
    '아동의 디지털 활용 격차 해소가 시급합니다.',
    '교육 운영 경험이 있는 기관을 우선 선정합니다.',
    '자부담 계획이 없는 기관은 제외합니다.',
    '사업기간: 2026-10-01 ~ 2026-12-31. 지원한도 3,000,000원.'
  ].join('\n')
};
const structure = analyzeNoticeStructure(notice);

test('주안점과 주의점은 공고 문장을 그대로 가져온다', () => {
  const emphasis = emphasisPoints(notice);
  assert.ok(emphasis.length >= 1);
  assert.match(emphasis[0].sentence, /우선 선정/);
  assert.ok(emphasis[0].source, '어느 자료의 문장인지 밝힌다');
  const cautions = cautionPoints(notice);
  assert.ok(cautions.length >= 1);
  assert.match(cautions[0].sentence, /제외/);
  // 강조·주의가 없는 공고에서는 지어내지 않는다.
  const plain = { title: '안내', overview: '올해도 잘 부탁드립니다.' };
  assert.equal(emphasisPoints(plain).length, 0);
  assert.equal(cautionPoints(plain).length, 0);
});

test('접근법은 확인된 항목에서만 나온다', () => {
  const steps = writingApproach(structure);
  assert.ok(steps.length >= 2);
  for (const step of steps) assert.equal(step.basis, '공고 원문');
  // 아무것도 확인되지 않으면 순서를 제안하지 않는다.
  assert.equal(writingApproach(analyzeNoticeStructure({ title: '안내', overview: '감사합니다.' })).length, 0);
});

test('지난 공고는 보관함에 있는 것만 견준다', () => {
  const archive = [
    { archiveNoticeKey: 'old', sourceLabel: '부스러기사랑나눔회', title: '2025년 같은 사업', deadline: '2025-08-20', supportLimit: '2,000,000원' },
    { archiveNoticeKey: 'other', sourceLabel: '중앙회', title: '남의 공고' }
  ];
  const past = comparePastNotices(notice, archive);
  assert.equal(past.found.length, 1);
  assert.match(past.found[0].title, /2025년 같은 사업/);
  assert.match(past.note, /지난 공고 1건과 견줬습니다/);
  // 없으면 없다고 답한다. 지어내지 않는다.
  const none = comparePastNotices(notice, []);
  assert.equal(none.found.length, 0);
  assert.match(none.note, /보관함에 없어 견주지 못했습니다/);
});

test('통상적인 이야기에는 표시를 붙이고, 원문이 넉넉하면 넣지 않는다', () => {
  const notes = generalNotes(analyzeNoticeStructure({ title: '안내', overview: '감사합니다.' }));
  assert.ok(notes.length >= 2);
  for (const note of notes) assert.ok(note.startsWith(GENERAL_MARK), note);
  // 우리 조사 결과인 척하지 않는다.
  assert.ok(notes.some(note => note.includes('통상적인 이야기입니다')));
  // 공고에서 다섯 항목 넘게 확인되면 일반론을 앞세우지 않는다.
  const rich = { fields: Array.from({ length: 6 }, () => ({ status: '공식 근거 확인' })) };
  assert.equal(generalNotes(rich).length, 0);
});

test('화면은 어디서 온 말인지 갈라 보여 준다', () => {
  assert.match(app, /function writingGuideView\(structure, notice\)/);
  for (const heading of ['주안점 · 공고가 힘준 곳', '접근법 · 무엇부터 쓸 것인가', '주의점 · 떨어지는 자리', '지난 공고와 견주기', '참고 · 통상적인 이야기']) {
    assert.ok(app.includes(heading), heading);
  }
  // 총론 안, 각론 앞에 온다.
  const overview = app.slice(app.indexOf('<h4>분석 총론</h4>'), app.indexOf('각론 · 이 공고에서 선정되려면'));
  assert.ok(overview.includes('${writingGuideView(structure, notice)}'));
});
