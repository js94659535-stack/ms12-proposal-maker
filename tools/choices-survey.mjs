// 사용: node tools/choices-survey.mjs <초안 폴더> <판정 결과 폴더> <내보낼 json> (11-10 조사, 돈 안 듦)
// choices_ 197개를 가를 재료: 줄마다 절·배점·묶음·[확인 필요]·판정 인용·숫자·프로그램 꼴.
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../', import.meta.url).pathname.replace(/^/([A-Za-z]:)/, '$1');
const { readPlan, writingUnits } = await import(`file:///${root}public/rfp/rfp-plan.js`);
const { stripMarks } = await import(`file:///${root}src/proposal-draft.js`);
const rfp = fs.readFileSync(root + 'test/fixtures/rfp-unification-2027.txt', 'utf8');
const project = JSON.parse(fs.readFileSync(root + 'reports/10-05-unification/project.json', 'utf8'));
const units = writingUnits(readPlan(rfp, { project }).plan);
const parts = units.flatMap(unit => unit.parts.map(part => ({ key: part.key, title: part.title, score: part.score, pages: part.pages?.value ?? null })));
const dir = root + process.argv[2];
const judged = root + process.argv[3];
const squash = value => String(value).replace(/\s+/g, '');
const plain = line => stripMarks(line).replace(/^\s*(?:o|-|․|※|\*|·|\d+\.)\s+/, '').replace(/\*\*/g, '').trim();

// 판정이 「답」으로 고른 줄(pass detail의 「…」 인용, 앞 50자). 가리킴 판정의 인용도.
const answers = [];
for (const file of fs.readdirSync(judged).filter(name => name.startsWith('checks_'))) {
  for (const check of JSON.parse(fs.readFileSync(path.join(judged, file), 'utf8'))) {
    if (check.level !== 'pass' || !(check.what.startsWith('채점 기준') || check.what.startsWith('가리킴'))) continue;
    for (const match of String(check.detail).matchAll(/「([^」]{6,})」/g)) answers.push({ quote: squash(match[1]), kind: check.what.startsWith('가리킴') ? 'pointer' : 'criterion', what: check.what });
  }
}

const items = [];
for (const file of fs.readdirSync(dir).filter(name => name.startsWith('draft_')).sort()) {
  const chapter = file.slice(6).split('.')[0];
  let part = null; let group = null;
  for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
    const h = line.match(/^(#{2,4})\s+(.*)/);
    if (h) {
      if (h[1] === '###') {
        const t = squash(h[2]);
        part = parts.find(entry => entry.key.startsWith(chapter) && t.includes(squash(entry.title)))?.key || part;
        group = null;
      } else if (h[1] === '####') group = h[2];
      continue;
    }
    if (/^\s*o\s/.test(line)) group = plain(line).slice(0, 30);
    if (!line.includes('[제안]')) continue;
    const text = plain(line);
    const answer = answers.filter(entry => squash(text).includes(entry.quote.slice(0, 40)) || entry.quote.includes(squash(text).slice(0, 40)));
    items.push({
      chapter, part, group, text,
      head: /^\s*o\s/.test(line),
      pending: /\[확인 필요/.test(line),
      answer: answer.length ? [...new Set(answer.map(entry => entry.kind))] : [],
      number: /\d/.test(text.replace(/\[확인 필요[^\]]*\]/g, '').replace(/Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|\d+\.\d+/g, '')),
      program: (text.match(/→/g) || []).length >= 2
    });
  }
}
const by = (list, key) => list.reduce((map, item) => { map[item[key]] = (map[item[key]] || 0) + 1; return map; }, {});
const groups = new Set(items.map(item => `${item.part}|${item.group}`));
console.log('줄', items.length, '묶음', groups.size);
console.log('절마다', parts.map(part => {
  const own = items.filter(item => item.part === part.key);
  return `${part.key} ${part.score}점 ${part.pages ?? '?'}쪽 · ${own.length}줄 · 묶음 ${new Set(own.map(item => item.group)).size} · 확인필요 ${own.filter(item => item.pending).length} · 답 ${own.filter(item => item.answer.length).length} · 숫자 ${own.filter(item => item.number).length} · 프로그램 ${own.filter(item => item.program).length}`;
}).join('\n'));
console.log('절 없음', items.filter(item => !item.part).length);
const pending = items.filter(item => item.pending), answer = items.filter(item => item.answer.length && !item.pending), number = items.filter(item => item.number && !item.pending && !item.answer.length);
console.log('확인 필요', pending.length, '· 답(확인 필요 아닌)', answer.length, '· 숫자(앞 둘 아닌)', number.length, '· 나머지', items.length - pending.length - answer.length - number.length);
console.log('숫자 줄 보기:', number.slice(0, 12).map(item => `${item.part} 「${item.text.slice(0, 50)}」`).join('\n'));
fs.writeFileSync(process.argv[4], JSON.stringify(items, null, 2));
