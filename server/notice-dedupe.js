// 같은 공고가 여러 출처에 올라온다. 하나로 묶되 확인된 출처 링크는 모두 남긴다.
//
// 교육청 게시판과 나라장터에 같은 용역이 함께 오르는 일이 흔하다. 둘을 따로 보여 주면
// 회원이 같은 사업을 두 번 검토한다. 그렇다고 한쪽 링크를 버리면 근거를 잃는다.

const norm = value => String(value ?? '').normalize('NFKC').toLowerCase()
  // 「[공고] 2026년 ○○사업 재공고(1차)」에서 붙는 말을 떼어 낸다.
  .replace(/\[[^\]]{0,20}\]/g, ' ')
  .replace(/\((?:재|제?\d+\s*차|긴급|정정|변경|연장|재공고)[^)]{0,10}\)/g, ' ')
  .replace(/재공고|정정공고|변경공고|연장공고/g, ' ')
  .replace(/[^가-힣a-z0-9]/g, '');

const orgKey = value => String(value ?? '').normalize('NFKC')
  .replace(/(?:재단법인|사단법인|사회복지법인|주식회사|\(재\)|\(사\)|\(주\))/g, '')
  .replace(/[^가-힣a-z0-9]/gi, '').toLowerCase();

// 두 공고가 같은 것인지. 공고번호가 같으면 곧바로 같은 것으로 본다.
export function sameNotice(left, right) {
  const leftNo = String(left?.noticeNo || '').trim();
  const rightNo = String(right?.noticeNo || '').trim();
  if (leftNo && rightNo && leftNo === rightNo) return { same: true, by: 'noticeNo' };

  const leftTitle = norm(left?.title);
  const rightTitle = norm(right?.title);
  if (!leftTitle || !rightTitle) return { same: false, by: '' };
  if (leftTitle !== rightTitle) return { same: false, by: '' };

  // 제목이 같아도 기관이 다르면 다른 공고다.
  const leftOrg = orgKey(left?.organization);
  const rightOrg = orgKey(right?.organization);
  if (leftOrg && rightOrg && leftOrg !== rightOrg) return { same: false, by: '' };

  // 접수 마감일이 둘 다 있는데 다르면 다른 회차다.
  const leftEnd = String(left?.deadline || '').slice(0, 10);
  const rightEnd = String(right?.deadline || '').slice(0, 10);
  if (leftEnd && rightEnd && leftEnd !== rightEnd) return { same: false, by: '' };

  return { same: true, by: leftOrg && rightOrg ? 'title+org' : 'title' };
}

// 어느 쪽을 대표로 둘지. 마감일을 아는 쪽, 본문을 읽은 쪽, 그다음 먼저 온 쪽.
function better(left, right) {
  const score = notice => (notice.deadline ? 4 : 0) + (notice.officialTextExtracted ? 2 : 0) + (notice.summary && notice.summary !== '상세 공고문 확인 필요' ? 1 : 0);
  return score(right) > score(left) ? right : left;
}

// 확인된 출처 링크를 모두 모은다. 같은 주소는 한 번만 남긴다.
function mergeLinks(base, other) {
  const links = [...(base.sourceLinks || []), ...(other.sourceLinks || [])];
  for (const notice of [base, other]) {
    if (notice.sourceUrl) links.push({ sourceId: notice.sourceId || '', label: notice.sourceLabel || '', url: notice.sourceUrl });
  }
  const seen = new Set();
  return links.filter(link => link.url && !seen.has(link.url) && seen.add(link.url));
}

// 여러 출처에서 온 목록을 하나로 묶는다. 지우지 않고 합친다.
export function mergeAcrossSources(notices = []) {
  const merged = [];
  const reasons = [];
  for (const notice of notices) {
    const found = merged.find(item => sameNotice(item, notice).same);
    if (!found) {
      merged.push({ ...notice, sourceLinks: mergeLinks(notice, {}) });
      continue;
    }
    const how = sameNotice(found, notice).by;
    const winner = better(found, notice);
    const loser = winner === found ? notice : found;
    const links = mergeLinks(found, notice);
    // 대표는 정보가 많은 쪽으로 두되, 링크와 출처 목록은 둘 다 남긴다.
    Object.assign(found, winner, {
      sourceLinks: links,
      mergedFrom: [...new Set([...(found.mergedFrom || []), found.sourceId, notice.sourceId].filter(Boolean))]
    });
    reasons.push({ by: how, kept: winner.sourceId || '', dropped: loser.sourceId || '', links: links.length });
  }
  return { notices: merged, merged: reasons.length, reasons };
}
