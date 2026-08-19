// 서식을 읽었는지 화면이 말하는지 본다.
//
// 이 시험이 있는 이유: 화면의 항목 이름만 봐서는 서식을 읽었는지 알 수 없다.
// applyFormSpecToOutline은 title을 바꾸지 않아서, 읽었든 못 읽었든 PROPOSAL_OUTLINE의
// 같은 열 개가 나온다. 「못 읽었다」를 화면이 직접 말하지 않으면 사용자가 알아챌 방법이 없고,
// 그대로 제출하게 된다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FORM_NOTICE_STATES, PROPOSAL_OUTLINE, formSpecNotice } from '../src/engagement.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const source = { fileName: '2027년_사업계획서_서식.hwpx', sourceType: '사업계획서 서식', chars: 4000 };
const spec = (items, sources = [source]) => ({ items, sources, tables: [], attachments: [] });

test('서식이 없으면 경고로 알리고 기본 항목 수를 밝힌다', () => {
  const notice = formSpecNotice(null, []);
  assert.equal(notice.state, 'none');
  assert.equal(notice.tone, 'warning');
  // 「기본 10개」를 손으로 적지 않는다. 목차가 늘면 문구도 따라간다.
  assert.equal(notice.headline, `서식 미인식 — 기본 ${PROPOSAL_OUTLINE.length}개 항목으로 작성됨`);
  assert.match(notice.detail, /항목·분량이 다를 수 있습니다/);
  assert.equal(notice.zipHint, '', 'ZIP이 없으면 ZIP 이야기를 만들지 않는다');
});

test('서식 항목을 하나도 못 읽으면 서식 객체가 있어도 미인식이다', () => {
  // buildFormSpec은 표·첨부만 읽고 items가 빈 결과를 돌려줄 수 있다. 그건 읽은 것이 아니다.
  assert.equal(formSpecNotice(spec([]), []).state, 'none');
  assert.equal(formSpecNotice(spec([{ name: '가' }], []), []).state, 'none', '출처 파일명이 없으면 근거를 댈 수 없다');
});

test('첨부에 ZIP이 있고 서식이 미인식이면 그 안을 보라고 알린다', () => {
  const notice = formSpecNotice(null, [{ name: '붙임서류일괄.ZIP' }]);
  assert.match(notice.zipHint, /ZIP 안에 서식이 있을 수 있습니다/);
  // 대소문자를 가리지 않는다. 실제 공고 첨부는 .ZIP도 .zip도 온다.
  assert.equal(formSpecNotice(null, [{ name: 'a.zip' }]).zipHint, notice.zipHint);
  // 서식을 읽었으면 ZIP이 있어도 그 말을 하지 않는다.
  assert.equal(formSpecNotice(spec([{ name: '가', limitChars: 900 }]), [{ name: 'a.zip' }]).zipHint, '');
});

test('항목만 읽고 분량을 못 찾으면 무엇이 기본값인지 밝힌다', () => {
  const notice = formSpecNotice(spec([{ name: '사업 필요성' }, { name: '목적' }]), []);
  assert.equal(notice.state, 'partial');
  assert.equal(notice.tone, 'caution');
  // 「반영됨」으로 뭉개면 분량이 기본값이라는 사실이 숨는다.
  assert.equal(notice.headline, `서식 일부만 읽음 — 항목은 ${source.fileName} 기준, 분량은 기본값`);
  assert.match(notice.detail, /작성 항목 2개/);
});

test('항목과 분량을 모두 읽으면 반영됨과 함께 파일명을 밝힌다', () => {
  const notice = formSpecNotice(spec([{ name: '가', limitChars: 900 }, { name: '나', limitPages: 2 }, { name: '다' }]), []);
  assert.equal(notice.state, 'full');
  assert.equal(notice.tone, 'ok');
  assert.equal(notice.headline, `서식 반영됨 — ${source.fileName} 기준`);
  assert.equal(notice.detail, '작성 항목 3개 · 분량 제한 2개');
});

test('세 상태만 있고 화면이 그 셋을 모두 그린다', () => {
  assert.deepEqual([...FORM_NOTICE_STATES], ['none', 'partial', 'full']);
  const states = [
    formSpecNotice(null, []),
    formSpecNotice(spec([{ name: '가' }]), []),
    formSpecNotice(spec([{ name: '가', limitChars: 900 }]), [])
  ];
  assert.deepEqual(states.map(item => item.state), [...FORM_NOTICE_STATES]);
  // 셋 다 제목과 설명이 있어야 한다. 빈 문장을 그리면 자리만 차지한다.
  for (const item of states) {
    assert.ok(item.headline.length > 5, item.state);
    assert.ok(item.detail.length > 5, item.state);
  }
});

test('화면은 문구를 따로 적지 않고 formSpecNotice를 읽는다', () => {
  // 문구를 화면마다 손으로 적으면 나중에 하나만 고치는 사고가 난다.
  assert.match(app, /import \{[^}]*formSpecNotice[^}]*\} from '\.\/engagement\.js'/);
  assert.match(app, /function formSpecNoticeView\(\)/);
  // 설계도 화면과 완성본 화면 두 곳에 붙어 있다.
  assert.equal((app.match(/\$\{formSpecNoticeView\(\)\}/g) || []).length, 2);
  assert.doesNotMatch(app, /서식 미인식 — 기본/, '문구를 화면에 복사해 적지 않는다');
});

test('자료 요약이 공고 첨부만 있을 때도 사라지지 않는다', () => {
  // 첨부가 ZIP 하나뿐일 때가 서식을 못 읽었을 가능성이 가장 큰 상황인데,
  // 예전에는 직접 자료가 0건이면 「서식 없음」 문장이 통째로 사라졌다.
  assert.match(app, /const hasSource = count > 0 \|\| \(state\.selectedNotice\?\.attachments \|\| \[\]\)\.length > 0;/);
  assert.match(app, /\$\{hasSource \? `<p class="muted" id="intake-summary">/);
});
