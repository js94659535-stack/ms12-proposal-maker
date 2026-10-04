# 공고 수집 Worker

Cloudflare에 `ms12-notice-collector` 라는 이름으로 **배포되어 하루 두 번(한국시간 08:00·18:00) 돌고 있다.** 같은 D1(`ms12-proposal-archive`)의 `archived_notices` 에 공고를 쌓고, `notice_collection_runs` 에 실행 기록을 남긴다.
이 폴더에는 소스가 없다. 2026-10-04 초기화 때 지웠고, 소스 전체는 태그 `v-before-reset` 에 있다(`worker/notice-collector.js`, `worker/wrangler.toml`).

저장소에 되살려 둔 것은 **수집 규칙**(`server/notice-*.js`, `server/extra-collect.js`, `server/source-parsers.js`, `server/chest-notices.js`)과 그 시험이다. 화면 `/radar/` 는 `functions/api/crawl.js` 가 D1을 읽어 보여 준다(읽기 전용).
Worker를 고쳐 다시 올리려면 `git checkout v-before-reset -- worker functions/api/archive.js server` 로 소스를 가져와 `npx wrangler deploy --config worker/wrangler.toml` 한다.
