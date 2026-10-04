# pro.ms12.org

공모 사업계획서를 만드는 작은 도구 모음. 2026-10-04에 이전 플랫폼(계정·관리자·AI 호출·공고 수집)을 모두 걷어내고 다시 시작했다. 이전 상태는 태그 `v-before-reset`에 그대로 있다(`git checkout v-before-reset`).

- `/` 랜딩 페이지(`public/index.html`, 링크 둘)
- `/baeumteo/` 배움터 협력 계획서 — 삼성꿈장학재단 2027 배움터 교육지원사업, 진로설계 완성 가상 계획서
- `/radar/` 삼성 공고 레이더 — `functions/api/radar.js` 가 삼성 공개 공고를 읽는다(로그인 없음)
- `tools/career-final.mjs` 한글(HWPX)·PDF·안내서·제출 준비 점검 파일을 만든다. `--mode "최종 제출본"` 은 게이트를 통과해야 한다
- `tools/build.mjs` 배포용 빌드(`npm run build`) — public 을 dist 로 복사한다
- `docs/work-log.md` 작업 기록, `reports/` 산출물

배포: `main` 에 push 하면 Cloudflare Pages 가 `dist` 를 올린다. 도메인과 Secret 설정은 Cloudflare 대시보드에 그대로 있다.
