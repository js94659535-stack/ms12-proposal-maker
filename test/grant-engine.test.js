// 공모 작업대(범용 엔진 + 공모 정의) 검증 (10-19).
// 핵심: 엔진은 특정 공모를 모르고, 원문 항목은 하나도 빠지지 않으며, 생성 전 확인과 생성 후 검증이 분리되어 있다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import def from '../public/grant/defs/vehicle.js';
import extracted from '../public/grant/defs/vehicle.extracted.js';
import { evalExpr, buildScope, generate, preCheck, postCheck, checkApplicant, rankApplicants, evaluateChoices, changeLog, factKeysOf, orderedParts, linkInfo } from '../public/grant/engine.js';
import { extractCandidates } from '../public/grant/extract.js';
import { planSections } from '../public/baeumteo/blocks.js';

const flat = text => text.replace(/\s+/g, ' ');
const allFacts = () => ({ ...Object.fromEntries(Object.entries(def.facts).map(([key, spec]) => [key, spec[2]])), ...Object.fromEntries(def.sourceItems.map(item => [`preserved.${item.name}`, '향후 사업과 사후관리 계획을 직접 작성함'])) });

test('★ 엔진은 특정 공모를 모른다 — 차량·배움터·스타리아 같은 말이 엔진 코드에 없다', () => {
  const source = fs.readFileSync(new URL('../public/grant/engine.js', import.meta.url), 'utf8');
  for (const word of ['차량', '배움터', '스타리아', '레이', '삼성', '모금회', '다문화']) assert.ok(!source.includes(word), `엔진에 ${word}`);
});

test('식 계산기: 우선순위·삼항·함수·문자열 비교, 모르는 함수와 임의 코드는 막는다', () => {
  assert.equal(evalExpr('1 + 2 * 3'), 7);
  assert.equal(evalExpr('(1 + 2) * 3'), 9);
  assert.equal(evalExpr('ceil(40 / 9)'), 5);
  assert.equal(evalExpr("a.b == 'x' ? 10 : 20", { a: { b: 'x' } }), 10);
  assert.equal(evalExpr('max(1, 2, 3) - min(4, 5)'), -1);
  assert.equal(evalExpr('x >= 3 && y < 2', { x: 3, y: 1 }), true);
  assert.equal(evalExpr('모름'), 0, '없는 이름은 0');
  assert.throws(() => evalExpr('process.exit()'), /모르는 함수/);
  assert.throws(() => evalExpr('1 +'), /식이 끝났다/);
});

test('범위 계산: 선택지와 계산식이 차종에 따라 바뀐다', () => {
  const stariah = buildScope(def, { values: { users: 20 }, choices: { car: 'stariah' } });
  assert.equal(stariah.passengers, 9);
  assert.equal(stariah.weeklyRuns, 5);
  assert.equal(stariah.apply, 42000000);
  assert.equal(stariah.total, stariah.apply + stariah.selfBurden);
  const ray = buildScope(def, { values: { users: 20 }, choices: { car: 'ray' } });
  assert.equal(ray.passengers, 2);
  assert.equal(ray.weeklyRuns, 20);
  assert.equal(ray.apply, 19000000);
});

test('★ 원문 항목은 하나도 빠지지 않는다 — 정의가 연결하지 않은 것은 보존 칸이 된다', () => {
  assert.equal(def.sourceItems.length, 11);
  const text = generate(def, { virtual: true }).text;
  for (const item of def.sourceItems) assert.ok(text.includes(item.name), `원문 항목 「${item.name}」이 없다`);
  const { preserved } = orderedParts(def);
  assert.deepEqual(preserved, ['향후 운영 계획'], '정의가 일부러 연결하지 않은 항목');
  const section = text.split('## ').find(part => part.startsWith('향후 운영 계획'));
  assert.ok(section.includes('원문 안내:') && section.includes('사후관리 및 유지보수 계획'), '원문 안내 문구를 함께 보존');
  // 원문 순서: 예산 편성 → 향후 운영 계획 → 조직도
  const order = ['마. 예산 편성', '향후 운영 계획', '1. 조직도 (첨부서류 3)'].map(title => text.indexOf(`## ${title}`));
  assert.ok(order.every(at => at >= 0) && order[0] < order[1] && order[1] < order[2], `순서 ${order}`);
});

test('원문 항목의 순서와 이름은 문서에서 뽑은 그대로다', () => {
  assert.deepEqual(def.sourceItems.map(item => item.name), extracted.sourceItems.map(item => item.name));
  assert.deepEqual(def.sourceItems.map(item => item.no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('★ 요구조건의 원문 문장은 실제 공고문에 있다 — 지어낸 규정이 없다', () => {
  const notice = flat(extracted.noticeText);
  for (const req of def.requirements.filter(r => r.quote)) assert.ok(notice.includes(flat(req.quote)), `공고문에 없는 문장: ${req.quote}`);
  for (const req of def.requirements.filter(r => !r.quote)) assert.ok(req.assumed, `${req.id}: 원문이 없는 규정은 가정으로 표시해야 한다`);
});

test('조건 후보: 일반 규칙으로 뽑고, 규칙에 연결되지 않은 후보는 남겨 둔다', () => {
  assert.ok(def.candidates.length > 30);
  for (const kind of ['금액', '수량', '날짜', '의무·제외']) assert.ok(def.candidates.some(c => c.kinds.includes(kind)), `${kind} 후보가 없다`);
  assert.ok(def.candidates.every(c => c.quote && c.kinds.length && c.file));
  const unlinked = def.candidates.filter(c => !linkInfo(def, c));
  assert.ok(unlinked.length > 0 && unlinked.length < def.candidates.length, '일부만 연결된다');
  assert.ok(preCheck(def, {}).items.some(item => item.message.includes('규칙이나 구현에 연결되지 않은')), '미연결 후보는 확인 대상으로 알린다');
  const sample = extractCandidates('수행기관 13개소 선정\n지원 후 5년간 매년 연간보고서를 제출\n압축파일은 10MB 이하\n사업기간 2027. 1. ~ 2031. 12.');
  assert.ok(sample.some(c => c.numbers.includes('13개소')) && sample.some(c => c.numbers.includes('2027-01')));
});

test('★ 생성 전 확인: 필수 조건 미충족은 부적격, 비어 있으면 판단 보류, 모두 충족하면 적격', () => {
  const [good, small, late] = def.scenarios.sufficient[1];
  assert.equal(small.facts.under13, '0');
  assert.equal(checkApplicant(def, good.facts).status, '적격');
  assert.equal(checkApplicant(def, late.facts).status, '부적격', '2025. 8. 17. 이후 설립');
  assert.ok(checkApplicant(def, late.facts).rows.find(r => r.id === 'founded').basis.includes('2025-08-17'));
  const [d, e] = def.scenarios.none[1];
  assert.equal(checkApplicant(def, d.facts).status, '부적격', '최근 5년 차량 지원 이력');
  assert.equal(checkApplicant(def, e.facts).status, '부적격', '정부·지자체 직접 운영');
  const [f] = def.scenarios.unknown[1];
  assert.equal(checkApplicant(def, f.facts).status, '판단 보류');
  assert.equal(checkApplicant(def, {}).status, '판단 보류', '정보가 없으면 지어내지 않는다');
  assert.ok(small);
});

test('★ 기관 순위: 적격 > 판단 보류 > 부적격이고, 부적격은 맨 아래', () => {
  const apps = [...def.scenarios.sufficient[1], ...def.scenarios.unknown[1]].map(o => ({ ...o }));
  const ranked = rankApplicants(def, apps);
  assert.deepEqual(ranked.map(r => r.check.status), ['적격', '적격', '판단 보류', '부적격']);
  assert.equal(ranked[0].users >= ranked[1].users, true, '같은 등급이면 이용자 수가 많은 기관이 먼저');
});

test('★ 선택지 평가: 이용자가 많으면 스타리아만, 어른 4명이면 가장 저렴한 가능 차종(레이)', () => {
  const big = evaluateChoices(def, 'car', { values: { users: 24, under13: 0 } });
  assert.deepEqual(big.map(c => [c.key, c.feasible]), [['stariah', true], ['ray', false]]);
  assert.match(big[1].reason, /주 \d+회 운행이 필요해 주 10회 한도를 넘음/);
  const small = evaluateChoices(def, 'car', { values: { users: 4, under13: 0 } });
  assert.deepEqual(small.filter(c => c.feasible).map(c => c.key), ['ray', 'stariah'], '가능한 것 중 신청금액이 낮은 것이 먼저');
});

test('★ 공고문의 도로교통법 의무: 만 13세 미만이 한 명이라도 있으면 어린이 보호차량(스타리아)만 가능하다', () => {
  const kids = evaluateChoices(def, 'car', { values: { users: 4, under13: 1 } });
  assert.deepEqual(kids.map(c => [c.key, c.feasible]), [['stariah', true], ['ray', false]], '같은 4명이라도 어린이가 있으면 레이는 불가');
  assert.match(kids[1].reason, /만 13세 미만 이용자 1명이 있어 어린이 보호차량\(스타리아\)만 가능/);
  const post = postCheck(def, { facts: allFacts(), values: { users: 4, under13: 1 }, choices: { car: 'ray' } });
  assert.ok(post.items.some(i => i.id === 'child' && i.level === '오류'), '어린이가 있는데 레이를 고르면 생성 후 검증이 막는다');
  const ok = postCheck(def, { facts: allFacts(), values: { users: 4, under13: 1 }, choices: { car: 'stariah' } });
  assert.equal(ok.errors, 0);
  assert.match(generate(def, { values: { users: 4, under13: 1 }, choices: { car: 'stariah' }, virtual: true }).text, /만 13세 미만 이용자 1명 — 어린이 보호차량 이용 필수, 관할 경찰서 신고 필요/);
  assert.match(generate(def, { values: { users: 4, under13: 0 }, choices: { car: 'ray' }, virtual: true }).text, /만 13세 미만 이용자 0명 — 해당 없음/);
});

test('★ 원문 후보가 규칙이나 구현에 연결되면 연결 방식이 보이고, 구현으로 적은 문장은 모두 원문에 있다', () => {
  const all = flat(extracted.noticeText + extracted.formText);
  for (const impl of def.implements) assert.ok(all.includes(flat(impl.quote)), `원문에 없는 구현 문장: ${impl.quote}`);
  const child = def.candidates.find(c => c.quote.includes('어린이 보호차량 이용 필수'));
  assert.ok(child, '도로교통법 문장이 후보로 뽑혔다');
  assert.equal(linkInfo(def, child).via, '구현');
  const rule = def.candidates.find(c => c.quote.includes('2025. 8. 17. 이전에 설립'));
  assert.equal(linkInfo(def, rule).via, '규칙');
  assert.equal(linkInfo(def, { quote: '전혀 관계없는 문장입니다 아무 말' }), null);
  const linked = def.candidates.filter(c => linkInfo(def, c));
  assert.ok(linked.length >= 10 && linked.length < def.candidates.length);
});

test('★ 재설계: 이용자 20명 스타리아 기준이 4명 기관으로 바뀌면 차종·운행·금액·자부담이 함께 바뀌고 이유가 붙는다', () => {
  const base = { virtual: true };
  const next = { virtual: true, values: { users: 4, under13: 0 }, choices: { car: 'ray' } };
  const rows = changeLog(def, base, next);
  const row = what => rows.find(r => r.what === what);
  assert.deepEqual([row('차종').from.includes('스타리아'), row('차종').to.includes('레이')], [true, true]);
  assert.equal(row('신청금액').from, '42,000,000원');
  assert.equal(row('신청금액').to, '19,000,000원');
  assert.equal(row('주당 운행 횟수').from, '5');
  assert.equal(row('주당 운행 횟수').to, '4', '레이는 한 번에 2명(4인승−2)이라 8명회를 4회 운행');
  assert.ok(rows.length >= 6 && rows.every(r => r.why.length > 5), '모든 변경에 이유');
  const text = generate(def, next).text;
  assert.match(text, /레이 \[○\]/);
  assert.match(text, /신청금액 19,000,000원/);
});

test('★ 생성 후 검증: 가상 값이 남으면 오류, 사실을 모두 채우면 오류 0, 운행 가능 횟수를 넘으면 오류', () => {
  const virtual = postCheck(def, { virtual: true });
  assert.deepEqual(virtual.items.filter(i => i.level === '오류').map(i => i.id), ['virtual']);
  assert.ok(virtual.items.some(i => i.id === 'child' && i.level === '통과'));
  const real = { facts: allFacts() };
  const clean = postCheck(def, real);
  assert.equal(clean.errors, 0, clean.items.filter(i => i.level !== '통과').map(i => i.message).join(' / '));
  const over = postCheck(def, { ...real, values: { users: 100, under13: 0 } });
  assert.ok(over.items.some(i => i.level === '오류' && i.id === 'capacity'), '운행 가능 횟수 초과');
  const noPhoto = generate(def, real);
  assert.ok(noPhoto.text.includes('[사진 붙임]') && noPhoto.text.includes('(인)') && noPhoto.text.includes('동의함'), '사진·직인·동의 칸');
});

test('생성 전/후는 분리되어 있다 — 생성 전은 요구조건과 기관, 생성 후는 본문·계산', () => {
  const before = preCheck(def, { applicant: def.scenarios.sufficient[1][0].facts });
  assert.equal(before.status, '적격');
  assert.ok(before.items.every(i => !/가상 값|풀리지 않은/.test(i.message)), '생성 전 확인은 본문을 보지 않는다');
  const after = postCheck(def, { virtual: true });
  assert.ok(after.items.some(i => i.id === 'total' && i.level === '통과'));
  assert.ok(after.items.some(i => i.id.startsWith('item:')));
});

test('답을 넣으면 그 칸만 바뀌고 나머지는 [확인 필요]로 남는다', () => {
  const g = generate(def, { facts: { agency: '햇살센터' } });
  assert.ok(g.text.includes('햇살센터') && g.text.includes('[확인 필요: 대표자]'));
  assert.ok(g.unresolved.includes('rep') && !g.unresolved.includes('agency'));
  assert.ok(g.unresolved.includes('preserved.향후 운영 계획'), '보존 항목도 미확인 사실로 센다');
  assert.equal(factKeysOf(def).filter(k => !(k in def.facts)).length, 0, '정의에 없는 사실 토큰이 없다');
});

test('출력: 표가 나뉘고(## 구역) 사진·서명·동의 표가 들어간다', () => {
  const sections = planSections(generate(def, { virtual: true }).text);
  const titles = sections.map(s => s.title);
  for (const part of ['배분신청서', '신청기관 현황', '신청기관 신뢰성 점검표', '신청기관 회계관리 점검표', '마. 예산 편성', '향후 운영 계획', '기관 전경 사진', '개인정보 수집·이용 및 제공 동의서(신청기관 담당자용)']) assert.ok(titles.some(t => t.includes(part)), part);
  assert.ok(sections.reduce((n, s) => n + s.blocks.filter(b => b.rows).length, 0) >= 12, '표가 열두 개 이상');
});

test('단독 화면(/grant/)의 모듈 주소는 같은 버전 표시를 갖고 캐시 헤더가 있다', () => {
  const html = fs.readFileSync(new URL('../public/grant/index.html', import.meta.url), 'utf8');
  const versions = new Set([...html.matchAll(/from '[^']+\.js(\?v=[\w-]+)'/g)].map(m => m[1]));
  assert.equal(versions.size, 1, `버전 표시: ${[...versions]}`);
  assert.match(fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8'), /\/grant\/\*\s+Cache-Control: no-cache/);
});
