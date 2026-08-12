// 18~19단계 마무리: 저장본 다시 열기와 실제 파일 출력.
// 제출본 출력은 [확인 필요]가 남아 있으면 막히는 것이 규칙이다. 초안 출력으로 파일 생성을 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const downloads = scratch('downloads');
fs.mkdirSync(downloads, { recursive: true });
for (const file of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, file), { force: true });

let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };

const chrome = launch(scratch('ai'), 9372);
const page = await attach(9372);

try {
  await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await page.size(1280, 800);
  await page.go(SITE, 4000);
  await page.click('[data-landing="login"]', 2000);
  await page.fill('#login-email', account.email, 300);
  await page.fill('#login-password', account.password, 300);
  await page.run("(() => { document.querySelector('#login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1200);
  record(6, '로그인', await page.waitFor("!document.querySelector('#login-form')", 40000, 1500));

  // 18. 저장본 다시 열기 — 복구키 이름은 ms12_archive_key_v1이다.
  const reopen = await page.run(`(async () => {
    const key = localStorage.getItem('ms12_archive_key_v1') || '';
    const call = body => fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': key }, body: JSON.stringify(body) }).then(r => r.json());
    const list = await call({ action: 'listProposals' });
    const first = (list.proposals || [])[0];
    if (!first) return JSON.stringify({ count: 0, key: key ? 'ok' : '없음' });
    const one = await call({ action: 'getProposal', id: first.id });
    return JSON.stringify({ count: (list.proposals || []).length, id: first.id, title: String(first.title || '').slice(0, 28), sections: (one.proposal?.snapshot?.sections || []).length });
  })()`);
  record(18, '저장본 다시 열기', Number(reopen?.sections || 0) > 0, `보관 ${reopen?.count}건 · 항목 ${reopen?.sections}개 · ${reopen?.title || ''}`);

  // 19. 출력. 먼저 화면에 무슨 출력 버튼이 있는지 본다.
  await page.go(SITE, 5000);
  const buttons = await page.run("(() => JSON.stringify({ list: [...document.querySelectorAll('button')].filter(el => /PDF|DOCX|인쇄|내려받기/.test(el.textContent||'')).map(el => ({ id: el.id||'', t: (el.textContent||'').trim().slice(0,20), guide: (el.dataset?.blocked||'').slice(0,30) })) }))()");
  console.log('   출력 버튼:', JSON.stringify(buttons?.list));

  for (const id of ['final-docx-top', 'final-pdf-top']) {
    const before = fs.readdirSync(downloads).length;
    const hit = await page.run(`(() => { const el = document.querySelector('#${id}'); if (!el) return JSON.stringify({ found: false }); el.click(); return JSON.stringify({ found: true, guide: el.dataset?.blocked || '' }); })()`, 40000);
    const after = fs.readdirSync(downloads);
    const made = after.length > before;
    const name = after.find(file => file.toLowerCase().includes(id.includes('docx') ? 'docx' : 'pdf')) || after[after.length - 1] || '';
    const size = name ? fs.statSync(path.join(downloads, name)).size : 0;
    record(19, `${id.includes('docx') ? 'DOCX' : 'PDF'} 출력`, hit?.found === true && made && size > 1000, name ? `${name} · ${Math.round(size / 1024)}KB` : (hit?.found ? '파일 없음' : '버튼 없음'));
  }

  // 제출본 출력은 [확인 필요]가 남아 있으면 막힌다. 막히는 이유가 화면에 보이는지 확인한다.
  const gate = await page.run(`(() => {
    const el = [...document.querySelectorAll('button')].find(item => /최종 DOCX/.test(item.textContent||''));
    if (!el) return JSON.stringify({ found: false });
    return JSON.stringify({ found: true, guide: (el.dataset?.blocked || '').slice(0, 60), off: !!el.disabled });
  })()`);
  record(19, '제출본 출력 차단 사유 안내', gate?.found === false || (Boolean(gate?.guide) && gate?.off === false), gate?.guide || (gate?.found ? '사유 없음' : '해당 화면 아님'));
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
console.log(failures ? `\n실패 ${failures}건` : '\n18~19단계 통과');
process.exit(0);
