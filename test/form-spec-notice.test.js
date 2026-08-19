// 서식을 읽었는지 화면이 말하는지 본다.
//
// 이 시험이 있는 이유: 화면의 항목 이름만 봐서는 서식을 읽었는지 알 수 없다.
// applyFormSpecToOutline이 이름과 분량을 바꾸기는 하는데 조건이 셋 다 맞을 때뿐이다 —
// 항목 이름이 OUTLINE_MATCH에 걸리고, 그 항목에 글자 수나 쪽수 제한이 있을 때.
// 그래서 서식을 「읽었는데 아무것도 안 바뀐」 경우가 실제로 있고, 그때도 화면은 똑같아 보인다.
// 「못 읽었다」와 「읽었지만 안 붙었다」를 화면이 직접 말하지 않으면 그대로 제출하게 된다.
//
// 문구는 「읽은 항목 수」가 아니라 「실제로 목차에 적용된 수」로 만든다. 그 둘은 다르다.
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

test('서식을 읽어도 목차에 붙은 것이 없으면 반영됐다고 말하지 않는다', () => {
  // applyFormSpecToOutline은 세 조건이 모두 맞을 때만 적용한다 —
  // 항목 이름이 OUTLINE_MATCH에 걸리고, 그 항목에 글자 수나 쪽수 제한이 있을 때.
  // 「서약서」처럼 목차와 안 겹치는 항목만 읽었으면 본문에는 아무것도 바뀌지 않는다.
  const notice = formSpecNotice(spec([{ name: '제출 서약', limitChars: 300 }, { name: '개인정보 동의' }]), []);
  assert.equal(notice.state, 'partial');
  assert.equal(notice.tone, 'caution');
  assert.equal(notice.applied, 0);
  assert.equal(notice.headline, `서식 일부만 읽음 — ${source.fileName}에서 항목 2개를 읽었으나 목차에 반영된 것은 없음`);
  assert.match(notice.detail, /본문은 기본 10개 항목의 이름과 분량으로 나갑니다/);
});

test('분량 제한이 아예 없으면 그 사실을 그대로 적는다', () => {
  const notice = formSpecNotice(spec([{ name: '사업 필요성' }, { name: '목적' }]), []);
  assert.equal(notice.state, 'partial');
  assert.match(notice.detail, /항목별 분량 제한을 찾지 못했습니다/);
});

test('반영됐을 때 몇 개가 반영됐고 몇 개가 기본값인지 밝힌다', () => {
  // 「서식 반영됨」만 적으면 사실보다 넓게 말한다. 실제로 바뀌는 것은 걸린 항목뿐이다.
  const notice = formSpecNotice(spec([
    { name: '사업 필요성', limitChars: 1200 },  // OUTLINE_MATCH.necessity에 걸린다
    { name: '예산', limitPages: 1 },            // OUTLINE_MATCH.budget에 걸린다
    { name: '서약서', limitChars: 200 }         // 목차와 겹치지 않아 반영되지 않는다
  ]), []);
  assert.equal(notice.state, 'full');
  assert.equal(notice.tone, 'ok');
  assert.equal(notice.applied, 2);
  assert.equal(notice.headline, `서식 반영됨 — ${source.fileName} 기준 · 10개 중 2개 항목`);
  assert.match(notice.detail, /그 2개는 서식의 항목 이름과 분량을 따르고, 나머지 8개는 기본 이름·기본 분량입니다/);
});

test('서식 항목이 열 개보다 많으면 본문은 열 개만 쓴다고 밝힌다', () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ name: `기타 ${index}` }));
  const notice = formSpecNotice(spec([{ name: '목적', limitChars: 500 }, ...many]), []);
  assert.equal(notice.state, 'full');
  assert.match(notice.detail, /서식 항목 13개 가운데 본문으로 쓰는 것은 10개입니다/);
});

test('서식에서 읽은 표와 첨부는 읽은 것만 적는다', () => {
  const base = [{ name: '목적', limitChars: 500 }];
  const none = formSpecNotice({ ...spec(base), tables: [], attachments: [] }, []);
  assert.doesNotMatch(none.detail, /필수 표|첨부서류/, '없는 것을 있다고 적지 않는다');
  const both = formSpecNotice({ ...spec(base), tables: [{ kind: '예산표' }], attachments: [{ name: '통장사본' }] }, []);
  assert.match(both.detail, /필수 표 1개 · 첨부서류 1개도 서식에서 읽었습니다/);
});

test('세 상태만 있고 화면이 그 셋을 모두 그린다', () => {
  assert.deepEqual([...FORM_NOTICE_STATES], ['none', 'partial', 'full']);
  const states = [
    formSpecNotice(null, []),
    formSpecNotice(spec([{ name: '서약서' }]), []),
    formSpecNotice(spec([{ name: '목적', limitChars: 900 }]), [])
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
