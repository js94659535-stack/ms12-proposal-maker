// 요청별 중복 토큰 측정. AI를 부르지 않는다.
//
// 하는 일: 실제 화면이 보내는 요청 본문을 그대로 받아(생성 응답만 가짜) 서버가 만드는 프롬프트를
// 똑같이 다시 만들어 놓고, 요청 사이에 글자 그대로 반복되는 덩어리가 얼마인지 센다.
// 품질에 영향을 주는 것은 손대지 않는다. 여기서는 재기만 한다.
import fs from 'node:fs';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';
import { SYSTEM_POLICY, taskSpecification } from '../functions/api/proposal.js';

const account = JSON.parse(fs.readFileSync(scratch('full-account.json'), 'utf8'));
const capturePath = scratch('token-dup-payloads.json');

// 실제 토큰과 글자 수의 비율. 앞선 두 번의 실제 실행 기록으로 맞춘다(입력 토큰 ÷ 프롬프트 글자).
// 값은 측정할 때마다 다시 계산해 출력한다.
const RATIO_NOTE = '실제 실행 기록으로 계산한 글자당 토큰 비율';

function captureRun() {
  const STUB = `(() => {
    const KEYS = ['necessity','purpose','goals','target','programs','schedule','roles','budget','indicators','outcomes'];
    const PLAN = [
      { id: 'section-1', title: '사업의 필요성 및 목적', sectionKeys: ['necessity','purpose'] },
      { id: 'section-2', title: '대상 및 성과목표', sectionKeys: ['target','goals'] },
      { id: 'section-3', title: '세부 내용 및 일정', sectionKeys: ['programs','schedule'] },
      { id: 'section-4', title: '수행체계', sectionKeys: ['roles'] },
      { id: 'section-5', title: '예산', sectionKeys: ['budget'] },
      { id: 'section-6', title: '성과지표와 기대효과', sectionKeys: ['indicators','outcomes'] }
    ];
    const DESIGN = {
      sponsorIntent: { coreProblem: '샘플', policyPurpose: '샘플', requiredTarget: '샘플', expectedChange: '샘플',
        selectionLogic: ['샘플'], mandatoryConditions: ['샘플'], budgetRestrictions: ['샘플'], evidence: ['공고 3쪽'] },
      projectDesign: { projectName: '측정용 사업', oneSentenceStrategy: '샘플', target: '초등 저학년', participantCount: '20명',
        projectPeriod: '2027.1~2027.12', coreIntervention: '샘플', changePath: ['샘플'],
        programs: [1,2,3].map(n => ({ name: '프로그램' + n, purpose: '샘플', activities: ['샘플'], sessions: '주 2회', duration: '12개월', participants: '20명', role: '샘플', outputs: ['샘플'], indicators: ['샘플'] })),
        roleStructure: ['샘플'], budgetStructure: ['인건비'], performanceIndicators: ['샘플'], risks: ['샘플'] },
      missingInformation: ['샘플 질문'], evidenceMap: [{ id: 'e1', claim: '샘플', evidence: '공고 원문', location: '3쪽' }],
      qualityCheck: { noticeAlignment: true, singleSubprogramOnly: true, logicConsistency: true, budgetConsistency: true, measurableOutcomes: true }
    };
    const LOGIC = { sponsorIntentAndSelectionPoints: ['샘플'], problem: '샘플', causes: ['샘플'], targetRationale: '샘플', coreStrategy: '샘플',
      differentiation: '샘플', executionMethods: ['샘플'], baselineValues: [{ item: '인원', value: '20명', evidenceId: 'e1' }],
      outputOutcomeMeasurementLinks: [{ output: '샘플', outcomeGoal: '샘플', indicator: '샘플', timing: '샘플', owner: '샘플' }],
      evaluationResponsePlan: [{ criterion: '샘플', response: '샘플', sectionKeys: ['necessity'], evidenceIds: ['e1'] }],
      claimEvidencePlan: [{ claim: '샘플', evidence: '공고 원문', location: '3쪽', evidenceId: 'e1' }] };
    window.__sent = [];
    const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const orig = window.fetch;
    window.fetch = async (...args) => {
      const url = String(args[0]?.url || args[0] || '');
      if (url.includes('/api/proposal')) {
        let body = {};
        try { body = JSON.parse(args[1]?.body || '{}'); } catch { /* 그대로 */ }
        window.__sent.push(body);
        await new Promise(resolve => setTimeout(resolve, 300));
        if (body.action === 'masterDesign') return json(DESIGN);
        if (body.action === 'masterPlan') return json({ masterLogic: LOGIC, sectionPlan: PLAN, masterStatus: 'MASTER_READY', submissionReady: false, warnings: [], officialConflicts: [], note: '측정용' });
        if (body.action === 'draftPart') {
          const group = body.payload?.group || {};
          return json({ sections: (group.sectionKeys || []).map(key => ({ id: key, title: '항목 ' + key, content: '측정용 본문입니다. '.repeat(30) })),
            continuityCheck: { masterAligned: true, applicationStructureAligned: true, terminologyConsistent: true, numericConsistent: true, noUnnecessaryRepetition: true, issues: [] },
            continuitySummary: { fixedTerms: ['샘플'], fixedValues: ['20명'], establishedDecisions: ['샘플'], nextHandoff: ['샘플'] } });
        }
        return json({ error: '측정용 미지원' });
      }
      if (url.includes('/api/auth') || url.includes('/api/account')) {
        const res = await orig(...args);
        try { const data = await res.clone().json(); if (data?.user) { data.user.plan = 'full'; return json(data); } } catch { /* 그대로 */ }
        return res;
      }
      return orig(...args);
    };
  })()`;
  return STUB;
}

let failures = 0;
const record = (no, label, ok, detail = '') => { if (!step(no, label, ok, detail)) failures += 1; };

const chrome = launch(scratch('tokendup'), 9600);
const page = await attach(9600);
try {
  await page.send('DOM.enable', {});
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: captureRun() });
  await page.size(1280, 900);

  await page.go(SITE, 2500);
  await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 1500);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  const signedIn = await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.homeSeen = true; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 3000);
  record(1, '로그인', signedIn, account.email);

  await page.fill('#quick-orgName', '측정용 물망초지역아동센터', 300);
  await page.fill('#quick-orgType', '지역아동센터', 300);
  await page.fill('#quick-contact', '김담당 010-0000-0000', 400);
  await page.click('#quick-save', 3000);

  await page.click('#simple-find', 3000);
  await page.click('#fetch-notices', 4000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 4000);
  await page.run("(() => { const el = document.querySelector('[data-view-notice]'); if (el) el.click(); return '1'; })()", 12000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.run("(() => { const el = document.querySelector('[data-select-notice]'); if (el) el.click(); return '1'; })()", 8000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.run("(() => { const el = document.querySelector('[data-select-subproject]'); if (el) el.click(); return '1'; })()", 6000);
  await page.waitFor("!document.querySelector('.busy')", 180000, 3000);
  await page.go(SITE, 3000);
  await page.fill('#simple-idea', '방과후 돌봄이 끊긴 초등 저학년을 위해 주 2회 학습·정서 프로그램을 운영하고 싶습니다.', 600);
  await page.click('#simple-generate', 1000);
  const done = await page.waitFor("!document.querySelector('.busy')", 180000, 1000);
  const sent = await page.run("(() => JSON.stringify({ list: window.__sent || [] }))()");
  record(2, '요청 본문을 모두 받았다', done && (sent?.list || []).length >= 8, `요청 ${(sent?.list || []).length}건`);
  fs.writeFileSync(capturePath, JSON.stringify(sent?.list || [], null, 1));
} catch (error) {
  record(99, '중단', false, String(error.message).slice(0, 140));
} finally {
  page.close();
  chrome.kill();
}

// ---------- 서버가 만드는 프롬프트를 그대로 다시 만들어 재 본다 ----------
const payloads = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
const prompts = payloads.map(body => {
  const spec = taskSpecification(body.action, body.payload);
  return { action: body.action, prompt: spec.prompt, schema: JSON.stringify(spec.schema).length };
});

// 요청 사이에 글자 그대로 반복되는 덩어리. 줄 단위로 본다(문단·태그 블록이 줄로 나뉜다).
const lineCount = new Map();
for (const item of prompts) {
  const seen = new Set();
  for (const line of item.prompt.split('\n')) {
    const key = line.trim();
    if (key.length < 40 || seen.has(key)) continue;
    seen.add(key);
    lineCount.set(key, (lineCount.get(key) || 0) + 1);
  }
}
const repeated = [...lineCount.entries()].filter(([, n]) => n > 1).sort((left, right) => (right[0].length * (right[1] - 1)) - (left[0].length * (left[1] - 1)));
const repeatedChars = repeated.reduce((sum, [line, n]) => sum + line.length * (n - 1), 0);
const policyChars = SYSTEM_POLICY.length * prompts.length;
const totalChars = prompts.reduce((sum, item) => sum + item.prompt.length, 0);
const schemaChars = prompts.reduce((sum, item) => sum + item.schema, 0);

const report = {
  requests: prompts.map(item => ({ action: item.action, promptChars: item.prompt.length, schemaChars: item.schema })),
  totalPromptChars: totalChars,
  systemPolicyCharsEveryCall: SYSTEM_POLICY.length,
  systemPolicyTotalChars: policyChars,
  systemPolicyRepeatChars: SYSTEM_POLICY.length * (prompts.length - 1),
  schemaTotalChars: schemaChars,
  repeatedLineChars: repeatedChars,
  topRepeated: repeated.slice(0, 12).map(([line, n]) => ({ n, chars: line.length, waste: line.length * (n - 1), text: line.slice(0, 70) }))
};
fs.writeFileSync(scratch('token-dup-report.json'), JSON.stringify(report, null, 2));
console.log('\n요청별 프롬프트 글자수');
for (const item of report.requests) console.log(`  ${item.action.padEnd(13)} ${item.promptChars.toLocaleString('ko-KR').padStart(8)}자 + 스키마 ${item.schemaChars.toLocaleString('ko-KR')}자`);
console.log(`\n합계 ${totalChars.toLocaleString('ko-KR')}자 · 스키마 ${schemaChars.toLocaleString('ko-KR')}자`);
console.log(`매 호출 붙는 공통 지시문 ${SYSTEM_POLICY.length.toLocaleString('ko-KR')}자 × ${prompts.length}회 = 반복분 ${report.systemPolicyRepeatChars.toLocaleString('ko-KR')}자`);
console.log(`요청 사이 글자 그대로 반복되는 줄 ${repeatedChars.toLocaleString('ko-KR')}자`);
console.log(`\n${RATIO_NOTE}은 실제 사용기록과 함께 계산한다.`);
console.log(`결과 ${scratch('token-dup-report.json')}`);
process.exit(failures ? 1 : 0);
