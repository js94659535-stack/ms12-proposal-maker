// 공고문·요강·평가기준에서 「선정 논리」를 구조화한다.
// 규칙 기반 로컬 처리만 사용하며 외부 API를 호출하지 않는다. 공고에 없는 내용을 공식 기준처럼 만들지 않는다.
export const NOTICE_FIELDS = [
  { key: 'purpose', title: '공모 목적', pattern: /사업\s*목적|공모\s*목적|추진\s*목적|목적/ },
  { key: 'problem', title: '해결하려는 문제', pattern: /문제|어려움|위기|결손|취약|필요성|배경/ },
  { key: 'target', title: '핵심 대상', pattern: /대상|참여자|수혜자|이용자|아동|청소년|가족|어르신|청년/ },
  { key: 'eligibility', title: '신청자격', pattern: /신청\s*자격|신청\s*대상|신청\s*유형|지원\s*자격|자격\s*요건|신청\s*가능|수행\s*기관|법인|[가-힣]{2,10}기관에서|기관\s*유형/ },
  { key: 'requiredContent', title: '필수 사업내용', pattern: /필수\s*사업|필수\s*내용|사업\s*내용|지원\s*내용|프로그램\s*내용|과업/ },
  { key: 'submissionItems', title: '필수 제출항목', pattern: /제출\s*서류|제출\s*항목|구비\s*서류|첨부\s*서류|신청\s*서류|제출\s*양식|서식\s*작성|제출하여야|제출해야/ },
  { key: 'periodBudget', title: '사업기간·예산 기준', pattern: /사업\s*기간|수행\s*기간|지원\s*한도|지원\s*금액|사업비|예산|보조율|자부담/ },
  { key: 'evaluation', title: '평가항목·배점', pattern: /평가\s*기준|심사\s*기준|평가\s*항목|배점|심사\s*방법|가점/ },
  { key: 'outcomes', title: '성과 요구', pattern: /성과\s*목표|성과\s*지표|성과\s*관리|정량\s*지표|결과\s*보고|사후\s*관리|평가\s*결과/ },
  { key: 'selectionFactors', title: '선정에 중요한 요소', pattern: /우대|가점|우선\s*선정|중점|권장|필수\s*조건/ },
  { key: 'riskFactors', title: '탈락·감점 위험', pattern: /감점|제외|배제|반려|불가|미충족|결격|불이익|취소/ }
];

const SCORE_PATTERN = /([가-힣A-Za-z·\s()]{2,30}?)\s*[(\[]?\s*(\d{1,3})\s*점\s*[)\]]?/g;
const SENTENCE_SPLIT = /(?<=[.!?。])\s+|\n+/;

function clean(value, max = 500) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function sentencesOf(value) { return String(value || '').split(SENTENCE_SPLIT).map(item => item.trim()).filter(item => item.length > 4); }

// 공고에서 온 자료만 근거로 쓴다. 어떤 자료의 어느 문장인지 함께 남긴다.
export function noticeSources(notice = {}) {
  // 본문을 먼저 보고 제목은 마지막에 본다. 제목 한 줄이 근거가 되는 일을 줄인다.
  const parts = [
    ['공고 개요', notice.overview || notice.detailText],
    ['신청 대상', notice.eligibility],
    ['지원 내용', notice.supportDetails],
    ['지원 한도', notice.supportLimit],
    ['신청 기간', notice.applicationPeriod],
    ['사업 기간', notice.performancePeriod],
    ['첨부한 요강·평가기준', notice.criteriaText],
    ['공고 제목', notice.title]
  ];
  return parts.filter(([, value]) => String(value || '').trim()).map(([label, value]) => ({ label, text: clean(value, 20_000) }));
}

export function extractEvaluationScores(sources) {
  const scoped = sources.filter(source => /평가|심사|배점/.test(source.label) || /평가\s*기준|심사\s*기준|배점/.test(source.text));
  const scores = [];
  for (const source of scoped) {
    for (const match of String(source.text).matchAll(SCORE_PATTERN)) {
      const criterion = clean(match[1], 60).replace(/^[·\-\s]+/, '');
      const points = Number(match[2]);
      if (!criterion || !Number.isFinite(points) || points > 100) continue;
      if (scores.some(item => item.criterion === criterion)) continue;
      scores.push({ criterion, points, source: source.label });
    }
  }
  return scores;
}

// 항목별 구조화. 없으면 만들지 않고 「없음」으로 둔다.
export function analyzeNoticeStructure(notice = {}) {
  const sources = noticeSources(notice);
  const scores = extractEvaluationScores(sources);
  const fields = NOTICE_FIELDS.map(field => {
    const hits = [];
    for (const source of sources) {
      for (const sentence of sentencesOf(source.text)) {
        if (!field.pattern.test(sentence)) continue;
        hits.push({ source: source.label, sentence: clean(sentence, 300) });
        if (hits.length >= 3) break;
      }
      if (hits.length >= 3) break;
    }
    const status = hits.length ? '공식 근거 확인' : '공고에서 확인되지 않음';
    return { key: field.key, title: field.title, status, evidence: hits, value: hits.map(hit => hit.sentence).join(' / ') };
  });
  return {
    noticeTitle: clean(notice.title, 200),
    sources: sources.map(source => ({ label: source.label, chars: source.text.length })),
    totalChars: sources.reduce((sum, source) => sum + source.text.length, 0),
    fields,
    evaluationScores: scores,
    hasOfficialScoring: scores.length > 0,
    // 첨부파일 안에만 있는 기준은 읽지 못했다는 사실을 그대로 남긴다.
    unreadAttachments: (notice.attachments || []).map(item => clean(item.name || item, 120))
  };
}

function fieldOf(structure, key) { return structure.fields.find(field => field.key === key); }
function step(title, field, fallback) {
  const confirmed = field.status === '공식 근거 확인';
  return {
    step: title,
    content: confirmed ? clean(field.value, 300) : `[확인 필요: ${fallback}]`,
    basis: confirmed ? '공고 원문' : '공고에서 확인되지 않음',
    evidence: field.evidence
  };
}

// 공모기관이 해결하려는 문제 → 원하는 사업 방식 → 원하는 기관 역량 → 심사에서 확인할 증거 → 계획서가 보여줘야 할 내용
export function buildSelectionLogic(structure) {
  const chain = [
    step('공모기관이 해결하려는 문제', fieldOf(structure, 'problem'), '공고문에서 문제 인식 문장 확인'),
    step('원하는 사업 방식', fieldOf(structure, 'requiredContent'), '필수 사업내용 확인'),
    step('원하는 신청기관 역량', fieldOf(structure, 'eligibility'), '신청자격·요구 역량 확인'),
    step('심사에서 확인할 증거', structure.hasOfficialScoring
      ? { status: '공식 근거 확인', value: structure.evaluationScores.map(score => `${score.criterion} ${score.points}점`).join(' / '), evidence: [{ source: structure.evaluationScores[0].source, sentence: clean(structure.evaluationScores.map(score => `${score.criterion} ${score.points}점`).join(', '), 300) }] }
      : fieldOf(structure, 'submissionItems'), '평가표·제출서류 확인'),
    step('계획서가 반드시 보여줘야 할 내용', fieldOf(structure, 'outcomes'), '성과 요구 확인')
  ];
  return {
    chain,
    scoring: structure.hasOfficialScoring
      ? { mode: '공식 배점', items: structure.evaluationScores }
      : { mode: '배점 없음', items: [], note: '공식 평가표가 없어 중요도를 점수로 만들지 않습니다.' },
    brokenLinks: chain.filter(item => item.basis !== '공고 원문').map(item => item.step)
  };
}

// 「이 공고에서 선정되려면 무엇을 증명해야 하는가」 5~10개.
export function selectionRequirements(structure) {
  const requirement = (title, field, prove) => {
    const confirmed = field?.status === '공식 근거 확인';
    return {
      title,
      prove: confirmed ? prove : `${prove} (공고에서 확인되지 않아 원문·요강 확인 필요)`,
      basis: confirmed ? '공식 근거' : '확인 필요',
      evidence: confirmed ? field.evidence.slice(0, 2) : []
    };
  };
  const items = [
    requirement('신청자격 충족', fieldOf(structure, 'eligibility'), '공고가 정한 기관 유형·자격 요건을 증빙으로 보여줄 것'),
    requirement('공모 목적과의 정합', fieldOf(structure, 'purpose'), '사업 목적이 공고 목적과 같은 방향임을 보여줄 것'),
    requirement('대상의 적합성', fieldOf(structure, 'target'), '공고가 정한 대상과 같은 대상을 선정 기준과 함께 제시할 것'),
    requirement('필수 사업내용 이행', fieldOf(structure, 'requiredContent'), '공고가 요구한 사업내용을 계획서에 모두 반영할 것'),
    requirement('사업기간·예산 기준 준수', fieldOf(structure, 'periodBudget'), '기간·지원한도·자부담 조건에 맞는 예산을 제시할 것'),
    requirement('성과 요구 대응', fieldOf(structure, 'outcomes'), '공고가 요구한 성과와 측정 방법을 제시할 것'),
    requirement('필수 제출항목 완비', fieldOf(structure, 'submissionItems'), '요구된 서식·서류를 빠짐없이 제출할 것'),
    requirement('탈락·감점 위험 회피', fieldOf(structure, 'riskFactors'), '제외·감점 조건에 해당하지 않음을 확인할 것')
  ];
  if (structure.hasOfficialScoring) {
    items.unshift({
      title: `공식 평가항목 대응 (${structure.evaluationScores.length}개 항목)`,
      prove: structure.evaluationScores.map(score => `${score.criterion}(${score.points}점)`).join(' · '),
      basis: '공식 근거',
      evidence: [{ source: structure.evaluationScores[0].source, sentence: '공고·요강에 명시된 배점' }]
    });
  }
  const extra = fieldOf(structure, 'selectionFactors');
  if (extra?.status === '공식 근거 확인') items.push(requirement('우대·가점 요소 확보', extra, '공고가 밝힌 우대·가점 조건을 충족함을 보여줄 것'));
  return items.slice(0, 10);
}

export function noticeLogicSummary(structure, logic, requirements) {
  return {
    confirmedFields: structure.fields.filter(field => field.status === '공식 근거 확인').length,
    missingFields: structure.fields.filter(field => field.status !== '공식 근거 확인').map(field => field.title),
    scoringMode: logic.scoring.mode,
    officialRequirements: requirements.filter(item => item.basis === '공식 근거').length,
    checkRequirements: requirements.filter(item => item.basis !== '공식 근거').length,
    unreadAttachments: structure.unreadAttachments
  };
}
