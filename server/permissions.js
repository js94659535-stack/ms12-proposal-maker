// 누가 무엇을 볼 수 있는지. 화면이 아니라 이 모듈을 거쳐 서버가 정한다.
//
// 규칙 셋만 기억하면 된다.
//   1. 권한이 적혀 있지 않으면 없다. 기본값은 거절이다.
//   2. 최고관리자(admin, active)는 업무자료를 모두 본다. 이 권한은 누구도 못 바꾼다.
//   3. 보안 비밀은 최고관리자에게도 내보내지 않는다.

export const SCOPES = Object.freeze(['members', 'proposals', 'applicants', 'assets', 'usage', 'contracts']);
export const ABILITIES = Object.freeze(['view', 'viewContent', 'edit', 'download', 'manage', 'progress']);
export const TARGET_KINDS = Object.freeze(['all', 'user', 'proposal', 'applicant', 'asset', 'contract']);

// 응답 어디에도 실어 보내지 않는 열. 최고관리자도 예외가 아니다.
export const SECRET_COLUMNS = Object.freeze([
  'password_algo', 'password_iterations', 'password_salt', 'password_hash',
  'token_hash', 'session_token', 'provider_subject', 'access_token', 'refresh_token',
  'code_hash', 'recovery_code', 'api_key', 'client_secret', 'card_number'
]);

// 계획서 원문을 볼 근거. 화면 문구와 감사기록 사유가 같은 값을 쓴다.
export const REASON = Object.freeze({
  admin: '최고관리자 권한',
  owner: '본인 자료',
  premium: '프리미엄 계약',
  consent: '회원의 지원 동의',
  grant: '관리자가 지정한 권한'
});

const isActiveAdmin = actor => actor?.role === 'admin' && actor?.status === 'active';

// 오늘 기준으로 살아 있는 권한인지. 시작일 전이거나 종료일이 지났으면 없는 것으로 본다.
export function grantActive(grant, today) {
  if (!grant) return false;
  if (grant.revoked_at || grant.revokedAt) return false;
  const starts = grant.starts_on ?? grant.startsOn ?? '';
  const ends = grant.ends_on ?? grant.endsOn ?? '';
  if (starts && today < starts) return false;
  if (ends && today > ends) return false;
  return true;
}

function grantAbility(grant, ability) {
  const column = {
    view: 'can_view', viewContent: 'can_view_content', edit: 'can_edit',
    download: 'can_download', manage: 'can_manage', progress: 'can_progress'
  }[ability];
  if (!column) return false;
  const camel = column.replace(/_([a-z])/g, (unused, letter) => letter.toUpperCase());
  return Number(grant[column] ?? grant[camel] ?? 0) === 1;
}

// 권한 한 줄이 이 대상에 걸리는지.
function grantCovers(grant, { scope, targetKind, targetId, targetUserId }) {
  if (String(grant.scope) !== scope) return false;
  const kind = String(grant.target_kind ?? grant.targetKind ?? 'all');
  if (kind === 'all') return true;
  const id = String(grant.target_id ?? grant.targetId ?? '');
  if (kind === 'user') return Boolean(targetUserId) && id === String(targetUserId);
  return kind === targetKind && Boolean(targetId) && id === String(targetId);
}

// 권한 판정. grants는 이미 그 계정 것만 읽어 온 목록이다.
export function decideAccess({ actor, grants = [], scope, ability, targetKind = 'all', targetId = '', targetUserId = '', today = '' } = {}) {
  if (!actor?.id) return { allowed: false, reason: '', error: '로그인이 필요합니다.', status: 401 };
  if (actor.status !== 'active') return { allowed: false, reason: '', error: '이용이 중지된 계정입니다.', status: 403 };
  // 최고관리자는 업무자료를 모두 본다. 권한 표를 보지 않는다.
  if (isActiveAdmin(actor)) return { allowed: true, reason: REASON.admin };
  // 본인 자료는 언제나 본다.
  if (targetUserId && String(targetUserId) === String(actor.id)) return { allowed: true, reason: REASON.owner };
  if (!SCOPES.includes(scope) || !ABILITIES.includes(ability)) return { allowed: false, reason: '', error: '지원하지 않는 권한입니다.', status: 400 };

  const usable = grants.filter(grant => grantActive(grant, today) && grantCovers(grant, { scope, targetKind, targetId, targetUserId }));
  if (usable.some(grant => grantAbility(grant, ability))) return { allowed: true, reason: REASON.grant };
  return {
    allowed: false, reason: '',
    // 왜 막혔는지는 알려 주되 어떤 자료가 있는지는 알려 주지 않는다.
    error: '이 자료에 대한 권한이 없습니다. 최고관리자에게 요청해 주세요.', status: 403
  };
}

// 계획서 원문을 열 수 있는지. 등급이 아니라 근거로 판단한다.
// 일반 정식·구독회원의 원문은 관리자도 기본적으로 열지 않는다는 요구를 여기서 지킨다.
export function proposalContentAccess({ actor, proposal, grants = [], contract = null, today = '' } = {}) {
  if (!actor?.id) return { allowed: false, error: '로그인이 필요합니다.', status: 401 };
  const ownerId = String(proposal?.user_id ?? proposal?.userId ?? '');
  if (ownerId && ownerId === String(actor.id)) return { allowed: true, reason: REASON.owner };

  const consented = Number(proposal?.support_consent ?? proposal?.supportConsent ?? 0) === 1;
  const premium = contract?.active === true;
  if (isActiveAdmin(actor)) {
    // 최고관리자도 근거가 있어야 원문을 연다. 열람 자체는 감사기록에 남는다.
    if (premium) return { allowed: true, reason: REASON.premium };
    if (consented) return { allowed: true, reason: REASON.consent };
    return {
      allowed: false, status: 403,
      error: '이 계획서는 프리미엄 계약이나 회원의 지원 동의가 없어 원문을 열 수 없습니다. 메타정보만 확인할 수 있습니다.'
    };
  }
  // 운영관리자는 위 근거에 더해 관리자가 지정한 원문 열람 권한까지 있어야 한다.
  const decision = decideAccess({
    actor, grants, scope: 'proposals', ability: 'viewContent',
    targetKind: 'proposal', targetId: String(proposal?.id || ''), targetUserId: ownerId, today
  });
  if (!decision.allowed) return { allowed: false, status: decision.status, error: decision.error };
  if (premium) return { allowed: true, reason: REASON.premium };
  if (consented) return { allowed: true, reason: REASON.consent };
  return {
    allowed: false, status: 403,
    error: '원문 열람 권한은 있으나 프리미엄 계약이나 회원 동의가 없습니다. 메타정보만 확인할 수 있습니다.'
  };
}

// 계획서에서 원문을 뺀 메타정보만 남긴다. 관리자·운영관리자 목록은 이것만 본다.
export function proposalMeta(row) {
  return {
    id: row.id,
    userId: row.user_id || '',
    title: row.title || '',
    stage: row.stage || '',
    noticeKey: row.notice_key || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    exportCount: Number(row.export_count || 0),
    supportConsent: Number(row.support_consent || 0) === 1,
    claimed: Boolean(row.user_id),
    // 원문 크기만 알려 준다. 내용은 넣지 않는다.
    contentBytes: Number(row.content_bytes || 0)
  };
}

// 어떤 응답에도 비밀값이 섞이지 않게 마지막에 한 번 거른다.
export function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_COLUMNS.includes(key)) continue;
    const camel = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    if (SECRET_COLUMNS.includes(camel)) continue;
    out[key] = stripSecrets(item);
  }
  return out;
}

// 권한 한 줄을 화면이 쓰는 모양으로 바꾼다.
export function grantView(row) {
  return {
    id: row.id, subjectId: row.subject_id, subjectRole: row.subject_role || '',
    scope: row.scope, targetKind: row.target_kind || 'all', targetId: row.target_id || '',
    abilities: {
      view: Number(row.can_view || 0) === 1, viewContent: Number(row.can_view_content || 0) === 1,
      edit: Number(row.can_edit || 0) === 1, download: Number(row.can_download || 0) === 1,
      manage: Number(row.can_manage || 0) === 1, progress: Number(row.can_progress || 0) === 1
    },
    startsOn: row.starts_on || '', endsOn: row.ends_on || '', note: row.note || '',
    grantedBy: row.granted_by || '', grantedAt: row.granted_at || '',
    revokedAt: row.revoked_at || '', revokedBy: row.revoked_by || ''
  };
}

// 관리자가 보낸 권한 지정값을 검사한다. 모르는 값은 받지 않는다.
export function validateGrant(value, { today = '' } = {}) {
  const errors = [];
  const subjectId = String(value?.subjectId || '').trim().slice(0, 80);
  const scope = String(value?.scope || '').trim();
  const targetKind = String(value?.targetKind || 'all').trim();
  const targetId = String(value?.targetId || '').trim().slice(0, 120);
  if (!subjectId) errors.push('권한을 받을 계정을 지정해 주세요.');
  if (!SCOPES.includes(scope)) errors.push('알 수 없는 자료 범위입니다.');
  if (!TARGET_KINDS.includes(targetKind)) errors.push('알 수 없는 대상 종류입니다.');
  if (targetKind !== 'all' && !targetId) errors.push('대상을 지정해 주세요.');
  const abilities = Object.fromEntries(ABILITIES.map(name => [name, Boolean(value?.abilities?.[name])]));
  if (!ABILITIES.some(name => abilities[name])) errors.push('허용할 동작을 하나 이상 골라 주세요.');
  // 원문 열람 없이 내려받기만 주는 것은 앞뒤가 맞지 않는다.
  if (abilities.download && !abilities.viewContent) errors.push('내려받기를 허용하려면 원문 열람도 함께 허용해야 합니다.');
  if (abilities.edit && !abilities.viewContent) errors.push('수정을 허용하려면 원문 열람도 함께 허용해야 합니다.');
  const startsOn = dateOnly(value?.startsOn);
  const endsOn = dateOnly(value?.endsOn);
  if (value?.startsOn && !startsOn) errors.push('시작일 형식이 올바르지 않습니다.');
  if (value?.endsOn && !endsOn) errors.push('종료일 형식이 올바르지 않습니다.');
  if (startsOn && endsOn && endsOn < startsOn) errors.push('종료일이 시작일보다 앞설 수 없습니다.');
  if (endsOn && today && endsOn < today) errors.push('이미 지난 종료일로는 권한을 줄 수 없습니다.');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { subjectId, scope, targetKind, targetId: targetKind === 'all' ? '' : targetId, abilities, startsOn, endsOn, note: String(value?.note || '').trim().slice(0, 300) }
  };
}

function dateOnly(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? match[0] : '';
}

export function todayInSeoul(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
