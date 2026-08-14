// 「무엇이 없어서 어디가 미진한지」를 계획서 첫머리에 알려 준다.
//
// 값이 없다고 작성을 멈추지 않는다. 없는 자리는 [확인 필요]로 두고 끝까지 만든 다음,
// 어떤 기관 자료가 없어서 어느 항목이 얇아졌는지, 무엇을 채우면 되는지를 앞에 붙인다.
//
// 두 가지는 지키지 않으면 해가 된다.
// 1. 이 안내는 내부용이다. 제출본에는 넣지 않는다. 심사자에게 약점을 광고할 이유가 없다.
// 2. 금액을 지어내지 않는다. 단가가 없으면 「필요 자료 수·예상 입력 시간」까지만 적는다.

const MARK = /\[확인 필요(?::\s*([^\]]*))?\]/g;

// 부족한 자료를 사람이 쓰는 말로 묶는다. 화면의 [확인 필요] 분류와 같은 갈래를 쓴다.
const TOPICS = [
  { key: 'staff', label: '수행 인력', test: /(인력|담당|직원|자격|채용|배치)/ },
  { key: 'performance', label: '기관 실적', test: /(실적|경험|수행 이력|사업 수행)/ },
  { key: 'budget', label: '예산 근거', test: /(예산|사업비|금액|단가|산출)/ },
  { key: 'clients', label: '이용자·대상 규모', test: /(인원|대상자|참여자|가정 수|명)/ },
  { key: 'schedule', label: '회기·일정', test: /(회기|차시|일정|주기|횟수|기간)/ },
  { key: 'facilities', label: '시설·장비', test: /(시설|공간|장소|장비|차량)/ },
  { key: 'partners', label: '협력기관', test: /(협력|연계|협약|기관명)/ },
  { key: 'measurement', label: '성과지표·측정도구', test: /(지표|측정|척도|목표값|성과)/ }
];

const text = value => String(value ?? '');
const topicOf = phrase => TOPICS.find(topic => topic.test.test(phrase))?.label || '기타 확인 항목';

// 본문에 남은 [확인 필요]를 항목별·주제별로 센다.
export function openMarksByTopic(sections = []) {
  const byTopic = new Map();
  for (const section of sections) {
    const body = text(section?.content);
    for (const match of body.matchAll(MARK)) {
      const hint = text(match[1]).trim();
      const around = body.slice(Math.max(0, match.index - 30), match.index + 40);
      const label = topicOf(`${hint} ${around}`);
      const entry = byTopic.get(label) || { topic: label, count: 0, sections: new Set() };
      entry.count += 1;
      entry.sections.add(text(section?.title || section?.id));
      byTopic.set(label, entry);
    }
  }
  return [...byTopic.values()]
    .map(entry => ({ topic: entry.topic, count: entry.count, sections: [...entry.sections] }))
    .sort((left, right) => right.count - left.count);
}

// 설계가 못 박지 못한 기준값. 값 자리에 [확인 필요]가 남아 있으면 아직 정해지지 않은 것이다.
export function openBaselineValues(master) {
  return (master?.masterLogic?.baselineValues || [])
    .filter(item => /\[확인 필요/.test(text(item?.value)))
    .map(item => ({ item: text(item.item), value: text(item.value) }));
}

// 항목이 목표 분량에 얼마나 못 미치는지. 자료가 없어 얇아진 자리를 찾는 데 쓴다.
export function thinSections(sections = [], { floor = 500 } = {}) {
  return sections
    .map(section => ({ title: text(section?.title || section?.id), chars: text(section?.content).length }))
    .filter(section => section.chars > 0 && section.chars < floor)
    .sort((left, right) => left.chars - right.chars);
}

// 채우는 데 드는 품. 금액은 단가가 있을 때만 적는다. 없으면 계산 불가로 남긴다.
export const MINUTES_PER_ITEM = 3;
export function effortEstimate(gapCount, { rewriteNeeded = true, priced = false, unitCostUsd = 0 } = {}) {
  const minutes = gapCount * MINUTES_PER_ITEM;
  return {
    items: gapCount,
    minutes,
    // 값을 채운 뒤에는 그 값을 반영해 다시 쓰는 호출이 한 번 필요하다.
    rewrites: rewriteNeeded && gapCount > 0 ? 1 : 0,
    cost: priced ? `$${(Number(unitCostUsd) || 0).toFixed(2)}` : '계산 불가(단가 미설정)'
  };
}

// 계획서 첫머리에 붙일 보완 안내. 내부용이며 제출본에는 넣지 않는다.
export function gapReport({ sections = [], master = null, orgAreas = [] } = {}) {
  const topics = openMarksByTopic(sections);
  const baseline = openBaselineValues(master);
  const thin = thinSections(sections);
  const emptyAreas = (orgAreas || []).filter(area => Number(area?.total || 0) === 0).map(area => text(area.title));
  const total = topics.reduce((sum, item) => sum + item.count, 0);
  return {
    internalOnly: true,
    total,
    topics,
    baseline,
    thin,
    emptyAreas,
    // 한 줄 요약. 무엇이 없어서 어디가 얇아졌는지 그대로 적는다.
    headline: total === 0 && !baseline.length
      ? '확인이 필요한 값이 남아 있지 않습니다. 기관 자료로 채울 자리가 없습니다.'
      : `기관 자료가 없어 확인이 필요한 자리가 ${total}곳 남았습니다${baseline.length ? ` · 설계 기준값 ${baseline.length}개가 아직 정해지지 않았습니다` : ''}.`,
    effort: effortEstimate(total + baseline.length)
  };
}

// 검토본 문서 맨 앞에 넣을 문단. 제출본에서는 이 함수를 부르지 않는다.
export function gapCoverSection(report) {
  if (!report || (!report.total && !report.baseline.length)) return null;
  const lines = [
    report.headline,
    '',
    ...(report.topics.length ? ['[부족한 기관 자료]', ...report.topics.map(item => `· ${item.topic} ${item.count}곳 — ${item.sections.slice(0, 3).join(' / ')}`)] : []),
    ...(report.baseline.length ? ['', '[아직 정해지지 않은 기준값]', ...report.baseline.map(item => `· ${item.item}`)] : []),
    ...(report.thin.length ? ['', '[자료가 없어 짧게 남은 항목]', ...report.thin.map(item => `· ${item.title} ${item.chars.toLocaleString('ko-KR')}자`)] : []),
    ...(report.emptyAreas.length ? ['', '[비어 있는 기관정보]', `· ${report.emptyAreas.join(' · ')}`] : []),
    '',
    `[채우는 데 드는 품] 확인할 항목 ${report.effort.items}개 · 예상 입력 ${report.effort.minutes}분(항목당 ${MINUTES_PER_ITEM}분 기준) · 값을 넣은 뒤 AI 재작성 ${report.effort.rewrites}회 · 대행 비용 ${report.effort.cost}`,
    '이 안내는 내부 검토용입니다. 제출본에는 포함되지 않습니다.'
  ];
  return { id: 'gap-notice', title: '보완 안내 (내부용 · 제출본 미포함)', content: lines.join('\n') };
}
