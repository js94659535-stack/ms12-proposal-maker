// 기관정보 기본·상세 2단계 확인.
// 기본정보만 저장하고 계획서를 만들 수 있는지, 상세정보를 나중에 넣어 다음 계획서에서 다시 쓰는지,
// 상세정보가 비어도 흐름이 막히지 않는지, 일반회원과 에이전트의 기관정보가 섞이지 않는지,
// 좁은 화면에서 안내문·입력칸·버튼이 잘리지 않는지를 실제 브라우저로 확인한다.
//
// 기존 기관정보와 계획서는 건드리지 않는다. 이 도구가 만든 E2E-ORG 자료만 끝에 지운다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const MARK = 'E2E-ORG';
const { customer, agency } = JSON.parse(fs.readFileSync(scratch('orginfo-accounts.json'), 'utf8'));
const shots = scratch('orginfo-shots');
fs.mkdirSync(shots, { recursive: true });

let failures = 0;
const results = [];
const record = (no, label, ok, detail = '') => { results.push({ no, label, ok, detail }); if (!step(no, label, ok, detail)) failures += 1; };
// 확인하지 못한 것은 성공으로도 실패로도 적지 않는다. 무엇을 못 봤는지 그대로 남긴다.
const unknown = (no, label, why) => { results.push({ no, label, ok: null, detail: why }); console.log(`${String(no).padStart(2)} 미확인  ${label} — ${why}`); };

// 전체 이용권이 없는 시험계정으로 화면만 확인할 때 쓴다.
// 서버 권한은 그대로 두고 브라우저가 받은 회원 정보만 바꾼다. 실제 차단은 서버가 계속 한다.
const PLAN_VIEW = process.env.PLAN_VIEW === '1';
const PLAN_VIEW_SOURCE = `(() => {
  const orig = window.fetch;
  window.fetch = async (...args) => {
    const res = await orig(...args);
    const url = String(args[0]?.url || args[0] || '');
    // 회원 정보를 돌려주는 두 곳을 모두 고친다. 계정 조회가 뒤에 와서 값을 되돌리기 때문이다.
    if (!url.includes('/api/auth') && !url.includes('/api/account')) return res;
    try {
      const data = await res.clone().json();
      if (data?.user) { data.user.plan = 'full'; return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } }); }
    } catch { /* 그대로 */ }
    return res;
  };
})()`;

const chrome = launch(scratch('orginfo'), 9520);
const page = await attach(9520);
async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}
const read = keys => page.run(`(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ ${keys} }); })()`);

async function signIn(account) {
  await page.go(SITE, 3000);
  // 앞사람 세션이 남아 있으면 로그인 화면이 아예 나오지 않는다. 먼저 확실히 나간다.
  await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
  // 작성 상태만 비운다. 자료보관함 복구키를 지우면 서버에 저장한 기관정보를 다시 찾지 못한다.
  await page.run("(() => { localStorage.removeItem('ms12_project_v3'); sessionStorage.clear(); return '1'; })()");
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 1500);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  const ok = await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
  // 처음 화면 안내를 건너뛴다. 이 시험은 기관정보 화면을 보려는 것이다.
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.homeSeen = true; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 3000);
  return ok;
}

const orgName = `${MARK} 물망초지역아동센터`;

try {
  await page.send('DOM.enable', {});
  if (PLAN_VIEW) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: PLAN_VIEW_SOURCE });
  await page.size(1280, 900);
  record(1, '일반회원 로그인', await signIn(customer), customer.email);

  // ---------- 1. 첫 화면 안내 배너 ----------
  const banner = await page.run(`(() => {
    const el = [...document.querySelectorAll('.alert')].find(item => (item.textContent || '').includes('기관정보를 한 번 등록해 두면'));
    return JSON.stringify({ found: !!el, button: !!el?.querySelector('[data-open-applicants]'), text: (el?.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 90) });
  })()`);
  record(2, '첫 화면에 기관정보 안내 배너가 있다', banner?.found === true && banner?.button === true, banner?.text || '');
  await shot('01-first-banner');

  const opened = await page.run("(() => { const el = document.querySelector('[data-open-applicants]'); if (!el) return JSON.stringify({ ok: false }); el.click(); return JSON.stringify({ ok: true }); })()", 2500);
  const orgPage = await page.run(`(() => JSON.stringify({
    heading: (document.querySelector('h2')?.textContent || '').trim().slice(0, 20),
    basic: !!document.querySelector('#save-basic-info'),
    detail: !!document.querySelector('#applicant-detail'),
    pages: [...document.querySelectorAll('h2')].map(el => (el.textContent || '').trim()).slice(0, 4)
  }))()`);
  record(3, '배너 버튼이 기존 기관정보 페이지를 연다', opened?.ok === true && orgPage?.heading.includes('기관'), `${orgPage?.heading} · 페이지 ${(orgPage?.pages || []).join('/')}`);

  const beforeOrgs = await read("n: (s.applicants||[]).length");

  // ---------- 2. 기본정보만 입력하고 저장 ----------
  await page.fill('#applicant-name-draft', orgName, 400);
  await page.click('#add-applicant', 2500);
  const basicForm = await page.run(`(() => JSON.stringify({
    name: document.querySelector('#applicant-name')?.value || '',
    fields: [...document.querySelectorAll('[data-quick-field]')].map(el => el.dataset.quickField),
    stage: (document.querySelector('#applicant-editor h3')?.textContent || '').trim().slice(0, 24)
  }))()`);
  record(4, '기본정보 단계가 최소 항목만 받는다', basicForm?.stage.startsWith('1단계 기본정보') && (basicForm?.fields || []).length <= 4,
    `${basicForm?.stage} · 칸 ${(basicForm?.fields || []).join(',')}`);

  await page.fill('#quick-orgType', '지역아동센터', 400);
  await page.fill('#quick-contact', '김담당 010-0000-0000', 500);
  await page.click('#save-basic-info', 3500);
  const saved = await read("org: (s.applicants||[]).find(a => a.name.includes('E2E-ORG')) ? 1 : 0, items: ((s.applicants||[]).find(a => a.name.includes('E2E-ORG'))?.items||[]).length");
  const savedBadge = await page.run("(() => JSON.stringify({ badge: (document.querySelector('#applicant-editor .status')?.textContent||'').trim(), notice: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0,60) }))()");
  record(5, '기본정보만 저장된다', Number(saved?.org) === 1 && Number(saved?.items) >= 2, `항목 ${saved?.items}건 · ${savedBadge?.badge} · ${savedBadge?.notice}`);
  await shot('02-basic-saved');

  // ---------- 3. 상세정보는 접혀 있고 선택이다 ----------
  const detail = await page.run(`(() => {
    const card = document.querySelector('#applicant-detail');
    const groups = [...card.querySelectorAll('[data-detail-group]')];
    return JSON.stringify({
      intro: (card.querySelector('.alert p')?.textContent || '').trim(),
      titles: groups.map(el => (el.querySelector('summary b')?.textContent || '').trim()),
      open: groups.filter(el => el.open).length,
      badges: [...card.querySelectorAll('.stat-badge span')].map(el => el.textContent.trim())
    });
  })()`);
  const wanted = ['이용자', '인력', '실적', '시설', '프로그램', '협력기관', '성과자료', '예산정보'];
  record(6, '상세정보 여덟 구역이 모두 접혀 있다', JSON.stringify(detail?.titles) === JSON.stringify(wanted) && detail?.open === 0,
    `구역 ${(detail?.titles || []).join('·')} · 펼침 ${detail?.open}`);
  record(7, '상세정보 안내 문구를 그대로 띄운다',
    detail?.intro === '인력·사업실적·시설·보유 프로그램 등의 상세정보를 등록하면 AI가 기관의 실제 역량을 계획서에 반영할 수 있습니다. 반복 입력과 [확인 필요]가 줄어들며, 한 번 확인한 정보는 다음 계획서에서도 다시 사용할 수 있습니다.',
    (detail?.intro || '').slice(0, 40) + '…');
  await shot('03-detail-collapsed');

  // ---------- 4. 저장하고 바로 계획서 작성으로 ----------
  await page.click('#basic-to-writing', 3000);
  const toWriting = await page.run(`(() => JSON.stringify({
    heading: (document.querySelector('h2')?.textContent || '').trim().slice(0, 20),
    generate: !!document.querySelector('#simple-generate'),
    blocked: document.querySelector('#simple-generate')?.dataset?.blocked || ''
  }))()`);
  record(8, '기본정보 저장 후 바로 계획서 작성으로 간다', toWriting?.generate === true, `${toWriting?.heading} · 막힘 «${toWriting?.blocked || '없음'}»`);

  // ---------- 5. 상세정보가 비어도 계획서가 만들어진다 ----------
  await page.click('#simple-find', 3000);
  await page.click('#fetch-notices', 4000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 4000);
  await page.run("(() => { const el = document.querySelector('[data-view-notice]'); if (el) el.click(); return '1'; })()", 12000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.run("(() => { const el = document.querySelector('[data-select-notice]'); if (el) el.click(); return '1'; })()", 8000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.run("(() => { const el = document.querySelector('[data-select-subproject]'); if (el) el.click(); return '1'; })()", 6000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  const picked = await read("notice: (s.selectedNotice?.title||'').length, source: (s.sourceText||'').length");
  record(9, '공고를 골랐다', Number(picked?.notice || 0) > 0, `근거 ${picked?.source}자`);

  await page.go(SITE, 3500);
  await page.fill('#simple-idea', '방과후 돌봄이 끊긴 초등 저학년을 위해 주 2회 학습·정서 프로그램을 운영하고 싶습니다.', 800);
  const detailCount = await read("n: ((s.applicants||[]).find(a => a.name.includes('E2E-ORG'))?.items||[]).filter(i => !['basic','legal'].includes(i.area)).length");
  if (process.env.SKIP_AI === '1') {
    const gate = await page.run("(() => JSON.stringify({ blocked: document.querySelector('#simple-generate')?.dataset?.blocked || '', off: !!document.querySelector('#simple-generate')?.disabled }))()");
    unknown(10, '상세정보가 비어 있어도 계획서가 만들어진다',
      `AI 생성을 부르지 않았다(SKIP_AI). 상세정보 ${detailCount?.n}건 · 생성 단추 막힘 «${gate?.blocked || '없음'}» · 비활성 ${gate?.off}`);
  } else {
  const started = Date.now();
  await page.click('#simple-generate', 2000);
  const finished = await page.waitFor("!document.querySelector('.busy')", 900000, 5000);
  const madeIt = await read("n: (s.sections||[]).length, chars: (s.sections||[]).reduce((sum, x) => sum + (x.content||'').length, 0)");
  const seconds = Math.round((Date.now() - started) / 1000);
  record(10, '상세정보가 비어 있어도 계획서가 만들어진다', finished && Number(madeIt?.n || 0) > 0,
    `상세정보 ${detailCount?.n}건 · 항목 ${madeIt?.n}개 · ${Number(madeIt?.chars || 0).toLocaleString('ko-KR')}자 · ${seconds}초`);
  await shot('04-generated-without-detail');
  }

  // ---------- 6. 상세정보는 나중에 추가한다 ----------
  await page.run("(() => { const el = document.querySelector('[data-open-applicants]'); if (el) el.click(); return '1'; })()", 2500);
  const openGroup = await page.run(`(() => {
    const el = document.querySelector('[data-detail-group="staff"]');
    if (!el) return JSON.stringify({ ok: false });
    el.open = true; el.dispatchEvent(new Event('toggle'));
    return JSON.stringify({ ok: true, others: [...document.querySelectorAll('[data-detail-group]')].filter(item => item.open).length });
  })()`, 1200);
  record(11, '필요한 구역만 펼친다', openGroup?.ok === true && openGroup?.others === 1, `펼친 구역 ${openGroup?.others}개`);

  await page.fill('#draft-label-staff', '사회복지사', 300);
  await page.fill('#draft-value-staff', '상근 2명(1급 1명, 2급 1명)', 300);
  await page.fill('#draft-source-staff', `${MARK} 확인 기록`, 300);
  await page.fill('#draft-status-staff', '확인됨', 400);
  await page.run("(() => { const el = document.querySelector('[data-add-applicant-item=\"staff\"]'); if (el) el.click(); return '1'; })()", 2500);
  const added = await read("items: ((s.applicants||[]).find(a => a.name.includes('E2E-ORG'))?.items||[]).filter(i => i.area === 'staff').length, ok: ((s.applicants||[]).find(a => a.name.includes('E2E-ORG'))?.items||[]).filter(i => i.area === 'staff' && i.status === '확인됨').length");
  record(12, '상세정보를 나중에 추가할 수 있다', Number(added?.items || 0) === 1 && Number(added?.ok || 0) === 1, `인력 ${added?.items}건(확인됨 ${added?.ok}건)`);
  await shot('05-detail-added');

  // 다시 접속해도 남아 있는지. 브라우저 상태가 아니라 서버 보관자료에서 온다.
  await page.go(SITE, 4000);
  const reloaded = await page.run(`(async () => {
    const r = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': localStorage.getItem('ms12_archive_key_v1') || '' }, body: JSON.stringify({ action: 'listApplicants' }) });
    const j = await r.json();
    const mine = (j.applicants || j.items || []).filter(item => String(item.name || '').includes('E2E-ORG'));
    return JSON.stringify({ status: r.status, n: mine.length, staff: (mine[0]?.items || []).filter(i => i.area === 'staff').length });
  })()`);
  if (reloaded?.status === 403) {
    unknown(13, '저장한 상세정보가 서버 보관자료에 남는다', '시험계정에 전체 이용권이 없어 서버 저장이 403으로 막혔다. 브라우저 상태까지만 확인함');
  } else {
    record(13, '저장한 상세정보가 서버 보관자료에 남는다', reloaded?.status === 200 && Number(reloaded?.n || 0) >= 1 && Number(reloaded?.staff || 0) >= 1,
      `HTTP ${reloaded?.status} · 기관 ${reloaded?.n}곳 · 인력 ${reloaded?.staff}건`);
  }

  // ---------- 7. 새 계획서에서 다시 쓴다 ----------
  // 작성 화면으로 나가서 본다. 기관정보 페이지에 머무르면 첫 화면 배너가 보이지 않는다.
  await page.click('#basic-to-writing', 3000);
  const reuse = await page.run(`(() => {
    const el = [...document.querySelectorAll('.alert')].find(item => (item.textContent || '').includes('기관정보를 한 번 등록해 두면'));
    return JSON.stringify({ text: (el?.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120) });
  })()`);
  const stateReuse = await read("sel: s.selectedApplicantId || '', confirmed: ((s.applicants||[]).find(a => a.id === s.selectedApplicantId)?.items||[]).filter(i => i.status === '확인됨').length");
  record(14, '새 계획서에서도 같은 기관정보를 다시 쓴다', Number(stateReuse?.confirmed || 0) >= 1 && (reuse?.text || '').includes('확인된 정보'),
    `확인된 정보 ${stateReuse?.confirmed}건 · 배너 «${(reuse?.text || '').slice(0, 60)}»`);

  // ---------- 8. 좁은 화면 ----------
  for (const [width, height, name] of [[360, 640, '모바일'], [768, 1024, '태블릿'], [1280, 900, '데스크톱']]) {
    await page.size(width, height);
    await page.go(SITE, 3000);
    await page.run("(() => { const el = document.querySelector('[data-open-applicants]'); if (el) el.click(); return '1'; })()", 2000);
    const layout = await page.run(`(() => {
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      const card = document.querySelector('#applicant-detail');
      const intro = card?.querySelector('.alert p');
      const cut = el => { if (!el) return true; const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.width < 40; };
      return JSON.stringify({
        overflow, intro: !!intro, introCut: cut(intro),
        saveCut: cut(document.querySelector('#save-basic-info')), writeCut: cut(document.querySelector('#basic-to-writing')),
        fieldCut: [...document.querySelectorAll('#applicant-editor input, #applicant-editor select')].some(cut)
      });
    })()`);
    await shot(`06-${width}x${height}`);
    record(15, `${name} ${width}×${height} 안내문·입력칸·버튼이 잘리지 않는다`,
      layout?.overflow === false && layout?.introCut === false && layout?.saveCut === false && layout?.writeCut === false && layout?.fieldCut === false,
      `가로넘침 ${layout?.overflow} · 안내문 ${layout?.introCut ? '잘림' : '보임'} · 버튼 ${layout?.saveCut || layout?.writeCut ? '잘림' : '보임'} · 입력칸 ${layout?.fieldCut ? '잘림' : '보임'}`);
  }
  await page.size(1280, 900);

  // ---------- 9. 에이전트와 섞이지 않는다 ----------
  const mineNames = await read("names: (s.applicants||[]).map(a => a.name)");
  record(16, '에이전트 로그인', await signIn(agency), agency.email);
  await page.run("(() => { const el = document.querySelector('[data-open-applicants]'); if (el) el.click(); return '1'; })()", 3000);
  const agencyView = await page.run(`(() => JSON.stringify({
    heading: (document.querySelector('h2')?.textContent || '').trim().slice(0, 20),
    names: [...document.querySelectorAll('.requirement strong')].map(el => (el.textContent || '').trim()).slice(0, 10)
  }))()`);
  const leaked = (agencyView?.names || []).filter(name => name.includes(MARK));
  record(17, '일반회원과 에이전트의 기관정보가 섞이지 않는다', agencyView?.heading.includes('고객 기관') && leaked.length === 0,
    `제목 «${agencyView?.heading}» · 에이전트 목록 ${(agencyView?.names || []).length}곳 · 일반회원 기관 노출 ${leaked.length}건`);
  await shot('07-agency-view');

  // ---------- 10. 시험자료 정리 ----------
  record(18, '일반회원 재로그인', await signIn(customer), customer.email);
  await page.run("(() => { const el = document.querySelector('[data-open-applicants]'); if (el) el.click(); return '1'; })()", 2500);
  // 브라우저 상태를 비우고 다시 들어오면 목록은 비어 있다. 보관함에서 불러온 뒤 지운다.
  await page.click('#load-applicants', 4000);
  const removed = await page.run(`(async () => {
    const ids = [...document.querySelectorAll('[data-delete-applicant]')]
      .filter(el => (el.closest('.requirement')?.textContent || '').includes('E2E-ORG'))
      .map(el => el.dataset.deleteApplicant);
    window.confirm = () => true;
    for (const id of ids) document.querySelector('[data-delete-applicant="' + id + '"]')?.click();
    return JSON.stringify({ n: ids.length });
  })()`, 3000);
  await page.go(SITE, 3000);
  const after = await page.run(`(async () => {
    const r = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': localStorage.getItem('ms12_archive_key_v1') || '' }, body: JSON.stringify({ action: 'listApplicants' }) });
    const j = await r.json();
    const list = j.applicants || j.items || [];
    return JSON.stringify({ n: list.length, left: list.filter(item => String(item.name || '').includes('E2E-ORG')).length });
  })()`);
  record(19, '시험 기관정보를 지우고 기존 자료는 그대로 둔다', Number(after?.left || 0) === 0,
    `지운 시험기관 ${removed?.n}곳 · 남은 기관 ${after?.n}곳 · 시험자료 잔여 ${after?.left}건 · 시작 전 ${beforeOrgs?.n}곳 (${(mineNames?.names || []).length}곳 확인)`);
} catch (error) {
  record(99, '중단', false, String(error.message).slice(0, 120));
} finally {
  fs.writeFileSync(scratch('orginfo-result.json'), JSON.stringify(results, null, 2));
  console.log(`\n실패 ${failures}건 · 결과 ${scratch('orginfo-result.json')} · 화면 ${shots}`);
  page.close();
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
