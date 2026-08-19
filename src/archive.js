const ARCHIVE_KEY_NAME = 'ms12_archive_key_v1';

export function getArchiveRecoveryKey() {
  let value = localStorage.getItem(ARCHIVE_KEY_NAME);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(ARCHIVE_KEY_NAME, value); }
  return value;
}

export function useArchiveRecoveryKey(value) {
  const normalized = String(value || '').trim();
  if (!/^[a-f0-9-]{32,64}$/i.test(normalized)) throw new Error('유효한 자료보관함 복구키를 입력해 주세요.');
  localStorage.setItem(ARCHIVE_KEY_NAME, normalized);
  return normalized;
}

// 대행 업무와 개인 작업공간. 화면이 정한 값을 요청마다 붙인다. 기본은 개인이다.
let workspace = 'personal';
export function setArchiveWorkspace(value) { workspace = value === 'agency' ? 'agency' : 'personal'; }
export function archiveWorkspace() { return workspace; }

async function request(action, payload = {}) {
  const response = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': getArchiveRecoveryKey() }, body: JSON.stringify({ action, workspace, ...payload }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `자료보관함 요청 실패 (${response.status})`);
  return data;
}

export const syncArchivedNotices = notices => request('syncNotices', { notices });
export const searchArchivedNotices = filters => request('searchNotices', { filters });
export const saveArchivedProposal = proposal => request('saveProposal', { proposal });
export const listArchivedProposals = () => request('listProposals');
export const getArchivedProposal = id => request('getProposal', { id });
export const saveArchivedApplicant = applicant => request('saveApplicant', { applicant });
export const listArchivedApplicants = () => request('listApplicants');
export const deleteArchivedApplicant = id => request('deleteApplicant', { id });

// 사업 아이디어·활용자산. 계획서와 같은 복구키 기준으로 보관한다.
export const listIdeaAssets = () => request('listAssets');
export const saveIdeaAsset = asset => request('saveAsset', { asset });
export const deleteIdeaAsset = id => request('deleteAsset', { id });
// 복구키로 보관하던 자료를 내 계정에 연결한다. 회원이 직접 누를 때만 실행된다.
export const claimMyArchive = () => request('claimMine');
// 이 계획서에 한해 운영지원 열람을 허락하거나 거둔다.
export const setProposalSupportConsent = (id, consent) => request('setSupportConsent', { id, consent });
export const countProposalExport = id => request('countExport', { id });
