// 운영 화면에서 파일을 실제로 첨부해 본다.
// PDF·DOCX·TXT·HWPX·HWP와, 빈·손상·스캔 파일의 안내까지 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const dir = path.join(process.env.TEMP || '/tmp', 'ms12-files');
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };

// [파일, 성공해야 하는가, 안내에 들어가야 하는 말]
const CASES = [
  ['sample.pdf', true, ''],
  ['sample.docx', true, ''],
  ['sample.txt', true, ''],
  ['sample.hwpx', true, ''],
  ['official.hwp', true, ''],
  ['empty.txt', false, '빈 문서'],
  ['broken.docx', false, '손상'],
  ['scanned.pdf', false, '스캔']
];

const chrome = launch(scratch('files'), 9380);
const page = await attach(9380);

try {
  await page.size(1280, 800);
  await page.go(SITE, 4000);
  await page.click('[data-landing="login"]', 2000);
  await page.fill('#login-email', account.email, 300);
  await page.fill('#login-password', account.password, 300);
  await page.run("(() => { document.querySelector('#login-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1200);
  record(0, '로그인', await page.waitFor("!document.querySelector('#login-form')", 40000, 1500));

  // 계획서 검증·코칭 화면으로 간다.
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool='coaching'; s.homeSeen=true; s.portal='proposal'; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 5000);
  const screen = await page.run("(() => JSON.stringify({ input: !!document.querySelector('#coaching-file'), accept: document.querySelector('#coaching-file')?.accept || '' }))()");
  record(0, '검증·코칭 화면 진입', screen?.input === true, `허용 형식 ${screen?.accept}`);

  const { root } = await page.send('DOM.getDocument');
  for (const [name, shouldWork, needle] of CASES) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) { record(0, `${name}`, false, '시험파일 없음'); continue; }
    // 화면을 매번 새로 그려 이전 결과가 섞이지 않게 한다.
    await page.go(SITE, 3500);
    const found = await page.send('DOM.querySelector', { nodeId: (await page.send('DOM.getDocument')).result.root.nodeId, selector: '#coaching-file' });
    const nodeId = found.result?.nodeId;
    if (!nodeId) { record(0, name, false, '첨부 칸을 찾지 못함'); continue; }
    await page.send('DOM.setFileInputFiles', { files: [file], nodeId });
    // 파서를 내려받고 읽는 시간을 준다.
    await new Promise(resolve => setTimeout(resolve, 12000));
    const result = await page.run(`(() => {
      const s = JSON.parse(localStorage.getItem('ms12_project_v3') || '{}');
      return JSON.stringify({
        text: (s.coaching?.text || '').length,
        notice: (document.querySelector('.alert.success')?.textContent || '').trim().slice(0, 80),
        error: (document.querySelector('.alert.danger')?.textContent || '').trim().slice(0, 100)
      });
    })()`);
    const ok = shouldWork
      ? Number(result?.text || 0) > 10 && !result?.error
      : Boolean(result?.error) && String(result?.error).includes(needle);
    record(0, `${name.padEnd(14)} ${shouldWork ? '읽기' : '거절 안내'}`, ok,
      shouldWork ? `${result?.text}자` : String(result?.error || result?.notice || '안내 없음').slice(0, 60));
    // 다음 시험을 위해 비운다.
    await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.coaching = { ...(s.coaching||{}), text: '' }; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  }
  void root;
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
console.log(failures ? `\n실패 ${failures}건` : '\n모든 형식 확인 완료');
process.exit(0);
