-- 「소셜 회원가입」 1차. 기존 users·sessions를 그대로 쓰고 소셜 신원만 옆에 붙인다.
-- 공급자 access token·refresh token은 어떤 열에도 저장하지 않는다.

-- users는 status에 'pending'을 넣어야 해서 다시 만든다. 값은 그대로 옮긴다(행이 사라지지 않는다).
CREATE TABLE users_v2 (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'operator', 'admin')),
  org_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  -- pending: 소셜로 가입했으나 관리자가 아직 승인하지 않은 상태
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'disabled')),
  password_algo TEXT NOT NULL DEFAULT '',
  password_iterations INTEGER NOT NULL DEFAULT 0,
  password_salt TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  -- 가입 후 최소 정보
  phone TEXT NOT NULL DEFAULT '',
  org_name TEXT NOT NULL DEFAULT '',
  is_contact INTEGER NOT NULL DEFAULT 0,
  -- 동의 시점과 버전
  terms_version TEXT NOT NULL DEFAULT '',
  privacy_version TEXT NOT NULL DEFAULT '',
  consented_at TEXT NOT NULL DEFAULT '',
  profile_completed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO users_v2 (id, email, role, org_id, name, status, password_algo, password_iterations, password_salt, password_hash, created_at, updated_at)
SELECT id, email, role, org_id, name, status, password_algo, password_iterations, password_salt, password_hash, created_at, updated_at FROM users;

DROP TABLE users;
ALTER TABLE users_v2 RENAME TO users;
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 한 사용자가 Google·카카오를 함께 연결할 수 있다. 같은 소셜 계정은 한 번만 연결된다.
CREATE TABLE IF NOT EXISTS user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'kakao')),
  -- 공급자가 주는 고유 식별자(google: sub, kakao: id). 이메일이 아니다.
  provider_subject TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  linked_at TEXT NOT NULL,
  UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);

-- state와 PKCE 검증값. 한 번 쓰면 지우고 만료되면 버린다. 공급자 토큰은 담지 않는다.
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'kakao')),
  code_verifier TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('signup', 'link')),
  link_user_id TEXT NOT NULL DEFAULT '',
  redirect_uri TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
