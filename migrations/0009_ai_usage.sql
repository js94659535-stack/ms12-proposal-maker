-- 「AI 사용량·비용 기록」 1차. 어떤 기존 표도 바꾸지 않고 새 표 하나만 만든다.
-- 무엇을 얼마나 썼는지만 남긴다. 공고문·계획서 원문·프롬프트·응답 본문·API 키는 어떤 열에도 담지 않는다.
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  -- 누가 썼는지. 계정 식별자와 로그인 이메일까지만 둔다.
  user_id TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  -- 어느 계획서에 썼는지. 계획서 식별자만 두고 제목·본문은 두지 않는다.
  proposal_id TEXT NOT NULL DEFAULT '',
  -- 작업 종류(analyze, master, fullProposal, trialCorePlan, coaching:start, review 등)와 모델명.
  task TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  -- 토큰. cached_input_tokens는 input_tokens의 일부이고, reasoning_tokens는 output_tokens에 포함된 값이다.
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  -- 비용은 마이크로달러(USD × 1,000,000) 정수로 둔다. 더해도 부동소수 오차가 생기지 않는다.
  cost_micro INTEGER NOT NULL DEFAULT 0,
  -- 단가가 설정되어 있었는지. 0이면 토큰만 기록된 것이고 비용 0은 「무료」가 아니라 「단가 미설정」이다.
  priced INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 1,
  -- 실패 사유는 미리 정한 짧은 코드만. 오류 문장이나 응답 본문은 남기지 않는다.
  failure_stage TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_at ON ai_usage_events(at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_events(user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_proposal ON ai_usage_events(proposal_id, at DESC);
