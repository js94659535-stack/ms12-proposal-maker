-- 관심 항목. 관리자가 정해 두면 모든 회원이 같은 낱말로 공고를 가려 본다.
--
-- 회원이 스스로 적어 둔 낱말은 브라우저에 그대로 남는다. 여기 것은 「기관이 정한 관심 주제」다.
-- 지우지 않고 상태만 바꾼다. 무엇을 왜 보기로 했는지 기록이 남아야 한다.
CREATE TABLE IF NOT EXISTS watch_words (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',        -- 왜 넣었는지 한 줄
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_words_word ON watch_words(word);

INSERT OR IGNORE INTO watch_words (id, word, note, active, created_at, updated_at, created_by) VALUES
  ('w-digital-literacy', '디지털 리터러시', '기관 관심 주제', 1, '2026-08-16', '2026-08-16', 'system'),
  ('w-digital-reading', '디지털 문해력', '기관 관심 주제', 1, '2026-08-16', '2026-08-16', 'system'),
  ('w-ai', 'AI', '기관 관심 주제', 1, '2026-08-16', '2026-08-16', 'system'),
  ('w-ai-ko', '인공지능', '기관 관심 주제', 1, '2026-08-16', '2026-08-16', 'system');
