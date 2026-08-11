// 선정 가능성 진단서. 구독회원이 공고 하나에 대해 지원 여부를 판단하도록 돕는다.
// 계획서를 쓰지 않는다. 공고 요구와 기관 사실을 맞대어 보고 부족한 것을 알려 준다.

export const DIAGNOSIS_LABEL = '선정 가능성 진단서';
export const MIN_NOTICE_CHARS = 50;
export const MIN_ORGANIZATION_CHARS = 20;
export const MAX_NOTICE_CHARS = 40_000;
export const MAX_ORGANIZATION_CHARS = 20_000;
export const OUTPUT_TOKENS = 6_000;
// 근거가 없으면 지어내지 않는다. 이 표시를 그대로 쓴다.
export const UNKNOWN_MARK = '공고문 또는 기관 확인 필요';

export const JUDGEMENTS = Object.freeze(['지원 권장', '조건부 지원', '지원 보류', '지원 비권장']);

export function validateDiagnosisInput(payload = {}) {
  const noticeText = String(payload.noticeText || '').trim();
  const organizationText = String(payload.organizationText || '').trim();
  if (noticeText.length < MIN_NOTICE_CHARS) return { error: `공고 내용을 ${MIN_NOTICE_CHARS}자 이상 넣어 주세요.` };
  if (noticeText.length > MAX_NOTICE_CHARS) return { error: '공고 내용이 너무 깁니다. 핵심 부분만 넣어 주세요.' };
  if (organizationText.length < MIN_ORGANIZATION_CHARS) return { error: `신청기관 정보를 ${MIN_ORGANIZATION_CHARS}자 이상 넣어 주세요.` };
  if (organizationText.length > MAX_ORGANIZATION_CHARS) return { error: '신청기관 정보가 너무 깁니다.' };
  return { value: { noticeText, organizationText, noticeTitle: String(payload.noticeTitle || '').trim().slice(0, 200) } };
}

export const DIAGNOSIS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['fitScore', 'fitSummary', 'requirements', 'strengths', 'risks', 'missingEvidence', 'questions', 'judgement', 'judgementReason'],
  properties: {
    // 적합도. 근거 없이 높은 점수를 주지 않도록 요약을 함께 받는다.
    fitScore: { type: 'integer', minimum: 0, maximum: 100 },
    fitSummary: { type: 'string' },
    // 공모기관이 요구하는 것과 그 충족 여부.
    requirements: {
      type: 'array', minItems: 1, maxItems: 12,
      items: {
        type: 'object', additionalProperties: false,
        required: ['requirement', 'status', 'evidence'],
        properties: {
          requirement: { type: 'string' },
          status: { type: 'string', enum: ['충족', '부분 충족', '미충족', '확인 필요'] },
          evidence: { type: 'string' }
        }
      }
    },
    // 기관 강점. 공고 요구와 이어지는 것만 적는다.
    strengths: {
      type: 'array', minItems: 0, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['point', 'linkedRequirement'],
        properties: { point: { type: 'string' }, linkedRequirement: { type: 'string' } }
      }
    },
    // 탈락 위험.
    risks: {
      type: 'array', minItems: 0, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['risk', 'severity', 'mitigation'],
        properties: {
          risk: { type: 'string' },
          severity: { type: 'string', enum: ['높음', '보통', '낮음'] },
          mitigation: { type: 'string' }
        }
      }
    },
    // 부족한 증빙. 무엇을 준비해야 하는지 적는다.
    missingEvidence: {
      type: 'array', minItems: 0, maxItems: 10,
      items: {
        type: 'object', additionalProperties: false,
        required: ['item', 'why'],
        properties: { item: { type: 'string' }, why: { type: 'string' } }
      }
    },
    // 담당자에게 물어야 확정되는 것.
    questions: { type: 'array', minItems: 0, maxItems: 10, items: { type: 'string' } },
    judgement: { type: 'string', enum: [...JUDGEMENTS] },
    judgementReason: { type: 'string' }
  }
};

export function diagnosisPrompt(payload) {
  return [
    `${DIAGNOSIS_LABEL}를 작성한다. 계획서를 쓰지 말고 지원 여부 판단에 필요한 것만 정리한다.`,
    '',
    '규칙',
    `- 공고문과 기관 정보에서 확인되는 사실만 쓴다. 확인되지 않으면 「${UNKNOWN_MARK}」로 적는다.`,
    '- 기관의 실적·인력·시설을 지어내지 않는다. 적혀 있지 않으면 미충족이 아니라 「확인 필요」다.',
    '- 적합도 점수는 요구사항 충족 상태에서 나온 결과여야 한다. 충족 근거가 없으면 점수를 높이지 않는다.',
    '- 탈락 위험은 공고문의 요건·배점·제외 조건에서 실제로 읽히는 것만 적는다.',
    '- 부족 증빙은 신청 서류로 준비할 수 있는 형태로 적는다.',
    '- 확인 질문은 담당자가 답해야 값이 정해지는 것만 적는다.',
    '',
    payload.noticeTitle ? `공고명: ${payload.noticeTitle}` : '',
    '',
    '[공고 내용]',
    payload.noticeText,
    '',
    '[신청기관 정보]',
    payload.organizationText
  ].filter(Boolean).join('\n');
}

// 화면과 저장이 같은 모양을 쓰도록 정리한다.
export function normalizeDiagnosis(result = {}) {
  return {
    fitScore: Math.min(100, Math.max(0, Number(result.fitScore) || 0)),
    fitSummary: String(result.fitSummary || ''),
    requirements: Array.isArray(result.requirements) ? result.requirements : [],
    strengths: Array.isArray(result.strengths) ? result.strengths : [],
    risks: Array.isArray(result.risks) ? result.risks : [],
    missingEvidence: Array.isArray(result.missingEvidence) ? result.missingEvidence : [],
    questions: Array.isArray(result.questions) ? result.questions : [],
    judgement: JUDGEMENTS.includes(result.judgement) ? result.judgement : '지원 보류',
    judgementReason: String(result.judgementReason || '')
  };
}
