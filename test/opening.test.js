// 개업일 전 실적(11-25) — public/lib/opening.js · checkOpening.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openingDateOf, datesIn, beforeOpening, recordSince, DROP } from '../public/lib/opening.js';
import { checkOpening, checkDraft } from '../src/proposal-draft.js';
import { readRfp } from '../public/rfp/rfp-read.js';

// 사업자등록증 PDF를 pdf.js로 읽은 그대로(글자 사이 띄어쓰기 포함)
const registration = '개 업 연 월 일 : 2021 년 08 월 26 일 \t법 인 등 록 번 호 : 200111-0629027';
const info = '| 개업일 | 2021.08.26 |';

test('개업일은 기관 자료에서 읽는다 — 사업자등록증 꼴과 표 꼴', () => {
  assert.deepEqual(openingDateOf([registration]), { date: '2021-08-26' });
  assert.deepEqual(openingDateOf([info]), { date: '2021-08-26' });
  assert.deepEqual(openingDateOf([registration, info]), { date: '2021-08-26' });
});

test('개업일이 없거나 둘이 다르면 짐작하지 않는다', () => {
  assert.ok(openingDateOf(['연혁 2017 바우처']).reason);
  assert.ok(openingDateOf([info, '개업일 2022.01.03']).reason.includes('서로 다르다'));
});

test('날짜의 폭 — 날·달·해, 「2019~21」의 21은 날짜가 아니다, 숫자 「2,024」는 해가 아니다', () => {
  assert.deepEqual(datesIn('2021.08.26 개업').map(d => [d.from, d.to]), [['2021-08-26', '2021-08-26']]);
  assert.deepEqual(datesIn('2024년 3월').map(d => [d.from, d.to]), [['2024-03-01', '2024-03-31']]);
  assert.deepEqual(datesIn('(2021)').map(d => [d.from, d.to]), [['2021-01-01', '2021-12-31']]);
  assert.deepEqual(datesIn('2019~21 원당').map(d => d.raw), ['2019']);
  assert.deepEqual(datesIn('참여 2,024명'), []);
});

test('개업일 전 · 걸침 · 후', () => {
  assert.deepEqual(beforeOpening('(2020~)', '2021-08-26'), { before: ['2020'], unsure: [] });
  assert.deepEqual(beforeOpening('(2021)', '2021-08-26'), { before: [], unsure: ['2021'] });
  assert.deepEqual(beforeOpening('2021.09 · 2024', '2021-08-26'), { before: [], unsure: [] });
  assert.deepEqual(beforeOpening('2021.08.25', '2021-08-26').before, ['2021.08.25']);
  assert.deepEqual(beforeOpening('2021.08.26', '2021-08-26'), { before: [], unsure: [] });
});

test('실적 가르기 — 개업일 이후 날짜만 쓰고, 뺀 까닭을 갈래로', () => {
  const o = '2021-08-26';
  assert.deepEqual(recordSince('2021.09.01', o), { keep: true });
  assert.deepEqual(recordSince('2023', o), { keep: true });
  assert.deepEqual(recordSince('2024.03~2024.12', o), { keep: true });
  assert.equal(recordSince('', o).why, DROP.blank);
  assert.equal(recordSince('미상', o).why, DROP.unread);
  assert.equal(recordSince('2017~', o).why, DROP.ongoing);
  assert.equal(recordSince('2017~ 현재', o).why, DROP.ongoing);
  assert.equal(recordSince('2021', o).why, DROP.yearOnly);
  assert.equal(recordSince('2021~', o).why, DROP.ongoing);
  assert.equal(recordSince('2019~21', o).why, DROP.before);
  assert.equal(recordSince('2021.08.25', o).why, DROP.before);
});

const draft = [
  '### Ⅰ.2 기관 역량',
  '- [사실: 기관 자료] 성인 심리상담: ○○구청 근로자 상담(2020.03~2020.12)',
  '- [사실: 기관 자료] 장덕중 자살예방(2021)',
  '- [사실: 기관 자료] 원격평생교육원 개설(2024)',
  '- [사실: 공고] 2019년 이후 실적을 본다',
  '- [제안] 2020년 이전 자료는 쓰지 않는다',
  '2020년 본문 줄'
].join('\n');

test('「[사실: 기관 자료]」 줄만 잡는다 — 2020은 fail, 「2021」만은 warn, 공고·제안·본문은 안 본다', () => {
  const results = checkOpening(draft, [info]);
  assert.deepEqual(results.map(r => r.level), ['fail', 'warn']);
  assert.match(results[0].detail, /○○구청/);
  assert.match(results[1].detail, /장덕중/);
});

test('개업일을 못 읽으면 막지 않고 「보지 않았다」를 남긴다', () => {
  assert.deepEqual(checkOpening(draft, ['연혁']).map(r => r.level), ['warn']);
});

test('checkDraft는 facts를 받으면 이 검사를 함께 돈다 — 안 받으면 돌지 않는다', () => {
  const { constraints } = readRfp('');
  const ctx = { constraints, section: { title: 'Ⅰ', writeWhat: [] }, sources: [], project: {} };
  assert.ok(checkDraft(draft, { ...ctx, facts: [info] }).some(r => r.what === '개업일 전 실적' && r.level === 'fail'));
  assert.ok(!checkDraft(draft, ctx).some(r => r.what === '개업일 전 실적'));
});
