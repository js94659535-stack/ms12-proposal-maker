// 로그인 없이 받는 강의 자료.
//
// 확인하는 것은 둘이다. 파일이 실제로 배포물에 들어가는가, 그리고 링크가 랜딩에 그려지는가.
// 마크업만 있고 파일이 없으면 누른 사람은 404를 본다 — 그 짝이 어긋나는 것을 여기서 막는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const publicDir = new URL('../public/', import.meta.url);
// 목록을 손으로 옮겨 적지 않는다. 화면이 쓰는 그 배열을 그대로 읽는다.
const MATERIALS = [...app.matchAll(/\{ href: '(\/files\/[^']+)', saveAs: '([^']+)', title: '([^']+)', desc: '([^']+)', size: '([^']+)' \}/g)]
  .map(([, href, saveAs, title, desc, size]) => ({ href, saveAs, title, desc, size }));

test('세 파일이 public 에 실제로 있고 진짜 xlsx 다', () => {
  assert.equal(MATERIALS.length, 3, '목록을 읽지 못했다');
  for (const file of MATERIALS) {
    const path = new URL(`.${file.href}`, publicDir);
    assert.ok(fs.existsSync(path), `${file.href} 가 public 에 없다`);
    // xlsx 는 zip 이다. 이름만 바꾼 다른 파일이면 여기서 걸린다.
    assert.equal(fs.readFileSync(path).subarray(0, 2).toString('latin1'), 'PK', `${file.href} 가 xlsx 가 아니다`);
    // 화면에 적은 크기가 실제와 맞는지 본다. 1KB 넘게 어긋나면 문구가 낡은 것이다.
    const real = fs.statSync(path).size / 1000;
    assert.ok(Math.abs(real - Number(file.size.replace('KB', ''))) < 1, `${file.href} 크기 표기가 실제(${real.toFixed(1)}KB)와 다르다`);
  }
});

test('파일명은 영문이고 받을 때 이름은 한글이다', () => {
  // 한글 파일명은 97자짜리 퍼센트 인코딩 주소가 된다. 주소는 영문으로 두고
  // 사용자가 보는 이름은 download 속성이 정한다.
  for (const file of MATERIALS) {
    assert.match(file.href, /^\/files\/[a-z-]+\.xlsx$/, `${file.href} 에 영문이 아닌 글자가 있다`);
    assert.match(file.saveAs, /[가-힣]/, `${file.saveAs} 가 한글 이름이 아니다`);
    assert.equal(encodeURI(file.href), file.href, '주소가 인코딩을 타면 안 된다');
  }
  assert.match(app, /<a class="landing-file" href="\$\{escapeHtml\(file\.href\)\}" download="\$\{escapeHtml\(file\.saveAs\)\}">/);
});

test('절이 「이용 흐름」 다음에 오고 차림표에도 오른다', () => {
  assert.match(app, /\['landing-flow', '이용 흐름'\], \['landing-materials', '강의 자료'\], \['landing-notices', '공모정보 검색'\]/);
  const intro = app.slice(app.indexOf('function introSections('));
  const flow = intro.indexOf('id="landing-flow"');
  const materials = intro.indexOf('id="landing-materials"');
  const notices = intro.indexOf('id="landing-notices"');
  assert.ok(flow > 0 && flow < materials && materials < notices, '절 순서가 이용 흐름 → 강의 자료 → 공모정보 검색이 아니다');
});

test('문구를 그대로 싣는다', () => {
  assert.match(app, /<h2>강의 자료 내려받기<\/h2><p>공모사업 계획서를 손으로 쓸 때 쓰는 표입니다\. 로그인 없이 받으실 수 있습니다\.<\/p>/);
  assert.match(app, /이 표를 손으로 채우면 반나절입니다\. 같은 일을 자동으로 하려고 이 도구를 만들었습니다\./);
  assert.deepEqual(MATERIALS.map(file => `${file.title} — ${file.desc} ${file.size}`), [
    '공고 분석 워크시트 (예시) — 채워진 예시로 양식을 봅니다 21KB',
    '공고 분석 워크시트 (실습) — 같은 양식 빈칸. 직접 채웁니다 18KB',
    '사업예산 편성시트 — 단가×수량×횟수 자동 계산 27KB'
  ]);
  assert.match(css, /\.landing-file\{display:flex/);
});

test('로그인도 이메일도 요구하지 않는다', () => {
  const section = app.slice(app.indexOf('id="landing-materials"'), app.indexOf('id="landing-notices"'));
  // 받기 전에 무엇을 묻는 자리가 생기면 여기서 걸린다.
  assert.doesNotMatch(section, /<input|<form|data-landing="signup"|이메일/);
  // 절은 introSections 안에 있다 — 로그인 전 랜딩과 관리자 소개가 같은 것을 본다.
  assert.ok(app.indexOf('function introSections(') < app.indexOf('id="landing-materials"'));
});
