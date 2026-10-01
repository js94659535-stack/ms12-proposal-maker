// 삼성 계열 재단 공고를 모아 마인드스토리 영역 순서로 보여 준다. 플랫폼의 /radar/ 와 같은 모듈을 쓴다.
// 쓰는 법: node tools/crawl-samsung.mjs [--pages 3] [--out reports/10-01-samsung-notices.md]
import fs from 'node:fs';
import { collectSamsung } from '../server/samsung-radar.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
const { items } = await collectSamsung(fetch, { pages: Number(opt('--pages', 3)) });
const lines = [`# 삼성 계열 공고 수집 (${new Date().toISOString().slice(0, 10)})`, '',
  '열려 있는 것을 위에, 그 안에서 마인드스토리 영역(아동·청소년 교육, 문해력, 상담·정서, 지역아동센터) 적합도 순입니다.', ''];
for (const item of items) {
  lines.push(`## ${item.title}`, `- ${item.source} · 올림 ${item.posted || '?'} · 적합 ${item.fit}점${item.daysLeft === null ? '' : item.daysLeft >= 0 ? ` · D-${item.daysLeft}` : ' · 마감'}`);
  if (item.period) lines.push(`- 신청기간: ${item.period}`);
  if (item.eligibility) lines.push(`- 신청자격: ${item.eligibility}`);
  if (item.files?.length) lines.push(`- 첨부: ${item.files.join(' / ')}`);
  lines.push(`- ${item.url}`, '');
}
const text = lines.join('\n');
const out = opt('--out', '');
if (out) { fs.writeFileSync(out, text); console.log(`${items.length}건 → ${out}`); } else console.log(text);
