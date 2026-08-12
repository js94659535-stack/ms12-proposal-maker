// 모아 온 게시물이 「우리가 제안할 수 있는 것」인지 가른다.
//
// 제목만 보고 정하지 않는다. 제목으로 걸러 낸 뒤 상세 본문과 신청자격을 함께 보고,
// 그래도 애매하면 확정하지 않고 「분류 확인 필요」로 둔다. AI는 쓰지 않는다.
// 규칙으로 판단하므로 왜 그렇게 분류됐는지 항상 말할 수 있다.

export const FITNESS = Object.freeze({
  proposal: 'proposal',       // 제안·지원 가능 — 공모·지원사업
  bid: 'bid',                 // 입찰·위탁 참여 가능
  briefing: 'briefing',       // 설명회·신청안내
  result: 'result',           // 선정결과
  hiring: 'hiring',           // 채용
  participant: 'participant', // 이용자·참여자 모집
  goods: 'goods',             // 물품·공사
  unknown: 'unknown'          // 분류 확인 필요
});

export const FITNESS_LABELS = Object.freeze({
  proposal: '제안·지원 가능', bid: '입찰·위탁 참여 가능', briefing: '설명회·신청안내',
  result: '선정결과', hiring: '채용', participant: '이용자·참여자 모집',
  goods: '물품·공사', unknown: '분류 확인 필요'
});

// 기본 공모검색에 내보내는 분류. 나머지는 별도 분류로만 남는다.
export const SEARCHABLE = Object.freeze([FITNESS.proposal, FITNESS.bid]);

// 앞의 규칙이 먼저 이긴다. 결과·채용처럼 확실한 것부터 걸러 낸다.
const RULES = [
  { fitness: FITNESS.result, pattern: /선정\s*(?:결과|기관|단체|내역)|심사\s*결과|결과\s*발표|낙찰\s*(?:자|결과)|우선협상대상자|계약\s*체결|개찰\s*결과|최종\s*선정/ },
  { fitness: FITNESS.hiring, pattern: /채용|초빙|모집\s*공고\s*\(?\s*직원|인턴\s*모집|계약직\s*모집|공무직\s*채용|임용|합격자?\s*발표|면접\s*안내/ },
  { fitness: FITNESS.goods, pattern: /물품\s*(?:구매|구입|납품)|시설\s*공사|공사\s*입찰|장비\s*구매|자재\s*구매|리모델링|증축|개보수|印刷|인쇄물\s*제작/ },
  { fitness: FITNESS.briefing, pattern: /설명회|사전\s*규격|사전규격|규격\s*공개|의견\s*조회|신청\s*안내|접수\s*안내|작성\s*요령|서식\s*안내|양식\s*안내|가이드\s*북|안내\s*자료/ },
  { fitness: FITNESS.participant, pattern: /참여자\s*모집|이용자\s*모집|수강생\s*모집|교육생\s*모집|참가자\s*모집|참가\s*신청|수강\s*신청|체험단|서포터즈|자원봉사자\s*모집|후원자\s*모집/ },
  { fitness: FITNESS.bid, pattern: /입찰\s*공고|용역\s*입찰|제안\s*요청서|RFP|위탁\s*운영|운영\s*위탁|수탁\s*기관\s*(?:모집|공모)|경쟁\s*입찰|협상에\s*의한\s*계약/ },
  { fitness: FITNESS.proposal, pattern: /공모|지원\s*사업|배분\s*사업|사업\s*신청|신청\s*접수|공모\s*사업|지원\s*신청|사업\s*공고|프로그램\s*공모|기금\s*지원/ }
];

// 「제안 가능」으로 보려면 이런 말이 하나라도 있어야 한다. 없으면 확정하지 않는다.
const APPLICANT_HINT = /신청\s*(?:자격|대상|기관|방법)|지원\s*(?:자격|대상)|공모\s*대상|수행\s*기관|참여\s*기관|비영리|법인|단체|기관/;
// 우리가 제안할 수 있는 일의 성격.
const SERVICE_HINT = /용역|운영|프로그램|교육|상담|사업\s*수행|위탁|컨설팅|캠페인/;

const norm = value => String(value ?? '').normalize('NFKC');

// 제목만으로 내린 1차 판정. 상세를 읽기 전 단계다.
export function classifyTitle(title) {
  const value = norm(title);
  if (!value.trim()) return { fitness: FITNESS.unknown, reason: '제목이 없습니다.' };
  for (const rule of RULES) {
    const hit = rule.pattern.exec(value);
    if (hit) return { fitness: rule.fitness, reason: `제목의 「${hit[0].trim()}」` };
  }
  return { fitness: FITNESS.unknown, reason: '제목에서 분류 근거를 찾지 못했습니다.' };
}

// 상세 본문까지 보고 내리는 최종 판정.
// 제목 판정이 「제안 가능」이어도 본문에 신청자격이 없으면 확정하지 않는다.
export function classifyNotice({ title = '', body = '', eligibility = '', sourceKind = '' } = {}) {
  const head = classifyTitle(title);
  const text = norm(`${title}\n${eligibility}\n${body}`);

  // 본문은 제목을 확인하는 데 쓴다. 제목이 이미 「공고·신청안내」라고 말하는데
  // 본문 어딘가에 「선정결과」가 있다는 이유로 결과로 바꾸지 않는다.
  // 게시판 상세 페이지에는 다른 글 목록이 함께 실려 있어 그 말이 거의 언제나 섞여 든다.
  if (head.fitness === FITNESS.unknown) {
    for (const rule of RULES.slice(0, 3)) {
      const hit = rule.pattern.exec(text);
      if (hit) return { fitness: rule.fitness, reason: `본문의 「${hit[0].trim()}」`, confirmed: true };
    }
  }

  if (head.fitness === FITNESS.proposal || head.fitness === FITNESS.bid) {
    // 본문을 읽지 못했으면 확정하지 않는다. 제목만 보고 확정하지 말라는 규칙이다.
    if (!body.trim()) return { fitness: FITNESS.unknown, reason: '상세 본문을 읽지 못해 확정하지 않았습니다.', confirmed: false };
    if (!APPLICANT_HINT.test(text)) return { fitness: FITNESS.unknown, reason: '신청자격·신청대상을 찾지 못했습니다.', confirmed: false };
    if (head.fitness === FITNESS.bid && !SERVICE_HINT.test(text)) {
      return { fitness: FITNESS.unknown, reason: '용역·운영 성격을 확인하지 못했습니다.', confirmed: false };
    }
    return { fitness: head.fitness, reason: head.reason, confirmed: true };
  }

  // 입찰공고 게시판에서 온 글인데 제목으로 못 가른 경우. 게시판 성격을 근거로 삼되 확정하지 않는다.
  if (head.fitness === FITNESS.unknown && sourceKind === 'bid-board') {
    return { fitness: FITNESS.unknown, reason: '입찰공고 게시판이지만 제목·본문에서 성격을 확정하지 못했습니다.', confirmed: false };
  }
  return { ...head, confirmed: head.fitness !== FITNESS.unknown };
}

// 기본 공모검색에 내보낼지.
export const searchable = fitness => SEARCHABLE.includes(fitness);

// 제외 사유별로 세기 위한 이름표.
export function skipLabel(fitness) {
  return FITNESS_LABELS[fitness] || FITNESS_LABELS.unknown;
}
