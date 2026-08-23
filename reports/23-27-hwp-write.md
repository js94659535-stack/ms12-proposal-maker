# [23-27] `.hwp`(5.0) 쓰기가 가능한가 — 조사

조사 완료 · 만들지 않음 · 배포 없음

## 한 줄

**됩니다. 실재하는 구현이 있습니다** — `hwplib`(Java, Apache-2.0, Maven Central `kr.dogfoot:hwplib:1.1.10`,
최근 커밋 2026-07-13). **읽어서 고친 뒤 저장**이 되고, **누름틀(필드) 이름으로 표 칸을 집어 글자만 바꾸는**
기능이 이름 붙어 있습니다. §4가 물으신 그 길입니다.

**대신 값은 라이브러리가 아니라 구조에서 나옵니다** — Java라서 지금 뒷단(Cloudflare Pages Functions,
V8)에서 못 돌립니다. **서비스 하나를 따로 띄워야 합니다.**

## ⑴ 라이브러리 — 쓰기가 되는 것은 하나뿐입니다

| 이름 | 언어 | **쓰기** | 상태 | 라이선스 |
|---|---|---|---|---|
| **hwplib** (neolord0 / `kr.dogfoot`) | **Java** | **된다** — 「저장 모듈 완료」(2017), 필드 텍스트 설정, 표 셀 조작 | **살아 있음** — 최근 커밋 **2026-07-13** · 별 587 · Maven Central **1.1.10** | **Apache-2.0** |
| hwpxlib (같은 저자) | Java | 된다 (`.hwpx`) | 살아 있음 | Apache-2.0 |
| hwp2hwpx (같은 저자) | Java | `.hwp` → `.hwpx` 변환 | 살아 있음 | Apache-2.0 |
| pyhwpx · hwpapi | Python + `pywin32` | 된다 — **단 한글 프로그램이 깔린 Windows에서만.** 파일을 직접 쓰는 것이 아니라 한글을 원격 조종하는 것 | 활발 | 각 저장소 확인 필요 |
| libhwp (hahnlee, PyPI) | Python(Rust 코어) | **안 된다 — 읽기 전용** | 활발 | — |
| pyhwp | Python | 읽기·추출만 | — | — |
| node-hwp | Node.js | **안 된다** — README가 「개발 중, 아직 다른 프로젝트에서 쓸 수 없음」 | 멈춰 있음 | — |
| hwp.js · @ohah/hwpjs | Node.js/Rust | **안 된다 — 보기·파싱 전용** | 활발 | — |

**★ 우리 앱 언어(JavaScript) 쪽에는 쓰기가 없습니다.** 읽기·보기뿐입니다.
첫 검색에서 「libhwp가 `hwp.write()`를 지원한다」는 요약이 나왔는데 **확인해 보니 그것은 Java/Kotlin 쪽
다른 프로젝트였고 Python 판은 읽기 전용**입니다. 그대로 옮겨 적지 않았습니다.

## ⑵ 규격은 공개돼 있습니다

- 한컴이 **2010-06-29**에 HWP 5.x 바이너리 형식과 HWPML을 공개했고, **2014-10**에 배포용 문서·수식·차트
  규격을 보탰습니다.
- 현행 문서는 **「한글 문서 파일 구조 5.0」 revision 1.3 (2018-11-08)** PDF이고 `cdn.hancom.com`에서
  바로 받을 수 있습니다.
- **hwplib은 이 규격서를 근거로 만들었다고 스스로 밝힙니다.**
- 즉 **규격이 공개돼 있고, 그 위에 세운 Apache-2.0 구현이 실제로 돌아갑니다.** 추측이 아닙니다.

## ⑶ 서버에서 한글을 돌리는 길 — 있지만 값이 붙고 구조가 안 맞습니다

- **한글 서버 라이선스를 사야 합니다.** 「클라이언트 PC에서 수행할 경우 모든 사용자 PC에 한글이
  설치되어야 하고, **윈도우 서버에서 수행할 경우에는 한글 서버 라이선스를 구매해야 합니다**」.
- 한컴이 **한글 SDK**를 따로 팝니다 — HWP/HWPX를 HTML·PDF로 바꾸고 Text·Image·table을 삽입·편집합니다.
- **값은 못 찾았습니다.** 공개 가격표가 없고 문의해야 합니다. **짐작으로 적지 않습니다.**
- **그리고 Windows 서버가 필요합니다.** 지금 뒷단은 Cloudflare Pages Functions(V8 아이솔레이트)라
  Windows도 JVM도 못 돌립니다.

## ⑷ ★ 원본을 복제해 값만 바꾸는 길 — **됩니다. 이름 붙은 방법이 있습니다**

`hwplib` README가 이름을 대고 있는 기능들입니다.

| 무엇 | 어떻게 |
|---|---|
| 누름틀(필드) 값 읽기 | `FieldFinder.getClickHereText(hwpFile, "필드이름")` |
| **누름틀 값 넣기** | `sample/TestSetClickHereFieldText.java` |
| **필드명이 일치하는 셀 찾기** | `sample/TestFindCell.java` |
| 같은 이름의 필드 모두 찾기 | `sample/TestFindAllField.java` |
| **읽어서 고친 뒤 저장** | `sample/TestEditingHWPFile.java` · `TestReWritingHWPFile.java` |
| 표 만들기·셀 병합·행 삭제 | `TestMakingTable.java` · `TestMergingCell.java` |

**이것이 23-23과 23-25에서 「어느 칸이 사업 목적인지 알 길이 없다」고 했던 자리의 답입니다.**
서식이 누름틀에 **이름을 붙여 두었다면** 그 이름으로 칸을 집습니다. 낱말 정규식도, 순서 짐작도 필요 없습니다.

**★ 다만 조건이 붙습니다.**

- **서식이 누름틀을 쓰고 이름을 붙여 두어야 합니다.** 그냥 빈 표 칸이면 이름이 없습니다.
  그때는 좌표(몇 번째 표, 몇 행 몇 열)로 집어야 하고 — hwplib이 표 접근을 지원하므로 되기는 하지만 —
  **공고마다 사람이 좌표를 정해야 합니다.** 그것은 자동화가 아닙니다.
- **우리가 가진 두 `.hwp`에 누름틀이 있는지는 아직 안 봤습니다.** 이것이 **다음에 볼 것**이고,
  이 길이 열리느냐 마느냐가 거기서 갈립니다.

**hwplib이 지원하지 않는 것**: 암호 걸린 HWP, PDF·이미지·HTML 변환, 쪽수·특정 쪽 가져오기.

## 이 길의 진짜 값 — 라이브러리가 아니라 구조

| 무엇 | 값 |
|---|---|
| hwplib | **0원** (Apache-2.0) |
| 규격서 | **0원** (공개) |
| **Java 서비스 하나를 따로 띄우는 것** | **여기가 값입니다** — Cloud Run·Fly·EC2 같은 곳에 파일을 받아 채워 돌려주는 엔드포인트 하나. **운영 대상이 하나 늘어납니다** |
| 한컴 SDK·서버 라이선스 (다른 길) | **값 못 찾음** · Windows 서버 필요 |

지금 뒷단은 Cloudflare Pages Functions입니다. **JVM을 그 안에서 돌릴 수 없습니다.**
다른 길은 `hwp2hwpx`로 `.hwpx`로 바꿔 편집하는 것인데, 그러면 **돌려주는 파일이 `.hwpx`**가 되고
공고기관이 그것을 받는지는 확인해야 합니다.

## 다음에 볼 것 — 하나입니다

**손에 있는 `.hwp` 두 개에 누름틀(필드)이 있고 이름이 붙어 있는가.**
있으면 이 길은 열리고, 없으면 「좌표를 사람이 정하는 반자동」까지가 한계입니다.
파일은 이미 있으므로 새 호출도 새 비용도 들지 않습니다.

## 출처

- [neolord0/hwplib (GitHub)](https://github.com/neolord0/hwplib) · [README](https://github.com/neolord0/hwplib/blob/main/README.md)
- [kr.dogfoot:hwplib (Maven Central)](https://central.sonatype.com/artifact/kr.dogfoot/hwplib)
- [neolord0/hwpxlib (GitHub)](https://github.com/neolord0/hwpxlib)
- [한글 문서 파일 구조 5.0 revision 1.3 (한컴 PDF)](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.3.pdf)
- [한/글 문서 파일 형식 : HWP 포맷 구조 살펴보기 (한컴테크)](https://tech.hancom.com/%ED%95%9C-%EA%B8%80-%EB%AC%B8%EC%84%9C-%ED%8C%8C%EC%9D%BC-%ED%98%95%EC%8B%9D-hwp-%ED%8F%AC%EB%A7%B7-%EA%B5%AC%EC%A1%B0-%EC%82%B4%ED%8E%B4%EB%B3%B4%EA%B8%B0/)
- [한글 SDK (한컴)](https://www.hancom.com/product/sdk/hwpSdk)
- [HwpConverter — 한글 서버 라이선스 언급 (Microsoft Q&A)](https://learn.microsoft.com/ko-kr/answers/questions/5271935/hwpconverter-(-))
- [libhwp (PyPI)](https://pypi.org/project/libhwp/) · [hahnlee/hwp-rs](https://github.com/hahnlee/hwp-rs)
- [node-hwp (npm)](https://www.npmjs.com/package/node-hwp) · [hahnlee/hwp.js](https://github.com/hahnlee/hwp.js/)
- [pyhwpx (PyPI)](https://pypi.org/project/pyhwpx/) · [hwpapi (PyPI)](https://pypi.org/project/hwpapi/)
