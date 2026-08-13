// 정상 공고문·신청서로 「패키지를 만들 수 없다」가 왜 나오는지 재현한다. 자료를 바꾸지 않는다.
import fs from 'node:fs';
import { buildFormSpec } from '../src/form-spec.js';
import { buildDocumentPlan } from '../src/engagement.js';
import { buildSubmissionPackage } from '../src/submission-package.js';
import { fillFormLayout, fillSummary } from '../src/form-fill.js';

const read = name => fs.readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8');
const notice = read('notice-chest-2027-gold.txt');
const form = read('form-chest-2027-application.txt');

// 사용자가 올린 그대로: 공고문 하나, 신청서 서식 하나.
const manualSources = [
  { id: 'm1', fileName: '2027 공고문.txt', sourceType: '세부 공고문', extractedText: notice, extractionStatus: 'success' },
  { id: 'm2', fileName: '2027 배분신청서.txt', sourceType: '신청서 서식', extractedText: form, extractionStatus: 'success' }
];

const spec = buildFormSpec(manualSources);
console.log('서식 읽기:', spec ? `${spec.status} · 항목 ${spec.items.length}개 · 표 ${spec.tables.length}개 · 첨부 ${spec.attachments.length}건` : '읽지 못함');
if (spec) {
  console.log('  항목:', spec.items.slice(0, 10).map(item => item.name).join(' | '));
  console.log('  첨부:', spec.attachments.map(item => `${item.name}${item.required ? '(필수)' : ''}`).join(' | ') || '없음');
}

const plan = buildDocumentPlan(null, spec);
console.log('배치 계획: 항목', plan.outline.length, '· 표', plan.tables.length, '· 분량 기준', plan.limitSource);

// AI가 만들었다고 가정한 본문. 확인되지 않은 값은 표시로 남아 있는 상태 그대로 둔다.
const sections = plan.outline.map((item, index) => ({
  id: item.key, title: item.title,
  content: index % 4 === 3
    ? `${item.title} 내용입니다. 대상 인원은 [확인 필요]명입니다.`
    : `${item.title} 내용입니다. 공고가 정한 기준에 맞춰 작성했습니다.`
}));
const tables = [{ kind: 'budget', title: '예산', rows: [['항목', '금액'], ['인건비', '12,000,000']] }];

const summary = buildSubmissionPackage({
  sections, tables, versions: [{ version: 1, versionId: 'v1', sections, tables }],
  formSpec: spec, outline: plan.outline, included: []
});
console.log('\n제출 판정:', summary.status, '· 출력 가능', summary.canExport);
for (const item of summary.blockers) console.log('  ✕', item.reason, '—', String(item.detail).slice(0, 90));
for (const item of summary.warnings.slice(0, 5)) console.log('  ·', item.reason, '—', String(item.detail).slice(0, 90));

const laid = fillFormLayout({ plan, sections, tables });
console.log('\n서식 배치:', fillSummary(laid));
console.log('  채운 칸', laid.sections.filter(item => item.fromForm && !item.content.startsWith('[확인 필요')).length,
  '/ 서식 항목', laid.sections.filter(item => item.fromForm).length, '· 표', laid.tables.length);
