# 마인드스토리 제안서 워크벤치

기관 공고문·과업지시서·신청 양식을 분석하고, 확인된 마인드스토리 역량과 비교해 근거 추적이 가능한 사업계획서를 작성하는 Cloudflare Pages 애플리케이션입니다.

## 주요 기능

- 기존 5개 사업 유형 분류
- 원문 붙여넣기와 PDF/DOCX/TXT 텍스트 추출
- 기관 요구사항·평가 기준·제출 항목 분석
- 「신청기관 정보」 다중 등록·선택과 항목별 `확인됨 / 확인 필요 / 오래된 정보` 구분
- 선택한 신청기관의 확인된 정보와 공고 요구 적합성 비교
- 부족 정보 확인 질문
- 근거 ID가 연결된 항목별 초안과 재작성
- 브라우저 자동 저장, 인쇄, PDF·DOCX 다운로드
- API 키가 없을 때 사실 생성을 피하는 로컬 규칙 분석 및 검토용 초안

## 로컬 실행

```powershell
npm install
npm run dev
```

로컬에서는 실제 OpenAI 키를 저장하거나 호출하지 않습니다. 정적 빌드 후 Cloudflare Pages 개발 서버를 실행하면 키가 없는 안전한 오류와 로컬 대체 흐름을 시험할 수 있습니다.

```powershell
npm run build
npm run cf:dev
```

## Cloudflare Pages 설정

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: 저장소 루트
- Production secret: `OPENAI_API_KEY`를 암호화된 Secret으로 등록
- Production variable: `OPENAI_MODEL`에 현재 계정에서 사용할 수 있는 모델 ID 등록
- Custom domain: `pro.ms12.org`

Cloudflare 대시보드의 Workers & Pages 프로젝트에서 Settings → Variables and Secrets에 API 키를 암호화된 Secret으로 등록합니다. 키를 로컬 파일, `index.html`, `.env`, `wrangler.toml` 또는 GitHub에 저장하지 마세요.

현재 코드는 설정 누락·입력 크기·출력 길이·단일 요청 타임아웃을 fail-closed 방식으로 처리합니다. 애플리케이션의 길이 제한과 타임아웃만으로 정확한 비용 상한이나 과금 취소가 보장되지는 않으므로, 공개 배포 전에는 운영 환경의 인증·요청 제한·예산 통제를 별도로 검토해야 합니다.

## 신청기관 정보

이 서비스는 여러 기관의 사업계획서를 대행 작성합니다. 공고를 분석하는 정보와 별도로, 상단 「신청기관 정보」 화면에서 신청기관을 여러 곳 등록·수정하고 작성 흐름 3단계(신청기관 선택)에서 이번 사업의 신청기관을 고릅니다. 마인드스토리도 등록기관 중 하나로만 취급합니다.

작성 흐름은 공고 가져오기 → 공고 확인 → 신청기관 선택(정보 불러오기·공고 대비 비교·부족 정보 질문) → 사업 선택·마스터 설계 → 계획서 작성 → 검토·완성 순서입니다.

- 마스터 설계와 계획서 작성 요청에는 `확인됨` 항목만 전달합니다. `확인 필요`·`오래된 정보`는 항목명과 상태만 전달하고 값은 전달하지 않습니다.
- 이번 사업 전용 값(예: 이번 공모 16회)은 신청기관 원본(예: 보유 12회)을 변경하지 않습니다.
- 신청기관 정보는 계획서 보관함과 같은 복구키(`X-Archive-Key`) 기준으로 D1 `applicant_organizations` 테이블에 보관합니다.

운영 배포 전에는 관리자가 D1 마이그레이션을 직접 적용해야 합니다.

```powershell
npx wrangler d1 migrations apply ms12-proposal-archive --remote
```

## 현재 데이터 제한

초기 기관 정보는 `mindstory.kr`에서 공개 확인 가능한 프로그램과 검사만 포함합니다. 인력·자격·실적·예산·시설·보험 등은 증빙 자료가 제공되기 전까지 `확인 필요`로 처리합니다. 네이버 블로그는 자동 접근 제한으로 개별 게시물을 초기 데이터에 반영하지 않았습니다.
