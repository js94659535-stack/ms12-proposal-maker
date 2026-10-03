// 공모 문서를 내려받아 원문 항목과 조건 후보를 뽑아 정의 파일 옆에 저장한다(10-19).
// 사용: node tools/grant-extract.mjs vehicle   → public/grant/defs/vehicle.extracted.js
import fs from 'node:fs';
import { handleNoticeRequest } from '../functions/api/notices.js';
import { readZipFiles } from '../src/files.js';
import { extractHwpDocument } from '../src/hwp-text.js';
import { extractFormItems, formSources } from '../src/form-spec.js';
import { extractCandidates } from '../public/grant/extract.js';

const SOURCES = { vehicle: { code: '20260800100057', notice: /공고문.*\.hwp$/, form: /배분신청서.*\.hwp$/ } };
const id = process.argv[2] || 'vehicle';
const source = SOURCES[id];
const post = body => handleNoticeRequest(new Request('https://l.test/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
const H = { Referer: 'https://proposal.chest.or.kr/', Accept: 'text/html,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9' };
const page = await (await fetch(`https://proposal.chest.or.kr/mobile/mobileMainBsnsDetail.do?dstbBsnsCode=${source.code}&appnDocNo=`, { headers: H })).text();
const handles = [...page.matchAll(/fn_fileDownload\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\)[^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ fileSeCode: m[1], dstbBsnsCode: m[2], sn: m[3], fileSn: m[4], name: m[5].replace(/<[^>]+>|\s+/g, ' ').trim() }));
const docs = {};
for (const handle of handles) {
  const buf = new Uint8Array(await (await post({ action: 'downloadAttachment', attachment: handle })).arrayBuffer());
  const files = /zip/i.test(handle.name) ? await readZipFiles(buf.buffer) : [{ name: handle.name, bytes: buf }];
  for (const file of files) {
    const base = file.name.split('/').pop();
    if (!/\.hwp$/i.test(base)) continue;
    const doc = await extractHwpDocument(file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength));
    docs[base] = doc;
  }
}
const noticeName = Object.keys(docs).find(name => source.notice.test(name));
const formName = Object.keys(docs).find(name => source.form.test(name));
const noticeDoc = docs[noticeName];
const formDoc = docs[formName];
// 원문 항목: 서식의 번호 줄에서 이름 그대로, 안내 문구는 이름이 겹치는 안내 박스에서
const items = extractFormItems(formSources([{ id: 'f', fileName: formName, sourceType: '사업계획서 서식', extractionStatus: 'success', extractedText: formDoc.text, guides: formDoc.guides }]));
const tokens = name => name.replace(/[()（）]/g, ' ').split(/\s+/).filter(t => t.length >= 2);
const guideFor = name => {
  const scored = formDoc.guides.map(g => ({ g, score: tokens(name).filter(t => g.includes(t)).length })).sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 2 ? scored[0].g.slice(0, 220) : '';
};
const sourceItems = items.map((item, index) => ({ no: index + 1, name: item.name, quote: guideFor(item.name) || item.evidence.slice(0, 160) }));
const candidates = [...extractCandidates(noticeDoc.text, '공고문'), ...extractCandidates(formDoc.text, '배분신청서 양식'), ...formDoc.guides.flatMap(g => extractCandidates(g, '양식 안내 박스'))].map((c, i) => ({ ...c, id: `c${i + 1}` }));
const out = { source: { notice: noticeName, form: formName, code: source.code, extractedAt: new Date().toISOString().slice(0, 10) }, sourceItems, candidates, guides: formDoc.guides.length, tables: formDoc.tables, noticeText: noticeDoc.text, formText: formDoc.text };
fs.writeFileSync(new URL(`../public/grant/defs/${id}.extracted.js`, import.meta.url), `// tools/grant-extract.mjs가 만든 파일 — 손으로 고치지 않는다.\nexport default ${JSON.stringify(out, null, 1)};\n`);
console.log(`원문 항목 ${sourceItems.length}개, 조건 후보 ${candidates.length}개, 안내 박스 ${formDoc.guides.length}개, 표 ${formDoc.tables}개`);
console.log(sourceItems.map(i => `${i.no}. ${i.name}`).join(' / '));
