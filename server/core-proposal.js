// 「MS12 핵심제안서」. 제출처와 희망 페이지 수에 맞춰 구조를 먼저 설계하고 그 구조대로 본문을 만든다.
// 공모사업계획서(전체 계획서)와는 다른 기능이다. 이쪽은 제안서 한 부를 짧게 완성한다.

export const CORE_PROPOSAL_LABEL = '핵심제안서';
export const MIN_PAGES = 1;
export const MAX_PAGES = 20;
// 아이디어를 실제로 적게 한다. 한 줄도 안 적으면 지어내는 수밖에 없다.
export const MIN_IDEA_CHARS = 20;
export const MAX_IDEA_CHARS = 3_000;
export const MAX_PROPOSER_CHARS = 2_000;
export const MAX_PURPOSE_CHARS = 1_000;
export const MAX_RECIPIENT_CHARS = 200;
export const MAX_SOURCE_CHARS = 20_000;
// A4 한 쪽에 들어가는 본문 글자 수. 제목·표·여백을 뺀 실제 본문 기준으로 잡았다.
export const CHARS_PER_PAGE = 1_400;

// 제안서에 들어갈 수 있는 항목. 위에 있을수록 의사결정에 먼저 필요한 내용이다.
// 분량이 짧으면 위에서부터 남기고, 길면 아래로 넓혀 간다.
const BACKBONE = [
  ['overview', '제안 개요', 3],
  ['need', '배경과 필요성', 3],
  ['idea', '핵심 제안 내용', 4],
  ['effect', '기대효과', 3],
  ['method', '추진 방법과 핵심 활동', 3],
  ['target', '대상과 범위', 2],
  ['schedule', '추진 일정', 2],
  ['organization', '수행 체계와 역할', 2],
  ['budget', '예산 방향', 2],
  ['indicators', '성과지표와 측정', 2],
  ['risk', '위험과 대응', 2],
  ['ask', '요청 사항', 1]
];
const BACKBONE_KEYS = BACKBONE.map(([key]) => key);
const TITLES = new Map(BACKBONE.map(([key, title]) => [key, title]));
const WEIGHTS = new Map(BACKBONE.map(([key, , weight]) => [key, weight]));

// 제출처에 따라 무엇을 앞세우고 어떤 이름으로 부를지 달라진다.
export const AUDIENCES = {
  public: {
    label: '관공서·공공기관',
    emphasis: ['공익성', '정책 연계', '실행체계', '예산', '성과'],
    lead: ['need', 'idea', 'effect', 'organization', 'budget', 'indicators'],
    rename: { effect: '공익성과 정책 연계 효과', organization: '실행체계와 역할 분담', ask: '행정 협조 요청' },
    guide: '제안이 어떤 공익 목적에 닿는지, 상위 정책·계획과 어떻게 이어지는지 먼저 밝힌다. 실행체계·예산·성과를 검증 가능한 형태로 적는다.'
  },
  company: {
    label: '기업',
    emphasis: ['기대효과', '차별성', '비용 대비 가치', '협력방식'],
    lead: ['idea', 'effect', 'method', 'budget', 'organization'],
    rename: { effect: '기대효과와 차별성', budget: '비용 대비 가치', organization: '협력방식과 역할', ask: '협력 제안' },
    guide: '무엇이 다른지와 상대 기업이 얻는 값을 앞세운다. 비용 대비 가치와 협력 방식을 구체적으로 적는다. 공익 명분보다 실익을 먼저 쓴다.'
  },
  foundation: {
    label: '재단·복지기관',
    emphasis: ['대상자의 필요', '사회적 가치', '성과', '지속가능성'],
    lead: ['need', 'target', 'idea', 'effect', 'indicators', 'risk'],
    rename: { need: '대상자의 필요와 배경', effect: '사회적 가치와 기대효과', risk: '지속가능성과 위험 대응' },
    guide: '누가 무엇이 없어서 어려운지를 대상자 관점에서 먼저 적는다. 사업이 끝난 뒤에도 이어지는 방법(지속가능성)을 반드시 담는다.'
  },
  school: {
    label: '학교·교육기관',
    emphasis: ['대상', '교육목표', '운영과정', '안전', '기대효과'],
    lead: ['target', 'idea', 'method', 'schedule', 'risk', 'effect'],
    rename: { idea: '교육목표와 프로그램', method: '운영과정과 진행 방법', risk: '안전관리와 위험 대응' },
    guide: '학년·인원 같은 대상을 먼저 확정하고 교육목표를 명확히 적는다. 회기별 운영과정과 안전관리는 빠뜨리지 않는다.'
  },
  internal: {
    label: '내부보고',
    emphasis: ['필요성', '효율성', '실행 가능성', '의사결정 요청'],
    lead: ['need', 'idea', 'effect', 'method', 'ask'],
    rename: { effect: '기대 효율과 효과', method: '실행 방안과 실행 가능성', ask: '의사결정 요청 사항' },
    guide: '결재자가 무엇을 결정해야 하는지 마지막에 분명히 적는다. 미사여구를 빼고 필요성·효율·실행 가능성만 남긴다.'
  },
  other: {
    label: '기타',
    emphasis: [],
    lead: ['idea', 'need', 'effect', 'method'],
    rename: {},
    guide: '사용자가 적은 제안 목적과 받는 사람을 기준으로 구성한다. 정해진 틀을 억지로 적용하지 않는다.'
  }
};
export const AUDIENCE_KEYS = Object.keys(AUDIENCES);
export const audienceOf = value => AUDIENCES[value] || AUDIENCES.other;

// 희망 페이지 수에 맞춰 항목 수를 정한다. 쪽이 늘수록 아래쪽 항목까지 펼친다.
export function sectionCountFor(pages) {
  return Math.min(BACKBONE.length, Math.max(4, 3 + Math.round(pages * 1.2)));
}

// 페이지별 구성안. 어떤 항목을 몇 번째 쪽에 몇 글자로 쓸지 미리 정한다.
export function planPages({ pages, audienceType }) {
  const total = Math.min(Math.max(Math.round(pages) || MIN_PAGES, MIN_PAGES), MAX_PAGES);
  const audience = audienceOf(audienceType);
  // 개요는 언제나 맨 앞. 그다음은 제출처가 앞세우는 항목, 나머지는 기본 차례대로.
  const ordered = [...new Set(['overview', ...audience.lead, ...BACKBONE_KEYS])].filter(key => BACKBONE_KEYS.includes(key));
  const keys = ordered.slice(0, sectionCountFor(total));
  const weightSum = keys.reduce((sum, key) => sum + (WEIGHTS.get(key) || 1), 0);
  const budget = total * CHARS_PER_PAGE;

  let used = 0;
  const sections = keys.map(key => {
    const chars = Math.max(200, Math.round(budget * (WEIGHTS.get(key) || 1) / weightSum));
    const section = { key, title: audience.rename[key] || TITLES.get(key), chars, page: Math.min(total, Math.floor(used / CHARS_PER_PAGE) + 1) };
    used += chars;
    return section;
  });

  // 표는 분량이 있을 때만 넣는다. 한 쪽짜리 제안서에 표를 넣으면 본문이 사라진다.
  const tableSlots = total >= 5 ? 3 : total >= 3 ? 2 : total >= 2 ? 1 : 0;
  const pageList = Array.from({ length: total }, (_, index) => ({
    page: index + 1,
    sections: sections.filter(section => section.page === index + 1).map(section => section.title)
  }));
  return { pages: total, charsPerPage: CHARS_PER_PAGE, totalChars: used, sections, pageList, tableSlots, audience };
}

// 첫 단계 입력 검사. 문제가 없으면 다듬은 값을, 있으면 사유를 돌려준다.
export function validateCoreProposalInput(payload = {}) {
  const text = (value, max) => String(value ?? '').trim().slice(0, max);
  const coreIdea = text(payload.coreIdea, MAX_IDEA_CHARS);
  if (coreIdea.length < MIN_IDEA_CHARS) return { error: `핵심 아이디어를 ${MIN_IDEA_CHARS}자 이상 적어 주세요. 무엇을 하려는지가 있어야 제안서를 만들 수 있습니다.` };

  const raw = payload.targetPages;
  const pages = Number(raw);
  if (raw === '' || raw === null || raw === undefined || !Number.isFinite(pages) || !Number.isInteger(pages)) {
    return { error: `희망 페이지 수를 ${MIN_PAGES}~${MAX_PAGES} 사이 숫자로 적어 주세요.` };
  }
  if (pages < MIN_PAGES || pages > MAX_PAGES) return { error: `희망 페이지 수는 ${MIN_PAGES}쪽 이상 ${MAX_PAGES}쪽 이하로 적어 주세요.` };

  const audienceType = AUDIENCE_KEYS.includes(payload.audienceType) ? payload.audienceType : '';
  if (!audienceType) return { error: '제출처 유형을 골라 주세요.' };

  return {
    value: {
      coreIdea, targetPages: pages, audienceType,
      proposer: text(payload.proposer, MAX_PROPOSER_CHARS),
      purpose: text(payload.purpose, MAX_PURPOSE_CHARS),
      recipient: text(payload.recipient, MAX_RECIPIENT_CHARS),
      sourceText: text(payload.sourceText, MAX_SOURCE_CHARS)
    }
  };
}

// 쪽수에 맞춰 출력 토큰 상한을 정한다. 짧은 제안서에 큰 상한을 주지 않는다.
export const outputTokensFor = pages => Math.min(16_000, 1_200 + Math.max(pages, MIN_PAGES) * 1_600);
