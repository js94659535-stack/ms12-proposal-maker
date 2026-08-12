// 자료의 종류를 네 가지로 갈라 둔다. 분석 결과와 제안을 확인된 사실처럼 쓰지 않기 위해서다.

export const KINDS = Object.freeze({
  official: '공식 근거',        // 공고문·신청서·평가기준·예산기준·공식 첨부
  organization: '기관 확인정보', // 회원이 입력하고 확인한 기관정보·인력·시설·실적
  analysis: '분석 결과',        // 공식 근거와 기관정보를 비교해 시스템이 도출한 판단
  proposal: '제안 아이디어'      // 아직 확정되지 않은 활동·목표·예산·성과 제안
});
export const KIND_KEYS = Object.freeze(Object.keys(KINDS));
// 사실로 단정해도 되는 종류. 나머지는 판단·제안임을 밝혀야 한다.
export const FACTUAL_KINDS = Object.freeze(['official', 'organization']);

export const STATUS = Object.freeze({ confirmed: '확인됨', needsCheck: '확인 필요', stale: '오래된 정보', proposed: '확정 전' });

// 주장 하나에 붙는 근거표. 자료·위치·확인 상태·확인한 사람·확인 시각을 함께 남긴다.
export function makeClaim({ text, kind, source = '', locator = '', status = '', confirmedBy = '', confirmedAt = '', sectionId = '' } = {}) {
  const safeKind = KIND_KEYS.includes(kind) ? kind : 'proposal';
  const factual = FACTUAL_KINDS.includes(safeKind);
  return {
    text: String(text || '').slice(0, 400),
    kind: safeKind,
    kindLabel: KINDS[safeKind],
    source: String(source || '').slice(0, 200),
    locator: String(locator || '').slice(0, 200),
    // 분석·제안은 확인됨으로 둘 수 없다. 사람이 확정하기 전까지 상태를 낮춘다.
    status: factual ? (status || STATUS.needsCheck) : (safeKind === 'analysis' ? STATUS.needsCheck : STATUS.proposed),
    confirmedBy: factual ? String(confirmedBy || '').slice(0, 80) : '',
    confirmedAt: factual ? String(confirmedAt || '').slice(0, 40) : '',
    sectionId: String(sectionId || '').slice(0, 80),
    factual
  };
}

// 확인된 사실로 써도 되는 주장인지. 화면과 출력이 같은 기준을 쓴다.
export function isAssertable(claim) {
  return Boolean(claim) && FACTUAL_KINDS.includes(claim.kind) && claim.status === STATUS.confirmed && Boolean(claim.source);
}

// 사실이 아닌 것을 사실처럼 적었는지 본다.
export function overstated(claims = []) {
  return claims.filter(claim => !FACTUAL_KINDS.includes(claim?.kind) && claim?.status === STATUS.confirmed);
}

// 화면에서 「이 문장의 근거」를 열어 볼 수 있게 항목별로 묶는다.
export function claimTable(claims = []) {
  const bySection = new Map();
  for (const claim of claims) {
    const key = claim?.sectionId || '';
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(claim);
  }
  const counts = Object.fromEntries(KIND_KEYS.map(kind => [kind, claims.filter(claim => claim?.kind === kind).length]));
  return {
    counts,
    assertable: claims.filter(isAssertable).length,
    needsCheck: claims.filter(claim => claim?.status === STATUS.needsCheck).length,
    sections: [...bySection.entries()].map(([sectionId, list]) => ({ sectionId, claims: list }))
  };
}

// 근거 없는 값 표시(fact-guard)를 근거표 항목으로 옮긴다.
export function claimsFromGuard(guardClaims = []) {
  return guardClaims.map(claim => makeClaim({
    text: claim.value, kind: 'proposal', source: '', locator: claim.sectionTitle || '',
    status: STATUS.proposed, sectionId: claim.sectionId || ''
  }));
}

// 서로 다른 자료가 같은 항목을 다르게 말하면 하나를 고르지 않고 충돌로 남긴다.
export function conflictsOf(claims = []) {
  const byText = new Map();
  for (const claim of claims) {
    const key = String(claim?.locator || claim?.text || '').replace(/\s+/g, '');
    if (!key) continue;
    if (!byText.has(key)) byText.set(key, []);
    byText.get(key).push(claim);
  }
  return [...byText.values()]
    .filter(list => new Set(list.map(item => item.text)).size > 1)
    .map(list => ({ locator: list[0].locator, values: list.map(item => ({ text: item.text, source: item.source, kind: item.kindLabel })) }));
}
