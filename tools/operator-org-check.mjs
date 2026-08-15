// 운영관리자 권한 실측. 추가·중지·복원은 되고 보관은 막히는지, 화면과 서버 양쪽에서 본다.
// 시험 계정으로만 돌린다. 만든 시험 기관은 끝에 일시중지로 되돌린다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = scratch('org-shots');
fs.mkdirSync(shots, { recursive: true });
const child = launch(scratch('op-profile'), 9362);
const page = await attach(9362);
const results = [];
const note = (what, ok, detail = '') => { results.push({ what, ok, detail }); console.log(`${ok ? '통과' : '실패'} | ${what}${detail ? ' — ' + detail : ''}`); };

await page.go(SITE, 2500);
await page.run("(async () => { await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) }).catch(()=>{}); return '1'; })()", 800);
await page.go(SITE, 3000);
await page.click('[data-landing="login"]', 1500);
await page.fill('#login-email', account.email, 250);
await page.fill('#login-password', account.password, 250);
await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
console.log('로그인', await page.waitFor("!document.querySelector('#login-form')", 40000, 1200));

const call = body => page.run(`(async () => { const r = await fetch('/api/operator', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify(${JSON.stringify(body)}) }); const d = await r.json().catch(()=>({})); return JSON.stringify({ status: r.status, error: (d.error||'').slice(0,40), id: d.org?.id || '', status2: d.org?.status || '', canArchive: d.canArchive }); })()`, 500);

// 화면: 운영관리자 → 공고 출처·기관 관리
await page.run("(() => { const el = [...document.querySelectorAll('button')].find(i => (i.textContent||'').includes('관리자 포털')); if (el) el.click(); return '1'; })()", 2500);
await page.run("(() => { const el = document.querySelector('[data-operator-tab=\"orgs\"]'); if (el) el.click(); return '1'; })()", 2500);
const screen = await page.run("(() => JSON.stringify({ rows: document.querySelectorAll('[data-org-edit]').length, archiveButtons: document.querySelectorAll('[data-org-status=\"archived\"]').length, note: (document.body.textContent||'').includes('보관(제거)은 최고관리자만') }))()");
note('운영관리자 화면에 관리 탭이 열린다', Number(screen?.rows) > 0, `목록 ${screen?.rows}곳`);
note('보관(제거) 단추가 보이지 않는다', Number(screen?.archiveButtons) === 0);
note('왜 안 보이는지 화면이 말한다', Boolean(screen?.note));
const shot = await page.send('Page.captureScreenshot', { format: 'png' });
if (shot?.result?.data) fs.writeFileSync(path.join(shots, 'operator-manage.png'), Buffer.from(shot.result.data, 'base64'));

// 서버: 추가·중지·복원은 되고 보관은 403
const mark = `E2E-TEST 운영시험 ${Date.now().toString(36)}`;
const added = await call({ action: 'saveNoticeOrg', name: mark, category: 'E2E', sortOrder: 950 });
note('운영관리자: 기관 추가', added?.status === 200, JSON.stringify(added));
const id = added?.id || '';
const paused = await call({ action: 'setNoticeOrgStatus', id, status: 'paused' });
note('운영관리자: 일시중지', paused?.status === 200 && paused?.status2 === 'paused');
const restored = await call({ action: 'setNoticeOrgStatus', id, status: 'active' });
note('운영관리자: 복원', restored?.status === 200 && restored?.status2 === 'active');
const archived = await call({ action: 'setNoticeOrgStatus', id, status: 'archived' });
note('운영관리자: 보관은 막힌다', archived?.status === 403, JSON.stringify(archived));
const builtin = await call({ action: 'setNoticeOrgStatus', id: 'chest', status: 'archived' });
note('운영관리자: 기존 기관 보관도 막힌다', builtin?.status === 403, JSON.stringify(builtin));

// 뒷정리: 시험 기관은 일시중지로 내려 둔다(지우지 않는다).
await call({ action: 'setNoticeOrgStatus', id, status: 'paused' });
fs.writeFileSync(path.join(shots, 'operator-check.json'), JSON.stringify({ id, mark, results }, null, 1));
console.log('실패', results.filter(item => !item.ok).length, '건 · 시험기관', id);
child.kill();
process.exit(0);
