# 자료보관함 응답의 `ok` 규약이 어긋나 있다 (2026-08-20)

**서버 응답에 `ok` 가 없는데 클라이언트가 `ok` 를 본다.**
`listAssets` · `saveAsset` · `deleteAsset` 이 그렇다.

조사만 했고, 아래 「이미 고친 것」 한 줄을 빼면 **고치지 않았다.**

---

## 무엇이 어긋났나

`functions/api/archive.js` 의 `json()` 은 넘긴 것을 그대로 직렬화한다. 붙여 주는 것이 없다.

```js
if (body.action === 'listAssets') return json({ assets: await listAssets(db, ownerHash) });
if (body.action === 'saveAsset')  return saveAsset(db, ownerHash, userId, body.asset);   // → json({ id, assets })
if (body.action === 'deleteAsset') return json(await deleteAsset(db, ownerHash, body.id)); // → { id, deleted, assets }
```

이 파일에서 `ok: true` 를 붙이는 응답은 `countExport` **하나뿐이다.**

클라이언트 `src/archive.js` 의 `request()` 는 **HTTP 가 실패하면 예외를 던지고**, 성공하면 본문을 그대로 돌려준다.
그러니 **성공한 응답의 `ok` 는 `undefined`** 다. 그것을 실패로 읽으면 성공이 실패가 된다.

---

## 무슨 일이 벌어졌나

**하나 — 렌더 고리 (이미 고쳤다).**
`loadIdeaAssets` 가 `if (!result.ok) return setState({ error })` 로 되돌아 나가면서
`ideaAssetsLoaded` 를 세우지 못했다. `bind` 는 렌더마다 돌고 그 조건이 계속 참이라
**렌더 → 조회 → `setState` → 렌더** 가 끝없이 돌았다. 화면 전체가 1초마다 갈아끼워져
열어 둔 드롭다운이 닫히고 입력칸 커서가 사라졌다 — **기관정보를 아예 못 채우는 상태였다.**

판정을 `ok` 대신 실패 여부로 바꾸고, 표시를 조회보다 먼저 세워 끊었다.
`test/render-loop.test.js` 가 호출 수를 세어 지킨다.

**둘 — 조용히 안 되는 것 (안 고쳤다).**
`src/app.js:7900` · `7904` 가 이렇게 되어 있다.

```js
void saveIdeaAsset({ ...found, status: el.value }).then(result => result.ok && setState({ ideaAssets: result.assets || assetList() }));
```

`saveAsset` 응답에 `ok` 가 없으므로 **`result.ok` 가 항상 거짓**이다.
저장은 서버까지 갔는데 **화면 목록이 갱신되지 않는다.**
아이디어 **상태**와 **근거확인** 체크를 바꿔도 화면이 그대로다.
오류도 안 뜬다 — 조용히 아무 일도 안 일어난다.

`deleteAsset` 쪽(`src/app.js` 의 삭제 경로)은 `ok` 를 보지 않아 지금도 동작한다.
**같은 파일 안에서 어떤 곳은 보고 어떤 곳은 안 본다. 그것이 규약이 없다는 뜻이다.**

---

## 별도 작업이 필요한 이유

고치는 방법은 둘인데, 어느 쪽이든 **`archive.js` 전체를 놓고 정해야 한다.**

**(가) 서버가 `ok: true` 를 붙인다.**
`listAssets` · `saveAsset` · `deleteAsset` 만 붙이면 세 곳은 살아난다.
그런데 같은 파일의 `listProposals` · `getProposal` · `listApplicants` · `searchNotices` 도 `ok` 가 없다.
**셋만 붙이면 「어떤 응답에는 있고 어떤 응답에는 없는」 상태가 더 굳는다.**

**(나) 클라이언트가 `ok` 를 안 본다.**
`request()` 가 이미 실패를 예외로 올리므로 `ok` 는 원래 필요 없다.
`ok` 를 읽는 자리를 전부 찾아 예외 처리로 바꾸는 쪽이 규약이 하나가 된다.
다만 **`ok: false` 를 실제로 돌려주는 다른 API**(`/api/auth` 등)와 섞여 있어
어느 호출이 어느 규약인지 먼저 갈라야 한다.

**권하는 쪽은 (나)다.** 서버가 이미 HTTP 상태로 실패를 말하고 있고,
`ok` 는 그 위에 덧붙은 두 번째 규약이라 둘을 함께 두면 계속 어긋난다.
다만 **범위가 `archive.js` 를 넘어 인증·계정까지 간다.** 그래서 별도 작업이다.

---

## 이미 고친 것

- `src/app.js` `loadIdeaAssets` — `ok` 대신 실패 여부로 판정하고, 표시를 조회보다 먼저 세운다.

## 남은 것

- `src/app.js:7900` · `7904` — 아이디어 상태·근거확인 저장 뒤 목록 갱신
- `archive.js` 전체의 `ok` 규약 정리 (위 (가)/(나) 결정)

## 관련

- `docs/screen-tests.md` — 시험이 통과했는데 화면에서 안 되는 경우
- `test/render-loop.test.js` — 같은 조회가 두 번 나가지 않는지 세는 시험
