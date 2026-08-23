// 두 색이 눈으로 갈리는지 숫자로 잰다 (WCAG 2.x 상대휘도·대비비).
//
// 왜 따로 두는가. 22-54·22-55·22-01에서 층 색을 정할 때마다 이 계산을 손으로 다시 했고,
// 그 숫자는 보고서에만 남아 코드가 지키지 않았다. 「1.09는 안 갈리고 1.28은 갈린다」가
// 층 규칙의 근거인데 근거가 시험 밖에 있으면 색을 옮길 때 조용히 무너진다.
//
// 지금은 시험이 쓰지만 앱이 써도 되는 계산이라 src에 둔다. 색 규칙(§5)과 층 규칙을
// 지키는 시험이 이 함수를 부른다.

// #abc·#aabbcc·#aabbccdd를 모두 받는다. 알파는 무시한다 — 층 색에는 쓰지 않는다.
export function toRgb(hex) {
  const raw = String(hex ?? '').trim().replace(/^#/, '');
  const full = raw.length === 3 || raw.length === 4 ? [...raw.slice(0, 3)].map(part => part + part).join('') : raw.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map(at => parseInt(full.slice(at, at + 2), 16));
}

// 상대휘도. 0(검정) ~ 1(흰색).
export function relativeLuminance(hex) {
  const rgb = toRgb(hex);
  if (!rgb) return null;
  const channel = value => {
    const ratio = value / 255;
    return ratio <= 0.04045 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4);
  };
  const [red, green, blue] = rgb.map(channel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

// 대비비. 1(같은 색) ~ 21(검정과 흰색). 순서는 상관없다.
export function contrastRatio(one, other) {
  const [bright, dark] = [relativeLuminance(one), relativeLuminance(other)].sort((left, right) => right - left);
  if (bright === null || dark === null) return null;
  return (bright + 0.05) / (dark + 0.05);
}

// 소수 두 자리로 끊는다. 시험이 값을 못 박을 때 쓴다.
export function contrastAt(one, other, digits = 2) {
  const ratio = contrastRatio(one, other);
  return ratio === null ? null : Number(ratio.toFixed(digits));
}
