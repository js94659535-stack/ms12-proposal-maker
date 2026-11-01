// 장을 건너 보는 검사(11-05): 장마다 글머리 모양이 같은가, 같은 문장이 여러 절에 되풀이되는가.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { headingStyleChecks, repeatedLineChecks, dice, REPEAT_DICE } from '../src/plan-checks.js';

const plainChapter = (key, lines) => ({ title: key, text: [`## ${key}. 장`, `### ${key}.1 절`, ...lines].join('\n') });

test('한 장만 「**1. 제목**」을 쓰면 그 장을 적는다 — 글머리표(o·-) 양은 보지 않는다', () => {
  const chapters = [
    plainChapter('Ⅰ', ['o [제안] 비전 문구', '- [제안] 세부']),
    plainChapter('Ⅱ', ['o [제안] 조직', '․ [제안] 작은 줄', '※ 참고']),
    plainChapter('Ⅲ', ['- [제안] 협력']),
    { title: 'Ⅴ', text: ['## Ⅴ. 홍보방안', '### Ⅴ 홍보방안', '**1. 홍보 기본 방향**', 'o [제안] 방향'].join('\n') }
  ];
  const result = headingStyleChecks(chapters);
  assert.equal(result.length, 1, JSON.stringify(result));
  assert.deepEqual(result[0].chapters, ['Ⅴ']);
  assert.match(result[0].detail, /Ⅴ만 「\*\*1\. 제목\*\*」/);
  // 거꾸로 한 장만 그 모양이 없어도 적는다 — 적은 쪽을.
  const most = chapters.map(chapter => ({ ...chapter, text: `${chapter.text}
**1. 소제목**` }));
  most[1] = chapters[1];
  assert.deepEqual(headingStyleChecks(most).map(check => [check.chapters, check.detail]), [[['Ⅱ'], 'Ⅱ에만 「**1. 제목**」 소제목이 없다 — Ⅰ, Ⅲ, Ⅴ는 쓴다']]);
  // 모든 장이 같은 모양이면 조용하다.
  assert.deepEqual(headingStyleChecks(chapters.slice(0, 3)), []);
});

test('닮은 문장이 여러 절에 있으면 한 무리로 묶어 warn 하나 — 출처 표시가 달라도 같은 문장이다', () => {
  const chapters = [
    plainChapter('Ⅱ', ['o [사실: 공고 제7조] 북한이탈주민과 일반주민이 고른 혜택을 받도록 공정한 참여 기준을 마련한다.']),
    plainChapter('Ⅲ', ['- [사실: 공고 협약서 제7조①] 북한이탈주민과 일반주민이 고른 혜택을 받도록 공정한 참여 기준·절차 마련']),
    plainChapter('Ⅴ', ['o [사실: 특수조건 제7조①] 북한이탈주민과 일반주민이 고른 혜택을 받도록 공정한 참여 기준을 마련해야 한다.', '- [제안] 지역 소식지와 하나센터 게시판에 분기마다 싣는다'])
  ];
  const result = repeatedLineChecks(chapters);
  assert.equal(result.length, 1, JSON.stringify(result));
  assert.deepEqual(result[0].parts, ['Ⅱ.1', 'Ⅲ.1', 'Ⅴ.1']);
});

test('같은 절 안의 되풀이와 짧은 줄은 보지 않고, 낱말만 겹치는 다른 문장은 같은 문장이 아니다', () => {
  const chapters = [
    plainChapter('Ⅰ', ['- [제안] 분기 종료 후 14일 이내 중간보고에 설문결과 포함', '- [제안] 분기 종료 후 14일 이내 중간보고에 설문결과 포함', '- 상담 운영']),
    plainChapter('Ⅱ', ['- [제안] 상담 운영', '- [제안] 회차·정원·목표 인원: [확인 필요: 프로그램별 회차·정원·목표 인원]']),
    plainChapter('Ⅲ', ['- [제안] 회차·정원: [확인 필요: 프로그램별 연간 회차와 정원]'])
  ];
  assert.deepEqual(repeatedLineChecks(chapters), []);
  assert.ok(dice('회차·정원·목표 인원: [확인 필요: 프로그램별 회차·정원·목표 인원]', '회차·정원: [확인 필요: 프로그램별 연간 회차와 정원]') < REPEAT_DICE);
});

test('11-03 한 편: Ⅴ장 글머리 하나, 「공정한 참여 기준」은 Ⅱ.2·Ⅲ.2·Ⅴ 세 곳이 한 warn', { skip: !fs.existsSync(new URL('../reports/11-03-full/medium/', import.meta.url)) }, () => {
  const dir = new URL('../reports/11-03-full/medium/', import.meta.url);
  const chapters = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'].map(key => ({ title: key, text: fs.readFileSync(new URL(fs.readdirSync(dir).find(name => name.startsWith(`draft_${key}.`)), dir), 'utf8') }));
  assert.deepEqual(headingStyleChecks(chapters).map(check => check.chapters), [['Ⅴ']]);
  const repeats = repeatedLineChecks(chapters);
  const fair = repeats.filter(check => check.detail.includes('공정한 참여 기준'));
  assert.deepEqual(fair.map(check => check.parts), [['Ⅱ.2', 'Ⅲ.2', 'Ⅴ']]);
  assert.equal(repeats.length, 6);
});

test('「### 1. 일반 현황」처럼 장 번호 없는 소제목은 그 장의 절로 읽는다(11-09)', async () => {
  const { sectionLines } = await import('../src/plan-checks.js');
  const lines = sectionLines([{ title: 'Ⅱ', text: ['## Ⅱ. 사업운영계획', '### 1. 일반 현황', '- [제안] 사업총괄책임자 아래 상담·교육·운영 부문을 둔다', '### 2. 프로그램 운영 계획', '- [제안] 마음건강 검사 → 성격검사 후 해석 상담 → 해석지'].join('\n') }]);
  assert.deepEqual(lines.map(line => line.part), ['Ⅱ.1', 'Ⅱ.2']);
});

test('후처리(11-10): Ⅴ의 「**1. 제목**」은 「#### 1. 제목」이 되고, 절 하나뿐인 장의 ####는 다른 장의 ###와 같은 층으로 본다', async () => {
  const { tidyDraft } = await import('../src/proposal-draft.js');
  const v = tidyDraft(['## Ⅴ. 홍보방안', '### Ⅴ 홍보방안', '**1. 홍보 기본방향**', 'o [제안] 핵심 메시지'].join('\n'));
  assert.match(v.text, /^#### 1\. 홍보 기본방향$/m);
  assert.equal(v.notes[0].what, '후처리: 굵은 번호 줄을 소제목으로');
  const chapters = [plainChapter('Ⅰ', ['o [제안] 비전']), plainChapter('Ⅱ', ['o [제안] 조직']), { title: 'Ⅴ', text: v.text }];
  assert.deepEqual(headingStyleChecks(chapters), []);
  // 절이 여럿인 장이 ####를 쓰면 여전히 다르다.
  const many = { title: 'Ⅲ', text: ['## Ⅲ. 장', '### Ⅲ.1 절', '#### 1. 소', '### Ⅲ.2 절'].join('\n') };
  assert.equal(headingStyleChecks([...chapters, many]).length, 1);
});

test('후처리(11-10): 평가 우대를 옮긴 공고 사실 줄은 지우고, 제안 줄은 남기고 warn', async () => {
  const { tidyDraft } = await import('../src/proposal-draft.js');
  const { text, notes } = tidyDraft(['※ [사실: 공고 Ⅱ.5] 신규 상담지원·교육 프로그램 포함 시 평가 우대', 'o [제안] 신규 상담지원·교육 (평가 우대 대응)', '- [사실: 기관 자료] 2025 장성교육지원청 상담'].join('\n'));
  assert.doesNotMatch(text, /\[사실: 공고 Ⅱ\.5\]/);
  assert.match(text, /\(평가 우대 대응\)/);
  assert.match(text, /장성교육지원청/);
  assert.deepEqual(notes.map(note => note.level), ['pass', 'warn']);
});
