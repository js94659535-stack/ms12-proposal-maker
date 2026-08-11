-- 「이용권(plan)」 1차. 비용을 쓰는 생성 기능을 계정 단위로 통제한다.
-- 기존 users 표를 다시 만들지 않고 열만 붙인다. 어떤 행도 지우지 않는다.

-- trial: 1페이지 사업구상 무료 체험만 가능. full: 전체 기능.
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'full'));
-- 무료 체험을 쓴 시각. 비어 있으면 아직 쓰지 않은 것이고, 계정당 한 번만 채워진다.
ALTER TABLE users ADD COLUMN trial_used_at TEXT NOT NULL DEFAULT '';

-- 이미 쓰고 있던 활성 회원의 현재 이용 권한을 그대로 지킨다. 관리자·운영관리자는 역할로도 전체 기능을 쓰지만 열도 맞춰 둔다.
UPDATE users SET plan = 'full' WHERE status = 'active' OR role IN ('admin', 'operator');

CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
