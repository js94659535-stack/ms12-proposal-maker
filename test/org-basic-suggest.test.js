// 기본정보 세 칸을 올린 자료에서 제안한다.
//
// 실제로 났던 일: 등록증과 연혁을 올려 실적 99건과 기관명·대표자는 채워졌는데
// 담당자·주로 돕는 대상·강점은 여전히 빈칸이었다. 그 답이 이미 올린 자료 안에 있었다.
//
// 다만 자동으로 채운 값은 확인 전이다. 어디서 왔는지 화면에 적고, 상태는 「확인 필요」로 두고,
// 회원이 고칠 수 있어야 한다. 연락처는 어떤 서류에도 없으므로 만들지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { suggestBasicFields, suggestContact, suggestServed, suggestStrength } from '../src/org-basic-suggest.js';
import { quickToApplicantItems } from '../server/quick-org.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const applicant = {
  items: [
    { area: 'basic', label: '대표자', value: '박종석', status: '확인 필요', source: '사업자등록증에서 추출' },
    { area: 'performance', label: '2026년 사업실적', value: '벧엘지역아동센터 미래설계 AI진로동화 프로젝트' },
    { area: 'performance', label: '2025년 사업실적', value: '광주 남구 가족센터 진로 설계프로그램' },
    { area: 'performance', label: '2025년 사업실적', value: '무안군 가족센터 사회성 UP 프로젝트' }
  ]
};

test('담당자는 이름만 넣고 연락처는 비워 둔다', () => {
  const contact = suggestContact(applicant, {});
  assert.equal(contact.value, '박종석');
  // 전화번호를 만들어 붙이지 않는다.
  assert.doesNotMatch(contact.value, /\d/);
  assert.match(contact.note, /사업자등록증의 대표자에서 가져왔습니다/);
  assert.match(contact.note, /다르면 고쳐 주세요/);
  assert.match(contact.note, /연락처는 서류에 없어 비워 둡니다/);
});

test('대상과 강점은 무엇을 세었는지 함께 말한다', () => {
  const served = suggestServed(applicant);
  // 발주기관 이름이 대상을 그대로 말한다 — 가족센터 2곳, 지역아동센터 1곳.
  assert.equal(served.value, '가족 · 아동');
  assert.match(served.note, /실적·프로그램 3건에서 가족 2곳 · 아동 1곳/);
  assert.match(served.note, /연혁에서 가져왔습니다/);
  const strength = suggestStrength(applicant);
  assert.match(strength.value, /진로 관련 2건/);
  // 잘한다는 판단이 아니라 건수라고 밝힌다.
  assert.match(strength.note, /잘한다는 판단이 아니라 건수입니다/);
});

test('자료가 없으면 제안하지 않는다', () => {
  const empty = suggestBasicFields({ items: [] }, {});
  assert.deepEqual(empty, { contact: null, served: null, strength: null });
});

test('넣은 값은 확인 필요 상태로 저장된다', () => {
  // 간단 입력이 기관 항목이 될 때의 상태다. 자동으로 넣었든 손으로 적었든 확인 전이다.
  const items = quickToApplicantItems({ contact: '박종석', served: '아동 · 가족', strength: '진로 관련 2건' });
  assert.equal(items.length, 3);
  assert.deepEqual([...new Set(items.map(item => item.status))], ['확인 필요']);
});

test('찾은 값은 묻지 않고 넣고, 출처만 남긴다', () => {
  const view = app.slice(app.indexOf("function applicantBasicView(applicant, who = '신청기관')"), app.indexOf('function applicantCandidateView('));
  // 「이 값 넣기」 버튼은 없앴다. 절차를 늘리지 않는다.
  assert.doesNotMatch(view, /data-fill-quick/);
  assert.doesNotMatch(view, /이 값 넣기/);
  // 비어 있는 칸에만 넣는다. 이미 적어 둔 값은 건드리지 않는다.
  const fill = app.slice(app.indexOf('function fillQuickFromDocuments(applicant)'), app.indexOf('// 기관정보 화면이 지금 다루는 기관.'));
  assert.match(fill, /if \(!suggestion \|\| String\(draft\[key\] \|\| ''\)\.trim\(\)\) continue;/);
  // 기관을 열 때와 후보를 반영한 뒤에 넣는다.
  assert.match(app, /\.\.\.\(fillQuickFromDocuments\(findApplicant\(state\.applicants, el\.dataset\.editApplicant\)\) \|\| \{\}\)/);
  assert.match(app, /const autofill = fillQuickFromDocuments\(findApplicant\(state\.applicants, applicant\.id\)\);/);
  // 넣은 뒤에는 어디서 온 값인지 칸 아래에 남는다.
  assert.match(view, /\(state\.quickFilledFrom \|\| \{\}\)\[field\.key\] && String\(draft\[field\.key\] \|\| ''\)\.trim\(\)/);
  // 손으로 고치면 그 표시를 지운다.
  const handler = app.slice(app.indexOf("document.querySelectorAll('[data-quick-field]')"), app.indexOf("document.querySelectorAll('select[data-quick-field]')"));
  assert.match(handler, /delete rest\[el\.dataset\.quickField\]/);
});

test('실적표의 프로그램 내용 칸까지 함께 센다', () => {
  // 값에는 기관·사업명만 들어가고 내용은 detail에 남는다. 대상을 세려면 둘 다 봐야 한다.
  const withDetail = {
    items: [
      { area: 'performance', label: '2026년 사업실적', value: '순창 복흥중학교 AI활용교육', detail: '글쓰기, 이미지 생성, 작곡 AI활용법' },
      { area: 'performance', label: '2025년 사업실적', value: '광주 북구 여성인력개발센터 브리지커뮤니케이터', detail: '경력단절여성 실무 중심 양성' }
    ]
  };
  const served = suggestServed(withDetail);
  assert.equal(served.value, '학생 · 여성');
  // 강점도 내용 칸의 낱말을 센다.
  const strength = suggestStrength(withDetail);
  assert.match(strength.value, /교육 관련/);
});

test('실적표 한 행에서 프로그램 내용을 뽑아 항목에 남긴다', async () => {
  const { extractApplicantCandidates } = await import('../src/applicant-extract.js');
  const row = '2026년\t1\t순창 복흥중학교\tAI활용교육\t글쓰기, 이미지 생성, 작곡 AI활용법';
  const [candidate] = extractApplicantCandidates(row, { documentName: 'QA 연혁' }).candidates;
  assert.equal(candidate.value, '순창 복흥중학교 AI활용교육');
  assert.equal(candidate.detail, '글쓰기, 이미지 생성, 작곡 AI활용법');
});
