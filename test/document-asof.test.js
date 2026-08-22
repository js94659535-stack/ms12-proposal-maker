// 문서 기준시점은 「이 문서가 언제 것인가」다. 안에 적힌 날짜가 아니다.
//
// 실제로 났던 일: 사업자등록증의 개업연월일(2021-08)이 문서 날짜가 되어, 2026년에 발급받은
// 등록증을 올려도 기준시점이 2021년이었다. 그러면 「다시 확인」이 영영 사라지지 않는다.
// 실제 증명원에서도 발급일(2024-03)이 아니라 개업일(2022-04)이 잡혔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { documentAsOf, extractApplicantCandidates } from '../src/applicant-extract.js';

const CERT = [
  '사 업 자 등 록 증',
  '등 록 번 호 : 409-86-01234',
  '법 인 명 ( 단 체 명 ) : (주)마인드스토리',
  '대 표 자 ( 대 표 유 형 ) 박종석',
  '개 업 연 월 일 : 2021 년 08 월 26 일',
  '사 업 장 소 재 지 : 광주광역시 광산구 임방울대로 356',
  '2026 년 08 월 22 일',
  '광 주 세 무 서 장'
].join('\n');

test('개업연월일은 문서 날짜가 아니다', () => {
  // 끝머리의 「날짜 + 세무서장」이 이 문서를 찍어 낸 날이다.
  assert.equal(documentAsOf(CERT), '2026-08');
  const found = extractApplicantCandidates(CERT, { documentName: 'QA 등록증' }).candidates;
  const map = new Map(found.map(item => [item.label, item.asOf]));
  // 자기 날짜가 없는 항목은 문서 날짜를 따른다.
  assert.equal(map.get('기관명'), '2026-08');
  assert.equal(map.get('대표자'), '2026-08');
  assert.equal(map.get('소재지'), '2026-08');
  // 개업연월일은 설립 시기 값으로만 남는다.
  assert.equal(map.get('설립 시기'), '2021-08');
});

test('이름이 붙은 날짜가 있으면 그것이 먼저다', () => {
  assert.equal(documentAsOf('기관 소개서\n발급일자 : 2025-03-11\n개업일 2011년 4월 2일'), '2025-03');
  assert.equal(documentAsOf('출력일시 2024.09.01\n설립 2001년'), '2024-09');
});

test('날짜만 따로 선 줄을 문서 날짜로 본다', () => {
  // 실제 사업자등록증명원이 「2024 년 3 월 4 일」 한 줄로 찍혀 있었다. 본문 속 개업일에 걸리지 않는다.
  const body = ['사 업 자 등 록 증 명', '개 업 일 2022년 04월 02일', '사 업 자 등 록 일 2022년 04월 04일', '2024 년 3 월 4 일', '접 수 번 호 503831594655'].join('\n');
  assert.equal(documentAsOf(body), '2024-03');
});

test('문서가 스스로 날짜를 말하지 않으면 올린 날짜다', () => {
  const body = '기관 소개\n우리는 아동을 돕습니다.';
  // 본문에서 아무 날짜나 주워 오지 않는다.
  assert.equal(documentAsOf(body), '');
  assert.equal(documentAsOf(body, '2026-08-22'), '2026-08');
});

test('실적은 그 사업이 언제 것인가로 남는다', () => {
  // 문서 기준시점과 항목 기준시점은 다른 개념이다. 실적은 행마다 그 해를 쓴다.
  const rows = ['2017년\t1\t송원대학교\t취창업 청년 캠프\t진로역량 지원', '2026년\t1\t전남대학교\t생성형 AI 기초\t제미나이 기초'].join('\n');
  const found = extractApplicantCandidates(rows, { documentName: 'QA 연혁', receivedOn: '2026-08-22' }).candidates;
  assert.deepEqual(found.map(item => item.asOf), ['2017', '2026']);
});
