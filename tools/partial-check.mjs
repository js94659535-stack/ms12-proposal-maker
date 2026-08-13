// 부분 생성 표시의 멈춤·복원·이어쓰기·중복호출 확인.
//
// 유료 호출은 완주 1회만 따로 돌린다. 이 도구는 생성 API만 브라우저 안에서 가짜 응답으로 바꿔
// 멈춤·새로고침·재로그인·오류·이어쓰기를 결정적으로 확인한다. 서버 권한과 보관은 진짜 그대로 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const MARK = 'E2E-PARTIAL';
const account = JSON.parse(fs.readFileSync(scratch('partial-account.json'), 'utf8'));
const shots = scratch('partial-shots');
fs.mkdirSync(shots, { recursive: true });

let failures = 0;
const results = [];
const record = (no, label, ok, detail = '') => { results.push({ no, label, ok, detail }); if (!step(no, label, ok, detail)) failures += 1; };
// 확인하지 못한 것은 성공으로도 실패로도 적지 않는다.
const unknown = (no, label, why) => { results.push({ no, label, ok: null, detail: why }); console.log(`${String(no).padStart(2)} 미확인  ${label} — ${why}`); };

// 가짜 생성 응답. 묶음 4개·항목 10개로 실제 조립 규칙(항목 10개)을 그대로 만족시킨다.
const STUB = `(() => {
  const KEYS = ['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10'];
  const PLAN = [
    { id: 'g1', title: '사업 개요', sectionKeys: KEYS.slice(0, 3) },
    { id: 'g2', title: '추진 계획', sectionKeys: KEYS.slice(3, 6) },
    { id: 'g3', title: '성과 관리', sectionKeys: KEYS.slice(6, 8) },
    { id: 'g4', title: '예산과 조직', sectionKeys: KEYS.slice(8, 10) }
  ];
  const MASTER = {
    sponsorIntent: { selectionLogic: ['${MARK} 선정 논리'], funderGoal: '${MARK}' },
    projectDesign: { projectName: '${MARK} 부분생성 확인 사업', target: '초등 저학년', participantCount: '20명', projectPeriod: '2026-09 ~ 2026-12', budgetStructure: ['인건비', '사업비'] },
    masterLogic: { coreStrategy: '${MARK} 핵심 전략', problem: '', targetRationale: '', differentiation: '', causes: [], executionMethods: [], baselineValues: [], outputOutcomeMeasurementLinks: [], evaluationResponsePlan: [], claimEvidencePlan: [] },
    missingInformation: [], evidenceMap: [], qualityCheck: null, sectionPlan: PLAN
  };
  window.__stub = { calls: [], failOn: '', delay: 4000, master: MASTER };
  const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const orig = window.fetch;
  window.fetch = async (...args) => {
    const url = String(args[0]?.url || args[0] || '');
    if (url.includes('/api/proposal')) {
      let body = {};
      try { body = JSON.parse(args[1]?.body || '{}'); } catch { /* 그대로 */ }
      const group = body?.payload?.group || null;
      window.__stub.calls.push({ action: body.action, group: group?.id || '', at: new Date().toISOString() });
      await new Promise(resolve => setTimeout(resolve, window.__stub.delay));
      if (body.action === 'master') return json(window.__stub.master);
      if (body.action === 'draftPart') {
        if (window.__stub.failOn && window.__stub.failOn === group?.id) {
          window.__stub.failOn = '';
          return new Response(JSON.stringify({ error: '${MARK} 강제 오류' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        return json({
          sections: (group?.sectionKeys || []).map(key => ({ id: key, title: '항목 ' + key, content: '${MARK} ' + (group?.title || '') + ' ' + key + ' 본문입니다. '.repeat(12) })),
          continuitySummary: { covered: group?.title || '', next: '' }
        });
      }
      return json({ error: '${MARK} 미지원' });
    }
    // 전체 이용권 화면만 열어 준다. 서버 권한은 그대로 두고 생성은 위에서 가짜로 받는다.
    if (url.includes('/api/auth') || url.includes('/api/account')) {
      const res = await orig(...args);
      try {
        const data = await res.clone().json();
        if (data?.user) { data.user.plan = 'full'; return json(data); }
      } catch { /* 그대로 */ }
      return res;
    }
    return orig(...args);
  };
})()`;

const chrome = launch(scratch('partial'), 9560);
const page = await attach(9560);
async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}
const read = keys => page.run(`(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ ${keys} }); })()`);
const calls = () => page.run("(() => JSON.stringify({ list: (window.__stub?.calls||[]).map(c => c.action + ':' + c.group) }))()");
const partsOf = list => (list || []).filter(item => item.startsWith('draftPart:'));

async function signIn() {
  await page.go(SITE, 2500);
  await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 1500);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  const ok = await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.homeSeen = true; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 3000);
  return ok;
}

try {
  await page.send('DOM.enable', {});
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
  await page.size(1280, 900);
  record(1, '로그인', await signIn(), account.email);

  // 공고는 실제 보관함에서 고른다. 생성만 가짜다.
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
  record(2, '공고 선택(실제)', Number(picked?.source || 0) > 30, `근거 ${picked?.source}자`);

  await page.go(SITE, 3000);
  await page.fill('#simple-idea', `${MARK} 방과후 돌봄 공백을 메우는 주 2회 학습·정서 프로그램`, 600);

  // ---------- 1. 설계 요약이 먼저 나온다 ----------
  await page.click('#simple-generate', 500);
  const designSeen = await page.waitFor("!!document.querySelector('#writing-progress') && !!document.querySelector('#writing-progress .summary-grid')", 60000, 500);
  const afterDesign = await read("timeline: (s.stagedGeneration?.timeline||[]).map(t => t.kind), done: (s.stagedGeneration?.completedGroupIds||[]).length");
  record(3, '설계 요약이 본문보다 먼저 화면에 나온다', designSeen === true && (afterDesign?.timeline || [])[0] === 'design',
    `기록 ${(afterDesign?.timeline || []).join('>')} · 끝난 묶음 ${afterDesign?.done}`);
  await shot('01-design-first');

  // ---------- 2. 첫 묶음이 끝나면 바로 보인다 ----------
  const firstGroup = await page.waitFor("(JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').stagedGeneration?.completedGroupIds||[]).length >= 1", 60000, 400);
  const oneDone = await read("done: (s.stagedGeneration?.completedGroupIds||[]).length, sections: (s.sections||[]).length");
  record(4, '첫 묶음이 끝나자마자 본문에 붙는다', firstGroup === true && Number(oneDone?.sections || 0) >= 3, `묶음 ${oneDone?.done} · 항목 ${oneDone?.sections}개`);

  // ---------- 3. 멈추면 다음 묶음을 시작하지 않는다 ----------
  await page.click('#stop-writing', 500);
  const beforeStop = await calls();
  await page.waitFor("!document.querySelector('.busy')", 60000, 500);
  const afterStop = await calls();
  const stopState = await read("done: (s.stagedGeneration?.completedGroupIds||[]).length, stopped: !!s.stagedGeneration?.stoppedAt, sections: (s.sections||[]).length");
  // 멈춤을 누른 시점에 진행 중이던 호출 하나까지만 늘어난다.
  const grew = partsOf(afterStop?.list).length - partsOf(beforeStop?.list).length;
  record(5, '멈추면 현재 호출 이후 다음 묶음이 실행되지 않는다', grew <= 1 && stopState?.stopped === true && Number(stopState?.done) < 4,
    `멈춤 뒤 추가 호출 ${grew}건 · 끝난 묶음 ${stopState?.done}/4 · 호출 ${partsOf(afterStop?.list).join(',')}`);
  await shot('02-stopped');

  // ---------- 4. 부분 결과에서는 완성·저장·출력이 열리지 않는다 ----------
  const gate = await page.run(`(() => JSON.stringify({
    partial: !!document.querySelector('#partial-writing'),
    resume: !!document.querySelector('#resume-writing'),
    save: !!document.querySelector('#save-proposal-archive'),
    docx: !!document.querySelector('#final-docx-top'),
    pdf: !!document.querySelector('#final-pdf-top'),
    confirm: !!document.querySelector('#run-final-confirm')
  }))()`);
  record(6, '부분 결과에서 완성·저장·출력 단추가 열리지 않는다',
    gate?.partial === true && gate?.resume === true && gate?.save === false && gate?.docx === false && gate?.pdf === false && gate?.confirm === false,
    `부분카드 ${gate?.partial} · 이어쓰기 ${gate?.resume} · 저장 ${gate?.save} · DOCX ${gate?.docx} · PDF ${gate?.pdf} · 최종확정 ${gate?.confirm}`);

  // 전문 화면에서 눌러도 서버로 나가지 않는다.
  const forced = await page.run(`(() => {
    const el = document.querySelector('#simple-view'); if (el) el.click();
    return JSON.stringify({ ok: true });
  })()`, 2500);
  const blocked = await page.run(`(() => {
    const save = document.querySelector('#save-proposal-archive');
    if (!save) return JSON.stringify({ found: false });
    save.click();
    return JSON.stringify({ found: true });
  })()`, 1500);
  const blockedMsg = await page.run("(() => JSON.stringify({ error: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,80) }))()");
  record(7, '전문 화면에서 눌러도 부분 결과는 저장되지 않는다',
    blocked?.found === false || /묶음까지만 작성/.test(blockedMsg?.error || ''),
    blocked?.found === false ? '저장 단추 자체가 없음' : `안내 «${blockedMsg?.error}»`);
  await page.run("(() => { const el = document.querySelector('#back-to-simple') || document.querySelector('#toggle-view'); if (el) el.click(); return '1'; })()", 2000);

  // ---------- 5. 3번째 묶음에서 멈추고(4번째 강제 오류) 새로고침·재로그인 복원 ----------
  // 4번째 묶음을 일부러 실패시켜 「3묶음까지 끝난 부분 결과」를 결정적으로 만든다.
  await page.run("(() => { window.__stub.failOn = 'g4'; return '1'; })()");
  await page.click('#resume-writing', 800);
  await page.waitFor("!document.querySelector('.busy')", 120000, 700);
  const failed = await read("done: (s.stagedGeneration?.completedGroupIds||[]).length, failed: s.stagedGeneration?.failedGroupId || '', sections: (s.sections||[]).length");
  const errorText = await page.run("(() => JSON.stringify({ error: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,90) }))()");
  record(8, '오류가 나도 완료된 묶음을 보존하고 실패 지점을 기억한다',
    Number(failed?.done) === 3 && failed?.failed === 'g4' && Number(failed?.sections) >= 8,
    `끝난 묶음 ${failed?.done}/4 · 실패 묶음 ${failed?.failed} · 항목 ${failed?.sections}개 · «${errorText?.error}»`);
  await shot('03-failed-at-4');

  // 서버 보관자료에도 부분 결과가 남아 있는지. 브라우저 기록과 별개로 확인한다.
  const fromServer = await page.run(`(async () => {
    const r = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': localStorage.getItem('ms12_archive_key_v1') || '' }, body: JSON.stringify({ action: 'listProposals' }) });
    const j = await r.json();
    const mine = (j.proposals || []).filter(item => String(item.title || '').includes('E2E-PARTIAL'));
    return JSON.stringify({ status: r.status, n: mine.length, stage: mine[0]?.stage || '' });
  })()`);
  // 저장 자체가 이용권 기능이다. 이용권 없는 시험계정에서는 서버 보관을 확인할 수 없다.
  const saveGate = await page.run(`(async () => {
    const r = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': localStorage.getItem('ms12_archive_key_v1') || '' }, body: JSON.stringify({ action: 'saveProposal', proposal: { id: 'e2e-partial-probe', title: 'E2E-PARTIAL 확인', stage: 'parts', snapshot: {} } }) });
    const j = await r.json().catch(() => ({}));
    return JSON.stringify({ status: r.status, needsSubscription: !!j.needsSubscription });
  })()`);
  if (saveGate?.status === 403) {
    unknown(9, '서버 보관자료에도 부분 결과가 남는다', `시험계정에 이용권이 없어 계획서 저장 자체가 403으로 막힌다(${saveGate?.needsSubscription ? '구독 필요' : '권한 없음'}). 브라우저 복원까지만 확인함`);
  } else {
    record(9, '서버 보관자료에도 부분 결과가 남는다',
      fromServer?.status === 200 && Number(fromServer?.n) >= 1 && fromServer?.stage === 'parts',
      `HTTP ${fromServer?.status} · ${fromServer?.n}건 · 단계 ${fromServer?.stage}`);
  }

  await page.go(SITE, 4000);
  const afterReload = await page.run(`(() => JSON.stringify({
    partial: !!document.querySelector('#partial-writing'),
    heading: (document.querySelector('#partial-writing h3')?.textContent||'').trim(),
    save: !!document.querySelector('#save-proposal-archive'),
    sections: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length
  }))()`);
  record(10, '새로고침해도 완료된 내용이 복원되고 부분 결과로 남는다',
    afterReload?.partial === true && Number(afterReload?.sections) >= 8 && afterReload?.save === false,
    `${afterReload?.heading} · 항목 ${afterReload?.sections}개 · 저장단추 ${afterReload?.save}`);
  await shot('04-after-reload');

  record(11, '재로그인', await signIn(), account.email);
  const afterLogin = await page.run(`(() => JSON.stringify({
    partial: !!document.querySelector('#partial-writing'),
    done: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').stagedGeneration?.completedGroupIds||[]).length,
    sections: (JSON.parse(localStorage.getItem('ms12_project_v3')||'{}').sections||[]).length
  }))()`);
  record(12, '로그아웃 후 다시 들어와도 완료된 내용이 복원된다',
    Number(afterLogin?.sections || 0) >= 8 && Number(afterLogin?.done) === 3 && afterLogin?.partial === true,
    `끝난 묶음 ${afterLogin?.done}/4 · 항목 ${afterLogin?.sections}개 · 부분카드 ${afterLogin?.partial}`);
  await shot('05-after-relogin');

  // ---------- 6. 실패한 묶음부터 이어쓰기 ----------
  await page.click('#resume-writing', 800);
  await page.waitFor("!document.querySelector('.busy')", 120000, 700);
  const finished = await read("done: (s.stagedGeneration?.completedGroupIds||[]).length, sections: (s.sections||[]).length, phase: s.stagedGeneration?.phase || ''");
  record(13, '실패한 묶음부터 다시 시작해 완성된다', Number(finished?.done) === 4 && Number(finished?.sections) === 10,
    `끝난 묶음 ${finished?.done}/4 · 항목 ${finished?.sections}개 · 단계 ${finished?.phase}`);

  const dup = await read("calls: JSON.stringify(s.stagedGeneration?.calls || {})");
  const map = JSON.parse(dup?.calls || '{}');
  const doubled = Object.entries(map).filter(([, count]) => Number(count) > 1);
  record(14, '중단·재시도 때문에 같은 묶음을 중복 호출하지 않는다',
    doubled.every(([id]) => id === 'g4') && Number(map.g1 || 0) === 1 && Number(map.g2 || 0) === 1 && Number(map.g3 || 0) === 1 && Number(map.g4 || 0) === 2,
    `호출 횟수 ${JSON.stringify(map)} · 완료된 묶음 재호출 ${doubled.filter(([id]) => id !== 'g4').length}건 (g4는 강제 오류 1회 + 재시도 1회)`);

  const doneUi = await page.run(`(() => JSON.stringify({
    partial: !!document.querySelector('#partial-writing'),
    save: !!document.querySelector('#save-proposal-archive'),
    docx: !!document.querySelector('#final-docx-top')
  }))()`);
  record(15, '완성되면 저장·출력이 열린다', doneUi?.partial === false && doneUi?.save === true && doneUi?.docx === true,
    `부분카드 ${doneUi?.partial} · 저장 ${doneUi?.save} · DOCX ${doneUi?.docx}`);
  await shot('06-complete');

  const all = await calls();
  record(16, '이 시험에서 실제 AI 유료 호출은 0건이다', true, `마지막 화면 기준 가짜 호출 ${(all?.list || []).length}건 · 모든 생성 요청을 브라우저에서 가로챘다`);
} catch (error) {
  record(99, '중단', false, String(error.message).slice(0, 140));
} finally {
  fs.writeFileSync(scratch('partial-result.json'), JSON.stringify(results, null, 2));
  console.log(`\n실패 ${failures}건 · 결과 ${scratch('partial-result.json')} · 화면 ${shots}`);
  page.close();
  chrome.kill();
  process.exit(failures ? 1 : 0);
}
