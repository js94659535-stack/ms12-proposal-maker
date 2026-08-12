// 단순화가 기능을 지웠는지 소스에서 확인한다. 각 기능의 그리는 곳과 누르는 곳을 함께 본다.
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const has = value => app.includes(value);

const FEATURES = [
  ['공고보관함 검색·필터·상세보기', ['data-archive-filter', 'data-archive-detail', 'data-archive-sort'], '작업 메뉴 → 공고보관함·계획서보관함'],
  ['공고문·신청서·첨부파일 분석', ['handleOfficialAttachment', 'extractFiles', 'analyzeWithAI'], '공고 준비 화면 · 파일 선택'],
  ['기관정보 불러오기·수정·저장', ['applicantsToolView', 'persistApplicant', 'pullProfileIntoApplicant'], '작업 메뉴 → 신청기관(고객 기관) 정보'],
  ['사업 아이디어 입력', ['simple-idea', 'projectNarrative', 'ideaAssetPanel'], '간편 화면 3번 칸'],
  ['자격·필수사업·평가기준 분석', ['strategyView', 'evaluationCriteria', 'requirement'], '작성 과정 자세히 보기'],
  ['대상·목표·활동·일정·예산·성과 설계', ['designQuestionsView', 'projectDesign', 'approveDesign'], '작성 과정 자세히 보기 · 의뢰 건'],
  ['설계 근거와 [확인 필요]', ['evidenceMap', '[확인 필요', 'openFacts'], '설계·본문 안에 표시'],
  ['전체 계획서 생성', ['generateCompleteProposal', 'generateProposalParts', 'fullProposalWithAI'], '간편 화면 · AI가 계획서 만들기'],
  ['사실검증·선정 가능성 진단', ['preciseReviewWithAI', 'diagnoseWithAI', 'open-diagnosis'], '검증·코칭 · 선정 가능성 진단서'],
  ['한 번에 수정 요청 2회', ['runRevision', 'canRevise', 'remainingOf'], '결과 화면 · 한 번에 수정 요청'],
  ['수정 전후 비교·되돌리기', ['diffSections', 'undoRevision', 'revisionBackup'], '수정 결과 카드'],
  ['보관함 저장·재로그인 복원', ['archiveCurrentProposal', 'loadProposalArchive', 'loadArchivedProposal'], '결과 화면 · 저장 / 계획서보관함'],
  ['PDF·DOCX 출력', ['exportProposalPdf', 'exportDocx', 'final-pdf-top'], '결과 화면 · 받기'],
  ['AI 사용량·비용 기록', ['setUsageProposalId', 'adminUsageReport', 'usagePanel'], '관리자 랜딩 → AI 사용량·비용'],
  ['항목별 재작성과 버전', ['rewriteWithAI', 'recordProposalVersion', 'proposalVersions'], '전문가 상세 화면'],
  ['간편·전문 화면 전환', ['showSimpleHome', 'viewModeBadge', 'open-expert-detail'], '화면 위 표시줄']
];

let missing = 0;
for (const [name, needles, where] of FEATURES) {
  const gone = needles.filter(needle => !has(needle));
  if (gone.length) missing += 1;
  console.log(`${gone.length ? '없음' : '있음'}  ${name} — ${where}${gone.length ? ` · 빠진 것: ${gone.join(', ')}` : ''}`);
}
console.log(missing ? `\n확인 필요 ${missing}건` : '\n모두 보존됨');
