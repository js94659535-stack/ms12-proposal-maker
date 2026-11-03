// 공고(RFP)의 평가표에서 고른 절을 Claude로 쓰고, 검사하고, 토큰을 기록한다(10-05).
// 사용: node tools/proposal-draft.mjs --rfp <공고.hwpx> [--rfp <더>] --facts <기관자료.hwp> [--facts <더>]
//        --project <project.json> --sections "사업 이해도,신규 프로그램" --out <폴더>
//        [--model claude-opus-5-5] [--effort medium] [--krw 1400] [--dry-run]
// --dry-run 은 API를 부르지 않고 보낼 프롬프트만 파일로 남긴다.
// --max-krw N 은 쓴 돈이 N원을 넘으면 다음 장을 시작하지 않는다.
// --recheck <폴더> 는 그 폴더의 draft_ 파일을 다시 쓰지 않고 검사만 다시 돌린다(채점 기준 판정자 호출 — 장당 몇 원).
// 끝에 장을 건너 보는 검사(글머리 모양·되풀이 문장)를 그 폴더의 draft_ 전부에 돌려 checks_전체.json에 남긴다(11-05, 돈 안 듦).
// 가리킴 검사(11-07)도 같은 draft_ 전부에 돈다(판정자 세 번, 몇 원). 가리킨 줄을 생성 요청에 넣지는 않는다 — 검사가 잡는다(11-08).
// 기록: <폴더>/usage.jsonl 에 호출마다 한 줄(prompt_tokens·completion_tokens·원화). 호출이 끝나는 즉시 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { extractFile } from '../src/files.js';
import { pdfDocumentText } from '../public/lib/pdf-text.js';
import { readPlan, writingUnits } from '../public/rfp/rfp-plan.js';
import { draftFileLabel } from '../public/plan/workspace.js';
import { draftSection, DEFAULT_EFFORT, systemPrompt, userContent, preferenceLines, choiceSheet, stripMarks, checkDraft } from '../src/proposal-draft.js';
import { judgeCriteria } from '../src/criteria-check.js';
import { checkChapters } from '../src/plan-checks.js';
import { judgePointers } from '../src/pointer-check.js';

const args = process.argv.slice(2);
const all = name => args.flatMap((arg, index) => arg === `--${name}` ? [args[index + 1]] : []);
const opt = (name, fallback) => all(name)[0] ?? fallback;
const flag = name => args.includes(`--${name}`);

// PDF는 pdf.js의 Node용(legacy) 빌드로 연다 — 브라우저 빌드(src/files.js가 부르는 것)는 Node에서 DOMMatrix가 없어 멈춘다(11-18).
// 줄·칸 맞춤은 화면과 같은 한 곳(public/lib/pdf-text.js)을 쓴다. 판은 node_modules 하나 — 화면도 빌드가 같은 판을 복사해 쓴다.
async function readPdf(file, bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const text = await pdfDocumentText(pdf);
  // 글자가 거의 없으면 스캔본 — 읽은 척하지 않는다(src/files.js와 같은 문턱).
  if (text.replace(/\[\d+쪽\]/g, '').trim().length < 20) throw new Error(`${path.basename(file)}: 글자가 없는 스캔 PDF로 보입니다.`);
  return { text, pages: pdf.numPages };
}

async function readText(file) {
  const bytes = fs.readFileSync(file);
  const result = /\.pdf$/i.test(file) ? await readPdf(file, bytes) : await extractFile(new File([bytes], path.basename(file)));
  // 읽어낸 쪽·글자 — 화면(/plan/ 공고 칸)과 같은 숫자인지 견준다.
  console.log(`읽음: ${path.basename(file)}${result.pages ? ` · ${result.pages}쪽` : ''} · ${result.text.length.toLocaleString('ko-KR')}자`);
  return result.text;
}

const rfpFiles = all('rfp');
const factFiles = all('facts');
const out = path.resolve(opt('out', 'reports/10-05-unification'));
if (!rfpFiles.length) { console.error('--rfp <공고 파일>을 주세요.'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

const rfpText = (await Promise.all(rfpFiles.map(readText))).join('\n\n');
const facts = await Promise.all(factFiles.map(async file => ({ source: path.basename(file), text: await readText(file) })));
const project = opt('project') ? JSON.parse(fs.readFileSync(opt('project'), 'utf8')) : {};
// project.json을 통째로 넘긴다 — 화면(/plan/ 작업대)도 같은 파일을 받아 같은 표를 본다(10-08).
const { plan, fallback, constraints } = readPlan(rfpText, { project });
if (!plan) { console.error(`목차를 만들지 못했다: ${fallback.reason}. 이 공고는 양식 기반으로 쓴다.`); process.exit(2); }
const units = writingUnits(plan);

// --sections 는 장 번호(Ⅰ), 장·절 이름, 또는 평가 항목 이름(그 항목이 붙은 장 전부)을 받는다.
const wanted = String(opt('sections', '')).split(',').map(name => name.trim()).filter(Boolean);
const squash = value => value.replace(/\s+/g, '');
const pick = name => units.filter(unit => squash(unit.key) === squash(name) || squash(unit.title).includes(squash(name)) ||
  unit.parts.some(part => squash(part.title) === squash(name)) || unit.items.some(item => squash(item) === squash(name)));
const missing = wanted.filter(name => !pick(name).length);
if (missing.length) { console.error(`목차에 없는 이름: ${missing.join(', ')}. 장: ${units.map(unit => unit.title).join(', ')}`); process.exit(1); }
const sections = wanted.length ? [...new Set(wanted.flatMap(pick))] : units;
console.log(`목차: ${plan.from} · 쓸 장 ${sections.map(unit => unit.title).join(', ')}`);

const model = opt('model', 'claude-opus-5-5');
const effort = opt('effort', DEFAULT_EFFORT);
const krwPerUsd = Number(opt('krw', 1400));
const fileName = draftFileLabel; // 작업대(/plan/)가 같은 이름으로 장을 찾는다
// 목차의 절 이름들 — 아직 안 쓴 장을 가리킨 줄도 찾는다(가리킴 검사).
const partKeys = units.flatMap(unit => unit.parts.map(part => part.key));
// 폴더에 있는 draft_ 전부(목차 순서).
const draftsIn = dir => units.map(unit => ({ title: unit.key, file: path.join(dir, `draft_${fileName(unit.title)}.md`) }))
  .filter(chapter => fs.existsSync(chapter.file))
  .map(chapter => ({ title: chapter.title, text: fs.readFileSync(chapter.file, 'utf8') }));

if (flag('dry-run')) {
  for (const section of sections) {
    const content = userContent({ rfpText, facts, project, section, constraints, plan, preferences: preferenceLines(rfpText) });
    const text = [`# system\n${systemPrompt()}`, ...content.map((block, index) => `# user ${index + 1}${block.cache_control ? ' (캐시)' : ''}\n${block.text}`)].join('\n\n');
    fs.writeFileSync(path.join(out, `prompt_${fileName(section.title)}.txt`), text);
    console.log(`${section.title}: 프롬프트 ${text.length.toLocaleString('ko-KR')}자 → prompt_${fileName(section.title)}.txt`);
  }
  process.exit(0);
}

const { default: Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic();
const usageFile = path.join(out, 'usage.jsonl');
// --max-krw N: 이번 실행에서 쓴 돈(생성 + 판정자)이 N원을 넘으면 다음 장을 시작하지 않고 멈춘다(11-03).
const maxKrw = Number(opt('max-krw', Infinity));
let spentKrw = 0;
const onUsage = record => { spentKrw += record.krw || 0; fs.appendFileSync(usageFile, `${JSON.stringify(record)}\n`); };

// --recheck <폴더>: 이미 쓴 draft_ 파일을 다시 쓰지 않고 검사만 다시 돌린다(규칙 검사 + 채점 기준 판정자). 결과는 --out에 checks_로.
if (opt('recheck')) {
  for (const section of sections) {
    const name = fileName(section.title);
    const text = fs.readFileSync(path.join(opt('recheck'), `draft_${name}.md`), 'utf8').trim();
    const checks = [
      ...checkDraft(text, { constraints, section, sources: [rfpText, ...facts.map(fact => fact.text)], project }),
      ...await judgeCriteria({ client, text, section, krwPerUsd, onUsage })
    ];
    fs.writeFileSync(path.join(out, `checks_${name}.json`), JSON.stringify(checks, null, 2));
    console.log(`${section.title} (${opt('recheck')})`);
    for (const check of checks.filter(check => check.what.startsWith('채점 기준') || check.level === 'fail')) console.log(`  ${check.level === 'pass' ? '✔' : check.level === 'fail' ? '✖' : '!'} ${check.what} ${check.detail}`);
  }
}

const summary = [];
for (const section of opt('recheck') ? [] : sections) {
  if (spentKrw > maxKrw) { console.log(`멈춤: 지금까지 ${spentKrw}원 — 한도 ${maxKrw}원을 넘어 「${section.title}」부터 쓰지 않았다.`); break; }
  console.log(`${section.title} 쓰는 중… (지금까지 ${spentKrw}원)`);
  const result = await draftSection({
    client, model, effort, rfpText, facts, project, section, constraints, plan, krwPerUsd, onUsage
  });
  const name = fileName(section.title);
  // draft_ = 사장이 보는 본(줄마다 [제안]/[사실: 출처]), submit_ = 표시를 지운 제출본(쪽수 검사가 세는 글), choices_ = 고를 [제안] 목록
  fs.writeFileSync(path.join(out, `draft_${name}.md`), `${result.text}\n`);
  fs.writeFileSync(path.join(out, `submit_${name}.md`), `${stripMarks(result.text)}\n`);
  fs.writeFileSync(path.join(out, `choices_${name}.md`), `${choiceSheet(result.text, section.title, { section, checks: result.checks })}\n`);
  fs.writeFileSync(path.join(out, `checks_${name}.json`), JSON.stringify(result.checks, null, 2));
  const fails = result.checks.filter(check => check.level === 'fail');
  const warns = result.checks.filter(check => check.level === 'warn');
  const r = result.record;
  summary.push(`${section.title}: effort ${effort} · prompt ${r.prompt_tokens} (캐시 읽기 ${r.cache_read_input_tokens}) · completion ${r.completion_tokens} (생각 ${r.thinking_tokens ?? "칸 없음"}, 본문 ${r.text_tokens ?? "?"}) · ${r.krw ?? '단가 모름'}원 · fail ${fails.length} · warn ${warns.length}`);
  console.log(summary.at(-1));
  for (const check of fails) console.log(`  ✖ ${check.what} ${check.detail}`);
}
// 장을 건너 보는 검사 — 고른 장만이 아니라 폴더에 있는 draft_ 전부(목차 순서)를 본다.
const chapters = draftsIn(opt('recheck') || out);
const across = [...checkChapters(chapters, { parts: units.flatMap(unit => unit.parts.map(part => ({ key: part.key, score: part.score }))) }), ...await judgePointers({ client, chapters, parts: partKeys, krwPerUsd, onUsage })];
fs.writeFileSync(path.join(out, 'checks_전체.json'), JSON.stringify(across, null, 2));
console.log(`\n장을 건너 본 검사 (${chapters.map(chapter => chapter.title).join('·') || '장 없음'}): warn ${across.filter(check => check.level === 'warn').length}`);
for (const check of across) console.log(`  ${check.level === 'pass' ? '✔' : '!'} ${check.what} ${check.detail}`);
console.log(`\n합계 ${spentKrw}원 · 기록: ${usageFile} (환율 ${krwPerUsd}원/$)`);
