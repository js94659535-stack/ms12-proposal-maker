// 「01 공고 준비」 카드가 실제 작업 화면을 여는지 확인한다.
//
// 카드의 빈 곳·번호·제목·목록을 각각 누르고, 자판(Tab → Enter, Tab → Space)으로도 열어 본다.
// 시험용 관리자 계정으로만 한다. 끝나면 계정을 지운다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = scratch('flow-shots');
fs.mkdirSync(shots, { recursive: true });

const child = launch(scratch('flow-profile'), 9355);
const page = await attach(9355);

const results = [];
const note = (screen, what, ok, detail = '') => {
  results.push({ screen, what, ok, detail });
  console.log(`${ok ? '통과' : '실패'} | ${screen} | ${what}${detail ? ' — ' + detail : ''}`);
};

async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}

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

// 관리자 랜딩까지. 포털 고르기 화면이 먼저 나온다.
async function openAdminLanding() {
  await page.go(SITE, 3000);
  await page.run("(() => { const el = [...document.querySelectorAll('button')].find(item => (item.dataset?.portal === 'admin') || (item.textContent || '').includes('관리자 포털')); if (el) el.click(); return '1'; })()", 2500);
  return page.run("(() => JSON.stringify({ card: !!document.querySelector('[data-flow-open]'), heading: (document.querySelector('.home-brand strong')?.textContent || '').trim() }))()");
}

// 지금 열려 있는 화면. 공고 준비 화면인지 이름으로 확인한다.
const where = () => page.run(`(() => {
  const heading = (document.querySelector('h2, h1')?.textContent || '').trim().slice(0, 40);
  return JSON.stringify({
    heading,
    hasUpload: !!document.querySelector('input[type=file], .dropzone'),
    hasFlowCard: !!document.querySelector('[data-flow-open]'),
    hasHome: !!document.querySelector('#workflow-home')
  });
})()`);

// 카드 안의 특정 자리를 누른다. 번호·제목·목록·빈 곳을 골라 누를 수 있다.
const clickInCard = part => page.run(`(() => {
  const card = document.querySelector('[data-flow-open]');
  if (!card) return JSON.stringify({ ok: false });
  const targets = {
    number: card.querySelector('.landing-step'),
    title: card.querySelector('h3'),
    desc: card.querySelector('p'),
    item: card.querySelector('li'),
    blank: card
  };
  const el = targets[${JSON.stringify('__PART__')}] || card;
  el.click();
  return JSON.stringify({ ok: true, clicked: (el.textContent || '').trim().slice(0, 16) });
})()`.replace('__PART__', part));

async function backToLanding() {
  // 작업 화면의 ⌂ 홈 단추로 돌아온다. 관리자 포털에 있으므로 관리자 랜딩이 다시 나온다.
  await page.click('#workflow-home', 2000);
  return page.run("(() => JSON.stringify({ back: !!document.querySelector('[data-flow-open]') }))()");
}

console.log('로그인', await signIn());
for (const [screen, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  await page.size(width, height);
  await page.send('Network.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  const landing = await openAdminLanding();
  note(screen, '관리자 포털에 01 카드가 있다', Boolean(landing?.card), landing?.heading || '');
  await page.run("(() => { document.querySelector('[data-flow-open]')?.scrollIntoView({ block: 'center' }); return '1'; })()", 600);
  await shot(`flow-${screen}-card`);

  for (const part of ['blank', 'number', 'title', 'desc', 'item']) {
    await openAdminLanding();
    await clickInCard(part);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const now = await where();
    note(screen, `카드 ${part} 누르기 → 공고 준비 화면`, Boolean(now?.hasUpload) && !now?.hasFlowCard, now?.heading || '');
    if (part === 'blank') await shot(`flow-${screen}-opened`);
    const home = await backToLanding();
    note(screen, `${part} 뒤 ⌂ 홈으로 되돌아오기`, Boolean(home?.back));
  }

  // 자판. Tab으로 카드에 닿은 뒤 Enter, 그다음 Space로 연다.
  for (const key of ['Enter', ' ']) {
    await openAdminLanding();
    const focused = await page.run(`(() => { const card = document.querySelector('[data-flow-open]'); if (!card) return JSON.stringify({ ok: false }); card.focus(); return JSON.stringify({ ok: document.activeElement === card, tabindex: card.getAttribute('tabindex'), role: card.getAttribute('role') }); })()`);
    note(screen, `자판 초점(Tab 대상)`, Boolean(focused?.ok), `tabindex=${focused?.tabindex} role=${focused?.role}`);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === 'Enter' ? 'Enter' : 'Space', windowsVirtualKeyCode: key === 'Enter' ? 13 : 32, text: key === 'Enter' ? '\r' : ' ' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key === 'Enter' ? 'Enter' : 'Space', windowsVirtualKeyCode: key === 'Enter' ? 13 : 32 });
    await new Promise(resolve => setTimeout(resolve, 1200));
    const now = await where();
    note(screen, `자판 ${key === ' ' ? 'Space' : 'Enter'}로 열기`, Boolean(now?.hasUpload) && !now?.hasFlowCard, now?.heading || '');
    await backToLanding();
  }
}
fs.writeFileSync(path.join(shots, 'flow-check.json'), JSON.stringify(results, null, 1));
console.log('실패', results.filter(row => !row.ok).length, '건');
child.kill();
process.exit(0);
