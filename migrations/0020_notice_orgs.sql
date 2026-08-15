-- 공고 출처·기관 등록부. 화면에 박아 두었던 여섯 가지를 표로 옮기고 관리자가 늘릴 수 있게 한다.
--
-- 지우지 않는다. 쓰지 않기로 한 기관은 상태만 바꾼다(active → paused → archived).
-- 이미 그 기관으로 모아 둔 공고와 그 공고로 쓴 계획서는 이름을 잃으면 안 되기 때문이다.
--
-- collects=0 은 「이름만 등록됨」이라는 뜻이다. 자동수집은 notice-sources.js에 실제 경로가
-- 있는 곳만 돈다. 이름을 넣었다고 저절로 모아 오는 것처럼 보이면 안 된다.
CREATE TABLE IF NOT EXISTS notice_orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- active(이용 중) | paused(일시중지) | archived(보관)
  status TEXT NOT NULL DEFAULT 'active',
  collects INTEGER NOT NULL DEFAULT 0,      -- 자동수집이 실제로 도는 곳인지
  builtin INTEGER NOT NULL DEFAULT 0,       -- 처음부터 있던 여섯 가지
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_notice_orgs_status ON notice_orgs(status, sort_order);

-- 지금 화면에서 쓰던 여섯 가지를 그대로 옮긴다. 키를 바꾸지 않아야 기존 공고·계획서와 이어진다.
INSERT OR IGNORE INTO notice_orgs (id, name, category, sort_order, status, collects, builtin, created_at, updated_at, created_by) VALUES
  ('chest', '사랑의열매', '복지·지원사업', 10, 'active', 1, 1, '2026-08-15', '2026-08-15', 'system'),
  ('family', '가족센터', '가족지원사업', 20, 'active', 1, 1, '2026-08-15', '2026-08-15', 'system'),
  ('edu', '학교·교육청', '교육기관', 30, 'active', 0, 1, '2026-08-15', '2026-08-15', 'system'),
  ('g2b', '나라장터·학교장터', '공공조달', 40, 'active', 0, 1, '2026-08-15', '2026-08-15', 'system'),
  ('foundation', '민간재단·공익법인', '민간 배분사업', 50, 'active', 1, 1, '2026-08-15', '2026-08-15', 'system'),
  ('general', '일반 창업·아이디어', '일반 사업', 60, 'active', 0, 1, '2026-08-15', '2026-08-15', 'system');
