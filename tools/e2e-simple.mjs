// 간편 작성 흐름을 실제 브라우저로 완주한다.
// 공고 선택 → 기관 → 한 줄 요청 → 생성 → 수정 2회 → 되돌리기 → 저장 → 재로그인 복원 → 출력.
import fs from 'node:fs';
import path from 'node:path';
import { MARK, SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const downloads = scratch('simple-out');
fs.mkdirSync(downloads, { recursive: true });
for (const file of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, file), { force: true });

let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };
const say = (...args) => console.log(...args);

const chrome = launch(scratch('simple'), 9390);
const page = await attach(9390);

async function signIn() {
  await page.go(SITE, 4000);
  await page.click('[data-landing="login"]', 2000);
  await page.fill('#login-email', account.email, 300);
  await page.fill('#login-password', account.password, 300);
  await page.run("(() => { document.querySelector('#login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1200);
  return page.waitFor("!document.querySelector('#login-form')", 40000, 1500);
}

try {
  await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await page.size(1280, 800);
  record(0, '로그인', await signIn());

  // 간편 화면이 기본으로 뜨는지.
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.homeSeen = true; s.portal='proposal'; s.activeTool=''; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 4500);
  const simple = await page.run("(() => JSON.stringify({ view: !!document.querySelector('#simple-generate'), steps: [...document.querySelectorAll('#app .stat-badge span')].slice(0,4).map(el => el.textContent.trim()), toggle: !!document.querySelector('#toggle-view') }))()");
  record(1, '일반회원 간편 화면 기본 표시', simple?.view === true, `단계 ${(simple?.steps || []).join(' → ')}`);

  // 공고를 고른다.
  const notice = await page.run(`(async () => {
    const r = await fetch('/api/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'searchNotices', query: '', mode: 'broad' }) });
    const j = await r.json();
    const first = (j.notices || [])[0];
    if (!first) return JSON.stringify({ ok: false });
    const s = JSON.parse(localStorage.getItem('ms12_project_v3') || '{}');
    s.selectedNotice = { title: first.title, summary: first.summary || '', eligibility: first.eligibility || '', deadline: first.deadline || '', applicationPeriod: first.applicationPeriod || '', supportLimit: first.supportAmount || '', archiveNoticeKey: first.key };
    s.sourceText = [first.title, first.summary, first.eligibility, first.supportAmount].filter(Boolean).join('\\n');
    s.project = { ...(s.project || {}), title: '${MARK} 간편 작성 시험', type: 'chest' };
    localStorage.setItem('ms12_project_v3', JSON.stringify(s));
    return JSON.stringify({ ok: true, chars: s.sourceText.length });
  })()`);
  record(2, '공고 선택', notice?.ok === true, `근거 ${notice?.chars}자`);

  // 기관 간단정보와 한 줄 요청을 화면에서 입력한다.
  await page.go(SITE, 4500);
  await page.fill('#quick-orgName', `${MARK} 햇살지역아동센터`, 400);
  await page.fill('#quick-contact', '김담당 010-0000-0000', 400);
  await page.fill('#quick-orgType', '지역아동센터', 700);
  await page.click('#quick-save', 4000);
  await page.fill('#simple-idea', '방과후 돌봄이 끊긴 초등 저학년을 위해 주 2회 학습·정서 프로그램을 운영하고 싶습니다.', 600);
  const ready = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ orgs: (s.applicants||[]).length, idea: (s.projectNarrative||'').length, guide: document.querySelector('#simple-generate')?.dataset?.blocked || '' }); })()");
  record(3, '기관·한 줄 요청 입력', Number(ready?.orgs || 0) > 0 && Number(ready?.idea || 0) > 10 && !ready?.guide, `기관 ${ready?.orgs}곳 · 요청 ${ready?.idea}자`);

  // 생성. 설계 승인은 안에서 자동으로 처리된다.
  const started = Date.now();
  await page.click('#simple-generate', 5000);
  say('   AI 생성 시작…');
  const made = await page.waitFor("(JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length > 0", 420000, 10000);
  const first = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); const sec = s.sections||[]; return JSON.stringify({ n: sec.length, chars: sec.reduce((a,x)=>a+String(x.content||'').length,0), unknown: sec.filter(x=>/\\[확인 필요/.test(String(x.content||''))).length, approved: !!s.engagement?.design?.approvedAt, err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,80) }); })()");
  record(4, 'AI가 계획서 만들기', made && Number(first?.n || 0) > 0,
    `항목 ${first?.n}개 · ${first?.chars}자 · [확인 필요] ${first?.unknown}개 · 설계승인 ${first?.approved} · ${Math.round((Date.now() - started) / 1000)}초${first?.err ? ' · ' + first.err : ''}`);

  if (Number(first?.n || 0) > 0) {
    // 결과 화면의 큰 버튼 다섯 개.
    await page.go(SITE, 4000);
    const actions = await page.run("(() => JSON.stringify({ ids: ['simple-view','simple-revise','save-proposal-archive','final-docx-top','final-pdf-top','simple-expert'].filter(id => document.querySelector('#'+id)) }))()");
    record(5, '결과 화면 버튼', (actions?.ids || []).length >= 5, (actions?.ids || []).join(', '));

    // 저장.
    await page.click('#save-proposal-archive', 9000);
    const saved = await page.run("(() => JSON.stringify({ id: JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').archiveProposalId || '' }))()");
    record(6, '저장', Boolean(saved?.id), String(saved?.id || '').slice(0, 10));

    // 수정 1회차.
    const beforeText = await page.run("(() => JSON.stringify({ chars: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).reduce((a,x)=>a+String(x.content||'').length,0) }))()");
    await page.click('#simple-revise', 2500);
    await page.click('[data-revise-kind="add"]', 1500);
    await page.fill('#revise-text', '대상 선정 방법을 조금 더 자세히 적어 주세요.', 500);
    await page.click('#revise-run', 5000);
    const done1 = await page.waitFor("!document.querySelector('.busy')", 300000, 8000);
    const after1 = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); const r = s.revisions||[]; const last = r[r.length-1]||{}; return JSON.stringify({ rounds: r.length, counted: !!last.counted, note: last.note||'', changed: last.diff?.changed?.length ?? 0, kept: last.diff?.kept?.length ?? 0, chars: (s.sections||[]).reduce((a,x)=>a+String(x.content||'').length,0), notice: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0,90) }); })()");
    record(7, '수정 1회차', done1 && Number(after1?.rounds || 0) > 0, `바뀐 ${after1?.changed}개 · 유지 ${after1?.kept}개 · 차감 ${after1?.counted}${after1?.note ? ' · ' + after1.note : ''}`);

    // 되돌리기.
    await page.go(SITE, 3500);
    await page.click('#simple-revise', 2000);
    const undo = await page.run("(() => { const el = document.querySelector('#revise-undo'); if (!el) return JSON.stringify({ found: false }); el.click(); return JSON.stringify({ found: true }); })()", 2500);
    const afterUndo = await page.run("(() => JSON.stringify({ chars: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).reduce((a,x)=>a+String(x.content||'').length,0) }))()");
    record(8, '수정 전으로 되돌리기', undo?.found === true && Number(afterUndo?.chars || 0) === Number(beforeText?.chars || -1),
      `${beforeText?.chars}자 → ${afterUndo?.chars}자`);

    // 수정 2회차.
    await page.click('[data-revise-kind="tone"]', 1500);
    await page.fill('#revise-text', '문장을 조금 더 간결하게 다듬어 주세요.', 500);
    await page.click('#revise-run', 5000);
    const done2 = await page.waitFor("!document.querySelector('.busy')", 300000, 8000);
    const after2 = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); const r = s.revisions||[]; const counted = r.filter(item => item.counted).length; return JSON.stringify({ rounds: r.length, counted, left: 2 - counted }); })()");
    record(9, '수정 2회차', done2 && Number(after2?.rounds || 0) >= 2, `요청 ${after2?.rounds}회 · 차감 ${after2?.counted}회 · 남음 ${after2?.left}회`);

    // 재로그인 복원.
    await page.run("(() => { document.querySelector('#sign-out')?.click(); return '1'; })()", 3500);
    await signIn();
    const restored = await page.run("(() => JSON.stringify({ n: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length }))()");
    record(10, '재로그인 후 복원', Number(restored?.n || 0) > 0, `항목 ${restored?.n}개`);

    // 출력.
    await page.go(SITE, 4000);
    for (const [id, label] of [['final-docx-top', 'DOCX'], ['final-pdf-top', 'PDF']]) {
      const before = fs.readdirSync(downloads).length;
      const hit = await page.run(`(() => { const el = document.querySelector('#${id}'); if (!el) return JSON.stringify({ found: false }); el.click(); return JSON.stringify({ found: true, guide: el.dataset?.blocked || '' }); })()`, 30000);
      const after = fs.readdirSync(downloads).filter(file => !file.endsWith('.crdownload'));
      const name = after.find(file => file.toLowerCase().endsWith(label.toLowerCase())) || '';
      const size = name ? fs.statSync(path.join(downloads, name)).size : 0;
      record(11, `${label} 받기`, hit?.found === true && after.length > before && size > 1000, name ? `${name} · ${Math.round(size / 1024)}KB` : '파일 없음');
    }
  }

  // 세 크기 확인.
  for (const [width, height] of [[1280, 800], [768, 1024], [360, 640]]) {
    await page.size(width, height);
    await page.go(SITE, 3500);
    const view = await page.snapshot();
    record(12, `간편 화면 ${width}×${height}`, view?.overflow === false, view?.overflow ? '가로 넘침' : '정상');
  }
} catch (error) {
  say('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
say('내려받은 파일:', fs.readdirSync(downloads).join(', ') || '없음');
say(failures ? `\n실패 ${failures}건` : '\n간편 흐름 완주');
process.exit(0);
