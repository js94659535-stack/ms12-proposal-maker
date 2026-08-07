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

async function request(action, payload = {}) {
  const response = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': getArchiveRecoveryKey() }, body: JSON.stringify({ action, ...payload }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `자료보관함 요청 실패 (${response.status})`);
  return data;
}

export const syncArchivedNotices = notices => request('syncNotices', { notices });
export const searchArchivedNotices = filters => request('searchNotices', { filters });
export const saveArchivedProposal = proposal => request('saveProposal', { proposal });
export const listArchivedProposals = () => request('listProposals');
export const getArchivedProposal = id => request('getProposal', { id });
