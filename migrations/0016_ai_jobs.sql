-- AI 호출 기록. 같은 작업을 두 번 결제하지 않기 위한 표다. 기존 표는 지우지 않고 더하기만 한다.
--
-- 지금까지는 호출을 시작한 사실이 어디에도 남지 않아, 창을 닫거나 기다리다 포기하면
-- 이미 돌고 있는(그리고 청구되는) 작업을 다시 찾을 수 없었다. 다시 누르면 처음부터 또 냈다.
-- 이제 호출 전에 여기 한 줄을 남기고, 같은 계획서·같은 단계·같은 입력이면 그 줄을 먼저 본다.
--
-- 프롬프트·공고 원문·계획서 본문은 담지 않는다. 결과는 다시 부르지 않기 위한 사본으로만 둔다.
CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,                          -- 사용자·작업·입력을 합쳐 만든 지문
  user_id TEXT NOT NULL DEFAULT '',
  proposal_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  input_hash TEXT NOT NULL DEFAULT '',
  job_id TEXT NOT NULL DEFAULT '',              -- 배경작업 번호(앞단 호출이면 비어 있다)
  status TEXT NOT NULL DEFAULT 'running',       -- running | done | failed
  result_json TEXT NOT NULL DEFAULT '',
  total_tokens INTEGER NOT NULL DEFAULT 0,
  reused_count INTEGER NOT NULL DEFAULT 0,      -- 이 줄 덕분에 다시 부르지 않은 횟수
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_owner ON ai_jobs(user_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_proposal ON ai_jobs(proposal_id, updated_at);

-- 그때 적용한 단가를 함께 남긴다. 나중에 단가를 넣어도 과거 기록을 되짚어 계산할 수 있게 한다.
-- 단가를 모르는 기록은 0원이 아니라 「계산 불가」다. priced 열이 그 구분을 이미 갖고 있다.
ALTER TABLE ai_usage_events ADD COLUMN price_input_micro INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_usage_events ADD COLUMN price_cached_micro INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_usage_events ADD COLUMN price_output_micro INTEGER NOT NULL DEFAULT 0;
