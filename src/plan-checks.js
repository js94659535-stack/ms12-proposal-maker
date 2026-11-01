// 장을 건너 보는 검사(11-05). 장 하나만 보는 checkDraft로는 안 보이는 것 — 장끼리 형식이 다르거나, 같은 말을 여러 절에서 되풀이한다.
// 둘 다 warn이다(대원칙 ②). 고칠지는 사람이 정한다.
import { stripMarks } from './proposal-draft.js';

// 소제목 노릇을 하는 줄의 모양. 글머리표(o · - · ․ · ※)는 장마다 쓰는 양이 달라도 되므로 보지 않는다.
const HEADING_KINDS = [
  { kind: '#### 소제목', test: line => /^####\s/.test(line) },
  { kind: '「**1. 제목**」', test: line => /^\*\*\s*\d+[.)]/.test(line) },
  { kind: '「**제목**」', test: line => /^\*\*[^*]+\*\*\s*$/.test(line) && !/^\*\*\s*\d+[.)]/.test(line) },
  { kind: '「1. 제목」', test: line => /^\d+[.)]\s/.test(line) },
  { kind: '「가. 제목」', test: line => /^[가-하][.)]\s/.test(line) }
];

export function headingKinds(text) {
  const kinds = new Set();
  for (const line of String(text).split('\n').map(value => value.trim())) {
    for (const entry of HEADING_KINDS) if (entry.test(line)) kinds.add(entry.kind);
  }
  return kinds;
}

// 장마다 글머리(소제목) 모양이 같은가. 어떤 모양을 일부 장만 쓰면 warn — 적은 쪽 장들을 적는다.
// 근거(11-03 한 편): Ⅴ장만 「**1. 홍보 기본 방향**」을 쓰고, 다른 네 장은 「###」 아래 o·-만 쓴다.
export function headingStyleChecks(chapters) {
  if (chapters.length < 2) return [];
  const used = chapters.map(chapter => ({ title: chapter.title, kinds: headingKinds(chapter.text) }));
  const out = [];
  for (const { kind } of HEADING_KINDS) {
    const with_ = used.filter(chapter => chapter.kinds.has(kind));
    const without = used.filter(chapter => !chapter.kinds.has(kind));
    if (!with_.length || !without.length) continue;
    const names = list => list.map(chapter => chapter.title).join(', ');
    const odd = with_.length <= without.length ? with_ : without;
    const detail = odd === with_ ? `${names(with_)}만 ${kind} 소제목을 쓴다 — ${names(without)}에는 없다` : `${names(without)}에만 ${kind} 소제목이 없다 — ${names(with_)}는 쓴다`;
    out.push({ level: 'warn', what: '장마다 글머리 모양이 다름', detail, kind, chapters: odd.map(chapter => chapter.title) });
  }
  return out;
}

// 줄을 비교할 모양으로 — 출처 표시·글머리·굵게를 떼고 빈칸을 하나로.
export const plain = line => stripMarks(line).replace(/^\s*(?:o|-|․|※|\*|·|\d+\.)\s+/, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const letters = value => [...String(value).replace(/[^\p{L}\p{N}]/gu, '')];
const pairsOf = value => { const chars = letters(value); return new Set(chars.slice(1).map((char, index) => chars[index] + char)); };

// 같은 문장으로 보는 문턱(두 글자 조각의 Dice). 11-03 한 편(222줄, 절이 다른 짝 21,865개)에서 쟀다:
// 0.8 이상 8짝은 모두 되풀이(공정한 참여 기준 셋, 평가 우대, 결과물 소유, 중간보고, 기관 실적, 홈페이지),
// 0.7로 내리면 「[확인 필요: …]」만 닮은 줄이 들어온다. 표본 한 편의 값이다 — 다른 공고에서 다시 잰다(대원칙 ④).
export const REPEAT_DICE = 0.8;
const MIN_LETTERS = 15;

export function dice(a, b) {
  const left = pairsOf(a); const right = pairsOf(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const pair of left) if (right.has(pair)) shared++;
  return (2 * shared) / (left.size + right.size);
}

// 절마다 줄을 모은다. 절은 「### …」 소제목 단위이고, 장을 건너서도 본다.
export function sectionLines(chapters) {
  const lines = [];
  for (const chapter of chapters) {
    let part = chapter.title;
    for (const raw of String(chapter.text).split('\n')) {
      const heading = raw.match(/^###\s+(\S+)/);
      if (heading) { part = heading[1]; continue; }
      if (!raw.trim() || /^#/.test(raw)) continue;
      const text = plain(raw);
      if (letters(text).length >= MIN_LETTERS) lines.push({ part, text });
    }
  }
  return lines;
}

// 같은 문장이 여러 절에 되풀이되면 warn. 닮은 줄을 한 무리로 묶어 무리 하나에 warn 하나.
// 같은 절 안의 되풀이만 있는 무리는 내지 않는다(그건 절 안의 문장 다듬기).
export function repeatedLineChecks(chapters, { threshold = REPEAT_DICE } = {}) {
  const lines = sectionLines(chapters);
  const parent = lines.map((_, index) => index);
  const root = index => (parent[index] === index ? index : (parent[index] = root(parent[index])));
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (dice(lines[i].text, lines[j].text) >= threshold) parent[root(j)] = root(i);
    }
  }
  const groups = new Map();
  lines.forEach((line, index) => { const key = root(index); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(line); });
  const out = [];
  for (const group of groups.values()) {
    const parts = [...new Set(group.map(line => line.part))];
    if (parts.length < 2) continue;
    out.push({ level: 'warn', what: '같은 문장이 여러 절에 되풀이됨', detail: `「${group[0].text.slice(0, 40)}${group[0].text.length > 40 ? '…' : ''}」 — ${parts.join('·')} ${parts.length}곳. 한 곳만 남길지 정한다`, parts, lines: group.map(line => `${line.part}: ${line.text}`) });
  }
  return out;
}

export const checkChapters = chapters => [...headingStyleChecks(chapters), ...repeatedLineChecks(chapters)];
