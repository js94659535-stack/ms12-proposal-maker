// 권한 시험용 D1 대역. 권한 표·열람기록·계획서 메타를 다루는 질의만 알아듣는다.
// 모르는 질의는 던진다. 조용히 빈 결과를 주면 「막혔다」와 「없다」를 구분하지 못한다.

const GRANT_COLUMNS = ['id', 'subject_id', 'subject_role', 'scope', 'target_kind', 'target_id',
  'can_view', 'can_view_content', 'can_edit', 'can_download', 'can_manage', 'can_progress',
  'starts_on', 'ends_on', 'note', 'granted_by', 'granted_at'];
const LOG_COLUMNS = ['id', 'at', 'actor_id', 'actor_role', 'action', 'scope', 'target_kind', 'target_id', 'target_user_id', 'allowed', 'reason'];

export function accessDb() {
  const tables = {
    users: [], access_grants: [], data_access_log: [], archived_proposals: [],
    premium_contracts: [], admin_audit_log: [], applicant_organizations: []
  };

  function query(sql, args) {
    const text = sql.replace(/\s+/g, ' ').trim();
    const like = pattern => text.startsWith(pattern);

    // ---- 회원 ----
    if (like("SELECT id, email, name, role, status FROM users WHERE role != 'admin'")) {
      return { rows: tables.users.filter(row => row.role !== 'admin') };
    }
    if (like('SELECT id, email, name, role, status FROM users ORDER BY email')) return { rows: [...tables.users] };
    if (like('SELECT id, role, status FROM users WHERE id = ?')) return { rows: tables.users.filter(row => row.id === args[0]) };
    if (like('SELECT id FROM users WHERE id = ?')) return { rows: tables.users.filter(row => row.id === args[0]) };

    // ---- 권한 ----
    if (like('SELECT id, subject_id, subject_role, scope')) {
      let list = [...tables.access_grants];
      if (text.includes("WHERE subject_id = ? AND revoked_at = ''")) list = list.filter(row => row.subject_id === args[0] && !row.revoked_at);
      else if (text.includes('WHERE subject_id = ?')) list = list.filter(row => row.subject_id === args[0]);
      return { rows: list.sort((left, right) => String(right.granted_at).localeCompare(String(left.granted_at))) };
    }
    if (like('INSERT INTO access_grants')) {
      tables.access_grants.push({ ...Object.fromEntries(GRANT_COLUMNS.map((name, index) => [name, args[index]])), revoked_at: '', revoked_by: '' });
      return { rows: [], changes: 1 };
    }
    if (like('SELECT id, subject_id, scope, target_kind, target_id FROM access_grants WHERE id = ?')) {
      return { rows: tables.access_grants.filter(row => row.id === args[0]) };
    }
    if (like('UPDATE access_grants SET revoked_at = ?')) {
      const row = tables.access_grants.find(item => item.id === args[2] && !item.revoked_at);
      if (!row) return { rows: [], changes: 0 };
      row.revoked_at = args[0];
      row.revoked_by = args[1];
      return { rows: [], changes: 1 };
    }

    // ---- 열람기록 ----
    if (like('INSERT INTO data_access_log')) {
      tables.data_access_log.push(Object.fromEntries(LOG_COLUMNS.map((name, index) => [name, args[index]])));
      return { rows: [], changes: 1 };
    }
    if (like('SELECT id, at, actor_id, actor_role, action')) {
      let list = [...tables.data_access_log];
      if (text.includes('WHERE actor_id = ?')) list = list.filter(row => row.actor_id === args[0]);
      return { rows: list.sort((left, right) => String(right.at).localeCompare(String(left.at))) };
    }

    // ---- 계획서 ----
    if (like('SELECT user_id, COUNT(*) AS count')) {
      const groups = new Map();
      for (const row of tables.archived_proposals) {
        const key = row.user_id || '';
        const found = groups.get(key) || { user_id: key, count: 0, last_updated: '', exports: 0 };
        found.count += 1;
        found.exports += Number(row.export_count || 0);
        if (String(row.updated_at || '') > found.last_updated) found.last_updated = String(row.updated_at || '');
        groups.set(key, found);
      }
      return { rows: [...groups.values()] };
    }
    if (like('SELECT id, user_id, notice_key, title, stage, created_at, updated_at, export_count, support_consent, LENGTH(proposal_json)')) {
      let list = [...tables.archived_proposals];
      if (text.includes('WHERE user_id = ?')) list = list.filter(row => row.user_id === args[0]);
      else if (text.includes("WHERE user_id != ''")) list = list.filter(row => row.user_id);
      return {
        rows: list.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))
          .map(row => ({ ...row, content_bytes: String(row.proposal_json || '').length }))
      };
    }
    if (like('SELECT id, user_id, title, stage, notice_key, created_at, updated_at, export_count, support_consent, proposal_json FROM archived_proposals WHERE id = ?')) {
      return { rows: tables.archived_proposals.filter(row => row.id === args[0]) };
    }
    if (like('SELECT id, user_id FROM archived_proposals WHERE id = ?')) {
      return { rows: tables.archived_proposals.filter(row => row.id === args[0]) };
    }
    if (like('UPDATE archived_proposals SET user_id = ?, claimed_at = ?, claimed_by = ? WHERE owner_hash = ?')) {
      const list = tables.archived_proposals.filter(row => row.owner_hash === args[3] && !row.user_id);
      for (const row of list) Object.assign(row, { user_id: args[0], claimed_at: args[1], claimed_by: args[2] });
      return { rows: [], changes: list.length };
    }
    if (like('UPDATE archived_proposals SET user_id = ?, claimed_at = ?, claimed_by = ? WHERE id = ?')) {
      const row = tables.archived_proposals.find(item => item.id === args[3]);
      if (!row) return { rows: [], changes: 0 };
      Object.assign(row, { user_id: args[0], claimed_at: args[1], claimed_by: args[2] });
      return { rows: [], changes: 1 };
    }
    if (like("UPDATE applicant_organizations SET user_id = ?, claimed_at = ? WHERE owner_hash = ? AND user_id = ''")) {
      const list = tables.applicant_organizations.filter(row => row.owner_hash === args[2] && !row.user_id);
      for (const row of list) Object.assign(row, { user_id: args[0], claimed_at: args[1] });
      return { rows: [], changes: list.length };
    }

    // ---- 프리미엄 계약 ----
    if (like('SELECT status, started_on, ends_on FROM premium_contracts WHERE user_id = ?')) {
      return { rows: tables.premium_contracts.filter(row => row.user_id === args[0]) };
    }

    // ---- 감사기록 ----
    if (like('INSERT INTO admin_audit_log')) {
      tables.admin_audit_log.push({ raw: args });
      return { rows: [], changes: 1 };
    }

    throw new Error(`대역이 모르는 질의: ${text.slice(0, 100)}`);
  }

  return {
    tables,
    prepare(sql) {
      let bound = [];
      const self = {
        bind(...args) { bound = args; return self; },
        async run() { const result = query(sql, bound); return { success: true, meta: { changes: result.changes || 0 } }; },
        async first() { return query(sql, bound).rows[0] || null; },
        async all() { return { results: query(sql, bound).rows }; }
      };
      return self;
    }
  };
}

// 시험용 계획서 한 건.
export function seedProposal(db, patch = {}) {
  const row = {
    id: 'p-1', owner_hash: 'hash-1', user_id: '', notice_key: '', title: '[샘플] 계획서', stage: '작성',
    proposal_json: JSON.stringify({ sections: [{ title: '사업개요', content: '원문 내용' }] }),
    created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z',
    export_count: 0, support_consent: 0, claimed_at: '', claimed_by: '', ...patch
  };
  db.tables.archived_proposals.push(row);
  return row;
}
