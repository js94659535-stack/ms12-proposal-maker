// 13~19단계만 따로: 설계 승인 → 실제 AI 생성 → 검토 → 저장 → 복원 → 저장본 열기 → 출력.
// 앞 단계에서 만든 시험계정과 신청기관을 그대로 쓴다. 출력은 즉시 흘려보내며 진행 상황을 남긴다.
import fs from 'node:fs';
import { MARK, SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const say = (...args) => { console.log(...args); };
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };

const chrome = launch(scratch('write'), 9365);
const page = await attach(9365);

try {
  await page.size(1280, 800);
  await page.go(SITE, 4000);
  await page.click('[data-landing="login"]', 2000);
  await page.fill('#login-email', account.email, 300);
  await page.fill('#login-password', account.password, 300);
  await page.run("(() => { document.querySelector('#login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1200);
  const inside = await page.waitFor("!document.querySelector('#login-form')", 40000, 1500);
  record(6, '로그인', inside);

  // 시험용 최소 상태를 만든다. 3~5쪽으로 제한한다.
  await page.run(`(() => {
    const s = JSON.parse(localStorage.getItem('ms12_project_v3') || '{}');
    s.homeSeen = true; s.portal = 'proposal'; s.activeTool = 'applicants';
    s.project = { ...(s.project || {}), title: '${MARK} 방과후 돌봄 프로그램', type: 'chest' };
    s.projectNarrative = '방과후 돌봄이 끊긴 초등 저학년을 위해 주 2회 학습·정서 프로그램을 운영하고 싶습니다.';
    s.targetPages = 3;
    localStorage.setItem('ms12_project_v3', JSON.stringify(s));
    return '1';
  })()`);
  // 실제 공고 한 건을 골라 넣는다. 공고 없이는 설계·작성으로 갈 수 없다.
  const chosen = await page.run(`(async () => {
    const r = await fetch('/api/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'searchNotices', query: '', mode: 'broad' }) });
    const j = await r.json();
    const first = (j.notices || [])[0];
    if (!first) return JSON.stringify({ ok: false });
    const s = JSON.parse(localStorage.getItem('ms12_project_v3') || '{}');
    s.selectedNotice = {
      title: first.title, summary: first.summary || '', eligibility: first.eligibility || '',
      deadline: first.deadline || '', applicationPeriod: first.applicationPeriod || '',
      supportLimit: first.supportAmount || '', archiveNoticeKey: first.key
    };
    s.sourceText = [first.title, first.summary, first.eligibility, first.supportAmount].filter(Boolean).join('\\n');
    localStorage.setItem('ms12_project_v3', JSON.stringify(s));
    return JSON.stringify({ ok: true, key: first.key, chars: s.sourceText.length });
  })()`);
  record(9, '공고 1건 선택', chosen?.ok === true, `근거 ${chosen?.chars || 0}자`);
  await page.go(SITE, 4000);
  const org = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ orgs: (s.applicants||[]).length, sel: !!s.selectedApplicantId }); })()");
  if (!org?.orgs) {
    await page.fill('#quick-orgName', `${MARK} 햇살지역아동센터`, 400);
    await page.fill('#quick-contact', '김담당 010-0000-0000', 400);
    await page.fill('#quick-orgType', '지역아동센터', 700);
    await page.click('#quick-save', 4000);
  }
  const org2 = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ orgs: (s.applicants||[]).length, items: (s.applicants?.[0]?.items||[]).length, sel: !!s.selectedApplicantId }); })()");
  record(10, '신청기관 준비', Number(org2?.orgs || 0) > 0 && org2?.sel === true, `기관 ${org2?.orgs}곳 · 항목 ${org2?.items}개`);

  // 13. 설계 확인 → 승인
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool='engagement'; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 4000);
  const seen = await page.run("(() => JSON.stringify({ req: !!document.querySelector('#design-request'), rev: !!document.querySelector('#design-review'), app: !!document.querySelector('#design-approve') }))()");
  say('   설계 버튼:', JSON.stringify(seen));
  // 화면에 있는 단계 버튼만 순서대로 누른다. 앞 실행에서 이미 요청·검토가 끝나 있을 수 있다.
  for (let round = 0; round < 4; round += 1) {
    const next = await page.run("(() => { for (const id of ['design-request', 'design-review', 'design-approve']) { const el = document.querySelector('#' + id); if (el) { el.click(); return JSON.stringify({ clicked: id }); } } return JSON.stringify({ clicked: '' }); })()", 2600);
    if (!next?.clicked) break;
    say(`   눌렀습니다: ${next.clicked}`);
    if (next.clicked === 'design-approve') break;
  }
  const approval = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ at: s.engagement?.design?.approvedAt || '', notice: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0,60), err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,60) }); })()");
  record(13, '설계안 확인·승인', Boolean(approval?.at), approval?.at ? String(approval.at).slice(0, 16) : `${approval?.notice} ${approval?.err}`);

  // 14. 실제 AI 생성
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool=''; s.step=4; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 4500);
  const button = await page.run("(() => { const el = document.querySelector('#generate-proposal') || document.querySelector('#generate-parts'); return JSON.stringify({ id: el?.id || '', off: !!el?.disabled, guide: el?.dataset?.blocked || '' }); })()");
  record(14, '작성 버튼 사용 가능', Boolean(button?.id) && !button?.off && !button?.guide, `${button?.id}${button?.guide ? ' · ' + String(button.guide).slice(0, 44) : ''}`);
  if (button?.id && !button?.guide) {
    const started = Date.now();
    await page.click(`#${button.id}`, 3000);
    say('   생성 시작…');
    const done = await page.waitFor("(JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length > 0", 480000, 8000);
    const made = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); const sec = s.sections||[]; return JSON.stringify({ n: sec.length, chars: sec.reduce((a,x)=>a+String(x.content||'').length,0), unknown: sec.filter(x=>/\\[확인 필요/.test(String(x.content||''))).length, err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,90) }); })()");
    record(14, '실제 AI로 계획서 생성', done && Number(made?.n || 0) > 0,
      `항목 ${made?.n}개 · ${made?.chars}자 · [확인 필요] ${made?.unknown}개 · ${Math.round((Date.now() - started) / 1000)}초${made?.err ? ' · ' + made.err : ''}`);

    // 16. 보관함 저장
    const saved = await page.clickText('계획서보관함에 저장', 9000);
    const savedState = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ id: s.archiveProposalId||'', msg: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0,50) }); })()");
    record(16, '계획서보관함 저장', Boolean(savedState?.id), savedState?.id ? String(savedState.id).slice(0, 8) : `${saved?.ok} ${savedState?.msg}`);

    // 17. 새로고침 → 재로그인 복원
    await page.go(SITE, 5000);
    const reload = await page.run("(() => JSON.stringify({ n: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length }))()");
    record(17, '새로고침 후 복원', Number(reload?.n || 0) > 0, `항목 ${reload?.n}개`);
    await page.run("(() => { document.querySelector('#sign-out')?.click(); return '1'; })()", 3500);
    await page.click('[data-landing="login"]', 2000);
    await page.fill('#login-email', account.email, 300);
    await page.fill('#login-password', account.password, 300);
    await page.run("(() => { document.querySelector('#login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1200);
    await page.waitFor("!document.querySelector('#login-form')", 40000, 1500);
    const back = await page.run("(() => JSON.stringify({ n: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length }))()");
    record(17, '재로그인 후 이어가기', Number(back?.n || 0) > 0, `항목 ${back?.n}개`);

    // 18. 저장본 다시 열기
    const reopen = await page.run(`(async () => {
      const key = localStorage.getItem('ms12_archive_key') || '';
      const call = body => fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': key }, body: JSON.stringify(body) }).then(r => r.json());
      const list = await call({ action: 'listProposals' });
      const first = (list.proposals || [])[0];
      if (!first) return JSON.stringify({ count: 0 });
      const one = await call({ action: 'getProposal', id: first.id });
      return JSON.stringify({ count: (list.proposals || []).length, id: first.id, sections: (one.proposal?.snapshot?.sections || []).length });
    })()`);
    record(18, '저장본 다시 열기', Number(reopen?.sections || 0) > 0, `보관 ${reopen?.count}건 · 항목 ${reopen?.sections}개`);
    fs.writeFileSync(scratch('proposal.txt'), String(reopen?.id || ''));

    // 19. 출력
    await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.step=5; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
    await page.go(SITE, 4500);
    for (const [label, needle] of [['DOCX', 'DOCX'], ['PDF', 'PDF']]) {
      const out = await page.run(`(() => {
        const el = [...document.querySelectorAll('button')].find(item => (item.textContent||'').includes(${JSON.stringify(needle)}));
        if (!el) return JSON.stringify({ found: false });
        el.click();
        return JSON.stringify({ found: true, guide: el.dataset?.blocked || '', off: !!el.disabled, label: (el.textContent||'').trim().slice(0,20) });
      })()`, 9000);
      const after = await page.run("(() => JSON.stringify({ err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,60), ok: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0,60) }))()");
      record(19, `${label} 출력`, out?.found === true && !out?.guide && !after?.err, `${out?.label || ''} ${out?.guide || after?.ok || after?.err || ''}`.trim());
    }
  }

  for (const [width, height] of [[1280, 800], [768, 1024], [360, 640]]) {
    await page.size(width, height);
    await page.go(SITE, 3500);
    const view = await page.snapshot();
    record(19, `핵심 화면 ${width}×${height}`, view?.overflow === false, view?.overflow ? '가로 넘침' : '정상');
  }
} catch (error) {
  say('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
say(failures ? `\n실패 ${failures}건` : '\n13~19단계 통과');
process.exit(0);
