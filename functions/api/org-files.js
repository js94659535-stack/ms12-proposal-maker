// 기관이 준 서류 원본을 보관하고, 돌려주고, 지운다.
//
// 왜 보관하는가. 예전에는 첨부 원본을 브라우저 메모리에만 두고 저장하지 않았다 — 개인정보를 서버에
// 남기지 않으려는 뜻이었다. 그러나 거래처 기록은 대행업의 신뢰다. 기관이 「그 서류 다시 보내 주세요」
// 라고 할 때 줄 수 없으면 고객관리를 못 하는 것으로 보인다. 그래서 보관하되 지우는 길을 함께 둔다.
//
// 누가 볼 수 있는가. 새 규칙을 만들지 않는다 — 파일은 기관에 매달고, 그 기관을 볼 수 있는 사람만 본다.
// 기관을 볼 수 있는지는 지금 기관정보가 쓰는 규칙 그대로다(같은 보관키로 그 기관 행이 조회되는가).
//
// 무엇을 남기는가. 원본은 R2에, 「무엇을·언제·누가 받았는지」는 기관자료 목록에 남는다. 파일이 있어도
// 그 기록은 따로 필요하다 — 지운 뒤에도 무엇을 받았었는지는 남아야 하기 때문이다.
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const clean = (value, max) => String(value || '').trim().slice(0, max);

async function ownerHashOf(request) {
  const key = request.headers.get('x-archive-key') || '';
  if (!/^[a-f0-9-]{32,64}$/i.test(key)) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

// 이 사람이 이 기관을 볼 수 있는가. 기관정보를 여는 규칙과 같은 질문이다.
async function canOpen(db, ownerHash, applicantId) {
  if (!db?.prepare || !ownerHash || !applicantId) return false;
  const row = await db.prepare('SELECT id FROM applicant_organizations WHERE id = ? AND owner_hash = ?').bind(applicantId, ownerHash).first();
  return Boolean(row);
}

const keyOf = (ownerHash, applicantId, sourceId) => `${ownerHash}/${applicantId}/${sourceId}`;

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.ORG_FILES) return json({ error: '서류 보관함이 연결되지 않았습니다.' }, 503);
  if (!env.ARCHIVE_DB) return json({ error: '자료보관함 데이터베이스가 연결되지 않았습니다.' }, 503);
  const url = new URL(request.url);
  const applicantId = clean(url.searchParams.get('applicantId'), 80);
  const sourceId = clean(url.searchParams.get('sourceId'), 80);
  const ownerHash = await ownerHashOf(request);
  if (!ownerHash) return json({ error: '자료보관함 식별키가 없습니다.' }, 401);
  if (!applicantId || !sourceId) return json({ error: '어느 기관의 어느 자료인지 밝혀야 합니다.' }, 400);
  if (!await canOpen(env.ARCHIVE_DB, ownerHash, applicantId)) return json({ error: '이 기관의 서류를 열 권한이 없습니다.' }, 403);

  const key = keyOf(ownerHash, applicantId, sourceId);

  if (request.method === 'PUT') {
    const size = Number(request.headers.get('content-length') || 0);
    if (size > MAX_FILE_BYTES) return json({ error: '파일은 20MB 이하여야 합니다.' }, 413);
    const name = clean(decodeURIComponent(url.searchParams.get('name') || ''), 200);
    if (!name) return json({ error: '파일 이름이 없습니다.' }, 400);
    const body = await request.arrayBuffer();
    if (!body.byteLength) return json({ error: '빈 파일입니다.' }, 400);
    if (body.byteLength > MAX_FILE_BYTES) return json({ error: '파일은 20MB 이하여야 합니다.' }, 413);
    const uploadedAt = new Date().toISOString();
    const uploadedBy = clean(context.data?.session?.user?.email || '', 120);
    await env.ORG_FILES.put(key, body, {
      httpMetadata: { contentType: clean(request.headers.get('x-file-type'), 100) || 'application/octet-stream' },
      // 파일 자체에도 무엇을·언제·누가 받았는지 적어 둔다. 목록이 사라져도 파일만 보고 알 수 있다.
      customMetadata: { name, applicantId, uploadedAt, uploadedBy }
    });
    return json({ file: { key, name, size: body.byteLength, type: clean(request.headers.get('x-file-type'), 100), uploadedAt, uploadedBy } });
  }

  if (request.method === 'GET') {
    const object = await env.ORG_FILES.get(key);
    if (!object) return json({ error: '보관된 파일이 없습니다.' }, 404);
    const name = object.customMetadata?.name || 'document';
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store'
      }
    });
  }

  if (request.method === 'DELETE') {
    await env.ORG_FILES.delete(key);
    return json({ deleted: true, key });
  }

  return json({ error: 'PUT·GET·DELETE만 허용됩니다.' }, 405, { Allow: 'PUT, GET, DELETE' });
}
