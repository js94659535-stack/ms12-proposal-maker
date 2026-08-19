// 공고 본문과 첨부파일을 하나의 「공고 자료묶음」으로 읽고, 선정 논리 규칙(notice-logic)에 그대로 넘긴다.
// 선정 논리 판단 규칙은 바꾸지 않는다. 여기서는 자료를 모으고 파일별 근거를 붙이는 일만 한다.
import { HwpUnsupportedError, extractHwpText } from './hwp-text.js';
import { analyzeNoticeStructure, extractEvaluationScores } from './notice-logic.js';

export const ATTACHMENT_ROLES = ['공고문', '사업 안내·요강', '신청서·계획서 양식', '평가표·심사기준', '예산편성 기준', '기타 참고자료'];
const ROLE_RULES = [
  { role: '평가표·심사기준', pattern: /심사\s*기준|평가\s*기준|심사\s*표|평가\s*표|배점|심사양식/ },
  { role: '예산편성 기준', pattern: /예산\s*편성|예산\s*기준|산출\s*기준|단가\s*기준/ },
  { role: '신청서·계획서 양식', pattern: /양식|서식|신청서|계획서\s*양식|작성\s*예시/ },
  { role: '사업 안내·요강', pattern: /요강|안내|지침|매뉴얼|가이드|방법\s*안내|설정\s*방법/ },
  { role: '공고문', pattern: /공고|모집|공모/ }
];

export function classifyAttachmentRole(name) {
  const value = String(name || '');
  return ROLE_RULES.find(rule => rule.pattern.test(value))?.role || '기타 참고자료';
}

function extensionOf(name) { return String(name || '').split('.').pop()?.toLowerCase() || ''; }

// ZIP 내부 파일을 바이트로 꺼낸다(브라우저·Node 공통 DecompressionStream 사용).
export async function readZipEntries(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66_000); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { end = index; break; }
  }
  if (end < 0) throw new Error('ZIP 구조를 찾지 못했습니다.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith('/')) continue;
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + compressedSize);
    if (method !== 0 && method !== 8) continue;
    let data = raw;
    if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    entries.push({ name, bytes: data });
  }
  return entries;
}

// 파일 한 개를 읽는다. 읽지 못하면 이유를 남기고 나머지 분석은 계속한다.
export async function readBundleFile(file, { extractText = null } = {}) {
  const name = String(file?.name || '이름 없는 첨부');
  const role = classifyAttachmentRole(name);
  const extension = extensionOf(name);
  const base = { name, role, extension };
  try {
    if (typeof file?.text === 'string' && file.text.trim()) return { ...base, status: '읽음', text: file.text, chars: file.text.length };
    const buffer = file?.bytes?.buffer ? file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) : file?.buffer;
    // 내려받기가 실패해 바이트가 없는 것과, 받았는데 형식이 안 맞는 것은 다른 문제다.
    // 앞의 것을 「미지원」으로 적으면 원인이 파일 형식인 줄 알고 엉뚱한 곳을 고치게 된다.
    // 부르는 쪽이 이유를 함께 넘겼으면(예: 내려받지 못했습니다 (404)) 그것을 그대로 남긴다.
    if (!buffer) return { ...base, status: '받지 못함', text: '', chars: 0, error: file?.error || '파일 내용을 받지 못했습니다.' };
    // HWP는 여기서 직접 읽는다. 그래서 부르는 쪽 extractText 허용 목록에 hwp가 없어도 된다.
    // 목록만 보면 안 읽는 것처럼 보이지만, 이 분기가 먼저라 extractText까지 가지 않는다.
    if (extension === 'hwp') {
      const text = await extractHwpText(buffer);
      return { ...base, status: '읽음', text, chars: text.length };
    }
    if (extractText) {
      const text = await extractText({ name, buffer, extension });
      if (typeof text === 'string' && text.trim()) return { ...base, status: '읽음', text, chars: text.length };
    }
    return { ...base, status: '미지원', text: '', chars: 0, error: `${extension.toUpperCase()} 형식은 현재 자동 추출 대상이 아닙니다.` };
  } catch (error) {
    const needsConversion = error instanceof HwpUnsupportedError || extension === 'hwp';
    return { ...base, status: needsConversion ? '변환 필요' : '미지원', text: '', chars: 0, error: needsConversion ? `HWP 원문 추출 불가 → PDF 또는 HWPX 변환 필요 (${error.message})` : error.message };
  }
}

// 읽은 파일 가운데 무엇을 본문 입력으로 넣을지 정한다.
//
// 다른 기관의 예시 계획서 문장이 근거로 섞이면 지어내지 않는다는 원칙이 무너진다.
// 읽되 본문에 넣지 않는다. 안내서류·작성가이드도 같은 이유로 뺀다 —
// 사업 자체의 사실이 아니라 「어떻게 쓰라」는 설명이라 본문 근거가 될 수 없다.
//
// 판정이 틀릴 수 있으므로 뺀 것도 목록에 남기고 이름과 이유를 함께 보여 준다.
// 사용자가 그 자리에서 하나씩 되넣을 수 있어야 한다.
const INCLUDE_ROLES = ['공고문', '신청서·계획서 양식', '평가표·심사기준', '예산편성 기준'];
const SKIP_RULES = [
  { reason: '예시 자료', pattern: /예시|샘플|sample|작성\s*예/i },
  // 「안내서류」가 「안내서」 규칙에 먼저 걸리면 이유가 엉뚱하게 적힌다. 좁은 것을 앞에 둔다.
  { reason: '안내서류', pattern: /안내\s*서류|참고\s*서류|붙임\s*서류|제출\s*서류\s*목록/ },
  { reason: '작성가이드', pattern: /작성\s*가이드|가이드|매뉴얼|작성\s*요령|안내서|설명서/ },
  { reason: '이미지', pattern: /\.(?:jpe?g|png|gif|bmp|webp|tiff?)$/i }
];

// ZIP 안 파일 이름은 「양식 및 안내서류.zip > 사업계획서 양식.hwpx」처럼 부모 이름을 달고 온다.
// 그대로 규칙에 걸면 부모의 「안내서류」가 안쪽 서식까지 끌어내린다. 실제로 그렇게 빠졌다.
// 판정은 언제나 마지막 조각(제 이름)으로만 한다.
export function leafName(name) {
  return String(name || '').split('>').pop().trim();
}

/** 파일 하나를 넣을지 말지와 그 이유. 읽지 못한 파일은 애초에 넣을 것이 없다. */
export function bundlePick(file) {
  const name = leafName(file?.name);
  // ZIP 껍데기 자체는 내용이 없다. 안의 파일이 따로 판정된다.
  if (file?.extension === 'zip') return { include: false, reason: '압축 파일(안의 파일을 따로 읽었습니다)' };
  if (file?.status !== '읽음' || !String(file?.text || '').trim()) {
    return { include: false, reason: file?.error || '내용을 읽지 못했습니다' };
  }
  const skip = SKIP_RULES.find(rule => rule.pattern.test(name));
  if (skip) return { include: false, reason: skip.reason };
  // 역할도 제 이름으로 다시 본다. readBundleFile은 부모가 붙은 이름으로 판정했다.
  const role = String(file?.name || '').includes('>') ? classifyAttachmentRole(name) : file?.role;
  if (!INCLUDE_ROLES.includes(role)) return { include: false, reason: `${role || '기타 참고자료'}로 판정` };
  return { include: true, reason: role, role };
}

/** 묶음을 「넣음」과 「읽었지만 넣지 않음」으로 나눈다. 화면과 입력이 같은 판정을 쓴다. */
export function splitBundle(files = []) {
  const included = [];
  const skipped = [];
  for (const file of files) {
    const pick = bundlePick(file);
    (pick.include ? included : skipped).push({ ...file, pickReason: pick.reason });
  }
  return { included, skipped };
}

// 서식으로 판정된 파일은 본문이 아니라 「직접 자료」로 보내야 buildFormSpec이 읽는다.
// 지금까지는 전부 sourceText로만 가서, 첨부에 서식이 있어도 「서식 미인식」이 떴다.
const FORM_SOURCE_BY_ROLE = { '신청서·계획서 양식': '사업계획서 서식', '예산편성 기준': '예산 편성 기준' };
export function formSourceTypeOf(file) {
  const role = String(file?.name || '').includes('>') ? classifyAttachmentRole(leafName(file.name)) : file?.role;
  return FORM_SOURCE_BY_ROLE[role] || '';
}

// ZIP은 내부 파일까지 펼쳐서 묶음을 만든다.
export async function expandBundle(files, options = {}) {
  const results = [];
  for (const file of Array.isArray(files) ? files : []) {
    if (extensionOf(file?.name) === 'zip' && (file?.bytes || file?.buffer)) {
      const buffer = file.bytes?.buffer ? file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) : file.buffer;
      results.push({ name: file.name, role: '기타 참고자료', extension: 'zip', status: '펼침', text: '', chars: 0 });
      try {
        for (const entry of await readZipEntries(buffer)) {
          results.push(await readBundleFile({ name: `${file.name} > ${entry.name.split('/').pop()}`, bytes: entry.bytes }, options));
        }
      } catch (error) {
        results.push({ name: file.name, role: '기타 참고자료', extension: 'zip', status: '미지원', text: '', chars: 0, error: `ZIP을 펼치지 못했습니다: ${error.message}` });
      }
      continue;
    }
    results.push(await readBundleFile(file, options));
  }
  return results;
}

function mergeField(target, addition, sourceLabel) {
  const evidence = addition.evidence.map(item => ({ ...item, source: sourceLabel }));
  return {
    ...target,
    status: target.status === '공식 근거 확인' || addition.status === '공식 근거 확인' ? '공식 근거 확인' : target.status,
    evidence: [...target.evidence, ...evidence].slice(0, 6),
    value: [target.value, addition.value].filter(Boolean).join(' / ').slice(0, 1200)
  };
}

// 같은 이름의 한도끼리만 비교한다. 성격이 다른 금액(총사업비 vs 강사비 단가)을 충돌로 보지 않는다.
const LIMIT_PATTERN = /(총\s*사업비|지원\s*한도|사업\s*예산|1개소당|개소당|자부담)[^\n]{0,12}?([\d,]{4,})\s*원/g;
function limitsIn(value) {
  const limits = new Map();
  for (const match of String(value || '').matchAll(LIMIT_PATTERN)) {
    const label = match[1].replace(/\s+/g, '');
    if (!limits.has(label)) limits.set(label, match[2].replaceAll(',', ''));
  }
  return limits;
}

// 본문과 읽힌 첨부를 합쳐 하나의 구조로 만든다. 판단 규칙은 notice-logic 그대로 사용한다.
export function mergeBundleStructures(noticeStructure, readFiles) {
  const merged = {
    ...noticeStructure,
    fields: noticeStructure.fields.map(field => ({ ...field, evidence: field.evidence.map(item => ({ ...item, source: `공고 본문 · ${item.source}` })) })),
    evaluationScores: [...noticeStructure.evaluationScores],
    sources: [...noticeStructure.sources]
  };
  const conflicts = [];
  for (const file of readFiles) {
    if (file.status !== '읽음' || !file.text.trim()) continue;
    const structure = analyzeNoticeStructure({ title: '', overview: file.text });
    merged.sources.push({ label: file.name, chars: file.chars });
    merged.totalChars += file.chars;
    merged.fields = merged.fields.map((field, index) => {
      const addition = structure.fields[index];
      if (addition.status !== '공식 근거 확인') return field;
      // 같은 항목의 금액이 문서마다 다르면 충돌로 남긴다.
      const before = limitsIn(field.value);
      const after = limitsIn(addition.value);
      for (const [label, value] of after) {
        if (before.has(label) && before.get(label) !== value) {
          conflicts.push({ field: field.title, label, values: [before.get(label), value], sources: [field.evidence[0]?.source || '공고 본문', file.name] });
        }
      }
      return mergeField(field, addition, file.name);
    });
    // 배점은 평가표·심사기준·공고문에서만 읽는다. 작성 안내의 척도 설명(4점 척도 등)을 배점으로 쓰지 않는다.
    if (['평가표·심사기준', '공고문'].includes(file.role)) {
      for (const score of extractEvaluationScores([{ label: file.name, text: file.text }])) {
        if (!merged.evaluationScores.some(item => item.criterion === score.criterion)) merged.evaluationScores.push({ ...score, source: file.name });
      }
    }
  }
  merged.hasOfficialScoring = merged.evaluationScores.length > 0;
  merged.unreadAttachments = readFiles.filter(file => file.status === '변환 필요' || file.status === '미지원' || file.status === '받지 못함').map(file => `${file.name} (${file.error || file.status})`);
  return { structure: merged, conflicts };
}

export function bundleSummary(files, conflicts = []) {
  return {
    total: files.length,
    read: files.filter(file => file.status === '읽음').length,
    conversionNeeded: files.filter(file => file.status === '변환 필요').length,
    // 형식이 안 맞는 것과 파일이 오지 않은 것을 따로 센다. 고칠 방법이 서로 다르다.
    unsupported: files.filter(file => file.status === '미지원').length,
    missing: files.filter(file => file.status === '받지 못함').length,
    chars: files.reduce((sum, file) => sum + (file.chars || 0), 0),
    roles: ATTACHMENT_ROLES.map(role => ({ role, count: files.filter(file => file.role === role && file.status === '읽음').length })).filter(item => item.count),
    conflicts: conflicts.length
  };
}
