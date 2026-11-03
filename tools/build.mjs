// 배포용 빌드. public/ 을 dist/ 로 복사한다. 첫 화면(/)은 public/index.html 의 랜딩 페이지다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 화면(/plan/)이 PDF·DOCX를 읽는 도구 — node_modules의 그 판을 같은 주소(/lib/vendor/)에서 내보낸다(11-18).
// Node 도구와 같은 판이고, 화면에 바깥 주소(https://)를 두지 않는다. 사본은 저장소에 올리지 않는다(.gitignore).
export const VENDOR = Object.freeze({
  'pdf.min.mjs': 'pdfjs-dist/build/pdf.min.mjs',
  'pdf.worker.min.mjs': 'pdfjs-dist/build/pdf.worker.min.mjs',
  'mammoth.browser.min.js': 'mammoth/mammoth.browser.min.js'
});
export function copyVendor(base = root) {
  const into = path.join(base, 'public', 'lib', 'vendor');
  fs.mkdirSync(into, { recursive: true });
  for (const [name, from] of Object.entries(VENDOR)) fs.copyFileSync(path.join(base, 'node_modules', from), path.join(into, name));
  return into;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  copyVendor();
  const dist = path.join(root, 'dist');
  fs.rmSync(dist, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
  console.log(`dist 준비: ${fs.readdirSync(dist).join(', ')}`);
}
