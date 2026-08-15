// 관리자 계정 하나를 만든다. 비밀번호는 이 창에서 본인이 직접 친다.
//
// 왜 도구인가: 지금 화면에는 관리자를 새로 만드는 자리가 없고, 있어서도 안 된다.
// 그리고 비밀번호는 남이 정해 주면 안 된다. 여기서는 친 사람만 알고, 화면에도 기록에도 남기지 않는다.
//
// 쓰는 법:  node tools/add-admin.mjs someone@example.com
//   - 비밀번호는 물어볼 때 직접 칩니다. 화면에 찍히지 않고, 명령 기록에도 남지 않습니다.
//   - 이미 있는 이메일이면 아무것도 하지 않고 멈춥니다. 남의 비밀번호를 덮어쓰지 않습니다.
//   - 저장되는 것은 해시뿐입니다. 원문은 어디에도 저장하지 않습니다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { createPasswordRecord } from '../server/password.js';
import { normalizeEmail, validateNewPassword } from '../server/signup.js';

const DB = 'ms12-proposal-archive';
const WRANGLER = path.join('node_modules', 'wrangler', 'bin', 'wrangler.js');

const email = normalizeEmail(process.argv[2] || '');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('쓰는 법: node tools/add-admin.mjs 이메일주소');
  process.exit(1);
}

// 비밀번호를 받는다. 치는 동안 화면에 찍지 않는다.
// 사람이 직접 칠 때는 한 줄씩 감춰 받고, 파이프로 넣는 경우(시험)에는 들어온 줄을 미리 다 읽어 둔다.
const tty = Boolean(process.stdin.isTTY);
let piped = null;

async function askHidden(question) {
  if (!tty) {
    if (!piped) {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      piped = Buffer.concat(chunks).toString('utf8').split(String.fromCharCode(10)).map(line => line.replace(String.fromCharCode(13), ''));
    }
    return piped.shift() ?? '';
  }
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let hide = false;
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = text => { if (!hide) write(text); };
    process.stdout.write(question);
    hide = true;
    rl.question('', answer => { hide = false; process.stdout.write('\n'); rl.close(); resolve(answer); });
  });
}

// 값을 쓰는 문장은 임시 파일로 넘기고 바로 지운다. 해시가 명령 기록에 남지 않게 한다.
function runSql(sql) {
  const file = path.join(os.tmpdir(), `ms12-admin-${Date.now()}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  try {
    const args = [WRANGLER, 'd1', 'execute', DB, '--remote', `--file=${file}`];
    return execFileSync(process.execPath, args, { env: { ...process.env, CI: 'true' }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  } finally { fs.rmSync(file, { force: true }); }
}

// 읽기만 하는 문장. 비밀이 없으므로 그대로 넘기고 답만 받아 온다.
function askDb(sql) {
  const args = [WRANGLER, 'd1', 'execute', DB, '--remote', '--json', `--command=${sql}`];
  const out = execFileSync(process.execPath, args, { env: { ...process.env, CI: 'true' }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  // 도구가 앞뒤로 진행 표시를 섞어 내보낼 때가 있다. 대괄호부터 읽는다.
  const start = out.indexOf('[');
  if (start < 0) throw new Error('데이터베이스 응답을 읽지 못했습니다.');
  return JSON.parse(out.slice(start));
}

const quote = value => `'${String(value ?? '').replace(/'/g, "''")}'`;

const existing = askDb(`SELECT id, role, status FROM users WHERE email = ${quote(email)}`)[0]?.results || [];
if (existing.length) {
  console.error(`이미 있는 계정입니다(역할 ${existing[0].role} · 상태 ${existing[0].status}). 남의 비밀번호를 덮어쓰지 않습니다.`);
  console.error('다른 주소로 만들거나, 그 계정의 비밀번호는 본인이 로그인해서 바꿔 주세요.');
  process.exit(1);
}

const password = await askHidden(`${email} 의 새 비밀번호: `);
const confirm = await askHidden('한 번 더: ');
const checked = validateNewPassword({ email, password, passwordConfirm: confirm });
if (!checked.ok) { console.error(checked.errors.join(' ')); process.exit(1); }

const record = await createPasswordRecord(checked.value.password);
const id = crypto.randomUUID();
const now = new Date().toISOString();

runSql(`INSERT INTO users (id, email, role, org_id, name, status, password_algo, password_iterations, password_salt, password_hash, created_at, updated_at)
VALUES (${quote(id)}, ${quote(email)}, 'admin', '', '', 'active', ${quote(record.password_algo)}, ${Number(record.password_iterations)}, ${quote(record.password_salt)}, ${quote(record.password_hash)}, ${quote(now)}, ${quote(now)});
INSERT INTO admin_audit_log (id, actor_id, actor_email, actor_role, action, target_id, target_email, result, detail, at)
VALUES (${quote(crypto.randomUUID())}, ${quote(id)}, ${quote(email)}, 'admin', 'admin.create-cli', ${quote(id)}, ${quote(email)}, 'ok', '명령줄에서 관리자 계정을 만들었습니다. 비밀번호는 본인이 직접 정했습니다.', ${quote(now)});`);

console.log(`관리자 계정을 만들었습니다: ${email}`);
console.log('비밀번호는 방금 치신 것뿐입니다. 저장된 것은 해시이고, 원문은 아무 곳에도 남지 않았습니다.');
console.log('https://pro.ms12.org 에서 바로 로그인하실 수 있습니다.');
