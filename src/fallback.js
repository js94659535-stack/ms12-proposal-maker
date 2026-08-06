const requirementPatterns = [
  ['예산', /(?:예산|사업비|금액|원|부가세)/i], ['기간', /(?:기간|일정|마감|착수|완료)/i],
  ['인력', /(?:인력|강사|상담사|자격|책임자|PM)/i], ['실적', /(?:실적|수행경험|유사사업)/i],
  ['제출', /(?:제출|서류|양식|페이지|분량|날인)/i], ['평가', /(?:평가|배점|점수|심사)/i],
  ['대상', /(?:대상|참여자|학생|가족|인원)/i], ['운영', /(?:운영|회기|프로그램|과업|수행)/i]
];

function evidenceLine(text, regex) {
  return text.split(/\n+/).map(v => v.trim()).find(v => regex.test(v)) || '';
}

export function localAnalyze({ sourceText, projectType, title }) {
  const requirements = requirementPatterns.map(([category, regex], index) => {
    const evidence = evidenceLine(sourceText, regex);
    if (!evidence) return null;
    return { id: `req-${index + 1}`, category, requirement: evidence.slice(0, 240), mandatory: /필수|하여야|해야|제출|이상|이내/.test(evidence), evidence, location: '붙여넣은 원문', confidence: '규칙 추출' };
  }).filter(Boolean);
  if (!requirements.length) requirements.push({ id: 'req-1', category: '확인', requirement: '구체적인 요구사항을 자동 식별하지 못했습니다.', mandatory: false, evidence: sourceText.slice(0, 240), location: '붙여넣은 원문', confidence: '낮음' });
  return {
    mode: 'local',
    project: { type: projectType, title: title || '확인 필요', issuer: '확인 필요', deadline: '확인 필요', budget: '확인 필요' },
    requirements,
    evaluationCriteria: [],
    submissionItems: [],
    warnings: ['OpenAI 서버 분석을 사용하지 않아 규칙 기반으로만 추출했습니다. 원문과 반드시 대조하세요.'],
    questions: requirements.filter(r => r.mandatory).slice(0, 5).map((r, i) => ({ id: `q-${i + 1}`, question: `“${r.requirement.slice(0, 70)}” 요건을 충족하는 증빙 또는 기관 정보를 입력해 주세요.`, required: true, answer: '' }))
  };
}

export function localDraft({ analysis, answers, organization }) {
  const answerText = answers.filter(a => a.answer).map(a => `- ${a.question}: ${a.answer}`).join('\n') || '- 확인된 추가 답변 없음';
  const reqText = analysis.requirements.map(r => `- ${r.requirement} (근거: ${r.location})`).join('\n');
  const confirmedFacts = [...(organization.confirmedFacts || []).map(item => `- ${item.title}: ${item.content}`), ...(organization.userConfirmedNotes ? [`- ${organization.userConfirmedNotes}`] : [])].join('\n') || '- 확정된 회사 세부정보 없음 [확인 필요]';
  return {
    mode: 'local',
    sections: [
      { id: 'necessity', title: '1. 사업 필요성', content: `${analysis.project.title}의 추진 필요성은 다음 기관 요구사항을 근거로 합니다.\n${reqText}`, citations: analysis.requirements.map(r => r.id), status: '검토 필요' },
      { id: 'purpose', title: '2. 사업 목적', content: '기관 원문에서 확인된 문제를 해소하고 요구된 사업 성과를 달성하는 것을 목적으로 합니다. 구체적인 정량 목적은 원문 또는 담당자 확인이 필요합니다.', citations: analysis.requirements.slice(0, 3).map(r => r.id), status: '검토 필요' },
      { id: 'goals', title: '3. 사업 목표', content: analysis.evaluationCriteria.length ? analysis.evaluationCriteria.map(v => `- ${v}`).join('\n') : '- 정량 목표: [확인 필요]\n- 정성 목표: 참여자의 긍정적 변화 지원', citations: [], status: '확인 필요' },
      { id: 'target', title: '4. 사업 대상', content: '대상, 인원, 선정 기준은 기관 원문의 요구사항을 적용합니다. 원문에서 확인되지 않는 세부 인원은 [확인 필요]입니다.', citations: analysis.requirements.filter(r => r.category === '대상').map(r => r.id), status: '확인 필요' },
      { id: 'program', title: '5. 세부 프로그램', content: `${organization.capabilities.map(c => `- ${c.name} (${c.status})`).join('\n')}\n\n기관 요구에 적용할 회기별 세부내용은 [확인 필요]입니다.`, citations: analysis.requirements.map(r => r.id), status: '확인 필요' },
      { id: 'schedule', title: '6. 추진 일정', content: '착수, 참여자 모집, 프로그램 운영, 성과평가, 결과보고 순으로 추진합니다. 실제 날짜와 회기별 일정은 기관 원문에 따라 [확인 필요]입니다.', citations: analysis.requirements.filter(r => r.category === '기간').map(r => r.id), status: '확인 필요' },
      { id: 'workforce', title: '7. 운영 인력 및 역할', content: `확정 회사 정보:\n${confirmedFacts}\n\n투입 인력의 성명, 자격, 경력과 역할은 증빙 확인 전까지 [확인 필요]입니다.`, citations: [], status: '확인 필요' },
      { id: 'budget', title: '8. 예산 계획', content: '총사업비와 세부 산출내역은 기관 예산 기준 및 회사 확정 원가를 적용해야 합니다. 확인되지 않은 금액은 [확인 필요]입니다.', citations: analysis.requirements.filter(r => r.category === '예산').map(r => r.id), status: '확인 필요' },
      { id: 'evaluation', title: '9. 성과지표 및 평가', content: analysis.evaluationCriteria.length ? analysis.evaluationCriteria.map(v => `- ${v}`).join('\n') : '기관 평가 기준과 연계한 산출·성과지표는 [확인 필요]입니다.', citations: [], status: '확인 필요' },
      { id: 'effects', title: '10. 기대효과', content: `기관 요구 충족과 참여자 변화를 중심으로 기대효과를 관리합니다.\n${answerText}`, citations: analysis.requirements.map(r => r.id), status: '검토 필요' }
    ]
  };
}
