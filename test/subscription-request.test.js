// 구독 신청서. 결제가 아니라 신청이며, 실제 개설은 관리자가 확인한 뒤에 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BILLING_NOTE, REQUEST_LABELS, canSubmit, requestView, validateRequest } from '../server/subscription-request.js';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const account = fs.readFileSync(new URL('../functions/api/account.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../functions/api/admin.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/0018_subscription_requests.sql', import.meta.url), 'utf8');

const filled = { orgName: '사단법인 ○○센터', contactName: '김담당', phone: '010-0000-0000', purpose: '매달 공모 2건을 직접 씁니다.', noticeAck: true };

test('신청서는 꼭 필요한 것만 받고 결제수단은 받지 않는다', () => {
  assert.equal(validateRequest(filled).ok, true);
  // 카드번호·결제수단 칸은 아예 없다.
  assert.equal(validateRequest(filled).value.cardNumber, undefined);
  assert.doesNotMatch(migration, /card|결제수단/i);
  // 빠진 것은 무엇이 빠졌는지 알려 준다.
  assert.deepEqual(validateRequest({ ...filled, orgName: '' }).errors, ['기관명을 적어 주세요.']);
  assert.deepEqual(validateRequest({ ...filled, purpose: '짧음' }).errors, ['무엇에 쓰실지 한 줄이라도 적어 주세요.']);
  assert.deepEqual(validateRequest({ ...filled, wantedStart: '2027/01/05' }).errors, ['희망 시작일은 2027-01-05 형식으로 적어 주세요.']);
});

test('결제가 연결되어 있지 않다는 사실을 확인해야 접수한다', () => {
  assert.deepEqual(validateRequest({ ...filled, noticeAck: false }).errors, ['관리자 확인 후 개설된다는 안내에 동의해 주세요.']);
  assert.match(BILLING_NOTE, /관리자가 확인한 뒤 열어 드립니다/);
});

test('같은 회원이 검토 중인 신청을 또 내지 못한다', () => {
  assert.equal(canSubmit(null).allowed, true);
  assert.equal(canSubmit({ status: 'pending' }).allowed, false);
  assert.equal(canSubmit({ status: 'approved' }).allowed, false);
  // 거절된 뒤에는 고쳐서 다시 낼 수 있다.
  assert.equal(canSubmit({ status: 'rejected' }).allowed, true);
  assert.deepEqual(Object.values(REQUEST_LABELS), ['검토 중', '개설됨', '거절']);
});

test('서버가 받은 줄을 화면이 읽을 모양으로 바꾼다', () => {
  const view = requestView({ id: 'r1', user_id: 'u1', user_email: 'a@b.c', org_name: '센터', contact_name: '김', phone: '010', purpose: '이유', status: 'pending', created_at: '2026-08-14T00:00:00Z' });
  assert.equal(view.statusLabel, '검토 중');
  assert.equal(view.orgName, '센터');
});

test('회원은 신청만 하고, 구독은 관리자가 승인할 때 열린다', () => {
  assert.match(account, /if \(body\.action === 'subscriptionRequest'\) return submitSubscriptionRequest/);
  assert.match(account, /if \(body\.action === 'mySubscriptionRequest'\)/);
  // 승인은 기존 월간 구독 부여를 그대로 쓴다. 별도 경로를 만들지 않는다.
  assert.match(admin, /if \(body\.action === 'decideSubscriptionRequest'\) return decideSubscription/);
  assert.match(admin, /const result = await setSubscription\(db, target, \{ subscription: \{ status: 'active'/);
  // 처리 기록을 감사기록에 남긴다.
  assert.match(admin, /action: 'admin\.subscriptionRequest'/);
});

test('화면에 신청서와 관리자 목록이 있다', () => {
  assert.match(app, /function subscriptionRequestView\(\) \{/);
  assert.match(app, /function subscriptionRequestsPanel\(\) \{/);
  assert.match(app, /id="send-sub-request"/);
  assert.match(app, /data-sub-approve=/);
  assert.match(app, /data-sub-reject=/);
  // 거절할 때는 사유를 반드시 적는다.
  assert.match(app, /거절 사유를 적어 주세요/);
  // 화면도 서버와 같은 규칙으로 먼저 막는다.
  assert.match(app, /const checked = validateRequest\(view\.draft\);/);
});
