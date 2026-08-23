// 서식 순서대로 원고 내기 — 안내 박스를 근거로 (24-04).
//
// 이 기관 서식은 표 사이의 **1행 1칸짜리 회색 박스**로 「• 현재 어떤 어려움에 직면해 있습니까?」처럼
// 물음을 던진다. 서식 자신이 「최종 제출 시에는 설명박스를 모두 삭제」라고 적어 정체가 분명하다.
//
// 번호 붙은 줄이 먼저다 — 서식이 스스로 차례와 이름을 매긴 것이라 더 정확하다.
// 안내 박스는 **번호 줄이 못 채운 갈래만 메운다.** 나란히 두면 같은 자리에 이름이 둘 생긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hwpxGuideBoxes } from '../src/files.js';
import { sectionGuideBoxes } from '../src/hwp-text.js';
import { extractFormItems, formItemSkeleton, formSources } from '../src/form-spec.js';
import { fillFormLayout } from '../src/form-fill.js';

const source = fs.readFileSync(new URL('../src/form-spec.js', import.meta.url), 'utf8').split('\r\n').join('\n');
// 안내 박스는 본문과 함께 온다. 본문이 아예 없는 자료는 서식으로 보지 않는다.
const asSource = (text, guides = []) => formSources([{ id: 'f', fileName: '배분신청서.hwp', sourceType: '사업계획서 서식', extractionStatus: 'success', extractedText: text, guides }]);
const keysOf = items => formItemSkeleton({ items }, []).map(one => one.key);

// 실제 서식에서 그대로 옮긴 안내 박스들(24-01에서 받은 파일).
// 표로만 짜인 서식의 본문. 번호 붙은 줄이 하나도 없다.
const BODY = '기 관 명\t고유번호\n차종\t대상 지역\n';
const REAL_GUIDES = [
  '• 사업명 : 대상, 목적, 방법과 관련된 정보를 담아 적어주십시오.(슬로건은 부제(副題)로 병기해주세요) • 사업기간 : 해당사업의',
  '• 현재 어떤 어려움에 직면해 있습니까? 어떤 문제 때문에 기능보강을 신청하는지 설명해 주시기 바랍니다.',
  '• 본 사업을 통해 생활이 개선되거나 수행할 사업에 참여하게 되는 이용자는 누구이며, 인원은 몇 명입니까?',
  '※ 지원차량을 활용한 사업의 수행인력에 대해 기재해주시기 바랍니다.',
  '• 추진 내용별 일정을 기재하여 주시기 바랍니다. ※ 표는 예시이며, 사업에 맞게 양식 변경 가능',
  '※ 최종 제출 시에는, 본 파일 내 설명박스(작성 방법이 안내되어 있는 회색 박스) 및 설명 문구를 모두 삭제하신 후',
  '사회복지공동모금회(이하 “모금회”라 함)는 「개인정보 보호법」제15조 및 22조에 의거하여 개인정보수집 및 이용에 관한 정보주체의 동의를',
  '※ 기관의 내부(주사업장, 사무실) ․ 외부전경 사진을 각 1장씩 첨부해주시기 바랍니다.'
];

test('★ 번호 줄이 없는 서식에서도 항목을 뽑는다', () => {
  // 이 서식은 표로만 짜여 있어 번호 붙은 줄이 하나도 없다.
  const items = extractFormItems(asSource('기 관 명\t고유번호\n차종\t대상 지역\n', REAL_GUIDES));
  assert.ok(items.length >= 4, `안내 박스에서 항목을 못 뽑았다 — ${items.length}개`);
  assert.ok(items.every(one => one.location.endsWith('안내 박스')));
  const keys = keysOf(items);
  for (const key of ['necessity', 'target', 'roles', 'schedule']) assert.ok(keys.includes(key), `${key}를 못 찾았다 — ${keys.join(' ')}`);
});

test('★ 안내문·동의문·첨부 안내는 항목이 아니다', () => {
  const items = extractFormItems(asSource(BODY, REAL_GUIDES));
  const names = items.map(one => one.name).join(' | ');
  assert.ok(!/설명박스/.test(names), `제출 안내가 항목으로 잡혔다 — ${names}`);
  assert.ok(!/개인정보/.test(names), `동의문이 항목으로 잡혔다 — ${names}`);
  assert.ok(!/사진을 각 1장씩/.test(names), `첨부 안내가 항목으로 잡혔다 — ${names}`);
});

test('★ 「추진 내용별 일정」은 schedule이다 — 낱말이 아니라 차례로 풀었다', () => {
  // 예전에는 programs의 「추진 내용」이 먼저 걸려 일정이 programs로 갔다.
  assert.deepEqual(keysOf(extractFormItems(asSource(BODY, ['• 추진 내용별 일정을 기재하여 주시기 바랍니다.']))), ['schedule']);
  // 넓은 갈래(programs)가 맨 뒤에 있어야 이것이 성립한다.
  const order = [...source.matchAll(/^\s{2}([a-z]+):/gm)].map(hit => hit[1]);
  assert.equal(order[order.length - 1], 'programs', `programs가 맨 뒤가 아니다 — ${order.join(' ')}`);
  // 다른 이름들이 밀려나지 않았는지 함께 본다.
  assert.deepEqual(keysOf(extractFormItems(asSource('1. 사업 필요성\n2. 핵심 프로그램\n3. 예산 편성\n4. 성과지표\n'))), ['necessity', 'programs', 'budget', 'indicators']);
});

test('「이용자」 하나만 target에 더했다', () => {
  assert.deepEqual(keysOf(extractFormItems(asSource(BODY, ['• 이용자는 누구이며, 인원은 몇 명입니까?']))), ['target']);
  assert.match(source, /target: \/대상\|참여자\|이용자\//);
  // 문을 둘 지나야 하므로 ITEM_HINT에도 같은 낱말이 든다. 하나만 넣으면 앞 문에서 걸러진다.
  assert.match(source, /\|대상\|이용자\|프로그램\|/);
  // 그 밖에 낱말을 더하지 않았다.
  assert.match(source, /programs: \/프로그램\|사업\\s\*내용\|추진\\s\*내용\|활동\|방법\//);
  assert.match(source, /schedule: \/일정\|추진\\s\*계획\|기간\//);
  assert.match(source, /necessity: \/필요성\|배경\|현황\|문제\//);
});

test('★ 번호 줄이 있으면 그것이 먼저고, 안내 박스는 빈 갈래만 메운다', () => {
  // 같은 자리에 이름이 둘 생기면 원고에 같은 글이 두 번 붙는다.
  const numbered = '1. 지원 필요성\n2. 사업수행인력\n3. 사업 진행 일정\n';
  const items = extractFormItems(asSource(numbered, REAL_GUIDES));
  const fromGuide = items.filter(one => one.location.endsWith('안내 박스'));
  assert.deepEqual(items.slice(0, 3).map(one => one.name), ['지원 필요성', '사업수행인력', '사업 진행 일정']);
  for (const key of ['necessity', 'roles', 'schedule']) {
    assert.equal(fromGuide.filter(one => keysOf([one])[0] === key).length, 0, `${key}가 번호 줄과 안내 박스에 둘 다 있다`);
  }
  // 번호 줄이 못 맡은 갈래는 메운다.
  assert.ok(keysOf(items).includes('target'), '빈 갈래를 안 메웠다');
});

test('차례는 서식이 놓은 그대로다', () => {
  const items = extractFormItems(asSource('1. 지원 필요성\n2. 이용 대상 및 인원\n3. 예산 편성\n'));
  assert.deepEqual(items.map(one => one.order), [1, 2, 3]);
  assert.deepEqual(items.map(one => one.name), ['지원 필요성', '이용 대상 및 인원', '예산 편성']);
});

test('★ 안 걸린 항목은 서식 이름 그대로 두고 아래를 비운다', () => {
  const items = extractFormItems(asSource('1. 지원 필요성\n2. 향후 운영 계획\n'));
  const skeleton = formItemSkeleton({ items }, []);
  const orphan = skeleton.find(one => one.title === '향후 운영 계획');
  assert.ok(orphan, '서식 이름이 사라졌다');
  assert.equal(orphan.key, '', '엉뚱한 갈래에 붙였다');
  // 원고에서는 서식 이름을 그대로 쓰고 내용은 [확인 필요]로 남는다.
  const laid = fillFormLayout({ plan: { skeleton }, sections: [{ id: 'necessity', title: '사업 필요성', content: '지역 아동의 …' }], tables: [] });
  assert.equal(laid.ok, true);
  assert.deepEqual(laid.sections.map(one => one.title), ['1. 지원 필요성', '2. 향후 운영 계획']);
  assert.match(laid.sections[1].content, /\[확인 필요/);
});

test('분량은 서식이 말한 것만 쓴다', () => {
  // 이 기관 서식에는 「N자 이내」가 없다. 없는 것을 만들지 않는다.
  const items = extractFormItems(asSource(BODY, REAL_GUIDES));
  for (const one of items) {
    assert.equal(one.limitChars, 0);
    assert.equal(one.limitPages, 0);
    assert.equal(one.status, '확인 필요');
  }
  // 적혀 있으면 읽는다.
  const limited = extractFormItems(asSource(BODY, ['• 사업 필요성을 800자 이내로 적어 주십시오.']));
  assert.equal(limited[0].limitChars, 800);
  assert.equal(limited[0].status, '확인됨');
});

test('★ .hwp에서 칸이 하나뿐인 맨 바깥 표만 안내 박스다', () => {
  // 칸이 여럿이면 입력표다. 표 안의 표는 칸 하나여도 안내 박스가 아니다.
  const one = section([ctrl(1), list(2), para(3, '• 현재 어떤 어려움에 직면해 있습니까?')]);
  assert.deepEqual(sectionGuideBoxes(one), ['• 현재 어떤 어려움에 직면해 있습니까?']);
  const grid = section([ctrl(1), list(2), para(3, '기 관 명'), list(2), para(3, '햇살센터')]);
  assert.deepEqual(sectionGuideBoxes(grid), [], '칸이 둘인 입력표를 안내 박스로 봤다');
  const nested = section([ctrl(1), list(2), ctrl(3), list(4), para(5, '속에 든 물음입니까?')]);
  assert.deepEqual(sectionGuideBoxes(nested), [], '표 안의 표를 안내 박스로 봤다');
});

test('HWPX에서도 칸 하나짜리 맨 바깥 표만 안내 박스로 본다', () => {
  const box = '<hp:tbl><hp:tr><hp:tc><hp:p><hp:t>• 현재 어떤 어려움에 직면해 있습니까?</hp:t></hp:p></hp:tc></hp:tr></hp:tbl>';
  const grid = '<hp:tbl><hp:tr><hp:tc><hp:p><hp:t>기관명</hp:t></hp:p></hp:tc><hp:tc><hp:p><hp:t>값</hp:t></hp:p></hp:tc></hp:tr></hp:tbl>';
  const nested = `<hp:tbl><hp:tr><hp:tc>${box}</hp:tc></hp:tr></hp:tbl>`;
  assert.deepEqual(hwpxGuideBoxes(box), ['• 현재 어떤 어려움에 직면해 있습니까?']);
  assert.deepEqual(hwpxGuideBoxes(grid), []);
  assert.deepEqual(hwpxGuideBoxes(nested), []);
});

// .hwp 구역 레코드를 손으로 만든다. 머리 4바이트에 갈래·깊이·크기가 함께 든다.
function record(tag, level, data) {
  const out = new Uint8Array(4 + data.length);
  new DataView(out.buffer).setUint32(0, (tag & 0x3ff) | ((level & 0x3ff) << 10) | ((data.length & 0xfff) << 20), true);
  out.set(data, 4);
  return out;
}
// 개체 식별자는 뒤집혀 저장된다. 'tbl '가 ' lbt'로 들어 있다.
const ctrl = level => record(71, level, new TextEncoder().encode(' lbt'));
const list = level => record(72, level, new Uint8Array(12));
function para(level, text) {
  const data = new Uint8Array(text.length * 2);
  const view = new DataView(data.buffer);
  [...text].forEach((letter, index) => view.setUint16(index * 2, letter.charCodeAt(0), true));
  return record(67, level, data);
}
function section(records) {
  const size = records.reduce((sum, one) => sum + one.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const one of records) { out.set(one, at); at += one.length; }
  return out;
}
