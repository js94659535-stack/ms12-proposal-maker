// 배포용 빌드. public/ 을 dist/ 로 복사한다. 첫 화면(/)은 public/index.html 의 랜딩 페이지다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^/([A-Za-z]:)/, '$1')), '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
console.log(`dist 준비: ${fs.readdirSync(dist).join(', ')}`);
