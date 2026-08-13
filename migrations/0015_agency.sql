-- 대행회원 자격과 한도. 기존 표는 지우지 않고 열과 표만 더한다.
--
-- 대행회원은 파는 상품이 아니다. 최고관리자가 믿을 수 있는 일반회원을 임명하는 자리다.
-- 그래서 구독·프리미엄 계약과 같은 표에 두지 않고 따로 둔다. 요금과 섞이지 않게 하려는 것이다.

CREATE TABLE IF NOT EXISTS agency_grants (
  user_id TEXT PRIMARY KEY,
  -- active(쓰는 중) | paused(일시중지) | revoked(자격 해제)
  status TEXT NOT NULL DEFAULT 'active',
  granted_by TEXT NOT NULL DEFAULT '',
  granted_at TEXT NOT NULL DEFAULT '',
  starts_on TEXT NOT NULL DEFAULT '',            -- 비어 있으면 부여 즉시
  ends_on TEXT NOT NULL DEFAULT '',              -- 비어 있으면 종료일 없음
  -- AI 비용 통제용 한도. -1은 쓰지 않는다. 값이 없으면 화면·서버가 기본 한도를 쓴다.
  monthly_plans INTEGER NOT NULL DEFAULT 0,
  revisions_per_plan INTEGER NOT NULL DEFAULT 0,
  monthly_diagnoses INTEGER NOT NULL DEFAULT 0,
  monthly_tokens INTEGER NOT NULL DEFAULT 0,
  monthly_cost_micro INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  revoked_at TEXT NOT NULL DEFAULT '',
  revoked_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  last_active_at TEXT NOT NULL DEFAULT ''
);

-- 대행 업무 자료와 개인 작업공간을 나눈다. 기존 자료는 모두 개인(personal)으로 남는다.
ALTER TABLE applicant_organizations ADD COLUMN workspace TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE applicant_organizations ADD COLUMN agency_user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_proposals ADD COLUMN workspace TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE archived_proposals ADD COLUMN agency_user_id TEXT NOT NULL DEFAULT '';

-- 사용량은 실제 실행자(대행회원)와 대상 고객 기관에 함께 남긴다.
ALTER TABLE ai_usage_events ADD COLUMN agency_user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_usage_events ADD COLUMN client_org_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_agency_orgs ON applicant_organizations(agency_user_id);
CREATE INDEX IF NOT EXISTS idx_agency_proposals ON archived_proposals(agency_user_id);
CREATE INDEX IF NOT EXISTS idx_agency_usage ON ai_usage_events(agency_user_id, at);
