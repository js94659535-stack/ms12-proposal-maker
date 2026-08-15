// 글자 진하기 확인. 실제 브라우저에서 computed style을 읽고 배경과의 명암비를 잰다.
//
// 색만 보고는 알 수 없다. 화면에 실제로 적용된 color·opacity·font-weight를 그대로 읽는다.
// 배경은 조상 요소를 거슬러 올라가 실제로 칠해진 색을 찾는다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const label = process.argv[3] || 'ink';
const shots = scratch('ink-shots');
fs.mkdirSync(shots, { recursive: true });

const child = launch(scratch('ink-profile'), 9349);
const page = await attach(9349);

const AUDIT = `(() => {
  const parse = value => {
    const found = String(value).match(/[\\d.]+/g) || [];
    return { r: Number(found[0] || 0), g: Number(found[1] || 0), b: Number(found[2] || 0), a: found[3] === undefined ? 1 : Number(found[3]) };
  };
  const mix = (front, back) => ({
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a), a: 1
  });
  const lum = color => {
    const channel = value => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  };
  const ratio = (front, back) => {
    const a = lum(front), b = lum(back);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  };
  // 실제로 칠해진 배경을 찾아 올라간다. 투명한 부모는 배경이 아니다.
  const backdrop = el => {
    let node = el;
    while (node) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color.a > 0) return color;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const hex = color => '#' + [color.r, color.g, color.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

  const look = (name, selector, usePlaceholder = false) => {
    const el = document.querySelector(selector);
    if (!el) return { name, missing: true };
    const style = getComputedStyle(el, usePlaceholder ? '::placeholder' : null);
    const back = backdrop(el);
    const front = mix(parse(style.color), back);
    const opacity = Number(style.opacity);
    const shown = opacity < 1 ? mix({ ...front, a: opacity }, back) : front;
    return {
      name,
      color: hex(shown),
      opacity: style.opacity,
      weight: style.fontWeight,
      size: style.fontSize,
      background: hex(back),
      contrast: ratio(shown, back)
    };
  };

  return JSON.stringify([
    look('사용자 입력칸 글자', '#core-idea'),
    look('예시문(placeholder)', '#core-idea', true),
    look('입력칸 아래 설명문', '#core-idea + small, #core-idea ~ small'),
    look('보기 단추(고르기 전)', '.chip:not(.on)'),
    look('이메일·보조 안내', '.home-brand span, .home-header span'),
    look('기본 안내문(제안 조건)', '.landing-head p'),
    look('머리말 설명', '.landing-lead'),
    look('항목명(굵은 글자)', '.field label'),
    look('제목', '.landing-hero h1'),
    look('꺼진 단추', '#core-run[disabled], .chip:disabled')
  ]);
})()`;

async function signIn() {
  await page.go(SITE, 2500);
  await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 1500);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1200);
  return page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
}

console.log('로그인', await signIn());
const report = {};
for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  await page.size(width, height);
  await page.go(SITE, 3000);
  report[name] = await page.run(AUDIT);
  await page.run("(() => { document.querySelector('#core-idea')?.scrollIntoView({ block: 'center' }); return '1'; })()", 700);
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  if (shot?.result?.data) fs.writeFileSync(path.join(shots, `${label}-${name}.png`), Buffer.from(shot.result.data, 'base64'));
}
for (const [screen, rows] of Object.entries(report)) {
  for (const row of rows) {
    if (row.missing) { console.log(`${screen} ${row.name} — 화면에 없음`); continue; }
    console.log(`${screen} | ${row.name} | ${row.color} on ${row.background} | weight ${row.weight} | opacity ${row.opacity} | ${row.size} | 명암비 ${row.contrast}${row.contrast < 4.5 ? '  ← 4.5 미만' : ''}`);
  }
}
fs.writeFileSync(path.join(shots, `${label}.json`), JSON.stringify(report, null, 1));
child.kill();
process.exit(0);
