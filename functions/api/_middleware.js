// 모든 /api 요청은 여기를 먼저 지난다. 로그인하지 않으면 어떤 경로도 열리지 않는다.
// 인증에 실패한 요청은 다음 단계로 넘기지 않으므로 OpenAI 호출도 일어나지 않는다.
import { loadSession, readSessionCookie, sameOriginRequest } from '../../server/session.js';

// 로그인·소셜 가입과 공모정보 검색만 열어 둔다. 나머지는 기본이 401이다.
// /api/public은 이미 모아 둔 공고의 공개 항목만 돌려주며 계정·계획서 자료를 읽지 않는다.
const PUBLIC_PATHS = new Set(['/api/auth', '/api/oauth', '/api/public']);
// 승인 대기(pending) 계정이 쓸 수 있는 곳. 가입 절차를 마치는 데 필요한 것만 연다.
const PENDING_PATHS = new Set(['/api/auth', '/api/oauth', '/api/account']);
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  // 교차 출처에서 온 상태 변경 요청은 세션을 보기 전에 막는다.
  if (!sameOriginRequest(request, url)) return json({ error: '허용되지 않은 출처의 요청입니다.' }, 403);
  if (!env.ARCHIVE_DB) return json({ error: '계정 데이터베이스가 연결되지 않았습니다.' }, 503);

  const session = await loadSession(env.ARCHIVE_DB, readSessionCookie(request));
  if (session) { data.session = session; data.user = session.user; }
  if (PUBLIC_PATHS.has(url.pathname)) return next();
  if (!session) return json({ error: '로그인이 필요합니다.' }, 401);
  // 승인 전 계정은 로그인만 되고 작업 화면의 API는 쓰지 못한다.
  if (session.user.status === 'pending' && !PENDING_PATHS.has(url.pathname)) {
    return json({ error: '가입 승인 대기 중입니다. 관리자가 승인해야 사용할 수 있습니다.' }, 403);
  }
  return next();
}

function json(body, status) { return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS }); }
