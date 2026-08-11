// 계정·세션·운영 화면 테스트가 함께 쓰는 D1 대역.
// 실제 쿼리 문자열을 그대로 맞춰 보므로, 코드에서 SQL이 바뀌면 여기서 바로 드러난다.
export function fakeDb() {
  const tables = {
    users: [], sessions: [], login_attempts: [], user_identities: [], oauth_states: [],
    admin_audit_log: [], account_recovery_codes: [], user_activity_events: [], archived_notices: [], ai_usage_events: [],
    premium_contracts: [], showcase_proposals: [], member_profiles: [], subscriptions: [], archived_proposals: []
  };
  let seq = 0;
  // D1은 바꾼 행 수를 meta.changes로 알려 준다. 무료 체험 1회 제한이 이 값을 본다.
  const rows = (results, changes = 0) => ({ results, meta: { changes } });
  // 같은 시각에 들어온 행도 순서가 흔들리지 않게 넣은 차례를 함께 본다.
  const byNewest = (a, b) => String(b.at).localeCompare(String(a.at)) || b.seq - a.seq;

  const run = (sql, args) => {
    const text = sql.replace(/\s+/g, ' ').trim();

    // ---- 세션 ----
    if (/^INSERT INTO sessions/.test(text)) { tables.sessions.push({ token_hash: args[0], user_id: args[1], created_at: args[2], expires_at: args[3], last_seen_at: args[4] }); return rows([]); }
    if (/^SELECT s\.token_hash/.test(text)) {
      const session = tables.sessions.find(item => item.token_hash === args[0]);
      const user = session && tables.users.find(item => item.id === session.user_id);
      return rows(session && user ? [{ ...session, user_id: user.id, email: user.email, role: user.role, org_id: user.org_id, name: user.name, status: user.status, plan: user.plan, trial_used_at: user.trial_used_at }] : []);
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
    if (/^SELECT id, email, role, org_id, name, status, plan, trial_used_at, password_algo/.test(text)) return rows(tables.users.filter(item => item.email === args[0]));
    if (/^SELECT id, email, role, org_id, name, status FROM users WHERE email/.test(text)) return rows(tables.users.filter(item => item.email === args[0]));
    if (/^SELECT id, email, role, org_id, name, status, profile_completed_at FROM users WHERE id/.test(text)) return rows(tables.users.filter(item => item.id === args[0]));
    if (/^SELECT (name, )?phone, org_name, is_contact/.test(text)) return rows(tables.users.filter(item => item.id === args[0]));
    if (/^SELECT id, email, role, status, name, phone, org_name/.test(text)) return rows([...tables.users].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
    // 운영 화면은 상태만, 관리자 화면은 이용권까지 읽는다. 두 형태를 함께 받는다.
    if (/^SELECT id, email, role, status(, plan)? FROM users WHERE id/.test(text)) return rows(tables.users.filter(item => item.id === args[0]));
    if (/^SELECT trial_used_at FROM users WHERE id/.test(text)) return rows(tables.users.filter(item => item.id === args[0]));
    if (/^INSERT INTO users \(id, email, role, org_id, name, status, created_at, updated_at\)/.test(text)) {
      if (tables.users.some(item => item.email === args[1])) throw new Error('UNIQUE constraint failed: users.email');
      tables.users.push({
        id: args[0], email: args[1], role: args[2], org_id: '', name: args[3], status: args[4], created_at: args[5], updated_at: args[6],
        password_algo: '', password_iterations: 0, password_salt: '', password_hash: '', plan: 'trial', trial_used_at: '',
        phone: '', org_name: '', is_contact: 0, terms_version: '', privacy_version: '', consented_at: '', profile_completed_at: ''
      });
      return rows([]);
    }
    if (/^INSERT INTO users \(id, email, role, org_id, name, status, password_algo/.test(text)) {
      if (tables.users.some(item => item.email === args[1])) throw new Error('UNIQUE constraint failed: users.email');
      tables.users.push({
        id: args[0], email: args[1], role: args[2], org_id: '', name: '', status: args[3],
        password_algo: args[4], password_iterations: args[5], password_salt: args[6], password_hash: args[7], plan: 'trial', trial_used_at: '',
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
    // 무료 체험 1회 제한. 조건이 맞을 때만 바뀌고 바뀐 행 수를 함께 돌려준다.
    if (/^UPDATE users SET trial_used_at = \?, updated_at = \? WHERE id = \? AND trial_used_at = ''/.test(text)) {
      const user = tables.users.find(item => item.id === args[2] && !item.trial_used_at);
      if (user) { user.trial_used_at = args[0]; user.updated_at = args[1]; }
      return rows([], user ? 1 : 0);
    }
    if (/^UPDATE users SET trial_used_at = '' WHERE id/.test(text)) {
      const user = tables.users.find(item => item.id === args[0]);
      if (user) user.trial_used_at = '';
      return rows([], user ? 1 : 0);
    }
    if (/^UPDATE users SET plan = \?, updated_at = \? WHERE id/.test(text)) {
      const user = tables.users.find(item => item.id === args[2]);
      if (user) { user.plan = args[0]; user.updated_at = args[1]; }
      return rows([], user ? 1 : 0);
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
    // 가입 정보 입력(completeProfile). 본인정보 수정(saveProfile)과 열 목록이 달라 구분해 받는다.
    if (/^UPDATE users SET name = \?, phone = \?, org_name = \?, is_contact/.test(text)) {
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

    // ---- 공모정보 ----
    // 마감이 빈 자료를 뒤로 두고 마감일 내림차순. 실제 SQL의 ORDER BY와 같은 순서를 흉내 낸다.
    if (/^SELECT source_key, source, source_label, list_sn, title, deadline/.test(text)) {
      const wantsPublicOnly = /is_public = 1/.test(text);
      if (/WHERE source_key = \?/.test(text)) {
        return rows(tables.archived_notices.filter(item => item.source_key === args[0] && (!wantsPublicOnly || Number(item.is_public ?? 1) === 1)));
      }
      const list = tables.archived_notices.filter(item => !wantsPublicOnly || Number(item.is_public ?? 1) === 1);
      return rows([...list].sort((a, b) => (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) || String(b.deadline).localeCompare(String(a.deadline))));
    }
    if (/^SELECT source_key, title, is_public FROM archived_notices WHERE source_key/.test(text)) {
      return rows(tables.archived_notices.filter(item => item.source_key === args[0]));
    }
    if (/^UPDATE archived_notices SET is_public = \? WHERE source_key/.test(text)) {
      const found = tables.archived_notices.find(item => item.source_key === args[1]);
      if (found) found.is_public = args[0];
      return rows([], found ? 1 : 0);
    }

    // ---- AI 사용량·비용 ----
    if (/^INSERT INTO ai_usage_events/.test(text)) {
      tables.ai_usage_events.push({
        id: args[0], at: args[1], user_id: args[2], user_email: args[3], proposal_id: args[4], task: args[5], model: args[6],
        input_tokens: args[7], cached_input_tokens: args[8], output_tokens: args[9], reasoning_tokens: args[10],
        total_tokens: args[11], cost_micro: args[12], priced: args[13], duration_ms: args[14], ok: args[15], failure_stage: args[16]
      });
      return rows([], 1);
    }
    if (/FROM ai_usage_events/.test(text)) {
      // WHERE 조건을 순서대로 맞춰 본다. 실제 SQL이 쓰는 조합만 지원한다.
      let list = [...tables.ai_usage_events];
      // WHERE 조건이 적힌 순서대로 값이 묶인다. 호출마다 순서가 달라 글에 나온 위치로 맞춘다.
      const conditions = [
        ['at >= ?', (rows, value) => rows.filter(item => item.at >= value)],
        ['user_id = ?', (rows, value) => rows.filter(item => item.user_id === value)],
        ['proposal_id = ?', (rows, value) => rows.filter(item => item.proposal_id === value)]
      ].map(([needle, apply]) => [text.indexOf(needle), apply]).filter(([position]) => position >= 0).sort((a, b) => a[0] - b[0]);
      conditions.forEach(([, apply], index) => { list = apply(list, args[index]); });
      if (/proposal_id != ''/.test(text)) list = list.filter(item => item.proposal_id);
      const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
      const shape = items => ({
        calls: items.length, tokens: sum(items, 'total_tokens'), input_tokens: sum(items, 'input_tokens'),
        cached_tokens: sum(items, 'cached_input_tokens'), output_tokens: sum(items, 'output_tokens'),
        reasoning_tokens: sum(items, 'reasoning_tokens'), cost: sum(items, 'cost_micro'),
        duration: sum(items, 'duration_ms'), ok_calls: sum(items, 'ok')
      });
      const grouped = pick => {
        const map = new Map();
        for (const item of list) {
          const key = JSON.stringify(pick(item));
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(item);
        }
        return [...map.entries()].map(([key, items]) => ({ ...JSON.parse(key), ...shape(items) }))
          .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
      };
      if (/GROUP BY user_id, user_email/.test(text)) return rows(grouped(item => ({ user_id: item.user_id, user_email: item.user_email })));
      if (/GROUP BY proposal_id/.test(text)) return rows(grouped(item => ({ proposal_id: item.proposal_id })));
      if (/GROUP BY day/.test(text)) return rows(grouped(item => ({ day: String(item.at).slice(0, 10) })).sort((a, b) => String(b.day).localeCompare(String(a.day))));
      if (/GROUP BY task, model/.test(text)) return rows(grouped(item => ({ task: item.task, model: item.model })));
      return rows([shape(list)]);
    }

    // ---- 계획서 보관함(저장 권한 확인용 최소 대역) ----
    if (/^SELECT created_at FROM archived_proposals WHERE id = \? AND owner_hash/.test(text)) {
      return rows(tables.archived_proposals.filter(item => item.id === args[0] && item.owner_hash === args[1]));
    }
    if (/^INSERT INTO archived_proposals/.test(text)) {
      const [id, owner_hash, notice_key, title, stage, proposal_json, created_at, updated_at] = args;
      const found = tables.archived_proposals.find(item => item.id === id);
      if (found) Object.assign(found, { title, stage, notice_key, proposal_json, updated_at });
      else tables.archived_proposals.push({ id, owner_hash, notice_key, title, stage, proposal_json, created_at, updated_at });
      return rows([], 1);
    }
    // ---- 월간 구독 ----
    if (/FROM subscriptions WHERE user_id/.test(text)) {
      return rows(tables.subscriptions.filter(item => item.user_id === args[0]));
    }
    if (/^SELECT user_id, status, started_on, ends_on, cycle_start, renews_on, core_used, diagnosis_used, note, updated_at FROM subscriptions$/.test(text)) {
      return rows(tables.subscriptions);
    }
    if (/FROM subscriptions$/.test(text)) return rows(tables.subscriptions);
    if (/^INSERT INTO subscriptions/.test(text)) {
      const [user_id, status, started_on, ends_on, cycle_start, renews_on, note, granted_by, created_at, updated_at] = args;
      const next = { user_id, status, started_on, ends_on, cycle_start, renews_on, core_used: 0, diagnosis_used: 0, note, granted_by, created_at, updated_at };
      const found = tables.subscriptions.find(item => item.user_id === user_id);
      if (found) Object.assign(found, { status, started_on, ends_on, cycle_start, renews_on, note, updated_at });
      else tables.subscriptions.push(next);
      return rows([], 1);
    }
    if (/^UPDATE subscriptions SET status = \?, updated_at = \? WHERE user_id = \? AND status = \?/.test(text)) {
      const found = tables.subscriptions.find(item => item.user_id === args[2] && item.status === args[3]);
      if (found) Object.assign(found, { status: args[0], updated_at: args[1] });
      return rows([], found ? 1 : 0);
    }
    if (/^UPDATE subscriptions SET cycle_start = \?, renews_on = \?, core_used = 0, diagnosis_used = 0/.test(text)) {
      const found = tables.subscriptions.find(item => item.user_id === args[3] && item.renews_on === args[4]);
      if (found) Object.assign(found, { cycle_start: args[0], renews_on: args[1], core_used: 0, diagnosis_used: 0, updated_at: args[2] });
      return rows([], found ? 1 : 0);
    }
    // 편수 차감. 조건부 UPDATE라 한도를 넘으면 바뀐 행이 없다.
    if (/^UPDATE subscriptions SET (core_used|diagnosis_used) = \1 \+ 1/.test(text)) {
      const column = /core_used/.test(text) ? 'core_used' : 'diagnosis_used';
      const found = tables.subscriptions.find(item => item.user_id === args[1] && item.status === 'active'
        && item.cycle_start === args[2] && Number(item[column] || 0) < Number(args[3]));
      if (found) { found[column] = Number(found[column] || 0) + 1; found.updated_at = args[0]; }
      return rows([], found ? 1 : 0);
    }
    if (/^UPDATE subscriptions SET (core_used|diagnosis_used) = MAX/.test(text)) {
      const column = /core_used/.test(text) ? 'core_used' : 'diagnosis_used';
      const found = tables.subscriptions.find(item => item.user_id === args[1]);
      if (found) { found[column] = Math.max(0, Number(found[column] || 0) - 1); found.updated_at = args[0]; }
      return rows([], found ? 1 : 0);
    }

    // ---- 정식 수주계약(프리미엄) ----
    if (/^SELECT user_id, status, started_on, ends_on, progress, progress_note, contract_name, updated_at FROM premium_contracts WHERE user_id/.test(text)) {
      return rows(tables.premium_contracts.filter(item => item.user_id === args[0]));
    }
    if (/^SELECT user_id, status, started_on, ends_on, progress, progress_note, contract_name, updated_at\s+FROM premium_contracts$/.test(text)
      || /^SELECT user_id, status, started_on, ends_on, progress, progress_note, contract_name, updated_at FROM premium_contracts$/.test(text)) {
      return rows(tables.premium_contracts);
    }
    if (/^SELECT status, started_on, ends_on(, progress)? FROM premium_contracts WHERE user_id/.test(text)) {
      return rows(tables.premium_contracts.filter(item => item.user_id === args[0]));
    }
    if (/^SELECT status FROM premium_contracts WHERE user_id/.test(text)) {
      return rows(tables.premium_contracts.filter(item => item.user_id === args[0]).map(item => ({ status: item.status })));
    }
    if (/^SELECT status, progress FROM premium_contracts WHERE user_id/.test(text)) {
      return rows(tables.premium_contracts.filter(item => item.user_id === args[0]).map(item => ({ status: item.status, progress: item.progress })));
    }
    if (/^INSERT INTO premium_contracts/.test(text)) {
      const [user_id, status, started_on, ends_on, progress, progress_note, contract_name, granted_by, created_at, updated_at] = args;
      const found = tables.premium_contracts.find(item => item.user_id === user_id);
      if (found) Object.assign(found, { status, started_on, ends_on, progress, progress_note, contract_name, updated_at });
      else tables.premium_contracts.push({ user_id, status, started_on, ends_on, progress, progress_note, contract_name, granted_by, created_at, updated_at });
      return rows([], 1);
    }
    if (/^UPDATE premium_contracts SET progress/.test(text)) {
      const found = tables.premium_contracts.find(item => item.user_id === args[3]);
      if (found) Object.assign(found, { progress: args[0], progress_note: args[1], updated_at: args[2] });
      return rows([], found ? 1 : 0);
    }

    // ---- 공개용 우수 제안서 ----
    if (/FROM showcase_proposals WHERE is_public = 1 ORDER BY sort_order/.test(text)) {
      return rows(tables.showcase_proposals.filter(item => Number(item.is_public) === 1)
        .sort((a, b) => a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at)))
        .slice(0, Number(args[0]) || 5));
    }
    if (/FROM showcase_proposals ORDER BY sort_order/.test(text)) {
      return rows([...tables.showcase_proposals].sort((a, b) => a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at))));
    }
    if (/^SELECT COUNT\(\*\) AS n FROM showcase_proposals WHERE is_public = 1 AND id <>/.test(text)) {
      return rows([{ n: tables.showcase_proposals.filter(item => Number(item.is_public) === 1 && item.id !== args[0]).length }]);
    }
    if (/^SELECT id, title, is_public FROM showcase_proposals WHERE id/.test(text)) {
      return rows(tables.showcase_proposals.filter(item => item.id === args[0]).map(item => ({ id: item.id, title: item.title, is_public: item.is_public })));
    }
    if (/^SELECT id, title FROM showcase_proposals WHERE id/.test(text)) {
      return rows(tables.showcase_proposals.filter(item => item.id === args[0]).map(item => ({ id: item.id, title: item.title })));
    }
    if (/^SELECT id FROM showcase_proposals WHERE id/.test(text)) {
      return rows(tables.showcase_proposals.filter(item => item.id === args[0]).map(item => ({ id: item.id })));
    }
    if (/^INSERT INTO showcase_proposals/.test(text)) {
      const [id, title, field, purpose, audience, structure, outcome_design, body, sort_order, created_by, created_at, updated_at] = args;
      tables.showcase_proposals.push({ id, title, field, purpose, audience, structure, outcome_design, body, is_public: 0, sort_order: Number(sort_order) || 0, created_by, created_at, updated_at });
      return rows([], 1);
    }
    if (/^UPDATE showcase_proposals SET title/.test(text)) {
      const found = tables.showcase_proposals.find(item => item.id === args[8]);
      if (found) Object.assign(found, { title: args[0], field: args[1], purpose: args[2], audience: args[3], structure: args[4], outcome_design: args[5], body: args[6], updated_at: args[7] });
      return rows([], found ? 1 : 0);
    }
    if (/^UPDATE showcase_proposals SET is_public/.test(text)) {
      const found = tables.showcase_proposals.find(item => item.id === args[2]);
      if (found) Object.assign(found, { is_public: args[0], updated_at: args[1] });
      return rows([], found ? 1 : 0);
    }
    if (/^UPDATE showcase_proposals SET sort_order/.test(text)) {
      const found = tables.showcase_proposals.find(item => item.id === args[2]);
      if (found) Object.assign(found, { sort_order: args[0], updated_at: args[1] });
      return rows([], found ? 1 : 0);
    }
    if (/^DELETE FROM showcase_proposals WHERE id/.test(text)) {
      tables.showcase_proposals = tables.showcase_proposals.filter(item => item.id !== args[0]);
      return rows([], 1);
    }

    // ---- 회원 본인정보 ----
    if (/FROM member_profiles WHERE user_id/.test(text)) {
      return rows(tables.member_profiles.filter(item => item.user_id === args[0]));
    }
    if (/FROM member_profiles$/.test(text)) return rows(tables.member_profiles);
    if (/^INSERT INTO member_profiles/.test(text)) {
      const [user_id, org_type, org_address, org_intro, staff, facilities, programs, achievements, partners, reuse_note, updated_at] = args;
      const next = { user_id, org_type, org_address, org_intro, staff, facilities, programs, achievements, partners, reuse_note, updated_at };
      const found = tables.member_profiles.find(item => item.user_id === user_id);
      if (found) Object.assign(found, next); else tables.member_profiles.push(next);
      return rows([], 1);
    }
    if (/^UPDATE users SET name = \?, phone = \?, org_name = \?, profile_updated_at/.test(text)) {
      const found = tables.users.find(item => item.id === args[6]);
      if (found) Object.assign(found, { name: args[0], phone: args[1], org_name: args[2], profile_updated_at: args[3], profile_review_needed: args[4], updated_at: args[5] });
      return rows([], found ? 1 : 0);
    }
    if (/^SELECT name, phone, org_name FROM users WHERE id/.test(text)) {
      return rows(tables.users.filter(item => item.id === args[0]).map(item => ({ name: item.name || '', phone: item.phone || '', org_name: item.org_name || '' })));
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
