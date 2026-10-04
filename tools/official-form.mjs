// 재단 원본 맞춤형 양식(.hwp)의 복사본에 현재 진로설계 계획서를 넣어 제출 양식 파일을 만들고 검수한다(10-36).
// 사용: node tools/official-form.mjs --orig "<원본 .hwp>" --out reports/10-36-official-form [--python <pyhwpx가 깔린 python>]
// 필요: Windows, 한글 2020 이상, python + `pip install pyhwpx`, poppler(pdftotext·pdfinfo).
// 원본 파일은 열거나 고치지 않는다(임시 폴더에 복사해서 쓴다). 결과는 항상 「가상 예시본」이다 — 최종 제출본 표시를 붙이지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildOps } from './official-ops.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback; };
const orig = opt('orig');
if (!orig || !fs.existsSync(orig)) {
  console.error('원본 양식 파일을 찾을 수 없다. --orig "<[양식] 2027년 배움터 맞춤형 지원사업 신청서 양식.hwp>" 로 알려 주세요. 비슷한 양식을 새로 만들지 않는다.');
  process.exit(2);
}
const out = path.resolve(root, opt('out', 'reports/10-36-official-form'));
const python = opt('python', 'python');
fs.mkdirSync(out, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'official-'));
const run = (cmd, argv, label) => {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.error(`${label} 실패\n${r.stdout}\n${r.stderr}`); process.exit(1); }
  return r.stdout;
};
const unzip = (zipFile, dir) => {
  fs.copyFileSync(zipFile, path.join(work, 'x.zip'));
  run('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force '${path.join(work, 'x.zip')}' '${dir}'`], '압축 풀기');
};

// 1) 원본 구조 조사용 사본(HWPX) — 원본은 건드리지 않는다
const inspectHwpx = path.join(work, 'orig_inspect.hwpx');
run('powershell', ['-NoProfile', '-File', path.join(root, 'tools', 'hwp-inspect.ps1'), '-In', orig, '-Out', inspectHwpx], '원본 구조 조사');
const origDir = path.join(work, 'orig');
unzip(inspectHwpx, origDir);

// 2) 작업 목록 → 한글로 채움
const opsFile = path.join(work, 'ops.json');
fs.writeFileSync(opsFile, JSON.stringify(buildOps({})));
const hwpOut = path.join(out, '맞춤형_신청서_진로설계_가상예시본.hwp');
const pdfOut = path.join(out, '맞춤형_신청서_진로설계_가상예시본.pdf');
const checkHwpx = path.join(work, 'filled_check.hwpx');
const fillLog = run(python, [path.join(root, 'tools', 'hwp_fill.py'), opsFile, orig, hwpOut, '--pdf', pdfOut, '--hwpx', checkHwpx], '양식 채우기');
console.log(fillLog.trim().split('\n').pop());

// 3) 검수·차이 목록
const outDir = path.join(work, 'out');
unzip(checkHwpx, outDir);
const verify = spawnSync('node', [path.join(root, 'tools', 'official-verify.mjs'), path.join(origDir, 'Contents', 'section0.xml'), path.join(outDir, 'Contents', 'section0.xml'), pdfOut, path.join(out, '원본과의_차이목록.md')], { encoding: 'utf8' });
console.log(verify.stdout);
process.exit(verify.status === 0 ? 0 : 1);
