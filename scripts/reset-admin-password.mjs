// 이미 있는 관리자 계정의 비밀번호만 바꾼다. 계정을 새로 만들지 않고 다른 자료도 지우지 않는다.
// 사용: node scripts/reset-admin-password.mjs [--local]
import { ask, executeSql, fail, queryRows, quote, readNewPassword } from './admin-cli.mjs';
import { createPasswordRecord } from '../server/password.js';

const local = process.argv.includes('--local');

const email = (await ask('비밀번호를 바꿀 관리자 이메일: ')).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('이메일 형식이 올바르지 않습니다.');

// 있는 계정인지만 확인한다. 비밀번호·salt·hash 열은 조회하지 않는다.
const rows = queryRows(`SELECT id, email, role, status FROM users WHERE email = ${quote(email)};`, { local });
if (!rows.length) fail(`${email} 계정을 찾지 못했습니다. 이 스크립트는 계정을 새로 만들지 않습니다.`);
const user = rows[0];
if (user.role !== 'admin') fail(`${email}은 관리자 계정이 아닙니다(role=${user.role}).`);
console.log(`대상 계정을 찾았습니다: ${user.email} · role=${user.role} · status=${user.status}`);

const password = await readNewPassword('새 비밀번호');
const record = await createPasswordRecord(password);
const now = new Date().toISOString();
// 계정 행은 그대로 두고 해시 방식·반복 횟수·salt·hash만 새 값으로 바꾼다.
// 예전 비밀번호로 열린 세션과 실패 제한 기록은 함께 지운다.
const sql = `UPDATE users SET password_algo = ${quote(record.password_algo)}, password_iterations = ${record.password_iterations},
  password_salt = ${quote(record.password_salt)}, password_hash = ${quote(record.password_hash)}, status = 'active', updated_at = ${quote(now)}
WHERE id = ${quote(user.id)};
DELETE FROM sessions WHERE user_id = ${quote(user.id)};
DELETE FROM login_attempts;
`;

if (!executeSql(sql, { local })) fail(`비밀번호 재설정에 실패했습니다(${local ? 'local' : 'remote'}). 기존 비밀번호가 그대로 남아 있습니다.`);
console.log(`${email}의 비밀번호를 바꿨습니다. 기존 세션과 로그인 실패 기록을 지웠습니다.`);
console.log('새 비밀번호와 해시는 출력하지 않습니다. 비밀번호 관리도구에만 보관하세요.');
