// 증빙 파일 검사(10-29): 존재 · 허용 형식 · 크기 0 아님 · sha256 일치 · 폴더 밖 경로 금지
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PROOF_EXTENSIONS } from '../public/baeumteo/evidence.js';

export function makeFileCheck(baseDir) {
  return record => {
    const full = path.resolve(baseDir, record.evidencePath);
    if (!full.startsWith(path.resolve(baseDir))) return '보존 폴더 밖의 경로';
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return '파일이 없다';
    if (!PROOF_EXTENSIONS.includes(path.extname(full).toLowerCase())) return `허용되지 않은 형식(${path.extname(full)})`;
    const bytes = fs.readFileSync(full);
    if (bytes.length === 0) return '크기가 0이다';
    if (record.fileSize && record.fileSize !== bytes.length) return '등록 뒤 크기가 바뀌었다';
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (!record.sha256) return 'sha256 기록 없음';
    if (record.sha256 !== hash) return '등록 뒤 내용이 바뀌었다(sha256 불일치)';
    return '';
  };
}
export function describeProof(baseDir, evidencePath, linkedClaimId, verifiedBy, verifiedAt) {
  const full = path.resolve(baseDir, evidencePath);
  const bytes = fs.readFileSync(full);
  return { evidencePath, fileName: path.basename(full), fileSize: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), linkedClaimId, verifiedBy, verifiedAt };
}
