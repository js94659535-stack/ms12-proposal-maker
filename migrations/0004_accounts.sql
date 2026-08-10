-- 「계정·세션」 1차. 관리자 로그인 없이는 어떤 /api도 쓰지 못하게 하는 최소 구조다.
-- 비밀번호와 세션 원문은 어디에도 저장하지 않는다. 해시와 해시 방식만 남긴다.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'operator', 'admin')),
  org_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  -- 해시 방식과 반복 횟수를 행에 기록한다. 나중에 값을 올려도 기존 계정이 그대로 열린다.
  password_algo TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

CREATE TABLE IF NOT EXISTS sessions (
  -- 세션 원문은 저장하지 않는다. 쿠키로만 오가고 여기에는 SHA-256 해시만 남는다.
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  -- 어떤 계정을 노렸는지 알 수 없게 이메일도 해시로만 센다.
  email_hash TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email_hash, at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_client ON login_attempts(client_hash, at);
