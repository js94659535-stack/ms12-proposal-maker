// 올린 문서가 무엇인지 내용으로 판정한다.
//
// 왜 필요한가. 지금까지는 사용자가 「기본 자료 유형」을 직접 골라야 했고, 신청서를 공고문으로
// 두면 서식 항목을 한 개도 읽지 못해 원본 서식 자동 배치가 통째로 죽었다. 사용자는 왜 안 되는지
// 알 수 없었다. 이제 내용으로 정하고, 애매하면 애매하다고 적되 작업은 멈추지 않는다.

export const DOC_KINDS = Object.freeze(['세부 공고문', '공모신청서', '사업계획서 서식', '예산 편성 기준', '심사·평가기준', '공고 공문', '기타 안내자료']);

// 종류마다 「이 말이 나오면 그럴 확률이 높다」를 점수로 둔다. 한 낱말로 정하지 않는다.
const RULES = [
  {
    kind: '공모신청서',
    name: /신청서|지원서|배분신청|참가신청/,
    body: [
      [/배분신청서|사업계획서\s*양식|신청서\s*양식/, 6],
      [/기\s*관\s*명|고유번호|사업자등록번호/, 3],
      [/작성\s*요령|기재해\s*주(?:시기|십시오)|작성해\s*주(?:시기|십시오)/, 3],
      [/□|■|○\s*예\s*○\s*아니오|\(\s*\)/, 1],
      [/산출근거|세목|세세목/, 2],
      [/서명|날인|귀하/, 2]
    ]
  },
  {
    kind: '사업계획서 서식',
    name: /사업계획서|계획서\s*서식|서식/,
    body: [[/사업\s*계획서/, 4], [/\d\.\s*(?:사업\s*목적|사업\s*내용|추진\s*일정)/, 4], [/작성\s*요령/, 2]]
  },
  {
    kind: '세부 공고문',
    name: /공고|모집|안내/,
    body: [
      [/공고\s*(?:제|번호|일)|공고문/, 5],
      [/신청\s*(?:기간|접수)|접수\s*기간|제출\s*기한|마감/, 4],
      [/지원\s*(?:대상|규모|금액|내용)/, 3],
      [/선정\s*(?:방법|절차|기준)/, 3],
      [/문의\s*(?:처|사항)/, 1]
    ]
  },
  {
    kind: '예산 편성 기준',
    name: /예산|편성|단가/,
    body: [[/예산\s*편성\s*기준|편성\s*기준표/, 6], [/인건비|관리운영비|사업비/, 2], [/단가|산출\s*기준/, 2]]
  },
  {
    kind: '심사·평가기준',
    name: /심사|평가|배점/,
    body: [[/심사\s*(?:기준|항목)|평가\s*(?:기준|항목|지표)/, 6], [/배점|점\s*만점|\d+\s*점/, 3], [/정성|정량\s*평가/, 2]]
  },
  {
    kind: '공고 공문',
    name: /공문|알림|시행/,
    body: [[/수신|참조|시행\s*\d|문서번호/, 5], [/붙임/, 2]]
  }
];

const count = (text, pattern) => (text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)) || []).length;

// 판정. 이긴 종류와 점수, 그리고 얼마나 확실한지 함께 돌려준다.
export function classifyDocument(fileName = '', text = '') {
  const name = String(fileName || '');
  const body = String(text || '').slice(0, 60_000);
  if (body.replace(/\s/g, '').length < 30) {
    return { kind: '기타 안내자료', confidence: 'low', reason: '내용이 너무 짧아 종류를 정하지 못했습니다.', scores: {} };
  }
  const scores = {};
  for (const rule of RULES) {
    let score = rule.name.test(name) ? 5 : 0;
    for (const [pattern, weight] of rule.body) score += Math.min(count(body, pattern), 3) * weight;
    scores[rule.kind] = score;
  }
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const [kind, top] = ranked[0];
  const second = ranked[1]?.[1] || 0;
  if (top < 6) return { kind: '기타 안내자료', confidence: 'low', reason: '어느 종류에도 뚜렷하지 않습니다. 필요하면 직접 골라 주세요.', scores };
  // 1등과 2등이 붙어 있으면 애매하다고 적는다. 그래도 1등으로 진행한다.
  const confidence = top >= second * 2 ? 'high' : 'low';
  return {
    kind, confidence, scores,
    reason: confidence === 'high' ? `${kind}으로 읽었습니다.` : `${kind}으로 보았습니다. 다른 종류일 수 있어 직접 고칠 수 있습니다.`
  };
}

// 같은 자료를 두 번 올려도 작업을 멈추지 않는다. 나중 것을 남기고 앞 것을 접어 둔다.
export function markDuplicates(sources = []) {
  const seen = new Map();
  const out = sources.map(item => ({ ...item, duplicateOf: '' }));
  for (let index = out.length - 1; index >= 0; index -= 1) {
    const key = fingerprint(out[index].extractedText);
    if (!key) continue;
    if (seen.has(key)) out[index].duplicateOf = seen.get(key);
    else seen.set(key, out[index].fileName || `자료 ${index + 1}`);
  }
  return out;
}

// 앞뒤 공백과 줄바꿈을 지우고 길이·앞뒤 조각으로 같은 자료인지 본다. 전체 비교보다 빠르고 충분하다.
function fingerprint(text) {
  const value = String(text || '').replace(/\s+/g, '');
  if (value.length < 100) return '';
  return `${value.length}:${value.slice(0, 60)}:${value.slice(-60)}`;
}

// 지금 올린 자료로 무엇을 할 수 있는지 한 줄로 알려 준다. 없다고 멈추지 않는다.
export function intakeSummary(sources = []) {
  const kinds = new Set(sources.filter(item => item.extractionStatus === 'success').map(item => item.sourceType));
  const notice = kinds.has('세부 공고문') || kinds.has('공고 공문');
  const form = kinds.has('공모신청서') || kinds.has('사업계획서 서식');
  const duplicates = sources.filter(item => item.duplicateOf).length;
  const parts = [];
  parts.push(notice ? '공고문 읽음' : '공고문 없음 — 붙여넣기로도 됩니다');
  parts.push(form ? '신청서 서식 읽음 — 서식대로 배치합니다' : '신청서 서식 없음 — 기본 양식으로 씁니다');
  if (duplicates) parts.push(`같은 자료 ${duplicates}건은 한 번만 씁니다`);
  return { notice, form, duplicates, text: parts.join(' · ') };
}
