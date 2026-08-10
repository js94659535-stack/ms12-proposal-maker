// 관리자 계정을 1회 만든다. 비밀번호는 입력받아 그 자리에서 해시하고, 어디에도 남기지 않는다.
// 사용: node scripts/create-admin.mjs [--local]
//   --local 을 붙이면 로컬 D1에, 붙이지 않으면 Production D1(--remote)에 적용한다.
import { ask, executeSql, fail, quote, readNewPassword } from './admin-cli.mjs';
import { createPasswordRecord } from '../server/password.js';

const local = process.argv.includes('--local');

const email = (await ask('관리자 이메일: ')).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('이메일 형식이 올바르지 않습니다.');
const name = await ask('표시 이름(선택): ');
const password = await readNewPassword('비밀번호');

const record = await createPasswordRecord(password);
const now = new Date().toISOString();
const sql = `INSERT INTO users (id, email, role, org_id, name, status, password_algo, password_iterations, password_salt, password_hash, created_at, updated_at)
VALUES (${quote(crypto.randomUUID())}, ${quote(email)}, 'admin', '', ${quote(name)}, 'active', ${quote(record.password_algo)}, ${record.password_iterations}, ${quote(record.password_salt)}, ${quote(record.password_hash)}, ${quote(now)}, ${quote(now)})
ON CONFLICT(email) DO UPDATE SET role='admin', status='active', name=excluded.name, password_algo=excluded.password_algo, password_iterations=excluded.password_iterations, password_salt=excluded.password_salt, password_hash=excluded.password_hash, updated_at=excluded.updated_at;
`;

if (!executeSql(sql, { local })) fail(`관리자 생성에 실패했습니다(${local ? 'local' : 'remote'}). 배포를 진행하지 마세요.`);
console.log(`관리자 계정을 ${local ? '로컬' : 'Production'} D1에 만들었습니다: ${email}`);
console.log('비밀번호와 해시는 출력하지 않습니다. 비밀번호 관리도구에만 보관하세요.');
