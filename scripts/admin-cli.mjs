// 관리자 계정 스크립트가 함께 쓰는 부분. 비밀번호와 해시는 화면·로그·파일 어디에도 남기지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

export const DATABASE = 'ms12-proposal-archive';
export const MIN_PASSWORD_LENGTH = 12;

export function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()); }));
}

// 입력한 비밀번호가 화면·스크롤백에 남지 않게 한다.
export function askSecret(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const redraw = () => { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); process.stdout.write(question); };
    process.stdin.on('data', redraw);
    rl.question(question, answer => { process.stdin.off('data', redraw); rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

// 두 번 받아 맞는지만 확인한다. 값은 돌려주기만 하고 출력하지 않는다.
export async function readNewPassword(label = '새 비밀번호') {
  const password = await askSecret(`${label}(입력이 보이지 않습니다): `);
  const again = await askSecret(`${label} 확인: `);
  if (password.length < MIN_PASSWORD_LENGTH) fail(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
  if (password !== again) fail('두 번 입력한 비밀번호가 다릅니다.');
  return password;
}

export const quote = value => `'${String(value).replace(/'/g, "''")}'`;
export function fail(message) { console.error(message); process.exit(1); }

function wrangler(args) {
  return spawnSync('npx', ['wrangler', 'd1', ...args], { encoding: 'utf8', shell: true });
}

// 값을 읽기만 하는 조회. 비밀번호·salt·hash 열은 절대 넘기지 않는다.
export function queryRows(command, { local = false } = {}) {
  const result = wrangler(['execute', DATABASE, local ? '--local' : '--remote', `--command=${command}`, '--json']);
  if (result.status !== 0) fail(`D1 조회에 실패했습니다.\n${result.stderr || ''}`);
  const text = String(result.stdout || '');
  const start = text.indexOf('[');
  if (start < 0) fail('D1 응답을 읽지 못했습니다.');
  try { return JSON.parse(text.slice(start))[0]?.results || []; }
  catch { return fail('D1 응답을 읽지 못했습니다.'); }
}

// 해시가 담긴 SQL은 임시 폴더에만 두고 실행 뒤 반드시 지운다.
export function executeSql(sql, { local = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ms12-admin-'));
  const file = path.join(directory, 'admin.sql');
  fs.writeFileSync(file, sql, 'utf8');
  let result;
  try {
    result = spawnSync('npx', ['wrangler', 'd1', 'execute', DATABASE, local ? '--local' : '--remote', `--file=${file}`], { stdio: 'inherit', shell: true });
  } finally {
    fs.writeFileSync(file, '-- removed\n', 'utf8');
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return result.status === 0;
}
