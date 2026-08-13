// 대행회원 자격·한도·인계. 파는 상품이 아니라 최고관리자가 임명하는 자리다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AGENCY_STATUSES, DEFAULT_LIMITS, agencyState, canManageAgency, limitCheck, limitKindFor,
  limitsOf, nextMonthStart, rejectsSelfPromotion, remainingFor, transferCheck, workspaceOf
} from '../server/agency.js';
import { BLOCKED_ACTIONS, OPERATOR_ACTIONS } from '../server/operator-scope.js';

const admin = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');
const proposal = fs.readFileSync(new URL('../functions/api/proposal.js', import.meta.url), 'utf8');
const archive = fs.readFileSync(new URL('../functions/api/archive.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0015_agency.sql', import.meta.url), 'utf8');

test('지정·해제는 활성 최고관리자만 하고 스스로 올라갈 수 없다', () => {
  assert.ok(canManageAgency({ role: 'admin', status: 'active' }));
  for (const actor of [{ role: 'operator', status: 'active' }, { role: 'agency', status: 'active' },
    { role: 'customer', status: 'active' }, { role: 'admin', status: 'disabled' }]) {
    assert.ok(!canManageAgency(actor), actor.role + '/' + actor.status);
  }
  // 대행회원이 다른 대행회원을 만들거나 자기 자격을 건드릴 수 없다.
  assert.equal(rejectsSelfPromotion({ id: 'a', role: 'agency', status: 'active' }, 'b').allowed, false);
  assert.equal(rejectsSelfPromotion({ id: 'a', role: 'admin', status: 'active' }, 'a').allowed, false);
  assert.equal(rejectsSelfPromotion({ id: 'a', role: 'admin', status: 'active' }, 'b').allowed, true);
  // 서버도 같은 판정을 쓴다.
  assert.match(admin, /const gate = rejectsSelfPromotion\(actor, targetId\);/);
  assert.match(admin, /if \(!gate\.allowed\) return json\(\{ error: gate\.reason \}, 403\);/);
  // 운영 계정은 대행회원으로 지정하지 않는다.
  assert.match(admin, /if \(target\.role === 'admin' \|\| target\.role === 'operator'\)/);
});

test('운영관리자는 현황만 보고 지정·해제·한도·인계는 403이다', () => {
  assert.ok(OPERATOR_ACTIONS.has('agencyList'), '현황 조회는 열린다');
  for (const action of ['setAgency', 'agencyTransfer', 'agencyTransferPreview', 'setAgencyLimits']) {
    assert.ok(BLOCKED_ACTIONS.has(action), action);
  }
});

test('요금과 자격을 섞지 않는다', () => {
  // 자격은 구독·프리미엄 표가 아니라 따로 둔 표에 있다.
  assert.match(migration, /CREATE TABLE IF NOT EXISTS agency_grants/);
  for (const forbidden of ['subscription', 'premium_contract', 'price', 'amount', 'payment']) {
    assert.ok(!migration.toLowerCase().includes(forbidden), forbidden + ' 는 자격 표에 두지 않는다');
  }
  // 기존 표는 열만 더한다.
  const statements = migration.split(';').map(line => line.trim()).filter(Boolean);
  for (const statement of statements) {
    assert.ok(/^(--|CREATE TABLE IF NOT EXISTS|ALTER TABLE [a-z_]+ ADD COLUMN|CREATE INDEX IF NOT EXISTS)/m.test(statement.replace(/^--[^\n]*\n/gm, '')), statement.slice(0, 60));
  }
});

test('한도를 정하지 않아도 무제한이 되지 않는다', () => {
  const limits = limitsOf({});
  assert.deepEqual(limits, DEFAULT_LIMITS);
  assert.ok(limits.monthlyPlans > 0 && limits.monthlyTokens > 0 && limits.monthlyCostMicro > 0);
  // 잘못된 값도 기본 한도로 떨어진다.
  assert.equal(limitsOf({ monthly_plans: 0 }).monthlyPlans, DEFAULT_LIMITS.monthlyPlans);
  assert.equal(limitsOf({ monthly_plans: -5 }).monthlyPlans, DEFAULT_LIMITS.monthlyPlans);
  assert.equal(limitsOf({ monthly_plans: 3 }).monthlyPlans, 3);
});

test('자격 상태를 날짜와 함께 판정한다', () => {
  const row = { user_id: 'u1', status: 'active', starts_on: '2026-08-01', ends_on: '2026-08-31' };
  assert.equal(agencyState(row, '2026-08-13').active, true);
  assert.equal(agencyState(row, '2026-07-31').active, false);
  assert.equal(agencyState(row, '2026-09-01').active, false);
  assert.equal(agencyState({ ...row, status: 'paused' }, '2026-08-13').active, false);
  assert.equal(agencyState({ ...row, status: 'revoked' }, '2026-08-13').active, false);
  assert.match(agencyState({ ...row, status: 'revoked' }, '2026-08-13').reason, /기존 자료는 최고관리자가 보존/);
  assert.equal(agencyState(null).has, false);
  assert.deepEqual([...AGENCY_STATUSES], ['active', 'paused', 'revoked']);
});

test('한도를 넘으면 AI를 부르기 전에 막는다', () => {
  const state = agencyState({ user_id: 'u1', status: 'active', monthly_plans: 2, revisions_per_plan: 2, monthly_diagnoses: 1, monthly_tokens: 1000, monthly_cost_micro: 5000 }, '2026-08-13');
  assert.equal(limitCheck({ state, usage: { plans: 1 }, kind: 'plan' }).allowed, true);
  assert.equal(limitCheck({ state, usage: { plans: 2 }, kind: 'plan' }).code, 'plans');
  assert.equal(limitCheck({ state, usage: { diagnoses: 1 }, kind: 'diagnosis' }).code, 'diagnoses');
  assert.equal(limitCheck({ state, usage: { revisionsForPlan: 2 }, kind: 'revision' }).code, 'revisions');
  assert.equal(limitCheck({ state, usage: { tokens: 1000 }, kind: 'plan' }).code, 'tokens');
  assert.equal(limitCheck({ state, usage: { costMicro: 5000 }, kind: 'plan' }).code, 'cost');
  // 자격이 멈춰 있으면 종류를 가리지 않고 막는다.
  const paused = agencyState({ user_id: 'u1', status: 'paused' }, '2026-08-13');
  assert.equal(limitCheck({ state: paused, usage: {}, kind: 'other' }).code, 'inactive');
  // 대행회원이 아니면 이 한도는 걸리지 않는다.
  assert.equal(limitCheck({ state: { has: false }, usage: {}, kind: 'plan' }).allowed, true);

  // 서버가 OpenAI를 부르기 전에 본다.
  assert.match(proposal, /const verdict = limitCheck\(\{ state: agency, usage, kind: limitKindFor\(body\.action\) \}\);/);
  assert.ok(proposal.indexOf('limitCheck({ state: agency') < proposal.indexOf("fetch('https://api.openai.com"), '한도 확인이 호출보다 앞이다');
  assert.match(proposal, /agencyLimit: true, code: verdict\.code/);
});

test('작업 이름을 한도 종류로 옮긴다', () => {
  assert.equal(limitKindFor('master'), 'plan');
  assert.equal(limitKindFor('fullProposal'), 'plan');
  assert.equal(limitKindFor('coreProposal'), 'plan');
  assert.equal(limitKindFor('patchSections'), 'revision');
  assert.equal(limitKindFor('diagnosis'), 'diagnosis');
  assert.equal(limitKindFor('analyze'), 'other');
});

test('남은 편수와 갱신일을 화면에 적는다', () => {
  const state = { limits: { ...DEFAULT_LIMITS, monthlyPlans: 10, monthlyDiagnoses: 5 } };
  const left = remainingFor(state, { plans: 4, diagnoses: 5, tokens: 100 });
  assert.equal(left.plans, 6);
  assert.equal(left.diagnoses, 0);
  assert.match(left.renewsOn, /^\d{4}-\d{2}-01$/);
  assert.equal(nextMonthStart(new Date('2026-12-20T00:00:00Z')), '2027-01-01');
  // 화면이 그 값을 그대로 쓴다.
  assert.match(app, /남은 계획서 \$\{left\.plans\}편 · 남은 진단 \$\{left\.diagnoses\}회/);
});

test('사용량은 실행자와 대상 고객에 함께 남는다', () => {
  assert.match(migration, /ALTER TABLE ai_usage_events ADD COLUMN agency_user_id/);
  assert.match(migration, /ALTER TABLE ai_usage_events ADD COLUMN client_org_id/);
  assert.match(proposal, /agencyUserId: agency\.has \? user\.id : '', clientOrgId/);
});

test('자격을 잃으면 대행 업무 자료가 다음 요청부터 닫힌다', () => {
  assert.match(archive, /if \(workspace === 'agency'\) \{/);
  assert.match(archive, /if \(!agency\.active\) \{/);
  assert.match(archive, /agencyBlocked: true \}, 403\)/);
  // 개인 작업공간은 자격과 무관하게 열린다.
  assert.equal(workspaceOf('agency'), 'agency');
  assert.equal(workspaceOf(''), 'personal');
  assert.equal(workspaceOf('other'), 'personal');
  // 두 공간의 자료가 목록에서 섞이지 않는다.
  assert.match(archive, /COALESCE\(workspace, 'personal'\) = \?/);
});

test('인계는 살아 있는 다른 대행회원에게만 하고 건수를 먼저 보여 준다', () => {
  const live = { has: true, status: 'active' };
  assert.equal(transferCheck({ from: 'a', to: 'a', fromState: live, toState: live }).allowed, false);
  assert.equal(transferCheck({ from: 'a', to: 'b', fromState: live, toState: { has: false } }).allowed, false);
  assert.equal(transferCheck({ from: 'a', to: 'b', fromState: live, toState: { has: true, status: 'revoked' } }).allowed, false);
  assert.equal(transferCheck({ from: 'a', to: 'b', fromState: live, toState: live }).allowed, true);
  // 건수를 확인하지 않으면 실행하지 않는다.
  assert.match(admin, /if \(body\.confirm !== true\) \{/);
  assert.match(admin, /preview: await transferPreview\(db, fromId, toId\)/);
});

test('지정·해제·인계를 감사기록에 남기고 자료는 지우지 않는다', () => {
  assert.match(admin, /action: `admin\.agency\.\$\{status\}`/);
  assert.match(admin, /action: 'admin\.agency\.transfer'/);
  // 인계는 UPDATE만 한다. DELETE가 없어야 한다.
  const store = fs.readFileSync(new URL('../server/agency-store.js', import.meta.url), 'utf8');
  const transfer = store.slice(store.indexOf('export async function transferAgencyData'));
  assert.ok(!/DELETE/i.test(transfer), '인계에서 지우지 않는다');
  assert.match(transfer, /UPDATE applicant_organizations SET agency_user_id = \?, user_id = \?/);
  assert.match(transfer, /UPDATE archived_proposals SET agency_user_id = \?, user_id = \?/);
});

test('자격을 거두면 로그인은 남고 역할만 일반회원으로 돌아간다', () => {
  assert.match(admin, /const nextRole = status === 'revoked' \? 'customer' : 'agency';/);
  // 계정을 지우거나 막지 않는다.
  const block = admin.slice(admin.indexOf('async function setAgency'), admin.indexOf('// 자료 인계'));
  assert.ok(!/DELETE FROM users/.test(block));
  assert.ok(!/status = 'disabled'/.test(block));
  assert.match(block, /DELETE FROM sessions WHERE user_id = \?/, '역할이 바뀌면 다시 로그인한다');
});
