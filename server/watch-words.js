// 관심 항목 등록부. 관리자가 정해 두면 회원 화면이 같은 낱말로 공고를 가려 본다.
//
// 회원이 자기 브라우저에 적어 둔 낱말과 섞지 않는다. 여기 것은 「기관이 정한 관심 주제」이고,
// 회원 것은 그 사람 화면에서만 쓴다. 두 목록을 합쳐 보여 주되 어느 쪽인지 표시한다.
//
// 지우지 않고 상태만 바꾼다. 무엇을 왜 보기로 했는지 남아야 한다.

export const MAX_WORD_CHARS = 30;
export const MAX_WORDS = 40;

const text = (value, max) => String(value ?? '').trim().slice(0, max);

export function validateWord(value = {}) {
  const word = text(value.word, MAX_WORD_CHARS);
  const note = text(value.note, 100);
  if (word.length < 2) return { ok: false, error: '관심 낱말을 두 글자 이상 적어 주세요.' };
  return { ok: true, value: { word, note } };
}

export const wordView = row => (row ? {
  id: row.id, word: row.word, note: row.note || '',
  active: Number(row.active) === 1,
  updatedAt: row.updated_at || ''
} : null);

// 화면이 쓰는 목록. 쓰기로 한 것만 준다.
export const activeWords = rows => (Array.isArray(rows) ? rows : []).filter(row => row.active).map(row => row.word);

export const newWordId = () => `w-${crypto.randomUUID().slice(0, 8)}`;
