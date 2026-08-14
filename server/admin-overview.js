// 관리자 랜딩 위쪽에 붙는 운영 현황. 실제 운영자료에서만 센다.
//
// 규칙 두 가지.
//  - 셀 수 없는 값은 만들지 않는다. 아직 연결되지 않은 항목은 value를 null로 두고 note에 이유를 적는다.
//  - 비밀값·회원 원문은 담지 않는다. 여기서 나가는 것은 건수와 시각뿐이다.

// 바로가기 목록. 화면 순서도 이 순서다.
export const ADMIN_SHORTCUTS = Object.freeze([
  { key: 'pending', label: '승인 대기 회원', tool: 'admin', tab: 'accounts', unit: '명' },
  { key: 'agency', label: '에이전트·고객 의뢰', tool: 'admin', tab: 'agency', unit: '건' },
  { key: 'notices', label: '공고보관함', tool: 'admin', tab: 'notices', unit: '건' },
  { key: 'collection', label: '공고 수집 상태', tool: 'admin', tab: 'collection', unit: '' },
  { key: 'drafts', label: '작성 중인 계획서', tool: 'admin', tab: 'access', unit: '건' },
  { key: 'unchecked', label: '확인 필요 계획서', tool: 'admin', tab: 'access', unit: '건' },
  { key: 'usage', label: 'AI 사용량·비용', tool: 'admin', tab: 'usage', unit: '' },
  { key: 'members', label: '회원·이용권·계약', tool: 'admin', tab: 'accounts', unit: '명' },
  { key: 'assistant', label: '관리자 AI 도우미', tool: 'coaching', tab: '', unit: '' }
]);

const num = row => Number(row?.n || 0);
const one = async (db, sql, ...binds) => {
  try { return await db.prepare(sql).bind(...binds).first(); } catch { return null; }
};

export async function adminOverview(db) {
  const [pending, active, agency, agencyClients, agencyProposals, notices, drafts, unchecked, collection, usage] = await Promise.all([
    one(db, "SELECT COUNT(*) AS n FROM users WHERE status = 'pending'"),
    one(db, "SELECT COUNT(*) AS n FROM users WHERE status = 'active'"),
    one(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'agency'"),
    one(db, "SELECT COUNT(*) AS n FROM applicant_organizations o JOIN users u ON u.id = o.user_id WHERE u.role = 'agency'"),
    one(db, "SELECT COUNT(*) AS n FROM archived_proposals p JOIN users u ON u.id = p.user_id WHERE u.role = 'agency'"),
    one(db, 'SELECT COUNT(*) AS n FROM archived_notices'),
    one(db, "SELECT COUNT(*) AS n FROM archived_proposals WHERE stage <> 'final'"),
    // 「확인 필요」 표시가 남아 있는 계획서. 본문은 읽지 않고 표시 여부만 센다.
    one(db, "SELECT COUNT(*) AS n FROM archived_proposals WHERE proposal_json LIKE '%[확인 필요%'"),
    one(db, 'SELECT last_run_at, last_run_status, last_success_at, consecutive_failures FROM notice_collection_state WHERE id = 1'),
    one(db, "SELECT COUNT(*) AS n, COALESCE(SUM(total_tokens), 0) AS tokens, COALESCE(SUM(cost_micro), 0) AS cost FROM ai_usage_events WHERE at >= datetime('now', '-30 day')")
  ]);

  const failures = Number(collection?.consecutive_failures || 0);
  return {
    at: new Date().toISOString(),
    cards: [
      { key: 'pending', value: num(pending), note: num(pending) ? '승인을 기다리는 계정이 있습니다.' : '대기 중인 계정이 없습니다.' },
      {
        key: 'agency', value: Number(agencyProposals?.n || 0),
        note: `에이전트 ${num(agency)}명 · 등록 고객 ${Number(agencyClients?.n || 0)}곳`
      },
      { key: 'notices', value: num(notices), note: '모아 둔 공고 전체입니다.' },
      {
        key: 'collection',
        value: null,
        text: collection?.last_run_status ? statusText(collection.last_run_status) : '실행 기록 없음',
        note: collection?.last_success_at ? `마지막 성공 ${collection.last_success_at}${failures ? ` · 연속 실패 ${failures}회` : ''}` : '아직 성공한 수집이 없습니다.'
      },
      { key: 'drafts', value: num(drafts), note: '아직 제출본으로 굳히지 않은 계획서입니다.' },
      { key: 'unchecked', value: num(unchecked), note: '[확인 필요] 표시가 남아 있는 계획서입니다.' },
      {
        key: 'usage', value: null,
        text: `${Number(usage?.tokens || 0).toLocaleString('ko-KR')}토큰`,
        note: `최근 30일 · 호출 ${num(usage)}회 · 약 $${(Number(usage?.cost || 0) / 1_000_000).toFixed(2)}`
      },
      { key: 'members', value: num(active), note: '이용 중인 계정입니다.' },
      { key: 'assistant', value: null, text: '열기', note: '관리자 화면에서 쓰는 작성·검토 도우미입니다.' }
    ]
  };
}

function statusText(status) {
  return { ok: '정상', partial: '일부 실패', empty: '0건', failed: '실패' }[String(status)] || String(status);
}
