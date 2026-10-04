// 진로설계 「완성된 가상 사업계획서」를 파일로 만든다(10-20).
// 사용: node tools/career-final.mjs [--people 30] [--agency 이름] [--rep 이름] [--manager 이름] [--partner1 이름] [--partner2 이름] [--out 폴더]
// 결과: 사업계획서.txt · .html · .hwpx · (한글이 만든) 사업계획서_한글.pdf · 작성자안내.md
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { zipBytes } from '../src/submission-zip.js';
import { buildHwpxFiles } from '../src/hwpx-export.js';
import { extractHwpxText } from '../src/files.js';
import { planSections } from '../public/baeumteo/blocks.js';
import { careerBody, careerGuide, derive } from '../public/baeumteo/career-final.js';
import { MODES, modeAllowed, reviewList, submissionGate } from '../public/baeumteo/gate.js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const args = process.argv.slice(2);
const opt = name => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : undefined; };
const mode = opt('mode') || '예시본';
if (!MODES.includes(mode)) { console.error(`--mode는 ${MODES.join(' · ')} 중 하나`); process.exit(2); }
const setting = {};
for (const key of ['people', 'agency', 'rep', 'manager', 'partner1', 'partner2']) if (opt(key)) setting[key] = opt(key);
const allowed = modeAllowed(mode, setting);
if (!allowed.ok) {
  console.error(`[최종 제출본 차단] 아래를 채워야 제출본 표시를 붙일 수 있다:\n- ${allowed.blockers.join('\n- ')}`);
  process.exit(1);
}
const outDir = path.resolve(root, opt('out') || 'reports/10-20-career-final');
fs.mkdirSync(outDir, { recursive: true });

const text = careerBody(setting);
const guide = careerGuide(setting);
const d = derive(setting);
const title = text.split('\n')[0];
const sections = planSections(text);
fs.writeFileSync(path.join(outDir, '사업계획서.txt'), text);
fs.writeFileSync(path.join(outDir, '작성자안내.md'), guide);
const gate = submissionGate(setting);
const check = [`# 제출 준비 점검 (출력 모드: ${mode})`, '', `최종 제출본 가능: ${gate.pass ? '예' : '아니오'}`, '', '## 막는 조건', ...(gate.blockers.length ? gate.blockers.map(b => `- ${b}`) : ['- 없음']), '', '## 교차검증', ...gate.checks.map(c => `- ${c.ok ? '통과' : '실패'}: ${c.name} (${c.detail})`), '', '## 미확인 목록', ...reviewList(), ''];
fs.writeFileSync(path.join(outDir, '제출준비점검.md'), check.join('\n'));
const esc = v => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
fs.writeFileSync(path.join(outDir, '사업계획서.html'), `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px/1.75 "Malgun Gothic",sans-serif;max-width:800px;margin:24px auto;padding:0 16px}h2{font-size:16px;margin-top:22px}p{margin:3px 0}table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #444;padding:3px 6px;font-size:12px;vertical-align:top}th{background:#eee}@media print{body{margin:0}}</style><h1>${esc(title)}</h1>${sections.map(s => `<h2>${esc(s.title)}</h2>${s.blocks.map(b => b.rows ? `<table>${b.rows.map((r, i) => `<tr>${r.map(c => `<${i && b.header !== false ? 'td' : i ? 'td' : 'th'}>${esc(c)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>` : `<p>${esc(b.text)}</p>`).join('')}`).join('')}`);
const when = new Date().toISOString();
const hwpx = zipBytes(buildHwpxFiles({ project: { title: `${d.s.agency} 진로설계 프로젝트 사업계획서`, issuer: '삼성꿈장학재단 2027 배움터 교육지원사업', deadline: '2026-11-11' }, sections }, when), when);
fs.writeFileSync(path.join(outDir, '사업계획서.hwpx'), hwpx);
const ab = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const back = (await extractHwpxText(ab(hwpx))).replace(/\s+/g, ' ');
const lines = text.split('\n').map(l => l.replace(/^## /, '')).filter(l => l.trim().length > 20 && !l.startsWith('▦'));
const kept = lines.filter(l => back.includes(l.replace(/\s+/g, ' ').slice(0, 30))).length;
const tables = sections.reduce((n, s) => n + s.blocks.filter(b => b.rows).length, 0);

let hangul = { tried: false };
const checker = path.join(root, 'tools', 'hangul-check.ps1');
if (process.platform === 'win32' && fs.existsSync(checker) && !args.includes('--no-hangul')) {
  const run = spawnSync('powershell', ['-NoProfile', '-File', checker, '-In', path.join(outDir, '사업계획서.hwpx'), '-Pdf', path.join(outDir, '사업계획서_한글.pdf')], { encoding: 'utf8', timeout: 170000 });
  try { hangul = { tried: true, ...JSON.parse(run.stdout.trim().split('\n').pop()) }; } catch { hangul = { tried: true, opened: false, error: (run.stderr || run.stdout || '').slice(0, 100) }; }
}
console.log(JSON.stringify({
  out: path.relative(root, outDir), people: d.N, classes: d.C, 본문글자: text.length, 안내서글자: guide.length, 표: tables, 구역: sections.length,
  신청액: d.budget.total, 체험성: `${(d.budget.shares.outing * 100).toFixed(1)}%`, 인건비운영비: `${(d.budget.shares.admin * 100).toFixed(1)}%`, 재료: `${(d.budget.shares.materials * 100).toFixed(1)}%`,
  hwpx되읽기: `${kept}/${lines.length}`, 한글: hangul
}, null, 1));
