// 올린 신청서 서식에 맞춰 작성한 내용을 배치한다.
//
// 왜 필요한가. 프로그램에서 다 쓰고도 사용자가 기관 신청서에 다시 옮겨 적으면 이중 작업이다.
// 서식이 정한 항목 이름·순서·표를 그대로 쓰고, 우리가 쓴 본문을 그 자리에 넣는다.
//
// 지키는 것 두 가지.
//  - 서식에 있는데 우리가 쓰지 않은 항목은 지어내지 않는다. [확인 필요]로 남긴다.
//  - 우리가 썼는데 서식에 없는 항목도 버리지 않는다. 뒤에 「서식 외 작성 내용」으로 붙인다.

const text = value => String(value ?? '').trim();
export const UNFILLED = '[확인 필요: 이 항목은 아직 작성하지 않았습니다]';
// 서식이 한 내용을 여러 항목으로 나눠 물을 때. 앞 자리에 쓴 글을 이 항목에 맞춰 나눠 적어야 한다.
export const SHARED = '[확인 필요: 앞 항목에 함께 썼습니다. 이 항목에 맞춰 나눠 적어 주세요]';

// 서식 항목 하나에 들어갈 본문을 찾는다. outline이 이미 서식 항목과 우리 항목을 이어 두었다.
function contentFor(item, sections) {
  const found = sections.find(section => section.id === item.key)
    || sections.find(section => text(section.title) && text(section.title) === text(item.title));
  return found ? text(found.content) : '';
}

// 서식이 요구한 표에 우리가 만든 표를 맞춘다. 종류(kind)가 같으면 같은 표로 본다.
function matchTable(formTable, tables) {
  return tables.find(table => table.kind && table.kind === formTable.kind)
    || tables.find(table => text(table.title) && text(table.title) === text(formTable.title))
    || null;
}

// 서식 표의 칸 이름 순서대로 줄을 다시 세운다. 서식에 없는 칸은 뒤에 붙여 잃지 않는다.
export function alignTableColumns(formTable, table) {
  const columns = (formTable?.columns || []).map(text).filter(Boolean);
  const rows = Array.isArray(table?.rows) ? table.rows.map(row => (Array.isArray(row) ? row.map(text) : [text(row)])) : [];
  if (!columns.length) return { title: formTable?.title || table?.title || '', rows, note: '' };
  if (!rows.length) {
    // 표를 아직 만들지 않았으면 빈 칸을 지어내지 않는다. 머리글만 남기고 확인하도록 둔다.
    return { title: formTable.title || '', rows: [columns, columns.map(() => UNFILLED)], note: '서식이 요구한 표입니다. 값을 채워 주세요.' };
  }
  const [header, ...body] = rows;
  const index = columns.map(name => header.findIndex(cell => text(cell) === name));
  const extra = header.map((cell, position) => (index.includes(position) ? -1 : position)).filter(position => position >= 0);
  const order = [...index, ...extra];
  const pick = row => order.map(position => (position >= 0 && position < row.length ? row[position] : ''));
  return {
    title: formTable.title || table.title || '',
    rows: [[...columns, ...extra.map(position => header[position])], ...body.map(pick)],
    note: index.some(position => position < 0) ? '서식 칸 가운데 값을 찾지 못한 칸이 있습니다. 확인해 주세요.' : ''
  };
}

// 서식대로 배치한 문서. 화면과 출력이 같은 결과를 쓴다.
export function fillFormLayout({ plan = null, sections = [], tables = [] } = {}) {
  // 서식 항목 전체를 자리로 둔다. 우리 표준 항목만 쓰면 나머지 서식 칸이 비어 결국 옮겨 적게 된다.
  const outline = (plan?.skeleton?.length ? plan.skeleton : plan?.outline) || [];
  const formTables = plan?.tables || [];
  if (!outline.length) {
    return { ok: false, reason: '올린 신청서 서식에서 작성 항목을 읽지 못했습니다.', sections: [], tables: [], filled: 0, unfilled: [], extra: [] };
  }

  const used = new Set();
  const unfilled = [];
  // 서식이 한 내용을 여러 항목으로 나눠 물으면 첫 자리에만 넣는다. 같은 글을 네 번 붙이지 않는다.
  const placedKeys = new Set();
  const laid = outline.map((item, position) => {
    const repeated = item.key && placedKeys.has(item.key);
    const content = repeated ? '' : contentFor(item, sections);
    if (content) placedKeys.add(item.key);
    const source = sections.find(section => section.id === item.key);
    if (source) used.add(source.id);
    if (!content) unfilled.push(item.formItem || item.title);
    const limit = item.limitChars || (item.limitPages ? item.limitPages * 1600 : 0);
    const chars = content.replace(/\s/g, '').length;
    return {
      id: item.key,
      // 제목은 서식이 쓴 이름을 그대로 쓴다. 심사자가 보는 이름과 같아야 한다.
      title: `${position + 1}. ${item.formItem || item.title}`,
      content: content || (repeated ? SHARED : UNFILLED),
      limitChars: limit || 0,
      over: limit ? Math.max(0, chars - limit) : 0,
      fromForm: Boolean(item.formItem)
    };
  });

  // 서식에 없는 항목도 버리지 않는다. 뒤에 따로 붙인다.
  const extra = sections.filter(section => !used.has(section.id) && text(section.content));
  const extraBlocks = extra.map(section => ({
    id: section.id, title: `[서식 외] ${section.title || section.id}`, content: text(section.content), limitChars: 0, over: 0, fromForm: false
  }));

  const laidTables = formTables.map(formTable => {
    const matched = matchTable(formTable, tables);
    const aligned = alignTableColumns(formTable, matched);
    return { ...aligned, kind: formTable.kind || '', fromForm: true, matched: Boolean(matched) };
  });
  const usedTables = new Set(laidTables.filter(table => table.matched).map(table => table.kind));
  const extraTables = tables.filter(table => !table.kind || !usedTables.has(table.kind))
    .map(table => ({ title: table.title || '', rows: table.rows || [], kind: table.kind || '', fromForm: false, matched: true, note: '' }));

  return {
    ok: true, reason: '',
    sections: [...laid, ...extraBlocks],
    tables: [...laidTables, ...extraTables],
    filled: laid.length - unfilled.length,
    shared: laid.filter(item => item.content === SHARED).length,
    unfilled, extra: extraBlocks.map(item => item.title),
    over: laid.filter(item => item.over > 0).map(item => ({ title: item.title, over: item.over }))
  };
}

// 배치 결과를 한 줄로 요약한다. 화면에 그대로 적는다.
export function fillSummary(result) {
  if (!result?.ok) return result?.reason || '서식을 읽지 못했습니다.';
  // 센 것과 나눈 것을 같은 기준으로 적는다. 「9개 중 10개」처럼 읽히지 않게 한다.
  const laid = result.sections.length - result.extra.length;
  const fromForm = result.sections.filter(item => item.fromForm).length;
  const parts = [`작성 항목 ${laid}개 중 ${result.filled}개 채움`, `서식 이름 적용 ${fromForm}개`];
  if (result.shared) parts.push(`앞 항목과 함께 쓴 자리 ${result.shared}개`);
  const blank = result.unfilled.length - result.shared;
  if (blank > 0) parts.push(`아직 안 쓴 자리 ${blank}개`);
  if (result.over.length) parts.push(`분량 초과 ${result.over.length}개`);
  if (result.extra.length) parts.push(`서식 외 ${result.extra.length}개는 뒤에 붙임`);
  return parts.join(' · ');
}
