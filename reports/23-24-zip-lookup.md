# [23-24] 공고 첨부 ZIP 안의 서식 파일 확인 — 파일을 못 구했습니다

조사 완료 · 고치지 않음 · 배포 없음

## 한 줄

**그 ZIP은 손에 없습니다.** 이 컴퓨터에도 없고, 앱이 가진 기록으로도 내려받을 수 없고,
공고 원본 페이지도 사라졌습니다. **확장자를 확인하지 못했습니다.**
그 대신 **왜 못 받는지는 정확히 찾았습니다 — 막힘이 셋이고, 23-23에서 짚은 것보다 한 겹 더 앞입니다.**

## 1. 찾아본 곳

| 어디 | 결과 |
|---|---|
| `C:\Users\UserK` 아래 전부 (`배분신청서`·`표준양식` 이름으로) | **없음.** 나온 것은 `.hwp` 배분신청서 파일 여덟과 그 바로가기뿐 |
| `Downloads`의 ZIP 43개 | 이름이 맞는 것 **없음** |
| `Desktop\PLATFORM`의 ZIP 넷 | 관계 없는 것 |
| 앱 보관함(D1 `archived_notices` 35건) | **기록은 있음** — 아래 |

## 2. 앱은 그 첨부를 「이름만」 알고 있습니다

공고 **「2026년 기획 아동·청소년의 디지털 안전망 구축 및 맞춤형 피해지원사업」**(중앙회)의 첨부 기록입니다.

```json
"attachments":[
  {"name":"1. 공모사업 공고문(아동청소년디지털안전망).hwp","fileType":"HWP"},
  {"name":"2. 2027년 배분신청서 표준양식 및 작성가이드 등.zip","fileType":"ZIP"}
]
```

**`url`도, `fileSeCode`·`dstbBsnsCode`·`sn`·`fileSn`도 없습니다.**
`downloadProposalAttachment()`는 둘 중 하나가 있어야 내려받습니다. 없으면 `validAttachment()`가
**400으로 막습니다.** 즉 **「내용 추출」을 눌러도 ZIP 읽기까지 가지도 못합니다.**

**23-23에서 「버튼은 열려 있는데 reader가 거부한다」고 적은 것은 절반만 맞았습니다.**
실제로는 **reader에 닿기 전에 죽습니다.**

## 3. 손잡이는 「지워집니다」 — 자리를 찾았습니다

수집기는 손잡이를 **제대로 뽑고 있습니다.** `functions/api/notices.js:397`

```js
name: structuredText(match[5]), fileType: classifyAttachment(match[5]),
fileSeCode: match[1], dstbBsnsCode: match[2], sn: match[3], fileSn: match[4]
```

그런데 그 뒤 **세 자리**가 이름과 종류만 남기고 나머지를 버립니다.

| 자리 | 코드 |
|---|---|
| `notices.js:64` | `detail.attachments.map(file => ({ name: file.name, fileType: classifyAttachment(file.name) }))` |
| `notices.js:183` | `detail.attachments.map(file => ({ name: file.name, fileType: file.fileType }))` |
| `notices.js:264` | `detail.attachments.map(file => ({ name: file.name, fileType: classifyAttachment(file.name) }))` |

보관함에 들어간 뒤에는 **되돌릴 방법이 없습니다.** 공고를 다시 수집해도 같은 자리에서 또 지워집니다.

## 4. 공고 원본 페이지도 사라졌습니다

기록에 남은 주소로 직접 받아 봤습니다.

```
https://proposal.chest.or.kr/mobile/mobileMainBsnsDetail.do?dstbBsnsCode=20260600100128&appnDocNo=
→ 200, 3,176바이트, 「찾으시는 페이지가 없습니다」 안내 화면
```

접수기간이 **2026-07-01 ~ 2026-08-21**이라 마감 뒤 내려간 것으로 보입니다.
`fn_fileDownload(...)` 링크가 없으므로 손잡이를 지금 다시 뽑을 수도 없습니다.

## 5. 「서식을 못 읽는다」의 막힘은 셋입니다

앞에서부터 순서대로입니다. **하나만 고쳐서는 안 됩니다.**

| 순서 | 막힘 | 어디 | 크기 |
|---|---|---|---|
| ① | 첨부 손잡이를 버려서 **내려받지 못함** | `notices.js` 64 · 183 · 264 (세 곳에서 `{name, fileType}`만 남김) | 작음 — 필드를 안 버리면 됨 |
| ② | `.zip` 갈래가 없어 **못 품** | `files.js`의 `extractFile()`. `SUPPORTED`에 zip 없음 | 작음 — 갈래 하나 |
| ③ | 푼 항목을 **텍스트로 디코딩**해 이진 HWP를 못 꺼냄 | `files.js`의 `readZipEntries()` | 작음 — 바이트 반환 갈래 |
| — | 버튼은 셋 다 무시하고 열려 있음 | `EXTRACTABLE_ATTACHMENTS`에 `'ZIP'` | — |

**①을 고쳐도 이미 보관된 35건은 안 살아납니다.** 새로 수집하는 공고부터입니다.
그리고 **이 공고는 페이지가 내려가 다시 수집할 수도 없습니다.**

## 6. 지금 할 수 있는 것

**파일을 주시면 그 자리에서 열어 보겠습니다.** 필요한 것은 그 ZIP 하나입니다.
어디에 두시든(바탕화면·다운로드) 경로만 알려 주시면 됩니다.

열면 §2 요청대로 이렇게 보고합니다 — 안에 든 파일 목록과 크기, **서식 파일의 확장자**,
`.hwpx`면 XML 안에서 표가 어떻게 들어 있는지, `.hwp`면 그 사실만,
그리고 서식 안에 「N자 이내」·「N쪽 이내」가 적혀 있는지.

**대신 쓸 수 있는 파일이 이 컴퓨터에 있습니다.** 찾다가 나온 것들입니다 —
`Desktop\MS12-E2E-결과\계획서 예시\2026년 복권기금 아동청소년 돌봄강화 프로그램 배분신청서 및
사업계획서 (벧엘, 진로ai동화)최종(마인드강사포함).hwp` 등 **`.hwp` 여덟 개**.
같은 기관(사랑의열매)의 배분신청서 서식이라 **구조는 거의 같을 것**으로 보이지만,
**표준양식 원본이 아니라 채워 넣은 결과물**이라 「빈 서식의 칸 구조」를 보기에는 다를 수 있습니다.
이것으로 대신할지도 정해 주십시오.
