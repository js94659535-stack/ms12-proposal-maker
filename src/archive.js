const ARCHIVE_KEY_NAME = 'ms12_archive_key_v1';

function archiveKey() {
  let value = localStorage.getItem(ARCHIVE_KEY_NAME);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(ARCHIVE_KEY_NAME, value); }
  return value;
}

async function request(action, payload = {}) {
  const response = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': archiveKey() }, body: JSON.stringify({ action, ...payload }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `자료보관함 요청 실패 (${response.status})`);
  return data;
}

export const syncArchivedNotices = notices => request('syncNotices', { notices });
export const searchArchivedNotices = filters => request('searchNotices', { filters });
export const saveArchivedProposal = proposal => request('saveProposal', { proposal });
export const listArchivedProposals = () => request('listProposals');
export const getArchivedProposal = id => request('getProposal', { id });
