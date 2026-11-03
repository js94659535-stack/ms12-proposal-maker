// 기관 서랍(11-26) — public/plan/org.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ORG_PREFIX, orgKey, listOrgs, readOrg, writeOrg, orgExists, unexported, exportOrgs, readOrgsFile, restoreOrgs } from '../public/plan/org.js';
import { noticeKey, writeSaved, emptySaved } from '../public/plan/saved.js';

// localStorage 꼴(length · key · getItem · setItem · removeItem · clear)
function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: index => [...map.keys()][index] ?? null,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
    clear: () => map.clear(),
    keys: () => [...map.keys()]
  };
}
const mind = [{ source: '마인드스토리_기관정보.md', text: '개업일 2021.08.26 · (주)마인드스토리' }, { source: '실적.tsv', text: '날짜\t사업\n2023.05\t특별교육' }];
const sinwan = [{ source: '신완마을.md', text: '비영리 · 공간 신완마을' }];

test('열쇠는 ms12-org:<기관 이름> — 공고 칸(ms12-plan:해시)과 다른 칸', () => {
  assert.equal(orgKey('  마인드스토리 '), `${ORG_PREFIX}마인드스토리`);
  assert.ok(!noticeKey('공고 A').startsWith(ORG_PREFIX));
});

test('저장한 서랍을 다른 공고에서 파일 없이 읽는다', () => {
  const storage = memoryStorage();
  assert.ok(writeOrg(storage, '마인드스토리', mind).ok);
  const read = readOrg(storage, '마인드스토리');
  assert.deepEqual(read.org.facts, mind);
  assert.deepEqual(listOrgs(storage).map(org => [org.name, org.files]), [['마인드스토리', 2]]);
});

test('이름이 비면 저장하지 않는다 · 저장소가 없으면 던지지 않고 까닭', () => {
  assert.equal(writeOrg(memoryStorage(), '  ', mind).ok, false);
  assert.match(writeOrg(null, '마인드스토리', mind).reason, /저장소/);
  const full = { ...memoryStorage(), setItem() { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); } };
  assert.deepEqual(writeOrg(full, '마인드스토리', mind), { ok: false, reason: 'QuotaExceededError' });
});

test('공고 칸을 지워도 서랍은 남는다', () => {
  const storage = memoryStorage();
  writeOrg(storage, '마인드스토리', mind);
  const key = noticeKey('공고 A 글자');
  writeSaved(storage, key, emptySaved());
  storage.removeItem(key);
  assert.ok(orgExists(storage, '마인드스토리'));
  assert.equal(storage.keys().length, 1);
});

test('기관 둘은 섞이지 않는다', () => {
  const storage = memoryStorage();
  writeOrg(storage, '마인드스토리', mind);
  writeOrg(storage, '공간 신완마을', sinwan);
  assert.deepEqual(readOrg(storage, '마인드스토리').org.facts, mind);
  assert.deepEqual(readOrg(storage, '공간 신완마을').org.facts, sinwan);
  assert.deepEqual(listOrgs(storage).map(org => org.name), ['공간 신완마을', '마인드스토리']);
});

test('내보내기 → 브라우저 데이터 지우기 → 불러오기로 되살아난다', () => {
  const storage = memoryStorage();
  writeOrg(storage, '마인드스토리', mind, { now: new Date('2026-11-03T01:00:00Z') });
  writeOrg(storage, '공간 신완마을', sinwan, { now: new Date('2026-11-03T02:00:00Z') });
  const file = exportOrgs(storage, new Date('2026-11-03T03:00:00Z'));
  storage.clear();
  assert.deepEqual(listOrgs(storage), []);
  const read = readOrgsFile(file, storage);
  assert.ok(read.ok);
  assert.deepEqual(read.clash, []);
  assert.deepEqual(restoreOrgs(storage, read.orgs, { exportedAt: read.exportedAt }).written.sort(), ['공간 신완마을', '마인드스토리']);
  assert.deepEqual(readOrg(storage, '마인드스토리').org.facts, mind);
  assert.deepEqual(readOrg(storage, '공간 신완마을').org.facts, sinwan);
  assert.equal(readOrg(storage, '마인드스토리').org.savedAt, '2026-11-03T01:00:00.000Z');
  assert.deepEqual(unexported(listOrgs(storage)), []); // 되살린 것은 그 파일에 이미 있다
});

test('이미 있는 이름은 덮을지 사람이 정한다 — 건너뛴 서랍은 그대로', () => {
  const storage = memoryStorage();
  writeOrg(storage, '마인드스토리', mind);
  const file = exportOrgs(storage);
  writeOrg(storage, '마인드스토리', sinwan); // 내보낸 뒤 고침
  const read = readOrgsFile(file, storage);
  assert.deepEqual(read.clash, ['마인드스토리']);
  restoreOrgs(storage, read.orgs, { skip: read.clash });
  assert.deepEqual(readOrg(storage, '마인드스토리').org.facts, sinwan);
});

test('내보낸 뒤 고친 서랍 · 한 번도 내보내지 않은 서랍은 「내보내 두세요」', () => {
  const storage = memoryStorage();
  writeOrg(storage, '마인드스토리', mind, { now: new Date('2026-11-03T01:00:00Z') });
  assert.deepEqual(unexported(listOrgs(storage)), ['마인드스토리']);
  exportOrgs(storage, new Date('2026-11-03T02:00:00Z'));
  assert.deepEqual(unexported(listOrgs(storage)), []);
  writeOrg(storage, '마인드스토리', sinwan, { now: new Date('2026-11-03T04:00:00Z') });
  assert.deepEqual(unexported(listOrgs(storage)), ['마인드스토리']);
});

test('다른 파일(공고별 고른 것)은 서랍으로 읽지 않는다', () => {
  assert.equal(readOrgsFile(JSON.stringify({ kind: 'ms12-plan-choices' }), memoryStorage()).ok, false);
  assert.equal(readOrgsFile('not json', memoryStorage()).ok, false);
});
