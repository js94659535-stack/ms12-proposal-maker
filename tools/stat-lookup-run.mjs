// 공식 통계 근거 후보 실제 조회 1회. 시험 계정으로 로그인해 /api/stats를 부른다.
//
// 운영 회원 계정은 쓰지 않는다. 이 도구가 만든 시험 계정만 쓰고 끝나면 지운다.
// 인증키는 서버에만 있다. 이 도구는 키를 알지도, 받지도, 적지도 않는다.
import fs from 'node:fs';

const SITE = 'https://pro.ms12.org';
const store = process.argv[2];
const account = JSON.parse(fs.readFileSync(store, 'utf8'));
let cookie = '';

async function call(path, body) {
  const response = await fetch(`${SITE}${path}`, {
    method: 'POST',
    // 서버는 같은 출처에서 온 요청만 받는다. 브라우저가 붙이는 표시를 그대로 붙인다.
    headers: { 'Content-Type': 'application/json', Origin: SITE, Referer: `${SITE}/`, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });
  const set = response.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 그대로 */ }
  return { status: response.status, json, text: text.slice(0, 300) };
}

const step = process.argv[3] || 'all';

if (step === 'signup') {
  const made = await call('/api/auth', { action: 'signup', email: account.email, password: account.password, passwordConfirm: account.password });
  console.log('signup', made.status, JSON.stringify(made.json)?.slice(0, 200));
} else {
  const login = await call('/api/auth', { action: 'login', email: account.email, password: account.password });
  console.log('login', login.status, login.json?.user?.status || login.text);
  if (login.status !== 200) process.exit(1);

  const first = await call('/api/stats', { action: 'lookup', region: '광산구', topic: 'children' });
  console.log('lookup#1', first.status, JSON.stringify(first.json, null, 1).slice(0, 1800));

  const second = await call('/api/stats', { action: 'lookup', region: '광산구', topic: 'children' });
  console.log('lookup#2 reused=', second.json?.reused, 'calls=', second.json?.calls);

  await call('/api/auth', { action: 'logout' });
}
