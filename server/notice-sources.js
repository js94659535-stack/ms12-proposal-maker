// 공고 수집 출처 등록부. 「사업 유형」과 「수집 출처」는 다른 축이다.
//
// 사업 유형 = 회원이 고르는 분야. 수집 출처 = 그 자료를 어디서 가져왔는지.
// 바보의나눔은 사업 유형이 아니라 「민간재단·공익법인」 유형의 한 출처다.
//
// 아래 origin에 없는 주소로는 요청하지 않는다. 이 목록이 허용 도메인 목록이다.

// 회원이 보는 사업 유형(첨부 화면 기준). 순서를 바꾸지 않는다.
export const BUSINESS_TYPES = Object.freeze([
  { key: 'chest', label: '사랑의열매' },
  { key: 'family', label: '가족센터' },
  { key: 'edu', label: '학교·교육청' },
  { key: 'g2b', label: '나라장터·학교장터' },
  { key: 'foundation', label: '민간재단·공익법인' },
  { key: 'general', label: '일반 창업·아이디어' },
  { key: 'busrugy', label: '부스러기사랑나눔회' }
]);

// 수집 출처. 화면에서 사업 유형과 따로 고른다.
export const SOURCE_GROUPS = Object.freeze([
  { key: 'chest', label: '사랑의열매 중앙회·광주지회', businessType: 'chest' },
  { key: 'kihf', label: '한국건강가정진흥원·가족센터', businessType: 'family' },
  { key: 'edu', label: '광주·전남교육청 및 교육지원청', businessType: 'edu' },
  { key: 'g2b', label: '나라장터', businessType: 'g2b' },
  { key: 'babo', label: '바보의나눔', businessType: 'foundation' },
  { key: 'busrugy', label: '부스러기사랑나눔회', businessType: 'busrugy' }
]);

// 출처별 수집기. 한 곳이 죽어도 나머지는 계속 돈다.
// verified 값은 실제로 열어 본 결과다. 열어 보지 못한 곳은 미연동으로 남긴다.
export const SOURCES = Object.freeze([
  {
    id: 'kihf-notice', group: 'kihf', label: '한국건강가정진흥원 공지사항',
    kind: 'html-board', origin: 'https://www.kihf.or.kr',
    path: '/web/lay1/bbs/S1T838C97/A/3/list.do', detailPath: '/web/lay1/bbs/S1T838C97/A/3/view.do',
    organization: '한국건강가정진흥원', defaultEnabled: true, needsSecret: '',
    // 2026-08-12 확인: HTTP 200, table.list 구조, 글 22건.
    verified: true, note: ''
  },
  {
    id: 'kihf-bid', group: 'kihf', label: '한국건강가정진흥원 입찰공고',
    kind: 'html-board', origin: 'https://www.kihf.or.kr',
    path: '/web/lay1/bbs/S1T838C74/A/5/list.do', detailPath: '/web/lay1/bbs/S1T838C74/A/5/view.do',
    organization: '한국건강가정진흥원', defaultEnabled: true, needsSecret: '',
    // 2026-08-12 확인: HTTP 200, table.list 구조, 글 21건.
    verified: true, note: ''
  },
  {
    id: 'babo-notice', group: 'babo', label: '바보의나눔 지원공지',
    // 같은 업체(아임웹)가 돌리는 게시판. 한 실행에서 둘을 잇달아 열면 그쪽에서 막는다.
    kind: 'imweb-board', platform: 'imweb', origin: 'https://babo.or.kr',
    path: '/notice', detailPath: '/notice/',
    organization: '재단법인 바보의나눔', defaultEnabled: true, needsSecret: '',
    // 2026-08-12 확인: HTTP 200, robots.txt가 /notice를 허용, ul.li_body 구조.
    verified: true, note: ''
  },
  {
    id: 'g2b-service', group: 'g2b', label: '나라장터 용역 입찰공고(조달청 Open API)',
    kind: 'open-api', origin: 'https://apis.data.go.kr',
    path: '/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch', detailPath: '',
    organization: '조달청', defaultEnabled: true, needsSecret: 'G2B_SERVICE_KEY',
    // 2026-08-12 확인: 엔드포인트 살아 있음(키 없이 호출하면 SERVICE_KEY_IS_NOT_REGISTERED_ERROR).
    verified: true,
    note: '공공데이터포털(data.go.kr) 「조달청_입찰공고정보서비스」 활용신청 후 인증키를 Cloudflare Secret G2B_SERVICE_KEY에 넣으면 켜집니다.'
  },
  {
    id: 'busrugy-notice', group: 'busrugy', label: '부스러기사랑나눔회 공지사항',
    kind: 'imweb-board', platform: 'imweb', origin: 'https://busrugy.or.kr',
    path: '/NOTICE/', detailPath: '/NOTICE/',
    organization: '사단법인 부스러기사랑나눔회', defaultEnabled: true, needsSecret: '',
    // 2026-08-15 확인: HTTP 200, robots.txt가 /NOTICE를 허용, 바보의나눔과 같은 아임웹 ul.li_body 구조, 목록 15건.
    // 분류 네 가지(일반·사업·채용·공시)는 브라우저에서 거른다. 서버는 어느 주소로 물어도 같은 목록을 준다.
    // 그래서 전체 주소 한 곳만 부른다. 네 곳을 다 넣으면 같은 글을 네 번 받아 온다.
    verified: true, note: ''
  },
  {
    id: 'edu-gwangju', group: 'edu', label: '광주광역시교육청',
    kind: 'blocked', origin: 'https://www.gen.go.kr', path: '/', detailPath: '',
    organization: '광주광역시교육청', defaultEnabled: false, needsSecret: '',
    // 2026-08-12 확인: 자바스크립트 봇 검사 화면(중간 리다이렉트)만 돌아온다. RSS 없음.
    verified: false,
    note: '접속 시 자바스크립트 봇 검사 화면만 돌아옵니다. 우회하지 않고 미연동으로 둡니다. 기관에 공식 API·RSS 제공 여부를 문의해야 합니다.'
  },
  {
    id: 'edu-jeonnam', group: 'edu', label: '전라남도교육청',
    kind: 'blocked', origin: 'https://www.jge.go.kr', path: '/jne/na/ntt/selectNttList.do', detailPath: '',
    organization: '전라남도교육청', defaultEnabled: false, needsSecret: '',
    // 2026-08-12 확인: 목록 경로가 「시스템안내」 차단 화면(209B)을 돌려준다. robots.txt도 차단 화면.
    verified: false,
    note: '목록 경로가 차단 화면을 돌려줍니다. 우회하지 않고 미연동으로 둡니다. 나라장터 API가 켜지면 교육청 발주 용역은 그쪽으로 들어옵니다.'
  }
]);

export const sourceById = id => SOURCES.find(source => source.id === id) || null;
export const groupOf = id => sourceById(id)?.group || '';
export const businessTypeOf = id => SOURCE_GROUPS.find(group => group.key === groupOf(id))?.businessType || '';

// 허용 도메인. 여기 없는 곳으로는 요청하지 않는다.
export const ALLOWED_ORIGINS = Object.freeze([
  'https://chest.or.kr', 'https://gwangju.chest.or.kr', 'https://proposal.chest.or.kr',
  ...new Set(SOURCES.map(source => source.origin))
]);

export function allowedOrigin(url) {
  try { return ALLOWED_ORIGINS.includes(new URL(url).origin); } catch { return false; }
}

// 실제로 돌릴 수 있는 출처인지. 검증되지 않았거나 비밀값이 없으면 돌리지 않는다.
export function runnable(source, { settings = {}, secrets = {} } = {}) {
  if (!source) return { ok: false, reason: 'unknown' };
  if (source.kind === 'blocked' || !source.verified) return { ok: false, reason: 'not-connected' };
  const enabled = settings[source.id] === undefined ? source.defaultEnabled : Boolean(settings[source.id]);
  if (!enabled) return { ok: false, reason: 'disabled' };
  if (source.needsSecret && !secrets[source.needsSecret]) return { ok: false, reason: 'missing-secret' };
  return { ok: true, reason: '' };
}

export const SKIP_LABELS = Object.freeze({
  'platform-turn': '같은 업체 게시판은 한 번에 하나만 부릅니다(다음 실행에서 봅니다)',
  'not-connected': '미연동(공식 경로 확인 필요)',
  disabled: '관리자가 중지함',
  'missing-secret': '인증키 미등록',
  unknown: '알 수 없는 출처'
});
