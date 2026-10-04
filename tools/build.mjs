// 배포용 빌드(10-34). public/ 을 dist/ 로 복사하고, 첫 화면(/)은 /baeumteo/ 의 화면을 그대로 쓴다.
// 화면 원본은 public/baeumteo/index.html 하나뿐이다. 첫 화면은 그 파일의 상대 주소(./x.js)를 /baeumteo/x.js 로 바꿔 만든다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
const home = fs.readFileSync(path.join(root, 'public', 'baeumteo', 'index.html'), 'utf8').replace(/from '\.\/([^']+)'/g, "from '/baeumteo/$1'");
fs.writeFileSync(path.join(dist, 'index.html'), home);
console.log(`dist 준비: ${fs.readdirSync(dist).join(', ')}`);
