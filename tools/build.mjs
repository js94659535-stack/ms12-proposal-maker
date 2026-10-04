// 배포용 빌드. public/ 을 dist/ 로 복사한다. 첫 화면(/)은 public/index.html 의 랜딩 페이지다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
console.log(`dist 준비: ${fs.readdirSync(dist).join(', ')}`);
