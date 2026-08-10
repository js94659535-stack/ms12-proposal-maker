// 관리자 계정 스크립트가 함께 쓰는 부분. 비밀번호와 해시는 화면·로그·파일 어디에도 남기지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
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

// wrangler를 셸 없이 직접 부른다. 셸을 거치면 Windows에서 SQL이 공백마다 인자로 쪼개진다.
const WRANGLER = path.join(fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)));

// wrangler를 셸 없이 부른다. 인자 배열로 넘기므로 공백이 든 값이 여러 인자로 쪼개지지 않는다.
function runWrangler(args, { json }) {
  if (!fs.existsSync(WRANGLER)) fail('wrangler를 찾지 못했습니다. npm install 후 다시 실행해 주세요.');
  return spawnSync(process.execPath, [WRANGLER, 'd1', 'execute', DATABASE, ...args], { encoding: 'utf8', shell: false, stdio: json ? 'pipe' : 'inherit' });
}

// 값이 바뀌는 SQL은 언제나 임시 .sql 파일로만 넘긴다. 해시가 명령줄에 실리지 않는다.
function runSqlFile(sql, { local }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ms12-admin-'));
  const file = path.join(directory, 'admin.sql');
  fs.writeFileSync(file, sql, 'utf8');
  try { return runWrangler([local ? '--local' : '--remote', `--file=${file}`], { json: false }); }
  finally {
    // 해시가 담긴 파일은 실행 결과와 상관없이 덮어쓰고 지운다.
    fs.writeFileSync(file, '-- removed\n', 'utf8');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

// 비밀값 열은 조회 SQL에 아예 실을 수 없게 막는다.
const SECRET_COLUMN = /password_hash|password_salt|password_algo|password_iterations|token_hash/i;
// 값을 읽기만 하는 조회.
// remote에서 --file은 SQL을 import로 올려 실행 요약만 돌려주고 행을 주지 않는다. 조회는 --command로만 된다.
// 셸을 거치지 않으므로 공백이 든 SQL도 인자 하나로 그대로 전달된다.
export function queryRows(sql, { local = false } = {}) {
  if (SECRET_COLUMN.test(sql)) fail('조회 SQL에 비밀값 열을 넣을 수 없습니다.');
  const result = runWrangler([local ? '--local' : '--remote', `--command=${sql}`, '--json'], { json: true });
  if (result.status !== 0) fail(`D1 조회에 실패했습니다.\n${(result.stderr || '').slice(0, 800)}`);
  return parseRows(String(result.stdout || ''));
}

// wrangler는 JSON 앞뒤에 안내 문구를 함께 낸다. 배열 부분만 떼어 읽는다.
export function parseRows(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return fail('D1 응답을 읽지 못했습니다.');
  let parsed;
  try { parsed = JSON.parse(text.slice(start, end + 1)); }
  catch { return fail('D1 응답을 읽지 못했습니다.'); }
  if (!Array.isArray(parsed)) return fail('D1 응답을 읽지 못했습니다.');
  return parsed.flatMap(item => (Array.isArray(item?.results) ? item.results : []));
}

// 해시가 담긴 SQL은 임시 폴더에만 두고 실행 뒤 반드시 지운다.
export function executeSql(sql, { local = false } = {}) {
  return runSqlFile(sql, { local }).status === 0;
}
