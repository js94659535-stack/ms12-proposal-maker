// 원본 양식과 채운 결과물을 나란히 비교해 검수 결과와 차이 목록을 낸다(10-36).
// 사용: node tools/official-verify.mjs <원본 조사용 section0.xml> <결과 section0.xml> <결과.pdf> <출력.md>
// 쪽 검사는 pdftotext(poppler)가 필요하다.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readTables } from './hwpx-tables.mjs';
import { derive } from '../public/baeumteo/career-final.js';
import { sessionTotal } from '../public/baeumteo/programs.js';

const [origXml, outXml, pdf, outMd] = process.argv.slice(2);
const orig = readTables(fs.readFileSync(origXml, 'utf8'));
const out = readTables(fs.readFileSync(outXml, 'utf8'));
const d = derive({});
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok, detail });
const num = s => Number(String(s).replace(/[^0-9]/g, '')) || 0;

// 1) 서식 1~5 머리와 순서
const heads = ['<서식 1>', '<서식 2>', '<서식 3>', '<서식 4>', '<서식 5>'];
const titles = tables => tables.filter(t => t.depth === 0 && t.rows === 1 && t.cols === 2 && heads.some(h => t.cells[0]?.text.startsWith(h))).map(t => t.cells[0].text);
check('서식 1~5 머리 누락 없음', JSON.stringify(titles(out.tables)) === JSON.stringify(heads), titles(out.tables).join(' · '));
check('서식 1~5 순서가 원본과 같음', JSON.stringify(titles(orig.tables)) === JSON.stringify(titles(out.tables)));

// 2) 표 개수: 원본 72 − 예시 표 1 + 참여기관 ② 표(복사 1 + 안쪽 3) + 예산서 복사 2 = 77
check('표 개수', out.tables.length === orig.tables.length - 1 + 4 + 2, `원본 ${orig.tables.length} → 결과 ${out.tables.length}`);

// 3) 원본 표와 결과 표 맞추기(순서를 지키며 표 모양과 첫 칸 글자로 짝짓기)
const sig = t => `${t.rows}x${t.cols}|${t.cells[0]?.text.slice(0, 12)}`;
const diffs = [];
let j = 0;
const matched = new Map();
for (const t of orig.tables) {
  let found = -1;
  for (let k = j; k < Math.min(out.tables.length, j + 8); k += 1) {
    const u = out.tables[k];
    if (u.cols === t.cols && u.depth === t.depth && (u.rows === t.rows || sig(u).split('|')[1] === sig(t).split('|')[1] || t.cells.length === u.cells.length)) { found = k; break; }
  }
  if (found < 0) { diffs.push({ kind: '삭제', t: t.index, text: `원본 표 ${t.index} (${t.rows}행 ${t.cols}열, 「${t.cells[0]?.text.slice(0, 30)}」)가 결과에서 지워짐` }); continue; }
  matched.set(t.index, found);
  j = found + 1;
  const u = out.tables[found];
  if (u.rows !== t.rows) diffs.push({ kind: '줄 변경', t: t.index, text: `표 ${t.index}(「${t.cells[0]?.text.slice(0, 24)}」): ${t.rows}행 → ${u.rows}행` });
}
const matchedOut = new Set(matched.values());
for (const u of out.tables) if (!matchedOut.has(u.index)) diffs.push({ kind: '추가', t: u.index, text: `결과 표 ${u.index} (${u.rows}행 ${u.cols}열, 「${u.cells[0]?.text.slice(0, 24)}」)는 원본에 없는 표(복사본)` });

// 4) 고정 칸(라벨) 보존: 원본에서 글자가 있는 짧은 칸(24자 이하)이 결과에도 같은 표의 같은 주소에 있는지
let lost = [];
for (const [oi, ni] of matched) {
  const t = orig.tables[oi];
  const u = out.tables[ni];
  if (u.rows !== t.rows) continue;
  if (t.depth === 1 && t.rows === 6 && t.cols === 7) continue; // 주간 일정표의 원본 칸은 작성 예시라 지우고 쓰라고 한 곳이다
  for (const c of t.cells) {
    if (!c.text || c.text.length > 24 || /^[○0-9]/.test(c.text) || /예시|아니오|^□|\(\s*\)|~|년\s*$|명\s*$|원\s*$/.test(c.text)) continue; // 확인 칸(□)과 예·아니오 선택 칸은 표시하거나 고르는 곳이라 글자가 바뀐다
    const v = u.cells.find(x => x.row === c.row && x.col === c.col);
    if (!v || !v.text.startsWith(c.text.slice(0, 6))) lost.push(`표 ${oi} (${c.row},${c.col}) 「${c.text}」`);
  }
}
check('원본의 제목·항목 칸 글자가 그대로', lost.length === 0, lost.slice(0, 8).join(' / '));

// 5) 쪽: 빈 쪽·쪽 수
const pages = Number(/Pages:\s+(\d+)/.exec(spawnSync('pdfinfo', [pdf], { encoding: 'utf8' }).stdout)?.[1]);
const blank = [];
for (let p = 1; p <= pages; p += 1) {
  const text = spawnSync('pdftotext', ['-f', String(p), '-l', String(p), '-layout', pdf, '-'], { encoding: 'utf8' }).stdout || '';
  if (text.trim().split(/\s+/).filter(w => !/^-?\d+-?$/.test(w)).length < 6) blank.push(p);
}
check('빈 쪽 없음', blank.length === 0, blank.length ? `빈 쪽: ${blank.join(', ')}` : `${pages}쪽`);

// 6) 내용 유지: 22회, 봉사활동 2회, 가상 표시
const flat = out.tables.flatMap(t => t.cells.map(c => c.text)).join('\n') + '\n' + out.outside.join('\n');
check('청소년 1인 22회 유지', flat.includes(`${sessionTotal('career')}회`) && sessionTotal('career') === 22);
check('봉사활동 2회 유지', /봉사활동: 우리가 만든 진로 정보 나누기/.test(flat) && /2회\/2시간/.test(flat));
check('가상 예시본 표시', flat.includes('가상 설정으로 작성한 예시본입니다 (제출용이 아님)'));
check('지도·사진·직인·서명 자리가 있음', ['자원지도 이미지 자리', '교육 장소 전경 사진 자리', '직인 또는 서명 이미지 자리', '서명 또는 날인 자리'].every(w => flat.includes(w)));

// 7) 예산: 표 안의 소계·합계·총계가 계산과 같은지
const budgets = out.tables.filter(t => t.rows === 22 && t.cols === 5);
check('예산서 표 3개(원본 1 + 복사 2)', budgets.length === 3, `${budgets.length}개`);
if (budgets.length === 3) {
  const cell = (t, r, c) => t.cells.find(x => x.row === r && x.col === c)?.text || '';
  const subs = budgets.flatMap(t => [cell(t, 7, 4), cell(t, 14, 4)].map(num));
  const accountSums = budgets.flatMap(t => [[1, 6], [8, 13]].map(([a, z]) => { let s = 0; for (let r = a; r <= z; r += 1) s += num(cell(t, r, 4)); return s; }));
  check('프로그램별 소계 = 계정과목 금액의 합', subs.every((s, i) => s === accountSums[i]), `${subs.map(x => x.toLocaleString('ko-KR')).join(' / ')}`);
  const last = budgets[2];
  const direct = num(cell(last, 15, 4));
  check('직접사업비 합계 = 프로그램 소계의 합', direct === subs.reduce((a, b) => a + b, 0), `${direct.toLocaleString('ko-KR')}`);
  const total = num(cell(last, 21, 4));
  check('총계 = 직접사업비 + 운영비 + 인건비', total === direct + num(cell(last, 18, 4)) + num(cell(last, 20, 4)), `${total.toLocaleString('ko-KR')}`);
  check('총계 = 계획서 신청액', total === d.budget.total, `${d.budget.total.toLocaleString('ko-KR')}`);
}

// 8) 차이 목록 파일
const lines = [
  '# 원본 양식과 결과물 비교 (자동 검수)', '',
  `원본: 「[양식] 2027년 배움터 맞춤형 지원사업 신청서 양식.hwp」(표 ${orig.tables.length}개) → 결과: 가상 예시본 (표 ${out.tables.length}개, ${pages}쪽)`, '',
  '## 검수', ...checks.map(c => `- ${c.ok ? '통과' : '실패'}: ${c.name}${c.detail ? ` — ${c.detail}` : ''}`), '',
  '## 표 구조 차이', ...(diffs.length ? diffs.map(x => `- [${x.kind}] ${x.text}`) : ['- 없음']), ''
];
fs.writeFileSync(outMd, lines.join('\n'));
console.log(lines.join('\n'));
process.exit(checks.every(c => c.ok) ? 0 : 1);
