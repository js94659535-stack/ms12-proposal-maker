// 모든 /api 요청은 여기를 먼저 지난다. 로그인하지 않으면 어떤 경로도 열리지 않는다.
// 인증에 실패한 요청은 다음 단계로 넘기지 않으므로 OpenAI 호출도 일어나지 않는다.
import { loadSession, readSessionCookie, sameOriginRequest } from '../../server/session.js';

// 로그인 자체만 열어 둔다. 나머지는 기본이 401이다.
const PUBLIC_PATHS = new Set(['/api/auth']);
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
  return next();
}

function json(body, status) { return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS }); }
