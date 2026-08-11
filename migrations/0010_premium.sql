-- 프리미엄회원(정식 수주회원), 공개용 우수 제안서, 회원 본인정보.
-- 모두 더하기만 한다. 기존 열·행은 건드리지 않는다.

-- 정식 수주계약. 월간 이용권(users.plan)과 별도로 시작일·종료일·진행상태를 따로 관리한다.
-- 계약이 끝나도 행은 남긴다. 이미 전달한 결과물을 계속 읽을 수 있어야 하기 때문이다.
CREATE TABLE IF NOT EXISTS premium_contracts (
  user_id TEXT PRIMARY KEY,
  -- active: 진행 중 · suspended: 관리자가 중지 · ended: 계약 종료(열람만)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'ended')),
  started_on TEXT NOT NULL DEFAULT '',
  ends_on TEXT NOT NULL DEFAULT '',
  -- 전문가 작업 진행상태. 운영관리자가 바꿀 수 있다. 권한과는 무관하다.
  progress TEXT NOT NULL DEFAULT '접수' CHECK (progress IN ('접수', '자료확인', '작성중', '검토중', '수정중', '전달완료', '보류')),
  progress_note TEXT NOT NULL DEFAULT '',
  contract_name TEXT NOT NULL DEFAULT '',
  granted_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_premium_status ON premium_contracts(status);

-- 공개용 우수 제안서. 관리자가 손으로 만든 사본만 들어온다.
-- 회원 계획서(archived_proposals)를 자동으로 옮기지 않는다. 원본 식별자도 저장하지 않는다.
CREATE TABLE IF NOT EXISTS showcase_proposals (
  id TEXT PRIMARY KEY,
  field TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  structure TEXT NOT NULL DEFAULT '',
  outcome_design TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  -- 0이면 비공개. 공개는 최대 5편까지만 허용하며 서버가 센다.
  is_public INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_showcase_public ON showcase_proposals(is_public, sort_order);

-- 회원이 직접 고치는 기관정보. 계획서 작성에 다시 쓴다.
-- 역할·승인·이용권·프리미엄 상태는 여기에 두지 않는다. 회원이 바꿀 수 없어야 하기 때문이다.
CREATE TABLE IF NOT EXISTS member_profiles (
  user_id TEXT PRIMARY KEY,
  org_type TEXT NOT NULL DEFAULT '',
  org_address TEXT NOT NULL DEFAULT '',
  org_intro TEXT NOT NULL DEFAULT '',
  staff TEXT NOT NULL DEFAULT '',
  facilities TEXT NOT NULL DEFAULT '',
  programs TEXT NOT NULL DEFAULT '',
  achievements TEXT NOT NULL DEFAULT '',
  partners TEXT NOT NULL DEFAULT '',
  reuse_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- 본인정보를 마지막으로 고친 시각. 관리자 화면의 「최근 변경 회원」이 이 열을 본다.
ALTER TABLE users ADD COLUMN profile_updated_at TEXT NOT NULL DEFAULT '';
-- 기관명·기관 유형처럼 중요한 항목이 바뀌면 1. 이용을 막지는 않고 확인만 요청한다.
ALTER TABLE users ADD COLUMN profile_review_needed INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_profile_updated ON users(profile_updated_at);
