// 사업수행실적 TSV에서 개업일 이후 건만 남긴다(11-25 나). 돈 안 듦.
// 사용: node tools/records-since-opening.mjs --info <기관정보.md> --records <실적.tsv> --out <남긴.tsv>
// 개업일은 기관정보에서 읽는다 — 없으면 짐작하지 않고 멈춘다(exit 2). 날짜 칸은 머리줄에서 「날짜」가 든 칸.
import fs from 'node:fs';
import { openingDateOf, recordSince } from '../public/lib/opening.js';

const args = process.argv.slice(2);
const opt = name => args[args.indexOf(`--${name}`) + 1];
if (!opt('info') || !opt('records')) { console.error('--info <기관정보.md> --records <실적.tsv> 를 주세요.'); process.exit(1); }

const opening = openingDateOf([fs.readFileSync(opt('info'), 'utf8')]);
if (!opening.date) { console.error(`멈춤: ${opening.reason}. 짐작하지 않는다.`); process.exit(2); }

const [header, ...rows] = fs.readFileSync(opt('records'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(line => line.trim()).map(line => line.split('\t'));
const dateAt = header.findIndex(cell => cell.includes('날짜'));
if (dateAt < 0) { console.error(`멈춤: 머리줄에 「날짜」 칸이 없다 — ${header.join(' | ')}`); process.exit(2); }

const kept = [];
const dropped = {};
for (const row of rows) {
  const verdict = recordSince(row[dateAt], opening.date);
  if (verdict.keep) kept.push(row);
  else (dropped[verdict.why] ||= []).push(row);
}
console.log(`개업일 ${opening.date} · 날짜 칸 「${header[dateAt]}」 · 전체 ${rows.length}건 → 쓴다 ${kept.length}건 · 뺀다 ${rows.length - kept.length}건`);
for (const [why, list] of Object.entries(dropped)) console.log(`  뺌 ${why} ${list.length}건${list.length ? ` — 예: ${list.slice(0, 2).map(row => row.join(' / ').slice(0, 50)).join(' · ')}` : ''}`);
if (opt('out')) fs.writeFileSync(opt('out'), [header, ...kept].map(row => row.join('\t')).join('\n') + '\n');
