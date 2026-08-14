-- 호출이 막혀 결과가 안 나오는 일을 없앤다.
--
-- 「20분 지나면 새로 부른다」는 시간 추측이었다. 앞단 호출이 죽어도 기록은 running으로 남아
-- 그 20분 동안 사용자가 아무리 눌러도 결과가 나오지 않았다. 크레딧보다 이쪽이 더 큰 문제다.
--
-- 이제 시간으로 짐작하지 않는다.
--   · 앞단 호출: 요청이 살아 있을 수 있는 시간(lease_until)까지만 막는다. 그 시각을 넘기면 죽은 것이다.
--   · 배경 호출: 작업번호로 상류 상태를 실제로 확인한다. 시간과 무관하다.
--   · 사람이 원하면 언제든 「그래도 다시 만들기」로 넘어갈 수 있다(force_count에 남긴다).
ALTER TABLE ai_jobs ADD COLUMN lease_until TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_jobs ADD COLUMN force_count INTEGER NOT NULL DEFAULT 0;
