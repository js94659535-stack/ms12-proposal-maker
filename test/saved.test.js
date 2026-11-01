// 작업대 저장(11-12): 공고마다 다른 칸, 막히면 조용히 알리기, 파일로 내보내기·불러오기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { noticeKey, emptySaved, writeSaved, readSaved, exportFile, importFile, savedLabel } from '../public/plan/saved.js';

const memory = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), map }; };

test('공고가 다르면 다른 칸 — 섞이지 않는다', () => {
  const store = memory();
  const a = noticeKey('공고 A 전문'), b = noticeKey('공고 B 전문');
  assert.notEqual(a, b);
  assert.equal(noticeKey('공고 A 전문'), a);
  writeSaved(store, a, { ...emptySaved(), choices: { g1: { status: 'ok' } } });
  assert.deepEqual(readSaved(store, a).saved.choices, { g1: { status: 'ok' } });
  assert.deepEqual(readSaved(store, b).saved.choices, {});
  assert.equal(readSaved(store, b).found, false);
});

test('저장이 막히면 던지지 않고 까닭을 돌려준다 — 화면이 말한다', () => {
  const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } };
  const wrote = writeSaved(blocked, 'k', emptySaved());
  assert.deepEqual([wrote.ok, wrote.reason], [false, 'QuotaExceededError']);
  assert.equal(writeSaved(null, 'k', emptySaved()).ok, false);
  assert.equal(readSaved(blocked, 'k').ok, false);
  assert.match(savedLabel(wrote), /저장 안 됨 — QuotaExceededError\. 「내보내기」로 파일에 남기세요/);
});

test('「언제 저장됨」', () => {
  const at = new Date(2026, 10, 1, 9, 5, 7);
  const wrote = writeSaved(memory(), 'k', emptySaved(), at);
  assert.equal(savedLabel(wrote), '자동 저장됨 11/1 09:05:07');
  assert.equal(savedLabel({ ok: true, savedAt: null }), '아직 고른 것 없음');
});

test('내보내기 → 불러오기: 고른 것·채운 값·답·옮긴 줄이 그대로, 다른 공고면 알린다', () => {
  const saved = { ...emptySaved(), choices: { g: { status: 'edit', dropped: ['l'] } }, values: { 'Ⅰ:2': '60%' }, answers: { roles: '주관: 상담' }, moved: { 'Ⅱ|인력변경': { text: '인력 변경' } } };
  const file = exportFile(saved, { key: 'ms12-plan:aaaa', notice: '통일부' });
  const same = importFile(file, { key: 'ms12-plan:aaaa' });
  assert.equal(same.ok, true);
  assert.equal(same.otherNotice, false);
  for (const field of ['choices', 'values', 'answers', 'moved']) assert.deepEqual(same.saved[field], saved[field]);
  assert.equal(importFile(file, { key: 'ms12-plan:bbbb' }).otherNotice, true);
  assert.equal(importFile('{"a":1}').ok, false);
  assert.equal(importFile('아님').ok, false);
});
