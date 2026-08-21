# 지시문이 부르는 이름이 자료에 없는 곳 — 미해결 3건 (2026-08-21 조사)

`fullProposal`의 분량 지시가 「설계안 documentPlan의 목표 분량을 기준으로」라고 적혀 있었는데
`documentPlan`이라는 이름은 보내는 자료 어디에도 없었다. 태그는 `<APPROVED_DESIGN_PLAN>`,
칸은 `outline[].targetChars`다. 그 한 곳은 고쳐 배포했고(`106f2d4`), **같은 어긋남이 더 있는지
프롬프트 열네 갈래를 전부 돌려 세 곳을 더 찾았다. 여기 적은 셋은 고치지 않았다.**

이런 어긋남은 오류를 내지 않는다. 모델이 부를 이름을 못 찾으면 그 지시만 조용히 사라지고
나머지는 정상으로 보인다. 그래서 눈으로는 안 보이고 세어야 보인다.

**코드는 바꾸지 않았다. 크기: 각 중간. 우선순위: 분할 경로를 다시 손볼 때.**

---

## 1. `SYSTEM_POLICY` 4번의 `missingInformation`

`functions/api/proposal.js:441`

> 4. 확인되지 않은 핵심 정보는 본문을 가짜 문구로 채우지 말고 missingInformation에만 질문으로 반환한다.

이 문장은 `proposal.js:266`에서 **모든 행동에 developer 메시지로 함께 나간다.** 그런데
`analyze`·`masterPlan`·`preciseReview`·`patchSections`·`draftPart`·`finalize`·`rewrite`
일곱 스키마에 그 칸이 없다. 스키마는 전부 `additionalProperties: false`이고 호출은
`strict: true`(`proposal.js:269`)라 **모델이 넣고 싶어도 넣을 자리가 없다.**

`analyze`는 같은 뜻의 칸을 **`questions`라는 다른 이름으로 갖고 있다**(`proposal.js:899`).
이름만 어긋난 경우이므로 셋 중 고치기 가장 쉬운 자리다.

조사하면서 네 갈래가 더 나왔다. `coreProposal`은 같은 뜻을 `checkNeeded`로 부르고,
`diagnosis`·`regionBrief`·`draft`(공고 원문 없이 부르는 쪽, `DRAFT_SCHEMA`)에도 그 칸이 없다.
**칸을 가진 것은 `master`·`masterDesign`·`fullProposal`·`draft`(원문 있는 쪽) 넷뿐이고,
열네 갈래 중 열 갈래에는 없다.**

빠져나갈 구멍이 하나 있어 피해가 크지는 않다. 같은 문장이 「[확인 필요]로 남긴다」도 함께
말하므로 모델이 본문에 표시를 남길 수는 있다. 다만 그 표시는 제출 판정과 자동 점검이 세는
값이고, 질문 목록은 화면이 따로 보여 주는 값이라 서로 대신하지 못한다.

## 2. `CONTRACT_RULE`의 「그 차이를 `missingInformation`으로 남긴다」

`functions/api/proposal.js:593`

`masterPlan`과 `draftPart`에서 1번과 같은 이유로 갈 곳이 없다. `MASTER_PLAN_SCHEMA`는
`masterLogic`과 `sectionPlan`뿐이고(`proposal.js:1000`), `DRAFT_PART_SCHEMA`는
`sections`·`continuityCheck`·`continuitySummary`뿐이다(`proposal.js:1011`).

이 규칙은 공고 조건과 사용자 입력이 어긋날 때 무엇을 하라는 문장이라 **어긋남이 실제로
있을 때만 발동한다.** 즉 평소에는 아무 일도 없다가 가장 중요한 순간에 갈 곳이 없다.
`CONTRACT_RULE`은 `payload.noticeContract.rules`가 있을 때만 붙는다(`proposal.js:584`).

## 3. `BLUEPRINT_RULE`의 `pastProjectRecords`·`needsVerification`

`functions/api/proposal.js:600`

> 과거 사업 기록(pastProjectRecords)의 인원·회기·기간·예산을 이번 사업 값으로 옮겨 적지 않는다.
> 확인되지 않은 기관 정보(needsVerification)를 사실처럼 쓰지 않는다.

두 이름은 `organization`에 있는 칸인데(`src/applicants.js:221,223`),
**`masterPlan`과 `draftPart`는 `organization`을 보내지 않는다.** `masterPlan`은
사업 유형·선택 세부사업·설계도·1걸음 결과만 보내고(`proposal.js:734`), `draftPart`는
`MASTER_CONTEXT` 하나로 압축해 보낸다(`proposal.js:777`).

`draftPart`는 한 겹 더 어긋난다. 같은 내용을 보내기는 하는데 **이름이
`applicantNeedsVerification`이다**(`proposal.js:568`). 부르는 이름과 있는 이름이 다르다.
`pastProjectRecords`는 `partContext`에 아예 없다.

덧붙여 `draftPart`에는 `<PROJECT_BLUEPRINT>` 블록 자체가 없다. `blueprintBlock`을 거치지 않고
`BLUEPRINT_RULE`만 붙이기 때문에(`proposal.js:777`) **「위 사업 설계도는」이 가리키는 블록이
없다.** 설계도 값은 `MASTER_CONTEXT` 안 `fixedBasis`·`thisProject`에 들어가 있다.
`fullProposal`과 `master`는 `blueprintBlock`을 쓰므로 이 문제가 없다.

---

## 왜 지금 고치지 않았나

셋 다 분할 경로(`masterPlan`·`draftPart`)를 건드린다. **고치려면 그 경로에서 따로 실측해야 한다.**

문장을 늘리면 다른 지시가 흘러나간다는 것을 두 번 겪었다. 문체 규칙을 `fullProposal`에 넣었더니
문장은 좋아졌는데 [확인 필요] 표시가 8곳에서 5곳으로 줄었고(`proposal.js`의
`CONCRETE_WRITING_RULE` 위 주석), 그 표시는 제출 판정이 세는 값이라 앱이 계획서를 실제보다
완성된 것으로 판단한다. 분량 지시를 고칠 때도 하한 문장을 함께 넣지 않고 ①②만 먼저 쟀다.

`analyze`의 `questions`처럼 이름만 바꾸면 되는 자리와, 스키마에 칸을 새로 여는 자리는
위험이 다르다. 칸을 열면 모델이 그 칸을 채우느라 본문에서 무엇을 덜어 내는지 재야 한다.
전 2회·후 2회로 [확인 필요] 개수와 항목 수가 유지되는지부터 보는 것이 순서다.

---

## `test/prompt-names.test.js`가 이것들을 잡는가

**지금 그대로는 못 잡는다.** 그 파일은 `fullProposal` 한 행동만 부른다.

2번과 3번은 **검사 방식이 이미 맞다.** 지시문 줄에 나온 camelCase 이름을 모아
보내는 자료와 응답 스키마 양쪽에 없으면 실패시키는데, 같은 검사를 `masterPlan`과 `draftPart`에
돌려 보면 `missingInformation`·`pastProjectRecords`·`needsVerification` 셋을 그대로 집어낸다.
행동 목록을 늘리는 것만으로 회귀 감시가 된다.

1번은 **방식 자체가 다르다.** `SYSTEM_POLICY`는 `taskSpecification`이 만드는 프롬프트가 아니라
developer 메시지로 따로 나가므로 `spec.prompt`를 아무리 훑어도 나오지 않는다.
`SYSTEM_POLICY`가 부르는 이름을 행동별 스키마와 대조하는 검사를 따로 써야 한다.

검사를 늘릴 때 주의할 것이 하나 있다. **지어낸 payload가 실제 요청과 다르면 없는 결함이 나온다.**
`fullProposal` 검사를 처음 돌렸을 때 `proposedOnly`가 걸렸는데, 실제로는 설계도 값에 늘 붙어 오는
이름이고 시험용 `items`를 빈 배열로 두어 생긴 거짓 경보였다(`src/app.js:9637`).
행동을 늘리려면 그 행동이 실제로 받는 모양의 자료를 함께 채워야 한다.
