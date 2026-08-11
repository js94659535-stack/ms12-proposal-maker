// 작업 단계와 오류 종류만 기록한다. 운영관리자가 「어디서 멈췄는지」를 보기 위한 최소 기록이다.
// 계획서 원문·입력값·개인정보는 받지 않는다. 단계 번호와 미리 정한 코드만 통과한다.
import { recordActivity } from '../../server/activity.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

export async function onRequest(context) {
  const { request, env, data } = context;
  if (request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if ((request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Content-Type은 application/json이어야 합니다.' }, 415);
  }
  // 미들웨어가 이미 세션을 확인했지만, 이 경로만 따로 불려도 안전하도록 다시 본다.
  const user = data.session?.user;
  if (!user?.id) return json({ error: '로그인이 필요합니다.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }
  if (body.action !== 'report') return json({ error: '지원하지 않는 작업입니다.' }, 400);

  const saved = await recordActivity(env.ARCHIVE_DB, user.id, { kind: body.kind, step: body.step, code: body.code });
  if (!saved) return json({ error: '기록할 수 있는 값이 아닙니다.' }, 400);
  return json({ ok: true, recorded: saved }, 200);
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
