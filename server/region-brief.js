// 「지역 현황」 문단을 AI에게 쓰게 한다. 조사표에 채운 값만 근거로 쓴다.
//
// 이 기능의 위험은 하나뿐이다 — AI가 없는 통계를 지어내는 것.
// 계획서에 들어간 가짜 숫자는 심사에서 확인되면 그 자리에서 신뢰를 잃는다.
// 그래서 규칙을 스키마와 프롬프트 양쪽에 건다.
//   1. 조사표에 있는 값만 쓴다. 그 값을 쓸 때는 어느 지표를 썼는지 함께 적는다.
//   2. 조사표에 없는 수치는 문장에 넣지 않는다. 자리를 [확인 필요]로 남긴다.
//   3. 다 쓴 뒤, 문장에 나온 숫자가 조사표에 있는 값인지 코드가 다시 대조한다.

import { INDICATORS, derivedFigures, filledIndicators, openIndicators } from './region-indicators.js';

export const REGION_BRIEF_ACTION = 'regionBrief';
export const OUTPUT_TOKENS = 4_000;

export const REGION_BRIEF_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['paragraphs', 'openItems', 'usedIndicators'],
  properties: {
    paragraphs: {
      type: 'array',
      description: '지역 현황 문단. 3개에서 5개까지.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['heading', 'text', 'basis'],
        properties: {
          heading: { type: 'string', description: '문단 소제목. 20자까지.' },
          text: { type: 'string', description: '문단 본문. 조사표에 없는 수치는 넣지 말고 [확인 필요]로 남긴다.' },
          basis: {
            type: 'array', description: '이 문단이 쓴 조사표 지표의 key. 값을 쓰지 않았으면 빈 배열.',
            items: { type: 'string' }
          }
        }
      }
    },
    openItems: {
      type: 'array', description: '이 문단을 완성하려면 아직 받아야 하는 값. 조사표에서 비어 있는 것만.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['what', 'where'],
        properties: {
          what: { type: 'string', description: '받아야 하는 값' },
          where: { type: 'string', description: '어디에서 어떻게 받는지' }
        }
      }
    },
    usedIndicators: { type: 'array', description: '문단 전체가 실제로 쓴 지표 key 목록', items: { type: 'string' } }
  }
});

const line = (label, value) => `${label}: ${value}`;

export function regionBriefPrompt({ region = '', survey = {}, projectTitle = '', target = '', noticeProblem = '' } = {}) {
  const filled = filledIndicators(survey);
  const open = openIndicators(survey);
  const derived = derivedFigures(survey);

  const known = filled.length
    ? filled.map(item => line(`- ${item.key} (${item.label})`, `${item.value}${item.unit ? '' : ''}${item.asOf ? ` · 기준 ${item.asOf}` : ''}${item.note ? ` · ${item.note}` : ''} [출처: ${item.source}]`)).join('\n')
    : '(조사표에 채워진 값이 하나도 없다)';
  const computed = derived.length ? derived.map(item => `- ${item.label}: ${item.value} (${item.basis})`).join('\n') : '(계산할 수 있는 값 없음)';
  const missing = open.length ? open.map(item => `- ${item.key} (${item.label}) — ${item.source}`).join('\n') : '(없음)';

  return `사업계획서의 「지역 현황」 부분을 쓴다.

<사업>
지역: ${region || '(적지 않음)'}
사업명: ${projectTitle || '(적지 않음)'}
대상: ${target || '(적지 않음)'}
공고가 밝힌 문제: ${noticeProblem || '(적지 않음)'}
</사업>

<조사표에 확인된 값>
${known}
</조사표에 확인된 값>

<확인된 값에서 계산된 값>
${computed}
</확인된 값에서 계산된 값>

<아직 받지 못한 값>
${missing}
</아직 받지 못한 값>

규칙:
1. 위 「확인된 값」과 「계산된 값」에 있는 수치만 문장에 쓴다. 그 밖의 숫자는 어떤 것도 적지 않는다.
2. 수치를 쓴 문단에는 basis에 그 지표의 key를 적는다.
3. 받지 못한 값이 필요한 자리는 문장 안에 [확인 필요]라고 그대로 남기고, openItems에 무엇을 어디서 받는지 적는다.
4. 추세·전망·비교를 지어내지 않는다. 확인된 값이 하나뿐이면 그 하나만 가지고 쓴다.
5. 문단은 사업 대상이 그 지역에 실제로 존재하고, 기존 자원만으로는 부족하다는 것을 보이는 순서로 쓴다.
6. 사업을 홍보하지 않는다. 지역의 사실만 적는다.`;
}

// 결과 검증. 조사표에 없는 숫자가 문장에 들어왔으면 잡아낸다.
// 연도·회기처럼 흔한 수는 그냥 두고, 세 자리 이상이거나 백분율인 것만 본다.
const NUMBER = /\d[\d,]{2,}(?:\.\d+)?%?|\d+(?:\.\d+)?%/g;

export function verifyRegionBrief(result, survey = {}) {
  const allowed = new Set();
  for (const item of filledIndicators(survey)) {
    for (const found of String(item.value).match(NUMBER) || []) allowed.add(found.replace(/,/g, ''));
  }
  for (const item of derivedFigures(survey)) {
    for (const found of `${item.value} ${item.basis}`.match(NUMBER) || []) allowed.add(found.replace(/,/g, ''));
  }
  const keys = new Set(INDICATORS.map(item => item.key));
  const unknownNumbers = [];
  const unknownKeys = [];
  for (const paragraph of result?.paragraphs || []) {
    for (const found of String(paragraph.text || '').match(NUMBER) || []) {
      if (!allowed.has(found.replace(/,/g, ''))) unknownNumbers.push({ heading: paragraph.heading, value: found });
    }
    for (const key of paragraph.basis || []) if (!keys.has(key)) unknownKeys.push(key);
  }
  return {
    ok: unknownNumbers.length === 0 && unknownKeys.length === 0,
    unknownNumbers, unknownKeys,
    reason: unknownNumbers.length
      ? `조사표에 없는 수치가 문장에 있습니다: ${unknownNumbers.map(item => item.value).join(' · ')}`
      : unknownKeys.length ? `알 수 없는 지표를 근거로 적었습니다: ${unknownKeys.join(' · ')}` : ''
  };
}
