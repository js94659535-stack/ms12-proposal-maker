// AI로 보내는 자료 줄이기. 조용히 자르지 않고, 서식 규격은 그대로 지킨다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PER_SOURCE_CHARS, TOTAL_SOURCE_CHARS, summarizeForm, trimManualSources } from '../src/payload-trim.js';

const SPEC = {
  items: [{ name: '1) 사업 필요성', limitChars: 1000 }, { name: '2) 사업 목표', limitPages: 2 }],
  tables: [{ kind: '예산표', title: '예산 내역', columns: ['항목', '산출근거', '금액'] }],
  attachments: [{ name: '고유번호증', required: true }, { name: '기관 소개서', required: false }]
};

test('서식은 원문 대신 규격 요약으로 보낸다', () => {
  const source = { fileName: '배분신청서.hwp', sourceType: '공모신청서', extractionStatus: 'success', extractedText: '가'.repeat(25_000) };
  const { sources, notes } = trimManualSources([source], SPEC);
  const sent = sources[0].extractedText;
  assert.ok(sent.length < 2_000, `요약 길이 ${sent.length}`);
  // 항목 이름·분량·표 칸·첨부는 그대로 담는다.
  for (const needle of ['1) 사업 필요성 (1000자 이내)', '2) 사업 목표 (2쪽 이내)', '항목 | 산출근거 | 금액', '고유번호증 (필수)']) {
    assert.ok(sent.includes(needle), needle);
  }
  assert.match(notes.join(' '), /서식 규격 요약으로 보냈습니다/);
});

test('공고문 본문은 줄이지 않는다', () => {
  const notice = { fileName: '공고문.txt', sourceType: '세부 공고문', extractionStatus: 'success', extractedText: '나'.repeat(9_000) };
  const { sources, notes } = trimManualSources([notice], SPEC);
  assert.equal(sources[0].extractedText.length, 9_000);
  assert.equal(notes.length, 0);
});

test('한 자료가 너무 길면 앞부분만 보내고 잘랐다고 밝힌다', () => {
  const long = { fileName: '참고자료.txt', sourceType: '기타 안내자료', extractionStatus: 'success', extractedText: '다'.repeat(PER_SOURCE_CHARS + 5_000) };
  const { sources, notes } = trimManualSources([long], null);
  assert.ok(sources[0].extractedText.length <= PER_SOURCE_CHARS + 60);
  assert.match(sources[0].extractedText, /뒷부분을 보내지 않았습니다/);
  assert.match(notes.join(' '), /앞 12,000자만 보냈습니다/);
});

test('전체 길이를 넘으면 뒤 자료를 조용히 버리지 않는다', () => {
  const make = (name, size) => ({ fileName: name, sourceType: '기타 안내자료', extractionStatus: 'success', extractedText: '라'.repeat(size) });
  // 넷째 자료는 남은 자리만큼만 들어가고, 잘랐다고 밝힌다.
  const four = trimManualSources([make('A', 12_000), make('B', 12_000), make('C', 12_000), make('D', 12_000)], null);
  assert.ok(four.chars <= TOTAL_SOURCE_CHARS + 40, `보낸 길이 ${four.chars}`);
  assert.match(four.notes.join(' '), /전체 길이 제한으로 앞 .*자만 보냈습니다/);
  assert.match(four.sources[3].extractedText, /전체 길이 제한으로 잘렸습니다/);
  // 자리가 아예 없으면 넣지 않았다고 밝힌다. 조용히 버리지 않는다.
  const five = trimManualSources([make('A', 12_000), make('B', 12_000), make('C', 12_000), make('D', 12_000), make('E', 12_000)], null);
  const dropped = five.sources.filter(item => item.extractionStatus === 'skipped');
  assert.equal(dropped.length, 1);
  assert.match(dropped[0].extractionError, /길이 제한/);
  assert.match(five.notes.join(' '), /이번 작성에는 넣지 않았습니다/);
});

test('읽지 못한 자료는 손대지 않는다', () => {
  const failed = { fileName: 'x.hwp', sourceType: '공모신청서', extractionStatus: 'failed', extractedText: '' };
  const { sources, notes } = trimManualSources([failed], SPEC);
  assert.deepEqual(sources[0], failed);
  assert.equal(notes.length, 0);
});

test('규격을 읽지 못한 서식은 요약으로 바꾸지 않는다', () => {
  assert.equal(summarizeForm({ fileName: 'f' }, null), '');
  const source = { fileName: 'f.hwp', sourceType: '공모신청서', extractionStatus: 'success', extractedText: '마'.repeat(500) };
  const { sources } = trimManualSources([source], null);
  assert.equal(sources[0].extractedText.length, 500);
});

// 설계 호출은 게이트웨이 한도를 넘기지 않도록 background로 돌린다.
test('설계는 시작과 결과 확인을 나눠 부른다', async () => {
  const fs = await import('node:fs');
  const api = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
  // 시작 요청은 결과를 기다리지 않고 작업 번호만 돌려준다.
  assert.match(api, /const background = body\.action === 'master' \|\| \(BACKGROUND_ACTIONS\.has\(body\.action\) && body\.background === true\);/);
  assert.match(api, /\.\.\.\(background \? \{ background: true \} : \{\}\)/);
  assert.match(api, /return json\(\{ jobId: startedId, status: raw\?\.status \|\| 'queued', pending: true \}, 200\);/);
  // 진행 중이면 상태만 돌려주고 결과 처리로 내려가지 않는다.
  assert.match(api, /if \(stage !== 'completed' && stage !== 'failed' && stage !== 'incomplete'\)/);
  // 작업 번호는 형식을 확인한다.
  assert.match(api, /if \(jobId && !\/\^resp_\[a-zA-Z0-9_-\]\+\$\/\.test\(jobId\)\)/);
  // 진행 상황을 물을 때 편수·체험 횟수를 다시 깎지 않는다.
  assert.match(api, /const polling = BACKGROUND_ACTIONS\.has\(body\.action\) && Boolean\(body\.jobId\);/);
  assert.match(api, /const trialRun = !polling &&/);
  assert.match(api, /const countsQuota = !polling &&/);
  // background로 돌린 작업만 잠시 보관한다.
  assert.match(api, /store: background,/);
});
