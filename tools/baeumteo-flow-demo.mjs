// 배움터 계획서 플랫폼의 전체 흐름을 실제로 한 번 돌려 보여 주는 시연 (10-17).
//   ① 요구조건 추출 → ② 가상본 → ③ 기관 입력 → ④ 조합 재추천 → ⑤ 재설계 → ⑥ 출력
// 실행: node tools/baeumteo-flow-demo.mjs   (재단 사이트에서 양식·요강·FAQ를 실제로 내려받는다)
// 결과: reports/10-17-flow-demo.md 와 reports/10-17-flow-demo/ 폴더의 출력 파일(txt·html·hwpx).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readZipFiles, extractHwpxText } from '../src/files.js';
import { extractHwpDocument } from '../src/hwp-text.js';
import { zipBytes } from '../src/submission-zip.js';
import { handleNoticeRequest } from '../functions/api/notices.js';
import { extractFormItems, formItemSkeleton, formSources } from '../src/form-spec.js';
import { buildHwpxFiles } from '../src/hwpx-export.js';
import { FUND, PROJECTS, optimalInput, OPTIMAL_PEOPLE, budgetPlan, capOf } from '../public/baeumteo/plan.js';
import { PROGRAMS, RULES } from '../public/baeumteo/programs.js';
import { detailedPlan, changeLog, reviewPlan, factList } from '../public/baeumteo/detail.js';
import { SCENARIOS, recommendCombos, applyCombo } from '../public/baeumteo/orgs.js';
import { planSections } from '../public/baeumteo/blocks.js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outDir = path.join(root, 'reports', '10-17-flow-demo');
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const say = (...lines) => log.push(...lines);
const flat = text => text.replace(/\s+/g, ' ');

// ---------- ① 요구조건 추출 ----------
async function pdfText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 }).promise;
  let out = '';
  for (let page = 1; page <= doc.numPages; page += 1) out += (await (await doc.getPage(page)).getTextContent()).items.map(item => item.str + (item.hasEOL ? '\n' : '')).join('') + '\n';
  return out;
}
async function fetchFoundation() {
  const html = await (await fetch('https://www.sdream.or.kr/portal/apply/eduSupport', { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const urls = [...html.matchAll(/downloadFile\('([^']+)'\)/g)].map(m => m[1]);
  const texts = {};
  for (const url of urls) {
    const buffer = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).arrayBuffer());
    const files = await readZipFiles(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    for (const file of files) {
      const name = file.name.split('/').pop();
      if (!name) continue;
      if (/\.pdf$/i.test(name)) texts[name] = flat(await pdfText(file.bytes));
      else if (/\.hwp$/i.test(name)) texts[name] = flat((await extractHwpDocument(file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength))).text);
    }
  }
  return { urls, texts };
}
const pick = (texts, pattern) => Object.entries(texts).find(([name]) => pattern.test(name))?.[1] || '';

function requirementTable(texts) {
  const faq = pick(texts, /FAQ/), future = pick(texts, /미래형/), custom = pick(texts, /맞춤형/), linked = pick(texts, /연결형/), guide = pick(texts, /공모요강/);
  const all = Object.values(texts).join(' ');
  const rules = [
    ['학생 1인 연 35회 이상', future, /연간\s*교육\s*횟수\s*최소\s*35회/, () => RULES.minSessions.default === 35],
    ['진로설계 12회 이상·4개월 이상', custom, /최소\s*12회\s*이상[^.]{0,60}4개월\s*이상/, () => RULES.minSessions.career === 12 && RULES.minMonths.career === 4],
    ['자치회의는 교육 횟수에 불포함', faq, /자치회의[^가-힣]{0,3}는\s*교육횟수에\s*포함되지\s*않습니다/, () => Object.values(PROGRAMS).flat().every(program => program.themes.every(theme => !/자치회의/.test(theme)))],
    ['참여 학생 전체 15명 이상', future, /아동·청소년\s*15명\s*이상/, () => FUND.minPeople === 15],
    ['강사비 시간당 6만 원 이하', faq, /시간당\s*6만\s*원\s*이하/, () => RULES.hourlyMax === 60000],
    ['학습재료비 15~20%, 신규 30%', faq, /15~20%[\s\S]{0,100}30%/, () => RULES.materialsShare === 0.3],
    ['체험·견학 15% 이하', faq, /총\s*신청\s*예산의\s*15%\s*이하/, () => RULES.outingShare === 0.15],
    ['인건비+운영비 25%(지역공동체 30%)', faq, /25%\s*이하[\s\S]{0,120}30%\s*이하/, () => RULES.adminShare === 0.25 && RULES.adminShareCommunity === 0.30],
    ['지역공동체: 인접 3개 이상·학생 있는 배움터 2곳 이상', faq, /인접한\s*3개\s*이상[^]{0,260}최소\s*2개\s*이상/, () => PROJECTS.find(p => p.id === 'community').lockNote.includes('3개 이상')],
    ['지역공동체: 기관별 강사 파견 불가', faq, /파견하여\s*기관별로\s*개별\s*프로그램을\s*운영하는\s*방식은\s*지원하지\s*않습니다/, () => PROJECTS.find(p => p.id === 'community').lockNote.includes('파견하는 방식은 지원하지 않습니다')],
    ['이주배경: 청소년 ITQ 과정 필수', custom, /청소년의\s*경우,?\s*ITQ\s*자격증\s*교육과정/, () => PROGRAMS.migrant.some(program => /ITQ/.test(program.name))],
    ['5개 이상 연합 시 최대 1억 5천만 원', custom, /5개\s*이상\s*기관이\s*연합[^.]{0,40}1억\s*5천만\s*원/, () => PROJECTS.find(p => p.id === 'migrant').capUnion === 150_000_000 && PROJECTS.find(p => p.id === 'migrant').unionMin === 5],
    ['한 기관은 한 사업만', faq, /한\s*기관은\s*하나의\s*사업만\s*신청/, () => PROJECTS.every(p => /다른 사업에는 참여할 수 없습니다/.test(p.lockNote))],
    ['신청서는 PDF로 변환해 제출', future, /PDF\s*형태로\s*변환/, () => true],
    ['신청 마감 2026. 11. 11. 17시', guide, /11\.\s*11\.\(수\)\s*17시/, () => /11\. 11\./.test(FUND.deadline)]
  ];
  const caps = [['인문·사회 탐구', future, /인문·사회\s*탐구\s*프로젝트.{0,700}?지원금액\s*[◯○]\s*([\d천백억만\s]+원)\s*이하/, 'humanities'], ['문화예술 창작', future, /문화예술\s*창작\s*프로젝트.{0,700}?지원금액\s*[◯○]\s*([\d천백억만\s]+원)\s*이하/, 'culture'], ['이주배경 잇다', custom, /이주배경\s*아동·청소년\s*잇다\s*프로젝트.{0,900}?지원금액\s*[◯○]\s*([\d천백억만\s]+원)\s*이하/, 'migrant'], ['진로설계', custom, /진로설계\s*프로젝트.{0,900}?지원금액\s*[◯○]\s*([\d천백억만\s]+원)\s*이하/, 'career'], ['지역공동체', linked, /지원금액\s*[◯○]\s*([\d천백억만\s]+원)\s*이하/, 'community']];
  const toWon = text => { const t = text.replace(/\s/g, ''); const eok = /(\d+)억/.exec(t); const rest = t.replace(/^.*억/, ''); const cheon = /(\d+)천/.exec(rest); const baek = /(\d+)백/.exec(rest); const man = /만/.test(rest); const under = ((cheon ? Number(cheon[1]) * 1000 : 0) + (baek ? Number(baek[1]) * 100 : 0)) * (man ? 10_000 : 1); return (eok ? Number(eok[1]) * 100_000_000 : 0) + under; };
  const rows = [];
  for (const [label, text, pattern, check] of rules) {
    const hit = pattern.exec(text);
    rows.push({ label, found: Boolean(hit), snippet: hit ? text.slice(Math.max(0, hit.index), hit.index + Math.min(hit[0].length, 70)) : '', code: hit ? Boolean(check()) : null });
  }
  for (const [label, text, pattern, id] of caps) {
    const hit = pattern.exec(text);
    const wording = hit?.[1] || '';
    const amount = toWon(wording);
    const project = PROJECTS.find(p => p.id === id);
    const expected = id === 'migrant' ? project.cap : project.cap;
    rows.push({ label: `${label} 신청 한도`, found: Boolean(hit), snippet: hit ? `${wording.replace(/\s/g, '')} 이하` : '', code: hit ? amount === expected : null });
  }
  // 서식 3 항목(유형별 번호 매긴 제목) — 양식 본문에서 그대로 뽑는다.
  const headings = text => [...text.matchAll(/(?:^|\s)(\d)\.\s(사업명|신청 사업 유형|교육 기간|지역 교육자원 현황|참여 예정 아동·청소년|교육목표|교육프로그램 및 프로젝트 내용|교육 장소|효과적인 사업 운영을 위한 기반 활동 계획|사업의 필요성|사업 운영 조직도)/g)].map(m => `${m[1]}. ${m[2]}`);
  const sections = { 미래형: [...new Set(headings(future.slice(future.indexOf('<서식 3>'))))], 맞춤형: [...new Set(headings(custom.slice(custom.indexOf('<서식 3>'))))], 연결형: [...new Set(headings(linked.slice(linked.indexOf('<서식 3>'))))] };
  return { rows, sections, total: Object.keys(texts).length, chars: all.length };
}

// ---------- 시연 본체 ----------
say('# [10-17] 전체 흐름 시연 — 요구조건 추출 → 가상본 → 기관 입력 → 조합 재추천 → 재설계 → 출력', '',
  `실행 시각 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · 기준 사례: 진로설계 프로젝트. 아래 숫자와 문장은 이 스크립트가 실제로 돌려서 나온 값이다.`, '');

// ①
say('## ① 요구조건 추출 — 재단 사이트에서 양식·요강·FAQ를 내려받아 읽고 규정을 뽑는다');
const { urls, texts } = await fetchFoundation();
const req = requirementTable(texts);
say(`내려받은 파일 ${req.total}개(요강 PDF 1, 양식 HWP 3, 작성방법·FAQ PDF 3, ZIP ${urls.length}개), 본문 ${req.chars.toLocaleString('ko-KR')}자.`, '',
  '규정 | 문서에서 찾음 | 문서 문구(일부) | 코드와 일치');
for (const row of req.rows) say(`${row.label} | ${row.found ? '예' : '**못 찾음**'} | ${row.snippet || '-'} | ${row.code === null ? '-' : row.code ? '일치' : '**불일치**'}`);
const found = req.rows.filter(row => row.found).length;
const mismatch = req.rows.filter(row => row.found && !row.code);
say('', `요약: ${req.rows.length}개 규정 중 문서에서 ${found}개를 찾았고, 찾은 것 중 코드와 어긋난 것 ${mismatch.length}개${mismatch.length ? ` (${mismatch.map(r => r.label).join(', ')})` : ''}.`);
say('', '서식 3 항목(문서에서 뽑은 번호·제목):');
for (const [form, list] of Object.entries(req.sections)) say(`- ${form}: ${list.join(' / ') || '못 뽑음'}`);
say('', '**한계:** 규정 추출은 이 재단 문서의 문구에 맞춘 패턴이다. 다른 공모 문서를 넣으면 패턴을 새로 써야 하며, 범용 추출은 아직 없다. 위 「코드와 일치」는 코드에 손으로 넣어 둔 규정이 문서와 같은지 확인하는 검증이다.', '');

const career = PROJECTS.find(project => project.id === 'career');
const planned = OPTIMAL_PEOPLE.career;

// ②
say('## ② 가상본 — 모든 조건을 가정해 완성된 계획서를 만든다');
const virtual = optimalInput(career);
const virtualText = detailedPlan(career, virtual);
const virtualBudget = budgetPlan(career, virtual);
say(`가상 최적 입력: 참여 ${virtual.people}명, 대표기관·참여기관 이름은 모두 〔가상〕. 상세본 ${virtualText.length.toLocaleString('ko-KR')}자, 〔가상〕 표시 ${(virtualText.match(/〔가상〕/g) || []).length}곳, 남은 [확인 필요] ${(virtualText.match(/\[확인 필요/g) || []).length}곳, 신청액 ${virtualBudget.total.toLocaleString('ko-KR')}원(한도 ${capOf(career, virtual).toLocaleString('ko-KR')}원), 규정 경고 ${virtualBudget.warnings.length}건.`,
  `맨 위 문구: ${virtualText.split('\n')[1]}`, '');

// ③
say('## ③ 기관 입력 — 가상 시험 데이터 3종');
for (const [key, [label, orgs]] of Object.entries(SCENARIOS)) say(`- ${label}: ${orgs.map(org => `${org.name}(학생 ${org.students ?? '?'}명)`).join(', ')}`);
say('');

// ④
say('## ④ 조합 재추천 — 기관 정보로 다시 평가한다');
const results = {};
for (const [key, [label, orgs]] of Object.entries(SCENARIOS)) {
  const result = recommendCombos(career, orgs, planned);
  results[key] = result;
  say(`### ${label}`);
  if (result.excluded.length) say(`제외: ${result.excluded.map(e => `${e.name} — ${e.reason}`).join(' / ')}`);
  for (const [index, combo] of result.combos.slice(0, 3).entries()) {
    say(`${index + 1}. [${combo.status}] ${combo.label} · 학생 ${combo.students}${combo.studentsKnownAll ? '' : '+'}명`);
    for (const check of combo.checks.filter(c => c.result !== '충족').slice(0, 3)) say(`   - ${check.result} ${check.item}: ${check.basis}`);
  }
  say('');
}

// ⑤
say('## ⑤ 재설계 — 추천 조합을 적용하면 무엇이 왜 바뀌는가');
const orgs = SCENARIOS.sufficient[1];
const top = results.sufficient.combos[0];
const applied = applyCombo(career, top, orgs, planned);
say(`적용한 조합: ${top.label} [${top.status}]`, '', '항목 | 가상 기준 | 적용 후 | 이유');
const changes = changeLog(career, applied);
for (const row of changes) say(`${row.what} | ${row.from} | ${row.to} | ${row.why}`);
const finalText = detailedPlan(career, applied);
const review = reviewPlan(career, applied);
say('', `적용 후 상세본 ${finalText.length.toLocaleString('ko-KR')}자. 자동 점검 ${review.length}건: ${review.map(item => `[${item.level}] ${item.message.slice(0, 40)}`).join(' / ')}`,
  `막힌 경우 확인: 모집 부족 데이터의 추천 가능 조합 ${results.shortage.combos.filter(c => c.status !== '불가').length}개(모두 불가여야 정상), 미확인 데이터의 「실행 가능」 조합 ${results.unconfirmed.combos.filter(c => c.status === '실행 가능').length}개(0이어야 정상).`, '');

// ⑥
say('## ⑥ 출력 — 파일로 내보내고, 한글에서 열어 보고, 공식 양식과 대조한다');
const title = `${career.title}`;
const sections = planSections(finalText);
fs.writeFileSync(path.join(outDir, 'plan.txt'), finalText);
const esc = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const htmlBody = section => `<h2>${esc(section.title)}</h2>` + section.blocks.map(block => block.rows
  ? `<table>${block.rows.map((row, r) => `<tr>${row.map(cell => `<${r ? 'td' : 'th'}>${esc(cell)}</${r ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`
  : `<p>${esc(block.text)}</p>`).join('');
fs.writeFileSync(path.join(outDir, 'plan.html'), `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px/1.7 "Malgun Gothic",sans-serif;max-width:780px;margin:24px auto;padding:0 16px}h2{font-size:16px;margin-top:22px}p{margin:2px 0}table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #444;padding:3px 6px;font-size:12px;vertical-align:top}th{background:#eee}@media print{body{margin:0}}</style><h1>${esc(title)}</h1>${sections.map(htmlBody).join('')}`);
const generatedAt = new Date().toISOString();
const hwpxBytes = zipBytes(buildHwpxFiles({ project: { title, issuer: FUND.name, deadline: FUND.deadline }, sections }, generatedAt), generatedAt);
fs.writeFileSync(path.join(outDir, 'plan.hwpx'), hwpxBytes);
const ab = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const zipNames = (await readZipFiles(ab(hwpxBytes))).map(file => file.name);
const readBack = await extractHwpxText(ab(hwpxBytes));
const sample = finalText.split('\n').filter(line => line.trim().length > 20 && !line.includes(' | '));
const kept = sample.filter(line => readBack.replace(/\s+/g, ' ').includes(line.trim().slice(0, 30).replace(/\s+/g, ' '))).length;
const tableCount = sections.reduce((n, section) => n + section.blocks.filter(block => block.rows).length, 0);
say(`- plan.txt ${fs.statSync(path.join(outDir, 'plan.txt')).size.toLocaleString('ko-KR')}바이트 · plan.html ${fs.statSync(path.join(outDir, 'plan.html')).size.toLocaleString('ko-KR')}바이트(표 포함, 브라우저에서 인쇄·PDF 저장)`,
  `- plan.hwpx ${hwpxBytes.length.toLocaleString('ko-KR')}바이트, 구성 파일 ${zipNames.length}개, 진짜 표 ${tableCount}개(서식 3 기반 활동·개요표, 서식 5 예산서 등)`,
  `- 우리 코드로 되읽기: 문단 ${sample.length}줄 중 ${kept}줄 그대로 (${Math.round(kept / sample.length * 100)}%)`, '');

// 한글 프로그램으로 외부 검증 (Windows + 한글 2020 이상)
let hangul = { tried: false };
const checker = path.join(root, 'tools', 'hangul-check.ps1');
if (process.platform === 'win32' && fs.existsSync(checker)) {
  const pdfOut = path.join(outDir, 'plan_from_hangul.pdf');
  const run = spawnSync('powershell', ['-NoProfile', '-File', checker, '-In', path.join(outDir, 'plan.hwpx'), '-Pdf', pdfOut], { encoding: 'utf8', timeout: 120000 });
  try { hangul = { tried: true, ...JSON.parse(run.stdout.trim().split('\n').pop()) }; } catch { hangul = { tried: true, opened: false, error: (run.stderr || run.stdout || '').slice(0, 120) }; }
  if (hangul.pdf && fs.existsSync(pdfOut)) {
    const pdf = flat(await pdfText(fs.readFileSync(pdfOut)));
    hangul.headings = ['<서식 1>', '<서식 2>', '<서식 3>', '<서식 4>', '<서식 5>'].filter(h => pdf.includes(h)).length;
    hangul.columns = ['산출 근거', '프로그램명', '계정과목', '핵심 논의 사항', '연간 진행 횟수'].filter(c => pdf.includes(c.replace(/\s/g, '')) || pdf.includes(c)).length;
    hangul.pdfChars = pdf.length;
  }
}
if (hangul.tried) {
  say('**한글 프로그램으로 열기 (외부 검증)**',
    `- 한글에서 열림: ${hangul.opened ? '예' : '**아니오**'} · 쪽 수 ${hangul.pages ?? '?'}쪽(A4) · PDF 변환 ${hangul.pdf ? '성공' : '**실패**'}${hangul.error ? ` · 오류 ${hangul.error}` : ''}`,
    hangul.pdf ? `- 한글이 만든 PDF에서 서식 1~5 제목 ${hangul.headings}/5개, 표 머리 칸 이름 ${hangul.columns}/5개가 글자로 읽힘 (plan_from_hangul.pdf)` : '- PDF가 없어 글자 대조는 못 함', '');
} else say('**한글 프로그램으로 열기:** 이 환경에서는 시도하지 못함(한글 미설치 또는 Windows가 아님)', '');

// 공식 양식과 대조: 항목 번호·제목, 필수 활동, 표 머리 칸
const customText = pick(texts, /맞춤형/);
const officialHeads = req.sections['맞춤형'];
const ours = finalText;
const headCover = officialHeads.map(head => ({ head, has: ours.includes(head) || ours.includes(head.replace(/^\d+\.\s*/, '')) }));
const careerBlock = (/진로설계\s*프로젝트\s*구분\s*내용[\s\S]*?필수활동([\s\S]*?)지원금액/.exec(customText) || [])[1] || '';
const required = careerBlock.split(/[◯○]/).map(t => t.replace(/\s+/g, ' ').trim()).filter(t => t.length > 6).map(t => t.replace(/^-\s*/, ''));
const requiredKeys = [[/지역사회와의 상호작용/, /지역사회|진로자원/], [/주도의 프로젝트/, /프로젝트/], [/포트폴리오 제작/, /진로설계 포트폴리오/], [/자치회의/, /자치회의/], [/기반 활동/, /교강사 전체 회의|보호자/]];
const requiredCover = requiredKeys.map(([official, mine]) => ({ official: (required.find(t => official.test(t)) || '').slice(0, 40), has: mine.test(ours), found: required.some(t => official.test(t)) }));
const tableHeads = [['6-1 개요표', ['단계', '프로그램명', '참여학생', '운영 기간', '운영 회기']], ['8 기반 활동', ['구분', '연간 진행 횟수', '핵심 논의 사항']], ['서식 5 예산서', ['구분', '프로그램명', '계정과목', '산출 근거', '예산']]];
const tableCover = tableHeads.map(([name, cols]) => ({ name, official: cols.filter(c => flat(customText).includes(c)).length, mine: cols.filter(c => sections.some(s => s.blocks.some(b => b.rows && b.rows[0].some(cell => cell.replace(/\s/g, '').includes(c.replace(/\s/g, '')))))).length, total: cols.length }));
say('**공식 신청서(맞춤형 양식)와 대조**',
  `- 서식 3 항목 번호·제목: ${headCover.filter(h => h.has).length}/${headCover.length} 일치 (${headCover.filter(h => !h.has).map(h => h.head).join(', ') || '빠진 것 없음'})`,
  `- 진로설계 필수활동 ${requiredCover.filter(r => r.found).length}개 중 계획서에 반영된 것 ${requiredCover.filter(r => r.found && r.has).length}개: ${requiredCover.map(r => `${r.found ? (r.has ? '○' : '×') : '?'} ${r.official || '(못 찾음)'}`).join(' / ')}`,
  ...tableCover.map(t => `- 표 머리 칸 ${t.name}: 공식 양식에 ${t.official}/${t.total}개 있음 → 우리 표에 ${t.mine}/${t.total}개`),
  `- 공식 양식은 표가 많은 한글 서식(.hwp)이고, 우리 출력은 같은 항목 순서와 핵심 표를 갖춘 **새 문서**다. 양식 파일의 칸에 값을 직접 채운 것이 아니므로 「공식 양식 완전 일치」가 아니다.`, '');
const unverified = ['재단 .hwp 양식의 서식 1·2 표 칸(대표기관 명단·책무성 점검표 등), 교육 장소 전경 사진 첨부, 직인·서명·동의서', '한글에서 직접 열어 눈으로 확인하는 쪽 나눔·글꼴(위 쪽 수는 한글이 센 값)', '큰 표(서식 5)가 새 쪽에서 시작해 앞 쪽 아래가 비는 현상은 고치지 못함'];
say('**확인하지 못한 부분 (「출력 완료」와 구분):**', ...unverified.map(t => `- ${t}`), '');

// ⑦ 다른 공모 한 건을 기존 코드 수정 없이 처리할 수 있는가
say('## ⑦ 다른 공모 한 건 — 기존 코드를 고치지 않고 어디까지 되는가');
let other = { ok: false };
try {
  const post = body => handleNoticeRequest(new Request('https://l.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const H = { Referer: 'https://proposal.chest.or.kr/', Accept: 'text/html,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9' };
  const page = await (await fetch('https://proposal.chest.or.kr/mobile/mobileMainBsnsDetail.do?dstbBsnsCode=20260800100057&appnDocNo=', { headers: H })).text();
  const handles = [...page.matchAll(/fn_fileDownload\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\)[^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ fileSeCode: m[1], dstbBsnsCode: m[2], sn: m[3], fileSn: m[4], name: m[5].replace(/<[^>]+>|\s+/g, ' ').trim() }));
  const zipHandle = handles.find(h => /zip/i.test(h.name));
  const response = await post({ action: 'downloadAttachment', attachment: zipHandle });
  const entries = await readZipFiles(new Uint8Array(await response.arrayBuffer()).buffer);
  const form = entries.find(e => /배분신청서.*\.hwp$/.test(e.name));
  const doc = await extractHwpDocument(ab(form.bytes));
  const formItems = extractFormItems(formSources([{ id: 'f', fileName: form.name, sourceType: '사업계획서 서식', extractionStatus: 'success', extractedText: doc.text, guides: doc.guides }]));
  const matched = formItems.map(item => ({ name: item.name.slice(0, 28), key: formItemSkeleton({ items: [item] }, [])[0].key }));
  other = { ok: true, doc0Text: doc.text, title: '2026 한국수출입은행 다문화 차량 공모사업(사랑의열매 중앙회)', files: entries.length, tables: doc.tables, guides: doc.guides.length, items: formItems.length, matched };
} catch (error) { other = { ok: false, error: String(error.message || error).slice(0, 100) }; }
if (other.ok) {
  const otherText = flat(other.doc0Text);
  const otherRules = requirementTable({ FAQ: otherText, 미래형: otherText, 맞춤형: otherText, 연결형: otherText, 공모요강: otherText });
  say(`대상: ${other.title}. 첨부 ZIP ${other.files}개 파일, 배분신청서 .hwp에 표 ${other.tables}개·안내 박스 ${other.guides}개.`, '',
    '단계 | 기존 코드를 그대로 쓴 결과',
    `① 요구조건 추출 | 배움터용 규정 패턴 ${otherRules.rows.length}개 중 이 문서에서 찾은 것 ${otherRules.rows.filter(r => r.found).length}개(범용 추출이 아님). 서식 항목은 서식의 번호 줄에서 ${other.items}개가 서식 이름 그대로 나옴(24-04의 항목 추출, 안내 박스는 번호 줄이 못 채운 갈래만 메움)`,
    `② 가상본 | **불가** — 계획서 내용(프로그램표·예산 단가)이 배움터 다섯 사업에 손으로 들어 있어 새 공모의 계획서는 만들지 못함`,
    `③~⑤ 조합·재설계 | **불가** — 사업 유형·한도·규정이 배움터 전용(programs.js) 상수`,
    `⑥ 출력 | 가능(문서 틀은 공용) — 다만 채울 내용이 없음`, '',
    `항목 추출 결과: ${other.matched.map(m => `「${m.name}」→${m.key || '안 걸림'}`).join(' / ')}`, '',
    '**범용화의 다음 과제(이 시연이 보여 준 순서):**',
    '1. 공모 정의를 코드에서 데이터로 분리 — 지금은 `PROJECTS`·`RULES`·`PROGRAMS`·`FACTS`가 배움터 상수다. 이것을 「공모 정의 파일」(유형, 한도, 규정, 서식 항목, 질문)로 빼고 엔진은 읽기만 하게 해야 한다.',
    '2. 규정 추출을 패턴 목록에서 일반 규칙으로 — 숫자+단위+조건 문장(「N회 이상」「N% 이하」「N개 이상 기관」)을 문서에서 뽑아 사람이 확인하는 표를 만든다. 지금은 문구마다 패턴을 손으로 썼다.',
    `3. 서식 항목 → 계획서 갈래 연결 — 항목 이름은 서식의 번호 줄 그대로 ${other.items}개가 나오고 그중 ${other.matched.filter(m => m.key).length}개가 우리 갈래(필요성·대상·일정 등)에 걸린다. 걸리지 않는 항목(${other.matched.filter(m => !m.key).map(m => `「${m.name}」`).join(', ') || '없음'})은 낱말 목록에 없어서이므로, 낱말 추가 대신 공모 정의 파일에서 항목→갈래를 사람이 확인하는 표로 바꾼다.`,
    '4. 교육 설계는 공모마다 다르므로 **템플릿 + 사용자 입력**으로 시작하고, AI 초안은 규정 검증을 통과한 뒤에만 쓴다.', '');
} else say(`다른 공모(2026 한국수출입은행 다문화 차량 공모사업)를 내려받지 못해 시험하지 못함: ${other.error}`, '');

// 결론
say('## 전체 판정');
const step = (name, state, note) => `- ${state} · ${name} — ${note}`;
const hangulOk = hangul.tried && hangul.opened && hangul.pdf;
say(step('① 요구조건 추출', '일부 작동', `이 재단 문서에서 규정 ${found}/${req.rows.length}개 추출, 코드와 불일치 ${mismatch.length}. 다른 공모를 읽는 범용 추출은 미구현`),
  step('② 가상본', virtualText.length > 5000 && (virtualText.match(/\[확인 필요/g) || []).length === 0 ? '작동' : '미완', '〔가상〕 표시와 경고 문구가 붙은 완성본'),
  step('③ 기관 입력', '작동', '화면의 기관 카드와 시험 데이터 3종'),
  step('④ 조합 재추천', results.sufficient.combos[0].status === '실행 가능' && results.shortage.combos.every(c => c.status === '불가') && results.unconfirmed.combos.every(c => c.status !== '실행 가능') ? '작동' : '미완', '충분·부족·미확인 세 경우가 각각 기대한 판정'),
  step('⑤ 재설계', changes.length >= 6 && changes.every(row => row.why) ? '작동' : '미완', `${changes.length}개 항목이 바뀌고 모두 이유가 붙음`),
  step('⑥ 출력', hangulOk ? '일부 작동' : '미완', `hwpx를 한글이 ${hangulOk ? '열고 PDF로 변환함(진짜 표 포함)' : '열었는지 확인 못 함'}. 재단 .hwp 양식 파일의 칸을 채우는 것은 미구현`),
  step('⑦ 다른 공모', '미완', '계획서 생성·재설계는 배움터 전용 상수에 묶여 있어 다른 공모를 코드 수정 없이 처리하지 못함 — 범용화 과제 4가지는 ⑦ 참조'));
fs.writeFileSync(path.join(root, 'reports', '10-17-flow-demo.md'), log.join('\n') + '\n');
console.log(log.join('\n'));
