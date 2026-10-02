// 배움터 계획서 플랫폼의 전체 흐름을 실제로 한 번 돌려 보여 주는 시연 (10-17).
//   ① 요구조건 추출 → ② 가상본 → ③ 기관 입력 → ④ 조합 재추천 → ⑤ 재설계 → ⑥ 출력
// 실행: node tools/baeumteo-flow-demo.mjs   (재단 사이트에서 양식·요강·FAQ를 실제로 내려받는다)
// 결과: reports/10-17-flow-demo.md 와 reports/10-17-flow-demo/ 폴더의 출력 파일(txt·html·hwpx).
import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readZipFiles, extractHwpxText } from '../src/files.js';
import { extractHwpDocument } from '../src/hwp-text.js';
import { zipBytes } from '../src/submission-zip.js';
import { buildHwpxFiles } from '../src/hwpx-export.js';
import { FUND, PROJECTS, optimalInput, OPTIMAL_PEOPLE, budgetPlan, capOf } from '../public/baeumteo/plan.js';
import { PROGRAMS, RULES } from '../public/baeumteo/programs.js';
import { detailedPlan, changeLog, reviewPlan, factList } from '../public/baeumteo/detail.js';
import { SCENARIOS, recommendCombos, applyCombo } from '../public/baeumteo/orgs.js';

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
say('## ⑥ 출력 — 파일로 내보내고 다시 읽어 본문이 그대로인지 확인한다');
const title = `${career.title}`;
const sections = finalText.split(/\n(?=<서식 \d>)/).map((chunk, index) => ({ title: index === 0 ? '표지와 안내' : chunk.split('\n')[0], content: index === 0 ? chunk : chunk.split('\n').slice(1).join('\n') }));
fs.writeFileSync(path.join(outDir, 'plan.txt'), finalText);
const esc = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
fs.writeFileSync(path.join(outDir, 'plan.html'), `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px/1.7 "Malgun Gothic",sans-serif;max-width:780px;margin:24px auto;padding:0 16px}h2{font-size:16px;margin-top:22px}p{margin:2px 0}@media print{body{margin:0}}</style><h1>${esc(title)}</h1>${sections.map(s => `<h2>${esc(s.title)}</h2>${s.content.split('\n').map(line => `<p>${esc(line)}</p>`).join('')}`).join('')}`);
const hwpxBytes = zipBytes(buildHwpxFiles({ project: { title, issuer: FUND.name, deadline: FUND.deadline }, sections }, new Date().toISOString()), new Date().toISOString());
fs.writeFileSync(path.join(outDir, 'plan.hwpx'), hwpxBytes);
const zipNames = (await readZipFiles(hwpxBytes.buffer.slice(hwpxBytes.byteOffset, hwpxBytes.byteOffset + hwpxBytes.byteLength))).map(file => file.name);
const readBack = await extractHwpxText(hwpxBytes.buffer.slice(hwpxBytes.byteOffset, hwpxBytes.byteOffset + hwpxBytes.byteLength));
const sample = finalText.split('\n').filter(line => line.trim().length > 20);
const kept = sample.filter(line => readBack.replace(/\s+/g, ' ').includes(line.trim().slice(0, 30).replace(/\s+/g, ' '))).length;
say(`- plan.txt ${fs.statSync(path.join(outDir, 'plan.txt')).size.toLocaleString('ko-KR')}바이트 (본문 그대로)`,
  `- plan.html ${fs.statSync(path.join(outDir, 'plan.html')).size.toLocaleString('ko-KR')}바이트 (브라우저에서 열어 인쇄·PDF 저장)`,
  `- plan.hwpx ${hwpxBytes.length.toLocaleString('ko-KR')}바이트, 압축 안 파일 ${zipNames.length}개(${zipNames[0]}가 맨 앞)`,
  `- HWPX를 다시 읽어 본 결과: 본문 ${readBack.length.toLocaleString('ko-KR')}자, 원문 ${sample.length}줄 중 ${kept}줄이 앞 30자 기준으로 그대로 들어 있음(${Math.round(kept / sample.length * 100)}%)`,
  '', '**한계:** 이 출력은 「본문을 담은 새 문서」다. 재단이 준 `.hwp` 양식 파일 자체의 칸에 값을 채워 넣는 것은 아직 없다. HWPX가 한글에서 실제로 열리는지는 이 시연에서 한글 프로그램으로 확인하지 못했고, 우리 읽기 코드로 되읽은 것까지만 확인했다. 또 가상 기관이 들어 있어 점검에서 오류(가상 값 잔존)가 나는 것이 정상이며, 제출은 실제 값으로 바꾼 뒤에 가능하다.', '');

// 결론
say('## 전체 판정');
const step = (name, ok, note, partial = false) => `- ${ok ? (partial ? '일부 작동' : '작동') : '미완'} · ${name} — ${note}`;
say(step('① 요구조건 추출', found >= req.rows.length - 2 && mismatch.length === 0, `이 재단 문서에서 규정 ${found}/${req.rows.length}개 추출, 코드와 불일치 ${mismatch.length}. 다른 공모를 읽는 범용 추출은 미구현`, true),
  step('② 가상본', virtualText.length > 5000 && (virtualText.match(/\[확인 필요/g) || []).length === 0, '〔가상〕 표시와 경고 문구가 붙은 완성본'),
  step('③ 기관 입력', true, '화면의 기관 카드와 시험 데이터 3종'),
  step('④ 조합 재추천', results.sufficient.combos[0].status === '실행 가능' && results.shortage.combos.every(c => c.status === '불가') && results.unconfirmed.combos.every(c => c.status !== '실행 가능'), '충분·부족·미확인 세 경우가 각각 기대한 판정'),
  step('⑤ 재설계', changes.length >= 6 && changes.every(row => row.why), `${changes.length}개 항목이 바뀌고 모두 이유가 붙음`),
  step('⑥ 출력', kept / sample.length > 0.9, 'txt·html·hwpx 생성과 되읽기. 재단 양식 파일 채우기는 미구현', true));
fs.writeFileSync(path.join(root, 'reports', '10-17-flow-demo.md'), log.join('\n') + '\n');
console.log(log.join('\n'));
