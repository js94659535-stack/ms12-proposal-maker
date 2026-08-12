// 6~19단계: 재로그인 → 공고 수집·검색 → 공고 선택 → 기관정보 → 사업 설계 →
// 실제 AI 생성 → 검토·진단 → 보관함 저장 → 새로고침·재로그인 복원 → 저장본 열기 → 출력.
// 운영 화면을 그대로 쓴다. 만드는 자료에는 E2E-TEST 표식을 붙인다.
import fs from 'node:fs';
import { MARK, SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const chrome = launch(scratch('profile2'), 9345);
const page = await attach(9345);
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };
const notes = [];

async function login() {
  await page.go(SITE, 4000);
  await page.click('[data-landing="login"]', 2000);
  await page.fill('#login-email', account.email, 400);
  await page.fill('#login-password', account.password, 400);
  // 폼 제출로 보낸다. 로그인 화면이 사라질 때까지 기다린다.
  await page.run("(() => { document.querySelector('#login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return '1'; })()", 1000);
  const gone = await page.waitFor("!document.querySelector('#login-form')", 40000, 1500);
  const me = await page.run(`(async () => {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'me' }) });
    const j = await r.json();
    return JSON.stringify({ status: r.status, state: j.user?.status || '', plan: j.user?.plan || '' });
  })()`);
  return { signedIn: gone && me?.status === 200, me };
}
try {
  await page.size(1280, 800);

  // 6. 회원으로 로그인
  const signedIn = await login();
  record(6, '시험계정 로그인', Boolean(signedIn?.signedIn));

  // 포털이 뜨면 계획서 포털을 고른다.
  await page.run("(() => { const el = [...document.querySelectorAll('button')].find(item => /계획서/.test(item.textContent||'')); if (el) el.click(); return '1'; })()", 2500);

  // 7. 최신 공고 1회 수집
  await page.run("(() => { localStorage.setItem('ms12_project_v3', JSON.stringify({ ...JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'), activeTool: '', step: 0, homeSeen: true, portal: 'proposal' })); return '1'; })()");
  await page.go(SITE, 4000);
  const fetched = await page.click('#fetch-notices', 30000);
  const afterFetch = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ got: (s.noticeResults||[]).length, notice: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0,60), err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,60) }); })()");
  const collected = /공고 d+건을 불러왔습니다/.test(String(afterFetch?.notice || ''));
  record(7, '최신 공고 1회 수집', collected, afterFetch?.notice || afterFetch?.err);

  // 8. 공고보관함 저장·검색·필터·상세
  const archive = await page.run(`(async () => {
    const call = (action, body = {}) => fetch('/api/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) }).then(r => r.json().then(j => ({ status: r.status, j })));
    const all = await call('searchNotices', { query: '', mode: 'broad' });
    const filtered = await call('searchNotices', { query: '', mode: 'broad', filters: { businessType: 'chest' } });
    const first = all.j?.notices?.[0];
    const detail = first ? await call('noticeDetail', { key: first.key }) : { status: 0 };
    return JSON.stringify({
      searchStatus: all.status, total: all.j?.total ?? (all.j?.notices||[]).length,
      filterStatus: filtered.status, filtered: (filtered.j?.notices||[]).length,
      detailStatus: detail.status, hasDetail: !!detail.j?.notice,
      facets: Object.keys(all.j?.facets || {})
    });
  })()`);
  record(8, '공고보관함 검색', archive?.searchStatus === 200 && Number(archive?.total || 0) > 0, `${archive?.total}건`);
  record(8, '수집 출처·사업유형 필터', archive?.filterStatus === 200 && (archive?.facets || []).includes('sourceGroup'), `면 ${(archive?.facets||[]).join(',')}`);
  record(8, '공고 상세 보기', archive?.detailStatus === 200 && archive?.hasDetail === true);

  // 9. 공고 1건 선택 후 진행
  const picked = await page.click('[data-select-notice="0"]', 3000)
    .then(result => result?.ok ? result : page.clickText('이 공고로 진행', 3000));
  const afterPick = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ step: s.step, title: (s.selectedNotice?.title||'').slice(0,10), has: !!s.selectedNotice }); })()");
  record(9, '공고 선택 후 다음 단계 이동', Boolean(afterPick?.has), `step=${afterPick?.step}`);

  // 10~11. 기관 간단정보 + 하고 싶은 사업
  await page.run(`(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool = 'applicants'; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()`);
  await page.go(SITE, 4000);
  await page.fill('#quick-orgName', `${MARK} 햇살지역아동센터`);
  await page.fill('#quick-orgType', '지역아동센터');
  await page.fill('#quick-contact', `${MARK} 김담당 010-0000-0000`);
  await page.fill('#quick-served', '광주 지역 초등 저학년 아동과 한부모가정');
  await page.fill('#quick-strength', '방과후 돌봄과 가족 상담 프로그램 운영 경험');
  await page.fill('#quick-idea', '방과후 돌봄이 끊긴 초등 저학년을 위해 주 2회 학습·정서 프로그램을 운영하고 싶습니다.');
  const savedOrg = await page.click('#quick-save', 4000);
  const orgState = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ orgs: (s.applicants||[]).length, items: (s.applicants?.[0]?.items||[]).length, selected: !!s.selectedApplicantId }); })()");
  record(10, '기관 간단정보 저장', Number(orgState?.orgs || 0) > 0 && Number(orgState?.items || 0) > 0 && orgState?.selected === true, `기관 ${orgState?.orgs}곳 · 항목 ${orgState?.items}개 · 선택 ${orgState?.selected}`);
  record(11, '하고 싶은 사업 입력', savedOrg?.ok === true);

  // 12~13. 분석 → 설계 → 승인
  await page.run(`(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool = ''; s.step = 3; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()`);
  await page.go(SITE, 4000);
  const design = await page.snapshot();
  record(12, '사업 설계 화면 도달', Boolean(design?.heading), design?.heading);

  // 설계 승인은 「의뢰 건」 화면에서 한다.
  await page.run(`(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool = 'engagement'; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()`);
  await page.go(SITE, 4000);
  await page.click('#design-request', 2200);
  await page.click('#design-review', 2200);
  const approved = await page.click('#design-approve', 2800);
  const approvalState = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ approvedAt: s.engagement?.design?.approvedAt || '', by: s.engagement?.design?.approvedBy || '' }); })()");
  record(13, '설계안 확인·승인', Boolean(approvalState?.approvedAt), approvalState?.approvedAt ? `승인 ${String(approvalState.approvedAt).slice(0,16)}` : String(approved?.ok));

  // 14. 실제 AI로 전체 계획서 생성 (3~5쪽으로 제한)
  await page.run(`(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool = ''; s.step = 4; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()`);
  await page.go(SITE, 4000);
  const genButton = await page.run("(() => { const el = document.querySelector('#generate-proposal') || document.querySelector('#generate-parts'); return JSON.stringify({ found: !!el, id: el?.id||'', off: !!el?.disabled, guide: el?.dataset?.blocked || '' }); })()");
  record(14, '전체 계획서 작성 버튼 사용 가능', genButton?.found === true && genButton?.off === false && !genButton?.guide, `${genButton?.id}${genButton?.guide ? ' · ' + genButton.guide.slice(0,40) : ''}`);
  const startedAt = Date.now();
  await page.click(genButton?.id ? `#${genButton.id}` : '#generate-proposal', 3000);
  const done = await page.waitFor("!document.querySelector('.busy') && (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length > 0", 720000, 6000);
  const generated = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ sections: (s.sections||[]).length, chars: (s.sections||[]).reduce((sum,x)=>sum+String(x.content||'').length,0), unknown: (s.sections||[]).filter(x=>/\\[확인 필요/.test(x.content||'')).length, err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,80) }); })()");
  record(14, '실제 AI로 계획서 생성', done && Number(generated?.sections || 0) > 0,
    `항목 ${generated?.sections}개 · ${generated?.chars}자 · [확인 필요] 포함 ${generated?.unknown}개 · ${Math.round((Date.now()-startedAt)/1000)}초${generated?.err ? ' · ' + generated.err : ''}`);
  notes.push(`생성 항목 ${generated?.sections} · 글자 ${generated?.chars}`);

  // 15. 검토·진단
  const review = await page.run(`(async () => {
    const res = await fetch('/api/proposal-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ping' }) }).catch(() => null);
    return JSON.stringify({ reachable: !!res, status: res?.status || 0 });
  })()`);
  const reviewUi = await page.run("(() => JSON.stringify({ panels: [...document.querySelectorAll('h3, h4')].map(el => (el.textContent||'').trim()).filter(t => /검토|진단|평가|사실/.test(t)).slice(0,5) }))()");
  record(15, '검토·진단 화면 노출', (reviewUi?.panels || []).length > 0, (reviewUi?.panels || []).join(' · '));

  // 16. 계획서보관함 저장
  const saved = await page.clickText('계획서보관함에 저장', 8000);
  const savedState = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ id: s.archiveProposalId || '', notice: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0,50) }); })()");
  record(16, '계획서보관함 저장', Boolean(savedState?.id), savedState?.id ? `id ${String(savedState.id).slice(0,8)}…` : savedState?.notice || String(saved?.ok));
  fs.writeFileSync(scratch('proposal.txt'), String(savedState?.id || ''));

  // 17. 새로고침 → 로그아웃 → 재로그인 후 복원
  await page.go(SITE, 4500);
  const afterReload = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ sections: (s.sections||[]).length, step: s.step }); })()");
  record(17, '새로고침 후 작업 복원', Number(afterReload?.sections || 0) > 0, `항목 ${afterReload?.sections}개`);
  await page.run("(() => { const el = document.querySelector('#sign-out'); if (el) el.click(); return '1'; })()", 3000);
  const back = await login();
  record(17, '로그아웃 후 재로그인', Boolean(back?.signedIn));
  const afterRelogin = await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ sections: (s.sections||[]).length }); })()");
  record(17, '재로그인 후 작업 이어가기', Number(afterRelogin?.sections || 0) > 0, `항목 ${afterRelogin?.sections}개`);

  // 18. 저장본 다시 열기
  const reopened = await page.run(`(async () => {
    const list = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': localStorage.getItem('ms12_archive_key') || '' }, body: JSON.stringify({ action: 'listProposals' }) }).then(r => r.json());
    const mine = (list.proposals || [])[0];
    if (!mine) return JSON.stringify({ found: false, count: (list.proposals||[]).length });
    const one = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': localStorage.getItem('ms12_archive_key') || '' }, body: JSON.stringify({ action: 'getProposal', id: mine.id }) }).then(r => r.json());
    return JSON.stringify({ found: true, count: (list.proposals||[]).length, id: mine.id, title: String(mine.title||'').slice(0,24), sections: (one.proposal?.snapshot?.sections||[]).length });
  })()`);
  record(18, '저장본 다시 열기', reopened?.found === true && Number(reopened?.sections || 0) > 0, `보관 ${reopened?.count}건 · 항목 ${reopened?.sections}개`);

  // 19. 출력
  const exported = await page.run(`(async () => {
    const before = document.querySelectorAll('a[download]').length;
    const el = [...document.querySelectorAll('button')].find(item => /DOCX/.test(item.textContent||''));
    if (!el) return JSON.stringify({ found: false });
    el.click();
    await new Promise(r => setTimeout(r, 6000));
    return JSON.stringify({ found: true, guide: el.dataset?.blocked || '', off: !!el.disabled, err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,60), notice: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0,60) });
  })()`);
  record(19, 'DOCX 출력 실행', exported?.found === true && !exported?.err, exported?.guide || exported?.notice || exported?.err || '');
  const pdf = await page.run(`(async () => {
    const el = [...document.querySelectorAll('button')].find(item => /PDF/.test(item.textContent||''));
    if (!el) return JSON.stringify({ found: false });
    el.click();
    await new Promise(r => setTimeout(r, 8000));
    return JSON.stringify({ found: true, guide: el.dataset?.blocked || '', err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,60) });
  })()`);
  record(19, 'PDF 출력 실행', pdf?.found === true && !pdf?.err, pdf?.guide || pdf?.err || '');

  // 세 크기에서 핵심 화면 확인
  for (const [width, height] of [[1280, 800], [768, 1024], [360, 640]]) {
    await page.size(width, height);
    await page.go(SITE, 3500);
    const view = await page.snapshot();
    record(19, `핵심 화면 ${width}×${height}`, view?.overflow === false, view?.overflow ? '가로 넘침' : '정상');
  }
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
console.log(notes.join(' | '));
console.log(failures ? `\n실패 ${failures}건` : '\n6~19단계 통과');
process.exit(failures ? 1 : 0);
