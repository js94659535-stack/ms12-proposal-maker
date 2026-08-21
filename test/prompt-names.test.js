import test from 'node:test';
import assert from 'node:assert/strict';
import { taskSpecification } from '../functions/api/proposal.js';
import { PROPOSAL_OUTLINE } from '../src/engagement.js';

// 프롬프트가 부르는 이름이 실제로 보내는 자료나 응답 스키마에 있는지 본다.
//
// 「설계안 documentPlan의 목표 분량을 기준으로」라고 적혀 있었지만 documentPlan 이라는 이름은
// 보내는 자료 어디에도 없었다. 태그는 <APPROVED_DESIGN_PLAN>, 칸은 outline[].targetChars 다.
// 이런 어긋남은 오류를 내지 않고 지시만 조용히 사라지므로 이름을 세는 검사가 필요하다.

const payload = {
  projectType: '아동·청소년',
  selectedSubprogram: '재학대예방형',
  project: { title: '경계선 지능아동 사회적응력 향상 지원사업' },
  organization: { name: '○○지역아동센터', confirmedFacts: [], needsVerification: [], pastProjectRecords: [] },
  designPlan: {
    outline: PROPOSAL_OUTLINE.map(item => ({ ...item })),
    targetTotalChars: PROPOSAL_OUTLINE.reduce((sum, item) => sum + item.targetChars, 0)
  },
  // items는 실제 요청과 같은 모양으로 둔다. 설계도 값에는 proposedOnly가 늘 붙어 온다.
  projectBlueprint: {
    applicationType: '재학대예방형', officialConflicts: [],
    items: [{ section: '대상', status: '확정', value: '초등 4~6학년 20명', proposedOnly: false }]
  }
};

// 스키마가 정한 응답 칸 이름. 프롬프트가 이 이름을 부르는 것은 정상이다.
function schemaNames(node, found = new Set()) {
  if (!node || typeof node !== 'object') return found;
  for (const [key, value] of Object.entries(node.properties || {})) { found.add(key); schemaNames(value, found); }
  if (node.items) schemaNames(node.items, found);
  return found;
}

test('전체 계획서 프롬프트가 항목별 목표 글자 수를 직접 적는다', () => {
  const prompt = taskSpecification('fullProposal', payload).prompt;
  for (const item of PROPOSAL_OUTLINE) {
    assert.ok(prompt.includes(`${item.title}(id ${item.key}) ${item.targetChars}자`), `${item.title} 목표가 지시문에 없다`);
  }
  assert.ok(prompt.includes('합계 7300자'));
});

test('설계안에 목표 분량이 없으면 숫자를 지어내지 않는다', () => {
  const prompt = taskSpecification('fullProposal', { ...payload, designPlan: { outline: [] } }).prompt;
  assert.ok(prompt.includes('outline[].targetChars를 기준으로 ±30%'));
  assert.ok(!prompt.includes('항목별 목표 분량은 다음과 같다'));
});

test('프롬프트가 부르는 이름이 보내는 자료나 응답 스키마에 있다', () => {
  const spec = taskSpecification('fullProposal', payload);
  const known = schemaNames(spec.schema);
  // 지시문 줄만 남긴다. <TAG>...</TAG>로 감싼 자료 줄은 검사 대상이 아니라 대조할 자료다.
  const data = spec.prompt.split('\n').filter(line => /^<[A-Z_]+>/.test(line)).join('\n');
  const instructions = spec.prompt.split('\n').filter(line => !/^<[A-Z_]+>/.test(line)).join('\n');
  const missing = [...new Set(instructions.match(/\b[a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*\b/g) || [])]
    .filter(name => !known.has(name) && !data.includes(name));
  assert.deepEqual(missing, [], `보내는 자료에 없는 이름: ${missing.join(', ')}`);
});
