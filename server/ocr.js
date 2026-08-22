// 사진·스캔본에서 글자를 읽어 오는 규칙(22-51).
//
// 외부 OCR 업체를 새로 붙이지 않는다. 지금 쓰는 모델이 이미지를 받으므로 그 길로 보낸다.
// 그래야 로그인·사용량 기록·비용 상한을 그대로 지나간다.
//
// 실측(2026-08-22, 실제 사업자등록증 스캔본):
//   원본 2481px 10,328토큰 105원 · 1600px 4,292토큰 84원 · 1200px 74원 · 900px 62원 · 700px 59원
//   값을 제대로 읽은 것은 원본과 1600px, 700px이고 1200·900px는 날짜 두 개를 놓쳤다.
//   가운데가 무너지는 까닭을 설명하지 못하므로 700px는 쓰지 않는다. 1600px로 고정한다.
export const OCR_WIDTH = 1600;
// 사진은 등록증류에만 권한다. 긴 문서를 사진으로 올리면 장당 비용이 붙고 글자도 잘 안 읽힌다.
export const OCR_MAX_IMAGES = 3;
export const OCR_TOO_MANY = '사진은 한 번에 세 장까지입니다. 여러 장이면 PDF로 묶어 올려 주세요.';
export const OCR_HINT = '사업자등록증·고유번호증은 사진으로 찍어 올려도 됩니다. 연혁·계획서처럼 긴 문서는 파일로 올려 주세요.';
// 한 장이 커도 요청 본문 상한(750KB)을 넘기지 않게 한다. base64는 원본보다 1/3쯤 커진다.
export const OCR_MAX_BYTES = 700_000;

export const OCR_PROMPT = [
  '이미지에 적힌 글자를 그대로 옮겨 적으세요.',
  '보이지 않거나 흐려서 읽을 수 없는 값은 지어내지 말고 그 자리를 비워 두세요.',
  '표는 줄과 칸을 유지하고 칸 사이는 탭 하나로 나누세요. 설명·요약·해석을 덧붙이지 마세요.',
  // 관공서 서식은 제목의 자간을 벌려 찍는다. 그대로 옮기면 「법 인 명」이 되어 라벨로 못 찾는다.
  '제목의 글자 사이를 벌려 찍은 것은 붙여서 적으세요 — 「법 인 명 ( 단 체 명 )」은 「법인명(단체명)」으로,',
  '「개 업 연 월 일」은 「개업연월일」로, 「2021 년 08 월 26 일」은 「2021년 08월 26일」로 적습니다.'
].join(' ');

// 받는 형식은 MIME으로 가린다. 붙여넣은 그림은 이름이 image.png라 확장자로는 가릴 수 없다.
export const OCR_MIME = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export function isImageType(type) {
  return OCR_MIME.includes(String(type || '').split(';', 1)[0].trim().toLowerCase());
}

// 화면이 보낸 이미지가 쓸 만한지 본다. 서버도 같은 잣대로 한 번 더 본다.
export function checkImages(images) {
  const list = Array.isArray(images) ? images : [];
  if (!list.length) return { ok: false, error: '읽을 이미지가 없습니다.' };
  if (list.length > OCR_MAX_IMAGES) return { ok: false, error: OCR_TOO_MANY };
  for (const image of list) {
    const value = String(image || '');
    const match = value.match(/^data:([^;]+);base64,/);
    if (!match || !isImageType(match[1])) return { ok: false, error: '이미지는 JPG·PNG·WEBP만 읽을 수 있습니다.' };
    if (value.length > OCR_MAX_BYTES * 1.4) return { ok: false, error: '이미지가 너무 큽니다. 화면에서 줄여 보내야 합니다.' };
  }
  return { ok: true, error: '' };
}

// 읽어 온 글자를 항목 뽑기가 알아볼 수 있게 다듬는다.
//
// 관공서 서식은 제목의 자간을 벌려 찍는다 — 「법 인 명 ( 단 체 명 )」·「개 업 연 월 일」.
// 사람 눈에는 같은 말이지만 라벨로 찾을 때는 다른 글자다. 등록증을 사진으로 읽었더니 그 탓에
// 네 칸 중 두 칸만 후보로 올라왔다. 붙이는 것은 표기를 되돌리는 것이지 내용을 바꾸는 것이 아니다.
//
// 붙이는 일은 프롬프트가 먼저 하고(OCR_PROMPT), 여기서는 남은 것만 손본다.
// 빈칸 하나로 벌린 것만, 낱말 가운데를 자르지 않게 앞뒤가 한글이 아닐 때만 붙인다.
export function tightenSpacedLabels(text) {
  return String(text || '').split(/\r?\n/).map(line => line
    .replace(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, '$1년 $2월 $3일')
    .replace(/(?<![가-힣])(?:[가-힣] ){2,}[가-힣](?![가-힣])/g, run => run.replace(/ /g, ''))
    // 괄호 둘레의 빈칸도 붙인다 — 「법인명 ( 단체명 )」은 한 라벨이다.
    .replace(/\s*\(\s*/g, '(').replace(/\s*\)/g, ')')
    .replace(/\s+:/g, ':')
    .trimEnd())
    // 한 줄에 라벨이 둘이면 줄을 나눈다. 붙어 있으면 뒤엣것이 통째로 버려진다
    // (「개업연월일 … 법인등록번호 …」에서 법인등록번호를 잃던 자리다).
    .flatMap(line => {
      const cells = line.split(String.fromCharCode(9)).map(cell => cell.trim()).filter(Boolean);
      return cells.length > 1 && cells.every(cell => /^[가-힣][가-힣ㆍ\s]{1,14}\s*:/.test(cell)) ? cells : [line];
    })
    .join(String.fromCharCode(10));
}
