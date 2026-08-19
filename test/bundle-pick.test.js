// 공고 첨부에서 무엇을 본문에 넣고 무엇을 뺄지.
//
// 왜 가려 넣는가: ZIP 안에는 서식만 있는 것이 아니라 「작성예시」·「작성가이드」·「안내서류」가
// 함께 들어 있다. 다른 기관의 예시 계획서 문장이 근거로 섞이면 지어내지 않는다는 원칙이
// 무너진다. 읽되 본문에 넣지 않는다.
//
// 왜 뺀 것도 보여 주는가: 판정이 틀릴 수 있다. 조용히 빼면 빠진 줄도 모른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bundlePick, classifyAttachmentRole, formSourceTypeOf, leafName, splitBundle } from '../src/notice-bundle.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const read = (name, text = '가'.repeat(80)) => ({
  name, status: '읽음', text, chars: text.length,
  role: classifyAttachmentRole(name), extension: name.split('.').pop().toLowerCase()
});

test('본문에 넣는 것은 공고문·서식·평가표·예산기준 넷뿐이다', () => {
  for (const name of ['1. 2027년 사업 공고문.hwp', '양식.zip > 사업계획서 양식.hwpx',
    '심사기준표.pdf', '예산 편성 기준.hwp']) {
    assert.equal(bundlePick(read(name)).include, true, name);
  }
});

test('예시와 작성가이드는 읽되 넣지 않는다', () => {
  // 이것이 이 파일의 핵심이다. 남의 완성 계획서가 본문 근거로 들어가면 안 된다.
  const example = bundlePick(read('양식.zip > 사업계획서 작성예시.hwpx'));
  assert.equal(example.include, false);
  assert.equal(example.reason, '예시 자료');
  assert.equal(bundlePick(read('작성가이드.pdf')).reason, '작성가이드');
  assert.equal(bundlePick(read('신청 안내서류.pdf')).reason, '안내서류');
  // 「안내서류」가 「안내서」 규칙에 먼저 걸리면 이유가 엉뚱해진다. 좁은 것이 앞에 있어야 한다.
  assert.notEqual(bundlePick(read('신청 안내서류.pdf')).reason, '작성가이드');
});

test('이름이 서식이어도 읽지 못했으면 넣지 않고 이유를 그대로 적는다', () => {
  const failed = { name: '양식.hwp', status: '미지원', text: '', chars: 0, error: '파일 내용을 받지 못했습니다.', role: '신청서·계획서 양식', extension: 'hwp' };
  const pick = bundlePick(failed);
  assert.equal(pick.include, false);
  // 「미지원」으로 뭉개지 않고 원래 이유를 남긴다.
  assert.equal(pick.reason, '파일 내용을 받지 못했습니다.');
});

test('ZIP 껍데기 자체는 넣지 않는다', () => {
  const zip = { name: '양식.zip', status: '펼침', text: '', chars: 0, role: '기타 참고자료', extension: 'zip' };
  const pick = bundlePick(zip);
  assert.equal(pick.include, false);
  assert.match(pick.reason, /압축 파일/);
});

test('묶음을 넣음과 넣지 않음으로 나누고 이유를 붙인다', () => {
  const { included, skipped } = splitBundle([
    read('1. 공고문.hwp'),
    read('양식.zip > 사업계획서 양식.hwpx'),
    read('양식.zip > 작성예시.hwpx'),
    { name: '포스터.jpg', status: '미지원', text: '', chars: 0, error: 'JPG 형식은 현재 자동 추출 대상이 아닙니다.', role: '기타 참고자료', extension: 'jpg' }
  ]);
  assert.deepEqual(included.map(item => item.name), ['1. 공고문.hwp', '양식.zip > 사업계획서 양식.hwpx']);
  assert.equal(skipped.length, 2);
  for (const item of [...included, ...skipped]) assert.ok(item.pickReason, `${item.name}에 이유가 없다`);
});

test('부모 ZIP 이름이 안쪽 파일 판정을 뒤집지 않는다', () => {
  // 실제로 났던 일: 「2. 사업계획서 양식 및 안내서류.zip」 안의 「사업계획서 양식.hwpx」가
  // 부모 이름의 「안내서류」에 걸려 통째로 빠졌다. 서식을 잡으려고 만든 기능이 서식을 버렸다.
  const inner = read('2. 사업계획서 양식 및 안내서류.zip > 사업계획서 양식.hwpx');
  const pick = bundlePick(inner);
  assert.equal(pick.include, true, '부모 이름 때문에 빠지면 안 된다');
  assert.equal(pick.reason, '신청서·계획서 양식');
  assert.equal(formSourceTypeOf(inner), '사업계획서 서식');
  // 반대로 안쪽이 예시면 부모가 「양식」이어도 빠져야 한다.
  assert.equal(bundlePick(read('2. 양식.zip > 작성예시.hwpx')).reason, '예시 자료');
  assert.equal(leafName('a.zip > b.zip > c.hwpx'), 'c.hwpx');
});

test('서식은 본문이 아니라 직접 자료로 간다', () => {
  // buildFormSpec은 manualSources의 sourceType만 읽는다. sourceText로 보내면 서식이 안 잡힌다.
  assert.equal(formSourceTypeOf(read('양식.zip > 사업계획서 양식.hwpx')), '사업계획서 서식');
  assert.equal(formSourceTypeOf(read('예산 편성 기준.hwp')), '예산 편성 기준');
  assert.equal(formSourceTypeOf(read('1. 공고문.hwp')), '', '공고문은 본문으로 간다');
});

test('앱이 같은 판정을 쓰고 되넣기 길이 같다', () => {
  // 화면과 입력이 다른 판정을 쓰면 「넣었다고 적혔는데 안 들어간」 상태가 난다.
  assert.match(app, /const picked = splitBundle\(files\);/);
  assert.match(app, /adoptBundleFiles\(picked\.included\);/);
  assert.match(app, /function adoptBundleFiles\(files = \[\]\) \{/);
  // 「이것도 넣기」도 같은 함수를 쓴다. 두 길로 나누면 한쪽만 고치는 사고가 난다.
  assert.match(app, /data-adopt-bundle/);
  assert.match(app, /const added = adoptBundleFiles\(\[\{ \.\.\.file, role: file\.role \}\]\);/);
  // 서식은 manualSources로, 나머지는 sourceText로 갈린다.
  assert.match(app, /const sourceType = formSourceTypeOf\(file\);/);
  assert.match(app, /state\.manualSources\.push\(\{/);
});

test('ZIP도 내용 추출 대상이고 거짓 안내가 사라졌다', () => {
  assert.match(app, /EXTRACTABLE_ATTACHMENTS = Object\.freeze\(\['PDF', 'DOCX', 'TXT', 'HWPX', 'HWP', 'ZIP'\]\)/);
  // 푸는 코드가 이미 있는데 「지원하지 않습니다」라고 적어 두었었다.
  assert.doesNotMatch(app, /ZIP 내부 자동 해제는 지원하지 않습니다/);
  assert.match(app, /안에 든 파일을 펼쳐서 읽습니다/);
});
