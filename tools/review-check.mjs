// 검증 결과 화면을 실제 브라우저에서 확인한다.
// 실제 AI 검증을 한 번 돌리고, 총론이 먼저 보이는지·각론이 접혀 있는지·상태가 유지되는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, attach, launch, scratch, step } from './e2e-lib.mjs';

const account = JSON.parse(fs.readFileSync(scratch('account.json'), 'utf8'));
const shots = scratch('review-shots');
fs.mkdirSync(shots, { recursive: true });
let failures = 0;
const record = (...args) => { if (!step(...args)) failures += 1; };

// 사용자가 보여 준 사례와 같은 결함을 심어 둔 짧은 계획서.
const PLAN = `2026년 지역아동센터 방과후 돌봄 지원사업 계획서

1. 사업 개요
본 사업은 2027년 복권기금 취약계층 아동·청소년 가족기능강화사업으로 신청한다.
표지에는 2026년으로 적었으나 본문은 2027년 사업이다.

2. 사업 목표
연 30명의 초등 저학년 아동에게 학습·정서 지원을 제공한다.

3. 세부 활동
주 2회 학습지도와 주 1회 정서프로그램을 운영하며, 참여 아동은 45명으로 편성한다.
담당 인력은 사회복지사 2명과 자원봉사자로 구성하고

4. 예산
총 사업비 12,000,000원이며 인건비는 참여 아동 45명 기준으로 산출하였다.

5. 성과지표
프로그램 만족도와 학습 태도 변화를 측정한다.`;

const chrome = launch(scratch('review'), 9480);
const page = await attach(9480);
async function shot(name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });
  if (result?.result?.data) fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.result.data, 'base64'));
}
const look = () => page.run(`(() => {
  const text = document.body.innerText || '';
  const overview = document.querySelector('#coaching-overview');
  const panels = [...document.querySelectorAll('[data-review-panel]')];
  return JSON.stringify({
    overview: Boolean(overview),
    overviewFirst: overview ? overview.getBoundingClientRect().top < (document.querySelector('#result-coaching')?.getBoundingClientRect().top ?? 99999) : false,
    detail: Boolean(document.querySelector('#result-coaching')),
    panels: panels.map(el => ({ key: el.dataset.reviewPanel, open: el.open, title: (el.querySelector('summary')?.textContent || '').trim().slice(0, 46) })),
    strengths: /잘된 점/.test(text),
    topIssues: [...document.querySelectorAll('#coaching-overview .requirement strong')].map(el => el.textContent.trim()).slice(0, 5),
    officialLimit: /공식 평가표 없음|공식 평가표를 받지 못해/.test(text),
    noScore: !/합격\\s*확률\\s*\\d|점수\\s*\\d+점/.test(text),
    fixButton: Boolean(document.querySelector('#coaching-fix-first')),
    detailButton: (document.querySelector('#coaching-detail-toggle')?.textContent || '').trim(),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    pageHeight: document.documentElement.scrollHeight,
    blocks: [...document.querySelectorAll('#app .card, #app section.card, #app .review-panel')].map(el => ({ id: el.id || (el.querySelector('h3,h4,summary')?.textContent || '').trim().slice(0, 24), h: Math.round(el.getBoundingClientRect().height) })).filter(item => item.h > 300)
  });
})()`);

try {
  await page.size(1280, 800);
  await page.go(SITE, 2500);
  await page.run("(() => { localStorage.clear(); sessionStorage.clear(); return '1'; })()");
  await page.go(SITE, 3000);
  await page.click('[data-landing="login"]', 1800);
  await page.fill('#login-email', account.email, 250);
  await page.fill('#login-password', account.password, 250);
  await page.run("(() => { document.querySelector('#login-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return '1'; })()", 1500);
  await page.waitFor("!document.querySelector('#login-form')", 40000, 1200);
  await page.run("(() => { const s = JSON.parse(localStorage.getItem('ms12_project_v3')||'{}'); s.activeTool='coaching'; s.expertDetail=true; localStorage.setItem('ms12_project_v3', JSON.stringify(s)); return '1'; })()");
  await page.go(SITE, 4000);

  await page.fill('#coaching-title', '검증 화면 확인용 계획서', 300);
  await page.fill('#coaching-text', PLAN, 500);
  const started = Date.now();
  await page.click('#run-coaching', 4000);
  const done = await page.waitFor("!!document.querySelector('#coaching-overview')", 420000, 6000);
  if (!done) {
    const why = await page.run("(() => JSON.stringify({ err: (document.querySelector('.alert.danger')?.textContent||'').trim().slice(0,160), warn: (document.querySelector('.alert.warning')?.textContent||'').trim().slice(0,120), busy: (document.querySelector('.busy strong')?.textContent||'').trim().slice(0,60), hasResult: !!document.querySelector('#result-coaching') }))()");
    console.log('   상태:', JSON.stringify(why));
  }
  record(1, '검증 실행', done, `${Math.round((Date.now() - started) / 1000)}초`);

  const first = await look();
  await shot('overview-1280');
  console.log('   큰 구역:', JSON.stringify((first?.blocks || []).slice(0, 8)));
  record(1.5, '첫 화면 길이', Number(first?.pageHeight || 0) < 6000, `총론만 ${first?.pageHeight}px`);
  record(2, '첫 화면에 종합소견서가 먼저 나온다', first?.overview === true && first?.strengths === true, `잘된 점 ${first?.strengths}`);
  record(3, '각론은 요청 전까지 접혀 있다', first?.detail === false, `각론 표시 ${first?.detail}`);
  record(4, '핵심 문제를 바로 볼 수 있다', (first?.topIssues || []).length > 0, (first?.topIssues || []).join(' · ').slice(0, 90));
  record(5, '공식 평가기준이 없다는 한계를 적는다', first?.officialLimit === true, `표시 ${first?.officialLimit}`);
  record(6, '점수·합격확률을 만들지 않는다', first?.noScore === true, `없음 ${first?.noScore}`);
  record(7, '두 버튼이 있다', first?.fixButton === true && /세부 검증 결과 보기/.test(first?.detailButton || ''), first?.detailButton);

  // 각론 펼치기.
  await page.click('#coaching-detail-toggle', 2500);
  const opened = await look();
  await shot('detail-1280');
  const collapsed = (opened?.panels || []).filter(item => !item.open).length;
  record(8, '각론 여섯 영역이 접힌 채로 나온다', (opened?.panels || []).length === 6 && collapsed === 6,
    (opened?.panels || []).map(item => item.title).join(' | ').slice(0, 150));
  record(9, '총론은 각론을 열어도 남는다', opened?.overview === true && opened?.overviewFirst === true, `총론 ${opened?.overview} · 먼저 ${opened?.overviewFirst}`);

  // 모두 펼치기 → 접기.
  await page.click('#coaching-expand-all', 2000);
  const all = await look();
  record(10, '모두 펼치기', (all?.panels || []).every(item => item.open), `${(all?.panels || []).filter(item => item.open).length}/6`);
  await page.click('#coaching-collapse-all', 2000);
  const none = await look();
  record(11, '모두 접기', (none?.panels || []).every(item => !item.open), `${(none?.panels || []).filter(item => item.open).length}/6`);

  // 우선 문제부터 수정하기.
  await page.click('#coaching-detail-toggle', 1500);
  await page.click('#coaching-fix-first', 2500);
  const focus = await look();
  const work = (focus?.panels || []).find(item => item.key === 'work');
  record(12, '우선 문제부터 수정 진입', Boolean(work?.open), work ? `개선 작업판 열림 · ${work.title}` : '작업판 없음');

  // 총론↔각론 왕복 뒤에도 펼친 상태가 남는지.
  await page.click('#coaching-detail-toggle', 1500);
  await page.click('#coaching-detail-toggle', 2000);
  const again = await look();
  const workAgain = (again?.panels || []).find(item => item.key === 'work');
  record(13, '왕복해도 펼친 영역이 남는다', Boolean(workAgain?.open), `개선 작업판 ${workAgain?.open}`);

  // 새로고침 뒤에도 검증 결과와 상태가 남는지.
  await page.go(SITE, 4000);
  const restored = await look();
  record(14, '새로고침 뒤 검증 결과 유지', restored?.overview === true, `총론 ${restored?.overview} · 각론 ${restored?.detail}`);

  for (const [width, height] of [[1280, 800], [768, 1024], [360, 640]]) {
    await page.size(width, height);
    await page.go(SITE, 3000);
    const view = await look();
    await shot(`size-${width}`);
    record(15, `${width}×${height}`, view?.overflow === false, `가로넘침 ${view?.overflow} · 세로 ${view?.pageHeight}px`);
  }
} catch (error) {
  console.log('중단:', String(error?.message || error).slice(0, 200));
  failures += 1;
} finally {
  page.close();
  chrome.kill();
}
console.log(failures ? `\n실패 ${failures}건` : '\n검증 화면 확인 통과');
process.exit(0);
