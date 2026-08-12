-- 공고 자동수집 실행기록과 상태. 표를 새로 만들기만 하고 기존 자료는 손대지 않는다.
-- archived_notices는 이 마이그레이션에서 읽지도 지우지도 않는다.

-- 실행 한 번의 결과. 공고 제목·본문·첨부는 넣지 않는다(archived_notices에 이미 있다).
-- sources_json에는 통로별 상태와 건수만 담는다.
CREATE TABLE IF NOT EXISTS notice_collection_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT '',
  trigger TEXT NOT NULL,                       -- cron | manual
  status TEXT NOT NULL,                        -- ok | partial | empty | failed
  listed INTEGER NOT NULL DEFAULT 0,           -- 게시판에서 훑은 글 수
  candidates INTEGER NOT NULL DEFAULT 0,       -- 공모로 본 글 수
  collected INTEGER NOT NULL DEFAULT 0,        -- 발급한 공고 수
  inserted INTEGER NOT NULL DEFAULT 0,         -- 신규
  updated INTEGER NOT NULL DEFAULT 0,          -- 갱신
  unchanged INTEGER NOT NULL DEFAULT 0,        -- 그대로
  failure_code TEXT NOT NULL DEFAULT '',       -- http | shape | network | mixed
  warning TEXT NOT NULL DEFAULT '',            -- empty | drop
  synced INTEGER NOT NULL DEFAULT 0,           -- 보관함에 반영했는지
  duration_ms INTEGER NOT NULL DEFAULT 0,
  sources_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_notice_runs_started ON notice_collection_runs(started_at DESC);

-- 실행 잠금과 누적 상태. 한 행만 쓴다.
CREATE TABLE IF NOT EXISTS notice_collection_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  running_since TEXT NOT NULL DEFAULT '',      -- 비어 있으면 실행 중이 아니다
  running_trigger TEXT NOT NULL DEFAULT '',
  last_run_at TEXT NOT NULL DEFAULT '',
  last_run_status TEXT NOT NULL DEFAULT '',
  last_success_at TEXT NOT NULL DEFAULT '',    -- 정상(ok)으로 끝난 마지막 시각
  last_success_collected INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_failure_code TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO notice_collection_state (id) VALUES (1);
