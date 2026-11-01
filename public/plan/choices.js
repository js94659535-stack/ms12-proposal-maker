// 고를 제안을 사람이 다룰 수 있게 가른다(11-10 사용자 결정). 화면(/plan/)과 choices_ 파일이 이 한 곳을 쓴다(③).
//
// 197줄을 하나씩 보게 하지 않는다. 묶음(「o」 줄과 그 아래 「-」 줄, 또는 「####」 소제목 아래)으로 모으고 셋으로 가른다.
//   값   — 「[확인 필요]」가 든 줄. 고르는 일이 아니라 채우는 일이다(빈 데 채우기로).
//   약속 — 「활동 → 하는 일 → 결과물」 꼴(지킬 것 7). 선정되면 협약 의무가 되고 결과물이 증빙이 된다. 「할 수 있나」를 사람이 묶음마다 정한다.
//   문구 — 그 밖(비전·전략·설명). 기본 채택. 접어 두되 한 번은 훑을 수 있게 펼치기를 둔다.
// 「→ 꼴」은 완벽한 기준이 아니다(약속인데 문구에 들어가는 줄이 있다). 써 보고 나오면 그때 고친다 — 낱말 목록으로 메우지 않는다(⑤).
// 점수 줄 = 채점 기준·가리킴 판정이 「답」으로 고른 줄. 지우려 하면 알리기만 한다(관문을 두지 않는다).

const MARK = '[제안]';
const PENDING = /\[확인 필요/;
const squash = value => String(value).replace(/\s+/g, '');
const bodyOf = line => String(line).trim().replace(/^\|/, '').replace(/\|$/, '')
  .replace(/^\s*(?:o|-|․|※|\*|·)\s+/, '').replace(/\[(?:제안|사실[^\]]*)\]\s*/g, '').replace(/\*\*/g, '').replace(/\s*\|\s*/g, ' | ').trim();

// 판정 결과(checks_ JSON 배열)에서 「답」으로 고른 인용 — pass 줄 detail의 「…」.
export function scoreQuotesOf(checks = []) {
  const out = [];
  for (const check of checks) {
    if (check.level !== 'pass' || !/^(채점 기준|가리킴)/.test(check.what || '')) continue;
    for (const match of String(check.detail).matchAll(/「([^」]{6,})」/g)) out.push(squash(match[1]));
  }
  return out;
}

// parts: [{ key, title, score }] — 그 장의 절. 배점 큰 절부터 보인다.
export function choicesOf(text, { parts = [], checks = [] } = {}) {
  const quotes = scoreQuotesOf(checks);
  const isScore = body => quotes.some(quote => squash(body).includes(quote.slice(0, 40)) || quote.includes(squash(body).slice(0, 40)));
  const groups = [];
  let part = parts.length === 1 ? parts[0] : null;
  let group = null;
  // 묶음 이름은 줄 앞 40자 — 「[확인 필요: …]」는 이름에서 뺀다(중간에 잘려 보였다).
  const open = (raw, kind) => { const title = String(raw).replace(/\s*\[확인 필요[^\]]*\]?.*$/, '').slice(0, 40) || '(이름 없음)'; group ={ id: `${part?.key || '?'}#${groups.length + 1}`, part: part?.key || null, score: part?.score ?? 0, title, kind, lines: [] }; groups.push(group); };
  for (const line of String(text).split('\n')) {
    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      if (heading[1] === '###') {
        const title = squash(heading[2]);
        part = parts.find(entry => title.includes(squash(entry.title))) || (parts.length === 1 ? parts[0] : part);
        group = null;
      } else if (heading[1] === '####') open(heading[2].trim(), 'heading');
      continue;
    }
    if (/^\s*o\s/.test(line)) open(bodyOf(line), 'o');
    if (!line.includes(MARK)) continue;
    if (!group) open(bodyOf(line), 'line');
    const body = bodyOf(line);
    const tier = PENDING.test(line) ? '값' : (body.match(/→/g) || []).length >= 2 ? '약속' : '문구';
    group.lines.push({ id: `${group.id}.${group.lines.length + 1}`, text: body, tier, score: isScore(body) });
  }
  const kept = groups.filter(entry => entry.lines.length);
  const byScore = (a, b) => b.score - a.score;
  const pick = tier => kept.map(entry => ({ ...entry, lines: entry.lines.filter(line => line.tier === tier) })).filter(entry => entry.lines.length).sort(byScore);
  return { promises: pick('약속'), wording: pick('문구'), values: pick('값'), total: kept.reduce((sum, entry) => sum + entry.lines.length, 0) };
}

const count = list => list.reduce((sum, entry) => sum + entry.lines.length, 0);

// choices_ 파일(마크다운). 화면이 없을 때도 같은 갈래로 본다.
export function choicesSheet(text, { title = '', parts = [], checks = [] } = {}) {
  const { promises, wording, values, total } = choicesOf(text, { parts, checks });
  const label = entry => [entry.part ? `${entry.part}${entry.score ? ` (${entry.score}점)` : ''}` : '', entry.title].filter(Boolean).join(' · ');
  const line = item => `  - ${item.text}${item.score ? ' ★점수 줄' : ''}`;
  const out = [`# 고를 것 — ${title}`, '', `제안 ${total}줄. 누를 것은 약속 ${promises.length}묶음이다. 문구는 그대로 쓰고, 값은 빈 데 채우기로 간다. ★점수 줄은 판정이 채점 기준의 답으로 고른 줄이라 지우면 그 답이 사라질 수 있다.`, ''];
  out.push(`## 할 수 있나 — 약속 ${promises.length}묶음 · ${count(promises)}줄 (배점 큰 절부터)`, '');
  for (const entry of promises) out.push(`- [ ] 다 할 수 있다 / [ ] 뺄 줄 있음 — ${label(entry)}`, ...entry.lines.map(line), '');
  out.push(`## 채울 값 — ${count(values)}줄 (빈 데 채우기)`, '');
  for (const entry of values) out.push(`- ${label(entry)}`, ...entry.lines.map(line));
  out.push('', `## 문구 ${count(wording)}줄 — 기본 채택 (고칠 것만 고친다)`, '');
  for (const entry of wording) out.push(`- ${label(entry)}`, ...entry.lines.map(line));
  return out.join('\n');
}
