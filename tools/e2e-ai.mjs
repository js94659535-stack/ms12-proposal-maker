// 14단계: 실제 AI로 3~5쪽 계획서 1편을 만든다. 그리고 저장·복원·저장본 열기·출력을 확인한다.
// 설계 승인은 화면 버튼과 같은 값을 상태에 남겨 둔 뒤, 작성 버튼만 실제로 누른다.
import fs from 'node:fs';
import { MARK, SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };
const say = (...args) => console.log(...args);

const chrome = launch(scratch('ai'), 9370);
const page = await attach(9370);

try {
  await page.size(1280, 800);
  await page.go(SITE, 4000);
  await page.click('[data-landing="login"]', 2000);
  await page.fill('#login-email', account.email, 300);
  await page.fill('#login-password', account.password, 300);
  await page.run("(() => { document.querySelector('#login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1200);
  record(6, '로그인', await page.waitFor("!document.querySelector('#login-form')", 40000, 1500));

  // 공고·기관·설계 승인을 갖춘 최소 상태를 만든다. 3쪽으로 제한한다.
  const prepared = await page.run(`(async () => {
    const r = await fetch('/api/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'searchNotices', query: '', mode: 'broad' }) });
    const j = await r.json();
    const first = (j.notices || [])[0];
    const s = JSON.parse(localStorage.getItem('ms12_project_v3') || '{}');
    if (first) {
      s.selectedNotice = { title: first.title, summary: first.summary || '', eligibility: first.eligibility || '', deadline: first.deadline || '', applicationPeriod: first.applicationPeriod || '', supportLimit: first.supportAmount || '', archiveNoticeKey: first.key };
      s.sourceText = [first.title, first.summary, first.eligibility, first.supportAmount].filter(Boolean).join('\\n');
    }
    s.homeSeen = true; s.portal = 'proposal'; s.activeTool = ''; s.step = 4;
    s.project = { ...(s.project || {}), title: '${MARK} 방과후 돌봄 프로그램', type: 'chest' };
    s.projectNarrative = '방과후 돌봄이 끊긴 초등 저학년을 위해 주 2회 학습·정서 프로그램을 운영하고 싶습니다.';
    s.targetPages = 3;
    // 설계 승인. 화면의 「설계안 승인」이 남기는 값과 같다.
    s.engagement = s.engagement || {};
    s.engagement.design = { requestedAt: new Date().toISOString(), requestedBy: '고객', reviewStartedAt: new Date().toISOString(), approvedAt: new Date().toISOString(), approvedBy: '고객' };
    localStorage.setItem('ms12_project_v3', JSON.stringify(s));
    return JSON.stringify({ notice: !!first, chars: (s.sourceText || '').length, orgs: (s.applicants || []).length });
  })()`);
  record(13, '공고·기관·설계 승인 준비', prepared?.notice === true, `근거 ${prepared?.chars}자 · 기관 ${prepared?.orgs}곳`);

  await page.go(SITE, 5000);
  const button = await page.run("(() => { const el = document.querySelector('#generate-proposal') || document.querySelector('#generate-parts'); return JSON.stringify({ id: el?.id || '', off: !!el?.disabled, guide: el?.dataset?.blocked || '' }); })()");
  record(14, '작성 버튼 사용 가능', Boolean(button?.id) && !button?.off && !button?.guide, `${button?.id}${button?.guide ? ' · ' + String(button.guide).slice(0, 50) : ''}`);

  if (button?.id && !button?.guide) {
    const started = Date.now();
    await page.click(`#${button.id}`, 4000);
    say('   실제 AI 생성 시작…');
    const done = await page.waitFor("(JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length > 0", 420000, 10000);
    const made = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); const sec = s.sections||[]; return JSON.stringify({ n: sec.length, chars: sec.reduce((a,x)=>a+String(x.content||'').length,0), unknown: sec.filter(x=>/\\[확인 필요/.test(String(x.content||''))).length, busy: !!document.querySelector('.busy'), err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,100) }); })()");
    record(14, '실제 AI로 계획서 생성', done && Number(made?.n || 0) > 0,
      `항목 ${made?.n}개 · ${made?.chars}자 · [확인 필요] ${made?.unknown}개 · ${Math.round((Date.now() - started) / 1000)}초${made?.err ? ' · ' + made.err : ''}`);

    if (Number(made?.n || 0) > 0) {
      const saved = await page.clickText('계획서보관함에 저장', 10000);
      const savedState = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ id: s.archiveProposalId||'', msg: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0,60) }); })()");
      record(16, '계획서보관함 저장', Boolean(savedState?.id), savedState?.id ? String(savedState.id).slice(0, 10) : `${saved?.ok} ${savedState?.msg}`);

      await page.go(SITE, 5000);
      const reload = await page.run("(() => JSON.stringify({ n: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length }))()");
      record(17, '새로고침 후 복원', Number(reload?.n || 0) > 0, `항목 ${reload?.n}개`);

      const reopen = await page.run(`(async () => {
        const key = localStorage.getItem('ms12_archive_key') || '';
        const call = body => fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': key }, body: JSON.stringify(body) }).then(r => r.json());
        const list = await call({ action: 'listProposals' });
        const first = (list.proposals || [])[0];
        if (!first) return JSON.stringify({ count: 0 });
        const one = await call({ action: 'getProposal', id: first.id });
        return JSON.stringify({ count: (list.proposals || []).length, id: first.id, title: String(first.title || '').slice(0, 30), sections: (one.proposal?.snapshot?.sections || []).length });
      })()`);
      record(18, '저장본 다시 열기', Number(reopen?.sections || 0) > 0, `보관 ${reopen?.count}건 · 항목 ${reopen?.sections}개`);
      fs.writeFileSync(scratch('proposal.txt'), String(reopen?.id || ''));

      for (const needle of ['DOCX', 'PDF']) {
        const out = await page.run(`(() => {
          const el = [...document.querySelectorAll('button')].find(item => (item.textContent||'').includes(${JSON.stringify(needle)}));
          if (!el) return JSON.stringify({ found: false });
          el.click();
          return JSON.stringify({ found: true, guide: el.dataset?.blocked || '', label: (el.textContent||'').trim().slice(0,22) });
        })()`, 10000);
        const after = await page.run("(() => JSON.stringify({ err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,70) }))()");
        record(19, `${needle} 출력`, out?.found === true && !out?.guide && !after?.err, `${out?.label || '버튼 없음'} ${out?.guide || after?.err || ''}`.trim());
      }
    }
  }
} catch (error) {
  say('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
say(failures ? `\n실패 ${failures}건` : '\n통과');
process.exit(0);
