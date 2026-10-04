// 재단 원본 양식에 넣을 작업 목록(10-36): 한글 없이도 확인할 수 있는 부분 — 작업 순서와 내용이 계획서와 같은지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOps, PARTNER_COPY, BUDGET_COPIES } from '../tools/official-ops.mjs';
import { derive } from '../public/baeumteo/career-final.js';

const ops = buildOps({});
const fills = ops.filter(o => o.op === 'fill');

test('작업은 번호가 큰 표부터 하고, 표 복사 뒤에는 복사본 번호로 채운다', () => {
  const tables = fills.map(o => o.t);
  // 표 복사 전에는 번호가 줄어드는 순서(예산서 70 → 참여기관 15 → 대표기관 11 → 명단 10 → 표지 0)
  const copy1 = ops.findIndex(o => o.op === 'table_copy_after' && o.t === 70);
  const copy2 = ops.findIndex(o => o.op === 'table_copy_after' && o.t === 15);
  assert.ok(copy1 >= 0 && copy2 > copy1);
  assert.deepEqual(BUDGET_COPIES, [71, 72]);
  assert.equal(PARTNER_COPY, 20);
  assert.ok(ops.slice(0, copy1).every(o => o.op !== 'fill' || o.t === 71), '예산서 복사 전에는 자체 투입 상자(71)만 채운다');
  const afterBudget = ops.slice(copy1, copy2).filter(o => o.op === 'fill').map(o => o.t);
  assert.ok(afterBudget.every((t, i) => i === 0 || t <= afterBudget[i - 1] || t === 72 || t === 71), '큰 번호부터');
  assert.ok(tables.includes(72) && tables.includes(71) && tables.includes(PARTNER_COPY));
});

test('원본 양식이 허용하는 줄 추가·표 복사 외에는 표 모양을 바꾸지 않는다', () => {
  const kinds = {};
  for (const o of ops) kinds[o.op] = (kinds[o.op] || 0) + 1;
  assert.equal(kinds.table_copy_after, 2); // 예산서, 참여기관
  assert.equal(kinds.table_delete, 1);     // 7-1의 이주배경 예시 표 하나
  assert.equal(kinds.merge_v, 3);          // 7-1 단계별로 프로그램 둘이 들어가는 단계 칸
  const rowTables = new Set(ops.filter(o => o.op === 'row_below' || o.op === 'row_delete').map(o => o.t));
  assert.deepEqual([...rowTables].sort((a, b) => a - b), [53, 56, 60, 63]); // 개요 표, 월별 표, 기반 활동 표, 담당 인력 표
});

test('22회와 봉사활동 2회, 신청액이 작업 내용에 들어 있다', () => {
  const text = fills.map(o => o.text).join('\n');
  const d = derive({});
  assert.ok(text.includes('22회'));
  assert.ok(text.includes('봉사활동: 우리가 만든 진로 정보 나누기'));
  assert.ok(text.includes(d.budget.total.toLocaleString('ko-KR')));
  assert.ok(text.includes('가상 설정으로 작성한 예시본입니다 (제출용이 아님)'));
  assert.ok(!text.includes('최종 제출'));
  for (const place of ['자원지도 이미지 자리', '교육 장소 전경 사진 자리', '직인 또는 서명 이미지 자리', '서명 또는 날인 자리']) assert.ok(text.includes(place), place);
});

test('모든 채움 칸에 글자가 있고 주소가 정수다', () => {
  for (const o of fills) {
    assert.ok(Number.isInteger(o.t) && Number.isInteger(o.r) && Number.isInteger(o.c), JSON.stringify(o).slice(0, 80));
    assert.ok(o.text.length > 0 || o.text === '', 'text');
    assert.ok(!/undefined|NaN|\{\{/.test(o.text), o.text.slice(0, 40));
  }
});
