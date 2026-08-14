-- 구독 신청서. 회원이 적어 내면 관리자가 보고 열어 준다. 기존 표는 지우지 않고 더하기만 한다.
--
-- 지금까지 「월간 구독 신청」은 문구뿐이었다. 회원이 신청해도 관리자에게 아무것도 남지 않아
-- 무엇을 확인하고 열어야 하는지 알 수 없었다. 신청 내용을 여기에 남긴다.
--
-- 결제는 아직 연결되어 있지 않다. 결제 완료를 가장하지 않고, 관리자가 확인한 건만 손으로 연다.
CREATE TABLE IF NOT EXISTS subscription_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  org_name TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',              -- 무엇에 쓰려는지 한두 줄
  wanted_start TEXT NOT NULL DEFAULT '',         -- 희망 시작일(YYYY-MM-DD)
  monthly_plans TEXT NOT NULL DEFAULT '',        -- 월 예상 사용 편수(적은 그대로 둔다)
  payment_ack INTEGER NOT NULL DEFAULT 0,        -- 결제 미연동·관리자 확인 후 개설에 동의했는지
  -- pending(검토 중) | approved(열어 줌) | rejected(거절)
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT NOT NULL DEFAULT '',
  decided_at TEXT NOT NULL DEFAULT '',
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sub_requests_status ON subscription_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sub_requests_user ON subscription_requests(user_id, created_at);
