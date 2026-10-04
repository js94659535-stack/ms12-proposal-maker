// 공고 수집 결과 읽기(10-42): D1 없이 모양 바꾸기·정렬·읽기 전용을 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, shapeNotice, shapeRun, daysLeft, kstToday } from '../functions/api/crawl.js';

const row = (over = {}) => ({ source_label: '중앙회', source_group: 'chest', title: '시험 공고', deadline: '2026-10-16', application_period: '2026-09-07 ~ 2026-10-16', summary: '요약', support_limit: '2억', notice_json: JSON.stringify({ sourceUrl: 'https://proposal.chest.or.kr/x', attachments: [{ name: '비공개 첨부' }] }), source_url: '', updated_at: '2026-10-03T23:00:00Z', ...over });

test('날짜 계산은 한국 시간 기준이다', () => {
  assert.equal(kstToday(new Date('2026-10-03T16:00:00Z')), '2026-10-04');
  assert.equal(daysLeft('2026-10-16', '2026-10-04'), 12);
  assert.equal(daysLeft('2026-10-01', '2026-10-04'), -3);
  assert.equal(daysLeft('', '2026-10-04'), null);
});

test('공고는 필요한 칸만 돌려주고 첨부 원문과 내부 열은 내보내지 않는다', () => {
  const item = shapeNotice(row(), '2026-10-04');
  assert.deepEqual(Object.keys(item).sort(), ['daysLeft', 'deadline', 'group', 'groupLabel', 'period', 'source', 'summary', 'supportLimit', 'title', 'updatedAt', 'url'].sort());
  assert.equal(item.daysLeft, 12);
  assert.equal(item.groupLabel, '사랑의열매');
  assert.equal(item.url, 'https://proposal.chest.or.kr/x');
  assert.equal(shapeNotice(row({ notice_json: JSON.stringify({ sourceUrl: 'javascript:alert(1)' }) })).url, '', 'https 주소만 연결한다');
});

test('수집 실행 기록은 통로별 실패를 그대로 보여 준다', () => {
  const run = shapeRun({ started_at: 'x', status: 'partial', collected: 1, inserted: 0, updated: 1, failure_code: 'mixed', sources_json: JSON.stringify([{ label: '광주지회 배분신청 포털', status: 'failed', code: 'shape', listed: 1, collected: 0 }]) });
  assert.equal(run.status, 'partial');
  assert.equal(run.channels[0].status, 'failed');
  assert.equal(run.channels[0].reason, 'shape');
  assert.equal(shapeRun(null), null);
});

test('읽기 전용: GET만 받고, 저장소가 없으면 503이다', async () => {
  const post = await onRequest({ request: new Request('https://x/api/crawl', { method: 'POST' }), env: {} });
  assert.equal(post.status, 405);
  const none = await onRequest({ request: new Request('https://x/api/crawl'), env: {} });
  assert.equal(none.status, 503);
});

test('저장소에서 읽어 마감이 가까운 순으로 정렬한다', async () => {
  const today = kstToday();
  const plus = n => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const rows = [row({ title: '지난 것', deadline: plus(-5) }), row({ title: '먼 것', deadline: plus(30) }), row({ title: '가까운 것', deadline: plus(3) }), row({ title: '기한 미상', deadline: '' })];
  const db = {
    prepare: sql => ({
      all: async () => ({ results: rows }),
      first: async () => (sql.includes('notice_collection_runs') ? { started_at: 's', status: 'ok', collected: 2, inserted: 1, updated: 1, failure_code: '', sources_json: '[]' } : { last_success_at: 'ok', consecutive_failures: 0 })
    })
  };
  const res = await onRequest({ request: new Request('https://x/api/crawl'), env: { ARCHIVE_DB: db } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.items.map(i => i.title), ['가까운 것', '먼 것', '기한 미상', '지난 것']);
  assert.equal(body.run.status, 'ok');
});
