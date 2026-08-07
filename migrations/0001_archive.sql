CREATE TABLE IF NOT EXISTS archived_notices (
  source_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_label TEXT NOT NULL,
  list_sn TEXT NOT NULL,
  dstb_bsns_code TEXT NOT NULL,
  title TEXT NOT NULL,
  deadline TEXT NOT NULL DEFAULT '',
  application_period TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  eligibility TEXT NOT NULL DEFAULT '',
  support_details TEXT NOT NULL DEFAULT '',
  support_limit TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  notice_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archived_notices_deadline ON archived_notices(deadline);
CREATE INDEX IF NOT EXISTS idx_archived_notices_source ON archived_notices(source);
CREATE INDEX IF NOT EXISTS idx_archived_notices_title ON archived_notices(title);

CREATE TABLE IF NOT EXISTS archived_proposals (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  notice_key TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  proposal_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archived_proposals_owner_updated ON archived_proposals(owner_hash, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_archived_proposals_notice ON archived_proposals(notice_key);
