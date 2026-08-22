// 처음 오는 사람에게 기관정보 10개 영역을 다 적게 하면 계획서를 쓰기도 전에 지친다.
// 그래서 시작에 필요한 것만 다섯 가지 받는다. 나머지는 초안을 만든 뒤 꼭 필요할 때만 묻는다.
//
// 대신 한 가지는 절대 양보하지 않는다. 적지 않은 기관명·실적·인력·연락처·시설은 만들어 내지 않는다.
// 모르는 자리는 [확인 필요: 항목]으로 남긴다.

export const UNKNOWN_PREFIX = '[확인 필요';

// 처음 받는 다섯 가지. 이것만 있으면 초안을 시작한다.
export const QUICK_FIELDS = Object.freeze([
  { key: 'orgName', label: '기관명', required: true, hint: '예: 햇살지역아동센터' },
  { key: 'orgType', label: '기관 유형', required: true, hint: '아래에서 고르세요', choices: true },
  { key: 'contact', label: '담당자 이름과 연락처', required: true, hint: '예: 김담당 010-0000-0000' },
  { key: 'served', label: '주로 돕는 대상', required: false, hint: '한두 문장이면 됩니다' },
  { key: 'strength', label: '강점이나 관련 경험', required: false, hint: '없거나 모르겠으면 건너뛰어도 됩니다' }
]);

// 고를 수 있는 기관 유형.
//
// 아홉 가지에 영리법인이 없었다. 등록증에서 「(주)마인드스토리」를 읽어 놓고도 고를 칸이 없어
// 「기타」로 떨어졌다(22-53①). 두 줄만 더한다 — 사업자등록증에 찍히는 형태는 사실상 이 둘이다.
// 목록을 넓히지 않는 까닭: 고를 것이 열다섯이 넘으면 고르는 일 자체가 일이 된다.
export const ORG_TYPES = Object.freeze([
  '지역아동센터', '사회복지관', '가족센터', '학교', '유치원·어린이집',
  '비영리단체(NPO)', '사회적협동조합', '사단·재단법인', '주식회사', '개인사업자', '기타'
]);

// 등록증에서 읽은 값으로 기관 유형을 고른다.
//
// 왜 목록 바로 옆인가. 목록과 고르는 규칙이 떨어져 있으면 목록에 한 줄을 더할 때 규칙 고치는 것을
// 잊는다. 이 파일 한 곳만 보면 「무엇을 고를 수 있고 무엇으로 고르는지」가 다 보인다.
//
// 짐작하지 않는다. 기관 이름이나 법인 유형 칸에 형태가 글자로 찍혀 있을 때만 고른다.
// 「(주)마인드스토리」의 「(주)」가 그것이다. 고른 값도 확정이 아니다 — 상태는 「확인 필요」로 남고
// 화면에 어디서 골랐는지 적어 회원이 바꿀 수 있다.
//
// 순서가 뜻을 갖는다. 시설 이름이 먼저다 — 「사회복지법인 ○○사회복지관」은 법인 형태보다
// 「사회복지관」이 계획서에 쓸모 있는 답이다. 형태만 찍힌 이름은 아래로 내려가 걸린다.
const ORG_TYPE_MARKS = Object.freeze([
  [/지역아동센터/, '지역아동센터'],
  [/사회복지관|종합복지관|노인복지관|장애인복지관/, '사회복지관'],
  [/가족센터|건강가정지원센터|다문화가족지원센터/, '가족센터'],
  [/어린이집|유치원/, '유치원·어린이집'],
  [/초등학교|중학교|고등학교|대학교|학교/, '학교'],
  [/사회적협동조합|협동조합/, '사회적협동조합'],
  [/주식회사|유한회사|유한책임회사|합자회사|합명회사|(?:^|[\s(（[])(?:주|㈜)[)）\]]|^㈜/, '주식회사'],
  [/개인\s*사업자/, '개인사업자'],
  [/사단법인|재단법인|사회복지법인|학교법인|의료법인|(?:^|[\s(（[])[사재][)）\]]/, '사단·재단법인'],
  [/비영리\s*민간단체|비영리\s*단체|NPO/i, '비영리단체(NPO)']
]);

export function orgTypeFromRegistration({ orgName = '', legalType = '' } = {}) {
  const name = String(orgName ?? '').replace(/\s+/g, ' ').trim();
  const legal = String(legalType ?? '').replace(/\s+/g, ' ').trim();
  if (!name && !legal) return null;
  for (const [pattern, type] of ORG_TYPE_MARKS) {
    // 법인 유형 칸을 먼저 본다. 관청이 직접 적어 둔 값이라 이름보다 확실하다.
    const where = pattern.test(legal) ? '법인 유형' : pattern.test(name) ? '기관명' : '';
    if (!where) continue;
    const source = where === '법인 유형' ? legal : name;
    return { value: type, from: where, matched: (source.match(pattern) || [source])[0].trim() };
  }
  return null;
}

// 초안을 시작할 수 있는지. 이름·유형·담당자만 있으면 시작한다.
export function readyToDraft(value = {}) {
  const missing = QUICK_FIELDS.filter(field => field.required && !String(value[field.key] ?? '').trim());
  return { ready: missing.length === 0, missing: missing.map(field => field.label) };
}

// 계획서에 쓸 사실. 적지 않은 것은 비워 두지 않고 [확인 필요]로 표시한다.
// 이 표시가 있으면 뒷단계 사실검증기가 그 문장을 근거 없는 주장으로 잡아낸다.
export function quickFacts(value = {}) {
  const text = key => String(value[key] ?? '').trim();
  return {
    orgName: text('orgName') || `${UNKNOWN_PREFIX}: 기관명]`,
    orgType: text('orgType') || `${UNKNOWN_PREFIX}: 기관 유형]`,
    contact: text('contact') || `${UNKNOWN_PREFIX}: 담당자 연락처]`,
    served: text('served') || `${UNKNOWN_PREFIX}: 주요 대상]`,
    strength: text('strength') || `${UNKNOWN_PREFIX}: 기관 강점·경험]`,
    // 처음에는 묻지 않는 것들. 초안에서는 언제나 확인 필요로 남는다.
    staff: `${UNKNOWN_PREFIX}: 수행인력]`,
    facilities: `${UNKNOWN_PREFIX}: 시설·장비]`,
    partners: `${UNKNOWN_PREFIX}: 협력기관]`,
    performance: `${UNKNOWN_PREFIX}: 사업실적]`,
    budget: `${UNKNOWN_PREFIX}: 예산 규모]`
  };
}

// 간단 입력을 신청기관 항목으로 옮긴다. 적은 것만 옮기고, 상태는 회원이 확인해야 확정된다.
//
// filledFrom은 그 칸을 자동으로 채웠을 때 어디서 가져왔는지다(src/org-basic-suggest.js의 note).
// 자동으로 넣은 값에 「간단 입력(회원 작성)」이라고 적으면 나중에 그 값을 되짚을 수 없고,
// 확인해 달라는 부탁도 근거 없는 말이 된다. 출처를 그대로 옮겨 적는다(22-53②).
export function quickToApplicantItems(value = {}, filledFrom = {}) {
  const map = [
    ['orgName', 'basic', '기관명'], ['orgType', 'basic', '기관 유형'], ['contact', 'basic', '담당자'],
    ['served', 'basic', '주로 돕는 대상'], ['strength', 'programs', '강점·관련 경험']
  ];
  return map
    .map(([key, area, label]) => ({ key, area, label, value: String(value[key] ?? '').trim() }))
    .filter(item => item.value)
    .map(({ key, ...item }) => {
      const from = String(filledFrom?.[key] ?? '').trim();
      return { ...item, status: '확인 필요', source: from || '간단 입력(회원 작성)', origin: from ? '파일 추출' : '고객 입력' };
    });
}

// 초안을 만든 뒤 정말 필요한 것만 묻는다. 공고가 요구하는 것 위주로 고른다.
// 한 번에 세 개까지만. 물어볼 게 없으면 묻지 않는다.
export const FOLLOW_UP = Object.freeze([
  { key: 'staff', label: '이 사업을 맡을 사람', when: /인력|담당자|수행\s*인력|전담/, ask: '이 사업을 맡을 분은 몇 명이고 어떤 자격이 있나요?' },
  { key: 'facilities', label: '사업을 진행할 공간', when: /공간|시설|장소|장비/, ask: '어디에서 진행하나요? 쓸 수 있는 공간이나 장비를 적어 주세요.' },
  { key: 'performance', label: '비슷한 사업 경험', when: /실적|경험|수행\s*이력|성과/, ask: '비슷한 사업을 해 본 적이 있으면 연도와 규모를 적어 주세요.' },
  { key: 'partners', label: '함께할 기관', when: /협력|협약|연계|컨소시엄/, ask: '함께할 기관이 있나요? 없으면 없다고 적어 주세요.' },
  { key: 'budget', label: '예산 규모', when: /예산|자부담|사업비|matching/i, ask: '자부담이 가능한가요? 가능하면 대략 얼마인가요?' }
]);

// 공고가 실제로 요구하는 것 중, 아직 답하지 않은 것만 고른다.
export function followUpQuestions({ noticeText = '', answers = {}, limit = 3 } = {}) {
  const text = String(noticeText || '');
  return FOLLOW_UP
    .filter(item => !String(answers[item.key] ?? '').trim())
    .filter(item => item.when.test(text))
    .slice(0, limit)
    .map(item => ({ key: item.key, label: item.label, ask: item.ask }));
}
