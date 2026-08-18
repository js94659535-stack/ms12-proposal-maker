# OpenAI → Anthropic(Claude) 전환 작업지시서

이 문서는 `ms12-proposal-maker`의 AI 호출을 OpenAI에서 Anthropic으로 옮기는 작업의 순서와 완료 기준을 정한다.
Cursor·터미널에서 한 단계씩 실행하고, 각 단계 끝에서 `npm test`가 통과해야 다음 단계로 간다.

---

## 세 가지 원칙

**1. 리팩터링과 벤더 교체를 섞지 않는다.**
1·2단계는 OpenAI를 그대로 쓴 채로 끝낸다. 그래야 3단계에서 문제가 생겼을 때
"Anthropic 때문인지 내가 고친 것 때문인지"를 구분할 수 있다.

**2. 스키마 리터럴은 손대지 않는다.**
미지원 제약이 39곳에 흩어져 있다. 사람이 39곳을 고치면 그만큼 틀린다.
보내기 직전에 코드가 자동으로 떼어 내고, 받은 뒤에 원본과 대조한다.

**3. 한 단계 = 한 커밋.**
되돌릴 지점을 만든다.

---

## 0단계 · 안전망 (30분)

```bash
cd C:\Users\UserK\Desktop\PLATFORM\ms12-proposal-maker
git checkout -b anthropic-migration
npm install
npm test
```

**완료 기준:** `# pass 939` / `# fail 0`

지금 이 숫자를 적어 둔다. 앞으로 모든 단계에서 이 숫자가 줄면 안 된다.

---

## 1단계 · 스키마 제약 걷어내기 (OpenAI 그대로)

### 왜 하나

Anthropic Structured Outputs는 `minItems`·`maxItems`·`minimum`·`maximum`을 받지 않는다.
그대로 보내면 400 오류다. 이 프로젝트에는 39곳에 쓰여 있다.

| 제약 | 건수 | 무엇을 지키던 것인가 |
|---|---|---|
| `maxItems` | 18 | 표는 3개까지, 부족정보는 5개까지 |
| `minItems` | 16 | **항목 10개 반드시**, 프로그램 3개 이상 |
| `minimum` | 3 | 쪽수·인원 하한 |
| `maximum` | 2 | 쪽수·인원 상한 |

특히 `functions/api/proposal.js:914`의 `sections: { minItems: 10, maxItems: 10 }`은
"10개 항목을 반드시 채운다"를 **문법 수준에서 강제**하던 장치다. 그냥 지우면 그 약속이 사라진다.

### 무엇을 하나

`server/schema-limits.js` **(이미 생성됨 — 검증 완료)** 를 호출부에 연결한다.

- `stripUnsupported(schema)` — 보내기 전. 제약을 떼고 `description`에 말로 적는다.
  `minItems: 4` → `"4개 이상"`. 모델이 문법이 아니라 지시문으로 읽는다.
- `validateSchema(원본schema, 결과)` — 받은 뒤. 원본과 대조해 어긋난 곳을 찾는다.

### 고칠 파일

**`functions/api/proposal.js`**

```js
// 파일 상단 import에 추가
import { stripUnsupported, validateSchema, summarizeIssues } from '../../server/schema-limits.js';
```

```js
// 251줄 부근, 보내는 곳
text: { verbosity: 'medium', format: {
  type: 'json_schema', name: specification.name, strict: true,
  schema: stripUnsupported(specification.schema)   // ← 여기만 바뀐다
} },
```

```js
// 302줄 부근, JSON.parse 직후
try { result = JSON.parse(outputText); } catch { /* 기존 그대로 */ }

// ↓ 추가
const schemaIssues = validateSchema(specification.schema, result);
```

`schemaIssues`는 **막는 데 쓰지 않는다.** 이미 `alignSections`가 빠진 항목을 `[확인 필요]`로
메우고 있으므로, 여기서 502를 던지면 지금보다 나빠진다. 응답의 `guard`에 실어 보내
화면이 "모델이 약속을 지키지 못한 항목"을 표시하게 한다.

```js
guard: { ..., schemaIssues: summarizeIssues(schemaIssues) }
```

**`functions/api/proposal-coaching.js`** (132줄) 과 **`functions/api/proposal-review.js`** (38줄) 도 같은 방식.

### 완료 기준

```bash
npm test          # 939 통과 유지
```

새 테스트 파일 `test/schema-limits.test.js`를 만들어 다음 7가지를 고정한다
(이미 수동 검증으로 전부 통과 확인함):

1. 변환 결과에 미지원 제약이 하나도 남지 않는다
2. `minItems: 1, maxItems: 20` → description `"1개 이상, 20개까지"`
3. 원본 스키마 객체가 오염되지 않는다
4. 중첩된 object에 `additionalProperties: false`가 자동으로 붙는다
5. 규칙을 어긴 응답에서 어긋난 지점을 정확히 찾는다
6. 정상 응답에서는 오탐이 없다
7. enum 대소문자가 흔들려도 오탐하지 않는다 *(Anthropic 문서가 경고한 알려진 동작)*

### 이 단계에서 관찰할 것

OpenAI에서도 `minItems` 강제가 사라지므로, **품질 저하가 여기서 먼저 드러난다.**
`schemaIssues`가 자주 뜨면 프롬프트로 보강해야 한다는 신호다.
Anthropic으로 넘어가기 **전에** 이걸 관찰할 수 있다는 것이 이 순서의 이유다.

---

## 2단계 · 오래 걸리는 작업 쪼개기 (OpenAI 그대로)

### 왜 하나

지금은 `master` 작업을 OpenAI의 **번호표 기능**(`background: true` + `GET /v1/responses/{id}` 폴링)으로
돌린다. Anthropic에는 이 기능이 없다.

```js
// functions/api/proposal.js:222
const background = body.action === 'master' || (BACKGROUND_ACTIONS.has(body.action) && body.background === true);
```

Cloudflare에서 "응답만 먼저 보내고 뒤에서 계속 일하기"는 불가능하다
(`waitUntil`은 수명을 늘려 주지 않고, fetch 핸들러는 시작 30초 뒤 종료된다).

### 무엇을 하나

`master` 하나로 부르던 것을 **`masterDesign` → `masterPlan` 두 번**으로만 부른다.
코드에 이미 있고, 주석이 근거를 적어 두었다:

> 설계 두 걸음은 앞단으로 돈다(각 5천 토큰 안팎이라 게이트웨이 100초 벽 아래다).

`LIMITS.outputTokens`도 이를 뒷받침한다 — `master: 12,000` vs `masterDesign: 8,000` + `masterPlan: 7,000`.

### 창을 닫아도 안전한 이유

`server/ai-jobs.js`가 이미 해결해 두었다. `decideReuse()`가 이렇게 판정한다:

```js
if (row.status === 'done' && row.result_json) return { kind: 'done' };
```

즉 **끝난 단계는 D1에 결과가 남아 있어 다시 부르지 않는다.**
`masterDesign`을 마치고 창을 닫아도, 다시 열면 그 결과를 그대로 꺼내 `masterPlan`부터 이어 간다.
번호표 없이도 "닫고 돌아오기"가 된다.

### 고칠 곳

| 파일 | 무엇을 |
|---|---|
| `functions/api/proposal.js:22` | `BACKGROUND_ACTIONS`를 빈 Set으로 |
| `functions/api/proposal.js:222` | `background` 계산 삭제 |
| `functions/api/proposal.js:225-250` | `jobId` 폴링 분기 삭제 |
| `functions/api/proposal.js:288-296` | `background && !jobId` 응답 분기 삭제 |
| `src/app.js` | `master` 호출을 2단계 순차 호출로 |
| `server/ai-jobs.js` | `BACKGROUND_LEASE_MS`와 `row.job_id` 분기 삭제 |

### 완료 기준

- `npm test` 939 통과
- 실제 배포 환경에서 설계 생성이 **100초 안에** 끝나는지 확인
- 중간에 창을 닫고 다시 열어 **이어서 진행되는지** 확인

> ⚠️ 2단계는 실제 서버 확인이 필요한 유일한 단계다. 여기서 100초를 넘기면
> 나-1(Cloudflare Queues)로 되돌아가야 한다. **그래서 3단계보다 먼저 한다.**

---

## 3단계 · Anthropic 어댑터 신설 및 교체

여기서 처음으로 벤더가 바뀐다. 1·2단계가 끝나 있어야 원인 추적이 된다.

### 새 파일 `server/anthropic.js`

호출·응답·오류를 한 곳에 모은다. 지금 `proposal.js`·`proposal-coaching.js`·`proposal-review.js`
세 곳에 흩어진 fetch를 이 파일 하나로 부른다.

**바뀌는 것 대조표**

| 지금 (OpenAI Responses) | 바꿀 것 (Anthropic Messages) |
|---|---|
| `POST /v1/responses` | `POST /v1/messages` |
| `Authorization: Bearer …` | `x-api-key: …` + `anthropic-version: 2023-06-01` |
| `input: [{role:'developer'}, {role:'user'}]` | `system: "…"` + `messages: [{role:'user'}]` |
| `content: [{type:'input_text'}]` | `content: [{type:'text'}]` |
| `text.format = {type:'json_schema', strict:true, schema}` | `output_config.format = {type:'json_schema', schema}` |
| `max_output_tokens` | `max_tokens` |
| `reasoning: { effort }` | 확인 필요 — 3단계 착수 시 최신 문서 조회 |
| `safety_identifier` | 대응 없음. `metadata.user_id` 검토 |
| `status: 'incomplete'` + `incomplete_details.reason` | `stop_reason: 'max_tokens'` |
| *(없음)* | **`stop_reason: 'refusal'` — 신규 처리 필요** |
| `response.output_text` | `response.content[0].text` |

### `stop_reason: 'refusal'` — 새로 생기는 경우

Anthropic은 안전상 거절할 때 **HTTP 200**에 `stop_reason: "refusal"`을 담아 보낸다.
이때 응답은 스키마를 따르지 않고, **토큰은 청구된다.**

지금 코드는 이 경우 `JSON.parse` 실패로 502를 뱉고 `refund()`를 호출한다.
청구된 요금을 환불 처리하게 되므로 **회계가 어긋난다.** 별도 분기를 만들어야 한다.

### 고칠 파일

- `functions/api/proposal.js` (230·251줄)
- `functions/api/proposal-coaching.js` (132·151줄)
- `functions/api/proposal-review.js` (38줄)
- `normalizeOpenAIError` / `openAIDiagnostic` → 이름과 내용 모두 교체

### 완료 기준

`npm test` 통과 + 실제 키로 각 액션 1회씩 성공

---

## 4단계 · 비용 계산 고치기

### 왜 하나 — 토큰 구조가 정반대다

```js
// server/ai-usage.js:22 — 지금
const cached = Math.min(count(usage.input_tokens_details?.cached_tokens), input);
// costMicro: (input − cached) × 입력단가 + cached × 캐시단가 + output × 출력단가
```

OpenAI는 `cached ⊂ input_tokens` (캐시가 입력에 **포함**).
Anthropic은 `input_tokens`가 캐시를 **제외**한 값이고, `cache_creation_input_tokens`·`cache_read_input_tokens`가 따로 온다.
게다가 **캐시 쓰기가 읽기보다 비싸다.**

그대로 두면 비용이 실제보다 적게 잡히고, `AI_PROPOSAL_COST_CAP_USD` 상한이 늦게 걸린다.

### 함께 고칠 기존 결함 2개

```js
// costMicro() — /MICRO * MICRO 는 서로 상쇄되는 무의미한 연산
return Math.round((fresh * price.input + …) / MICRO * MICRO);

// recordAiUsage() — *1 은 무의미하고, 열 이름(price_input_micro)과 저장값(USD/MTok)이 불일치
priceInputMicro: Math.round((price.input || 0) * 1),
```

값 자체는 우연히 맞지만, 나중에 "그때 적용한 단가"를 감사할 때 오해를 부른다.

### 고칠 파일

| 파일 | 무엇을 |
|---|---|
| `server/ai-usage.js` | `extractUsage`·`costMicro`·`priceOf`·`PRICE_VARS` |
| `migrations/` (새 파일) | `cache_write_tokens` 열 추가 |
| `functions/api/admin.js` | 관리자 화면 단가 입력란 |

### 완료 기준

`test/ai-usage.test.js` 갱신 후 통과. **캐시 쓰기·읽기 단가를 따로 넣은 계산이 손계산과 일치할 것.**

---

## 5단계 · 환경변수·문서 정리

| 지금 | 바꿀 것 |
|---|---|
| `OPENAI_API_KEY` | `ANTHROPIC_API_KEY` |
| `OPENAI_MODEL` | `ANTHROPIC_MODEL` |
| `OPENAI_PROBE_TOKEN` | `ANTHROPIC_PROBE_TOKEN` |
| `OPENAI_PRICE_INPUT_PER_MTOK` | `ANTHROPIC_PRICE_INPUT_PER_MTOK` |
| `OPENAI_PRICE_CACHED_INPUT_PER_MTOK` | `ANTHROPIC_PRICE_CACHE_READ_PER_MTOK` |
| *(없음)* | `ANTHROPIC_PRICE_CACHE_WRITE_PER_MTOK` **신규** |
| `OPENAI_PRICE_OUTPUT_PER_MTOK` | `ANTHROPIC_PRICE_OUTPUT_PER_MTOK` |

**파일:** `.env.example`, `wrangler.toml`(주석), `README.md`, `HANDOVER.md`,
Cloudflare 대시보드 → Settings → Variables and Secrets

**테스트:** 30여 개 파일에 OpenAI 언급이 있다. 아래로 남은 것을 찾는다.

```bash
grep -ril "openai" --include="*.js" --include="*.md" --include="*.toml" . | grep -v node_modules | grep -v package-lock
```

### 배포 전 마지막 확인

```bash
npm test
npm run build
node tools/layout-smoke.mjs
npx wrangler d1 migrations apply ms12-proposal-archive --remote
```

---

## 되돌리는 법

각 단계가 한 커밋이므로 언제든 돌아갈 수 있다.

```bash
git log --oneline          # 커밋 목록 확인
git revert <커밋해시>       # 그 단계만 취소
git checkout main          # 전부 없던 일로
```

---

## 진행 현황

- [x] **0단계** 안전망 — 베이스라인 939 통과 확인
- [ ] **1단계** 스키마 제약 — `server/schema-limits.js` 생성·검증 완료, **호출부 연결 남음**
- [ ] **2단계** 작업 쪼개기 ← *실서버 확인이 필요한 관문. 여기서 막히면 설계를 다시 본다.*
- [ ] **3단계** Anthropic 어댑터
- [ ] **4단계** 비용 계산
- [ ] **5단계** 환경변수·문서
