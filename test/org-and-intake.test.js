// 기관정보 단일화·사업 아이디어·제안서 작성정보. 회원이 같은 것을 두 번 입력하지 않게 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { APPLICANT_AREAS } from '../src/applicants.js';
import { CORE_AREAS, PROFILE_SOURCE, UNCONFIRMED, areaProgress, extractedCandidates, mergeProfileIntoApplicant, pendingConfirmations, profileCandidates } from '../server/org-profile.js';
import { ASSET_STATUS, assetSentence, suggestAssets, validateAsset } from '../server/idea-assets.js';
import { INTAKE_FIELDS, MAX_QUESTIONS, UNKNOWN, checkNumbers, intakeFacts, intakeState } from '../server/proposal-intake.js';

const profile = {
  name: '김담당', phone: '010-0000-0000', orgName: '햇살복지관', orgType: '사회복지법인',
  orgAddress: '광주광역시', orgIntro: '지역 아동 지원', staff: '사회복지사 4명',
  facilities: '프로그램실 2실', programs: '방과후 돌봄', achievements: '2025년 아동 돌봄 사업', partners: '지역아동센터 3곳'
};

// ---------- 기관정보 단일화 ----------

test('내 정보에 적은 기관정보가 신청기관 후보로 그대로 넘어간다', () => {
  const candidates = profileCandidates(profile);
  const labels = candidates.map(item => item.label);
  for (const expected of ['기관명', '기관 유형', '보유 인력', '주요 프로그램', '사업 실적', '협력기관']) {
    assert.ok(labels.includes(expected), expected);
  }
  // 물려받은 값은 확정이 아니다. 회원이 확인해야 확정된다.
  assert.ok(candidates.every(item => item.status === UNCONFIRMED));
  assert.ok(candidates.every(item => item.source === PROFILE_SOURCE));
});

test('이미 적어 둔 항목은 다시 묻지 않고, 값이 다르면 덮어쓰지 않는다', () => {
  const applicant = { items: [
    { area: 'basic', label: '기관명', value: '햇살복지관', status: '확인됨' },
    { area: 'staff', label: '보유 인력', value: '사회복지사 6명', status: '확인됨' }
  ] };
  const merged = mergeProfileIntoApplicant(applicant, profile);
  // 같은 값은 손대지 않는다.
  assert.ok(!merged.added.some(item => item.label === '기관명'));
  assert.ok(!merged.conflicts.some(item => item.label === '기관명'));
  // 다른 값은 회원이 고르도록 남긴다. 조용히 덮어쓰지 않는다.
  const conflict = merged.conflicts.find(item => item.label === '보유 인력');
  assert.ok(conflict);
  assert.equal(conflict.current, '사회복지사 6명');
  assert.equal(conflict.value, '사회복지사 4명');
  // 없던 것만 새로 들어간다.
  assert.ok(merged.added.some(item => item.label === '주요 프로그램'));
});

test('문서에서 뽑은 값은 자동으로 확정하지 않는다', () => {
  const extracted = extractedCandidates([{ area: 'performance', label: '2024년 실적', value: '3천만원', source: '결과보고서.pdf' }]);
  assert.equal(extracted[0].status, UNCONFIRMED);
  assert.equal(extracted[0].origin, '파일 추출');
  const applicant = { items: extracted };
  assert.equal(pendingConfirmations(applicant).length, 1);
});

test('핵심 영역을 먼저 안내하고 나머지는 선택으로 둔다', () => {
  const progress = areaProgress({ items: [] }, APPLICANT_AREAS);
  assert.equal(progress.length, 10, '기존 10개 영역을 그대로 유지한다');
  const core = progress.filter(area => area.core).map(area => area.key);
  assert.deepEqual(core, [...CORE_AREAS]);
  // 비어 있어도 막지 않는다. 먼저 채우자고 안내만 한다.
  assert.ok(progress.filter(area => area.needsAttention).every(area => area.core));
  assert.equal(progress.filter(area => !area.core).some(area => area.needsAttention), false);
});

// ---------- 사업 아이디어·활용자산 ----------

test('검증된 보유자산은 경험과 근거가 있어야 한다', () => {
  const bad = validateAsset({ name: '돌봄교실', status: ASSET_STATUS.verified });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 2);
  const good = validateAsset({ name: '돌봄교실', status: ASSET_STATUS.verified, experience: '2025년 12회기 운영', evidence: '결과보고서' });
  assert.equal(good.ok, true);
  // 상태를 적지 않으면 후보로 둔다. 실적으로 올라가지 않는다.
  assert.equal(validateAsset({ name: '새 아이디어' }).value.status, ASSET_STATUS.candidate);
});

test('공고 목적·평가기준과 겹치는 자산만 후보로 올린다', () => {
  const assets = [
    { id: 'a1', name: '아동 돌봄교실', problem: '방과후 돌봄 공백', status: ASSET_STATUS.verified, evidenceConfirmed: true },
    { id: 'a2', name: '노인 급식 배달', problem: '독거노인 결식', status: ASSET_STATUS.verified, evidenceConfirmed: true },
    { id: 'a3', name: '제외한 것', problem: '아동 돌봄', status: ASSET_STATUS.excluded }
  ];
  const matched = suggestAssets({ notice: { title: '아동 돌봄 지원사업', summary: '방과후 돌봄 공백 해소' }, assets });
  assert.equal(matched.matched.length, 1);
  assert.equal(matched.matched[0].id, 'a1');
  assert.match(matched.matched[0].why, /겹치는 말/);
  // 제외한 자산은 후보에 넣지 않는다.
  assert.ok(!matched.matched.some(item => item.id === 'a3'));
});

test('겹치는 것이 없으면 억지로 끼워 넣지 않는다', () => {
  const result = suggestAssets({ notice: { title: '문화예술 창작 지원' }, assets: [{ id: 'a1', name: '노인 급식 배달', status: ASSET_STATUS.verified }] });
  assert.equal(result.matched.length, 0);
  assert.match(result.reason, /억지로 넣지 않았습니다/);
  // 공고를 읽기 전에는 아무것도 권하지 않는다.
  assert.match(suggestAssets({ notice: {}, assets: [{ id: 'a1', name: '무엇이든' }] }).reason, /공고 목적과 평가기준을 먼저/);
});

test('후보 아이디어는 확정 실적처럼 적히지 않는다', () => {
  const candidate = { name: '새 돌봄교실', status: ASSET_STATUS.candidate };
  assert.equal(assetSentence(candidate), '[신규 제안] 새 돌봄교실 [확인 필요]');
  // 검증됐어도 회원이 근거를 확인하지 않았으면 실적으로 쓰지 않는다.
  assert.match(assetSentence({ name: '돌봄교실', status: ASSET_STATUS.verified, evidence: '보고서', evidenceConfirmed: false }), /\[확인 필요\]/);
  assert.match(assetSentence({ name: '돌봄교실', status: ASSET_STATUS.verified, evidence: '2025 결과보고서', evidenceConfirmed: true }), /운영 경험 있음/);
});

// ---------- 제안서 작성정보 ----------

test('공고문과 기관정보에서 확인되는 것은 다시 묻지 않는다', () => {
  const state = intakeState({
    answers: {},
    notice: { supportLimit: '3천만원', eligibility: '광주 지역 아동', applicationPeriod: '2026-03-01~2026-12-31' },
    applicant: { items: [{ area: 'staff', label: '담당 인력', value: '사회복지사 2명', status: '확인됨' }] }
  });
  const keys = state.prefilled.map(item => item.key);
  for (const expected of ['budgetLimit', 'audience', 'period', 'staff']) assert.ok(keys.includes(expected), expected);
  assert.ok(!state.ask.some(item => keys.includes(item.key)), '이미 아는 것은 묻지 않는다');
  // 어디에서 온 값인지 밝힌다.
  assert.match(state.prefilled.find(item => item.key === 'budgetLimit').source, /공고문/);
  assert.match(state.prefilled.find(item => item.key === 'staff').source, /신청기관 확인 항목/);
});

test('확인 필요 상태인 기관정보는 가져오지 않는다', () => {
  const state = intakeState({ applicant: { items: [{ area: 'staff', label: '담당 인력', value: '미확인 2명', status: '확인 필요' }] } });
  assert.ok(!state.prefilled.some(item => item.key === 'staff'));
});

test('처음부터 긴 설문을 펼치지 않고 한 번에 다섯 개까지만 묻는다', () => {
  const state = intakeState({});
  assert.equal(state.ask.length, MAX_QUESTIONS);
  assert.ok(state.remaining > 0);
  // 낮은 단계부터 묻는다.
  assert.ok(state.ask.every((item, index, list) => index === 0 || list[index - 1].step <= item.step));
  assert.equal(state.ready, false);
});

test('5~20쪽에 필요한 항목을 모두 받는다', () => {
  const keys = INTAKE_FIELDS.map(field => field.key);
  for (const expected of ['problem', 'problemEvidence', 'audience', 'audienceCount', 'selection', 'period', 'sessions',
    'place', 'activities', 'staff', 'partners', 'budgetLimit', 'selfFunding', 'outcome', 'indicator', 'measurement', 'difference']) {
    assert.ok(keys.includes(expected), expected);
  }
});

test('모르는 값은 지어내지 않고 확인 필요로 남는다', () => {
  const facts = intakeFacts(intakeState({ answers: { problem: '돌봄 공백' } }));
  assert.equal(facts.problem, '돌봄 공백');
  assert.equal(facts.audienceCount, UNKNOWN);
  assert.equal(facts.budgetLimit, UNKNOWN);
  // 숫자 칸에 숫자가 없으면 확인 필요로 되돌린다.
  const suspicious = checkNumbers(intakeState({ answers: { audienceCount: '많이' } }));
  assert.equal(suspicious.length, 1);
  assert.equal(suspicious[0].key, 'audienceCount');
});

// ---------- 가입 간소화와 안내 ----------

test('가입 단계는 담당자·기관명·담당자 여부·필수 동의만 받는다', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const pending = app.slice(app.indexOf('function pendingView('), app.indexOf('const CONSENT_TERMS'));
  // 가입 화면에 있는 입력칸.
  for (const field of ['profile-name', 'profile-phone', 'profile-org', 'profile-contact', 'agree-terms', 'agree-privacy']) {
    assert.ok(pending.includes(`id="${field}"`), field);
  }
  // 기관 유형·주소·인력·시설·실적 같은 상세 기관정보는 가입 단계에서 요구하지 않는다.
  for (const later of ['member-orgType', 'member-staff', 'member-facilities', 'member-achievements']) {
    assert.ok(!pending.includes(`id="${later}"`), `${later}는 가입 이후에 받는다`);
  }
  // 내 정보 수정은 접힌 상태로만 함께 놓는다.
  assert.match(pending, /\$\{memberProfileForm\(\)\}/);
  const form = app.slice(app.indexOf('function memberProfileForm()'), app.indexOf('function bindMemberProfile()'));
  assert.match(form, /<details class="card org-details" id="member-profile"/, '처음부터 펼치지 않는다');
});

test('개인정보 열람 안내는 동의한 판만 남기고 기존 계정을 자동 동의로 만들지 않는다', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const account = fs.readFileSync(new URL('../functions/api/account.js', import.meta.url), 'utf8');
  const panel = app.slice(app.indexOf('function privacyNoticePanel()'), app.indexOf('function archiveClaimPanel()'));
  // 최고관리자 열람과 운영관리자 범위를 명확히 적는다.
  assert.match(panel, /최고관리자<\/b>는 이 서비스에 저장된 업무자료를 열람할 수 있습니다/);
  assert.match(panel, /운영관리자<\/b>는 최고관리자가 지정한 회원·자료·기간에 한해서만/);
  assert.match(panel, /비밀번호와 그 해시, 세션키, 소셜 로그인 토큰, 복구코드 원문은/);
  // 회원이 직접 누를 때만 기록한다.
  assert.match(account, /if \(body\.action === 'acknowledgeNotice'\)/);
  assert.match(account, /UPDATE users SET privacy_notice_version = \?, privacy_notice_at = \? WHERE id = \?/);
  // 마이그레이션 기본값은 빈 문자열이다. 기존 계정이 동의한 것으로 보이지 않는다.
  const sql = fs.readFileSync(new URL('../migrations/0013_access_and_assets.sql', import.meta.url), 'utf8');
  assert.match(sql, /privacy_notice_version TEXT NOT NULL DEFAULT ''/);
  assert.ok(!/UPDATE users SET privacy_notice/.test(sql));
});

test('기존 보관자료는 회원이 복구키로 직접 연결할 때만 계정에 붙는다', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const archive = fs.readFileSync(new URL('../functions/api/archive.js', import.meta.url), 'utf8');
  const panel = app.slice(app.indexOf('function archiveClaimPanel()'), app.indexOf('async function agreePrivacyNotice()'));
  assert.match(panel, /이메일이나 기관명이 비슷하다는 이유로 자동 연결되는 일은 없습니다/);
  assert.match(panel, /복구키는 그대로 복구수단으로 남습니다/);
  // 서버는 이 브라우저의 복구키로 보관된, 아직 주인이 없는 자료만 옮긴다.
  assert.match(archive, /if \(body\.action === 'claimMine'\)/);
  const store = fs.readFileSync(new URL('../server/access-store.js', import.meta.url), 'utf8');
  assert.match(store, /WHERE owner_hash = \? AND user_id = ''/);
});
