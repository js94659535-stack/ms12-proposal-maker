// 공모정보 검색 호출. 로그인하지 않아도 열리는 경로이고 AI·외부 API를 부르지 않는다.
async function post(action, payload = {}) {
  const response = await fetch('/api/public', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, ...data };
}

// mode: 'focused'(맞춤검색·기본) | 'broad'(광역검색)
export const searchPublicNotices = (query, mode, filters) => post('searchNotices', { query, mode, filters });
export const publicNoticeDetail = key => post('noticeDetail', { key });
// 회원 안내 상품표. 로그인 없이도 랜딩·로그인 화면에서 읽는다.
export const fetchMembershipPlans = () => post('membershipPlans', {});
