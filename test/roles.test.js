// 네 역할. 화면과 서버가 같은 목록을 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ASSIGNABLE_ROLES, MEMBER_ROLES, ROLES, ROLE_DUTY, ROLE_LABEL, canHoldClients, isStaffRole, roleLabel } from '../server/roles.js';
import { viewModeFor } from '../server/simple-flow.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');

test('역할은 네 가지이고 하는 일이 각각 적혀 있다', () => {
  assert.deepEqual(ROLES, ['admin', 'operator', 'agency', 'customer']);
  assert.equal(ROLE_LABEL.admin, '최고관리자');
  assert.equal(ROLE_LABEL.operator, '운영관리자');
  assert.equal(ROLE_LABEL.agency, '대행회원');
  assert.equal(ROLE_LABEL.customer, '일반회원');
  assert.match(ROLE_DUTY.agency, /자기 고객을 등록해 계획서 작성 대행/);
  assert.match(ROLE_DUTY.operator, /최고관리자가 허용한 운영업무/);
});

test('대행회원은 회원 쪽이고 고객 기관을 여럿 둔다', () => {
  assert.ok(MEMBER_ROLES.includes('agency') && MEMBER_ROLES.includes('customer'));
  assert.ok(!isStaffRole('agency'), '대행회원은 운영 계정이 아니다');
  assert.ok(canHoldClients('agency'));
  assert.ok(!canHoldClients('customer'), '일반회원은 자기 기관만 쓴다');
});

test('관리자 화면의 역할 목록에는 대행회원이 없다', () => {
  // 대행회원은 역할 목록이 아니라 임명 기록으로 정해진다. 「대행회원 관리」에서 다룬다.
  assert.deepEqual(ASSIGNABLE_ROLES, ['customer', 'operator']);
  assert.ok(!ASSIGNABLE_ROLES.includes('admin'), '최고관리자는 화면에서 넘겨주지 않는다');
  // 서버가 같은 목록으로 막는다. 화면 목록만 늘려도 통과하지 않는다.
  assert.match(admin, /const ASSIGNABLE = new Set\(ASSIGNABLE_ROLES\);/);
  assert.match(admin, /if \(!ASSIGNABLE\.has\(next\)\)/);
  // 화면도 같은 목록에서 고르게 한다.
  assert.match(app, /ASSIGNABLE_ROLES\.map\(role =>/);
});

test('대행회원 기본 화면은 간편이고 상세로 바꿔 볼 수 있다', () => {
  const agency = viewModeFor({ role: 'agency' });
  assert.equal(agency.mode, 'simple');
  assert.equal(agency.canToggle, true);
  assert.equal(viewModeFor({ role: 'agency' }, 'expert').mode, 'expert');
  // 일반회원 규칙은 그대로다.
  assert.equal(viewModeFor({ role: 'customer' }, 'expert').mode, 'simple');
});

test('역할 이름을 화면마다 다르게 부르지 않는다', () => {
  assert.match(app, /const ROLE_LABELS = \{ admin: roleLabel\('admin'\)/);
  assert.equal(roleLabel('agency'), '대행회원');
  // 소셜 연결 이전은 회원 계정에만 열린다.
  assert.match(admin, /if \(!MEMBER_ROLES\.includes\(found\.role\)\)/);
});
