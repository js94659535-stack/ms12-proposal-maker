-- 월간 구독. 승인 상태·내부역할·프리미엄 계약과 서로 별개다.
-- 실제 결제 연동은 아직 없다. 관리자가 시험용으로만 넣고 끄며, 결제 완료를 가장하지 않는다.
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY,
  -- active: 이용 중 · paused: 관리자가 중지 · ended: 기간 종료
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  started_on TEXT NOT NULL DEFAULT '',
  ends_on TEXT NOT NULL DEFAULT '',
  -- 이번 주기의 시작일과 다음 갱신일. 갱신일이 지나면 사용량을 0으로 되돌린다.
  cycle_start TEXT NOT NULL DEFAULT '',
  renews_on TEXT NOT NULL DEFAULT '',
  -- 이번 주기에 실제로 성공한 건수만 센다. 실패는 되돌린다.
  core_used INTEGER NOT NULL DEFAULT 0,
  diagnosis_used INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  granted_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- 정식회원의 5쪽 핵심제안서 1회는 users.trial_used_at을 그대로 쓴다. 열을 새로 만들지 않는다.
