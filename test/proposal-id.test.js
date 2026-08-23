// 계획서 식별자를 시작할 때 발급 (23-18).
//
// 실제로 났던 일: 식별자는 보관함에 저장했을 때에만 생겼다. 새 계획서를 처음 만드는 구간이
// 바로 설계와 본문 작성이라 **가장 비싼 첫 판이 통째로 계획서 한 건 $20 상한 밖**이었다.
// 실측 154건 중 35건(23%) · 31,273원 중 7,471원(24%)이 식별자 없이 나갔고,
// 그 안에 master · masterDesign · masterPlan · coaching:complete가 들어 있었다.
//
// 이제 **돈이 나가는 첫 순간에** api가 만든다. 공고를 고를 때로 하지 않은 까닭은
// 공고를 고르지 않고 원문을 붙여넣는 길이 따로 있어 그 길이 새기 때문이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8').split('\r\n').join('\n');
const app = read('../src/app.js');

// api.js를 그대로 불러 쓰되 서버 대신 보낸 몸통만 받아 둔다. 새 호출은 나가지 않는다.
const sent = [];
globalThis.fetch = async (path, options = {}) => {
  sent.push({ path, body: JSON.parse(options.body || '{}') });
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};
const api = await import('../src/api.js');

test('★ 첫 호출에 식별자가 붙는다', async () => {
  sent.length = 0;
  api.setUsageProposalId('');
  await api.analyzeWithAI({ sourceText: '가' });
  const id = sent[0].body.payload.proposalId;
  assert.ok(id, '첫 호출에 식별자가 없다');
  assert.match(id, /^[0-9a-f-]{8,}$/i);
});

test('한 계획서 안에서는 같은 식별자를 쓴다', async () => {
  sent.length = 0;
  api.setUsageProposalId('');
  await api.analyzeWithAI({ sourceText: '가' });
  await api.draftWithAI({ sourceText: '가' });
  await api.finalizeWithAI({ sections: [] });
  const ids = new Set(sent.map(one => one.body.payload.proposalId));
  assert.equal(ids.size, 1, `호출마다 식별자가 달라졌다 — ${[...ids].join(' / ')}`);
});

test('화면이 정해 준 식별자가 있으면 그것을 쓴다', async () => {
  sent.length = 0;
  api.setUsageProposalId('보관함에서-불러온-것');
  await api.analyzeWithAI({ sourceText: '가' });
  assert.equal(sent[0].body.payload.proposalId, '보관함에서-불러온-것');
});

test('새 계획서를 시작하면 새 식별자가 나온다', async () => {
  sent.length = 0;
  api.setUsageProposalId('');
  await api.analyzeWithAI({ sourceText: '가' });
  const first = sent[0].body.payload.proposalId;
  // 화면이 비우면(새 공고를 고르면) 다음 호출에서 새로 만든다.
  api.setUsageProposalId('');
  await api.analyzeWithAI({ sourceText: '나' });
  const second = sent[1].body.payload.proposalId;
  assert.notEqual(first, second);
});

test('만든 식별자를 화면에 알린다', async () => {
  const seen = [];
  api.onProposalIdCreated(id => seen.push(id));
  api.setUsageProposalId('');
  sent.length = 0;
  await api.analyzeWithAI({ sourceText: '가' });
  assert.equal(seen.length, 1, '화면에 알리지 않는다');
  assert.equal(seen[0], sent[0].body.payload.proposalId);
  // 이미 있으면 다시 알리지 않는다. 알림은 「생겼다」일 때뿐이다.
  await api.draftWithAI({ sourceText: '가' });
  assert.equal(seen.length, 1);
  api.onProposalIdCreated(null);
});

// ---------- 화면 쪽 ----------

test('★ 보관함 저장은 있는 식별자를 그대로 쓴다', () => {
  // 새로 만들면 같은 계획서가 두 개로 갈라져 상한도 둘로 나뉜다.
  assert.match(app, /const id = state\.archiveProposalId \|\| globalThis\.crypto\?\.randomUUID\?\.\(\) \|\| `proposal-\$\{Date\.now\(\)\}`;/);
  assert.match(app, /onProposalIdCreated\(id => \{ state\.archiveProposalId = state\.archiveProposalId \|\| id; saveState\(\); \}\);/);
});

test('식별자가 생겼다고 보관함에 저장되지는 않는다', () => {
  // 목록은 서버가 가진 것만 보여 준다. 알림 처리기가 저장을 부르면 저장 안 한 것이 목록에 뜬다.
  const at = app.indexOf('onProposalIdCreated(id =>');
  const line = app.slice(at, app.indexOf('\n', at));
  assert.ok(!line.includes('archiveCurrentProposal'), '알림에서 보관함 저장을 부른다');
  assert.ok(!line.includes('saveArchivedProposal'), '알림에서 보관함 저장을 부른다');
  // 보관함 목록은 서버 결과로만 채운다.
  assert.match(app, /listArchivedProposals\(\)/);
  assert.match(app, /archiveProposals: result\.proposals \|\| \[\]/);
});
