// MS12-001 확인. 고르기(개별·다중·전체·해제·검색)와 관리(추가·중지·보관·복원)를 실제 화면에서 눌러 본다.
//
// 시험 계정으로만 한다. 만든 시험 기관은 마지막에 보관 처리해 목록에서 감춘다(지우지 않는다).
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = scratch('org-shots');
fs.mkdirSync(shots, { recursive: true });
const child = launch(scratch('org-profile'), 9359);
const page = await attach(9359);

const results = [];
const note = (what, ok, detail = '') => {
  results.push({ what, ok, detail });
  console.log(`${ok ? '통과' : '실패'} | ${what}${detail ? ' — ' + detail : ''}`);
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
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  return page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
}

const openPortal = label => page.run(`(() => { const el = [...document.querySelectorAll('button')].find(i => (i.textContent||'').includes(${JSON.stringify(label)})); if (!el) return '0'; el.click(); return '1'; })()`, 2500);
const openOrgMenu = () => page.run("(() => { const el = document.querySelector('[data-topmenu=\"orgs\"]'); if (!el) return JSON.stringify({ ok:false }); el.open = true; return JSON.stringify({ ok:true, label: (el.querySelector('.topmenu-label')?.textContent||'').trim() }); })()", 500);
const orgLabel = () => page.run("(() => JSON.stringify({ label: (document.querySelector('[data-topmenu=\"orgs\"] .topmenu-label')?.textContent||'').trim(), boxes: [...document.querySelectorAll('[data-org-pick]')].map(b => ({ id: b.dataset.orgPick, on: b.checked })) }))()");
const clickOrg = id => page.run(`(() => { const el = document.querySelector('[data-org-pick="${id}"]'); if (!el) return '0'; el.click(); return '1'; })()`, 1200);
const pressId = id => page.run(`(() => { const el = document.querySelector('${id}'); if (!el) return '0'; el.click(); return '1'; })()`, 1500);

console.log('로그인', await signIn());

// ---------- 고르기 ----------
await openPortal('계획서 포털');
await page.run("(() => { const el = document.querySelector('[data-home-start]'); if (el) el.click(); return '1'; })()", 2500);
let view = await openOrgMenu();
note('머리띠에 공고 출처·기관 메뉴가 있다', Boolean(view?.ok), view?.label || '');
await shot('1-scope-open');

await pressId('#org-scope-none');
await openOrgMenu();
note('전체 해제', (await orgLabel())?.label?.includes('선택 안 함'), (await orgLabel())?.label || '');

await clickOrg('chest');
await openOrgMenu();
let now = await orgLabel();
note('개별 선택(사랑의열매)', now?.label?.includes('사랑의열매'), now?.label || '');

await clickOrg('family');
await openOrgMenu();
now = await orgLabel();
note('여러 개 선택', /외 1곳/.test(now?.label || ''), now?.label || '');

await pressId('#org-scope-all');
await openOrgMenu();
now = await orgLabel();
note('전체 선택', /전체 \d+곳/.test(now?.label || ''), now?.label || '');

await page.fill('#org-scope-search', '가족', 800);
const found = await page.run("(() => JSON.stringify({ shown: [...document.querySelectorAll('.org-scope-item')].map(el => (el.textContent||'').trim().slice(0, 12)) }))()");
note('검색', (found?.shown || []).length === 1 && String(found.shown[0]).includes('가족'), JSON.stringify(found?.shown || []));
await shot('2-scope-search');

// ---------- 관리 ----------
await openPortal('관리자 포털');
await openPortal('운영관리자');
await page.run("(() => { const el = document.querySelector('[data-operator-tab=\"orgs\"]'); if (el) el.click(); return '1'; })()", 2500);
const listed = await page.run("(() => JSON.stringify({ rows: [...document.querySelectorAll('[data-org-edit]')].length, hasArchive: !!document.querySelector('[data-org-status=\"archived\"]') }))()");
note('공고 출처·기관 관리 화면', Number(listed?.rows) > 0, `목록 ${listed?.rows}곳 · 보관 단추 ${listed?.hasArchive ? '있음' : '없음'}`);
await shot('3-manage');

const mark = `E2E-TEST 시험기관 ${Date.now().toString(36)}`;
await page.fill('#org-name', mark, 300);
await page.fill('#org-category', 'E2E 분류', 300);
await page.fill('#org-order', '900', 300);
await pressId('#org-save');
await new Promise(resolve => setTimeout(resolve, 1500));
const added = await page.run(`(() => { const rows = [...document.querySelectorAll('.requirement')].map(el => (el.textContent||'').trim()); const hit = rows.find(text => text.includes(${JSON.stringify(mark)})); return JSON.stringify({ added: !!hit, manual: hit ? hit.includes('직접 업로드용') : false, notice: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0, 60) }); })()`);
note('기관 추가', Boolean(added?.added), added?.notice || '');
note('추가한 기관은 직접 업로드용으로 표시', Boolean(added?.manual));

// 방금 만든 기관의 id를 찾는다.
const newId = await page.run(`(() => { const el = [...document.querySelectorAll('[data-org-edit]')].find(item => (item.closest('.requirement')?.textContent||'').includes(${JSON.stringify(mark)})); return JSON.stringify({ id: el ? el.dataset.orgEdit : '' }); })()`);
const id = newId?.id || '';

// 고르는 목록에 바로 보이는지
await openPortal('계획서 포털');
await page.run("(() => { const el = document.querySelector('[data-home-start]'); if (el) el.click(); return '1'; })()", 2500);
await openOrgMenu();
const inPicker = await page.run(`(() => { const saved = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); return JSON.stringify({ found: !!document.querySelector('[data-org-pick="${id}"]'), cached: (saved.noticeOrgs||[]).length, boxes: [...document.querySelectorAll('[data-org-pick]')].length }); })()`);
note('추가한 기관이 고르는 목록에 바로 나온다', Boolean(inPicker?.found), `${id} · 저장된 목록 ${inPicker?.cached}곳 · 화면 ${inPicker?.boxes}칸`);

// 일시중지 → 고르는 목록에서 사라지는지
await openPortal('관리자 포털');
await openPortal('운영관리자');
await page.run("(() => { const el = document.querySelector('[data-operator-tab=\"orgs\"]'); if (el) el.click(); return '1'; })()", 2500);
await page.run(`(() => { const el = document.querySelector('[data-org-status="paused"][data-org-id="${id}"]'); if (!el) return '0'; el.click(); return '1'; })()`, 2000);
const paused = await page.run(`(() => { const text = [...document.querySelectorAll('.requirement')].map(el => (el.textContent||'').trim()).find(t => t.includes(${JSON.stringify(mark)})) || ''; return JSON.stringify({ paused: text.includes('일시중지'), keptName: text.includes(${JSON.stringify(mark)}) }); })()`);
note('일시중지', Boolean(paused?.paused));
note('일시중지해도 이름은 목록에 남는다', Boolean(paused?.keptName));

await openPortal('계획서 포털');
await page.run("(() => { const el = document.querySelector('[data-home-start]'); if (el) el.click(); return '1'; })()", 2500);
await openOrgMenu();
const gone = await page.run(`(() => JSON.stringify({ found: !!document.querySelector('[data-org-pick="${id}"]') }))()`);
note('일시중지한 기관은 새로 고를 수 없다', gone?.found === false);

// 복원 → 다시 고를 수 있는지
await openPortal('관리자 포털');
await openPortal('운영관리자');
await page.run("(() => { const el = document.querySelector('[data-operator-tab=\"orgs\"]'); if (el) el.click(); return '1'; })()", 2500);
await page.run(`(() => { const el = document.querySelector('[data-org-status="active"][data-org-id="${id}"]'); if (!el) return '0'; el.click(); return '1'; })()`, 2000);
const restored = await page.run(`(() => { const text = [...document.querySelectorAll('.requirement')].map(el => (el.textContent||'').trim()).find(t => t.includes(${JSON.stringify(mark)})) || ''; return JSON.stringify({ active: text.includes('이용 중') }); })()`);
note('복원', Boolean(restored?.active));

// 보관(최고관리자만) → 목록에서 상태만 바뀌는지
await page.run(`(() => { const el = document.querySelector('[data-org-status="archived"][data-org-id="${id}"]'); if (!el) return '0'; el.click(); return '1'; })()`, 2000);
const archived = await page.run(`(() => { const text = [...document.querySelectorAll('.requirement')].map(el => (el.textContent||'').trim()).find(t => t.includes(${JSON.stringify(mark)})) || ''; return JSON.stringify({ archived: text.includes('보관'), note: (document.querySelector('.alert.success')?.textContent||'').trim().slice(0, 70) }); })()`);
note('보관(제거)', Boolean(archived?.archived), archived?.note || '');
await shot('4-archived');

fs.writeFileSync(path.join(shots, 'org-check.json'), JSON.stringify({ id, mark, results }, null, 1));
console.log('실패', results.filter(item => !item.ok).length, '건 · 시험기관 id', id);
child.kill();
process.exit(0);
