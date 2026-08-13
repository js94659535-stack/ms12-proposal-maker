// AI로 보내는 자료를 줄인다.
//
// 왜 필요한가. 공고문과 신청서 서식을 통째로 올리면 설계 호출이 Cloudflare 100초 한도를 넘겨
// 524로 끊긴다. 사용자는 「전체 초안」을 받지 못하고 오류만 본다.
//
// 무엇을 줄이는가. 신청서 서식은 이미 form-spec이 항목·표·첨부를 로컬에서 읽어 두었다.
// 같은 내용을 다시 통째로 보낼 이유가 없다. 서식은 규격 요약으로 바꾸고, 나머지는 길이만 자른다.
// 공고문 본문은 자르지 않는다. 선정 논리의 근거라 줄이면 계획서가 부실해진다.

export const FORM_TYPES = ['공모신청서', '사업계획서 서식'];
// 한 자료가 차지할 수 있는 최대 길이. 넘으면 앞부분만 보내고 잘랐다고 밝힌다.
export const PER_SOURCE_CHARS = 12_000;
// 모든 직접자료를 합친 최대 길이.
export const TOTAL_SOURCE_CHARS = 40_000;

const text = value => String(value ?? '');

// 서식은 규격 요약으로 바꾼다. 작성 항목 이름·분량·표 칸·첨부 목록이면 설계에 충분하다.
export function summarizeForm(source, formSpec) {
  const items = (formSpec?.items || []).map(item =>
    `- ${item.name}${item.limitChars ? ` (${item.limitChars}자 이내)` : item.limitPages ? ` (${item.limitPages}쪽 이내)` : ''}`);
  const tables = (formSpec?.tables || []).map(table => `- ${table.title || table.kind}: ${(table.columns || []).join(' | ') || '칸 확인 필요'}`);
  const attachments = (formSpec?.attachments || []).map(item => `- ${item.name}${item.required ? ' (필수)' : ''}`);
  if (!items.length && !tables.length && !attachments.length) return '';
  return [
    `[신청서 서식 규격 · ${source.fileName}]`,
    items.length ? `작성 항목 ${items.length}개\n${items.join('\n')}` : '',
    tables.length ? `요구 표 ${tables.length}개\n${tables.join('\n')}` : '',
    attachments.length ? `첨부서류 ${attachments.length}건\n${attachments.join('\n')}` : '',
    '※ 서식 원문 대신 규격만 보냅니다. 항목 이름과 분량은 위 목록을 그대로 따릅니다.'
  ].filter(Boolean).join('\n');
}

// 보낼 직접자료를 만든다. 무엇을 줄였는지 함께 돌려준다. 조용히 자르지 않는다.
export function trimManualSources(manualSources = [], formSpec = null) {
  const notes = [];
  let used = 0;
  const sources = [];

  for (const source of manualSources) {
    if (source.extractionStatus !== 'success') { sources.push(source); continue; }
    let body = text(source.extractedText);

    if (FORM_TYPES.includes(source.sourceType)) {
      const summary = summarizeForm(source, formSpec);
      if (summary) {
        notes.push(`${source.fileName}: 서식 규격 요약으로 보냈습니다(원문 ${body.length.toLocaleString('ko-KR')}자 → ${summary.length.toLocaleString('ko-KR')}자).`);
        body = summary;
      }
    }
    if (body.length > PER_SOURCE_CHARS) {
      notes.push(`${source.fileName}: 앞 ${PER_SOURCE_CHARS.toLocaleString('ko-KR')}자만 보냈습니다(원문 ${body.length.toLocaleString('ko-KR')}자).`);
      body = `${body.slice(0, PER_SOURCE_CHARS)}\n…[이 자료는 길이 제한으로 뒷부분을 보내지 않았습니다]`;
    }
    if (used + body.length > TOTAL_SOURCE_CHARS) {
      const room = Math.max(0, TOTAL_SOURCE_CHARS - used);
      if (room < 500) {
        notes.push(`${source.fileName}: 전체 길이 제한을 넘어 이번 작성에는 넣지 않았습니다.`);
        sources.push({ ...source, extractedText: '', extractionStatus: 'skipped', extractionError: '길이 제한으로 이번 작성에서 제외' });
        continue;
      }
      notes.push(`${source.fileName}: 전체 길이 제한으로 앞 ${room.toLocaleString('ko-KR')}자만 보냈습니다.`);
      body = `${body.slice(0, room)}\n…[전체 길이 제한으로 잘렸습니다]`;
    }
    used += body.length;
    sources.push({ ...source, extractedText: body });
  }

  return { sources, notes, chars: used };
}
