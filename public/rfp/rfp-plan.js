// 목차표와 평가표를 함께 읽어 절마다 작성지시를 만든다(10-06).
//
// 목차표(「목차 · 작성내용 · 비고」)가 제출 목차다. 평가표는 그 절들에 붙는 채점 기준이다.
// 모두 공고 글자에서 읽는다 — 절 이름·쪽수·배점·서체를 코드에 적지 않는다.
// 목차표가 없으면 평가표를 목차로 쓰고(10-05), 둘 다 없으면 양식 기반으로 물러난다.
import { readRfp, splitPoints } from './rfp-read.js';

const squash = value => String(value ?? '').replace(/\s+/g, '');
const tidy = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const cellsOf = line => line.split('\t').map(cell => cell.trim());
const linesOf = text => String(text || '').replace(/\r\n?/g, '\n').split('\n');

const ROMAN = /^([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]|[IVX]{1,4})\s*\.?\s*/;
const NUMBERED = /^(\d{1,2})\s*[.)]\s*/;
const PAGE_NOTE = /(?:A4\s*)?(\d+)\s*(?:page|pages|쪽|페이지|p)\b\s*(이내|이하)?|자유\s*분량/i;

// 「o 큰 줄  - 작은 줄」 꼴의 작성내용을 쓸 거리 목록으로 나눈다.
function contentPoints(text) {
  return splitPoints(String(text || '').replace(/(^|\s)[oㅇ]\s+/g, '$1✤ '));
}

// ---------- 1) 목차표 ----------
export function readToc(text) {
  const lines = linesOf(text);
  const start = lines.findIndex(line => {
    const cells = cellsOf(line).map(squash);
    return line.includes('\t') && cells.some(cell => cell === '목차') && cells.some(cell => /작성내용|^내용$/.test(cell));
  });
  if (start < 0) return null;
  const rows = [];
  for (let index = start + 1; index < lines.length && lines[index].trim(); index += 1) {
    const cells = cellsOf(lines[index]).filter(Boolean);
    if (!cells.length) continue;
    const [head, ...rest] = cells;
    const note = rest.find(cell => PAGE_NOTE.test(cell)) || (PAGE_NOTE.test(head) ? null : null);
    const content = rest.filter(cell => cell !== note).join(' ');
    const match = note?.match(PAGE_NOTE);
    const pages = !match ? null : /자유/.test(match[0]) ? { free: true } : { pages: Number(match[1]), max: Boolean(match[2]) };
    const roman = head.match(ROMAN);
    const numbered = head.match(NUMBERED);
    if (roman && !numbered) rows.push({ level: 1, mark: roman[1], title: tidy(head.slice(roman[0].length)), content, pages, quote: tidy(lines[index]) });
    else if (numbered) rows.push({ level: 2, mark: numbered[1], title: tidy(head.slice(numbered[0].length)), content, pages, quote: tidy(lines[index]) });
    else rows.push({ level: 0, mark: null, title: tidy(head), content, pages, quote: tidy(lines[index]) });
  }
  // 장(Ⅰ·Ⅱ…) 아래에 절(1·2…)을 단다.
  const front = [];
  const chapters = [];
  for (const row of rows) {
    if (row.level === 0) { front.push(row); continue; }
    if (row.level === 1) { chapters.push({ ...row, key: row.mark, children: [] }); continue; }
    const chapter = chapters.at(-1);
    if (chapter) chapter.children.push({ ...row, key: `${chapter.mark}.${row.mark}` });
  }
  return chapters.length ? { front, chapters } : null;
}

// 쓰는 단위(잎): 절이 있으면 절, 없으면 장 자체.
const leavesOf = toc => toc.chapters.flatMap(chapter => chapter.children.length
  ? chapter.children.map(child => ({ ...child, chapter }))
  : [{ ...chapter, chapter }]);

// ---------- 2) 평가 항목을 절에 붙이기 ----------
// 글자 2-gram 겹침. 여러 절에 두루 나오는 2-gram(「프로그램」「방안」)은 가볍게 센다(IDF).
const grams = value => {
  const text = String(value).replace(/[^\p{L}\p{N}]/gu, '');
  const out = new Set();
  for (let index = 0; index < text.length - 1; index += 1) out.add(text.slice(index, index + 2));
  return out;
};
function scorer(documents) {
  const sets = documents.map(grams);
  const df = gram => sets.filter(set => set.has(gram)).length;
  return (query, index) => {
    let hit = 0;
    let all = 0;
    for (const gram of grams(query)) {
      const count = df(gram);
      if (!count) continue;
      const weight = Math.log((sets.length + 1) / count);
      all += weight;
      if (sets[index].has(gram)) hit += weight;
    }
    return all ? hit / all : 0;
  };
}
const overlap = (left, right) => {
  const a = grams(left);
  const b = grams(right);
  let hit = 0;
  for (const gram of a) if (b.has(gram)) hit += 1;
  return a.size ? hit / a.size : 0;
};

export const MATCH = { weak: 0.35, close: 0.75, titleBoost: 0.5 };

export function attachEvaluation(toc, evaluation, chosen) {
  const leaves = leavesOf(toc);
  const score = scorer(leaves.map(leaf => `${leaf.chapter.title} ${leaf.title} ${leaf.content}`));
  const attachments = leaves.map(() => []);
  const crossCutting = [];
  for (const item of chosen) {
    const points = item.points.length ? item.points : [{ point: item.name, details: [] }];
    for (const point of points) {
      const query = [point.point, ...point.details].join(' ');
      const ranked = leaves
        .map((leaf, index) => ({ index, value: score(query, index) + MATCH.titleBoost * overlap(item.name, `${leaf.chapter.title} ${leaf.title}`) }))
        .sort((a, b) => b.value - a.value);
      const [best, second] = ranked;
      if (!best || best.value < MATCH.weak) { crossCutting.push({ item: item.name, point: point.point, best: best ? leaves[best.index].key : null, value: best?.value ?? 0 }); continue; }
      const targets = second && second.value >= best.value * MATCH.close ? [best, second] : [best];
      const share = item.score / points.length / targets.length;
      for (const target of targets) {
        attachments[target.index].push({ item: item.name, point: point.point, details: point.details, share, confident: targets.length === 1, value: Number(target.value.toFixed(2)) });
      }
    }
  }
  return { leaves, attachments, crossCutting };
}

// ---------- 3) 동점 우선순위 ----------
// 「…동일한 경우에는 기술능력평가 항목중 1. 가 2. 나 3. 다 항목순으로…」에서 순서를 읽는다.
export const PRIORITY_STEP = 0.1;
export function readPriority(text, items) {
  // 「1. 신규 프로그램」의 마침표에서 자르지 않도록 「…다.」「…함.」「…음.」에서만 문장을 나눈다.
  for (const sentence of linesOf(text).join(' ').split(/(?<=다\.|함\.|음\.)\s+/)) {
    if (!/동일|동점/.test(sentence) || !/우선/.test(sentence)) continue;
    const span = sentence.match(/항목\s*중\s*(.+?)\s*(?:항목\s*)?순(?:으로|서로|위로)?/);
    if (!span) continue;
    const names = span[1].split(/\s*\d+\s*[.)]\s*/).map(tidy).filter(Boolean);
    if (names.length < 2) continue;
    const found = names.map(name => items.find(item => squash(item.name) === squash(name) || squash(item.name).includes(squash(name)) || squash(name).includes(squash(item.name)))?.name || null);
    return {
      quote: tidy(sentence),
      order: names.map((name, index) => ({ name, item: found[index], rank: index + 1, multiplier: Number((1 + PRIORITY_STEP * (names.length - index)).toFixed(2)) }))
    };
  }
  return null;
}

// ---------- 5) 서체·규격 ----------
export function readFormat(text) {
  const lines = linesOf(text);
  const start = lines.findIndex(line => /^\s*□.*(규격|작성\s*형식|편집\s*기준|작성\s*요령)/.test(line));
  if (start < 0) return null;
  const block = [];
  for (let index = start + 1; index < lines.length && !/^\s*□/.test(lines[index]); index += 1) if (lines[index].trim()) block.push(lines[index]);
  const all = block.join('\n');
  const styles = [];
  for (const line of block) {
    const match = line.match(/\(\s*(\d+(?:\.\d+)?)\s*(?:point|pt|포인트)\s*,\s*([^)]+)\)/i);
    if (!match) continue;
    styles.push({ marker: tidy(line.slice(0, match.index)) || null, size: Number(match[1]), font: squash(match[2]) });
  }
  const pageLine = block.find(line => /쪽\s*번호|페이지\s*번호/.test(line) && !/표지/.test(line));
  return {
    heading: tidy(lines[start]),
    paper: /A4/i.test(all) ? 'A4' : null,
    orientation: /종방향|세로/.test(all) ? '세로' : /횡방향|가로/.test(all) ? '가로' : null,
    fileFormat: /hwp|한글\s*문서/i.test(all) ? 'hwp' : null,
    pageNumber: pageLine?.match(/(하단|상단)\s*(중앙|가운데|좌측|우측|왼쪽|오른쪽)/)?.[0] || null,
    cover: tidy(block.find(line => /표지/.test(line)) || '') || null,
    styles,
    notes: block.map(line => tidy(line.replace(/^[\s※o\-]+/, ''))).filter(line => line && !/\(\s*\d+(?:\.\d+)?\s*(?:point|pt|포인트)/i.test(line))
  };
}

// ---------- 4) 쪽수 ----------
// 정해진 쪽수(이내·고정)는 그대로, 자유분량 절은 전체 권장 쪽수에서 정해진 것을 뺀 나머지를 나눈다.
// 나눌 때 절반은 똑같이, 절반은 가중치대로 준다 — 배점이 직접 붙지 않은 절도 써야 하므로 0쪽이 되면 안 된다.
const half = value => Math.round(value * 2) / 2;
function share(total, weights) {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  const raw = weights.map(value => total / weights.length / 2 + (sum ? total * value / sum / 2 : total / weights.length / 2));
  const rounded = raw.map(value => Math.max(0.5, half(value)));
  // 반올림 오차를 가장 큰 칸에서 맞춘다.
  const diff = half(total - rounded.reduce((acc, value) => acc + value, 0));
  if (diff) rounded[rounded.indexOf(Math.max(...rounded))] += diff;
  return rounded;
}

function totalPages(constraints) {
  const caps = constraints.pageCaps.filter(cap => !/PPT|발표|ppt/.test(cap.subject));
  return caps.find(cap => /본\s*보고서/.test(cap.subject)) || caps.find(cap => /제안서|계획서/.test(cap.subject)) || null;
}

// AI에게 한 번에 맡기는 단위: 장 하나(그 아래 절 전부). 목차표가 없으면 평가 항목 하나.
export function writingUnits(plan) {
  if (!plan) return [];
  const units = [];
  for (const section of plan.sections) {
    const key = section.chapter ? section.key.split('.')[0] : section.key;
    let unit = units.find(entry => entry.key === key);
    if (!unit) {
      unit = { key, title: section.chapter || (plan.from === '목차표' ? `${section.key}. ${section.title}` : section.title), parts: [] };
      units.push(unit);
    }
    unit.parts.push(section);
  }
  return units.map(unit => ({
    ...unit,
    score: Number(unit.parts.reduce((acc, part) => acc + part.score, 0).toFixed(2)),
    weight: Number(unit.parts.reduce((acc, part) => acc + part.weight, 0).toFixed(2)),
    pages: unit.parts.every(part => part.pages) ? unit.parts.reduce((acc, part) => acc + part.pages.value, 0) : null,
    items: [...new Set(unit.parts.flatMap(part => part.scoring.map(entry => entry.item)))]
  }));
}

// ---------- 묶기 ----------
export function readPlan(text) {
  const base = readRfp(text);
  const { evaluation, outline, constraints } = base;
  const toc = readToc(text);
  const format = readFormat(text);
  const chosenItems = outline ? evaluation.items.filter(item => outline.sections.some(section => section.title === item.name)) : [];
  const priority = readPriority(text, chosenItems);
  const multiplier = name => priority?.order.find(entry => entry.item === name)?.multiplier ?? 1;

  if (!toc) {
    if (!outline) return { ...base, plan: null };
    // 목차표가 없으면 평가표가 목차다(10-05의 길).
    return {
      ...base,
      plan: {
        from: '평가표',
        format,
        priority,
        crossCutting: [],
        pages: null,
        sections: outline.sections.map(section => ({
          key: String(section.no), chapter: null, title: section.title, writeWhat: section.writeWhat,
          scoring: [{ item: section.title, point: null, details: [], share: section.score, confident: true }],
          score: section.score, weight: Number((section.score * multiplier(section.title)).toFixed(2)), pages: null
        }))
      }
    };
  }

  const { leaves, attachments, crossCutting } = chosenItems.length ? attachEvaluation(toc, evaluation, chosenItems) : { leaves: leavesOf(toc), attachments: leavesOf(toc).map(() => []), crossCutting: [] };
  const sections = leaves.map((leaf, index) => {
    const scoring = attachments[index];
    const scoreSum = scoring.reduce((acc, entry) => acc + entry.share, 0);
    const weight = scoring.reduce((acc, entry) => acc + entry.share * multiplier(entry.item), 0);
    return {
      key: leaf.key,
      chapter: leaf.chapter.children.length ? `${leaf.chapter.mark}. ${leaf.chapter.title}` : null,
      title: leaf.title,
      writeWhat: contentPoints(leaf.content),
      scoring,
      score: Number(scoreSum.toFixed(2)),
      weight: Number(weight.toFixed(2)),
      pages: leaf.pages && !leaf.pages.free ? { value: leaf.pages.pages, max: leaf.pages.max, basis: '목차표' } : null,
      quote: leaf.quote,
      _chapter: leaf.chapter
    };
  });

  // 장에 쪽수가 정해져 있고 절에는 없으면, 장 쪽수를 절에 가중치대로 나눈다.
  for (const chapter of toc.chapters) {
    const children = sections.filter(section => section._chapter === chapter && section.key !== chapter.key);
    if (!children.length || !chapter.pages || chapter.pages.free) continue;
    const open = children.filter(section => !section.pages);
    const fixed = children.filter(section => section.pages).reduce((acc, section) => acc + section.pages.value, 0);
    share(chapter.pages.pages - fixed, open.map(section => section.weight)).forEach((value, index) => { open[index].pages = { value, max: chapter.pages.max, basis: `장 ${chapter.pages.pages}쪽을 가중치로 나눔` }; });
  }

  // 자유분량: 전체 권장 쪽수 - 정해진 쪽수(표지·목차 포함).
  const total = totalPages(constraints);
  const frontPages = toc.front.reduce((acc, row) => acc + (row.pages?.pages || 0), 0);
  const free = sections.filter(section => !section.pages);
  const fixedPages = frontPages + sections.filter(section => section.pages).reduce((acc, section) => acc + section.pages.value, 0);
  let pages = { total: total?.maxPages ?? null, totalFrom: total?.subject ?? null, front: frontPages, fixed: fixedPages, free: null, assumption: '표지·목차를 전체 쪽수에 넣어 셈' };
  if (total && free.length) {
    const left = total.maxPages - fixedPages;
    pages.free = left;
    if (left > 0) share(left, free.map(section => section.weight)).forEach((value, index) => { free[index].pages = { value, max: true, basis: `자유분량: ${total.maxPages}쪽 - 정해진 ${fixedPages}쪽 = ${left}쪽을 가중치로 나눔` }; });
  }

  return {
    ...base,
    toc,
    plan: {
      from: '목차표',
      format,
      priority,
      crossCutting,
      pages,
      sections: sections.map(({ _chapter, ...section }) => section)
    }
  };
}
