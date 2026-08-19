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
