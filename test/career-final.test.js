// 진로설계 「완성된 가상 사업계획서」 (10-20) — 본문이 안내문이 아니라 완성된 계획서인지, 숫자가 서로 맞는지,
// 기본정보만 바꿔도 문서 전체가 바뀌는지를 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { careerBody, careerGuide, derive, DEFAULT_SETTING, SETTING_FIELDS } from '../public/baeumteo/career-final.js';
import { budgetFor, RULES, sessionTotal, META } from '../public/baeumteo/programs.js';

const body = careerBody({});
const section = (text, from, to) => text.slice(text.indexOf(from), to ? text.indexOf(to) : undefined);
const cells = line => line.replace(/^▦-? /, '').split(' | ');
const tableLines = text => text.split('\n').filter(l => l.startsWith('▦'));

test('★ 본문에는 작성 안내·검토 메모·빈칸·가상 표시가 없다 (그런 것은 별도 안내서에 있다)', () => {
  const banned = ['[확인 필요', '〔가상〕', '{{', '}}', '사용자가', '작성한다', '첨부한다', '붙인다', '안전하다', '권한다', '검토', 'undefined', 'NaN', '- 가상', '이 줄은'];
  const found = banned.filter(word => body.replace('(이 줄은 제출 전에 지웁니다.)', '').includes(word));
  assert.deepEqual(found, [], `본문에 남은 말: ${found}`);
  assert.ok(body.includes('이 문서는 가상 설정으로 쓴 예시본'), '가상 설정이라는 사실은 첫머리 한 줄로만 밝힌다');
  assert.ok(careerGuide({}).includes('제출하지 않는 문서'));
});

test('★ 대상 선정 이유와 지원 방법이 설명문으로 쓰여 있다 (작성자 메모가 아니다)', () => {
  assert.match(body, /모든 반을 서로 섞어 편성해 어떤 청소년도 따로 구분되지 않게 한다/);
  assert.match(body, /면담에서는 과거 이력을 묻지 않고/);
  assert.ok(!body.includes('통합 구성'), '검토 메모 표현');
});

test('★ 필요성·교육활동·역할·평가·후속 운영·예산이 모두 구체적으로 있다', () => {
  for (const part of ['지역 교육자원 현황', '참여 예정 아동·청소년', '사회경제적 현황', '교육목표', '프로젝트 및 교육프로그램 운영 개요', '수업 장면 ①', '수업 장면 ②', '수업 장면 ③', '핵심 교육내용(월별)', '교육 장소', '기반 활동', '후속 운영 계획', '평가와 환류', '안전과 아동보호', '<서식 4>', '<서식 5>']) {
    assert.ok(body.includes(part), `${part}이 없다`);
  }
  assert.ok(body.length > 12000, `분량 ${body.length}`);
  const followUp = section(body, '후속 운영 계획:', '<서식 4>');
  assert.match(followUp, /자체 예산/);
  assert.match(followUp, /멘토/);
  assert.ok(!/직접 쓴다|사용자/.test(followUp));
});

test('★ 학생의 유사 프로그램 경험에는 학생 경험만 있고 기관의 7년 경력은 자기소개·수행역량에만 있다', () => {
  const experience = section(body, '4) 참여 예정 아동·청소년의 유사 프로그램 참여 경험', '## 6. 교육목표');
  assert.ok(!experience.includes('7년'), '학생 경험 칸에 기관 경력');
  assert.match(experience, /마음쉼터/);
  assert.match(section(body, '3. 대표자 자기소개서', '<서식 2>'), /7년째 운영/);
  assert.match(section(body, '2. 대표기관 및 참여기관 운영 현황', '외부지원 현황'), /학교폭력 특별교육 위탁 운영\(7년\)/);
});

test('★ 인원 구성이 모집표·반 구성·사회경제 현황·학년 표에서 모두 같은 합이다', () => {
  const d = derive({});
  assert.equal(d.own + d.p1 + d.p2, d.N);
  const recruit = tableLines(section(body, '1) 모집 계획', '2) 선발기준'));
  const pcts = recruit.slice(1).map(l => Number(/\((\d+)%\)/.exec(cells(l)[1])[1]));
  assert.equal(pcts.length, 3);
  assert.equal(pcts[0] + (/\((\d+)%\)/g.exec(cells(recruit[2])[1]) ? Number(/\((\d+)%\)/.exec(cells(recruit[2])[1])[1]) : 0) + pcts[2], 100, '기관 내 + 타 기관 + 공개모집 = 100%');
  assert.ok(recruit[2].includes(`${d.partner1 ?? DEFAULT_SETTING.partner1} ${d.p1}명`));
  assert.equal(d.sizes.reduce((a, b) => a + b, 0), d.N);
  for (const [i, c] of d.classes.entries()) assert.equal(c.comp.reduce((a, b) => a + b, 0), d.sizes[i]);
  assert.equal(d.grade.reduce((a, b) => a + b, 0), d.N);
  assert.equal(d.low + d.migrant + d.referred, d.N);
  for (const group of [d.region, d.housing, d.jobs]) assert.equal(group.reduce((a, b) => a + b, 0), d.N);
  const gradeRow = tableLines(body).find(l => l.startsWith('▦ 학생 수(명) | ' + d.grade[0]));
  assert.ok(gradeRow && cells(gradeRow).at(-1) === String(d.N), '학년 표의 합계');
  assert.match(body, new RegExp(`모집은 ${d.N}명|전체 ${d.N}명 중`));
  assert.ok(body.includes(d.classes.map((cl, i) => `${i + 1}반 ${cl.size}명(${cl.text})`).join(', ')), '반 구성 문장');
});

test('★ 회의 횟수는 교육 기간에 맞는다 — 자치회의 7회, 교강사 회의 8회, 예산의 회의 식비도 8회', () => {
  const d = derive({});
  assert.equal(d.months, 7);
  assert.equal(d.meetings, d.months + 1);
  const foundation = section(body, '## 9. 효과적인 사업 운영을 위한 기반 활동 계획', '수업 질 관리');
  assert.match(foundation, /아동·청소년 자치회의 \| 7회/);
  assert.match(foundation, /교강사 전체 회의 \| 8회/);
  const mealRow = tableLines(body).find(l => l.includes('교강사 회의 식비'));
  assert.match(mealRow, /×8회/);
});

test('★ 예산: 표의 줄 합 = 총계 = 신청액이고, 재단 규정(한도·비율)을 모두 지킨다', () => {
  const d = derive({});
  const lines = tableLines(section(body, '<서식 5>', '※ 아래는'));
  const detail = lines.slice(1, -1).filter(l => !['소계', '합계'].includes(cells(l)[2]));
  const amounts = detail.map(l => Number(cells(l).at(-1).replace(/,/g, '')));
  assert.ok(lines.filter(l => cells(l)[2] === '소계').length >= 5 && lines.some(l => cells(l)[2] === '합계'), '원본 서식 5의 소계·합계 줄');
  const total = Number(cells(lines.at(-1)).at(-1).replace(/,/g, ''));
  assert.equal(amounts.reduce((a, b) => a + b, 0), total);
  assert.equal(total, d.budget.total);
  assert.match(body, new RegExp(`신청액은 ${total.toLocaleString('ko-KR')}원이다`));
  for (let n = 20; n <= 50; n += 1) {
    const b = budgetFor('career', n, { cap: 25_000_000 });
    assert.deepEqual(b.warnings, [], `${n}명: ${b.warnings}`);
    assert.ok(b.shares.outing <= RULES.outingShare && b.shares.admin <= RULES.adminShare && b.shares.materials <= RULES.materialsShare, `${n}명 비율`);
  }
  assert.ok(careerGuide({}).includes('체험·견학성 지출(버스·입장·체험료)') && careerGuide({}).includes('충족'));
});

test('★ 42명의 포트폴리오는 반별 주강사 1명, 보조강사 1명, 멘토가 맡는다 (한 사람이 혼자 지도하지 않는다)', () => {
  const d = derive({});
  const people = section(body, '<서식 4>', '<서식 5>');
  assert.equal((people.match(/반 주강사/g) || []).length, d.C);
  assert.equal((people.match(/반 보조강사/g) || []).length, d.C);
  assert.match(people, new RegExp(`${d.mentors}명\\(청소년 7명당 1명\\)`));
  assert.match(people, /주강사 1명, 보조강사 1명, 멘토 1명이 연결된다/);
  const budgetRows = tableLines(section(body, '<서식 5>', '※ 아래는')).filter(l => l.includes('포트폴리오 동아리'));
  assert.ok(budgetRows.some(l => l.includes('보조강사')), '예산에도 보조강사비');
  assert.equal(sessionTotal('career'), 22);
});

test('★ 기본정보만 바꾸면 문서 전체의 같은 이름이 함께 바뀌고 옛 이름은 남지 않는다', () => {
  const fields = SETTING_FIELDS.filter(([key]) => key !== 'people');
  for (const [key] of fields) {
    if (['phone', 'fax', 'email', 'address'].includes(key)) continue; // 연락처는 서식에 직접 쓰이지 않을 수 있다
    assert.ok(body.includes(DEFAULT_SETTING[key]), `기본값 ${key}(${DEFAULT_SETTING[key]})가 본문에 없다`);
  }
  const changed = careerBody({ agency: '햇살청소년센터', rep: '박누리', manager: '김도현', partner1: '새봄청소년수련관', partner2: '한빛중학교' });
  for (const old of [DEFAULT_SETTING.agency, DEFAULT_SETTING.rep, DEFAULT_SETTING.manager, DEFAULT_SETTING.partner1, DEFAULT_SETTING.partner2]) assert.ok(!changed.includes(old), `옛 이름이 남았다: ${old}`);
  for (const next of ['햇살청소년센터', '박누리', '김도현', '새봄청소년수련관', '한빛중학교']) assert.ok(changed.includes(next));
  assert.ok((changed.match(/햇살청소년센터/g) || []).length >= 8, '기관명이 여러 곳에 쓰인다');
});

test('★ 인원을 30명으로 바꾸면 반·멘토·모집·사회경제 표·산출물·성과 목표·예산이 함께 바뀐다', () => {
  const a = careerBody({});
  const b = careerBody({ people: 30 });
  const d = derive({ people: 30 });
  assert.equal(d.C, 2);
  assert.equal(d.mentors, 5);
  assert.ok(b.includes('전체 30명') && !b.includes('전체 42명'));
  assert.ok(b.includes('포트폴리오 30부') || b.includes('포트폴리오 30'), '산출물 수');
  assert.match(b, /인터뷰 기록 60건/);
  assert.match(b, /출석하는 청소년 26명 이상/);
  assert.match(b, /2개 반/);
  assert.notEqual(derive({ people: 30 }).budget.total, derive({}).budget.total);
  assert.match(b, new RegExp(`신청액은 ${d.budget.total.toLocaleString('ko-KR')}원이다`));
  assert.ok(!/42명/.test(b.replace(/42명 중/g, '')), '옛 인원이 남지 않는다');
  assert.ok(a.length > 0 && a !== b);
});

test('안내서는 가상 설정, 바꿀 곳, 확인할 사실(번호), 규정 점검을 갖는다', () => {
  const guide = careerGuide({});
  for (const part of ['## 1. 가상 설정 한눈에', '## 2. 대표님이 바꿀 곳', '## 3. 달라지는 점', '## 4. 실제 사실을 확인해야 하는 것', '## 5. 제출 전 규정 점검']) assert.ok(guide.includes(part), part);
  assert.equal((guide.match(/^\d+\. /gm) || []).length, 15, '확인할 사실 15건');
  for (const [, label] of SETTING_FIELDS) assert.ok(guide.includes(label), `바꿀 곳: ${label}`);
  assert.ok(META.career.meetings === 8);
});

test('★ 근거자료 등록부: 출처가 있다는 것과 원문을 확인했다는 것을 나누고, 본문의 지역 통계는 참여자 수와 구분되며, 안내서는 같은 등록부에서 나온다', async () => {
  const { EVIDENCE, REQUIRED_FOR_VALUE, cited } = await import('../public/baeumteo/evidence.js');
  for (const e of EVIDENCE.filter(x => x.value)) {
    for (const key of REQUIRED_FOR_VALUE.filter(k => k !== 'insertedAs' || e.usage.startsWith('본문'))) assert.ok(e[key], `${e.id}: ${key}`);
    assert.ok(['원문 확인', '2차 확인'].includes(e.verification), `${e.id}: 숫자가 있는데 검증 상태가 ${e.verification}`);
    if (e.verification !== '원문 확인') assert.ok(!e.usage.startsWith('본문 사용'), `${e.id}: 원문 확인 전에는 본문 사용 불가(임시 사용만)`);
  }
  for (const e of EVIDENCE.filter(x => !x.value)) assert.ok(!/^본문 사용$/.test(e.usage) || e.kind === '작성예시', `${e.id}: 값 없는 근거가 본문 사용`);
  const quoted = cited('youth-pop');
  assert.equal(quoted.usage, '본문 임시 사용');
  assert.ok(body.includes(quoted.insertedAs.replace('이다', '')) || body.includes(`${quoted.value.toLocaleString('ko-KR')}명`));
  assert.ok(body.includes(quoted.year));
  assert.match(body, /지역 전체 수이고, 이번 사업의 참여 청소년은 이 가운데 42명/);
  const used = EVIDENCE.filter(x => x.value && body.includes(x.value.toLocaleString('ko-KR')));
  for (const e of used) assert.ok(e.usage.startsWith('본문'), `${e.id}: 본문에 쓰였는데 사용 상태가 ${e.usage}`);
  const guide = careerGuide({});
  for (const e of EVIDENCE) assert.ok(guide.includes(e.title), `안내서에 ${e.id}`);
  assert.ok(guide.includes('원문 확인 전'), '임시 사용 안내');
});
