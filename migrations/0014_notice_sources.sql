-- 수집 출처 확대. 표와 열을 더하기만 한다. 기존 공고 19건과 계획서 29건은 손대지 않는다.

-- 출처별 켜고 끄기. 행이 없으면 등록부의 기본값을 따른다.
CREATE TABLE IF NOT EXISTS notice_source_settings (
  source_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);

-- 어디서 왔고 어떤 성격인지. 기존 행은 빈 값으로 남고 다음 수집부터 채워진다.
-- 빈 값은 「사랑의열매에서 온 기존 자료」라는 뜻이며 검색에서 지금과 똑같이 다뤄진다.
ALTER TABLE archived_notices ADD COLUMN source_id TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_notices ADD COLUMN source_group TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_notices ADD COLUMN business_type TEXT NOT NULL DEFAULT '';
-- 제안·지원 가능 / 입찰·위탁 참여 가능 / 설명회 / 선정결과 / 채용 / 참여자 모집 / 물품·공사 / 분류 확인 필요
ALTER TABLE archived_notices ADD COLUMN fitness TEXT NOT NULL DEFAULT '';
ALTER TABLE archived_notices ADD COLUMN fitness_reason TEXT NOT NULL DEFAULT '';
-- 나라장터 공고번호. 교육청 게시판과 겹치는지 판정할 때 쓴다.
ALTER TABLE archived_notices ADD COLUMN notice_no TEXT NOT NULL DEFAULT '';
-- 같은 공고를 여러 곳에서 확인했을 때의 출처 링크 모음(JSON 배열). 본문은 넣지 않는다.
ALTER TABLE archived_notices ADD COLUMN source_links TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_archived_notices_source_id ON archived_notices(source_id);
CREATE INDEX IF NOT EXISTS idx_archived_notices_business ON archived_notices(business_type, deadline);
CREATE INDEX IF NOT EXISTS idx_archived_notices_fitness ON archived_notices(fitness);
CREATE INDEX IF NOT EXISTS idx_archived_notices_notice_no ON archived_notices(notice_no);

-- 실행기록에 출처별 제외 사유를 남긴다. 제목·본문은 넣지 않는다.
ALTER TABLE notice_collection_runs ADD COLUMN skipped_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE notice_collection_runs ADD COLUMN merged INTEGER NOT NULL DEFAULT 0;
