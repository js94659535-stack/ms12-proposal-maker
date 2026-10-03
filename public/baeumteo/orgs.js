// 실제 기관정보에 따른 조합 재평가 (10-16). 진로설계를 첫 기준 사례로 만들었고 다섯 사업에 같은 틀을 쓴다.
//
// 원칙
//  · 기관별로 신청자격·모집 가능 인원·전문인력·장소·운영 가능 기간·협력 의사·증빙 상태를 입력받는다.
//  · 필수 조건을 어기면 그 조합은 추천에서 빠진다(불가). 필수 값이 비어 있으면 「판단 보류」다.
//  · 상·중·하로 뭉뚱그리지 않는다. 항목마다 충족/미충족/미확인과 그 근거 문장을 보여 준다.
//  · 협력 의사가 「확정」이 아니면 후보일 뿐이다. 기관 정보가 없는 항목은 지어내지 않는다.
// 이 모듈은 programs.js의 반 수 계산만 가져다 쓴다.
import { classesFor } from './programs.js?v=1017';

export const MIN_PEOPLE = 15;
export const FIELD_OPTIONS = {
  nonprofit: [['', '모름'], ['yes', '비영리 기관(단체)이다'], ['no', '비영리가 아니다']],
  registered: [['', '모름'], ['yes', '법인·고유번호증 있음'], ['no', '아직 없음']],
  venue: [['', '모름'], ['yes', '교육 장소가 있다'], ['no', '장소가 없다']],
  intent: [['', '모름'], ['confirmed', '참여 확정'], ['likely', '긍정적(미확정)'], ['none', '참여 안 함']],
  proof: [['', '모름'], ['yes', '증빙 있음'], ['partial', '일부 있음'], ['no', '증빙 없음']]
};

const num = value => (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) ? null : Number(value);
export function normalizeOrg(org = {}) {
  return {
    name: String(org.name || '').trim(),
    nonprofit: org.nonprofit || '', registered: org.registered || '', venue: org.venue || '', intent: org.intent || '', proof: org.proof || '',
    students: num(org.students), staff: num(org.staff), months: num(org.months)
  };
}

// 사업마다 다른 필수 조건. minMonths는 진로설계(4개월 이상 지속 참여).
const NEEDS = {
  career: { minMonths: 4, label: '진로설계' },
  community: { minOrgs: 3, minStudentOrgs: 2, label: '지역공동체' }
};

const mark = (result, item, basis, required = false) => ({ item, result, basis, required });

// 한 조합(대표 + 참여)을 평가한다. 근거 문장을 항목마다 남긴다.
export function evaluateCombo(project, leadInput, participantInputs, planned) {
  const lead = normalizeOrg(leadInput);
  const parts = participantInputs.map(normalizeOrg);
  const members = [lead, ...parts];
  const need = NEEDS[project.id] || {};
  const checks = [];

  // 1) 대표기관 신청자격
  checks.push(lead.nonprofit === 'yes' ? mark('충족', '대표기관 신청자격', `${lead.name}: 비영리 기관(단체)로 입력됨`, true)
    : lead.nonprofit === 'no' ? mark('미충족', '대표기관 신청자격', `${lead.name}: 비영리가 아니라고 입력됨 — 재단 신청자격은 비영리 기관(단체)`, true)
    : mark('미확인', '대표기관 신청자격', `${lead.name}: 비영리 여부를 모름 — 법인 형태를 확인해야 함`, true));
  // 2) 법인·고유번호증 (미인가도 신청 가능, 선정되면 지급 전까지 발급)
  checks.push(lead.registered === 'yes' ? mark('충족', '법인·고유번호증', `${lead.name}: 있음`)
    : lead.registered === 'no' ? mark('미충족', '법인·고유번호증', `${lead.name}: 없음 — 신청은 가능하나 선정되면 지원금 지급 전까지 발급받아야 함`)
    : mark('미확인', '법인·고유번호증', `${lead.name}: 모름`));
  // 3) 모집 가능 학생 합계 (필수: 전체 15명 이상)
  const known = members.filter(m => m.students !== null);
  const unknown = members.filter(m => m.students === null);
  const total = known.reduce((sum, m) => sum + m.students, 0);
  const breakdown = known.map(m => `${m.name} ${m.students}명`).join(' + ') || '입력 없음';
  if (unknown.length) checks.push(mark('미확인', '모집 가능 학생', `확인된 합계 ${total}명(${breakdown}). 미입력: ${unknown.map(m => m.name).join(', ')}`, true));
  else checks.push(total >= MIN_PEOPLE ? mark('충족', '모집 가능 학생', `합계 ${total}명 = ${breakdown} (사업 전체 ${MIN_PEOPLE}명 이상)`, true)
    : mark('미충족', '모집 가능 학생', `합계 ${total}명 = ${breakdown} — 사업 전체 ${MIN_PEOPLE}명에 못 미침`, true));
  // 4) 계획 인원 대비 (안내)
  if (known.length) checks.push(total >= planned ? mark('충족', '계획 인원 대비', `계획 ${planned}명을 채울 수 있음`) : mark('안내', '계획 인원 대비', `계획 ${planned}명보다 ${planned - total}명 적음 — 적용하면 인원을 ${Math.max(total, MIN_PEOPLE)}명으로 줄여 다시 짠다`));
  // 5) 전문인력(교강사) — 반 수만큼 필요
  const effective = Math.max(MIN_PEOPLE, Math.min(total || planned, planned));
  const classes = classesFor(project.id, effective);
  const staffKnown = members.filter(m => m.staff !== null);
  const staff = staffKnown.reduce((sum, m) => sum + m.staff, 0);
  if (staffKnown.length < members.length) checks.push(mark('미확인', '전문인력', `교강사 ${classes}명이 필요(반 ${classes}개). 확인된 인력 ${staff}명, 미입력: ${members.filter(m => m.staff === null).map(m => m.name).join(', ')}`));
  else checks.push(staff >= classes ? mark('충족', '전문인력', `필요 ${classes}명 ≤ 보유 ${staff}명`) : mark('미충족', '전문인력', `필요 ${classes}명, 보유 ${staff}명 — 강사 모집 계획(서식 4)이 필요`));
  // 6) 교육 장소
  const venueYes = members.filter(m => m.venue === 'yes');
  const venueUnknown = members.filter(m => m.venue === '');
  checks.push(venueYes.length ? mark('충족', '교육 장소', `${venueYes.map(m => m.name).join(', ')}에 장소가 있음`)
    : venueUnknown.length ? mark('미확인', '교육 장소', `장소 여부를 모르는 기관: ${venueUnknown.map(m => m.name).join(', ')}`)
    : mark('미충족', '교육 장소', '모든 기관에 장소가 없음 — 공간 확보 계획을 서식 3에 써야 함'));
  // 7) 운영 가능 기간
  const monthsKnown = members.filter(m => m.months !== null);
  const shortest = monthsKnown.length ? Math.min(...monthsKnown.map(m => m.months)) : null;
  if (need.minMonths) {
    checks.push(monthsKnown.length < members.length ? mark('미확인', '운영 가능 기간', `${need.label}은 4개월 이상 지속 참여가 필요. 미입력: ${members.filter(m => m.months === null).map(m => m.name).join(', ')}`, true)
      : shortest >= need.minMonths ? mark('충족', '운영 가능 기간', `가장 짧은 기관이 ${shortest}개월(4개월 이상 필요)`, true)
      : mark('미충족', '운영 가능 기간', `가장 짧은 기관이 ${shortest}개월 — 4개월 미만`, true));
  } else if (monthsKnown.length) {
    checks.push(shortest >= 11 ? mark('충족', '운영 가능 기간', `가장 짧은 기관이 ${shortest}개월`) : mark('미확인', '운영 가능 기간', `가장 짧은 기관이 ${shortest}개월 — 교육은 2027. 3.~2028. 1.(11개월)`));
  }
  // 8) 협력 의사 (참여기관)
  for (const part of parts) {
    checks.push(part.intent === 'confirmed' ? mark('충족', '협력 의사', `${part.name}: 참여 확정`)
      : part.intent === 'likely' ? mark('미확인', '협력 의사', `${part.name}: 긍정적이나 확정 아님 — 후보로만 취급`)
      : mark('미확인', '협력 의사', `${part.name}: 의사를 모름 — 후보로만 취급`));
  }
  // 9) 증빙
  checks.push(lead.proof === 'yes' ? mark('충족', '운영 실적 증빙', `${lead.name}: 증빙 있음`)
    : lead.proof === 'partial' ? mark('미확인', '운영 실적 증빙', `${lead.name}: 일부만 있음 — 기간·인원·성과를 확인할 자료를 더 모아야 함`)
    : lead.proof === 'no' ? mark('미충족', '운영 실적 증빙', `${lead.name}: 증빙 없음 — 실적을 근거로 쓰기 어려움`)
    : mark('미확인', '운영 실적 증빙', `${lead.name}: 증빙 상태를 모름`));
  // 10) 지역공동체: 인접 3개 이상, 학생이 있는 배움터 2곳 이상
  if (need.minOrgs) {
    checks.push(members.length >= need.minOrgs ? mark('충족', '기관 수', `${members.length}곳 (인접 3곳 이상 필요, 인접 여부는 별도 확인)`, true) : mark('미충족', '기관 수', `${members.length}곳 — 인접한 3개 이상이 필요`, true));
    const withStudents = members.filter(m => m.students !== null && m.students > 0).length;
    const stillUnknown = members.some(m => m.students === null);
    checks.push(withStudents >= need.minStudentOrgs ? mark('충족', '학생이 등록된 배움터', `${withStudents}곳 (2곳 이상 필요)`, true)
      : stillUnknown ? mark('미확인', '학생이 등록된 배움터', `확인된 곳 ${withStudents}곳, 학생 수 미입력 기관이 있음`, true)
      : mark('미충족', '학생이 등록된 배움터', `${withStudents}곳 — 2곳 이상 필요`, true));
  }

  // 상태: 필수 항목 기준으로 불가 > 판단 보류, 나머지는 조건부/실행 가능
  const required = checks.filter(c => c.required);
  let status;
  if (required.some(c => c.result === '미충족')) status = '불가';
  else if (required.some(c => c.result === '미확인')) status = '판단 보류';
  else if (checks.some(c => c.result === '미충족' || c.result === '미확인')) status = '조건부 가능';
  else status = '실행 가능';
  return { status, checks, students: total, studentsKnownAll: unknown.length === 0, members: members.map(m => m.name), planned, classes };
}

const RANK = { '실행 가능': 0, '조건부 가능': 1, '판단 보류': 2, '불가': 3 };

// 입력한 기관들로 만들 수 있는 조합을 평가해 추천 순으로 돌려준다. 제외된 기관과 그 까닭도 함께.
export function recommendCombos(project, orgInputs, planned) {
  const orgs = orgInputs.map(normalizeOrg).filter(org => org.name);
  const excluded = [];
  const usable = [];
  for (const org of orgs) {
    if (org.intent === 'none') excluded.push({ name: org.name, reason: '참여 의사가 없다고 입력됨' });
    else usable.push(org);
  }
  const combos = [];
  const seen = new Set();
  const addCombo = (lead, others, label) => {
    const key = [lead.name, ...others.map(o => o.name).sort()].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    combos.push({ id: `c${combos.length + 1}`, label, lead: lead.name, participants: others.map(o => o.name), ...evaluateCombo(project, lead, others, planned) });
  };
  for (const lead of usable) {
    if (lead.nonprofit === 'no') { excluded.push({ name: lead.name, reason: '대표기관으로는 제외 — 비영리 기관(단체)가 아니라고 입력됨(참여기관으로는 가능)' }); continue; }
    const others = usable.filter(o => o !== lead);
    addCombo(lead, others.filter(o => o.intent === 'confirmed'), `${lead.name} 대표 + 참여 확정 기관`);
    addCombo(lead, others, `${lead.name} 대표 + 입력한 모든 기관`);
    addCombo(lead, [], `${lead.name} 단독`);
  }
  // 대표가 될 수 없는 기관(비영리 아님)도 다른 대표 아래 참여기관으로는 평가되었다.
  combos.sort((a, b) => RANK[a.status] - RANK[b.status] || Math.abs(a.students - planned) - Math.abs(b.students - planned) || a.members.length - b.members.length);
  return { combos, excluded, hold: orgs.length === 0 };
}

// 조합을 고르면 입력(대표·참여기관 슬롯·인원·기간)과 기관별 역할을 만든다. 왜 그렇게 바뀌는지 이유도 남긴다.
export function applyCombo(project, combo, orgInputs, maxPeople) {
  const orgs = new Map(orgInputs.map(normalizeOrg).map(org => [org.name, org]));
  const partners = {};
  const extra = [];
  combo.participants.forEach((name, index) => { const slot = project.slots[index]; if (slot) partners[slot.key] = name; else extra.push(name); });
  const known = combo.studentsKnownAll ? combo.students : null;
  const people = known === null ? null : Math.max(MIN_PEOPLE, Math.min(known, maxPeople));
  const months = [...combo.members].map(name => orgs.get(name)?.months).filter(m => m !== null && m !== undefined);
  const shortest = months.length === combo.members.length ? Math.min(...months) : null;
  const roles = combo.members.map((name, index) => {
    const org = orgs.get(name);
    const parts = [index === 0 ? '대표기관: 신청·정산·보고, 교육 총괄' : (combo.participants.includes(name) ? '참여기관' : '참여기관')];
    if (org?.students) parts.push(`학생 ${org.students}명 모집`);
    if (org?.venue === 'yes') parts.push('교육 장소 제공');
    if (org?.staff) parts.push(`교강사 ${org.staff}명 지원`);
    if (index > 0) parts.push(org?.intent === 'confirmed' ? '참여 확정' : '참여 의사 미확정(후보)');
    return `${name}: ${parts.join(' · ')}`;
  });
  return {
    lead: combo.lead, partners, people: people === null ? '' : String(people),
    applied: {
      comboId: combo.id, label: combo.label, extra, roles, months: shortest,
      why: {
        people: people === null ? '' : `확보 가능한 학생 합계 ${combo.students}명에 맞춤(${combo.members.length}개 기관의 모집 가능 인원을 합산)`,
        union: `선택한 조합의 기관 수(${combo.members.length}곳)`,
        months: shortest === null ? '' : `가장 짧게 운영할 수 있는 기관이 ${shortest}개월이라 일정을 그 안으로 맞춤`
      }
    }
  };
}

// 가상 시험 데이터. 이름 앞에 〔가상〕이 붙고 실제 기관이 아니다.
export const SCENARIOS = {
  sufficient: ['기관 충분', [
    { name: '〔가상〕A기관(대표 후보)', nonprofit: 'yes', registered: 'yes', students: 14, staff: 2, venue: 'yes', months: 7, intent: 'confirmed', proof: 'yes' },
    { name: '〔가상〕B센터', nonprofit: 'yes', registered: 'yes', students: 16, staff: 1, venue: 'yes', months: 7, intent: 'confirmed', proof: 'partial' },
    { name: '〔가상〕C학교', nonprofit: 'yes', registered: 'yes', students: 12, staff: 1, venue: 'yes', months: 6, intent: 'confirmed', proof: 'yes' }
  ]],
  shortage: ['모집 인원 부족', [
    { name: '〔가상〕A기관(대표 후보)', nonprofit: 'yes', registered: 'yes', students: 6, staff: 1, venue: 'yes', months: 7, intent: 'confirmed', proof: 'yes' },
    { name: '〔가상〕B센터', nonprofit: 'yes', registered: 'yes', students: 5, staff: 1, venue: 'no', months: 7, intent: 'confirmed', proof: 'no' }
  ]],
  unconfirmed: ['자격·의사 미확인', [
    { name: '〔가상〕A기관(대표 후보)', nonprofit: '', registered: '', students: 18, staff: null, venue: '', months: null, intent: 'confirmed', proof: '' },
    { name: '〔가상〕B센터', nonprofit: 'yes', registered: 'yes', students: 12, staff: 1, venue: 'yes', months: 5, intent: '', proof: 'partial' },
    { name: '〔가상〕D단체', nonprofit: 'no', registered: 'no', students: 10, staff: 1, venue: 'yes', months: 7, intent: 'likely', proof: 'no' },
    { name: '〔가상〕E기관', nonprofit: 'yes', registered: 'yes', students: 9, staff: 1, venue: 'yes', months: 7, intent: 'none', proof: 'yes' }
  ]]
};
