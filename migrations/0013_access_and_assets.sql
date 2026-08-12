-- 권한 체계·회원별 계획서 연결·사업 아이디어. 표와 열을 더하기만 한다.
-- 기존 행은 지우지도 옮기지도 않는다. archived_proposals 29건은 회원 미지정 상태 그대로 남는다.

-- ---------- 계획서를 회원 계정과 잇는다 ----------
-- 지금까지는 브라우저 복구키(owner_hash)만으로 보관했다. 복구키는 복구수단으로 그대로 둔다.
-- 이메일·기관명이 비슷하다는 이유로 자동 귀속하지 않는다. 값이 비어 있으면 「회원 미지정」이다.
ALTER TABLE archived_proposals ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_proposals ADD COLUMN claimed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_proposals ADD COLUMN claimed_by TEXT NOT NULL DEFAULT '';
-- 회원이 이 계획서에 대해 운영지원 열람을 허락했는지. 기본은 허락하지 않음이다.
ALTER TABLE archived_proposals ADD COLUMN support_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE archived_proposals ADD COLUMN support_consent_at TEXT NOT NULL DEFAULT '';
-- 출력(내려받기) 횟수. 원문은 세지 않고 횟수만 센다.
ALTER TABLE archived_proposals ADD COLUMN export_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_archived_proposals_user ON archived_proposals(user_id, updated_at DESC);

-- 신청기관 자료도 같은 방식으로 잇는다. 자동 귀속하지 않는다.
ALTER TABLE applicant_organizations ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE applicant_organizations ADD COLUMN claimed_at TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_applicant_orgs_user ON applicant_organizations(user_id);

-- ---------- 권한 지정 ----------
-- 최고관리자가 운영관리자·회원에게 「무엇을, 누구 것을, 언제까지, 어떤 동작까지」 열어 줄지 적는다.
-- 행이 없으면 권한이 없다. 이것이 기본값이다.
CREATE TABLE IF NOT EXISTS access_grants (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,              -- 권한을 받는 계정
  subject_role TEXT NOT NULL DEFAULT '', -- 지정 당시 역할. 기록용
  scope TEXT NOT NULL,                   -- members | proposals | applicants | assets | usage | contracts
  target_kind TEXT NOT NULL DEFAULT 'all', -- all | user | proposal | applicant | asset | contract
  target_id TEXT NOT NULL DEFAULT '',    -- target_kind가 all이면 빈 값
  -- 동작 권한. 열람과 수정·내려받기를 따로 준다.
  can_view INTEGER NOT NULL DEFAULT 0,
  can_view_content INTEGER NOT NULL DEFAULT 0, -- 계획서 원문까지 볼 수 있는지
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_download INTEGER NOT NULL DEFAULT 0,
  can_manage INTEGER NOT NULL DEFAULT 0,       -- 승인·중지 같은 회원관리
  can_progress INTEGER NOT NULL DEFAULT 0,     -- 계약 진행상태 변경
  starts_on TEXT NOT NULL DEFAULT '',
  ends_on TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT NOT NULL DEFAULT '',
  revoked_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_access_grants_subject ON access_grants(subject_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_access_grants_target ON access_grants(scope, target_kind, target_id);

-- 자료 열람·내려받기 기록. 계획서 원문·비밀번호·토큰은 넣지 않는다.
CREATE TABLE IF NOT EXISTS data_access_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,                  -- view | viewContent | download | edit | grant | revoke | claim | share
  scope TEXT NOT NULL DEFAULT '',
  target_kind TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  target_user_id TEXT NOT NULL DEFAULT '',
  allowed INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL DEFAULT ''        -- 근거(프리미엄 계약·회원 동의·관리자 권한)
);
CREATE INDEX IF NOT EXISTS idx_data_access_log_at ON data_access_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_data_access_log_actor ON data_access_log(actor_id, at DESC);

-- ---------- 사업 아이디어·활용자산 ----------
-- 「검증된 보유자산」과 「제안 후보 아이디어」를 같은 표에 두되 상태로 가른다.
-- 후보를 확정 실적처럼 쓰지 않기 위해 상태를 반드시 붙인다.
CREATE TABLE IF NOT EXISTS idea_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  owner_hash TEXT NOT NULL DEFAULT '',   -- 복구키만 있는 기존 방식도 함께 받는다
  applicant_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '',         -- 프로그램 | 공간 | 인력 | 협력망 | 자료 | 기타
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('verified', 'candidate', 'selected', 'excluded')),
  problem TEXT NOT NULL DEFAULT '',      -- 해결하려는 문제
  audience TEXT NOT NULL DEFAULT '',     -- 주요 대상
  activities TEXT NOT NULL DEFAULT '',   -- 핵심 활동
  duration TEXT NOT NULL DEFAULT '',     -- 운영 가능한 기간·회기
  resources TEXT NOT NULL DEFAULT '',    -- 필요한 인력·시설·협력자원
  experience TEXT NOT NULL DEFAULT '',   -- 실제 운영 경험·성과
  evidence TEXT NOT NULL DEFAULT '',     -- 근거자료
  adaptable TEXT NOT NULL DEFAULT '',    -- 공모에 맞게 바꿀 수 있는 범위
  evidence_confirmed INTEGER NOT NULL DEFAULT 0, -- 회원이 확인한 근거인지
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idea_assets_user ON idea_assets(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_idea_assets_owner ON idea_assets(owner_hash, updated_at DESC);

-- ---------- 개인정보 처리 안내 ----------
-- 안내 문구가 바뀌어도 기존 계정을 자동 동의로 만들지 않는다. 동의한 판만 기록한다.
ALTER TABLE users ADD COLUMN privacy_notice_version TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN privacy_notice_at TEXT NOT NULL DEFAULT '';
