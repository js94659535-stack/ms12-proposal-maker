// 공식 통계 근거 후보 조회. 서버가 KOSIS를 부르고 화면은 결과만 받는다.
// 인증키는 서버에만 있다. 화면은 키를 알지도, 보내지도 않는다.
export async function statLookup(region, topic = 'children') {
  const response = await fetch('/api/stats', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'lookup', region, topic })
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, ...data };
}
