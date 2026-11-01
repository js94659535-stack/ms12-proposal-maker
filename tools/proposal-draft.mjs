// 공고(RFP)의 평가표에서 고른 절을 Claude로 쓰고, 검사하고, 토큰을 기록한다(10-05).
// 사용: node tools/proposal-draft.mjs --rfp <공고.hwpx> [--rfp <더>] --facts <기관자료.hwp> [--facts <더>]
//        --project <project.json> --sections "사업 이해도,신규 프로그램" --out <폴더>
//        [--model claude-opus-5-5] [--effort medium] [--krw 1400] [--dry-run]
// --dry-run 은 API를 부르지 않고 보낼 프롬프트만 파일로 남긴다.
// --recheck <폴더> 는 그 폴더의 draft_ 파일을 다시 쓰지 않고 검사만 다시 돌린다(채점 기준 판정자 호출 — 장당 몇 원).
// 기록: <폴더>/usage.jsonl 에 호출마다 한 줄(prompt_tokens·completion_tokens·원화). 호출이 끝나는 즉시 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { extractFile } from '../src/files.js';
import { readPlan, writingUnits } from '../public/rfp/rfp-plan.js';
import { draftFileLabel } from '../public/plan/workspace.js';
import { draftSection, DEFAULT_EFFORT, systemPrompt, userContent, preferenceLines, choiceSheet, stripMarks, checkDraft } from '../src/proposal-draft.js';
import { judgeCriteria } from '../src/criteria-check.js';

const args = process.argv.slice(2);
const all = name => args.flatMap((arg, index) => arg === `--${name}` ? [args[index + 1]] : []);
const opt = (name, fallback) => all(name)[0] ?? fallback;
const flag = name => args.includes(`--${name}`);

async function readText(file) {
  const bytes = fs.readFileSync(file);
  const result = await extractFile(new File([bytes], path.basename(file)));
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
const onUsage = record => fs.appendFileSync(usageFile, `${JSON.stringify(record)}\n`);

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
  console.log(`${section.title} 쓰는 중…`);
  const result = await draftSection({
    client, model, effort, rfpText, facts, project, section, constraints, plan, krwPerUsd, onUsage
  });
  const name = fileName(section.title);
  // draft_ = 사장이 보는 본(줄마다 [제안]/[사실: 출처]), submit_ = 표시를 지운 제출본(쪽수 검사가 세는 글), choices_ = 고를 [제안] 목록
  fs.writeFileSync(path.join(out, `draft_${name}.md`), `${result.text}\n`);
  fs.writeFileSync(path.join(out, `submit_${name}.md`), `${stripMarks(result.text)}\n`);
  fs.writeFileSync(path.join(out, `choices_${name}.md`), `${choiceSheet(result.text, section.title)}\n`);
  fs.writeFileSync(path.join(out, `checks_${name}.json`), JSON.stringify(result.checks, null, 2));
  const fails = result.checks.filter(check => check.level === 'fail');
  const warns = result.checks.filter(check => check.level === 'warn');
  const r = result.record;
  summary.push(`${section.title}: effort ${effort} · prompt ${r.prompt_tokens} (캐시 읽기 ${r.cache_read_input_tokens}) · completion ${r.completion_tokens} (생각 ${r.thinking_tokens ?? "칸 없음"}, 본문 ${r.text_tokens ?? "?"}) · ${r.krw ?? '단가 모름'}원 · fail ${fails.length} · warn ${warns.length}`);
  console.log(summary.at(-1));
  for (const check of fails) console.log(`  ✖ ${check.what} ${check.detail}`);
}
console.log(`\n기록: ${usageFile} (환율 ${krwPerUsd}원/$)`);
