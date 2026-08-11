-- 「공모정보 검색」 1차. 이미 모아 둔 archived_notices에 검색·공개 관리용 열만 붙인다.
-- 표를 다시 만들지 않고 어떤 행도 지우지 않는다. 새 수집은 이 작업에서 하지 않는다.

-- 원문에 있는 말로만 붙이는 분류. 값이 없으면 빈 문자열로 두고 지어내지 않는다.
ALTER TABLE archived_notices ADD COLUMN region TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_notices ADD COLUMN audience TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_notices ADD COLUMN field TEXT NOT NULL DEFAULT '';
-- 관리자만 보는 운영 정보.
ALTER TABLE archived_notices ADD COLUMN source_url TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_notices ADD COLUMN last_checked_at TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_notices ADD COLUMN duplicate_of TEXT NOT NULL DEFAULT '';
-- 비회원에게 보여 줄지 여부. 기존 자료는 공개 가능한 공모정보이므로 1로 시작한다.
ALTER TABLE archived_notices ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1;

-- 검색 범위를 세 갈래로 나눠 둔다. 맞춤검색은 앞의 둘, 광역검색은 셋을 본다.
-- 공고 본문 원문(notice_json)은 어느 열에도 넣지 않는다.
ALTER TABLE archived_notices ADD COLUMN search_title TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_notices ADD COLUMN search_keywords TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_notices ADD COLUMN search_summary TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_archived_notices_public ON archived_notices(is_public, deadline);
CREATE INDEX IF NOT EXISTS idx_archived_notices_region ON archived_notices(region);
CREATE INDEX IF NOT EXISTS idx_archived_notices_field ON archived_notices(field);

-- 검색 문자열은 띄어쓰기·특수문자 정규화와 연관 키워드 확장이 필요해 SQL로 채우지 않는다.
-- 서버가 읽을 때마다 만들고(withDerived), 앞으로 수집되는 자료는 저장할 때 채운다.
-- 최종 확인일만 지금 있는 값으로 맞춰 둔다.
UPDATE archived_notices SET last_checked_at = updated_at WHERE last_checked_at = '';
