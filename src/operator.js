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
// 에이전트 현황은 조회만 한다.
export const operatorAgencyList = () => post('agencyList');
export const operatorUserDetail = id => post('userDetail', { id });
// 사용량·비용은 읽기만 한다. 단가·상한을 바꾸는 동작은 서버가 거절한다.
export const operatorUsageReport = (days = 30) => post('usageReport', { days });
export const operatorApprove = (id, query = '') => post('approveUser', { id, query });
export const operatorDisable = (id, query = '') => post('disableUser', { id, query });
export const operatorReactivate = (id, query = '') => post('reactivateUser', { id, query });
export const operatorUnlockLogin = (id, query = '') => post('unlockLogin', { id, query });
export const operatorEndSessions = (id, query = '') => post('endSessions', { id, query });
export const operatorIssueRecoveryCode = (id, query = '') => post('issueRecoveryCode', { id, query });
// 수주 작업 진행상태만 바꾼다. 프리미엄 권한 부여·해제는 서버가 거절한다.
export const operatorSetContractProgress = (id, progress, progressNote = '', query = '') => post('setContractProgress', { id, progress, progressNote, query });
// 공고 자동수집 상태. 운영관리자는 보기만 한다. 실행은 서버가 거절한다.
export const operatorNoticeCollection = () => post('noticeCollection');

// 관리자가 지정해 준 계획서만 본다. 지정이 없으면 목록이 비어 있다.
export const operatorAssignedProposals = () => post('assignedProposals');
export const operatorProposalContent = id => post('proposalContent', { id });
// 공고 출처·기관 등록부. 추가·수정·중지·복원은 운영관리자까지, 보관은 최고관리자만(서버가 검사한다).
export const operatorNoticeOrgs = () => post('noticeOrgs', {});
export const operatorSaveNoticeOrg = value => post('saveNoticeOrg', value);
export const operatorSetNoticeOrgStatus = (id, status) => post('setNoticeOrgStatus', { id, status });
