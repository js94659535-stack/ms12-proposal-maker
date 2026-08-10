// 관리자 계정을 1회 만든다. 비밀번호는 입력받아 그 자리에서 해시하고, 어디에도 남기지 않는다.
// 사용: node scripts/create-admin.mjs [--local]
//   --local 을 붙이면 로컬 D1에, 붙이지 않으면 Production D1(--remote)에 적용한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { createPasswordRecord } from '../server/password.js';

const DATABASE = 'ms12-proposal-archive';
const local = process.argv.includes('--local');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}
// 입력한 비밀번호가 화면·스크롤백에 남지 않게 한다.
function askSecret(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = () => { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); process.stdout.write(question); };
    process.stdin.on('data', onData);
    rl.question(question, answer => { process.stdin.off('data', onData); rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}
const quote = value => `'${String(value).replace(/'/g, "''")}'`;

const email = (await ask('관리자 이메일: ')).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('이메일 형식이 올바르지 않습니다.'); process.exit(1); }
const name = await ask('표시 이름(선택): ');
const password = await askSecret('비밀번호(입력이 보이지 않습니다): ');
const again = await askSecret('비밀번호 확인: ');
if (password.length < 12) { console.error('비밀번호는 12자 이상이어야 합니다.'); process.exit(1); }
if (password !== again) { console.error('두 번 입력한 비밀번호가 다릅니다.'); process.exit(1); }

const record = await createPasswordRecord(password);
const now = new Date().toISOString();
const id = crypto.randomUUID();
const sql = `INSERT INTO users (id, email, role, org_id, name, status, password_algo, password_iterations, password_salt, password_hash, created_at, updated_at)
VALUES (${quote(id)}, ${quote(email)}, 'admin', '', ${quote(name)}, 'active', ${quote(record.password_algo)}, ${record.password_iterations}, ${quote(record.password_salt)}, ${quote(record.password_hash)}, ${quote(now)}, ${quote(now)})
ON CONFLICT(email) DO UPDATE SET role='admin', status='active', name=excluded.name, password_algo=excluded.password_algo, password_iterations=excluded.password_iterations, password_salt=excluded.password_salt, password_hash=excluded.password_hash, updated_at=excluded.updated_at;
`;

// 해시가 담긴 파일은 임시 폴더에만 두고 반드시 지운다.
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ms12-admin-')), 'create-admin.sql');
fs.writeFileSync(file, sql, 'utf8');
let result;
try {
  result = spawnSync('npx', ['wrangler', 'd1', 'execute', DATABASE, local ? '--local' : '--remote', `--file=${file}`, '--yes'], { stdio: 'inherit', shell: true });
} finally {
  fs.writeFileSync(file, '-- removed\n', 'utf8');
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
if (result.status !== 0) { console.error(`관리자 생성에 실패했습니다(${local ? 'local' : 'remote'}). 배포를 진행하지 마세요.`); process.exit(1); }
console.log(`관리자 계정을 ${local ? '로컬' : 'Production'} D1에 만들었습니다: ${email}`);
console.log('비밀번호와 해시는 출력하지 않습니다. 비밀번호 관리도구에만 보관하세요.');
