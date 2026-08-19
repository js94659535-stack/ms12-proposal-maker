import { classifyDocument } from './doc-classify.js';
// 「신청서 서식 규격표」 — 공모신청서·사업계획서 서식에서 작성 항목·분량·필수 표·예산 양식·첨부서류를 읽는다.
// 규칙 기반 로컬 처리만 하고 외부 API를 호출하지 않는다. 서식에 없는 기준은 만들지 않는다.
export const FORM_SOURCE_TYPES = ['공모신청서', '사업계획서 서식', '예산 편성 기준', '세부 공고문'];
export const SPEC_STATUSES = ['확인됨', '확인 필요'];
export const SPEC_TABLE_KINDS = ['예산표', '일정표', '성과지표표', '대상표', '인력표', '기타'];

const clean = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const number = value => Number(String(value).replace(/[,\s]/g, ''));

// 서식 자료만 본다. 공고 본문 요약이나 기관자료를 서식 기준으로 삼지 않는다.
export function formSources(manualSources = []) {
  const usable = (manualSources || []).filter(item => item?.extractionStatus === 'success' && String(item.extractedText || '').trim());
  // 문서 종류를 잘못 골랐어도 서식을 못 읽고 끝나지 않는다.
  // 사용자가 고른 종류를 먼저 믿고, 그렇지 않은 자료는 내용으로 다시 본다.
  return usable
    .map(item => {
      if (FORM_SOURCE_TYPES.includes(item.sourceType)) return { item, sourceType: item.sourceType };
      const guess = classifyDocument(item.fileName, item.extractedText);
      return FORM_SOURCE_TYPES.includes(guess.kind) ? { item, sourceType: guess.kind } : null;
    })
    .filter(Boolean)
    .map(({ item, sourceType }) => ({ id: item.id, fileName: clean(item.fileName, 120), sourceType, text: String(item.extractedText) }));
}
function linesOf(source) {
  return String(source.text).split(/\n+|(?=[○●▶▸□■※])/)
    .map(line => clean(line, 400)).filter(line => line.length > 1)
    .map((line, index) => ({ line, index, location: `${source.fileName} · ${source.sourceType}` }));
}

// ---------- 작성 항목과 분량 ----------
// 「1. 사업 필요성 (1,000자 이내)」 「□ 사업개요 ※ 2쪽 이내」처럼 항목명과 제한이 같은 줄이나 다음 줄에 온다.
// 실제 서식의 작성 항목은 번호·글머리 기호를 달고 있다(1. / 1) / 가.).
// 표 안의 칸 이름이나 문장 조각을 항목으로 잘못 올리지 않도록 번호가 붙은 줄만 항목으로 본다.
const ITEM_LINE = /^(?:[□■○●▶▸※\s]*)?(\d{1,2}|[가-힣])\s*[.)]\s*([가-힣A-Za-z][^:：\[]{1,48}?)\s*(?:[:：]|\[|※|$)/;
const CHAR_LIMIT = /(\d[\d,]*)\s*자\s*(?:이내|이하|내외|까지)/;
const PAGE_LIMIT = /(\d[\d,]*)\s*(?:쪽|페이지|p)\s*(?:이내|이하|내외|까지)/i;
// 서식의 작성 항목으로 볼 만한 이름만 남긴다(안내문·머리말과 구분).
const ITEM_HINT = /문제\s*의식|지향점|전략|차별성|강점|모집|연계|협력|산출목표|필요성|목적|목표|대상|프로그램|사업\s*내용|사업명|추진|일정|인력|조직|수행\s*체계|예산|성과|지표|평가|기대|효과|개요|배경|계획|방법|방안|홍보|협력|사후|문제|지향|차별성|강점|전략|선정|모집|참여자|활용/;
// 신뢰성·회계 점검표의 선택지와 안내 문항은 계획서 작성 항목이 아니다.
const ITEM_SKIP = /제출\s*서류|첨부|유의|안내|문의|접수|신청\s*방법|작성\s*요령|서식\s*\d|붙임|해당\s*(?:없음|있음)|회계부정|인권침해|조사\/수사|재판|처분|체크|서명|동의/;

// 작성 항목은 신청서·계획서 서식에서만 읽는다. 공고문의 조항·안내 문장을 작성 항목으로 오인하지 않는다.
export const ITEM_SOURCE_TYPES = ['공모신청서', '사업계획서 서식'];
export function extractFormItems(sources) {
  const marked = sources.filter(item => ITEM_SOURCE_TYPES.includes(item.sourceType));
  // 사용자가 종류를 잘못 골랐거나 자동 분류가 애매해도 작업을 멈추지 않는다.
  const pool = marked.length ? marked : sources.filter(item => item.extractionStatus === 'success');
  return readFormItems(pool);
}

function readFormItems(sources) {
  const items = [];
  for (const source of sources) {
    const lines = linesOf(source);
    for (const entry of lines) {
      const matched = ITEM_LINE.exec(entry.line);
      if (!matched) continue;
      // 「3. 문제 의식(사업 필요성)」처럼 괄호 안이 진짜 이름인 서식이 있다. 괄호까지 이름으로 읽는다.
      // 다만 「1. 사업 필요성 (1,000자 이내)」의 괄호는 분량 표기이므로 이름에서 뗀다.
      const name = clean(matched[2], 60).replace(/\s*[(（][^)）]*(?:자|쪽|페이지|p)\s*(?:이내|이하|내외|까지)[^)）]*[)）]\s*$/i, '').trim();
      if (name.length < 2 || !ITEM_HINT.test(name) || ITEM_SKIP.test(entry.line)) continue;
      // 제한은 같은 줄이나 바로 다음 줄에서 찾는다.
      const window = [entry.line, lines[entry.index + 1]?.line || ''].join(' ');
      const chars = CHAR_LIMIT.exec(window);
      const pages = PAGE_LIMIT.exec(window);
      if (items.some(item => item.name === name)) continue;
      items.push({
        id: `form-item-${items.length + 1}`,
        order: Number(matched[1]) || items.length + 1,
        name,
        limitChars: chars ? number(chars[1]) : 0,
        limitPages: pages ? number(pages[1]) : 0,
        status: chars || pages ? '확인됨' : '확인 필요',
        evidence: entry.line, location: entry.location
      });
      if (items.length >= 25) break;
    }
  }
  return items;
}

// ---------- 필수 표와 예산 양식 ----------
const TABLE_HINTS = [
  { kind: '예산표', pattern: /예산\s*(?:산출|내역|편성|계획)|산출\s*내역|사업비\s*내역/ },
  { kind: '일정표', pattern: /추진\s*일정|월별\s*일정|세부\s*일정|진행\s*일정|사업\s*일정/ },
  { kind: '성과지표표', pattern: /성과\s*지표|측정\s*계획|평가\s*계획|목표\s*및\s*평가|성과\s*측정/ },
  { kind: '대상표', pattern: /참여자\s*(?:구성|현황|선정)|대상\s*현황|모집\s*계획|참여\s*대상|대상\s*및\s*인원/ },
  { kind: '인력표', pattern: /인력\s*(?:구성|현황)|담당\s*인력|수행\s*인력/ }
];
const TABLE_MARK = /\[표|<표|표\s*\d|서식\s*\d|양식|아래\s*표|다음\s*표|표로|기재\s*표/;
// 표 머리행처럼 보이는 줄에서 열 이름을 읽는다. 서식에 없는 열은 만들지 않는다.
const COLUMN_SPLIT = /\s*[|｜\t]\s*|\s{2,}/;
function columnsFrom(line) {
  const parts = String(line || '').replace(/^[□■○●▶▸※\-\s]+/, '').split(COLUMN_SPLIT).map(part => clean(part, 30)).filter(Boolean);
  return parts.length >= 2 && parts.length <= 8 && parts.every(part => part.length <= 20) ? parts : [];
}
// HWP에서 뽑은 표는 칸 하나가 한 줄이 된다. 제목 다음의 짧은 줄들을 열 이름으로 읽는다.
const CELL_STOP = /^[○●▶▸□■\-]|^\s*[0-9가-힣]+\s*[.)]\s/;
function columnsFromCells(lines, startIndex) {
  const picked = [];
  for (const entry of lines.slice(startIndex + 1, startIndex + 14)) {
    const line = entry.line.trim();
    if (/^[(（※]/.test(line)) continue; // 단위 표시·주석 줄은 열 이름이 아니다
    if (CELL_STOP.test(line) || line.length > 14 || /[.。!?]$/.test(line)) break;
    picked.push(clean(line, 30));
    if (picked.length >= 8) break;
  }
  return picked.length >= 2 ? picked : [];
}

export function extractFormTables(sources) {
  const tables = [];
  for (const source of sources) {
    const lines = linesOf(source);
    for (const entry of lines) {
      const hint = TABLE_HINTS.find(item => item.pattern.test(entry.line));
      if (!hint) continue;
      const columns = columnsFrom(lines[entry.index + 1]?.line || '') || [];
      const cells = columns.length ? columns : columnsFromCells(lines, entry.index);
      if (!TABLE_MARK.test(entry.line) && !cells.length) continue;
      if (tables.some(item => item.kind === hint.kind)) continue;
      tables.push({
        id: `form-table-${tables.length + 1}`, kind: hint.kind,
        title: clean(entry.line.replace(/^[□■○●▶▸※\-\s]+/, ''), 60),
        columns: cells,
        required: true, status: cells.length ? '확인됨' : '확인 필요',
        evidence: entry.line, location: entry.location
      });
    }
  }
  return tables;
}

// 예산 양식은 열 구성과 편성 규칙을 함께 남긴다.
const BUDGET_RULE = /이내|이하|이상|초과할 수 없|넘을 수 없|비율|%|자부담|보조율|편성|불가/;
// 심사기준 문장, 표 칸 이름, 항목 제목은 예산 편성 기준이 아니다.
const BUDGET_RULE_SKIP = /심사\s*기준|평가\s*기준|심사\s*방법|배점|진행과정/;
const BUDGET_HEADING = /^[□■○●▶▸※\-\s]*\d{1,2}\s*[.)]\s*\S{0,12}$/;
export function extractBudgetForm(sources) {
  const table = extractFormTables(sources).find(item => item.kind === '예산표') || null;
  const rules = [];
  for (const source of sources) {
    for (const entry of linesOf(source)) {
      if (!/예산|사업비|인건비|자부담|보조/.test(entry.line) || !BUDGET_RULE.test(entry.line)) continue;
      // 기준으로 읽을 만한 문장만 남긴다(표 칸 이름·제목 줄 제외).
      if (entry.line.replace(/\s/g, '').length < 12 || BUDGET_HEADING.test(entry.line) || BUDGET_RULE_SKIP.test(entry.line)) continue;
      if (rules.some(item => item.text === entry.line)) continue;
      rules.push({ text: entry.line, location: entry.location });
      if (rules.length >= 6) break;
    }
  }
  if (!table && !rules.length) return null;
  return {
    columns: table?.columns || [], title: table?.title || '예산 양식',
    rules, status: table?.columns?.length ? '확인됨' : '확인 필요',
    evidence: table?.evidence || rules[0]?.text || '', location: table?.location || rules[0]?.location || ''
  };
}

// ---------- 첨부서류 ----------
const ATTACH_HEADING = /제출\s*서류|첨부\s*서류|구비\s*서류|필수\s*서류/;
// 제출서류 목록은 번호를 달고 짧게 적힌다. 안내 문장·규정 설명을 서류명으로 올리지 않는다.
const ATTACH_ITEM = /^[①-⑮]\s*(.+)$|^\(?\d{1,2}\)?[.)]\s*(.+)$/;
const ATTACH_SENTENCE = /(?:다|함|음|됨|니다|바랍니다|가능|주의|불가)\.?$|https?:|초과할 수 없|압축/;
export function extractAttachments(sources) {
  const attachments = [];
  for (const source of sources) {
    const lines = linesOf(source);
    for (const entry of lines) {
      if (!ATTACH_HEADING.test(entry.line)) continue;
      for (const next of lines.slice(entry.index + 1, entry.index + 16)) {
        if (ATTACH_HEADING.test(next.line)) break;
        const matched = ATTACH_ITEM.exec(next.line);
        const name = clean(matched?.[1] || matched?.[2] || '', 60);
        if (!name || name.length < 3 || name.length > 40 || ATTACH_SENTENCE.test(name)) continue;
        if (attachments.some(item => item.name === name)) continue;
        attachments.push({
          id: `form-attach-${attachments.length + 1}`, name,
          required: !/선택|해당\s*시|필요\s*시/.test(next.line),
          status: '확인됨', evidence: next.line, location: next.location
        });
        if (attachments.length >= 20) break;
      }
    }
  }
  return attachments;
}

// ---------- 규격표 한 장 ----------
export function buildFormSpec(manualSources = []) {
  const sources = formSources(manualSources);
  if (!sources.length) return null;
  const items = extractFormItems(sources);
  const tables = extractFormTables(sources);
  const budgetForm = extractBudgetForm(sources);
  const attachments = extractAttachments(sources);
  const withLimit = items.filter(item => item.limitChars || item.limitPages).length;
  return {
    sources: sources.map(source => ({ fileName: source.fileName, sourceType: source.sourceType, chars: source.text.length })),
    items, tables, budgetForm, attachments,
    totalLimitChars: items.reduce((sum, item) => sum + (item.limitChars || 0), 0),
    // 무엇을 읽었고 무엇을 아직 확인하지 못했는지 그대로 남긴다.
    openPoints: [
      ...(items.length ? [] : ['서식에서 작성 항목을 찾지 못했습니다.']),
      ...(withLimit ? [] : ['서식에서 항목별 분량 제한을 찾지 못했습니다.']),
      ...(tables.length ? [] : ['서식에서 필수 표를 찾지 못했습니다.']),
      ...(budgetForm ? [] : ['서식에서 예산 양식을 찾지 못했습니다.']),
      ...(attachments.length ? [] : ['서식에서 첨부서류 목록을 찾지 못했습니다.'])
    ],
    status: items.length && withLimit ? '확인됨' : '확인 필요'
  };
}

// ---------- 설계안 반영 ----------
// 서식 항목명을 계획서 목차 키에 잇는다. 이름이 맞지 않으면 억지로 잇지 않는다.
const OUTLINE_MATCH = {
  necessity: /필요성|배경|현황|문제/, purpose: /목적|취지/, goals: /목표/, target: /대상|참여자/,
  programs: /프로그램|사업\s*내용|추진\s*내용|활동|방법/, schedule: /일정|추진\s*계획|기간/,
  roles: /인력|조직|수행\s*체계|역할|협력/, budget: /예산|사업비/,
  indicators: /지표|측정|평가/, outcomes: /기대|효과|사후|지속/
};
// 서식이 정한 분량과 필수 표를 설계안 목차에 반영한다. 서식에 없으면 기존 기본값을 그대로 둔다.
export function applyFormSpecToOutline(outline, formSpec) {
  if (!formSpec?.items?.length) return outline.map(item => ({ ...item, limitSource: '기본값' }));
  return outline.map(item => {
    const pattern = OUTLINE_MATCH[item.key];
    const matched = pattern ? formSpec.items.find(entry => pattern.test(entry.name)) : null;
    if (!matched || (!matched.limitChars && !matched.limitPages)) return { ...item, formItem: matched?.name || '', limitSource: '기본값' };
    // 쪽수만 있으면 한 쪽을 1,600자로 본다(서식이 글자 수를 정하지 않은 경우의 환산 기준).
    const target = matched.limitChars || matched.limitPages * 1600;
    return {
      ...item, formItem: matched.name, title: matched.name || item.title,
      targetChars: target, limitChars: matched.limitChars, limitPages: matched.limitPages,
      limitSource: '신청서 서식', evidence: matched.evidence, location: matched.location
    };
  });
}
// 서식이 요구한 표는 공고 기준으로 만든 표 계획과 합친다. 같은 종류는 서식 쪽을 우선한다.
export function mergeFormTables(planTables = [], formSpec) {
  const formTables = (formSpec?.tables || []).map(table => ({
    id: table.id, kind: table.kind, title: table.title,
    columns: table.columns, source: '신청서 서식', evidence: table.evidence, location: table.location
  }));
  const rest = planTables.filter(table => !formTables.some(entry => entry.kind === table.kind));
  return [...formTables, ...rest];
}

// 올린 서식의 작성 항목 전체를 문서 뼈대로 만든다.
//
// 왜 필요한가. 우리 표준 10항목만 배치하면 서식의 나머지 항목은 빈칸으로 남고, 사용자가
// 결국 신청서에 옮겨 적게 된다. 제출하는 문서는 기관 서식이므로 그 항목 전부를 자리로 둔다.
// 생성은 지금처럼 표준 10항목으로 하고, 배치만 서식 순서를 따른다.
export function formItemSkeleton(formSpec, outline = []) {
  const items = formSpec?.items || [];
  if (!items.length) return [];
  // 우리 항목이 어느 서식 항목에 붙었는지 먼저 확인한다(이름이 같으면 그 자리로 간다).
  const byName = new Map();
  for (const entry of outline) {
    if (entry.formItem) byName.set(entry.formItem, entry.key);
  }
  return items.map((item, index) => {
    // 이름으로 못 찾으면 뜻으로 찾는다. 그래도 없으면 빈 자리로 두고 지어내지 않는다.
    const guessed = Object.entries(OUTLINE_MATCH).find(([, pattern]) => pattern.test(item.name))?.[0] || '';
    return {
      key: byName.get(item.name) || guessed,
      title: item.name,
      formItem: item.name,
      order: index + 1,
      limitChars: item.limitChars || 0,
      limitPages: item.limitPages || 0,
      limitSource: item.limitChars || item.limitPages ? '신청서 서식' : '기본값',
      evidence: item.evidence, location: item.location
    };
  });
}
