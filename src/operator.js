// 운영관리자 화면 호출. 화면은 결과만 따르고 실제 권한 확인·차단은 서버가 한다.
async function post(action, payload = {}) {
  const response = await fetch('/api/operator', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, ...data };
}

export const operatorOverview = (query = '') => post('overview', { query });
export const operatorUserDetail = id => post('userDetail', { id });
export const operatorApprove = (id, query = '') => post('approveUser', { id, query });
export const operatorDisable = (id, query = '') => post('disableUser', { id, query });
export const operatorReactivate = (id, query = '') => post('reactivateUser', { id, query });
export const operatorUnlockLogin = (id, query = '') => post('unlockLogin', { id, query });
export const operatorEndSessions = (id, query = '') => post('endSessions', { id, query });
export const operatorIssueRecoveryCode = (id, query = '') => post('issueRecoveryCode', { id, query });
