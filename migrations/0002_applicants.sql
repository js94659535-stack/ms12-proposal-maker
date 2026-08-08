-- 「신청기관 정보」 보관용 테이블. 로컬(--local) 적용만 하고 운영 D1에는 사용자가 직접 적용한다.
CREATE TABLE IF NOT EXISTS applicant_organizations (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  confirmed_count INTEGER NOT NULL DEFAULT 0,
  unverified_count INTEGER NOT NULL DEFAULT 0,
  applicant_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applicant_organizations_owner_updated ON applicant_organizations(owner_hash, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_applicant_organizations_name ON applicant_organizations(name);
