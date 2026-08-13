// 기관정보를 한 곳에서만 받는다.
//
// 지금까지 같은 기관정보를 두 번 입력해야 했다. 「내 정보」(member_profiles, 계정 기준)와
// 「신청기관 정보」(applicant_organizations, 브라우저 복구키 기준)가 인력·프로그램·시설·
// 협력기관·실적을 각각 따로 받았기 때문이다.
//
// 이제 회원이 적는 곳은 「내 정보」 하나다. 신청기관은 그 값을 물려받아 시작하고,
// 물려받은 값은 반드시 「확인 필요」로 들어간다. 회원이 눈으로 보고 확인해야 확정된다.

// 회원이 먼저 보는 핵심 영역. 나머지는 접어 두고 필요할 때 편다.
export const CORE_AREAS = Object.freeze(['basic', 'staff', 'performance']);
// 처음부터 모두 요구하지 않는다. 이 목록만 「입력하면 좋음」으로 안내한다.
export const OPTIONAL_AREAS = Object.freeze(['legal', 'clients', 'programs', 'facilities', 'partners', 'budget', 'measurement', 'references']);

export const PROFILE_SOURCE = '내 정보(회원 입력)';
// 물려받은 값은 확정이 아니다. 회원이 확인해야 확정된다.
export const UNCONFIRMED = '확인 필요';
export const CONFIRMED = '확인됨';

// 「내 정보」의 어떤 칸이 신청기관의 어느 영역으로 가는지. 한 방향으로만 흐른다.
const FIELD_MAP = Object.freeze([
  { key: 'orgName', area: 'basic', label: '기관명' },
  { key: 'orgType', area: 'basic', label: '기관 유형' },
  { key: 'orgAddress', area: 'basic', label: '기관 주소' },
  { key: 'orgIntro', area: 'basic', label: '기관 소개' },
  { key: 'name', area: 'basic', label: '담당자 이름' },
  { key: 'phone', area: 'basic', label: '담당자 연락처' },
  { key: 'staff', area: 'staff', label: '보유 인력' },
  { key: 'facilities', area: 'facilities', label: '시설과 장비' },
  { key: 'programs', area: 'programs', label: '주요 프로그램' },
  { key: 'achievements', area: 'performance', label: '사업 실적' },
  { key: 'partners', area: 'partners', label: '협력기관' }
]);

const text = value => String(value ?? '').trim();

// 내 정보에서 신청기관에 넣을 후보를 만든다. 값이 있는 칸만 넘긴다.
export function profileCandidates(profile = {}) {
  return FIELD_MAP
    .map(field => ({ area: field.area, label: field.label, value: text(profile[field.key]) }))
    .filter(item => item.value)
    .map(item => ({ ...item, status: UNCONFIRMED, source: PROFILE_SOURCE, origin: '고객 입력' }));
}

// 이미 신청기관에 있는 항목은 다시 묻지 않는다. 값이 같으면 건드리지 않고,
// 값이 다르면 덮어쓰지 않고 「확인 필요」 후보로만 남긴다. 회원이 고른다.
export function mergeProfileIntoApplicant(applicant, profile = {}) {
  const items = Array.isArray(applicant?.items) ? applicant.items : [];
  const byLabel = new Map(items.map(item => [`${item.area}:${item.label}`, item]));
  const added = [];
  const conflicts = [];
  for (const candidate of profileCandidates(profile)) {
    const key = `${candidate.area}:${candidate.label}`;
    const found = byLabel.get(key);
    if (!found) { added.push(candidate); continue; }
    if (text(found.value) === candidate.value) continue;         // 같은 값이면 할 일이 없다
    conflicts.push({ ...candidate, current: text(found.value) }); // 다르면 회원이 정한다
  }
  return { added, conflicts, unchanged: profileCandidates(profile).length - added.length - conflicts.length };
}

// 문서에서 뽑은 값도 같은 규칙을 쓴다. 자동으로 확정하지 않는다.
export function extractedCandidates(candidates = [], { source = '문서 추출' } = {}) {
  return (Array.isArray(candidates) ? candidates : [])
    .map(item => ({ area: text(item?.area) || 'basic', label: text(item?.label), value: text(item?.value), status: UNCONFIRMED, source: text(item?.source) || source, origin: '파일 추출' }))
    .filter(item => item.label && item.value);
}

// 확인되지 않은 항목이 남아 있는지. 화면이 「확인해 주세요」를 띄우는 근거다.
export function pendingConfirmations(applicant) {
  const items = Array.isArray(applicant?.items) ? applicant.items : [];
  return items.filter(item => item.status !== CONFIRMED);
}

// 영역별 진행 상태. 핵심 영역을 먼저 보여 주고 나머지는 접어 둔다.
export function areaProgress(applicant, areas = []) {
  const items = Array.isArray(applicant?.items) ? applicant.items : [];
  return areas.map(area => {
    const list = items.filter(item => item.area === area.key);
    return {
      key: area.key, title: area.title, hint: area.hint,
      core: CORE_AREAS.includes(area.key),
      total: list.length,
      confirmed: list.filter(item => item.status === CONFIRMED).length,
      // 핵심 영역이면서 아직 아무것도 없으면 먼저 채우자고 안내한다. 막지는 않는다.
      needsAttention: CORE_AREAS.includes(area.key) && list.length === 0
    };
  });
}
