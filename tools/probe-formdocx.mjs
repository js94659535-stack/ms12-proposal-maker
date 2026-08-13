// 「올린 서식대로 받기」만 따로 눌러 본다. 자료를 바꾸지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const out = scratch('formdocx-out');
fs.mkdirSync(out, { recursive: true });
for (const file of fs.readdirSync(out)) fs.rmSync(path.join(out, file), { force: true });

const chrome = launch(scratch('onestop'), 9495);
const page = await attach(9495);
try {
  await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
  await page.size(1280, 800);
  await page.go(SITE, 3500);
  const needsLogin = await page.run("(() => JSON.stringify({ hit: !!document.querySelector('[data-landing=\"login\"]') }))()");
  if (needsLogin?.hit) {
    await page.click('[data-landing="login"]', 1800);
    await page.fill('#login-email', account.email, 250);
    await page.fill('#login-password', account.password, 250);
    await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
    await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
    await page.go(SITE, 4000);
  }
  const before = await page.run(`(() => {
    const s = JSON.parse(localStorage.getItem('ms12_project_v3') || '{}');
    return JSON.stringify({
      sections: (s.sections || []).length,
      sources: (s.manualSources || []).length,
      forms: (s.manualSources || []).filter(x => ['공모신청서', '사업계획서 서식'].includes(x.sourceType)).length,
      button: !!document.querySelector('#final-form-docx'),
      preview: !!document.querySelector('#form-preview')
    });
  })()`);
  console.log('누르기 전:', JSON.stringify(before));

  const clicked = await page.click('#final-form-docx', 12000);
  const after = await page.run(`(() => JSON.stringify({
    error: (document.querySelector('.alert.danger')?.textContent || '').trim().slice(0, 160),
    notice: (document.querySelector('.alert.success')?.textContent || '').trim().slice(0, 160),
    busy: (document.querySelector('.busy strong')?.textContent || '').trim().slice(0, 60)
  }))()`);
  const files = fs.readdirSync(out).filter(file => !file.endsWith('.crdownload'));
  console.log('클릭:', JSON.stringify(clicked), '\n결과:', JSON.stringify(after), '\n파일:', files.join(', ') || '없음');
} finally { page.close(); chrome.kill(); }
process.exit(0);
