// 계정·세션·운영 화면 테스트가 함께 쓰는 D1 대역.
// 실제 쿼리 문자열을 그대로 맞춰 보므로, 코드에서 SQL이 바뀌면 여기서 바로 드러난다.
export function fakeDb() {
  const tables = {
    users: [], sessions: [], login_attempts: [], user_identities: [], oauth_states: [],
    admin_audit_log: [], account_recovery_codes: [], user_activity_events: []
  };
  let seq = 0;
  const rows = results => ({ results });
  // 같은 시각에 들어온 행도 순서가 흔들리지 않게 넣은 차례를 함께 본다.
  const byNewest = (a, b) => String(b.at).localeCompare(String(a.at)) || b.seq - a.seq;

  const run = (sql, args) => {
    const text = sql.replace(/\s+/g, ' ').trim();

    // ---- 세션 ----
    if (/^INSERT INTO sessions/.test(text)) { tables.sessions.push({ token_hash: args[0], user_id: args[1], created_at: args[2], expires_at: args[3], last_seen_at: args[4] }); return rows([]); }
    if (/^SELECT s\.token_hash/.test(text)) {
      const session = tables.sessions.find(item => item.token_hash === args[0]);
      const user = session && tables.users.find(item => item.id === session.user_id);
      return rows(session && user ? [{ ...session, user_id: user.id, email: user.email, role: user.role, org_id: user.org_id, name: user.name, status: user.status }] : []);
    }
    if (/^UPDATE sessions SET/.test(text)) { const found = tables.sessions.find(item => item.token_hash === args[2]); if (found) { found.last_seen_at = args[0]; found.expires_at = args[1]; } return rows([]); }
    if (/^DELETE FROM sessions WHERE token_hash/.test(text)) { tables.sessions = tables.sessions.filter(item => item.token_hash !== args[0]); return rows([]); }
    if (/^DELETE FROM sessions WHERE expires_at/.test(text)) { tables.sessions = tables.sessions.filter(item => item.expires_at >= args[0]); return rows([]); }
    if (/^DELETE FROM sessions WHERE user_id/.test(text)) { tables.sessions = tables.sessions.filter(item => item.user_id !== args[0]); return rows([]); }
    if (/^SELECT user_id, COUNT\(\*\) AS session_count/.test(text)) {
      const grouped = new Map();
      for (const item of tables.sessions) {
        const found = grouped.get(item.user_id) || { user_id: item.user_id, session_count: 0, last_seen_at: '', expires_at: '' };
        found.session_count += 1;
        found.last_seen_at = found.last_seen_at > item.last_seen_at ? found.last_seen_at : item.last_seen_at;
        found.expires_at = found.expires_at > item.expires_at ? found.expires_at : item.expires_at;
        grouped.set(item.user_id, found);
      }
      return rows([...grouped.values()]);
    }

    // ---- 사용자 ----
    if (/^SELECT id, email, role, org_id, name, status, password_algo/.test(text)) return rows(tables.users.filter(item => item.email === args[0]));
    if (/^SELECT id, email, role, org_id, name, status FROM users WHERE email/.test(text)) return rows(tables.users.filter(item => item.email === args[0]));
    if (/^SELECT id, email, role, org_id, name, status, profile_completed_at FROM users WHERE id/.test(text)) return rows(tables.users.filter(item => item.id === args[0]));
    if (/^SELECT phone, org_name, is_contact/.test(text)) return rows(tables.users.filter(item => item.id === args[0]));
    if (/^SELECT id, email, role, status, name, phone, org_name/.test(text)) return rows([...tables.users].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
    if (/^SELECT id, email, role, status FROM users WHERE id/.test(text)) return rows(tables.users.filter(item => item.id === args[0]));
    if (/^INSERT INTO users \(id, email, role, org_id, name, status, created_at, updated_at\)/.test(text)) {
      if (tables.users.some(item => item.email === args[1])) throw new Error('UNIQUE constraint failed: users.email');
      tables.users.push({
        id: args[0], email: args[1], role: args[2], org_id: '', name: args[3], status: args[4], created_at: args[5], updated_at: args[6],
        password_algo: '', password_iterations: 0, password_salt: '', password_hash: '',
        phone: '', org_name: '', is_contact: 0, terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: ''
      });
      return rows([]);
    }
    if (/^INSERT INTO users \(id, email, role, org_id, name, status, password_algo/.test(text)) {
      if (tables.users.some(item => item.email === args[1])) throw new Error('UNIQUE constraint failed: users.email');
      tables.users.push({
        id: args[0], email: args[1], role: args[2], org_id: '', name: '', status: args[3],
        password_algo: args[4], password_iterations: args[5], password_salt: args[6], password_hash: args[7],
        created_at: args[8], updated_at: args[9],
        phone: '', org_name: '', is_contact: 0, terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: ''
      });
      return rows([]);
    }
    if (/^UPDATE users SET status = \?, updated_at = \? WHERE id/.test(text)) {
      const user = tables.users.find(item => item.id === args[2]);
      if (user) { user.status = args[0]; user.updated_at = args[1]; }
      return rows([]);
    }
    if (/^UPDATE users SET role = \?, updated_at = \? WHERE id/.test(text)) {
      const user = tables.users.find(item => item.id === args[2]);
      if (user) { user.role = args[0]; user.updated_at = args[1]; }
      return rows([]);
    }
    if (/^UPDATE users SET password_algo = \?/.test(text)) {
      const user = tables.users.find(item => item.id === args[5]);
      if (user) { user.password_algo = args[0]; user.password_iterations = args[1]; user.password_salt = args[2]; user.password_hash = args[3]; user.updated_at = args[4]; }
      return rows([]);
    }
    if (/^UPDATE users SET name = \?, phone = \?/.test(text)) {
      const user = tables.users.find(item => item.id === args[9]);
      if (user) {
        user.name = args[0]; user.phone = args[1]; user.org_name = args[2]; user.is_contact = args[3];
        user.terms_version = args[4]; user.privacy_version = args[5]; user.consented_at = args[6];
        user.profile_completed_at = args[7]; user.updated_at = args[8];
      }
      return rows([]);
    }
    if (/^DELETE FROM users WHERE id/.test(text)) { tables.users = tables.users.filter(item => item.id !== args[0]); return rows([]); }

    // ---- 로그인 시도 ----
    if (/^DELETE FROM login_attempts WHERE at </.test(text)) { tables.login_attempts = tables.login_attempts.filter(item => item.at >= args[0]); return rows([]); }
    if (/^SELECT COUNT\(\*\) AS count FROM login_attempts WHERE email_hash/.test(text)) return rows([{ count: tables.login_attempts.filter(item => item.email_hash === args[0] && item.at >= args[1]).length }]);
    if (/^SELECT COUNT\(\*\) AS count FROM login_attempts WHERE client_hash/.test(text)) return rows([{ count: tables.login_attempts.filter(item => item.client_hash === args[0] && item.at >= args[1]).length }]);
    if (/^SELECT email_hash, COUNT\(\*\) AS count, MAX\(at\) AS last_at/.test(text)) {
      const grouped = new Map();
      for (const item of tables.login_attempts.filter(row => row.at >= args[0])) {
        const found = grouped.get(item.email_hash) || { email_hash: item.email_hash, count: 0, last_at: '' };
        found.count += 1;
        found.last_at = found.last_at > item.at ? found.last_at : item.at;
        grouped.set(item.email_hash, found);
      }
      return rows([...grouped.values()]);
    }
    if (/^INSERT INTO login_attempts/.test(text)) { tables.login_attempts.push({ id: args[0], email_hash: args[1], client_hash: args[2], at: args[3] }); return rows([]); }
    if (/^DELETE FROM login_attempts WHERE email_hash = \? OR client_hash/.test(text)) { tables.login_attempts = tables.login_attempts.filter(item => item.email_hash !== args[0] && item.client_hash !== args[1]); return rows([]); }
    if (/^DELETE FROM login_attempts WHERE email_hash = \?$/.test(text)) { tables.login_attempts = tables.login_attempts.filter(item => item.email_hash !== args[0]); return rows([]); }

    // ---- 소셜 ----
    if (/^DELETE FROM oauth_states WHERE expires_at/.test(text)) { tables.oauth_states = tables.oauth_states.filter(item => item.expires_at >= args[0]); return rows([]); }
    if (/^INSERT INTO oauth_states/.test(text)) {
      tables.oauth_states.push({ state_hash: args[0], provider: args[1], code_verifier: args[2], mode: args[3], link_user_id: args[4], redirect_uri: args[5], created_at: args[6], expires_at: args[7] });
      return rows([]);
    }
    if (/^SELECT \* FROM oauth_states/.test(text)) return rows(tables.oauth_states.filter(item => item.state_hash === args[0]));
    if (/^DELETE FROM oauth_states WHERE state_hash/.test(text)) { tables.oauth_states = tables.oauth_states.filter(item => item.state_hash !== args[0]); return rows([]); }
    if (/^SELECT id, user_id FROM user_identities/.test(text)) return rows(tables.user_identities.filter(item => item.provider === args[0] && item.provider_subject === args[1]));
    if (/^SELECT provider, email, linked_at FROM user_identities/.test(text)) return rows(tables.user_identities.filter(item => item.user_id === args[0]));
    if (/^SELECT user_id, provider, email FROM user_identities/.test(text)) return rows(tables.user_identities);
    if (/^INSERT INTO user_identities/.test(text)) {
      if (tables.user_identities.some(item => item.provider === args[2] && item.provider_subject === args[3])) throw new Error('UNIQUE constraint failed: user_identities.provider, user_identities.provider_subject');
      tables.user_identities.push({ id: args[0], user_id: args[1], provider: args[2], provider_subject: args[3], email: args[4], linked_at: args[5] });
      return rows([]);
    }
    if (/^DELETE FROM user_identities WHERE user_id/.test(text)) { tables.user_identities = tables.user_identities.filter(item => item.user_id !== args[0]); return rows([]); }

    // ---- 감사기록 ----
    if (/^INSERT INTO admin_audit_log/.test(text)) {
      tables.admin_audit_log.push({
        seq: seq += 1, id: args[0], actor_id: args[1], actor_email: args[2], actor_role: args[3], action: args[4],
        target_id: args[5], target_email: args[6], result: args[7], detail: args[8], at: args[9]
      });
      return rows([]);
    }
    if (/^SELECT actor_email, actor_role, action, target_id, target_email, result, detail, at FROM admin_audit_log WHERE target_id/.test(text)) {
      return rows(tables.admin_audit_log.filter(item => item.target_id === args[0]).sort(byNewest).slice(0, args[1]));
    }
    if (/^SELECT actor_email, actor_role, action, target_id, target_email, result, detail, at FROM admin_audit_log/.test(text)) {
      return rows([...tables.admin_audit_log].sort(byNewest).slice(0, args[0]));
    }

    // ---- 복구코드 ----
    if (/^DELETE FROM account_recovery_codes WHERE expires_at/.test(text)) { tables.account_recovery_codes = tables.account_recovery_codes.filter(item => item.expires_at >= args[0]); return rows([]); }
    if (/^DELETE FROM account_recovery_codes WHERE user_id/.test(text)) { tables.account_recovery_codes = tables.account_recovery_codes.filter(item => item.user_id !== args[0]); return rows([]); }
    if (/^INSERT INTO account_recovery_codes/.test(text)) {
      if (tables.account_recovery_codes.some(item => item.code_hash === args[2])) throw new Error('UNIQUE constraint failed: account_recovery_codes.code_hash');
      tables.account_recovery_codes.push({ id: args[0], user_id: args[1], code_hash: args[2], issued_by: args[3], created_at: args[4], expires_at: args[5], used_at: '' });
      return rows([]);
    }
    if (/^SELECT id, user_id, expires_at, used_at FROM account_recovery_codes WHERE code_hash/.test(text)) return rows(tables.account_recovery_codes.filter(item => item.code_hash === args[0]));
    if (/^UPDATE account_recovery_codes SET used_at/.test(text)) { const found = tables.account_recovery_codes.find(item => item.id === args[1]); if (found) found.used_at = args[0]; return rows([]); }
    if (/^SELECT created_at, expires_at, used_at FROM account_recovery_codes WHERE user_id/.test(text)) {
      return rows(tables.account_recovery_codes.filter(item => item.user_id === args[0]).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 1));
    }
    if (/^SELECT user_id, created_at, expires_at, used_at FROM account_recovery_codes/.test(text)) {
      return rows([...tables.account_recovery_codes].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
    }

    // ---- 진행·오류 기록 ----
    if (/^INSERT INTO user_activity_events/.test(text)) {
      tables.user_activity_events.push({ seq: seq += 1, id: args[0], user_id: args[1], kind: args[2], step: args[3], step_label: args[4], code: args[5], at: args[6] });
      return rows([]);
    }
    if (/^SELECT id FROM user_activity_events WHERE user_id/.test(text)) {
      return rows(tables.user_activity_events.filter(item => item.user_id === args[0]).sort(byNewest).map(item => ({ id: item.id })));
    }
    if (/^DELETE FROM user_activity_events WHERE id/.test(text)) { tables.user_activity_events = tables.user_activity_events.filter(item => item.id !== args[0]); return rows([]); }
    if (/^SELECT kind, step, step_label, code, at FROM user_activity_events WHERE user_id/.test(text)) {
      return rows(tables.user_activity_events.filter(item => item.user_id === args[0]).sort(byNewest).slice(0, args[1]));
    }
    if (/^SELECT user_id, kind, step, step_label, code, at FROM user_activity_events/.test(text)) {
      return rows([...tables.user_activity_events].sort(byNewest).slice(0, 500));
    }

    throw new Error(`대역이 모르는 쿼리: ${text.slice(0, 80)}`);
  };

  return {
    tables,
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return run(sql, args).results[0] || null; },
        async all() { return run(sql, args); },
        async run() { return run(sql, args); }
      };
      return statement;
    }
  };
}
