// 새 출처를 실제로 한 번 열어 본다. D1에는 쓰지 않는다. 제목·본문은 찍지 않는다.
//   node tools/source-probe.mjs
import { collectExtraSources } from '../server/extra-collect.js';
import { FITNESS_LABELS } from '../server/notice-classify.js';
import { SKIP_LABELS, SOURCES } from '../server/notice-sources.js';
import { mergeAcrossSources } from '../server/notice-dedupe.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const codes = new Map();

// 응답 코드를 함께 기록하려고 fetch를 한 겹 감싼다. 요청 자체는 수집기가 정한 곳으로만 간다.
async function probeFetch(url, options = {}) {
  const headers = { ...(options.headers || {}), 'User-Agent': UA };
  const response = await fetch(url, { ...options, headers });
  const origin = new URL(url).origin + new URL(url).pathname;
  codes.set(origin, `${response.status}`);
  return response;
}

const secrets = { G2B_SERVICE_KEY: process.env.G2B_SERVICE_KEY || '' };
console.log('나라장터 인증키:', secrets.G2B_SERVICE_KEY ? '등록됨(값 미출력)' : '미등록');

const started = Date.now();
const result = await collectExtraSources(probeFetch, { settings: {}, secrets });
const merged = mergeAcrossSources(result.notices);

console.log(`\n=== 출처별 결과 (${((Date.now() - started) / 1000).toFixed(1)}초) ===`);
for (const status of result.sources) {
  const source = SOURCES.find(item => item.id === status.source);
  const skips = Object.entries(status.skipped || {}).map(([key, count]) => `${FITNESS_LABELS[key] || key} ${count}`).join(', ');
  const label = status.status === 'skipped' ? `건너뜀 · ${SKIP_LABELS[status.reason] || status.reason}`
    : status.status === 'failed' ? `실패 · ${status.reason}` : '성공';
  console.log(`${String(status.source).padEnd(14)} ${label.padEnd(34)} 조회 ${String(status.listed).padStart(3)} · 후보 ${String(status.candidates).padStart(3)} · 발급 ${String(status.collected).padStart(3)}${skips ? ` · 제외 [${skips}]` : ''}`);
  if (source && !source.verified) console.log(`${' '.repeat(15)}↳ ${source.note}`);
}

console.log(`\n=== 합계 ===`);
console.log(`발급 ${result.notices.length}건 → 중복 통합 후 ${merged.notices.length}건 (묶음 ${merged.merged}건)`);
const byFitness = {};
for (const notice of merged.notices) byFitness[notice.fitness] = (byFitness[notice.fitness] || 0) + 1;
console.log('분류:', Object.entries(byFitness).map(([key, count]) => `${FITNESS_LABELS[key] || key} ${count}`).join(' · ') || '없음');
const withDeadline = merged.notices.filter(notice => notice.deadline).length;
console.log(`마감일 확인 ${withDeadline}건 / 미확인 ${merged.notices.length - withDeadline}건`);
const withDetail = merged.notices.filter(notice => notice.officialTextExtracted).length;
console.log(`상세 본문 읽음 ${withDetail}건 · 첨부 메타 있는 공고 ${merged.notices.filter(notice => (notice.attachments || []).length).length}건`);
console.log('\n=== 확인한 HTTP 상태 ===');
for (const [path, code] of codes) console.log(`${code}  ${path}`);
