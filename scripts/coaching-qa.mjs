import { randomUUID } from 'node:crypto';
import { COACHING_QA_CASES, COACHING_QA_CRITERIA } from '../test/fixtures/coaching-qa.js';

const baseUrl = process.argv[2] || 'https://pro.ms12.org';
const archiveKey = randomUUID();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function request(body) {
  const response = await fetch(`${baseUrl}/api/proposal-coaching`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Archive-Key': archiveKey }, body: JSON.stringify(body) });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  return { response, data };
}

function diagnosticFields(diagnostic = {}) {
  return {
    configuredModel: diagnostic.configuredModel || '', upstreamStatus: Number(diagnostic.upstreamStatus || 0), upstreamErrorType: diagnostic.upstreamErrorType || '', upstreamErrorCode: diagnostic.upstreamErrorCode || '', upstreamRequestId: diagnostic.upstreamRequestId || '', elapsedMs: Number(diagnostic.elapsedMs || 0),
  };
}

function quality(caseId, result) {
  const issues = Array.isArray(result.issues) ? result.issues : [];
  const checks = Object.fromEntries((result.finalChecks || []).map(item => [item.area, item.status]));
  const combined = issues.map(item => `${item.location} ${item.reason}`).join(' ');
  if (caseId === 'A') return { detected: ['자격', '대상·인원', '회기', '예산 합계·예산규정', '성과목표·지표'].filter(area => checks[area] && checks[area] !== '충족'), passed: ['자격', '대상·인원', '회기', '예산 합계·예산규정', '성과목표·지표'].every(area => checks[area] && checks[area] !== '충족') };
  if (caseId === 'B') {
    const detected = { period: /기간|3월|4월|8월|10월/.test(combined), headcount: /인원|30명|45명/.test(combined), sessions: /회기|20회|24회/.test(combined), roles: /역할|총괄/.test(combined), budget: /예산|30,000,000|32,000,000/.test(combined), outcome: /성과|80%|90%/.test(combined) };
    return { detected, passed: Object.values(detected).every(Boolean) };
  }
  const critical = issues.filter(item => item.priority === '최우선 경고');
  return { criticalCount: critical.length, criticalLocations: critical.map(item => item.location), overdiagnosed: critical.length > 0, passed: critical.length === 0 };
}

for (const item of COACHING_QA_CASES) {
  const startedAt = Date.now();
  let generationCalls = 0;
  let pollingCount = 0;
  let lastDiagnostic = {};
  let report;
  const payload = { title: item.title, proposalText: item.proposalText, criteriaText: COACHING_QA_CRITERIA, officialEvaluationProvided: true, previousVersion: 0, previousResult: null };
  try {
    generationCalls += 1;
    const start = await request({ action: 'startCoaching', ...payload });
    lastDiagnostic = start.data.diagnostic || lastDiagnostic;
    if (!start.response.ok) throw Object.assign(new Error(start.data.error || 'background start failed'), { httpStatus: start.response.status, data: start.data });
    let status = start.data.status;
    let resultCandidate = null;
    while (['queued', 'in_progress'].includes(status) && pollingCount < 180) {
      await sleep(3000);
      pollingCount += 1;
      const poll = await request({ action: 'pollCoaching', jobId: start.data.jobId });
      lastDiagnostic = poll.data.diagnostic || lastDiagnostic;
      if (!poll.response.ok) throw Object.assign(new Error(poll.data.error || 'background polling failed'), { httpStatus: poll.response.status, data: poll.data });
      status = poll.data.status;
      resultCandidate = poll.data.resultCandidate || resultCandidate;
    }
    if (status !== 'completed') throw Object.assign(new Error(`background status ${status}`), { httpStatus: 504, data: { failureStage: 'proxy/timeout' } });
    const completed = await request({ action: 'finalizeCoaching', jobId: start.data.jobId, resultCandidate, pollDiagnostic: lastDiagnostic, ...payload });
    lastDiagnostic = completed.data.diagnostic || lastDiagnostic;
    if (!completed.response.ok) throw Object.assign(new Error(completed.data.error || 'background finalize failed'), { httpStatus: completed.response.status, data: completed.data });
    report = { id: item.id, httpStatus: completed.response.status, failureStage: '', ...diagnosticFields(lastDiagnostic), generationCalls, pollingCount, totalElapsedMs: Date.now() - startedAt, quality: quality(item.id, completed.data) };
  } catch (error) {
    const data = error.data || {};
    const totalElapsedMs = Date.now() - startedAt;
    const bodylessProxy = [502, 524].includes(Number(error.httpStatus)) && !data.failureStage && totalElapsedMs >= 60_000;
    report = { id: item.id, httpStatus: Number(error.httpStatus || 0), failureStage: data.failureStage || (bodylessProxy ? 'proxy/timeout' : 'transport'), ...diagnosticFields(data.diagnostic || lastDiagnostic), generationCalls, pollingCount, totalElapsedMs, quality: null, error: error.message };
  }
  console.log(JSON.stringify(report));
}
