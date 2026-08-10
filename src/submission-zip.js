// 「제출 ZIP」 — 지금 저장 버전의 DOCX·PDF와 실제 첨부파일을 하나로 묶는다.
// 규칙 기반 로컬 처리만 한다. 외부 호출도 없고 첨부 원본은 한 바이트도 바꾸지 않는다.
export const ZIP_ENTRY_KINDS = ['문서', '첨부', '제출목록'];
export const ATTACH_FOLDER = '첨부';
export const MANIFEST_NAME = '제출목록.txt';
// 사업계획서 1부는 우리가 만든 DOCX·PDF로 채운다. 사용자가 따로 파일을 올리지 않아도 된다.
const AUTO_SLOT = /사업\s*계획서/;
// 공고문·참고자료는 제출물이 아니다. 서류 목록에 섞여 들어와도 묶지 않는다.
const REFERENCE_SLOT = /공고\s*문|공고\s*원문|모집\s*공고|공모\s*안내|참고\s*자료|안내\s*문|서식\s*파일|양식\s*파일/;

// 파일 시스템에서 쓸 수 없는 문자와 이름을 지운다. 확장자는 살린다.
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001F]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
export function safeEntryName(name, max = 120) {
  const raw = String(name ?? '').replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').trim();
  const dot = raw.lastIndexOf('.');
  let base = dot > 0 ? raw.slice(0, dot) : raw;
  const ext = dot > 0 ? raw.slice(dot).replace(/[^.\w가-힣]/g, '').slice(0, 12) : '';
  base = base.replace(/^[.\s]+|[.\s]+$/g, '').slice(0, Math.max(1, max - ext.length));
  if (!base || RESERVED.test(base)) base = `파일${base ? `_${base}` : ''}`;
  return `${base}${ext}`;
}
// 같은 이름이 겹치면 덮어쓰지 않고 번호를 붙인다.
export function uniqueNames(names = []) {
  const used = new Map();
  return names.map(name => {
    const key = name.toLowerCase();
    const seen = used.get(key) || 0;
    used.set(key, seen + 1);
    if (!seen) return name;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    return `${base} (${seen + 1})${ext}`;
  });
}

function blocker(reason, detail) { return { reason, detail: String(detail ?? '').slice(0, 200) }; }

// 무엇을 묶고 무엇을 못 묶는지 먼저 정한다. 파일 내용은 아직 읽지 않는다.
export function planSubmissionZip({
  canExport = false, packageStatus = '', attachments = [], links = {},
  documents = [], projectTitle = '', applicantName = '', version = 0, versionId = '', generatedAt = ''
} = {}) {
  const blockers = [];
  const entries = [];
  const skipped = [];

  if (!canExport) blockers.push(blocker('제출 판정 미통과', `제출 ${packageStatus || '판정'} 상태에서는 패키지를 만들지 않습니다.`));
  if (!versionId) blockers.push(blocker('저장 버전 없음', '저장된 계획서 버전을 고른 뒤에 묶을 수 있습니다.'));
  // bytes가 null이면 아직 만들기 전이라는 뜻이다. 0바이트로 나온 것만 실패로 본다.
  const failed = documents.filter(item => !item || (item.bytes !== null && !(item.bytes > 0)));
  if (failed.length) blockers.push(blocker('제출 문서 생성 실패', '사업계획서 DOCX·PDF를 만들지 못했습니다.'));

  for (const document of documents) {
    entries.push({ kind: '문서', key: document.key || '', slot: '', name: document.name, bytes: document.bytes, from: '생성 문서' });
  }

  for (const slot of attachments) {
    const name = String(slot?.name || '').trim();
    if (!name) continue;
    if (REFERENCE_SLOT.test(name)) {
      skipped.push({ name, required: Boolean(slot.required), reason: '참고자료 — 제출물이 아니므로 묶지 않습니다.' });
      continue;
    }
    if (AUTO_SLOT.test(name)) {
      skipped.push({ name, required: Boolean(slot.required), reason: '생성된 사업계획서 DOCX·PDF로 충족했습니다.', satisfied: true });
      continue;
    }
    const link = links[name];
    if (!link) {
      // 「준비 완료」 체크만으로는 파일이 있다고 보지 않는다.
      if (slot.required) blockers.push(blocker('필수 첨부 파일 없음', `${name} — 실제 파일을 연결해야 합니다.`));
      else skipped.push({ name, required: false, reason: '선택 첨부이며 연결된 파일이 없습니다.' });
      continue;
    }
    if (link.error) {
      blockers.push(blocker('첨부 파일 읽기 실패', `${name} — ${link.error}`));
      continue;
    }
    if (!(link.size > 0)) {
      blockers.push(blocker('빈 첨부 파일', `${name} — ${link.fileName || '파일'}이 0바이트입니다.`));
      continue;
    }
    entries.push({ kind: '첨부', key: '', slot: name, name: `${ATTACH_FOLDER}/${safeEntryName(link.fileName || name)}`, bytes: link.size, from: link.fileName || '' });
  }

  // 같은 이름이 겹치면 번호를 붙여 서로 덮지 않게 한다.
  const renamed = uniqueNames(entries.map(entry => entry.name));
  entries.forEach((entry, index) => { entry.name = renamed[index]; });

  const plan = {
    ok: !blockers.length, blockers, entries, skipped,
    fileName: safeEntryName(`${[applicantName, projectTitle || '사업계획서', version ? `V${version}` : '', '제출패키지'].filter(Boolean).join('_')}.zip`, 130),
    meta: { projectTitle, applicantName, version, versionId, generatedAt }
  };
  plan.manifest = buildManifestText(plan);
  return plan;
}

// 제출목록 파일. 내부 검증 데이터·공고 원문·AI 응답은 넣지 않는다.
export function buildManifestText(plan) {
  const { projectTitle, applicantName, version, generatedAt } = plan.meta || {};
  const size = bytes => (bytes > 0 ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()}KB` : '생성 예정');
  const lines = [
    '제출 패키지 목록',
    '',
    `기관명: ${applicantName || '-'}`,
    `사업명: ${projectTitle || '-'}`,
    `계획서 버전: ${version ? `V${version}` : '-'}`,
    `생성일: ${String(generatedAt || '').slice(0, 19).replace('T', ' ') || '-'}`,
    '',
    `포함 파일 ${plan.entries.length}건`,
    ...plan.entries.map((entry, index) => `  ${index + 1}. [${entry.kind}] ${entry.name} · ${size(entry.bytes)}${entry.slot ? ` · ${entry.slot}` : ''}`),
    '',
    `미포함 항목 ${plan.skipped.length}건`,
    ...(plan.skipped.length ? plan.skipped.map((item, index) => `  ${index + 1}. ${item.name} (${item.required ? '필수' : '선택'}) — ${item.reason}`) : ['  없음']),
    '',
    '※ 첨부 원본은 변환하지 않고 그대로 담았습니다.'
  ];
  return `${lines.join('\n')}\n`;
}

// 계획서 버전이 바뀌면 앞서 만든 패키지를 다시 쓰지 않는다.
export function packageStale(record, versionId) {
  if (!record?.versionId) return true;
  return record.versionId !== versionId;
}

// ---------- ZIP 쓰기 ----------
// 압축하지 않고(STORE) 그대로 담는다. 원본 바이트가 그대로 보존된다.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();
export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function dosDateTime(generatedAt) {
  const stamp = String(generatedAt || '');
  const parsed = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(stamp);
  if (!parsed) return { date: (1 << 9) | (1 << 5) | 1, time: 0 };
  const [, year, month, day, hour, minute, second] = parsed.map(Number);
  return {
    date: ((Math.max(1980, year) - 1980) << 9) | (month << 5) | day,
    time: (hour << 11) | (minute << 5) | Math.floor(second / 2)
  };
}

// files: [{ name, bytes: Uint8Array }] → 실제 .zip 바이트
export function zipBytes(files = [], generatedAt = '') {
  const encoder = new TextEncoder();
  const { date, time } = dosDateTime(generatedAt);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes || []);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true); // 파일 이름을 UTF-8로 읽으라는 표시(한글 이름)
    localView.setUint16(8, 0, true); // STORE
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014B50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054B50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
