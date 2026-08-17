import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { noticeSourceUrl } from '../src/archive-table.js';
import { extractAttachments } from '../server/extra-collect.js';
import { SOURCES } from '../server/notice-sources.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('원문 바로가기는 수집할 때 열어 본 그 주소로 간다', () => {
  // 부스러기사랑나눔회 공고를 눌렀는데 사랑의열매 게시판이 열리던 문제.
  const busrugy = {
    source: 'busrugy-notice', sourceLabel: '부스러기사랑나눔회 공지사항',
    sourceUrl: 'https://busrugy.or.kr/NOTICE/?bmode=view&idx=12345&t=board'
  };
  assert.equal(noticeSourceUrl(busrugy), busrugy.sourceUrl);
  assert.doesNotMatch(noticeSourceUrl(busrugy), /chest\.or\.kr/);
});

test('사랑의열매 공고는 예전 그대로 사업 상세·게시판으로 간다', () => {
  assert.match(noticeSourceUrl({ dstbBsnsCode: '20260700100022' }), /^https:\/\/proposal\.chest\.or\.kr\/mobile\/mobileMainBsnsDetail\.do\?dstbBsnsCode=20260700100022/);
  assert.equal(noticeSourceUrl({ source: 'gwangju' }), 'https://gwangju.chest.or.kr/bbs/1000/initPostList.do');
  assert.equal(noticeSourceUrl({ source: 'central' }), 'https://chest.or.kr/bbs/1000/initPostList.do');
});

test('주소를 모르는 공고는 아무 기관 게시판이나 열어 주지 않는다', () => {
  assert.equal(noticeSourceUrl({ source: 'kihf-notice' }), '');
  // 화면도 빈 주소로 링크를 만들지 않는다.
  assert.match(app, /row\.sourceUrl\s*\n?\s*\?\s*`<a class="archive-menu-item" href=/);
  assert.match(app, /원문 주소를 수집하지 못했습니다/);
});

test('첨부는 이름과 내려받을 주소를 함께 남긴다', () => {
  const html = `
    <div class="board_view">
      <a href="/web/upload/공고문.hwp">부스러기사랑나눔회 공고 제2026-006호.hwp</a>
      <a href="https://busrugy.or.kr/files/서식.zip">[서식 1~4] 제안서 평가위원 등록 신청서 외.zip</a>
      <a href="/download.do?uuid=abc-123">2026년 사업 신청서식.hwpx</a>
      <a href="/NOTICE/?bmode=view&idx=9">다음 글 보기</a>
      <a href="javascript:void(0)">인쇄</a>
    </div>`;
  const found = extractAttachments(html, 'https://busrugy.or.kr');
  assert.equal(found.length, 3, JSON.stringify(found));
  // 상대 주소는 절대 주소로 만든다. 그래야 나중에 그대로 열 수 있다.
  assert.equal(found[0].url, 'https://busrugy.or.kr/web/upload/공고문.hwp');
  assert.equal(found[0].name, '부스러기사랑나눔회 공고 제2026-006호.hwp');
  assert.equal(found[0].fileType, 'hwp');
  assert.equal(found[1].url, 'https://busrugy.or.kr/files/서식.zip');
  // 주소에 확장자가 없어도 이름에 있으면 첨부로 본다(건강가정진흥원 방식).
  assert.equal(found[2].url, 'https://busrugy.or.kr/download.do?uuid=abc-123');
  assert.equal(found[2].fileType, 'hwpx');
  // 본문 링크와 스크립트 링크는 첨부가 아니다.
  assert.ok(!found.some(item => /다음 글|인쇄/.test(item.name)));
});

test('같은 파일을 두 번 세지 않고 열 개까지만 남긴다', () => {
  const one = '<a href="/a/서식.hwp">서식.hwp</a>';
  assert.equal(extractAttachments(`${one}${one}`, 'https://x.kr').length, 1);
  const many = Array.from({ length: 14 }, (_, i) => `<a href="/f/${i}.pdf">문서${i}.pdf</a>`).join('');
  assert.equal(extractAttachments(many, 'https://x.kr').length, 10);
});

test('아임웹 게시판을 함께 쓰는 두 기관이 서로의 이름을 달지 않는다', () => {
  const imweb = SOURCES.filter(source => source.platform === 'imweb');
  assert.equal(imweb.length, 2);
  for (const source of imweb) assert.ok(source.shortLabel, `${source.id}에 짧은 이름이 없다`);
  const busrugy = SOURCES.find(source => source.id === 'busrugy-notice');
  assert.equal(busrugy.shortLabel, '부스러기사랑나눔회');
  const collector = fs.readFileSync(new URL('../server/extra-collect.js', import.meta.url), 'utf8');
  // 수집기 안에 기관 이름을 붙박이로 적어 두지 않는다.
  assert.doesNotMatch(collector, /sourceLabelShort: '바보의나눔'/);
  assert.match(collector, /sourceLabelShort: shortLabelOf\(source\)/);
});
