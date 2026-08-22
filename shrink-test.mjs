import fs from 'node:fs';
const sharp = (await import('./node_modules/sharp/dist/index.mjs')).default;
const vars = Object.fromEntries(fs.readFileSync('.dev.vars', 'utf8').split(/\r?\n/)
  .filter(line => line.includes('=') && !line.startsWith('#'))
  .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
const src = 'C:/Users/UserK/Downloads/마인드스토리사업자등록증1 (1).png';
const WANT = ['504-88-01964', '마인드스토리', '박종석', '2021년 08월 26일', '200111-0629027', '임방울대로', '2023년 10월 10일'];
const PRICE_IN = 5, PRICE_OUT = 30, KRW = 1420;
for (const width of [1600, 1200, 900, 700]) {
  const jpeg = await sharp(src).resize({ width }).jpeg({ quality: 80 }).toBuffer();
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  const started = Date.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vars.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: vars.OPENAI_MODEL, store: false, max_output_tokens: 1500,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: '이 이미지에 적힌 글자를 그대로 옮겨 적으세요. 없는 값은 지어내지 마세요.' },
        { type: 'input_image', image_url: dataUrl }
      ] }]
    })
  });
  const body = await response.json();
  if (!response.ok) { console.log(`${width}px — HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`); continue; }
  const text = (body.output || []).flatMap(item => item.content || []).map(part => part.text || '').join('\n');
  const found = WANT.filter(want => text.includes(want));
  const cost = (body.usage.input_tokens * PRICE_IN + body.usage.output_tokens * PRICE_OUT) / 1e6;
  console.log(`${width}px · ${(jpeg.length / 1024).toFixed(0)}KB · base64 ${(dataUrl.length / 1024).toFixed(0)}KB · 입력 ${body.usage.input_tokens}토큰 · 출력 ${body.usage.output_tokens} · ${(cost * KRW).toFixed(1)}원 · ${((Date.now() - started) / 1000).toFixed(1)}초 · 맞힌 값 ${found.length}/${WANT.length}${found.length < WANT.length ? ' (놓침: ' + WANT.filter(w => !found.includes(w)).join(', ') + ')' : ''}`);
}
