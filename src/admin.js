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
// 전체 이용권 부여·회수도 관리자만 한다. 운영관리자 경로에서는 서버가 거절한다.
export const setAccountPlan = (id, plan) => post('setPlan', { id, plan });
// 공모정보 관리. 공개 여부와 상관없이 모아 둔 자료 전체를 본다.
export const listCollectedNotices = (query = '') => post('listNotices', { query });
export const setNoticePublic = (key, isPublic, query = '') => post('setNoticePublic', { key, isPublic, query });
// AI 사용량·비용. 회원별·계획서별·기간별로 본다.
export const adminUsageReport = (days = 30) => post('usageReport', { days });
// 정식 수주회원(프리미엄) 계약 부여·중지. 관리자만 할 수 있고 서버가 다시 확인한다.
export const setAccountPremium = (id, contract) => post('setPremium', { id, contract });
// 공개용 우수 제안서. 관리자가 만든 사본만 다루며 회원 계획서를 옮겨 오지 않는다.
export const listShowcase = () => post('listShowcase');
export const saveShowcase = (proposal, id = '') => post('saveShowcase', { proposal, id });
export const setShowcasePublic = (id, isPublic) => post('setShowcasePublic', { id, isPublic });
export const setShowcaseOrder = order => post('setShowcaseOrder', { order });
export const deleteShowcase = id => post('deleteShowcase', { id });
// 시험용 월간 구독 부여·중지. 관리자만 할 수 있고 서버가 다시 확인한다.
export const setAccountSubscription = (id, subscription) => post('setSubscription', { id, subscription });
// 소셜 연결 이전. 관리자 비밀번호로 방금 로그인한 세션에서만 서버가 옮긴다.
export const transferSocialIdentity = provider => post('transferIdentity', { provider });
// 공고 자동수집 상태판. 읽기 전용이다.
export const adminNoticeCollection = () => post('noticeCollection');
// 수동 재수집. 자동 실행과 같은 잠금에 걸려 두 번 돌지 않는다.
export const adminRunNoticeCollection = () => post('runNoticeCollection');

// 권한 관리. 최고관리자만 쓴다.
export const adminAccessOverview = (subjectId = '') => post('accessOverview', { subjectId });
export const adminSaveGrant = grant => post('saveGrant', { grant });
export const adminRevokeGrant = id => post('revokeGrant', { id });
// 회원별 이용현황(메타정보)과 기존 보관자료 지정.
export const adminOverviewCounts = () => post('overview');
export const adminMemberUsage = () => post('memberUsage');
export const adminProposalContent = id => post('proposalContent', { id });
export const adminAssignProposal = (id, userId, note) => post('assignProposal', { id, userId, note });

// 수집 출처 사용·중지. 최고관리자만 바꾼다.
export const adminSetNoticeSource = (sourceId, enabled) => post('setNoticeSource', { sourceId, enabled });
