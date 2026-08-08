-- 검증·코칭 background 작업의 소유권·최소 상태만 임시 보관한다.
-- 계획서 원문이나 개인정보는 저장하지 않으며, 완료·실패 시 삭제하고 만료 레코드도 정리한다.
CREATE TABLE IF NOT EXISTS coaching_jobs (
  job_id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  official_evaluation INTEGER NOT NULL DEFAULT 0,
  previous_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coaching_jobs_owner ON coaching_jobs(owner_hash);
CREATE INDEX IF NOT EXISTS idx_coaching_jobs_expires ON coaching_jobs(expires_at);
