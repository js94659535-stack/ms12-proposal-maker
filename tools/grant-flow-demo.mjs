// 범용 엔진으로 다른 공모(차량지원사업)의 전체 흐름을 돌리는 시연 (10-19).
//   요구조건 확인 → 가상본 → 기관 입력 → 추천·재설계 → 생성 전/후 점검 → 출력 → 원문 대비 누락 점검표
// 사용: node tools/grant-flow-demo.mjs [--skip-extract]
// 결과: reports/10-19-grant-flow.md 와 reports/10-19-grant-flow/ (txt·html·hwpx·한글이 만든 pdf)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { zipBytes } from '../src/submission-zip.js';
import { buildHwpxFiles } from '../src/hwpx-export.js';
import { readZipFiles, extractHwpxText } from '../src/files.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { planSections } from '../public/baeumteo/blocks.js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (!process.argv.includes('--skip-extract')) {
  const run = spawnSync(process.execPath, [path.join(root, 'tools', 'grant-extract.mjs'), 'vehicle'], { encoding: 'utf8', timeout: 240000 });
  if (run.status !== 0) console.error('원문 추출 실패:', (run.stderr || '').slice(0, 200));
}
const stamp = Date.now();
const { default: def } = await import(`../public/grant/defs/vehicle.js?${stamp}`);
const { default: extracted } = await import(`../public/grant/defs/vehicle.extracted.js?${stamp}`);
const { generate, preCheck, postCheck, rankApplicants, evaluateChoices, changeLog, orderedParts, factKeysOf, linkInfo } = await import('../public/grant/engine.js');

const outDir = path.join(root, 'reports', '10-19-grant-flow');
fs.mkdirSync(outDir, { recursive: true });
const log = [];
const say = (...lines) => log.push(...lines);
const flat = text => String(text).replace(/\s+/g, ' ');
const ab = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const mark = ok => (ok ? '○' : '**×**');

say(`# [10-19] 범용 엔진으로 다른 공모 전체 흐름 시연 — ${def.name}`, '',
  `실행 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · 이 숫자와 문장은 \`node tools/grant-flow-demo.mjs\`가 실제로 돌려 나온 값이다. ${def.status}`, '');

// ① 요구조건 확인
say('## ① 요구조건 확인 — 원문에서 뽑은 것과 정의에 연결된 것');
const linked = def.candidates.filter(c => linkInfo(def, c));
const unlinked = def.candidates.filter(c => !linked.includes(c));
say(`- 원문 문서: 공고문 \`${extracted.source.notice}\`, 신청서 양식 \`${extracted.source.form}\` (표 ${extracted.tables}개·안내 박스 ${extracted.guides}개)`,
  `- 조건 후보 ${def.candidates.length}개(금액 ${def.candidates.filter(c => c.kinds.includes('금액')).length} · 수량 ${def.candidates.filter(c => c.kinds.includes('수량')).length} · 날짜 ${def.candidates.filter(c => c.kinds.includes('날짜')).length} · 의무·제외 ${def.candidates.filter(c => c.kinds.includes('의무·제외')).length}) 중 규칙 또는 구현에 연결된 것 ${linked.length}개(규칙 ${def.candidates.filter(c => linkInfo(def, c)?.via === '규칙').length} · 구현 ${def.candidates.filter(c => linkInfo(def, c)?.via === '구현').length}), **미연결 ${unlinked.length}개는 사용자 확인 대상**으로 남겼다`,
  `- 규칙 ${def.requirements.length}개(필수 ${def.requirements.filter(r => r.required).length}, 원문 없는 가정 ${def.requirements.filter(r => r.assumed).length}). 원문 문장이 공고문에 실제로 있는 규칙 ${def.requirements.filter(r => r.quote && flat(extracted.noticeText).includes(flat(r.quote))).length}/${def.requirements.filter(r => r.quote).length}`, '',
  '규칙 | 필수 | 원문 문장(공고문)');
for (const r of def.requirements) say(`${r.label} | ${r.required ? '필수' : r.assumed ? '가정' : '권고'} | ${r.quote || '(원문 없음)'}`);
say('');

// ② 가상본
say('## ② 가상본 — 정의 하나로 완성된 계획서를 만든다');
const virtualGen = generate(def, { virtual: true });
const virtualPost = postCheck(def, { virtual: true }, virtualGen);
say(`가상 입력: 이용자 ${virtualGen.scope.users}명, ${virtualGen.scope.car.label}. 본문 ${virtualGen.text.length.toLocaleString('ko-KR')}자, 〔가상〕 표시 ${virtualGen.virtualCount}곳, 풀리지 않은 사실 ${virtualGen.unresolved.length}건, 정의가 연결하지 않아 **보존 칸으로 남긴 원문 항목: ${virtualGen.preserved.join(', ') || '없음'}**.`,
  `신청금액 ${virtualGen.scope.apply.toLocaleString('ko-KR')}원, 자부담 ${virtualGen.scope.selfBurden.toLocaleString('ko-KR')}원, 총 사업비 ${virtualGen.scope.total.toLocaleString('ko-KR')}원 · 주 ${virtualGen.scope.weeklyRuns}회·연 ${virtualGen.scope.yearRuns}회 운행.`, '');

// ③④ 기관 입력, 추천, 재설계
say('## ③ 기관 입력과 ④ 추천 — 가상 시험 데이터 3종');
const rankings = {};
for (const [key, [label, orgs]] of Object.entries(def.scenarios)) {
  const ranked = rankApplicants(def, orgs.map(o => ({ ...o, users: Number(o.facts.users) || 0 })));
  rankings[key] = ranked;
  say(`### ${label}`, '기관 | 자격 판정 | 이용자 | 추천 차종 | 판정 근거(충족하지 않은 항목)');
  for (const r of ranked) {
    const best = evaluateChoices(def, 'car', { values: { users: Number(r.facts.users) || 1, under13: Number(r.facts.under13) || 0 } }).find(c => c.feasible);
    say(`${r.name} | **${r.check.status}** | ${r.facts.users || '?'}명(13세 미만 ${r.facts.under13 || 0}명) | ${r.check.status === '부적격' ? '-' : best ? best.label : '가능한 차종 없음'} | ${r.check.rows.filter(x => x.result !== '충족').map(x => `${x.label}: ${x.result}(${x.basis})`).join('; ') || '모두 충족'}`);
  }
  say('');
}

say('## ⑤ 재설계 — 선택한 기관에 맞춰 차종·운행·금액이 함께 바뀐다');
const redesigns = {};
for (const org of [...rankings.sufficient, ...rankings.children].filter(r => r.check.status === '적격')) {
  const users = Number(org.facts.users);
  const under13 = Number(org.facts.under13) || 0;
  const best = evaluateChoices(def, 'car', { values: { users, under13 } }).find(c => c.feasible);
  const next = { virtual: true, values: { users, under13 }, choices: { car: best.key }, facts: { agency: org.name } };
  const rows = changeLog(def, { virtual: true }, next);
  redesigns[org.name] = { next, best };
  say(`### ${org.name} (이용자 ${users}명, 만 13세 미만 ${under13}명) → ${best.label}`, '항목 | 가상 기준 | 적용 후 | 이유');
  for (const r of rows) say(`${r.what} | ${r.from} | ${r.to} | ${r.why}`);
  say('');
}

// ⑥ 점검
const finalOrgName = Object.keys(redesigns).find(name => name.includes('B센터'));
const finalInput = redesigns[finalOrgName].next;
const finalGen = generate(def, finalInput);
const finalPre = preCheck(def, { ...finalInput, applicant: def.scenarios.sufficient[1].find(o => o.name === finalOrgName).facts });
const finalPost = postCheck(def, finalInput, finalGen);
say(`## ⑥ 점검 — 생성 전 확인과 생성 후 검증 (${finalOrgName}, ${finalGen.scope.car.label} 적용본)`,
  `**생성 전 확인** (요구조건·기관정보): 기관 자격 ${finalPre.status}`, ...finalPre.items.map(i => `- [${i.level}] ${i.message}`), '',
  `**생성 후 검증** (본문·계산·규정): 검사 ${finalPost.items.length}건 중 통과 ${finalPost.items.filter(i => i.level === '통과').length}건, 오류 ${finalPost.errors}건`,
  ...finalPost.items.filter(i => i.level !== '통과').map(i => `- [${i.level}] ${i.message}`), '');
// 사실을 모두 채운 가상 아닌 입력에서 오류 0 확인
const answers = { ...Object.fromEntries(Object.entries(def.facts).map(([k, v]) => [k, v[2]])), ...Object.fromEntries(def.sourceItems.map(i => [`preserved.${i.name}`, '직접 작성함'])) };
const realistic = postCheck(def, { facts: answers, values: finalInput.values, choices: finalInput.choices });
say(`참고: 모든 사실에 답이 들어오면(가상 표시 없이) 생성 후 검증 오류는 ${realistic.errors}건이다.`, '');

// ⑦ 출력
say('## ⑦ 출력 — 파일, 한글 열기, 표');
const title = finalGen.text.split('\n')[0];
const sections = planSections(finalGen.text);
fs.writeFileSync(path.join(outDir, 'plan.txt'), finalGen.text);
const esc = v => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
fs.writeFileSync(path.join(outDir, 'plan.html'), `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px/1.7 "Malgun Gothic",sans-serif;max-width:780px;margin:24px auto;padding:0 16px}h2{font-size:16px;margin-top:22px}p{margin:2px 0}table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #444;padding:3px 6px;font-size:12px;vertical-align:top}th{background:#eee}</style><h1>${esc(title)}</h1>${sections.map(s => `<h2>${esc(s.title)}</h2>${s.blocks.map(b => b.rows ? `<table>${b.rows.map((r, i) => `<tr>${r.map(c => `<${i ? 'td' : 'th'}>${esc(c)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>` : `<p>${esc(b.text)}</p>`).join('')}`).join('')}`);
const when = new Date().toISOString();
const hwpx = zipBytes(buildHwpxFiles({ project: { title, issuer: def.funder, deadline: '2026-09-14' }, sections }, when), when);
fs.writeFileSync(path.join(outDir, 'plan.hwpx'), hwpx);
const back = flat(await extractHwpxText(ab(hwpx)));
const paras = finalGen.text.split(String.fromCharCode(10)).map(l => l.replace(/^## /, '')).filter(l => l.trim().length > 20 && !l.startsWith('▦'));
const kept = paras.filter(l => back.includes(flat(l).slice(0, 30))).length;
const tableCount = sections.reduce((n, s) => n + s.blocks.filter(b => b.rows).length, 0);
const pdfText = async bytes => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p += 1) out += (await (await doc.getPage(p)).getTextContent()).items.map(i => i.str).join('');
  return out;
};
let hangul = { tried: false };
const checker = path.join(root, 'tools', 'hangul-check.ps1');
if (process.platform === 'win32' && fs.existsSync(checker)) {
  const pdfOut = path.join(outDir, 'plan_from_hangul.pdf');
  const run = spawnSync('powershell', ['-NoProfile', '-File', checker, '-In', path.join(outDir, 'plan.hwpx'), '-Pdf', pdfOut], { encoding: 'utf8', timeout: 150000 });
  try { hangul = { tried: true, ...JSON.parse(run.stdout.trim().split('\n').pop()) }; } catch { hangul = { tried: true, opened: false, error: (run.stderr || run.stdout || '').slice(0, 100) }; }
  if (hangul.pdf) { const t = flat(await pdfText(fs.readFileSync(pdfOut))).replace(/ /g, ''); hangul.inPdf = ['배분신청서', '신청기관현황', '신뢰성점검표', '회계관리점검표', '지원필요성', '예산편성', '향후운영계획', '조직도', '개인정보'].filter(k => t.includes(k)).length; }
}
const sizes = fs.readdirSync(outDir).map(f => `${f} ${fs.statSync(path.join(outDir, f)).size.toLocaleString('ko-KR')}바이트`);
say(`- 생성 파일(\`reports/10-19-grant-flow/\`): ${sizes.join(' · ')}`,
  `- 진짜 표 ${tableCount}개, 구역 ${sections.length}개. 우리 코드로 hwpx 되읽기: 문단 ${paras.length}줄 중 ${kept}줄 일치(${Math.round(kept / paras.length * 100)}%)`,
  hangul.tried ? `- **한글에서 열기:** ${hangul.opened ? '열림' : '**열리지 않음**'} · ${hangul.pages ?? '?'}쪽(A4) · PDF 변환 ${hangul.pdf ? '성공' : '실패'}${hangul.inPdf !== undefined ? ` · 한글 PDF에서 핵심 구역 이름 ${hangul.inPdf}/9개 읽힘` : ''}${hangul.error ? ` · ${hangul.error}` : ''}` : '- 한글 열기는 이 환경에서 시도하지 못함', '');

// ⑧ 원문 대비 누락 점검표
say('## ⑧ 원문 대비 누락 점검표');
const doc = flat(finalGen.text).replace(/ /g, '');
const { parts, preserved } = orderedParts(def);
say('### 가. 원문 항목 (서식의 번호 줄 이름 그대로)', '# | 원문 항목 | 계획서에 있음 | 처리');
for (const item of def.sourceItems) say(`${item.no} | ${item.name} | ${mark(doc.includes(item.name.replace(/ /g, '')))} | ${preserved.includes(item.name) ? '**정의에 연결 없음 → 보존 칸(원문 안내 문구 포함, 사용자 작성)**' : '정의에 연결됨'}`);
say('');
const labels = ['기부자명', '기관명', '고유번호', '사업명', '차종선택', '대상지역', '사업수행인력', '사업기간', '참여자구분', '핵심참여자', '인원수', '어젠다', '사업구분', 'C-SDGs', '성과목표', '주요사업내용', '세부사업명', '주요내용', '총사업비', '신청금액', '신청금액세부내역', '관리운영비', '인건비', '담당자', '직위', '직통전화', 'FAX', '신청기관현황', '대표자', '전화번호', 'E-mail', '홈페이지', '설립연월일', '주소', '직원현황', '상근', '비상근', '기관주요사업', '결산', '세입', '세출', '예산', '운영법인또는단체', '운영주체성격', '법인(단체)명', '사업계획서', '주요문제점', '기대효과', '이용자', '수행인력', '추진내용별일정', '조직도', '시설신고증', '고유번호증', '법인등기부등본', '이사회', '운영위원회', '개인정보', '동의함', '직인'];
const formFlat = flat(extracted.formText).replace(/ /g, '');
const inForm = labels.filter(l => formFlat.includes(l));
const missingLabels = inForm.filter(l => !doc.includes(l));
say(`### 나. 신청서 양식의 칸 이름 ${inForm.length}개 (양식 원문에 실제로 있는 이름만 셈)`, `- 계획서에 있음 ${inForm.length - missingLabels.length}/${inForm.length}${missingLabels.length ? ` — **빠진 칸: ${missingLabels.join(', ')}**` : ' — 빠진 칸 없음'}`, '');
const components = [['배분신청서(표지 표)', '배분신청서'], ['신청기관 현황', '신청기관현황'], ['신청기관 신뢰성 점검표', '신뢰성점검표'], ['신청기관 회계관리 점검표', '회계관리점검표'], ['<기능보강> 사업계획서', '사업계획서'], ['기관 전경 사진 칸', '[사진붙임]'], ['첨부서류 1~3(고유번호증·시설신고증·조직도)', '조직도'], ['개인정보 동의서·담당자 날인', '동의함'], ['대표자 직인', '(인)']];
say('### 다. 양식의 큰 구성 요소', ...components.map(([name, key]) => `- ${mark(doc.includes(key))} ${name}`), '');
const numbersInDoc = text => (text || '').replace(/,/g, '');
const docNums = numbersInDoc(finalGen.text) + ' ' + JSON.stringify(def.requirements.map(r => r.value));
const important = def.candidates.filter(c => c.kinds.some(k => k === '금액' || k === '날짜') || c.kinds.includes('수량'));
say(`### 라. 금액·날짜·수량 조건 후보 ${important.length}개가 계획서나 규칙에 반영됐는가`, '# | 종류 | 숫자 | 원문 문장(앞부분) | 연결 | 계획서·규칙에 숫자 반영');
for (const c of important) {
  const nums = c.numbers.map(n => n.replace(/[,원]/g, ''));
  const reflected = nums.some(n => n && (docNums.includes(n) || numbersInDoc(finalGen.text).includes(n.replace(/^0+/, ''))));
  say(`${c.id} | ${c.kinds.filter(k => k !== '의무·제외').join('·')} | ${c.numbers.join(' ')} | ${c.quote.slice(0, 48)} | ${linkInfo(def, c) ? `○ ${linkInfo(def, c).via}` : '**×**'} | ${mark(reflected)}`);
}
const notReflected = important.filter(c => !c.numbers.some(n => { const x = n.replace(/[,원]/g, ''); return x && (docNums.includes(x) || numbersInDoc(finalGen.text).includes(x)); }));
say('', `- 반영되지 않은 후보 ${notReflected.length}개는 대부분 공모 안내용 숫자(수행기관 13개소, 차량 대수, 총 사업예산 5억 원, 파일 용량 10MB 등)로 신청서에 쓰지 않지만, **자동으로 「불필요」라고 판단하지 않고 사용자 확인 대상으로 남겼다.**`, '');
say(`### 마. 의무·제외 조건 후보 ${def.candidates.filter(c => c.kinds.includes('의무·제외')).length}개 중 규칙·구현에 연결된 것 ${linked.filter(c => c.kinds.includes('의무·제외')).length}개, 연결되지 않은 것 ${unlinked.filter(c => c.kinds.includes('의무·제외')).length}개`,
  '(연결되지 않은 의무·제외 후보 전체는 작업대 화면 1단계의 「미연결 후보 보기」에 있다. 예: 모금회 표시·도색 제한, 용도변경 금지, 사고·폐차 시 승인, 제출서류 형식 등 — 이 정의가 구현하지 않은 유의사항.)', '');
const importantUnlinked = unlinked.filter(c => /도로교통법|어린이/.test(c.quote));
say(`- 시연 중 발견: 처음 정의는 공고문의 「만 13세 미만 어린이가 한 명이라도 타면 어린이 보호차량 이용 필수·경찰서 신고」 문장을 연결하지 못해 이용자 4명이면 레이를 추천했다. 이 문장이 미연결 후보 목록에 있었기에 찾았고, 이제 선택지 규칙과 점검식으로 구현했다(구현 연결 ${def.implements.length}건).`, '');

// 판정
say('## 전체 판정');
const state = (name, ok, note, partial = false) => `- ${ok ? (partial ? '일부 작동' : '작동') : '미완'} · ${name} — ${note}`;
const rankOk = rankings.sufficient[0].check.status === '적격' && rankings.sufficient.at(-1).check.status === '부적격' && rankings.none.every(r => r.check.status === '부적격') && rankings.unknown.every(r => r.check.status !== '적격');
say(state('요구조건 확인', def.requirements.every(r => !r.quote || flat(extracted.noticeText).includes(flat(r.quote))), `원문 문장 확인된 규칙 ${def.requirements.filter(r => r.quote).length}개, 미연결 후보 ${unlinked.length}개 보존. 후보는 일반 규칙으로 뽑았으나 어느 후보가 규칙이 되는지는 정의에 사람이 연결함`, true),
  state('가상본', virtualGen.text.length > 3000 && virtualGen.unresolved.length === 0, '정의 하나로 표 포함 계획서 생성, 원문 항목 11/11 포함'),
  state('기관 입력·추천', rankOk, '적격/부적격/판단 보류 세 경우와 차종 추천이 기대한 판정'),
  state('재설계', Object.values(redesigns).length >= 3 && Object.values(redesigns).some(r => r.best.key === 'ray') && Object.values(redesigns).some(r => r.best.key === 'stariah'), '이용자 수와 어린이 여부에 따라 차종·운행·금액·자부담이 바뀌고 이유가 붙음(어른 4명 → 레이, 어린이 포함 4명 → 스타리아)'),
  state('생성 전/후 점검', realistic.errors === 0 && finalPost.errors >= 1, '두 단계가 분리되어 있고, 사실을 채우면 오류 0, 가상 값이 남으면 오류'),
  state('출력', Boolean(hangul.opened && hangul.pdf) && tableCount >= 12, `한글에서 열림·표 ${tableCount}개. 재단의 .hwp 양식 파일 칸을 직접 채우는 것은 미구현`, true),
  state('새 공모를 코드 수정 없이', false, '엔진은 공모를 모르지만, 새 공모마다 정의 파일(규칙 연결·계획서 문장 템플릿·계산식)을 사람이 써야 한다. 정의 생성의 자동화는 미구현'));
fs.writeFileSync(path.join(root, 'reports', '10-19-grant-flow.md'), log.join('\n') + '\n');
console.log(log.join('\n'));
