// 11칸 요약을 눌러 그 칸을 적는 자리로 간다.
//
// 실제로 났던 일: 「11칸이 전부 0건인데 채울 길이 안 보인다」. 요약 열한 칸은 처리기 없는
// 순수 <div>여서 눌러도 아무 일이 없었고, 편집 자리는 같은 화면 훨씬 아래에 있었다.
// 문서에서 한 번에 뽑는 길도 화면 맨 아래에 있어 위에서부터 손으로 채우는 사람은 끝까지 못 봤다.
//
// 새 항목을 만들지 않는다. 이미 있는 구조(openOrgGroups·data-detail-group·문서 추출)를 보이게만 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPLICANT_AREAS } from '../src/applicants.js';
import { BASIC_AREAS, DETAIL_GROUPS, areaDestination } from '../src/org-stage.js';
import { ORG_TYPES } from '../server/quick-org.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('열한 칸에 갈 자리가 하나도 빠지지 않는다', () => {
  // 요약은 열한 칸인데 편집은 기본정보 둘 + 상세 여덟이라 1:1이 아니다.
  // 하나라도 빠지면 그 칸만 눌러도 아무 일이 없다 — 고치기 전과 같은 상태다.
  const targets = APPLICANT_AREAS.map(area => ({ area: area.key, target: areaDestination(area.key) }));
  const missing = targets.filter(entry => !entry.target).map(entry => entry.area);
  assert.deepEqual(missing, [], '갈 자리가 없는 칸');
  assert.equal(targets.length, 11);
  // 돌려주는 값은 화면이 실제로 쓰는 data-detail-group 값이어야 한다.
  const drawn = [...BASIC_AREAS, ...DETAIL_GROUPS.map(group => group.key)];
  for (const entry of targets) assert.ok(drawn.includes(entry.target), `${entry.area} → ${entry.target} 는 화면에 없는 자리다`);
  // 두 칸이 한 묶음으로 간다. 그것이 1:1이 아닌 이유다.
  assert.equal(areaDestination('measurement'), areaDestination('references'));
  assert.equal(areaDestination(''), '');
  assert.equal(areaDestination('없는칸'), '');
});

test('요약 칸이 눌리는 모양이고 눌리면 그 자리를 연다', () => {
  assert.match(app, /<button type="button" data-open-area="\$\{escapeHtml\(area\.key\)\}"/);
  assert.doesNotMatch(app, /summary-grid">\$\{applicantAreaSummary\(applicant\)\.map\(area => `<div>/, '순수 div로 되돌아가면 다시 죽는다');
  // 처리기는 대응표를 통해 자리를 찾는다. 화면에 키를 손으로 적지 않는다.
  assert.match(app, /const target = areaDestination\(el\.dataset\.openArea\);/);
  // 열 자리는 다른 화면에 있다. 화면을 옮기지 않으면 처리기가 조용히 아무 일도 하지 않는다.
  // 실제로 눌러 보는 검사는 test/org-card-click.test.js 가 한다 — 여기서는 옮긴다는 것만 본다.
  assert.match(app, /function openApplicantEditor\(\{ group = '', anchor = '' \}\) \{/);
  assert.match(app, /activeTool: 'applicants',/);
  assert.doesNotMatch(app, /if \(target\) setState\(\{ openOrgGroups:/, '화면을 안 옮기던 옛 처리기로 돌아가면 다시 죽는다');
  // 눌러도 되는 것처럼 보여야 한다. 배지와 반대다.
  assert.match(css, /\.summary-grid>button\{text-align:left/);
  assert.match(css, /\.summary-grid>button:hover,\.summary-grid>button:focus-visible\{border-color:var\(--blue\)/);
});

test('전부 0건일 때만 문서 추출을 가리킨다', () => {
  const view = app.slice(app.indexOf('function applicantLoadedView'), app.indexOf('function applicantFitView'));
  assert.match(view, /const empty = summary\.every\(area => !area\.total\);/);
  assert.match(view, /\$\{empty \? `<div class="alert warning">/, '이미 채웠으면 뜨지 않는다');
  assert.match(view, /기존 사업계획서나 결과보고서를 올리면 여러 칸을 한 번에 채울 수 있습니다/);
  // 말만 하고 데려가지 않으면 지금과 다를 것이 없다.
  assert.match(view, /id="go-applicant-doc"/);
  assert.match(app, /<div class="card" id="applicant-doc" tabindex="-1">/);
  assert.match(app, /document\.querySelector\('#go-applicant-doc'\)\?\.addEventListener\('click', \(\) => openApplicantEditor\(\{ anchor: '#applicant-doc' \}\)\);/);
});

test('기관 유형은 두 화면 모두 같은 목록에서 고른다', () => {
  // 「내 정보」만 자유 입력이면 「사단법인」과 「사단·재단법인」이 따로 저장되고
  // 그 값이 org-profile 을 타고 신청기관 기본정보로 넘어간다.
  assert.match(app, /\['orgType', '기관 유형', 'choices'\]/);
  assert.doesNotMatch(app, /\['orgType', '기관 유형', 'input'\]/);
  assert.match(app, /kind === 'choices'\n\s+\? `<select id="member-\$\{key\}" data-member-field="\$\{key\}">/);
  // 목록에 없는 예전 값은 지우지 않고 그대로 남긴다. 저장해 둔 값을 화면이 삼키면 안 된다.
  assert.match(app, /\(이전에 적은 값\)/);
  // 값 목록을 새로 만들지 않았다. 이미 있던 아홉 개 그대로다.
  assert.equal(ORG_TYPES.length, 9);
});
