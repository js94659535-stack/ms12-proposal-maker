// 보기 단추와 예시문만 콕 집어 잰다. 「지역주민·10명 내외·3개월·주 1회」 그 요소 자체를 본다.
//
// 앞선 확인이 화면과 어긋났다. 그래서 조상 요소의 opacity·filter·비활성 속성까지 함께 훑고,
// 실제로 칠해진 배경 위에서 최종 색을 계산한다. 무엇을 쟀는지 글자까지 함께 남긴다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const label = process.argv[3] || 'chip';
const shots = scratch('chip-shots');
fs.mkdirSync(shots, { recursive: true });

const child = launch(scratch('chip-profile'), 9353);
const page = await attach(9353);

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
  const hex = color => '#' + [color.r, color.g, color.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const backdrop = el => {
    let node = el;
    while (node) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color.a > 0) return color;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  // 조상까지 곱해진 흐림. 부모가 0.6이면 자식이 1이어도 화면에서는 0.6이다.
  const chain = el => {
    let node = el, total = 1;
    const notes = [];
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node);
      const opacity = Number(style.opacity);
      if (opacity < 1) { total *= opacity; notes.push((node.tagName + (node.className ? '.' + String(node.className).split(' ')[0] : '')) + ' opacity ' + opacity); }
      if (style.filter && style.filter !== 'none') notes.push((node.tagName) + ' filter ' + style.filter);
      node = node.parentElement;
    }
    return { total, notes };
  };

  const report = (name, el, pseudo = null) => {
    if (!el) return { name, missing: true };
    const style = getComputedStyle(el, pseudo);
    const back = backdrop(el);
    const inherited = chain(el);
    const own = mix(parse(style.color), back);
    const shown = inherited.total < 1 ? mix({ ...own, a: inherited.total }, back) : own;
    return {
      name,
      text: (el.textContent || '').trim().slice(0, 20) || (el.placeholder || '').slice(0, 24),
      color: hex(shown),
      declared: style.color,
      weight: style.fontWeight,
      size: style.fontSize,
      opacity: Math.round(inherited.total * 100) / 100,
      opacityNotes: inherited.notes,
      disabled: Boolean(el.disabled),
      border: pseudo ? '' : style.borderColor,
      background: hex(back),
      contrast: ratio(shown, back)
    };
  };

  const chipNamed = text => [...document.querySelectorAll('.chip')].find(el => (el.textContent || '').trim() === text) || null;
  const rows = [
    report('예시문 · 대상 칸', document.querySelector('#cond-target'), '::placeholder'),
    report('예시문 · 핵심 아이디어', document.querySelector('#core-idea'), '::placeholder'),
    ...['지역주민', '10명 내외', '3개월', '주 1회'].map(text => report('보기 단추 ' + text, chipNamed(text))),
    report('설명문(비교용)', document.querySelector('#cond-target ~ small')),
    report('사용자 입력칸(비교용)', document.querySelector('#core-idea'))
  ];
  return JSON.stringify(rows);
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
for (const [screen, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  await page.size(width, height);
  // 캐시를 지나치지 않게 매번 새로 받는다.
  await page.send('Network.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.go(SITE, 3500);
  report[screen] = await page.run(AUDIT);
  // 같은 위치를 찍는다. 대상 칸의 보기 단추가 가운데 오도록 맞춘다.
  await page.run("(() => { document.querySelector('#cond-target')?.scrollIntoView({ block: 'center' }); return '1'; })()", 800);
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  if (shot?.result?.data) fs.writeFileSync(path.join(shots, `${label}-${screen}.png`), Buffer.from(shot.result.data, 'base64'));
}
for (const [screen, rows] of Object.entries(report)) {
  for (const row of rows) {
    if (row.missing) { console.log(`${screen} ${row.name} — 화면에 없음`); continue; }
    console.log(`${screen} | ${row.name} | 「${row.text}」 | ${row.color} on ${row.background} | weight ${row.weight} | ${row.size} | opacity ${row.opacity}${row.opacityNotes.length ? ' (' + row.opacityNotes.join(', ') + ')' : ''} | 테두리 ${row.border} | 명암비 ${row.contrast}`);
  }
}
fs.writeFileSync(path.join(shots, `${label}.json`), JSON.stringify(report, null, 1));
child.kill();
process.exit(0);
