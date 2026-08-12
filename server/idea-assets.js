// 사업 아이디어·활용자산. 「기관이 실제로 가진 것」과 「이번에 해 보려는 것」을 가른다.
//
// 이 구분이 없으면 후보 아이디어가 확정 실적처럼 계획서에 실린다. 그래서 상태를 반드시 붙이고,
// 공고를 먼저 읽어 맞는 것만 후보로 올린다. 기관 자산을 모든 계획서에 자동으로 끼워 넣지 않는다.

export const ASSET_STATUS = Object.freeze({
  verified: 'verified',   // 검증된 보유자산 — 실제 운영했고 근거가 있다
  candidate: 'candidate', // 제안 후보 아이디어 — 아직 해 본 적 없다
  selected: 'selected',   // 이번 사업에 채택
  excluded: 'excluded'    // 이번 사업에서 제외
});

export const STATUS_LABELS = Object.freeze({
  verified: '검증된 보유자산', candidate: '제안 후보 아이디어', selected: '이번 사업 채택', excluded: '제외'
});

export const ASSET_KINDS = Object.freeze(['프로그램', '공간·시설', '인력', '협력망', '자료·교구', '기타']);

// 계획서에 실을 때 붙이는 말. 후보를 실적처럼 쓰지 않기 위한 장치다.
export const ASSET_PREFIX = Object.freeze({
  verified: '',
  candidate: '[신규 제안] ',
  selected: '',
  excluded: ''
});

const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max);

export function validateAsset(value = {}) {
  const errors = [];
  const name = text(value.name, 120);
  const status = Object.values(ASSET_STATUS).includes(value.status) ? value.status : ASSET_STATUS.candidate;
  if (!name) errors.push('자산·아이디어 이름을 적어 주세요.');
  const kind = ASSET_KINDS.includes(value.kind) ? value.kind : '';
  // 「검증된 보유자산」이라고 하려면 실제 운영 경험과 근거가 함께 있어야 한다.
  const experience = text(value.experience);
  const evidence = text(value.evidence);
  if (status === ASSET_STATUS.verified && !experience) errors.push('검증된 보유자산으로 두려면 실제 운영 경험을 적어 주세요.');
  if (status === ASSET_STATUS.verified && !evidence) errors.push('검증된 보유자산으로 두려면 확인할 수 있는 근거자료를 적어 주세요.');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name, kind, status,
      problem: text(value.problem), audience: text(value.audience), activities: text(value.activities),
      duration: text(value.duration, 300), resources: text(value.resources), experience, evidence,
      adaptable: text(value.adaptable),
      // 근거를 회원이 확인했는지. 문서에서 뽑아 온 것은 확인 전까지 0이다.
      evidenceConfirmed: value.evidenceConfirmed === true
    }
  };
}

// 공고를 먼저 읽고, 목적·평가기준에 걸리는 자산만 후보로 올린다.
// 걸리는 말이 없으면 아무것도 올리지 않는다. 억지로 끼워 맞추지 않는다.
export function suggestAssets({ notice = {}, assets = [], limit = 5 } = {}) {
  const haystack = [notice.title, notice.summary, notice.eligibility, notice.supportDetails, notice.purpose, notice.criteria]
    .map(value => String(value || '')).join(' ').normalize('NFKC');
  if (!haystack.trim()) return { matched: [], reason: '공고 목적과 평가기준을 먼저 확인해야 후보를 고를 수 있습니다.' };

  const words = keywordsOf(haystack);
  const scored = (Array.isArray(assets) ? assets : [])
    .filter(asset => asset.status !== ASSET_STATUS.excluded)
    .map(asset => {
      const own = keywordsOf([asset.name, asset.problem, asset.audience, asset.activities, asset.kind].join(' '));
      const hits = [...own].filter(word => words.has(word));
      return { asset, hits, score: hits.length };
    })
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || String(left.asset.name).localeCompare(String(right.asset.name)))
    .slice(0, limit);

  return {
    matched: scored.map(item => ({
      id: item.asset.id, name: item.asset.name, status: item.asset.status,
      statusLabel: STATUS_LABELS[item.asset.status] || '',
      // 왜 후보로 올렸는지 말한다. 근거 없이 권하지 않는다.
      why: `공고와 겹치는 말: ${item.hits.slice(0, 4).join(', ')}`,
      // 검증되지 않은 것은 실적처럼 쓰지 못한다고 함께 알려 준다.
      usableAsRecord: item.asset.status === ASSET_STATUS.verified && item.asset.evidenceConfirmed === true
    })),
    reason: scored.length ? '' : '이번 공고의 목적·평가기준과 겹치는 보유자산이 없습니다. 억지로 넣지 않았습니다.'
  };
}

// 계획서에 실을 문장으로 바꾼다. 후보 아이디어에는 반드시 표시가 붙는다.
export function assetSentence(asset) {
  const prefix = ASSET_PREFIX[asset?.status] ?? '';
  const name = String(asset?.name || '').trim();
  if (!name) return '';
  if (asset?.status === ASSET_STATUS.verified && asset?.evidenceConfirmed) {
    return `${name} (운영 경험 있음 · 근거 ${String(asset.evidence || '').slice(0, 60)})`;
  }
  // 확인되지 않은 것은 실적으로 적지 않는다.
  return `${prefix}${name} [확인 필요]`;
}

const STOP = new Set(['사업', '지원', '공모', '신청', '기관', '대상', '운영', '프로그램', '내용', '경우', '있는', '위한', '통해', '및', '등']);

function keywordsOf(value) {
  const words = String(value || '').normalize('NFKC').toLowerCase()
    .split(/[^가-힣a-z0-9]+/)
    .filter(word => word.length >= 2 && !STOP.has(word));
  return new Set(words);
}
