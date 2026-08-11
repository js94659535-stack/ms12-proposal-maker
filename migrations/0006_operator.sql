-- 「운영관리자(operator)」 1차. 기존 users·sessions·login_attempts를 그대로 쓰고 옆에만 붙인다.
-- 어떤 기존 표도 지우거나 다시 만들지 않는다. 비밀번호 원문·해시는 여기에 담지 않는다.

-- 승인·중지·재활성화·세션 종료·복구코드 발급 등 실행자·대상·동작·시간을 남긴다.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  target_email TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT 'ok',
  -- 짧은 사유만 남긴다. 계획서 원문이나 비밀번호는 어떤 경우에도 넣지 않는다.
  detail TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_at ON admin_audit_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_id, at DESC);

-- 일회용 계정 복구코드. 원문은 발급 응답에 한 번만 실리고 여기에는 해시만 남는다.
CREATE TABLE IF NOT EXISTS account_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  issued_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  -- 10분. 지나면 쓰지 못하고 정리 대상이 된다.
  expires_at TEXT NOT NULL,
  -- 한 번 쓰면 시각이 찍히고 다시 쓰이지 않는다.
  used_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_recovery_user ON account_recovery_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_expires ON account_recovery_codes(expires_at);

-- 사용자가 어느 단계에서 멈췄는지와 최근 오류 종류. 계획서 원문·개인정보는 담지 않는다.
-- 단계 번호와 미리 정한 오류 코드만 저장한다.
CREATE TABLE IF NOT EXISTS user_activity_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('step', 'error')),
  step INTEGER NOT NULL DEFAULT -1,
  step_label TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity_events(user_id, at DESC);
