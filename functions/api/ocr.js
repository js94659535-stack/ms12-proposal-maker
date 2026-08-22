import { budgetRefusal, extractUsage, recordAiUsage } from '../../server/ai-usage.js';
import { OCR_PROMPT, checkImages } from '../../server/ocr.js';

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

// 사진·스캔본을 글자로 옮긴다. 새 업체를 붙이지 않고 지금 쓰는 모델의 이미지 입력을 쓴다(22-51).
// 원문 이미지는 저장하지 않는다. 읽은 글자만 돌려주고 사용량만 남긴다.
export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405, { Allow: 'POST' });
  if (!context.env.OPENAI_API_KEY || !context.env.OPENAI_MODEL) return json({ error: '문서 읽기 AI 환경변수가 준비되지 않았습니다.' }, 503);
  const raw = await context.request.text();
  if (new TextEncoder().encode(raw).byteLength > 750_000) return json({ error: '이미지가 허용 크기를 초과했습니다. 사진을 줄여 다시 올려 주세요.' }, 413);
  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: '요청 JSON 형식이 올바르지 않습니다.' }, 400); }
  const check = checkImages(payload.images);
  if (!check.ok) return json({ error: check.error }, 400);

  const user = context.data?.session?.user || {};
  if (!user.id) return json({ error: '로그인이 필요합니다.' }, 401);
  const guard = await budgetRefusal(context.env.ARCHIVE_DB, context.env, { proposalId: '', userId: user.id });
  if (guard.refusal) return json({ error: guard.refusal.error, capReached: true, budget: guard.refusal.budget }, guard.refusal.status);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  const startedAt = Date.now();
  const noteUsage = (data, ok, failureStage) => recordAiUsage(context.env.ARCHIVE_DB, context.env, {
    userId: user.id, userEmail: user.email, proposalId: '', task: 'ocr', model: context.env.OPENAI_MODEL,
    usage: extractUsage(data), durationMs: Date.now() - startedAt, ok, failureStage
  });
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${context.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: context.env.OPENAI_MODEL, store: false, max_output_tokens: 4_000,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: OCR_PROMPT },
            ...payload.images.map(image => ({ type: 'input_image', image_url: image }))
          ]
        }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      await noteUsage(data, false, 'openai-error');
      return json({ error: '사진에서 글자를 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }, 502);
    }
    const text = (data.output || []).flatMap(item => item.content || []).map(part => part.text || '').join('\n').trim();
    await noteUsage(data, Boolean(text), text ? '' : 'empty-output');
    // 읽은 것이 없으면 읽은 척하지 않는다.
    if (!text) return json({ error: '사진에서 글자를 찾지 못했습니다. 더 밝고 반듯하게 찍어 다시 올려 주세요.' }, 422);
    return json({ text });
  } catch (error) {
    await noteUsage(null, false, error?.name === 'AbortError' ? 'timeout' : 'network');
    return json({ error: error?.name === 'AbortError' ? '사진 읽기가 시간을 넘겼습니다. 다시 시도해 주세요.' : '사진을 읽는 중 문제가 생겼습니다.' }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
}
