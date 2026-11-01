// 작업대에서 사람이 정한 것(고른 것·채운 값·질문 답·약속으로 옮긴 줄)을 남긴다(11-12).
// 31묶음과 28개 값을 한자리에서 못 끝내므로 새로고침해도 남아야 한다.
//   - 브라우저 저장(localStorage)에 고를 때마다 바로 쓴다. 공고마다 다른 칸(공고 글자로 만든 열쇠) — 섞이지 않는다.
//   - 저장이 막힌 브라우저면 조용히 지나가고 그 사실을 돌려준다(화면이 말한다). 막지 않는다(대원칙 ②).
//   - 파일 하나로 내보내고 불러온다(PC를 바꾸거나 브라우저를 지웠을 때).
// 화면에 매이지 않은 함수만 둔다 — 시험이 node에서 부른다.

export const SAVE_VERSION = 1;
const PREFIX = 'ms12-plan:';

// 공고 글자 → 칸 이름. 같은 공고면 같은 칸, 글자가 다르면 다른 칸(FNV-1a 32비트).
export function noticeKey(text) {
  let hash = 0x811c9dc5;
  for (const ch of String(text)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${PREFIX}${hash.toString(16).padStart(8, '0')}`;
}

export const emptySaved = () => ({ choices: {}, values: {}, answers: {}, moved: {}, savedAt: null });

// 저장소가 없거나 막혔으면(사생활 보호 창, 꺼 둔 설정) { ok: false, reason }. 던지지 않는다.
export function writeSaved(storage, key, saved, now = new Date()) {
  const data = { ...saved, version: SAVE_VERSION, savedAt: now.toISOString() };
  try {
    if (!storage) return { ok: false, reason: '이 브라우저는 저장소를 주지 않습니다' };
    storage.setItem(key, JSON.stringify(data));
    return { ok: true, savedAt: data.savedAt };
  } catch (error) {
    return { ok: false, reason: String(error?.name || error?.message || error) };
  }
}

export function readSaved(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return { ok: true, saved: emptySaved(), found: false };
    return { ok: true, saved: { ...emptySaved(), ...JSON.parse(raw) }, found: true };
  } catch (error) {
    return { ok: false, saved: emptySaved(), found: false, reason: String(error?.name || error?.message || error) };
  }
}

// 내보내기 파일 — 어느 공고의 것인지(key·공고 이름)를 함께 적는다. 불러올 때 다른 공고면 그 사실을 알린다.
export function exportFile(saved, { key, notice = '' } = {}) {
  return JSON.stringify({ kind: 'ms12-plan-choices', version: SAVE_VERSION, key, notice, exportedAt: new Date().toISOString(), ...saved }, null, 2);
}

// 불러온 글을 읽는다. 모양이 틀리면 { ok: false }, 다른 공고의 것이면 otherNotice: true(불러오기는 사람이 정한다).
export function importFile(text, { key } = {}) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'JSON이 아닙니다' }; }
  if (data?.kind !== 'ms12-plan-choices') return { ok: false, reason: '작업대에서 내보낸 파일이 아닙니다' };
  const saved = emptySaved();
  for (const field of ['choices', 'values', 'answers', 'moved']) if (data[field] && typeof data[field] === 'object') saved[field] = data[field];
  saved.savedAt = data.savedAt || data.exportedAt || null;
  return { ok: true, saved, otherNotice: Boolean(key && data.key && data.key !== key), notice: data.notice || '' };
}

// 「언제 저장됨」 — 사람이 읽는 꼴.
export function savedLabel(status) {
  if (!status) return '';
  if (!status.ok) return `저장 안 됨 — ${status.reason}. 「내보내기」로 파일에 남기세요`;
  if (!status.savedAt) return '아직 고른 것 없음';
  const at = new Date(status.savedAt);
  const pad = value => String(value).padStart(2, '0');
  return `자동 저장됨 ${at.getMonth() + 1}/${at.getDate()} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}
