async function request(action, payload = {}) {
  const response = await fetch('/api/notices', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `공고 요청 실패 (${response.status})`);
  return data;
}

export const fetchNoticeList = () => request('list');
export const fetchNoticeDetail = notice => request('detail', { references: notice.references, supplementalReferences: notice.supplementalReferences || [] });
export const importNoticeUrl = (url, existingNotices) => request('importUrl', { url, existingNotices });

export function noticeBodyText(bodyHtml) {
  const document = new DOMParser().parseFromString(bodyHtml || '', 'text/html');
  return (document.body.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
