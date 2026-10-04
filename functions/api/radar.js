// 삼성 공고 레이더(10-02). 계정 기능을 걷어낸 뒤(10-34) 로그인 없이 열려 있다. 삼성 공개 공고만 읽고 AI 비용이 없다.
import { collectSamsung } from '../../server/samsung-radar.js';

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' };

export async function onRequest(context) {
  if (context.request.method !== 'GET') return new Response(JSON.stringify({ error: 'GET 요청만 허용됩니다.' }), { status: 405, headers: { ...HEADERS, Allow: 'GET' } });
  try {
    return new Response(JSON.stringify(await collectSamsung(fetch)), { headers: HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: '공고를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }), { status: 502, headers: { ...HEADERS, 'Cache-Control': 'no-store' } });
  }
}
