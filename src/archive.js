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

// ---------- 기관이 준 서류 원본 ----------
// 파일은 기관에 매달린다. 여는 권한은 기관정보와 같은 규칙이라 여기서 따로 정하지 않는다.
const fileEndpoint = (applicantId, sourceId) =>
  `/api/org-files?applicantId=${encodeURIComponent(applicantId)}&sourceId=${encodeURIComponent(sourceId)}`;

export function orgFileUrl(applicantId, sourceId) {
  return fileEndpoint(applicantId, sourceId);
}

export async function uploadOrgFile(applicantId, sourceId, file) {
  const response = await fetch(`${fileEndpoint(applicantId, sourceId)}&name=${encodeURIComponent(file.name)}`, {
    method: 'PUT',
    headers: { 'X-Archive-Key': getArchiveRecoveryKey(), 'X-File-Type': file.type || 'application/octet-stream' },
    body: file
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `서류를 보관하지 못했습니다 (${response.status})`);
  return data.file;
}

export async function deleteOrgFile(applicantId, sourceId) {
  const response = await fetch(fileEndpoint(applicantId, sourceId), { method: 'DELETE', headers: { 'X-Archive-Key': getArchiveRecoveryKey() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `서류를 지우지 못했습니다 (${response.status})`);
  return data;
}

// 파일을 열려면 보관키가 필요하다. 새 창으로 바로 열 수 없으므로 받아서 잠시 연다.
export async function openOrgFile(applicantId, sourceId) {
  const response = await fetch(fileEndpoint(applicantId, sourceId), { headers: { 'X-Archive-Key': getArchiveRecoveryKey() } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `서류를 열지 못했습니다 (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
