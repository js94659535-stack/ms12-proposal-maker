// 삼성 공고 레이더(10-02). 로그인한 사람만 부를 수 있다(_middleware 기본). AI 비용 없음.
import { collectSamsung } from '../../server/samsung-radar.js';

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=1800' };

export async function onRequest(context) {
  if (context.request.method !== 'GET') return new Response(JSON.stringify({ error: 'GET 요청만 허용됩니다.' }), { status: 405, headers: { ...HEADERS, Allow: 'GET' } });
  try {
    return new Response(JSON.stringify(await collectSamsung(fetch)), { headers: HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: '공고를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }), { status: 502, headers: { ...HEADERS, 'Cache-Control': 'no-store' } });
  }
}
