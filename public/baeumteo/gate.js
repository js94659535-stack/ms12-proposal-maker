// 출력 모드와 최종 제출 게이트 (10-27).
// 예시본: 작성 예시·확인 필요 허용 · 작업 초안: 2차 확인·임시 사용 허용 · 검토본: 미확인 목록을 함께 출력 · 최종 제출본: 아래 조건을 모두 통과해야 한다.
import { EVIDENCE, CLAIMS, ATTACHMENTS, claimBlocker } from './evidence.js?v=1017';
import { derive } from './career-final.js?v=1017';
import { RULES, sessionTotal, META } from './programs.js?v=1017';

export const MODES = ['예시본', '작업 초안', '검토본', '최종 제출본'];

// 교차검증: 인원·회기·예산·한도가 서로 맞는가
export function crossChecks(setting = {}) {
  const d = derive(setting);
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok, detail });
  add('모집 인원 합 = 참여 인원', d.own + d.p1 + d.p2 === d.N, `${d.own}+${d.p1}+${d.p2} / ${d.N}`);
  add('반 인원 합 = 참여 인원', d.sizes.reduce((a, b) => a + b, 0) === d.N, d.sizes.join('+'));
  add('청소년 1인 교육 12회 이상', sessionTotal('career') >= 12, `${sessionTotal('career')}회`);
  add('교육 4개월 이상', META.career.educationMonths >= 4, `${META.career.educationMonths}개월`);
  add('신청액 한도 25,000,000원 이하', d.budget.total <= 25_000_000, `${d.budget.total}`);
  add('예산 규정 경고 없음', d.budget.warnings.length === 0, d.budget.warnings.join(' / ') || '없음');
  add('인건비·운영비 25% 이하', d.budget.shares.admin <= RULES.adminShare, `${(d.budget.shares.admin * 100).toFixed(1)}%`);
  add('체험·견학성 15% 이하', d.budget.shares.outing <= RULES.outingShare, `${(d.budget.shares.outing * 100).toFixed(1)}%`);
  return out;
}

// 제출 게이트. blockers가 하나라도 있으면 「최종 제출본」 표시를 붙일 수 없다.
// 차단은 「범주」와 그 안의 「항목」으로 센다(범주 수·항목 수를 함께 보고). data로 근거·주장·첨부를 바꿔 검사할 수 있다.
export function submissionGate(setting = {}, data = {}) {
  const { evidence = EVIDENCE, claimList = CLAIMS, attachments = ATTACHMENTS, fileCheck } = data;
  const blockers = [];
  const targets = new Set(); // 고유한 미해결 대상
  let violations = 0;      // 차단 규칙 위반 건수(한 대상이 두 규칙에 걸리면 2건)
  const count = (kind, list, key) => { for (const x of list) targets.add(`${kind}:${key(x)}`); violations += list.length; return list.length; };
  const temp = evidence.filter(e => e.usage === '본문 임시 사용');
  if (count('근거', temp, e => e.id)) blockers.push(`본문 임시 사용 ${temp.length}건: ${temp.map(e => e.title).join('; ')}`);
  const needed = evidence.filter(e => e.verification === '확인 필요' && e.usage.startsWith('본문'));
  if (count('근거', needed, e => e.id)) blockers.push(`본문에 쓰인 확인 필요 ${needed.length}건: ${needed.map(e => e.title).join('; ')}`);
  const example = evidence.filter(e => e.kind === '작성예시' && e.usage.startsWith('본문'));
  if (count('근거', example, e => e.id)) blockers.push(`작성 예시 사실값 ${example.length}건: ${example.map(e => e.title).join('; ')}`);
  const claims = claimList.map(c => ({ c, why: claimBlocker(c, fileCheck) })).filter(x => x.why);
  if (count('주장', claims, x => x.c.id)) blockers.push(`최종 통과 못 하는 사실 주장 ${claims.length}건: ${claims.map(x => `${x.c.text} [${x.why}]`).join('; ')}`);
  const att = attachments.filter(a => !a.done);
  if (count('첨부', att, a => a.id)) blockers.push(`미첨부 ${att.length}건: ${att.map(a => a.text).join('; ')}`);
  const bad = crossChecks(setting).filter(c => !c.ok);
  if (count('교차검증', bad, c => c.name)) blockers.push(`교차검증 실패 ${bad.length}건: ${bad.map(c => c.name).join('; ')}`);
  return { pass: blockers.length === 0, blockers, categories: blockers.length, targets: targets.size, violations, checks: crossChecks(setting) };
}

// 모드별 허용 여부
export function modeAllowed(mode, setting = {}, data = {}) {
  if (mode !== '최종 제출본') return { ok: true, blockers: [] };
  const g = submissionGate(setting, data);
  return { ok: g.pass, blockers: g.blockers, categories: g.categories, targets: g.targets, violations: g.violations };
}

// 검토본·작업 초안에 붙이는 미확인 목록
export function reviewList() {
  const lines = [];
  for (const e of EVIDENCE.filter(x => x.verification !== '원문 확인')) lines.push(`- [근거] ${e.title} — 검증: ${e.verification}, 사용: ${e.usage}; ${e.note || ''}`);
  for (const c of CLAIMS) lines.push(`- [사실] ${c.text} — ${c.isExample ? '작성 예시' : '실제 주장'}, 검증: ${c.verification}, 증빙 수준: ${c.proofLevel}(${c.proof})`);
  for (const a of ATTACHMENTS) lines.push(`- [첨부] ${a.text} — ${a.done ? '완료' : '미완료'}`);
  return lines;
}
