// 오래된 기관 정보에 「다시 확인」을 띄운다. 상태는 건드리지 않는다.
//
// 실제로 났던 일: 등록증이 바뀌면 새로 올려 고칠 수 있는데, 언제 그래야 하는지 아무도 말해 주지 않았다.
// 「오래된 정보」라는 상태가 있지만 해가 지났다고 저절로 바뀌지 않는다 — 그리고 바뀌어서도 안 된다.
// 저절로 내려가면 사용자가 모르는 사이에 계획서에서 값이 빠진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STALE_YEARS, staleItems, staleReason, staleSummary } from '../src/org-staleness.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const item = (area, label, asOf) => ({ area, label, value: '값', status: '확인됨', asOf });

test('지난 사업 기록은 오래됐다고 하지 않는다', () => {
  // 실제 연혁 99건은 2017~2026년에 고루 퍼져 있다. 2017년 실적이 2017년인 것은 정상이다.
  assert.equal(staleReason(item('performance', '2017년 사업실적', '2017'), 2026), null);
  assert.equal(staleItems([item('performance', '2017년 사업실적', '2017'), item('performance', '2019년 사업실적', '2019')], 2026).length, 0);
});

test('바뀌면 서류가 바뀌는 항목은 해가 지났다고 묻지 않는다', () => {
  // 기관명·고유번호·설립 시기·법인 유형은 5년이 지나도 의심할 일이 아니다.
  for (const label of ['기관명', '고유번호', '설립 시기', '법인 유형']) {
    assert.equal(staleReason(item('basic', label, '2021-08'), 2026), null, label);
  }
});

test('사람과 자리가 바뀌는 정보는 두 해가 지나면 알린다', () => {
  assert.equal(STALE_YEARS, 2);
  const old = staleReason(item('basic', '대표자', '2021-08'), 2026);
  assert.equal(old.kind, 'old');
  assert.equal(old.year, 2021);
  assert.match(old.note, /2021년 기준입니다. 바뀌었으면 새 문서를 올려 주세요/);
  // 한 해밖에 안 지났으면 알리지 않는다.
  assert.equal(staleReason(item('basic', '대표자', '2025'), 2026), null);
  // 기준시점이 아예 없으면 그것대로 알린다.
  assert.equal(staleReason(item('staff', '상근 인력', ''), 2026).kind, 'unknown');
});

test('카드 맨 위 한 줄은 몇 건이 언제 것인지 말한다', () => {
  const summary = staleSummary([
    item('basic', '기관명', '2021-08'),
    item('basic', '대표자', '2021-08'),
    item('basic', '소재지', '2021-08'),
    item('staff', '상근 인력', ''),
    item('performance', '2017년 사업실적', '2017')
  ], 2026);
  assert.equal(summary.count, 3);
  assert.match(summary.message, /2건이 2021년 기준입니다/);
  assert.match(summary.message, /1건은 언제 기준인지 적혀 있지 않습니다/);
  // 다시 확인할 것이 없으면 아무 말도 하지 않는다.
  assert.equal(staleSummary([item('basic', '대표자', '2026')], 2026), null);
});

test('상태를 저절로 바꾸지 않고 표시만 한다', () => {
  const source = fs.readFileSync(new URL('../src/org-staleness.js', import.meta.url), 'utf8');
  // 이 모듈은 판정만 한다. 상태를 쓰는 코드가 없다.
  assert.doesNotMatch(source, /status\s*=|'오래된 정보'/);
  // 화면은 딱지와 한 줄로만 알린다.
  assert.match(app, /<span class="status 확인-필요 recheck">다시 확인<\/span>/);
  assert.match(app, /다시 확인할 정보 \$\{stale\.count\}건/);
  assert.match(app, /상태는 그대로 둡니다\. 확인해 두신 값은 계획서에 계속 쓰입니다\./);
  // 다시 올리는 길이 그 자리에 있다.
  assert.match(app, /document\.querySelector\('#recheck-upload'\)\?\.addEventListener\('click', \(\) => focusAnchor\('#applicant-cert-drop'\)\)/);
});
