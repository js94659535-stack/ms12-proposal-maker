// 고를 제안을 사람이 다룰 수 있게 가른다(11-10 사용자 결정). 화면(/plan/)과 choices_ 파일이 이 한 곳을 쓴다(③).
//
// 197줄을 하나씩 보게 하지 않는다. 묶음(「o」 줄과 그 아래 「-」 줄, 또는 「####」 소제목 아래)으로 모으고 셋으로 가른다.
//   값   — 「[확인 필요]」가 든 줄. 고르는 일이 아니라 채우는 일이다(빈 데 채우기로).
//   약속 — 「활동 → 하는 일 → 결과물」 꼴(지킬 것 7). 선정되면 협약 의무가 되고 결과물이 증빙이 된다. 「할 수 있나」를 사람이 묶음마다 정한다.
//   문구 — 그 밖(비전·전략·설명·설문 문항·일정). 묶음째 받기/빼기, 기본은 받기(11-16 C). 접어 두되 펼쳐 볼 수 있다.
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
// chapter: 장 키 — 줄·묶음 열쇠와 빈칸 id(「장:몇째」, workspace.js pendingsOf와 같은 셈)에 쓴다.
// moved: { 줄 열쇠: 기록 } — 사람이 「약속으로 옮기기」를 누른 문구 줄(11-12). 기준(→ 꼴)은 고치지 않고 그 기록을 모은다.
// 열쇠는 자리 차례가 아니라 글자로 만든다 — 같은 초안을 다시 올려도 고른 것이 그 줄에 붙어 있다.
export const lineKeyOf = (chapter, text) => `${chapter}|${squash(text)}`;
export function choicesOf(text, { parts = [], checks = [], chapter = '', moved = {} } = {}) {
  const quotes = scoreQuotesOf(checks);
  const isScore = body => quotes.some(quote => squash(body).includes(quote.slice(0, 40)) || quote.includes(squash(body).slice(0, 40)));
  const groups = [];
  let part = parts.length === 1 ? parts[0] : null;
  let group = null;
  let pendingNo = 0;
  // 묶음 이름은 줄 앞 40자 — 「[확인 필요: …]」는 이름에서 뺀다(중간에 잘려 보였다).
  const open = (raw, kind) => { const title = String(raw).replace(/\s*\[확인 필요[^\]]*\]?.*$/, '').slice(0, 40) || '(이름 없음)'; const base = `${chapter}|${part?.key || '?'}|${title}`; const same = groups.filter(entry => entry.id === base || entry.id.startsWith(`${base}#`)).length; group = { id: same ? `${base}#${same + 1}` : base, part: part?.key || null, score: part?.score ?? 0, title, kind, lines: [] }; groups.push(group); };
  // 묶음을 닫는다: 머리만 있고 아래 줄이 없으면 머리가 곧 그 묶음의 한 줄(standalone — 이름을 따로 보이지 않는다).
  // 아래 줄이 있으면 머리는 이름으로만 남고, 머리가 점수 줄이었으면 그 표시를 묶음에 남긴다.
  const close = () => {
    if (!group?.head) return;
    if (!group.lines.length) { group.lines.push(group.head); group.standalone = true; }
    else group.headScore = group.head.score;
  };
  for (const line of String(text).split('\n')) {
    // 빈칸 차례는 모든 줄에서 센다 — 제출본에서 세는 pendingsOf와 같은 id가 나와야 한다.
    const pendingIds = [...line.matchAll(/\[확인 필요:?\s*([^\]]*)\]/g)].map(match => ({ id: `${chapter}:${++pendingNo}`, what: match[1].trim() || '내용' }));
    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      close();
      if (heading[1] === '###') {
        const title = squash(heading[2]);
        part = parts.find(entry => title.includes(squash(entry.title))) || (parts.length === 1 ? parts[0] : part);
        group = null;
      } else if (heading[1] === '####') open(heading[2].trim(), 'heading');
      continue;
    }
    const isHead = /^\s*o\s/.test(line);
    if (isHead) { close(); open(bodyOf(line), 'o'); }
    if (!line.includes(MARK)) continue;
    // 머리의 아랫줄은 글머리 줄(-, ․, ※, *, ·)뿐이다. 표 줄이나 맨 줄이 오면 앞 묶음을 닫는다 — 머리가 표 줄을 아랫줄로 삼아 빠졌다(11-14).
    if (!isHead && group && !/^\s*[-․※*·]\s/.test(line)) { close(); group = null; }
    if (!group) open(bodyOf(line), 'line');
    const body = bodyOf(line);
    const tier = PENDING.test(line) ? '값' : (body.match(/→/g) || []).length >= 2 ? '약속' : '문구';
    const key = lineKeyOf(chapter, body);
    const entry = { id: key, text: body, tier, score: isScore(body), pendings: pendingIds, moved: tier === '문구' && Boolean(moved[key]), part: group.part, groupTitle: group.title };
    // 묶음 머리(「o [제안] …」)는 아래 줄이 붙으면 묶음 이름으로만 쓰고 고를 줄로 세지 않는다(11-14 — 제목이 줄로 한 번 더 들어갔다).
    // 아래 줄이 없으면 그 줄이 곧 내용이다 — 그때 줄로 넣는다(close). 빈칸이 든 머리는 채울 칸이 있어야 하니 바로 줄로.
    if (isHead && tier !== '값') { group.head = entry; group.title = body; continue; }
    group.lines.push(entry);
  }
  close();
  const kept = groups.filter(entry => entry.lines.length);
  const byScore = (a, b) => b.score - a.score;
  const pick = test => kept.map(entry => ({ ...entry, lines: entry.lines.filter(test) })).filter(entry => entry.lines.length).sort(byScore);
  const promises = pick(line => line.tier === '약속');
  // 사람이 옮긴 문구 줄은 한 묶음으로 따로 — 「할 수 있나」에서 같이 정한다.
  const movedLines = kept.flatMap(entry => entry.lines.filter(line => line.moved));
  if (movedLines.length) promises.push({ id: `${chapter}|옮김`, part: null, score: 0, title: '사람이 약속으로 옮긴 줄', kind: 'moved', lines: movedLines });
  // 문구는 묶음째 받기/빼기(11-16 C) — 설문 문항·연도별 일정·조직 설명은 말씨가 아니라 내용이라 한 번에 정한다. 기본은 받기.
  // 열쇠는 「묶음 id|문구」 — 같은 묶음에 약속 줄과 문구 줄이 섞이면 묶음 id가 같아 고른 것이 섞인다.
  const wording = pick(line => line.tier === '문구' && !line.moved).map(entry => ({ ...entry, pickId: wordingPickId(entry.id), hasScore: Boolean(entry.headScore) || entry.lines.some(line => line.score) }));
  return { promises, wording, values: pick(line => line.tier === '값'), total: kept.reduce((sum, entry) => sum + entry.lines.length, 0) };
}
export const wordingPickId = groupId => `${groupId}|문구`;

const count = list => list.reduce((sum, entry) => sum + entry.lines.length, 0);

// choices_ 파일(마크다운). 화면이 없을 때도 같은 갈래로 본다.
export function choicesSheet(text, { title = '', parts = [], checks = [] } = {}) {
  const { promises, wording, values, total } = choicesOf(text, { parts, checks });
  // 머리 하나뿐인 묶음은 이름을 따로 보이지 않는다(그 줄이 곧 이름). 머리가 점수 줄이었으면 이름에 ★.
  const label = entry => [entry.part ? `${entry.part}${entry.score ? ` (${entry.score}점)` : ''}` : '', entry.standalone ? '' : `${entry.title}${entry.headScore ? ' ★점수 줄' : ''}`].filter(Boolean).join(' · ');
  const line = item => `  - ${item.text}${item.score ? ' ★점수 줄' : ''}`;
  const out = [`# 고를 것 — ${title}`, '', `제안 ${total}줄. 누를 것은 약속 ${promises.length}묶음이다. 문구는 묶음째 받기/빼기(기본은 받기), 값은 빈 데 채우기로 간다. ★점수 줄은 판정이 채점 기준의 답으로 고른 줄이라 지우면 그 답이 사라질 수 있다.`, ''];
  out.push(`## 할 수 있나 — 약속 ${promises.length}묶음 · ${count(promises)}줄 (배점 큰 절부터)`, '');
  for (const entry of promises) out.push(`- [ ] 다 할 수 있다 / [ ] 뺄 줄 있음 — ${label(entry)}`, ...entry.lines.map(line), '');
  out.push(`## 채울 값 — ${count(values)}줄 (빈 데 채우기)`, '');
  for (const entry of values) out.push(`- ${label(entry)}`, ...entry.lines.map(line));
  out.push('', `## 문구 ${wording.length}묶음 · ${count(wording)}줄 — 묶음째 받기/빼기, 기본은 받기`, '');
  for (const entry of wording) out.push(`- [x] 받기 / [ ] 빼기 — ${label(entry)}`, ...entry.lines.map(line));
  return out.join('\n');
}
