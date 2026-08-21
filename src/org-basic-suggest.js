// 기본정보 세 칸을 이미 가진 자료에서 제안한다.
//
// 왜. 등록증과 연혁을 올려 실적·기관명·대표자는 채워지는데, 담당자·주로 돕는 대상·강점은
// 여전히 빈칸이다. 그런데 그 답이 이미 올린 자료 안에 있다 — 대표자 이름은 등록증에 있고,
// 누구를 돕는지와 무엇을 잘하는지는 실적 목록에 반복해서 나온다.
//
// 만들어 내지 않는다. 문장을 새로 쓰지 않고 이미 확인된 값과 실적에 적힌 낱말만 골라 잇는다.
// 제안일 뿐이라 회원이 눌러야 칸에 들어가고, 들어간 뒤에도 고쳐 쓸 수 있다.
//
// 연락처는 문서에서 찾지 않는다. 자료에서 전화번호·이메일을 걷어 내는 것이 이 도구의 약속이고
// (stripPersonal), 담당자 연락처는 회원이 「내 정보」에 적어 둔 것에서만 가져온다.

const CONFIRMED = '확인됨';
const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();

// 실적·프로그램에 나오는 대상 낱말. 새로 만들지 않고 문서에 있는 말만 센다.
const AUDIENCE_WORDS = ['아동', '청소년', '학생', '학부모', '가족', '노인', '어르신', '중장년', '청년', '여성', '다문화', '장애', '취약계층', '지역주민', '교사', '유아'];
// 무엇을 하는 기관인지 말해 주는 낱말.
const STRENGTH_WORDS = ['진로', '학습', '상담', '심리', '독서', '문해력', '메타인지', '사회성', '정서', '예방', '교육', '캠프', '검사', 'AI', '돌봄', '자립', '창업', '금융'];

function itemsOf(applicant, area) {
  return (applicant?.items || []).filter(item => item.area === area);
}
function countWords(values, words) {
  const body = values.join(' ');
  return words
    .map(word => ({ word, count: (body.match(new RegExp(word, 'g')) || []).length }))
    .filter(entry => entry.count > 0)
    .sort((left, right) => right.count - left.count);
}

// 담당자. 이름만 넣는다.
//
// 연락처는 넣지 않는다 — 어떤 서류에도 없고, 자료에서 전화번호를 걷어 내는 것이 이 도구의 약속이다.
// 이름은 등록증의 대표자에서 가져온다. 대표자와 담당자가 다른 기관이 많으므로 어디서 온 값인지
// 반드시 화면에 적고, 상태는 「확인 필요」로 둔다.
export function suggestContact(applicant, profile = {}) {
  const representative = itemsOf(applicant, 'basic').find(item => item.label === '대표자' && text(item.value));
  const fromProfile = text(profile.name);
  const name = fromProfile || text(representative?.value);
  if (!name) return null;
  const where = fromProfile ? '내 정보에 적어 두신 이름' : /등록증|고유번호증/.test(text(representative?.source)) ? '사업자등록증의 대표자 이름' : '기관 정보의 대표자 이름';
  return {
    value: name,
    from: [where],
    note: `${where}을 넣었습니다. 실제 담당자가 다르면 고쳐 주세요. 연락처는 서류에 없어 비워 둡니다.`
  };
}

// 발주기관 이름은 대상을 그대로 말한다. 「○○초등학교」는 「학생」이고 「가족센터」는 「가족」이다.
// 낱말을 세는 것보다 강한 근거다. 실제 연혁(99건)에 나온 기관만 적는다 — 목록을 넓히지 않는다.
const ORG_AUDIENCE = [
  [/초등학교|중학교|고등학교|교육지원청|교육청/, '학생'],
  [/지역아동센터|아동센터|애육원/, '아동'],
  [/가족센터|다문화센터/, '가족'],
  [/여성새로일하기센터|여성새일센터|여성인력개발센터/, '여성'],
  [/청년센터|대학교/, '청년'],
  [/자활센터|복지관/, '취약계층'],
  [/어린이집|유치원|유아숲/, '유아'],
  [/보건소|도서관/, '지역주민']
];

// 주로 돕는 대상. 발주기관 이름으로 먼저 세고, 사업명·프로그램 내용의 대상 낱말로 보탠다.
export function suggestServed(applicant) {
  const items = [...itemsOf(applicant, 'performance'), ...itemsOf(applicant, 'programs'), ...itemsOf(applicant, 'clients')];
  if (!items.length) return null;
  // 값에는 기관·사업명이, detail에는 실적표의 「프로그램 내용」 칸이 들어 있다. 둘 다 본다.
  const values = items.map(item => `${text(item.value)} ${text(item.detail)}`.trim());
  const places = new Map();
  for (const item of items) {
    for (const [pattern, audience] of ORG_AUDIENCE) {
      if (!pattern.test(text(item.value))) continue;
      places.set(audience, (places.get(audience) || 0) + 1);
      break;
    }
  }
  const byPlace = [...places.entries()].map(([word, count]) => ({ word, count, unit: '곳' })).sort((left, right) => right.count - left.count);
  const byWord = countWords(values, AUDIENCE_WORDS)
    .filter(entry => !places.has(entry.word))
    .map(entry => ({ ...entry, unit: '회' }));
  const ranked = [...byPlace, ...byWord].sort((left, right) => right.count - left.count).slice(0, 3);
  if (!ranked.length) return null;
  const evidence = `실적·프로그램 ${items.length}건에서 ${ranked.map(entry => `${entry.word} ${entry.count}${entry.unit}`).join(' · ')}`;
  return {
    value: ranked.map(entry => entry.word).join(' · '),
    from: [evidence],
    note: `${evidence}를 세어 뽑았습니다. 발주기관 이름과 프로그램 내용을 함께 보았습니다. 다르면 고쳐 주세요.`
  };
}

// 강점·관련 경험. 반복해서 나오는 사업 낱말과 그 건수만 적는다. 잘한다는 말은 쓰지 않는다.
export function suggestStrength(applicant) {
  const performance = itemsOf(applicant, 'performance').map(item => `${text(item.value)} ${text(item.detail)}`.trim());
  if (!performance.length) return null;
  const ranked = countWords(performance, STRENGTH_WORDS).slice(0, 3);
  if (!ranked.length) return null;
  const evidence = `실적 ${performance.length}건에서 ${ranked.map(entry => `${entry.word} ${entry.count}건`).join(' · ')}`;
  return {
    value: `${ranked.map(entry => `${entry.word} 관련 ${entry.count}건`).join(', ')} (실적 ${performance.length}건 기준)`,
    from: [evidence],
    note: `${evidence}를 세어 적었습니다. 잘한다는 판단이 아니라 건수입니다. 다르면 고쳐 주세요.`
  };
}

export function suggestBasicFields(applicant, profile = {}) {
  return { contact: suggestContact(applicant, profile), served: suggestServed(applicant), strength: suggestStrength(applicant) };
}
