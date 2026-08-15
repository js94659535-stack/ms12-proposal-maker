-- 통계 조회 캐시. 같은 조회로 같은 답을 두 번 받아 오지 않는다. 기존 표는 건드리지 않는다.
--
-- 담는 것은 KOSIS가 공개한 통계값과 그 출처뿐이다. 인증키는 열쇠에도 본문에도 담지 않는다.
CREATE TABLE IF NOT EXISTS stat_lookup_cache (
  cache_key TEXT PRIMARY KEY,        -- 조회 종류와 조건. 인증키는 들어가지 않는다
  payload TEXT NOT NULL DEFAULT '',  -- 정리한 결과(JSON)
  source TEXT NOT NULL DEFAULT '',   -- kosis
  calls INTEGER NOT NULL DEFAULT 0,  -- 이 결과를 만드는 데 실제로 부른 횟수
  fetched_at TEXT NOT NULL DEFAULT '',
  hits INTEGER NOT NULL DEFAULT 0    -- 캐시로 답한 횟수
);
CREATE INDEX IF NOT EXISTS idx_stat_cache_fetched ON stat_lookup_cache(fetched_at);
