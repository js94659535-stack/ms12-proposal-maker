# 사용량 기록 — 배포 기준선 (2026-08-19)

`75ee39e` → `f8bf7bf` 배포 직전의 `ai_usage_events` 상태다. **이 숫자가 기준선이다.**
며칠 뒤 여기와 견주어 본다.

| | 값 |
|---|---|
| 전체 | **134건** |
| `ok = 0` | **0건** |
| `failure_stage`가 빈 값이 아닌 것 | **0건** |
| 마지막 기록 | **2026-08-17T00:11:49Z** |

134건 전부가 성공으로 기록돼 있었다. 그런데 그 안에는 `master` 하나가
**12,000/12,000을 채우고 114초 만에 끝난 것**이 섞여 있다.
상한을 바이트까지 채운 응답은 잘린 것이고, 그것이 `ok=1`로 남아 있었다.

**전부 성공이라는 기록이 사실이 아니었다.** 이번 배포가 고친 것이 그 눈멂이다.

액션별 최대 출력(배포 시점):

| task | 건수 | 최대 출력 | 상한 대비 |
|---|---|---|---|
| `master` | 12 | **12,000** | **100%** — 잘린 것 |
| `patchSections` | 2 | 8,003 | 80% |
| `fullProposal` | 3 | 7,326 | 37% |
| `coaching:complete` | 7 | 6,558 | — |
| `masterDesign` | 8 | 5,330 | 67% |
| `masterPlan` | 7 | 4,557 | 65% |
| `draftPart` | 82 | 4,246 | 61% |
| `analyze` | 3 | 940 | 16% |

상한의 70%를 넘은 호출은 `master` 12건 중 **5건**, `patchSections` 2건 중 **1건**,
나머지는 0건이었다.

`preciseReview`와 `finalize`는 **한 건도 없다.** 아무도 쓰지 않았다.

---

## 며칠 뒤 볼 것 셋

**1. `ok=0`이 0에서 움직였는가.**
움직였으면 이제 실패가 보인다는 뜻이다. 안 움직였으면 호출이 없었거나(마지막 기록 시각으로
확인한다) 정말로 실패가 없는 것이다. 배포 직후에는 호출 자체가 없어 아무것도 쌓이지 않는다.

**2. `failure_stage`에 `output-incomplete`가 나타나는가.**
나타나면 출력 상한이 실제로 걸리고 있다. **어느 `task`에서 나는지가 다음에 손볼 대상을 정한다.**

**3. 액션별로 상한의 70%를 넘은 비율.**
잘리기 전에 먼저 올라가는 신호다. 위 표가 출발점이다.

```sql
SELECT task, COUNT(*) AS n,
       SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed,
       MAX(output_tokens) AS max_out
FROM ai_usage_events GROUP BY task ORDER BY failed DESC, max_out DESC;

SELECT failure_stage, COUNT(*) AS n FROM ai_usage_events
WHERE failure_stage <> '' GROUP BY failure_stage;
```

읽기만 한다. 액션별 상한은 `functions/api/proposal.js`의 `LIMITS.outputTokens`에 있고,
코칭은 `functions/api/proposal-coaching.js`가 따로 정한다.

---

## 이번에 배포한 것 셋

| 무엇 | 성격 |
|---|---|
| `proposal.js` — 판정을 기록보다 먼저 | **보이게 하는 것** |
| `proposal-coaching.js` 두 자리 — 끊김 검사 자체가 없었다 | **보이게 하는 것** |
| 심사·코칭 프롬프트에 검증기가 쓰는 값 주입 | **거절을 막는 것** |

앞의 둘만 기록에 나타난다. 셋째는 나타나지 않는 것이 정상이다 —
심사 기준 이름이 어긋나 502가 나던 일이 애초에 생기지 않는다.

`proposal.js`와 코칭은 병이 달랐다. 앞쪽은 **검사는 하되 순서가 틀렸고**,
코칭은 **검사 자체가 없었다.** 코칭은 `data.status`를 한 번도 보지 않아 두 겹으로 눈멀어 있었다.

---

## 함께 알아 둘 것

이날의 상세한 실측 기록은 **`anthropic-migration` 브랜치의 `docs/generation-limits.md`**에 있다.
main에는 없다. Anthropic 전환을 보류하면서 그 브랜치에 남았고,
전환을 재개하든 생성 구조를 다시 짜든 그 문서가 출발점이다.

거기 있는 것 중 여기서도 쓰이는 결론 하나 — **표본 하나로 상한을 정하면 안 된다.**
같은 호출을 조건을 바꾸지 않고 두 번 재서 28%까지 벌어진 것을 세 번 확인했다.
위 70% 기준도 그래서 여유를 둔 값이다.

---

## 단가 확인과 그동안의 실제 비용 (2026-08-19)

**134건 전부 `cost_micro`가 0이었다.** 운영 Cloudflare에 `OPENAI_PRICE_*` 세 개가 없어서
`priceOf()`가 `priced: false`를 돌려주고 있었다.

`developers.openai.com/api/docs/pricing`에서 확인한 `gpt-5.6-sol` 단가(1M 토큰당):

| | 값 |
|---|---|
| 입력 | **$5.00** |
| 캐시된 입력 | **$0.50** |
| 출력 | **$30.00** |

같은 표에 「long context」 열이 따로 있고 $10 / $1 / $45다. **어느 입력 길이부터 그쪽인지는
문서에 적혀 있지 않다.** 지금 호출은 입력이 수천 토큰 수준이라 short context로 본다.
입력이 크게 늘면 이 가정을 다시 확인해야 한다.

이 단가로 기록된 134건을 계산하면 — 입력 1,282,961 · 캐시 36,757 · 출력 409,145토큰:

**$18.52.** 계획서 한 건당 상한 $20의 **93%**에 해당하는 금액이 이미 나갔다.

**그런데 상한은 한 번도 걸리지 않았고, 걸릴 수도 없었다.** 상한이 **계획서 한 건 단위**여서다.
가장 많이 쓴 계획서 하나가 $3.41(17%)이고, 나머지도 전부 그 아래다.
**계정 전체·서비스 전체에 걸리는 비용 상한은 없다.** 계정 단위 상한은 하루 토큰 하나뿐이고
그것도 최대치가 상한의 5.7%였다.

한 가지 더 — **출력이 전체 토큰의 24%인데 비용으로는 66%를 차지한다.** 출력 단가가 입력의 6배다.
「입력은 싸고 출력은 비싸다」가 이 단가로 확인됐다. 잘리는 호출을 줄이는 일은 비용 문제이기도 하다.

### 아직 안 된 것

세 값을 **운영 Cloudflare에 넣어야 한다.** Workers & Pages → ms12-proposal-maker →
Settings → Variables and Secrets:

```
OPENAI_PRICE_INPUT_PER_MTOK         5.0
OPENAI_PRICE_CACHED_INPUT_PER_MTOK  0.5
OPENAI_PRICE_OUTPUT_PER_MTOK        30.0
```

넣기 전까지는 비용 상한이 계속 꺼져 있다. **넣어도 새 배포부터 반영된다.**
그리고 이미 기록된 134건의 `cost_micro`는 0으로 남는다 — 지난 기록을 되살리지는 않는다.

---

## 내부 이름 유출 — 배포 기준선 (2026-08-19)

계획서 설계 화면에 **「최상위 NOTICE_CONTRACT는 '지역사회 내…'」**가 그대로 인쇄된 것을
사용자가 눈으로 발견했다. 프롬프트가 `NOTICE_CONTRACT는 … 최상위 기준이다`라고
그 이름으로 개념을 정의했고, 모델이 근거를 설명하며 배운 이름을 그대로 불렀다.

이번 배포로 두 가지가 함께 나간다 — **검사**와 **정의 문장 다섯의 수정**이다.

검사는 막지 않는다. 토큰은 이미 나갔고 막으면 사용자가 결과를 통째로 못 받는다.
`guard.internalLabels`로 돌려주고 `user_activity_events`에 `leak:<액션>:<이름>`으로 남긴다.
한 응답에서 최대 세 개만 남기며, 접은 수는 응답의 `internalLabelsRecorded`에 그대로 있다.

**배포 시점 기준선: `leak:`으로 시작하는 기록 0건.**

### 고친 다섯 (프롬프트 문장 20곳 → 15곳)

| 내부 이름 | 바꾼 말 | 그 말이 원래 있던 곳 |
|---|---|---|
| `NOTICE_CONTRACT` | 공고 실행계약서 | `contractHandoff`의 `priority[0]` |
| `PROJECT_BLUEPRINT` | 사업 설계도 | 설계도 카드 제목 |
| `MASTER_CONTEXT` | 마스터 설계 | 보관함 단계 라벨 |
| `APPROVED_DESIGN_PLAN` | 승인 설계안 | 정밀 검증 안내 문구 |
| `CONFIRMED_DESIGN` | 설계 1걸음 결과 | 진행 라벨·검증 오류 문구 |

전부 코드나 화면에 이미 있던 말이다. 새로 짓지 않았다.
태그 `<NOTICE_CONTRACT>`는 그대로 뒀다 — 경계 표시라 안전하다.

**실측 1회**: `masterDesign` 81초·출력 5,795/8,000·$0.202. 응답 10,182자에서 유출 0건,
밑줄(`_`)조차 0회. 「사업 설계도」는 2회 나왔다 — **이름을 안 쓴 것이 아니라 한국어로 부른다.**
다만 **표본 하나다.** 「여전히 난다」를 반증했을 뿐 「이제 안 난다」를 증명하지는 못했다.

### 남은 15곳

`CONDITIONS` · `CORE_IDEA` · `PAGE_PLAN`(각 2회) · `CANDIDATE_ASSETS` · `CONFIRMED_VALUES` ·
`CONTINUITY_SUMMARY` · `CURRENT_APPLICATION_GROUP` · `MANUAL_SOURCES` · `OFFICIAL_NOTICE_TEXT` ·
`REFERENCE` · `RELEVANT_PREVIOUS_SECTIONS` · `REVIEW_BASIS` · `SELECTED_SUBPROGRAM` ·
`SUBTITLE` · `WORKING_TITLE`(각 1회)

대부분 「~에 적힌 값을 쓴다」처럼 **위치를 가리키는** 문장이라 정의 문장보다 위험이 낮다.
**어느 것이 실제로 새는지는 운영 기록만 알려 준다.** 그래서 다 고치기 전에 배포했다 —
전부 고쳐 버리면 그 정보를 얻을 길이 없다.

### 며칠 뒤 볼 것

```sql
-- 1. 유출이 실제로 잡히는가. 0이면 안 났거나 호출이 없었던 것이다(아래 2번으로 가른다).
SELECT code, COUNT(*) AS n, MIN(at) AS first_at, MAX(at) AS last_at
FROM user_activity_events WHERE code LIKE 'leak:%'
GROUP BY code ORDER BY n DESC;

-- 2. 그동안 호출이 있기는 했는가. 없으면 1번의 0은 아무 뜻이 없다.
SELECT task, COUNT(*) AS n, MAX(at) AS last_at FROM ai_usage_events
WHERE at > '2026-08-19' GROUP BY task ORDER BY n DESC;

-- 3. 어느 액션이 새는가. code는 leak:<액션>:<이름> 꼴이다.
SELECT substr(code, 6, instr(substr(code, 6), ':') - 1) AS task, COUNT(*) AS n
FROM user_activity_events WHERE code LIKE 'leak:%' GROUP BY task ORDER BY n DESC;
```

**읽기만 한다.** 1번이 비어 있어도 2번이 비어 있으면 「유출이 없다」가 아니라
「잴 기회가 없었다」이다. 이 둘을 반드시 함께 본다 —
지난번 `ok=0`이 0이던 것도 실패가 없어서가 아니라 호출이 없어서였다.
