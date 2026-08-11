// 관리자 계정 관리 호출. 화면은 결과만 따르고 실제 권한 확인은 서버가 한다.
async function post(action, payload = {}) {
  const response = await fetch('/api/admin', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, ...data };
}

export const listAccounts = () => post('listUsers');
export const approveAccount = id => post('approveUser', { id });
export const disableAccount = id => post('disableUser', { id });
export const removeAccount = id => post('deleteUser', { id });
// 운영관리자 지정·해제는 관리자만 한다. 서버가 'admin' 역할은 받지 않는다.
export const setAccountRole = (id, role) => post('setRole', { id, role });
